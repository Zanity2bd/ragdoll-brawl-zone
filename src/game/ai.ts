// Per-character CPU controller. Writes into the same intents the keyboard
// uses, so the existing physics + melee path is unchanged.
//
// Goals: actively track the player, reposition aggressively (walk/jump/fly/
// special mobility), and use every character's full kit (melee + power1 +
// power2 + super dash) based on context.

import type { GameEngine, GameSnapshot, PlayerId } from "./engine";
import type { SkinId } from "./skins";

export type Difficulty = "easy" | "hard" | "extreme";

interface DiffCfg {
  reactMs: number;
  reactJitter: number;
  specialChance: number;     // chance to commit a special when window matches
  powerChance: number;       // chance to commit a power1/power2 when window matches
  kiteChance: number;
  jumpProj: boolean;
  predictAim: boolean;
  punishWindow: number;
  bait: boolean;
  block: boolean;
  mistakeChance: number;
}

const DIFF: Record<Difficulty, DiffCfg> = {
  easy:    { reactMs: 320, reactJitter: 120, specialChance: 0.30, powerChance: 0.25, kiteChance: 0.30, jumpProj: false, predictAim: false, punishWindow: 0.25, bait: false, block: false, mistakeChance: 0.20 },
  hard:    { reactMs: 150, reactJitter: 70,  specialChance: 0.70, powerChance: 0.60, kiteChance: 0.55, jumpProj: true,  predictAim: false, punishWindow: 0.55, bait: true,  block: true,  mistakeChance: 0.06 },
  extreme: { reactMs:  70, reactJitter: 30,  specialChance: 0.95, powerChance: 0.85, kiteChance: 0.80, jumpProj: true,  predictAim: true,  punishWindow: 0.80, bait: true,  block: true,  mistakeChance: 0.0 },
};

// Preferred engagement distance + special trigger window per skin.
interface SkillCfg {
  preferred: number;
  specialMin: number;
  specialMax: number;
  needsGround?: boolean;
  selfGround?: boolean;
  ranged?: boolean;
  bruiser?: boolean;
  // Power1/Power2 effective ranges (in px). null means "any range".
  power1Range?: [number, number] | null;
  power2Range?: [number, number] | null;
  // power1 "self-buff" → cast freely when off cooldown
  power1Self?: boolean;
}

const SKILLS: Record<SkinId, SkillCfg> = {
  heatwave:     { preferred: 420, specialMin: 200, specialMax: 800, ranged: true,
                  power1Range: [180, 480], power2Range: [120, 700] },
  nightcrawler: { preferred: 60,  specialMin: 350, specialMax: 1200,
                  power1Range: [0, 130], power2Range: [60, 360] },
  superman:     { preferred: 60,  specialMin: 0,   specialMax: 90,  needsGround: true, selfGround: true, bruiser: true,
                  power1Range: [0, 220], power2Range: [80, 1200] },
  homelander:   { preferred: 360, specialMin: 140, specialMax: 540, ranged: true,
                  power1Range: [120, 600], power2Range: [80, 1200] },
  hulk:         { preferred: 90,  specialMin: 0,   specialMax: 220, selfGround: true, bruiser: true,
                  power1Range: [0, 110], power2Range: [0, 90] },
  atrain:       { preferred: 50,  specialMin: 0,   specialMax: 70,  bruiser: true,
                  power1Range: null, power2Range: [0, 220], power1Self: true },
  flash:        { preferred: 80,  specialMin: 0,   specialMax: 250,
                  power1Range: null, power2Range: [60, 720], power1Self: true },
  spiderman:    { preferred: 280, specialMin: 200, specialMax: 380, ranged: true,
                  power1Range: [120, 360], power2Range: [220, 900] },
  ironman:      { preferred: 110, specialMin: 0,   specialMax: 160,
                  power1Range: [40, 460], power2Range: [80, 900] },
  batman:       { preferred: 380, specialMin: 250, specialMax: 600, ranged: true,
                  power1Range: null, power2Range: [180, 700], power1Self: true },
  butcher:      { preferred: 50,  specialMin: 0,   specialMax: 70,  bruiser: true },
};

// ---- Personality profiles ----
// Each skin has a temperament that biases the existing decision weights.
// aggressive → more specials, less kiting, closes distance
// defensive  → more kiting, fewer specials, prefers cover
// zoner      → keeps mid-range, leans on power abilities
// grappler   → rushes in, hunts grabs/heavies at point-blank
type Personality = "aggressive" | "defensive" | "zoner" | "grappler";

interface PersonalityCfg {
  specialMul: number;    // multiplies cfg.specialChance
  powerMul: number;      // multiplies cfg.powerChance
  kiteMul: number;       // multiplies cfg.kiteChance
  preferredMul: number;  // scales preferred engagement distance
  reactBoost: number;    // subtracts from reactMs (faster = harder)
  jumpinessBoost: number; // adds to anti-stand-still hop chance
}

const PERSONA: Record<Personality, PersonalityCfg> = {
  aggressive: { specialMul: 1.25, powerMul: 1.20, kiteMul: 0.45, preferredMul: 0.75, reactBoost: 30, jumpinessBoost: 0.15 },
  defensive:  { specialMul: 0.80, powerMul: 1.05, kiteMul: 1.55, preferredMul: 1.30, reactBoost: 0,  jumpinessBoost: 0.05 },
  zoner:      { specialMul: 0.95, powerMul: 1.45, kiteMul: 1.20, preferredMul: 1.20, reactBoost: 10, jumpinessBoost: 0    },
  grappler:   { specialMul: 1.30, powerMul: 0.90, kiteMul: 0.30, preferredMul: 0.55, reactBoost: 20, jumpinessBoost: 0.20 },
};

const SKIN_PERSONA: Record<SkinId, Personality> = {
  superman:     "aggressive",
  hulk:         "grappler",
  butcher:      "grappler",
  atrain:       "aggressive",
  flash:        "aggressive",
  nightcrawler: "aggressive",
  spiderman:    "zoner",
  ironman:      "zoner",
  homelander:   "zoner",
  heatwave:     "zoner",
  batman:       "defensive",
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
  private wantPower1 = false;
  private wantPower2 = false;
  private wantSuperDash = false;
  private wantPunch = false;
  private feintT = 0;
  private commitT = 0;
  private lastOppMelee: string | null = null;
  private lastOppMeleeT = 0;
  private punishT = 0;
  private retreatT = 0;
  private dodgedAtX = 0;
  // throttle so we don't spam powers every think tick
  private nextPowerT = 0;
  // throttle basic punches so combat reads like deliberate strikes, not a held button
  private nextPunchT = 0;
  private punchStreak = 0;
  // brief "back off" timer after the opponent goes down so the AI clears space
  // before launching a special — feels far more natural than insta-special-on-fall.
  private regroupT = 0;
  // anti-stand-still timer — forces a small movement / jump when idle too long
  private idleT = 0;
  private preferredScale = 1;
  private jumpinessBoost = 0;

  constructor(engine: GameEngine, id: PlayerId = "p2", diff: Difficulty = "hard") {
    this.engine = engine;
    this.id = id;
    this.diff = diff;
  }

  setDifficulty(d: Difficulty) { this.diff = d; }

  update(dt: number, snap: GameSnapshot) {
    if (snap.phase !== "fight") return;
    if (snap.teleTargeting) return;

    const baseCfg = DIFF[this.diff];
    const persona = PERSONA[SKIN_PERSONA[this.engine.getSkinIdFor(this.id)] ?? "aggressive"];
    // Personality-modulated copy used by the rest of decide()
    const cfg: DiffCfg = {
      ...baseCfg,
      specialChance: Math.min(1, baseCfg.specialChance * persona.specialMul),
      powerChance:   Math.min(1, baseCfg.powerChance   * persona.powerMul),
      kiteChance:    Math.min(1, baseCfg.kiteChance    * persona.kiteMul),
      reactMs:       Math.max(40, baseCfg.reactMs - persona.reactBoost),
    };
    const me = this.id === "p1" ? snap.p1 : snap.p2;
    const opp = this.id === "p1" ? snap.p2 : snap.p1;
    const meRect = this.engine.getFighterRect(this.id) as RectInfo | null;
    const oppRect = this.engine.getFighterRect(this.id === "p1" ? "p2" : "p1") as RectInfo | null;
    if (!meRect || !oppRect) return;
    // Personality also rescales preferred engagement distance.
    this.preferredScale = persona.preferredMul;
    this.jumpinessBoost = persona.jumpinessBoost;

    this.reactT -= dt;
    this.feintT -= dt;
    this.commitT = Math.max(0, this.commitT - dt);
    this.punishT = Math.max(0, this.punishT - dt);
    this.retreatT = Math.max(0, this.retreatT - dt);
    this.nextPowerT = Math.max(0, this.nextPowerT - dt);
    this.lastOppMeleeT += dt;
    this.idleT = this.moveDir === 0 ? this.idleT + dt : 0;

    if (oppRect.meleeKind && oppRect.meleeKind !== this.lastOppMelee) {
      this.lastOppMelee = oppRect.meleeKind;
      this.lastOppMeleeT = 0;
      this.onOpponentStartedAttack(meRect, oppRect, cfg);
    } else if (!oppRect.meleeKind) {
      this.lastOppMelee = null;
    }

    if (!oppRect.meleeKind && this.lastOppMeleeT < cfg.punishWindow && this.lastOppMeleeT > 0.05) {
      this.punishT = Math.max(this.punishT, cfg.punishWindow);
    }

    if (this.reactT <= 0) {
      const jitter = (Math.random() - 0.5) * (cfg.reactJitter / 1000);
      this.reactT = Math.max(0.04, cfg.reactMs / 1000 + jitter);
      this.decide(snap, me, opp, meRect, oppRect, cfg);
    }

    // Anti-stand-still: if we've been still for >0.7s out of combat, perk up.
    if (this.idleT > 0.7 && !meRect.meleeKind) {
      const dx = oppRect.x - meRect.x;
      this.moveDir = (Math.sign(dx) || 1) as -1 | 1;
      if (meRect.onGround && Math.random() < 0.4) this.wantJump = true;
      this.idleT = 0;
      this.commitT = 0.18;
    }

    const drop = cfg.mistakeChance > 0 && Math.random() < cfg.mistakeChance * dt * 4;

    // ---- Flight steering ----
    let ax = 0, ay = 0;
    if (meRect.canFly && meRect.flying) {
      const dx = oppRect.x - meRect.x;
      const adx = Math.abs(dx);
      const skill = SKILLS[this.engine.getSkinIdFor(this.id)] ?? SKILLS.homelander;
      const pref = skill.preferred * this.preferredScale;
      const dead = 28;
      if (adx > pref + dead) ax = Math.sign(dx);
      else if (adx < pref - dead && skill.ranged) ax = -Math.sign(dx);
      else ax = 0;
      const targetY = oppRect.y - (skill.ranged ? 60 : 20);
      const dy = targetY - meRect.y;
      const ady = Math.abs(dy);
      if (ady > 16) ay = Math.max(-1, Math.min(1, dy / 80));
      if (oppRect.onGround && meRect.y < oppRect.y - 140) ay = 1;
    }

    this.engine.setIntent(this.id, {
      left:  !drop && this.moveDir < 0,
      right: !drop && this.moveDir > 0,
      ax: drop ? 0 : ax,
      ay: drop ? 0 : ay,
    });
    if (this.wantJump) { this.engine.pressJump(this.id); this.wantJump = false; }
    if (this.wantSpecial) { this.wantSpecial = false; this.fireSpecial(me.name); }
    if (this.wantPower1) { this.wantPower1 = false; this.engine.pressPower1(this.id); this.nextPowerT = 0.4; }
    if (this.wantPower2) { this.wantPower2 = false; this.engine.pressPower2(this.id); this.nextPowerT = 0.4; }
    if (this.wantSuperDash) { this.wantSuperDash = false; this.engine.pressSuperDash(this.id); this.nextPowerT = 0.6; }
  }

  private onOpponentStartedAttack(me: RectInfo, opp: RectInfo, cfg: DiffCfg) {
    if (!cfg.block) return;
    const dx = opp.x - me.x;
    const adx = Math.abs(dx);
    const dir = (Math.sign(dx) || 1) as -1 | 1;

    const heavy = new Set(["heatPunch", "groundSmash", "crowbar", "phaseStrike", "repulsor", "webYank"]);
    const ranged = new Set(["laserSweep"]);

    if (ranged.has(opp.meleeKind!)) {
      this.moveDir = (dir === 1 ? -1 : 1);
      this.commitT = 0.35;
      if (me.onGround) this.wantJump = true;
      this.retreatT = 0.4;
      return;
    }
    if (heavy.has(opp.meleeKind!)) {
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
    void snap;
    const mySkin = this.engine.getSkinIdFor(this.id);
    const skill = SKILLS[mySkin];

    let dx = oppR.x - meR.x;
    if (cfg.predictAim) dx += oppR.vx * 0.28;
    const adx = Math.abs(dx);
    const dir = (Math.sign(dx) || 1) as -1 | 1;

    // === Hard rules ===
    const oppHelpless = oppR.ragdollT > 0 || oppR.downedT > 0 || oppR.getUpT > 0;
    if (oppHelpless) {
      this.moveDir = dir;
      this.commitT = 0.2;
      if (adx <= skill.specialMax + 10 && this.canSpecial(me, skill, oppR, meR)) {
        if (Math.random() < cfg.specialChance) this.wantSpecial = true;
      }
      this.maybeUsePower(me, skill, adx, oppR, meR, cfg, /*aggressive*/ true);
      return;
    }

    if (meR.ragdollT > 0 || meR.downedT > 0 || meR.getUpT > 0) {
      this.moveDir = 0;
      return;
    }

    if (this.retreatT > 0) {
      this.moveDir = -dir as -1 | 1;
      // Even while retreating, fire a long-range power if we have one ready
      this.maybeUsePower(me, skill, adx, oppR, meR, cfg, false);
      return;
    }

    if (cfg.jumpProj) {
      const incoming = this.engine.nearestProjectileTowards(this.id);
      if (incoming != null && incoming < 200 && meR.onGround && Math.abs(this.dodgedAtX - meR.x) > 30) {
        this.wantJump = true;
        this.dodgedAtX = meR.x;
      }
    }

    if (this.punishT > 0) {
      this.moveDir = dir;
      this.commitT = 0.15;
      if (this.canSpecial(me, skill, oppR, meR) && adx <= skill.specialMax + 20) {
        if (Math.random() < 0.85) this.wantSpecial = true;
      }
      this.maybeUsePower(me, skill, adx, oppR, meR, cfg, true);
      return;
    }

    if (skill.ranged && this.engine.hasCoverBetween(this.id, this.id === "p1" ? "p2" : "p1")) {
      if (meR.onGround && Math.random() < 0.5) this.wantJump = true;
      this.moveDir = dir;
      this.commitT = 0.25;
      return;
    }

    // === Soft positioning ===
    if (this.commitT <= 0) {
      const dead = 28;
      const pref = skill.preferred * this.preferredScale;
      const lowHp = me.hp < 35;
      const desired = lowHp ? pref + 60 : pref;

      if (adx > desired + dead) {
        this.moveDir = dir;
      } else if (adx < desired - dead) {
        const kite = skill.bruiser ? cfg.kiteChance * 0.4 : cfg.kiteChance;
        this.moveDir = (Math.random() < kite ? -dir : 0) as -1 | 0 | 1;
      } else {
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
    if (oppR.y < meR.y - 90 && adx < 220 && meR.onGround && Math.random() < 0.5) {
      this.wantJump = true;
    }
    if (meR.canFly && oppR.flying && !meR.flying && Math.random() < 0.04) {
      this.wantJump = true;
    }
    // Hop occasionally when closing distance to look alive & dodge low projectiles
    if (meR.onGround && adx > skill.preferred + 60 && Math.random() < 0.04 + this.jumpinessBoost * 0.5) {
      this.wantJump = true;
    }

    // === Special trigger ===
    if (this.canSpecial(me, skill, oppR, meR)) {
      const inWindow = adx >= skill.specialMin && adx <= skill.specialMax;
      const lowHpTele = me.name === "Nightcrawler" && me.hp < 35;
      const blocked = skill.ranged && this.engine.hasCoverBetween(
        this.id, this.id === "p1" ? "p2" : "p1",
      );
      const opponentFasterAttack = !!oppR.meleeKind && (oppR.meleeKind === "speedFlurry" || oppR.meleeKind === "phaseStrike");
      if (!blocked && !opponentFasterAttack && (inWindow || lowHpTele)) {
        if (Math.random() < cfg.specialChance) this.wantSpecial = true;
      }
    }

    // === Power abilities ===
    this.maybeUsePower(me, skill, adx, oppR, meR, cfg, false);

    // === Cinematic super dash for fliers when far + ready ===
    if (meR.canFly && meR.flying && adx > 280 && !meR.meleeKind && !oppHelpless && Math.random() < 0.25) {
      this.wantSuperDash = true;
    }
  }

  /** Try to fire power1 / power2 if cooldowns allow and the situation fits. */
  private maybeUsePower(
    me: GameSnapshot["p1"],
    skill: SkillCfg,
    adx: number,
    oppR: RectInfo,
    meR: RectInfo,
    cfg: DiffCfg,
    aggressive: boolean,
  ) {
    if (this.nextPowerT > 0) return;
    if (meR.meleeKind || meR.ragdollT > 0 || meR.downedT > 0 || meR.getUpT > 0) return;

    const chance = aggressive ? Math.min(1, cfg.powerChance + 0.2) : cfg.powerChance;

    // power1
    if (me.power1Cd <= 0 && skill.power1Range !== undefined) {
      const fits = skill.power1Self || skill.power1Range === null
        || (adx >= skill.power1Range[0] && adx <= skill.power1Range[1]);
      if (fits && Math.random() < chance) {
        this.wantPower1 = true;
        return;
      }
    }
    // power2
    if (me.power2Cd <= 0 && skill.power2Range !== undefined) {
      const range = skill.power2Range;
      const fits = range === null || (adx >= range[0] && adx <= range[1]);
      // Avoid wasting ranged power into cover
      const blocked = skill.ranged && this.engine.hasCoverBetween(
        this.id, this.id === "p1" ? "p2" : "p1",
      );
      if (fits && !blocked && Math.random() < chance) {
        this.wantPower2 = true;
      }
    }
    void oppR;
  }

  private canSpecial(
    me: GameSnapshot["p1"],
    skill: SkillCfg,
    oppR: RectInfo,
    meR: RectInfo,
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
