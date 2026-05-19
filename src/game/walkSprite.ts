// Per-skin walk-sheet renderer.
// Tints the imported silhouette and bakes character-specific overlays
// (mask, eyes, emblem, cape, cowl, beard) into a cached canvas so the
// hot-path render is one drawImage per fighter per frame.

import sheetUrl from "@/assets/walk-sheet.png";
import { WALK_ANCHORS } from "./walkAnchors";
import type { Skin } from "./skins";

export const WALK_FRAME_W = 144;
export const WALK_FRAME_H = 200;
export const WALK_FRAME_COUNT = 30;
export const WALK_LOOP_FRAMES = 10;        // walk cycle: frames 0..9
export const PUNCH_FRAME_START = 10;       // punch: frames 10..13
export const PUNCH_FRAME_COUNT = 4;
export const RECOVERY_FRAME = 14;          // post-punch transition
// Jump + state frames (extended pack)
export const JUMP_TAKEOFF_FRAME = 15;
export const JUMP_RISE_FRAME = 16;
export const JUMP_APEX_FRAME = 17;
export const JUMP_LAND_FRAME = 18;
export const DOWN_FRAME = 19;              // ragdoll / KO silhouette
export const GETUP_FRAME_A = 20;
export const GETUP_FRAME_B = 21;
export const HURT_FRAME = 22;
// Combo extension — high kick (23–24), knee (25–26), slash (27–29)
export const KICK_CHAMBER_FRAME = 23;
export const KICK_HIT_FRAME = 24;
export const KNEE_CHAMBER_FRAME = 25;
export const KNEE_HIT_FRAME = 26;
export const SLASH_WINDUP_FRAME = 27;
export const SLASH_HIT_FRAME = 28;
export const SLASH_RECOVER_FRAME = 29;
export const WALK_FOOT_Y = 189;

let sheet: HTMLImageElement | null = null;
let sheetReady = false;

const skinCache = new Map<string, HTMLCanvasElement>();

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

/** Build (or return cached) per-skin sprite sheet with overlays. */
function getSkinSheet(skin: Skin): HTMLCanvasElement | null {
  if (!sheet || !sheetReady) return null;
  const cached = skinCache.get(skin.id);
  if (cached) return cached;

  const W = sheet.naturalWidth;
  const H = sheet.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  // ---- Step 1: silhouette tinted as legs/limbs ----
  ctx.drawImage(sheet, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = skin.limb ?? skin.body;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  // ---- Step 2: per-frame overlays ----
  for (let i = 0; i < WALK_FRAME_COUNT; i++) {
    const a = WALK_ANCHORS[i];
    const ox = i * WALK_FRAME_W;
    drawOverlays(ctx, skin, ox, a);
  }

  skinCache.set(skin.id, c);
  return c;
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  ox: number,
  a: typeof WALK_ANCHORS[number],
) {
  const hx = ox + a.hx;
  const hy = a.hy;
  const cx = ox + a.cx;
  const cy = a.cy;
  const r = a.hr;

  // ---- Body thickening pass (baked) ----
  // Adds visible torso + limb mass so thickBody skins look premium, not skinny.
  if (skin.thickBody) {
    ctx.save();
    ctx.fillStyle = skin.body;
    // Torso slab: shoulders → hips
    const torsoTop = cy - r * 0.55;
    const torsoBot = a.hipY + 4;
    const torsoH = torsoBot - torsoTop;
    const torsoW = r * 1.55;
    ctx.beginPath();
    // Rounded torso (capsule-ish)
    ctx.moveTo(cx - torsoW * 0.5, torsoTop + r * 0.25);
    ctx.quadraticCurveTo(cx - torsoW * 0.5, torsoTop, cx, torsoTop);
    ctx.quadraticCurveTo(cx + torsoW * 0.5, torsoTop, cx + torsoW * 0.5, torsoTop + r * 0.25);
    ctx.lineTo(cx + torsoW * 0.42, torsoBot);
    ctx.quadraticCurveTo(cx, torsoBot + r * 0.18, cx - torsoW * 0.42, torsoBot);
    ctx.closePath();
    ctx.fill();
    // Neck patch so head connects cleanly to torso
    ctx.fillStyle = skin.head ?? skin.body;
    ctx.fillRect(hx - r * 0.45, hy + r * 0.6, r * 0.9, (torsoTop - (hy + r * 0.6)) + 2);
    ctx.restore();
    // unused-var guard
    void torsoH;
  }

  // ---- Cape (drawn behind torso via destination-over) ----
  if (skin.cape) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = skin.cape;
    ctx.beginPath();
    // Trailing cape: from shoulders down past hips, slight curve
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

  // ---- Head fill (mask color) ----
  // Perfect domed head. Center is shifted DOWN by ~r*0.15 so an enlarged
  // radius still fits inside the frame top (hy≈14) — prevents flat-top clip.
  ctx.save();
  if (skin.noHead) { ctx.restore(); return; }
  ctx.fillStyle = skin.head ?? skin.body;
  const headCx = hx;
  const headCy = hy + r * 0.18;
  const headR = r * 1.18;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  // Subtle jaw taper so head reads as a head, not a ball
  ctx.beginPath();
  ctx.ellipse(headCx, headCy + headR * 0.45, headR * 0.78, headR * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft top-light highlight — gives the head dimensional volume.
  const headHi = ctx.createRadialGradient(
    headCx - headR * 0.3, headCy - headR * 0.45, 1,
    headCx, headCy, headR,
  );
  headHi.addColorStop(0, "oklch(1 0 0 / 0.18)");
  headHi.addColorStop(1, "transparent");
  ctx.fillStyle = headHi;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  // Lower-jaw shadow for grounded weight.
  const headSh = ctx.createRadialGradient(
    headCx, headCy + headR * 0.55, 1,
    headCx, headCy + headR * 0.2, headR,
  );
  headSh.addColorStop(0, "oklch(0 0 0 / 0.22)");
  headSh.addColorStop(1, "transparent");
  ctx.fillStyle = headSh;
  ctx.beginPath();
  ctx.ellipse(headCx, headCy + headR * 0.35, headR * 0.95, headR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crisp 1px rim outline for cleaner silhouette.
  ctx.strokeStyle = "oklch(0.12 0.02 260 / 0.55)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.stroke();

  // Skin-tone face for open faces (Superman, Homelander, Butcher, Heatwave)
  if (skin.skinTone) {
    ctx.fillStyle = skin.skinTone;
    ctx.beginPath();
    // Face oval lower-half
    ctx.ellipse(hx, hy + r * 0.15, r * 0.78, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair cap on top
    ctx.fillStyle = skin.head ?? "oklch(0.18 0.02 30)";
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.2, r * 0.95, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // ---- Cowl ears (Batman) ----
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

  // ---- Eyes ----
  drawEyes(ctx, skin, hx, hy, r);

  // ---- Spider-Man web pattern on mask (3 thin radial strokes) ----
  if (skin.id === "spiderman") {
    ctx.strokeStyle = "oklch(0.16 0.04 25 / 0.55)";
    ctx.lineWidth = 0.6;
    [-0.5, 0, 0.5].forEach((a) => {
      ctx.beginPath();
      ctx.moveTo(hx, hy - r * 0.85);
      ctx.lineTo(hx + Math.sin(a) * r * 0.85, hy + Math.cos(a) * r * 0.65);
      ctx.stroke();
    });
  }

  // ---- Beard (Butcher) ----
  if (skin.beard) {
    ctx.fillStyle = "oklch(0.16 0.01 30)";
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.6, r * 0.7, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- Chest emblem ----
  if (skin.emblem) drawEmblem(ctx, skin, cx, cy, r * 1.05);

  // ---- Body recolor over chest (subtle, matches body color) ----
  // Skip — silhouette already tinted limb; for two-tone skins we layer body
  // as a chest patch to imply shirt vs limbs.
  if (skin.body !== (skin.limb ?? skin.body)) {
    ctx.save();
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 1.0, r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // re-draw emblem on top
    if (skin.emblem) drawEmblem(ctx, skin, cx, cy, r * 1.05);
    ctx.restore();
  }
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  hx: number, hy: number, r: number,
) {
  const ey = hy - r * 0.05;
  const ex = r * 0.38;

  // Spider-Man — iconic large white teardrop lenses, black-outlined,
  // tilted outward (~0.35 rad) for the classic angry shape, with a subtle
  // inner highlight. All sized off head radius `r` so they scale per-frame.
  if (skin.id === "spiderman") {
    const lensCx = r * 0.42;
    const lensCy = ey - r * 0.05;
    [-1, 1].forEach((s) => {
      // Black outline (slightly larger)
      ctx.fillStyle = "oklch(0.10 0.02 260)";
      ctx.beginPath();
      ctx.ellipse(hx + s * lensCx, lensCy, r * 0.42, r * 0.30, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // White lens fill
      ctx.fillStyle = "oklch(0.97 0.01 220)";
      ctx.beginPath();
      ctx.ellipse(hx + s * lensCx, lensCy, r * 0.34, r * 0.24, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Inner highlight
      ctx.fillStyle = "oklch(0.78 0.02 220)";
      ctx.beginPath();
      ctx.ellipse(
        hx + s * lensCx + s * r * 0.05,
        lensCy + r * 0.05,
        r * 0.10,
        r * 0.06,
        s * 0.35,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
    return;
  }

  // Iron Man slits
  if (skin.id === "ironman") {
    ctx.fillStyle = "oklch(0.92 0.18 200)";
    [-1, 1].forEach(s => {
      ctx.fillRect(hx + s * ex - 4, ey - 1, 6, 3);
    });
    return;
  }

  // Batman slits
  if (skin.id === "batman") {
    ctx.fillStyle = "oklch(0.95 0.04 100)";
    [-1, 1].forEach(s => {
      ctx.fillRect(hx + s * ex - 4, ey - 1, 6, 3);
    });
    return;
  }

  // Glowing eyes (Hulk, Nightcrawler, Homelander)
  if (skin.glowingEyes) {
    ctx.fillStyle = skin.glowingEyes;
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    return;
  }

  // Default eyes (open faces)
  if (skin.skinTone) {
    ctx.fillStyle = "oklch(0.16 0.02 260)";
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawEmblem(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  cx: number, cy: number, r: number,
) {
  if (!skin.emblem) return;
  ctx.save();
  ctx.fillStyle = skin.emblem.color;
  ctx.strokeStyle = skin.emblem.color;
  ctx.lineWidth = 1.5;

  switch (skin.emblem.shape) {
    case "spider": {
      // Cleaner spider: small head + larger abdomen, 8 thin curved legs.
      ctx.fillStyle = skin.emblem.color;
      ctx.strokeStyle = skin.emblem.color;
      // Abdomen (larger, lower)
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.12, r * 0.26, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head (smaller, above)
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.26, r * 0.17, r * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();
      // 8 legs — 4 each side, gently curved outward
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      const legAngles = [-0.95, -0.5, -0.1, 0.3];
      legAngles.forEach((ang) => {
        [-1, 1].forEach((s) => {
          const x1 = cx;
          const y1 = cy + ang * r * 0.4;
          const x2 = cx + s * r * 0.55;
          const y2 = cy + ang * r * 0.55 + (Math.abs(ang) > 0.5 ? r * 0.1 : 0);
          const cBendX = cx + s * r * 0.32;
          const cBendY = y1 + (y2 - y1) * 0.3 - r * 0.18;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(cBendX, cBendY, x2, y2);
          ctx.stroke();
        });
      });
      break;
    }
    case "shield": {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.5, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "oval": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      // bat wing notches
      ctx.fillStyle = "oklch(0.18 0.02 280)";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy);
      ctx.lineTo(cx, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.lineTo(cx, cy + r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "circle": {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // arc reactor inner ring
      ctx.strokeStyle = "oklch(0.50 0.18 25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "lightning": {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.15, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.05);
      ctx.lineTo(cx - r * 0.05, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.15, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.2, cy + r * 0.05);
      ctx.lineTo(cx + r * 0.05, cy + r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "stripe": {
      ctx.fillRect(cx - r * 0.5, cy - r * 0.1, r * 1.0, r * 0.2);
      break;
    }
  }
  ctx.restore();
}

/** Draw frame `idx` of `skin`'s composited sheet, anchored at footY.
 *  Returns false if the sheet isn't ready yet. */
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
