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
  staggerT: number;
  staggerDir: -1 | 1;
  staggerMag: number;
  staggerImmuneT: number;
  // squash & stretch (1 = neutral, <1 squashed, >1 stretched)
  squash: number; squashV: number;
  // tiny noise phase for organic micro-motion
  noisePhase: number;
}

export function createWobble(): WobbleState {
  return {
    bx: 0, by: 0, bvx: 0, bvy: 0,
    tilt: 0, tiltV: 0,
    limb: new Float32Array(16),
    lastVx: 0, lastVy: 0,
    staggerT: 0, staggerDir: 1, staggerMag: 0,
    staggerImmuneT: 0,
    squash: 1, squashV: 0,
    noisePhase: Math.random() * 1000,
  };
}

export function resetWobble(s: WobbleState) {
  s.bx = s.by = s.bvx = s.bvy = 0;
  s.tilt = s.tiltV = 0;
  s.limb.fill(0);
  s.staggerT = 0; s.staggerMag = 0;
  s.staggerImmuneT = 0;
  s.squash = 1; s.squashV = 0;
}

// Add a directional impulse — used by hits.
// dirX/dirY are unit-ish; mag scales body kick + per-limb spread.
export function applyImpulse(s: WobbleState, dirX: number, dirY: number, mag: number) {
  const m = Math.max(0, Math.min(1.4, mag));
  // Slightly stronger initial force
  s.bvx += dirX * 280 * m;
  s.bvy += dirY * 220 * m - 60 * m; // small upward kick → settle gives weight
  // Rotational torso impulse: torque proportional to lateral force,
  // plus a randomised twist for organic feel
  s.tiltV += dirX * 9 * m + (Math.random() - 0.5) * 4 * m;
  // Squash on hit (compresses then springs back, becomes stretch on rebound)
  s.squashV -= 6 * m;
  // Spread limbs in random directions, biased by hit dir
  const L = s.limb;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    const rx = (Math.random() - 0.5) * 2.4;
    const ry = (Math.random() - 0.5) * 2.4;
    L[o + 2] += (dirX * 1.6 + rx) * 170 * m;
    L[o + 3] += (dirY * 1.0 + ry) * 140 * m;
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
  agile: boolean = false,
) {
  if (dt <= 0) return;
  const h = Math.min(dt, 1 / 30);

  // Drive springs from acceleration: change in fighter velocity → impulse to body
  const ax = (vx - s.lastVx);
  const ay = (vy - s.lastVy);
  s.lastVx = vx; s.lastVy = vy;
  s.bvx -= ax * 0.18;
  s.bvy -= ay * 0.14;

  if (s.staggerT > 0) {
    s.staggerT -= h;
    if (s.staggerT <= 0) {
      s.staggerT = 0;
      // Slightly delayed full control recovery
      s.staggerImmuneT = 0.32;
    }
  }
  if (s.staggerImmuneT > 0) s.staggerImmuneT = Math.max(0, s.staggerImmuneT - h);

  s.noisePhase += h;

  // Choose stiffness by state. Underdamped (d^2 < 4k) = natural overshoot.
  let kBody: number, dBody: number, kLimb: number, dLimb: number;
  const speed = Math.hypot(vx, vy);
  if (s.staggerT > 0) {
    kBody = 70; dBody = 5.5; kLimb = 60; dLimb = 4.5;
  } else if (!onGround && !flying) {
    kBody = 95; dBody = 7.5; kLimb = 80; dLimb = 6.5;
  } else if (speed > 30) {
    kBody = 140; dBody = 11; kLimb = 120; dLimb = 10;
  } else {
    // Idle — near-rigid; almost no motion
    kBody = 220; dBody = 22; kLimb = 200; dLimb = 20;
  }

  if (flying) { kBody *= 1.15; dBody *= 1.05; }

  // Agile fighters (Spider-Man) — looser springs for constant subtle sway
  if (agile) {
    kBody *= 0.78; dBody *= 0.72;
    kLimb *= 0.7;  dLimb *= 0.7;
  }

  // Body spring (toward 0,0)
  s.bvx += (-kBody * s.bx - dBody * s.bvx) * h;
  s.bvy += (-kBody * s.by - dBody * s.bvy) * h;

  // Subtle organic noise (only when not idle-near-rigid; perlin-ish via sin sums)
  if (agile || speed > 8 || s.staggerT > 0 || (!onGround && !flying)) {
    const n1 = Math.sin(s.noisePhase * 6.3) * Math.cos(s.noisePhase * 3.1);
    const n2 = Math.sin(s.noisePhase * 4.7 + 1.3) * Math.cos(s.noisePhase * 5.9 + 0.7);
    const baseAmp = s.staggerT > 0 ? 14 : 4;
    const noiseAmp = (agile ? baseAmp + 6 : baseAmp) * (lowPower ? 0.5 : 1);
    s.bvx += n1 * noiseAmp * h * 8;
    s.bvy += n2 * noiseAmp * h * 8;
    s.tiltV += n1 * (agile ? 1.1 : 0.6) * h * 8;
    // Constant micro-sway in the limbs for agile characters
    if (agile) {
      const L = s.limb;
      for (let i = 0; i < 4; i++) {
        const o = i * 4;
        const ph = s.noisePhase * (i % 2 === 0 ? 5.1 : 4.3) + i * 1.7;
        L[o + 2] += Math.sin(ph) * 18 * h * 8;
        L[o + 3] += Math.cos(ph * 0.9) * 14 * h * 8;
      }
    }
  }

  // Stagger: mild downward force on body & limbs (sense of weight)
  if (s.staggerT > 0) {
    s.bvy += 240 * h;
  }

  s.bx += s.bvx * h;
  s.by += s.bvy * h;

  // Tilt spring
  s.tiltV += (-kBody * s.tilt - dBody * s.tiltV) * h;
  s.tilt += s.tiltV * h;

  // Squash spring (toward 1)
  const kS = s.staggerT > 0 ? 90 : 160;
  const dS = s.staggerT > 0 ? 7 : 14;
  s.squashV += (-kS * (s.squash - 1) - dS * s.squashV) * h;
  s.squash += s.squashV * h;

  // Limb springs
  const L = s.limb;
  // mild downward gravity on staggered limbs (legs more than arms)
  const gravStag = s.staggerT > 0 ? 320 : 0;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    const px = L[o], py = L[o + 1];
    let lvx = L[o + 2], lvy = L[o + 3];
    lvx += (-kLimb * px - dLimb * lvx) * h;
    lvy += (-kLimb * py - dLimb * lvy) * h;
    // legs (i=2,3) get full grav, arms (i=0,1) get less
    if (gravStag > 0) lvy += gravStag * (i >= 2 ? 1 : 0.55) * h;
    L[o + 2] = lvx; L[o + 3] = lvy;
    L[o] = px + lvx * h;
    L[o + 1] = py + lvy * h;
  }

  // Foot anchoring: when grounded & idle/walking (not staggered, not airborne),
  // damp the leg spring offsets aggressively so feet don't slide.
  if (onGround && !flying && s.staggerT <= 0) {
    const anchor = Math.exp(-12 * h); // strong pull toward 0
    for (let i = 2; i < 4; i++) {
      const o = i * 4;
      L[o] *= anchor;
      L[o + 1] *= anchor;
      L[o + 2] *= 0.6;
      L[o + 3] *= 0.6;
    }
  }

  // Hard clamps so silhouettes never break
  const bodyCap = lowPower ? 3 : 7;
  const limbCap = lowPower ? 3 : 7;
  if (s.bx > bodyCap) s.bx = bodyCap; else if (s.bx < -bodyCap) s.bx = -bodyCap;
  if (s.by > bodyCap) s.by = bodyCap; else if (s.by < -bodyCap) s.by = -bodyCap;
  if (s.tilt > 0.22) s.tilt = 0.22; else if (s.tilt < -0.22) s.tilt = -0.22;
  if (s.squash < 0.8) s.squash = 0.8; else if (s.squash > 1.2) s.squash = 1.2;
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    if (L[o] > limbCap) L[o] = limbCap; else if (L[o] < -limbCap) L[o] = -limbCap;
    if (L[o + 1] > limbCap) L[o + 1] = limbCap; else if (L[o + 1] < -limbCap) L[o + 1] = -limbCap;
  }
}

// Apply spring offsets to the rigid pose. Feet keep almost none of the body
// offset when grounded so they don't visibly slide.
export function applyWobble(p: Pose, s: WobbleState, lowPower: boolean, grounded: boolean): Pose {
  const bx = s.bx, by = s.by;
  const upper = 1.0;
  const lower = grounded ? 0.32 : 0.55;
  // Feet take a hair of body offset on the ground for live secondary motion (still anti-slide)
  const footMul = grounded ? 0.08 : 0.5;
  const armScale = lowPower ? 0.6 : 1.0;
  const legScale = lowPower ? 0.3 : (grounded ? 0.35 : 0.6);
  const L = s.limb;
  const aLx = L[0] * armScale, aLy = L[1] * armScale;
  const aRx = L[4] * armScale, aRy = L[5] * armScale;
  const lLx = L[8] * legScale, lLy = L[9] * legScale;
  const lRx = L[12] * legScale, lRy = L[13] * legScale;

  // Squash/stretch — vertical scale around hips (1=normal). Compresses head & shoulders.
  const sq = s.squash;
  const yScale = sq;
  const sqDy = (1 - yScale); // positive = compressed (head moves down)

  return {
    headOffsetY: p.headOffsetY * yScale + by * upper * 0.8 + sqDy * 4,
    shoulderY: p.shoulderY * yScale + by * upper + sqDy * 2,
    hipY: p.hipY + by * lower,
    legL: [
      p.legL[0] + bx * lower, p.legL[1] + by * lower,
      p.legL[2] + bx * lower + lLx * 0.6, p.legL[3] + by * lower + lLy * 0.6,
      p.legL[4] + bx * lower * footMul + lLx * 0.3 * (grounded ? 0.2 : 1),
      p.legL[5] + by * lower * footMul + lLy * 0.3 * (grounded ? 0.2 : 1),
    ],
    legR: [
      p.legR[0] + bx * lower, p.legR[1] + by * lower,
      p.legR[2] + bx * lower + lRx * 0.6, p.legR[3] + by * lower + lRy * 0.6,
      p.legR[4] + bx * lower * footMul + lRx * 0.3 * (grounded ? 0.2 : 1),
      p.legR[5] + by * lower * footMul + lRy * 0.3 * (grounded ? 0.2 : 1),
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
    footL: [p.footL[0] + bx * lower * footMul + lLx * 0.3 * (grounded ? 0.2 : 1),
            p.footL[1] + by * lower * footMul + lLy * 0.3 * (grounded ? 0.2 : 1)],
    footR: [p.footR[0] + bx * lower * footMul + lRx * 0.3 * (grounded ? 0.2 : 1),
            p.footR[1] + by * lower * footMul + lRy * 0.3 * (grounded ? 0.2 : 1)],
    lean: p.lean + s.tilt,
    shoulderRoll: p.shoulderRoll + s.tilt * 0.3,
  };
}
