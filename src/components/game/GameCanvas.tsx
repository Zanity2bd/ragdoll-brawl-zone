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
  const [sfxVol, setSfxVol] = useState(0.8);
  const [musicVol, setMusicVol] = useState(0.35);
  const [audioOpen, setAudioOpen] = useState(false);
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
  useEffect(() => { Sfx.setSfxVolume(sfxVol); }, [sfxVol]);
  useEffect(() => { Sfx.setMusicVolume(musicVol); }, [musicVol]);
  useEffect(() => {
    if (screen === "fight") Sfx.startMusic();
    else Sfx.stopMusic();
  }, [screen]);

  useEffect(() => {
    const canvas = canvasRef.current!;

    // Detect device tier: low-power gets simpler effects + lower DPR;
    // high-end gets crisper rendering up to DPR 2.
    const isTouchDev = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = (navigator as any).deviceMemory || 8;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    const lowPower = (isTouchDev && (cores <= 4 || mem <= 3)) || smallScreen;
    const highEnd = !lowPower && cores >= 8 && mem >= 6;
    const dprCap = lowPower ? 1 : highEnd ? 2 : 1.5;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, dprCap);
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    engine.onSnapshot = setSnap;
    engine.setLowPower(lowPower);

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
          onRematch={() => engine?.reset()}
          onChange={() => setScreen("map")}
          onOpenAudio={() => setAudioOpen(o => !o)}
          muted={muted}
        />
      )}
      <AudioPanel
        open={audioOpen && screen === "fight"}
        muted={muted}
        onToggleMute={() => setMuted(m => !m)}
        sfxVol={sfxVol} musicVol={musicVol}
        onSfx={setSfxVol} onMusic={setMusicVol}
        onClose={() => setAudioOpen(false)}
      />
      {screen === "fight" && isTouch && engine && snap && <TouchControls engine={engine} snap={snap} />}

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

      {needsLandscape && <RotatePrompt />}
    </div>
  );
}

function RotatePrompt() {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground p-6 text-center gap-4">
      <div className="text-5xl animate-pulse" style={{ transform: "rotate(90deg)" }}>📱</div>
      <div className="font-mono text-sm uppercase tracking-widest text-foreground/80">Rotate your device</div>
      <div className="font-mono text-xs text-foreground/50 max-w-xs">OgunArena is best played in landscape. Turn your phone sideways to enter the arena.</div>
    </div>
  );
}

function HUD({ snap, onRematch, onChange, muted, onOpenAudio }: { snap: GameSnapshot; onRematch: () => void; onChange: () => void; muted: boolean; onOpenAudio: () => void }) {
  return (
    <>
      <div className="pointer-events-none absolute top-0 left-0 right-0 p-2 sm:p-4 flex gap-2 sm:gap-4 items-start">
        <HpBar p={snap.p1} side="left" />
        <HpBar p={snap.p2} side="right" />
      </div>
      <button
        onClick={onOpenAudio}
        aria-label="Audio settings"
        className="absolute top-2 right-2 sm:top-3 sm:right-3 w-9 h-9 rounded-full border border-foreground/20 bg-background/40 backdrop-blur-sm flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-foreground/10 z-30"
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

function TouchControls({ engine, snap }: { engine: GameEngine; snap: GameSnapshot }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="flex justify-between items-end px-4">
        <PlayerControls
          side="left"
          color="oklch(0.85 0.18 210)"
          p={snap.p1}
          onMove={(x) => {
            engine.setIntent("p1", { left: x < -0.25, right: x > 0.25 });
          }}
          onJump={() => engine.pressJump("p1")}
          onFire={() => engine.pressFire("p1")}
          onPunch={() => engine.pressMelee("p1")}
          onTele={() => engine.pressTeleport("p1")}
        />
        <PlayerControls
          side="right"
          color="oklch(0.72 0.28 340)"
          p={snap.p2}
          onMove={(x) => {
            engine.setIntent("p2", { left: x < -0.25, right: x > 0.25 });
          }}
          onJump={() => engine.pressJump("p2")}
          onFire={() => engine.pressFire("p2")}
          onPunch={() => engine.pressMelee("p2")}
          onTele={() => engine.pressTeleport("p2")}
        />
      </div>
    </div>
  );
}

function PlayerControls({
  side, color, p, onMove, onJump, onFire, onPunch, onTele,
}: {
  side: "left" | "right";
  color: string;
  p: GameSnapshot["p1"];
  onMove: (x: number) => void;
  onJump: () => void;
  onFire: () => void;
  onPunch: () => void;
  onTele: () => void;
}) {
  return (
    <div className={`flex items-end gap-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <Joystick color={color} onMove={onMove} onJump={onJump} />
      <div className="flex flex-col gap-1.5">
        <PowerButton color={color} cd={p.meleeCd} max={p.meleeCdMax} label={p.meleeName} short="✊" onPress={onPunch} />
        <PowerButton color={color} cd={p.fireCd} max={p.fireCdMax} label="Fire" short="⚡" onPress={onFire} />
        <PowerButton color={color} cd={p.teleCd} max={p.teleCdMax} label="Tele" short="✦" onPress={onTele} />
      </div>
    </div>
  );
}

function Joystick({ color, onMove, onJump }: { color: string; onMove: (x: number) => void; onJump: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const lastUpY = useRef(0);

  const update = (clientX: number, clientY: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = clientX - cx, dy = clientY - cy;
    const max = r.width / 2 - 6;
    const d = Math.hypot(dx, dy) || 1;
    const cl = Math.min(d, max);
    const nx = (dx / d) * cl, ny = (dy / d) * cl;
    setKnob({ x: nx, y: ny });
    onMove(nx / max);
    if (ny / max < -0.55 && Date.now() - lastUpY.current > 350) {
      lastUpY.current = Date.now();
      onJump();
    }
  };

  return (
    <div
      ref={ref}
      className="relative w-[112px] h-[112px] rounded-full border-2 backdrop-blur-md bg-background/30 pointer-events-auto touch-none"
      style={{ borderColor: color }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        idRef.current = e.pointerId;
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (idRef.current === e.pointerId) update(e.clientX, e.clientY); }}
      onPointerUp={(e) => {
        if (idRef.current !== e.pointerId) return;
        idRef.current = null;
        setKnob({ x: 0, y: 0 });
        onMove(0);
      }}
      onPointerCancel={() => { idRef.current = null; setKnob({ x: 0, y: 0 }); onMove(0); }}
    >
      <div
        className="absolute top-1/2 left-1/2 w-12 h-12 -mt-6 -ml-6 rounded-full border-2"
        style={{
          borderColor: color,
          background: `color-mix(in oklab, ${color} 25%, transparent)`,
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transition: idRef.current == null ? "transform 0.15s ease-out" : "none",
        }}
      />
    </div>
  );
}

function PowerButton({ color, cd, max, label, short, onPress }: { color: string; cd: number; max: number; label: string; short: string; onPress: () => void }) {
  const ready = cd <= 0;
  const pct = ready ? 100 : (1 - cd / max) * 100;
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); if (ready) onPress(); }}
      className="relative w-[58px] h-[58px] rounded-full border-2 backdrop-blur-md bg-background/30 pointer-events-auto touch-none flex flex-col items-center justify-center font-mono leading-none active:scale-95 transition-transform"
      style={{
        borderColor: ready ? color : "oklch(0.4 0.05 250)",
        color: ready ? color : "oklch(0.55 0.03 250)",
        opacity: ready ? 1 : 0.65,
      }}
      aria-label={label}
    >
      <div
        className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
        style={{ clipPath: "circle(50%)" }}
      >
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${pct}%`, background: `color-mix(in oklab, ${color} 22%, transparent)` }} />
      </div>
      <span className="relative text-lg">{short}</span>
      <span className="relative text-[8px] tracking-widest uppercase mt-0.5 truncate max-w-[52px]">{label}</span>
    </button>
  );
}

function AudioPanel({
  open, muted, onToggleMute, sfxVol, musicVol, onSfx, onMusic, onClose,
}: {
  open: boolean; muted: boolean; onToggleMute: () => void;
  sfxVol: number; musicVol: number;
  onSfx: (v: number) => void; onMusic: (v: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute top-14 right-2 sm:top-14 sm:right-3 z-30 w-60 rounded-lg border border-foreground/20 bg-background/85 backdrop-blur-md p-3 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-xs uppercase tracking-widest text-foreground/80">Audio</div>
        <button onClick={onClose} className="text-foreground/50 hover:text-foreground text-xs">✕</button>
      </div>
      <button
        onClick={onToggleMute}
        className="w-full mb-3 px-2 py-1.5 rounded border border-foreground/15 hover:bg-foreground/10 font-mono text-[10px] uppercase tracking-widest text-foreground/80"
      >
        {muted ? "🔇 Muted" : "🔊 Sound on"}
      </button>
      <label className="block font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-1">SFX · {Math.round(sfxVol * 100)}</label>
      <input type="range" min={0} max={100} value={Math.round(sfxVol * 100)} onChange={(e) => onSfx(Number(e.target.value) / 100)} className="w-full mb-3 accent-foreground" />
      <label className="block font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-1">Music · {Math.round(musicVol * 100)}</label>
      <input type="range" min={0} max={100} value={Math.round(musicVol * 100)} onChange={(e) => onMusic(Number(e.target.value) / 100)} className="w-full accent-foreground" />
    </div>
  );
}

