# Spider-Man — Single-Silhouette Bake

## Goal

Spider-Man becomes ONE baked image per frame. Red is part of the silhouette itself (recolored alpha), not a shape stacked on top. The chest emblem and white eyes are baked into the same cached frame. At gameplay time the engine only runs `drawImage(spriteFrame)` — no Spider-Man-specific drawing, no anchor-attached decorations, no overlays.

Result: rotate, ragdoll, recoil, launch — the entire character moves as one image. No blue leakage, no shifting markings, no detached torso.

## Approach

The walk sheet is a grayscale silhouette. Today Spider-Man:

1. tints the whole alpha blue,
2. draws a red circle at the head anchor,
3. draws a red capsule at the torso anchor,
4. draws web lines + eyes + emblem on top.

Steps 2–4 are decorative shapes placed at anchors. They can never perfectly match the silhouette mass on the 20 combat frames, so blue leaks and red slides.

New build (inside `getSkinSheet` in `src/game/walkSprite.ts`, for Spider-Man only):

1. **Base coat** — fill the silhouette alpha with **blue** (the limb color). This becomes arms + legs.
2. **Red head region (per frame)** — clip to the silhouette alpha via `source-atop`, then fill a generous disc centered on `(hx, hy)` with radius `hr + 4`. Because we composite with `source-atop`, only existing silhouette pixels turn red — the head outline is exactly the silhouette's head, no decorative circle, no leakage.
3. **Red torso column (per frame)** — same `source-atop` trick, but the fill region is a vertical band centered on `cx`, spanning from `neckY` to `hipY`, width ≈ `r * 1.0`. Pixels outside this band (arms extending sideways) stay blue. Pixels inside that exist in the silhouette become red. No capsule shape, no shifting.
4. **Red hands/feet (per frame)** — small `source-atop` discs at the four limb tips (sampled from the existing anchor pelvis/foot/wrist positions or fixed offsets from `(cx, hipY)` and `(cx, footY)`). Optional polish; can be skipped on v1 if it complicates.
5. **Spider emblem (per frame)** — drawn into the red torso column with `source-atop` so it can never extend past the body (`drawEmblem` reused as-is, no anchor change).
6. **White teardrop eyes + black rim (per frame)** — drawn inside the head disc with `source-atop` so they clip to the actual head silhouette and cannot drift outside it.

Everything happens during the one-time sheet bake. The hot path stays one `drawImage` per fighter per frame.

## Files to change

### `src/game/walkSprite.ts`

- Add a Spider-Man-only branch inside the per-frame loop in `getSkinSheet` (currently calls `drawOverlays` for every skin).
- Implement steps 1–6 above using the existing per-frame `WALK_ANCHORS[i]` to know where the head/torso/hips sit for that frame.
- The Spider-Man branch **skips** the normal `drawOverlays` path entirely — no head circle, no jaw ellipse, no skin-tone face, no cape, no body-thickening, no torso ellipse, no separate emblem-on-top pass, no `drawEyes` call.
- Remove the existing Spider-Man special cases inside `drawOverlays` / `drawEyes` (web strokes block at ~554–564, spider eyes block at ~620–652, spider torso stripe at ~585–599) since the new branch owns them.

### `src/game/engine.ts`

- Delete the runtime Spider-Man head-mask + teardrop-eye block (lines 7969–7992 and the spider branch in ~7994–8015) and the spider branch inside the runtime `drawEmblem` (8306). These run only when the sprite sheet is not ready; once removed, Spider-Man is always 100% baked.
- Keep all gameplay code (web swing, web snare, AI hints) untouched.

### `src/components/game/Lobby.tsx`

- Remove the residual procedural spider preview in the splash lobby (~328 and ~378–380) so the selector and lobby both rely solely on `drawWalkFrame`. (SkinSelect already does.)

## Verification

- Hard reload to bust the cached Spider-Man sheet.
- 393×583 mobile preview: check idle walk, jumps, kicks (frames 23–26), hurt (22), ragdoll (19), get-up (20–21), slash (27–29).
- Black-out test: silhouette should read as classic stickman. Color test: head is fully red with NO blue pixels around it; torso column is red with arms remaining blue all the way to the shoulders; emblem stays glued to the torso through every attack and ragdoll tumble.
- No frame-rate impact — bake cost is one-time, hot path is unchanged.

## Out of scope

Other skins (Batman, Iron Man, Superman, Hulk, Homelander, Butcher, Heatwave, A-Train, Flash, Nightcrawler) — not touched. Gameplay, AI, physics, web-swing — not touched.

Additional Requirements

Spider-Man must remain a stickman first and a superhero second.

Color carries identity.

Silhouette carries readability.

The silhouette must not become:

- a capsule

- a rectangle

- a trench coat

- a body suit blob

The torso recolor must follow the actual silhouette mass of each frame rather than painting a centered stripe.

Spider-Man visual rendering must exist only in walkSprite.ts during sprite-sheet baking.

No Spider-Man-specific drawing logic may exist in:

- engine.ts

- animation.ts

- ragdoll.ts

- drawFighter()

- drawFighterAt()

- runtime overlay systems

The baked sprite sheet becomes the single source of truth.

Run a black-silhouette test on all combat frames.

If a frame stops reading as a clean athletic stickman, reduce detail instead of adding more.