# Improve Ragdoll → Get-Up Sequence

## Problems in the current implementation

After reading `src/game/engine.ts` (ragdoll loop ~2225, downed/getup ~2289-2330, `poseFor` get-up branch ~4210-4256, sprite render branch ~5014-5158):

1. **Two conflicting systems** drive the rise.
   - `poseFor()` uses a 2-stage smoothstep (flat → kneel → stand) — drives cape, head anchor, eye-line.
   - `render()` uses a separate 5-frame sprite ladder (DOWN → GETUP_A → GETUP_B → KNEE_CHAMBER → RECOVERY → STAND).
   They disagree on phase boundaries, so cape/head/eye anchors slide off the sprite mid-rise.
2. **Linear `groundLift = (1-ease) * 0.46H`** is monotonic. The body keeps lifting even on plant frames where the sprite shows weight-bearing — visually the character "floats up" through a kneel instead of planting.
3. **easeOutQuart frontloads 80% of the lift in the first 30% of the timeline.** By the push-up frame the body is already nearly upright; later phases have nothing to do.
4. **`f.getUpDur = 0.7s` is too short** for 5 phases + overshoot; each plant only gets ~140 ms, so beats blur together.
5. **No angle blend.** `ragdollAng` is hard-reset to 0 only at the end. Sprite renders upright from u=0 even if body just snapped from face-down.
6. **No anticipation/hold.** Rise is one continuous easeOut — no pre-stand crouch dip, no settle hold at the top.
7. **FX overload.** Every plant beat (4×) fires camera kick=9 + 18 dust + embers + radial flash, so the stand beat doesn't feel special. "Decals" are pushed as particles (round, drift up).
8. **No iframe tell.** Post-rise `iframeT = 1.0` has no visual cue — players don't know they're invulnerable.
9. **Ragdoll settle thresholds (`|vx|<60`, `|av|<2.0`) cause early "snap to flat"** while body is still clearly tumbling on screen.

## Goal

A single, beat-driven get-up where pose, sprite, lift, lean, and FX share one phase clock; the rise reads as gather → press → plant → coil → drive → settle, with a clean angle recovery and a focused FX hit on the drive beat.

## Plan

### 1. Single shared phase function (`engine.ts`)
Add a small helper near the get-up code:
```
type RisePhase = "gather" | "press" | "kneel" | "coil" | "drive" | "settle";
function risePhase(u: number): { phase: RisePhase; local: number; lift: number };
```
- Phase windows (of normalized u): gather 0-0.10, press 0.10-0.30, kneel 0.30-0.50, coil 0.50-0.68, drive 0.68-0.88, settle 0.88-1.0.
- `lift` returned as a hand-shaped curve (not monotonic ease): stays near 0 during gather, rises during press, **plateaus on kneel** (plant), small dip at start of coil (anticipation), explosive rise on drive, tiny overshoot + settle.
- Both `poseFor()` and the sprite branch consume this function so they cannot drift apart.

### 2. Lengthen and re-time
- `f.getUpDur` → **0.95s** (was 0.7s). Still snappy but phases breathe.
- Settle phase holds the stand frame for ~80 ms before unlocking control — gives a readable "I'm back" beat.

### 3. Couple `poseFor()` to the same ladder
Replace the 2-stage flat/kneel/stand blend with a 4-keyframe blend driven by `risePhase`:
flat → press (hands planted, hips low) → kneel (one-knee chamber) → stand. Lean blends on the same clock so cape/eye-line stay glued to the sprite frame.

### 4. Smooth angle recovery
- During `gather` phase, ease `ragdollAng → 0` with `Math.pow(0.001, dt/0.08)` damp instead of hard-resetting at the end. Removes the visible snap when the body was face-down.
- Keep the final hard zero in the existing `getUpT <= 0` block as a safety.

### 5. Ragdoll settle quality
- Raise settle thresholds: require `|vx| < 35` AND `|av| < 1.2` AND at least 0.18s grounded (new `f.groundedT` accumulator), so the tumble doesn't snap flat mid-roll.
- Keep the existing 90° snap, but ease over 0.10s instead of instant.

### 6. FX rebalance
- Remove dust/embers/flash/shake from press and kneel beats (those become small foot-scuffs only: 4 particles, no shake).
- Keep the **drive beat (≥0.68)** as the hero hit: 16 dust + 8 embers + radial flash + `shake = 8`.
- Add a soft `shake = 2` on settle for the landing tap.
- Replace the particle-as-decal hack with a real `groundDecals` array (already used for impact decals if present; otherwise add a tiny `{x, w, life, maxLife}` ring buffer rendered as flat ellipses before fighters). Keeps decals from drifting and sizes correctly.
- Audio: `Sfx.play("thud", 0.12)` on press, `("thud", 0.18)` on kneel, `("thud", 0.32)` on drive (current code only plays once when entering get-up).

### 7. Iframe tell
- While `f.iframeT > 0` after rising, render a thin pulsing rim using existing `skin.glow` (sin-modulated alpha 0.15-0.35, period 0.18s). Stops automatically when iframe expires.

### 8. Cleanup
- Delete the old hard-coded thresholds (`u < 0.14 / 0.34 / 0.56 / 0.78 / 0.94`) and the duplicated overshoot/sx/sy/leanCurve math — all replaced by `risePhase()` outputs.
- Keep `motion-blur afterimage` but key its alpha off `risePhase().phase === "drive"` so blur is concentrated where there's actual velocity.

## Files touched

- `src/game/engine.ts` — add `risePhase()` helper, rewrite get-up branch in `update()` (~2225-2331), rewrite get-up branch in `poseFor()` (~4210-4256), rewrite get-up branch in render (~5014-5158), add iframe rim render in fighter draw, add small ground-decal buffer + render pass.

No other files require changes. No new assets — reuses existing sprite frames and `skin.glow` token.

## Risk / verification

- Risk: `poseFor()` drives cape/eye anchors during get-up; if the new keyframes don't match sprite hip/shoulder positions, cape will float. Mitigation: tune kneel pose `hipY/shoulderY` to match `KNEE_CHAMBER_FRAME` once and verify on Nightcrawler + a non-cape skin.
- Verify by triggering a ragdoll (heavy combo or super-dash KO), then watching the rise at 0.5x via dev throttle: check (a) no snap when face-down, (b) clear plant beat at kneel, (c) drive beat shakes camera, (d) iframe rim pulses for ~1s after stand.
