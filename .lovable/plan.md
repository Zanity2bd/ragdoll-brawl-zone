
# Butcher — Silhouette-Driven Rebuild (Final AAA Pass)

## Working constraint (the lever)

All 11 skins share one sprite sheet (`walk-sheet.png`, 30 frames). Per-skin canvases are built once via `getSkinSheet` and cached forever. Per-frame anchors (`hx/hy/hr`, `cx/cy`, `hipY`, `footY`) in `WALK_ANCHORS` define where every body part lives in every state (walk, punch, kick, jump, down, get-up, hurt).

Because mass is **baked into the cached sprite frame**, anything we draw at bake time is automatically glued to the silhouette in every state — including ragdoll, which is a runtime rotation of the whole sprite. No runtime cost, no anchor drift, no paper-doll possible.

This pass uses that lever to give Butcher a fully authored silhouette identity covering all 31 AAA rules submitted across three messages.

## Scope discipline

| ✅ In scope | ❌ Out of scope |
|---|---|
| Butcher-only silhouette profile | Other 10 skins (zero visual change) |
| Per-frame contour + shading baked into cached sprite | New sprite-sheet asset |
| Stance tuning (animation amplitude only) | Gameplay, hitboxes, AI, balance, timing |
| `SilhouetteProfile` interface as future skin contract | Procedural skeleton refactor (the `.lovable/plan.md` pelvis-root work) |
| Single `drawImage` per fighter per frame at runtime | Runtime cloth / physics / spring systems |

## Technical plan

### 1. `SilhouetteProfile` on `Skin` (`src/game/skins.ts`)

Optional. Other skins omit it and render identically. Future skins (Hulk mass, Bat cape, Spidey taper) plug in the same fields.

```ts
silhouette?: {
  coat?:      { flare: number; hemDrop: number; sideDrop: number; color: string;
                interiorShade: string;        // anti-flatness lower-interior darken
                weight: number;                // recovery lag (rule: compression/recovery rhythm)
              };
  shoulders?: { widthMul: number; slumpPx: number; color: string;
                highlight: string;             // shoulder-top brighten (anti-flatness)
              };
  jaw?:       { widthMul: number; dropMul: number };
  neck?:      { widthMul: number; heightMul: number };
  beard?:     { widthMul: number; heightMul: number; color: string;
                undersideShade: string;        // beard underside darken
              };
  limbs?:     { upperArmMul: number; forearmMul: number; thighMul: number; calfMul: number };
  minVolume?: { coatWidth: number; shoulderWidth: number; beardWidth: number };
  // Shape language constraints (auto-clamped at bake time):
  taperRule?: { shoulderIsMax: true; legsTaperIn: true; beardMaxOfShoulder: number };
};
```

### 2. Unified contour baker (`src/game/walkSprite.ts`)

`buildSilhouetteContour(skin, a, frameIdx, motion)` runs **once per frame** during `getSkinSheet`, before `drawOverlays`. It builds and fills three unified paths in order:

1. **Tertiary path — limb thickening** (capsules along arm/leg anchor lines, filled in `skin.limb`). Drawn first so torso unions over it.
2. **Primary path — torso + coat + shoulders as ONE continuous shape.** Shoulder slope curve → coat side → coat hem → mirrored side → close. Single `fill()` in `coat.color`. Then a second `fill()` clipped to the bottom 40% of the same path in `coat.interiorShade` (rule 4 anti-flatness: lower-interior darken via vertical gradient — no real lighting). Then a 1px highlight strip across the shoulder slope in `shoulders.highlight`.
3. **Secondary path — head + jaw + neck + beard as ONE continuous shape.** Skull arc → widened jaw → into beard ellipse arc → beard bottom → up other jaw → neck rectangle that overlaps the top of the primary path by 2-3px (visual union, no seam possible). Single skin-tone fill, then clip-fill the beard sub-region in `beard.color`, then a 1px `beard.undersideShade` strip along its bottom edge.

**Result:** the entire body reads as one authored silhouette. Beard ↔ neck ↔ shoulders ↔ coat ↔ pelvis are literally one continuous fill region per tier — there are no isolated ellipses that can detach.

### 3. `MOTION_SHAPING[frameIdx]` lookup

A 30-entry table returning per-frame deltas applied inside the path builder. Encodes every motion-driven rule the user wrote:

```ts
type MotionShape = {
  flareMul: number;       // coat hem flare
  hemDropMul: number;     // hem vertical
  hemSkewX: number;       // directional bias — coat trails opposite momentum
  shoulderWidthMul: number;
  shoulderAsym: number;   // recoil asymmetric shoulder shift
  torsoCompressY: number; // vertical squash on landing/impact
  torsoStretchY: number;  // vertical stretch on jump ascent
  torsoCompressX: number; // impact-driven width compress (2-6% range)
  beardLagX: number;      // beard contour offset during turns
  coatAsymX: number;      // 1-2px coat-side trail asymmetry
};
```

Per-frame values (selected highlights):
- **Walk 0-9:** baseline; `hemSkewX` alternates ±1px each footfall (controlled asymmetry, rule 5).
- **Sprint-ish stride peaks:** `shoulderWidthMul` 0.98 (narrows upper silhouette slightly, rule 1).
- **Punch 10-14:** `torsoCompressX 0.97` on impact frames (impact compression, rule 1); `shoulderAsym +1px` on punch-arm side (rule 5).
- **Jump ascent 15-16:** `torsoStretchY 1.04`, `hemDropMul 0.92` (vertical stretch, rule 1).
- **Jump apex 17:** `flareMul 1.08`, `hemSkewX = -sign(momentum) * 2` (coat arcs opposite spin, rule 2).
- **Landing 18:** `torsoCompressY 0.94`, `flareMul 1.12` instantly (compression fast, rule 6).
- **Frames 19-21 (down/getup):** recovery curve — flare returns from 1.12 → 1.06 → 1.0 over 3 frames (recovery slow, rule 6). Shoulders & beard width preserved at base (rule 7 — ragdoll identity).
- **Hurt 22:** `torsoCompressX 0.95`, `shoulderAsym` opposite hit direction.
- **Kick/knee/slash 23-29:** `hemSkewX` trails opposite kick direction; `coatAsymX` 1-2px on planted-leg side.

All values **clamped against `minVolume`** before applying (rule 4 / volume preservation): coat hem can never collapse past `minVolume.coatWidth`; shoulders never narrow past `minVolume.shoulderWidth`; beard never shrinks past readability floor.

### 4. Mass hierarchy + motion priority enforcement (rules 3, 9)

The path build order encodes hierarchy:
- Tertiary (limbs) drawn first → can never overflow torso contour.
- Primary (torso/coat/shoulders) drawn last among silhouette tiers → dominates composition.
- Secondary (head/jaw/beard) anchored to primary via the overlap union → physically cannot detach.

Inside `MOTION_SHAPING` application, secondary deltas (`beardLagX`, `coatAsymX`) are scaled by `0.5 * (1 - |torsoCompressX - 1| * 10)` — i.e. if primary mass is undergoing significant deformation, secondary motion auto-reduces. This is rule 9 ("secondary motion must never overpower body read") implemented as a single clamp, not a new system.

### 5. Shape-language taper enforcement (rule 3)

Before fill, assert at bake time:
- `shoulders.widthMul * hr >= torso half-width at chest * 1.0` → shoulders are the widest point.
- `beard.widthMul * jaw.widthMul <= shoulders.widthMul * 0.85` → beard never exceeds shoulder profile.
- Leg-capsule width at knee < at hip < shoulder width → taper monotonic downward.

If any rule fails (e.g. extreme `MOTION_SHAPING` value), scale the offending dimension down silently. Identity is preserved on every frame, in every state.

### 6. Ragdoll identity preservation (rule 7)

Frames 19-21 are baked through the same pipeline. The cached canvas IS the silhouette mass — runtime ragdoll just rotates a `drawImage` of it. There is no per-frame solve that can desynchronize coat/beard/shoulders from the body. The "ragdoll shape preservation" rule is satisfied by construction.

For those specific frames, `MOTION_SHAPING` uses gravity-aware draping (wider hem, beard still attached via continuous path, shoulders held at base width — rule 7 explicit checklist).

### 7. Distance readability — the "black silhouette test" (rules 8, 10)

At bake time, run one self-check per frame: rasterize the silhouette to a 1-bit mask, compute its bounding box, and verify:
- Top quartile width >= bottom quartile width × 1.25 (broad-top identity).
- Aspect ratio within a fixed band (no extreme stretches breaking identity).

If any frame fails, scale that frame's secondary motion to zero and re-bake. This is the "if any frame collapses into generic stickman, reshape that frame" rule, enforced automatically rather than by hand.

### 8. Cinematic / slow-mo stability (matches rule 20 from earlier list)

Already handled implicitly: motion shaping is baked per frame, not time-driven. Slow-mo replays the same authored frames — there's no spring or wobble to amplify. We get cinematic stability for free.

### 9. Butcher profile values

```ts
silhouette: {
  coat: {
    flare: 1.45, hemDrop: 24, sideDrop: 8,
    color: "oklch(0.30 0.015 250)",
    interiorShade: "oklch(0.22 0.012 250)",
    weight: 0.85,
  },
  shoulders: {
    widthMul: 1.38, slumpPx: 1,
    color: "oklch(0.32 0.015 250)",
    highlight: "oklch(0.38 0.015 250)",
  },
  jaw:   { widthMul: 0.92, dropMul: 0.55 },
  neck:  { widthMul: 1.18, heightMul: 0.9 },
  beard: {
    widthMul: 0.88, heightMul: 0.55,
    color: "oklch(0.17 0.01 30)",
    undersideShade: "oklch(0.11 0.01 30)",
  },
  limbs: { upperArmMul: 1.28, forearmMul: 1.15, thighMul: 1.22, calfMul: 1.08 },
  minVolume: { coatWidth: 0.78, shoulderWidth: 0.85, beardWidth: 0.70 },
  taperRule: { shoulderIsMax: true, legsTaperIn: true, beardMaxOfShoulder: 0.85 },
}
```

Keep `head: peach` (skin engraved). `body` becomes coat color for legacy fallback. Drop `noHead`, drop `arms` — the contour pass owns torso/head color now. Other skins unchanged.

### 10. Stance nudges (`src/game/stances.ts`)

```ts
butcher: { bobMul: 1.05, strideMul: 1.10, crouch: 1, lean: -0.6, sway: 0.4, idleMul: 0.95 }
```

Lower idle breathing, slight forward neck lean, modest sway → weighted/grounded read. Animation amplitude only — no gameplay impact.

## Files affected

- `src/game/skins.ts` — add `SilhouetteProfile`, populate Butcher entry, drop `noHead`/`arms`.
- `src/game/walkSprite.ts` — add `buildSilhouetteContour()`, `MOTION_SHAPING[]`, taper-enforcement clamps, black-silhouette self-check; call inside `getSkinSheet` before `drawOverlays`; gate existing head-circle/head-band code when `skin.silhouette` is present.
- `src/game/stances.ts` — Butcher stance tuning.

## Verification

1. `bunx tsc --noEmit` clean.
2. At 393×583 viewport:
   - Idle Butcher reads as one coated, broad-shouldered, bearded body — not a stickman + decorations.
   - Walk / punch / kick / jump-ascent / apex / landing / hurt / ragdoll / get-up: motion shaping visible (hem trails, landing compression, recovery lag) but never noisy; no seam between sections.
   - Manual "black silhouette test" at 50% zoom: Butcher recognizable as broad trench-coated figure in all 30 frames, including down/getup.
   - Other 10 skins render bit-identical to before.
3. Runtime cost unchanged — one `drawImage` per fighter per frame. Bake cost (one-time on first Butcher render) negligible.
