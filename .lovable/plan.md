# Make in-game Spider-Man identical to the Skins-menu render

The Skins menu uses a self-contained procedural drawing function (`src/components/game/SkinSelect.tsx` lines 209-364). The in-engine "premium render" path (`src/game/engine.ts` lines 5448-5497) is a partial reimplementation with different numbers, which is why Spider-Man looks wrong on the field. Plan: port the SkinSelect routine literally, scale it to engine units, and lock arm/shoulder anchors so the silhouette matches.

## 1. Extract the canonical render as a shared helper

Create `src/game/premiumRender.ts` exporting `drawPremiumBody(ctx, skin, pose, headR, facing, ghost)`. The body of this function is a near-1:1 copy of the SkinSelect drawing block (lines 240-364), but parameterized:

- Uses `pose.shoulderY`, `pose.hipY`, `pose.headOffsetY`, plus `headR` from the engine — instead of the hard-coded `56 / 92 / 146 / 206 / 17` from SkinSelect.
- Derives sizes from the SkinSelect proportions, not from new magic numbers. Concretely, with `H = pose.hipY - pose.shoulderY` (engine torso height):
  - `shoulderHalf = H * (13 / 54)` for thickBody, `H * (10 / 54)` otherwise
  - `hipHalf      = H * (10 / 54)` for thickBody, `H * (7 / 54)` otherwise
  - `capR         = H * (4 / 54)` (thick) or `H * (3.2 / 54)`
  - emblem position, neck rect, eye placement, mask lenses all scale off `headR` using the same ratios as SkinSelect.
- Spider-Man-specific bits (`skin.id === "spiderman"` lens shape, web-stripe accents) are copied verbatim from SkinSelect lines 347-351 so the eyes are the same teardrop ovals at the same offsets-relative-to-`headR`.

This function becomes the single source of truth shared by both screens.

## 2. Align the arm anchors so the silhouette closes

In `src/game/animation.ts`, the walk/idle/attack pose anchors arms at `armL[0..1] = [-4, shoulderY]` and `armR[0..1] = [4, shoulderY]`. SkinSelect anchors them at `±shoulderHalf` so the shoulder cap sits exactly where the upper-arm starts.

Add a single post-process step inside `engine.ts` right after `computeWalkPose(...)` returns: snap the arm shoulder X to `±shoulderHalf` (same value the new helper computes) by overwriting `pose.armL[0]` and `pose.armR[0]`. Elbow / hand joints are unchanged — only the root moves outward, which is what makes the limb meet the torso corner.

## 3. Replace the engine's premium block with a call to the helper

In `src/game/engine.ts` lines 5448-5504, delete the trapezoid + neck + caps + emblem code and replace it with `drawPremiumBody(ctx, skin, pose, headR, f.facing, ghost)`. The eye/mask block at 5565-5571 also moves into the helper so that when premiumRender is true, the head/eyes are drawn by SkinSelect's exact code path, not the legacy engine path.

## 4. Use SkinSelect for SkinSelect too

Update `SkinSelect.tsx` to call the same `drawPremiumBody` helper (passing a synthetic idle `Pose` built from its current `headY/shoulderY/hipY`). This guarantees the menu and the in-game render can never drift again.

## 5. Verify with a screenshot before declaring done

After the edits, open `/play`, start a Spider-Man match, and capture a screenshot of the active fighter at idle and mid-stride. Compare against the reference you uploaded:
- Torso edges flush with shoulder caps and arm roots (no floating caps)
- Spider lenses are the angled white teardrops, not round dots
- Red trapezoid + blue limbs proportions read like the menu card
- Emblem sits at torso midpoint

If any of those four checks fail, iterate on the helper (not on the engine call site) and re-screenshot. Only then report back.

## Technical notes

- `Pose` type already exposes everything the helper needs (`shoulderY`, `hipY`, `headOffsetY`, `lean`); no schema changes required.
- The helper must respect `ghost` (skip the highlight band / outer glow) so KO ghosts still look right.
- No other skins have `premiumRender: true` yet, so this change is contained to Spider-Man until you greenlight rolling it to the rest of the roster.
