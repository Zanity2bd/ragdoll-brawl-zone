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
    windup: 0.55, active: 0.18, recover: 0.4, cooldown: 1.6,
    range: 70, damage: 22, knockbackX: 640, knockbackY: -280,
    hitstop: 0.2, slowmoT: 0.4, shake: 24, ragdollT: 0.7,
    windupSfx: "whoosh", hitSfx: "heavy",
  },
  homelander: {
    kind: "laserSweep", name: "Laser Sweep",
    windup: 0.3, active: 0.55, recover: 0.25, cooldown: 4.8,
    range: 520, damage: 3, knockbackX: 60, knockbackY: -40,
    hitstop: 0.0, slowmoT: 0, shake: 4, ragdollT: 0,
    windupSfx: "blip", hitSfx: "laser",
  },
  hulk: {
    kind: "groundSmash", name: "Ground Smash",
    windup: 0.5, active: 0.18, recover: 0.5, cooldown: 1.7,
    range: 180, damage: 16, knockbackX: 220, knockbackY: -380,
    hitstop: 0.16, slowmoT: 0.25, shake: 28, ragdollT: 0.55,
    windupSfx: "whoosh", hitSfx: "boom",
  },
  atrain: {
    kind: "speedFlurry", name: "Speed Flurry",
    windup: 0.12, active: 0.5, recover: 0.25, cooldown: 1.6,
    range: 55, damage: 3, knockbackX: 60, knockbackY: 0,
    hitstop: 0.04, slowmoT: 0, shake: 3, ragdollT: 0,
    hitSfx: "jab",
  },
  flash: {
    kind: "phaseStrike", name: "Phase Strike",
    windup: 0.12, active: 0.05, recover: 0.45, cooldown: 1.8,
    range: 36, damage: 18, knockbackX: 400, knockbackY: -180,
    hitstop: 0.16, slowmoT: 0.3, shake: 14, ragdollT: 0.45,
    windupSfx: "whoosh", hitSfx: "punch",
  },
  spiderman: {
    kind: "webYank", name: "Web Yank",
    windup: 0.22, active: 0.25, recover: 0.3, cooldown: 1.4,
    range: 380, damage: 14, knockbackX: 280, knockbackY: -200,
    hitstop: 0.12, slowmoT: 0.12, shake: 12, ragdollT: 0.35,
    windupSfx: "chirp", hitSfx: "punch",
  },
  ironman: {
    kind: "repulsor", name: "Repulsor Burst",
    windup: 0.2, active: 0.18, recover: 0.28, cooldown: 1.0,
    range: 140, damage: 11, knockbackX: 260, knockbackY: -100,
    hitstop: 0.08, slowmoT: 0, shake: 9, ragdollT: 0,
    windupSfx: "blip", hitSfx: "boom",
  },
  batman: {
    kind: "batCombo", name: "Batarang Combo",
    windup: 0.18, active: 0.25, recover: 0.32, cooldown: 1.3,
    range: 600, damage: 12, knockbackX: 240, knockbackY: -130,
    hitstop: 0.1, slowmoT: 0, shake: 8, ragdollT: 0,
    windupSfx: "chirp", hitSfx: "punch",
  },
  butcher: {
    kind: "crowbar", name: "Crowbar Swing",
    windup: 0.38, active: 0.18, recover: 0.45, cooldown: 1.5,
    range: 60, damage: 20, knockbackX: 360, knockbackY: -210,
    hitstop: 0.22, slowmoT: 0.35, shake: 20, ragdollT: 0.55,
    windupSfx: "whoosh", hitSfx: "thud",
  },
  heatwave: {
    kind: "crowbar", name: "Flame Bash",
    windup: 0.25, active: 0.18, recover: 0.3, cooldown: 1.4,
    range: 60, damage: 20, knockbackX: 380, knockbackY: -220,
    hitstop: 0.16, slowmoT: 0.2, shake: 16, ragdollT: 0.4,
    windupSfx: "whoosh", hitSfx: "boom",
  },
  nightcrawler: {
    kind: "phaseStrike", name: "Bamf Strike",
    windup: 0.08, active: 0.05, recover: 0.35, cooldown: 1.5,
    range: 36, damage: 22, knockbackX: 480, knockbackY: -220,
    hitstop: 0.16, slowmoT: 0.35, shake: 16, ragdollT: 0.5,
    windupSfx: "whoosh", hitSfx: "punch",
  },
};
