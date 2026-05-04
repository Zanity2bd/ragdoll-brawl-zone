## Goal
Make OgunArena fill the entire viewport on every device with sharp HiDPI rendering, a consistently scaled HUD, smoother visuals, and a stable 60 FPS budget.

## 1. True fullscreen canvas (no margins / black bars)

`src/routes/play.tsx`
- Wrap in a container that uses `100dvh`/`100svh` (mobile URL-bar safe) instead of relying on `inset-0` alone. Add `overscroll-none`, `touch-none`, and lock body scroll via a small effect.
- Hide the top "◇ OgunArena ◇" link during fight (or move into HUD) so nothing overlays gameplay.

`src/components/game/GameCanvas.tsx`
- Outer wrapper: `fixed inset-0 w-[100dvw] h-[100dvh]` so the canvas always tracks the live viewport (handles iOS Safari URL-bar resize, Android keyboard, desktop resize).
- Listen for `visualViewport` `resize`/`scroll` in addition to `window resize` so the canvas re-fits when mobile chrome animates in/out.
- Drop the cover-fit letterbox in `engine.render()` — switch to **true fullscreen with a virtual camera** (see §3) so there are no black bars even on ultrawide or tall portrait phones.

## 2. Sharp HiDPI rendering

`GameCanvas.tsx` (resize block)
- Use real `devicePixelRatio` (cap 3 on high-end, 2 on mid, 1.5 on low-power) and round backing size with `Math.round` to avoid sub-pixel blur.
- Set `canvas.style.width/height` explicitly to the CSS box and `canvas.width/height = cssW * dpr` so `getBoundingClientRect()` math stays correct.
- Call `ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"` once after each resize.
- Apply the DPR transform inside `engine.render()` via `setTransform(dpr*scale, …)` instead of writing the DPR into the bitmap dims only — guarantees crisp lines/text on Retina.

## 3. Adaptive stage + virtual camera (fills any aspect ratio)

`src/game/engine.ts`
- Replace fixed `W=1280 H=720` with a base play-field height `H_BASE=720` and a width derived from viewport aspect (`W = H_BASE * (cw/ch)` clamped to `[960, 1920]`). Keeps gameplay area tall enough on portrait, wide enough on desktop, no letterbox, no clipping of fighters.
- Render path:
  1. `setTransform(dpr, 0, 0, dpr, 0, 0)` for HiDPI.
  2. Compute `scale = ch / H_BASE`, `offX = (cw - W*scale)/2`.
  3. `ctx.translate(offX + shake, shake); ctx.scale(scale, scale);`
  4. Draw background to the full computed `W` (maps already accept `W,H` args).
- Update `toStage()` in `GameCanvas.tsx` and `engine.handlePointer` to use the same dynamic `W`/scale (expose `engine.getStageMetrics()`).
- Clamp fighter X to the dynamic `W` so they cannot walk off-screen on wide monitors.

## 4. HUD / UI scaling

`GameCanvas.tsx`
- Introduce a single CSS variable `--hud-scale` set from `Math.min(vw/420, vh/260, 1.6)` via a `ResizeObserver` on the wrapper. Apply to HUD root with `style={{ fontSize: 'calc(14px * var(--hud-scale))' }}`.
- HpBar / CdPill / FIGHT! / KO overlay use `em`-based sizing so they scale together. Replace fixed `text-7xl/8xl` with `clamp(2.5rem, 8vw, 6rem)` etc.
- Touch joystick + flight button sizes already responsive — re-anchor with `env(safe-area-inset-*)` on all four sides and increase hit targets to min 56 px.
- Center HUD bars in a `max-w-[min(1200px,96vw)] mx-auto` container so desktop doesn't stretch them across an ultrawide monitor.
- Audio button + back link respect safe-area insets; move bottom-left flight button up by `calc(env(safe-area-inset-bottom) + 9rem)`.

## 5. Visual polish (premium but cheap)

`engine.ts` render
- Cache neon glow: pre-render fighter silhouette glow to an offscreen canvas once per frame per fighter instead of `shadowBlur` on every limb (shadowBlur is the #1 canvas perf killer).
- Particles: switch to additive `radial-gradient` sprites pre-baked in an offscreen canvas (1 image, drawn with `globalAlpha`) — looks softer than solid arcs, costs less than per-particle shadowBlur.
- Add a subtle vignette + bloom pass: one full-screen `radial-gradient` overlay (`globalCompositeOperation = "overlay"`) — cheap, cinematic.
- Smooth animations: lerp camera shake decay (`shake *= 0.88`) and clamp; ease-out hp bar fill via existing CSS transition (already there) — extend to 250ms.
- Smoother transitions between screens: add `animate-fade-in` (already in tailwind) on Splash/Lobby/SkinSelect roots and a 200 ms cross-fade when entering "fight".

## 6. 60 FPS stability

`engine.ts`
- Add a frame-time guard: if `dt > 1/45` for 30 consecutive frames, automatically flip `lowPower = true` (drops shadowBlur, halves particle cap, disables trail afterimages).
- Cap particles per frame spawn (already partially done) and global cap at 250 (low) / 500 (high).
- Skip background re-render every 2nd frame on lowPower by drawing background to an offscreen canvas only when `elapsed` crosses an integer step.
- Use `performance.now()` delta clamped to 1/30 to avoid huge catch-up steps after tab switches.
- Remove `requestAnimationFrame` work when `document.hidden` (already wired via visibilitychange) and additionally pause SFX timers.

## 7. Files touched

- `src/routes/play.tsx` — fullscreen wrapper, hide overlay during fight.
- `src/components/game/GameCanvas.tsx` — viewport tracking, DPR resize, HUD scale variable, safe-area layout, dynamic stage metrics.
- `src/game/engine.ts` — dynamic W, HiDPI transform, glow/particle caching, vignette, adaptive lowPower, frame-time guard, expose `getStageMetrics()`.
- `src/styles.css` — small additions: `html,body { height:100%; overscroll-behavior:none; }`, `--hud-scale` default, fade-in keyframe reuse.

## Out of scope
No gameplay/balance changes, no new characters, no asset additions.
