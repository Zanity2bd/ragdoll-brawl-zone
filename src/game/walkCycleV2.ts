// Hand-drawn 6-frame walk keyposes (user-authored).
// Pipeline: luma-key gray bg → fit silhouette into the same 144x200 cell as
// walk-sheet.png with feet on WALK_FOOT_Y → tint per-skin → bake overlays.
// Hot path = 1 drawImage per fighter per frame, fully cached per skin.

import frame0 from "@/assets/walk-frames-v2/walk-00.png";
import frame1 from "@/assets/walk-frames-v2/walk-01.png";
import frame2 from "@/assets/walk-frames-v2/walk-02.png";
import frame3 from "@/assets/walk-frames-v2/walk-03.png";
import frame4 from "@/assets/walk-frames-v2/walk-04.png";
import frame5 from "@/assets/walk-frames-v2/walk-05.png";
import type { Skin } from "./skins";
import { WALK_FRAME_W, WALK_FRAME_H, WALK_FOOT_Y } from "./walkSprite";

export const V2_FRAME_COUNT = 6;

interface V2Anchor {
  hx: number; hy: number; hr: number;
  cx: number; cy: number;
  hipY: number; footY: number;
  legSpread: number;   // |footL.x - footR.x| in cell px (used for stride classification)
  leadSign: number;    // sign of (footL.x - footR.x); +1 = left foot ahead in cell space
}

const SOURCES = [frame0, frame1, frame2, frame3, frame4, frame5];

let basePages: HTMLCanvasElement | null = null;
let baseAnchors: V2Anchor[] = [];
let ready = false;
let loading = false;
const skinCache = new Map<string, HTMLCanvasElement>();
type ReadyCb = () => void;
const readyCbs: ReadyCb[] = [];

export function isV2Ready() { return ready; }
export function onV2Ready(cb: ReadyCb) {
  if (ready) cb();
  else readyCbs.push(cb);
}
export function getV2Anchors(): ReadonlyArray<V2Anchor> { return baseAnchors; }

export function loadV2Sheet() {
  if (loading || ready) return;
  loading = true;
  const imgs: HTMLImageElement[] = SOURCES.map((src) => {
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    return im;
  });
  let pending = imgs.length;
  imgs.forEach((im) => {
    const done = () => { if (--pending === 0) buildBase(imgs); };
    if (im.complete && im.naturalWidth > 0) done();
    else { im.onload = done; im.onerror = done; }
  });
}

function buildBase(imgs: HTMLImageElement[]) {
  const strip = document.createElement("canvas");
  strip.width = WALK_FRAME_W * V2_FRAME_COUNT;
  strip.height = WALK_FRAME_H;
  const sctx = strip.getContext("2d");
  if (!sctx) return;
  baseAnchors = [];

  for (let i = 0; i < V2_FRAME_COUNT; i++) {
    const im = imgs[i];
    if (!im || !im.naturalWidth) { baseAnchors.push(defaultAnchor()); continue; }

    const tmp = document.createElement("canvas");
    tmp.width = im.naturalWidth;
    tmp.height = im.naturalHeight;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    if (!tctx) { baseAnchors.push(defaultAnchor()); continue; }
    tctx.drawImage(im, 0, 0);
    const id = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const px = id.data;
    let minX = tmp.width, minY = tmp.height, maxX = 0, maxY = 0, hits = 0;
    for (let p = 0; p < px.length; p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      const bright = (r + g + b) / 3;
      if (bright > 200) {
        const idx = p / 4;
        const x = idx % tmp.width;
        const y = (idx / tmp.width) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        hits++;
        px[p] = 255; px[p + 1] = 255; px[p + 2] = 255; px[p + 3] = 255;
      } else {
        px[p + 3] = 0;
      }
    }
    if (hits < 50) { baseAnchors.push(defaultAnchor()); continue; }
    tctx.putImageData(id, 0, 0);

    const srcW = maxX - minX + 1;
    const srcH = maxY - minY + 1;
    const targetH = 190;
    const scale = targetH / srcH;
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = i * WALK_FRAME_W + (WALK_FRAME_W - dw) / 2;
    const dy = WALK_FOOT_Y - dh + 2;
    sctx.drawImage(tmp, minX, minY, srcW, srcH, dx, dy, dw, dh);

    const cellId = sctx.getImageData(i * WALK_FRAME_W, 0, WALK_FRAME_W, WALK_FRAME_H);
    baseAnchors.push(extractAnchors(cellId, WALK_FRAME_W, WALK_FRAME_H));
  }

  basePages = strip;
  ready = true;
  skinCache.clear();
  while (readyCbs.length) readyCbs.shift()!();
}

function defaultAnchor(): V2Anchor {
  return { hx: 72, hy: 18, hr: 13, cx: 72, cy: 50, hipY: 110, footY: WALK_FOOT_Y, legSpread: 10, leadSign: 0 };
}

function extractAnchors(id: ImageData, w: number, h: number): V2Anchor {
  const px = id.data;
  const rowMin = new Int16Array(h);
  const rowMax = new Int16Array(h);
  for (let y = 0; y < h; y++) { rowMin[y] = w; rowMax[y] = -1; }
  let minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = px[row + x * 4 + 3];
      if (a > 50) {
        if (x < rowMin[y]) rowMin[y] = x;
        if (x > rowMax[y]) rowMax[y] = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY <= minY) return defaultAnchor();

  let headTop = minY;
  for (let y = minY; y < Math.min(minY + 30, h); y++) {
    if (rowMax[y] - rowMin[y] > 4) { headTop = y; break; }
  }
  const headBot = Math.min(headTop + 22, h - 1);
  let hxAcc = 0, hxN = 0, hr = 12;
  for (let y = headTop; y <= headBot; y++) {
    if (rowMax[y] >= rowMin[y]) {
      hxAcc += (rowMin[y] + rowMax[y]) / 2;
      hxN++;
      hr = Math.max(hr, (rowMax[y] - rowMin[y]) / 2);
    }
  }
  const hx = hxN > 0 ? hxAcc / hxN : w / 2;
  const hy = headTop + (headBot - headTop) / 2;
  const chestY = headBot + Math.round((maxY - headBot) * 0.28);
  const cx = (rowMin[chestY] + rowMax[chestY]) / 2 || hx;
  const cy = chestY;
  const hipY = headBot + Math.round((maxY - headBot) * 0.50);
  const footY = maxY;

  // Foot/leg spread: scan bottom 14 rows; legSpread = max - min of any opaque pixel.
  let footMinX = w, footMaxX = -1;
  let leftFootX = 0, leftN = 0, rightFootX = 0, rightN = 0;
  const midX = (rowMin[hipY] + rowMax[hipY]) / 2 || hx;
  for (let y = Math.max(0, maxY - 14); y <= maxY; y++) {
    if (rowMax[y] < rowMin[y]) continue;
    if (rowMin[y] < footMinX) footMinX = rowMin[y];
    if (rowMax[y] > footMaxX) footMaxX = rowMax[y];
    // Sample center of any opaque run on this row to bias foot positions
    const lo = rowMin[y], hi = rowMax[y];
    if (lo < midX) { leftFootX += lo; leftN++; }
    if (hi > midX) { rightFootX += hi; rightN++; }
  }
  const lFx = leftN > 0 ? leftFootX / leftN : footMinX;
  const rFx = rightN > 0 ? rightFootX / rightN : footMaxX;
  const legSpread = Math.max(0, footMaxX - footMinX);
  const leadSign = Math.sign((rFx - midX) - (midX - lFx));

  return {
    hx: Math.round(hx),
    hy: Math.round(hy),
    hr: Math.round(Math.min(15, Math.max(10, hr))),
    cx: Math.round(cx),
    cy: Math.round(cy),
    hipY: Math.round(hipY),
    footY: Math.round(footY),
    legSpread: Math.round(legSpread),
    leadSign,
  };
}

function getSkinSheetV2(skin: Skin): HTMLCanvasElement | null {
  if (!ready || !basePages) return null;
  const cached = skinCache.get(skin.id);
  if (cached) return cached;

  const W = basePages.width;
  const H = basePages.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(basePages, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = skin.limb ?? skin.body;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  for (let i = 0; i < V2_FRAME_COUNT; i++) {
    drawOverlaysV2(ctx, skin, i * WALK_FRAME_W, baseAnchors[i]);
  }
  skinCache.set(skin.id, c);
  return c;
}

function drawOverlaysV2(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  ox: number,
  a: V2Anchor,
) {
  const hx = ox + a.hx;
  const hy = a.hy;
  const cx = ox + a.cx;
  const cy = a.cy;
  const r = a.hr;

  if (skin.cape) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = skin.cape;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy - r * 0.4);
    ctx.quadraticCurveTo(cx - r * 1.6, a.hipY + 18, cx - r * 0.4, a.footY - 18);
    ctx.lineTo(cx + r * 0.4, a.footY - 18);
    ctx.quadraticCurveTo(cx + r * 1.6, a.hipY + 18, cx + r * 0.9, cy - r * 0.4);
    ctx.closePath();
    ctx.fill();
    if (skin.capeAccent) {
      ctx.fillStyle = skin.capeAccent;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.4, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.2, a.footY - 22);
      ctx.lineTo(cx - r * 0.2, a.footY - 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = skin.head ?? skin.body;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();
  if (skin.skinTone) {
    ctx.fillStyle = skin.skinTone;
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.15, r * 0.78, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.head ?? "oklch(0.18 0.02 30)";
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.2, r * 0.95, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  if (skin.cowlEars) {
    ctx.fillStyle = skin.head ?? skin.body;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.7, hy - r * 0.5);
    ctx.lineTo(hx - r * 0.45, hy - r * 1.7);
    ctx.lineTo(hx - r * 0.2, hy - r * 0.6);
    ctx.closePath();
    ctx.moveTo(hx + r * 0.7, hy - r * 0.5);
    ctx.lineTo(hx + r * 0.45, hy - r * 1.7);
    ctx.lineTo(hx + r * 0.2, hy - r * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  drawEyesV2(ctx, skin, hx, hy, r);
  if (skin.beard) {
    ctx.fillStyle = "oklch(0.16 0.01 30)";
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.6, r * 0.7, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (skin.emblem) {
    ctx.save();
    ctx.fillStyle = skin.emblem.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (skin.body !== (skin.limb ?? skin.body)) {
    ctx.save();
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 1.0, r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (skin.emblem) {
      ctx.fillStyle = skin.emblem.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEyesV2(ctx: CanvasRenderingContext2D, skin: Skin, hx: number, hy: number, r: number) {
  const ey = hy - r * 0.05;
  const ex = r * 0.38;
  // Spider-Man eyes live only in walkSprite.ts (single-silhouette bake).

  if (skin.id === "ironman" || skin.id === "batman") {
    ctx.fillStyle = skin.id === "ironman" ? "oklch(0.92 0.18 200)" : "oklch(0.95 0.04 100)";
    [-1, 1].forEach((s) => ctx.fillRect(hx + s * ex - 4, ey - 1, 6, 3));
    return;
  }
  if (skin.glowingEyes) {
    ctx.fillStyle = skin.glowingEyes;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    return;
  }
  if (skin.skinTone) {
    ctx.fillStyle = "oklch(0.16 0.02 260)";
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Draw v2 frame `idx` (0..5), optionally horizontally mirrored. */
export function drawV2Frame(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  idx: number,
  cx: number,
  footY: number,
  facing: 1 | -1,
  height: number,
  mirror = false,
): boolean {
  const composed = getSkinSheetV2(skin);
  if (!composed) return false;
  const i = ((idx % V2_FRAME_COUNT) + V2_FRAME_COUNT) % V2_FRAME_COUNT;
  const sx = i * WALK_FRAME_W;
  const scale = height / WALK_FRAME_H;
  const dw = WALK_FRAME_W * scale;
  const dh = height;
  const sign: 1 | -1 = (mirror ? -facing : facing) as 1 | -1;
  ctx.save();
  ctx.translate(cx, footY);
  if (sign === -1) ctx.scale(-1, 1);
  ctx.drawImage(composed, sx, 0, WALK_FRAME_W, WALK_FRAME_H, -dw / 2, -dh, dw, dh);
  ctx.restore();
  return true;
}
