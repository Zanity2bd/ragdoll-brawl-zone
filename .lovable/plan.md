## Premium Combat Specials — Per-Skin

Each skin gets a signature melee special (in addition to the existing ranged "fire"). Specials trigger on a new MELEE input (J for P1, ; for P2; new on-screen "PUNCH" button on touch). They feature wind-up → impact frame (freeze + flash + radial shockwave) → ragdoll knockback for the victim, with skin-specific timing, range, damage, camera shake, and audio.

### Per-skin specials

| Skin | Move | Behaviour |
|---|---|---|
| Superman | Heat-Punch | Long wind-up. Massive impact, victim ragdolls across screen. Big shake + white flash impact frame. |
| Homelander | Laser Sweep | Beam from eyes, sweeps as he turns. Continuous DPS, brief blind-flash on hit. |
| Hulk | Ground Smash | Downward fist creates radial shockwave that knocks both grounded fighters up. |
| A-Train | Speed Flurry | 6 rapid jabs in 0.6s. Self at full speed, victim slowed to 0.25x for the duration. Speed streaks. |
| Flash | Phase Strike | Vanishes, blink-teleports behind opponent, single crit hit + multi-image afterimage trail. |
| Spider-Man | Web Yank | Web line grabs opponent and pulls them in for a kick. |
| Iron Man | Repulsor Burst | Short-range AoE blast cone from palm; light knockback, double-tap to chain. |
| Batman | Batarang Combo | Throws batarang (homing arc) then dashes in for 2-hit kick combo on connect. |
| Butcher | Crowbar Swing | Short range, heavy single hit, brutal hit-stun on victim (longer slow-mo on impact). |

### Impact frame system (engine.ts)

- New `hitstop` global timer: when set (e.g. 0.08s on light hit, 0.18s on heavy), `update()` returns early so positions freeze while render still runs (white vignette flash + radial line burst).
- New `slowmo` extension: heavy moves invoke `slowmoT = 0.4` *without* entering teleport-targeting mode (current slowmo is bound to teleport — refactor into `slowmoMode: 'tele' | 'impact' | null`).
- Ragdoll: on heavy hit, victim enters `ragdoll` state (timer ~0.7s) — `computeWalkPose` is bypassed; engine uses a tumbling pose (continuous spin angle + sprawled limbs) and physics keeps gravity + bounce on ground contact.
- Camera: `shake` boost + brief `chromaticOffset` (cheap 2px R/B offset on render, skipped on lowPower).

### Animation additions (animation.ts)

- New `computeAttackPose(skinId, attackT, facing, h)` returning a full pose for the active special's wind-up + strike frames. Falls back to walk pose blended with arm overrides for skins without a custom rig.
- Flash/A-Train get afterimage hook: engine calls back N times per frame to draw faded ghost copies along recent motion samples.

### Sound effects

- Add `src/game/sfx.ts` — no external assets; uses WebAudio `OscillatorNode` + `BiquadFilter` + noise buffer to synthesize: punch (low thump + click), heavy boom (sub + decay), laser (sawtooth sweep), shockwave (filtered noise), whoosh (high-pass noise), batarang (fm chirp), woodthump (Butcher).
- Single `Sfx` singleton with `play(name)` mapped per move. Lazy-init `AudioContext` on first user gesture (existing Splash "PLAY" tap is the unlock). Master gain + per-sound limiter so spam (A-Train flurry) doesn't clip.
- Mute toggle in HUD (small speaker icon).

### Input wiring (GameCanvas.tsx)

- Add J (p1 melee) / `;` (p2 melee) to `KEY_MAP`.
- Add a third "PUNCH" button to each `Pad` on touch.
- Engine exposes `pressMelee(p)`; intent flushed each tick like fire/tele.

### Files

- src/game/sfx.ts (new)
- src/game/combat.ts (new — per-skin move specs: damage, wind-up, range, hitstopMs, knockback, slowmoT, sfx, attackKind)
- src/game/animation.ts (add `computeAttackPose`, `computeRagdollPose`)
- src/game/engine.ts (hitstop, ragdoll state, melee resolution, afterimage trail buffer, refactor slowmo modes, chromatic offset)
- src/components/game/GameCanvas.tsx (J/; keys, PUNCH touch button, mute toggle)

### Mobile / perf notes

- Hitstop is just a timer — zero extra cost.
- Afterimages capped to 4 ghosts on lowPower; chromatic offset disabled on lowPower.
- WebAudio nodes are created and disposed per-shot; `Sfx` reuses a noise buffer across calls.
- All new draws skip `shadowBlur` on lowPower (consistent with existing engine).
