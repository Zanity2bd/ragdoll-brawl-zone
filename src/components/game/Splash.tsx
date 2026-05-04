import { useEffect, useRef } from "react";
import { BlkdomBadge } from "@/components/BlkdomBadge";

export function Splash({ onPlay }: { onPlay: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);

    const lowPower =
      window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
      (navigator.hardwareConcurrency || 8) <= 4 ||
      Math.min(window.innerWidth, window.innerHeight) < 700;
    const frameMs = lowPower ? 1000 / 30 : 1000 / 60;

    const W = 1280;
    const H = 720;

    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    const t0 = performance.now();
    let last = t0;

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const cycle = 6;
      const u = (t % cycle) / cycle; // 0..1

      ctx.save();
      ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);

      // ---------- Background: dark tunnel ----------
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "oklch(0.06 0.02 260)");
      bg.addColorStop(0.6, "oklch(0.10 0.03 270)");
      bg.addColorStop(1, "oklch(0.04 0.01 250)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // vanishing point perspective lines
      const vpx = W * 0.55, vpy = H * 0.55;
      ctx.strokeStyle = "oklch(0.22 0.02 260 / 0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(vpx, vpy);
        ctx.lineTo(vpx + Math.cos(a) * 1400, vpy + Math.sin(a) * 1400);
        ctx.stroke();
      }

      // floor tiles (parallax scroll)
      const tileScroll = (t * 220) % 80;
      ctx.strokeStyle = "oklch(0.18 0.02 260 / 0.6)";
      for (let i = -1; i < 20; i++) {
        const x = i * 80 - tileScroll;
        ctx.beginPath();
        ctx.moveTo(x, H * 0.78);
        ctx.lineTo(x - 60, H);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, H * 0.78); ctx.lineTo(W, H * 0.78);
      ctx.stroke();

      // faint scanlines
      ctx.fillStyle = "oklch(0.18 0.02 260 / 0.05)";
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

      // ---------- Train (right side, recedes & approaches) ----------
      const approach = Math.min(1, u / 0.55);
      const recede = u > 0.55 ? (u - 0.55) / 0.45 : 0;
      const trainX = W + 200 - approach * 520 + recede * 700;
      const trainY = H * 0.55;
      drawTrain(ctx, trainX, trainY, t);

      // ---------- Homelander stickman (runs across) ----------
      const runEase = u < 0.45 ? u / 0.45 : 1;
      const lingerEnd = u > 0.65 ? (u - 0.65) / 0.35 : 0;
      const heroX = -120 + runEase * (W * 0.45 + 120) + lingerEnd * (W * 0.55 + 240);
      const heroY = H * 0.72;
      const firing = u > 0.35 && u < 0.62;

      drawHomelander(ctx, heroX, heroY, t, firing);

      // ---------- Laser beams + impact ----------
      if (firing) {
        const intensity = 1 - Math.abs((u - 0.48) / 0.14); // peaks mid
        const eyeY = heroY - 95; // head height
        const eyeXL = heroX - 4;
        const eyeXR = heroX + 4;
        const targetX = trainX + 30;
        const targetY = trainY + 10;

        ctx.save();
        ctx.shadowBlur = 22;
        ctx.shadowColor = "oklch(0.78 0.25 25)";
        ctx.strokeStyle = `oklch(0.85 0.28 25 / ${0.6 + 0.4 * intensity})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(eyeXL, eyeY); ctx.lineTo(targetX - 8, targetY);
        ctx.moveTo(eyeXR, eyeY); ctx.lineTo(targetX + 8, targetY);
        ctx.stroke();

        // outer hot core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `oklch(0.98 0.10 60 / ${0.7 + 0.3 * intensity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(eyeXL, eyeY); ctx.lineTo(targetX - 8, targetY);
        ctx.moveTo(eyeXR, eyeY); ctx.lineTo(targetX + 8, targetY);
        ctx.stroke();
        ctx.restore();

        // sparks at impact
        for (let i = 0; i < 10; i++) {
          const seed = i * 53.7 + Math.floor(t * 12);
          const a = ((seed * 31) % 360) * (Math.PI / 180);
          const r = ((seed * 17) % 60) * intensity;
          const sx = targetX + Math.cos(a) * r;
          const sy = targetY + Math.sin(a) * r;
          ctx.fillStyle = `oklch(0.95 0.18 ${40 + (i % 20)} / ${intensity})`;
          ctx.fillRect(sx, sy, 2, 2);
        }
        // smoke puff
        ctx.fillStyle = `oklch(0.30 0.02 30 / ${0.25 * intensity})`;
        ctx.beginPath();
        ctx.arc(targetX, targetY - 10, 30 + intensity * 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---------- Hero motion streaks ----------
      ctx.fillStyle = "oklch(0.55 0.18 260 / 0.35)";
      for (let i = 0; i < 8; i++) {
        const off = i * 16 + ((t * 200) % 16);
        ctx.fillRect(heroX + off + 8, heroY - 60 + ((i * 7) % 50), 14, 1);
      }

      // ---------- Vignette ----------
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, "oklch(0 0 0 / 0)");
      vg.addColorStop(1, "oklch(0 0 0 / 0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      ctx.restore();
    };

    const loop = (now: number) => {
      if (!running) return;
      if (now - last >= frameMs) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-30 bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* HUD overlay */}
      <div className="relative z-10 flex flex-col items-center justify-between h-full p-6 sm:p-10 text-center">
        <div className="font-mono text-[10px] sm:text-xs tracking-[0.5em] uppercase text-foreground/60 mt-2">
          ◇ Offline 1v1 ◇
        </div>

        <div className="flex flex-col items-center">
          <h1
            className="text-6xl sm:text-8xl md:text-9xl font-black tracking-tight leading-none"
            style={{
              background: "linear-gradient(135deg, oklch(0.92 0.18 60), oklch(0.65 0.28 25))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 0 24px oklch(0.65 0.25 30 / 0.55))",
            }}
          >
            OGUN
          </h1>
          <h2
            className="text-3xl sm:text-5xl md:text-6xl font-black tracking-[0.25em] mt-1"
            style={{ color: "oklch(0.95 0.04 60)" }}
          >
            ARENA
          </h2>
          <div className="mt-3 font-mono text-[10px] sm:text-xs tracking-[0.4em] uppercase text-foreground/50">
            Ogun · war in Yoruba
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 sm:gap-7">
          <button
            onClick={onPlay}
            className="relative px-12 sm:px-16 py-5 min-h-16 rounded-full font-mono uppercase tracking-[0.4em] text-sm sm:text-base text-foreground border-2 transition-transform active:scale-95 sm:hover:scale-[1.03] touch-manipulation"
            style={{
              borderColor: "oklch(0.85 0.18 60)",
              boxShadow: "0 0 40px oklch(0.75 0.22 40 / 0.55), inset 0 0 24px oklch(0.85 0.18 60 / 0.18)",
              background: "oklch(0.10 0.04 40 / 0.5)",
            }}
          >
            ▶ Play
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                animation: "pulse 2s ease-in-out infinite",
                boxShadow: "0 0 0 0 oklch(0.85 0.18 60 / 0.5)",
              }}
            />
          </button>

          <BlkdomBadge size="md" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Scene primitives ---------------- */

function drawTrain(ctx: CanvasRenderingContext2D, x: number, groundY: number, t: number) {
  const w = 360, h = 180;
  // body
  ctx.fillStyle = "oklch(0.16 0.02 260)";
  ctx.fillRect(x, groundY - h, w, h);
  // top trim
  ctx.fillStyle = "oklch(0.22 0.03 260)";
  ctx.fillRect(x, groundY - h, w, 12);
  // windows
  ctx.fillStyle = "oklch(0.55 0.08 240 / 0.7)";
  for (let i = 0; i < 5; i++) ctx.fillRect(x + 30 + i * 60, groundY - h + 28, 40, 36);
  // door panel
  ctx.fillStyle = "oklch(0.10 0.02 260)";
  ctx.fillRect(x + 14, groundY - h + 80, 24, h - 90);
  // wheels
  ctx.fillStyle = "oklch(0.06 0 0)";
  ctx.beginPath(); ctx.arc(x + 60, groundY - 6, 16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 60, groundY - 6, 16, 0, Math.PI * 2); ctx.fill();
  // rail
  ctx.strokeStyle = "oklch(0.30 0.01 260)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 40, groundY); ctx.lineTo(x + w + 40, groundY); ctx.stroke();
  // headlight
  const flick = 0.85 + 0.15 * Math.sin(t * 18);
  ctx.shadowBlur = 26 * flick;
  ctx.shadowColor = "oklch(0.95 0.06 80)";
  ctx.fillStyle = `oklch(0.95 0.05 80 / ${0.7 * flick})`;
  ctx.beginPath(); ctx.arc(x + 6, groundY - h + 44, 12, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // nose marker
  ctx.fillStyle = "oklch(0.75 0.18 25 / 0.7)";
  ctx.fillRect(x - 4, groundY - h + 24, 6, h - 30);
}

function drawHomelander(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  t: number,
  firing: boolean
) {
  // Walk cycle
  const cadence = t * 6;
  const swing = Math.sin(cadence);
  const breath = Math.sin(t * 2) * 0.6;

  const headY = feetY - 110 + breath;
  const shoulderY = feetY - 90;
  const hipY = feetY - 50;

  // CAPE
  const flutter = Math.sin(t * 4) * 6;
  ctx.fillStyle = "oklch(0.45 0.20 25)";
  ctx.shadowBlur = 12; ctx.shadowColor = "oklch(0.45 0.20 25)";
  ctx.beginPath();
  ctx.moveTo(cx - 10, shoulderY);
  ctx.lineTo(cx + 10, shoulderY);
  ctx.quadraticCurveTo(cx + 22 + flutter, hipY + 18, cx + 14 + flutter, feetY - 8);
  ctx.lineTo(cx - 14 - flutter, feetY - 8);
  ctx.quadraticCurveTo(cx - 22 - flutter, hipY + 18, cx - 10, shoulderY);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Body
  ctx.strokeStyle = "oklch(0.42 0.18 260)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  // Head
  ctx.beginPath(); ctx.arc(cx, headY, 13, 0, Math.PI * 2); ctx.stroke();

  // Torso
  ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx, hipY); ctx.stroke();

  // Emblem
  ctx.fillStyle = "oklch(0.95 0.02 250)";
  ctx.fillRect(cx - 3, shoulderY + 6, 6, hipY - shoulderY - 12);

  // Arms
  const armA = swing * 22;
  ctx.beginPath();
  ctx.moveTo(cx, shoulderY); ctx.lineTo(cx - 10, shoulderY + 18 + armA * 0.2);
  ctx.lineTo(cx - 14 - armA * 0.4, shoulderY + 36 + armA * 0.1);
  ctx.moveTo(cx, shoulderY); ctx.lineTo(cx + 10, shoulderY + 18 - armA * 0.2);
  ctx.lineTo(cx + 14 + armA * 0.4, shoulderY + 36 - armA * 0.1);
  ctx.stroke();

  // Legs
  const legA = swing;
  const kneeY = (hipY + feetY) / 2;
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx - 8 - legA * 8, kneeY - Math.abs(legA) * 4);
  ctx.lineTo(cx - 12 - legA * 14, feetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(cx + 8 + legA * 8, kneeY - Math.abs(legA) * 4);
  ctx.lineTo(cx + 12 + legA * 14, feetY);
  ctx.stroke();

  // Glowing eyes
  const eyeBlur = firing ? 18 : 8;
  const eyeColor = firing ? "oklch(0.92 0.28 25)" : "oklch(0.78 0.18 60)";
  ctx.fillStyle = eyeColor;
  ctx.shadowBlur = eyeBlur; ctx.shadowColor = eyeColor;
  ctx.beginPath(); ctx.arc(cx - 4, headY, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4, headY, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}
