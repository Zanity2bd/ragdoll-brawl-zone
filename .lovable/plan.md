## Goal
Make the ground walk cycle in `src/game/animation.ts` (and a small tweak in `src/game/wobble.ts`) feel fluid, weighted, and human instead of robotic — without changing physics, hitboxes, or speed.

## Scope
- `src/game/animation.ts` — `legPose()` and the grounded branch of `computeWalkPose()`.
- `src/game/wobble.ts` — relax the grounded foot/leg damping just enough for live secondary motion.
- No engine, no skin, no asset, no input changes. Mobile-first: math-only, ~10 extra ops/frame, safe on low-end GPUs.

## Changes (priority order — ships in one pass)

### 1. Hip sway (weight transfer)
Pelvis shifts sideways toward the planted foot each step.
```text
hipSwayX = sin(phase) * 1.6 * amp     // ~1.6px at full run
hipX += hipSwayX
shoulderX (via lean already) opposes it slightly for counter-balance
```
Biggest single "feels alive" win.

### 2. Heel–toe foot roll
Foot pivots through the step instead of staying flat.
```text
footAngle = sin(phase) * 0.35 * amp   // toe-up on land, heel-up on push-off
```
Pass via a new optional `footAngleL/R` field on `Pose` (renderer already reads `footL/R`; we add angle and let `engine.ts` use it if present, fall back to 0).
*Implementation note:* if adding to `Pose` interface ripples too far, store as a tiny `(footX + facing*cos(angle), footY - sin(angle))` nudge on the foot point — visually equivalent at this scale, zero schema change. Default to the nudge approach.

### 3. Curved knee path
Replace linear knee midpoint with a forward sine bump during swing.
```text
kneeForward = facing * (3 + 5*lifted + 4*sin(phase)*lifted)
```
Eliminates pendulum look on the swinging leg.

### 4. Phase-delayed upper body
Head + shoulders lag the hip bob by ~80ms so the spine "follows."
```text
bobHip       = (1 - cos(phase*2)) * 0.9 * amp
bobShoulder  = (1 - cos(phase*2 - 0.5)) * 0.9 * amp     // ~80ms lag at walk cadence
bobHead      = (1 - cos(phase*2 - 0.9)) * 0.9 * amp
```

### 5. Stride blend in/out
Smooth `amp` instead of binary moving/idle snap. Add `walkAmp` state to the fighter (or derive from a `useRef`-style smoothed value already present — fall back to local lerp inside `computeWalkPose` using a passed-in `prevAmp` if needed).
```text
ampTarget = clamp(speed/160, 0, 1)
amp       = lerp(prevAmp, ampTarget, 1 - exp(-dt*9))     // ~110ms ease
```
*If threading `dt` is awkward,* approximate with `amp = ampTarget*0.85 + prevAmp*0.15` per frame — same effect, no signature change.

### 6. Asymmetric per-leg signature + micro jitter
Per-fighter constants (seeded by fighter id once) so each character walks slightly differently.
```text
strideBiasL = 1.00,  strideBiasR = 1.04
liftBiasL   = 1.03,  liftBiasR   = 1.00
phaseJitter = sin(phase*0.31) * 0.04 * amp     // ±4% rhythm wobble
```
Breaks the perfect-mirror loop.

### 7. Speed-shaped gait
Already have `amp`; curve more params off it non-linearly so a sprint reads as a sprint.
```text
lean        = facing * min(0.22, speed/1300)           // up from /1700
lift        = 16*amp + 8*amp²                          // higher knees at speed
armSwingMax = 14*amp + 10*amp²                          // more pump at speed
contactT    = 0.55 - 0.15*amp                          // shorter ground contact
```
Use `liftCurve = max(0, sin(phase))^(1 - 0.4*amp)` to sharpen lift at high speed.

### 8. Asymmetric arm bend
Elbow bends more on the back-swing than the forward-swing.
```text
backSwing   = max(0, -swingHand)        // 0..1 when arm goes back
elbowYL    += backSwing * 4 * amp
elbowXL    += -facing * backSwing * 3 * amp
```

### 9. Loosen grounded wobble (tiny)
In `src/game/wobble.ts` `applyWobble`, raise the grounded foot offset multiplier from `0` → `0.08` and the grounded leg `lower` from `0.25` → `0.32`. Just enough for the torso jiggle to read while walking; still anti-slide.

### 10. Heel-strike micro-dip
A 1-pixel hip drop on each foot plant for weight.
```text
hipY += max(0, -cos(phase*2)) * 1.0 * amp
```
Already partly there via `bob`; this just biases the dip to the contact half of the cycle.

## Out of scope
- Jump/airborne pose (separate branch, untouched).
- Attack overrides (lines 159-200) — they read the new walk pose unchanged.
- Wobble stiffness profiles, ragdoll, hit reactions.
- Any renderer changes in `engine.ts` beyond what's already drawn.

## Performance budget
~12 extra `sin`/`cos` and ~8 multiplies per fighter per frame. At 2 fighters × 60fps = ~2.4k extra ops/sec. Negligible on the 393×583 mobile target.

## Risk / rollback
All changes are local to two files and purely additive math on existing pose outputs. If a tweak feels off, each numbered item can be reverted independently.

## Acceptance check
- Idle → walk → run → stop reads as one continuous motion (no snap).
- Each character has a visibly distinct gait signature.
- Hips sway side-to-side with planted foot; head bob lags hip bob.
- Foot visibly rolls through the step at normal speed.
- No foot-sliding, no clipping, frame rate unchanged on mobile preview.
