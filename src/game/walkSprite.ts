// Per-skin walk-sheet renderer.
//
// The hot path is intentionally boring: drawWalkFrame() does one drawImage from
// a cached per-skin atlas. The expensive work happens once per skin, where the
// base alpha sheet is scanned frame-by-frame and skin materials are baked onto
// the exact pose geometry.

import sheetUrl from "@/assets/walk-sheet.png";
import type { Skin } from "./skins";

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;
export const WALK_FRAME_COUNT = 30;
export const WALK_LOOP_FRAMES = 10;
export const PUNCH_FRAME_START = 10;
export const PUNCH_FRAME_COUNT = 4;
export const RECOVERY_FRAME = 14;
export const JUMP_TAKEOFF_FRAME = 15;
export const JUMP_RISE_FRAME = 16;
export const JUMP_APEX_FRAME = 17;
export const JUMP_LAND_FRAME = 18;
export const DOWN_FRAME = 19;
export const GETUP_FRAME_A = 20;
export const GETUP_FRAME_B = 21;
export const HURT_FRAME = 22;
export const KICK_CHAMBER_FRAME = 23;
export const KICK_HIT_FRAME = 24;
export const KNEE_CHAMBER_FRAME = 25;
export const KNEE_HIT_FRAME = 26;
export const SLASH_WINDUP_FRAME = 27;
export const SLASH_HIT_FRAME = 28;
export const SLASH_RECOVER_FRAME = 29;
export const WALK_FOOT_Y = 189;

const SKIN_CACHE_VERSION = "v1-alpha-authored-materials";
const ALPHA_THRESHOLD = 24;
const HEAD_SCAN_R = 13;

let sheet: HTMLImageElement | null = null;
let sheetReady = false;
let sheetModel: SheetModel | null = null;

const skinCache = new Map<string, HTMLCanvasElement>();

export function loadWalkSheet() {
  if (!sheet) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { sheetReady = true; };
    img.src = sheetUrl;
    sheet = img;
  }
  return sheet;
}

export function isWalkSheetReady() {
  return sheetReady;
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FrameAnatomy {
  frame: number;
  bbox: Box;
  head: Point & { r: number; top: number; bottom: number };
  chest: Point;
  hip: Point;
  shoulderY: number;
  footY: number;
  hands: { left: Point; right: Point };
  feet: { left: Point; right: Point };
}

interface SheetModel {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frames: FrameAnatomy[];
}

interface SkinLook {
  base: string;
  body: string;
  limb: string;
  head: string;
  trim: string;
  shadow: string;
  highlight: string;
  eye: string;
  metal?: string;
  suitDark?: string;
}

/** Build (or return cached) per-skin sprite sheet with authored materials. */
function getSkinSheet(skin: Skin): HTMLCanvasElement | null {
  if (!sheet || !sheetReady) return null;

  const model = getSheetModel();
  if (!model) return null;

  const cacheKey = `${SKIN_CACHE_VERSION}:${skin.id}`;
  const cached = skinCache.get(cacheKey);
  if (cached) return cached;

  const c = document.createElement("canvas");
  c.width = model.width;
  c.height = model.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < WALK_FRAME_COUNT; i++) {
    paintFrame(ctx, skin, model.frames[i]);
  }

  skinCache.set(cacheKey, c);
  return c;
}

function getSheetModel(): SheetModel | null {
  if (sheetModel) return sheetModel;
  if (!sheet || !sheetReady) return null;

  const c = document.createElement("canvas");
  c.width = sheet.naturalWidth || WALK_FRAME_W * WALK_FRAME_COUNT;
  c.height = sheet.naturalHeight || WALK_FRAME_H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(sheet, 0, 0);
  const image = ctx.getImageData(0, 0, c.width, c.height);
  const model: SheetModel = {
    width: c.width,
    height: c.height,
    data: image.data,
    frames: [],
  };

  for (let i = 0; i < WALK_FRAME_COUNT; i++) {
    model.frames.push(deriveAnatomy(model, i));
  }

  sheetModel = model;
  return sheetModel;
}

function alphaAt(model: SheetModel, frame: number, x: number, y: number) {
  if (x < 0 || x >= WALK_FRAME_W || y < 0 || y >= WALK_FRAME_H) return 0;
  const px = frame * WALK_FRAME_W + x;
  return model.data[(y * model.width + px) * 4 + 3];
}

function isSolid(model: SheetModel, frame: number, x: number, y: number) {
  return alphaAt(model, frame, x, y) > ALPHA_THRESHOLD;
}

function deriveAnatomy(model: SheetModel, frame: number): FrameAnatomy {
  const rowCount = new Int16Array(WALK_FRAME_H);
  const rowSumX = new Int32Array(WALK_FRAME_H);
  const rowMinX = new Int16Array(WALK_FRAME_H);
  const rowMaxX = new Int16Array(WALK_FRAME_H);
  rowMinX.fill(WALK_FRAME_W);
  rowMaxX.fill(-1);

  let left = WALK_FRAME_W;
  let right = -1;
  let top = WALK_FRAME_H;
  let bottom = -1;

  const integral = new Int32Array((WALK_FRAME_W + 1) * (WALK_FRAME_H + 1));

  for (let y = 0; y < WALK_FRAME_H; y++) {
    let line = 0;
    for (let x = 0; x < WALK_FRAME_W; x++) {
      const solid = isSolid(model, frame, x, y) ? 1 : 0;
      if (solid) {
        rowCount[y]++;
        rowSumX[y] += x;
        rowMinX[y] = Math.min(rowMinX[y], x);
        rowMaxX[y] = Math.max(rowMaxX[y], x);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      line += solid;
      const ii = (y + 1) * (WALK_FRAME_W + 1) + (x + 1);
      integral[ii] = integral[ii - (WALK_FRAME_W + 1)] + line;
    }
  }

  if (right < left || bottom < top) {
    const emptyHead = { x: WALK_FRAME_W / 2, y: 16, r: 13, top: 3, bottom: 29 };
    return {
      frame,
      bbox: { left: 0, top: 0, right: WALK_FRAME_W - 1, bottom: WALK_FRAME_H - 1 },
      head: emptyHead,
      chest: { x: WALK_FRAME_W / 2, y: 44 },
      hip: { x: WALK_FRAME_W / 2, y: 108 },
      shoulderY: 34,
      footY: WALK_FOOT_Y,
      hands: { left: { x: 48, y: 65 }, right: { x: 96, y: 65 } },
      feet: { left: { x: 54, y: WALK_FOOT_Y }, right: { x: 90, y: WALK_FOOT_Y } },
    };
  }

  const bbox = { left, top, right, bottom };
  const head = findHead(integral, model, frame, bbox);
  const chest = findChest(rowCount, rowSumX, rowMinX, rowMaxX, head, bbox);
  const hip = findHip(rowCount, rowSumX, chest, bbox);
  const hands = findSideEndpoints(model, frame, bbox, head.bottom + 1, Math.min(hip.y + 10, bbox.bottom), chest.y);
  const feet = findSideEndpoints(model, frame, bbox, Math.max(chest.y + 34, bbox.top), bbox.bottom, bbox.bottom);

  return {
    frame,
    bbox,
    head,
    chest,
    hip,
    shoulderY: clamp(head.bottom + 7, bbox.top + 18, chest.y),
    footY: bbox.bottom,
    hands,
    feet,
  };
}

function boxCount(integral: Int32Array, x0: number, y0: number, x1: number, y1: number) {
  const minX = clamp(Math.floor(x0), 0, WALK_FRAME_W);
  const minY = clamp(Math.floor(y0), 0, WALK_FRAME_H);
  const maxX = clamp(Math.ceil(x1), 0, WALK_FRAME_W);
  const maxY = clamp(Math.ceil(y1), 0, WALK_FRAME_H);
  const stride = WALK_FRAME_W + 1;
  return (
    integral[maxY * stride + maxX]
    - integral[minY * stride + maxX]
    - integral[maxY * stride + minX]
    + integral[minY * stride + minX]
  );
}

function findHead(integral: Int32Array, model: SheetModel, frame: number, bbox: Box) {
  let bestX = (bbox.left + bbox.right) / 2;
  let bestY = bbox.top + HEAD_SCAN_R;
  let bestScore = -Infinity;
  const scanBottom = Math.min(WALK_FRAME_H - 1, bbox.top + 106);

  for (let y = bbox.top; y <= scanBottom; y++) {
    for (let x = bbox.left; x <= bbox.right; x++) {
      const filled = boxCount(integral, x - 11, y - 11, x + 12, y + 12);
      const halo = boxCount(integral, x - 17, y - 17, x + 18, y + 18);
      const compactness = filled - Math.max(0, halo - filled) * 0.08;
      const earlyBias = Math.max(0, 90 - (y - bbox.top)) * 0.04;
      const edgePenalty = Math.abs(x - (bbox.left + bbox.right) / 2) * 0.01;
      const score = compactness + earlyBias - edgePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  const fit = refineSolidCentroid(model, frame, bestX, bestY, 16);
  const width = Math.max(1, fit.right - fit.left + 1);
  const height = Math.max(1, fit.bottom - fit.top + 1);
  const r = clamp(Math.max(width, height) / 2, 11, 15);
  return {
    x: fit.count > 0 ? fit.x : bestX,
    y: fit.count > 0 ? fit.y : bestY,
    r,
    top: fit.count > 0 ? fit.top : bestY - r,
    bottom: fit.count > 0 ? fit.bottom : bestY + r,
  };
}

function refineSolidCentroid(model: SheetModel, frame: number, cx: number, cy: number, r: number) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let left = WALK_FRAME_W;
  let right = -1;
  let top = WALK_FRAME_H;
  let bottom = -1;
  const r2 = r * r;

  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(WALK_FRAME_H - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WALK_FRAME_W - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (!isSolid(model, frame, x, y)) continue;
      sumX += x;
      sumY += y;
      count++;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  return {
    x: count ? sumX / count : cx,
    y: count ? sumY / count : cy,
    count,
    left,
    right,
    top,
    bottom,
  };
}

function findChest(
  rowCount: Int16Array,
  rowSumX: Int32Array,
  rowMinX: Int16Array,
  rowMaxX: Int16Array,
  head: FrameAnatomy["head"],
  bbox: Box,
): Point {
  const bandTop = clamp(Math.round(head.top + 28), bbox.top, bbox.bottom);
  const bandBottom = clamp(Math.round(head.top + 58), bandTop, bbox.bottom);
  const rows: Array<{ y: number; score: number; x: number }> = [];

  for (let y = bandTop; y <= bandBottom; y++) {
    if (rowCount[y] <= 0) continue;
    const width = rowMaxX[y] - rowMinX[y] + 1;
    const score = rowCount[y] - Math.max(0, width - 84) * 0.25;
    rows.push({ y, score, x: rowSumX[y] / rowCount[y] });
  }

  rows.sort((a, b) => b.score - a.score);
  const chosen = rows.slice(0, 5);
  if (!chosen.length) {
    return { x: head.x, y: clamp(head.bottom + 24, bbox.top, bbox.bottom) };
  }

  const weight = chosen.reduce((n, row) => n + Math.max(1, row.score), 0);
  return {
    x: chosen.reduce((n, row) => n + row.x * Math.max(1, row.score), 0) / weight,
    y: chosen.reduce((n, row) => n + row.y * Math.max(1, row.score), 0) / weight,
  };
}

function findHip(rowCount: Int16Array, rowSumX: Int32Array, chest: Point, bbox: Box): Point {
  const bandTop = clamp(Math.round(chest.y + 40), bbox.top, bbox.bottom);
  const bandBottom = clamp(Math.round(chest.y + 86), bandTop, bbox.bottom);
  let bestY = clamp(Math.round(chest.y + 64), bbox.top, bbox.bottom);
  let bestCount = -1;

  for (let y = bandTop; y <= bandBottom; y++) {
    if (rowCount[y] > bestCount) {
      bestY = y;
      bestCount = rowCount[y];
    }
  }

  const x = bestCount > 0 ? rowSumX[bestY] / rowCount[bestY] : chest.x;
  return { x, y: bestY };
}

function findSideEndpoints(
  model: SheetModel,
  frame: number,
  bbox: Box,
  y0: number,
  y1: number,
  preferredY: number,
) {
  let minX = WALK_FRAME_W;
  let maxX = -1;
  const top = clamp(Math.round(y0), 0, WALK_FRAME_H - 1);
  const bottom = clamp(Math.round(y1), top, WALK_FRAME_H - 1);

  for (let y = top; y <= bottom; y++) {
    for (let x = bbox.left; x <= bbox.right; x++) {
      if (!isSolid(model, frame, x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }

  if (maxX < minX) {
    const y = clamp(preferredY, bbox.top, bbox.bottom);
    return {
      left: { x: bbox.left, y },
      right: { x: bbox.right, y },
    };
  }

  return {
    left: averageNearX(model, frame, minX, top, bottom, 5),
    right: averageNearX(model, frame, maxX, top, bottom, 5),
  };
}

function averageNearX(model: SheetModel, frame: number, targetX: number, top: number, bottom: number, radius: number): Point {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = Math.max(0, targetX - radius); x <= Math.min(WALK_FRAME_W - 1, targetX + radius); x++) {
      if (!isSolid(model, frame, x, y)) continue;
      sumX += x;
      sumY += y;
      count++;
    }
  }
  return count ? { x: sumX / count, y: sumY / count } : { x: targetX, y: (top + bottom) / 2 };
}

function paintFrame(ctx: CanvasRenderingContext2D, skin: Skin, a: FrameAnatomy) {
  if (!sheet) return;
  const ox = a.frame * WALK_FRAME_W;
  const look = getLook(skin);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);
  ctx.clip();
  paintSilhouette(ctx, ox, look);
  drawBodyMass(ctx, skin, ox, a, look);
  drawCostumePanels(ctx, skin, ox, a, look);
  drawCape(ctx, skin, ox, a, look);
  drawHead(ctx, skin, ox, a, look);
  drawGlovesAndBoots(ctx, skin, ox, a, look);
  drawEmblem(ctx, skin, ox, a, look);
  drawSkinSpecificDetails(ctx, skin, ox, a, look);
  ctx.restore();
}

function paintSilhouette(ctx: CanvasRenderingContext2D, ox: number, look: SkinLook) {
  if (!sheet) return;

  ctx.save();
  ctx.drawImage(sheet, ox, 0, WALK_FRAME_W, WALK_FRAME_H, ox, 0, WALK_FRAME_W, WALK_FRAME_H);
  ctx.globalCompositeOperation = "source-in";

  const bodyGrad = ctx.createLinearGradient(ox, 0, ox + WALK_FRAME_W, WALK_FRAME_H);
  bodyGrad.addColorStop(0, look.highlight);
  bodyGrad.addColorStop(0.36, look.limb);
  bodyGrad.addColorStop(1, look.shadow);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);

  ctx.globalCompositeOperation = "source-atop";
  const rim = ctx.createLinearGradient(ox, 0, ox + WALK_FRAME_W, 0);
  rim.addColorStop(0, "oklch(1 0 0 / 0.18)");
  rim.addColorStop(0.45, "transparent");
  rim.addColorStop(1, "oklch(0 0 0 / 0.22)");
  ctx.fillStyle = rim;
  ctx.fillRect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);
  ctx.restore();
}

function drawBodyMass(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const hipY = a.hip.y;
  const r = a.head.r;

  if (skin.silhouette || skin.id === "butcher") {
    const shoulderHalf = r * 1.45;
    const hemHalf = r * 1.75;
    const top = a.shoulderY - 2;
    const bottom = Math.min(WALK_FRAME_H - 2, hipY + r * 2.2);
    ctx.save();
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHalf, top);
    ctx.bezierCurveTo(cx - hemHalf * 0.75, cy + r * 0.8, cx - hemHalf, bottom - r, cx - hemHalf * 0.7, bottom);
    ctx.quadraticCurveTo(cx, bottom + r * 0.35, cx + hemHalf * 0.7, bottom);
    ctx.bezierCurveTo(cx + hemHalf, bottom - r, cx + hemHalf * 0.75, cy + r * 0.8, cx + shoulderHalf, top);
    ctx.quadraticCurveTo(cx, top - r * 0.4, cx - shoulderHalf, top);
    ctx.fill();

    const shade = ctx.createLinearGradient(0, top, 0, bottom);
    shade.addColorStop(0, "transparent");
    shade.addColorStop(1, "oklch(0 0 0 / 0.30)");
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
    return;
  }

  if (!skin.thickBody && skin.id !== "wolverine") return;

  const torsoHalf = r * (skin.id === "ironman" ? 1.12 : skin.id === "wolverine" ? 1.02 : 0.95);
  const top = a.shoulderY - r * 0.15;
  const bottom = Math.min(WALK_FRAME_H - 3, hipY + r * 0.45);

  ctx.save();
  ctx.fillStyle = look.body;
  ctx.beginPath();
  ctx.moveTo(cx - torsoHalf, top + r * 0.25);
  ctx.quadraticCurveTo(cx - torsoHalf * 0.75, top - r * 0.25, cx, top);
  ctx.quadraticCurveTo(cx + torsoHalf * 0.75, top - r * 0.25, cx + torsoHalf, top + r * 0.25);
  ctx.lineTo(cx + torsoHalf * 0.62, bottom);
  ctx.quadraticCurveTo(cx, bottom + r * 0.25, cx - torsoHalf * 0.62, bottom);
  ctx.closePath();
  ctx.fill();

  const shade = ctx.createLinearGradient(0, top, 0, bottom);
  shade.addColorStop(0, "oklch(1 0 0 / 0.10)");
  shade.addColorStop(0.7, "transparent");
  shade.addColorStop(1, "oklch(0 0 0 / 0.24)");
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();
}

function drawCostumePanels(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";

  if (skin.body !== (skin.limb ?? skin.body)) {
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.55, r * 1.05, r * 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  switch (skin.id) {
    case "spiderman": {
      ctx.fillStyle = look.body;
      ctx.beginPath();
      ctx.moveTo(cx, a.shoulderY - r * 0.15);
      ctx.lineTo(cx + r * 0.8, cy + r * 1.9);
      ctx.lineTo(cx - r * 0.8, cy + r * 1.9);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "ironman": {
      ctx.strokeStyle = look.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy + r * 0.2);
      ctx.lineTo(cx, cy + r * 1.05);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.2);
      ctx.stroke();
      break;
    }
    case "wolverine": {
      ctx.fillStyle = look.suitDark ?? look.shadow;
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.0, a.shoulderY);
      ctx.lineTo(cx - r * 0.45, a.hip.y + r * 0.25);
      ctx.lineTo(cx - r * 1.35, a.hip.y + r * 0.15);
      ctx.closePath();
      ctx.moveTo(cx + r * 1.0, a.shoulderY);
      ctx.lineTo(cx + r * 0.45, a.hip.y + r * 0.25);
      ctx.lineTo(cx + r * 1.35, a.hip.y + r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "flash":
    case "atrain": {
      ctx.strokeStyle = look.trim;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.9);
      ctx.moveTo(cx - r * 0.55, cy + r * 1.15);
      ctx.lineTo(cx + r * 0.9, cy + r * 1.6);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function drawCape(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  if (!skin.cape) return;
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;
  const sway = capeSway(a.frame);
  const bottom = Math.min(WALK_FRAME_H - 4, Math.max(a.footY - 8, a.hip.y + r * 4.6));

  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = skin.cape;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.0, a.shoulderY + r * 0.2);
  ctx.bezierCurveTo(cx - r * 2.0 + sway, cy + r * 1.4, cx - r * 1.65 + sway, bottom - r * 0.8, cx - r * 0.55 + sway * 0.5, bottom);
  ctx.quadraticCurveTo(cx + sway * 0.3, bottom + r * 0.45, cx + r * 0.55 + sway * 0.5, bottom);
  ctx.bezierCurveTo(cx + r * 1.65 + sway, bottom - r * 0.8, cx + r * 2.0 + sway, cy + r * 1.4, cx + r * 1.0, a.shoulderY + r * 0.2);
  ctx.closePath();
  ctx.fill();

  if (skin.capeAccent) {
    ctx.fillStyle = skin.capeAccent;
    ctx.globalAlpha = 0.58;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.35, a.shoulderY + r * 0.55);
    ctx.lineTo(cx + r * 0.45, a.shoulderY + r * 0.55);
    ctx.lineTo(cx + r * 0.18 + sway * 0.3, bottom - r * 0.2);
    ctx.lineTo(cx - r * 0.18 + sway * 0.3, bottom - r * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (skin.id === "batman") {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "oklch(0.04 0.01 280 / 0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.0, a.shoulderY + r * 0.2);
    ctx.quadraticCurveTo(cx + sway * 0.3, cy + r * 2.5, cx + r * 0.55 + sway * 0.5, bottom);
    ctx.stroke();
    ctx.restore();
  }

  void look;
}

function drawHead(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const hx = ox + a.head.x;
  const hy = a.head.y;
  const r = a.head.r * 1.05;

  ctx.save();
  ctx.fillStyle = look.head;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();

  if (skin.skinTone) {
    ctx.fillStyle = skin.skinTone;
    ctx.beginPath();
    if (skin.skinToneMode === "fullHead") {
      ctx.arc(hx, hy + r * 0.05, r * 0.86, 0, Math.PI * 2);
    } else {
      ctx.ellipse(hx, hy + r * 0.18, r * 0.68, r * 0.74, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = look.head;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.24, r * 0.92, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  if (skin.id === "wolverine") {
    ctx.fillStyle = look.suitDark ?? "oklch(0.12 0.04 250)";
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.75, hy - r * 0.35);
    ctx.lineTo(hx - r * 1.18, hy - r * 1.35);
    ctx.lineTo(hx - r * 0.24, hy - r * 0.72);
    ctx.closePath();
    ctx.moveTo(hx + r * 0.75, hy - r * 0.35);
    ctx.lineTo(hx + r * 1.18, hy - r * 1.35);
    ctx.lineTo(hx + r * 0.24, hy - r * 0.72);
    ctx.closePath();
    ctx.fill();
  }

  if (skin.cowlEars) {
    ctx.fillStyle = look.head;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.72, hy - r * 0.52);
    ctx.lineTo(hx - r * 0.45, hy - r * 1.55);
    ctx.lineTo(hx - r * 0.18, hy - r * 0.62);
    ctx.closePath();
    ctx.moveTo(hx + r * 0.72, hy - r * 0.52);
    ctx.lineTo(hx + r * 0.45, hy - r * 1.55);
    ctx.lineTo(hx + r * 0.18, hy - r * 0.62);
    ctx.closePath();
    ctx.fill();
  }

  const hi = ctx.createRadialGradient(hx - r * 0.32, hy - r * 0.38, 1, hx, hy, r * 1.2);
  hi.addColorStop(0, "oklch(1 0 0 / 0.20)");
  hi.addColorStop(0.55, "transparent");
  hi.addColorStop(1, "oklch(0 0 0 / 0.18)");
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();

  drawEyes(ctx, skin, hx, hy, r, look);
  drawHeadPattern(ctx, skin, hx, hy, r, look);

  ctx.strokeStyle = "oklch(0.05 0.01 260 / 0.55)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  hx: number,
  hy: number,
  r: number,
  look: SkinLook,
) {
  const ey = hy - r * 0.08;
  const ex = r * 0.38;

  if (skin.id === "spiderman") {
    ctx.fillStyle = "oklch(0.98 0.02 240)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * ex, ey, r * 0.26, r * 0.14, side * -0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (skin.id === "ironman" || skin.id === "batman" || skin.id === "wolverine") {
    ctx.fillStyle = skin.id === "ironman" ? "oklch(0.92 0.16 205)" : "oklch(0.96 0.04 100)";
    for (const side of [-1, 1]) {
      ctx.fillRect(hx + side * ex - 4, ey - 1.2, 7, 2.6);
    }
    return;
  }

  if (skin.glowingEyes) {
    ctx.fillStyle = skin.glowingEyes;
    ctx.shadowColor = skin.glowingEyes;
    ctx.shadowBlur = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * ex, ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    return;
  }

  if (skin.skinTone) {
    ctx.fillStyle = "oklch(0.14 0.02 260)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * ex, ey, 1.55, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.fillStyle = look.eye;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + side * ex, ey, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadPattern(ctx: CanvasRenderingContext2D, skin: Skin, hx: number, hy: number, r: number, look: SkinLook) {
  if (skin.id !== "spiderman") return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.92, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "oklch(0.12 0.04 260 / 0.62)";
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(hx, hy - r * 0.95);
    ctx.quadraticCurveTo(hx + i * r * 0.26, hy, hx + i * r * 0.46, hy + r * 0.95);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * (i * 0.24 - 0.25), r * (0.42 + i * 0.18), r * (0.18 + i * 0.06), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  void look;
}

function drawGlovesAndBoots(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const glove = skin.gloves;
  const boot = skin.boots;
  const r = a.head.r;

  if (glove) {
    ctx.save();
    ctx.fillStyle = glove;
    for (const hand of [a.hands.left, a.hands.right]) {
      ctx.beginPath();
      ctx.ellipse(ox + hand.x, hand.y, r * 0.35, r * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (boot) {
    ctx.save();
    ctx.fillStyle = boot;
    for (const foot of [a.feet.left, a.feet.right]) {
      ctx.beginPath();
      ctx.ellipse(ox + foot.x, foot.y, r * 0.46, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  void look;
}

function drawEmblem(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  if (!skin.emblem) return;
  const cx = ox + a.chest.x;
  const cy = a.chest.y + a.head.r * 0.35;
  const r = a.head.r * 0.92;

  ctx.save();
  ctx.fillStyle = skin.emblem.color;
  ctx.strokeStyle = skin.emblem.color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (skin.emblem.shape) {
    case "spider":
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.35);
      ctx.lineTo(cx, cy + r * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.42, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        for (const yy of [-0.25, -0.08, 0.1, 0.28]) {
          ctx.beginPath();
          ctx.moveTo(cx, cy + r * yy);
          ctx.lineTo(cx + side * r * 0.42, cy + r * (yy - 0.15));
          ctx.lineTo(cx + side * r * 0.62, cy + r * (yy - 0.28));
          ctx.stroke();
        }
      }
      break;
    case "shield":
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.56);
      ctx.lineTo(cx + r * 0.52, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.34, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.34, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.52, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case "oval":
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.6, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.shadow;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.48, cy);
      ctx.lineTo(cx, cy - r * 0.07);
      ctx.lineTo(cx + r * 0.48, cy);
      ctx.lineTo(cx, cy + r * 0.07);
      ctx.closePath();
      ctx.fill();
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = look.trim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "lightning":
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.15, cy - r * 0.52);
      ctx.lineTo(cx + r * 0.22, cy - r * 0.06);
      ctx.lineTo(cx - r * 0.04, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.16, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.22, cy + r * 0.05);
      ctx.lineTo(cx + r * 0.05, cy + r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    case "stripe":
      ctx.fillRect(cx - r * 0.56, cy - r * 0.1, r * 1.12, r * 0.22);
      break;
  }

  ctx.restore();
}

function drawSkinSpecificDetails(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;

  if (skin.id === "wolverine") {
    ctx.save();
    ctx.strokeStyle = look.metal ?? "oklch(0.88 0.02 250)";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    for (const hand of [a.hands.left, a.hands.right]) {
      const hx = ox + hand.x;
      const dir = hx < cx ? -1 : 1;
      for (const offset of [-2.6, 0, 2.6]) {
        ctx.beginPath();
        ctx.moveTo(hx + dir * r * 0.22, hand.y + offset);
        ctx.lineTo(hx + dir * r * 0.95, hand.y + offset - r * 0.16);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (skin.id === "flash" || skin.id === "atrain") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = skin.streaks ?? look.trim;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    const slant = skin.id === "atrain" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.1 * slant, cy + r * 0.8);
    ctx.lineTo(cx - r * 2.0 * slant, cy + r * 0.2);
    ctx.moveTo(cx - r * 0.7 * slant, cy + r * 1.5);
    ctx.lineTo(cx - r * 1.7 * slant, cy + r * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  if (skin.id === "butcher") {
    const hx = ox + a.head.x;
    const hy = a.head.y;
    ctx.save();
    ctx.strokeStyle = "oklch(0.46 0.018 250 / 0.78)";
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.62, a.shoulderY + r * 0.12);
    ctx.lineTo(cx - r * 0.16, cy + r * 0.78);
    ctx.lineTo(cx, a.hip.y + r * 1.55);
    ctx.lineTo(cx + r * 0.16, cy + r * 0.78);
    ctx.lineTo(cx + r * 0.62, a.shoulderY + r * 0.12);
    ctx.stroke();

    ctx.strokeStyle = "oklch(0.12 0.012 250 / 0.75)";
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.85);
    ctx.lineTo(cx, Math.min(WALK_FRAME_H - 4, a.hip.y + r * 1.9));
    ctx.stroke();

    ctx.fillStyle = "oklch(0.14 0.01 30)";
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.52, r * 0.72, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "oklch(0.06 0.01 30 / 0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.45, hy + r * 0.44);
    ctx.quadraticCurveTo(hx, hy + r * 0.78, hx + r * 0.45, hy + r * 0.44);
    ctx.stroke();
    ctx.restore();
  }
}

function getLook(skin: Skin): SkinLook {
  const base = skin.limb ?? skin.body;
  const body = skin.body;
  const head = skin.head ?? skin.body;
  const trim = skin.emblem?.color ?? skin.glow;

  switch (skin.id) {
    case "spiderman":
      return {
        base,
        limb: "oklch(0.30 0.13 258)",
        body: "oklch(0.49 0.19 24)",
        head: "oklch(0.50 0.19 24)",
        trim: "oklch(0.12 0.04 258)",
        shadow: "oklch(0.13 0.05 258)",
        highlight: "oklch(0.68 0.16 28)",
        eye: "oklch(0.97 0.02 240)",
      };
    case "ironman":
      return {
        base,
        limb: "oklch(0.68 0.14 82)",
        body: "oklch(0.43 0.18 25)",
        head: "oklch(0.67 0.14 82)",
        trim: "oklch(0.86 0.13 205)",
        shadow: "oklch(0.20 0.08 25)",
        highlight: "oklch(0.82 0.12 84)",
        eye: "oklch(0.94 0.13 205)",
        metal: "oklch(0.80 0.05 95)",
      };
    case "wolverine":
      return {
        base,
        limb: "oklch(0.23 0.08 255)",
        body: "oklch(0.78 0.16 86)",
        head: "oklch(0.77 0.16 86)",
        trim: "oklch(0.16 0.05 250)",
        shadow: "oklch(0.12 0.04 250)",
        highlight: "oklch(0.94 0.10 92)",
        eye: "oklch(0.98 0.04 100)",
        metal: "oklch(0.88 0.02 250)",
        suitDark: "oklch(0.16 0.06 255)",
      };
    case "batman":
      return {
        base,
        limb: "oklch(0.25 0.02 278)",
        body: "oklch(0.28 0.016 275)",
        head: "oklch(0.16 0.018 280)",
        trim: "oklch(0.78 0.16 90)",
        shadow: "oklch(0.07 0.012 280)",
        highlight: "oklch(0.45 0.025 280)",
        eye: "oklch(0.96 0.04 100)",
      };
    case "superman":
      return {
        base,
        limb: "oklch(0.38 0.18 260)",
        body: "oklch(0.38 0.18 260)",
        head,
        trim,
        shadow: "oklch(0.15 0.08 260)",
        highlight: "oklch(0.62 0.14 255)",
        eye: "oklch(0.14 0.02 260)",
      };
    case "flash":
      return {
        base,
        limb: "oklch(0.49 0.20 25)",
        body: "oklch(0.49 0.20 25)",
        head: "oklch(0.50 0.20 25)",
        trim: "oklch(0.86 0.16 86)",
        shadow: "oklch(0.22 0.10 25)",
        highlight: "oklch(0.66 0.18 32)",
        eye: "oklch(0.95 0.05 90)",
      };
    case "homelander":
      return {
        base,
        limb: "oklch(0.80 0.05 250)",
        body: "oklch(0.82 0.05 250)",
        head,
        trim: "oklch(0.72 0.16 85)",
        shadow: "oklch(0.40 0.06 250)",
        highlight: "oklch(0.98 0.02 250)",
        eye: skin.glowingEyes ?? "oklch(0.82 0.18 60)",
      };
    case "butcher":
      return {
        base,
        limb: "oklch(0.16 0.04 260)",
        body: "oklch(0.27 0.014 250)",
        head,
        trim: "oklch(0.58 0.05 220)",
        shadow: "oklch(0.10 0.02 250)",
        highlight: "oklch(0.42 0.018 250)",
        eye: "oklch(0.12 0.02 30)",
      };
    case "atrain":
      return {
        base,
        limb: "oklch(0.40 0.18 25)",
        body: "oklch(0.43 0.19 25)",
        head: "oklch(0.42 0.18 25)",
        trim: "oklch(0.92 0.02 250)",
        shadow: "oklch(0.18 0.08 25)",
        highlight: "oklch(0.64 0.16 30)",
        eye: "oklch(0.92 0.02 250)",
      };
    default:
      return {
        base,
        limb: base,
        body,
        head,
        trim,
        shadow: "oklch(0.10 0.03 260)",
        highlight: "oklch(0.82 0.03 250)",
        eye: skin.glowingEyes ?? "oklch(0.96 0.04 90)",
      };
  }
}

function capeSway(frame: number) {
  if (frame < 10) return Math.sin((frame / 10) * Math.PI * 2) * 2.2;
  if (frame === KICK_HIT_FRAME || frame === SLASH_HIT_FRAME) return -5;
  if (frame === HURT_FRAME) return 4;
  if (frame === DOWN_FRAME) return 1;
  return 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Draw frame `idx` of `skin`'s composited sheet, anchored at footY.
 *  Returns false if the sheet is not ready yet. */
export function drawWalkFrame(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  idx: number,
  cx: number,
  footY: number,
  facing: 1 | -1,
  height: number,
) {
  const composed = getSkinSheet(skin);
  if (!composed) return false;
  const i = ((idx % WALK_FRAME_COUNT) + WALK_FRAME_COUNT) % WALK_FRAME_COUNT;
  const sx = i * WALK_FRAME_W;
  const scale = height / WALK_FRAME_H;
  const dw = WALK_FRAME_W * scale;
  const dh = height;
  ctx.save();
  ctx.translate(cx, footY);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(
    composed,
    sx, 0, WALK_FRAME_W, WALK_FRAME_H,
    -dw / 2, -dh, dw, dh,
  );
  ctx.restore();
  return true;
}
