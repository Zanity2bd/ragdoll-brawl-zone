# Fix: walk looks bad — revert merge, keep smoothness wins

## Diagnosis
Looking at frames extracted from your recording, the merged cycle is alternating between **two visually inconsistent art styles** every slot — the original sheet sprite (with proper head circle, cape, emblem) and the v2 hand-drawn silhouette (different proportions, head sits higher, my auto-anchor mis-placed the face overlay so you see a floating head + ghost body). Each source looks fine alone; crossfading between them every 1/16 cycle is what produces the broken look.

The merge approach can't recover from this — the two sources have different foot lines, head positions, and limb thickness. No phase math fixes that.

## Fix (this turn)
1. **Revert the walk render** to draw exclusively from `walk-sheet.png` (the 10-frame loop you said looked good).
2. **Keep the smoothness wins** that *do* help and don't conflict:
   - Stride-locked phase advance (`speed / STRIDE_PIXELS * 2π`) — kills foot sliding.
   - Vertical bob (`sin(phase·4π) · 1.5px`) — adds life.
   - Idle decay to neutral pose.
3. **Remove** the merged 16-slot path, the v2 draw call, and the imports from `walkMerge` + `walkCycleV2` in `engine.ts`. Leave the v2 modules + asset files in place (no churn, future use).

## Path forward for your 6 hand-drawn frames
Mixing two art styles at runtime won't work. Two real options when you want to revisit:
- **Option A — Replace, don't merge**: bake your 6 frames into a *new* 12-frame walk sheet (mirror the 6 → 12) and switch the walk loop to use only that sheet. One consistent art style, no flicker. Requires re-doing per-frame anchors for cape/emblem.
- **Option B — Use them as a separate skin**: ship the hand-drawn style as an unlockable "classic stickman" skin with its own dedicated sheet, instead of mixing into existing skins.

I'd recommend Option A when you're ready — but only after we finish polishing jump/ragdoll/getup/basic-attack on the current sheet, so we have one stable visual baseline.

## Files
- **Edit**: `src/game/engine.ts` — revert walk branch (~5083) to sheet-only with stride-lock + bob; drop unused imports.
- **No-op**: leave `src/game/walkCycleV2.ts`, `src/game/walkMerge.ts`, and `src/assets/walk-frames-v2/*` in place for the future Option A path.

After this lands, walk should look like before but with no foot-slide and a subtle bob. Then we move to **jump** as planned.
