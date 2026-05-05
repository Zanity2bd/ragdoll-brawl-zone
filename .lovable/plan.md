## Problem

The character circled in red is the **old procedural stick-figure body** (`computeAttackPose` in `src/game/animation.ts`). Whenever a fighter uses a special move (Crowbar Swing, Heat Punch, Web Yank, Repulsor, Laser Sweep, Bamf, Superman/Homelander Punch, Ground Smash, etc.) or while flying, the engine renders this old procedural rig **on top of / instead of** the new sprite-sheet character. That's why Butcher's old stickman silhouette appears mid-crowbar swing while Spider-Man's new sprite character is visible elsewhere.

The new sprite-driven character (frames 0–29 in `walk-sheet.png`) already covers walk, punch, jump, hurt, ragdoll/down, get-up, kick combo, and knee combo — that work stays untouched.

## What to remove (and archive)

Move legacy procedural code to `src/game/_legacy/proceduralAttackPose.ts` (kept in-repo for reference, never imported by the runtime):

1. `computeAttackPose(...)` from `src/game/animation.ts` — entire function including all attack `case` blocks: `basicKick`, `heatPunch`, `crowbar`, `groundSmash`, `speedFlurry`, `phaseStrike`, `webYank`, `repulsor`, `batCombo`, `laserSweep`, `bamfPunch`, `bamfKick`, `supermanPunch`, `homelanderPunch`.
2. `computeFlightPose(...)` from `src/game/animation.ts` — the procedural hover stickman (only used during flight, which falls back to procedural rig).
3. The Butcher crowbar prop draw block in `src/game/engine.ts` lines ~5610-5623 (procedural overlay tied to `f.meleeKind === "crowbar"`).

## What to change in the live engine

`src/game/engine.ts`:

- Remove imports of `computeAttackPose` and `computeFlightPose` from `./animation`.
- In `poseFor(...)` (around lines 4268–4298), strip the `if (f.dash)` / `else if (f.meleeKind)` / `else if (f.heatVisionT > 0 || ...)` branches that call `computeAttackPose`. Keep only the walk pose path. Also drop the `computeFlightPose` branch — flight will use the standard walk pose (sprite renderer already handles airborne frames).
- In `render(...)` around lines 5113-5118, change the comment + early-return so the sprite renderer is **always authoritative** for grounded fighters. Remove the "fall through so the procedural attack pose renders the arms / weapons on top of the sprite legs" path.
- Around line 5013, remove `&& !f.flying` from `useSpriteWalk` so the sprite character is also used while flying (cape + glow already layer on top).
- Remove the Butcher crowbar prop block (5610-5623). Specials still trigger via `f.meleeKind` for damage/SFX/FX overlays — only the procedural body draw is gone. The new sprite frames (PUNCH/KICK/KNEE/SLASH 27-29) continue to play for combo moves.

## What stays (new animations, unchanged)

- All sprite-sheet rendering paths in `render()` lines 5015–5111 (walk loop, punch frames 10-13, jump rise/apex/land, hurt, ragdoll DOWN_FRAME with `ragdollAng`, downed, get-up A/B, combo kick/knee).
- `computeWalkPose`, `computeRagdollPose`, `blendPose` in `animation.ts`.
- Cape physics, Nightcrawler tail, Hulk muscles, emblem/eyes/cowl — all layered overlays on top of the sprite.
- Move definitions in `combat.ts` (damage/range/SFX) — only the visual procedural body is removed.

## Risk / regressions

- Specials will no longer have a unique full-body procedural pose; they'll show the sprite walk/idle frame plus existing FX (slash arc, charge ring, shockwave, beams, projectiles). For specials that have a matching sprite (slash 27-29, kick 23-24, knee 25-26), we can map them in a tiny switch — but per your request we are removing first; mapping each special to a sprite frame is a follow-up if needed.
- Flight pose becomes the standard sprite (jump apex frame). This removes the "menacing hover stance" but keeps Iron Man / Homelander recognizable via cape + emblem + glow.

## Files touched

- create `src/game/_legacy/proceduralAttackPose.ts` (archive of removed code, with header comment "DO NOT IMPORT — reference only")
- edit `src/game/animation.ts` (delete `computeAttackPose`, `computeFlightPose`, `AttackTiming` export)
- edit `src/game/engine.ts` (drop imports, simplify `poseFor`, force sprite path, drop crowbar prop)

Approve and I'll execute.