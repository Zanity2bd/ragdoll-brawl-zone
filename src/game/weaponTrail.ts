// Generic per-frame motion-trail ribbon for fighter strikes.
// Samples a world-space point each tick (typically the lead hand or weapon
// tip), keeps a short ring of recent samples, and renders a tapered, glowing
// polyline that fades out. Pure presentation — never affects hit logic.

export interface TrailSample {
  x: number;
  y: number;
  /** seconds remaining before this sample is culled */
  life: number;
  /** initial life — used for alpha curve */
  maxLife: number;
}

export type TrailLimb = "handL" | "handR" | "footL" | "footR";
export type TrailStyle = "strike" | "blade" | "speed" | "energy";

export interface TrailState {
  samples: TrailSample[];
  /** if positive, trail is actively being drawn from this point */
  active: number; // remaining "armed" seconds — sampling stops when 0
  /** Tint, e.g. "255,255,255" RGB triplet */
  rgb: string;
  /** Peak ribbon width in px */
  width: number;
  /** How long each sample lives (sec) */
  decay: number;
  /** Which pose limb to sample */
  limb: TrailLimb;
  /** Shape language for the ribbon. Purely visual. */
  style: TrailStyle;
  /** Bright inner/accent tint, e.g. "255,255,255" RGB triplet */
  accentRgb: string;
  /** Tiny edge flecks for metal/heavy contact trails. */
  spark: boolean;
}

export function createTrail(rgb = "255,235,180", width = 9, decay = 0.18): TrailState {
  return {
    samples: [],
    active: 0,
    rgb,
    width,
    decay,
    limb: "handR",
    style: "strike",
    accentRgb: "255,255,255",
    spark: false,
  };
}

export function resetTrail(t: TrailState) {
  t.samples.length = 0;
  t.active = 0;
}

/** Arm the trail for the given duration. Sampling will run while active. */
export function armTrail(
  t: TrailState,
  seconds: number,
  opts: {
    rgb?: string;
    width?: number;
    limb?: TrailLimb;
    style?: TrailStyle;
    accentRgb?: string;
    spark?: boolean;
    decay?: number;
  } = {},
) {
  t.active = Math.max(t.active, seconds);
  if (opts.rgb) t.rgb = opts.rgb;
  if (opts.width != null) t.width = opts.width;
  if (opts.limb) t.limb = opts.limb;
  if (opts.style) t.style = opts.style;
  if (opts.accentRgb) t.accentRgb = opts.accentRgb;
  if (opts.spark != null) t.spark = opts.spark;
  if (opts.decay != null) t.decay = opts.decay;
}

/**
 * Add a sample if the trail is armed. Skip duplicate-position samples to keep
 * the ribbon clean when the limb is momentarily still.
 */
export function sampleTrail(t: TrailState, x: number, y: number) {
  if (t.active <= 0) return;
  const last = t.samples[t.samples.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < 1.5) return;
  t.samples.push({ x, y, life: t.decay, maxLife: t.decay });
  // Hard cap to keep memory bounded
  if (t.samples.length > 18) t.samples.shift();
}

/** Decay sample lifetimes and the active timer. Call once per real frame. */
export function tickTrail(t: TrailState, dt: number) {
  if (t.active > 0) t.active = Math.max(0, t.active - dt);
  for (let i = t.samples.length - 1; i >= 0; i--) {
    t.samples[i].life -= dt;
    if (t.samples[i].life <= 0) t.samples.splice(i, 1);
  }
}

/**
 * Draw a tapered, additive ribbon through the samples. Newest sample is
 * brightest; old samples fade to transparent. Cheap on mobile — single
 * stroke pass, no path complexity.
 */
export function drawTrail(ctx: CanvasRenderingContext2D, t: TrailState) {
  const n = t.samples.length;
  if (n < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const isSpeed = t.style === "speed";
  const isBlade = t.style === "blade";
  const isEnergy = t.style === "energy";
  const outerMul = isSpeed ? 2.4 : isEnergy ? 2.15 : isBlade ? 1.65 : 1.85;
  const coreMul = isBlade ? 0.36 : isSpeed ? 0.52 : 0.46;

  // Soft outside, colored body, bright core. The shape difference makes attacks
  // read by motion silhouette before the player notices the color.
  for (let pass = 0; pass < 3; pass++) {
    const widthMul = pass === 0 ? outerMul : pass === 1 ? 1.0 : coreMul;
    const alphaMul = pass === 0 ? 0.28 : pass === 1 ? 0.78 : 0.95;
    const color = pass === 2 ? t.accentRgb : t.rgb;
    for (let i = 1; i < n; i++) {
      const a = t.samples[i - 1];
      const b = t.samples[i];
      const u = i / n; // 0..1, newest = ~1
      const lifeAvg = ((a.life / a.maxLife) + (b.life / b.maxLife)) * 0.5;
      const taper = isBlade ? Math.pow(u, 1.35) : isSpeed ? Math.pow(u, 0.75) : u;
      const w = Math.max(pass === 2 ? 0.8 : 0.5, t.width * taper * lifeAvg * widthMul);
      const alpha = Math.min(1, lifeAvg * (isSpeed ? 0.78 : 0.92)) * alphaMul;
      ctx.lineWidth = w;
      ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  const head = t.samples[n - 1];
  const prev = t.samples[n - 2];
  const dx = head.x - prev.x;
  const dy = head.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLife = Math.max(0, Math.min(1, head.life / head.maxLife));

  // Newest-point flare gives each strike a crisp leading edge.
  ctx.lineWidth = Math.max(1, t.width * (isBlade ? 0.55 : 0.35));
  ctx.strokeStyle = `rgba(${t.accentRgb}, ${(0.82 * headLife).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(head.x - ux * t.width * 0.25, head.y - uy * t.width * 0.25);
  ctx.lineTo(head.x + ux * t.width * (isSpeed ? 1.45 : 0.8), head.y + uy * t.width * (isSpeed ? 1.45 : 0.8));
  ctx.stroke();

  if (t.spark || isBlade) {
    ctx.lineCap = "butt";
    for (let i = Math.max(1, n - 8); i < n; i += 2) {
      const a = t.samples[i - 1];
      const b = t.samples[i];
      const lifeAvg = ((a.life / a.maxLife) + (b.life / b.maxLife)) * 0.5;
      const sx = (a.x + b.x) * 0.5;
      const sy = (a.y + b.y) * 0.5;
      const sdx = b.x - a.x;
      const sdy = b.y - a.y;
      const sl = Math.hypot(sdx, sdy) || 1;
      const nx = -sdy / sl;
      const ny = sdx / sl;
      const side = i % 4 === 0 ? 1 : -1;
      const sparkLen = (5 + (i % 3) * 3) * lifeAvg;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${t.accentRgb}, ${(0.45 * lifeAvg).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx + nx * side * 2, sy + ny * side * 2);
      ctx.lineTo(sx + nx * side * sparkLen, sy + ny * side * sparkLen);
      ctx.stroke();
    }
  }

  ctx.restore();
}
