# Stickman Render Polish — Refined Pass

Refine the previously-planned outline / taper / curvature work in `src/game/engine.ts` so the silhouette stays clean at every character size, limbs read clearly in motion, and there are no flicker / seam artifacts.

All changes live in `drawFighterAt` and `drawLimb` in `src/game/engine.ts`. No animation timing, pose math, or asset changes.

## 1. Lighter, size-proportional outline

Current plan called for `outlineW = baseW * 0.55`. That reads as too heavy on the standard fighter. Drop the multipliers a notch and clamp:

```text
baseW          = thickBody ? 7.0 : 5.5     // slightly thinner than the v1 plan
outlineW       = clamp(baseW * 0.42, 1.8, 3.4)   // limb rim
torsoW         = thickBody ? 7   : 5.5
torsoOutlineW  = clamp(torsoW * 0.38, 1.8, 3.0)
```

Heavy fighters still get a visibly thicker rim, but the standard stickman no longer looks "inked." The clamp keeps the rim from disappearing on tiny FX scales or ballooning if a future skin pushes `baseW` higher.

## 2. Proportional head outline offset

Head rim was a flat `headR + 0.5`. Tie it to the outline width so head and body share the same visual rim weight:

```text
headRimOffset = outlineW * 0.5
arc(0, headY, headR + headRimOffset)
```

Order is enforced: **fill the head disc first, then stroke the rim.** Cowls / Homelander hairline / mask plates get the same fill-then-stroke treatment locally — the global outline pass no longer touches the head at all.

## 3. Higher-contrast taper

Bump the taper ratio for a more dynamic, anatomical limb:

```text
upperW = baseW              // shoulder/hip → elbow/knee
lowerW = baseW * 0.62       // elbow/knee → hand/foot   (was 0.78)
```

The outline pass mirrors the same split with the same ratio so the dark rim tapers in lockstep — no rim "lip" at the joint. Round line caps + joins keep the elbow transition smooth.

## 4. Limbs overlap the torso (no seams)

Instead of relying on joint caps to plug shoulder / hip gaps, extend each limb's start point a few pixels *inside* the torso along the shoulder→elbow vector:

```text
overlap = baseW * 0.45
sx' = sx + (ex - sx)/len * (-overlap)   // step backwards into torso
sy' = sy + (ey - sy)/len * (-overlap)
```

Result: limb stroke visibly bites into the torso fill, so even at extreme rotations there is no gap. Joint caps shrink further (`jr = baseW * 0.32`) and the hip cap is removed entirely — the overlap does the work.

## 5. Stable curvature (facing-anchored, velocity-modulated)

The earlier plan keyed the perpendicular flex sign off the limb vector, which flipped sign whenever a limb crossed the body midline → visible jitter. Anchor on facing instead:

```text
// Per-limb base direction (anatomical default, depends on which limb)
sideArmL = -1 ; sideArmR = +1
sideLegL = +1 ; sideLegR = -1     // legs curve slightly inward
flexDir  = side * facing          // consistent in world space

flexAmt  = 0.35
         + 0.45 * clamp(|vx|/MOVE_SPEED, 0, 1)   // velocity = secondary
         + (attackAnim > 0 ? 0.35 : 0)
         + (flying      ? 0.25 : 0)

elbowNudge = perp(start→hand) * baseW * 0.30 * flexAmt * flexDir
```

Because `flexDir` only depends on facing (and `facing` is `facingT`-interpolated, not snapping), the curvature can never invert mid-frame. Velocity only modulates *magnitude*.

## 6. Subtle squash & stretch

Layer a tiny scale onto the existing wobble transform (lines ~3499-3507) so movement and impacts feel springier without affecting hitboxes (purely render-side):

```text
moveStretch  = 1 + clamp(|vx|/MOVE_SPEED, 0, 1) * 0.04   // vertical stretch when running
moveSquash   = 1 / moveStretch                           // counter-squash horizontally
hitSquash    = 1 + hitFlash * 0.18                       // brief horizontal squash on hit
hitStretch   = 1 / hitSquash

scaleX = moveSquash  * hitSquash
scaleY = moveStretch * hitStretch
```

Anchored at the feet (already the existing pivot), so characters never "float." Capped tight (≤4% from movement, ≤18% from hits) to stay readable at the 393×583 mobile viewport.

## 7. Final draw order

```text
1. dark outline pass        — limbs (tapered, overlapped) + torso. NO head.
2. neon glow pass           — unchanged
3. main limb stroke         — two segments per limb (upper, lower-tapered)
4. inner highlight          — also two-segment, mirrors taper
5. tiny shoulder caps       — limbColor, hidden under outline
6. torso fill + highlight   — unchanged
7. head: fill → rim (offset) → radial highlight → eyes/mask
8. cowl / hat / hair        — fill → local rim
```

## Performance

~+6 stroke calls per fighter per frame vs current. Negligible at 60Hz on the low-end target (2 fighters). `lowPower` mode still skips glow + highlight; outline + taper stay on (they're the readability win).

## Out of scope

- No `animation.ts` changes
- No cape, weapon, projectile, emblem, or VFX changes
- No new assets
