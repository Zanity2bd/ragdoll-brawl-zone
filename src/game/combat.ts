// Per-skin signature melee specials.

import type { SkinId } from "./skins";
import type { SfxName } from "./sfx";

export type AttackKind =
  | "heatPunch"     // superman: long windup, massive launch
  | "laserSweep"    // homelander: beam, dps
  | "groundSmash"   // hulk: shockwave AoE
  | "speedFlurry"   // a-train: rapid jabs + victim slow
  | "phaseStrike"   // flash: blink behind + crit
  | "webYank"       // spiderman: pull-in + kick
  | "repulsor"      // ironman: cone burst
  | "batCombo"      // batman: batarang + dash kicks
  | "crowbar";      // butcher: heavy single hit

export interface MoveSpec {
  kind: AttackKind;
  name: string;
  windup: number;     // seconds before active frame
  active: number;     // seconds the move stays "live"
  recover: number;    // seconds after active where you can't move freely
  cooldown: number;
  range: number;      // px reach in front of fighter
  damage: number;
  knockbackX: number;
  knockbackY: number;
  hitstop: number;    // global freeze on connect
  slowmoT: number;    // global slow-mo on connect
  shake: number;
  ragdollT: number;   // victim ragdoll seconds (0 = no ragdoll)
  windupSfx?: SfxName;
  hitSfx: SfxName;
}

export const MOVES: Record<SkinId, MoveSpec> = {
  superman: {
    kind: "heatPunch", name: "Heat-Punch",
    windup: 0.5, active: 0.2, recover: 0.38, cooldown: 1.5,
    range: 78, damage: 26, knockbackX: 760, knockbackY: -320,
    hitstop: 0.24, slowmoT: 0.45, shake: 28, ragdollT: 0.85,
    windupSfx: "whoosh", hitSfx: "heavy",
  },
  homelander: {
    kind: "laserSweep", name: "Laser Sweep",
    // 10s sustained beam, 20s cooldown. Damage is per active second (1 dps),
    // so a full hold deals ~10 damage. Final 3s overload phase pierces cover
    // and deals heavier damage (handled in engine.ts laserSweep tick).
    windup: 0.3, active: 10.0, recover: 0.4, cooldown: 20.0,
    range: 520, damage: 1, knockbackX: 60, knockbackY: -40,
    hitstop: 0.0, slowmoT: 0, shake: 4, ragdollT: 0,
    windupSfx: "blip", hitSfx: "laser",
  },
  hulk: {
    kind: "groundSmash", name: "Ground Smash",
    windup: 0.45, active: 0.2, recover: 0.5, cooldown: 1.6,
    range: 200, damage: 20, knockbackX: 260, knockbackY: -440,
    hitstop: 0.2, slowmoT: 0.3, shake: 34, ragdollT: 0.7,
    windupSfx: "whoosh", hitSfx: "boom",
  },
  atrain: {
    kind: "speedFlurry", name: "Speed Flurry",
    windup: 0.1, active: 0.6, recover: 0.22, cooldown: 1.5,
    range: 60, damage: 4, knockbackX: 70, knockbackY: 0,
    hitstop: 0.05, slowmoT: 0, shake: 4, ragdollT: 0,
    hitSfx: "jab",
  },
  flash: {
    kind: "phaseStrike", name: "Phase Strike",
    windup: 0.1, active: 0.05, recover: 0.4, cooldown: 1.6,
    range: 40, damage: 22, knockbackX: 480, knockbackY: -220,
    hitstop: 0.2, slowmoT: 0.36, shake: 18, ragdollT: 0.55,
    windupSfx: "whoosh", hitSfx: "punch",
  },
  spiderman: {
    kind: "webYank", name: "Web Yank",
    windup: 0.2, active: 0.28, recover: 0.28, cooldown: 1.3,
    range: 420, damage: 16, knockbackX: 320, knockbackY: -240,
    hitstop: 0.14, slowmoT: 0.16, shake: 14, ragdollT: 0.45,
    windupSfx: "chirp", hitSfx: "punch",
  },
  ironman: {
    kind: "repulsor", name: "Repulsor Burst",
    windup: 0.18, active: 0.2, recover: 0.26, cooldown: 0.95,
    range: 160, damage: 14, knockbackX: 320, knockbackY: -130,
    hitstop: 0.1, slowmoT: 0.08, shake: 12, ragdollT: 0.25,
    windupSfx: "blip", hitSfx: "boom",
  },
  batman: {
    kind: "batCombo", name: "Batarang Combo",
    windup: 0.16, active: 0.28, recover: 0.3, cooldown: 1.2,
    range: 640, damage: 14, knockbackX: 280, knockbackY: -150,
    hitstop: 0.12, slowmoT: 0.05, shake: 10, ragdollT: 0,
    windupSfx: "chirp", hitSfx: "punch",
  },
  butcher: {
    kind: "crowbar", name: "Crowbar Swing",
    windup: 0.34, active: 0.2, recover: 0.42, cooldown: 1.4,
    range: 66, damage: 24, knockbackX: 420, knockbackY: -240,
    hitstop: 0.26, slowmoT: 0.4, shake: 24, ragdollT: 0.7,
    windupSfx: "whoosh", hitSfx: "thud",
  },
  heatwave: {
    kind: "crowbar", name: "Flame Bash",
    windup: 0.22, active: 0.2, recover: 0.28, cooldown: 1.3,
    range: 66, damage: 22, knockbackX: 420, knockbackY: -250,
    hitstop: 0.18, slowmoT: 0.24, shake: 18, ragdollT: 0.5,
    windupSfx: "whoosh", hitSfx: "boom",
  },
  nightcrawler: {
    kind: "phaseStrike", name: "Bamf Strike",
    windup: 0.06, active: 0.05, recover: 0.32, cooldown: 1.4,
    range: 40, damage: 26, knockbackX: 540, knockbackY: -260,
    hitstop: 0.2, slowmoT: 0.4, shake: 18, ragdollT: 0.6,
    windupSfx: "whoosh", hitSfx: "punch",
  },
