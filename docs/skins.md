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
3. Apply the silhouette-first profile from `src/game/characterPresentation.ts`.
4. Bake one full sprite atlas per skin into an offscreen canvas.
5. Draw fighters in the match with a single cached `drawImage` per frame.

This keeps the 60fps path mobile-friendly while removing the old hand-authored
combat-frame anchor drift.

## UI Previews

The player-facing previews use the same cached skin renderer as live combat:

- `src/components/game/SkinSelect.tsx` renders each picker preview and the
  faceoff banner through `drawWalkFrame()` and `drawWalkFrameSilhouette()`.
- `src/components/game/Lobby.tsx`, `src/components/game/Splash.tsx`, and
  `src/routes/index.tsx` use the same draw path for roster art.

Preview screens should never recreate masks, capes, emblems, or body details
with separate UI-only artwork. If a skin looks wrong in a menu, fix the atlas
renderer first so gameplay and menus improve together.

## Art Rules

Skin details should be painted during atlas bake, not during live combat draw.
Masks, eyes, emblems, capes, gloves, boots, claws, speed streaks, and coat
details are all anchored to the derived anatomy for that exact frame.

Silhouette language now lives in `src/game/characterPresentation.ts`. Each
profile defines body shape, shoulder width, torso taper, hip scale, head scale,
neck mass, stance lean, cape type, hair shape, glove/boot weight, emblem scale,
and special shape flags like claws or tails.

Hair is treated as head silhouette, not a floating decoration. Homelander's
slick hair, A-Train's fade, Butcher's rugged shape, Batman's cowl, Superman's
widow peak, Wolverine's ears, and Nightcrawler's sharp hair are baked into the
cached atlas frame with the head.

The current art pass also bakes hero-accuracy details into the same atlas:
Spider-Man web panels, Iron Man armor plates and repulsors, Wolverine cowl and
claws, Batman cowl/cape/belt language, Superman shield/trunks/boots, Flash
lightning fins, Homelander eagle shoulders, Butcher trench details, and
A-Train's blue speed suit, goggles, and A-stripe.

When adding a skin:

- Add the skin to `src/game/skins.ts`.
- Add a silhouette profile to `src/game/characterPresentation.ts`.
- Add combat/AI/stance entries if the `SkinId` is new.
- Add skin-specific material details in `getLook()` and, only when needed,
  `drawSkinSpecificDetails()` in `src/game/walkSprite.ts`.
- Keep the live render path inside `drawWalkFrame()` as a cached atlas draw.

`src/game/walkAnchors.ts` remains for older tools and references, but the
current skin renderer no longer trusts those static overlay anchors.

## Body Motion Profiles

Character body feel is handled in `src/game/wobble.ts` through cached
per-skin visual profiles. These profiles change only the post-process body
presentation: spring stiffness, damping, squash range, limb follow-through,
micro-sway, silhouette caps, and grounded foot locking.

Do not use these profiles to alter damage, hitboxes, AI, balance, or movement
speed. Heavy armored/flying characters should read planted and controlled;
agile characters can have more follow-through; speed characters should keep
tight foot locks so fast actions stay readable on mobile.

## QA

For visual checks, verify:

- `/play` at `393x583` viewport.
- fighter select previews for all nine selectable skins.
- all 30 baked frames for cape, emblem, mask, glove, boot, and claw attachment.
- live fight states: idle, walk, punch combo, jump, special, hurt, downed, and get-up.

The renderer intentionally avoids new dependencies and stays pure Canvas 2D.
