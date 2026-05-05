# Walk: Combine 10-frame sheet + 6 hand-drawn keys

## Goal
Keep the existing 10-frame walk loop. Add the 6 hand-drawn keyposes as a second source. At runtime, build a 16-slot merged cycle that pulls from whichever source has the closer-matching pose, with crossfade between adjacent slots and stride-locked timing for true production smoothness.

## Implementation

### 1. New asset folder (already copied)
`src/assets/walk-frames-v2/walk-00.png` … `walk-05.png`

### 2. New module `src/game/walkCycleV2.ts`
- Loads the 6 PNGs, luma-keys the gray background to alpha (bright pixels → opaque white silhouette; everything else → transparent), so they share the same tinting pipeline as `walk-sheet.png`.
- Auto-fits each silhouette into the same 144×200 cell as `walk-sheet.png`, feet planted at `WALK_FOOT_Y` — guarantees scale + ground contact match the existing frames exactly.
- Auto-extracts per-frame anchors (head xy/r, chest xy, hipY, footY) by alpha-scanning each cell, mirroring the approach used in `walkAnchors.ts`.
- Per-skin caches a tinted + overlaid sheet (cape behind, head/eyes/emblem/cowl/beard on top) using the same overlay pipeline copied from `walkSprite.ts`. Hot path = one `drawImage` per fighter per frame.
- Exports `loadV2Sheet()`, `isV2Ready()`, `drawV2Frame(ctx, skin, idx, cx, footY, facing, height, mirror?)`.

### 3. New module `src/game/walkMerge.ts`
- One-time at init, classifies each of the 16 source frames (10 from sheet + 6 from v2) by its stride phase ∈ [0,1) using leg-anchor X spread + lead-leg sign.
- Builds `MERGED[16]` lookup: for each evenly-spaced target sub-pose, picks the two closest source frames (with `mirror` flag for re-using one stride-half as the other) and a crossfade weight.
- Exposes `getMergedSlot(slot01: number)` returning `{ a, b, blend }` where `a`/`b` describe `{ source: "sheet"|"v2", frame, mirror }`.

### 4. Engine wiring (`src/game/engine.ts`)
- Replace lines ~5070–5083 (current 10-frame walk branch) with the merged 16-slot draw: pick `slot = floor(cycleF*16)`, draw primary, alpha-blend the next slot's primary by `slotFrac`. Each draw routes to `drawWalkFrame` (sheet) or `drawV2Frame` (v2) based on the source flag. If v2 isn't loaded yet, fall back to existing 10-frame logic untouched.
- Replace line ~2809 walk-phase advance with stride-locked timing: `f.walkPhase += (|vx| / STRIDE_PIXELS) * 2π * ldt` (STRIDE_PIXELS ≈ 38) so feet match ground speed (kills foot-sliding).
- Add inside the walk branch only: vertical bob `sin(phase·4π)·1.5px` subtracted from footY, and `sin(phase·2π)·0.025` added to lean. Idle (|vx|<18) decays phase to 0.
- Call `loadV2Sheet()` from engine init alongside `loadWalkSheet()`.

### 5. Untouched
`walk-sheet.png`, `walkSprite.ts`, `walkAnchors.ts`, `animation.ts`, all jump/punch/ragdoll/getup/hurt/kick/knee/slash branches, all FX, AI, combat.

## Files
- **Create**: `src/game/walkCycleV2.ts`, `src/game/walkMerge.ts`
- **Edit**: `src/game/engine.ts` (walk branch ~5070, phase advance ~2809, init)
- **Already copied**: `src/assets/walk-frames-v2/walk-0[0-5].png`

## Risk
Zero regression risk — until v2 sheet finishes loading the engine renders the original 10-frame loop. The merged path activates seamlessly once `isV2Ready()` flips true.

After this lands, we move on to **jump** as agreed.
