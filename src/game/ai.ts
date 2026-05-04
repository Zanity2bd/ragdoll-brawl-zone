// Per-character CPU controller. Writes into the same intents the keyboard
// uses, so the existing physics + melee path is unchanged.

import type { GameEngine, GameSnapshot, PlayerId } from "./engine";
import type { SkinId } from "./skins";

export type Difficulty = "easy" | "hard" | "extreme";

interface DiffCfg {
  reactMs: number;          // base think tick
  reactJitter: number;      // ± randomness so reactions don't look robotic
  specialChance: number;    // when in window, % chance to actually commit
  kiteChance: number;       // back-off probability when too close
  jumpProj: boolean;        // dodge incoming projectiles
  predictAim: boolean;      // lead the target by velocity
  punishWindow: number;     // seconds we'll keep punishing recovery
  bait: boolean;            // do feints to draw out specials
  block: boolean;           // back away from telegraphed heavy moves
  mistakeChance: number;    // chance to make a small mistake (input drop)
}

const DIFF: Record<Difficulty, DiffCfg> = {
  easy:    { reactMs: 320, reactJitter: 120, specialChance: 0.30, kiteChance: 0.30, jumpProj: false, predictAim: false, punishWindow: 0.25, bait: false, block: false, mistakeChance: 0.20 },
  hard:    { reactMs: 150, reactJitter: 70,  specialChance: 0.70, kiteChance: 0.55, jumpProj: true,  predictAim: false, punishWindow: 0.55, bait: true,  block: true,  mistakeChance: 0.06 },
  extreme: { reactMs:  70, reactJitter: 30,  specialChance: 0.95, kiteChance: 0.80, jumpProj: true,  predictAim: true,  punishWindow: 0.80, bait: true,  block: true,  mistakeChance: 0.0 },
};

// Preferred engagement distance + special trigger window per skin.
interface SkillCfg {
  preferred: number;
  specialMin: number;
  specialMax: number;
  needsGround?: boolean;
  selfGround?: boolean;
  ranged?: boolean;       // prefers to keep distance
  bruiser?: boolean;      // prefers to crash in
}

const SKILLS: Record<SkinId, SkillCfg> = {
  heatwave:     { preferred: 420, specialMin: 200, specialMax: 800, ranged: true },
  nightcrawler: { preferred: 60,  specialMin: 350, specialMax: 1200 },
  superman:     { preferred: 60,  specialMin: 0,   specialMax: 90,  needsGround: true, selfGround: true, bruiser: true },
  homelander:   { preferred: 360, specialMin: 140, specialMax: 540, ranged: true },
  hulk:         { preferred: 90,  specialMin: 0,   specialMax: 220, selfGround: true, bruiser: true },
  atrain:       { preferred: 50,  specialMin: 0,   specialMax: 70,  bruiser: true },
  flash:        { preferred: 80,  specialMin: 0,   specialMax: 250 },
  spiderman:    { preferred: 280, specialMin: 200, specialMax: 380, ranged: true },
  ironman:      { preferred: 110, specialMin: 0,   specialMax: 160 },
  batman:       { preferred: 380, specialMin: 250, specialMax: 600, ranged: true },
  butcher:      { preferred: 50,  specialMin: 0,   specialMax: 70,  bruiser: true },
};

type RectInfo = ReturnType<GameEngine["getFighterRect"]> & {};

export class CpuController {
  private engine: GameEngine;
  private id: PlayerId;
  private diff: Difficulty;

  // think state
  private reactT = 0;
  private moveDir: -1 | 0 | 1 = 0;
  private wantJump = false;
  private wantSpecial = false;
  private feintT = 0;
  private commitT = 0;             // lock current movement choice for a few frames (prevents jitter)
  private lastOppMelee: string | null = null;
  private lastOppMeleeT = 0;
  private punishT = 0;              // > 0 means we are mid-punish, charge in
  private retreatT = 0;             // > 0 means we are deliberately backing off
  private dodgedAtX = 0;

  constructor(engine: GameEngine, id: PlayerId = "p2", diff: Difficulty = "hard") {
    this.engine = engine;
    this.id = id;
    this.diff = diff;
  }

  setDifficulty(d: Difficulty) { this.diff = d; }

  update(dt: number, snap: GameSnapshot) {
    if (snap.phase !== "fight") return;
    if (snap.teleTargeting) return;

    const cfg = DIFF[this.diff];
    const me = this.id === "p1" ? snap.p1 : snap.p2;
    const opp = this.id === "p1" ? snap.p2 : snap.p1;
    const meRect = this.engine.getFighterRect(this.id) as RectInfo | null;
    const oppRect = this.engine.getFighterRect(this.id === "p1" ? "p2" : "p1") as RectInfo | null;
    if (!meRect || !oppRect) return;

    this.reactT -= dt;
    this.feintT -= dt;
    this.commitT = Math.max(0, this.commitT - dt);
    this.punishT = Math.max(0, this.punishT - dt);
    this.retreatT = Math.max(0, this.retreatT - dt);
    this.lastOppMeleeT += dt;

    // Track the *moment* the opponent starts a special — that's our cue to react.
    if (oppRect.meleeKind && oppRect.meleeKind !== this.lastOppMelee) {
      this.lastOppMelee = oppRect.meleeKind;
      this.lastOppMeleeT = 0;
      this.onOpponentStartedAttack(meRect, oppRect, cfg);
    } else if (!oppRect.meleeKind) {
      this.lastOppMelee = null;
    }

    // If opponent just whiffed (recovered from a heavy move), open punish window.
    if (!oppRect.meleeKind && this.lastOppMeleeT < cfg.punishWindow && this.lastOppMeleeT > 0.05) {
      this.punishT = Math.max(this.punishT, cfg.punishWindow);
    }

    if (this.reactT <= 0) {
      const jitter = (Math.random() - 0.5) * (cfg.reactJitter / 1000);
      this.reactT = Math.max(0.04, cfg.reactMs / 1000 + jitter);
      this.decide(snap, me, opp, meRect, oppRect, cfg);
    }

    // Apply intents — but occasionally drop a frame to feel human.
    const drop = cfg.mistakeChance > 0 && Math.random() < cfg.mistakeChance * dt * 4;

    // ---- Flight steering: send analog ax/ay so flyers chase in 2D ----
    // Without this the engine sees no axis input → exponential damping → flyer
    // drifts to the ceiling and idles there.
    let ax = 0, ay = 0;
    if (meRect.canFly && meRect.flying) {
      const dx = oppRect.x - meRect.x;
      const adx = Math.abs(dx);
      const skill = SKILLS[this.engine.getSkinIdFor(this.id)] ?? SKILLS.homelander;
      const pref = skill.preferred;
      // Horizontal: close to preferred range, kite if too close (for ranged).
      const dead = 28;
      if (adx > pref + dead) ax = Math.sign(dx);
      else if (adx < pref - dead && skill.ranged) ax = -Math.sign(dx);
      else ax = 0;
      // Vertical: match opponent altitude with a small offset so we float just
      // above and can dive in. Add gentle hover oscillation so we don't lock flat.
      const targetY = oppRect.y - (skill.ranged ? 60 : 20);
      const dy = targetY - meRect.y;
      const ady = Math.abs(dy);
      if (ady > 16) ay = Math.max(-1, Math.min(1, dy / 80));
      // If opponent is on the ground and we're far above, dive down to engage.
      if (oppRect.onGround && meRect.y < oppRect.y - 140) ay = 1;
    }

    this.engine.setIntent(this.id, {
      left:  !drop && this.moveDir < 0,
      right: !drop && this.moveDir > 0,
      ax: drop ? 0 : ax,
      ay: drop ? 0 : ay,
    });
    if (this.wantJump) { this.engine.pressJump(this.id); this.wantJump = false; }
    if (this.wantSpecial) {
      this.wantSpecial = false;
      this.fireSpecial(me.name);
    }
  }

  /** Called the frame an opponent's attack begins — choose dodge / block / counter. */
  private onOpponentStartedAttack(me: RectInfo, opp: RectInfo, cfg: DiffCfg) {
    if (!cfg.block) return;
    const dx = opp.x - me.x;
    const adx = Math.abs(dx);
    const dir = (Math.sign(dx) || 1) as -1 | 1;

    // Heavy committed moves we should respect by getting OUT of range.
    const heavy = new Set(["heatPunch", "groundSmash", "crowbar", "phaseStrike", "repulsor", "webYank"]);
    const ranged = new Set(["laserSweep"]);

    if (ranged.has(opp.meleeKind!)) {
      // Sidestep + jump: lasers don't track verticals well; also hide behind cover.
      this.moveDir = (dir === 1 ? -1 : 1);
      this.commitT = 0.35;
      if (me.onGround) this.wantJump = true;
      this.retreatT = 0.4;
      return;
    }
    if (heavy.has(opp.meleeKind!)) {
      // If we're inside the danger zone, leap away. If we're far enough, hold ground to whiff-punish.
      const danger = opp.meleeKind === "groundSmash" ? 240 : opp.meleeKind === "webYank" ? 420 : 160;
      if (adx < danger) {
        this.moveDir = (dir === 1 ? -1 : 1);
        this.commitT = 0.30;
        if (me.onGround && Math.random() < 0.7) this.wantJump = true;
        this.retreatT = 0.3;
      }
    }
  }

  private fireSpecial(name: string) {
    if (name === "Heatwave") this.engine.pressFire(this.id);
    else if (name === "Nightcrawler") {
      const opp = this.engine.getFighterRect(this.id === "p1" ? "p2" : "p1");
      if (opp) {
        // Drop on the opponent's blind side, slightly behind.
        const side = opp.facing === 1 ? -1 : 1;
        this.engine.aiTeleportTo(this.id, opp.x + side * 80, opp.y);
      }
    } else this.engine.pressMelee(this.id);
  }

  private decide(
    snap: GameSnapshot,
    me: GameSnapshot["p1"], opp: GameSnapshot["p1"],
    meR: RectInfo,
    oppR: RectInfo,
    cfg: DiffCfg,
  ) {
    const mySkin = this.engine.getSkinIdFor(this.id);
    const skill = SKILLS[mySkin];

    let dx = oppR.x - meR.x;
    if (cfg.predictAim) dx += oppR.vx * 0.28;
    const adx = Math.abs(dx);
    const dir = (Math.sign(dx) || 1) as -1 | 1;

    // === Hard rules first (safety / opportunity) ===

    // 1) Opponent is helpless (downed / ragdoll / getting up) — close the gap & stage a hit.
    const oppHelpless = oppR.ragdollT > 0 || oppR.downedT > 0 || oppR.getUpT > 0;
    if (oppHelpless) {
      this.moveDir = dir;
      this.commitT = 0.2;
      // Position just inside our melee range, then unload when they wake up.
      if (adx <= skill.specialMax + 10 && this.canSpecial(me, skill, oppR, meR, adx)) {
        if (Math.random() < cfg.specialChance) this.wantSpecial = true;
      }
      return;
    }

    // 2) We're getting up / ragdolled — stop committing inputs.
    if (meR.ragdollT > 0 || meR.downedT > 0 || meR.getUpT > 0) {
      this.moveDir = 0;
      return;
    }

    // 3) Block-react if we're still in retreat from a telegraphed move.
    if (this.retreatT > 0) {
      this.moveDir = -dir as -1 | 1;
      return;
    }

    // 4) Anti-projectile: time the jump.
    if (cfg.jumpProj) {
      const incoming = this.engine.nearestProjectileTowards(this.id);
      if (incoming != null && incoming < 200 && meR.onGround && Math.abs(this.dodgedAtX - meR.x) > 30) {
        this.wantJump = true;
        this.dodgedAtX = meR.x;
      }
    }

    // 5) Punish window — opponent just whiffed; charge & commit a special.
    if (this.punishT > 0) {
      this.moveDir = dir;
      this.commitT = 0.15;
      if (this.canSpecial(me, skill, oppR, meR, adx) && adx <= skill.specialMax + 20) {
        if (Math.random() < 0.85) this.wantSpecial = true;
      }
      return;
    }

    // 6) Cover-aware: if a cover block is between us and we're a ranged kit, reposition.
    if (skill.ranged && this.engine.hasCoverBetween(this.id, this.id === "p1" ? "p2" : "p1")) {
      // Sidestep around cover by jumping onto / over it.
      if (meR.onGround && Math.random() < 0.5) this.wantJump = true;
      this.moveDir = dir;
      this.commitT = 0.25;
      return;
    }

    // === Soft positioning ===
    if (this.commitT <= 0) {
      const dead = 28;
      const pref = skill.preferred;

      // Low HP defensive bias — back off + bait.
      const lowHp = me.hp < 35;
      const desired = lowHp ? pref + 60 : pref;

      if (adx > desired + dead) {
        this.moveDir = dir;
      } else if (adx < desired - dead) {
        // Too close — kite or hold (bruisers hold more).
        const kite = skill.bruiser ? cfg.kiteChance * 0.4 : cfg.kiteChance;
        this.moveDir = (Math.random() < kite ? -dir : 0) as -1 | 0 | 1;
      } else {
        // In sweet spot — feint to bait, then strike.
        if (this.feintT <= 0) {
          if (cfg.bait) {
            const r = Math.random();
            this.moveDir = (r < 0.35 ? -dir : r < 0.7 ? dir : 0) as -1 | 0 | 1;
            this.feintT = 0.25 + Math.random() * 0.4;
          } else {
            this.moveDir = 0;
            this.feintT = 0.5;
          }
        }
      }
      this.commitT = 0.1 + Math.random() * 0.15;
    }

    // === Vertical play ===
    // Opponent on a higher platform — jump up to chase.
    if (oppR.y < meR.y - 90 && adx < 220 && meR.onGround && Math.random() < 0.5) {
      this.wantJump = true;
    }
    // Opponent flying above — fliers take off; non-fliers wait.
    if (meR.canFly && oppR.flying && !meR.flying && Math.random() < 0.04) {
      this.wantJump = true; // engine treats jump as flight toggle for fliers in some paths
    }

    // === Special trigger logic ===
    if (this.canSpecial(me, skill, oppR, meR, adx)) {
      const inWindow = adx >= skill.specialMin && adx <= skill.specialMax;
      const lowHpTele = me.name === "Nightcrawler" && me.hp < 35;
      // Don't fire ranged specials into cover.
      const blocked = skill.ranged && this.engine.hasCoverBetween(
        this.id,
        this.id === "p1" ? "p2" : "p1",
      );
      // Avoid throwing a heavy when opponent is mid-attack with a faster move (trade unfavorably).
      const opponentFasterAttack = !!oppR.meleeKind && (oppR.meleeKind === "speedFlurry" || oppR.meleeKind === "phaseStrike");
      if (!blocked && !opponentFasterAttack && (inWindow || lowHpTele)) {
        if (Math.random() < cfg.specialChance) this.wantSpecial = true;
      }
    }
  }

  private canSpecial(
    me: GameSnapshot["p1"],
    skill: SkillCfg,
    oppR: RectInfo,
    meR: RectInfo,
    _adx: number,
  ): boolean {
    const cdReady =
      me.name === "Heatwave" ? me.fireCd <= 0 :
      me.name === "Nightcrawler" ? me.teleCd <= 0 :
      me.meleeCd <= 0;
    if (!cdReady) return false;
    if (skill.needsGround && !oppR.onGround) return false;
    if (skill.selfGround && !meR.onGround) return false;
    return true;
  }
}
