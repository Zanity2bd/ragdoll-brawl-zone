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
  rs.incomingImpactT = 0; rs.incomingImpactStrength = 0; rs.incomingImpactDir = 0;
  // breathPhase is free-running; do not reset to keep idles desynced.
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

  // Torso linear impulse (visual additive). Sharper, more violent acceleration.
  const impMag = 90 + 320 * p;
  const airborne = (flags & HR_AIRBORNE) !== 0;
  const launcher = (flags & HR_LAUNCHER) !== 0;
  rs.bodyVelX += dirX * impMag * 0.18;
  rs.bodyVelY += dirY * impMag * 0.13 - p * 26;

  // Torso angular impulse from r×F. Significantly stronger torque so the
  // shoulder leads visibly. Asymmetric multiplier from variantTwist breaks
  // mirror symmetry between similar hits.
  const twistBias = 1 + rs.variantTwist * 0.25; // 0.75 / 1.0 / 1.25
  const torque = (dirX * 0.55 - dirY * 0.05) * (9 + 16 * p) * twistBias;
  rs.torsoAV += torque;
  // Direct shoulder-roll bias via headLag opposite sign — sells the lead.
  // (handled below).

  // Propagation: torso → hips (delayed) → legs (more delayed). Bigger gap so
  // hips visibly drag behind torso. Hips also receive smaller magnitude so
  // spine bend reads.
  for (let i = 0; i < PROP_SLOTS; i++) {
    const o = i * PROP_STRIDE;
    if (rs.propRing[o] <= 0) {
      rs.propRing[o] = 0.045;          // hip delay (was 22ms → 45ms)
      rs.propRing[o + 1] = torque * 0.45; // less than torso → spine bend
      rs.propRing[o + 2] = 0;
      const ni = (i + 1) % PROP_SLOTS;
      const no = ni * PROP_STRIDE;
      if (rs.propRing[no] <= 0) {
        rs.propRing[no] = 0.075;        // legs further behind (was 34ms → 75ms)
        rs.propRing[no + 1] = 0;
        rs.propRing[no + 2] = torque * 0.55;
      }
      break;
    }
  }

  // Head lag — last to react (whiplash). Stronger + asymmetric.
  rs.headLagAV -= dirX * (3.2 + 4.8 * p) * twistBias;
  if (height > 0) rs.headLagAV -= 2.6 * p;

  // Per-limb angular kick + position kick. Asymmetric: lead side gets bigger
  // kick than trail; arms react before legs (handled by wider whip range).
  const sref2 = { s: rs.seed };
  for (let i = 0; i < LIMB_COUNT; i++) {
    const o = i * LIMB_STRIDE;
    const counter = (i & 1) ? -1 : 1;
    const whip = srand(sref2, 0.55, 1.55); // wider asymmetry
    const archBias = rs.variantArch * 0.22;
    // Arms (i<4) react bigger than legs (i>=4); legs delayed via propRing.
    const limbScale = i < 4 ? 1.4 : 0.7;
    // Lead-side amplification: limbs on the side the body is moving toward.
    const leadAmp = ((i & 2) ? 1 : -1) * dirX > 0 ? 1.35 : 0.75;
    rs.limb[o + 1] += (dirX * counter + archBias) * (5 + 8 * p) * whip * limbScale * leadAmp;
    rs.limb[o + 2] += dirX * (6 + 12 * p) * whip * 0.55 * limbScale;
    rs.limb[o + 3] += dirY * (4 + 9 * p) * whip * 0.45 * limbScale;
  }
  // Airborne: add off-axis spin & uneven rotation so bodies tumble, not float.
  if (airborne || launcher) {
    rs.torsoAV += (rs.variantTwist || 1) * (4 + 6 * p);
    rs.hipAV   -= (rs.variantTwist || 1) * (2 + 3 * p); // counter-rotate hips
    rs.headLagAV += (rs.variantArch || 1) * 1.5 * p;
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

  // Anticipation, if set, is consumed by the impact (release the brace).
  rs.incomingImpactT = 0;
  rs.incomingImpactStrength = 0;
  rs.incomingImpactDir = 0;
}

/**
 * Telegraph an upcoming heavy hit on `target`. Triggers a 1–2 frame inward
 * "brace" before impact lands. Visual-only; never freezes gameplay. Skip for
 * jabs / DOT / instant collisions — caller decides eligibility.
 *
 * @param leadTime  seconds until the hit lands (caller estimates).
 * @param strength  0..1 (matches the eventual hit power).
 * @param dir       sign of incoming hit direction.
 */
export function applyAnticipation(
  rs: RagdollState,
  leadTime: number,
  strength: number,
  dir: number,
): void {
  if (rs.state === "knockoutCollapse" || rs.state === "finalKO") return;
  const t = Math.max(0.016, Math.min(0.05, leadTime)); // 16-50ms cap
  rs.incomingImpactT = Math.max(rs.incomingImpactT, t);
  rs.incomingImpactStrength = Math.max(rs.incomingImpactStrength, Math.max(0, Math.min(1, strength)));
  rs.incomingImpactDir = dir < 0 ? -1 : 1;
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
  if (rs.incomingImpactT > 0) rs.incomingImpactT = Math.max(0, rs.incomingImpactT - dt);
  // Free-running breath phase (visual; not state-bound).
  rs.breathPhase += dt;

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
  // Reduced base stiffness so impulses ride longer (momentum carry).
  const kBody = 55 + 180 * tens;
  const dBody = 2 * Math.sqrt(kBody) * (0.42 + 0.5 * tens);
  const kHead = 38 + 140 * tens;
  const dHead = 2 * Math.sqrt(kHead) * (0.38 + 0.5 * tens);
  const kLimbAng = 28 + 130 * tens;
  const dLimbAng = 2 * Math.sqrt(kLimbAng) * (0.45 + 0.5 * tens);
  const kLimbPos = 70 + 200 * tens;
  const dLimbPos = 2 * Math.sqrt(kLimbPos) * (0.5 + 0.5 * tens);

  // Body friction (only meaningful when not airborne).
  const groundFriction = env.airborne ? 1 : Math.pow(0.55 + 0.4 * tens, h * 60);

  const limbN = env.lowPower ? 4 : LIMB_COUNT;
  const skipPosSpring = env.lowPower;

  for (let s = 0; s < substeps; s++) {
    // Torso angular spring → 0.
    rs.torsoAV += (-kBody * rs.torsoAng - dBody * rs.torsoAV) * h;
    rs.torsoAng += rs.torsoAV * h;
    // Hip follows torso loosely (factor 0.4 vs 0.7) and with weaker spring →
    // visible spine bend & delayed hip follow-through.
    const hipTarget = rs.torsoAng * 0.4;
    rs.hipAV += (-kBody * 0.55 * (rs.hipAng - hipTarget) - dBody * 0.7 * rs.hipAV) * h;
    rs.hipAng += rs.hipAV * h;
    rs.headLagAV += (-kHead * rs.headLagAng - dHead * rs.headLagAV) * h;
    rs.headLagAng += rs.headLagAV * h;

    rs.bodyVelX += (-kBody * 0.32 * rs.bodyOffX - dBody * 0.5 * rs.bodyVelX) * h;
    rs.bodyVelY += (-kBody * 0.32 * rs.bodyOffY - dBody * 0.5 * rs.bodyVelY) * h;
    if (env.airborne) rs.bodyVelY += 240 * h * (1 - tens * 0.5);
    rs.bodyOffX += rs.bodyVelX * h;
    rs.bodyOffY += rs.bodyVelY * h;
    rs.bodyVelX *= groundFriction;

    for (let i = 0; i < limbN; i++) {
      const o = i * LIMB_STRIDE;
      rs.limb[o + 1] += (-kLimbAng * rs.limb[o] - dLimbAng * rs.limb[o + 1]) * h;
      rs.limb[o] += rs.limb[o + 1] * h;
      if (!skipPosSpring) {
        rs.limb[o + 2] *= Math.pow(0.72, h * 60 * (0.4 + 0.6 * tens));
        rs.limb[o + 3] *= Math.pow(0.72, h * 60 * (0.4 + 0.6 * tens));
      }
    }
  }

  // Stability clamps (post-substep). Wider torso/hip diff cap → bigger spine bend.
  const diff = rs.torsoAng - rs.hipAng;
  if (diff > 0.95) rs.hipAng = rs.torsoAng - 0.95;
  else if (diff < -0.95) rs.hipAng = rs.torsoAng + 0.95;
  if (rs.torsoAV > 22) rs.torsoAV = 22; else if (rs.torsoAV < -22) rs.torsoAV = -22;
  if (rs.hipAV > 22) rs.hipAV = 22; else if (rs.hipAV < -22) rs.hipAV = -22;
  if (rs.headLagAng > 0.7) rs.headLagAng = 0.7; else if (rs.headLagAng < -0.7) rs.headLagAng = -0.7;
  if (rs.torsoAng > 1.4) rs.torsoAng = 1.4; else if (rs.torsoAng < -1.4) rs.torsoAng = -1.4;
  if (rs.hipAng > 1.2) rs.hipAng = 1.2; else if (rs.hipAng < -1.2) rs.hipAng = -1.2;
  if (rs.bodyOffX > 18) rs.bodyOffX = 18; else if (rs.bodyOffX < -18) rs.bodyOffX = -18;
  if (rs.bodyOffY > 18) rs.bodyOffY = 18; else if (rs.bodyOffY < -18) rs.bodyOffY = -18;
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
 * Visual-only. Respects poseHoldT (lerp pause), incomingImpactT (anticipatory
 * brace), recovery breathing, motion clarity bias, and time-scale (slow-mo
 * amplitude compression). Final pass applies an epsilon filter so micro-jitter
 * never reaches the renderer.
 *
 * @param timeScale  current sim time scale (1=normal, <1 slow-mo). Optional.
 */
export function applyRagdollPose(
  p: Pose,
  rs: RagdollState,
  lowPower: boolean,
  timeScale: number = 1,
): Pose {
  // Anti-jitter epsilon — drop sub-perceptible writes entirely when fully calm.
  const calm = rs.state === "none"
    && Math.abs(rs.torsoAng) < 0.005
    && Math.abs(rs.bodyOffX) < 0.05
    && Math.abs(rs.bodyOffY) < 0.05
    && Math.abs(rs.headLagAng) < 0.005
    && rs.incomingImpactT <= 0
    && rs.muscleTension > 0.9;
  if (calm) return p;

  // Slow-mo amplitude compression: when the world slows down, springs look
  // exaggerated unless we damp visible amplitude. Keep at least 60% so motion
  // never disappears entirely.
  const slowMoScale = Math.max(0.6, Math.min(1, 0.6 + 0.4 * timeScale));

  // poseHoldT briefly boosts additive write strength (visual brace).
  const holdScale = rs.poseHoldT > 0 ? 1.15 : 1;

  // Anticipatory impact compression: 1–2 frames inward brace before hit lands.
  // Compresses torso toward incoming direction; releases on impact.
  let antiX = 0, antiY = 0, antiTilt = 0;
  if (rs.incomingImpactT > 0 && rs.incomingImpactStrength > 0) {
    const a = Math.min(1, rs.incomingImpactT / 0.05) * rs.incomingImpactStrength;
    // Brace inward (opposite expected travel) → body coils.
    antiX = -rs.incomingImpactDir * 2.4 * a;
    antiY = -1.4 * a;
    antiTilt = -rs.incomingImpactDir * 0.05 * a;
  }

  // Recovery breathing: gentle chest rise during low-tension settle (KO).
  // Scales to 0 as tension recovers.
  let breathY = 0;
  const breathAmt = Math.max(0, 1 - rs.muscleTension) * (1 - Math.min(1, rs.recoveryT));
  if (breathAmt > 0.05) {
    breathY = Math.sin(rs.breathPhase * 2.4) * 0.8 * breathAmt;
  }

  const bx = (rs.bodyOffX + antiX) * holdScale * slowMoScale;
  const by = (rs.bodyOffY + antiY + breathY) * holdScale * slowMoScale;
  const tilt = (rs.torsoAng + antiTilt) * holdScale * slowMoScale;
  const hipTilt = rs.hipAng * holdScale * slowMoScale;
  const headExtra = rs.headLagAng * holdScale * slowMoScale * 4;

  // Spine flex / shoulder-hip counterbalance: when torso and hip diverge, add
  // a small shoulder-roll correction so silhouette reads as one fluid spine
  // rather than two stiff blocks.
  const spineFlex = (tilt - hipTilt) * 0.5;

  // Motion clarity bias: amplify the limb leading the motion direction,
  // damp the trailing one. Keeps silhouette readable in fast multi-hits.
  const lead = bx >= 0 ? 1 : -1;
  const leadBoost = 1.15;
  const trailDamp = 0.85;
  const armLBoost = lead < 0 ? leadBoost : trailDamp;
  const armRBoost = lead > 0 ? leadBoost : trailDamp;

  const L = rs.limb;
  const ls = lowPower ? 0.5 : 1;
  const lsArmL = ls * armLBoost;
  const lsArmR = ls * armRBoost;

  const aLx = L[0 * LIMB_STRIDE + 2] * lsArmL, aLy = L[0 * LIMB_STRIDE + 3] * lsArmL;
  const hLx = L[1 * LIMB_STRIDE + 2] * lsArmL, hLy = L[1 * LIMB_STRIDE + 3] * lsArmL;
  const aRx = L[2 * LIMB_STRIDE + 2] * lsArmR, aRy = L[2 * LIMB_STRIDE + 3] * lsArmR;
  const hRx = L[3 * LIMB_STRIDE + 2] * lsArmR, hRy = L[3 * LIMB_STRIDE + 3] * lsArmR;
  const lLx = L[4 * LIMB_STRIDE + 2] * ls, lLy = L[4 * LIMB_STRIDE + 3] * ls;
  const fLx = L[5 * LIMB_STRIDE + 2] * ls, fLy = L[5 * LIMB_STRIDE + 3] * ls;
  const lRx = L[6 * LIMB_STRIDE + 2] * ls, lRy = L[6 * LIMB_STRIDE + 3] * ls;
  const fRx = L[7 * LIMB_STRIDE + 2] * ls, fRy = L[7 * LIMB_STRIDE + 3] * ls;

  // Final epsilon filter on accumulated tiny offsets (anti-jitter polish).
  const e = (v: number) => (Math.abs(v) < 0.06 ? 0 : v);

  return {
    headOffsetY: p.headOffsetY + e(by * 0.6 + headExtra),
    shoulderY: p.shoulderY + e(by * 0.8),
    hipY: p.hipY + e(by * 0.4),
    legL: [
      p.legL[0] + e(bx * 0.4), p.legL[1] + e(by * 0.4),
      p.legL[2] + e(bx * 0.4 + lLx), p.legL[3] + e(by * 0.4 + lLy),
      p.legL[4] + e(fLx), p.legL[5] + e(fLy),
    ],
    legR: [
      p.legR[0] + e(bx * 0.4), p.legR[1] + e(by * 0.4),
      p.legR[2] + e(bx * 0.4 + lRx), p.legR[3] + e(by * 0.4 + lRy),
      p.legR[4] + e(fRx), p.legR[5] + e(fRy),
    ],
    armL: [
      p.armL[0] + e(bx * 0.8), p.armL[1] + e(by * 0.8),
      p.armL[2] + e(bx * 0.8 + aLx * 0.6), p.armL[3] + e(by * 0.8 + aLy * 0.6),
      p.armL[4] + e(bx * 0.8 + hLx), p.armL[5] + e(by * 0.8 + hLy),
    ],
    armR: [
      p.armR[0] + e(bx * 0.8), p.armR[1] + e(by * 0.8),
      p.armR[2] + e(bx * 0.8 + aRx * 0.6), p.armR[3] + e(by * 0.8 + aRy * 0.6),
      p.armR[4] + e(bx * 0.8 + hRx), p.armR[5] + e(by * 0.8 + hRy),
    ],
    handL: [p.handL[0] + e(bx * 0.8 + hLx), p.handL[1] + e(by * 0.8 + hLy)],
    handR: [p.handR[0] + e(bx * 0.8 + hRx), p.handR[1] + e(by * 0.8 + hRy)],
    footL: [p.footL[0] + e(fLx), p.footL[1] + e(fLy)],
    footR: [p.footR[0] + e(fRx), p.footR[1] + e(fRy)],
    lean: p.lean + e(tilt),
    shoulderRoll: p.shoulderRoll + e(spineFlex),
  };
}

