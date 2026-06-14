import { MAPS, type MapId, type BattleMap } from "@/game/maps";
import { SKINS, type Skin, type Universe } from "@/game/skins";
import { drawWalkFrame, drawWalkFrameSilhouette } from "@/game/walkSprite";
import { useEffect, useRef, useState } from "react";
import { BlkdomBadge } from "@/components/BlkdomBadge";

type Tab = "maps" | "skins";

export function Lobby({ onPickMap }: { onPickMap: (id: MapId) => void }) {
  const [tab, setTab] = useState<Tab>("maps");

  return (
    <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md overflow-auto">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-16">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 relative">
          <div className="font-mono text-[10px] sm:text-xs tracking-[0.4em] text-foreground/50 uppercase">Arena Lobby</div>
          <h1 className="mt-1 text-2xl sm:text-4xl md:text-5xl font-black tracking-widest text-foreground">
            OGUN <span className="text-foreground/60">ARENA</span>
          </h1>
          <div className="mt-3 flex justify-center">
            <BlkdomBadge />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-6 sm:mb-10">
          <div className="inline-flex p-1 rounded-full border border-foreground/15 bg-foreground/5">
            {(["maps", "skins"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`min-h-11 px-6 sm:px-8 rounded-full font-mono text-[11px] sm:text-xs tracking-[0.3em] uppercase transition-colors ${
                  tab === t
                    ? "bg-foreground text-background"
                    : "text-foreground/60 sm:hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "maps" && <MapsPanel onPick={onPickMap} />}
        {tab === "skins" && <SkinsPanel />}
      </div>
    </div>
  );
}
/* ---------------- Maps Panel ---------------- */

function MapsPanel({ onPick }: { onPick: (id: MapId) => void }) {
  const neon = MAPS.filter((m) => m.tone === "neon");
  const dark = MAPS.filter((m) => m.tone === "dark");
  return (
    <div className="space-y-8">
      <SectionHeader label="Neon" caption="High-energy, glowing arenas" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {neon.map((m) => <MapCard key={m.id} map={m} onPick={() => onPick(m.id)} />)}
      </div>

      <SectionHeader label="Dark · Realistic" caption="Gritty, grounded battlegrounds" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {dark.map((m) => <MapCard key={m.id} map={m} onPick={() => onPick(m.id)} />)}
      </div>
    </div>
  );
}

function MapCard({ map, onPick }: { map: BattleMap; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-foreground/10 sm:hover:border-foreground/40 active:scale-[0.98] transition-all touch-manipulation text-left"
      style={{ boxShadow: `0 0 24px -14px ${map.accent}` }}
    >
      <MapThumb map={map} />
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 bg-gradient-to-t from-background/95 via-background/70 to-transparent">
        <div
          className="font-black text-[13px] sm:text-sm tracking-wider truncate"
          style={{ color: map.accent }}
        >
          {map.name}
        </div>
        <div className="font-mono text-[9px] sm:text-[10px] tracking-widest text-foreground/60 uppercase truncate">
          {map.tagline}
        </div>
      </div>
      <div
        className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-mono uppercase tracking-widest border border-foreground/15 bg-background/60 text-foreground/70"
      >
        {map.tone}
      </div>
    </button>
  );
}

function MapThumb({ map }: { map: BattleMap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let raf = 0;
    const t0 = performance.now();
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    const W = 1280, H = 720, GROUND_Y = 600;
    let last = t0;
    const loop = (now: number) => {
      // throttle to ~24fps for thumbnails to save GPU on mobile
      if (now - last >= 41) {
        last = now;
        const t = (now - t0) / 1000;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        map.drawBackground(ctx, t, W, H, GROUND_Y);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [map, visible]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

/* ---------------- Skins Panel ---------------- */

const UNIVERSES: Universe[] = ["Marvel", "DC", "The Boys"];

function SkinsPanel() {
  return (
    <div className="space-y-8">
      <div className="text-center text-foreground/60 font-mono text-[11px] tracking-widest uppercase">
        All skins included · more coming soon
      </div>
      {UNIVERSES.map((u) => {
        const skins = SKINS.filter((s) => s.universe === u);
        return (
          <div key={u} className="space-y-3">
            <SectionHeader label={u} caption={`${skins.length} fighters`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {skins.map((s) => <SkinCard key={s.id} skin={s} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkinCard({ skin }: { skin: Skin }) {
  return (
    <div
      className="relative rounded-xl overflow-hidden border border-foreground/10 bg-foreground/[0.03] p-3 flex flex-col items-center"
      style={{ boxShadow: `0 0 24px -16px ${skin.glow}` }}
    >
      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-mono uppercase tracking-widest border border-foreground/15 bg-background/60 text-foreground/70">
        Owned
      </div>
      <SkinThumb skin={skin} />
      <div className="mt-2 font-black text-sm tracking-wider text-foreground text-center" style={{ textShadow: `0 0 12px ${skin.glow}` }}>
        {skin.name}
      </div>
      <div className="font-mono text-[9px] tracking-widest text-foreground/50 uppercase">
        {skin.universe}
      </div>
    </div>
  );
}

function SkinThumb({ skin }: { skin: Skin }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
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
    const W = 200, H = 220;
    const FRAMES = 10;
    const FPS = 8;

    const loop = (now: number) => {
      if (now - last >= 50) {
        last = now;
        const t = (now - t0) / 1000;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const plate = ctx.createLinearGradient(0, 0, W, H);
        plate.addColorStop(0, "oklch(0.18 0.035 252 / 0.52)");
        plate.addColorStop(0.58, "oklch(0.08 0.025 260 / 0.24)");
        plate.addColorStop(1, "oklch(0.05 0.02 270 / 0)");
        ctx.fillStyle = plate;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const feetY = H - 24;
        const fighterH = 184;

        ctx.fillStyle = "oklch(0 0 0 / 0.34)";
        ctx.beginPath();
        ctx.ellipse(cx, feetY + 5, 27, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const frame = Math.floor(t * FPS) % FRAMES;
        drawWalkFrameSilhouette(ctx, skin, frame, cx, feetY, 1, fighterH, {
          alpha: 0.34,
          blur: 6,
          shadowColor: skin.glow,
          offset: 1.5,
        });
        const ok = drawWalkFrame(ctx, skin, frame, cx, feetY, 1, fighterH);
        if (!ok) {
          ctx.fillStyle = "oklch(0.6 0.02 280 / 0.25)";
          ctx.beginPath();
          ctx.arc(cx, feetY - fighterH * 0.5, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [skin, visible]);

  return (
    <div ref={wrap} className="w-full aspect-[5/6] flex items-center justify-center">
      <canvas ref={ref} className="w-full h-full" />
    </div>
  );
}
/* ---------------- Section header ---------------- */

function SectionHeader({ label, caption }: { label: string; caption?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-foreground/10 pb-2">
      <div className="font-black tracking-widest text-foreground text-base sm:text-lg uppercase">
        {label}
      </div>
      {caption && (
        <div className="font-mono text-[10px] tracking-widest text-foreground/50 uppercase">
          {caption}
        </div>
      )}
    </div>
  );
}
