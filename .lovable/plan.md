## Goal

Make the in-match fighter look identical to the polished SkinSelect card preview, while keeping every existing animation (walk cycle, punch, kick, knee, slash, jump, hurt, ragdoll, web-swing). Roll out on Spider-Man only first; then apply to all skins.

## Approach

Today the in-match renderer has two paths:

1. **Walk-sheet path** — `drawWalkFrame()` blits a baked silhouette PNG with overlays anchored to per-frame coordinates (`WALK_ANCHORS`).
2. **Pose path** — `drawLimb()` strokes lines between physics joints (`pose.armL/armR/legL/legR`, `shoulderY`, `hipY`) for ragdoll, kicks, web-swing, etc.

The SkinSelect look is purely procedural (filled trapezoid torso + thick curved limbs + filled head). We adopt the **pose path** as the single source of truth, drop the walk-sheet for fighters with `premiumRender`, and render the same primitives the SkinSelect uses but anchored to live pose joints.

## Spider-Man Pilot

Add an opt-in flag `premiumRender: true` on the Spider-Man skin. The renderer branches:

- If `premiumRender`: skip `drawWalkFrame`, draw the procedural body using pose joints.
- Else: keep current walk-sheet path (no regression for other skins yet).

### Procedural body (matches SkinSelect)

Drawn in the fighter's local space (origin at feet, y-up flipped to match engine):

```text
        head (filled circle, r ≈ headR*1.1, centered ~hy+0.2r)
         │
         neck patch (6px wide rect)
         │
   ┌─────┴─────┐  ← shoulder line (width = shoulderHalf*2 ≈ 18)
   │           │
   │  torso    │  filled trapezoid: shoulders→hips
   │ (emblem)  │  hipHalf*2 ≈ 14
   └─┬───────┬─┘
     │       │   limbs: thick stroke (8px) along pose joints
   shoulder caps (filled circles)
```

Implementation:

1. **Torso fill** — replace the single vertical stroke with a filled trapezoid path using `(-shoulderHalf, shoulderY) → (shoulderHalf, shoulderY) → (hipHalf, hipY) → (-hipHalf, hipY)`. Keep emblem drawing on top.
2. **Limbs** — keep `drawLimb()` joint geometry but bump stroke width via skin flag (already done globally, now confirmed). Add a thin shadow-side stroke for depth.
3. **Shoulder caps** — filled circles at `(±shoulderHalf, shoulderY)` so torso/arm joints read clean.
4. **Head** — already domed via `walkSprite.ts`; for premium path, draw the filled head + jaw taper + neck rect directly (no sprite blit), then run the existing overlay code (lenses, emblem, mask web) using the same drawing helpers we already extracted.
5. **Gloves / boots / cape** — already drawn from pose joints in the engine; unchanged.

### Animations preserved

All animations are pose-driven — they update `pose.armL/armR/legL/legR/shoulderY/hipY` per frame for walk, punch (10–13), kick (23–24), knee (25–26), slash (27–29), jump (15–18), hurt (22), ragdoll (19), get-up (20–21). Because we draw on top of the same joints, every animation continues to work; we only swap *how* the silhouette is filled.

For the walk cycle specifically, the engine already drives leg/arm angles from `walkPhase` even when the walk sheet is shown — the pose joints are always live. Confirmed by the existing fallback path that renders without the sheet.

### Files to change

- `src/game/skins.ts` — add `premiumRender?: boolean`, set on Spider-Man only.
- `src/game/engine.ts` — in the fighter draw block, branch on `premiumRender`:
  - Skip `drawWalkFrame` call.
  - Draw cape (existing) → trapezoid torso fill → limbs (existing `drawAllLimbs`) → shoulder caps → emblem (existing) → head circle + jaw taper + neck patch → eyes/lenses/mask web (extract from `walkSprite.ts` into a shared `drawHeadOverlay(ctx, skin, hx, hy, r)` helper).
- `src/game/headOverlay.ts` (new) — pure function shared between walk-sheet baker and live renderer for head/face details so Spider-Man's lenses, web pattern, and spider emblem look identical in both.

## QA

- Spider-Man stands idle: matches SkinSelect card.
- Walk left/right: legs swing, torso tilts, head stays domed, lenses don't drift (anchored to pose `headX/headY`, not to baked frame).
- Punch / kick / slash / jump / hurt / ragdoll: limbs follow pose, torso trapezoid deforms with `shoulderY`/`hipY`, no sprite ghost.
- Web-swing: cape/limbs already pose-driven — verify torso trapezoid rotates with `bodyAngle`.
- Other 10 fighters: unchanged (still walk-sheet).

## Rollout

After Spider-Man is approved, flip `premiumRender: true` on every skin in one pass and delete the walk-sheet code path + `walk-sheet.png` import. Confirms ~200KB asset removal and one less render branch.
