# Ragdoll + Hit-Reaction Overhaul — Merged Phased Plan

Render/physics-response polish only. Gameplay (hitboxes, damage, AI, timers, hitstop, movement physics) is untouched. All work is allocation-free, deterministic, dt-correct, mobile-first, and `lowPower`-aware.

## Files

- `src/game/ragdoll.ts` — NEW. State machine, `RagdollState`, `applyHitReaction`, `stepRagdoll`, `applyRagdollPose`. Allocation-free (`Float32Array` for limbs + ring buffers).
- `src/game/engine.ts` — replace existing knockback/ragdoll call sites and per-tick stepping with the new API. Add `incomingImpactT/Strength/Dir` setter on telegraphed attacks. No combat-balance edits.
- `src/game/animation.ts` — pose blend hook so ragdoll/reaction layer composes cleanly with the existing wobble + walk pipeline (priority gate).
- `src/game/wobble.ts` — keep as-is for idle/locomotion secondary motion. Ragdoll layer takes authority when `state !== none` and wobble is suppressed.
- `src/components/game/GameCanvas.tsx` — render reads `applyRagdollPose` output; supports cinematic pose-hold (visual-only freeze of pose write, NOT of `f.x/f.vx/timers`).

## Global Architecture Decisions

1. `**muscleTension: 0..1` is the master scalar.** Drives spring stiffness, damping ratio, stabilization, head lag, limb spread, secondary wobble amplitude, and recovery blend. Removes the per-state ζ table — each state sets a *target* tension + transition rate, not raw ζ values. KO = monotonic tension decay then re-rise during recovery.
2. **Cinematic pose preservation is visual-only.** A `poseHoldT` (20–40ms) freezes/interpolates only the pose buffer the renderer reads. `f.x`, `f.vx`, hitstun timers, AI, input — all continue normally.
3. **Anticipatory impact compression is telegraph-aware.** New per-fighter fields `incomingImpactT`, `incomingImpactStrength`, `incomingImpactDir` are written by the *attacker's* startup phase for telegraphed heavies/launchers/finishers only. Compression = 1–2 frames inward brace before release. Skipped for jabs, DOT, instant collisions.
4. **Propagation delays use preallocated ring buffers.** `Float32Array` per fighter, fixed size (8 slots @ ~4ms each → 32ms window). Torso → shoulders (12ms) → hips (22ms) → legs (32ms), head settles last via lag spring. Zero runtime allocation.

## Phase A — Core Foundation

Replace the rigid ragdoll with a stable premium base. Ship and verify before Phase B.

`**ragdoll.ts` exports**

- `RagdollState` — `state`, `muscleTension`, `targetTension`, `tensionRate`, `torsoAng/AV`, `hipAng/AV`, `headLagAng`, `limb: Float32Array(32)` (8 segments × 4: ang, angV, posOffX, posOffY), `bodyVelX/Y`, `recoveryT`, `immuneT`, `bounceCount`, `seed`, `variantTwist`, `variantArch`, `propRing: Float32Array(N*3)`, `poseHoldT`.
- `createRagdoll()`, `resetRagdoll(rs)`.
- `applyHitReaction(rs, dirX, dirY, dirZ, power, height, flags)` — primitives only; picks state, seeds variation, writes torso impulse + queues propagation, sets `targetTension`, optionally sets `poseHoldT`.
- `stepRagdoll(rs, dt, env)` — fixed substeps `ceil(dt/0.0167)`, capped 4 (2 in `lowPower`); integrates springs, drains ring buffer, handles airborne/ground/bounce/KO transitions, decays tension toward target.
- `applyRagdollPose(pose, rs, lowPower)` — composes onto baked pose; respects `poseHoldT` (lerp-pause writes).

**State machine** (9 states): `none`, `lightHit`, `heavyHit`, `launcher`, `airborneSpin`, `wallBounce`, `groundBounce`, `knockoutCollapse`, `finalKO`. Transitions driven by `power`, `dir`, `height`, vImpact, bounceCount.

**Procedural momentum propagation**

- Torso receives full linear impulse → `bodyVelX/Y` and AV from `rHit × impulse`.
- Hip AV scheduled via ring buffer (one slot ahead). Legs scheduled later. Head uses lag spring against torso.
- Per-limb seeded angular kick × counter-swing multiplier (deterministic via mulberry32 of `seed`).

**Spring-based limb physics**

- 8 segments, 1-DOF angular spring + 2-DOF positional offset spring driven by torso linear accel.
- `k` and `ζ` derived from `muscleTension`: `k = kMin + (kMax-kMin)*tension`, `ζ = 0.45 + 0.55*tension`.

**Airborne**: linear `g*dt`, angular damping `^dt`, spin decay ∝ residual energy.
**Ground impact**: `bounceCoef` from state, squash impulse, radial outward limb kick, head backward lag, `bounceCount++`.
**KO collapse**: `targetTension` ramps 0.45 → 1.0 over `recoveryT` (0.6–1.2s); 1–2 micro-bounces if `vImpact > 80`.

**Dynamic surface friction**: `groundFriction^dt` on `bodyVelX` while grounded ragdoll, scaled by tension.

**Deterministic variation**: per-hit `seed`, `variantTwist∈{-1,0,1}`, `variantArch∈{-1,0,1}`, per-limb whip ∈ [0.7,1.3].

**Stability clamps**: `|torsoAng-hipAng|≤0.5 rad`, `|AV|≤14 rad/s`, pos offset ≤12 px, head lag ≤0.4 rad, overlap scaling.

**LowPower**: 4 limbs, skip pos-offset springs, substeps capped 2, no propagation ring (direct apply).

**Recovery blending**: tension rising → spring stiffness rises → pose naturally settles toward locomotion baseline. No discrete state pop.

**Silhouette protection**: post-spring clamps; if torso vs hip silhouette collapses, push hip outward by 2px along facing.

**Engine integration** (`engine.ts`): replace ~5 knockback/ragdoll call sites (lines ~1871, 1920, 2046, 2445, 2566) with `applyHitReaction(...)`. Replace `if (f.ragdollT > 0) {...}` block with `stepRagdoll(f.rs, dt, env)`. Wobble layer is bypassed when `f.rs.state !== 'none'`.

**Phase A success criteria**

- No stiff/repeated poses; varied per hit.
- Believable weight; torso leads, limbs follow.
- Fluid airborne arcs; natural ground bounces.
- Stable in slow-mo and at 30 FPS throttle.
- No exploding limbs, no NaN, readable silhouettes on 393×583.
- `bunx tsc --noEmit` clean.

## Phase B — AAA Polish Layer

Only after Phase A is stable in playtest.

- Anticipatory impact compression (telegraph-aware, 1–2 frames).
- Cinematic pose preservation (`poseHoldT`, visual-only).
- Spine flex layer (extra DOF between torso and hip springs).
- Shoulder/hip counterbalance torque.
- Animation rhythm offsets (per-fighter phase seed).
- Dynamic recovery poses (state-aware get-up bias).
- Motion clarity bias (lead limb amplified, trail limb damped).
- Micro secondary motion (sub-pixel sway gated by tension).
- Energy conservation accounting across bounces.
- Perceptual motion cleanup (epsilon filter on tiny offsets).
- Slow-mo motion compression (reduced amplitude when timeScale<0.6).
- Contact pose holds (25–50ms, visual-only).
- Recovery breathing (chest rise during `finalKO` settle).

## Phase C — Final Cinematic Tuning

Polish-only, no new systems unless a gap is found.

- Direction-aware collapse (forward vs backward fall bias).
- Recovery intelligence (face-up/face-down resolution).
- Body-chain timing refinement (ring buffer slot tuning).
- Advanced motion filtering (low-pass on micro-jitter).
- Final tuning pass: damping curves, stiffness ranges, momentum transfer ratios, bounce coefficients, KO settle times, airborne looseness.  


## Auto-Scaling Safety Rule

Any subsystem that hurts gameplay readability, silhouette clarity, mobile FPS, or input responsiveness is scaled back automatically (gated by `lowPower`, FPS sample, or fighter-state). Premium feel > simulation complexity.

## Out of Scope

Hitboxes, damage, AI, balance, FX, camera shake, finisher cinematic flow, networking.

## Verification

- `bunx tsc --noEmit` after each phase.
- Manual: light jab, heavy launcher, aerial spin, wall bounce, repeated KO variation, slow-motion finisher, mobile viewport readability, low FPS throttle, rapid combo chains.  
  
Production Safety + Tuning Layer
  Add these final production-level constraints and tuning systems before implementation begins.
  1. Global Simulation Budget Guard
  Add a lightweight runtime budget monitor for ragdoll/update cost.
  If frame budget exceeds threshold:
  - reduce substeps
  - reduce limb spring iterations
  - reduce secondary wobble amplitude
  - reduce micro-motion updates
  - preserve:
    1. torso momentum
    2. silhouette readability
    3. major limb arcs
  Never sacrifice gameplay responsiveness or readability for simulation detail.
  2. Motion Priority Stack
  When multiple motion systems compete:  
  priority order is:
  1. gameplay readability
  2. torso/body line
  3. attack/reaction silhouette
  4. momentum continuity
  5. secondary wobble
  6. micro motion
  Lower-priority systems automatically damp/reduce themselves when conflict is detected.
  3. Anti-Jitter Stabilization
  Add final-pass stabilization:
  - epsilon filtering
  - low-pass smoothing
  - angular deadzones
  - micro-motion damping
  Especially for:
  - low FPS spikes
  - slow-motion
  - repeated wall bounces
  - rapid combo hits
  Goal:  
  motion should always feel intentional and premium,  
  never noisy or unstable.
  4. Visual Readability Bias
  At all times:
  - preserve clean action silhouettes
  - preserve readable body curves
  - avoid tangled limbs
  - avoid visual clutter during multi-hit combos
  When readability conflicts with realism:  
  readability always wins.
  5. Momentum Continuity Rules
  Momentum should never:
  - stop abruptly
  - reverse unnaturally
  - snap to zero
  All settling should:
  - decay naturally
  - transfer through body chains
  - preserve directional flow
  6. Recovery Readability Constraint
  Recovery transitions must:
  - remain readable on small mobile screens
  - clearly communicate:
    - grounded
    - stunned
    - recovering
    - KO
    - airborne
  Avoid overly subtle recovery states.
  7. Tunable Debug Controls
  Add optional debug toggles:
  - ragdoll springs
  - muscle tension visualization
  - propagation delay visualization
  - pose hold visualization
  - collision/bounce debug
  - lowPower simulation preview
  Developer-only.  
  No shipping UI.
  8. Final Design Rule
  The system should feel:
  - cinematic
  - heavy
  - fluid
  - reactive
  - expensive
  - controlled
  Never:
  - floppy
  - chaotic
  - over-simulated
  - jelly-like
  - noisy
  - difficult to read
  The goal is not “real physics.”
  The goal is:  
  high-end fighting-game motion quality with believable body weight and premium readability.