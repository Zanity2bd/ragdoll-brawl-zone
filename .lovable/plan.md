## Mobile-First Optimization Pass + De-Brand

Two non-negotiable rules going forward, plus the cleanup pass to bring the current build in line with them.

### Rule 1 — Save to project memory

Write `mem://index.md` with these always-on rules so every future change respects them automatically:

- **Mobile-first**: every feature must be designed for touch + small screens + low-end GPUs from the start. No "desktop pass first, mobile later".
- **No Lovable / vibe-code traces**: zero "Lovable", "vibe coded", placeholder, or AI-author strings in UI, meta tags, or visible comments. Lovable badge hidden on publish.

### Rule 2 — De-brand the current app

- `src/routes/__root.tsx` — replace all `Lovable App` / `Lovable Generated Project` / `author: Lovable` / `twitter:site: @Lovable` meta tags with proper game branding (title: "Stickman Neon Duel", description about offline 1v1 fighting, og tags matching).
- Hide the "Edit with Lovable" badge on published builds via the publish settings tool.
- `index.html` title/meta if any traces remain.
- Sweep `rg -i 'lovable|vibe'` over `src/` and `index.html`, fix anything that ships to the user.

### Rule 3 — Mobile optimization pass on what's already built

**Performance (engine + rendering)**
- Cap `devicePixelRatio` used for canvas backing-store at `1.5` (not raw DPR which is often 2–3 on phones). Massive fill-rate win on mobile with no visible quality loss.
- Detect a `lowPower` flag (touch device OR `navigator.hardwareConcurrency <= 4` OR small screen) and pass it into the engine + map renderers. When set:
  - reduce ambient particle spawn rate (~0.4 → ~0.1 per frame) and cap max particles (200).
  - reduce `shadowBlur` values across map backgrounds (`shadowBlur` is the single biggest mobile cost). Roughly halve the values used in `maps.ts`.
  - in **Neon City** map: fewer skyline buildings (skip back row), no per-window flicker math (precompute a static lit pattern), no lightning flash math.
  - in **Cyber Dojo** map: fewer petals (30 → 10), no per-frame `ellipse` rotation per petal (use small rect).
  - in **Hell's Arena** map: fewer ember particles (50 → 15), fireball arc only every 6s.
- Cache the radial/linear gradients per-map instead of re-creating them every frame.
- Throttle `onSnapshot` React updates to ~10 Hz (not every frame) — HUD doesn't need 60 Hz.
- Pause the `requestAnimationFrame` loop when the canvas isn't visible (`document.visibilitychange`) to save battery in background.

**Touch UX (Map / Skin select + HUD + controls)**
- Map select grid: stack to a single column under 640px, full-width cards, larger tap targets (min 44px), preview canvases lazy-mount (`IntersectionObserver`) so off-screen previews don't render.
- Skin select: stack the two player columns vertically on mobile; universe tabs and skin buttons sized to `min-h-11` for thumb taps; preview canvas size scales down to ~140×170 on small screens.
- Touch fight controls: bigger pads (60×60), tighter gap, anchored to safe-area insets (`env(safe-area-inset-bottom)`), prevent overlap with HP bars by reducing top HUD padding on portrait.
- HP bars: stack vertically on portrait, cooldown pills wrap below.
- Disable hover-only animations (`hover:scale-*`) on touch devices to avoid stuck states after tap.
- Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">` and prevent pinch/double-tap-zoom inside the game canvas.

**Files touched**
- `mem://index.md` (new)
- `src/routes/__root.tsx` (de-brand meta + viewport)
- `src/components/game/GameCanvas.tsx` (DPR cap, throttled snapshots, visibility pause, mobile HUD/touch layout, hover-on-touch fix)
- `src/game/engine.ts` (lowPower flag, particle caps, snapshot throttle hook)
- `src/game/maps.ts` (cached gradients, halved shadowBlur, mobile-tuned counts)
- `src/components/game/MapSelect.tsx` (responsive grid, lazy preview, touch sizing)
- `src/components/game/SkinSelect.tsx` (stacked layout, larger tap targets, smaller preview on mobile)
- `index.html` (if any Lovable traces / viewport meta)
- Publish settings: hide Lovable badge.

### Out of scope for this pass
- New gameplay features
- Sound
- Online multiplayer
