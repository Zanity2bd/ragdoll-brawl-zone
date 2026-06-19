// Per-skin walk-sheet renderer.
//
// The hot path is intentionally boring: drawWalkFrame() does one drawImage from
// a cached per-skin atlas. The expensive work happens once per skin, where the
// base alpha sheet is scanned frame-by-frame and skin materials are baked onto
// the exact pose geometry.

import sheetUrl from "@/assets/walk-sheet.png";
import { getCharacterPresentation } from "./characterPresentation";
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

const SKIN_CACHE_VERSION = "v6-hero-accurate-skin-atlas";
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
  paintOutline(ctx, ox);
  drawBodyMass(ctx, skin, ox, a, look);
  drawCostumePanels(ctx, skin, ox, a, look);
  drawMaterialFinish(ctx, skin, ox, a, look);
  drawCape(ctx, skin, ox, a, look);
  drawHead(ctx, skin, ox, a, look);
  drawGlovesAndBoots(ctx, skin, ox, a, look);
  drawEmblem(ctx, skin, ox, a, look);
  drawSkinSpecificDetails(ctx, skin, ox, a, look);
  ctx.restore();
}

function paintOutline(ctx: CanvasRenderingContext2D, ox: number) {
  if (!sheet) return;

  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalAlpha = 0.62;
  ctx.filter = "brightness(0)";
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.drawImage(sheet, ox, 0, WALK_FRAME_W, WALK_FRAME_H, ox + dx, dy, WALK_FRAME_W, WALK_FRAME_H);
  }
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
  const profile = getCharacterPresentation(skin.id);
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const hipY = a.hip.y;
  const r = a.head.r;
  const lean = profile.stanceLean * r * frameActionLean(a.frame);
  const top = a.shoulderY - r * 0.28;
  const waist = Math.min(WALK_FRAME_H - 3, hipY + r * 0.36);
  const bottom = Math.min(WALK_FRAME_H - 2, hipY + r * (profile.bodyShape === "coat" ? 1.2 + profile.coatLength : 0.62));
  const shoulderHalf = r * profile.shoulderMul;
  const chestHalf = r * profile.torsoMul;
  const hipHalf = r * profile.hipMul;
  const armored = profile.bodyShape === "armored";
  const coat = profile.bodyShape === "coat";
  const broad = profile.bodyShape === "broad" || profile.bodyShape === "bruiser" || armored;
  const sprinter = profile.bodyShape === "sprinter" || profile.bodyShape === "lean";

  ctx.save();

  if (profile.tail) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.strokeStyle = look.head;
    ctx.lineWidth = Math.max(3.2, r * 0.26);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2 + lean, hipY + r * 0.55);
    ctx.bezierCurveTo(cx - r * 1.0 + lean, hipY + r * 1.0, cx - r * 1.05 + lean, hipY + r * 1.9, cx - r * 0.18 + lean, hipY + r * 2.35);
    ctx.stroke();
    ctx.fillStyle = look.head;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.06 + lean, hipY + r * 2.34);
    ctx.lineTo(cx + r * 0.25 + lean, hipY + r * 2.1);
    ctx.lineTo(cx + r * 0.24 + lean, hipY + r * 2.48);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = look.body;
  ctx.beginPath();
  if (coat) {
    const hemHalf = r * (1.18 + profile.hipMul * 0.34);
    ctx.moveTo(cx - shoulderHalf, top + r * 0.18);
    ctx.quadraticCurveTo(cx - chestHalf * 0.78 + lean * 0.3, top - r * 0.22, cx + lean * 0.25, top - r * 0.08);
    ctx.quadraticCurveTo(cx + chestHalf * 0.78 + lean * 0.3, top - r * 0.22, cx + shoulderHalf, top + r * 0.18);
    ctx.bezierCurveTo(cx + hemHalf * 0.72 + lean, cy + r * 1.0, cx + hemHalf + lean, bottom - r * 0.9, cx + hemHalf * 0.6 + lean, bottom);
    ctx.quadraticCurveTo(cx + lean * 0.35, bottom + r * 0.28, cx - hemHalf * 0.6 + lean, bottom);
    ctx.bezierCurveTo(cx - hemHalf + lean, bottom - r * 0.9, cx - hemHalf * 0.72 + lean, cy + r * 1.0, cx - shoulderHalf, top + r * 0.18);
  } else if (broad) {
    const waistHalf = hipHalf * (armored ? 0.88 : 0.82);
    ctx.moveTo(cx - shoulderHalf, top + r * 0.22);
    ctx.quadraticCurveTo(cx - shoulderHalf * 0.52, top - r * 0.36, cx + lean * 0.15, top - r * 0.08);
    ctx.quadraticCurveTo(cx + shoulderHalf * 0.52, top - r * 0.36, cx + shoulderHalf, top + r * 0.22);
    ctx.lineTo(cx + waistHalf + lean, waist);
    ctx.quadraticCurveTo(cx + lean * 0.35, waist + r * 0.34, cx - waistHalf + lean, waist);
    ctx.closePath();
  } else if (sprinter) {
    ctx.moveTo(cx - shoulderHalf * 0.82 + lean * 0.2, top + r * 0.18);
    ctx.quadraticCurveTo(cx - chestHalf * 0.4 + lean, top - r * 0.2, cx + lean, top);
    ctx.quadraticCurveTo(cx + shoulderHalf * 0.9 + lean, top + r * 0.2, cx + chestHalf * 0.75 + lean, cy + r * 0.86);
    ctx.lineTo(cx + hipHalf * 0.55 + lean * 0.6, waist);
    ctx.quadraticCurveTo(cx + lean * 0.28, waist + r * 0.22, cx - hipHalf * 0.48 + lean * 0.35, waist);
    ctx.lineTo(cx - chestHalf * 0.68 + lean * 0.15, cy + r * 0.68);
    ctx.closePath();
  } else {
    ctx.moveTo(cx - shoulderHalf * 0.9, top + r * 0.25);
    ctx.quadraticCurveTo(cx - chestHalf * 0.6 + lean * 0.15, top - r * 0.18, cx + lean * 0.2, top);
    ctx.quadraticCurveTo(cx + chestHalf * 0.6 + lean * 0.15, top - r * 0.18, cx + shoulderHalf * 0.9, top + r * 0.25);
    ctx.lineTo(cx + hipHalf * 0.56 + lean * 0.25, waist);
    ctx.quadraticCurveTo(cx + lean * 0.15, waist + r * 0.2, cx - hipHalf * 0.56 + lean * 0.25, waist);
    ctx.closePath();
  }
  ctx.fill();

  if (profile.neckMul > 0) {
    ctx.fillStyle = look.head;
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.25 * profile.neckMul + lean * 0.12, a.head.bottom - 1, r * 0.5 * profile.neckMul, Math.max(4, r * 0.56), r * 0.16);
    ctx.fill();
  }

  ctx.fillStyle = broad || coat ? mixColor(look.body, 82, "white") : withAlpha(look.highlight, 0.7);
  ctx.globalAlpha = broad ? 0.82 : 0.66;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderHalf * 0.96, top + r * 0.26);
  ctx.lineTo(cx - chestHalf * 0.45 + lean * 0.15, top + r * 0.66);
  ctx.lineTo(cx + chestHalf * 0.45 + lean * 0.15, top + r * 0.66);
  ctx.lineTo(cx + shoulderHalf * 0.96, top + r * 0.26);
  ctx.quadraticCurveTo(cx + lean * 0.2, top - r * 0.02, cx - shoulderHalf * 0.96, top + r * 0.26);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (armored || broad) {
    ctx.strokeStyle = withAlpha(look.shadow, 0.5);
    ctx.lineWidth = armored ? 1.5 : 1.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHalf * 0.72, top + r * 0.36);
    ctx.lineTo(cx - chestHalf * 0.28 + lean * 0.25, cy + r * 1.08);
    ctx.moveTo(cx + shoulderHalf * 0.72, top + r * 0.36);
    ctx.lineTo(cx + chestHalf * 0.28 + lean * 0.25, cy + r * 1.08);
    ctx.stroke();
  }

  ctx.fillStyle = look.body;
  const shade = ctx.createLinearGradient(0, top, 0, bottom);
  shade.addColorStop(0, "oklch(1 0 0 / 0.10)");
  shade.addColorStop(0.56, "transparent");
  shade.addColorStop(1, `oklch(0 0 0 / ${coat ? 0.36 : broad ? 0.28 : 0.22})`);
  ctx.fillStyle = shade;
  ctx.fillRect(ox, Math.max(0, top - r), WALK_FRAME_W, Math.max(1, bottom - top + r * 2));
  ctx.restore();
}

function drawCostumePanels(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;
  const shoulderL = { x: cx - r * 0.78, y: a.shoulderY + r * 0.28 };
  const shoulderR = { x: cx + r * 0.78, y: a.shoulderY + r * 0.28 };
  const hipL = { x: cx - r * 0.42, y: a.hip.y + r * 0.1 };
  const hipR = { x: cx + r * 0.42, y: a.hip.y + r * 0.1 };
  const handL = { x: ox + a.hands.left.x, y: a.hands.left.y };
  const handR = { x: ox + a.hands.right.x, y: a.hands.right.y };
  const footL = { x: ox + a.feet.left.x, y: a.feet.left.y };
  const footR = { x: ox + a.feet.right.x, y: a.feet.right.y };

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
      ctx.moveTo(cx - r * 0.62, a.shoulderY - r * 0.08);
      ctx.quadraticCurveTo(cx, a.shoulderY - r * 0.42, cx + r * 0.62, a.shoulderY - r * 0.08);
      ctx.lineTo(cx + r * 0.36, cy + r * 1.86);
      ctx.quadraticCurveTo(cx, cy + r * 2.08, cx - r * 0.36, cy + r * 1.86);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "oklch(0.09 0.04 258 / 0.68)";
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.34, a.shoulderY + r * 0.22);
      ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.9, cx - r * 0.18, a.hip.y + r * 0.4);
      ctx.moveTo(cx + r * 0.34, a.shoulderY + r * 0.22);
      ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.9, cx + r * 0.18, a.hip.y + r * 0.4);
      ctx.stroke();
      break;
    }
    case "ironman": {
      ctx.fillStyle = "oklch(0.76 0.13 84)";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * r * 0.78, a.shoulderY + r * 0.22, r * 0.42, r * 0.28, side * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = look.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy + r * 0.2);
      ctx.lineTo(cx, cy + r * 1.05);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.2);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(look.metal ?? look.trim, 0.74);
      ctx.lineWidth = 1.15;
      for (const [from, to] of [[shoulderL, handL], [shoulderR, handR], [hipL, footL], [hipR, footR]] as const) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo((from.x + to.x) / 2, (from.y + to.y) / 2);
        ctx.stroke();
      }
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
      ctx.fillStyle = "oklch(0.13 0.05 255)";
      ctx.fillRect(cx - r * 0.72, a.hip.y + r * 0.32, r * 1.44, r * 0.22);
      ctx.fillStyle = "oklch(0.94 0.1 92)";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.2, a.shoulderY + r * 0.1);
        ctx.lineTo(cx + side * r * 0.06, a.hip.y + r * 0.26);
        ctx.lineTo(cx + side * r * 0.42, a.hip.y + r * 0.18);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "batman": {
      ctx.fillStyle = "oklch(0.34 0.018 275)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.8, r * 0.9, r * 1.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.76 0.16 90)";
      const beltY = a.hip.y + r * 0.28;
      ctx.fillRect(cx - r * 0.82, beltY, r * 1.64, r * 0.18);
      ctx.fillStyle = "oklch(0.08 0.012 280)";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.65, a.shoulderY + r * 0.24);
        ctx.lineTo(cx + side * r * 0.28, a.hip.y + r * 0.42);
        ctx.lineTo(cx + side * r * 0.58, a.hip.y + r * 0.4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "superman": {
      ctx.fillStyle = "oklch(0.48 0.2 25)";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, a.hip.y + r * 0.18);
      ctx.lineTo(cx + r * 0.62, a.hip.y + r * 0.18);
      ctx.lineTo(cx + r * 0.34, a.hip.y + r * 0.62);
      ctx.lineTo(cx - r * 0.34, a.hip.y + r * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "oklch(0.86 0.16 86)";
      ctx.fillRect(cx - r * 0.72, a.hip.y + r * 0.1, r * 1.44, r * 0.12);
      break;
    }
    case "homelander": {
      ctx.fillStyle = "oklch(0.75 0.16 86)";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * r * 0.72, a.shoulderY + r * 0.2, r * 0.48, r * 0.3, side * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "oklch(0.72 0.16 85 / 0.8)";
      ctx.lineWidth = 1.35;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.78, a.shoulderY + r * 0.28);
        ctx.quadraticCurveTo(cx + side * r * 0.28, cy + r * 0.36, cx, cy + r * 0.78);
        ctx.stroke();
      }
      break;
    }
    case "flash":
    case "atrain": {
      const isATrain = skin.id === "atrain";
      ctx.strokeStyle = isATrain ? "oklch(0.94 0.02 250)" : look.trim;
      ctx.lineWidth = isATrain ? 2.8 : 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (isATrain) {
        ctx.moveTo(cx - r * 0.74, a.shoulderY + r * 0.1);
        ctx.lineTo(cx, cy + r * 1.1);
        ctx.lineTo(cx + r * 0.74, a.shoulderY + r * 0.1);
        ctx.moveTo(cx - r * 0.56, cy + r * 1.35);
        ctx.lineTo(cx + r * 0.78, cy + r * 1.66);
      } else {
        ctx.moveTo(cx - r * 0.8, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.9);
        ctx.moveTo(cx - r * 0.55, cy + r * 1.15);
        ctx.lineTo(cx + r * 0.9, cy + r * 1.6);
      }
      ctx.stroke();
      if (isATrain) {
        ctx.strokeStyle = "oklch(0.55 0.22 28 / 0.78)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.48, a.shoulderY + r * 0.28);
        ctx.lineTo(cx + r * 0.12, cy + r * 1.16);
        ctx.stroke();
      } else {
        ctx.fillStyle = look.trim;
        const beltY = a.hip.y + r * 0.2;
        ctx.fillRect(cx - r * 0.72, beltY, r * 1.44, r * 0.14);
      }
      break;
    }
  }

  ctx.restore();
}

function drawMaterialFinish(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;
  const top = Math.max(0, a.bbox.top - 2);
  const bottom = Math.min(WALK_FRAME_H, a.footY + 1);

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";

  const key = ctx.createLinearGradient(ox + a.bbox.left, top, ox + a.bbox.right, bottom);
  key.addColorStop(0, withAlpha(look.highlight, 0.22));
  key.addColorStop(0.34, "transparent");
  key.addColorStop(1, "oklch(0 0 0 / 0.18)");
  ctx.fillStyle = key;
  ctx.fillRect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);

  const edgeGlow = ctx.createLinearGradient(ox + a.bbox.left, 0, ox + a.bbox.right, 0);
  edgeGlow.addColorStop(0, withAlpha(look.trim, 0.18));
  edgeGlow.addColorStop(0.28, "transparent");
  edgeGlow.addColorStop(0.72, "transparent");
  edgeGlow.addColorStop(1, "oklch(0 0 0 / 0.16)");
  ctx.fillStyle = edgeGlow;
  ctx.fillRect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = withAlpha(look.shadow, 0.34);
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.58, a.shoulderY + r * 0.25);
  ctx.quadraticCurveTo(cx - r * 0.34, cy + r * 0.95, cx - r * 0.18, a.hip.y + r * 0.35);
  ctx.moveTo(cx + r * 0.58, a.shoulderY + r * 0.25);
  ctx.quadraticCurveTo(cx + r * 0.34, cy + r * 0.95, cx + r * 0.18, a.hip.y + r * 0.35);
  ctx.stroke();

  switch (skin.id) {
    case "spiderman": {
      ctx.strokeStyle = "oklch(0.10 0.04 258 / 0.45)";
      ctx.lineWidth = 0.85;
      for (const x of [-0.52, 0, 0.52]) {
        ctx.beginPath();
        ctx.moveTo(cx + x * r, a.shoulderY + r * 0.1);
        ctx.quadraticCurveTo(cx + x * r * 0.5, cy + r * 0.9, cx + x * r * 0.85, a.hip.y + r * 0.45);
        ctx.stroke();
      }
      ctx.strokeStyle = withAlpha(look.trim, 0.32);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * (0.35 + i * 0.38), r * (0.5 + i * 0.2), r * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "ironman": {
      ctx.strokeStyle = withAlpha(look.metal ?? look.trim, 0.62);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.92, a.shoulderY + r * 0.18);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.58);
      ctx.lineTo(cx, cy + r * 1.05);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.58);
      ctx.lineTo(cx + r * 0.92, a.shoulderY + r * 0.18);
      ctx.stroke();
      const reactor = ctx.createRadialGradient(cx, cy + r * 0.72, 1, cx, cy + r * 0.72, r * 0.58);
      reactor.addColorStop(0, "oklch(0.98 0.06 205 / 0.78)");
      reactor.addColorStop(0.5, "oklch(0.72 0.18 205 / 0.34)");
      reactor.addColorStop(1, "transparent");
      ctx.fillStyle = reactor;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.72, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "wolverine": {
      ctx.strokeStyle = withAlpha(look.trim, 0.56);
      ctx.lineWidth = 1.25;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.74, a.shoulderY + r * 0.1);
        ctx.lineTo(cx + side * r * 0.42, a.hip.y + r * 0.42);
        ctx.stroke();
      }
      break;
    }
    case "batman": {
      ctx.fillStyle = "oklch(0.02 0.01 280 / 0.26)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.95, r * 1.02, r * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = withAlpha(look.trim, 0.42);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.72, cy + r * 0.58);
      ctx.lineTo(cx + r * 0.72, cy + r * 0.58);
      ctx.stroke();
      break;
    }
    case "superman":
    case "homelander": {
      ctx.strokeStyle = withAlpha(look.trim, skin.id === "homelander" ? 0.46 : 0.38);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.82, a.shoulderY + r * 0.22);
      ctx.lineTo(cx, cy + r * 0.62);
      ctx.lineTo(cx + r * 0.82, a.shoulderY + r * 0.22);
      ctx.stroke();
      ctx.fillStyle = withAlpha(look.highlight, 0.18);
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.3, cy + r * 0.45, r * 0.38, r * 0.72, -0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "flash":
    case "atrain": {
      const slant = skin.id === "atrain" ? -1 : 1;
      ctx.strokeStyle = withAlpha(look.trim, 0.68);
      ctx.lineWidth = 1.35;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - slant * r * (1.05 - i * 0.25), cy + r * (0.1 + i * 0.42));
        ctx.lineTo(cx + slant * r * (0.45 + i * 0.16), cy + r * (0.52 + i * 0.42));
        ctx.stroke();
      }
      break;
    }
    case "butcher": {
      ctx.strokeStyle = "oklch(0.48 0.015 245 / 0.42)";
      ctx.lineWidth = 1.25;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.54, a.shoulderY + r * 0.1);
        ctx.quadraticCurveTo(cx + side * r * 0.3, cy + r * 0.95, cx + side * r * 0.24, a.hip.y + r * 1.55);
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}

function drawCape(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const profile = getCharacterPresentation(skin.id);
  const capeShape = profile.cape !== "none" ? profile.cape : (skin.cape ? "hero" : "none");
  if (!skin.cape || capeShape === "none") return;
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;
  const sway = capeSway(a.frame) * (capeShape === "short" ? 0.55 : capeShape === "banner" ? 0.35 : 1);
  const capeTop = a.shoulderY + r * 0.16;
  const capeDrop = r * (capeShape === "short" ? 3.05 : capeShape === "banner" ? 4.95 : 4.45) * profile.capeLength;
  const bottom = Math.min(WALK_FRAME_H - 4, Math.max(a.hip.y + r * 1.8, capeTop + capeDrop));
  const width = profile.capeWidth * (capeShape === "short" ? 0.92 : capeShape === "banner" ? 0.82 : 1);

  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  const cape = new Path2D();
  cape.moveTo(cx - r * 1.0 * width, capeTop);
  if (capeShape === "short") {
    cape.bezierCurveTo(cx - r * 1.8 * width + sway, cy + r * 1.0, cx - r * 1.25 * width + sway, bottom - r * 0.55, cx - r * 0.38 + sway * 0.45, bottom);
    cape.lineTo(cx - r * 0.12 + sway * 0.25, bottom - r * 0.32);
    cape.lineTo(cx + r * 0.14 + sway * 0.22, bottom);
    cape.lineTo(cx + r * 0.42 + sway * 0.45, bottom - r * 0.24);
    cape.bezierCurveTo(cx + r * 1.18 * width + sway, bottom - r * 0.7, cx + r * 1.72 * width + sway, cy + r * 1.0, cx + r * 1.0 * width, capeTop);
  } else if (capeShape === "banner") {
    cape.bezierCurveTo(cx - r * 1.3 * width + sway, cy + r * 1.2, cx - r * 0.88 * width + sway * 0.7, bottom - r * 0.9, cx - r * 0.36 + sway * 0.35, bottom);
    cape.quadraticCurveTo(cx + sway * 0.18, bottom + r * 0.18, cx + r * 0.36 + sway * 0.35, bottom);
    cape.bezierCurveTo(cx + r * 0.88 * width + sway * 0.7, bottom - r * 0.9, cx + r * 1.3 * width + sway, cy + r * 1.2, cx + r * 1.0 * width, capeTop);
  } else {
    cape.bezierCurveTo(cx - r * 2.0 * width + sway, cy + r * 1.4, cx - r * 1.65 * width + sway, bottom - r * 0.8, cx - r * 0.55 + sway * 0.5, bottom);
    cape.quadraticCurveTo(cx + sway * 0.3, bottom + r * 0.45, cx + r * 0.55 + sway * 0.5, bottom);
    cape.bezierCurveTo(cx + r * 1.65 * width + sway, bottom - r * 0.8, cx + r * 2.0 * width + sway, cy + r * 1.4, cx + r * 1.0 * width, capeTop);
  }
  cape.closePath();
  ctx.fillStyle = skin.cape;
  ctx.fill(cape);

  ctx.save();
  ctx.clip(cape);
  const cloth = ctx.createLinearGradient(cx - r * 1.7 + sway, a.shoulderY, cx + r * 1.6 + sway, bottom);
  cloth.addColorStop(0, withAlpha("oklch(1 0 0)", skin.id === "homelander" ? 0.24 : 0.16));
  cloth.addColorStop(0.42, withAlpha(skin.cape, 0.86));
  cloth.addColorStop(1, mixColor(skin.cape, skin.id === "batman" ? 42 : 54, "black"));
  ctx.fillStyle = cloth;
  ctx.fillRect(ox, 0, WALK_FRAME_W, WALK_FRAME_H);

  ctx.strokeStyle = withAlpha(skin.capeAccent ?? mixColor(skin.cape, 72, "black"), skin.id === "batman" ? 0.28 : 0.38);
  ctx.lineWidth = skin.id === "batman" ? 0.85 : 1.05;
  ctx.lineCap = "round";
  for (const side of [-0.45, 0.05, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * r + sway * 0.08, a.shoulderY + r * 0.56);
    ctx.quadraticCurveTo(cx + (side * 0.85) * r + sway * 0.45, cy + r * 2.0, cx + (side * 0.4) * r + sway * 0.35, bottom - r * 0.35);
    ctx.stroke();
  }
  ctx.restore();

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
  const profile = getCharacterPresentation(skin.id);
  const hx = ox + a.head.x;
  const hy = a.head.y;
  const r = a.head.r * 1.05 * profile.headMul;

  ctx.save();
  ctx.fillStyle = look.head;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();

  drawHairSilhouette(ctx, skin, hx, hy, r, look);

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

function drawHairSilhouette(ctx: CanvasRenderingContext2D, skin: Skin, hx: number, hy: number, r: number, look: SkinLook) {
  const profile = getCharacterPresentation(skin.id);
  if (profile.hair === "none") return;
  const hairColor = skin.skinTone ? look.head : mixColor(look.head, 78, "black");

  ctx.save();
  ctx.fillStyle = hairColor;
  ctx.strokeStyle = hairColor;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (profile.hair) {
    case "slick": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.76, hy - r * 0.35);
      ctx.bezierCurveTo(hx - r * 0.44, hy - r * 1.08, hx + r * 0.34, hy - r * 1.18, hx + r * 0.92, hy - r * 0.58);
      ctx.lineTo(hx + r * 0.38, hy - r * 0.28);
      ctx.quadraticCurveTo(hx - r * 0.12, hy - r * 0.58, hx - r * 0.76, hy - r * 0.35);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.2, hy - r * 0.9);
      ctx.lineTo(hx + r * 0.82, hy - r * 1.1);
      ctx.lineTo(hx + r * 0.58, hy - r * 0.52);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "fade": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.72, hy - r * 0.36);
      ctx.quadraticCurveTo(hx - r * 0.48, hy - r * 1.04, hx + r * 0.02, hy - r * 1.08);
      ctx.lineTo(hx + r * 0.92, hy - r * 0.9);
      ctx.lineTo(hx + r * 0.58, hy - r * 0.28);
      ctx.quadraticCurveTo(hx - r * 0.06, hy - r * 0.54, hx - r * 0.72, hy - r * 0.36);
      ctx.fill();
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.64, hy - r * 0.18);
      ctx.lineTo(hx - r * 0.52, hy + r * 0.26);
      ctx.moveTo(hx + r * 0.64, hy - r * 0.18);
      ctx.lineTo(hx + r * 0.52, hy + r * 0.22);
      ctx.stroke();
      break;
    }
    case "messy": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.86, hy - r * 0.32);
      ctx.lineTo(hx - r * 0.68, hy - r * 1.05);
      ctx.lineTo(hx - r * 0.26, hy - r * 0.62);
      ctx.lineTo(hx + r * 0.04, hy - r * 1.16);
      ctx.lineTo(hx + r * 0.32, hy - r * 0.58);
      ctx.lineTo(hx + r * 0.76, hy - r * 0.94);
      ctx.lineTo(hx + r * 0.72, hy - r * 0.28);
      ctx.quadraticCurveTo(hx, hy - r * 0.55, hx - r * 0.86, hy - r * 0.32);
      ctx.fill();
      break;
    }
    case "sharp": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.7, hy - r * 0.32);
      ctx.lineTo(hx - r * 0.42, hy - r * 1.05);
      ctx.lineTo(hx - r * 0.1, hy - r * 0.58);
      ctx.lineTo(hx + r * 0.36, hy - r * 1.26);
      ctx.lineTo(hx + r * 0.46, hy - r * 0.48);
      ctx.lineTo(hx + r * 0.86, hy - r * 0.28);
      ctx.quadraticCurveTo(hx + r * 0.12, hy - r * 0.46, hx - r * 0.7, hy - r * 0.32);
      ctx.fill();
      break;
    }
    case "speedFins": {
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.28, r * 0.9, r * 0.72, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.72, hy - r * 0.12);
      ctx.lineTo(hx - r * 1.34, hy - r * 0.7);
      ctx.lineTo(hx - r * 0.86, hy + r * 0.1);
      ctx.closePath();
      ctx.moveTo(hx + r * 0.72, hy - r * 0.12);
      ctx.lineTo(hx + r * 1.34, hy - r * 0.7);
      ctx.lineTo(hx + r * 0.86, hy + r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "spiderMask": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.72, hy - r * 0.3);
      ctx.lineTo(hx - r * 1.04, hy + r * 0.02);
      ctx.lineTo(hx - r * 0.68, hy + r * 0.24);
      ctx.quadraticCurveTo(hx - r * 0.28, hy - r * 0.1, hx, hy - r * 0.08);
      ctx.quadraticCurveTo(hx + r * 0.28, hy - r * 0.1, hx + r * 0.68, hy + r * 0.24);
      ctx.lineTo(hx + r * 1.04, hy + r * 0.02);
      ctx.lineTo(hx + r * 0.72, hy - r * 0.3);
      ctx.quadraticCurveTo(hx, hy - r * 0.64, hx - r * 0.72, hy - r * 0.3);
      ctx.fill();
      break;
    }
    case "widowPeak": {
      ctx.beginPath();
      ctx.arc(hx, hy - r * 0.08, r * 0.9, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(hx + r * 0.18, hy - r * 0.24);
      ctx.lineTo(hx, hy + r * 0.02);
      ctx.lineTo(hx - r * 0.18, hy - r * 0.24);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "helmet": {
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.28, r * 0.9, r * 0.72, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(hx - r * 0.58, hy - r * 0.2, r * 1.16, r * 0.58, r * 0.16);
      ctx.fill();
      break;
    }
    case "cowl":
    case "ears": {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.72, hy - r * 0.52);
      ctx.lineTo(hx - r * 0.48, hy - r * 1.52);
      ctx.lineTo(hx - r * 0.16, hy - r * 0.66);
      ctx.closePath();
      ctx.moveTo(hx + r * 0.72, hy - r * 0.52);
      ctx.lineTo(hx + r * 0.48, hy - r * 1.52);
      ctx.lineTo(hx + r * 0.16, hy - r * 0.66);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

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
  const profile = getCharacterPresentation(skin.id);
  const ey = hy - r * 0.08;
  const ex = r * 0.38;
  const eyeScale = profile.eyeScale;

  if (skin.id === "atrain") {
    ctx.fillStyle = "oklch(0.96 0.02 250)";
    ctx.strokeStyle = "oklch(0.06 0.02 255 / 0.65)";
    ctx.lineWidth = 0.8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * ex * 0.95, ey, r * 0.18, r * 0.11, side * -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "oklch(0.55 0.22 28)";
    ctx.fillRect(hx - r * 0.08, ey - r * 0.05, r * 0.16, r * 0.08);
    return;
  }

  if (skin.id === "flash") {
    ctx.fillStyle = "oklch(0.98 0.04 90)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * ex, ey, r * 0.16 * eyeScale, r * 0.08 * eyeScale, side * -0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (skin.id === "spiderman") {
    ctx.fillStyle = "oklch(0.98 0.02 240)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * ex, ey, r * 0.26 * eyeScale, r * 0.14 * eyeScale, side * -0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (skin.id === "ironman" || skin.id === "batman" || skin.id === "wolverine") {
    ctx.fillStyle = skin.id === "ironman" ? "oklch(0.92 0.16 205)" : "oklch(0.96 0.04 100)";
    for (const side of [-1, 1]) {
      ctx.fillRect(hx + side * ex - 4 * eyeScale, ey - 1.2 * eyeScale, 7 * eyeScale, 2.6 * eyeScale);
    }
    return;
  }

  if (skin.glowingEyes) {
    ctx.fillStyle = skin.glowingEyes;
    ctx.shadowColor = skin.glowingEyes;
    ctx.shadowBlur = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * ex, ey, 2.4 * eyeScale, 0, Math.PI * 2);
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
  if (skin.id === "ironman") {
    ctx.save();
    ctx.strokeStyle = "oklch(0.22 0.08 25 / 0.58)";
    ctx.lineWidth = 1.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.42, hy - r * 0.36);
    ctx.lineTo(hx - r * 0.28, hy + r * 0.42);
    ctx.moveTo(hx + r * 0.42, hy - r * 0.36);
    ctx.lineTo(hx + r * 0.28, hy + r * 0.42);
    ctx.moveTo(hx - r * 0.28, hy + r * 0.42);
    ctx.quadraticCurveTo(hx, hy + r * 0.62, hx + r * 0.28, hy + r * 0.42);
    ctx.stroke();
    ctx.restore();
    void look;
    return;
  }

  if (skin.id === "flash") {
    ctx.save();
    ctx.fillStyle = look.trim;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + side * r * 0.58, hy - r * 0.22);
      ctx.lineTo(hx + side * r * 1.05, hy - r * 0.56);
      ctx.lineTo(hx + side * r * 0.76, hy - r * 0.02);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (skin.id === "superman") {
    ctx.save();
    ctx.strokeStyle = "oklch(0.18 0.04 30 / 0.85)";
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.16, hy - r * 0.52);
    ctx.quadraticCurveTo(hx + r * 0.42, hy - r * 0.18, hx + r * 0.08, hy - r * 0.04);
    ctx.stroke();
    ctx.restore();
    return;
  }

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
  const profile = getCharacterPresentation(skin.id);
  const glove = skin.gloves;
  const boot = skin.boots;
  const r = a.head.r;

  if (glove) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    for (const hand of [a.hands.left, a.hands.right]) {
      const gx = ox + hand.x;
      const gy = hand.y;
      const grad = ctx.createRadialGradient(gx - r * 0.12, gy - r * 0.12, 1, gx, gy, r * 0.56);
      grad.addColorStop(0, withAlpha("oklch(1 0 0)", 0.22));
      grad.addColorStop(0.36, glove);
      grad.addColorStop(1, mixColor(glove, 68, "black"));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(gx, gy, r * 0.50 * profile.gloveMul, r * 0.36 * profile.gloveMul, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "oklch(0 0 0 / 0.36)";
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (boot) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    for (const foot of [a.feet.left, a.feet.right]) {
      const bx = ox + foot.x;
      const by = foot.y;
      const grad = ctx.createLinearGradient(bx, by - r * 0.36, bx, by + r * 0.3);
      grad.addColorStop(0, withAlpha("oklch(1 0 0)", 0.18));
      grad.addColorStop(0.38, boot);
      grad.addColorStop(1, mixColor(boot, 58, "black"));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, r * 0.62 * profile.bootMul, r * 0.32 * profile.bootMul, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "oklch(0 0 0 / 0.40)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.44 * profile.bootMul, by + r * 0.18);
      ctx.lineTo(bx + r * 0.46 * profile.bootMul, by + r * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  void look;
}

function drawEmblem(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  if (!skin.emblem) return;
  const profile = getCharacterPresentation(skin.id);
  const cx = ox + a.chest.x;
  const cy = a.chest.y + a.head.r * 0.35;
  const r = a.head.r * 0.92 * profile.emblemScale;

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
      ctx.strokeStyle = "oklch(0.5 0.2 25)";
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.18, cy - r * 0.16);
      ctx.quadraticCurveTo(cx + r * 0.28, cy - r * 0.3, cx + r * 0.16, cy + r * 0.04);
      ctx.quadraticCurveTo(cx + r * 0.04, cy + r * 0.3, cx - r * 0.22, cy + r * 0.2);
      ctx.stroke();
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
      ctx.fillStyle = look.trim;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.47, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.50 0.20 25)";
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
      if (skin.id === "atrain") {
        ctx.strokeStyle = "oklch(0.96 0.02 250)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.42, cy + r * 0.42);
        ctx.lineTo(cx, cy - r * 0.48);
        ctx.lineTo(cx + r * 0.42, cy + r * 0.42);
        ctx.moveTo(cx - r * 0.2, cy + r * 0.02);
        ctx.lineTo(cx + r * 0.22, cy + r * 0.02);
        ctx.stroke();
      } else {
        ctx.fillRect(cx - r * 0.56, cy - r * 0.1, r * 1.12, r * 0.22);
      }
      break;
  }

  ctx.restore();
}

function drawSkinSpecificDetails(ctx: CanvasRenderingContext2D, skin: Skin, ox: number, a: FrameAnatomy, look: SkinLook) {
  const profile = getCharacterPresentation(skin.id);
  const cx = ox + a.chest.x;
  const cy = a.chest.y;
  const r = a.head.r;

  if (skin.id === "wolverine" || profile.claws) {
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

  if (skin.id === "nightcrawler") {
    const hx = ox + a.head.x;
    const hy = a.head.y;
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "oklch(0.62 0.22 300 / 0.62)";
    ctx.lineWidth = 1.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.48, a.shoulderY + r * 0.1);
    ctx.quadraticCurveTo(cx + r * 0.1, cy + r * 0.72, cx - r * 0.26, a.hip.y + r * 0.4);
    ctx.moveTo(cx + r * 0.5, a.shoulderY + r * 0.16);
    ctx.quadraticCurveTo(cx - r * 0.08, cy + r * 0.82, cx + r * 0.18, a.hip.y + r * 0.5);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "oklch(0.86 0.18 72)";
    ctx.shadowColor = "oklch(0.62 0.22 300)";
    ctx.shadowBlur = 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * r * 0.34, hy - r * 0.05, r * 0.1, r * 0.16, side * -0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (skin.id === "spiderman") {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "oklch(0.09 0.04 258 / 0.54)";
    ctx.lineWidth = 0.75;
    ctx.lineCap = "round";
    for (const hand of [a.hands.left, a.hands.right]) {
      const hx = ox + hand.x;
      for (const dy of [-r * 0.16, r * 0.08]) {
        ctx.beginPath();
        ctx.moveTo(hx - r * 0.34, hand.y + dy);
        ctx.lineTo(hx + r * 0.34, hand.y + dy);
        ctx.stroke();
      }
    }
    for (const foot of [a.feet.left, a.feet.right]) {
      const fx = ox + foot.x;
      ctx.beginPath();
      ctx.moveTo(fx - r * 0.34, foot.y - r * 0.2);
      ctx.lineTo(fx + r * 0.34, foot.y - r * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (skin.id === "ironman") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const hand of [a.hands.left, a.hands.right]) {
      const hx = ox + hand.x;
      const glow = ctx.createRadialGradient(hx, hand.y, 0.5, hx, hand.y, r * 0.42);
      glow.addColorStop(0, "oklch(0.98 0.08 205 / 0.8)");
      glow.addColorStop(0.45, "oklch(0.78 0.16 205 / 0.38)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hx, hand.y, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (skin.id === "batman") {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    const beltY = a.hip.y + r * 0.36;
    ctx.fillStyle = "oklch(0.92 0.13 92)";
    for (const x of [-0.48, -0.18, 0.18, 0.48]) {
      ctx.fillRect(cx + x * r - r * 0.08, beltY - r * 0.08, r * 0.16, r * 0.16);
    }
    ctx.restore();
  }

  if (skin.id === "superman") {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "oklch(0.50 0.2 25)";
    for (const foot of [a.feet.left, a.feet.right]) {
      const fx = ox + foot.x;
      ctx.beginPath();
      ctx.ellipse(fx, foot.y - r * 0.1, r * 0.44, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (skin.id === "homelander") {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "oklch(0.74 0.16 86 / 0.76)";
    ctx.lineWidth = 1.05;
    for (let i = 0; i < 3; i++) {
      const spread = r * (0.36 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - spread, a.shoulderY + r * (0.3 + i * 0.12));
      ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.42, cx, cy + r * (0.76 + i * 0.08));
      ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.42, cx + spread, a.shoulderY + r * (0.3 + i * 0.12));
      ctx.stroke();
    }
    ctx.restore();
  }

  if (skin.id === "flash" || skin.id === "atrain") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = skin.streaks ?? look.trim;
    ctx.lineWidth = skin.id === "atrain" ? 1.55 : 1.2;
    ctx.globalAlpha = 0.55;
    const slant = skin.id === "atrain" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.1 * slant, cy + r * 0.8);
    ctx.lineTo(cx - r * 2.0 * slant, cy + r * 0.2);
    ctx.moveTo(cx - r * 0.7 * slant, cy + r * 1.5);
    ctx.lineTo(cx - r * 1.7 * slant, cy + r * 1.15);
    ctx.stroke();
    ctx.restore();

    if (skin.id === "atrain") {
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = "oklch(0.94 0.02 250 / 0.82)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, a.shoulderY + r * 0.18);
      ctx.lineTo(cx + r * 0.28, a.hip.y + r * 0.44);
      ctx.moveTo(cx + r * 0.52, a.shoulderY + r * 0.28);
      ctx.lineTo(cx - r * 0.2, a.hip.y + r * 0.5);
      ctx.stroke();
      ctx.restore();
    }
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
        limb: "oklch(0.27 0.12 252)",
        body: "oklch(0.30 0.13 252)",
        head: "oklch(0.28 0.12 252)",
        trim: "oklch(0.92 0.02 250)",
        shadow: "oklch(0.12 0.07 255)",
        highlight: "oklch(0.50 0.13 248)",
        eye: "oklch(0.92 0.02 250)",
      };
    case "nightcrawler":
      return {
        base,
        limb: "oklch(0.20 0.12 292)",
        body: "oklch(0.18 0.10 292)",
        head: "oklch(0.13 0.08 288)",
        trim: "oklch(0.66 0.22 302)",
        shadow: "oklch(0.07 0.04 288)",
        highlight: "oklch(0.35 0.16 300)",
        eye: "oklch(0.88 0.18 75)",
      };
    case "hulk":
      return {
        base,
        limb: "oklch(0.48 0.15 145)",
        body: "oklch(0.42 0.13 145)",
        head: "oklch(0.44 0.13 145)",
        trim: "oklch(0.28 0.10 292)",
        shadow: "oklch(0.20 0.08 145)",
        highlight: "oklch(0.64 0.15 145)",
        eye: "oklch(0.94 0.12 95)",
      };
    case "heatwave":
      return {
        base,
        limb: "oklch(0.40 0.16 45)",
        body: "oklch(0.48 0.20 38)",
        head: "oklch(0.36 0.16 38)",
        trim: "oklch(0.86 0.18 70)",
        shadow: "oklch(0.18 0.08 38)",
        highlight: "oklch(0.70 0.20 52)",
        eye: "oklch(0.96 0.18 80)",
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

function frameActionLean(frame: number) {
  if (frame < 10) return 0.6 + Math.sin((frame / 10) * Math.PI * 2) * 0.4;
  if (frame === PUNCH_FRAME_START + 1 || frame === KICK_HIT_FRAME || frame === KNEE_HIT_FRAME || frame === SLASH_HIT_FRAME) return 1.15;
  if (frame === HURT_FRAME || frame === DOWN_FRAME) return -0.3;
  if (frame === JUMP_TAKEOFF_FRAME || frame === JUMP_RISE_FRAME) return 0.85;
  return 0.45;
}

function withAlpha(color: string, alpha: number) {
  if (!color.includes("(") || !color.trim().endsWith(")")) return color;
  const a = clamp(alpha, 0, 1);
  if (/\/\s*[\d.]+\s*\)\s*$/.test(color)) {
    return color.replace(/\/\s*[\d.]+\s*\)\s*$/, `/ ${a})`);
  }
  return color.replace(/\)\s*$/, ` / ${a})`);
}

function mixColor(color: string, pct: number, other: string) {
  const m = color.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (!m) return color;
  const keep = clamp(pct, 0, 100) / 100;
  const towardWhite = other === "white";
  const l0 = Number(m[1]);
  const c0 = Number(m[2]);
  const l = towardWhite ? l0 + (1 - l0) * (1 - keep) : l0 * keep;
  const c = c0 * keep;
  const alpha = m[4] ? ` / ${m[4]}` : "";
  return `oklch(${roundColor(l)} ${roundColor(c)} ${m[3]}${alpha})`;
}

function roundColor(n: number) {
  return Math.round(n * 1000) / 1000;
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

export function drawWalkFrameSilhouette(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  idx: number,
  cx: number,
  footY: number,
  facing: 1 | -1,
  height: number,
  opts: {
    alpha?: number;
    blur?: number;
    shadowColor?: string;
    composite?: GlobalCompositeOperation;
    offset?: number;
  } = {},
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
  ctx.globalAlpha = opts.alpha ?? 0.4;
  ctx.globalCompositeOperation = opts.composite ?? "source-over";
  ctx.shadowColor = opts.shadowColor ?? "rgba(0,0,0,0.85)";
  ctx.shadowBlur = opts.blur ?? 3;
  const offset = Math.max(0, opts.offset ?? 0);
  const offsets = offset > 0
    ? [[offset, 0], [-offset, 0], [0, offset], [0, -offset]]
    : [[0, 0]];
  for (const [ox, oy] of offsets) {
    ctx.shadowOffsetX = ox;
    ctx.shadowOffsetY = oy;
    ctx.drawImage(
      composed,
      sx, 0, WALK_FRAME_W, WALK_FRAME_H,
      -dw / 2, -dh, dw, dh,
    );
  }
  ctx.restore();
  return true;
}
