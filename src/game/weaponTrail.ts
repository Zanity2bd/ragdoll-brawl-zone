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
}

export function createTrail(rgb = "255,235,180", width = 9, decay = 0.18): TrailState {
  return { samples: [], active: 0, rgb, width, decay, limb: "handR" };
}

export function resetTrail(t: TrailState) {
  t.samples.length = 0;
  t.active = 0;
}

/** Arm the trail for the given duration. Sampling will run while active. */
export function armTrail(t: TrailState, seconds: number, opts: { rgb?: string; width?: number; limb?: TrailLimb } = {}) {
  t.active = Math.max(t.active, seconds);
  if (opts.rgb) t.rgb = opts.rgb;
  if (opts.width != null) t.width = opts.width;
  if (opts.limb) t.limb = opts.limb;
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
  // Soft outer glow pass
  for (let pass = 0; pass < 2; pass++) {
    const widthMul = pass === 0 ? 1.8 : 1.0;
    const alphaMul = pass === 0 ? 0.35 : 1.0;
    for (let i = 1; i < n; i++) {
      const a = t.samples[i - 1];
      const b = t.samples[i];
      const u = i / n; // 0..1, newest = ~1
      const lifeAvg = ((a.life / a.maxLife) + (b.life / b.maxLife)) * 0.5;
      const w = Math.max(0.5, t.width * u * lifeAvg * widthMul);
      const alpha = Math.min(1, lifeAvg * 0.9) * alphaMul;
      ctx.lineWidth = w;
      ctx.strokeStyle = `rgba(${t.rgb}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
