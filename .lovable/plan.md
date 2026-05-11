# Unified Character Render Architecture — Pelvis-Rooted Transform Refactor

## Problem

Cosmetic skins, sprite frames, procedural rig, ragdoll tumble, recoil offsets, capes, weapon trails and FX anchors each apply transforms in **different coordinate spaces with different pivots**:

- `drawFighter` wraps hit-reaction `translate/rotate/scale` around feet `(f.x, f.y + FIGHTER_H)`.
- `drawFighterAt` (procedural) translates to `(x + bodyLagX, y)`, then `translate(0, FIGHTER_H)` + `rotate(pose.lean + bodyRoll)` — **feet pivot**.
- `drawFighterAt` (sprite path) draws `drawWalkFrame` at `(x + bodyLagX, y + FIGHTER_H)` with **no rotation at all**, so torso/hip rotation, ragdoll spring tilt, and recoil never reach the sprite.
- Ragdoll tumble rotates the sprite around `(x + bodyLagX, y + FIGHTER_H * 0.5)` — **sprite-center pivot**.
- Weapon trails, cape, emblem and FX anchors sample joints in **world space** (`f.x + lp[0]`, `f.y + lp[1]`), bypassing the body transform stack entirely.
- `applyRagdollPose` writes additive offsets onto Pose only — sprite path ignores Pose, so springs never affect the cosmetic body.

Net effect: the skeleton solves a pose, but each layer pins to a different anchor → visible skin/skeleton drift on kicks, torso rotation, recoil, airborne spin.

## Goal

One pelvis-rooted transform stack used by every visual layer (sprite, procedural rig, cape, emblem, eyes, weapon trails, FX anchors, shadow). Ragdoll and recoil resolve **before** any cosmetic draw. After the root stack is pushed, all rendering happens in **pelvis-local space** — no system is allowed to issue world-space coordinates.

## Plan

### 1. Canonical FighterTransform (single source of truth)

Add a per-fighter, per-frame struct computed once before any draw:

```text
FighterTransform {
  pelvisX, pelvisY        // world-space pelvis anchor (y + FIGHTER_H * 0.62)
  facing, facingVisual    // ±1 + signed magnitude from facingT
  rootRot                 // pose.lean + bodyRoll + ragdoll torsoAng
  hipRot, torsoRot        // for spine bend (downstream skeleton)
  recoilX, recoilY        // hit-reaction translate
  recoilRot               // hit-reaction rotation
  squashX, squashY        // hit-reaction scale + wobble squash
  bodyOffsetX, bodyOffsetY// ragdoll spring bodyOff
  ragdollRot              // tumble (only when ragdollT>0)
  worldMatrix             // baked DOMMatrix (allocation-free, reused)
}
```

Store one preallocated instance per fighter on the engine (no per-frame allocation). All hit-reaction, ragdoll, wobble and recoil math collapses into populating this struct.

### 2. Canonical render-root push (fixed transform order)

Replace every scattered `ctx.save/translate/rotate/scale` block in `drawFighter`, `drawFighterAt` (sprite + procedural branches), ragdoll/down/get-up branches, and ghost trails with a single helper:

```text
pushFighterRoot(ctx, xform):
  ctx.save()
  translate(pelvisX, pelvisY)
  scale(facingVisual, 1)             // facing + yaw foreshortening
  translate(recoilX, recoilY)
  rotate(rootRot + ragdollRot + recoilRot)
  scale(squashX, squashY)
  translate(bodyOffsetX, bodyOffsetY)
// >>> from here all coords are pelvis-local <<<
```

Paired `popFighterRoot(ctx)` for cleanup. After this push, **no system may issue world-space coordinates** — enforced by code review and DEBUG_RIG visualization.

### 3. Pelvis is the only pivot

Remove all feet-pivot patterns (`translate(0, FIGHTER_H)` / `rotate` / `translate(0, -FIGHTER_H)`) and the sprite-center ragdoll pivot. Everything rotates at pelvis origin via the single `rotate` in step 2.

### 4. Sprite body becomes a pelvis-local child

- Change `drawWalkFrame` call sites: instead of `(x + bodyLagX, y + FIGHTER_H)`, draw at pelvis-local coords `(0, FIGHTER_H * 0.38)` (feet relative to pelvis) **after** the root stack is pushed.
- Sprite now inherits `rootRot`, recoil rot/scale, ragdoll spring offsets, and yaw foreshortening automatically — closing the main drift gap.
- Sprite ragdoll path: drop the separate translate/rotate; ragdoll tumble already sits inside `rootRot + ragdollRot`.

### 5. Procedural skeleton owns cosmetic binding

- `poseFor` joints re-anchor to **pelvis-local** by subtracting the pelvis offset once at pose-compose time.
- After the skeleton solves, expose a **final solved joint table** (shoulders, elbows, hands, hips, knees, feet, head, chest) in pelvis-local space.
- Cape, emblem, eyes, weapon-trail anchors, slash arcs, sparks, shadow all read from this table — no more `f.x + lp[0]` style world-space sampling.
- Weapon-trail sampling loop (engine.ts ~5848): convert to pelvis-local sampling, then bake to world via the cached `worldMatrix` once per sample.

### 6. Ragdoll/recoil resolve before render

New per-fighter pipeline, executed in `update()` before `draw()`:

```text
simulation → ragdoll solve → recoil solve → compose FighterTransform
→ skeleton solve (pose + joints in pelvis-local)
→ cosmetic attachment solve (cape/emblem/trail anchors)
→ render
```

Cosmetic layers consume the **final** transform — never the pre-recoil pose.

### 7. Kick extension stabilization

During `comboKind === "kick"` active frames:

- Mark planted foot as a temporary positional anchor; `pelvisX` is clamped so the planted foot's world position cannot drift > N pixels (small threshold, e.g. 3 px).
- Suppress kick-side recoil chain contribution (`recoilX` from the kick limb is multiplied by ~0.4) so the torso does not slide to "follow" the extended foot.
- Result: powerful extension reads, body stays anchored.

### 8. Silhouette protection

After joint solve, enforce stability clamps before rendering:

- Torso center stays within a pelvis-relative corridor (±X px).
- Shoulder width cannot collapse below threshold (no negative scale collapse).
- Head stays within head-to-chest distance bounds.
- Limbs cannot cross torso center beyond a max angle.
- If violated, scale the offending procedural offset down (not the rig) — readability over simulation.

### 9. Stability guardrails

Already partially present in ragdoll.ts (epsilon filter, clamps). Extend to the new transform layer:

- NaN guard on every field of `FighterTransform`; if NaN, fall back to identity for that field.
- If dt > 50ms or FPS counter < 30, reduce `bodyOffsetX/Y`, `recoilX/Y`, and ragdoll amplitude by 50% for that frame.
- Clamp `rootRot` to ±1.5 rad, `recoilRot` to ±0.5 rad, `squashX/Y` to [0.6, 1.4].

### 10. DEBUG_RIG overlay (temporary, gated)

Add `DEBUG_RIG` flag (off by default; toggle via `?rig=1` query param read in `GameCanvas`). When on, after the root stack is pushed, draw:

- Pelvis root (magenta filled dot, r=3)
- Torso pivot (cyan ring at chest joint)
- Joint chain (yellow dots: shoulders, elbows, hands, hips, knees, feet, head)
- Cosmetic anchors (green crosses: cape root, emblem center, weapon-trail anchor)
- Final transformed bounding box (thin white outline)
- Planted-foot lock indicator (red ring during kick)
- Recoil vector (orange line from pelvis)

Removed/gated after tuning; zero gameplay impact.

## Files affected

- `src/game/engine.ts`
  - New: `FighterTransform` interface near top, `computeFighterTransform(f)` helper near `poseFor`.
  - New: `pushFighterRoot(ctx, xform)` / `popFighterRoot(ctx)` helpers.
  - New: `solveJoints(f, pose)` returning a preallocated pelvis-local joint table.
  - Refactor: `drawFighter` (lines 6428–6483), `drawFighterAt` sprite branch (6580–6923), `drawFighterAt` procedural branch (6947+), ragdoll/down/get-up sprite blocks (6636–6707), ghost-trail loop (5827–5842), weapon-trail sampling (5848–5854), cape/emblem/eyes overlay draw sites.
  - Add: kick-extension planted-foot anchor logic (consumes `comboKind === "kick"` active window).
  - Add: silhouette clamps + stability guardrails.
- `src/game/ragdoll.ts`
  - No API change. `applyRagdollPose` now contributes only **limb-level** local offsets; root-level `bodyOffX/Y` and `torsoAng` flow through the new `computeFighterTransform`. (These fields are already public on RagdollState.)
- `src/game/walkSprite.ts`
  - `drawWalkFrame` signature unchanged. Call sites switch to pelvis-local coords.
- `src/components/game/GameCanvas.tsx`
  - Read `?rig=1` from `window.location.search`; expose `DEBUG_RIG` boolean to engine.

## Out of scope

- Gameplay, hitboxes, AI, balance, timers, movement — unchanged.
- No new procedural systems; no retuning of existing ragdoll/recoil values.
- No skin asset or sprite-sheet changes.
- No new dependencies.

## Verification

1. `bunx tsc --noEmit` clean.
2. Visual checks at 393×583, low-FPS throttle:
  - **Walk / sprint**: skin sits exactly on rig at all phases.
  - **Heavy kick extension**: torso stays over planted foot; cape/emblem track shoulders.
  - **Aerial kick / airborne spin**: no separation between sprite body and weapon-trail anchor.
  - **Light/heavy/juggle hit-reactions**: skin rotates at hip pivot, no sprite-center slide.
  - **Launcher**: cosmetics follow the spinning body without lag.
  - **Ragdoll tumble**: sprite, cape, FX anchors all rotate together around hip.
  - **Slow-mo finisher**: silhouette stable, no jitter or stretch.
3. Toggle `?rig=1`: pelvis dot stays glued to body center across all states above; planted-foot lock activates during kick frames; cosmetic anchors stay on green crosses.
4. Performance: idle + heavy combat at <2ms/frame on the canvas path on the 393×583 viewport.

# Additional AAA Render Architecture Rules

## 11. Transform Authority Contract

Every renderable fighter component must declare:

- its parent transform

- whether it operates in local or world space

- whether it is allowed to mutate transforms

Rules:

- ONLY FighterTransform may own world-space transforms.

- All child systems are read-only consumers.

- No child system may apply additional root translations or rotations.

This prevents future drift regressions when new skins or FX are added.

---

# 12. Local/World Space Enforcement

Introduce explicit conversion helpers:

ts worldToPelvisLocal() pelvisLocalToWorld() applyRootTransform() 

Ban manual:

ts f.x + offsetX f.y + offsetY 

outside of:

- computeFighterTransform()

- pelvisLocalToWorld()

This guarantees:

- one canonical conversion path

- no hidden coordinate drift

- deterministic attachment behavior

---

# 13. Animation Authority Hierarchy

Current systems can still fight for ownership of the same body region.

Define explicit authority:

text ragdoll > hitReaction > attackPose > locomotion > idle 

Higher-priority systems may overwrite lower layers.

Lower layers may only add approved secondary offsets.

Example:

- ragdoll owns torso rotation

- locomotion may NOT add torso lean during ragdoll

- recoil may add additive hand shake only if torso authority is free

This prevents:

- double rotations

- additive drift

- conflicting pose math

---

# 14. Root Motion Isolation

Separate:

- gameplay position

from

- visual body offsets

ts fighter.x/y      = gameplay truth bodyOffsetX/Y    = render-only 

Rules:

- gameplay never reads render offsets

- hitboxes never inherit render offsets

- networking never serializes render offsets

Prevents:

- desync

- hitbox drift

- simulation corruption

---

# 15. Attachment Lifecycle System

All cosmetics and overlays become registered attachments:

ts Attachment {   joint   localOffset   inheritsRotation   inheritsScale   inheritsRagdoll   inheritsRecoil } 

Examples:

- cape inherits all

- floating aura ignores recoil rotation

- weapon trail inherits hand rotation only

This future-proofs:

- skins

- cosmetics

- weapons

- character variants

- animated accessories

without new special-case code.

---

# 16. Anti Double-Transform Protection

Current architecture risks:

- root rotation applied twice

- recoil scale stacked twice

- ragdoll offsets compounded

Add per-frame transform flags:

ts rootApplied recoilApplied ragdollApplied 

Debug assert if a transform category is applied twice in one render path.

This catches:

- invisible hierarchy bugs

- future regression drift

- stacked transform explosions

---

# 17. Pelvis-Space Skeleton Contract

The procedural skeleton MUST exist entirely in pelvis-local space.

Rules:

- joints never store world coordinates

- springs never simulate in world space

- IK never solves in world space

- pose layers never write world positions

World-space conversion happens ONLY at final render extraction.

Benefits:

- deterministic animation

- stable ragdoll blending

- simpler recoil math

- easier future networking/replays

---

# 18. Matrix Caching & Dirty Flags

FighterTransform.worldMatrix should only rebuild when:

- pelvis moved

- facing changed

- recoil changed

- root rotation changed

- scale changed

Add:

ts transformDirty 

Avoid rebuilding matrices multiple times per frame for:

- trails

- overlays

- shadows

- debug rig

Important for mobile combat scenes.

---

# 19. Secondary Motion Containment

Secondary systems:

- wobble

- springs

- head lag

- cloth sway

- cape follow-through

must NEVER modify:

- pelvis

- gameplay root

- authoritative torso position

They may only:

- offset child joints

- modify additive visual layers

Prevents “floaty body syndrome.”

---

# 20. Cinematic Stability Rules

During:

- slow motion

- finishers

- airborne spins

- heavy launches

Automatically:

- reduce secondary motion amplitude

- increase silhouette stabilization

- tighten spring damping slightly

- prioritize strong readable poses

Reason:

cinematic moments magnify instability.

Premium combat games stabilize during emphasis frames.

---

# 21. Final Visual Target

The final result should feel like:

- a single physically connected fighter

- one coherent body mass

- premium physics-assisted animation

- readable modern platform fighter motion

NOT:

- layered sprites

- cosmetic attachments

- disconnected transforms

- procedural math artifacts

The player should never perceive:

“animation + skin.”

They should perceive:

ONE living combatant.