import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { GameEngine } from "@/game/engine";
import type { SkinId } from "@/game/skins";

export const Route = createFileRoute("/dpr-test")({
  component: DprTestPage,
  head: () => ({
    meta: [
      { title: "DPR Walk Test" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const DPRS = [1, 1.5, 2, 3] as const;
const SKIN_PAIRS: Array<[SkinId, SkinId]> = [
  ["spiderman", "homelander"],
  ["hulk", "superman"],
  ["flash", "ironman"],
];

type Mode = "run" | "walk";

function DprTestPage() {
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>("run");
  const [pairIdx, setPairIdx] = useState(0);
  const [p1Skin, p2Skin] = SKIN_PAIRS[pairIdx];

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card/40 text-xs font-mono">
        <span className="font-semibold tracking-wider uppercase opacity-70">DPR Walk Test</span>
        <button
          onClick={() => setPaused((p) => !p)}
          className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={() => setMode((m) => (m === "run" ? "walk" : "run"))}
          className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          {mode === "run" ? "Run" : "Walk"}
        </button>
        <button
          onClick={() => setPairIdx((i) => (i + 1) % SKIN_PAIRS.length)}
          className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          {p1Skin} vs {p2Skin}
        </button>
        <span className="ml-auto opacity-60">device DPR: {typeof window !== "undefined" ? window.devicePixelRatio : "?"}</span>
      </div>
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-border">
        {DPRS.map((dpr) => (
          <DprCell
            key={`${dpr}-${p1Skin}-${p2Skin}`}
            dpr={dpr}
            paused={paused}
            mode={mode}
            p1Skin={p1Skin}
            p2Skin={p2Skin}
          />
        ))}
      </div>
    </div>
  );
}

function DprCell({
  dpr,
  paused,
  mode,
  p1Skin,
  p2Skin,
}: {
  dpr: number;
  paused: boolean;
  mode: Mode;
  p1Skin: SkinId;
  p2Skin: SkinId;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [bufSize, setBufSize] = useState({ w: 0, h: 0, cssW: 0, cssH: 0 });

  // Construct engine once per mount (key cycles when skins change).
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    engine.configure("cyber-dojo", p1Skin, p2Skin, { cpu: false });

    const resize = () => {
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
      }
      setBufSize({ w, h, cssW, cssH });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    engine.start();
    return () => {
      engine.stop();
      ro.disconnect();
      engineRef.current = null;
    };
  }, [dpr, p1Skin, p2Skin]);

  // Pause/resume.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (paused) e.stop();
    else e.start();
  }, [paused]);

  // Auto-walk driver — flips direction every cycle.
  // Run: hold direction. Walk: tap (hold ~250ms, release ~550ms).
  useEffect(() => {
    if (paused) return;
    const e = engineRef.current;
    if (!e) return;
    let cancelled = false;
    let dir: 1 | -1 = 1;

    const apply = (held: boolean) => {
      if (!engineRef.current || cancelled) return;
      const eng = engineRef.current;
      if (dir === 1) {
        eng.setIntent("p1", { left: false, right: held });
        eng.setIntent("p2", { right: false, left: held });
      } else {
        eng.setIntent("p1", { right: false, left: held });
        eng.setIntent("p2", { left: false, right: held });
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      if (cancelled) return;
      if (mode === "run") {
        apply(true);
        timer = setTimeout(() => {
          dir = dir === 1 ? -1 : 1;
          cycle();
        }, 1800);
      } else {
        apply(true);
        timer = setTimeout(() => {
          apply(false);
          timer = setTimeout(() => {
            dir = dir === 1 ? -1 : 1;
            cycle();
          }, 550);
        }, 280);
      }
    };
    cycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      const eng = engineRef.current;
      if (eng) {
        eng.setIntent("p1", { left: false, right: false });
        eng.setIntent("p2", { left: false, right: false });
      }
    };
  }, [mode, paused]);

  return (
    <div ref={wrapRef} className="relative bg-black overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-[10px] font-mono text-white tracking-wider pointer-events-none">
        DPR {dpr.toFixed(1)} · {bufSize.cssW}×{bufSize.cssH} css · {bufSize.w}×{bufSize.h} buf
      </div>
    </div>
  );
}
