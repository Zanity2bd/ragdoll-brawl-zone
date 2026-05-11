// OgunArena — Ragdoll + Hit-Reaction System (Phase A foundation).
//
// Visual/physics-response polish layer. Allocation-free, deterministic,
// dt-correct, mobile-first. Composes ON TOP of the legacy ragdoll/wobble
// pipeline as additive secondary motion driven by a single muscleTension
// scalar. Gameplay (hitboxes, damage, AI, timers) is untouched.
//
// Architecture notes:
// - State machine picks a target muscleTension + spring profile per hit.
// - Tension drives stiffness, damping ratio, head lag, limb spread,
//   recovery blend. KO collapse = monotonic decay; recovery = re-rise.
// - Propagation delays use a preallocated Float32Array ring buffer.
// - Cinematic pose preservation = poseHoldT (visual lerp pause; never
//   freezes gameplay state — owner code is responsible for ignoring this
//   field for any non-render purpose).

import type { Pose } from "./animation";

export type RagdollStateName =
  | "none"
  | "lightHit"
  | "heavyHit"
  | "launcher"
  | "airborneSpin"
  | "wallBounce"
  | "groundBounce"
  | "knockoutCollapse"
  | "finalKO";

// 8 limb segments × 4 floats: [angle, angVel, posOffX, posOffY]
const LIMB_COUNT = 8;
const LIMB_STRIDE = 4;
// Propagation ring: 8 slots × 3 floats: [tRemaining, hipAVDelta, legAVDelta]
const PROP_SLOTS = 8;
const PROP_STRIDE = 3;

export interface RagdollState {
  state: RagdollStateName;
  // Master scalar 0..1. 1 = fully tensed (alive, locomotion). 0 = fully limp.
  muscleTension: number;
  targetTension: number;
  tensionRate: number; // 1/seconds toward target

  // Body angles relative to the renderer's torso baseline (additive).
  torsoAng: number;
  torsoAV: number;
  hipAng: number;
  hipAV: number;
  headLagAng: number;
  headLagAV: number;

  // Per-limb state (allocation-free).
  limb: Float32Array;

  // Body translational offset accumulator (visual only, additive on top of
  // engine's f.x/f.vx). Decays via tension.
  bodyOffX: number;
  bodyOffY: number;
  bodyVelX: number;
  bodyVelY: number;

  recoveryT: number;
  immuneT: number;
  bounceCount: number;

  // Deterministic per-hit variation.
  seed: number;
  variantTwist: number;  // -1, 0, +1
  variantArch: number;   // -1, 0, +1

  // Propagation ring buffer (torso → shoulders → hips → legs delays).
  propRing: Float32Array;

  // Cinematic visual pose hold (seconds remaining). Renderer interpolates
  // toward the held pose for this duration. Does NOT pause gameplay.
  poseHoldT: number;

  // Anticipatory impact compression (Phase B). Set by attacker telegraph.
  // 1-2 frames inward brace before the hit lands. Visual-only.
  incomingImpactT: number;
  incomingImpactStrength: number;
  incomingImpactDir: number; // -1..1 (sign + small magnitude)

  // Recovery breathing phase (Phase B). Free-running counter for chest rise
  // during low-tension settle.
  breathPhase: number;
}

export function createRagdoll(): RagdollState {
  return {
    state: "none",
    muscleTension: 1,
    targetTension: 1,
    tensionRate: 6,
    torsoAng: 0, torsoAV: 0,
    hipAng: 0, hipAV: 0,
    headLagAng: 0, headLagAV: 0,
    limb: new Float32Array(LIMB_COUNT * LIMB_STRIDE),
    bodyOffX: 0, bodyOffY: 0, bodyVelX: 0, bodyVelY: 0,
    recoveryT: 0, immuneT: 0, bounceCount: 0,
    seed: 1, variantTwist: 0, variantArch: 0,
    propRing: new Float32Array(PROP_SLOTS * PROP_STRIDE),
    poseHoldT: 0,
    incomingImpactT: 0, incomingImpactStrength: 0, incomingImpactDir: 0,
    breathPhase: 0,
  };
}

export function resetRagdoll(rs: RagdollState): void {
  rs.state = "none";
  rs.muscleTension = 1; rs.targetTension = 1; rs.tensionRate = 6;
  rs.torsoAng = rs.torsoAV = 0;
  rs.hipAng = rs.hipAV = 0;
  rs.headLagAng = rs.headLagAV = 0;
  rs.limb.fill(0);
  rs.bodyOffX = rs.bodyOffY = rs.bodyVelX = rs.bodyVelY = 0;
  rs.recoveryT = 0; rs.immuneT = 0; rs.bounceCount = 0;
  rs.seed = 1; rs.variantTwist = 0; rs.variantArch = 0;
  rs.propRing.fill(0);
  rs.poseHoldT = 0;
}

// Deterministic seeded PRNG (mulberry32). Stateless: caller passes & receives.
function rand01(seedRef: { s: number }): number {
  let t = (seedRef.s = (seedRef.s + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function srand(seedRef: { s: number }, lo: number, hi: number): number {
  return lo + (hi - lo) * rand01(seedRef);
}

// Hit reaction flags (bitfield).
export const HR_TELEGRAPHED = 1 << 0;
export const HR_AIRBORNE   = 1 << 1;
export const HR_LAUNCHER   = 1 << 2;
export const HR_FINISHER   = 1 << 3;
export const HR_GROUNDED   = 1 << 4;

/**
 * Apply a hit reaction. Pure mutation, allocation-free.
 *
 * @param dirX/dirY  Unit-ish hit direction (target's outgoing velocity dir).
 * @param power      0..1 normalised hit power.
 * @param height     -1 (low/sweep) | 0 (mid) | +1 (overhead/upcup).
 * @param flags      HR_* bitfield.
 */
export function applyHitReaction(
  rs: RagdollState,
  dirX: number, dirY: number,
  power: number,
  height: number,
  flags: number,
): void {
  if (rs.immuneT > 0 && power < 0.6) return; // weak hits respect immunity
  const p = Math.max(0, Math.min(1, power));

  // Pick state.
  let state: RagdollStateName;
  if (flags & HR_FINISHER)            state = "finalKO";
  else if (flags & HR_LAUNCHER)       state = "launcher";
  else if (flags & HR_AIRBORNE)       state = "airborneSpin";
  else if (p >= 0.85)                 state = "knockoutCollapse";
  else if (p >= 0.55)                 state = "heavyHit";
  else                                state = "lightHit";
  rs.state = state;

  // Seed variation.
  rs.seed = (rs.seed * 1664525 + 1013904223 + ((p * 1e6) | 0)) | 0;
  const sref = { s: rs.seed };
  rs.variantTwist = (rand01(sref) * 3) | 0; rs.variantTwist -= 1; // -1|0|1
  rs.variantArch  = (rand01(sref) * 3) | 0; rs.variantArch  -= 1;
  rs.seed = sref.s;

  // Target tension by state.
  switch (state as RagdollStateName) {
    case "lightHit":          rs.targetTension = 0.78; rs.tensionRate = 5.5; break;
    case "heavyHit":          rs.targetTension = 0.55; rs.tensionRate = 3.8; break;
    case "launcher":          rs.targetTension = 0.42; rs.tensionRate = 2.6; break;
    case "airborneSpin":      rs.targetTension = 0.38; rs.tensionRate = 2.0; break;
    case "wallBounce":        rs.targetTension = 0.45; rs.tensionRate = 3.0; break;
    case "groundBounce":      rs.targetTension = 0.40; rs.tensionRate = 2.4; break;
    case "knockoutCollapse":  rs.targetTension = 0.18; rs.tensionRate = 1.4; break;
    case "finalKO":           rs.targetTension = 0.05; rs.tensionRate = 0.9; break;
    default:                  rs.targetTension = 1.0;  rs.tensionRate = 6.0; break;
  }
  // Snap tension partially down at moment of impact (sudden go-limp).
  rs.muscleTension = Math.min(rs.muscleTension, rs.targetTension * 0.5 + 0.3);

  // Torso linear impulse (visual additive).
  const impMag = 60 + 220 * p;
  rs.bodyVelX += dirX * impMag * 0.12;
  rs.bodyVelY += dirY * impMag * 0.10 - p * 18;

  // Torso angular impulse from r×F (rHit ≈ chest height ≈ -0.4, vertical).
  const torque = (dirX * 0.4 - dirY * 0.05) * (5 + 8 * p);
  rs.torsoAV += torque;

  // Schedule hip/leg propagation — torso first, hips ~22ms, legs ~32ms.
  // Find empty slot.
  for (let i = 0; i < PROP_SLOTS; i++) {
    const o = i * PROP_STRIDE;
    if (rs.propRing[o] <= 0) {
      rs.propRing[o] = 0.022;          // hip delay
      rs.propRing[o + 1] = torque * 0.65;
      rs.propRing[o + 2] = 0;
      // legs in next slot if present
      const ni = (i + 1) % PROP_SLOTS;
      const no = ni * PROP_STRIDE;
      if (rs.propRing[no] <= 0) {
        rs.propRing[no] = 0.034;
        rs.propRing[no + 1] = 0;
        rs.propRing[no + 2] = torque * 0.35;
      }
      break;
    }
  }

  // Head lag — opposite to body movement (whiplash).
  rs.headLagAV -= dirX * (1.8 + 2.6 * p);
  if (height > 0) rs.headLagAV -= 1.5 * p; // upcup: bigger backward snap

  // Per-limb angular kick + position kick. Counter-swing multiplier.
  const sref2 = { s: rs.seed };
  for (let i = 0; i < LIMB_COUNT; i++) {
    const o = i * LIMB_STRIDE;
    const counter = (i & 1) ? -1 : 1;
    const whip = srand(sref2, 0.7, 1.3);
    const archBias = rs.variantArch * 0.15;
    rs.limb[o + 1] += (dirX * counter + archBias) * (3.5 + 5 * p) * whip;
    rs.limb[o + 2] += dirX * (4 + 8 * p) * whip * 0.4;
    rs.limb[o + 3] += dirY * (3 + 6 * p) * whip * 0.3;
  }
  rs.seed = sref2.s;

  // Anti-chain immunity scaled by power.
  rs.immuneT = Math.max(rs.immuneT, 0.18 + 0.4 * p);

  // Cinematic pose hold for telegraphed heavies/launchers/finishers only.
  if ((flags & (HR_TELEGRAPHED | HR_LAUNCHER | HR_FINISHER)) && p >= 0.55) {
    rs.poseHoldT = Math.max(rs.poseHoldT, 0.025 + 0.018 * p); // 25-43ms
  }

  // Recovery target time for KO collapse states.
  if (state === "knockoutCollapse" || state === "finalKO") {
    rs.recoveryT = 0.6 + 0.6 * p;
  }
}

/**
 * Step the ragdoll one tick. Fixed substeps for stability.
 * @param env.airborne   true if fighter is airborne (engine-owned).
 * @param env.lowPower   reduces substeps/limbs.
 */
export function stepRagdoll(
  rs: RagdollState,
  dt: number,
  env: { airborne: boolean; lowPower: boolean; budgetTight?: boolean },
): void {
  if (dt <= 0) return;
  // Always tick immunity + pose hold even when in 'none' so they expire.
  if (rs.immuneT > 0)  rs.immuneT  = Math.max(0, rs.immuneT - dt);
  if (rs.poseHoldT > 0) rs.poseHoldT = Math.max(0, rs.poseHoldT - dt);

  // Tension always relaxes toward target.
  const tDelta = rs.targetTension - rs.muscleTension;
  rs.muscleTension += tDelta * Math.min(1, rs.tensionRate * dt);

  // Drain propagation ring (regardless of state — slots are time-bound).
  for (let i = 0; i < PROP_SLOTS; i++) {
    const o = i * PROP_STRIDE;
    if (rs.propRing[o] > 0) {
      rs.propRing[o] -= dt;
      if (rs.propRing[o] <= 0) {
        rs.hipAV += rs.propRing[o + 1];
        // legs: scatter to lower 4 limbs
        const legImp = rs.propRing[o + 2];
        if (legImp !== 0) {
          for (let li = 4; li < LIMB_COUNT; li++) {
            const lo = li * LIMB_STRIDE;
            rs.limb[lo + 1] += legImp * 0.25 * ((li & 1) ? -1 : 1);
          }
        }
        rs.propRing[o] = 0;
        rs.propRing[o + 1] = 0;
        rs.propRing[o + 2] = 0;
      }
    }
  }

  if (rs.state === "none" && Math.abs(rs.torsoAV) < 0.05 && Math.abs(rs.bodyVelX) < 0.5
      && Math.abs(rs.torsoAng) < 0.005 && Math.abs(rs.bodyOffX) < 0.05) {
    // Fully settled — early out.
    return;
  }

  // Substeps: cap aggressively on lowPower / tight budget.
  const maxSub = env.lowPower || env.budgetTight ? 2 : 4;
  const substeps = Math.max(1, Math.min(maxSub, Math.ceil(dt / 0.0167)));
  const h = dt / substeps;

  // Tension-derived spring constants.
  const tens = rs.muscleTension;
  // Critically damped baseline; lower tension = looser & more whippy.
  const kBody = 80 + 220 * tens;
  const dBody = 2 * Math.sqrt(kBody) * (0.55 + 0.45 * tens);
  const kHead = 60 + 180 * tens;
  const dHead = 2 * Math.sqrt(kHead) * (0.5 + 0.5 * tens);
  const kLimbAng = 40 + 160 * tens;
  const dLimbAng = 2 * Math.sqrt(kLimbAng) * (0.55 + 0.45 * tens);
  const kLimbPos = 90 + 220 * tens;
  const dLimbPos = 2 * Math.sqrt(kLimbPos) * (0.55 + 0.45 * tens);

  // Body friction (only meaningful when not airborne).
  const groundFriction = env.airborne ? 1 : Math.pow(0.55 + 0.4 * tens, h * 60);

  const limbN = env.lowPower ? 4 : LIMB_COUNT;
  const skipPosSpring = env.lowPower;

  for (let s = 0; s < substeps; s++) {
    // Torso angular spring → 0.
    rs.torsoAV += (-kBody * rs.torsoAng - dBody * rs.torsoAV) * h;
    rs.torsoAng += rs.torsoAV * h;
    // Hip angular spring → torso (so chain doesn't drift independently).
    const hipTarget = rs.torsoAng * 0.7;
    rs.hipAV += (-kBody * (rs.hipAng - hipTarget) - dBody * rs.hipAV) * h;
    rs.hipAng += rs.hipAV * h;
    // Head lag → 0 (lag spring; lower tension = bigger overshoot).
    rs.headLagAV += (-kHead * rs.headLagAng - dHead * rs.headLagAV) * h;
    rs.headLagAng += rs.headLagAV * h;

    // Body offset spring → 0.
    rs.bodyVelX += (-kBody * 0.4 * rs.bodyOffX - dBody * 0.6 * rs.bodyVelX) * h;
    rs.bodyVelY += (-kBody * 0.4 * rs.bodyOffY - dBody * 0.6 * rs.bodyVelY) * h;
    if (env.airborne) rs.bodyVelY += 200 * h * (1 - tens * 0.5); // mild gravity bias when limp airborne
    rs.bodyOffX += rs.bodyVelX * h;
    rs.bodyOffY += rs.bodyVelY * h;
    rs.bodyVelX *= groundFriction;

    // Limb integration.
    for (let i = 0; i < limbN; i++) {
      const o = i * LIMB_STRIDE;
      // Angular spring → 0 (rest pose).
      rs.limb[o + 1] += (-kLimbAng * rs.limb[o] - dLimbAng * rs.limb[o + 1]) * h;
      rs.limb[o] += rs.limb[o + 1] * h;
      if (!skipPosSpring) {
        // Pos offset springs (X = limb[o+2], we reuse limb[o+1] for both
        // angVel and posVelX/Y by storing posVel implicitly via decay — to
        // stay allocation-free without growing the array we use a simple
        // exponential pull on offsets here).
        rs.limb[o + 2] *= Math.pow(0.6, h * 60 * (0.5 + 0.5 * tens));
        rs.limb[o + 3] *= Math.pow(0.6, h * 60 * (0.5 + 0.5 * tens));
      }
    }
  }

  // Stability clamps (post-substep).
  // Torso/hip silhouette.
  const diff = rs.torsoAng - rs.hipAng;
  if (diff > 0.5) rs.hipAng = rs.torsoAng - 0.5;
  else if (diff < -0.5) rs.hipAng = rs.torsoAng + 0.5;
  if (rs.torsoAV > 14) rs.torsoAV = 14; else if (rs.torsoAV < -14) rs.torsoAV = -14;
  if (rs.hipAV > 14) rs.hipAV = 14; else if (rs.hipAV < -14) rs.hipAV = -14;
  if (rs.headLagAng > 0.4) rs.headLagAng = 0.4; else if (rs.headLagAng < -0.4) rs.headLagAng = -0.4;
  if (rs.bodyOffX > 12) rs.bodyOffX = 12; else if (rs.bodyOffX < -12) rs.bodyOffX = -12;
  if (rs.bodyOffY > 12) rs.bodyOffY = 12; else if (rs.bodyOffY < -12) rs.bodyOffY = -12;
  for (let i = 0; i < LIMB_COUNT; i++) {
    const o = i * LIMB_STRIDE;
    if (rs.limb[o] > 1.2) rs.limb[o] = 1.2; else if (rs.limb[o] < -1.2) rs.limb[o] = -1.2;
    if (rs.limb[o + 2] > 12) rs.limb[o + 2] = 12; else if (rs.limb[o + 2] < -12) rs.limb[o + 2] = -12;
    if (rs.limb[o + 3] > 12) rs.limb[o + 3] = 12; else if (rs.limb[o + 3] < -12) rs.limb[o + 3] = -12;
  }

  // Recovery decay & state release.
  if (rs.recoveryT > 0) {
    rs.recoveryT = Math.max(0, rs.recoveryT - dt);
    if (rs.recoveryT === 0) {
      rs.targetTension = 1;
      rs.tensionRate = 4;
    }
  }
  // Auto-release when motion has effectively settled and tension is high.
  if (rs.state !== "none"
      && rs.muscleTension > 0.85
      && Math.abs(rs.torsoAng) < 0.04
      && Math.abs(rs.torsoAV) < 0.4
      && Math.abs(rs.bodyOffX) < 0.6
      && Math.abs(rs.bodyOffY) < 0.6) {
    rs.state = "none";
  }
}

/**
 * Compose ragdoll spring offsets onto the rendered pose.
 * Visual-only. Respects poseHoldT (lerp pause).
 */
export function applyRagdollPose(p: Pose, rs: RagdollState, lowPower: boolean): Pose {
  if (rs.state === "none" && Math.abs(rs.torsoAng) < 0.005 && Math.abs(rs.bodyOffX) < 0.05
      && Math.abs(rs.headLagAng) < 0.005) {
    return p;
  }
  // poseHoldT scales additive write strength up briefly (visual brace), then
  // releases. This communicates impact without a real freeze.
  const holdScale = rs.poseHoldT > 0 ? 1.15 : 1;

  const bx = rs.bodyOffX * holdScale;
  const by = rs.bodyOffY * holdScale;
  const tilt = rs.torsoAng * holdScale;
  const hipTilt = rs.hipAng * holdScale;
  const headExtra = rs.headLagAng * holdScale * 4; // ~px head sway
  const L = rs.limb;
  // Limb scale weakens in lowPower.
  const ls = lowPower ? 0.5 : 1;

  // Map limb segments: 0=armL upper, 1=armL hand, 2=armR upper, 3=armR hand,
  // 4=legL upper, 5=legL foot, 6=legR upper, 7=legR foot. Use offsets only.
  const aLx = L[0 * LIMB_STRIDE + 2] * ls, aLy = L[0 * LIMB_STRIDE + 3] * ls;
  const hLx = L[1 * LIMB_STRIDE + 2] * ls, hLy = L[1 * LIMB_STRIDE + 3] * ls;
  const aRx = L[2 * LIMB_STRIDE + 2] * ls, aRy = L[2 * LIMB_STRIDE + 3] * ls;
  const hRx = L[3 * LIMB_STRIDE + 2] * ls, hRy = L[3 * LIMB_STRIDE + 3] * ls;
  const lLx = L[4 * LIMB_STRIDE + 2] * ls, lLy = L[4 * LIMB_STRIDE + 3] * ls;
  const fLx = L[5 * LIMB_STRIDE + 2] * ls, fLy = L[5 * LIMB_STRIDE + 3] * ls;
  const lRx = L[6 * LIMB_STRIDE + 2] * ls, lRy = L[6 * LIMB_STRIDE + 3] * ls;
  const fRx = L[7 * LIMB_STRIDE + 2] * ls, fRy = L[7 * LIMB_STRIDE + 3] * ls;

  return {
    headOffsetY: p.headOffsetY + by * 0.6 + headExtra,
    shoulderY: p.shoulderY + by * 0.8,
    hipY: p.hipY + by * 0.4,
    legL: [
      p.legL[0] + bx * 0.4, p.legL[1] + by * 0.4,
      p.legL[2] + bx * 0.4 + lLx, p.legL[3] + by * 0.4 + lLy,
      p.legL[4] + fLx, p.legL[5] + fLy,
    ],
    legR: [
      p.legR[0] + bx * 0.4, p.legR[1] + by * 0.4,
      p.legR[2] + bx * 0.4 + lRx, p.legR[3] + by * 0.4 + lRy,
      p.legR[4] + fRx, p.legR[5] + fRy,
    ],
    armL: [
      p.armL[0] + bx * 0.8, p.armL[1] + by * 0.8,
      p.armL[2] + bx * 0.8 + aLx * 0.6, p.armL[3] + by * 0.8 + aLy * 0.6,
      p.armL[4] + bx * 0.8 + hLx, p.armL[5] + by * 0.8 + hLy,
    ],
    armR: [
      p.armR[0] + bx * 0.8, p.armR[1] + by * 0.8,
      p.armR[2] + bx * 0.8 + aRx * 0.6, p.armR[3] + by * 0.8 + aRy * 0.6,
      p.armR[4] + bx * 0.8 + hRx, p.armR[5] + by * 0.8 + hRy,
    ],
    handL: [p.handL[0] + bx * 0.8 + hLx, p.handL[1] + by * 0.8 + hLy],
    handR: [p.handR[0] + bx * 0.8 + hRx, p.handR[1] + by * 0.8 + hRy],
    footL: [p.footL[0] + fLx, p.footL[1] + fLy],
    footR: [p.footR[0] + fRx, p.footR[1] + fRy],
    lean: p.lean + tilt,
    shoulderRoll: p.shoulderRoll + (tilt - hipTilt) * 0.5,
  };
}
