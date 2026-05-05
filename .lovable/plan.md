# Spider-Man Pilot — Pinned Overlays + Slightly Thicker Body

Iterate on Spider-Man only. Once approved, the same recipe rolls out to the other 8.

## How overlays stay locked to the character (no drift, ever)

The walk sheet has 30 hand-authored anchor points (one per frame) in `src/game/walkAnchors.ts`, recording exactly where the head, chest, hips and feet sit on every single frame — walk, punch, jump, hurt, KO. The per-skin overlay pipeline in `walkSprite.ts` reads those anchors and bakes the mask, eyes, emblem and web lines onto each frame **once at skin-load time**, then caches the result.

That means:

- No runtime overlay positioning — every frame is a single pre-composed image.
- The eyes/emblem/web-lines are physically painted onto the same pixels as the head/chest of that specific frame, so they cannot shift relative to the body.
- Frame-to-frame swap (walk cycle, punch, jump) just blits a different already-composed image. There is no separate "overlay layer" that could lag.

This pipeline is already what's in production — the new art slots straight into it.

## Changes (Spider-Man only)

All edits in `src/game/walkSprite.ts` and `src/game/skins.ts`. No engine, animation, or asset changes.

1. **Iconic mask lenses** — replace the tiny dot eyes in `drawEyes`'s spiderman branch with large white teardrop lenses, black-outlined, tilted ~0.35 rad outward, with a subtle inner highlight. Sized off head radius `r` so they scale with each frame's anchor.
2. **Cleaner spider emblem** — rewrite the `"spider"` case in `drawEmblem` as a two-segment body (small head + larger abdomen) with 8 thin curved legs, 4 per side. Sized off chest radius `r`.
3. **Web-line mask hint** — three thin radial strokes at ~55% opacity from the forehead anchor, only on the spiderman branch in `drawOverlays`.
4. **Slightly thicker body** — set `thickBody: true` on the Spider-Man entry in `src/game/skins.ts`. The walkSprite renderer already reads this flag and uses a chunkier silhouette / thicker emblem strokes.

Everything keys off `WALK_ANCHORS[i]` (the head/chest position for frame i), so it animates with the body automatically and cannot drift.

## How to verify

1. `/play` → pick Spider-Man. Walk back and forth, jump, punch, get hit.
2. The lenses, web pattern and emblem must stay perfectly glued to the head and chest through every frame.
3. Body should look slightly chunkier than before but same height/stance.
4. Compare to the hero portrait in Skin Select — same character identity.

If approved, I roll out the same recipe (iconic feature + emblem fix + small detail + thickness if appropriate) to Hulk and Flash, then the remaining 6.

## Files

- `src/game/walkSprite.ts`
- `src/game/skins.ts`
