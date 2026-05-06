import { MAPS, type MapId, type BattleMap } from "@/game/maps";
import { SKINS, type Skin, type Universe } from "@/game/skins";
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
    const loop = (now: number) => {
      if (now - last >= 50) { // ~20fps
        last = now;
        const t = (now - t0) / 1000;
        ctx.save();
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // background plate (subtle radial, no neon)
        const grad = ctx.createRadialGradient(W / 2, H / 2, 8, W / 2, H / 2, 130);
        grad.addColorStop(0, "oklch(0.22 0.02 280 / 0.5)");
        grad.addColorStop(1, "oklch(0.10 0.02 280 / 0)");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const breath = Math.sin(t * 1.5) * 1;
        const headR = 12;
        const headY = 50 + breath;
        const shoulderY = 78 + breath;
        const hipY = 130;
        const feetY = 188;

        // soft shadow under feet
        ctx.fillStyle = "oklch(0 0 0 / 0.28)";
        ctx.beginPath(); ctx.ellipse(cx, feetY + 4, 22, 4, 0, 0, Math.PI * 2); ctx.fill();

        // cape
        if (skin.cape) {
          const sway = Math.sin(t * 1.2) * 4;
          ctx.fillStyle = skin.cape;
          ctx.beginPath();
          ctx.moveTo(cx - 9, shoulderY);
          ctx.lineTo(cx + 9, shoulderY);
          ctx.quadraticCurveTo(cx + 14 + sway, hipY + 24, cx + 5 + sway, hipY + 50);
          ctx.lineTo(cx - 5 + sway, hipY + 50);
          ctx.quadraticCurveTo(cx - 14 + sway, hipY + 24, cx - 9, shoulderY);
          ctx.fill();
          if (skin.capeAccent) {
            ctx.fillStyle = skin.capeAccent;
            ctx.fillRect(cx - 1.5 + sway * 0.3, shoulderY, 3, hipY + 46 - shoulderY);
          }
        }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // limbs (curved with quad)
        const armSwing = Math.sin(t * 2) * 5;
        ctx.strokeStyle = skin.limb ?? skin.body;
        ctx.lineWidth = skin.thickBody ? 4.5 : 3.5;
        // arms
        const handLX = cx - 18 + armSwing;
        const handRX = cx + 18 - armSwing;
        const handY = shoulderY + 38;
        ctx.beginPath();
        ctx.moveTo(cx - 4, shoulderY); ctx.quadraticCurveTo(cx - 14, shoulderY + 18, handLX, handY); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 4, shoulderY); ctx.quadraticCurveTo(cx + 14, shoulderY + 18, handRX, handY); ctx.stroke();
        // legs (idle slight stagger)
        const legSway = Math.sin(t * 2 + Math.PI) * 2;
        const footLX = cx - 9 + legSway;
        const footRX = cx + 9 - legSway;
        ctx.beginPath();
        ctx.moveTo(cx - 3, hipY); ctx.quadraticCurveTo(cx - 8, (hipY + feetY) / 2 + 4, footLX, feetY); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 3, hipY); ctx.quadraticCurveTo(cx + 8, (hipY + feetY) / 2 + 4, footRX, feetY); ctx.stroke();

        // boots
        if (skin.boots) {
          ctx.fillStyle = skin.boots;
          ctx.beginPath(); ctx.ellipse(footLX, feetY - 1, 5.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(footRX, feetY - 1, 5.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
        }
        // gloves
        if (skin.gloves) {
          ctx.fillStyle = skin.gloves;
          ctx.beginPath(); ctx.arc(handLX, handY, 3.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(handRX, handY, 3.6, 0, Math.PI * 2); ctx.fill();
        }

        // torso
        ctx.strokeStyle = skin.body;
        ctx.lineWidth = skin.thickBody ? 6 : 4.5;
        ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx, hipY); ctx.stroke();
        // shoulder caps
        ctx.fillStyle = skin.body;
        ctx.beginPath(); ctx.arc(cx - 4, shoulderY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 4, shoulderY, 2.5, 0, Math.PI * 2); ctx.fill();

        // emblem
        if (skin.emblem) {
          const ey = (shoulderY + hipY) / 2;
          ctx.fillStyle = skin.emblem.color;
          if (skin.emblem.shape === "oval") { ctx.beginPath(); ctx.ellipse(cx, ey, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
          else if (skin.emblem.shape === "circle") { ctx.beginPath(); ctx.arc(cx, ey, 5, 0, Math.PI * 2); ctx.fill(); }
          else if (skin.emblem.shape === "shield") { ctx.beginPath(); ctx.moveTo(cx - 6, ey - 4); ctx.lineTo(cx + 6, ey - 4); ctx.lineTo(cx, ey + 6); ctx.fill(); }
          else if (skin.emblem.shape === "stripe") { ctx.fillRect(cx - 2.5, shoulderY + 4, 5, hipY - shoulderY - 8); }
          else if (skin.emblem.shape === "spider") {
            ctx.beginPath(); ctx.arc(cx, ey, 3, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = skin.emblem.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx - 6, ey - 3); ctx.lineTo(cx + 6, ey + 3); ctx.moveTo(cx + 6, ey - 3); ctx.lineTo(cx - 6, ey + 3); ctx.stroke();
          } else if (skin.emblem.shape === "lightning") {
            ctx.beginPath();
            ctx.moveTo(cx - 3, ey - 6); ctx.lineTo(cx + 2, ey - 1); ctx.lineTo(cx - 1, ey - 1);
            ctx.lineTo(cx + 3, ey + 6); ctx.lineTo(cx - 2, ey + 1); ctx.lineTo(cx + 1, ey + 1);
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
        // cowl ears
        if (skin.cowlEars) {
          ctx.fillStyle = skin.head ?? skin.body;
          ctx.beginPath(); ctx.moveTo(cx - 9, headY - 8); ctx.lineTo(cx - 13, headY - 20); ctx.lineTo(cx - 1, headY - 10); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx + 9, headY - 8); ctx.lineTo(cx + 13, headY - 20); ctx.lineTo(cx + 1, headY - 10); ctx.fill();
        }
        // hair tufts
        if (skin.id === "homelander") {
          ctx.fillStyle = "oklch(0.78 0.10 85)";
          ctx.beginPath();
          ctx.moveTo(cx - 9, headY - 8);
          ctx.quadraticCurveTo(cx + 4, headY - 16, cx + 9, headY - 8);
          ctx.quadraticCurveTo(cx, headY - 11, cx - 9, headY - 8);
          ctx.fill();
        }
        if (skin.id === "superman") {
          ctx.fillStyle = "oklch(0.18 0.02 30)";
          ctx.beginPath();
          ctx.moveTo(cx - 9, headY - 7);
          ctx.quadraticCurveTo(cx, headY - 16, cx + 9, headY - 7);
          ctx.quadraticCurveTo(cx + 7, headY - 4, cx - 7, headY - 4);
          ctx.fill();
          ctx.beginPath(); ctx.arc(cx - 1, headY - 3, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        // beard
        if (skin.beard) {
          ctx.fillStyle = "oklch(0.14 0.02 60)";
          ctx.beginPath(); ctx.ellipse(cx, headY + 5, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(cx - 5, headY + 1, 10, 1.4);
        }
        // eyes
        const eyeColor = skin.id === "spiderman" ? "oklch(0.95 0.02 250)" : "oklch(0.10 0 0)";
        ctx.fillStyle = eyeColor;
        if (skin.id === "spiderman") {
          ctx.beginPath(); ctx.ellipse(cx - 4, headY - 1, 3.5, 2.2, -0.35, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx + 4, headY - 1, 3.5, 2.2, 0.35, 0, Math.PI * 2); ctx.fill();
        } else if (skin.cowlEars) {
          ctx.fillStyle = "oklch(0.92 0.02 250)";
          ctx.fillRect(cx - 6, headY - 1, 4, 1.8);
          ctx.fillRect(cx + 2, headY - 1, 4, 1.8);
        } else {
          ctx.beginPath(); ctx.arc(cx - 3, headY, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 3, headY, 1.5, 0, Math.PI * 2); ctx.fill();
        }
        if (skin.glowingEyes) {
          ctx.fillStyle = skin.glowingEyes;
          ctx.shadowBlur = 8; ctx.shadowColor = skin.glowingEyes;
          ctx.beginPath(); ctx.arc(cx - 3, headY, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 3, headY, 2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
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
