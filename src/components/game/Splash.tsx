import { useEffect, useRef } from "react";
import { BlkdomBadge } from "@/components/BlkdomBadge";
import { getSkin } from "@/game/skins";
import { drawWalkFrame, drawWalkFrameSilhouette } from "@/game/walkSprite";
import { Play } from "lucide-react";

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
    const p1 = getSkin("spiderman");
    const p2 = getSkin("homelander");

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

      const frame = Math.floor(t * 8) % 10;
      const feetY = H * 0.82;
      const fighterH = 275;
      const drawPosterFighter = (skin: typeof p1, x: number, facing: 1 | -1) => {
        ctx.fillStyle = "oklch(0 0 0 / 0.36)";
        ctx.beginPath();
        ctx.ellipse(x, feetY + 8, 46, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        drawWalkFrameSilhouette(ctx, skin, frame, x, feetY, facing, fighterH, {
          alpha: 0.42,
          blur: 10,
          shadowColor: skin.glow,
          offset: 2,
        });
        drawWalkFrame(ctx, skin, frame, x, feetY, facing, fighterH);
      };
      drawPosterFighter(p1, W * 0.34, 1);
      drawPosterFighter(p2, W * 0.66, -1);

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
          Offline 1v1
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
            Offline Arena
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 sm:gap-7">
          <button
            onClick={onPlay}
            className="relative inline-flex items-center justify-center gap-3 px-10 sm:px-14 py-5 min-h-16 rounded-md font-mono uppercase tracking-[0.32em] text-sm sm:text-base text-foreground border-2 transition-transform active:scale-95 sm:hover:scale-[1.03] touch-manipulation"
            style={{
              borderColor: "oklch(0.85 0.18 60)",
              boxShadow: "0 0 40px oklch(0.75 0.22 40 / 0.55), inset 0 0 24px oklch(0.85 0.18 60 / 0.18)",
              background: "oklch(0.10 0.04 40 / 0.5)",
            }}
          >
            <Play size={18} fill="currentColor" strokeWidth={2.2} />
            Play
            <span
              className="pointer-events-none absolute inset-0 rounded-md"
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
