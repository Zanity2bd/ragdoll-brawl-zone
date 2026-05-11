# Combat Readability + Finisher Cinematic Pass

Modernize combat presentation so hits feel readable, weighty, and cinematic without cluttering visibility or hurting mobile performance.

## 1. Remove combat text noise (`src/game/engine.ts`)

Delete entirely:

- `hitLabels`, `comboCount`, `comboCountT` state
- `spawnHitLabel()`, `drawHitLabels()`
- All label spawn calls (punch, combo kick/knee, crowbar)
- The render-pass `drawHitLabels()` invocation

Combo logic itself stays intact internally — only the floating UI text is removed. Impact will read through animation, hitstop, recoil, sound, camera, and particles.

## 2. FX readability pass (`src/game/engine.ts`, `src/game/attackFx.ts`)

**Edge-biased placement** — spawn impact FX at `contactPoint + outwardNormal * 18px` (slightly above center mass) instead of victim center, so the strike frames the body.

**Sizing rebalance**

- `impactStar`: size 36 → 26, shorter life, sharper alpha falloff, brighter first ~40ms
- `slashArc`: lower alpha peak, shorter trail, less torso/head overlap
- `shockRing`: keep heavy radius but thinner ring, faster fade, stronger ground anchor

**Victim rim flash** — replace current full-body flash with a directional rim-light highlight offset along impact direction, preserving silhouette readability.

## 3. Directional recoil (render-only)

Add to fighter render state (no physics/hitbox change):

- `displayRecoilX`, `displayRecoilY`, `displayTilt`

On hit:

- Victim snaps 4–8px backward + slight rotation away, springs back
- Attacker lunges forward slightly during the impact frame

## 4. Hitstop tier rebalance

- Light hit: `0.045s`
- Heavy hit: `0.07s`
- Finisher hit: `0.12s`

Heavy, not laggy.

## 5. Finisher cinematic — trigger

Fires when `victim.hp > 0 && victim.hp - dmg <= 0` AND damage source is direct melee, crowbar, or physical projectile.

**Excluded**: DOT, laser tick damage, environmental damage.

**Fires on every round-ending KO** (best-of-3 → triggers up to 3 times per match).

## 6. Finisher state (`engine.ts`)

Add: `finisherT`, `finisherActive`, `finisherVictim`, `finisherAttacker`.

## 7. Slow motion

- `slowmoT = 0.65`
- `slowmoScale = 0.28`

(Avoid extreme freeze — keeps motion legible.)

## 8. Camera cinematic (inline in `engine.ts`, no new file)

Add `camTargetZoom`, `camTargetX`, `camTargetY` fields next to existing `camZoom`/`camX`/`camY`. Lerp every tick at `~6 * dt` toward targets.

**Finisher behavior**

- Zoom: 1.0 → 1.22 with ease-out + slight overshoot, smooth settle
- Focus: midpoint between attacker strike origin and victim torso/head
- Reset targets to defaults on finisher end — no hard snaps

## 9. Cinematic overlay

Canvas-only (no CSS filters) during finisher window:

- Soft radial vignette (dark edges)
- Subtle desaturation tint
- Opacity curve: 0 → 0.28 → 0

## 10. Finisher FX burst

On the KO impact frame:

- Oversized `impactStar` (size 52)
- `shockRing` (size 72)
- Directional debris streaks along impact vector
- Lower-pitched bass impact SFX variant
- Slightly longer shake decay

## 11. Stepped frame rendering during finisher

During slow-mo only, render the visual frame snapped to ~30fps stepping (gameplay sim runs normally). Adds cinematic "frame weight" — visual-only, near-zero cost.

## 12. Camera shake refinement

Replace random shake with a damped directional impulse:

```text
shakeX += impactDirX * magnitude
shakeY += upwardKick
```

Decay exponentially.

## Performance constraints

Mobile-first — Canvas2D, 60Hz, low-end GPU safe. No shaders, no expensive post-processing. Only transforms, lerps, and overlays.

## Files

Edit:

- `src/game/engine.ts`
- `src/game/attackFx.ts`
- `src/game/sfx.ts` (low-pitch finisher impact variant)

(Camera state stays inline in `engine.ts` — no new `camera.ts`.)

No new assets required.

## Out of scope

AI, combat balance, hitbox math, movement physics, animation timing rewrites, networking, shaders.

## Verification

- `bunx tsc --noEmit`
- Visual checklist in preview:
  - Silhouettes stay readable through impacts
  - FX no longer cover fighters
  - Recoil clearly visible
  - Combat feels cleaner + heavier
  - Finisher zoom + slow-mo + vignette feel cinematic
  - Camera returns smoothly, ragdoll transition intact 
  13. Presentation safety rules
  To preserve gameplay readability and avoid cinematic spam:
  - Finisher effects cannot stack or retrigger while finisherActive is true
  - Camera zoom is clamped to max 1.25
  - Combined shake magnitude is clamped to prevent nausea on mobile
  - FX alpha automatically scales down when >6 active combat FX exist simultaneously
  - During lowPower mode:
    - vignette disabled
    - stepped-frame rendering disabled
    - debris streak count reduced
    - all gameplay logic unchanged
  14. Animation + camera easing
  All cinematic transitions must use smooth easing curves:
  - zoom: easeOutCubic
  - shake decay: exponential damping
  - recoil return: spring-damped interpolation
  - vignette opacity: easeInOutQuad
  Avoid linear interpolation for cinematic motion.
  15. Render/gameplay separation
  Gameplay simulation remains full-rate at all times.
  Slow-motion affects:
  - render interpolation
  - animation playback
  - FX timing
  - camera motion
  - audio pitch
  Slow-motion must NOT affect:
  - hit detection
  - collision
  - physics stability
  - AI tick rate
  - input polling
  16. Impact direction system
  All recoil, shake, FX placement, and directional rim-lighting derive from a normalized impact vector:
  impactDir = normalize(victimCenter - strikeOrigin)
  This single source drives:
  - victim recoil
  - attacker lunge
  - camera impulse
  - FX outward offset
  - debris direction
  - rim-light direction
  This keeps all feedback visually coherent.