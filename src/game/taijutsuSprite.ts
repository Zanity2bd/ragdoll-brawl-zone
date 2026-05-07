// Taijutsu flurry sprite playback.
// 770x480 sheet, 7 cols x 6 rows, 42 frames at 110x80, white silhouettes.
// Tint per skin and render one frame at a time during Nightcrawler's combo.

import sheetUrl from "@/assets/heroes/taijutsu-sheet.png";
import type { Skin } from "./skins";

export const TAI_FRAME_W = 110;
export const TAI_FRAME_H = 80;
export const TAI_COLS = 7;
export const TAI_ROWS = 6;
export const TAI_FRAME_COUNT = 42;
// Authored foot Y inside an 80px frame (visually around row 70).
const TAI_FOOT_Y = 72;

let sheet: HTMLImageElement | null = null;
let sheetReady = false;

const cache = new Map<string, HTMLCanvasElement>();

export function loadTaijutsuSheet() {
  if (sheet) return sheet;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => { sheetReady = true; };
  img.src = sheetUrl;
  sheet = img;
  return img;
}

export function isTaijutsuReady() { return sheetReady; }

function getTinted(skin: Skin): HTMLCanvasElement | null {
  if (!sheet || !sheetReady) return null;
  const cached = cache.get(skin.id);
  if (cached) return cached;
  const W = sheet.naturalWidth, H = sheet.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // Tint: silhouette → skin body
  ctx.drawImage(sheet, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = skin.body;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  // Subtle inner glow accent on top half (mask colour bias)
  if (skin.head && skin.head !== skin.body) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = `color-mix(in oklab, ${skin.head} 55%, transparent)`;
    for (let i = 0; i < TAI_FRAME_COUNT; i++) {
      const col = i % TAI_COLS, row = (i / TAI_COLS) | 0;
      const ox = col * TAI_FRAME_W, oy = row * TAI_FRAME_H;
      // Head is roughly upper 18% of body silhouette
      ctx.fillRect(ox, oy, TAI_FRAME_W, TAI_FRAME_H * 0.22);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  cache.set(skin.id, c);
  return c;
}

/**
 * Draw taijutsu frame `idx` so the silhouette's feet land at (footX, footY).
 * Scaled so the silhouette height matches `targetH` (the engine's FIGHTER_H).
 */
export function drawTaijutsuFrame(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  idx: number,
  footX: number,
  footY: number,
  facing: 1 | -1,
  targetH: number,
) {
  const tinted = getTinted(skin);
  if (!tinted) return;
  const i = Math.max(0, Math.min(TAI_FRAME_COUNT - 1, idx | 0));
  const col = i % TAI_COLS, row = (i / TAI_COLS) | 0;
  const sx = col * TAI_FRAME_W, sy = row * TAI_FRAME_H;
  // Scale: authored foot pos within frame should sit at footY.
  const scale = (targetH * 1.18) / TAI_FRAME_H;
  const dW = TAI_FRAME_W * scale;
  const dH = TAI_FRAME_H * scale;
  const dFootY = footY;
  const dy = dFootY - TAI_FOOT_Y * scale;
  ctx.save();
  if (facing < 0) {
    ctx.translate(footX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-footX, 0);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tinted, sx, sy, TAI_FRAME_W, TAI_FRAME_H, footX - dW / 2, dy, dW, dH);
  ctx.restore();
}
