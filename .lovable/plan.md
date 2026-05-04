# Tap-to-Special + AI Opponent

Two changes: P1 can trigger their special by tapping the opposing fighter on screen, and P2 becomes a CPU with three difficulty modes that uses movement, jumps, melee, and its character-specific special at appropriate range.

## 1. Tap opponent → trigger special

In `GameCanvas.tsx`, add a tap handler on the canvas (already wired for teleport targeting) that, when not in tele-targeting mode and the touched point is over the P2 fighter's body, fires P1's special:

- Convert tap CSS coords → stage coords using the same cover-fit math the engine already uses (`Math.max(cw/W, ch/H)`).
- Hit-test against the engine snapshot's P2 position (expose `getFighterRect("p2")` on `GameEngine`).
- Route to `pressMelee("p1")`, or `pressFire("p1")` for Heatwave, or `pressTeleport("p1")` for Nightcrawler — same dispatch as the joystick hold.
- Brief tap-ring VFX at the touch point so users see the input register.
- Works with both mouse click and touch. The existing joystick long-press still works.

## 2. AI opponent with 3 difficulties

Add a `Difficulty` selector ("Easy", "Hard", "Extreme") to the `SkinSelect` screen below the P2 picker. Default = Hard. Choice flows through `startFight()` into `engine.configure(...)` and is stored on the engine.

New `src/game/ai.ts` runs every frame for P2 and writes into the same `intents.p2` the keyboard/touch inputs use — so the existing physics/melee code is unchanged.

### AI behaviour per tick

```text
read snapshot: dx = p1.x - p2.x, dy, p1.vx, p1 attacking?
choose target distance = move.range * 0.85   (per-character)
  - if |dx| > target + dead → walk toward
  - if |dx| < target - dead → walk away (kite)
  - else hold position
jump if:
  - p1 is on platform above and dx small, OR
  - incoming projectile within 180px and grounded
special trigger (per character, see table)
react: if p1.meleeKind active and dx < threat range, back-step or jump
```

### Special-use range table

Each character only fires its special when the opponent is in the move's effective sweet-spot:

| Skin            | Special           | Trigger range (px) | Notes |
|-----------------|-------------------|--------------------|-------|
| Heatwave        | Fire bolt         | 200–800            | Needs LOS, p1 vy small |
| Nightcrawler    | Teleport          | dx > 350 or HP < 35 | Teleports near p1 (engine helper) |
| Superman        | Heat-Punch        | < 90               | Long windup → only when p1 grounded + close |
| Homelander      | Laser Sweep       | 120–540            | Hold while sweeping |
| Hulk            | Ground Smash      | < 220 and grounded | AoE |
| A-Train         | Speed Flurry      | < 70               | Close-in pressure |
| Flash           | Phase Strike      | < 250              | Engine teleports behind, so any mid range |
| Spider-Man      | Web Yank          | 200–380            | Pull-in tool |
| Iron Man        | Repulsor          | < 160              | Cone |
| Batman          | Batarang Combo    | 250–600            | Ranged |
| Butcher         | Crowbar           | < 70               | Close |

If special is on cooldown, AI defaults to walking into melee range and pressing melee (already gated by `meleeCd`).

### Difficulty knobs

```text
Easy:    react 280ms, special chance 0.25, kite 30%, no anti-air, fire intent only when stationary
Hard:    react 140ms,                0.65, kite 60%, jumps over projectiles, mixes feints
Extreme: react  60ms,                0.95, kite 85%, predicts p1.vx for aim, special the moment in-range
```

Implemented as a tick-rate gate (`reactTimer`) and a per-decision `Math.random() < specialChance`.

### Nightcrawler AI teleport

The current teleport flow opens a slow-mo aim mode and waits for a pointer. Add `engine.aiTeleportTo(x, y)` that bypasses the pointer step and drops the fighter at a chosen point near P1 (offset by ±120px on the side P1 is facing away from). AI calls this directly when teleport fires.

### When AI is active

- Skip P2 keyboard mapping if `engine.cpuEnabled`.
- On mobile, only render the P1 joystick (P2 controls hidden) — solo play.
- Pause AI during `intro` and `ko` phases and during global slow-mo aim.

## Files

- `src/game/ai.ts` — new, `class CpuController` with `update(dt, snap)`.
- `src/game/engine.ts` — add `cpuEnabled`, `difficulty`, `aiTeleportTo`, `getFighterRect`, instantiate + tick the CPU.
- `src/components/game/GameCanvas.tsx` — tap-opponent handler, hide P2 touch UI when CPU on, pass difficulty through.
- `src/components/game/SkinSelect.tsx` — Difficulty segmented control + "vs CPU" toggle (default on).

## Out of scope

No online multiplayer. No new characters. No changes to map roster or visuals beyond the small tap-ring.
