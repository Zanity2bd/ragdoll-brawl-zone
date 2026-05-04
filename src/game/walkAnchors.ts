// Anatomy anchors for walk-sheet.png frames.
// Stable across frames since the source art mostly animates the legs;
// keeping head/chest fixed avoids overlay jitter.
export interface WalkAnchor {
  hx: number; hy: number; hr: number;   // head center + radius
  cx: number; cy: number;               // chest center
  hipY: number; footY: number;          // vertical anchors
}

const SHARED: WalkAnchor = {
  hx: 65, hy: 24, hr: 13,
  cx: 63, cy: 60,
  hipY: 105, footY: 189,
};

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;

export const WALK_ANCHORS: ReadonlyArray<WalkAnchor> = Array.from(
  { length: 14 },
  () => SHARED,
);
