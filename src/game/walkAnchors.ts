// Per-frame anatomy anchors extracted from walk-sheet.png alpha.
// Drives where overlays (face, mask, eyes, chest emblem, cape) get pinned.
//
// Combat frames (10..29) re-measured by sprite-alpha topology scan: find the
// topmost compact run (head ball, width 8..36) that opens ≥14 rows downward,
// then take chest as the densest band 28..54 px below head top. Walk frames
// (0..9) retain the legacy convention (hy=head center ≈ ytop+13, hr=13) so
// existing skin overlays still align.
export interface WalkAnchor {
  hx: number; hy: number; hr: number;
  cx: number; cy: number;
  hipY: number; footY: number;
}

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;

export const WALK_ANCHORS: ReadonlyArray<WalkAnchor> = [
  // Walk loop (0..9)
  { hx: 66, hy: 13, hr: 13, cx: 63, cy: 40, hipY: 106, footY: 193 },
  { hx: 78, hy: 13, hr: 13, cx: 74, cy: 40, hipY: 106, footY: 193 },
  { hx: 73, hy: 13, hr: 13, cx: 71, cy: 40, hipY: 106, footY: 193 },
  { hx: 69, hy: 13, hr: 13, cx: 67, cy: 40, hipY: 106, footY: 193 },
  { hx: 66, hy: 13, hr: 13, cx: 63, cy: 40, hipY: 106, footY: 193 },
  { hx: 78, hy: 13, hr: 13, cx: 74, cy: 40, hipY: 106, footY: 193 },
  { hx: 73, hy: 13, hr: 13, cx: 71, cy: 40, hipY: 106, footY: 193 },
  { hx: 69, hy: 13, hr: 13, cx: 67, cy: 40, hipY: 106, footY: 193 },
  { hx: 78, hy: 13, hr: 13, cx: 73, cy: 40, hipY: 106, footY: 193 },
  { hx: 85, hy: 13, hr: 13, cx: 76, cy: 40, hipY: 106, footY: 193 },
  // Punch (10..13)
  { hx: 71, hy: 13, hr: 13, cx: 63, cy: 40, hipY: 106, footY: 193 },
  { hx: 87, hy: 51, hr: 13, cx: 76, cy: 78, hipY: 123, footY: 193 },
  { hx: 98, hy: 22, hr: 13, cx: 98, cy: 49, hipY: 110, footY: 193 },
  { hx: 106, hy: 13, hr: 13, cx: 96, cy: 40, hipY: 106, footY: 193 },
  // Punch recovery (14)
  { hx: 71, hy: 13, hr: 13, cx: 62, cy: 40, hipY: 106, footY: 193 },
  // Jump takeoff (15) — squat
  { hx: 105, hy: 13, hr: 13, cx: 97, cy: 40, hipY: 106, footY: 193 },
  // Jump rising (16)
  { hx: 70, hy: 13, hr: 13, cx: 80, cy: 40, hipY: 106, footY: 193 },
  // Jump apex (17)
  { hx: 95, hy: 13, hr: 13, cx: 85, cy: 40, hipY: 106, footY: 193 },
  // Jump landing (18) — squash
  { hx: 72, hy: 13, hr: 13, cx: 82, cy: 40, hipY: 106, footY: 193 },
  // Downed flat (19) — body horizontal, re-measured from sprite alpha
  { hx: 67, hy: 113, hr: 13, cx: 59, cy: 133, hipY: 150, footY: 193 },
  // Get-up A (20) — head right, chest below; chest re-measured (cx 99 not 111)
  { hx: 119, hy: 69, hr: 13, cx: 99, cy: 93, hipY: 128, footY: 193 },
  // Get-up B (21) — chest re-measured (cx 61 not 75), hy 62 not 57
  { hx: 74, hy: 62, hr: 13, cx: 61, cy: 84, hipY: 124, footY: 193 },
  // Hurt / recoil (22) — actual sprite: head stays near top, NOT dropped
  { hx: 67, hy: 12, hr: 13, cx: 73, cy: 42, hipY: 106, footY: 193 },
  // High kick chamber (23) — head far left, supporting leg right; was very wrong (hx:78)
  { hx: 38, hy: 33, hr: 13, cx: 26, cy: 60, hipY: 110, footY: 193 },
  // High kick extend (24) — leg up & forward
  { hx: 53, hy: 17, hr: 13, cx: 63, cy: 44, hipY: 112, footY: 193 },
  // Knee chamber (25) — crouched low
  { hx: 57, hy: 71, hr: 13, cx: 68, cy: 98, hipY: 145, footY: 193 },
  // Knee strike (26) — driving knee up
  { hx: 48, hy: 28, hr: 13, cx: 59, cy: 55, hipY: 124, footY: 193 },
  // Slash windup (27) — deeply coiled; was very wrong (hy:22 vs actual 80)
  { hx: 76, hy: 80, hr: 13, cx: 61, cy: 106, hipY: 116, footY: 193 },
  // Slash forward (28) — weapon out, body extended
  { hx: 55, hy: 13, hr: 13, cx: 65, cy: 40, hipY: 110, footY: 193 },
  // Slash recover (29) — weapon overhead
  { hx: 51, hy: 22, hr: 13, cx: 51, cy: 49, hipY: 112, footY: 193 },
];
