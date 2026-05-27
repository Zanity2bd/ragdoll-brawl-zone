import { createFileRoute, Link } from "@tanstack/react-router";
import { BlkdomBadge } from "@/components/BlkdomBadge";

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
      {/* Split-screen face-off backdrop (vertical on mobile, diagonal on larger) */}
      <div className="absolute inset-0">
        {/* Hero half */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--hero) 22%, var(--background)) 0%, var(--background) 55%)",
            clipPath: "polygon(0 0, 100% 0, 100% 42%, 0 58%)",
          }}
        />
        {/* Villain half */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, color-mix(in oklab, var(--villain) 26%, var(--background)) 0%, var(--background) 55%)",
            clipPath: "polygon(0 58%, 100% 42%, 100% 100%, 0 100%)",
          }}
        />
        {/* Halftone overlay */}
        <div className="absolute inset-0 halftone opacity-60" />
        {/* Center seam — jagged comic slash */}
        <div
          className="absolute left-0 right-0 h-[2px]"
          style={{
            top: "50%",
            background:
              "linear-gradient(90deg, transparent, var(--gold) 12%, var(--paper) 50%, var(--gold) 88%, transparent)",
            boxShadow: "0 0 24px color-mix(in oklab, var(--gold) 70%, transparent)",
            transform: "rotate(-2.2deg)",
          }}
        />
        {/* Edge vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, oklch(0.06 0.02 25 / 0.85) 100%)",
          }}
        />
      </div>

      {/* Top brand bar */}
      <header className="relative z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),12px)] pb-2">
        <div className="font-display text-[11px] tracking-[0.35em] text-foreground/70">
          OGUN<span className="text-[color:var(--gold)]">/</span>ARENA
        </div>
        <div className="font-display text-[10px] tracking-[0.4em] text-foreground/45">
          v1 · OFFLINE
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-md flex-col px-5 pb-10 pt-2">
        {/* HERO panel */}
        <FighterPanel side="hero" />

        {/* Title slab */}
        <TitleSlab />

        {/* VILLAIN panel */}
        <FighterPanel side="villain" />

        {/* CTA */}
        <div className="mt-8 flex flex-col items-center">
          <Link
            to="/play"
            className="group relative inline-flex items-center justify-center min-h-14 px-10 font-display text-[15px] tracking-[0.3em] uppercase text-background transition-transform active:scale-[0.97]"
            style={{
              background: "var(--paper)",
              clipPath:
                "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
              boxShadow:
                "0 0 0 2px var(--background), 0 0 0 4px var(--gold), 0 14px 40px -10px color-mix(in oklab, var(--gold) 55%, transparent)",
            }}
          >
            <span className="relative">FIGHT NOW</span>
          </Link>
          <div className="mt-3 font-display text-[10px] tracking-[0.5em] text-foreground/40">
            ▸ TWO PLAYERS · ONE SCREEN
          </div>
        </div>

        {/* Mobile hint */}
        <div className="mt-8 mx-auto relative inline-flex hazard p-[3px]">
          <span
            className="px-3 py-1.5 font-display text-[9px] tracking-[0.35em] uppercase"
            style={{ background: "var(--background)", color: "var(--paper)" }}
          >
            on-screen pads on mobile
          </span>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <BlkdomBadge />
          <div className="font-display text-[9px] tracking-[0.4em] text-foreground/30">
            OGUN · WAR IN YORUBA
          </div>
        </div>
      </div>
    </main>
  );
}

function TitleSlab() {
  return (
    <div className="relative my-3 flex flex-col items-center">
      {/* Burst */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-40 w-[110%]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0 18deg, color-mix(in oklab, var(--gold) 35%, transparent) 18deg 22deg, transparent 22deg 40deg, color-mix(in oklab, var(--gold) 25%, transparent) 40deg 44deg, transparent 44deg)",
          filter: "blur(1px)",
          opacity: 0.6,
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        className="relative font-display text-[68px] leading-[0.82] text-foreground"
        style={{
          letterSpacing: "-0.04em",
          textShadow:
            "0 0 0 var(--background), 3px 3px 0 color-mix(in oklab, var(--villain) 90%, transparent), -2px -2px 0 color-mix(in oklab, var(--hero) 90%, transparent)",
        }}
      >
        OGUN
      </div>
      <div
        className="relative font-display text-[28px] tracking-[0.45em] mt-1"
        style={{
          color: "var(--paper)",
          WebkitTextStroke: "1px var(--gold)",
        }}
      >
        ARENA
      </div>
    </div>
  );
}

function FighterPanel({ side }: { side: "hero" | "villain" }) {
  const isHero = side === "hero";
  const tint = isHero ? "var(--hero)" : "var(--villain)";
  const glow = isHero ? "var(--hero-glow)" : "var(--villain-glow)";
  const name = isHero ? "HERO" : "VILLAIN";
  const tag = isHero ? "PLAYER 01" : "PLAYER 02";
  const rows: [string, string][] = isHero
    ? [
        ["MOVE", "A · D"],
        ["JUMP", "W"],
        ["BLAST", "F"],
        ["WARP", "G + TAP"],
      ]
    : [
        ["MOVE", "← →"],
        ["JUMP", "↑"],
        ["BLAST", "K"],
        ["WARP", "L + TAP"],
      ];

  return (
    <div
      className={`relative ${isHero ? "self-start" : "self-end"} w-[88%]`}
      style={{
        transform: isHero ? "rotate(-1deg)" : "rotate(1deg)",
      }}
    >
      <div
        className="relative p-4 backdrop-blur-sm"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, " +
            tint +
            " 14%, var(--background)) 0%, color-mix(in oklab, var(--background) 92%, " +
            tint +
            " 8%) 100%)",
          clipPath: isHero
            ? "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)"
            : "polygon(0 0, 100% 0, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
          boxShadow: `inset 0 0 0 2px ${tint}, 0 18px 40px -20px ${glow}`,
        }}
      >
        {/* Side label */}
        <div className="flex items-baseline justify-between mb-3">
          <div
            className="font-display text-2xl tracking-tight"
            style={{ color: tint, textShadow: `0 0 18px ${glow}` }}
          >
            {name}
          </div>
          <div
            className="font-display text-[10px] tracking-[0.35em]"
            style={{ color: "color-mix(in oklab, var(--paper) 60%, transparent)" }}
          >
            {tag}
          </div>
        </div>

        {/* Controls grid */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between border-b border-dashed pb-1"
              style={{ borderColor: "color-mix(in oklab, var(--paper) 22%, transparent)" }}
            >
              <dt className="font-display text-[10px] tracking-[0.25em] text-foreground/55">
                {k}
              </dt>
              <dd
                className="font-display text-[12px] tracking-[0.1em]"
                style={{ color: "var(--paper)" }}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Corner stamp */}
      <div
        className={`absolute ${isHero ? "-top-2 -right-2" : "-top-2 -left-2"} px-2 py-0.5 font-display text-[9px] tracking-[0.3em]`}
        style={{
          background: tint,
          color: "var(--background)",
          transform: isHero ? "rotate(4deg)" : "rotate(-4deg)",
          boxShadow: `0 4px 18px -4px ${glow}`,
        }}
      >
        {isHero ? "◆ JUSTICE" : "◆ CHAOS"}
      </div>
    </div>
  );
}
