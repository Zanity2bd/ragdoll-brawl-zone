## Goal

Layer a Supreme-Duelist-style "wobble + soft ragdoll" feel on top of the existing rigid pose system without rewriting it. Idle stays stable, fast actions get jiggly, hits punch limbs around momentarily, and recovery is jitter-free. Reuses the current full-ragdoll for big knockdowns; this adds the missing "in-between" layer.

## Approach

Three additive systems, all driven by springs (spring–damper, semi-implicit Euler) so they're cheap, stable at 60 FPS, and never explode:

1. **Body wobble** — secondary motion on torso/head from velocity changes.
2. **Limb jiggle** — soft offsets applied to elbows/knees/hands/feet after `poseFor()` returns, scaled by speed and recent impacts.
3. **Partial ragdoll (stagger)** — short reactive limb-flail on small hits that does NOT trigger full tumble, with a resistance window to prevent spam.

All three run as a post-process on the existing `Pose` from `animation.ts`. Render code is unchanged.

## Technical Plan

### 1. New module: `src/game/wobble.ts`

Pure functions + a small per-fighter state object. No allocations per frame.

```text
WobbleState {
  // torso secondary motion (1 spring, 2D)
  bx, by, bvx, bvy        // body offset + velocity
  tilt, tiltV             // extra lean rad
  // limb springs (4 limbs × 2D pos + vel)
  limb: Float32Array(16)  // [armL.x,y,vx,vy, armR..., legL..., legR...]
  // hit impulse decay
  staggerT: number        // 0..0.35s flail timer
  staggerDir: -1|1
  staggerMag: number      // 0..1
}
```

Functions:
- `stepWobble(state, dt, vx, vy, ax, ay, onGround, flying)` — integrates springs. Stiffness/damping tuned per state:
  - idle (speed<20): k=180, d=18 → near-rigid, no visible motion
  - moving: k=120, d=12 → subtle sway
  - airborne: k=80, d=8 → floppier
  - stagger active: k=60, d=6 → loose flail
- `applyImpulse(state, dirX, dirY, mag)` — adds velocity to body + limb springs.
- `applyWobble(pose, state, facing) → Pose` — adds offsets to shoulder/hip/limbs and folds `tilt` into `pose.lean`. Limb offsets are damped (×0.6) so feet don't slide off the ground visibly.

Clamps: every offset capped at ±6px, tilt at ±0.18 rad. Guarantees no broken silhouettes.

### 2. Fighter integration in `src/game/engine.ts`

- Add `wobble: WobbleState` to `Fighter` interface; init in `makeFighter`.
- In the per-fighter `update` step, after position integration, call `stepWobble(...)` with current velocity, intent axes, and state flags. Skipped during full ragdoll/downed/getup (those already own the body).
- In `poseFor`, wrap the final return: `return applyWobble(base, f.wobble, f.facing)`. Full-ragdoll branch (existing `blendPose` path) is left untouched.

### 3. Hit-reactive partial ragdoll (stagger)

New tier between "hit flash only" and "full tumble":

- In `applyMeleeHit`, when `m.ragdollT === 0` OR `target.ragdollImmuneT > 0` (anti-chain active) → instead of doing nothing, call `applyImpulse(target.wobble, f.facing, -0.5, mag)` with `mag = clamp(m.damage / 20, 0.4, 1)` and set `target.wobble.staggerT = 0.28`, `staggerDir = f.facing`.
- Same for projectile hits (`fire`, `batarang`, `web`) at lower magnitude (0.5×).
- Full ragdoll path (`m.ragdollT > 0` and not chain-immune) ALSO calls `applyImpulse` for the first-frame snap, so the transition into tumble looks continuous.
- Recovery: `staggerT` decays naturally; while >0, `MOVE_SPEED` is multiplied by `0.65` and `ACCEL` by `0.7` (soft control loss, not a lockout). No new attacks can start while `staggerT > 0.18` (first ~100ms only).

### 4. Anti-spam tuning

- New constant `STAGGER_IMMUNE = 0.25s` — after a stagger ends, ignore further stagger impulses for this window (full hits still register damage). Prevents jitter when two fast hits land back-to-back.
- Existing `iframeT` and `ragdollImmuneT` already prevent ragdoll spam; stagger inherits the same checks (no stagger during iframe/downed/getup).

### 5. Cross-system safety

- Full ragdoll path: zero out `wobble.limb` velocities on entry so springs don't fight tumble physics.
- On `getUpT → 0` (rise complete): reset wobble state.
- Flying: wobble runs but with halved magnitudes (flight already has hover bob).

### 6. Performance

- Per fighter per frame: ~20 multiplies + 16 adds for springs, no allocations (Float32Array). Negligible at 60 FPS for 2 fighters.
- `lowPower` flag: clamp limb offsets at ±3px and skip stagger limb spread (body+tilt only). Keeps the look on weak phones without branching the code path.

## Files Touched

- `src/game/wobble.ts` — new module (~140 lines).
- `src/game/engine.ts`:
  - `Fighter` interface + `makeFighter` (init wobble).
  - Update loop: call `stepWobble`, gate stagger against existing immune timers, apply soft control penalty.
  - `applyMeleeHit` + projectile hit blocks: trigger `applyImpulse` / stagger.
  - `poseFor`: wrap final pose with `applyWobble`.
- `src/game/animation.ts` — no changes (wobble is a pure post-process on `Pose`).

## Out of Scope

- No changes to maps, skins, HUD, audio, or the existing full-ragdoll tumble physics.
- No new gameplay timers exposed to UI; everything is internal state.
- No verlet rope / true soft-body — overkill for the feel target and a perf risk on mobile.
