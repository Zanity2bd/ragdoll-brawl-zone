import { useEffect, useRef, useState } from "react";
import { GameEngine, type GameSnapshot, type PlayerId } from "@/game/engine";
import { type MapId } from "@/game/maps";
import { type SkinId } from "@/game/skins";
import { Sfx } from "@/game/sfx";
import { Lobby } from "./Lobby";
import { SkinSelect } from "./SkinSelect";
import { Splash } from "./Splash";

const KEY_MAP: Record<string, { p: PlayerId; action: "left" | "right" | "jump" | "fire" | "teleport" | "melee" }> = {
  KeyA: { p: "p1", action: "left" },
  KeyD: { p: "p1", action: "right" },
  KeyW: { p: "p1", action: "jump" },
  KeyF: { p: "p1", action: "fire" },
  KeyG: { p: "p1", action: "teleport" },
  KeyJ: { p: "p1", action: "melee" },
  ArrowLeft: { p: "p2", action: "left" },
  ArrowRight: { p: "p2", action: "right" },
  ArrowUp: { p: "p2", action: "jump" },
  KeyK: { p: "p2", action: "fire" },
  KeyL: { p: "p2", action: "teleport" },
  Semicolon: { p: "p2", action: "melee" },
};

type Screen = "splash" | "map" | "skin" | "fight";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [screen, setScreen] = useState<Screen>("splash");
  const [mapId, setMapId] = useState<MapId>("neon-city");
  const [p1Skin, setP1Skin] = useState<SkinId>("spiderman");
  const [p2Skin, setP2Skin] = useState<SkinId>("homelander");
  const [muted, setMuted] = useState(false);
  const [needsLandscape, setNeedsLandscape] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    setIsTouch(touch);
    if (!touch) return;
    const check = () => setNeedsLandscape(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  useEffect(() => { Sfx.setMuted(muted); }, [muted]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dprCap = Math.min(devicePixelRatio || 1, 1.5);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dprCap);
      canvas.height = Math.floor(r.height * dprCap);
    };
    resize();
    window.addEventListener("resize", resize);

    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    engine.onSnapshot = setSnap;

    // Detect low-power profile (mobile / few cores / small screen)
    const isTouchDev = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    engine.setLowPower(isTouchDev || fewCores || smallScreen);

    engine.start();

    // Pause when tab/page hidden
    const onVis = () => {
      if (document.hidden) engine.stop(); else engine.start();
    };
    document.addEventListener("visibilitychange", onVis);

    const down = (e: KeyboardEvent) => {
      const m = KEY_MAP[e.code];
      if (!m) return;
      e.preventDefault();
      engine.setIntent(m.p, { [m.action]: true });
    };
    const up = (e: KeyboardEvent) => {
      const m = KEY_MAP[e.code];
      if (!m) return;
      if (m.action === "left" || m.action === "right") {
        engine.setIntent(m.p, { [m.action]: false });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const click = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      engine.handlePointer(e.clientX - r.left, e.clientY - r.top);
    };
    const touch = (e: TouchEvent) => {
      if (!engine.isTeleTargeting()) return;
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      engine.handlePointer(t.clientX - r.left, t.clientY - r.top);
    };
    canvas.addEventListener("click", click);
    canvas.addEventListener("touchstart", touch, { passive: false });

    return () => {
      engine.stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("touchstart", touch);
    };
  }, []);

  const engine = engineRef.current;

  const startFight = (m: MapId, p1: SkinId, p2: SkinId) => {
    engine?.configure(m, p1, p2);
    setScreen("fight");
  };

  return (
    <div className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
      />
      {screen === "fight" && snap && (
        <HUD
          snap={snap}
          muted={muted}
          onToggleMute={() => setMuted(m => !m)}
          onRematch={() => engine?.reset()}
          onChange={() => setScreen("map")}
        />
      )}
      {screen === "fight" && isTouch && engine && <TouchControls engine={engine} />}

      {screen === "splash" && (
        <Splash onPlay={() => { Sfx.unlock(); setScreen("map"); }} />
      )}
      {screen === "map" && (
        <Lobby onPickMap={(id) => { setMapId(id); setScreen("skin"); }} />
      )}
      {screen === "skin" && (
        <SkinSelect
          onBack={() => setScreen("map")}
          onConfirm={(p1, p2) => { setP1Skin(p1); setP2Skin(p2); startFight(mapId, p1, p2); }}
        />
      )}
    </div>
  );
}

function HUD({ snap, onRematch, onChange, muted, onToggleMute }: { snap: GameSnapshot; onRematch: () => void; onChange: () => void; muted: boolean; onToggleMute: () => void }) {
  return (
    <>
      <div className="pointer-events-none absolute top-0 left-0 right-0 p-2 sm:p-4 flex gap-2 sm:gap-4 items-start">
        <HpBar p={snap.p1} side="left" />
        <HpBar p={snap.p2} side="right" />
      </div>
      <button
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 w-9 h-9 rounded-full border border-foreground/20 bg-background/40 backdrop-blur-sm flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-foreground/10 z-20"
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {snap.phase === "intro" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="text-7xl font-black tracking-widest"
            style={{
              color: "oklch(0.95 0.15 60)",
              textShadow: "0 0 30px oklch(0.75 0.22 45)",
              animation: "fade-in 0.4s ease-out",
            }}
          >
            FIGHT!
          </div>
        </div>
      )}

      {snap.phase === "ko" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="text-center">
            <div
              className="text-8xl font-black tracking-widest mb-4"
              style={{
                color: snap.winner === "p1" ? "oklch(0.85 0.18 210)" : "oklch(0.72 0.28 340)",
                textShadow: `0 0 40px ${snap.winner === "p1" ? "oklch(0.75 0.22 215)" : "oklch(0.65 0.30 345)"}`,
              }}
            >
              K.O.
            </div>
            <div className="text-2xl text-foreground/80 mb-6 font-mono">
              {snap.winner === "p1" ? snap.p1.name : snap.p2.name} wins
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onRematch}
                className="px-8 py-3 rounded-md font-mono uppercase tracking-widest text-sm border border-foreground/20 hover:bg-foreground/10 transition-colors"
                style={{ color: "oklch(0.95 0.05 250)" }}
              >
                Rematch
              </button>
              <button
                onClick={onChange}
                className="px-8 py-3 rounded-md font-mono uppercase tracking-widest text-sm border border-foreground/20 hover:bg-foreground/10 transition-colors text-foreground/70"
              >
                Change setup
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.slowmo && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-32">
          <div className="font-mono text-sm tracking-widest text-foreground/70 animate-pulse">
            ◇ SELECT TELEPORT TARGET ◇
          </div>
        </div>
      )}
    </>
  );
}

function HpBar({ p, side }: { p: GameSnapshot["p1"]; side: "left" | "right" }) {
  const isP1 = p.id === "p1";
  const color = isP1 ? "oklch(0.85 0.18 210)" : "oklch(0.72 0.28 340)";
  const glow = isP1 ? "oklch(0.75 0.22 215)" : "oklch(0.65 0.30 345)";
  const pct = (p.hp / p.maxHp) * 100;
  return (
    <div className={`flex-1 max-w-md ${side === "right" ? "items-end" : ""} flex flex-col gap-2`}>
      <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <div className="font-mono text-xs tracking-widest uppercase" style={{ color }}>
          {p.name}
        </div>
        <div className="font-mono text-xs text-foreground/60">{Math.ceil(p.hp)} HP</div>
      </div>
      <div className="h-3 bg-foreground/10 rounded-sm overflow-hidden border border-foreground/10">
        <div
          className="h-full transition-[width] duration-200"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 12px ${glow}`,
            marginLeft: side === "right" ? "auto" : 0,
          }}
        />
      </div>
      <div className={`flex gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <CdPill label={isP1 ? "F · Fire" : "K · Fire"} cd={p.fireCd} max={p.fireCdMax} color={color} />
        <CdPill label={`${isP1 ? "J" : ";"} · ${p.meleeName}`} cd={p.meleeCd} max={p.meleeCdMax} color={color} />
        <CdPill label={isP1 ? "G · Tele" : "L · Tele"} cd={p.teleCd} max={p.teleCdMax} color={color} />
      </div>
    </div>
  );
}

function CdPill({ label, cd, max, color }: { label: string; cd: number; max: number; color: string }) {
  const ready = cd <= 0;
  const pct = ready ? 100 : (1 - cd / max) * 100;
  return (
    <div
      className="relative px-3 py-1 rounded-sm border font-mono text-[10px] tracking-widest uppercase overflow-hidden"
      style={{
        borderColor: ready ? color : "oklch(0.4 0.05 250)",
        color: ready ? color : "oklch(0.6 0.03 250)",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 opacity-20"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="relative">{label}</span>
    </div>
  );
}

function TouchControls({ engine }: { engine: GameEngine }) {
  const hold = (p: PlayerId, action: "left" | "right", on: boolean) =>
    engine.setIntent(p, { [action]: on });
  return (
    <div
      className="absolute inset-x-0 bottom-0 px-3 flex justify-between pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <Pad
        onLeft={(d) => hold("p1", "left", d)}
        onRight={(d) => hold("p1", "right", d)}
        onJump={() => engine.pressJump("p1")}
        onFire={() => engine.pressFire("p1")}
        onPunch={() => engine.pressMelee("p1")}
        onTele={() => engine.pressTeleport("p1")}
        color="oklch(0.85 0.18 210)"
      />
      <Pad
        onLeft={(d) => hold("p2", "left", d)}
        onRight={(d) => hold("p2", "right", d)}
        onJump={() => engine.pressJump("p2")}
        onFire={() => engine.pressFire("p2")}
        onPunch={() => engine.pressMelee("p2")}
        onTele={() => engine.pressTeleport("p2")}
        color="oklch(0.72 0.28 340)"
        mirror
      />
    </div>
  );
}

function Pad({
  onLeft, onRight, onJump, onFire, onPunch, onTele, color, mirror,
}: {
  onLeft: (d: boolean) => void;
  onRight: (d: boolean) => void;
  onJump: () => void;
  onFire: () => void;
  onPunch: () => void;
  onTele: () => void;
  color: string;
  mirror?: boolean;
}) {
  const btn = "w-[56px] h-[56px] rounded-full border-2 font-mono text-[10px] flex items-center justify-center backdrop-blur-sm bg-background/40 active:bg-foreground/30 pointer-events-auto select-none touch-manipulation";
  const style = { borderColor: color, color };
  return (
    <div className={`flex gap-3 ${mirror ? "flex-row-reverse" : ""}`}>
      <div className="flex gap-2">
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onLeft(true); }}
          onTouchEnd={(e) => { e.preventDefault(); onLeft(false); }}
        >◀</button>
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onRight(true); }}
          onTouchEnd={(e) => { e.preventDefault(); onRight(false); }}
        >▶</button>
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onJump(); }}
        >▲</button>
      </div>
      <div className="flex gap-2">
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onPunch(); }}
        >PUNCH</button>
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onFire(); }}
        >FIRE</button>
        <button className={btn} style={style}
          onTouchStart={(e) => { e.preventDefault(); onTele(); }}
        >TELE</button>
      </div>
    </div>
  );
}
