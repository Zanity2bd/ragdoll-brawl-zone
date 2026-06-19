// Sprite-based FX overlays for character special attacks.
// Each registered special declares timed overlay events (charge ring during
// windup, slash arc + impact star on contact, shockwave on ground smash).
// Rendered on top of the existing fighter draw — zero changes to hit logic.

import impactStarUrl from "@/assets/fx/impact-star.png";
import chargeRingUrl from "@/assets/fx/charge-ring.png";
import slashArcUrl from "@/assets/fx/slash-arc.png";
import shockRingUrl from "@/assets/fx/shockwave-ring.png";

export type FxKind = "impactStar" | "chargeRing" | "slashArc" | "shockRing";

const URLS: Record<FxKind, string> = {
  impactStar: impactStarUrl,
  chargeRing: chargeRingUrl,
  slashArc: slashArcUrl,
  shockRing: shockRingUrl,
};

const imgs: Partial<Record<FxKind, HTMLImageElement>> = {};
const ready: Partial<Record<FxKind, boolean>> = {};

export function loadAttackFx() {
  (Object.keys(URLS) as FxKind[]).forEach((k) => {
    if (imgs[k]) return;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { ready[k] = true; };
    im.src = URLS[k];
    imgs[k] = im;
  });
}

export function isFxReady(k: FxKind) { return !!ready[k]; }

export interface ActiveFx {
  kind: FxKind;
  x: number; y: number;
  size: number;        // base radius in px
  life: number;        // remaining seconds
  maxLife: number;
  rot: number;         // radians
  spin: number;        // radians/sec
  grow: number;        // size delta per second
  facing: 1 | -1;
  blend: GlobalCompositeOperation;
}

export function spawnFx(
  pool: ActiveFx[],
  kind: FxKind,
  x: number, y: number,
  opts: Partial<Omit<ActiveFx, "kind" | "x" | "y" | "life" | "maxLife">> & { life?: number } = {},
) {
  const life = opts.life ?? 0.35;
  pool.push({
    kind, x, y,
    size: opts.size ?? 36,
    life, maxLife: life,
    rot: opts.rot ?? 0,
    spin: opts.spin ?? 0,
    grow: opts.grow ?? 0,
    facing: opts.facing ?? 1,
    blend: opts.blend ?? "lighter",
  });
}

export function tickFx(pool: ActiveFx[], dt: number) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const f = pool[i];
    f.life -= dt;
    f.rot += f.spin * dt;
    f.size += f.grow * dt;
    if (f.life <= 0) pool.splice(i, 1);
  }
}

export function drawFxPool(ctx: CanvasRenderingContext2D, pool: ActiveFx[]) {
  for (const f of pool) {
    const img = imgs[f.kind];
    if (!img || !ready[f.kind]) continue;
    const u = f.life / f.maxLife;             // 1 → 0
    // Alpha curve: pop in fast, fade out
    const a = u > 0.85 ? (1 - u) / 0.15 : u / 0.85;
    const maxAlpha =
      f.kind === "impactStar" ? 0.44
      : f.kind === "shockRing" ? 0.30
      : f.kind === "chargeRing" ? 0.42
      : 0.55;
    ctx.save();
    ctx.globalCompositeOperation =
      f.kind === "impactStar" || f.kind === "shockRing" ? "screen" : f.blend;
    ctx.globalAlpha = Math.max(0, Math.min(1, a)) * maxAlpha;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.scale(f.facing, 1);
    const s = f.size * 2;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    drawProceduralFxCore(ctx, f.kind, f.size, u);
    ctx.restore();
  }
}

function drawProceduralFxCore(ctx: CanvasRenderingContext2D, kind: FxKind, size: number, u: number) {
  const baseAlpha = ctx.globalAlpha;
  const fade = Math.max(0, Math.min(1, u));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "impactStar") {
    const pop = Math.sin(Math.PI * fade);
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const inner = size * (0.14 + (i % 2) * 0.08);
      const outer = size * (0.58 + pop * 0.38 + (i % 3) * 0.04);
      ctx.globalAlpha = baseAlpha * (i % 2 === 0 ? 0.95 : 0.58) * fade;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,225,135,0.78)";
      ctx.lineWidth = i % 2 === 0 ? 2.3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = baseAlpha * 0.92 * fade;
    ctx.fillStyle = "rgba(255,255,245,0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, size * 0.09), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "shockRing") {
    const ring = size * (1.02 + (1 - fade) * 0.12);
    ctx.globalAlpha = baseAlpha * 0.85 * fade;
    ctx.strokeStyle = "rgba(255,245,210,0.75)";
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha * 0.35 * fade;
    ctx.strokeStyle = "rgba(150,220,255,0.55)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, ring * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "slashArc") {
    ctx.globalAlpha = baseAlpha * 0.88 * fade;
    ctx.strokeStyle = "rgba(255,255,250,0.84)";
    ctx.lineWidth = Math.max(1.4, size * 0.045);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.74, -0.7, 0.9);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha * 0.42 * fade;
    ctx.strokeStyle = "rgba(255,215,125,0.62)";
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.52, -0.55, 0.75);
    ctx.stroke();
  } else if (kind === "chargeRing") {
    const r = size * 0.72;
    ctx.globalAlpha = baseAlpha * 0.72 * fade;
    ctx.strokeStyle = "rgba(255,255,245,0.6)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,245,180,0.8)";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.globalAlpha = baseAlpha * 0.36 * fade;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = baseAlpha;
}
