// Per-character CPU controller. Writes into the same intents the keyboard
// uses, so the existing physics + melee path is unchanged.

import type { GameEngine, GameSnapshot, PlayerId } from "./engine";
import type { SkinId } from "./skins";

export type Difficulty = "easy" | "hard" | "extreme";

interface DiffCfg {
  reactMs: number;
  specialChance: number;
  kiteChance: number;
  jumpProj: boolean;
  predictAim: boolean;
}

const DIFF: Record<Difficulty, DiffCfg> = {
  easy:    { reactMs: 280, specialChance: 0.25, kiteChance: 0.30, jumpProj: false, predictAim: false },
  hard:    { reactMs: 140, specialChance: 0.65, kiteChance: 0.60, jumpProj: true,  predictAim: false },
  extreme: { reactMs:  60, specialChance: 0.95, kiteChance: 0.85, jumpProj: true,  predictAim: true  },
};

// Preferred engagement distance + special trigger window per skin.
interface SkillCfg {
  preferred: number;        // ideal stand-off distance (px)
  specialMin: number;
  specialMax: number;
  needsGround?: boolean;    // opponent must be grounded
  selfGround?: boolean;     // self must be grounded
}

const SKILLS: Record<SkinId, SkillCfg> = {
  heatwave:     { preferred: 420, specialMin: 200, specialMax: 800 },
  nightcrawler: { preferred: 60,  specialMin: 350, specialMax: 1200 },
  superman:     { preferred: 60,  specialMin: 0,   specialMax: 90,  needsGround: true, selfGround: true },
  homelander:   { preferred: 320, specialMin: 120, specialMax: 540 },
  hulk:         { preferred: 110, specialMin: 0,   specialMax: 220, selfGround: true },
  atrain:       { preferred: 50,  specialMin: 0,   specialMax: 70 },
  flash:        { preferred: 80,  specialMin: 0,   specialMax: 250 },
  spiderman:    { preferred: 280, specialMin: 200, specialMax: 380 },
  ironman:      { preferred: 110, specialMin: 0,   specialMax: 160 },
  batman:       { preferred: 380, specialMin: 250, specialMax: 600 },
  butcher:      { preferred: 50,  specialMin: 0,   specialMax: 70 },
};

export class CpuController {
  private engine: GameEngine;
  private id: PlayerId;
  private diff: Difficulty;
  private reactT = 0;
  // last decision (only re-evaluated when reactT hits zero)
  private moveDir: -1 | 0 | 1 = 0;
  private wantJump = false;
  private wantSpecial = false;
  private feintT = 0;

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
    const meRect = this.engine.getFighterRect(this.id);
    const oppRect = this.engine.getFighterRect(this.id === "p1" ? "p2" : "p1");
    if (!meRect || !oppRect) return;

    this.reactT -= dt;
    this.feintT -= dt;

    if (this.reactT <= 0) {
      this.reactT = cfg.reactMs / 1000;
      this.decide(snap, me, opp, meRect, oppRect, cfg);
    }

    // Apply intents every frame (engine clears them after use).
    this.engine.setIntent(this.id, {
      left: this.moveDir < 0,
      right: this.moveDir > 0,
    });
    if (this.wantJump) { this.engine.pressJump(this.id); this.wantJump = false; }
    if (this.wantSpecial) {
      this.wantSpecial = false;
      this.fireSpecial(me.name);
    }
  }

  private fireSpecial(name: string) {
    // Heatwave fires bolt; Nightcrawler teleports near opponent; everyone else melees.
    if (name === "Heatwave") this.engine.pressFire(this.id);
    else if (name === "Nightcrawler") {
      const opp = this.engine.getFighterRect(this.id === "p1" ? "p2" : "p1");
      if (opp) {
        // Drop behind the opponent (opposite their facing).
        const side = opp.facing === 1 ? -1 : 1;
        this.engine.aiTeleportTo(this.id, opp.x + side * 80, opp.y);
      }
    } else this.engine.pressMelee(this.id);
  }

  private decide(
    snap: GameSnapshot,
    me: GameSnapshot["p1"], opp: GameSnapshot["p1"],
    meR: { x: number; y: number; vx: number; vy: number; onGround: boolean; facing: number; meleeKind: string | null; hp: number },
    oppR: { x: number; y: number; vx: number; vy: number; onGround: boolean; facing: number; meleeKind: string | null; hp: number },
    cfg: DiffCfg,
  ) {
    const mySkin = this.engine.getSkinIdFor(this.id);
    const skill = SKILLS[mySkin];
    let dx = oppR.x - meR.x;
    if (cfg.predictAim) dx += oppR.vx * 0.25;
    const adx = Math.abs(dx);
    const dir = Math.sign(dx) as -1 | 0 | 1;

    // Threat reaction: opponent attacking close → back-step / jump
    if (oppR.meleeKind && adx < 140) {
      this.moveDir = (-dir as -1 | 0 | 1) || -1;
      if (meR.onGround && Math.random() < 0.6) this.wantJump = true;
      return;
    }

    // Anti-projectile
    if (cfg.jumpProj) {
      const incoming = this.engine.nearestProjectileTowards(this.id);
      if (incoming != null && incoming < 180 && meR.onGround) {
        this.wantJump = true;
      }
    }

    // Movement: kite or close to preferred range
    const dead = 30;
    if (adx > skill.preferred + dead) {
      this.moveDir = dir as -1 | 0 | 1;
    } else if (adx < skill.preferred - dead) {
      // too close — sometimes back off
      this.moveDir = (Math.random() < cfg.kiteChance ? (-dir as -1 | 0 | 1) : 0);
    } else {
      // sweet spot — small feints
      if (this.feintT <= 0) {
        this.moveDir = (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0) as -1 | 0 | 1;
        this.feintT = 0.4 + Math.random() * 0.5;
      }
    }

    // Special trigger
    const specialReadyByCd =
      me.name === "Heatwave" ? me.fireCd <= 0 :
      me.name === "Nightcrawler" ? me.teleCd <= 0 :
      me.meleeCd <= 0;

    const inWindow = adx >= skill.specialMin && adx <= skill.specialMax;
    const groundOk = !skill.needsGround || oppR.onGround;
    const selfOk = !skill.selfGround || meR.onGround;
    const lowHpTele = me.name === "Nightcrawler" && me.hp < 35;

    if (specialReadyByCd && groundOk && selfOk && (inWindow || lowHpTele)) {
      if (Math.random() < cfg.specialChance) this.wantSpecial = true;
    }

    // Always also try basic melee when opponent is in melee range and special isn't firing
    if (!this.wantSpecial && me.meleeCd <= 0 && adx < 80 && me.name !== "Heatwave" && me.name !== "Nightcrawler") {
      // melee = same as wantSpecial path for non-special characters; covered above.
    }

    // Jump up onto platforms occasionally if opponent is on one above.
    if (oppR.y < meR.y - 80 && adx < 200 && meR.onGround && Math.random() < 0.4) {
      this.wantJump = true;
    }
  }
}
