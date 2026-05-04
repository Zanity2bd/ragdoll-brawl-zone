// OgunArena — soft-body wobble + partial ragdoll (stagger) layer.
// Pure post-process on the rigid Pose. Spring–damper springs, semi-implicit Euler.
// Stable at 60 FPS, allocation-free per frame.

import type { Pose } from "./animation";

export interface WobbleState {
  // torso secondary motion
  bx: number; by: number; bvx: number; bvy: number;
  tilt: number; tiltV: number;
  // 4 limbs × (x,y,vx,vy) = 16 floats
  limb: Float32Array;
  // last-known fighter velocity (to derive accel)
  lastVx: number; lastVy: number;
  // hit reaction
  staggerT: number;       // remaining flail duration (s)
  staggerDir: -1 | 1;
  staggerMag: number;     // 0..1
  staggerImmuneT: number; // anti-spam window after a stagger ends
}

export function createWobble(): WobbleState {
  return {
    bx: 0, by: 0, bvx: 0, bvy: 0,
    tilt: 0, tiltV: 0,
    limb: new Float32Array(16),
    lastVx: 0, lastVy: 0,
    staggerT: 0, staggerDir: 1, staggerMag: 0,
    staggerImmuneT: 0,
  };
}

export function resetWobble(s: WobbleState) {
  s.bx = s.by = s.bvx = s.bvy = 0;
  s.tilt = s.tiltV = 0;
  s.limb.fill(0);
  s.staggerT = 0; s.staggerMag = 0;
  s.staggerImmuneT = 0;
}

// Add a directional impulse — used by hits.
// dirX/dirY are unit-ish; mag scales body kick + per-limb spread.
export function applyImpulse(s: WobbleState, dirX: number, dirY: number, mag: number) {
  const m = Math.max(0, Math.min(1.2, mag));
  s.bvx += dirX * 220 * m;
  s.bvy += dirY * 180 * m;
  s.tiltV += dirX * 6 * m;
  // Spread limbs in random directions, biased by hit dir
  const L = s.limb;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    const rx = (Math.random() - 0.5) * 2;
    const ry = (Math.random() - 0.5) * 2;
    L[o + 2] += (dirX * 1.4 + rx) * 140 * m;
    L[o + 3] += (dirY * 1.0 + ry) * 120 * m;
  }
}

// Integrate the springs. Stiffness/damping switch by state for a stable idle
// and a floppier feel when hit / airborne.
export function stepWobble(
  s: WobbleState,
  dt: number,
  vx: number, vy: number,
  onGround: boolean, flying: boolean,
  lowPower: boolean,
) {
  if (dt <= 0) return;
  // Cap dt for stability (huge frames after tab switch)
  const h = Math.min(dt, 1 / 30);

  // Drive springs from acceleration: change in fighter velocity → impulse to body
  const ax = (vx - s.lastVx);
  const ay = (vy - s.lastVy);
  s.lastVx = vx; s.lastVy = vy;
  // Scale: keep modest, this is secondary motion only
  s.bvx -= ax * 0.18;
  s.bvy -= ay * 0.14;

  if (s.staggerT > 0) {
    s.staggerT -= h;
    if (s.staggerT <= 0) {
      s.staggerT = 0;
      s.staggerImmuneT = 0.25;
    }
  }
  if (s.staggerImmuneT > 0) s.staggerImmuneT = Math.max(0, s.staggerImmuneT - h);

  // Choose stiffness by state
  const speed = Math.hypot(vx, vy);
  let kBody: number, dBody: number, kLimb: number, dLimb: number;
  if (s.staggerT > 0) {
    kBody = 70; dBody = 7; kLimb = 60; dLimb = 6;
  } else if (!onGround && !flying) {
    kBody = 90; dBody = 9; kLimb = 80; dLimb = 8;
  } else if (speed > 30) {
    kBody = 130; dBody = 13; kLimb = 120; dLimb = 12;
  } else {
    // Idle — near-rigid; almost no motion
    kBody = 200; dBody = 20; kLimb = 180; dLimb = 18;
  }

  if (flying) { kBody *= 1.2; dBody *= 1.1; }

  // Body spring (toward 0,0)
  s.bvx += (-kBody * s.bx - dBody * s.bvx) * h;
  s.bvy += (-kBody * s.by - dBody * s.bvy) * h;
  s.bx += s.bvx * h;
  s.by += s.bvy * h;

  s.tiltV += (-kBody * s.tilt - dBody * s.tiltV) * h;
  s.tilt += s.tiltV * h;

  // Limb springs
  const L = s.limb;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    const px = L[o], py = L[o + 1];
    let lvx = L[o + 2], lvy = L[o + 3];
    lvx += (-kLimb * px - dLimb * lvx) * h;
    lvy += (-kLimb * py - dLimb * lvy) * h;
    L[o + 2] = lvx; L[o + 3] = lvy;
    L[o] = px + lvx * h;
    L[o + 1] = py + lvy * h;
  }

  // Hard clamps so silhouettes never break
  const bodyCap = lowPower ? 3 : 6;
  const limbCap = lowPower ? 3 : 6;
  if (s.bx > bodyCap) s.bx = bodyCap; else if (s.bx < -bodyCap) s.bx = -bodyCap;
  if (s.by > bodyCap) s.by = bodyCap; else if (s.by < -bodyCap) s.by = -bodyCap;
  if (s.tilt > 0.18) s.tilt = 0.18; else if (s.tilt < -0.18) s.tilt = -0.18;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    if (L[o] > limbCap) L[o] = limbCap; else if (L[o] < -limbCap) L[o] = -limbCap;
    if (L[o + 1] > limbCap) L[o + 1] = limbCap; else if (L[o + 1] < -limbCap) L[o + 1] = -limbCap;
  }
}

// Apply spring offsets to the rigid pose. Feet keep ~40% of the offset so
// they don't visibly slide off the ground.
export function applyWobble(p: Pose, s: WobbleState, lowPower: boolean): Pose {
  const bx = s.bx, by = s.by;
  const upper = 1.0;     // arms/shoulders take full body offset
  const lower = 0.45;    // hips/legs take less so footing reads clean
  // Per-limb extras (arms more than legs)
  const armScale = lowPower ? 0.6 : 1.0;
  const legScale = lowPower ? 0.3 : 0.5;
  const L = s.limb;
  // limb order: 0=armL, 1=armR, 2=legL, 3=legR
  const aLx = L[0] * armScale, aLy = L[1] * armScale;
  const aRx = L[4] * armScale, aRy = L[5] * armScale;
  const lLx = L[8] * legScale, lLy = L[9] * legScale;
  const lRx = L[12] * legScale, lRy = L[13] * legScale;

  return {
    headOffsetY: p.headOffsetY + by * upper * 0.8,
    shoulderY: p.shoulderY + by * upper,
    hipY: p.hipY + by * lower,
    legL: [
      p.legL[0] + bx * lower, p.legL[1] + by * lower,
      p.legL[2] + bx * lower + lLx * 0.6, p.legL[3] + by * lower + lLy * 0.6,
      p.legL[4] + bx * lower * 0.4 + lLx * 0.3, p.legL[5] + by * lower * 0.4 + lLy * 0.3,
    ],
    legR: [
      p.legR[0] + bx * lower, p.legR[1] + by * lower,
      p.legR[2] + bx * lower + lRx * 0.6, p.legR[3] + by * lower + lRy * 0.6,
      p.legR[4] + bx * lower * 0.4 + lRx * 0.3, p.legR[5] + by * lower * 0.4 + lRy * 0.3,
    ],
    armL: [
      p.armL[0] + bx * upper, p.armL[1] + by * upper,
      p.armL[2] + bx * upper + aLx * 0.7, p.armL[3] + by * upper + aLy * 0.7,
      p.armL[4] + bx * upper + aLx, p.armL[5] + by * upper + aLy,
    ],
    armR: [
      p.armR[0] + bx * upper, p.armR[1] + by * upper,
      p.armR[2] + bx * upper + aRx * 0.7, p.armR[3] + by * upper + aRy * 0.7,
      p.armR[4] + bx * upper + aRx, p.armR[5] + by * upper + aRy,
    ],
    handL: [p.handL[0] + bx * upper + aLx, p.handL[1] + by * upper + aLy],
    handR: [p.handR[0] + bx * upper + aRx, p.handR[1] + by * upper + aRy],
    footL: [p.footL[0] + bx * lower * 0.4 + lLx * 0.3, p.footL[1] + by * lower * 0.4 + lLy * 0.3],
    footR: [p.footR[0] + bx * lower * 0.4 + lRx * 0.3, p.footR[1] + by * lower * 0.4 + lRy * 0.3],
    lean: p.lean + s.tilt,
    shoulderRoll: p.shoulderRoll + s.tilt * 0.3,
  };
}
