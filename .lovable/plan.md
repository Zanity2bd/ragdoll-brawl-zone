## Goal
Replace the math-driven grounded walk cycle in `src/game/animation.ts` with a keyframe table baked from the uploaded `Walking.fbx`, so the gait reads exactly like the reference motion while staying 2D, mobile-cheap, and dependency-free at runtime.

## Steps

### 1. Bake the FBX offline (one-off, dev-time only)
- `code--copy user-uploads://Walking.fbx /tmp/Walking.fbx`
- Install a dev-only FBX parser temporarily in /tmp (e.g. `fbx-parser` or `@picode/three-fbx-loader` run under node) — NOT added to the project's `package.json`.
- Write `/tmp/bake.mjs` that:
  1. Loads the FBX skeleton + the first animation stack.
  2. Locates Mixamo-style bones: `Hips`, `Spine`, `Head`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightArm`, `RightForeArm`, `RightHand`. Falls back to fuzzy name matches if the rig isn't strict Mixamo.
  3. Samples 24 evenly-spaced frames across one full walk loop (left-foot-strike → next left-foot-strike).
  4. For each frame, computes each bone's world position, subtracts hip position (root-motion stripped), projects to the side-view 2D plane (X = forward axis, Y = up), and normalizes to unit hip-height.
  5. Emits a TypeScript constant `WALK_CYCLE: ReadonlyArray<WalkFrame>` (24 frames × 11 normalized 2D points) printed to stdout.

If bone names don't match: script logs the actual bone list and aborts. Fallback = Option B (hand-tune sines from a video). I'll surface the bone list and ask before falling back.

### 2. Wire the table into the renderer
In `src/game/animation.ts`:
- Add the generated `WALK_CYCLE` constant + a `WalkFrame` type at the top of the file.
- Add a small `sampleWalkCycle(phase01)` helper that linearly interpolates between the two nearest frames (cyclic).
- In the grounded branch of `computeWalkPose`, replace the current per-bone sine math (stride/lift/swingL/swingR/arm pump) with: sample the table at `phase / TAU`, scale every offset by the fighter's hip-height (so the chunky proportions still apply), mirror X by `facing`, multiply by `amp` so idle→walk still blends smoothly via the existing amp lerp.
- Keep untouched: lean, hip sway side-to-side (re-derive from the table's actual hip X if present, otherwise keep current sway), wobble layer, head bob lag, foot-roll nudge.

### 3. Leave everything else alone
- Airborne / flying-kick pose: untouched.
- Attack overrides, jump, idle, hit reactions: untouched.
- `engine.ts` chunky silhouette + skins: untouched.
- No new runtime dependency. The FBX file is NOT shipped in the bundle — only the baked numeric table (≈24 × 11 × 2 = 528 floats, ~4 KB of source).

## Technical notes
- Side-view projection: I'll auto-pick the FBX axis with the largest stride variance as "forward" and use Y-up. If the FBX is Z-up I rotate before projection.
- Loop seam: I trim to a true cycle by finding the frame where left-foot Y returns to its minimum closest to the start frame.
- Mobile budget: runtime cost drops vs. current code (table lookup + lerp instead of ~12 sin/cos per fighter per frame).
- The bake script lives only in `/tmp` and is discarded — nothing dev-only ends up in the repo.

## Risk / fallback
- **Rig mismatch**: script aborts with the bone list; I report back and we either rename-map or switch to Option B.
- **Looks worse than current**: each piece is additive — I can revert `computeWalkPose` to the current sine math in one edit while keeping the table for future use.

## Acceptance check
- Grounded walk visibly matches the FBX cadence and limb arcs.
- Idle → walk → run → stop still blends smoothly (no snap), driven by the existing `amp` lerp.
- No foot-sliding, no clipping, no new runtime deps in `package.json`, frame rate unchanged on the mobile preview.
