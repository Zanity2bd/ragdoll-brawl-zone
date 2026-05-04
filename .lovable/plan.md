# Rebrand to OgunArena + Blkdom credit + Premium Loading Screen

## 1. Rebrand: Stickman Neon Duel → OgunArena

- **Memory**: save `mem://brand.md` (OgunArena = Yoruba "Ogun"/war, produced by Blkdom, always credit with logo + blkdom.com link). Update `mem://index.md` core rules.
- **Meta / titles** — replace "Stickman Neon Duel" everywhere:
  - `src/routes/__root.tsx` — title, og:title, og:description, description.
  - `src/routes/index.tsx` — head meta + landing hero ("OGUN" big / "ARENA" subtitle, with a small italic "ogun · war in Yoruba" caption).
  - `src/routes/play.tsx` — title + the small top bar text becomes "◇ OgunArena ◇".
  - `src/components/game/Lobby.tsx` — header "OGUN ARENA".
  - `src/game/engine.ts` — top comment.

## 2. Blkdom credit component

- **Asset**: copy uploaded logo to `src/assets/blkdom-logo.png` (already done).
- New reusable `src/components/BlkdomBadge.tsx`:
  ```tsx
  <a href="https://blkdom.com" target="_blank" rel="noreferrer noopener"
     className="inline-flex items-center gap-2 ...">
    <img src={logo} alt="Blkdom" className="h-5 w-5 rounded" />
    <span className="font-mono text-[10px] tracking-[0.3em] uppercase">
      A Blkdom production
    </span>
  </a>
  ```
  - Two size variants: `sm` (footer/HUD) and `md` (splash).
  - Always opens blkdom.com in a new tab.
- Mount it in:
  - Landing page footer (`/`)
  - Lobby header (top-right corner of the lobby panel)
  - New loading/splash screen (large variant, centered under the title)

## 3. Premium animated loading / splash screen

New `src/components/game/Splash.tsx` mounted **before** the Lobby on `/play`. User must tap **PLAY** to enter. Mobile-first, runs at full perf even on low-end phones.

### Layout (single full-screen canvas + overlaid HTML)
- Black background with subtle vignette + drifting particles.
- Top: tiny "◇ OFFLINE 1V1 ◇" eyebrow.
- Center title: **OGUN** (huge, bold) with **ARENA** beneath, gradient + soft glow. Caption: "Ogun · war in Yoruba".
- Bottom-center: glowing **PLAY** button (≥ 64px tap target, pulsing border).
- Bottom: Blkdom badge (logo + link).
- Behind everything: the animated scene (see below).

### Animation (Canvas 2D, the flashy bit)
A looping ~6-second cinematic cell:

```text
   [Homelander stickman running right →]   ← fires red laser eyes →   [Subway train approaching from right]
                  trail of motion streaks                                    sparks + smoke where laser hits
```

Loop:
1. Homelander enters from left, runs across the lower third with the existing stickman walk-cycle (reuse skin draw from `Lobby` / `SkinSelect`).
2. Mid-screen, head turns slightly back; **two red laser beams** project from his eyes diagonally toward the train.
3. Train (silhouette of subway car with bright headlight, reusing the Subway map's train-light idea) rolls in from the right and gets hit — sparks, smoke puff, headlight flicker.
4. Homelander keeps running off-screen left; train recedes; loop restarts seamlessly.
5. Background: dark tunnel/road with parallax tiles + faint scanlines (no expensive shadowBlur loops).

### Performance rules (per Core memory)
- Single `requestAnimationFrame` loop, throttled to ~30fps on `lowPower` devices (touch / ≤4 cores / small screen — same heuristic as `GameCanvas`).
- DPR capped at 1.5.
- Only **2** elements use `shadowBlur` (laser beams + train headlight); everything else is solid fills / 1-2px strokes.
- ≤ 24 particles total (motion streaks + sparks combined).
- Pause loop on `visibilitychange` hidden.
- No external assets beyond the already-imported Blkdom logo.

### Wiring
- `src/components/game/GameCanvas.tsx`:
  - Add a `"splash"` screen state, default to it.
  - On PLAY tap → `setScreen("map")` → existing Lobby flow.
- The splash unmounts cleanly (cancelAnimationFrame, removes resize/visibility listeners).

## 4. Out of scope
- No audio.
- Pricing / paywall UI for upcoming locked skins (already noted on the Skins panel as "more coming soon").
