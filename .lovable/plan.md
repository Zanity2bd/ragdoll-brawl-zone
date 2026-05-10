# Combat Jumps + Ragdoll Overhaul

Foundational systems pass. Both currently work but feel cheap — flat arcs, plank ragdolls, snappy get-ups. Fix is a structured rewrite of jump physics + air pose + ragdoll articulation, split into 3 shippable sub-batches so the game stays playable after each.

---

## Sub-batch A — Jump physics rewrite

**Goal:** weighty, decisive arcs with anticipation and recovery.

1. **Anticipation crouch** (60–90ms). On jump press, enter a `preJump` state with hip dip + knee bend; takeoff velocity applied at end of crouch. Cancellable into block but not into another move.
2. **Variable jump height.** Track `jumpHeld`. Releasing jump while `vy < 0` clamps `vy *= 0.45` (Mario-style). Encodes player skill into the arc.
3. **Stronger gravity + faster falls.** Bump base gravity ~25%, then apply a `1.6× gravity` multiplier once `vy > 0` (apex-cut). Removes the floaty hang.
4. **Coyote time + jump buffer** (already partially there — verify and tune to 90ms / 110ms).
5. **Landing recovery.** On touchdown with significant `|vy|`, enter `landSquash` for 100–140ms scaled by impact velocity. Movement-locked but cancel into attack (combat snappiness).

## Sub-batch B — Air pose system

**Goal:** silhouette reads as "human jumping" not "stick stuck mid-frame".

1. **Phase from vy.** Replace the single air pose with phases:
   - `takeoff` (vy < -300): legs extending, arms swinging up
   - `tuck` (-300 ≤ vy ≤ 200): knees up to chest, arms in
   - `fall` (vy > 200): legs reaching down for landing, arms out for balance
2. **Per-phase pose offsets** in `poseFor()` driven by interpolated `vy → phase` weights so transitions blend (no snap).
3. **Facing-aware lean.** Apply small forward torso lean during horizontal air movement (atan2 of vx/vy clamped to ±15°).
4. **Land-impact pose.** During `landSquash`, knees bent 40°, torso compressed 12%, arms forward for balance.

## Sub-batch C — Ragdoll articulation + settle + rise

**Goal:** floppy limbs, body settles convincingly, get-up looks heavy.

1. **Per-limb wobble during ragdoll.** Currently rotates as one rigid body with rotation `ragdollAng`. Add 4 sub-rotations (`headLag`, `armLagL`, `armLagR`, `legLag`) integrated against `ragdollAV` with damping → limbs trail the torso instead of moving with it.
2. **Ground friction + settle threshold.** When `onGround && |vx| < 40 && |ragdollAV| < 0.6`, accelerate decay of `ragdollT`. Damping factor 0.88/frame on `vx` while ragdolled and grounded. Stops the slide.
3. **Body roll on landing.** First ground contact while ragdolled adds one impact rotation pulse (`ragdollAV += dir × |vy| × 0.01`) — the body tumbles into a stop instead of pancaking.
4. **Smoother rise blend.** The 6 phases (`gather → press → kneel → coil → drive → settle`) are good in concept but the local→lift curve snaps between phases. Replace with a single smoothstep applied across phase boundaries (lerp neighbouring lift values when within ±0.04 of a boundary).
5. **Get-up weight cues.** Add subtle camera shake (1–2 trauma) on `drive→settle` transition, and a faint dust scuff at feet on the same beat (reuses existing `groundDecals`).

---

## Files touched

- `src/game/engine.ts` — jump state machine, gravity/landing, ragdoll integration, settle, rise blend
- `src/game/wobble.ts` (or wherever pose lives) — air phase pose, land squash pose, per-limb ragdoll lag
- New ragdoll fields on `Fighter` interface: `preJumpT`, `landSquashT`, `headLag`, `armLagL`, `armLagR`, `legLag`

No new assets, no schema changes.

---

## Risks

- **Jump anticipation can feel laggy** if too long. I'll start at 70ms and tune from preview.
- **Per-limb ragdoll on mobile**: 4 extra angles × 2 fighters = 8 lerps/frame. Negligible, but I'll keep wobble integration in the existing `stepWobble` loop to avoid extra function calls.
- **Variable jump height changes feel of every existing combo** that relies on a fixed apex. I'll tune apex height to match the current max height when jump is held, so existing combos still connect.

---

## Order of operations

1. Sub-batch A first (physics is the foundation — pose only matters if the arc is right).
2. Then B (pose uses phase data from A).
3. Then C (ragdoll is independent but biggest risk — last so previous batches are stable).

Each is a single commit, fully playable. I'll typecheck after each.
