# DPR Walk-Smoothness Test Mode

A hidden dev route that renders the same fighters walking across four canvases simultaneously, each forced to a different `devicePixelRatio`. Lets you eyeball jitter, sub-pixel crawl and shimmer side-by-side without juggling browser zoom or real devices.

## Route

New file: `src/routes/dpr-test.tsx` (path `/dpr-test`, not linked from anywhere — dev-only).

Layout:
```text
+---------------------------------------------------+
|  DPR 1.0      |  DPR 1.5                          |
|  [canvas]     |  [canvas]                         |
+---------------+-----------------------------------+
|  DPR 2.0      |  DPR 3.0                          |
|  [canvas]     |  [canvas]                         |
+---------------------------------------------------+
[ Pause ]  [ Slow walk ] [ Run ] [ Toggle skins ]
```

Each cell:
- Label chip: `DPR x.x  •  <css w>×<css h>  •  <buffer w>×<buffer h>`
- Canvas sized to fill the cell, but its backing buffer is forced to `cssW * targetDpr` regardless of the real `window.devicePixelRatio`.
- Independent `GameEngine` instance, same map (Cyber Dojo — clean floor), same skins (Spider-Man vs Homelander by default).

## Auto-walk driver

Each engine runs an interval that flips `setIntent` every 1.6 s:
- Phase A: `p1.right=true, p2.left=true`
- Phase B: invert.

Plus a "Slow walk / Run" toggle that switches between holding direction (run) vs tapping it briefly (walk). This exercises both the smoothed-velocity stride lock and the bob amplitude curve.

CPU is disabled — both fighters are puppeteered identically across all four engines so any visual difference is purely DPR-dependent.

## Technical details

`src/routes/dpr-test.tsx`:
- `createFileRoute("/dpr-test")` with a noindex meta tag.
- Component renders a 2×2 CSS grid filling the viewport.
- Maps over `[1, 1.5, 2, 3]` and renders a `<DprCell dpr={...} />`.

`DprCell` (inline component in same file):
- `useRef<HTMLCanvasElement>`, `useRef<GameEngine>`.
- On mount: `ResizeObserver` on the parent → set `canvas.style.width/height` to CSS size, set `canvas.width = round(cssW * dpr)`, `canvas.height = round(cssH * dpr)`. Re-run on resize.
- Construct `new GameEngine(canvas)`, call `engine.configure("cyber-dojo", "spiderman", "homelander", { cpu: false })`, `engine.start()`.
- Drive auto-walk via `setInterval`, cleaned up on unmount.
- Cleanup: `engine.stop()` + remove observer + clear interval.

Top toolbar:
- Pause/Resume → call `engine.stop()` / `engine.start()` on all 4.
- Walk/Run → toggle the auto-walk pattern (tap vs hold).
- Toggle skins → cycle through a small list (Spider-Man/Homelander → Hulk/Superman → Flash/Ironman) by re-calling `engine.configure(...)` on all 4.

No engine changes — purely a new route consuming the existing `GameEngine` API (`configure`, `start`, `stop`, `setIntent`).

## Files

- Add: `src/routes/dpr-test.tsx`

That's it. After approval, visit `/dpr-test` to compare walk smoothness across DPRs side-by-side.
