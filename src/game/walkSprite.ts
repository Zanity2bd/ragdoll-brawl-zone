// Sprite-sheet walk cycle (66 frames, 144x100 each, horizontal strip).
// Used to replace the procedural walk render with the imported reference.
// Tinting is done per-skin via an offscreen canvas with source-in compositing,
// then cached so we only re-tint when the color changes.

import sheetUrl from "@/assets/walk-sheet.png";

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;
export const WALK_FRAME_COUNT = 15;
// Approx vertical position of the feet in each frame, measured in the
// source frame. Used so we can pin the foot baseline to the
// fighter's ground line in-game.
export const WALK_FOOT_Y = 200;

let sheet: HTMLImageElement | null = null;
let sheetReady = false;

const tintCache = new Map<string, HTMLCanvasElement>();

export function loadWalkSheet() {
  if (sheet) return sheet;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => { sheetReady = true; };
  img.src = sheetUrl;
  sheet = img;
  return img;
}

export function isWalkSheetReady() {
  return sheetReady;
}

/** Returns an offscreen canvas of the full sheet tinted to `color`,
 *  with contrast boosted (the source frames are very light gray). */
export function getTintedSheet(color: string): HTMLCanvasElement | null {
  if (!sheet || !sheetReady) return null;
  const cached = tintCache.get(color);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = sheet.naturalWidth;
  c.height = sheet.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // 1) Draw the source so we have its alpha mask.
  ctx.drawImage(sheet, 0, 0);
  // 2) Replace pixels with solid skin color (boosts contrast — source is faint gray).
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-over";
  tintCache.set(color, c);
  return c;
}

/** Draw frame `idx` (0..65) of the tinted sheet centered horizontally at
 *  (cx, footY-WALK_FRAME_H+yOffset), respecting facing (-1 mirrors). */
export function drawWalkFrame(
  ctx: CanvasRenderingContext2D,
  color: string,
  idx: number,
  cx: number,
  footY: number,
  facing: 1 | -1,
  height: number,
) {
  const tinted = getTintedSheet(color);
  if (!tinted) return false;
  const i = ((idx % WALK_FRAME_COUNT) + WALK_FRAME_COUNT) % WALK_FRAME_COUNT;
  const sx = i * WALK_FRAME_W;
  const scale = height / WALK_FRAME_H;
  const dw = WALK_FRAME_W * scale;
  const dh = height;
  ctx.save();
  ctx.translate(cx, footY);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(
    tinted,
    sx, 0, WALK_FRAME_W, WALK_FRAME_H,
    -dw / 2, -dh, dw, dh,
  );
  ctx.restore();
  return true;
}
