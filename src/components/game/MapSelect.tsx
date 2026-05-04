import { MAPS, type MapId } from "@/game/maps";
import { useEffect, useRef, useState } from "react";

export function MapSelect({ onPick }: { onPick: (id: MapId) => void }) {
  return (
    <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 overflow-auto">
      <div className="font-mono text-[10px] sm:text-xs tracking-[0.4em] text-foreground/60 uppercase mb-2 mt-4 sm:mt-0">Select Arena</div>
      <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-widest text-foreground mb-6 sm:mb-10 text-center">CHOOSE YOUR BATTLEGROUND</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-6xl">
        {MAPS.map((m) => (
          <MapCard key={m.id} mapId={m.id} onPick={() => onPick(m.id)} />
        ))}
      </div>
    </div>
  );
}

function MapCard({ mapId, onPick }: { mapId: MapId; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLButtonElement>(null);
  const map = MAPS.find((m) => m.id === mapId)!;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "100px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dprCap = Math.min(devicePixelRatio || 1, 1.5);
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const W = 1280, H = 720, GROUND_Y = 600;
      ctx.save();
      ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
      map.drawBackground(ctx, t, W, H, GROUND_Y);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.floor(r.width * dprCap);
      c.height = Math.floor(r.height * dprCap);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [map, visible]);

  return (
    <button
      ref={wrapRef}
      onClick={onPick}
      className="group relative aspect-video rounded-lg overflow-hidden border border-foreground/15 sm:hover:border-foreground/60 transition-all sm:hover:scale-[1.02] active:scale-[0.99] touch-manipulation"
      style={{ boxShadow: `0 0 30px -10px ${map.accent}` }}
    >
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-background/95 to-transparent text-left">
        <div className="font-black text-xl tracking-wider" style={{ color: map.accent, textShadow: `0 0 12px ${map.accent}` }}>
          {map.name}
        </div>
        <div className="font-mono text-[11px] tracking-widest text-foreground/70 uppercase mt-1">{map.tagline}</div>
      </div>
    </button>
  );
}
