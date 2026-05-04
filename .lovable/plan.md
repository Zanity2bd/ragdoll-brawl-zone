## Plan: Replace procedural special attacks with sprite-driven sequences

The combo system (Punch → High Kick → Knee) already runs on baked sprite frames (23–29). All the **character-specific specials** (Heat Punch, Ground Smash, Web Yank, Repulsor, Crowbar Swing, Laser Eyes, etc.) still use the old procedural stick-figure math in `computeAttackPose`. This plan replaces them with the same sprite-sequence pipeline so every move feels consistent and fluid.

### Steps

1. **Expand sprite sheet (`src/assets/walk-sheet.png`)**
   - Bake ~45 new frames (currently 30 → ~75) mined from the uploaded `stick.zip`, `taijutsu.zip`, `npc1.zip`, `npc2.zip`:
     - Sword arc (5 frames)
     - Spear stab (4 frames)
     - Heavy uppercut (5 frames)
     - Ground smash windup + slam + recovery (6 frames)
     - Grapple/yank pull (5 frames)
     - Charged-beam stance (4 frames)
     - Crowbar/club swing (5 frames)
     - Aerial dive kick (4 frames)
     - Knockdown / get-up (7 frames)

2. **Sequence registry (`src/game/attackSequences.ts`)**
   - New file mapping each special to a frame playlist:
     ```ts
     heatPunch: { frames: [40,41,42,43], durations: [60,80,140,100], hitWindow: [2], dmg: 8, range: 70 }
     groundSmash: { frames: [50,51,52,53,54,55], hitWindow: [3], dmg: 12, range: 90, shockwave: true }
     webYank: { frames: [56,57,58,59,60], hitWindow: [2], pull: 120 }
     repulsor: { frames: [65,66,67,68], hitWindow: [3], projectile: 'beam' }
     crowbar: { frames: [70,71,72,73,74], hitWindow: [2,3], dmg: 7 }
     ```
   - Each entry declares damage, range, knockback, optional projectile spawn, and which frame(s) trigger hit detection.

3. **Sequence player (`src/game/engine.ts`)**
   - Add `playAttackSequence(f, kind)` to set `f.seqKind`, `f.seqFrameIdx`, `f.seqT`.
   - Tick advances frame by accumulated duration.
   - Renderer priority: `seqKind` > `comboKind` > walk/punch > idle.
   - 2-frame cross-fade (alpha blend) on transitions to kill stutter.
   - Hit detection runs only on declared `hitWindow` frames.

4. **AI-generated FX overlays (4 sprites)**
   - `impact-star.png` — flashes on hit-window frame
   - `charge-ring.png` — overlay during windup frames
   - `slash-arc.png` — additive blend along weapon path
   - `shockwave-ring.png` — expands from feet on Ground Smash
   - All routed through existing FX layer; no new render pipeline.

5. **Anchor table extension (`src/game/walkAnchors.ts`)**
   - Auto-detect bbox of head/chest/hip pixels for the ~45 new frames; emit coordinates so skin masks (Marvel/DC/Boys emblems) stay pinned during the new specials.

6. **Wire 3 specials first, then the rest**
   - Phase A (this approval): Heat Punch, Ground Smash, Crowbar — proves the pipeline end-to-end.
   - Phase B (after you confirm it feels right): Web Yank, Repulsor, Laser Eyes, Dive Kick, Sword Arc, Spear Stab, Uppercut.

### Notes

- Old procedural `computeAttackPose` stays as fallback for any special not yet migrated — zero regression risk.
- All new frames respect mobile-first: same 96px fighter height, no extra GPU cost (single sprite sheet, single draw call per fighter).
- Audio: reuse `attackImpact` with per-special pitch/volume tweaks; add `whoosh` for windup frames.

### Files

- edit `src/assets/walk-sheet.png` (30 → ~75 frames)
- create `src/game/attackSequences.ts`
- create `src/assets/fx/impact-star.png`, `charge-ring.png`, `slash-arc.png`, `shockwave-ring.png`
- edit `src/game/engine.ts` (sequence player + hit windows + renderer priority)
- edit `src/game/walkAnchors.ts` (anchors for new frames)
- edit `src/game/sfx.ts` (whoosh + per-special impact variants)

Approve and I'll execute Phase A (sheet bake + registry + Heat Punch / Ground Smash / Crowbar wired up).