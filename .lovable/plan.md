## Goal
Keep the imported 14-frame walk silhouette as the universal body/animation for every fighter, but render each character with their own colors AND character-specific face + costume details (mask, cowl, cape, chest emblem, eyes) drawn on top of the frames. No more generic gray stickman — Spider-Man looks like Spider-Man, Batman has the cowl + bat emblem, Homelander has the cape + H, etc.

## What I'll build

### 1. Bake per-frame anatomy anchors (one-off, dev-time)
Run a script over the existing sheet (`src/assets/walk-sheet.png`, 14×144×200) to extract, per frame:
- `head`: {x, y, r} — top cluster centroid + radius
- `chest`: {x, y} — mid-torso point (~35% down the silhouette)
- `hipY`, `footY` — vertical anchors

Result: a static `WALK_ANCHORS: WalkAnchor[]` table written to `src/game/walkAnchors.ts` (~14 × 6 floats). No runtime cost beyond a lookup.

### 2. Extend the skin schema
Add to `src/game/skins.ts`:
- `face`: `"full-mask" | "cowl" | "open" | "goggles" | "visor"` 
- `faceColor`, `eyeColor`, `eyeShape` (`"slit" | "round" | "spider-lens" | "domino"`)
- `chestEmblem`: existing `emblem` extended with size + offset
- `capeShape`: `"long" | "short" | "tattered" | null`

Fill in plausible values for the 11 existing characters (Spider-Man → full-mask + spider-lens eyes + spider emblem; Batman → cowl with ears + oval bat emblem + cape; Homelander → open face + cape + H emblem; etc.).

### 3. Per-skin composited sheet (cache)
Rewrite `getTintedSheet(skin)` in `src/game/walkSprite.ts` to take the full `Skin` object (not just a color string) and return a per-character cached canvas:
1. Tint the silhouette using `skin.limb` (legs/arms).
2. Re-tint the torso area (using anchors) with `skin.body` via a soft mask so legs and torso can differ (Superman blue body / red boots, Batman all-black, Iron Man red+gold).
3. Tint the head region with `skin.head` / `skin.faceColor`.
4. Draw character overlays per frame, pinned to the anchors:
   - Cowl ears (Batman) — two small triangles above head
   - Cape (Superman, Batman, Homelander) — soft shape behind/under, drawn as a separate trailing layer
   - Chest emblem — shape from `skin.emblem` scaled to chest anchor
   - Eyes — drawn at head anchor (white spider lenses, glowing red for Homelander/Hulk, yellow Batman slits)
   - Beard (Butcher) — short dark patch under head anchor
   - Speed streaks (Flash, A-Train) — drawn at runtime in the engine, not baked

Cache key = `skin.id`. Caches are tiny (≈14 × 144 × 200 RGBA ≈ 1.6 MB per skin worst case; only currently-fighting skins are cached, max 2).

### 4. Update the engine call site
`src/game/engine.ts` already calls `drawWalkFrame(ctx, tint, frame, …)`. Change signature to `drawWalkFrame(ctx, skin, frame, …)` and pass `f.skin` instead of a color string. Speed streaks for Flash/A-Train stay as the existing runtime overlay (they're motion-dependent).

### 5. Cleanup
- Remove the universal-gray fallback path; the sprite is now skin-aware always.
- Keep the procedural attack-arms overlay on top of the sprite legs unchanged.
- Mobile budget: per-frame draw is still one `drawImage` from a cached canvas — no per-frame compositing on the hot path.

## Files touched
- `src/game/walkAnchors.ts` (new) — baked anchor table
- `src/game/walkSprite.ts` — per-skin compositor + cache + overlays
- `src/game/skins.ts` — extended face/cape/emblem fields for all 11 skins
- `src/game/engine.ts` — pass skin object instead of tint string

## Risk / fallback
If a character looks off, each overlay is independent — I can adjust head/chest anchor offsets or per-skin overlay params without touching the core sprite path. If anchor extraction misreads a frame (silhouette too thin), I fall back to the average across frames so overlays stay stable instead of jittering.

## Acceptance
- Each of the 11 characters reads as themselves at a glance during walk, idle, and attack.
- Frame rate unchanged on the mobile preview (still one `drawImage` per fighter per frame in the hot path).
- No new runtime dependencies.
