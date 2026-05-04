# Add 10 Animated Dark (Non-Neon) Maps

Extend the map roster with 10 new gritty, realistic locations. Each is procedurally drawn on the existing canvas with a muted/dark palette (no neon glows, minimal `shadowBlur`) so they stay mobile-friendly and visually distinct from the existing 3 neon maps.

## New maps (all dark, animated, low-GPU)

1. **Backstreet Town** — brick wall, flickering streetlamp, drifting trash, distant rain.
2. **Underground Car Park** — concrete pillars, parked car silhouettes, swinging fluorescent tube, slow fog band.
3. **Forgotten Temple** — stone columns, hanging vines swaying, dust motes in shafts of light, cracked floor.
4. **Suburban Living Room** — sofa + lamp + TV with animated static glow, ceiling fan rotating shadow, framed pictures.
5. **Derelict Spaceship Corridor** — riveted metal walls, blinking red alert strip, sparks from broken panel, slow flicker.
6. **Open Space (Zero-G)** — starfield parallax, slow-rotating planet on horizon, drifting debris, no ground line (thin energy plate instead).
7. **Rooftop at Dusk** — air-con units, antenna, slow cloud parallax, pigeons crossing, muted orange/grey gradient.
8. **Warehouse** — stacked crates, hanging chain hook swaying, dusty light shaft, forklift silhouette.
9. **Subway Platform** — tiled wall, yellow safety line, train light approaching every ~8s, fluorescent flicker.
10. **Foggy Forest Clearing** — layered tree silhouettes parallax, drifting fog ribbons, falling leaves, moonless overcast sky.

## Technical details

- File: `src/game/maps.ts`
  - Extend `MapId` union with 10 new ids (`backstreet`, `car-park`, `temple`, `living-room`, `spaceship`, `space`, `rooftop-dusk`, `warehouse`, `subway`, `forest`).
  - Add a `drawXxx(ctx, t, W, H, GROUND_Y)` per map. All use:
    - Muted gradients (greys, browns, deep blues, slate) — no oklch chroma > ~0.08 except small accent lights.
    - `shadowBlur` only for 1 small element per map (or none); rely on solid shapes + alpha for atmosphere.
    - ≤ ~20 animated particles per map; reuse `t` for sin-based sway/flicker.
    - Cheap shapes: `fillRect`, `quadraticCurveTo`, simple `arc`. No per-frame gradient creation inside loops.
  - Add a `tone: "neon" | "dark"` field to `BattleMap` so the selector can group/style them.
  - Append all 10 entries to `MAPS` after the existing 3.

- File: `src/components/game/MapSelect.tsx`
  - Render two sections: **Neon** and **Dark / Realistic**, grouped via `tone`.
  - Keep existing lazy-mounted preview canvases; the same `drawBackground` runner works unchanged.
  - Mobile-first: stays in single-column stacked grid on narrow viewports; tap targets ≥ 60px; only the in-view preview animates (already implemented via IntersectionObserver pattern).

- File: `src/game/engine.ts`
  - No engine changes needed — it already calls `getMap(id).drawBackground(...)`. Verify GROUND_Y handling for the **Space** map (no visible ground): draw a thin metallic plate at `GROUND_Y` so collisions still read naturally.

## Performance guardrails (per existing core rule)

- Total draw cost per frame for any new map must stay under the existing Hell's Arena budget (currently the heaviest).
- Honor the `lowPower` flag from engine: when true, halve particle counts (leaves, sparks, debris, fog ribbons) and skip the one optional `shadowBlur` accent.
- No new image assets, no new fonts, no extra `requestAnimationFrame` loops.

## Out of scope

- No new gameplay mechanics tied to maps (e.g. hazards) — visual only for now.
- No audio.
