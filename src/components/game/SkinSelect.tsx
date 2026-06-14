import { SKINS, type SkinId, type Universe, getSkin, type Skin } from "@/game/skins";
import { drawWalkFrame, drawWalkFrameSilhouette } from "@/game/walkSprite";
import type { Difficulty } from "@/game/ai";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Swords } from "lucide-react";

const UNIVERSES: Universe[] = ["Marvel", "DC", "The Boys"];
const DIFFS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "hard", label: "Hard" },
  { id: "extreme", label: "Extreme" },
];

export function SkinSelect({
  onConfirm,
  onBack,
}: {
  onConfirm: (p1: SkinId, p2: SkinId, opts: { cpu: boolean; difficulty: Difficulty }) => void;
  onBack: () => void;
}) {
  const [p1, setP1] = useState<SkinId>("spiderman");
  const [p2, setP2] = useState<SkinId>("homelander");
  const [cpu, setCpu] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");

  return (
    <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-3 sm:p-4 overflow-auto">
      <button
        onClick={onBack}
        className="absolute top-3 left-3 sm:top-4 sm:left-4 font-mono text-[10px] tracking-widest uppercase text-foreground/60 sm:hover:text-foreground/90 min-h-11 px-2 flex items-center gap-1.5"
      >
        <ArrowLeft size={14} strokeWidth={2.4} />
        Maps
      </button>
      <div className="font-mono text-[10px] sm:text-xs tracking-[0.4em] text-foreground/60 uppercase mb-2 mt-10 sm:mt-0">Select Fighters</div>
      <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-widest text-foreground mb-6 sm:mb-8 text-center">PICK YOUR HEROES</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full max-w-5xl">
        <SkinPicker label="Player 1" accent="oklch(0.85 0.18 210)" value={p1} onChange={setP1} />
        <SkinPicker label={cpu ? "CPU Opponent" : "Player 2"} accent="oklch(0.72 0.28 340)" value={p2} onChange={setP2} />
      </div>

      <div className="w-full max-w-5xl mt-5 flex flex-col sm:flex-row gap-3 sm:gap-6 items-stretch sm:items-center justify-between rounded-lg border border-foreground/15 p-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest uppercase text-foreground/60">Mode</span>
          <div className="flex">
            {[
              { v: true, label: "VS CPU" },
              { v: false, label: "Local 2P" },
            ].map((o, i) => (
              <button
                key={i}
                onClick={() => setCpu(o.v)}
                className={`min-h-10 px-3 font-mono text-[10px] tracking-widest uppercase border transition-colors ${
                  cpu === o.v ? "bg-foreground/15 border-foreground/40 text-foreground" : "border-foreground/10 text-foreground/60"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {cpu && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-widest uppercase text-foreground/60">Difficulty</span>
            <div className="flex">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`min-h-10 px-3 font-mono text-[10px] tracking-widest uppercase border transition-colors ${
                    difficulty === d.id ? "bg-foreground/15 border-foreground/40 text-foreground" : "border-foreground/10 text-foreground/60"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onConfirm(p1, p2, { cpu, difficulty })}
        className="mt-6 sm:mt-10 mb-4 px-8 sm:px-10 py-4 rounded-md font-mono uppercase tracking-[0.24em] text-sm border border-foreground/30 sm:hover:bg-foreground/10 active:bg-foreground/15 transition-colors text-foreground min-h-12 inline-flex items-center justify-center gap-3"
      >
        <Swords size={17} strokeWidth={2.5} />
        Fight
        <ArrowRight size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function SkinPicker({
  label, accent, value, onChange,
}: { label: string; accent: string; value: SkinId; onChange: (id: SkinId) => void }) {
  const skin = getSkin(value);
  const [universe, setUniverse] = useState<Universe>(skin.universe);
  const skins = SKINS.filter((s) => s.universe === universe);

  return (
    <div className="rounded-lg border border-foreground/15 p-4 flex flex-col gap-3" style={{ boxShadow: `0 0 24px -12px ${accent}` }}>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] tracking-widest uppercase" style={{ color: accent }}>{label}</div>
        <div className="font-black text-lg tracking-wider text-foreground">{skin.name}</div>
      </div>

      <div className="flex gap-1">
        {UNIVERSES.map((u) => (
          <button
            key={u}
            onClick={() => setUniverse(u)}
            className={`flex-1 min-h-11 py-2 font-mono text-[10px] tracking-widest uppercase border transition-colors ${
              universe === u ? "bg-foreground/15 border-foreground/40 text-foreground" : "border-foreground/10 text-foreground/60 sm:hover:text-foreground"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 py-2 sm:py-4">
        <SkinPreview skin={skin} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {skins.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`min-h-11 py-2 px-2 font-mono text-[10px] tracking-widest uppercase border rounded transition-colors text-center ${
              s.id === value ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-foreground/10 text-foreground/70 sm:hover:text-foreground"
            }`}
            style={s.id === value ? { boxShadow: `0 0 10px -2px ${s.glow}` } : undefined}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkinPreview({ skin }: { skin: Skin }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
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
    // Logical viewport — same 5:6 aspect as the canvas DOM box.
    const W = 200, H = 240;
    const FRAMES = 10;
    const FPS = 9; // matches in-match walk cadence

    const loop = (now: number) => {
      if (now - last >= 1000 / 30) {
        last = now;
        const t = (now - t0) / 1000;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const plate = ctx.createLinearGradient(0, 0, W, H);
        plate.addColorStop(0, "oklch(0.18 0.035 252 / 0.54)");
        plate.addColorStop(0.62, "oklch(0.08 0.025 260 / 0.22)");
        plate.addColorStop(1, "oklch(0.04 0.018 270 / 0)");
        ctx.fillStyle = plate;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const feetY = H - 18;
        const fighterH = 200; // matches in-match FIGHTER_H

        // Contact shadow
        ctx.fillStyle = "oklch(0 0 0 / 0.32)";
        ctx.beginPath(); ctx.ellipse(cx, feetY + 4, 26, 4.5, 0, 0, Math.PI * 2); ctx.fill();

        const frame = Math.floor(t * FPS) % FRAMES;
        drawWalkFrameSilhouette(ctx, skin, frame, cx, feetY, 1, fighterH, {
          alpha: 0.28,
          blur: 8,
          shadowColor: skin.glow,
          offset: 1.5,
        });
        const ok = drawWalkFrame(ctx, skin, frame, cx, feetY, 1, fighterH);
        if (!ok) {
          ctx.fillStyle = "oklch(0.6 0.02 280 / 0.25)";
          ctx.beginPath(); ctx.arc(cx, feetY - fighterH * 0.5, 14, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [skin]);

  return <canvas ref={ref} className="w-[150px] h-[180px] sm:w-[200px] sm:h-[240px]" />;
}
