## Smoother, Slower Walk Cycle with Real Knee Bending

Refine the existing stickman walk so it reads as a believable stride instead of a fast pendulum. Two files change.

### `src/game/animation.ts` — proper two-phase gait

Replace the current sine-only leg solver with a true **stance + swing** cycle per leg:

- **Stance (first half of each leg's cycle)**: foot is locked to the ground (`footY = H`, no float) and slides backward relative to the hip from `+stride` to `-stride` as the body passes over it. This eliminates the "skating" look — the planted foot truly stays planted.
- **Swing (second half)**: foot lifts in a smooth arc (`sin(πs)` height) and travels from `-stride` back to `+stride`, eased with `easeInOut` so the foot accelerates off the ground and decelerates into the next contact.
- **Foot contact timing**: legs are exactly 0.5 cycle out of phase, so when one leg plants the other lifts off — no moment where both are floating.
- **Knee bending**: knee is the midpoint between hip and foot, pulled forward (toward facing) and downward, with a pronounced extra bend (`+10px`) that ramps with the swing-lift amount. Stance leg stays nearly straight; swing leg shows a clear bent-knee silhouette.
- **Body bob**: subtle vertical bob (`|cos(phase·π)|`) that dips during double-support and rises mid-stance — twice per gait cycle, the natural human rhythm.
- **Arm swing**: cosine-driven, opposite-phase to the legs, with a bent elbow midpoint nudged toward facing direction so arms read as bent and natural.

Air pose, attack pose, and idle breathing are preserved.

### `src/game/engine.ts` — slower cadence

Tune the per-frame walk-phase advance so the cycle plays slower:

- On ground: `walkPhase += dt * (1.6 + |vx| * 0.018)` (was `4 + |vx| * 0.04`) — roughly 0.4× the previous step rate.
- In air: `walkPhase += dt * 1.2` (was `2`).

Movement speed itself is unchanged; only the animation cadence is slower so each step is visibly held longer.

No other files, no new dependencies.
