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
    windup: 0.45, active: 0.18, recover: 0.35, cooldown: 1.6,
    range: 70, damage: 32, knockbackX: 880, knockbackY: -360,
    hitstop: 0.22, slowmoT: 0.5, shake: 28, ragdollT: 0.9,
    windupSfx: "whoosh", hitSfx: "heavy",
  },
  homelander: {
    kind: "laserSweep", name: "Laser Sweep",
    windup: 0.3, active: 0.55, recover: 0.25, cooldown: 1.8,
    range: 520, damage: 4, knockbackX: 60, knockbackY: -40,
    hitstop: 0.0, slowmoT: 0, shake: 4, ragdollT: 0,
    windupSfx: "blip", hitSfx: "laser",
  },
  hulk: {
    kind: "groundSmash", name: "Ground Smash",
    windup: 0.4, active: 0.18, recover: 0.4, cooldown: 1.7,
    range: 200, damage: 22, knockbackX: 280, knockbackY: -480,
    hitstop: 0.18, slowmoT: 0.3, shake: 32, ragdollT: 0.7,
    windupSfx: "whoosh", hitSfx: "boom",
  },
  atrain: {
    kind: "speedFlurry", name: "Speed Flurry",
    windup: 0.12, active: 0.6, recover: 0.2, cooldown: 1.6,
    range: 55, damage: 4, knockbackX: 60, knockbackY: 0,
    hitstop: 0.04, slowmoT: 0, shake: 3, ragdollT: 0,
    hitSfx: "jab",
  },
  flash: {
    kind: "phaseStrike", name: "Phase Strike",
    windup: 0.1, active: 0.05, recover: 0.4, cooldown: 1.8,
    range: 36, damage: 26, knockbackX: 540, knockbackY: -240,
    hitstop: 0.18, slowmoT: 0.4, shake: 18, ragdollT: 0.6,
    windupSfx: "whoosh", hitSfx: "punch",
  },
  spiderman: {
    kind: "webYank", name: "Web Yank",
    windup: 0.2, active: 0.25, recover: 0.3, cooldown: 1.4,
    range: 380, damage: 18, knockbackX: 360, knockbackY: -260,
    hitstop: 0.12, slowmoT: 0.15, shake: 14, ragdollT: 0.4,
    windupSfx: "chirp", hitSfx: "punch",
  },
  ironman: {
    kind: "repulsor", name: "Repulsor Burst",
    windup: 0.18, active: 0.18, recover: 0.25, cooldown: 1.0,
    range: 140, damage: 14, knockbackX: 320, knockbackY: -120,
    hitstop: 0.08, slowmoT: 0, shake: 10, ragdollT: 0,
    windupSfx: "blip", hitSfx: "boom",
  },
  batman: {
    kind: "batCombo", name: "Batarang Combo",
    windup: 0.15, active: 0.25, recover: 0.3, cooldown: 1.3,
    range: 600, damage: 16, knockbackX: 300, knockbackY: -160,
    hitstop: 0.1, slowmoT: 0, shake: 8, ragdollT: 0,
    windupSfx: "chirp", hitSfx: "punch",
  },
  butcher: {
    kind: "crowbar", name: "Crowbar Swing",
    windup: 0.32, active: 0.18, recover: 0.4, cooldown: 1.5,
    range: 60, damage: 28, knockbackX: 460, knockbackY: -260,
    hitstop: 0.24, slowmoT: 0.45, shake: 22, ragdollT: 0.7,
    windupSfx: "whoosh", hitSfx: "thud",
  },
};
