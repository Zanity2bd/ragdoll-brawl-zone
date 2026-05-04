// Per-frame anatomy anchors extracted from walk-sheet.png alpha.
// Drives where overlays (face, mask, eyes, chest emblem, cape) get pinned.
export interface WalkAnchor {
  hx: number; hy: number; hr: number;
  cx: number; cy: number;
  hipY: number; footY: number;
}

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;

export const WALK_ANCHORS: ReadonlyArray<WalkAnchor> = [
  // Walk loop (0..9)
  { hx: 66, hy: 14, hr: 13, cx: 65, cy: 45, hipY: 106, footY: 193 },
  { hx: 78, hy: 14, hr: 13, cx: 74, cy: 46, hipY: 106, footY: 193 },
  { hx: 73, hy: 14, hr: 13, cx: 72, cy: 45, hipY: 106, footY: 193 },
  { hx: 69, hy: 14, hr: 13, cx: 69, cy: 46, hipY: 106, footY: 193 },
  { hx: 66, hy: 14, hr: 13, cx: 65, cy: 45, hipY: 106, footY: 193 },
  { hx: 78, hy: 14, hr: 13, cx: 74, cy: 46, hipY: 106, footY: 193 },
  { hx: 73, hy: 14, hr: 13, cx: 72, cy: 45, hipY: 106, footY: 193 },
  { hx: 69, hy: 14, hr: 13, cx: 69, cy: 46, hipY: 106, footY: 193 },
  { hx: 78, hy: 14, hr: 13, cx: 74, cy: 46, hipY: 106, footY: 193 },
  { hx: 84, hy: 15, hr: 14, cx: 79, cy: 47, hipY: 106, footY: 193 },
  // Punch (10..13)
  { hx: 71, hy: 15, hr: 14, cx: 67, cy: 46, hipY: 106, footY: 193 },
  { hx: 87, hy: 56, hr: 14, cx: 72, cy: 84, hipY: 123, footY: 193 },
  { hx: 98, hy: 27, hr: 14, cx: 94, cy: 50, hipY: 110, footY: 193 },
  { hx: 105, hy: 16, hr: 14, cx: 98, cy: 46, hipY: 106, footY: 193 },
  // Punch recovery (14)
  { hx: 70, hy: 15, hr: 13, cx: 63, cy: 45, hipY: 106, footY: 193 },
  // Jump takeoff (15) — squat
  { hx: 105, hy: 16, hr: 14, cx: 91, cy: 45, hipY: 106, footY: 193 },
  // Jump rising (16)
  { hx: 71, hy: 14, hr: 13, cx: 78, cy: 45, hipY: 106, footY: 193 },
  // Jump apex (17)
  { hx: 95, hy: 15, hr: 14, cx: 78, cy: 45, hipY: 106, footY: 193 },
  // Jump landing (18) — squash
  { hx: 73, hy: 15, hr: 14, cx: 78, cy: 42, hipY: 106, footY: 193 },
  // Downed flat (19) — body horizontal, head left side
  { hx: 69, hy: 115, hr: 14, cx: 68, cy: 150, hipY: 149, footY: 193 },
  // Get-up A (20)
  { hx: 118, hy: 72, hr: 14, cx: 121, cy: 101, hipY: 130, footY: 193 },
  // Get-up B (21)
  { hx: 75, hy: 62, hr: 14, cx: 66, cy: 91, hipY: 125, footY: 193 },
  // Hurt / recoil (22)
  { hx: 68, hy: 14, hr: 14, cx: 73, cy: 46, hipY: 106, footY: 193 },
];
