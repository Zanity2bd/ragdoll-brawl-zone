import { createFileRoute, Link } from "@tanstack/react-router";
import { BlkdomBadge } from "@/components/BlkdomBadge";
import { getSkin } from "@/game/skins";
import { drawWalkFrame, drawWalkFrameSilhouette } from "@/game/walkSprite";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "OgunArena — Offline 1v1 Stickman Fighting Game" },
      {
        name: "description",
        content:
          "OgunArena (Yoruba: Ogun = war). Offline 1v1 stickman fighting arena for two players on one device. A Blkdom production.",
      },
    ],
  }),
});

function Landing() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* === FLOODLIT ARENA BACKDROP === */}
      {/* Deep stage black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 38%, oklch(0.18 0.02 60) 0%, oklch(0.08 0.01 30) 45%, oklch(0.03 0.005 30) 100%)",
        }}
      />

      {/* Twin floodlight cones from above */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[70%] pointer-events-none mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 18% 60% at 30% -8%, color-mix(in oklab, var(--hero-glow) 38%, transparent) 0%, transparent 70%), radial-gradient(ellipse 18% 60% at 70% -8%, color-mix(in oklab, var(--villain-glow) 38%, transparent) 0%, transparent 70%)",
          filter: "blur(6px)",
          opacity: 0.85,
        }}
      />

      {/* Stage floor — warm spotlit ground */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 80% at 50% 100%, color-mix(in oklab, var(--gold) 18%, transparent) 0%, transparent 70%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Dust / ember motes */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="absolute rounded-full ember"
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              width: e.s,
              height: e.s,
              background: e.c,
              boxShadow: `0 0 ${e.s * 4}px ${e.c}`,
              animationDelay: `${e.d}s`,
              animationDuration: `${e.dur}s`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {/* Halftone film grain */}
      <div className="absolute inset-0 halftone opacity-25 pointer-events-none" />

      {/* Edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, oklch(0.02 0 0 / 0.9) 100%)",
        }}
      />

      {/* === CONTENT === */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top,0px),14px)] pb-2">
          <span className="font-display text-[10px] tracking-[0.45em] text-foreground/45">
            BLKDOM
          </span>
          <span className="font-display text-[10px] tracking-[0.45em] text-foreground/35">
            EST · MMXXVI
          </span>
        </header>

        {/* Hero monolith */}
        <section className="relative flex flex-1 flex-col items-center justify-center px-5">
          {/* Silhouette face-off behind wordmark */}
          <SilhouetteFaceoff />

          {/* Yoruba war kanji-style mark */}
          <div
            className="relative mb-4 font-display text-[11px] tracking-[0.55em]"
            style={{ color: "color-mix(in oklab, var(--gold) 80%, transparent)" }}
          >
            OGUN / WAR
          </div>

          {/* OGUN slab */}
          <h1
            className="relative font-display leading-[0.82] text-center"
            style={{
              fontSize: "clamp(72px, 22vw, 108px)",
              letterSpacing: "0",
              color: "var(--paper)",
              textShadow:
                "0 2px 0 oklch(0.02 0 0), 0 14px 30px oklch(0.02 0 0 / 0.9)",
            }}
          >
            <span className="og-wordmark">OGUN</span>
          </h1>

          {/* ARENA underline */}
          <div className="relative mt-2 flex items-center gap-3">
            <span
              className="h-px w-10"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--gold))",
              }}
            />
            <span
              className="font-display text-[15px] tracking-[0.65em]"
              style={{
                color: "var(--paper)",
                WebkitTextStroke: "0.5px color-mix(in oklab, var(--gold) 70%, transparent)",
              }}
            >
              ARENA
            </span>
            <span
              className="h-px w-10"
              style={{
                background:
                  "linear-gradient(270deg, transparent, var(--gold))",
              }}
            />
          </div>

          {/* Tagline */}
          <p className="mt-5 text-center font-display text-[10px] tracking-[0.42em] text-foreground/55 max-w-[280px]">
            TWO FIGHTERS / ONE SCREEN / NO MERCY
          </p>
        </section>

        {/* CTA + secondary */}
        <section className="relative px-5 pb-[max(env(safe-area-inset-bottom,0px),20px)]">
          <Link
            to="/play"
            className="group relative mx-auto flex h-14 w-full max-w-[340px] items-center justify-center overflow-hidden font-display text-[15px] tracking-[0.4em] uppercase active:scale-[0.985] transition-transform"
            style={{
              background:
                "linear-gradient(180deg, var(--paper) 0%, color-mix(in oklab, var(--paper) 88%, var(--gold) 12%) 100%)",
              color: "oklch(0.08 0.01 30)",
              clipPath:
                "polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)",
              boxShadow:
                "0 0 0 2px oklch(0.04 0 0), 0 0 0 4px color-mix(in oklab, var(--gold) 80%, transparent), 0 20px 50px -12px color-mix(in oklab, var(--gold) 55%, transparent)",
            }}
          >
            <span className="cta-pulse absolute inset-0 pointer-events-none" />
            <span className="relative font-black">FIGHT&nbsp;&nbsp;NOW</span>
          </Link>

          {/* Bottom tab row */}
          <nav className="mx-auto mt-5 grid max-w-[340px] grid-cols-3 gap-2">
            <TabChip to="/play" label="Fighters" hint="9 unlocked" />
            <TabChip to="/play" label="Arenas" hint="13 maps" />
            <TabChip to="/play" label="Settings" hint="Audio / Pads" />
          </nav>

          {/* Footer credits */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <BlkdomBadge />
            <span className="font-display text-[9px] tracking-[0.45em] text-foreground/25">
              v1 / OFFLINE / NO ACCOUNT
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

/* === Sub-components === */

function TabChip({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="group relative flex min-h-14 flex-col items-center justify-center rounded-md border px-2 py-2 backdrop-blur-sm transition-colors active:scale-[0.97]"
      style={{
        borderColor: "color-mix(in oklab, var(--paper) 18%, transparent)",
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--paper) 6%, transparent), color-mix(in oklab, var(--background) 70%, transparent))",
      }}
    >
      <span
        className="font-display text-[11px] tracking-[0.3em] uppercase"
        style={{ color: "var(--paper)" }}
      >
        {label}
      </span>
      <span className="mt-0.5 font-display text-[8px] tracking-[0.3em] text-foreground/40">
        {hint}
      </span>
    </Link>
  );
}

function SilhouetteFaceoff() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const p1 = getSkin("spiderman");
    const p2 = getSkin("homelander");
    const W = 720;
    const H = 360;

    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = (now: number) => {
      if (now - last >= 1000 / 24) {
        last = now;
        const t = (now - t0) / 1000;
        const frame = Math.floor(t * 8) % 10;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const feetY = H - 18;
        const fighterH = 330;
        const drawFighter = (skin: typeof p1, x: number, facing: 1 | -1) => {
          drawWalkFrameSilhouette(ctx, skin, frame, x, feetY, facing, fighterH, {
            alpha: 0.32,
            blur: 14,
            shadowColor: skin.glow,
            offset: 2.5,
          });
          ctx.globalAlpha = 0.48;
          drawWalkFrame(ctx, skin, frame, x, feetY, facing, fighterH);
          ctx.globalAlpha = 1;
        };

        drawFighter(p1, W * 0.27, 1);
        drawFighter(p2, W * 0.73, -1);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-[10%] bottom-[15%] pointer-events-none"
      style={{ opacity: 0.52 }}
    >
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
/* Static ember positions (deterministic for SSR) */
const EMBERS = [
  { x: 12, y: 18, s: 2, c: "oklch(0.85 0.18 80)", d: 0, dur: 6 },
  { x: 88, y: 22, s: 2, c: "oklch(0.85 0.18 80)", d: 1.2, dur: 7 },
  { x: 22, y: 70, s: 3, c: "oklch(0.78 0.20 40)", d: 2.4, dur: 5.5 },
  { x: 78, y: 65, s: 2, c: "oklch(0.85 0.18 80)", d: 0.6, dur: 6.5 },
  { x: 50, y: 12, s: 2, c: "oklch(0.85 0.18 80)", d: 3.1, dur: 6 },
  { x: 35, y: 88, s: 2, c: "oklch(0.78 0.20 40)", d: 1.8, dur: 7.2 },
  { x: 65, y: 92, s: 3, c: "oklch(0.78 0.20 40)", d: 2.9, dur: 5.8 },
  { x: 8, y: 50, s: 2, c: "oklch(0.85 0.18 80)", d: 4.1, dur: 6.4 },
  { x: 92, y: 48, s: 2, c: "oklch(0.85 0.18 80)", d: 3.5, dur: 7 },
];
