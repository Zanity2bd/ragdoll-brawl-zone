import { useEffect, useRef, useState } from "react";
import { GameEngine, type GameSnapshot, type PlayerId } from "@/game/engine";
import { type MapId } from "@/game/maps";
import { type SkinId } from "@/game/skins";
import type { Difficulty } from "@/game/ai";
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
  const [cpuEnabled, setCpuEnabled] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const cpuEnabledRef = useRef(true);
  useEffect(() => { cpuEnabledRef.current = cpuEnabled; }, [cpuEnabled]);

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
    // high-end gets crisper rendering up to DPR 3.
    const isTouchDev = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = (navigator as any).deviceMemory || 8;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    const lowPower = (isTouchDev && (cores <= 4 || mem <= 3)) || smallScreen;
    const highEnd = !lowPower && cores >= 8 && mem >= 6;
    const dprCap = lowPower ? 1.5 : highEnd ? 3 : 2;

    const resize = () => {
      const parent = canvas.parentElement!;
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", resize);
    vv?.addEventListener("scroll", resize);

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
      // Dedicated Hulk Rage Frenzy keys (B = P1, N = P2 if not CPU)
      if (e.code === "KeyB") {
        e.preventDefault();
        engine.pressFrenzy("p1");
        return;
      }
      if (e.code === "KeyN" && !cpuEnabledRef.current) {
        e.preventDefault();
        engine.pressFrenzy("p2");
        return;
      }
      const m = KEY_MAP[e.code];
      if (!m) return;
      if (m.p === "p2" && cpuEnabledRef.current) return;
      e.preventDefault();
      engine.setIntent(m.p, { [m.action]: true });
    };
    const up = (e: KeyboardEvent) => {
      const m = KEY_MAP[e.code];
      if (!m) return;
      if (m.p === "p2" && cpuEnabledRef.current) return;
      if (m.action === "left" || m.action === "right" || m.action === "jump") {
        engine.setIntent(m.p, { [m.action]: false });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    // Convert CSS coords -> stage coords using the engine's live camera.
    const toStage = (cx: number, cy: number) => engine.cssToStage(cx, cy);

    // Tap on opponent fighter triggers P1's special.
    const tryTapOpponent = (cx: number, cy: number) => {
      if (!cpuEnabledRef.current) return false;
      if (engine.isTeleTargeting()) return false;
      const opp = engine.getFighterRect("p2");
      if (!opp) return false;
      const { sx, sy } = toStage(cx, cy);
      // Generous hitbox around the stickman (W=30, H=90).
      const hitW = 70, hitH = 120;
      if (Math.abs(sx - opp.x) < hitW / 2 && sy > opp.y - 15 && sy < opp.y + hitH) {
        const p1Name = engine.getSkinIdFor("p1");
        // NOTE: Rage Frenzy is NOT triggered by tapping — it must be activated
        // explicitly via the Rage Frenzy HUD button or the dedicated key (B).
        if (engine.canFly("p1") && engine.isFlying("p1")) {
          if (engine.pressSuperDash("p1")) return true;
        }
        if (p1Name === "heatwave") engine.pressFire("p1");
        else if (p1Name === "nightcrawler") engine.pressTeleport("p1");
        else engine.pressMelee("p1");
        return true;
      }
      return false;
    };

    const click = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      if (engine.isTeleTargeting()) {
        engine.handlePointer(e.clientX - r.left, e.clientY - r.top);
        return;
      }
      tryTapOpponent(e.clientX, e.clientY);
    };
    const touch = (e: TouchEvent) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      if (engine.isTeleTargeting()) {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        engine.handlePointer(t.clientX - r.left, t.clientY - r.top);
        return;
      }
      if (tryTapOpponent(t.clientX, t.clientY)) e.preventDefault();
    };
    canvas.addEventListener("click", click);
    canvas.addEventListener("touchstart", touch, { passive: false });

    return () => {
      engine.stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      vv?.removeEventListener("resize", resize);
      vv?.removeEventListener("scroll", resize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("touchstart", touch);
    };
  }, []);

  const engine = engineRef.current;

  const startFight = (m: MapId, p1: SkinId, p2: SkinId, opts: { cpu: boolean; difficulty: Difficulty }) => {
    setCpuEnabled(opts.cpu);
    setDifficulty(opts.difficulty);
    cpuEnabledRef.current = opts.cpu;
    engine?.configure(m, p1, p2, { cpu: opts.cpu, difficulty: opts.difficulty });
    setScreen("fight");
  };

  return (
    <div
      className="relative select-none overflow-hidden"
      style={{ width: "100%", height: "100%", minHeight: "100dvh" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ width: "100%", height: "100%", touchAction: "none", imageRendering: "auto" }}
      />
      {screen === "fight" && snap && (
        <HUD
          snap={snap}
          onRematch={() => engine?.reset()}
          onChange={() => setScreen("map")}
          onOpenAudio={() => setAudioOpen(o => !o)}
          muted={muted}
          onFrenzyP1={() => engineRef.current?.pressFrenzy("p1")}
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
      {screen === "fight" && isTouch && engine && snap && <TouchControls engine={engine} snap={snap} cpu={cpuEnabled} />}

      {screen === "splash" && (
        <Splash onPlay={() => { Sfx.unlock(); setScreen("map"); }} />
      )}
      {screen === "map" && (
        <Lobby onPickMap={(id) => { setMapId(id); setScreen("skin"); }} />
      )}
      {screen === "skin" && (
        <SkinSelect
          onBack={() => setScreen("map")}
          onConfirm={(p1, p2, opts) => { setP1Skin(p1); setP2Skin(p2); startFight(mapId, p1, p2, opts); }}
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

function HUD({ snap, onRematch, onChange, muted, onOpenAudio, onFrenzyP1 }: { snap: GameSnapshot; onRematch: () => void; onChange: () => void; muted: boolean; onOpenAudio: () => void; onFrenzyP1: () => void }) {
  return (
    <>
      <div
        className="pointer-events-none absolute left-0 right-0 flex justify-center"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <div className="flex gap-3 sm:gap-6 items-start w-full px-3 sm:px-6" style={{ maxWidth: "min(1200px, 96vw)" }}>
          <HpBar p={snap.p1} side="left" onFrenzy={onFrenzyP1} />
          <HpBar p={snap.p2} side="right" />
        </div>
      </div>
      <button
        onClick={onOpenAudio}
        aria-label="Audio settings"
        className="absolute rounded-full border border-foreground/20 bg-background/40 backdrop-blur-sm flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-foreground/10 z-30"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          right: "calc(env(safe-area-inset-right, 0px) + 8px)",
          width: "min(10vw, 40px)",
          height: "min(10vw, 40px)",
          fontSize: "min(4vw, 16px)",
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {snap.phase === "intro" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="font-black tracking-widest"
            style={{
              fontSize: "clamp(2.5rem, 12vw, 6rem)",
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
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm px-4">
          <div className="text-center" style={{ animation: "fade-in 0.35s ease-out" }}>
            <div
              className="font-black tracking-widest mb-4"
              style={{
                fontSize: "clamp(3.5rem, 16vw, 8rem)",
                color: snap.winner === "p1" ? "oklch(0.85 0.18 210)" : "oklch(0.72 0.28 340)",
                textShadow: `0 0 40px ${snap.winner === "p1" ? "oklch(0.75 0.22 215)" : "oklch(0.65 0.30 345)"}`,
              }}
            >
              K.O.
            </div>
            <div className="text-foreground/80 mb-6 font-mono" style={{ fontSize: "clamp(0.95rem, 3vw, 1.5rem)" }}>
              {snap.winner === "p1" ? snap.p1.name : snap.p2.name} wins
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={onRematch}
                className="px-6 sm:px-8 py-3 rounded-md font-mono uppercase tracking-widest text-xs sm:text-sm border border-foreground/20 hover:bg-foreground/10 transition-colors"
                style={{ color: "oklch(0.95 0.05 250)" }}
              >
                Rematch
              </button>
              <button
                onClick={onChange}
                className="px-6 sm:px-8 py-3 rounded-md font-mono uppercase tracking-widest text-xs sm:text-sm border border-foreground/20 hover:bg-foreground/10 transition-colors text-foreground/70"
              >
                Change setup
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.slowmo && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-32">
          <div className="font-mono text-xs sm:text-sm tracking-widest text-foreground/70 animate-pulse">
            ◇ SELECT TELEPORT TARGET ◇
          </div>
        </div>
      )}
    </>
  );
}

function HpBar({ p, side, onFrenzy }: { p: GameSnapshot["p1"]; side: "left" | "right"; onFrenzy?: () => void }) {
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
        {p.name === "Heatwave" && (
          <CdPill label={isP1 ? "F · Fire" : "K · Fire"} cd={p.fireCd} max={p.fireCdMax} color={color} />
        )}
        {p.name === "Nightcrawler" && (
          <CdPill label={isP1 ? "G · Tele" : "L · Tele"} cd={p.teleCd} max={p.teleCdMax} color={color} />
        )}
        <CdPill label={`${isP1 ? "J" : ";"} · ${p.meleeName}`} cd={p.meleeCd} max={p.meleeCdMax} color={color} />
      </div>
      {p.hasFrenzy && (
        <FrenzyBar
          cd={p.frenzyCd} max={p.frenzyCdMax} active={p.frenzyActive}
          side={side}
          onActivate={isP1 ? onFrenzy : undefined}
          hint={isP1 ? "B · Tap" : "N"}
        />
      )}
    </div>
  );
}

function FrenzyBar({ cd, max, active, side, onActivate, hint }: { cd: number; max: number; active: boolean; side: "left" | "right"; onActivate?: () => void; hint?: string }) {
  const ready = cd <= 0;
  const pct = ready ? 100 : (1 - cd / max) * 100;
  const fill = active ? "oklch(0.78 0.22 30)" : ready ? "oklch(0.72 0.22 145)" : "oklch(0.55 0.10 145)";
  const glow = active ? "oklch(0.85 0.25 30)" : "oklch(0.78 0.22 145)";
  const clickable = !!onActivate && ready && !active;
  const Wrapper: any = clickable ? "button" : "div";
  return (
    <Wrapper
      onClick={clickable ? onActivate : undefined}
      className={`flex flex-col gap-1 ${side === "right" ? "items-end" : ""} ${clickable ? "pointer-events-auto cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform" : ""}`}
      style={clickable ? { background: "transparent", border: "none", padding: 0 } : undefined}
      aria-label={clickable ? "Activate Rage Frenzy" : undefined}
    >
      <div className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <span
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: ready ? glow : "oklch(0.65 0.04 145)" }}
        >
          {active ? "RAGE FRENZY!" : ready ? `Rage Frenzy ▸ ${hint ?? "READY"}` : "Rage Frenzy"}
        </span>
        {!ready && !active && (
          <span className="font-mono text-[10px] text-foreground/50">{cd.toFixed(1)}s</span>
        )}
      </div>
      <div
        className="h-2 rounded-sm overflow-hidden border"
        style={{
          width: "min(280px, 60vw)",
          borderColor: "oklch(0.3 0.05 145 / 0.6)",
          background: "oklch(0.12 0.02 145 / 0.6)",
        }}
      >
        <div
          className="h-full transition-[width] duration-150"
          style={{
            width: `${pct}%`,
            background: fill,
            boxShadow: ready || active ? `0 0 14px ${glow}` : "none",
            marginLeft: side === "right" ? "auto" : 0,
          }}
        />
      </div>
    </Wrapper>
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

function TouchControls({ engine, snap, cpu }: { engine: GameEngine; snap: GameSnapshot; cpu: boolean }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 pointer-events-none"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <div className={`flex ${cpu ? "justify-start" : "justify-between"} items-end px-3 sm:px-6`}>
        <PlayerControls
          side="left"
          color="oklch(0.85 0.18 210)"
          p={snap.p1}
          onMove={(x, y) => {
            engine.setIntent("p1", { left: x < -0.25, right: x > 0.25 });
            engine.setAirSteering("p1", x, y);
          }}
          onJump={() => {
            engine.setIntent("p1", { jump: true });
            engine.pressJump("p1");
            window.setTimeout(() => engine.setIntent("p1", { jump: false }), 180);
          }}
          onFire={() => engine.pressFire("p1")}
          onPunch={() => engine.pressMelee("p1")}
          onTele={() => engine.pressTeleport("p1")}
          canFly={engine.canFly("p1")}
        />
        {!cpu && (
          <PlayerControls
            side="right"
            color="oklch(0.72 0.28 340)"
            p={snap.p2}
            onMove={(x, y) => {
              engine.setIntent("p2", { left: x < -0.25, right: x > 0.25 });
              engine.setAirSteering("p2", x, y);
            }}
            onJump={() => {
              engine.setIntent("p2", { jump: true });
              engine.pressJump("p2");
              window.setTimeout(() => engine.setIntent("p2", { jump: false }), 180);
            }}
            onFire={() => engine.pressFire("p2")}
            onPunch={() => engine.pressMelee("p2")}
            onTele={() => engine.pressTeleport("p2")}
            canFly={engine.canFly("p2")}
          />
        )}
      </div>
    </div>
  );
}

function PlayerControls({
  side, color, p, onMove, onJump, onFire, onPunch, onTele, canFly,
}: {
  side: "left" | "right";
  color: string;
  p: GameSnapshot["p1"];
  onMove: (x: number, y: number) => void;
  onJump: () => void;
  onFire: () => void;
  onPunch: () => void;
  onTele: () => void;
  canFly?: boolean;
}) {
  const isHeatwave = p.name === "Heatwave";
  const isNightcrawler = p.name === "Nightcrawler";
  const onSpecial = isHeatwave ? onFire : isNightcrawler ? onTele : onPunch;
  const cd = isHeatwave ? p.fireCd : isNightcrawler ? p.teleCd : p.meleeCd;
  const max = isHeatwave ? p.fireCdMax : isNightcrawler ? p.teleCdMax : p.meleeCdMax;
  const label = isHeatwave ? "Fire" : isNightcrawler ? "Teleport" : p.meleeName;
  return (
    <div className={`flex items-end ${side === "right" ? "flex-row-reverse" : ""}`}>
      <Joystick
        color={color}
        onMove={onMove}
        onJump={onJump}
        onSpecial={onSpecial}
        specialCd={cd}
        specialMax={max}
        specialLabel={canFly ? `${label} · Fly` : label}
        verticalSteer={!!canFly}
      />
    </div>
  );
}

function Joystick({
  color, onMove, onJump, onSpecial, specialCd, specialMax, specialLabel, verticalSteer,
}: {
  color: string;
  onMove: (x: number, y: number) => void;
  onJump: () => void;
  onSpecial: () => void;
  specialCd: number;
  specialMax: number;
  specialLabel: string;
  verticalSteer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [charging, setCharging] = useState(0);
  const lastUpY = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const chargeRaf = useRef<number | null>(null);
  const pressStart = useRef(0);
  const movedFar = useRef(false);
  const HOLD_MS = 400;
  const ready = specialCd <= 0;
  const cdPct = ready ? 100 : (1 - specialCd / specialMax) * 100;

  const cancelHold = () => {
    if (holdTimer.current != null) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (chargeRaf.current != null) { cancelAnimationFrame(chargeRaf.current); chargeRaf.current = null; }
    setCharging(0);
  };

  const startHold = () => {
    cancelHold();
    pressStart.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - pressStart.current) / HOLD_MS);
      setCharging(p);
      if (p < 1) chargeRaf.current = requestAnimationFrame(tick);
    };
    chargeRaf.current = requestAnimationFrame(tick);
    holdTimer.current = window.setTimeout(() => {
      if (!movedFar.current && ready) {
        onSpecial();
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
      }
      cancelHold();
    }, HOLD_MS);
  };

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
    onMove(nx / max, ny / max);
    if (Math.hypot(nx, ny) / max > 0.22) {
      movedFar.current = true;
      cancelHold();
    }
    // For non-flyers, swiping up = jump (one-shot). Flyers steer up directly.
    if (!verticalSteer && ny / max < -0.55 && Date.now() - lastUpY.current > 350) {
      lastUpY.current = Date.now();
      onJump();
    }
  };

  const arrow = "absolute text-[10px] leading-none font-bold pointer-events-none select-none";
  return (
    <div
      ref={ref}
      className="relative rounded-full pointer-events-auto touch-none"
      // size scales with viewport so it never feels too small or too big
      style={{
        width: "clamp(110px, 28vw, 160px)",
        height: "clamp(110px, 28vw, 160px)",
        background: `radial-gradient(circle at 50% 45%, color-mix(in oklab, ${color} 55%, transparent) 0%, color-mix(in oklab, ${color} 28%, transparent) 60%, color-mix(in oklab, ${color} 12%, transparent) 100%)`,
        border: `3px solid color-mix(in oklab, ${color} 75%, transparent)`,
        boxShadow: `0 6px 20px color-mix(in oklab, ${color} 35%, transparent), inset 0 -4px 12px rgba(0,0,0,0.25), inset 0 2px 6px rgba(255,255,255,0.15)`,
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        idRef.current = e.pointerId;
        movedFar.current = false;
        update(e.clientX, e.clientY);
        startHold();
      }}
      onPointerMove={(e) => { if (idRef.current === e.pointerId) update(e.clientX, e.clientY); }}
      onPointerUp={(e) => {
        if (idRef.current !== e.pointerId) return;
        idRef.current = null;
        cancelHold();
        movedFar.current = false;
        setKnob({ x: 0, y: 0 });
        onMove(0, 0);
      }}
      onPointerCancel={() => { idRef.current = null; cancelHold(); movedFar.current = false; setKnob({ x: 0, y: 0 }); onMove(0, 0); }}
    >
      <span className={arrow} style={{ top: 6, left: "50%", transform: "translateX(-50%)", color: `color-mix(in oklab, ${color} 90%, white)` }}>▲</span>
      <span className={arrow} style={{ bottom: 6, left: "50%", transform: "translateX(-50%)", color: `color-mix(in oklab, ${color} 90%, white)` }}>▼</span>
      <span className={arrow} style={{ left: 6, top: "50%", transform: "translateY(-50%)", color: `color-mix(in oklab, ${color} 90%, white)` }}>◀</span>
      <span className={arrow} style={{ right: 6, top: "50%", transform: "translateY(-50%)", color: `color-mix(in oklab, ${color} 90%, white)` }}>▶</span>

      {/* Cooldown ring (subtle) */}
      <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeOpacity={0.18} strokeWidth="3" />
        {!ready && (
          <circle
            cx="60" cy="60" r="54" fill="none" stroke={color}
            strokeOpacity={0.55} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(cdPct / 100) * 339.3} 339.3`}
            transform="rotate(-90 60 60)"
          />
        )}
        {charging > 0 && (
          <circle
            cx="60" cy="60" r="54" fill="none" stroke={color}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${charging * 339.3} 339.3`}
            transform="rotate(-90 60 60)"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        )}
      </svg>

      <div
        className="absolute top-1/2 left-1/2 w-14 h-14 -mt-7 -ml-7 rounded-full flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${color} 95%, white) 0%, ${color} 60%, color-mix(in oklab, ${color} 60%, black) 100%)`,
          boxShadow: `0 4px 10px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4)`,
          transform: `translate(${knob.x}px, ${knob.y}px) scale(${1 + charging * 0.08})`,
          transition: idRef.current == null ? "transform 0.15s ease-out" : "none",
          opacity: ready ? 1 : 0.8,
        }}
      >
        <span className="font-mono text-[8px] tracking-widest uppercase" style={{ color: "rgba(0,0,0,0.6)" }}>
          {ready ? "HOLD" : "···"}
        </span>
      </div>

      <div
        className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-widest uppercase whitespace-nowrap pointer-events-none"
        style={{ color: ready ? color : "oklch(0.55 0.02 250)" }}
      >
        {specialLabel}
      </div>
    </div>
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

