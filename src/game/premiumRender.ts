// Premium body renderer — single source of truth shared between the
// in-match engine and the Skins menu preview.
//
// This is a near-1:1 port of the procedural drawing block in
// src/components/game/SkinSelect.tsx (lines 240-364). All sizes are
// derived from the SkinSelect proportions (torso height H = 54 in that
// file), then scaled to whatever H the caller passes in. That guarantees
// the in-game silhouette matches the menu card exactly.

import type { Skin } from "./skins";
import type { Pose } from "./animation";

// Reference proportions from SkinSelect (H = 54).
const REF_H = 54;
const SHOULDER_HALF_THICK = 13 / REF_H;
const SHOULDER_HALF_THIN  = 10 / REF_H;
const HIP_HALF_THICK      = 10 / REF_H;
const HIP_HALF_THIN       = 7  / REF_H;
const CAP_R_THICK         = 4  / REF_H;
const CAP_R_THIN          = 3.2 / REF_H;

export function premiumShoulderHalf(skin: Skin, H: number): number {
  return H * (skin.thickBody ? SHOULDER_HALF_THICK : SHOULDER_HALF_THIN);
}
export function premiumHipHalf(skin: Skin, H: number): number {
  return H * (skin.thickBody ? HIP_HALF_THICK : HIP_HALF_THIN);
}

/**
 * Draws the torso, neck patch, shoulder caps, emblem, head, mask details
 * and eyes — everything that defines the "premium" silhouette.
 *
 * The caller is responsible for limbs/boots/gloves (those are pose-driven
 * and stroked elsewhere) and for translating the canvas to the fighter's
 * origin. `facing` is +1/-1 (engine) or 0 for the static menu preview.
 */
export function drawPremiumBody(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  pose: Pose,
  headR: number,
  facing: 1 | -1 | 0,
  ghost: boolean,
): void {
  const shoulderY = pose.shoulderY;
  const hipY = pose.hipY;
  const headY = headR + 2 + pose.headOffsetY;
  const H = hipY - shoulderY;
  const shoulderHalf = premiumShoulderHalf(skin, H);
  const hipHalf = premiumHipHalf(skin, H);
  const capR = H * (skin.thickBody ? CAP_R_THICK : CAP_R_THIN);

  const bodyColor = skin.body;
  const limbColor = skin.limb ?? bodyColor;
  const headColor = skin.head ?? bodyColor;

  // ---- Torso: filled trapezoid (shoulders → hips) ----
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-shoulderHalf, shoulderY);
  ctx.lineTo(shoulderHalf, shoulderY);
  ctx.lineTo(hipHalf + 0.5, hipY);
  ctx.lineTo(-hipHalf - 0.5, hipY);
  ctx.closePath();
  ctx.fill();

  // ---- Shoulder caps (sit at trapezoid corners == arm roots) ----
  ctx.fillStyle = limbColor;
  ctx.beginPath(); ctx.arc(-shoulderHalf, shoulderY, capR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(shoulderHalf, shoulderY, capR, 0, Math.PI * 2); ctx.fill();

  // ---- Neck patch (head → torso bridge) ----
  ctx.fillStyle = headColor;
  const neckW = Math.max(3, headR * 0.5);
  ctx.fillRect(-neckW / 2, headY + headR - 2, neckW, shoulderY - (headY + headR) + 3);

  // ---- Emblem ----
  if (skin.emblem) {
    const ey = (shoulderY + hipY) / 2;
    const s = H / REF_H; // scale factor relative to SkinSelect (H=54)
    ctx.fillStyle = skin.emblem.color;
    ctx.strokeStyle = skin.emblem.color;
    if (skin.emblem.shape === "oval") {
      ctx.beginPath(); ctx.ellipse(0, ey, 8 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else if (skin.emblem.shape === "circle") {
      ctx.beginPath(); ctx.arc(0, ey, 5.5 * s, 0, Math.PI * 2); ctx.fill();
    } else if (skin.emblem.shape === "shield") {
      ctx.beginPath();
      ctx.moveTo(-7 * s, ey - 5 * s);
      ctx.lineTo(7 * s, ey - 5 * s);
      ctx.lineTo(0, ey + 7 * s);
      ctx.fill();
    } else if (skin.emblem.shape === "stripe") {
      ctx.fillRect(-3 * s, shoulderY + 4 * s, 6 * s, hipY - shoulderY - 8 * s);
    } else if (skin.emblem.shape === "spider") {
      ctx.beginPath(); ctx.arc(0, ey, 3.2 * s, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(0.6, 1 * s);
      ctx.beginPath();
      ctx.moveTo(-7 * s, ey - 3 * s); ctx.lineTo(7 * s, ey + 3 * s);
      ctx.moveTo(7 * s, ey - 3 * s); ctx.lineTo(-7 * s, ey + 3 * s);
      ctx.stroke();
    } else if (skin.emblem.shape === "lightning") {
      ctx.beginPath();
      ctx.moveTo(-3 * s, ey - 7 * s); ctx.lineTo(2 * s, ey - 1 * s); ctx.lineTo(-1 * s, ey - 1 * s);
      ctx.lineTo(3 * s, ey + 7 * s); ctx.lineTo(-2 * s, ey + 1 * s); ctx.lineTo(1 * s, ey + 1 * s);
      ctx.closePath(); ctx.fill();
    }
  }

  // ---- HEAD: filled mask ----
  ctx.fillStyle = headColor;
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();

  if (skin.skinTone) {
    const fx = facing * 1.5;
    ctx.fillStyle = skin.skinTone;
    ctx.beginPath();
    ctx.ellipse(fx, headY + 2, headR - 2.5, headR - 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (skin.cowlEars) {
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.moveTo(-headR + 3, headY - headR + 4);
    ctx.lineTo(-headR - 1, headY - headR - 7);
    ctx.lineTo(-1, headY - headR + 1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR - 3, headY - headR + 4);
    ctx.lineTo(headR + 1, headY - headR - 7);
    ctx.lineTo(1, headY - headR + 1);
    ctx.closePath(); ctx.fill();
  }

  // ---- Eyes / mask lenses ----
  // Spider-Man teardrop lenses, scaled off headR (SkinSelect uses headR=17,
  // ellipse 3.8 x 2.4 at (±4, headY - 1) → ratios 0.224 / 0.141 / 0.235).
  if (skin.id === "spiderman") {
    ctx.fillStyle = "oklch(0.95 0.02 250)";
    const ex = headR * 0.235;
    const eyOff = -headR * 0.06;
    const rx = headR * 0.224;
    const ry = headR * 0.141;
    ctx.beginPath(); ctx.ellipse(-ex, headY + eyOff, rx, ry, -0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, headY + eyOff, rx, ry, 0.35, 0, Math.PI * 2); ctx.fill();
  } else if (skin.cowlEars) {
    ctx.fillStyle = "oklch(0.92 0.02 250)";
    const w = headR * 0.33;
    const h = Math.max(1.2, headR * 0.13);
    ctx.fillRect(-headR * 0.5, headY - 1, w, h);
    ctx.fillRect(headR * 0.17, headY - 1, w, h);
  } else {
    ctx.fillStyle = "oklch(0.10 0 0)";
    const ex = headR * 0.25;
    const r = Math.max(1, headR * 0.11);
    ctx.beginPath(); ctx.arc(-ex, headY, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex, headY, r, 0, Math.PI * 2); ctx.fill();
  }

  // Subtle highlight band down torso center (skip for ghosts)
  if (!ghost) {
    ctx.save();
    ctx.strokeStyle = `color-mix(in oklab, ${bodyColor} 40%, white)`;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.32;
    ctx.beginPath(); ctx.moveTo(0, shoulderY + 3); ctx.lineTo(0, hipY - 3); ctx.stroke();
    ctx.restore();
  }
}
