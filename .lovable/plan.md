## What's in the uploads (verified by inspecting every frame)

### `stick.zip` — 69 frames, big mixed motion library
- **1–3** idle / walking start
- **4–11** front kick + high kick chamber + extension
- **12–22** walk + side/roundhouse kick variants
- **23–25** Superman-style flying dive (prone, arms forward)
- **26–32** walk + run cycle
- **33–43** sword/weapon slashes with motion-blur trails
- **44–45** thin stab / knife
- **46–57** spear overhead, throwing windup, throw release
- **58–60** small ^^^ marks (speed/jump arrows — FX, not body)
- **61–65** hit reaction (hands to face, recoil) — usable as **hurt / block**
- **66–69** detached limb fragments (KO bits)

### `taijutsu.zip` — 42 frames, martial arts
- **1–14** guarded boxing stance + side step + parry
- **15–17** knee strikes
- **18–22** high kicks
- **23–30** ready stances (wide/low)
- **31–32** lying on ground (KO pose)
- **33–37** get-up-from-prone sequence
- **38–42** walk back to neutral

### `npc1-2.zip` — 66 frames (same base style as the current walk sheet)
- **1–15** same walk + punch + recovery already in the sheet
- **16–21** extra punch / jab variants
- **22–29** spinning weapon combo with trails
- **30–34** running cycle
- **35–46** **falling / lying / get-up sequence** — usable as ragdoll snapshots even though motion is physics-driven
- **47–50** walking
- **51–58** zip / rope / swing combos
- **59–66** running

### `flash.zip` — 5 frames
A horizontal speed-streak with a tiny head — pure FX overlay. Perfect for Flash/A-Train dash trails (replaces current procedural streaks).

### `audio.zip`
- `2.wav` — short UI tick (~6 KB)
- `attack_[cut_7sec].mp3` — 7-second attack/whoosh loop

### Honest gap: **there is no dedicated jump cycle**
No file contains a clean takeoff → air → land sequence. The closest usable poses are scattered across the packs (squat, dive, landing crouch). I'll have to synthesize the jump from those.

---

## Proposed implementation

### A. Cleanup (remove old stuff)
- Delete the procedural air-pose, jump-tuck, and stick-figure ragdoll branches in `animation.ts` / `engine.ts` that draw the segmented stickman during airborne / KO states (the lines + colored joints visible in your screenshot).
- Remove `wobble.ts` segment-rendering paths used only for the downed/jump frames.

### B. Extend the universal sprite sheet (`src/assets/walk-sheet.png`)
Append new frames to the existing 15-frame strip, in this order, all at 144×200, foot-anchored:

| Slot | Source | Purpose |
|--|--|--|
| 15 | stick #21 (squat) | Jump takeoff (crouch) |
| 16 | stick #14 (upright airborne) | Jump rising |
| 17 | stick #14 mirrored / npc #31 | Jump apex |
| 18 | npc #41 (crouched landing) | Jump landing squash |
| 19 | npc #35 (lying flat) | Downed / KO pose |
| 20 | npc #42 (rising) | Get-up frame 1 |
| 21 | npc #44 (rising upright) | Get-up frame 2 |
| 22 | stick #61 (recoil hands-up) | Hit reaction / block |
| 23 | taijutsu #15 (knee strike) | Heavy attack frame (future special) |
| 24 | taijutsu #19 (high kick) | Heavy kick (future special) |

`walkSprite.ts` gets new exports: `JUMP_TAKEOFF=15`, `JUMP_RISE=16`, `JUMP_APEX=17`, `JUMP_LAND=18`, `DOWN_FRAME=19`, `GETUP_FRAME_A=20`, `GETUP_FRAME_B=21`, `HURT_FRAME=22`. New `WALK_ANCHORS` entries extracted via the same alpha-scan I used last time.

### C. Wire jump into the engine
- In the renderer (the same `drawWalkFrame` block that already handles walk/punch/recovery):
  - If `f.vy < -50 && !f.onGround`: draw `JUMP_RISE`
  - Else if `!f.onGround && f.vy > 50`: draw `JUMP_APEX` (falling)
  - Else if `f.justLandedT > 0`: draw `JUMP_LAND` for ~0.10s
  - Else if `f.jumpWindupT > 0`: draw `JUMP_TAKEOFF` for ~0.06s
- Add `jumpWindupT` and `justLandedT` fields to `Fighter`. `pressJump` sets windup; the existing jump impulse fires at windup end. `onGround` transition from false → true sets `justLandedT`.

### D. Restyle ragdoll as solid silhouette (physics-driven, no sprite)
- Keep all current ragdoll physics (velocity, spin, bounce).
- Replace the segmented-stickman draw with a single skin-tinted silhouette: rotate `DOWN_FRAME` (sprite #19) around the body's center using the existing physics rotation. While `f.downedT > 0 && !ragdolling`, draw `DOWN_FRAME` upright.
- Get-up plays `GETUP_FRAME_A` → `GETUP_FRAME_B` over `f.getUpT`, then back to walk.

### E. Flash dash overlay (`flash.zip`)
- Bake the 5 streak frames into `src/assets/flash-streak.png` (single strip, 64×24 each).
- During Flash/A-Train dash, draw the streak behind the fighter, advancing one frame every 30ms. Removes the current procedural trail dots.

### F. Hit reaction (frame 22)
- During `f.hitFlash > 0 && f.hitstunT > 0` (new field, ~0.18s after a heavy hit), render `HURT_FRAME` instead of the walk sprite. Adds visible flinch on every clean hit.

### G. SFX swap (`audio.zip`)
- Drop `2.wav` into `src/assets/sfx/` as new menu tick (`Sfx.play("blip")` source).
- Slice the 7-sec attack mp3 into 3 short stings (windup whoosh, mid swing, impact thud) using ffmpeg, save as new SFX, wire into `combat.ts` move specs that currently use generic `whoosh`/`punch`.

---

## What I will NOT do
- I won't fabricate a true 5-frame jump arc — the source frames don't exist. The 4-frame crouch/rise/apex/land approximation above is the best I can do without you drawing more frames.
- I won't touch the existing walk/punch/recovery animation — only extend the sheet.

## Acceptance
- No more visible stick-figure segments in midair, downed, or KO states — only solid silhouettes with the character's design.
- T fires sprite punch (already done). Jumping shows takeoff/air/land sprites. Getting hit shows hurt frame. Ragdoll uses skin-tinted silhouette rotating with physics.
- Flash dashes leave a sprite streak.
- New SFX play on attacks.
