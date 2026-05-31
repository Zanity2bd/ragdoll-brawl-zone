## Goal
Ship Spider-Man as a single authored sprite frame. Zero runtime heuristics. Zero overlays. All Spider-Man visual code lives in exactly two places: `spider-mask.png` and the Spider-Man bake path in `walkSprite.ts`.

## Architecture

```text
walk-sheet.png  ─┐
                 ├─►  bake once at app start  ─►  cached Spider-Man sheet  ─►  drawImage(frame)
spider-mask.png ─┘                                  (red+blue+eyes baked in)
   (hand-authored,
   pixel-aligned to
   walk-sheet.png)
```

After bake: match, lobby, and selector all render Spider-Man via the same single `drawImage(frame)` call.

## Hard Rules (non-negotiable)

1. **Atlas wins.** If a frame looks wrong, fix `spider-mask.png`. Never add runtime logic to patch a frame.
2. **Single source of truth.** Spider-Man visual code may exist ONLY in `spider-mask.png` and the Spider-Man bake path in `walkSprite.ts`. Forbidden in: `engine.ts`, `animation.ts`, `ragdoll.ts`, `drawFighter()`, `drawFighterAt()`, `walkCycleV2.ts`, lobby previews, selector previews, attachment systems, cosmetic systems.
3. **Silhouette is the hard clip.** The mask is composited via `source-in` against the silhouette alpha — mask pixels outside the silhouette are physically discarded. The atlas cannot widen torso, thicken limbs, enlarge the head, or broaden shoulders. Stickman proportions are locked.
4. **Future visual changes = atlas changes.** Any future Spider-Man visual tweak modifies the PNG, not the renderer.
5. **The atlas is a hand-authored asset.** Topology segmentation may produce a *draft* starting point. The final `spider-mask.png` is hand-authored. The generated output is provisional only. Any frame that fails visual review must be manually corrected in the atlas. Visual quality takes priority over algorithmic consistency.
6. **Character Identity Rule.** Spider-Man must remain recognizable primarily through: **mask shape, eye shape, red/blue color blocking** — NOT through symbols, overlays, or small details. If the chest emblem were removed entirely, the character should still read instantly as Spider-Man. The emblem is supporting detail, not the source of identity.
7. **No Frame Left Behind.** A frame is complete only if idle, walk, punch, kick, hurt, ragdoll, and get-up all look correct. A single bad frame fails the skin. Quality is determined by the weakest frame, not the strongest.
8. **Forward standard (aspirational).** New premium skins should adopt this pipeline. Existing skins are NOT retroactively rebuilt this turn.

## Steps

### 1. Author the mask atlas → `src/assets/spider-mask.png`
- Same dimensions as `walk-sheet.png` (30 frames × 144×200).
- Color encoding:
  - **Red** → Spider-Man red (mask + torso + hands + feet)
  - **Blue** → Spider-Man blue (arms + legs)
  - **White** → eye lens
  - **Transparent** → ignore
- **Two-phase authoring:**
  - *Phase A (draft):* one-shot Node script loads `walk-sheet.png`, runs topology segmentation per frame as a starting point, writes `spider-mask.png`.
  - *Phase B (hand-authored):* visually review every frame against the per-animation criteria in Rule 7. Any frame that fails is hand-corrected pixel-by-pixel in the PNG. Rule 5 applies: the asset is the source of truth, the script output is provisional.
- Only the final PNG ships. Script is discarded.

### 2. Rewrite Spider-Man bake in `walkSprite.ts`
Replace `bakeSpidermanFrames()` with ~30 lines:
1. Load `spider-mask.png` alongside `walk-sheet.png`.
2. Per frame:
   - Draw silhouette alpha to cache canvas.
   - Draw mask with `source-in` → silhouette carries mask colors, hard-clipped to body shape.
3. Cache. No anchors, no per-row scans, no torso bands, no heuristics.

### 3. Delete every other Spider-Man render path
- `src/game/walkSprite.ts` — remove Spider-Man branches in `drawOverlays`, `drawEyes`, legacy chest ellipse.
- `src/game/engine.ts` — purge Spider-Man *drawing* code (~7969–7994, ~8094, ~8264). Web-swing / wobble / AI / snare gameplay stays.
- `src/components/game/Lobby.tsx` — confirm no procedural spider preview.
- `src/components/game/SkinSelect.tsx` — already uses `drawWalkFrame`; verify.
- `src/game/walkCycleV2.ts` — Spider-Man bypassed or uses the same mask. No second visual source.

### 4. Cache bust
Bump `SKIN_CACHE_VERSION` in `walkSprite.ts`.

### 5. QA — non-skippable

**Frame consistency sweep:** 0, 3, 6, 9, 12, 17, 22, 24, 28 (walk cycle, jump apex, hurt, kick, slash).

**Three tests per frame:**
1. **Black silhouette test** — fill cached sheet alpha black. Must read as clean athletic stickman. Proportions identical to base fighter.
2. **Color stability test** — flip frames at 9 FPS. Red/blue boundary must look like *a costume moving with the body*, NOT *colors sliding across the body*.
3. **Cross-view test** — selector, lobby, and in-match must be visually identical.

**No Frame Left Behind sweep:** for every frame, walk through idle/walk/punch/kick/hurt/ragdoll/get-up criteria. Any failure → hand-fix the PNG.

**Identity test:** mentally erase the chest emblem. Character still reads as Spider-Man. If not, the mask/eye shape needs work — not more decoration.

Verify at **393×583**.

## Guarantees
- **Zero drift** — mask pixel-aligned to silhouette at authoring time.
- **Single source of truth** — one PNG, one bake function, one `drawImage`.
- **Stickman proportions locked** — silhouette alpha is the hard clip.
- **Identity stable** — mask + eyes + color blocking carry recognition, not symbols.
- **Fixable without code** — any pose issue = paint fix in the PNG.
- **No bundle bloat** — ~10–30 KB PNG.
- **Hot path unchanged** — one `drawImage` per fighter per frame.

## Out of scope
- All 10 other skins (Rule 8: aspirational only).
- Spider-Man *gameplay* (web swing, snare, AI, wobble, stance) — untouched.
- Animation, ragdoll physics, attack frames — untouched.

## Success criteria
- Stickman first, Spider-Man second, readable at 50% zoom.
- No blue leakage. No torso-shirt effect. No drifting eyes.
- Selector = lobby = match.
- Whole character moves as one image through every attack, ragdoll, and recovery.
- A viewer perceives a costume on a body, not colors on a canvas.
- Removing the chest emblem would not break recognition.
- Every frame passes the per-animation review — no weak frames carried by strong frames.