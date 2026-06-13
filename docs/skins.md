# Character Skin Pipeline

OgunArena renders every fighter from `src/assets/walk-sheet.png`, a 30-frame
`144x200` alpha sprite sheet. The combat engine still owns the same frame
indices, so existing walk, punch, kick, knee, slash, jump, hurt, downed, and
get-up timing stays unchanged.

## Runtime Model

`src/game/walkSprite.ts` now uses a hybrid authored-atlas pipeline:

1. Load the base walk sheet once.
2. Scan each frame's alpha channel to derive a stable anatomy map:
   - filled head ball by compact alpha-density search
   - chest and hip from row-density bands relative to the head
   - hand and foot endpoints from side-most alpha clusters
3. Bake one full sprite atlas per skin into an offscreen canvas.
4. Draw fighters in the match with a single cached `drawImage` per frame.

This keeps the 60fps path mobile-friendly while removing the old hand-authored
combat-frame anchor drift.

## Art Rules

Skin details should be painted during atlas bake, not during live combat draw.
Masks, eyes, emblems, capes, gloves, boots, claws, speed streaks, and coat
details are all anchored to the derived anatomy for that exact frame.

When adding a skin:

- Add the skin to `src/game/skins.ts`.
- Add combat/AI/stance entries if the `SkinId` is new.
- Add skin-specific material details in `getLook()` and, only when needed,
  `drawSkinSpecificDetails()` in `src/game/walkSprite.ts`.
- Keep the live render path inside `drawWalkFrame()` as a cached atlas draw.

`src/game/walkAnchors.ts` remains for older tools and references, but the
current skin renderer no longer trusts those static overlay anchors.

## QA

For visual checks, verify:

- `/play` at `393x583` viewport.
- fighter select previews for all nine selectable skins.
- all 30 baked frames for cape, emblem, mask, glove, boot, and claw attachment.
- live fight states: idle, walk, punch combo, jump, special, hurt, downed, and get-up.

The renderer intentionally avoids new dependencies and stays pure Canvas 2D.
