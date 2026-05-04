## Stickman Neon Duel — v1 (MVP)

A 2D offline 1v1 stickman fighting game running fully in the browser. Two players share one device. Built on HTML5 Canvas with a custom game loop.

### What's in v1

**Characters**
- Player 1: Hero — cyan neon stickman with glowing limbs
- Player 2: Villain — magenta neon stickman with glowing limbs
- Smooth limb animation for idle, run, jump, attack, hit, KO

**Movement**
- Left / Right walk
- Jump (with gravity + ground collision)
- Facing flips toward opponent automatically

**Abilities (2 for v1)**
1. **Fire Blast** — projectile launched forward; deals damage on hit; short cooldown
2. **Teleport** — triggers a brief slow-motion freeze; player picks a destination point (click/tap on desktop, tap on touch); longer cooldown

**Arena (1 map)**
- Single dark neon arena: deep navy gradient background, glowing horizon line, one flat ground plane, two small floating platforms for vertical play
- Subtle particle ambience (drifting neon dust)

**Combat & feel**
- Health system: each player starts at 100 HP
- Hit flash + knockback on damage
- Screen shake on heavy hits
- Glow trails on projectiles, soft bloom on impacts
- Slow-mo time dilation during teleport targeting

**UI**
- Top bar: two health bars (Hero left, Villain right) with names
- Bottom bar per player: ability buttons showing cooldown sweep
- Center round banner: "FIGHT!" intro, "K.O." on win
- End screen: winner name + "Rematch" button (instant restart)
- Pause button (Esc / on-screen)

**Controls**
- Auto-detects device:
  - **Desktop (keyboard):**
    - P1 Hero: `A` / `D` move, `W` jump, `F` Fire Blast, `G` Teleport (then click target)
    - P2 Villain: `←` / `→` move, `↑` jump, `K` Fire Blast, `L` Teleport (then click target)
  - **Touch (mobile/tablet):** on-screen left/right/jump buttons + 2 ability buttons per side, mirrored for each player. Teleport target chosen by tapping arena.
- Controls legend shown on the start screen

**Flow**
- Start screen → Fight (best of 1) → K.O. → Rematch button → back to Fight

### Visual style
- Neon stickmen on a dark gradient arena
- Glow via canvas shadowBlur, additive blending for projectiles
- Minimalist HUD: thin lines, monospace labels, neon accents matching each player's color

### Technical notes
- New route `/play` with the canvas game; `/` becomes a landing screen with a "Start Fight" button and brief controls/credits
- Pure client-side: one `GameEngine` class with fixed-timestep update loop + render; entity classes for `Fighter`, `Projectile`, `Particle`; `InputManager` abstracts keyboard + touch into per-player intents
- All rendering via Canvas 2D (no external game engine needed); no backend, no Lovable Cloud
- Code organized under `src/game/` (engine, entities, abilities, input, render) and `src/components/game/` (HUD, touch controls, start/end overlays)

### Explicitly out of scope for v1 (saved for follow-ups)
- Ice Blast, Wind Blow, Rock Blast, Rock Spikes
- Multiple skins and multiple maps
- Ragdoll / jiggle physics (would add `matter.js` later)
- Sound effects and music
- Round timer, best-of-3 scoring
- Online multiplayer (would require a backend)

After v1 ships and feels good, we layer abilities, maps, skins, then physics and sound in focused passes.