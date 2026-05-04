## Goal
Use the new 15-frame `walk2-3.zip` sheet exactly as specced:
- **Walk** = frames 1–10 (loop)
- **Punch** = frames 11–14 (one-shot, hit active on 12–13)
- **Recovery** = frame 15 (one-shot transition back to idle/walk)

The current T-key kick (procedural foot swing, jab SFX) is removed entirely and replaced with a sprite-driven punch that uses these new frames.

## Changes

### 1. Sprite sheet rebuild
Already staged: `src/assets/walk-sheet.png` rebuilt as a 15×144×200 horizontal strip from `walk2-3.zip` (frames foot-anchored at the bottom, alpha-cropped, scaled to fit).

### 2. `src/game/walkSprite.ts`
- `WALK_FRAME_COUNT = 15`
- New exports: `WALK_LOOP_FRAMES = 10`, `PUNCH_FRAME_START = 10`, `PUNCH_FRAME_COUNT = 4`, `RECOVERY_FRAME = 14`
- Composited per-skin sheet bakes overlays for all 15 frames (no other change to overlay logic).

### 3. `src/game/engine.ts`
- Rename fighter state `kickT/kickCd/kickHit` → `punchT/punchCd/punchHit`. Add `recoverT` for the frame-15 transition.
- New timing (4-frame swing with sped-up impact + slight pause-on-hit):
  - frame 11 windup ~0.10s
  - frames 12–13 impact ~0.05s each (hitbox active here only)
  - frame 14 follow-through ~0.10s
  - frame 15 recovery ~0.10s (visual only, no hit)
  - cooldown 0.55s, range 60, dmg 1, SFX `punch`
- Hit logic same as old kick but: chest-height impact origin, `Sfx.play("punch")`, brief hitstop ~0.06s.
- Rename `pressKick` → `pressPunch` (engine method + intent flag).
- Renderer (lines ~4851–4877):
  - Walk loop modulo uses `WALK_LOOP_FRAMES` (10), not 14/15.
  - If `punchT > 0`: pick frame 10/11/12/13 from elapsed time, draw it, skip procedural attack overlay, return.
  - Else if `recoverT > 0`: draw frame 14, return.
- Update `computeWalkPose` arg (line 4092): `f.kickT > 0` → `f.punchT > 0 || f.recoverT > 0`.
- Remove the grounded-kick branch in `poseFor` (lines 4117–4125) — no longer needed since the sprite drives the punch.
- Remove `KICK_*` constants.

### 4. `src/components/game/GameCanvas.tsx`
- T (P1) and P (P2) handlers + `KickButton` touch button → call `engine.pressPunch`. Update comment + aria-label to "Punch". (Component name kept as `KickButton` internally is fine, or renamed — minor.)

### 5. `src/game/ai.ts`
No `pressKick` calls — nothing to update.

## Acceptance
- Walking only cycles frames 1–10.
- T / P play frames 11→14 once with a 1-dmg hit on 12–13 + brief hit-pause.
- Frame 15 plays once after each punch as recovery, never loops, never appears mid-walk.
- All skins inherit the punch (overlays are baked per-frame already).
- No leftover `kickT` / `KICK_*` references.
