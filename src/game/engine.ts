// OgunArena — Canvas 2D engine v3 (a Blkdom production)
// Per-skin signature melees with impact frames, ragdoll, slow-mo, SFX.

import { computeWalkPose, computeAttackPose, computeRagdollPose, computeFlightPose, blendPose, type Pose } from "./animation";
import { getMap, type MapId } from "./maps";
import { getSkin, type Skin, type SkinId } from "./skins";
import { MOVES, type MoveSpec } from "./combat";
import { Sfx } from "./sfx";
import { createWobble, stepWobble, applyWobble, applyImpulse, resetWobble, type WobbleState } from "./wobble";
import { CpuController, type Difficulty } from "./ai";

export type PlayerId = "p1" | "p2";

export interface PlayerState {
  id: PlayerId;
  name: string;
  hp: number;
  maxHp: number;
  fireCd: number;
  fireCdMax: number;
  teleCd: number;
  teleCdMax: number;
  meleeCd: number;
  meleeCdMax: number;
  meleeName: string;
  teleporting: boolean;
}

export interface GameSnapshot {
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | null;
  phase: "intro" | "fight" | "ko";
  slowmo: boolean;
  teleTargeting: boolean;
}

interface Fighter {
  id: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  facingT: number;
  onGround: boolean;
  hp: number;
  hitFlash: number;
  fireCd: number;
  teleCd: number;
  teleporting: boolean;
  name: string;
  walkPhase: number;
  attackAnim: number;
  // melee state
  move: MoveSpec;
  meleeCd: number;
  meleeT: number;          // 0..duration during active special
  meleeDur: number;        // total (windup+active+recover)
  meleeKind: string | null;
  meleeHitMask: Set<number>; // for multi-hit (flurry) — counts hits applied
  // ragdoll / recovery
  ragdollT: number;        // active tumble timer (airborne)
  ragdollPhase: number;    // pose driver
  ragdollAng: number;      // current body angle (rad)
  ragdollAV: number;       // angular velocity (rad/s)
  ragdollEnergy: number;   // 0..1, drives tumble intensity, decays
  downedT: number;         // laydown duration on ground (locked)
  getUpT: number;          // remaining rise animation
  getUpDur: number;        // total rise duration
  iframeT: number;         // invulnerability after rise
  ragdollImmuneT: number;  // chain-prevention: still takes damage, no re-ragdoll
  lastLean: number;        // last applied torso lean (for blend)
  // victim slow (a-train)
  slowedT: number;
  // afterimage trail
  trail: Array<{ x: number; y: number; phase: number; vx: number; onGround: boolean; vy: number; facing: 1 | -1; pose: Pose }>;
  skin: Skin;
  // flight
  canFly: boolean;
  flying: boolean;
  hoverPhase: number;
  superCd: number;
  // ledge / drop-through state
  dropT: number;
  ledgeFlash: number;
  // jump feel: coyote + buffer + variable height
  coyoteT: number;
  jumpBufferT: number;
  jumpHeldT: number;       // remaining time variable-height boost is active
  airJumps: number;        // remaining mid-air jumps
  // soft-body wobble + partial ragdoll (stagger)
  wobble: WobbleState;
  // super-dash
  dash: null | {
    t: number;
    dur: number;
    x0: number; y0: number;
    cx: number; cy: number;       // bezier control
    tx: number; ty: number;       // target
    target: PlayerId;
    landed: boolean;
  };
}

interface Projectile {
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  glow: string;
  kind: "bolt" | "batarang" | "web";
  damage?: number;
  homing?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Shockwave { x: number; y: number; r: number; rMax: number; life: number; maxLife: number; color: string; }
interface Beam { owner: PlayerId; x: number; y: number; angle: number; length: number; life: number; }

interface Platform {
  x: number; y: number; w: number; h: number;
  // "platform" = thin one-way ledge (jump up through, land on top, drop-through with down).
  // "cover"    = solid block: lands on top AND blocks horizontal movement & projectiles.
  kind: "platform" | "cover";
  accent?: string;
}

export interface Intents {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  teleport: boolean;
  melee: boolean;
  // Analog flight steering, -1..1. When flying, replaces ground walk input.
  ax: number;
  ay: number;
  // Toggle flight on/off (edge-triggered)
  toggleFlight: boolean;
}

const W = 1280;
const H = 720;
const GROUND_Y = 600;
const GRAVITY = 1500;
const FALL_GRAVITY_MUL = 1.55;     // heavier on the way down → snappy arc
const LOW_JUMP_GRAVITY_MUL = 1.9;  // stop boosting when jump released early
const MOVE_SPEED = 210;
const ACCEL = 1400;
const FRICTION = 1600;
const AIR_CONTROL = 0.55;          // accel multiplier in air
const JUMP_V = 640;
const JUMP_HOLD_T = 0.18;          // window during which holding jump keeps gravity light
const COYOTE_T = 0.10;             // post-leave grace
const JUMP_BUFFER_T = 0.13;        // press buffer
const MAX_AIR_JUMPS = 1;            // double-jump for non-flyers
const FIGHTER_H = 90;
const FIGHTER_W = 30;

const FIRE_CD = 0.8;
const TELE_CD = 4.0;
const FIRE_DAMAGE = 12;
const FIRE_KNOCKBACK = 320;

// Flight tuning
const FLY_ACCEL = 1300;          // px/s^2 toward target velocity
const FLY_MAX = 360;             // top airspeed (px/s)
const FLY_DAMP = 2.6;            // velocity damping per second when no input
const HOVER_AMP = 4.5;           // pixels of idle hover bob
const HOVER_RATE = 1.6;          // hover frequency (Hz-ish)

// Super-Punch
const SUPER_CD = 4.5;
const SUPER_DAMAGE = 46;
const SUPER_KB_X = 1280;
const SUPER_KB_Y = -460;
const SUPER_HITSTOP = 0.34;
const SUPER_SLOWMO = 0.7;
const SUPER_RAGDOLL = 1.3;
const SUPER_SHAKE = 52;

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private last = 0;
  private raf = 0;
  private running = false;
  private elapsed = 0;
  private lowPower = false;
  private slowFrames = 0;
  private snapAccum = 0;

  private mapId: MapId = "neon-city";
  private p1Skin: SkinId = "spiderman";
  private p2Skin: SkinId = "homelander";

  private p1!: Fighter;
  private p2!: Fighter;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private beams: Beam[] = [];
  // Multi-tier interactive level: low cover blocks, mid ledges, a high vantage.
  private platforms: Platform[] = [
    // Low cover blocks (solid) — partial cover / tactical positioning
    { x: 180, y: 540, w: 90, h: 60, kind: "cover", accent: "oklch(0.55 0.10 250)" },
    { x: 1010, y: 540, w: 90, h: 60, kind: "cover", accent: "oklch(0.55 0.10 250)" },
    // Mid ledges (one-way, jump-through, drop-through)
    { x: 280, y: 460, w: 220, h: 12, kind: "platform" },
    { x: 780, y: 460, w: 220, h: 12, kind: "platform" },
    // High vantage center
    { x: 540, y: 340, w: 200, h: 12, kind: "platform" },
  ];

  private intents: Record<PlayerId, Intents> = {
    p1: { left: false, right: false, jump: false, fire: false, teleport: false, melee: false, ax: 0, ay: 0, toggleFlight: false },
    p2: { left: false, right: false, jump: false, fire: false, teleport: false, melee: false, ax: 0, ay: 0, toggleFlight: false },
  };

  private teleTargeting: PlayerId | null = null;
  private slowmoT = 0;
  private slowmoMode: "tele" | "impact" | null = null;
  private hitstopT = 0;
  private impactFlash = 0;

  private shake = 0;
  private introT = 1.5;
  private phase: "intro" | "fight" | "ko" = "intro";
  private winner: PlayerId | null = null;

  // Smoothed camera that frames both fighters and zooms in for closeups.
  private camX = W / 2;
  private camY = GROUND_Y - 180;
  private camZoom = 1.6;

  public onSnapshot: ((s: GameSnapshot) => void) | null = null;

  private cpuEnabled = false;
  private cpuDifficulty: Difficulty = "hard";
  private cpu: CpuController | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    this.ctx = ctx;
    this.reset();
  }

  configure(mapId: MapId, p1Skin: SkinId, p2Skin: SkinId, opts?: { cpu?: boolean; difficulty?: import("./ai").Difficulty }) {
    this.mapId = mapId;
    this.p1Skin = p1Skin;
    this.p2Skin = p2Skin;
    if (opts) {
      this.cpuEnabled = !!opts.cpu;
      this.cpuDifficulty = opts.difficulty ?? this.cpuDifficulty;
    }
    this.reset();
    this.cpu = this.cpuEnabled ? new CpuController(this, "p2", this.cpuDifficulty) : null;
  }

  setDifficulty(d: import("./ai").Difficulty) {
    this.cpuDifficulty = d;
    this.cpu?.setDifficulty(d);
  }

  isCpuEnabled() { return this.cpuEnabled; }

  // ---- AI helpers ----
  getFighterRect(id: PlayerId) {
    const f = id === "p1" ? this.p1 : this.p2;
    return {
      x: f.x, y: f.y, vx: f.vx, vy: f.vy,
      onGround: f.onGround, facing: f.facing,
      meleeKind: f.meleeKind, hp: f.hp,
    };
  }

  getSkinIdFor(id: PlayerId): SkinId {
    return (id === "p1" ? this.p1 : this.p2).skin.id;
  }

  // Returns horizontal distance to nearest hostile projectile heading at `id`,
  // or null if none.
  nearestProjectileTowards(id: PlayerId): number | null {
    const f = id === "p1" ? this.p1 : this.p2;
    let best: number | null = null;
    for (const pr of this.projectiles) {
      if (pr.owner === id) continue;
      const dx = f.x - pr.x;
      // Only count projectiles moving toward us
      if (Math.sign(pr.vx) !== Math.sign(dx) && pr.vx !== 0) continue;
      const ad = Math.abs(dx);
      if (best == null || ad < best) best = ad;
    }
    return best;
  }

  // AI-driven teleport: skip the slow-mo aim flow.
  aiTeleportTo(id: PlayerId, sx: number, sy: number) {
    const f = id === "p1" ? this.p1 : this.p2;
    if (f.teleCd > 0 || f.teleporting) return;
    f.teleCd = TELE_CD;
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 24);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy));
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 32);
  }

  reset() {
    this.p1 = this.makeFighter("p1", 260, getSkin(this.p1Skin));
    this.p2 = this.makeFighter("p2", 1020, getSkin(this.p2Skin));
    this.p2.facing = -1; this.p2.facingT = -1;
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.beams = [];
    this.teleTargeting = null;
    this.slowmoT = 0; this.slowmoMode = null;
    this.hitstopT = 0; this.impactFlash = 0;
    this.shake = 0;
    this.introT = 1.2;
    this.phase = "intro";
    this.winner = null;
    this.emit();
  }

  private makeFighter(id: PlayerId, x: number, skin: Skin): Fighter {
    const move = MOVES[skin.id];
    const canFly = skin.id === "homelander" || skin.id === "superman";
    return {
      id, x, y: GROUND_Y - FIGHTER_H,
      vx: 0, vy: 0, facing: 1, facingT: 1,
      onGround: true, hp: 100, hitFlash: 0,
      fireCd: 0, teleCd: 0, teleporting: false,
      name: skin.name,
      walkPhase: 0, attackAnim: 0, skin,
      move, meleeCd: 0, meleeT: 0, meleeDur: 0, meleeKind: null,
      meleeHitMask: new Set(),
      ragdollT: 0, ragdollPhase: 0, ragdollAng: 0, ragdollAV: 0, ragdollEnergy: 0,
      downedT: 0, getUpT: 0, getUpDur: 0, iframeT: 0, ragdollImmuneT: 0, lastLean: 0,
      slowedT: 0,
      trail: [],
      canFly, flying: canFly, hoverPhase: 0, superCd: 0,
      dropT: 0, ledgeFlash: 0,
      coyoteT: 0, jumpBufferT: 0, jumpHeldT: 0, airJumps: 0,
      wobble: createWobble(),
      dash: null,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.033, (t - this.last) / 1000);
      this.last = t;
      // Adaptive perf guard: if frames consistently exceed ~22ms, drop to lowPower
      if (dt > 1 / 45) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (!this.lowPower && this.slowFrames > 30) this.lowPower = true;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  setIntent(p: PlayerId, intent: Partial<Intents>) { Object.assign(this.intents[p], intent); }
  pressFire(p: PlayerId) { this.intents[p].fire = true; }
  pressTeleport(p: PlayerId) { this.intents[p].teleport = true; }
  pressJump(p: PlayerId) {
    this.intents[p].jump = true;
    const f = p === "p1" ? this.p1 : this.p2;
    if (f) f.jumpBufferT = JUMP_BUFFER_T;
  }
  pressMelee(p: PlayerId) { this.intents[p].melee = true; }
  setAirSteering(p: PlayerId, ax: number, ay: number) {
    this.intents[p].ax = Math.max(-1, Math.min(1, ax));
    this.intents[p].ay = Math.max(-1, Math.min(1, ay));
  }
  pressToggleFlight(p: PlayerId) { this.intents[p].toggleFlight = true; }

  /** Returns true if the fighter can fly. */
  canFly(p: PlayerId) { return (p === "p1" ? this.p1 : this.p2).canFly; }
  isFlying(p: PlayerId) { return (p === "p1" ? this.p1 : this.p2).flying; }

  /** Trigger a cinematic super-dash from `attacker` to the opposing fighter. */
  pressSuperDash(attacker: PlayerId): boolean {
    const a = attacker === "p1" ? this.p1 : this.p2;
    const t = attacker === "p1" ? this.p2 : this.p1;
    if (!a.canFly || !a.flying) return false;
    if (a.dash || a.meleeKind || a.ragdollT > 0 || a.downedT > 0 || a.getUpT > 0) return false;
    if (a.superCd > 0) return false;
    a.superCd = SUPER_CD;
    const x0 = a.x, y0 = a.y + FIGHTER_H * 0.4;
    const tx = t.x, ty = t.y + FIGHTER_H * 0.4;
    // Curved path: control point offset perpendicular to (dx,dy) for arc.
    const dx = tx - x0, dy = ty - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const arc = Math.min(220, len * 0.35) * (a.id === "p1" ? -1 : 1);
    const cx = (x0 + tx) / 2 + nx * arc;
    const cy = (y0 + ty) / 2 + ny * arc - 60; // bias upward for cinematic arc
    const dur = Math.max(0.32, Math.min(0.7, len / 1500));
    a.dash = { t: 0, dur, x0, y0, cx, cy, tx, ty, target: t.id, landed: false };
    a.facing = dx >= 0 ? 1 : -1;
    Sfx.play("whoosh", 0.9);
    return true;
  }

  /** Map a CSS-pixel point to world/stage coords using the live camera. */
  cssToStage(cx: number, cy: number) {
    const rect = this.canvas.getBoundingClientRect();
    // viewScale/Off are in canvas-bitmap units (DPR-scaled).
    const dprX = this.canvas.width / Math.max(1, rect.width);
    const dprY = this.canvas.height / Math.max(1, rect.height);
    const px = (cx - rect.left) * dprX;
    const py = (cy - rect.top) * dprY;
    return { sx: (px - this.viewOffX) / this.viewScale, sy: (py - this.viewOffY) / this.viewScale };
  }

  handlePointer(canvasX: number, canvasY: number) {
    if (!this.teleTargeting) return;
    const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
    const { sx, sy } = this.cssToStage(canvasX, canvasY);
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 24);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy - FIGHTER_H / 2));
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 32);
    this.teleTargeting = null;
    if (this.slowmoMode === "tele") { this.slowmoT = 0; this.slowmoMode = null; }
    this.emit();
  }

  isTeleTargeting() { return this.teleTargeting; }

  setLowPower(v: boolean) { this.lowPower = v; }

  private update(dt: number) {
    this.elapsed += dt;
    this.impactFlash = Math.max(0, this.impactFlash - dt * 4);

    // Hitstop freezes simulation for a few frames (render still runs)
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      // tick down particles a bit so they don't pile
      for (const p of this.particles) p.life -= dt * 0.3;
      this.particles = this.particles.filter(p => p.life > 0);
      this.snapAccum += dt;
      if (this.snapAccum >= 0.1) { this.snapAccum = 0; this.emit(); }
      return;
    }

    const timeScale = this.slowmoT > 0 ? 0.18 : 1;
    const sdt = dt * timeScale;
    this.slowmoT = Math.max(0, this.slowmoT - dt);
    if (this.slowmoT <= 0) this.slowmoMode = null;

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) this.phase = "fight";
    }

    // Ambient floor bubbles removed — kept the screen too busy.
    const maxParticles = this.lowPower ? 120 : 400;

    if (this.cpu && this.phase === "fight") {
      this.cpu.update(dt, this.buildSnapshot());
    }

    if (this.phase === "fight") {
      this.updateFighter(this.p1, sdt);
      this.updateFighter(this.p2, sdt);
      if (!this.p1.ragdollT && !this.p1.downedT && !this.p1.getUpT) this.p1.facing = this.p2.x > this.p1.x ? 1 : -1;
      if (!this.p2.ragdollT && !this.p2.downedT && !this.p2.getUpT) this.p2.facing = this.p1.x > this.p2.x ? 1 : -1;
      this.resolveMelees();
    }
    for (const f of [this.p1, this.p2]) {
      f.facingT += (f.facing - f.facingT) * Math.min(1, dt * 8);
    }

    for (const pr of this.projectiles) {
      if (pr.kind === "batarang" && pr.homing) {
        const target = pr.owner === "p1" ? this.p2 : this.p1;
        const dx = target.x - pr.x, dy = target.y + 30 - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        pr.vx += (dx / d) * 600 * sdt;
        pr.vy += (dy / d) * 600 * sdt;
        const sp = Math.hypot(pr.vx, pr.vy);
        const cap = 720;
        if (sp > cap) { pr.vx = pr.vx / sp * cap; pr.vy = pr.vy / sp * cap; }
      }
      pr.x += pr.vx * sdt; pr.y += pr.vy * sdt; pr.life -= dt;
      // Cover blocks projectiles (web/batarang excluded — web is a tether, batarang homes)
      if (pr.kind === "bolt") {
        for (const pl of this.platforms) {
          if (pl.kind !== "cover") continue;
          if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) {
            this.burst(pr.x, pr.y, pr.glow, 14);
            this.shake = Math.max(this.shake, 6);
            pr.life = 0;
            break;
          }
        }
      }
      if (pr.kind === "bolt" && (!this.lowPower || Math.random() < 0.5)) {
        this.particles.push({
          x: pr.x, y: pr.y,
          vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
          life: 0.4, maxLife: 0.4, color: pr.glow, size: 3,
        });
      }
    }
    for (const pr of this.projectiles) {
      const target = pr.owner === "p1" ? this.p2 : this.p1;
      if (this.phase !== "fight") continue;
      const hitR = pr.kind === "batarang" ? 18 : (pr.kind === "web" ? 14 : FIGHTER_W);
      if (Math.abs(pr.x - target.x) < hitR && pr.y > target.y && pr.y < target.y + FIGHTER_H) {
        if (target.iframeT > 0 || target.downedT > 0 || target.getUpT > 0) { pr.life = 0; continue; }
        const dmg = pr.damage ?? FIRE_DAMAGE;
        target.hp = Math.max(0, target.hp - dmg);
        target.hitFlash = 0.25;
        if (pr.kind === "web") {
          // pull target toward owner
          const owner = pr.owner === "p1" ? this.p1 : this.p2;
          target.vx = -Math.sign(target.x - owner.x) * 720;
          target.vy = -180;
          target.onGround = false;
          Sfx.play("whoosh", 0.7);
        } else {
          target.vx += Math.sign(pr.vx || target.x - (pr.owner === "p1" ? this.p1.x : this.p2.x)) * FIRE_KNOCKBACK;
          target.vy = -240;
          target.onGround = false;
        }
        this.shake = 14;
        this.hitstopT = Math.max(this.hitstopT, 0.025);
        this.impactFlash = Math.max(this.impactFlash, 0.55);
        if (target.wobble.staggerImmuneT <= 0) {
          const dir = (Math.sign(pr.vx) || 1) as 1 | -1;
          target.wobble.staggerT = 0.22;
          target.wobble.staggerDir = dir;
          target.wobble.staggerMag = 0.6;
          applyImpulse(target.wobble, dir, -0.35, 0.7);
        }
        this.burst(pr.x, pr.y, pr.glow, 18);
        Sfx.play(pr.kind === "batarang" ? "punch" : (pr.kind === "web" ? "thud" : "punch"), 0.7);
        pr.life = 0;
        if (target.hp <= 0 && this.phase === "fight") {
          this.phase = "ko"; this.winner = pr.owner;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -50 && p.x < W + 50);

    for (const p of this.particles) { p.x += p.vx * sdt; p.y += p.vy * sdt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const sw of this.shockwaves) {
      sw.life -= dt; sw.r += (sw.rMax - sw.r) * Math.min(1, dt * 4);
    }
    this.shockwaves = this.shockwaves.filter(s => s.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);

    this.shake = Math.max(0, this.shake - dt * 40);

    this.snapAccum += dt;
    if (this.snapAccum >= 0.1 || this.phase !== "fight") {
      this.snapAccum = 0;
      this.emit();
    }

    for (const id of ["p1", "p2"] as PlayerId[]) {
      this.intents[id].fire = false;
      this.intents[id].teleport = false;
      this.intents[id].jump = false;
      this.intents[id].melee = false;
      this.intents[id].toggleFlight = false;
    }
  }

  private updateFighter(f: Fighter, dt: number) {
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.teleCd = Math.max(0, f.teleCd - dt);
    f.meleeCd = Math.max(0, f.meleeCd - dt);
    f.superCd = Math.max(0, f.superCd - dt);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.attackAnim = Math.max(0, f.attackAnim - dt);
    f.slowedT = Math.max(0, f.slowedT - dt);
    f.hoverPhase += dt * HOVER_RATE * Math.PI * 2;

    // Per-fighter slow (a-train flurry victim)
    const localScale = f.slowedT > 0 ? 0.25 : 1;
    const ldt = dt * localScale;

    // Decay timers (always)
    if (f.iframeT > 0) f.iframeT = Math.max(0, f.iframeT - dt);
    if (f.ragdollImmuneT > 0) f.ragdollImmuneT = Math.max(0, f.ragdollImmuneT - dt);

    // Ragdoll mode bypasses input — physics-driven tumble
    if (f.ragdollT > 0) {
      f.ragdollT -= dt;
      f.ragdollPhase += dt;
      f.vy += GRAVITY * 0.95 * ldt;
      // Air drag
      f.vx *= Math.pow(0.985, dt * 60);
      f.vy *= Math.pow(0.995, dt * 60);
      f.x += f.vx * ldt;
      f.y += f.vy * ldt;
      // Angular: torque from horizontal speed; damp gradually
      const targetAV = Math.sign(f.vx) * Math.min(12, Math.abs(f.vx) * 0.02);
      f.ragdollAV += (targetAV - f.ragdollAV) * Math.min(1, dt * 2);
      f.ragdollAV *= Math.pow(0.97, dt * 60);
      f.ragdollAng += f.ragdollAV * dt;
      // Walls — bounce with energy loss
      if (f.x < 30) { f.x = 30; f.vx = Math.abs(f.vx) * 0.45; f.ragdollAV *= -0.6; this.shake = Math.max(this.shake, 6); }
      if (f.x > W - 30) { f.x = W - 30; f.vx = -Math.abs(f.vx) * 0.45; f.ragdollAV *= -0.6; this.shake = Math.max(this.shake, 6); }
      // Ground impact
      if (f.y + FIGHTER_H >= GROUND_Y) {
        f.y = GROUND_Y - FIGHTER_H;
        const impact = Math.abs(f.vy);
        if (impact > 120) {
          // Bounce, lose energy
          f.vy = -impact * 0.32;
          f.vx *= 0.55;
          f.ragdollAV *= 0.4;
          f.ragdollEnergy = Math.max(0, f.ragdollEnergy - 0.25);
          this.shake = Math.max(this.shake, Math.min(14, impact * 0.05));
          Sfx.play("thud", Math.min(0.6, impact / 600));
          // Dust puff
          if (!this.lowPower) {
            for (let i = 0; i < 6; i++) {
              this.particles.push({
                x: f.x + (Math.random() - 0.5) * 24,
                y: GROUND_Y - 4,
                vx: (Math.random() - 0.5) * 80,
                vy: -20 - Math.random() * 40,
                life: 0.4, maxLife: 0.4,
                color: "oklch(0.7 0.02 60)",
                size: 2 + Math.random() * 2,
              });
            }
          }
        } else {
          f.vy = 0;
          f.vx *= Math.pow(0.6, dt * 60);
          f.ragdollAV *= Math.pow(0.7, dt * 60);
          f.onGround = true;
          // Settle when slow enough
          if (Math.abs(f.vx) < 30 && Math.abs(f.ragdollAV) < 1.2) {
            // Transition: ragdoll → downed (laydown)
            f.ragdollT = 0;
            f.downedT = 0.55; // brief lay on ground
            // Snap ragdoll angle toward nearest 90° (face-down/up) for stable laydown
            const target = Math.abs(Math.sin(f.ragdollAng)) > 0.5 ? Math.PI / 2 * Math.sign(Math.sin(f.ragdollAng)) : 0;
            f.ragdollAng = target;
            f.ragdollAV = 0;
          }
        }
      }
      return;
    }

    // Downed (laying on ground) — locked, then triggers get-up
    if (f.downedT > 0) {
      f.downedT -= dt;
      f.vx *= Math.pow(0.5, dt * 60);
      f.vy = 0;
      f.onGround = true;
      if (f.downedT <= 0) {
        f.getUpDur = 0.45;
        f.getUpT = f.getUpDur;
      }
      return;
    }

    // Get-up animation — locked but visually rising
    if (f.getUpT > 0) {
      f.getUpT -= dt;
      f.vx *= Math.pow(0.4, dt * 60);
      f.vy = 0;
      f.onGround = true;
      if (f.getUpT <= 0) {
        f.iframeT = 1.0;            // 1s post-rise invulnerability
        f.ragdollImmuneT = 2.0;     // additional anti-chain window (no re-ragdoll)
        f.ragdollAng = 0; f.ragdollAV = 0; f.ragdollEnergy = 0;
        resetWobble(f.wobble);
      }
      return;
    }

    // Cinematic super-dash takes over kinematics until it lands.
    if (f.dash) {
      const d = f.dash;
      d.t += dt;
      const u = Math.min(1, d.t / d.dur);
      // Cinematic ease: slow wind-up, explosive accel into target.
      // Cubic ease-in for the first 70%, then snap forward.
      const e = u < 0.7
        ? (u / 0.7) * (u / 0.7) * 0.55
        : 0.55 + ((u - 0.7) / 0.3) * 0.45;
      const om = 1 - e;
      const px = om * om * d.x0 + 2 * om * e * d.cx + e * e * d.tx;
      const py = om * om * d.y0 + 2 * om * e * d.cy + e * e * d.ty;
      // Velocity (derivative) for trail / facing
      f.vx = (px - f.x) / Math.max(0.001, dt);
      f.vy = (py - f.y) / Math.max(0.001, dt);
      f.x = px; f.y = py;
      f.facing = (d.tx - d.x0) >= 0 ? 1 : -1;
      f.onGround = false;
      // Mild slow-mo during the dash for cinematic feel
      if (u < 0.92) this.slowmoT = Math.max(this.slowmoT, 0.05);
      // Dense afterimage trail every frame.
      f.trail.push({
        x: f.x, y: f.y, phase: f.walkPhase, vx: f.vx, vy: f.vy,
        onGround: false, facing: f.facing, pose: this.poseFor(f),
      });
      const cap = this.lowPower ? 8 : 18;
      while (f.trail.length > cap) f.trail.shift();
      // Burst sparks — denser cone behind the fighter
      const sparkN = this.lowPower ? 1 : 3;
      for (let i = 0; i < sparkN; i++) {
        this.particles.push({
          x: f.x + (Math.random() - 0.5) * 22,
          y: f.y + FIGHTER_H * 0.5 + (Math.random() - 0.5) * 22,
          vx: -f.vx * 0.08 + (Math.random() - 0.5) * 80,
          vy: -f.vy * 0.08 + (Math.random() - 0.5) * 80,
          life: 0.55, maxLife: 0.55,
          color: i === 0 ? "oklch(0.95 0.08 80)" : f.skin.glow,
          size: 2 + Math.random() * 3,
        });
      }
      // Leading-edge glow particle (front of fist)
      if (!this.lowPower) {
        this.particles.push({
          x: f.x + f.facing * 22, y: f.y + FIGHTER_H * 0.42,
          vx: f.vx * 0.15, vy: f.vy * 0.15,
          life: 0.25, maxLife: 0.25,
          color: "oklch(0.98 0.05 80)", size: 5 + Math.random() * 3,
        });
      }
      if (u >= 1 && !d.landed) {
        d.landed = true;
        this.resolveSuperPunch(f, d.target);
        f.dash = null;
        f.flying = true; // remain airborne after impact
      }
      return;
    }

    const intent = this.intents[f.id];

    // Active melee progresses regardless of input
    if (f.meleeKind) {
      f.meleeT += dt;
      // Speed flurry creates afterimages constantly
      if (f.meleeKind === "speedFlurry" && !this.lowPower) {
        if (f.trail.length === 0 || f.trail[f.trail.length - 1].phase !== f.walkPhase) {
          // sample handled below
        }
      }
      if (f.meleeT >= f.meleeDur) {
        f.meleeKind = null;
        f.meleeT = 0;
        f.meleeHitMask.clear();
      }
    }

    // Flyers stay airborne — flight is always on, no toggle needed.
    if (f.canFly) f.flying = true;

    if (f.flying && f.canFly) {
      // ---- Flight kinematics: smooth analog steering with damping ----
      // Combine analog axes with discrete left/right + jump (=up).
      let ax = intent.ax;
      let ay = intent.ay;
      if (intent.left) ax -= 1;
      if (intent.right) ax += 1;
      if (intent.jump) ay -= 1;
      const mag = Math.hypot(ax, ay);
      if (mag > 1) { ax /= mag; ay /= mag; }
      const targetVx = ax * FLY_MAX;
      const targetVy = ay * FLY_MAX * 0.85;
      const accel = FLY_ACCEL * ldt;
      // Move vx toward target
      if (f.vx < targetVx) f.vx = Math.min(targetVx, f.vx + accel);
      else if (f.vx > targetVx) f.vx = Math.max(targetVx, f.vx - accel);
      if (f.vy < targetVy) f.vy = Math.min(targetVy, f.vy + accel);
      else if (f.vy > targetVy) f.vy = Math.max(targetVy, f.vy - accel);
      // No input → exponential damping back toward natural hover
      const idle = mag < 0.05;
      if (idle) {
        const k = Math.exp(-FLY_DAMP * ldt);
        f.vx *= k; f.vy *= k;
      }
      // Specials still allowed during flight
      if (!f.meleeKind) {
        const canFire = f.skin.id === "heatwave";
        if (canFire && intent.fire && f.fireCd <= 0) this.fire(f);
        if (intent.melee && f.meleeCd <= 0 && f.wobble.staggerT < 0.18) this.startMelee(f);
      }
      f.walkPhase += ldt * 1.4;
      f.x += f.vx * ldt;
      f.y += f.vy * ldt;
      // Idle hover bob — gentle vertical oscillation when not steering
      if (idle) {
        const bob = Math.sin(f.hoverPhase) * HOVER_AMP * 0.6;
        f.y += bob * ldt;
      }
      // Stage bounds + ceiling. Floor clamp keeps flyers always airborne.
      const minY = 30;
      const maxY = GROUND_Y - FIGHTER_H - 40; // never touch the ground
      if (f.x < 30) { f.x = 30; f.vx = 0; }
      if (f.x > W - 30) { f.x = W - 30; f.vx = 0; }
      if (f.y < minY) { f.y = minY; f.vy = Math.max(0, f.vy); }
      if (f.y > maxY) { f.y = maxY; f.vy = Math.min(0, f.vy); }
      f.onGround = false;

      // ---- Premium flight VFX: speed trails + aura + directional sparks ----
      const flySpeed = Math.hypot(f.vx, f.vy);
      const cruising = flySpeed > 90;
      const ascending = f.vy < -120;
      const descending = f.vy > 120;

      if (cruising && !this.lowPower) {
        f.trail.push({
          x: f.x, y: f.y, phase: f.walkPhase, vx: f.vx, vy: f.vy,
          onGround: false, facing: f.facing, pose: this.poseFor(f),
        });
        const cap = Math.min(14, 4 + Math.round(flySpeed / 40));
        while (f.trail.length > cap) f.trail.shift();
      } else if (f.trail.length > 0 && Math.random() < 0.25) {
        f.trail.shift();
      }

      if (!this.lowPower && this.particles.length < 240) {
        if (Math.random() < (idle ? 0.55 : 0.3)) {
          this.particles.push({
            x: f.x + (Math.random() - 0.5) * 18,
            y: f.y + FIGHTER_H * 0.7 + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 20,
            vy: 30 + Math.random() * 30,
            life: 0.5, maxLife: 0.5,
            color: f.skin.glow,
            size: 2 + Math.random() * 2.5,
          });
        }
        if (cruising) {
          const back = -Math.sign(f.vx || f.facing);
          const sparkN = Math.min(3, 1 + Math.floor(flySpeed / 140));
          for (let i = 0; i < sparkN; i++) {
            this.particles.push({
              x: f.x + back * (8 + Math.random() * 14),
              y: f.y + FIGHTER_H * 0.45 + (Math.random() - 0.5) * 18,
              vx: -f.vx * 0.18 + (Math.random() - 0.5) * 30,
              vy: -f.vy * 0.18 + (Math.random() - 0.5) * 30,
              life: 0.32, maxLife: 0.32,
              color: i === 0 ? "oklch(0.97 0.05 80)" : f.skin.glow,
              size: 1.6 + Math.random() * 2,
            });
          }
        }
        if (ascending) {
          for (let i = 0; i < 2; i++) {
            this.particles.push({
              x: f.x + (Math.random() - 0.5) * 14,
              y: f.y + FIGHTER_H * 0.85,
              vx: (Math.random() - 0.5) * 40,
              vy: 120 + Math.random() * 80,
              life: 0.35, maxLife: 0.35,
              color: "oklch(0.97 0.06 80)",
              size: 2.2 + Math.random() * 2,
            });
          }
        }
        if (descending && Math.random() < 0.5) {
          this.particles.push({
            x: f.x + (Math.random() - 0.5) * 16,
            y: f.y + FIGHTER_H * 0.2,
            vx: (Math.random() - 0.5) * 20,
            vy: -40 - Math.random() * 30,
            life: 0.3, maxLife: 0.3,
            color: f.skin.glow,
            size: 1.5 + Math.random() * 1.5,
          });
        }
      }
    } else {
      // ---- Ground / standard physics ----
      let move = 0;
      const locked = f.meleeKind && f.meleeKind !== "laserSweep";
      if (!locked) {
        if (intent.left) move -= 1;
        if (intent.right) move += 1;
      }
      // Soft control penalty during stagger (partial-ragdoll window)
      const staggered = f.wobble.staggerT > 0;
      const moveMul = staggered ? 0.65 : 1;
      const accelMul = staggered ? 0.7 : 1;
      if (move !== 0) {
        const target = move * MOVE_SPEED * moveMul;
        const a = ACCEL * accelMul * ldt;
        if (f.vx < target) f.vx = Math.min(target, f.vx + a);
        else if (f.vx > target) f.vx = Math.max(target, f.vx - a);
      } else {
        const fr = FRICTION * ldt;
        if (f.vx > 0) f.vx = Math.max(0, f.vx - fr);
        else if (f.vx < 0) f.vx = Math.min(0, f.vx + fr);
      }

      // Jump (with drop-through if pressing down on a one-way platform)
      const wantsDrop = !locked && intent.jump && intent.ay > 0.5 && f.onGround;
      if (wantsDrop) {
        // Allow falling through one-way ledges briefly
        f.dropT = 0.18;
        f.onGround = false;
        f.y += 2;
      } else if (!locked && intent.jump && f.onGround) {
        f.vy = -JUMP_V; f.onGround = false;
      }
      if (f.dropT > 0) f.dropT -= ldt;
      if (f.ledgeFlash > 0) f.ledgeFlash -= ldt;

      if (!f.meleeKind) {
        const canFire = f.skin.id === "heatwave";
        const canTele = f.skin.id === "nightcrawler";
        if (canFire && intent.fire && f.fireCd <= 0 && !f.teleporting) this.fire(f);
        if (canTele && intent.teleport && f.teleCd <= 0 && !f.teleporting && this.teleTargeting === null) {
          f.teleporting = true; f.teleCd = TELE_CD;
          this.teleTargeting = f.id;
          this.slowmoT = 5; this.slowmoMode = "tele";
        }
        if (intent.melee && f.meleeCd <= 0 && f.wobble.staggerT < 0.18) this.startMelee(f);
      }

      if (f.onGround) {
        f.walkPhase += ldt * (1.6 + Math.abs(f.vx) * 0.018);
      } else {
        f.walkPhase += ldt * 1.2;
      }

      const prevY = f.y;
      f.vy += GRAVITY * ldt;
      f.x += f.vx * ldt;
      f.y += f.vy * ldt;

      if (f.x < 30) { f.x = 30; f.vx = 0; }
      if (f.x > W - 30) { f.x = W - 30; f.vx = 0; }

      // Cover blocks: solid horizontal collision (lateral) — push fighter out.
      for (const pl of this.platforms) {
        if (pl.kind !== "cover") continue;
        const hw = FIGHTER_W / 2;
        const overlapX = f.x + hw > pl.x && f.x - hw < pl.x + pl.w;
        const overlapY = f.y + FIGHTER_H > pl.y + 2 && f.y < pl.y + pl.h;
        if (overlapX && overlapY) {
          // Resolve along the smaller penetration axis
          const fromLeft = (f.x + hw) - pl.x;
          const fromRight = (pl.x + pl.w) - (f.x - hw);
          if (fromLeft < fromRight) { f.x = pl.x - hw; if (f.vx > 0) f.vx = 0; }
          else { f.x = pl.x + pl.w + hw; if (f.vx < 0) f.vx = 0; }
        }
      }

      let landedOn: Platform | null = null;

      if (f.y + FIGHTER_H >= GROUND_Y) {
        f.y = GROUND_Y - FIGHTER_H; f.vy = 0; f.onGround = true;
      } else { f.onGround = false; }

      for (const pl of this.platforms) {
        const feet = f.y + FIGHTER_H;
        const prevFeet = prevY + FIGHTER_H;
        const hw = FIGHTER_W / 2;
        const overX = f.x + hw > pl.x && f.x - hw < pl.x + pl.w;
        if (!overX) continue;

        // Standard top-landing (works for both kinds)
        if (f.vy >= 0 && prevFeet <= pl.y + 2 && feet >= pl.y && f.dropT <= 0) {
          f.y = pl.y - FIGHTER_H; f.vy = 0; f.onGround = true;
          landedOn = pl; continue;
        }

        // Auto ledge-grab: forgiving catch when arc clips a one-way ledge edge.
        if (pl.kind === "platform" && f.vy >= -40 && f.dropT <= 0 && !f.onGround) {
          const margin = 16; // forgiveness in px above the ledge
          if (feet >= pl.y - margin && feet <= pl.y + 18 && prevFeet <= pl.y + margin + 4) {
            // Snap onto the ledge — feels like an auto-grab
            f.y = pl.y - FIGHTER_H; f.vy = 0; f.onGround = true;
            f.ledgeFlash = 0.3;
            landedOn = pl;
          }
        }
      }

      // Landing dust (only on fresh landings: was airborne last frame)
      if (landedOn && Math.abs(prevY - f.y) > 4 && !this.lowPower) {
        for (let i = 0; i < 5; i++) {
          this.particles.push({
            x: f.x + (Math.random() - 0.5) * 22,
            y: landedOn.y - 2,
            vx: (Math.random() - 0.5) * 70,
            vy: -10 - Math.random() * 25,
            life: 0.35, maxLife: 0.35,
            color: "oklch(0.78 0.04 230)",
            size: 1.6 + Math.random() * 1.6,
          });
        }
      }
    }

    // Soft-body wobble (secondary motion). Skipped during full ragdoll/downed/getup
    // because those branches return early above and own the body completely.
    stepWobble(f.wobble, dt, f.vx, f.vy, f.onGround, f.flying, this.lowPower);

    // Maintain afterimage trail for fast skins
    const fast = f.skin.id === "flash" || f.skin.id === "atrain";
    if (fast && (Math.abs(f.vx) > 200 || f.meleeKind)) {
      f.trail.push({
        x: f.x, y: f.y, phase: f.walkPhase, vx: f.vx, vy: f.vy,
        onGround: f.onGround, facing: f.facing, pose: this.poseFor(f),
      });
      const cap = this.lowPower ? 4 : 8;
      while (f.trail.length > cap) f.trail.shift();
    } else if (f.trail.length > 0) {
      f.trail.shift();
    }
  }

  private startMelee(f: Fighter) {
    const m = f.move;
    f.meleeCd = m.cooldown;
    f.meleeKind = m.kind;
    f.meleeT = 0;
    f.meleeDur = m.windup + m.active + m.recover;
    f.meleeHitMask.clear();
    f.attackAnim = m.windup + m.active;
    if (m.windupSfx) Sfx.play(m.windupSfx, 0.6);
    // Flash blink: instantly teleport behind opponent
    if (m.kind === "phaseStrike") {
      const t = f.id === "p1" ? this.p2 : this.p1;
      const behind = t.x - t.facing * 60;
      this.burst(f.x, f.y + 40, f.skin.glow, 16);
      f.x = Math.max(40, Math.min(W - 40, behind));
      f.facing = t.facing === 1 ? -1 : 1;
      this.burst(f.x, f.y + 40, f.skin.glow, 16);
    }
    if (m.kind === "batCombo") {
      // Throw batarang immediately
      this.projectiles.push({
        owner: f.id, x: f.x + f.facing * 18, y: f.y + 30,
        vx: f.facing * 480, vy: -120, life: 2.5,
        color: "oklch(0.7 0.04 280)", glow: "oklch(0.5 0.04 280)",
        kind: "batarang", homing: true, damage: 10,
      });
    }
    if (m.kind === "webYank") {
      this.projectiles.push({
        owner: f.id, x: f.x + f.facing * 14, y: f.y + 28,
        vx: f.facing * 980, vy: 0, life: 0.45,
        color: "oklch(0.92 0.02 250)", glow: "oklch(0.92 0.02 250)",
        kind: "web", damage: m.damage,
      });
    }
  }

  private resolveMelees() {
    for (const f of [this.p1, this.p2]) {
      if (!f.meleeKind || f.ragdollT > 0 || f.downedT > 0 || f.getUpT > 0) continue;
      const m = f.move;
      const t = f.meleeT;
      const inActive = t >= m.windup && t < m.windup + m.active;

      switch (m.kind) {
        case "heatPunch":
        case "crowbar":
        case "repulsor": {
          if (inActive && f.meleeHitMask.size === 0) {
            const target = f.id === "p1" ? this.p2 : this.p1;
            const dx = (target.x - f.x) * f.facing;
            if (dx > -10 && dx < m.range && Math.abs(target.y - f.y) < FIGHTER_H) {
              this.applyMeleeHit(f, target, m, target.x, target.y + 40);
              f.meleeHitMask.add(1);
              if (m.kind === "repulsor") {
                this.shockwaves.push({
                  x: f.x + f.facing * 30, y: f.y + 40, r: 6, rMax: 70,
                  life: 0.3, maxLife: 0.3, color: "oklch(0.85 0.14 200)",
                });
              }
            }
          }
          break;
        }
        case "groundSmash": {
          if (inActive && f.meleeHitMask.size === 0 && f.onGround) {
            // create radial shockwave at fighter feet
            const cx = f.x; const cy = GROUND_Y - 6;
            this.shockwaves.push({
              x: cx, y: cy, r: 10, rMax: m.range, life: 0.5, maxLife: 0.5,
              color: "oklch(0.6 0.18 145)",
            });
            const target = f.id === "p1" ? this.p2 : this.p1;
            if (Math.abs(target.x - cx) < m.range && target.onGround) {
              this.applyMeleeHit(f, target, m, target.x, target.y + 60);
            }
            f.meleeHitMask.add(1);
            this.shake = Math.max(this.shake, m.shake);
          }
          break;
        }
        case "speedFlurry": {
          // Multi-hit: tick a hit every 0.1s during active window
          if (inActive) {
            const tick = Math.floor((t - m.windup) / 0.1);
            const target = f.id === "p1" ? this.p2 : this.p1;
            const dx = (target.x - f.x) * f.facing;
            if (!f.meleeHitMask.has(tick) && dx > -10 && dx < m.range && Math.abs(target.y - f.y) < FIGHTER_H) {
              if (target.iframeT > 0 || target.downedT > 0 || target.getUpT > 0) { f.meleeHitMask.add(tick); break; }
              f.meleeHitMask.add(tick);
              target.hp = Math.max(0, target.hp - m.damage);
              target.hitFlash = 0.18;
              target.slowedT = 0.6;
              target.vx += f.facing * 60;
              this.shake = Math.max(this.shake, 4);
              this.impactFlash = Math.max(this.impactFlash, 0.3);
              this.hitstopT = Math.max(this.hitstopT, 0.04);
              this.burst(target.x, target.y + 40, f.skin.glow, 6);
              Sfx.play("jab", 0.5);
              if (target.hp <= 0) { this.phase = "ko"; this.winner = f.id; }
            }
          }
          break;
        }
        case "phaseStrike": {
          if (inActive && f.meleeHitMask.size === 0) {
            const target = f.id === "p1" ? this.p2 : this.p1;
            if (Math.abs(target.x - f.x) < m.range + 20) {
              this.applyMeleeHit(f, target, m, target.x, target.y + 30);
              f.meleeHitMask.add(1);
            }
          }
          break;
        }
        case "laserSweep": {
          if (inActive) {
            const target = f.id === "p1" ? this.p2 : this.p1;
            const sx = f.x + f.facing * 6; const sy = f.y + 14;
            const dx = target.x - sx; const dy = (target.y + 30) - sy;
            const angle = Math.atan2(dy, dx);
            const desired = f.facing > 0 ? Math.atan2(dy, Math.abs(dx) || 1) : Math.PI - Math.atan2(dy, Math.abs(dx) || 1);
            this.beams.push({ owner: f.id, x: sx, y: sy, angle: desired, length: m.range, life: 0.05 });
            // hit if within narrow cone toward target
            const ang = Math.abs(((angle - desired + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (ang < 0.18 && Math.hypot(dx, dy) < m.range) {
              const dps = m.damage; // per active second
              if (target.iframeT <= 0 && target.downedT <= 0 && target.getUpT <= 0) {
                target.hp = Math.max(0, target.hp - dps * (1 / 60));
              }
              target.hitFlash = 0.15;
              this.particles.push({
                x: target.x + (Math.random() - 0.5) * 20, y: target.y + 20 + Math.random() * 30,
                vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 80,
                life: 0.5, maxLife: 0.5,
                color: "oklch(0.85 0.18 60)", size: 2 + Math.random() * 2,
              });
              if (target.hp <= 0) { this.phase = "ko"; this.winner = f.id; }
            }
          }
          break;
        }
        case "webYank":
        case "batCombo":
          // resolved by their projectiles
          break;
      }
    }
  }

  private applyMeleeHit(f: Fighter, target: Fighter, m: MoveSpec, fx: number, fy: number) {
    // I-frames: ignore hit entirely
    if (target.iframeT > 0) return;
    // During downed/getup the target is on the floor — skip melee hits (mercy)
    if (target.downedT > 0 || target.getUpT > 0) return;
    target.hp = Math.max(0, target.hp - m.damage);
    target.hitFlash = 0.35;
    // Anti-chain: reduced knockback if recently ragdolled
    const kbScale = target.ragdollImmuneT > 0 ? 0.45 : 1;
    target.vx = f.facing * m.knockbackX * kbScale;
    target.vy = m.knockbackY * kbScale;
    target.onGround = false;
    // Only ragdoll if not in chain-immune window
    if (m.ragdollT > 0 && target.ragdollImmuneT <= 0) {
      target.ragdollT = m.ragdollT;
      target.ragdollPhase = 0;
      target.ragdollAng = 0;
      target.ragdollAV = (Math.random() - 0.5) * 4 + f.facing * 3;
      target.ragdollEnergy = 1;
      // Snap initial impulse so transition into tumble looks continuous
      applyImpulse(target.wobble, f.facing, -0.4, 1.0);
    } else if (target.wobble.staggerImmuneT <= 0) {
      // Partial-ragdoll stagger for small/chain-immune hits
      const mag = Math.max(0.4, Math.min(1, m.damage / 20));
      target.wobble.staggerT = 0.28;
      target.wobble.staggerDir = f.facing;
      target.wobble.staggerMag = mag;
      applyImpulse(target.wobble, f.facing, -0.45, mag);
    }
    this.shake = Math.max(this.shake, m.shake);
    this.hitstopT = Math.max(this.hitstopT, Math.max(m.hitstop, 0.025)); // 1–2 frame hit-freeze min
    if (m.slowmoT > 0) { this.slowmoT = Math.max(this.slowmoT, m.slowmoT); this.slowmoMode = "impact"; }
    this.impactFlash = 1;
    this.burst(fx, fy, f.skin.glow, 28);
    this.shockwaves.push({ x: fx, y: fy, r: 6, rMax: 80, life: 0.35, maxLife: 0.35, color: "oklch(0.95 0.05 80)" });
    Sfx.play(m.hitSfx, 1);
    if (target.hp <= 0 && this.phase === "fight") {
      this.phase = "ko"; this.winner = f.id;
    }
  }

  private resolveSuperPunch(attacker: Fighter, targetId: PlayerId) {
    const t = targetId === "p1" ? this.p1 : this.p2;
    if (t.id === attacker.id) return;
    if (t.iframeT > 0) return;
    t.hp = Math.max(0, t.hp - SUPER_DAMAGE);
    t.hitFlash = 0.55;
    const dir = Math.sign(t.x - attacker.x) || attacker.facing;
    const kbScale = t.ragdollImmuneT > 0 ? 0.6 : 1;
    t.vx = dir * SUPER_KB_X * kbScale;
    t.vy = SUPER_KB_Y * kbScale;
    t.onGround = false;
    // Super always ragdolls (cinematic), but slightly shorter if anti-chain active
    t.ragdollT = t.ragdollImmuneT > 0 ? SUPER_RAGDOLL * 0.6 : SUPER_RAGDOLL;
    t.ragdollPhase = 0;
    t.ragdollAng = 0;
    t.ragdollAV = dir * 6 + (Math.random() - 0.5) * 3;
    t.ragdollEnergy = 1;
    this.shake = Math.max(this.shake, SUPER_SHAKE);
    this.hitstopT = SUPER_HITSTOP;
    this.slowmoT = Math.max(this.slowmoT, SUPER_SLOWMO);
    this.slowmoMode = "impact";
    this.impactFlash = 1;
    // Cinematic glow burst — multi-ring shockwaves + dense particle explosion
    const cx = t.x, cy = t.y + FIGHTER_H * 0.5;
    this.burst(cx, cy, attacker.skin.glow, 64);
    this.burst(cx, cy, "oklch(0.98 0.10 80)", 48);
    this.burst(cx, cy, "oklch(0.92 0.18 30)", 36);
    // Radial spark streaks
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 380 + Math.random() * 320;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.55 + Math.random() * 0.3, maxLife: 0.85,
        color: i % 2 ? attacker.skin.glow : "oklch(0.95 0.08 80)",
        size: 2 + Math.random() * 3,
      });
    }
    this.shockwaves.push({
      x: cx, y: cy, r: 12, rMax: 280,
      life: 0.7, maxLife: 0.7, color: attacker.skin.glow,
    });
    this.shockwaves.push({
      x: cx, y: cy, r: 6, rMax: 180,
      life: 0.5, maxLife: 0.5, color: "oklch(0.98 0.05 80)",
    });
    this.shockwaves.push({
      x: cx, y: cy, r: 20, rMax: 360,
      life: 0.85, maxLife: 0.85, color: "oklch(0.85 0.18 30)",
    });
    Sfx.play("boom", 1);
    Sfx.play("heavy", 0.95);
    Sfx.play("punch", 0.8);
    if (t.hp <= 0 && this.phase === "fight") {
      this.phase = "ko"; this.winner = attacker.id;
    }
  }

  private fire(f: Fighter) {
    f.fireCd = FIRE_CD;
    f.attackAnim = 0.25;
    const speed = 720;
    this.projectiles.push({
      owner: f.id,
      x: f.x + f.facing * 30, y: f.y + 35,
      vx: f.facing * speed, vy: 0, life: 2,
      color: "oklch(0.85 0.18 50)", glow: "oklch(0.75 0.22 45)",
      kind: "bolt",
    });
    Sfx.play("blip", 0.5);
    this.shake = 4;
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6, maxLife: 0.6, color, size: 2 + Math.random() * 2,
      });
    }
  }

  private buildSnapshot(): GameSnapshot {
    return {
      p1: this.snapPlayer(this.p1),
      p2: this.snapPlayer(this.p2),
      winner: this.winner, phase: this.phase,
      slowmo: this.slowmoT > 0,
      teleTargeting: this.teleTargeting !== null,
    };
  }
  private emit() {
    this.onSnapshot?.(this.buildSnapshot());
  }
  private snapPlayer(f: Fighter): PlayerState {
    return {
      id: f.id, name: f.name,
      hp: f.hp, maxHp: 100,
      fireCd: f.fireCd, fireCdMax: FIRE_CD,
      teleCd: f.teleCd, teleCdMax: TELE_CD,
      meleeCd: f.meleeCd, meleeCdMax: f.move.cooldown,
      meleeName: f.move.name,
      teleporting: f.teleporting,
    };
  }

  // ---------------- POSE ----------------
  private poseFor(f: Fighter): Pose {
    if (f.ragdollT > 0) {
      const p = computeRagdollPose(f.ragdollPhase, FIGHTER_H);
      // Override lean with physical body angle for stable visual
      return { ...p, lean: f.ragdollAng };
    }
    if (f.downedT > 0) {
      const p = computeRagdollPose(f.ragdollPhase, FIGHTER_H);
      // Lay flat — snap angle to ±90°, freeze tumble
      const targetAng = f.ragdollAng >= 0 ? Math.PI / 2 : -Math.PI / 2;
      return { ...p, lean: targetAng };
    }
    if (f.getUpT > 0) {
      // Blend from laydown back to upright walk pose
      const t = 1 - (f.getUpT / Math.max(0.001, f.getUpDur));
      const ease = t * t * (3 - 2 * t);
      const flat = computeRagdollPose(f.ragdollPhase, FIGHTER_H);
      const stand = computeWalkPose(0, 0, true, 0, false, f.facing, FIGHTER_H);
      const targetAng = f.ragdollAng >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const lean = targetAng * (1 - ease);
      return blendPose(flat, stand, ease, lean);
    }
    const base = f.flying
      ? computeFlightPose(f.walkPhase, f.vx, f.vy, f.hoverPhase, f.facing, FIGHTER_H)
      : computeWalkPose(f.walkPhase, f.vx, f.onGround, f.vy, f.attackAnim > 0, f.facing, FIGHTER_H);
    let posed: Pose;
    if (f.meleeKind) {
      const m = f.move;
      const wp = m.windup / f.meleeDur;
      const ap = m.active / f.meleeDur;
      const prog = f.meleeT / f.meleeDur;
      posed = computeAttackPose(base, f.meleeKind, prog, { wp, ap }, f.facing);
    } else {
      posed = base;
    }
    return applyWobble(posed, f.wobble, this.lowPower, f.onGround && !f.flying);
  }

  // ---------------- RENDER ----------------
  // Visible world rect for current frame (set by render, used by pointer mapping).
  private viewScale = 1;
  private viewOffX = 0;
  private viewOffY = 0;

  private render() {
    const ctx = this.ctx;
    const shx = (Math.random() - 0.5) * this.shake;
    const shy = (Math.random() - 0.5) * this.shake;

    const cw = this.canvas.width, ch = this.canvas.height;

    // ---- Camera: center between fighters, zoom in for closeup combat. ----
    // Base scale = cover-fit so the screen is always edge-to-edge filled.
    const baseScale = Math.max(cw / W, ch / H);
    // Zoom factor: closer when fighters are near each other, pulls back when far.
    const dx = Math.abs(this.p1.x - this.p2.x);
    const dy = Math.abs((this.p1.y + FIGHTER_H * 0.5) - (this.p2.y + FIGHTER_H * 0.5));
    const spread = Math.hypot(dx, dy);
    // Map spread → desired zoom (close fight = 2.0x, far fight = 1.35x)
    const targetZoom = Math.max(1.35, Math.min(2.0, 520 / Math.max(220, spread)));
    this.camZoom += (targetZoom - this.camZoom) * 0.08;
    const worldScale = baseScale * this.camZoom;

    // Visible world half-extents (in world units)
    const vw = cw / worldScale, vh = ch / worldScale;
    // Target focus = midpoint of fighters (slightly above feet for headroom)
    const tx = (this.p1.x + this.p2.x) / 2;
    const ty = (this.p1.y + this.p2.y) / 2 + FIGHTER_H * 0.3 - 40;
    // Clamp camera so visible window stays inside the stage (no black edges).
    const minCx = vw / 2, maxCx = W - vw / 2;
    const minCy = vh / 2, maxCy = H - vh / 2;
    const clampedTx = vw >= W ? W / 2 : Math.max(minCx, Math.min(maxCx, tx));
    const clampedTy = vh >= H ? H / 2 : Math.max(minCy, Math.min(maxCy, ty));
    // Smooth follow
    this.camX += (clampedTx - this.camX) * 0.12;
    this.camY += (clampedTy - this.camY) * 0.12;

    const offX = cw / 2 - this.camX * worldScale + shx;
    const offY = ch / 2 - this.camY * worldScale + shy;

    this.viewScale = worldScale;
    this.viewOffX = offX;
    this.viewOffY = offY;

    ctx.save();
    // Background fill in case any map leaves gaps
    ctx.fillStyle = "oklch(0.06 0.02 250)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(worldScale, 0, 0, worldScale, offX, offY);

    getMap(this.mapId).drawBackground(ctx, this.elapsed, W, H, GROUND_Y);

    // Particles — soft additive disks with a brighter core for premium feel
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      // Soft halo
      if (!this.lowPower) {
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // Bright core
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Platforms — different look per kind
    for (const pl of this.platforms) {
      if (pl.kind === "cover") {
        // Solid cover block — beveled stone with metallic rim
        const g = ctx.createLinearGradient(pl.x, pl.y, pl.x, pl.y + pl.h);
        g.addColorStop(0, "oklch(0.40 0.04 250)");
        g.addColorStop(1, "oklch(0.18 0.03 250)");
        ctx.fillStyle = g;
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        // Rim highlights
        ctx.fillStyle = "oklch(0.70 0.05 235 / 0.85)";
        ctx.fillRect(pl.x, pl.y, pl.w, 2);
        ctx.fillStyle = "oklch(0.10 0.02 250 / 0.6)";
        ctx.fillRect(pl.x, pl.y + pl.h - 2, pl.w, 2);
        // Side bevels
        ctx.fillStyle = "oklch(0.50 0.05 240 / 0.5)";
        ctx.fillRect(pl.x, pl.y + 2, 2, pl.h - 4);
        ctx.fillStyle = "oklch(0.12 0.02 250 / 0.6)";
        ctx.fillRect(pl.x + pl.w - 2, pl.y + 2, 2, pl.h - 4);
      } else {
        if (!this.lowPower) { ctx.shadowBlur = 18; ctx.shadowColor = "oklch(0.75 0.22 215)"; }
        const g = ctx.createLinearGradient(pl.x, pl.y, pl.x, pl.y + pl.h);
        g.addColorStop(0, "oklch(0.55 0.18 230)");
        g.addColorStop(1, "oklch(0.30 0.14 235)");
        ctx.fillStyle = g;
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.shadowBlur = 0;
        // Top rim
        ctx.fillStyle = "oklch(0.92 0.10 215 / 0.9)";
        ctx.fillRect(pl.x, pl.y, pl.w, 1.2);
      }
    }

    // Ledge-grab flash on fighters
    if (!this.lowPower) {
      ctx.globalCompositeOperation = "lighter";
      for (const f of [this.p1, this.p2]) {
        if (f.ledgeFlash > 0) {
          const a = Math.min(1, f.ledgeFlash / 0.3);
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = f.skin.glow;
          ctx.beginPath();
          ctx.arc(f.x, f.y + FIGHTER_H, 22 + (1 - a) * 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // Shockwaves
    ctx.globalCompositeOperation = "lighter";
    for (const sw of this.shockwaves) {
      const a = Math.max(0, sw.life / sw.maxLife);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = a * 0.3;
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r * 1.2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Afterimage ghosts (drawn under main fighters)
    for (const f of [this.p1, this.p2]) {
      if (f.trail.length === 0) continue;
      for (let i = 0; i < f.trail.length; i++) {
        const a = (i + 1) / (f.trail.length + 1) * 0.4;
        ctx.globalAlpha = a;
        const t = f.trail[i];
        this.drawFighterAt(f, t.x, t.y, t.pose, true);
      }
      ctx.globalAlpha = 1;
    }

    this.drawFighter(this.p1);
    this.drawFighter(this.p2);

    // Beams (laser)
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.beams) {
      const ex = b.x + Math.cos(b.angle) * b.length;
      const ey = b.y + Math.sin(b.angle) * b.length;
      if (!this.lowPower) { ctx.shadowBlur = 22; ctx.shadowColor = "oklch(0.85 0.20 60)"; }
      ctx.strokeStyle = "oklch(0.92 0.20 60)";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = "oklch(0.99 0.05 80)";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalCompositeOperation = "source-over";

    // Projectiles
    ctx.globalCompositeOperation = "lighter";
    for (const pr of this.projectiles) {
      if (pr.kind === "bolt") {
        if (!this.lowPower) { ctx.shadowBlur = 28; ctx.shadowColor = pr.glow; }
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2); ctx.fill();
      } else if (pr.kind === "batarang") {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(this.elapsed * 30);
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(0, -3); ctx.lineTo(10, 0);
        ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (pr.kind === "web") {
        const owner = pr.owner === "p1" ? this.p1 : this.p2;
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(owner.x + owner.facing * 14, owner.y + 28);
        ctx.lineTo(pr.x, pr.y);
        ctx.stroke();
        ctx.fillStyle = pr.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";

    // Switch to screen space for full-screen overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Impact flash vignette
    if (this.impactFlash > 0) {
      ctx.fillStyle = `oklch(0.99 0.05 80 / ${this.impactFlash * 0.35})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    if (this.teleTargeting) {
      ctx.fillStyle = "oklch(0.1 0.05 275 / 0.45)";
      ctx.fillRect(0, 0, cw, ch);
      const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
      if (!this.lowPower) { ctx.shadowBlur = 30; ctx.shadowColor = f.skin.glow; }
      ctx.strokeStyle = f.skin.body;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(20, 20, cw - 40, ch - 40);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    // Cinematic vignette (cheap full-screen radial overlay)
    if (!this.lowPower) {
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }

    ctx.restore();
  }

  private drawFighter(f: Fighter) {
    const pose = this.poseFor(f);
    this.drawFighterAt(f, f.x, f.y, pose, false);
  }

  private drawFighterAt(f: Fighter, x: number, y: number, pose: Pose, ghost: boolean) {
    const ctx = this.ctx;
    const skin = f.skin;

    ctx.save();
    ctx.translate(x, y);
    // Wobbly jiggle: gentle squash + sway around the feet, scaled with motion
    // and amplified briefly after a hit. Keeps stickman feeling alive/jelly.
    if (!ghost && f.ragdollT <= 0) {
      const t = this.elapsed + (f.id === "p1" ? 0 : 1.7);
      const moving = Math.min(1, Math.abs(f.vx) / 280);
      const hit = Math.min(1, f.hitFlash * 4);
      const wobAmp = 0.022 + moving * 0.018 + hit * 0.05;
      const wob = Math.sin(t * 6.2) * wobAmp;
      const breath = 1 + Math.sin(t * 2.4) * 0.012;
      const squash = 1 + Math.sin(t * 5.5) * (0.018 + hit * 0.04);
      ctx.translate(0, FIGHTER_H);
      ctx.scale(squash, 2 - squash);
      ctx.scale(breath, breath);
      ctx.rotate(wob);
      ctx.translate(0, -FIGHTER_H);
    }
    ctx.translate(0, FIGHTER_H);
    ctx.rotate(pose.lean);
    ctx.translate(0, -FIGHTER_H);

    const headR = 10;
    const headY = headR + 2 + pose.headOffsetY;
    const shoulderY = pose.shoulderY;
    const hipY = pose.hipY;

    const bodyColor = f.hitFlash > 0 && !ghost ? "oklch(0.95 0.20 30)" : skin.body;
    const limbColor = skin.limb ?? bodyColor;
    const headColor = skin.head ?? bodyColor;

    if (f.onGround && !ghost && f.ragdollT <= 0) {
      // Soft contact light pool — adds depth and grounding without cost.
      if (!this.lowPower) {
        const grad = ctx.createRadialGradient(0, FIGHTER_H - 1, 1, 0, FIGHTER_H - 1, 30);
        grad.addColorStop(0, `color-mix(in oklab, ${skin.glow} 35%, transparent)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, FIGHTER_H - 1, 30, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "oklch(0 0 0 / 0.32)";
      ctx.beginPath();
      ctx.ellipse(0, FIGHTER_H - 2, 16, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (skin.cape) {
      ctx.save();
      const sway = Math.sin(f.walkPhase * 0.6) * 3 + (-f.facing) * Math.min(10, Math.abs(f.vx) * 0.05);
      ctx.fillStyle = skin.cape;
      ctx.beginPath();
      ctx.moveTo(-7, shoulderY - 2);
      ctx.lineTo(7, shoulderY - 2);
      ctx.quadraticCurveTo(11 + sway * f.facing, hipY + 22, 5 + sway * f.facing, hipY + 40);
      ctx.lineTo(-5 + sway * f.facing, hipY + 40);
      ctx.quadraticCurveTo(-11 + sway * f.facing, hipY + 22, -7, shoulderY - 2);
      ctx.fill();
      if (skin.capeAccent) {
        ctx.fillStyle = skin.capeAccent;
        ctx.fillRect(-1.5 + sway * f.facing * 0.5, shoulderY, 3, hipY + 36 - shoulderY);
      }
      ctx.restore();
    }

    if (skin.streaks && Math.abs(f.vx) > 80 && f.onGround) {
      ctx.save();
      ctx.strokeStyle = skin.streaks;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.5 - i * 0.12;
        ctx.beginPath();
        const sx = -f.facing * (10 + i * 8);
        const ey = 30 + i * 12;
        ctx.moveTo(sx, ey);
        ctx.lineTo(sx - f.facing * 26, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ---- Outer glow pass (one-time, cheap) ----
    // A single soft stroke beneath the main limbs gives a premium neon read.
    const baseW = skin.thickBody ? 5 : 4;
    if (!this.lowPower && !ghost) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = skin.glow;
      ctx.strokeStyle = `color-mix(in oklab, ${skin.glow} 70%, transparent)`;
      ctx.lineWidth = baseW + 2.5;
      ctx.globalAlpha = 0.55;
      drawLimb(ctx, pose.legL); drawLimb(ctx, pose.legR);
      drawLimb(ctx, pose.armL); drawLimb(ctx, pose.armR);
      ctx.beginPath(); ctx.moveTo(0, shoulderY); ctx.lineTo(0, hipY); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ---- Main limb stroke ----
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = baseW;
    drawLimb(ctx, pose.legL);
    drawLimb(ctx, pose.legR);
    drawLimb(ctx, pose.armL);
    drawLimb(ctx, pose.armR);

    // ---- Inner highlight: slim brighter core gives volume ----
    if (!ghost) {
      ctx.save();
      ctx.strokeStyle = `color-mix(in oklab, ${limbColor} 40%, white)`;
      ctx.lineWidth = Math.max(1, baseW - 2.4);
      ctx.globalAlpha = 0.38;
      drawLimb(ctx, pose.legL); drawLimb(ctx, pose.legR);
      drawLimb(ctx, pose.armL); drawLimb(ctx, pose.armR);
      ctx.restore();
    }

    if (skin.boots) {
      drawBoot(ctx, pose.footL, f.facing, skin.boots);
      drawBoot(ctx, pose.footR, f.facing, skin.boots);
    }
    if (skin.gloves) {
      drawFist(ctx, pose.handL, skin.gloves);
      drawFist(ctx, pose.handR, skin.gloves);
    }

    // Torso
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = skin.thickBody ? 6.5 : 5;
    ctx.beginPath();
    ctx.moveTo(0, shoulderY);
    ctx.lineTo(0, hipY);
    ctx.stroke();
    if (!ghost) {
      ctx.save();
      ctx.strokeStyle = `color-mix(in oklab, ${bodyColor} 40%, white)`;
      ctx.lineWidth = skin.thickBody ? 2.5 : 1.8;
      ctx.globalAlpha = 0.42;
      ctx.beginPath(); ctx.moveTo(0, shoulderY + 2); ctx.lineTo(0, hipY - 2); ctx.stroke();
      ctx.restore();
    }

    // Joints
    ctx.fillStyle = bodyColor;
    const jr = skin.thickBody ? 3.2 : 2.8;
    ctx.beginPath(); ctx.arc(-4, shoulderY, jr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, shoulderY, jr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, hipY, jr, 0, Math.PI * 2); ctx.fill();

    if (skin.emblem) {
      const ey = (shoulderY + hipY) / 2;
      ctx.fillStyle = skin.emblem.color;
      ctx.strokeStyle = skin.emblem.color;
      drawEmblem(ctx, skin.emblem, ey, shoulderY, hipY);
    }

    ctx.fillStyle = headColor;
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
    if (!ghost) {
      ctx.save();
      const hg = ctx.createRadialGradient(
        f.facing * -2.5, headY - headR * 0.55, 0.5,
        f.facing * -2.5, headY - headR * 0.55, headR * 1.1,
      );
      hg.addColorStop(0, "rgba(255,255,255,0.32)");
      hg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (skin.skinTone) {
      ctx.fillStyle = skin.skinTone;
      ctx.beginPath();
      ctx.ellipse(f.facing * 1.5, headY + 2, headR - 2.5, headR - 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (skin.cowlEars) {
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.moveTo(-headR + 3, headY - headR + 4);
      ctx.lineTo(-headR - 1, headY - headR - 7);
      ctx.lineTo(-1, headY - headR + 1);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headR - 3, headY - headR + 4);
      ctx.lineTo(headR + 1, headY - headR - 7);
      ctx.lineTo(1, headY - headR + 1);
      ctx.closePath(); ctx.fill();
    }

    if (skin.id === "superman") {
      ctx.fillStyle = "oklch(0.18 0.02 30)";
      ctx.beginPath();
      ctx.moveTo(-headR + 3, headY - headR + 5);
      ctx.quadraticCurveTo(0, headY - headR - 4, headR - 3, headY - headR + 5);
      ctx.quadraticCurveTo(headR - 1, headY - 4, headR - 5, headY - 5);
      ctx.lineTo(-headR + 5, headY - 5);
      ctx.quadraticCurveTo(-headR + 1, headY - 4, -headR + 3, headY - headR + 5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-2 + f.facing * 1, headY - 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (skin.id === "homelander") {
      ctx.fillStyle = "oklch(0.78 0.10 85)";
      ctx.beginPath();
      ctx.moveTo(-headR + 3, headY - headR + 4);
      ctx.quadraticCurveTo(f.facing * 4, headY - headR - 3, headR - 3, headY - headR + 4);
      ctx.quadraticCurveTo(0, headY - headR + 1, -headR + 3, headY - headR + 4);
      ctx.fill();
    }

    const eyeColor = skin.id === "spiderman" ? "oklch(0.95 0.02 250)" : "oklch(0.10 0 0)";
    ctx.fillStyle = eyeColor;
    if (skin.id === "spiderman") {
      ctx.beginPath(); ctx.ellipse(-3.5, headY - 1, 3, 2, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3.5, headY - 1, 3, 2, 0.35, 0, Math.PI * 2); ctx.fill();
    } else if (skin.cowlEars) {
      ctx.fillStyle = "oklch(0.92 0.02 250)";
      ctx.fillRect(-5, headY - 1, 3, 1.6);
      ctx.fillRect(2, headY - 1, 3, 1.6);
    } else {
      ctx.beginPath(); ctx.arc(-3, headY, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, headY, 1.4, 0, Math.PI * 2); ctx.fill();
    }

    if (skin.glowingEyes) {
      const flick = 0.7 + 0.3 * Math.sin(performance.now() * 0.018);
      const charging = f.meleeKind === "laserSweep";
      ctx.save();
      if (!this.lowPower) { ctx.shadowBlur = charging ? 20 : 10; ctx.shadowColor = skin.glowingEyes; }
      ctx.fillStyle = skin.glowingEyes;
      ctx.globalAlpha = charging ? 1 : flick;
      const r = charging ? 2.6 : 1.8;
      ctx.beginPath(); ctx.arc(-3, headY, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, headY, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (skin.beard) {
      ctx.fillStyle = "oklch(0.14 0.02 60)";
      ctx.beginPath();
      ctx.ellipse(0, headY + 5, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-5, headY + 1, 10, 1.4);
    }

    // Crowbar prop for Butcher during melee
    if (skin.id === "butcher" && f.meleeKind === "crowbar" && !ghost) {
      const hand = f.facing > 0 ? pose.handR : pose.handL;
      ctx.strokeStyle = "oklch(0.55 0.02 60)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(hand[0], hand[1]);
      ctx.lineTo(hand[0] + f.facing * 16, hand[1] - 18);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hand[0] + f.facing * 16, hand[1] - 18);
      ctx.lineTo(hand[0] + f.facing * 22, hand[1] - 22);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawLimb(ctx: CanvasRenderingContext2D, j: [number, number, number, number, number, number]) {
  ctx.beginPath();
  ctx.moveTo(j[0], j[1]);
  ctx.quadraticCurveTo(j[2], j[3], j[4], j[5]);
  ctx.stroke();
}

function drawFist(ctx: CanvasRenderingContext2D, p: [number, number], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoot(ctx: CanvasRenderingContext2D, p: [number, number], facing: 1 | -1, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(p[0] + facing * 2, p[1] - 1, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEmblem(
  ctx: CanvasRenderingContext2D,
  emblem: NonNullable<Skin["emblem"]>,
  ey: number,
  shoulderY: number,
  hipY: number,
) {
  switch (emblem.shape) {
    case "circle":
      ctx.beginPath(); ctx.arc(0, ey, 4, 0, Math.PI * 2); ctx.fill(); break;
    case "oval":
      ctx.beginPath(); ctx.ellipse(0, ey, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); break;
    case "shield":
      ctx.beginPath();
      ctx.moveTo(-5, ey - 3); ctx.lineTo(5, ey - 3);
      ctx.lineTo(0, ey + 5); ctx.closePath(); ctx.fill(); break;
    case "stripe":
      ctx.fillRect(-2, shoulderY + 2, 4, hipY - shoulderY - 4); break;
    case "spider":
      ctx.beginPath(); ctx.arc(0, ey, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5, ey - 3); ctx.lineTo(5, ey + 3);
      ctx.moveTo(5, ey - 3); ctx.lineTo(-5, ey + 3);
      ctx.stroke();
      break;
    case "lightning":
      ctx.beginPath();
      ctx.moveTo(-3, ey - 5);
      ctx.lineTo(2, ey - 1);
      ctx.lineTo(-1, ey - 1);
      ctx.lineTo(3, ey + 5);
      ctx.lineTo(-2, ey + 1);
      ctx.lineTo(1, ey + 1);
      ctx.closePath();
      ctx.fill();
      break;
  }
}
