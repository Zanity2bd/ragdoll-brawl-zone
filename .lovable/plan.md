## Issue
Overlays (face, mask, eyes, chest emblem, cape) currently use a single SHARED anchor for all 15 frames, so as the body moves the painted features stay fixed in frame coordinates and "slip off" — Spider-Man's spider drifts off his chest, his mask floats off his head during the punch wind-up.

## Fix
Replace the SHARED anchor with the real per-frame head/chest positions extracted from `walk-sheet.png`'s alpha. Anchors I already extracted from the live sheet:

| Frame | hx | hy | hr | cx | cy | hipY |
|--|--|--|--|--|--|--|
| 0–9 (walk) | varies 66..84 | 14–15 | 13–14 | varies 65..79 | 45–47 | 106 |
| 10 punch windup | 71 | 15 | 14 | 67 | 46 | 106 |
| 11 punch impact 1 | 87 | 56 | 14 | 72 | 84 | 123 |
| 12 punch impact 2 | 98 | 27 | 14 | 94 | 50 | 110 |
| 13 follow-through | 105 | 16 | 14 | 98 | 46 | 106 |
| 14 recovery | 70 | 15 | 13 | 63 | 45 | 106 |

`footY` is 193 across all frames.

### Files
- `src/game/walkAnchors.ts` — replace the SHARED constant + `Array.from` with a literal 15-entry table using the values above.

Nothing else needs to change: `walkSprite.ts` already pulls `WALK_ANCHORS[i]` per frame for compositing (overlays, cape, eyes, emblem), it just had no real data to work with.

## Acceptance
- Spider-Man's mask, lenses and chest spider stay glued to his head/torso through walk and punch frames.
- Batman's cowl ears and bat emblem track the body during the punch windup/impact (frame 11 lunges low, frame 12 extends — emblem follows).
- Capes still draw behind the torso correctly (uses the same chest anchor).
- No frame-rate impact (composited sheet is still cached per skin).
