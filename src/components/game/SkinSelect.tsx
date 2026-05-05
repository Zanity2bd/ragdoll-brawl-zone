import { SKINS, type SkinId, type Universe, getSkin, type Skin } from "@/game/skins";
import type { Difficulty } from "@/game/ai";
import { useEffect, useRef, useState } from "react";
import spidermanHero from "@/assets/heroes/spiderman.png";
import hulkHero from "@/assets/heroes/hulk.png";
import flashHero from "@/assets/heroes/flash.png";

const HERO_PORTRAITS: Partial<Record<SkinId, string>> = {
  spiderman: spidermanHero,
  hulk: hulkHero,
  flash: flashHero,
};

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
        className="absolute top-3 left-3 sm:top-4 sm:left-4 font-mono text-[10px] tracking-widest uppercase text-foreground/60 sm:hover:text-foreground/90 min-h-11 px-2 flex items-center"
      >
        ← Maps
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
        <HeroOrPreview skin={skin} />
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
    const W = 200, H = 240;
    const loop = (now: number) => {
      if (now - last >= 40) {
        last = now;
        const t = (now - t0) / 1000;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // subtle background plate (no neon)
        const grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 140);
        grad.addColorStop(0, "oklch(0.22 0.02 280 / 0.5)");
        grad.addColorStop(1, "oklch(0.10 0.02 280 / 0)");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const breath = Math.sin(t * 1.5) * 1.2;
        const headR = 13;
        const headY = 56 + breath;
        const shoulderY = 86 + breath;
        const hipY = 142;
        const feetY = 206;

        // contact shadow
        ctx.fillStyle = "oklch(0 0 0 / 0.3)";
        ctx.beginPath(); ctx.ellipse(cx, feetY + 5, 24, 4.5, 0, 0, Math.PI * 2); ctx.fill();

        // cape
        if (skin.cape) {
          const sway = Math.sin(t * 1.2) * 4;
          ctx.fillStyle = skin.cape;
          ctx.beginPath();
          ctx.moveTo(cx - 10, shoulderY);
          ctx.lineTo(cx + 10, shoulderY);
          ctx.quadraticCurveTo(cx + 16 + sway, hipY + 26, cx + 6 + sway, hipY + 56);
          ctx.lineTo(cx - 6 + sway, hipY + 56);
          ctx.quadraticCurveTo(cx - 16 + sway, hipY + 26, cx - 10, shoulderY);
          ctx.fill();
          if (skin.capeAccent) {
            ctx.fillStyle = skin.capeAccent;
            ctx.fillRect(cx - 1.5 + sway * 0.3, shoulderY, 3, hipY + 52 - shoulderY);
          }
        }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // limbs
        const armSwing = Math.sin(t * 2) * 5;
        ctx.strokeStyle = skin.limb ?? skin.body;
        ctx.lineWidth = skin.thickBody ? 5 : 4;
        const handLX = cx - 20 + armSwing;
        const handRX = cx + 20 - armSwing;
        const handY = shoulderY + 42;
        ctx.beginPath();
        ctx.moveTo(cx - 4, shoulderY); ctx.quadraticCurveTo(cx - 16, shoulderY + 20, handLX, handY); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 4, shoulderY); ctx.quadraticCurveTo(cx + 16, shoulderY + 20, handRX, handY); ctx.stroke();
        const legSway = Math.sin(t * 2 + Math.PI) * 2;
        const footLX = cx - 10 + legSway;
        const footRX = cx + 10 - legSway;
        ctx.beginPath();
        ctx.moveTo(cx - 3, hipY); ctx.quadraticCurveTo(cx - 9, (hipY + feetY) / 2 + 4, footLX, feetY); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 3, hipY); ctx.quadraticCurveTo(cx + 9, (hipY + feetY) / 2 + 4, footRX, feetY); ctx.stroke();

        // boots
        if (skin.boots) {
          ctx.fillStyle = skin.boots;
          ctx.beginPath(); ctx.ellipse(footLX, feetY - 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(footRX, feetY - 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
        // gloves
        if (skin.gloves) {
          ctx.fillStyle = skin.gloves;
          ctx.beginPath(); ctx.arc(handLX, handY, 4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(handRX, handY, 4, 0, Math.PI * 2); ctx.fill();
        }

        // torso
        ctx.strokeStyle = skin.body;
        ctx.lineWidth = skin.thickBody ? 7 : 5;
        ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx, hipY); ctx.stroke();
        ctx.fillStyle = skin.body;
        ctx.beginPath(); ctx.arc(cx - 4, shoulderY, 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 4, shoulderY, 2.8, 0, Math.PI * 2); ctx.fill();

        // emblem
        if (skin.emblem) {
          const ey = (shoulderY + hipY) / 2;
          ctx.fillStyle = skin.emblem.color;
          if (skin.emblem.shape === "oval") { ctx.beginPath(); ctx.ellipse(cx, ey, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); }
          else if (skin.emblem.shape === "circle") { ctx.beginPath(); ctx.arc(cx, ey, 5.5, 0, Math.PI * 2); ctx.fill(); }
          else if (skin.emblem.shape === "shield") { ctx.beginPath(); ctx.moveTo(cx - 7, ey - 5); ctx.lineTo(cx + 7, ey - 5); ctx.lineTo(cx, ey + 7); ctx.fill(); }
          else if (skin.emblem.shape === "stripe") { ctx.fillRect(cx - 3, shoulderY + 4, 6, hipY - shoulderY - 8); }
          else if (skin.emblem.shape === "spider") {
            ctx.beginPath(); ctx.arc(cx, ey, 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = skin.emblem.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx - 7, ey - 3); ctx.lineTo(cx + 7, ey + 3); ctx.moveTo(cx + 7, ey - 3); ctx.lineTo(cx - 7, ey + 3); ctx.stroke();
          } else if (skin.emblem.shape === "lightning") {
            ctx.beginPath();
            ctx.moveTo(cx - 3, ey - 7); ctx.lineTo(cx + 2, ey - 1); ctx.lineTo(cx - 1, ey - 1);
            ctx.lineTo(cx + 3, ey + 7); ctx.lineTo(cx - 2, ey + 1); ctx.lineTo(cx + 1, ey + 1);
            ctx.closePath(); ctx.fill();
          }
        }

        // HEAD — filled mask + optional skin tone face
        ctx.fillStyle = skin.head ?? skin.body;
        ctx.beginPath(); ctx.arc(cx, headY, headR, 0, Math.PI * 2); ctx.fill();
        if (skin.skinTone) {
          ctx.fillStyle = skin.skinTone;
          ctx.beginPath(); ctx.ellipse(cx + 1.5, headY + 2, headR - 3, headR - 4.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (skin.cowlEars) {
          ctx.fillStyle = skin.head ?? skin.body;
          ctx.beginPath(); ctx.moveTo(cx - 10, headY - 9); ctx.lineTo(cx - 14, headY - 22); ctx.lineTo(cx - 1, headY - 11); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx + 10, headY - 9); ctx.lineTo(cx + 14, headY - 22); ctx.lineTo(cx + 1, headY - 11); ctx.fill();
        }
        if (skin.id === "homelander") {
          ctx.fillStyle = "oklch(0.78 0.10 85)";
          ctx.beginPath();
          ctx.moveTo(cx - 10, headY - 9);
          ctx.quadraticCurveTo(cx + 4, headY - 17, cx + 10, headY - 9);
          ctx.quadraticCurveTo(cx, headY - 12, cx - 10, headY - 9);
          ctx.fill();
        }
        if (skin.id === "superman") {
          ctx.fillStyle = "oklch(0.18 0.02 30)";
          ctx.beginPath();
          ctx.moveTo(cx - 10, headY - 8);
          ctx.quadraticCurveTo(cx, headY - 17, cx + 10, headY - 8);
          ctx.quadraticCurveTo(cx + 7, headY - 4, cx - 7, headY - 4);
          ctx.fill();
          ctx.beginPath(); ctx.arc(cx - 1, headY - 3, 1.7, 0, Math.PI * 2); ctx.fill();
        }
        if (skin.beard) {
          ctx.fillStyle = "oklch(0.14 0.02 60)";
          ctx.beginPath(); ctx.ellipse(cx, headY + 5, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(cx - 5, headY + 1, 10, 1.5);
        }
        // eyes
        const eyeColor = skin.id === "spiderman" ? "oklch(0.95 0.02 250)" : "oklch(0.10 0 0)";
        ctx.fillStyle = eyeColor;
        if (skin.id === "spiderman") {
          ctx.beginPath(); ctx.ellipse(cx - 4, headY - 1, 3.8, 2.4, -0.35, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx + 4, headY - 1, 3.8, 2.4, 0.35, 0, Math.PI * 2); ctx.fill();
        } else if (skin.cowlEars) {
          ctx.fillStyle = "oklch(0.92 0.02 250)";
          ctx.fillRect(cx - 6, headY - 1, 4, 2);
          ctx.fillRect(cx + 2, headY - 1, 4, 2);
        } else {
          ctx.beginPath(); ctx.arc(cx - 3, headY, 1.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 3, headY, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        if (skin.glowingEyes) {
          ctx.fillStyle = skin.glowingEyes;
          ctx.beginPath(); ctx.arc(cx - 3, headY, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 3, headY, 2.2, 0, Math.PI * 2); ctx.fill();
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
