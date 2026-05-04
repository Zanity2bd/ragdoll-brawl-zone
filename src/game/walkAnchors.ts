// Per-frame anatomy anchors extracted from walk-sheet.png alpha.
// Drives where overlays (face, mask, eyes, chest emblem, cape) get pinned
// so character design tracks the body across walk + punch + recovery.
export interface WalkAnchor {
  hx: number; hy: number; hr: number;   // head center + radius
  cx: number; cy: number;               // chest center
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
  // Recovery (14)
  { hx: 70, hy: 15, hr: 13, cx: 63, cy: 45, hipY: 106, footY: 193 },
];
