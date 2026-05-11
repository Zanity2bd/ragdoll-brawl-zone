# Facing + Animation System Overhaul — AAA Polish Pass\n\nRender/animation-only. No gameplay, hitbox, balance, AI, or combat-timing changes. Mobile-safe (Canvas2D, allocation-free, deterministic). Honors `lowPower`.\n\n**Files**\n- `src/game/engine.ts` — facing intent controller, spring/foot-plant/jump-phase fighter state, state hierarchy gate, low-FPS substep guard.\n- `src/game/animation.ts` — `springStep` helper, retreat branch, jump-phase blends, IK leg solve, arc/elbow recompute, silhouette clamps, yaw-squash hook.\n- `src/components/game/GameCanvas.tsx` — apply `facingSquash` horizontal scale during turn render only.\n\nNo new assets.\n\n---\n\n## 1. Intelligent Facing Controller (`engine.ts`)\n\nReplace the direct flip at lines 1693–1697 with an intent system.\n\n**New per-fighter state** (init in spawn + round reset):\n`facingTarget`, `facingVisual`, `facingVelocity`, `facingLockT`, `facingPersistT`, `facingReleaseT`, `lastStableFacing`, `facingSquash` (0..1, render-only).\n\n**Per-tick logic** (when `canFlip` allows):\n1. `dx = opp.x - self.x`; `desired = dx >= 0 ? 1 : -1`.\n2. **Deadzone**: skip if `|dx| < 28`.\n3. **Persistence threshold** (seconds opponent must remain on opposite side):\n   - grounded `0.12`, airborne `0.20`, retreating `0.28`, predicted dash crossover `0.32`.\n   - Increment `facingPersistT` while `desired !== facing`, reset on flip.\n4. **Retreat guard**: `retreating = sign(vx) === -facing && |vx| > 80`. Skip flip while retreating AND `|dx| < 90`.\n5. **Attack lock**: on attack/combo/jump-startup, `facingLockT = max(facingLockT, 0.18..0.25)`. While `>0`, no changes.\n6. **Predictive crossover**: if `|opp.vx| > 380` and `(opp.x + opp.vx*0.05)` crosses self.x, hold for `0.32s`.\n7. On commit: `facingTarget = desired`, `facingPersistT = 0`, `lastStableFacing = facingTarget`, set `facingSquash = 1` (decays).\n\n**Visual interp** — replace existing `facingT` lerp with critically-damped spring (k=140, d≈2√k):\n`\nfacingVelocity += ((facingTarget - facingVisual)*k - facingVelocity*d) * dt\nfacingVisual   += facingVelocity * dt\n`\n`facing` (gameplay 1|-1) is updated alongside `facingTarget` so combat code is unchanged. `facingT` (existing render reader) is replaced by `facingVisual`.\n\n**Yaw squash**: while `|facingVisual - facingTarget| > 0.05`, write a 0..1 amount into `facingSquash`. Decays with `facingSquash -= dt * 4`.\n\n## 2. Locomotion Layering (`animation.ts`)\n\nIn the grounded walk branch, add on top of the baked walk-cycle sample:\n- **Torso counter-rotation** opposite hipSway (`shoulderRoll -= hipSwayX * 0.04`).\n- **Momentum lean**: blend current lean toward `sign(ax) * clamp(|vx|/420, 0, 0.18)` where `ax` is delta-vx (engine writes per-tick into a fighter `lastVx`).\n- **Stride extension**: scale baked foot X amplitude by `1 + 0.15 * (|vx|/maxRunVx)`.\n- **Arm drag**: handled by springs in §4 — targets stay baked; springs lag.\n- **Plant stabilization**: handled by §3.\n\n## 3. Strict Foot Planting + IK Leg Solve\n\n**Engine state** per fighter: `plantL`, `plantR` each `{ active: bool, worldX: number, worldY: number, holdT: number, releaseStrideT: number }`.\n\n**Plant rule**: when the baked cycle's foot Y reaches ground contact (cycle-phase based, already implicit in current `legPose`), set `active=true`, snapshot world position. Release when:\n- swing phase begins (cycle phase advances past contact arc), OR\n- horizontal stride from plant exceeds `strideMax` (≈ 18px), OR\n- jump/airborne/attack/ragdoll state activates.\n\n**Drift clamp**: while planted, force foot world X within `±3px` of `worldX`.\n\n**IK solve** in `animation.ts` (new `solveLeg(hip, foot, segLen, bend) → knee`):\n- Two-link analytic IK using law of cosines.\n- `segLen` = upper = lower = `(H - hipY) * 0.55` (matches current rig proportions).\n- Knee bend direction = `facing` (forward bend).\n- Clamp foot distance to `< 2*segLen - 1` to avoid singularity.\n\nReplace the baked foot/knee writes with: foot = (planted ? plantPos : baked); knee = `solveLeg(...)`. Hip stays baked.\n\n## 4. Spring-Damped Secondary Motion\n\n**Per-fighter spring states** (engine-owned, allocation-free, all `{ pos, vel }`):\n- `sLean`, `sShoulderRoll`, `sHead` (scalars).\n- `sHandL`, `sHandR`, `sFootL`, `sFootR`, `sElbowL`, `sElbowR`, `sKneeL`, `sKneeR` (2D).\n\n**Helper** in `animation.ts`:\n`\nspringStep(s, target, dt, k, d) {\n  s.vel += ((target - s.pos) * k - s.vel * d) * dt\n  s.pos += s.vel * dt\n}\n`\n\n**Tuning** (critically damped, d ≈ 2√k):\n- Hands k=180, d=27 (loose). Airborne d=14 (float).\n- Feet k=260, d=32 (tight). Disabled while planted.\n- Lean / shoulder roll k=120, d=22.\n- Head k=200, d=28.\n\n**Apply** as a post-process on the `Pose` returned by `computeWalkPose`, before the renderer reads it. Engine threads spring state in via a new optional `springs` arg or applies post-call.\n\n**Safety clamps** (after spring step, before write-back):\n- hand offset from baked target ≤ 10px\n- foot offset ≤ 8px\n- lean magnitude ≤ 0.12 rad\n- head offset ≤ 6px\n- elbow/knee offset derived from arc recompute (see §5), not springed independently when limits are hit.\n\n**Low-FPS substep**: in engine, if `dt > 0.05`, run spring updates in `ceil(dt/0.025)` fixed substeps of `≤0.025s`. Pose sampling stays single-shot.\n\n## 5. Animation Arc System\n\nAfter hand/foot springs settle, recompute elbow/knee:\n`\nmid = (shoulder + hand) / 2\nperp = unit(perpendicular(hand - shoulder))\ncurve = clamp(|handVel| * 0.012, 0, 6)  // px\nelbow = mid + perp * curve * facing\n`\nSame shape for knees with `kneeBendSign = facing` for legs (forward bend).\n\nReplaces any linear interpolation between joints. Velocity-derived `curve` gives natural arc intensity scaling.\n\n## 6. Retreat Branch (`animation.ts`)\n\nDetect `retreating = sign(vx) === -facing && |vx| > 60`. Apply **before** spring post-process:\n- arm swing amplitude × 1.25\n- `shoulderRoll *= 1.4`, `hipSwayX *= 1.3`\n- `lean -= facing * 0.05 * amp` (backward weight)\n- raise trailing-arm hand Y by 2px so it doesn't clip\n- head only: bias `headOffsetX` (new field) toward `facing * 1.5px` so the glance reads\n- locomotion uses `sign(vx)`, not `facing`, for foot phase direction → no mirrored walk\n\n## 7. Jump Phase System\n\nEngine adds `jumpPhase: 'none'|'anticipation'|'launch'|'ascent'|'apex'|'descent'|'landing'|'recovery'` and timers `crouchT`, `landSquashT`, `recoverT`.\n\n**Transitions**:\n- jump-press → `anticipation` (0.07s, vy=0, hipY drops up to 4px, knees bend).\n- timer → `launch` (apply existing jump impulse).\n- `vy < -120` → `ascent`. `|vy| < 120` → `apex`. `vy > 120` → `descent`.\n- ground contact with `prevVy > 200` → `landing` (`landSquashT = 0.12s`, hipY dips up to 6px).\n- timer → `recovery` (0.10s blend back to grounded).\n\n`computeWalkPose` reads phase + timers and blends pose offsets accordingly. Spring float damping (§4) auto-handles arm drag.\n\n## 8. Airborne Inertia\n\nWhile airborne, bias hand/foot **spring targets** (not baked pose) by:\n- `dx = -vx * 0.04`, `dy = -vy * 0.03`, clamped to `±10` (hands) / `±8` (feet).\n\nResult: limbs trail real motion. Springs do the smoothing.\n\n## 9. State Hierarchy Gate (`engine.ts` pose pipeline)\n\nBefore applying retreat / locomotion / spring layers, check current state and skip layers that conflict:\n\n`\npriority = ragdoll > hitstun > attackAnim > airborne > retreat > grounded > idle\n`\n\nEach lower layer only writes fields the higher layer hasn't claimed. Implemented as a small bitmask `poseClaimed` set per call. Prevents pose fighting.\n\n## 10. Render Stability\n\n- All time-based math uses real `dt`; no hidden frame counters.\n- Spring substep guard (§4) handles dt spikes.\n- No `Math.random()` in animation code paths (audit + remove if any slipped in via secondary motion).\n- All clamps applied post-spring, pre-render.\n\n## 11. Silhouette Rules (enforced in animation.ts)\n\nAfter all layers + clamps:\n- arm hand X distance from torso center ≥ 4px (push out if violated).\n- airborne pose: legs forced asymmetric (if `|legL.footY - legR.footY| < 3`, nudge by 3px based on `vx` sign).\n- head X offset ≥ 2px from torso center while moving.\n\n## 12. Camera Cohesion\n\nRead facing-change events from §1 to add a tiny camera nudge (`camTargetX += (newFacing - oldFacing) * 4`) lerped via existing camera system. No shake, no zoom. Skipped during finisher cinematic.\n\n## 13. LowPower Mode\n\nWhen `this.lowPower`:\n- Springs use only `sLean`, `sShoulderRoll`, `sHandL`, `sHandR` (skip head/feet/elbow/knee springs).\n- Skip airborne velocity bias (§8).\n- Skip arc curve recompute (§5) — use baked midpoint.\n- Keep facing controller + foot planting (cheap, high impact).\n\n## 14. Yaw-Squash Render (`GameCanvas.tsx`)\n\nWhere the fighter is drawn, multiply horizontal scale by `1 - 0.18 * facingSquash` while `facingSquash > 0`. Single multiply per fighter per frame. No new transforms otherwise.\n\n## 15. Verification\n\n- `bunx tsc --noEmit`.\n- Manual checklist: sprint crossover (no flicker), retreat (stable orientation, no moonwalk), jump (anticipation→squash→float→landing), slow-mo finisher (springs stable), throttled CPU (no exploding offsets), feet never slide, silhouettes stay readable on 393×583 mobile preview.\n\n## Out of scope\n\nHitboxes, damage, AI, networking, attack-pose timing, sprite sheets, ragdoll math, FX systems, finisher cinematic.\n

&nbsp;

ADDITIONAL AAA POLISH LAYERS

1. Animation Authority System

Add per-body-part ownership so multiple animation layers never fight each other.

poseAuthority = {

  torso,

  head,

  armL,

  armR,

  legL,

  legR

}

Priority:

ragdoll > finisher > hitstun > attack > airborne > locomotion > idle

Higher-priority layers fully own their regions until released.

2. Transition Buffer System

Add buffered pose blending between major animation states.

New fields:

transitionT

transitionFrom

transitionTo

transitionCurve

Blend duration:

60–140ms

Applies to:

- grounded → airborne

- airborne → landing

- retreat → idle

- attack → locomotion

- hitstun → recovery

Use cubic / critically-damped easing to remove pose popping.

3. Velocity Momentum Inheritance

Add render-only momentum propagation through the body.

New fields:

poseMomentumX

poseMomentumY

Derived from:

- acceleration

- landing force

- recoil

- direction changes

Distribute into:

- torso lag

- shoulder drag

- hip delay

- head inertia

- arm inertia

Creates real body mass feeling.

4. Root Motion Illusion Layer

Add subtle render-only pelvis/chest drift without touching gameplay physics.

Offsets:

1–3px max.

Apply:

- pelvis drift

- chest lead

- spine compression

- shoulder counter-motion

Improves perceived movement quality massively.

5. Dynamic Pose Compression

Add squash/stretch principles during high-energy motion.

Compress:

- sprint acceleration

- jump anticipation

- heavy attack windup

Extend:

- attack release

- jump launch

- impacts

Small controlled amounts only.

Silhouette readability must remain intact.

6. Motion Clarity Bias

During fast movement:

- exaggerate leading limbs slightly

- simplify trailing limbs slightly

Examples:

- attacking arm extends more

- opposite arm reduced motion

- front leg emphasized during sprint

Optimized for mobile readability.

7. Perceptual Frame Stabilization

Add smoothed visual dt separate from gameplay dt.

visualPoseDt = lerp(prevDt, dt, 0.12)

Use only for:

- animation interpolation

- spring smoothing

- secondary motion

Never affects gameplay simulation.

Removes micro jitter during mobile FPS spikes.

8. Dynamic Center of Mass

Add:

centerOfMassX

centerOfMassY

Shift COM based on:

- speed

- jump phase

- landing

- attack direction

Hips, shoulders, and head follow COM subtly.

Prevents disconnected limb feeling.

9. Contact Pose Holds

On:

- foot plants

- attack impacts

- hard landings

Apply tiny visual hold:

25–50ms

Visual-only.

No gameplay freeze.

Creates stronger impact readability and premium weight.

10. Animation Noise Filtering

Final animation pass:

if (delta < epsilon) ignore

Filter:

- tiny hand drift

- head jitter

- spring micro movement

Keeps animation stable and premium.

11. Performance Rules

- All systems allocation-free.

- No per-frame object creation.

- All math deterministic.

- All springs dt-correct.

- LowPower mode skips:

  - elbow/knee spring layers

  - advanced arc recompute

  - COM secondary offsets

  - airborne inertia bias

Facing system, foot planting, and transition buffers remain active even in lowPower because they are high visual impact and cheap.