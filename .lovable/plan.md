
# OgunArena → Production-Ready Roadmap

Three phases, shippable at the end of each. Anger-of-Stick visual target: chunkier, action-movie weight, blood/impact heavy, dark realistic. Stickman bodies stay procedural (current engine) — upgrade lives in **portraits + signature FX + combat feel + meta**.

---

## Phase 1 — Combat Feel (the "AAA" gap)

This is what separates Anger of Stick from a tech demo. Pure code, no new assets.

**Hit & impact system**
- Hit-stop on every connecting strike: freeze both fighters 40–110ms scaled by damage. Heavies = longer freeze + 1-frame white flash on victim.
- Layered screen shake: replace single `shake` scalar with `{trauma, decay, dirX, dirY}` so hits punch in the strike direction.
- Time-dilation on KO blow & super hits (0.35× for 220ms, ease back).
- Camera zoom-punch (1.0 → 1.04 → 1.0 over 180ms) on heavy connect.

**Blood & gore (Anger-of-Stick signature)**
- Blood particle system: arterial spray on heavy hits, ground pooling decals, blood smears on wall slams.
- Damage state on bodies: light bruising tint at 60% HP, blood streaks at 30%, soaked at <15%.
- Finisher cam: on KO with super, slow-mo + impact freeze + blood burst.

**Move depth**
- Cancel windows: light → light → heavy chains with timing windows.
- Parry (tap block at the right frame) → stagger opponent + meter gain.
- Super meter (already partial) → 2 supers per skin: standard + finisher.
- Air juggles: opponent stays launched longer if you connect mid-air, with diminishing returns.

**Audio layering**
- Per-hit SFX layered: whoosh + impact + body thud + grunt (3–4 samples per hit).
- Adaptive music: low-intensity loop swaps to high-intensity when either fighter <30% HP.
- Generated via AI Gateway + curated free libraries; pooled and limited so mobile doesn't choke.

**AI variety**
- Personality profiles per skin (aggressive/defensive/zoner/grappler) instead of one difficulty curve.
- Reads player habits within a round (spam-blocker → starts grabbing).

---

## Phase 2 — Premium Visual Upgrade (portraits + FX only)

Bodies stay procedural per your call. Upgrade is everything *around* the body.

**Hero portraits — all 9 skins**
- Premium imagegen, dark realistic style matched to OgunArena brand.
- Replace placeholder previews on character select. Add hover/idle micro-animation.
- Versus splash screen: portrait slam-in with tagline before each fight.

**Per-skin signature FX (generated textures + code)**
- Spider-Man: web-shot trails, impact webbing on KO.
- Hulk: green shockwave rings, ground crack decals on heavy slam.
- Flash: lightning streak afterimages, sonic-boom ring on dash.
- Homelander: red laser-eye beams, heat distortion.
- Superman: ice-breath puffs, freeze-frost overlay.
- Nightcrawler: bamf smoke + sulfur spark on teleport.
- Each skin gets 1 unique HUD frame element (flag/sigil) on their side of the bar.

**Map polish**
- Generated parallax background art for the 13 maps (3 layers each: far, mid, fg silhouette).
- Foreground occluders (rain, embers, dust) per map mood.
- Environmental hits: wall slams crack the wall texture, ground slams kick up dust matched to map palette.

**UI premium pass**
- HUD redesign: chunkier health bars with damage chip animation, super meter that pulses when full.
- Round transitions: KO freeze + black bar letterbox + slow-mo replay of the final hit.
- Win screen with portrait + stats + Blkdom credit.

---

## Phase 3 — Content & Progression (Lovable Cloud)

Turns it from "demo" into "game you come back to."

**Modes**
- Arcade ladder: 8-fight gauntlet per character with a final boss skin (locked behind clears).
- Survival: endless waves of CPUs, score + leaderboard.
- Daily challenge: fixed matchup + modifier (low gravity, one-hit KO, etc.).

**Meta progression**
- Account (anonymous device id → upgrade to email login).
- XP per match, level → unlocks alt color palettes per skin (recolors via existing skin token system, no new art).
- Cloud save: unlocks, settings, stats sync across devices.
- Global leaderboards per mode.

**Monetization-ready hooks** (build now, monetize later)
- Skin slots flagged `locked: true` — currently free but the gate exists.
- Cosmetic categories: alt palettes, victory poses, intro stings.

---

## What I need from you to start

Just confirm Phase 1 is the starting point. I'll execute it in 3–4 sub-batches:
1. Hit-stop + shake + freeze frames + zoom-punch
2. Blood/damage system + finisher cam
3. Cancel/parry/super system + air juggles
4. Audio layering + AI personalities

Each sub-batch is shippable and playable on its own.

## Files I expect to touch in Phase 1

- `src/game/engine.ts` — hit-stop, shake vector, time-dilation, zoom, blood particles, damage tinting, cancel/parry windows, juggles
- `src/game/combat.ts` — chain windows, parry detection, super activation
- `src/game/ai.ts` — personality profiles, habit reading
- `src/game/sfx.ts` — layered playback, adaptive music switching
- New: `src/game/blood.ts` — particle pool + decal buffer
- New: `src/game/cameraFx.ts` — extracts camera/shake/zoom/timescale into one system

No schema changes in Phase 1. Phase 3 is when Lovable Cloud goes on.

## Risks to call out

- **Mobile perf**: blood particles + extra shake math on a 393px viewport with low-end GPUs. Mitigation: hard caps on active particles, decal ring buffer with auto-fade, skip layered audio if `audioContext.baseLatency > 0.05`.
- **AI-generated portraits drifting off-brand**: I'll generate 2–3 candidates per skin, you pick. Same for map backgrounds.
- **Audio file size**: keep total SFX bundle <2MB by reusing samples with pitch variation.
