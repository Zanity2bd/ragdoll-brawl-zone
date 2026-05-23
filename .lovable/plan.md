# Butcher — Torso Silhouette Shape Refinement (tuned)

Pure shape-language pass inside `buildSilhouetteContour()` in `src/game/walkSprite.ts`. No new tiers, no overlays, no runtime cost change, no new systems. Only the primary path geometry changes. Tertiary (limbs) and secondary (head/jaw/beard) stay as-is.

## Problem

Current primary path is a near-rectangular trapezoid: flat shoulder top, parallel vertical sides from shoulders to hem, no waist, no chest curve. At 393×583 it reads as "dark rectangle on sticks."

## Target silhouette language

```text
        ___---___              ← sloped trapezius (no flat top)
       /         \             ← shoulder peak = widest point
      |           |
       \         /             ← chest taper inward
        |       |              ← waist (~84% of shoulder, gently pinched)
       /         \             ← coat re-widens below waist
      /           \            ← hem flare (with subtle asymmetry in motion)
     (_____________)           ← softened hem with side-drop
```

Hierarchy: shoulders widest → waist narrowest → hem second-widest → legs taper in beneath. Beard ≤ shoulder × `beardMaxOfShoulder` (already enforced).

## Geometry changes (single continuous Path2D)

Replace the current 4-curve trapezoid (lines ~198–249) with a 6-anchor cubic-bezier contour per side, mirrored, one `fill()`:

1. **Trapezius merge (top)** — no flat edge. Path starts at neck-side anchor `(cx ± neckW*0.5, torsoTop - r*0.02)` and uses a **cubic** `bezierCurveTo` (not quadratic) to ease out and down to the shoulder peak. Control points pulled horizontally so the curve reads as a sloped trapezius, not "neck glued onto a box":
   - cp1: `(cx ± neckW*0.5 + r*0.18, torsoTop - r*0.01)` — short horizontal pull from neck
   - cp2: `(cx ± shoulderHalf * 0.85, torsoTop + r*0.02)` — long pull toward peak, slightly above peak y
   - end: shoulder peak at `(cx ± shoulderHalf, torsoTop + r*0.08)`
2. **Shoulder peak** — widest point of the whole figure.
3. **Chest taper** — cubic from peak to chest at `(cx ± shoulderHalf * 0.94, torsoTop + r*0.45)`. Subtle (~6% inward).
4. **Waist pinch** — cubic to waist at `(cx ± shoulderHalf * waistMul, torsoTop + r*0.95)`.
   - `waistMul = 0.85` default (softer than original 0.82 plan to avoid hourglass at mobile scale).
   - Safe tuning range `0.84–0.86` if it still reads too pinched after preview.
5. **Coat re-flare** — cubic from waist outward to lower-coat at `(cx ± hemHalf * 0.92, torsoTop + r*1.45)`, then to hem corner at `(cx ± hemHalf, tBot)`.
6. **Hem soften** — quadratic hem retained, control point pushed to `tBot + sideDrop * 1.4` so it reads as hanging fabric.

Left side mirrors right; one `closePath()` + one `fill()`. The gradient-clip and shoulder highlight that follow stay inside the new shape unchanged.

## Subtle hem asymmetry (motion-only, no new system)

Reuse the existing `coatAsymX` and `hemSkewX` from `MOTION_SHAPING` — no new fields. Inside the path:

- Left hem corner y: `tBot + Math.max(0, -coatAsym) * 1.2`
- Right hem corner y: `tBot + Math.max(0, coatAsym) * 1.2`

`coatAsym` is already 0 on idle frames (1–2px on motion-heavy frames like kicks, recoil, jump apex). Result: on idle the hem is bilaterally symmetric; in motion one side hangs 1–2px lower while the opposite tightens — exactly what was requested, zero added logic.

Same `coatAsym` magnitude is also added/subtracted to the waist x on its respective side (`waistHalf ± coatAsym * 0.3`) so the entire coat side reads as drifting, not just the hem corner.

## Shoulder slope removes the flat top

Top of silhouette is now the two cubic curves above; there is no horizontal closing edge across the top. Neck path (secondary tier) still overlaps by 3px so the union remains seamless.

## Anti-flatness gradient and shoulder highlight

Existing gradient clip retained. Shoulder highlight ellipse x-radius reduced from `baseShoulderHalf * 0.95` → `baseShoulderHalf * 0.7`, y centered on the slope peak (`torsoTop + r*0.06`), so it catches light on the trapezius slope rather than across a flat top.

## Hierarchy and taper rule checks

`taperRule.shoulderIsMax` and `taperRule.beardMaxOfShoulder` already enforce shoulders-widest and beard cap. Add one local clamp in the new path: if `MOTION_SHAPING` ever pushes `shoulderHalf * waistMul` to where `shoulderHalf < hemHalf`, bump shoulder back up to `hemHalf + 1`. Single `Math.max` — no new system.

## Files affected

- `src/game/walkSprite.ts` — only inside `buildSilhouetteContour()`, replace the PRIMARY block (lines ~198–249). All other code unchanged.

## Out of scope

- `src/game/skins.ts` — no profile changes (waist/asym are renderer-side shape language; future skins can add `waist: { widthMul }` later).
- `MOTION_SHAPING` — unchanged (reuses existing `coatAsymX`, `hemSkewX`).
- Tertiary limb path, secondary head/beard path, stances, other skins, gameplay, ragdoll — unchanged.

## Verification

1. `bunx tsc --noEmit` clean.
2. At 393×583: idle Butcher reads as broad-shouldered trench coat with gentle waist (not hourglass) and lower-coat flare. No flat top. Trapezius slope visible from neck out to shoulder.
3. Motion frames (kick / jump apex / hurt): one coat side hangs ~1–2px lower than the other; idle remains symmetric.
4. Shoulders clearly widest in all 30 frames; hem second; waist narrowest mid-section.
5. Other 10 skins bit-identical.
