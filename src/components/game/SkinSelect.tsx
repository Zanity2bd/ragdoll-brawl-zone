import { SKINS, type SkinId, type Universe, getSkin, type Skin } from "@/game/skins";
import { useEffect, useRef, useState } from "react";

const UNIVERSES: Universe[] = ["Marvel", "DC", "The Boys"];

export function SkinSelect({
  onConfirm,
  onBack,
}: {
  onConfirm: (p1: SkinId, p2: SkinId) => void;
  onBack: () => void;
}) {
  const [p1, setP1] = useState<SkinId>("spiderman");
  const [p2, setP2] = useState<SkinId>("homelander");

  return (
    <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-3 sm:p-4 overflow-auto">
      <button
        onClick={onBack}
        className="absolute top-3 left-3 sm:top-4 sm:left-4 font-mono text-[10px] tracking-widest uppercase text-foreground/60 sm:hover:text-foreground/90 min-h-11 px-2 flex items-center"
      >
        ← Maps
      </button>
      <div className="font-mono text-[10px] sm:text-xs tracking-[0.4em] text-foreground/60 uppercase mb-2 mt-10 sm:mt-0">Select Fighters</div>
      <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-widest text-foreground mb-6 sm:mb-8 text-center">PICK YOUR HEROES</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full max-w-5xl">
        <SkinPicker label="Player 1" accent="oklch(0.85 0.18 210)" value={p1} onChange={setP1} />
        <SkinPicker label="Player 2" accent="oklch(0.72 0.28 340)" value={p2} onChange={setP2} />
      </div>

      <button
        onClick={() => onConfirm(p1, p2)}
        className="mt-6 sm:mt-10 mb-4 px-10 py-4 rounded-md font-mono uppercase tracking-[0.3em] text-sm border border-foreground/30 sm:hover:bg-foreground/10 active:bg-foreground/15 transition-colors text-foreground min-h-12"
      >
        FIGHT →
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
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    c.width = Math.floor(r.width * devicePixelRatio);
    c.height = Math.floor(r.height * devicePixelRatio);
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      const W = 200, H = 240;
      ctx.save();
      ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // background plate
      const grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 140);
      grad.addColorStop(0, `${skin.glow.replace(")", " / 0.25)")}`);
      grad.addColorStop(1, "oklch(0.1 0.02 280 / 0)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      // simple stickman idle with breathing
      const cx = W / 2;
      const breath = Math.sin(t * 1.5) * 1.2;
      const headY = 40 + breath;
      const shoulderY = 70 + breath;
      const hipY = 130;
      const feetY = 200;

      // cape
      if (skin.cape) {
        ctx.fillStyle = skin.cape;
        ctx.shadowBlur = 14; ctx.shadowColor = skin.cape;
        ctx.beginPath();
        ctx.moveTo(cx - 8, shoulderY);
        ctx.lineTo(cx + 8, shoulderY);
        ctx.quadraticCurveTo(cx + 14, hipY + 30, cx + 4, hipY + 60);
        ctx.lineTo(cx - 4, hipY + 60);
        ctx.quadraticCurveTo(cx - 14, hipY + 30, cx - 8, shoulderY);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.shadowBlur = 22; ctx.shadowColor = skin.glow;
      ctx.strokeStyle = skin.body;
      ctx.lineWidth = skin.thickBody ? 5 : 3.5;
      ctx.lineCap = "round";

      // head
      ctx.beginPath(); ctx.arc(cx, headY, 12, 0, Math.PI * 2); ctx.stroke();

      // cowl
      if (skin.cowlEars) {
        ctx.fillStyle = skin.body;
        ctx.beginPath(); ctx.moveTo(cx - 10, headY - 10); ctx.lineTo(cx - 14, headY - 22); ctx.lineTo(cx - 2, headY - 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 10, headY - 10); ctx.lineTo(cx + 14, headY - 22); ctx.lineTo(cx + 2, headY - 12); ctx.fill();
      }

      // body
      ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx, hipY); ctx.stroke();

      // limbs
      ctx.strokeStyle = skin.limb ?? skin.body;
      const sw = Math.sin(t * 2) * 4;
      // arms
      ctx.beginPath();
      ctx.moveTo(cx, shoulderY); ctx.lineTo(cx - 14, shoulderY + 18); ctx.lineTo(cx - 18 + sw, shoulderY + 36);
      ctx.moveTo(cx, shoulderY); ctx.lineTo(cx + 14, shoulderY + 18); ctx.lineTo(cx + 18 - sw, shoulderY + 36);
      ctx.stroke();
      // legs
      ctx.beginPath();
      ctx.moveTo(cx, hipY); ctx.lineTo(cx - 8, (hipY + feetY) / 2); ctx.lineTo(cx - 10, feetY);
      ctx.moveTo(cx, hipY); ctx.lineTo(cx + 8, (hipY + feetY) / 2); ctx.lineTo(cx + 10, feetY);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // glowing eyes
      if (skin.glowingEyes) {
        ctx.fillStyle = skin.glowingEyes;
        ctx.shadowBlur = 12; ctx.shadowColor = skin.glowingEyes;
        ctx.beginPath(); ctx.arc(cx - 4, headY, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 4, headY, 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // emblem
      if (skin.emblem) {
        const ey = (shoulderY + hipY) / 2;
        ctx.fillStyle = skin.emblem.color;
        ctx.shadowBlur = 10; ctx.shadowColor = skin.emblem.color;
        if (skin.emblem.shape === "oval") { ctx.beginPath(); ctx.ellipse(cx, ey, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (skin.emblem.shape === "circle") { ctx.beginPath(); ctx.arc(cx, ey, 5, 0, Math.PI * 2); ctx.fill(); }
        else if (skin.emblem.shape === "shield") { ctx.beginPath(); ctx.moveTo(cx - 6, ey - 4); ctx.lineTo(cx + 6, ey - 4); ctx.lineTo(cx, ey + 6); ctx.fill(); }
        else if (skin.emblem.shape === "stripe") { ctx.fillRect(cx - 3, shoulderY + 4, 6, hipY - shoulderY - 8); }
        else if (skin.emblem.shape === "spider") {
          ctx.beginPath(); ctx.arc(cx, ey, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = skin.emblem.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx - 6, ey - 3); ctx.lineTo(cx + 6, ey + 3); ctx.moveTo(cx + 6, ey - 3); ctx.lineTo(cx - 6, ey + 3); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [skin]);

  return <canvas ref={ref} className="w-[150px] h-[180px] sm:w-[200px] sm:h-[240px]" />;
}
