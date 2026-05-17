// Procedural colored-skeleton renderer.
//
// Replaces the old bitmap walk-sheet + skin-tint compositing pipeline.
// Each fighter is drawn as a stickman whose bones are colored directly from
// the Skin (body / limb / gloves / boots / head). Because every visual element
// (head, eyes, emblem, cape) is anchored to a joint computed per frame in
// frame-local coordinates, nothing can drift relative to the skeleton —
// there is no separate "skin" layer to slide.
//
// Public API is unchanged so engine.ts requires no edits:
//   - drawWalkFrame(ctx, skin, idx, cx, footY, facing, height)
//   - loadWalkSheet() / isWalkSheetReady()  (no-ops, always ready)
//   - all frame index constants (WALK_LOOP_FRAMES, PUNCH_FRAME_START, …)

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
export const WALK_FOOT_Y = 193;

// No bitmap sheet anymore — keep API stubs so the engine "ready" gate stays true.
export function loadWalkSheet() { /* no-op */ }
export function isWalkSheetReady() { return true; }

// ---- Skeleton constants (frame-local coords; origin = top-left of 144x200) ----
const CX = 72;
const FOOT_Y = 193;
const HIP_Y = 106;
const SHOULDER_Y = 42;
const SHOULDER_DX = 11;
const HIP_DX = 7;
const HEAD_Y = 14;
const HEAD_R = 13;
const NECK_Y = 28;

const UPPER_ARM = 30;
const FOREARM = 30;
const THIGH = 42;
const SHIN = 42;

// ---- Per-frame pose ----
interface Pose {
  // Hip offset from default
  hipDx: number;
  hipDy: number;
  // Torso rotation around hip (rad). Positive = lean forward (toward facing).
  torsoLean: number;
  // Head offset relative to its default position above shoulders.
  headDx: number;
  headDy: number;
  // Limb angles: 0 = straight down, +PI/2 = forward (toward facing),
  // -PI/2 = back, PI = up. Second number is bend at elbow/knee
  // (positive = forward bend).
  armL: [number, number];
  armR: [number, number];
  legL: [number, number];
  legR: [number, number];
  // Optional: per-frame body-rotation around hip (for ragdoll-y poses).
  bodyRot?: number;
}

function makeWalkPose(t: number): Pose {
  // Continuous walk cycle. Right limb = lead in cycle phase 0.
  const TWO_PI = Math.PI * 2;
  const swing = Math.sin(t * TWO_PI);              // -1..1
  const stride = swing * 0.55;
  const liftL = Math.max(0, -swing) * 0.7;          // tuck shin on back swing
  const liftR = Math.max(0, swing) * 0.7;
  const armSwing = swing * 0.5;
  return {
    hipDx: 0,
    hipDy: -Math.abs(Math.cos(t * TWO_PI)) * 1.5,   // gentle bob
    torsoLean: 0.04,
    headDx: 0,
    headDy: 0,
    armL: [armSwing, 0.4],
    armR: [-armSwing, 0.4],
    legL: [stride, liftL * 0.9],
    legR: [-stride, liftR * 0.9],
  };
}

// All non-walk frames (10..29) — hand-authored poses.
const SPECIAL_POSES: Record<number, Pose> = {
  // Punch chamber (10) — wind up: right fist back near hip.
  10: {
    hipDx: 0, hipDy: 0, torsoLean: -0.08,
    headDx: -2, headDy: 0,
    armL: [-0.2, 0.6], armR: [-1.4, 1.6],
    legL: [-0.2, 0.4], legR: [0.25, 0.1],
  },
  // Punch extend forward (11) — right arm thrusts forward at shoulder height.
  11: {
    hipDx: 4, hipDy: -2, torsoLean: 0.18,
    headDx: 6, headDy: -2,
    armL: [-0.6, 0.5], armR: [1.55, 0.0],
    legL: [-0.35, 0.45], legR: [0.3, 0.05],
  },
  // Punch impact (12) — peak extension, body driven forward.
  12: {
    hipDx: 6, hipDy: 0, torsoLean: 0.22,
    headDx: 8, headDy: 0,
    armL: [-0.7, 0.4], armR: [1.65, -0.05],
    legL: [-0.4, 0.5], legR: [0.35, 0.05],
  },
  // Punch follow-through (13) — arm extended, body settling.
  13: {
    hipDx: 4, hipDy: 0, torsoLean: 0.16,
    headDx: 4, headDy: 0,
    armL: [-0.5, 0.5], armR: [1.45, 0.2],
    legL: [-0.3, 0.4], legR: [0.3, 0.1],
  },
  // Punch recovery (14)
  14: {
    hipDx: 0, hipDy: 0, torsoLean: 0.06,
    headDx: 0, headDy: 0,
    armL: [-0.2, 0.5], armR: [0.6, 0.9],
    legL: [-0.2, 0.3], legR: [0.2, 0.2],
  },
  // Jump takeoff (15) — deep crouch, arms swept back.
  15: {
    hipDx: 0, hipDy: 22, torsoLean: 0.18,
    headDx: 0, headDy: 6,
    armL: [-1.2, 1.1], armR: [-1.2, 1.1],
    legL: [-0.6, 1.6], legR: [0.6, 1.6],
  },
  // Jump rising (16) — legs tucked, arms swept down/back.
  16: {
    hipDx: 0, hipDy: -6, torsoLean: -0.05,
    headDx: 0, headDy: -2,
    armL: [-1.6, 0.6], armR: [-1.6, 0.6],
    legL: [-0.3, 1.2], legR: [0.4, 1.0],
  },
  // Jump apex (17) — arms up high, legs slightly tucked.
  17: {
    hipDx: 0, hipDy: -4, torsoLean: 0,
    headDx: 0, headDy: -2,
    armL: [-2.6, 0.4], armR: [-2.6, 0.4],
    legL: [-0.2, 0.8], legR: [0.25, 0.8],
  },
  // Jump landing (18) — knees bent absorbing.
  18: {
    hipDx: 0, hipDy: 18, torsoLean: 0.18,
    headDx: 0, headDy: 4,
    armL: [-0.8, 0.5], armR: [-0.8, 0.5],
    legL: [-0.55, 1.4], legR: [0.55, 1.4],
  },
  // Downed flat (19) — body horizontal lying face-up, head to the back.
  19: {
    hipDx: 0, hipDy: 60, torsoLean: 0,
    headDx: 0, headDy: 0,
    armL: [-1.4, 0.2], armR: [-1.4, 0.2],
    legL: [-1.5, 0.3], legR: [-1.5, 0.3],
    bodyRot: -Math.PI / 2,
  },
  // Get-up A (20) — on hands & knees.
  20: {
    hipDx: 0, hipDy: 30, torsoLean: 0.9,
    headDx: 14, headDy: 12,
    armL: [1.3, 0.2], armR: [1.3, 0.2],
    legL: [-0.9, 1.7], legR: [0.9, 1.7],
  },
  // Get-up B (21) — rising on one knee.
  21: {
    hipDx: 0, hipDy: 14, torsoLean: 0.35,
    headDx: 6, headDy: 4,
    armL: [-0.4, 0.6], armR: [0.4, 0.5],
    legL: [-0.4, 1.6], legR: [0.5, 0.6],
  },
  // Hurt recoil (22) — body bent backward.
  22: {
    hipDx: -2, hipDy: -2, torsoLean: -0.25,
    headDx: -8, headDy: -4,
    armL: [0.5, 0.7], armR: [0.6, 0.7],
    legL: [-0.15, 0.3], legR: [0.2, 0.2],
  },
  // High kick chamber (23) — kick leg lifted bent.
  23: {
    hipDx: -2, hipDy: 4, torsoLean: -0.08,
    headDx: -2, headDy: 0,
    armL: [-0.8, 0.6], armR: [0.4, 1.0],
    legL: [-0.15, 0.25], legR: [1.2, 1.4],
  },
  // High kick extend (24) — right leg fully horizontal forward.
  24: {
    hipDx: -4, hipDy: 2, torsoLean: -0.18,
    headDx: -8, headDy: -2,
    armL: [-1.3, 0.3], armR: [0.9, 0.8],
    legL: [-0.1, 0.2], legR: [Math.PI / 2, -0.05],
  },
  // Knee chamber (25) — deep crouch.
  25: {
    hipDx: 0, hipDy: 36, torsoLean: 0.45,
    headDx: 8, headDy: 8,
    armL: [-0.6, 0.9], armR: [-0.4, 0.9],
    legL: [-0.6, 1.7], legR: [0.6, 1.7],
  },
  // Knee strike (26) — right knee driving up.
  26: {
    hipDx: 0, hipDy: 8, torsoLean: 0.2,
    headDx: 4, headDy: 2,
    armL: [-0.5, 0.7], armR: [-0.5, 0.7],
    legL: [-0.15, 0.4], legR: [1.0, 1.6],
  },
  // Slash windup (27) — coiled, weapon hand back-high.
  27: {
    hipDx: -4, hipDy: 0, torsoLean: -0.18,
    headDx: -6, headDy: -2,
    armL: [-0.4, 0.4], armR: [-1.9, 0.4],
    legL: [-0.3, 0.4], legR: [0.3, 0.2],
  },
  // Slash forward (28) — weapon arm extended forward.
  28: {
    hipDx: 6, hipDy: 0, torsoLean: 0.28,
    headDx: 10, headDy: -2,
    armL: [-0.5, 0.5], armR: [1.5, 0.05],
    legL: [-0.45, 0.5], legR: [0.4, 0.05],
  },
  // Slash recover (29) — weapon hand overhead.
  29: {
    hipDx: 0, hipDy: 0, torsoLean: 0.05,
    headDx: 0, headDy: -4,
    armL: [-0.4, 0.5], armR: [-2.4, 0.3],
    legL: [-0.2, 0.3], legR: [0.2, 0.2],
  },
};

function poseFor(idx: number): Pose {
  if (idx < WALK_LOOP_FRAMES) return makeWalkPose(idx / WALK_LOOP_FRAMES);
  return SPECIAL_POSES[idx] ?? SPECIAL_POSES[14];
}

// ---- Joint solver ----
interface Joints {
  hip: [number, number];
  shoulderL: [number, number];
  shoulderR: [number, number];
  neck: [number, number];
  head: [number, number];
  hipL: [number, number];
  hipR: [number, number];
  elbowL: [number, number]; handL: [number, number];
  elbowR: [number, number]; handR: [number, number];
  kneeL:  [number, number]; footL: [number, number];
  kneeR:  [number, number]; footR: [number, number];
  chestCx: number; chestCy: number;
}

function rot(px: number, py: number, ang: number): [number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [px * c - py * s, px * s + py * c];
}

function solveJoints(p: Pose): Joints {
  const hipX = CX + p.hipDx;
  const hipY = HIP_Y + p.hipDy;
  const lean = p.torsoLean + (p.bodyRot ?? 0);

  // Torso points expressed relative to hip, then rotated by lean.
  const torsoOffsets = {
    shoulderL: [-SHOULDER_DX, SHOULDER_Y - HIP_Y] as [number, number],
    shoulderR: [ SHOULDER_DX, SHOULDER_Y - HIP_Y] as [number, number],
    neck:      [0, NECK_Y - HIP_Y] as [number, number],
    head:      [p.headDx, HEAD_Y - HIP_Y + p.headDy] as [number, number],
  };
  const toWorld = (off: [number, number]): [number, number] => {
    const [rx, ry] = rot(off[0], off[1], lean);
    return [hipX + rx, hipY + ry];
  };
  const shoulderL = toWorld(torsoOffsets.shoulderL);
  const shoulderR = toWorld(torsoOffsets.shoulderR);
  const neck      = toWorld(torsoOffsets.neck);
  const head      = toWorld(torsoOffsets.head);

  // Limb solver: angle measured from straight-down, positive = forward (+x in
  // local "right-facing" space). x = sin(a)*len, y = cos(a)*len.
  const limb = (
    origin: [number, number],
    a1: number, a2: number,
    len1: number, len2: number,
    extraRot: number,
  ): { joint: [number, number]; end: [number, number] } => {
    const A1 = a1 + extraRot;
    const A2 = a1 + a2 + extraRot;
    const joint: [number, number] = [
      origin[0] + Math.sin(A1) * len1,
      origin[1] + Math.cos(A1) * len1,
    ];
    const end: [number, number] = [
      joint[0] + Math.sin(A2) * len2,
      joint[1] + Math.cos(A2) * len2,
    ];
    return { joint, end };
  };

  // Arms hang from shoulders; legs from hip points.
  // Body lean rotates the *shoulder anchor point*; arms also inherit the lean
  // so they don't appear to jut out at a fixed world angle.
  const armLs = limb(shoulderL, p.armL[0], p.armL[1], UPPER_ARM, FOREARM, lean);
  const armRs = limb(shoulderR, p.armR[0], p.armR[1], UPPER_ARM, FOREARM, lean);

  // Hip anchors do NOT inherit torso lean (legs root at the pelvis, not chest).
  const hipL: [number, number] = [hipX - HIP_DX, hipY + 2];
  const hipR: [number, number] = [hipX + HIP_DX, hipY + 2];
  const legLs = limb(hipL, p.legL[0], p.legL[1], THIGH, SHIN, p.bodyRot ?? 0);
  const legRs = limb(hipR, p.legR[0], p.legR[1], THIGH, SHIN, p.bodyRot ?? 0);

  return {
    hip: [hipX, hipY],
    shoulderL, shoulderR, neck, head,
    hipL, hipR,
    elbowL: armLs.joint, handL: armLs.end,
    elbowR: armRs.joint, handR: armRs.end,
    kneeL:  legLs.joint, footL: legLs.end,
    kneeR:  legRs.joint, footR: legRs.end,
    chestCx: (shoulderL[0] + shoulderR[0] + hipX + hipX) / 4,
    chestCy: (shoulderL[1] + shoulderR[1] + hipY + hipY) / 4,
  };
}

// ---- Drawing ----
function drawSegment(
  ctx: CanvasRenderingContext2D,
  a: [number, number], b: [number, number],
  color: string, thickness: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function drawCape(ctx: CanvasRenderingContext2D, skin: Skin, j: Joints) {
  if (!skin.cape) return;
  const ax = j.neck[0];
  const ay = j.neck[1] + 4;
  // Cape trails toward back (opposite facing). In frame-local "right-facing"
  // space, "back" is -x. Use hip-to-neck vector to estimate body orientation.
  const dx = j.hip[0] - j.neck[0];
  const dy = j.hip[1] - j.neck[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  // Perpendicular "back" direction (rotate 90° one way).
  const bx = -8;  // slight back drift
  const by = 0;
  const tipX = ax + nx * 70 + bx;
  const tipY = ay + ny * 70 + by;
  ctx.save();
  ctx.fillStyle = skin.cape;
  ctx.beginPath();
  ctx.moveTo(ax - 14, ay);
  ctx.quadraticCurveTo(ax + bx * 2 - 16, (ay + tipY) / 2 + 6, tipX - 10, tipY);
  ctx.lineTo(tipX + 10, tipY);
  ctx.quadraticCurveTo(ax + bx * 2 + 16, (ay + tipY) / 2 + 6, ax + 14, ay);
  ctx.closePath();
  ctx.fill();
  if (skin.capeAccent) {
    ctx.fillStyle = skin.capeAccent;
    ctx.beginPath();
    ctx.moveTo(ax - 4, ay + 4);
    ctx.lineTo(ax + 4, ay + 4);
    ctx.lineTo(tipX + 3, tipY - 4);
    ctx.lineTo(tipX - 3, tipY - 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, skin: Skin, j: Joints) {
  const [hx, hy] = j.head;
  const r = HEAD_R * 1.15;
  // Mask / head fill
  ctx.fillStyle = skin.head ?? skin.body;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();

  // Skin-tone face (open faces)
  if (skin.skinTone) {
    ctx.fillStyle = skin.skinTone;
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.18, r * 0.78, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair cap
    ctx.fillStyle = skin.head ?? "oklch(0.18 0.02 30)";
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.15, r * 0.92, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // Cowl ears
  if (skin.cowlEars) {
    ctx.fillStyle = skin.head ?? skin.body;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.7, hy - r * 0.45);
    ctx.lineTo(hx - r * 0.4, hy - r * 1.55);
    ctx.lineTo(hx - r * 0.15, hy - r * 0.55);
    ctx.closePath();
    ctx.moveTo(hx + r * 0.7, hy - r * 0.45);
    ctx.lineTo(hx + r * 0.4, hy - r * 1.55);
    ctx.lineTo(hx + r * 0.15, hy - r * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // Beard
  if (skin.beard) {
    ctx.fillStyle = "oklch(0.16 0.01 30)";
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.55, r * 0.65, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spider-Man web pattern (3 thin radial strokes from crown)
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

  // Eyes
  drawEyes(ctx, skin, hx, hy, r);

  // Crisp rim outline
  ctx.strokeStyle = "oklch(0.10 0.02 260 / 0.6)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  hx: number, hy: number, r: number,
) {
  const ey = hy - r * 0.08;
  const ex = r * 0.38;

  if (skin.id === "spiderman") {
    const lensCx = r * 0.42;
    const lensCy = ey - r * 0.05;
    [-1, 1].forEach((s) => {
      ctx.fillStyle = "oklch(0.10 0.02 260)";
      ctx.beginPath();
      ctx.ellipse(hx + s * lensCx, lensCy, r * 0.42, r * 0.30, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.97 0.01 220)";
      ctx.beginPath();
      ctx.ellipse(hx + s * lensCx, lensCy, r * 0.34, r * 0.24, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.78 0.02 220)";
      ctx.beginPath();
      ctx.ellipse(
        hx + s * lensCx + s * r * 0.05,
        lensCy + r * 0.05,
        r * 0.10, r * 0.06,
        s * 0.35, 0, Math.PI * 2,
      );
      ctx.fill();
    });
    return;
  }

  if (skin.id === "ironman") {
    ctx.fillStyle = "oklch(0.92 0.18 200)";
    [-1, 1].forEach(s => { ctx.fillRect(hx + s * ex - 4, ey - 1, 6, 3); });
    return;
  }

  if (skin.id === "batman") {
    ctx.fillStyle = "oklch(0.95 0.04 100)";
    [-1, 1].forEach(s => { ctx.fillRect(hx + s * ex - 4, ey - 1, 6, 3); });
    return;
  }

  if (skin.glowingEyes) {
    ctx.fillStyle = skin.glowingEyes;
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    return;
  }

  if (skin.skinTone) {
    ctx.fillStyle = "oklch(0.16 0.02 260)";
    [-1, 1].forEach(s => {
      ctx.beginPath();
      ctx.arc(hx + s * ex, ey, 1.7, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawEmblem(
  ctx: CanvasRenderingContext2D,
  skin: Skin, cx: number, cy: number, r: number,
) {
  if (!skin.emblem) return;
  ctx.save();
  ctx.fillStyle = skin.emblem.color;
  ctx.strokeStyle = skin.emblem.color;
  ctx.lineWidth = 1.5;
  switch (skin.emblem.shape) {
    case "spider": {
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.12, r * 0.26, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.26, r * 0.17, r * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      [-0.95, -0.5, -0.1, 0.3].forEach((ang) => {
        [-1, 1].forEach((s) => {
          const x1 = cx, y1 = cy + ang * r * 0.4;
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

function drawTorsoSlab(
  ctx: CanvasRenderingContext2D, skin: Skin, j: Joints,
) {
  // Filled torso between shoulders and hips so the body reads as a body,
  // not two crossing lines. Color = skin.body.
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.moveTo(j.shoulderL[0], j.shoulderL[1]);
  ctx.lineTo(j.shoulderR[0], j.shoulderR[1]);
  ctx.lineTo(j.hipR[0], j.hipR[1]);
  ctx.lineTo(j.hipL[0], j.hipL[1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw frame `idx` of the procedural stickman, anchored at footY.
 * Always returns true (no asset load gate).
 */
export function drawWalkFrame(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  idx: number,
  cx: number,
  footY: number,
  facing: 1 | -1,
  height: number,
): boolean {
  const i = ((idx % WALK_FRAME_COUNT) + WALK_FRAME_COUNT) % WALK_FRAME_COUNT;
  const pose = poseFor(i);
  const j = solveJoints(pose);

  const scale = height / WALK_FRAME_H;
  const limbColor = skin.limb ?? skin.body;
  const gloveColor = skin.gloves ?? limbColor;
  const bootColor = skin.boots ?? limbColor;
  const limbW = skin.thickBody ? 7.5 : 6;
  const torsoBoost = skin.thickBody ? 1.15 : 1;

  ctx.save();
  ctx.translate(cx, footY);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  // Translate so frame coords (0..144, 0..200) draw with origin at center-bottom.
  ctx.translate(-CX, -FOOT_Y);

  // ---- Cape (behind everything) ----
  drawCape(ctx, skin, j);

  // ---- Legs (drawn first so torso sits on top of upper-thigh) ----
  drawSegment(ctx, j.hipL, j.kneeL, limbColor, limbW);
  drawSegment(ctx, j.kneeL, j.footL, limbColor, limbW);
  drawSegment(ctx, j.hipR, j.kneeR, limbColor, limbW);
  drawSegment(ctx, j.kneeR, j.footR, limbColor, limbW);

  // Boots
  ctx.fillStyle = bootColor;
  ctx.beginPath();
  ctx.ellipse(j.footL[0], j.footL[1] + 1, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(j.footR[0], j.footR[1] + 1, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Torso ----
  drawTorsoSlab(ctx, skin, j);
  // Thin neck line
  drawSegment(ctx, j.neck, [(j.shoulderL[0] + j.shoulderR[0]) / 2, (j.shoulderL[1] + j.shoulderR[1]) / 2],
              skin.head ?? skin.body, 4 * torsoBoost);

  // ---- Emblem (chest center) ----
  if (skin.emblem) {
    const cxE = (j.shoulderL[0] + j.shoulderR[0] + j.hipL[0] + j.hipR[0]) / 4;
    const cyE = (j.shoulderL[1] + j.shoulderR[1] + j.hipL[1] + j.hipR[1]) / 4;
    drawEmblem(ctx, skin, cxE, cyE, 20);
  }

  // ---- Arms ----
  drawSegment(ctx, j.shoulderL, j.elbowL, limbColor, limbW);
  drawSegment(ctx, j.elbowL, j.handL, limbColor, limbW);
  drawSegment(ctx, j.shoulderR, j.elbowR, limbColor, limbW);
  drawSegment(ctx, j.elbowR, j.handR, limbColor, limbW);

  // Gloves (hand fists)
  ctx.fillStyle = gloveColor;
  ctx.beginPath();
  ctx.arc(j.handL[0], j.handL[1], 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(j.handR[0], j.handR[1], 4.5, 0, Math.PI * 2);
  ctx.fill();

  // ---- Head (on top) ----
  drawHead(ctx, skin, j);

  ctx.restore();
  return true;
}
