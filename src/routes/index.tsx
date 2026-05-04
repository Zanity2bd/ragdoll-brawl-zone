import { createFileRoute, Link } from "@tanstack/react-router";
import { BlkdomBadge } from "@/components/BlkdomBadge";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "OgunArena — Offline 1v1 Stickman Fighting Game" },
      { name: "description", content: "OgunArena (Yoruba: Ogun = war). Offline 1v1 stickman fighting arena for two players on one device. A Blkdom production." },
    ],
  }),
});

function Landing() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at center, oklch(0.18 0.08 280) 0%, oklch(0.10 0.05 275) 70%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent 0 22px, oklch(0.4 0.15 280 / 0.2) 22px 23px)",
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        }}
      />

      <div className="relative text-center max-w-2xl">
        <div className="font-mono text-xs tracking-[0.4em] uppercase text-foreground/50 mb-4">
          ◇ Offline 1v1 ◇
        </div>
        <h1
          className="text-6xl md:text-8xl font-black tracking-tight leading-none mb-2"
          style={{
            background: "linear-gradient(135deg, oklch(0.92 0.18 60), oklch(0.65 0.28 25))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 30px oklch(0.65 0.25 30 / 0.55))",
          }}
        >
          OGUN
        </h1>
        <h2
          className="text-4xl md:text-6xl font-black tracking-[0.25em] mb-3"
          style={{ color: "oklch(0.95 0.04 60)" }}
        >
          ARENA
        </h2>
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-foreground/50 mb-10">
          Ogun · war in Yoruba
        </div>

        <p className="text-foreground/70 mb-10 font-mono text-sm leading-relaxed">
          Two stickmen. One arena. No mercy.
          <br />
          Share a keyboard or a touchscreen and settle it the old way.
        </p>

        <Link
          to="/play"
          className="inline-block px-10 py-4 font-mono uppercase tracking-[0.3em] text-sm border-2 transition-all hover:scale-105"
          style={{
            borderColor: "oklch(0.85 0.18 210)",
            color: "oklch(0.85 0.18 210)",
            boxShadow: "0 0 30px oklch(0.75 0.22 215 / 0.4)",
          }}
        >
          ▶ Start Fight
        </Link>

        <div className="mt-16 grid grid-cols-2 gap-8 text-left">
          <ControlsCard
            name="Hero"
            color="oklch(0.85 0.18 210)"
            rows={[
              ["Move", "A · D"],
              ["Jump", "W"],
              ["Fire Blast", "F"],
              ["Teleport", "G + click"],
            ]}
          />
          <ControlsCard
            name="Villain"
            color="oklch(0.72 0.28 340)"
            rows={[
              ["Move", "← · →"],
              ["Jump", "↑"],
              ["Fire Blast", "K"],
              ["Teleport", "L + click"],
            ]}
          />
        </div>

        <div className="mt-8 font-mono text-[10px] tracking-widest uppercase text-foreground/40">
          On mobile? On-screen buttons appear automatically.
        </div>

        <div className="mt-10 flex justify-center">
          <BlkdomBadge />
        </div>
      </div>
    </main>
  );
}

function ControlsCard({
  name, color, rows,
}: { name: string; color: string; rows: [string, string][] }) {
  return (
    <div
      className="border rounded-sm p-4 backdrop-blur-sm"
      style={{ borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: "oklch(0.14 0.04 270 / 0.5)" }}
    >
      <div className="font-mono text-xs tracking-widest uppercase mb-3" style={{ color }}>
        {name}
      </div>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between font-mono text-xs">
            <dt className="text-foreground/60">{k}</dt>
            <dd style={{ color }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
