// Per-character walk stance presets. The engine renders one shared sprite
// sheet, but multiplies these numbers into bob amplitude, stride length,
// vertical lean and a small horizontal sway so each character walks like
// themselves without needing per-character animation frames.

import type { SkinId } from "./skins";

export interface Stance {
  /** Multiplier on bob amplitude. >1 = heavier footfall (Hulk), <1 = light (Flash). */
  bobMul: number;
  /** Multiplier on stride length — longer stride = slower frame cycle vs ground speed. */
  strideMul: number;
  /** Constant vertical offset in CSS px. Negative = crouched (Spidey). */
  crouch: number;
  /** Forward lean in CSS px (applied with facing). Positive = leans into direction of motion (Flash). */
  lean: number;
  /** Side-to-side shoulder sway amplitude in CSS px while walking (heavy = Hulk). */
  sway: number;
  /** Idle breathing amplitude multiplier. */
  idleMul: number;
}

const DEFAULT: Stance = {
  bobMul: 1, strideMul: 1, crouch: 0, lean: 0, sway: 0, idleMul: 1,
};

const STANCES: Partial<Record<SkinId, Stance>> = {
  // Springy crawler — low crouched stance, light bob, short quick stride.
  spiderman: { bobMul: 1.15, strideMul: 0.85, crouch: -3, lean: 0.5, sway: 0, idleMul: 1.1 },
  // Heavy bruiser — huge bob, long heavy stride, big shoulder sway.
  hulk:      { bobMul: 1.9, strideMul: 1.35, crouch: 1, lean: -0.5, sway: 1.2, idleMul: 1.4 },
  // Speedster — barely any bob, forward lean, tight quick stride.
  flash:     { bobMul: 0.55, strideMul: 0.75, crouch: 0, lean: 2.2, sway: 0, idleMul: 0.8 },
  // Slight defaults for the rest so they still feel distinct.
  ironman:   { bobMul: 1.1, strideMul: 1.05, crouch: 0, lean: 0.3, sway: 0.2, idleMul: 1 },
  wolverine: { bobMul: 1.35, strideMul: 0.9, crouch: -1, lean: 1.1, sway: 0.55, idleMul: 1.15 },
  superman:  { bobMul: 0.9, strideMul: 1.1, crouch: 0, lean: 0.8, sway: 0, idleMul: 1 },
  homelander:{ bobMul: 0.85, strideMul: 1.1, crouch: 0, lean: 0, sway: 0, idleMul: 1 },
  batman:    { bobMul: 1, strideMul: 1, crouch: -1, lean: 0.4, sway: 0, idleMul: 1 },
  butcher:   { bobMul: 1.05, strideMul: 1.10, crouch: 1, lean: -0.6, sway: 0.4, idleMul: 0.95 },
  atrain:    { bobMul: 0.6, strideMul: 0.8, crouch: 0, lean: 1.8, sway: 0, idleMul: 0.85 },
  heatwave:  { bobMul: 1.2, strideMul: 1.1, crouch: 0, lean: 0, sway: 0.5, idleMul: 1.1 },
  nightcrawler:{ bobMul: 1.05, strideMul: 0.9, crouch: -2, lean: 0.4, sway: 0, idleMul: 1 },
};

export function getStance(id: SkinId): Stance {
  return STANCES[id] ?? DEFAULT;
}
