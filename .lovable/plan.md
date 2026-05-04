## Stickman Neon Duel — v2: Animated Maps, Hero Skins, Better Movement

Three upgrades on top of the current MVP. Everything stays offline, single-device, Canvas 2D.

### 1. Animated Battle Maps (3 maps, picker before fight)

Add a **Map Select** screen between the landing page and the fight. Each map is a hand-drawn animated background rendered every frame on the canvas — no images, all procedural so it stays crisp and lightweight.

- **Neon City Rooftop** — parallax skyline, scrolling neon billboards, blinking antenna lights, drifting smog particles, distant lightning flashes
- **Cyber Dojo** — paper-lantern glow that pulses, falling cherry-blossom petals, koi-pond ripples in the foreground, bamboo silhouettes swaying
- **Hell's Arena** — molten lava cracks that pulse orange, rising ember particles, chains swinging slowly in the background, occasional fireball arc across the sky

Each map keeps the same playable geometry (ground + two floating platforms) so balance is unchanged. Only visuals/ambience differ. Map is picked once per match; "Rematch" reuses it, "Change map" returns to the picker.

### 2. Skins — Marvel / DC / The Boys (stickman style)

A **Skin Select** step for each player after map select. Stickmen stay stickmen — no bitmap art — but each skin adds a small set of signature touches drawn procedurally:

- **Marvel**
  - Spider-Man: red body, blue limbs, white eye-patches on head, web pattern faintly on torso
  - Iron Man: red+gold armor plates as thicker line segments, glowing arc-reactor circle on chest
  - Hulk: green body, slightly thicker limbs, torn-pant zigzag at thighs
- **DC**
  - Batman: black body, grey cowl ears (two triangles on head), yellow oval on chest, cape line trailing behind
  - Superman: blue body, red cape behind, yellow S-shield on chest
  - The Flash: red body, yellow lightning-bolt earpieces, motion streaks behind when running
- **The Boys**
  - Homelander: navy body, red+white cape, glowing white eyes (laser dots that flicker)
  - Butcher: black coat outline (wider torso silhouette), dark beard dots on head
  - A-Train: red body with white stripe down chest, exaggerated speed streaks while moving

Each skin is just: body color, glow color, optional cape (extra polyline behind torso), optional head accent (cowl/eyes/mask), optional chest emblem (small shape), and an optional movement-streak flag. The stickman skeleton + animation system is shared.

A simple two-column "P1 picks / P2 picks" screen with arrow buttons to cycle skins, preview rendered live.

### 3. Smoother, Slower Movement + Real Walk Cycle

Replace the current "swing the legs" placeholder with a proper 4-joint walk cycle.

- **Speed**: lower max walk speed (~210 px/s, was 320). Acceleration/deceleration smoothing so fighters ease in and out of motion instead of snapping.
- **Jump**: slightly lower jump (~620 px/s) and softer gravity to feel floatier and more readable.
- **Walk cycle**: each leg has a hip and a knee joint. Phase-driven so the front leg lifts, knee bends, foot plants, back leg pushes — alternating naturally. Step rate scales with actual horizontal velocity (no walking-in-place when stationary).
- **Arms**: opposite-phase swing to the legs, with a slight elbow bend.
- **Idle**: subtle breathing bob (head + shoulders rise/fall ~2 px) when standing still.
- **Air pose**: tucked-knee jump pose; falling pose extends the legs slightly.
- **Turn**: when facing flips, brief 0.1s lean instead of an instant snap.

All animation driven by a single phase value per fighter and the existing fixed-timestep loop — no new dependencies.

### Flow after v2

```
Landing  →  Map Select  →  Skin Select (P1, P2)  →  FIGHT  →  K.O.
                                                         ├─ Rematch (same map+skins)
                                                         └─ Change setup (back to Map Select)
```

### Technical sketch

- New files
  - `src/game/maps.ts` — map definitions + per-map `drawBackground(ctx, t)` animation functions
  - `src/game/skins.ts` — skin catalog (color, glow, cape, headAccent, chestEmblem, streaks)
  - `src/game/animation.ts` — `computeWalkPose(phase, velocity, onGround)` returning joint angles for hips/knees/shoulders/elbows
  - `src/components/game/MapSelect.tsx`
  - `src/components/game/SkinSelect.tsx`
- Edited
  - `src/game/engine.ts` — accept `mapId` + `{p1Skin, p2Skin}` in constructor/reset; new movement constants; replace `drawFighter` with skeleton renderer that consumes `computeWalkPose` and skin
  - `src/components/game/GameCanvas.tsx` — manage screens (map → skins → fight), pass selections to engine, "Change setup" button on K.O. screen
  - `src/routes/play.tsx` — unchanged shell; GameCanvas owns the screen state machine

No new npm packages. No backend. Existing controls and abilities (Fire Blast, Teleport) untouched.

### Out of scope for this pass

- New abilities (Ice/Wind/Rock) — still saved for a later pass
- Sound effects
- Online play
- Real ragdoll physics (still planned for the matter.js pass)
