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
    ctx.save();
    ctx.globalCompositeOperation = f.blend;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.scale(f.facing, 1);
    const s = f.size * 2;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}
