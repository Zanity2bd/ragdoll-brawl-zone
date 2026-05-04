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
  // Hulk-only "Rage Frenzy" cinematic special
  frenzyCd: number;
  frenzyCdMax: number;
  hasFrenzy: boolean;
  frenzyActive: boolean;
  // Dual-power system (per character: HOLD-joystick power + TAP-opponent power)
  hasPower1: boolean;
  hasPower2: boolean;
  power1Name: string;
  power2Name: string;
  power1Cd: number; power1CdMax: number;
  power2Cd: number; power2CdMax: number;
  // Status effects from powers
  frozen: boolean;          // currently time-frozen
  freezeRemaining: number;  // seconds left
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
  // Hulk Rage Frenzy state (special cinematic clip)
  frenzy: null | {
    t: number;        // elapsed seconds
    dur: number;      // total duration
    target: PlayerId;
    nextTick: number; // accumulator for damage ticks
    transitionT: number; // 0..0.25 transform-in
    punchPulse: number;  // 0..1, bumped on each tick, decays — drives flash + blur
  };
  frenzyCd: number;
  // Dual powers (HOLD-joystick power1 + TAP-opponent power2)
  power1Cd: number;
  power2Cd: number;
  // Time-freeze status (set by Flash's Time Freeze power on opponent)
  freezeT: number;
  // Generic stun (Solar Flare etc.) — locks input but body stays upright
  stunT: number;
  // Superman Heat-Vision: sustained beam time remaining
  heatVisionT: number;
  // Iron Man Unibeam: charge → fire phases
  unibeamChargeT: number;
  unibeamFireT: number;
  // Batch-2 status
  invisT: number;        // Batman smoke bomb invisibility / iframes
  webSnareT: number;     // Spider-Man web snare lock
  speedBoostT: number;   // A-Train Sonic Sprint
  // Nightcrawler Bamf Combo — scripted 3-hit teleport sequence
  bamfCombo: null | { step: number; t: number; nextAt: number; targetId: PlayerId };
}

interface SmokeCloud { x: number; y: number; r: number; rMax: number; life: number; maxLife: number; }

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
const TELE_CD = 8.0;
const FIRE_DAMAGE = 12;
const FIRE_KNOCKBACK = 320;

// Flight tuning
const FLY_ACCEL = 1700;          // px/s^2 toward target velocity (snappier response)
const FLY_MAX = 420;             // top airspeed (px/s)
const FLY_DAMP = 3.2;            // velocity damping per second when no input
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

// Hulk Rage Frenzy (cinematic video special)
const FRENZY_CD = 18;          // long cooldown — high impact special
const FRENZY_DUR = 4.0;        // seconds (matches video clip)
const FRENZY_TICK = 0.18;      // damage tick interval
const FRENZY_TICK_DMG = 2;     // per tick → ~44 total over full clip (balanced special)
const FRENZY_RANGE = 110;      // close-range gate
const FRENZY_FRAME_COUNT = 123;

// ---- Dual-power system ----
// Flash: Time Freeze (HOLD) + Lightning Blast (TAP)
const TIMEFREEZE_DUR = 5.0;
const TIMEFREEZE_CD = 14;
const LIGHTNING_DUR = 6.0;
const LIGHTNING_CD = 10;
const LIGHTNING_DMG = 22;       // damage on contact (one-time impact)
const LIGHTNING_TICK_DMG = 2.5; // per second arc damage while latched
const LIGHTNING_SPEED = 320;    // px/s chase speed
const LIGHTNING_TURN = 4.5;     // steering responsiveness

interface LightningOrb {
  owner: PlayerId;
  target: PlayerId;
  x: number; y: number;
  vx: number; vy: number;
  life: number;     // remaining seconds
  maxLife: number;
  phase: number;    // animation
  hit: boolean;     // initial impact landed → tick mode
  tickAcc: number;  // sub-second accumulator for tick damage
}

// ---- Batch-1 powers: Superman / Iron Man / Heatwave ----
// Superman
const SOLAR_FLARE_CD = 12;
const SOLAR_FLARE_RADIUS = 320;
const SOLAR_FLARE_DMG = 18;
const SOLAR_FLARE_STUN = 1.6;
const HEAT_VISION_CD = 6;
const HEAT_VISION_DUR = 0.75;
const HEAT_VISION_DPS = 38;
// Iron Man
const UNIBEAM_CD = 10;
const UNIBEAM_CHARGE = 0.45;
const UNIBEAM_FIRE = 0.75;
const UNIBEAM_DPS = 50;
const UNIBEAM_RANGE = 720;
const MICRO_MISSILE_CD = 7;
const MICRO_MISSILE_COUNT = 5;
const MICRO_MISSILE_DMG = 7;
// Heatwave
const INFERNO_WALL_CD = 11;
const INFERNO_WALL_DUR = 4.0;
const INFERNO_WALL_TICK_DMG = 4;     // per 0.25s while opponent stands inside
const MAGMA_BLAST_CD = 5;
const MAGMA_BLAST_DMG = 22;
const MAGMA_BLAST_RADIUS = 110;

// ---- Batch-2 powers: Batman / Spider-Man / A-Train / Nightcrawler ----
// Batman
const SMOKE_BOMB_CD = 9;
const SMOKE_BOMB_DUR = 1.2;     // visual cloud duration
const SMOKE_INVIS_DUR = 0.7;    // self-invisibility window (iframes)
const SMOKE_RADIUS = 140;
const BATARANG_VOLLEY_CD = 6;
const BATARANG_VOLLEY_COUNT = 3;
const BATARANG_VOLLEY_DMG = 9;
// Spider-Man
const WEB_SNARE_CD = 8;
const WEB_SNARE_DUR = 1.6;
const WEB_SNARE_PULL = 0.32;     // fraction of distance pulled toward attacker
const WEB_ZIP_CD = 5;
const WEB_ZIP_DMG = 20;
// A-Train
const SONIC_SPRINT_CD = 9;
const SONIC_SPRINT_DUR = 1.6;
const SONIC_SPRINT_MULT = 1.85;
const COMPOUND_V_CD = 10;
const COMPOUND_V_DMG = 30;
// Nightcrawler
const BAMF_CLOUD_CD = 8;
const BAMF_CLOUD_RADIUS = 130;
const BAMF_CLOUD_DMG = 14;
const SHADOW_STRIKE_CD = 5;
const SHADOW_STRIKE_DMG = 18;
// Bamf Combo — 3 scripted teleport-strikes
const BAMF_COMBO_CD = 12;
const BAMF_COMBO_STEP = 1.0;        // 1s between hits → ~3s total
const BAMF_COMBO_DMG = [12, 14, 18];
const BAMF_COMBO_HITSTOP = [0.08, 0.10, 0.18];
const BAMF_COMBO_SHAKE = [12, 14, 22];

interface Missile {
  owner: PlayerId; target: PlayerId;
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  delay: number;        // seconds until launch
  phase: number;
}

interface FireWall {
  owner: PlayerId;
  x: number;            // center x
  yTop: number;         // top of flame column
  yBottom: number;      // bottom (ground)
  width: number;        // full width
  life: number; maxLife: number;
  tickAcc: number;
}

interface MagmaBlast {
  owner: PlayerId;
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;   // until impact/expiry
  phase: number;
  exploded: boolean;
  explosionT: number;   // post-impact growth
}

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
  private lightnings: LightningOrb[] = [];
  private missiles: Missile[] = [];
  private fireWalls: FireWall[] = [];
  private magmas: MagmaBlast[] = [];
  private smokeClouds: SmokeCloud[] = [];
  // Global time-freeze (Flash power 1): freezes everything except the freezer.
  private timeFreezeT = 0;
  private timeFreezer: PlayerId | null = null;
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

  // Hulk frenzy cinematic assets — frame sequence is the reliable mobile path.
  private frenzyVideo: HTMLVideoElement | null = null;
  private frenzyVideoReady = false;
  private frenzyFrames: HTMLImageElement[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    this.ctx = ctx;
    if (typeof document !== "undefined") {
      const v = document.createElement("video");
      v.src = "/fx/hulk-special.webm";
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.addEventListener("loadeddata", () => { this.frenzyVideoReady = true; });
      this.frenzyVideo = v;
      this.frenzyFrames = Array.from({ length: FRENZY_FRAME_COUNT }, (_, index) => {
        const frame = new Image();
        frame.decoding = "async";
        frame.src = `/fx/hulk-special-frames/frame-${String(index + 1).padStart(3, "0")}.webp`;
        return frame;
      });
    }
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
      meleeT: f.meleeT, meleeDur: f.meleeDur,
      ragdollT: f.ragdollT, downedT: f.downedT, getUpT: f.getUpT,
      flying: f.flying, canFly: f.canFly,
    };
  }

  /** True if a cover/solid platform sits roughly between the two fighters (eye-level). */
  hasCoverBetween(a: PlayerId, b: PlayerId): boolean {
    const fa = a === "p1" ? this.p1 : this.p2;
    const fb = b === "p1" ? this.p1 : this.p2;
    const ay = fa.y + 20, by = fb.y + 20;
    const yMid = (ay + by) / 2;
    const x0 = Math.min(fa.x, fb.x), x1 = Math.max(fa.x, fb.x);
    for (const p of this.platforms) {
      if (p.kind !== "cover") continue;
      if (p.x + p.w < x0 || p.x > x1) continue;
      if (yMid >= p.y - 10 && yMid <= p.y + p.h + 10) return true;
    }
    return false;
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
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "depart");
    Sfx.play("bamf", 0.9);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy));
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
  }

  /** Signature Nightcrawler teleport puff: dense purple smoke + curling tendrils + sparks. */
  private bamfPuff(x: number, y: number, mode: "depart" | "arrive" | "strike") {
    const layers = mode === "strike" ? 2 : 3;
    for (let i = 0; i < layers; i++) {
      const off = (Math.random() - 0.5) * 14;
      this.smokeClouds.push({
        x: x + off, y: y + (Math.random() - 0.5) * 10,
        r: 10 + i * 4,
        rMax: 56 + i * 14 + (mode === "arrive" ? 8 : 0),
        life: 0.55 + i * 0.12, maxLife: 0.55 + i * 0.12,
      });
    }
    this.burst(x, y, "oklch(0.55 0.22 305)", mode === "arrive" ? 28 : 22);
    const count = mode === "strike" ? 10 : 18;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(ang) * sp * 0.6,
        vy: Math.sin(ang) * sp * 0.4 - 40 - Math.random() * 30,
        life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
        color: i % 3 === 0
          ? "oklch(0.78 0.22 305)"
          : (i % 3 === 1 ? "oklch(0.4 0.16 295)" : "oklch(0.25 0.08 290)"),
        size: 3 + Math.random() * 3.5,
      });
    }
    for (let i = 0; i < (mode === "arrive" ? 10 : 6); i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 200;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
        life: 0.25 + Math.random() * 0.2, maxLife: 0.45,
        color: "oklch(0.95 0.18 95)",
        size: 1.4 + Math.random() * 1.6,
      });
    }
  }

  reset() {
    this.p1 = this.makeFighter("p1", 260, getSkin(this.p1Skin));
    this.p2 = this.makeFighter("p2", 1020, getSkin(this.p2Skin));
    this.p2.facing = -1; this.p2.facingT = -1;
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.beams = [];
    this.lightnings = [];
    this.missiles = [];
    this.fireWalls = [];
    this.magmas = [];
    this.smokeClouds = [];
    this.timeFreezeT = 0; this.timeFreezer = null;
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
      frenzy: null,
      frenzyCd: 0,
      power1Cd: 0, power2Cd: 0,
      freezeT: 0,
      stunT: 0,
      heatVisionT: 0,
      unibeamChargeT: 0,
      unibeamFireT: 0,
      invisT: 0, webSnareT: 0, speedBoostT: 0,
      bamfCombo: null,
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

  /** Hulk-only Rage Frenzy: triggers cinematic clip and chunky damage. Returns true if started. */
  pressFrenzy(attacker: PlayerId): boolean {
    const a = attacker === "p1" ? this.p1 : this.p2;
    const t = attacker === "p1" ? this.p2 : this.p1;
    if (a.skin.id !== "hulk") return false;
    if (a.frenzy || a.frenzyCd > 0) return false;
    if (a.dash || a.meleeKind || a.ragdollT > 0 || a.downedT > 0 || a.getUpT > 0) return false;
    // Must be in close contact range
    if (Math.abs(t.x - a.x) > FRENZY_RANGE) return false;
    if (!t.onGround && !a.onGround) { /* allow */ }
    a.frenzyCd = FRENZY_CD;
    a.facing = (t.x - a.x) >= 0 ? 1 : -1;
    a.vx = 0; a.vy = 0; a.onGround = true;
    // Snap target into position next to hulk for the cinematic
    const targetOffset = a.facing * 48;
    t.x = a.x + targetOffset;
    t.y = GROUND_Y - FIGHTER_H;
    t.vx = 0; t.vy = 0; t.onGround = true;
    t.meleeKind = null; t.meleeT = 0;
    // Lock target out: clear ragdoll/getup to keep them upright in scene
    t.ragdollT = 0; t.downedT = 0; t.getUpT = 0;
    a.frenzy = { t: 0, dur: FRENZY_DUR, target: t.id, nextTick: 0, transitionT: 0, punchPulse: 0 };
    this.shake = Math.max(this.shake, 24);
    this.hitstopT = Math.max(this.hitstopT, 0.08);
    this.impactFlash = 1;
    this.slowmoT = Math.max(this.slowmoT, 0.25);
    this.slowmoMode = "impact";
    Sfx.play("boom", 1);
    Sfx.play("heavy", 0.9);
    return true;
  }
  isFrenzyActive(p: PlayerId): boolean {
    return (p === "p1" ? this.p1 : this.p2).frenzy !== null;
  }
  /** Returns active frenzy info for the renderer. */
  getFrenzyInfo(): null | { attackerId: PlayerId; x: number; y: number; facing: 1 | -1; t: number; dur: number; transitionT: number } {
    for (const f of [this.p1, this.p2]) {
      if (f.frenzy) {
        return {
          attackerId: f.id, x: f.x, y: f.y,
          facing: f.facing, t: f.frenzy.t, dur: f.frenzy.dur,
          transitionT: f.frenzy.transitionT,
        };
      }
    }
    return null;
  }

  /** Power 1 — HOLD-joystick activates the character's signature setup ability. */
  pressPower1(attacker: PlayerId): boolean {
    const a = attacker === "p1" ? this.p1 : this.p2;
    const t = attacker === "p1" ? this.p2 : this.p1;
    if (a.power1Cd > 0) return false;
    if (a.ragdollT > 0 || a.downedT > 0 || a.getUpT > 0 || a.stunT > 0) return false;

    switch (a.skin.id) {
      case "flash": {
        a.power1Cd = TIMEFREEZE_CD;
        this.timeFreezeT = TIMEFREEZE_DUR;
        this.timeFreezer = a.id;
        t.freezeT = TIMEFREEZE_DUR;
        this.impactFlash = 1;
        this.shake = Math.max(this.shake, 18);
        this.hitstopT = Math.max(this.hitstopT, 0.08);
        this.burst(t.x, t.y + 40, "oklch(0.92 0.18 220)", 28);
        this.burst(a.x, a.y + 40, "oklch(0.92 0.18 60)", 24);
        this.shockwaves.push({ x: t.x, y: t.y + 40, r: 8, rMax: 260, life: 0.6, maxLife: 0.6, color: "oklch(0.92 0.18 220)" });
        Sfx.play("blip", 0.9); Sfx.play("whoosh", 0.7);
        return true;
      }
      case "superman": {
        // Solar Flare — 360° radial burn + stun
        a.power1Cd = SOLAR_FLARE_CD;
        const cx = a.x, cy = a.y + 40;
        const dx = t.x - cx, dy = (t.y + 40) - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < SOLAR_FLARE_RADIUS && t.iframeT <= 0 && t.downedT <= 0 && t.getUpT <= 0) {
          const falloff = 1 - Math.min(1, dist / SOLAR_FLARE_RADIUS);
          const dmg = SOLAR_FLARE_DMG * (0.5 + falloff * 0.5);
          t.hp = Math.max(0, t.hp - dmg);
          t.hitFlash = 0.55;
          t.stunT = Math.max(t.stunT, SOLAR_FLARE_STUN);
          const dir = Math.sign(dx) || a.facing;
          t.vx = dir * 320 * falloff;
          t.vy = -180 * falloff;
          t.onGround = false;
          if (t.hp <= 0) { this.phase = "ko"; this.winner = a.id; }
        }
        // Triple shockwave + radial sparks
        this.shockwaves.push({ x: cx, y: cy, r: 16, rMax: SOLAR_FLARE_RADIUS, life: 0.65, maxLife: 0.65, color: "oklch(0.98 0.16 90)" });
        this.shockwaves.push({ x: cx, y: cy, r: 8,  rMax: SOLAR_FLARE_RADIUS * 0.7, life: 0.5,  maxLife: 0.5,  color: "oklch(0.99 0.05 80)" });
        this.shockwaves.push({ x: cx, y: cy, r: 24, rMax: SOLAR_FLARE_RADIUS * 1.25, life: 0.85, maxLife: 0.85, color: "oklch(0.85 0.20 50)" });
        for (let i = 0; i < 36; i++) {
          const ang = (i / 36) * Math.PI * 2;
          const sp = 260 + Math.random() * 200;
          this.particles.push({
            x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            life: 0.55 + Math.random() * 0.3, maxLife: 0.85,
            color: i % 3 === 0 ? "oklch(0.99 0.06 80)" : "oklch(0.92 0.18 70)",
            size: 2 + Math.random() * 2.5,
          });
        }
        this.impactFlash = 1;
        this.shake = Math.max(this.shake, 26);
        this.hitstopT = Math.max(this.hitstopT, 0.12);
        this.slowmoT = Math.max(this.slowmoT, 0.25);
        this.slowmoMode = "impact";
        Sfx.play("boom", 0.9); Sfx.play("heavy", 0.7);
        return true;
      }
      case "ironman": {
        // Unibeam — start charge phase, then beam
        a.power1Cd = UNIBEAM_CD;
        a.unibeamChargeT = UNIBEAM_CHARGE;
        a.unibeamFireT = 0;
        Sfx.play("blip", 0.9);
        return true;
      }
      case "heatwave": {
        // Inferno Wall — drop a flame column at attacker's facing position
        a.power1Cd = INFERNO_WALL_CD;
        const wx = a.x + a.facing * 100;
        this.fireWalls.push({
          owner: a.id, x: Math.max(80, Math.min(W - 80, wx)),
          yTop: GROUND_Y - 170, yBottom: GROUND_Y - 4,
          width: 110, life: INFERNO_WALL_DUR, maxLife: INFERNO_WALL_DUR,
          tickAcc: 0,
        });
        this.shockwaves.push({ x: wx, y: GROUND_Y - 6, r: 8, rMax: 130, life: 0.5, maxLife: 0.5, color: "oklch(0.78 0.22 40)" });
        this.burst(wx, GROUND_Y - 30, "oklch(0.85 0.20 50)", 32);
        this.impactFlash = Math.max(this.impactFlash, 0.6);
        this.shake = Math.max(this.shake, 14);
        Sfx.play("boom", 0.7); Sfx.play("whoosh", 0.6);
        return true;
      }
      case "batman": {
        // Smoke Bomb — vanish cloud, brief invisibility/iframes, knockback dust ring
        a.power1Cd = SMOKE_BOMB_CD;
        a.invisT = SMOKE_INVIS_DUR;
        a.iframeT = Math.max(a.iframeT, SMOKE_INVIS_DUR);
        a.stunT = 0;
        const cx = a.x, cy = a.y + 36;
        this.smokeClouds.push({ x: cx, y: cy, r: 18, rMax: SMOKE_RADIUS, life: SMOKE_BOMB_DUR, maxLife: SMOKE_BOMB_DUR });
        this.shockwaves.push({ x: cx, y: cy, r: 8, rMax: SMOKE_RADIUS, life: 0.45, maxLife: 0.45, color: "oklch(0.55 0.04 270)" });
        // Push opponent if close
        const dx = t.x - cx; const adist = Math.abs(dx);
        if (adist < SMOKE_RADIUS && t.iframeT <= 0 && t.downedT <= 0) {
          const dir = Math.sign(dx) || a.facing;
          t.vx = dir * 360; t.vy = -200; t.onGround = false;
          t.hp = Math.max(0, t.hp - 6); t.hitFlash = 0.4;
        }
        // Re-position attacker slightly behind opponent for stealth feel
        const behind = -Math.sign(t.x - a.x) || a.facing;
        a.x = Math.max(40, Math.min(W - 40, t.x + behind * 70));
        a.facing = (-behind) as 1 | -1;
        for (let i = 0; i < 28; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 160;
          this.particles.push({
            x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
            life: 0.7 + Math.random() * 0.4, maxLife: 1.1,
            color: i % 2 === 0 ? "oklch(0.45 0.03 270)" : "oklch(0.6 0.04 270)",
            size: 2.5 + Math.random() * 3,
          });
        }
        this.shake = Math.max(this.shake, 12);
        Sfx.play("whoosh", 0.8); Sfx.play("thud", 0.5);
        return true;
      }
      case "spiderman": {
        // Web Snare — locks opponent + pulls toward attacker
        a.power1Cd = WEB_SNARE_CD;
        if (t.iframeT <= 0 && t.downedT <= 0 && t.invisT <= 0) {
          t.webSnareT = Math.max(t.webSnareT, WEB_SNARE_DUR);
          t.slowedT = Math.max(t.slowedT, WEB_SNARE_DUR);
          const dx = a.x - t.x;
          t.x += dx * WEB_SNARE_PULL;
          t.vx = 0; t.vy = Math.min(0, t.vy);
          t.hp = Math.max(0, t.hp - 5); t.hitFlash = 0.35;
        }
        // Web tether visual via particles
        for (let i = 0; i < 14; i++) {
          const tt = i / 14;
          this.particles.push({
            x: a.x + (t.x - a.x) * tt, y: a.y + 28 + (t.y - a.y) * tt,
            vx: 0, vy: 0, life: 0.4, maxLife: 0.4,
            color: "oklch(0.95 0.02 240)", size: 1.5,
          });
        }
        this.burst(t.x, t.y + 30, "oklch(0.95 0.02 240)", 18);
        Sfx.play("whoosh", 0.7);
        return true;
      }
      case "atrain": {
        // Sonic Sprint — self speed buff + cleanse
        a.power1Cd = SONIC_SPRINT_CD;
        a.speedBoostT = SONIC_SPRINT_DUR;
        a.stunT = 0; a.webSnareT = 0; a.slowedT = 0;
        a.iframeT = Math.max(a.iframeT, 0.25);
        this.burst(a.x, a.y + 40, "oklch(0.92 0.18 60)", 28);
        this.shockwaves.push({ x: a.x, y: a.y + 40, r: 6, rMax: 90, life: 0.35, maxLife: 0.35, color: "oklch(0.95 0.16 80)" });
        Sfx.play("whoosh", 0.9);
        return true;
      }
      case "nightcrawler": {
        // Bamf Cloud — purple AoE around self that damages and stuns nearby enemy
        a.power1Cd = BAMF_CLOUD_CD;
        const cx = a.x, cy = a.y + 36;
        this.smokeClouds.push({ x: cx, y: cy, r: 18, rMax: BAMF_CLOUD_RADIUS, life: 0.9, maxLife: 0.9 });
        this.shockwaves.push({ x: cx, y: cy, r: 10, rMax: BAMF_CLOUD_RADIUS, life: 0.5, maxLife: 0.5, color: "oklch(0.55 0.20 305)" });
        const dx = t.x - cx, dy = (t.y + 40) - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < BAMF_CLOUD_RADIUS && t.iframeT <= 0 && t.downedT <= 0) {
          t.hp = Math.max(0, t.hp - BAMF_CLOUD_DMG);
          t.hitFlash = 0.45;
          t.stunT = Math.max(t.stunT, 0.7);
          const dir = Math.sign(dx) || a.facing;
          t.vx = dir * 240; t.vy = -160; t.onGround = false;
          if (t.hp <= 0) { this.phase = "ko"; this.winner = a.id; }
        }
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 80 + Math.random() * 200;
          this.particles.push({
            x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30,
            life: 0.6 + Math.random() * 0.4, maxLife: 1,
            color: i % 3 === 0 ? "oklch(0.7 0.22 305)" : "oklch(0.45 0.18 295)",
            size: 2 + Math.random() * 3,
          });
        }
        this.shake = Math.max(this.shake, 16);
        Sfx.play("whoosh", 0.9); Sfx.play("thud", 0.6);
        return true;
      }
    }
    return false;
  }

  /** Power 2 — TAP-opponent activates the character's offensive payload. */
  pressPower2(attacker: PlayerId): boolean {
    const a = attacker === "p1" ? this.p1 : this.p2;
    const t = attacker === "p1" ? this.p2 : this.p1;
    if (a.power2Cd > 0) return false;
    if (a.ragdollT > 0 || a.downedT > 0 || a.getUpT > 0 || a.stunT > 0) return false;

    switch (a.skin.id) {
      case "flash": {
        a.power2Cd = LIGHTNING_CD;
        const sx = a.x + a.facing * 14;
        const sy = a.y + 30;
        const dxn = Math.sign(t.x - sx) || a.facing;
        this.lightnings.push({
          owner: a.id, target: t.id, x: sx, y: sy,
          vx: dxn * LIGHTNING_SPEED, vy: -40,
          life: LIGHTNING_DUR, maxLife: LIGHTNING_DUR,
          phase: 0, hit: false, tickAcc: 0,
        });
        this.burst(sx, sy, "oklch(0.95 0.18 95)", 22);
        this.shockwaves.push({ x: sx, y: sy, r: 6, rMax: 80, life: 0.3, maxLife: 0.3, color: "oklch(0.95 0.18 95)" });
        Sfx.play("blip", 0.7); Sfx.play("whoosh", 0.8);
        return true;
      }
      case "superman": {
        // Heat Vision — sustained narrow beam
        a.power2Cd = HEAT_VISION_CD;
        a.heatVisionT = HEAT_VISION_DUR;
        Sfx.play("laser", 0.8);
        return true;
      }
      case "ironman": {
        // Micro-Missile barrage
        a.power2Cd = MICRO_MISSILE_CD;
        for (let i = 0; i < MICRO_MISSILE_COUNT; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
          const speed = 240 + Math.random() * 60;
          this.missiles.push({
            owner: a.id, target: t.id,
            x: a.x + a.facing * 12, y: a.y + 30,
            vx: Math.cos(angle) * speed * a.facing * 0.4,
            vy: Math.sin(angle) * speed,
            life: 2.6, maxLife: 2.6,
            delay: i * 0.08, phase: 0,
          });
        }
        this.burst(a.x + a.facing * 14, a.y + 28, "oklch(0.85 0.14 60)", 14);
        Sfx.play("blip", 0.6); Sfx.play("whoosh", 0.6);
        return true;
      }
      case "heatwave": {
        // Magma Blast — heavy arcing projectile that explodes on impact
        a.power2Cd = MAGMA_BLAST_CD;
        const dir = Math.sign(t.x - a.x) || a.facing;
        const dx = t.x - a.x;
        const speed = 520;
        this.magmas.push({
          owner: a.id,
          x: a.x + dir * 16, y: a.y + 28,
          vx: dir * Math.min(520, Math.abs(dx) * 1.4 + 200),
          vy: -260,
          life: 2.5, maxLife: 2.5, phase: 0,
          exploded: false, explosionT: 0,
        });
        // void unused
        void speed;
        this.burst(a.x + dir * 14, a.y + 28, "oklch(0.78 0.22 40)", 20);
        Sfx.play("whoosh", 0.7);
        return true;
      }
      case "nightcrawler": {
        // Bamf Combo — scripted 3-hit teleport sequence (top punch, left kick, left punch)
        if (a.bamfCombo) return false;
        a.power2Cd = BAMF_COMBO_CD;
        a.bamfCombo = { step: 0, t: 0, nextAt: 0, targetId: t.id };
        // Cleanse self stuns/snares so the combo always plays out
        a.stunT = 0; a.webSnareT = 0; a.slowedT = 0;
        a.iframeT = Math.max(a.iframeT, 0.2);
        return true;
      }
    }
    return false;
  }

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
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "depart");
    Sfx.play("bamf", 0.9);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy - FIGHTER_H / 2));
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
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

    // ---- Time Freeze (Flash power 1): freezer ticks normally; everything else paused ----
    this.timeFreezeT = Math.max(0, this.timeFreezeT - dt);
    if (this.timeFreezeT <= 0) this.timeFreezer = null;
    const freezeActive = this.timeFreezeT > 0 && this.timeFreezer !== null;
    const isFrozenFor = (id: PlayerId): boolean => {
      const f = id === "p1" ? this.p1 : this.p2;
      return freezeActive && id !== this.timeFreezer && f.freezeT > 0;
    };
    // Decay per-fighter freeze when global freeze ends (or freezer changes)
    if (!freezeActive) {
      this.p1.freezeT = 0;
      this.p2.freezeT = 0;
    } else {
      // freezeT mirrors timeFreezeT for the affected fighter
      const victim = this.timeFreezer === "p1" ? this.p2 : this.p1;
      victim.freezeT = this.timeFreezeT;
    }

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) this.phase = "fight";
    }

    // Ambient floor bubbles removed — kept the screen too busy.
    const maxParticles = this.lowPower ? 120 : 400;

    if (this.cpu && this.phase === "fight" && !isFrozenFor("p2")) {
      this.cpu.update(dt, this.buildSnapshot());
    }

    if (this.phase === "fight") {
      // Power cooldowns ALWAYS tick (so even frozen fighters' cooldowns recover normally — but realistically only the freezer is acting).
      this.p1.power1Cd = Math.max(0, this.p1.power1Cd - dt);
      this.p1.power2Cd = Math.max(0, this.p1.power2Cd - dt);
      this.p2.power1Cd = Math.max(0, this.p2.power1Cd - dt);
      this.p2.power2Cd = Math.max(0, this.p2.power2Cd - dt);

      if (!isFrozenFor("p1")) this.updateFighter(this.p1, sdt);
      if (!isFrozenFor("p2")) this.updateFighter(this.p2, sdt);
      if (!this.p1.ragdollT && !this.p1.downedT && !this.p1.getUpT && !isFrozenFor("p1")) this.p1.facing = this.p2.x > this.p1.x ? 1 : -1;
      if (!this.p2.ragdollT && !this.p2.downedT && !this.p2.getUpT && !isFrozenFor("p2")) this.p2.facing = this.p1.x > this.p2.x ? 1 : -1;
      this.resolveMelees();
      this.updateBamfCombo(this.p1, dt);
      this.updateBamfCombo(this.p2, dt);
    }
    for (const f of [this.p1, this.p2]) {
      if (freezeActive && f.id !== this.timeFreezer) continue;
      f.facingT += (f.facing - f.facingT) * Math.min(1, dt * 8);
    }

    for (const pr of this.projectiles) {
      // Frozen: projectiles owned by frozen player are paused.
      if (freezeActive && pr.owner !== this.timeFreezer) continue;
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
    for (const b of this.beams) {
      if (freezeActive && b.owner !== this.timeFreezer) continue;
      b.life -= dt;
    }
    this.beams = this.beams.filter(b => b.life > 0);

    // ---- Lightning orbs (Flash power 2): chase target, deal damage on contact ----
    for (const lo of this.lightnings) {
      if (freezeActive && lo.owner !== this.timeFreezer) continue;
      const tgt = lo.target === "p1" ? this.p1 : this.p2;
      lo.life -= dt;
      lo.phase += dt * 14;
      // Steer toward target
      const dx = tgt.x - lo.x, dy = (tgt.y + 40) - lo.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / d) * LIGHTNING_SPEED;
      const desiredVy = (dy / d) * LIGHTNING_SPEED;
      const k = Math.min(1, sdt * LIGHTNING_TURN);
      lo.vx += (desiredVx - lo.vx) * k;
      lo.vy += (desiredVy - lo.vy) * k;
      lo.x += lo.vx * sdt; lo.y += lo.vy * sdt;
      // Trail particles
      if (!this.lowPower && Math.random() < 0.7) {
        this.particles.push({
          x: lo.x + (Math.random() - 0.5) * 6, y: lo.y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
          life: 0.35, maxLife: 0.35,
          color: "oklch(0.95 0.18 95)", size: 2 + Math.random() * 1.5,
        });
      }
      // Collision with target
      const hit = Math.abs(dx) < FIGHTER_W && lo.y > tgt.y && lo.y < tgt.y + FIGHTER_H;
      if (hit && tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
        if (!lo.hit) {
          lo.hit = true;
          tgt.hp = Math.max(0, tgt.hp - LIGHTNING_DMG);
          tgt.hitFlash = 0.3;
          tgt.vx += Math.sign(lo.vx || 1) * 220;
          tgt.vy = -180; tgt.onGround = false;
          this.shake = Math.max(this.shake, 14);
          this.impactFlash = Math.max(this.impactFlash, 0.7);
          this.burst(lo.x, lo.y, "oklch(0.95 0.18 95)", 22);
          this.shockwaves.push({ x: lo.x, y: lo.y, r: 6, rMax: 110, life: 0.35, maxLife: 0.35, color: "oklch(0.95 0.18 95)" });
          Sfx.play("punch", 0.7);
          if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = lo.owner; }
        } else {
          // Latched: tick chip damage
          lo.tickAcc += dt;
          if (lo.tickAcc >= 0.25) {
            lo.tickAcc = 0;
            tgt.hp = Math.max(0, tgt.hp - LIGHTNING_TICK_DMG);
            tgt.hitFlash = 0.18;
            if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = lo.owner; }
          }
        }
      }
    }
    this.lightnings = this.lightnings.filter(lo => lo.life > 0 && lo.x > -100 && lo.x < W + 100 && lo.y > -100 && lo.y < H + 100);

    // ---- Heat Vision sustained beam (Superman) ----
    for (const f of [this.p1, this.p2]) {
      if (freezeActive && f.id !== this.timeFreezer) continue;
      if (f.heatVisionT > 0) {
        f.heatVisionT -= dt;
        const tgt = f.id === "p1" ? this.p2 : this.p1;
        const sx = f.x + f.facing * 8;
        const sy = f.y + 16;
        const dxh = (tgt.x + 0) - sx;
        const dyh = (tgt.y + 30) - sy;
        const ang = Math.atan2(dyh, dxh);
        // Auto-track but clamp toward facing
        const clampedAng = f.facing > 0
          ? Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, ang))
          : (Math.abs(ang) > Math.PI / 2 ? ang : (ang >= 0 ? Math.PI - 0.01 : -Math.PI + 0.01));
        const beamLen = Math.min(680, Math.hypot(dxh, dyh) + 60);
        this.beams.push({ owner: f.id, x: sx, y: sy, angle: clampedAng, length: beamLen, life: 0.05 });
        // Apply tick damage if target is in cone
        const targAng = Math.atan2(dyh, dxh);
        const dAng = Math.abs(((targAng - clampedAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dAng < 0.18 && Math.hypot(dxh, dyh) < beamLen && tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
          tgt.hp = Math.max(0, tgt.hp - HEAT_VISION_DPS * dt);
          tgt.hitFlash = 0.2;
          if (Math.random() < 0.5) {
            this.particles.push({
              x: tgt.x + (Math.random() - 0.5) * 18, y: tgt.y + 20 + Math.random() * 30,
              vx: (Math.random() - 0.5) * 60, vy: -50 - Math.random() * 90,
              life: 0.45, maxLife: 0.45,
              color: "oklch(0.92 0.20 30)", size: 1.6 + Math.random() * 1.6,
            });
          }
          if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = f.id; }
        }
        if (f.heatVisionT <= 0) f.heatVisionT = 0;
      }
    }

    // ---- Iron Man Unibeam (charge → fire) ----
    for (const f of [this.p1, this.p2]) {
      if (freezeActive && f.id !== this.timeFreezer) continue;
      if (f.unibeamChargeT > 0) {
        f.unibeamChargeT -= dt;
        // Pulsing chest charge particles
        if (!this.lowPower && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const r = 30 + Math.random() * 18;
          this.particles.push({
            x: f.x + Math.cos(a) * r, y: f.y + 30 + Math.sin(a) * r * 0.6,
            vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 80,
            life: 0.3, maxLife: 0.3,
            color: "oklch(0.92 0.18 220)", size: 2 + Math.random() * 2,
          });
        }
        if (f.unibeamChargeT <= 0) {
          f.unibeamChargeT = 0;
          f.unibeamFireT = UNIBEAM_FIRE;
          this.impactFlash = Math.max(this.impactFlash, 0.7);
          this.shake = Math.max(this.shake, 18);
          this.shockwaves.push({ x: f.x + f.facing * 10, y: f.y + 30, r: 8, rMax: 160, life: 0.45, maxLife: 0.45, color: "oklch(0.95 0.18 220)" });
          Sfx.play("boom", 0.7); Sfx.play("laser", 0.9);
        }
      }
      if (f.unibeamFireT > 0) {
        f.unibeamFireT -= dt;
        const tgt = f.id === "p1" ? this.p2 : this.p1;
        const sx = f.x + f.facing * 4;
        const sy = f.y + 30;
        const ang = f.facing > 0 ? 0 : Math.PI;
        // Hit any obstacle
        const blockHit = this.raycastPlatforms(sx, sy, ang, UNIBEAM_RANGE);
        const beamLen = blockHit ? blockHit.dist : UNIBEAM_RANGE;
        this.beams.push({ owner: f.id, x: sx, y: sy, angle: ang, length: beamLen, life: 0.05 });
        // Wide column hit: any target along line within ±28px y
        const dxu = tgt.x - sx;
        if (Math.sign(dxu) === f.facing && Math.abs(dxu) < beamLen && Math.abs((tgt.y + 30) - sy) < 50) {
          if (tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
            tgt.hp = Math.max(0, tgt.hp - UNIBEAM_DPS * dt);
            tgt.hitFlash = 0.25;
            tgt.vx = f.facing * 320;
            if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = f.id; }
          }
        }
        // Impact sparks at end
        if (!this.lowPower && Math.random() < 0.7) {
          const ex = sx + Math.cos(ang) * beamLen, ey = sy + Math.sin(ang) * beamLen;
          this.particles.push({
            x: ex + (Math.random() - 0.5) * 14, y: ey + (Math.random() - 0.5) * 14,
            vx: -f.facing * (60 + Math.random() * 120), vy: -50 - Math.random() * 100,
            life: 0.4, maxLife: 0.4,
            color: "oklch(0.95 0.18 220)", size: 2 + Math.random() * 2,
          });
        }
        this.shake = Math.max(this.shake, 6);
        if (f.unibeamFireT <= 0) f.unibeamFireT = 0;
      }
    }

    // ---- Iron Man Micro-Missiles ----
    for (const ms of this.missiles) {
      if (freezeActive && ms.owner !== this.timeFreezer) continue;
      if (ms.delay > 0) { ms.delay -= dt; continue; }
      ms.life -= dt; ms.phase += dt * 12;
      const tgt = ms.target === "p1" ? this.p1 : this.p2;
      const dxm = tgt.x - ms.x, dym = (tgt.y + 35) - ms.y;
      const d = Math.hypot(dxm, dym) || 1;
      const desiredVx = (dxm / d) * 380;
      const desiredVy = (dym / d) * 380;
      const k = Math.min(1, sdt * 5);
      ms.vx += (desiredVx - ms.vx) * k;
      ms.vy += (desiredVy - ms.vy) * k;
      ms.x += ms.vx * sdt; ms.y += ms.vy * sdt;
      // Smoke trail
      if (!this.lowPower && Math.random() < 0.85) {
        this.particles.push({
          x: ms.x + (Math.random() - 0.5) * 4, y: ms.y + (Math.random() - 0.5) * 4,
          vx: -ms.vx * 0.1 + (Math.random() - 0.5) * 20,
          vy: -ms.vy * 0.1 + (Math.random() - 0.5) * 20,
          life: 0.5, maxLife: 0.5,
          color: "oklch(0.85 0.10 60)", size: 2 + Math.random() * 1.6,
        });
      }
      // Collision
      if (Math.abs(dxm) < FIGHTER_W * 0.7 && ms.y > tgt.y && ms.y < tgt.y + FIGHTER_H && tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
        tgt.hp = Math.max(0, tgt.hp - MICRO_MISSILE_DMG);
        tgt.hitFlash = 0.25;
        tgt.vx += Math.sign(ms.vx || 1) * 120;
        tgt.vy = Math.min(tgt.vy, -120);
        tgt.onGround = false;
        this.shake = Math.max(this.shake, 8);
        this.impactFlash = Math.max(this.impactFlash, 0.4);
        this.shockwaves.push({ x: ms.x, y: ms.y, r: 4, rMax: 60, life: 0.3, maxLife: 0.3, color: "oklch(0.92 0.18 60)" });
        this.burst(ms.x, ms.y, "oklch(0.92 0.18 60)", 10);
        Sfx.play("boom", 0.5);
        ms.life = 0;
        if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = ms.owner; }
      }
    }
    this.missiles = this.missiles.filter(m => m.life > 0 && m.x > -100 && m.x < W + 100 && m.y > -100 && m.y < H + 100);

    // ---- Heatwave Inferno Wall (area denial) ----
    for (const fw of this.fireWalls) {
      if (freezeActive && fw.owner !== this.timeFreezer) continue;
      fw.life -= dt;
      fw.tickAcc += dt;
      // Spawn flame particles continuously
      if (!this.lowPower) {
        const n = 3;
        for (let i = 0; i < n; i++) {
          const px = fw.x + (Math.random() - 0.5) * fw.width * 0.85;
          this.particles.push({
            x: px, y: fw.yBottom - Math.random() * 20,
            vx: (Math.random() - 0.5) * 40,
            vy: -120 - Math.random() * 180,
            life: 0.55 + Math.random() * 0.25, maxLife: 0.8,
            color: i === 0 ? "oklch(0.96 0.18 80)" : (Math.random() < 0.5 ? "oklch(0.78 0.22 40)" : "oklch(0.62 0.22 25)"),
            size: 2 + Math.random() * 2.5,
          });
        }
      }
      // Apply tick damage to opponents standing in the column
      if (fw.tickAcc >= 0.25) {
        fw.tickAcc = 0;
        const tgt = fw.owner === "p1" ? this.p2 : this.p1;
        if (tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
          if (Math.abs(tgt.x - fw.x) < fw.width * 0.5 && tgt.y + FIGHTER_H > fw.yTop) {
            tgt.hp = Math.max(0, tgt.hp - INFERNO_WALL_TICK_DMG);
            tgt.hitFlash = 0.25;
            tgt.vy = Math.min(tgt.vy, -160);
            tgt.onGround = false;
            this.shake = Math.max(this.shake, 6);
            if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = fw.owner; }
          }
        }
      }
    }
    this.fireWalls = this.fireWalls.filter(fw => fw.life > 0);

    // ---- Heatwave Magma Blast ----
    for (const mb of this.magmas) {
      if (freezeActive && mb.owner !== this.timeFreezer) continue;
      mb.phase += dt * 10;
      if (!mb.exploded) {
        mb.life -= dt;
        mb.vy += GRAVITY * 0.7 * sdt;
        mb.x += mb.vx * sdt; mb.y += mb.vy * sdt;
        // Trail
        if (!this.lowPower) {
          this.particles.push({
            x: mb.x, y: mb.y,
            vx: (Math.random() - 0.5) * 50, vy: 40 + Math.random() * 50,
            life: 0.45, maxLife: 0.45,
            color: Math.random() < 0.5 ? "oklch(0.96 0.18 80)" : "oklch(0.78 0.22 40)",
            size: 3 + Math.random() * 2,
          });
        }
        const tgt = mb.owner === "p1" ? this.p2 : this.p1;
        const groundHit = mb.y >= GROUND_Y - 4;
        const directHit = Math.abs(mb.x - tgt.x) < FIGHTER_W && mb.y > tgt.y && mb.y < tgt.y + FIGHTER_H;
        if (groundHit || directHit || mb.life <= 0) {
          mb.exploded = true;
          mb.explosionT = 0;
          // Radial damage
          const ex = mb.x, ey = Math.min(GROUND_Y - 10, mb.y);
          const dist = Math.hypot(tgt.x - ex, (tgt.y + 40) - ey);
          if (dist < MAGMA_BLAST_RADIUS && tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
            const fall = 1 - Math.min(1, dist / MAGMA_BLAST_RADIUS);
            tgt.hp = Math.max(0, tgt.hp - MAGMA_BLAST_DMG * (0.5 + fall * 0.5));
            tgt.hitFlash = 0.4;
            const dir = Math.sign(tgt.x - ex) || 1;
            tgt.vx = dir * 480 * fall;
            tgt.vy = -340 * fall;
            tgt.onGround = false;
            if (fall > 0.3 && tgt.ragdollImmuneT <= 0) {
              tgt.ragdollT = 0.6;
              tgt.ragdollEnergy = 1;
              tgt.ragdollAV = dir * 4;
            }
            if (tgt.hp <= 0 && this.phase === "fight") { this.phase = "ko"; this.winner = mb.owner; }
          }
          this.shockwaves.push({ x: ex, y: ey, r: 10, rMax: MAGMA_BLAST_RADIUS, life: 0.5, maxLife: 0.5, color: "oklch(0.96 0.18 60)" });
          this.shockwaves.push({ x: ex, y: ey, r: 18, rMax: MAGMA_BLAST_RADIUS * 1.4, life: 0.7, maxLife: 0.7, color: "oklch(0.62 0.22 25)" });
          this.burst(ex, ey, "oklch(0.96 0.18 80)", 28);
          this.burst(ex, ey, "oklch(0.78 0.22 40)", 22);
          this.shake = Math.max(this.shake, 22);
          this.impactFlash = Math.max(this.impactFlash, 0.7);
          this.hitstopT = Math.max(this.hitstopT, 0.08);
          Sfx.play("boom", 0.9);
        }
      } else {
        mb.explosionT += dt;
        if (mb.explosionT > 0.5) mb.life = 0;
      }
    }
    this.magmas = this.magmas.filter(mb => mb.life > 0 && mb.x > -100 && mb.x < W + 100);

    this.shake = Math.max(0, this.shake - dt * 40);

    this.snapAccum += dt;
    if (this.snapAccum >= 0.1 || this.phase !== "fight") {
      this.snapAccum = 0;
      this.emit();
    }

    for (const id of ["p1", "p2"] as PlayerId[]) {
      this.intents[id].fire = false;
      this.intents[id].teleport = false;
      // NOTE: do NOT clear .jump — kept as a held flag for variable-height jumps.
      // Edge-buffered presses live in fighter.jumpBufferT instead.
      this.intents[id].melee = false;
      this.intents[id].toggleFlight = false;
    }
  }

  private updateFighter(f: Fighter, dt: number) {
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.teleCd = Math.max(0, f.teleCd - dt);
    f.meleeCd = Math.max(0, f.meleeCd - dt);
    f.superCd = Math.max(0, f.superCd - dt);
    f.frenzyCd = Math.max(0, f.frenzyCd - dt);

    // ---- Hulk Rage Frenzy: cinematic clip drives positions, ticks damage ----
    if (f.frenzy) {
      const fr = f.frenzy;
      fr.t += dt;
      fr.transitionT = Math.min(0.25, fr.transitionT + dt);
      const target = fr.target === "p1" ? this.p1 : this.p2;
      // Lock both fighters in place
      f.vx = 0; f.vy = 0; f.onGround = true;
      target.vx = 0; target.vy = 0; target.onGround = true;
      target.y = GROUND_Y - FIGHTER_H;
      target.x = f.x + f.facing * 96;
      // Force opponent flat on the ground (laying down) for the entire frenzy
      target.meleeKind = null; target.meleeT = 0;
      target.iframeT = 0; target.ragdollT = 0; target.getUpT = 0;
      target.downedT = Math.max(target.downedT, 0.5);
      target.ragdollAng = f.facing * (Math.PI / 2); // sideways/flat
      // Continuous low-amplitude jitter while attack is active
      const jitter = 6 + Math.sin(fr.t * 60) * 3;
      this.shake = Math.max(this.shake, jitter);
      // Decay punch pulse (drives flash + motion blur in renderer)
      fr.punchPulse = Math.max(0, fr.punchPulse - dt * 5);
      // Damage ticks + heavy shake on each punch
      fr.nextTick -= dt;
      if (fr.nextTick <= 0) {
        fr.nextTick = FRENZY_TICK;
        target.hp = Math.max(0, target.hp - FRENZY_TICK_DMG);
        target.hitFlash = 0.3;
        // Brief flat-shake nudge
        target.x += (Math.random() - 0.5) * 6;
        this.shake = Math.max(this.shake, 22);
        this.hitstopT = Math.max(this.hitstopT, 0.04);
        this.impactFlash = Math.max(this.impactFlash, 0.85);
        fr.punchPulse = 1;
        // Radial impact flash ring at target
        this.shockwaves.push({
          x: target.x, y: target.y + 30, r: 6, rMax: 90,
          life: 0.22, maxLife: 0.22, color: "oklch(0.95 0.18 35)",
        });
        this.burst(target.x, target.y + 40, "oklch(0.95 0.18 30)", 12);
        this.burst(target.x + (Math.random() - 0.5) * 30, target.y + 20, "oklch(0.98 0.12 60)", 6);
        Sfx.play("punch", 0.8);
        if (target.hp <= 0 && this.phase === "fight") {
          this.phase = "ko"; this.winner = f.id;
        }
      }
      if (fr.t >= fr.dur) {
        // Final knockback to sell the impact
        const dir = f.facing;
        target.vx = dir * 720;
        target.vy = -380;
        target.onGround = false;
        target.downedT = 0;
        target.ragdollT = 1.2;
        target.ragdollEnergy = 1;
        target.ragdollAV = dir * 6;
        target.ragdollImmuneT = 1.5;
        this.shake = Math.max(this.shake, 36);
        this.hitstopT = Math.max(this.hitstopT, 0.18);
        this.slowmoT = Math.max(this.slowmoT, 0.45);
        this.slowmoMode = "impact";
        this.impactFlash = 1;
        this.shockwaves.push({ x: target.x, y: target.y + 40, r: 10, rMax: 320, life: 0.7, maxLife: 0.7, color: "oklch(0.7 0.18 25)" });
        Sfx.play("boom", 1);
        f.frenzy = null;
      }
      return;
    }

    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.attackAnim = Math.max(0, f.attackAnim - dt);
    f.slowedT = Math.max(0, f.slowedT - dt);
    f.hoverPhase += dt * HOVER_RATE * Math.PI * 2;

    // Per-fighter slow (a-train flurry victim)
    const localScale = f.slowedT > 0 ? 0.25 : 1;
    const ldt = dt * localScale;

    // Decay timers (always)
    if (f.iframeT > 0) f.iframeT = Math.max(0, f.iframeT - dt);
    if (f.stunT > 0) {
      f.stunT = Math.max(0, f.stunT - dt);
      // Sparks while stunned
      if (!this.lowPower && Math.random() < 0.4) {
        this.particles.push({
          x: f.x + (Math.random() - 0.5) * 22, y: f.y + 16 + Math.random() * 24,
          vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 60,
          life: 0.4, maxLife: 0.4,
          color: "oklch(0.95 0.16 90)", size: 1.5 + Math.random() * 1.5,
        });
      }
    }
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

    // Lock movement during stun / unibeam charge+fire / sustained beams.
    const powerLocked = f.stunT > 0 || f.unibeamChargeT > 0 || f.unibeamFireT > 0 || f.heatVisionT > 0;
    if (powerLocked) {
      intent.left = false; intent.right = false;
      intent.melee = false; intent.fire = false;
      intent.ax = 0; intent.ay = 0;
    }

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
      // Air control: reduced accel & friction when airborne for natural arcs
      const airMul = f.onGround ? 1 : AIR_CONTROL;
      if (move !== 0) {
        const target = move * MOVE_SPEED * moveMul;
        const a = ACCEL * accelMul * airMul * ldt;
        if (f.vx < target) f.vx = Math.min(target, f.vx + a);
        else if (f.vx > target) f.vx = Math.max(target, f.vx - a);
      } else {
        const fr = FRICTION * (f.onGround ? 1 : 0.25) * ldt;
        if (f.vx > 0) f.vx = Math.max(0, f.vx - fr);
        else if (f.vx < 0) f.vx = Math.min(0, f.vx + fr);
      }

      // ---- Jump feel: coyote time + buffered press + variable height + 1 air-jump ----
      if (f.onGround) { f.coyoteT = COYOTE_T; f.airJumps = MAX_AIR_JUMPS; }
      else f.coyoteT = Math.max(0, f.coyoteT - ldt);
      if (f.jumpBufferT > 0) f.jumpBufferT = Math.max(0, f.jumpBufferT - ldt);
      if (f.jumpHeldT > 0) f.jumpHeldT = Math.max(0, f.jumpHeldT - ldt);

      const wantsDrop = !locked && intent.jump && intent.ay > 0.5 && f.onGround;
      if (wantsDrop) {
        f.dropT = 0.18;
        f.onGround = false;
        f.y += 2;
        f.jumpBufferT = 0;
      } else if (!locked && f.jumpBufferT > 0 && (f.onGround || f.coyoteT > 0)) {
        // Ground / coyote jump
        f.vy = -JUMP_V;
        f.onGround = false;
        f.coyoteT = 0;
        f.jumpBufferT = 0;
        f.jumpHeldT = JUMP_HOLD_T;
        // Launch squash: compress slightly, springs into stretch
        f.wobble.squashV -= 5;
        // Dust puff
        if (!this.lowPower) {
          for (let i = 0; i < 5; i++) {
            this.particles.push({
              x: f.x + (Math.random() - 0.5) * 18,
              y: f.y + FIGHTER_H - 2,
              vx: (Math.random() - 0.5) * 90,
              vy: -10 - Math.random() * 30,
              life: 0.32, maxLife: 0.32,
              color: "oklch(0.8 0.04 230)",
              size: 1.5 + Math.random() * 1.4,
            });
          }
        }
      } else if (!locked && f.jumpBufferT > 0 && f.airJumps > 0 && !f.onGround) {
        // Mid-air double jump
        f.airJumps--;
        f.vy = -JUMP_V * 0.85;
        f.jumpBufferT = 0;
        f.jumpHeldT = JUMP_HOLD_T * 0.7;
        // Air-jump shockwave puff
        if (!this.lowPower) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.particles.push({
              x: f.x + Math.cos(a) * 4,
              y: f.y + FIGHTER_H - 4,
              vx: Math.cos(a) * 60,
              vy: Math.sin(a) * 30 - 10,
              life: 0.28, maxLife: 0.28,
              color: f.skin.glow,
              size: 1.4 + Math.random(),
            });
          }
        }
      }

      // Variable-height: if jump released early during ascent, kill upward velocity faster
      if (!intent.jump && f.vy < 0 && f.jumpHeldT > 0) {
        f.jumpHeldT = 0;
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
      // Variable gravity: lighter while jump held & ascending, heavier on the way down
      let gMul = 1;
      if (f.vy < 0) {
        gMul = (intent.jump && f.jumpHeldT > 0) ? 0.6 : LOW_JUMP_GRAVITY_MUL;
      } else {
        gMul = FALL_GRAVITY_MUL;
      }
      f.vy += GRAVITY * gMul * ldt;
      // Terminal velocity
      if (f.vy > 1400) f.vy = 1400;
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
      const wasAirborne = !f.onGround;
      const landingVy = f.vy;

      if (f.y + FIGHTER_H >= GROUND_Y) {
        f.y = GROUND_Y - FIGHTER_H; f.vy = 0; f.onGround = true;
        if (wasAirborne) landedOn = { x: 0, y: GROUND_Y, w: W, h: 0, kind: "cover" };
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
          const margin = 16;
          if (feet >= pl.y - margin && feet <= pl.y + 18 && prevFeet <= pl.y + margin + 4) {
            f.y = pl.y - FIGHTER_H; f.vy = 0; f.onGround = true;
            f.ledgeFlash = 0.3;
            landedOn = pl;
          }
        }
      }

      // Landing impact: squash + dust scaled by impact velocity
      if (landedOn && wasAirborne) {
        const impact = Math.max(0, Math.min(1, landingVy / 800));
        f.wobble.squashV -= 4 + impact * 7;     // squash on land
        f.wobble.bvy += 80 * impact;             // body dips
        if (impact > 0.25) this.shake = Math.max(this.shake, 4 + impact * 6);
        if (!this.lowPower) {
          const n = Math.round(4 + impact * 8);
          for (let i = 0; i < n; i++) {
            this.particles.push({
              x: f.x + (Math.random() - 0.5) * (20 + impact * 14),
              y: landedOn.y - 2,
              vx: (Math.random() - 0.5) * (70 + impact * 80),
              vy: -10 - Math.random() * (25 + impact * 25),
              life: 0.35 + impact * 0.15, maxLife: 0.5,
              color: "oklch(0.78 0.04 230)",
              size: 1.4 + Math.random() * (1.6 + impact),
            });
          }
        }
        Sfx.play("thud", 0.25 + impact * 0.45);
      }
    }

    // Soft-body wobble (secondary motion). Skipped during full ragdoll/downed/getup
    // because those branches return early above and own the body completely.
    stepWobble(f.wobble, dt, f.vx, f.vy, f.onGround, f.flying, this.lowPower);

    // Maintain afterimage trail for fast skins (and during Bamf strikes for depth motion-blur)
    const fast = f.skin.id === "flash" || f.skin.id === "atrain";
    const bamfStrike = f.meleeKind === "bamfPunch" || f.meleeKind === "bamfKick";
    if (bamfStrike) {
      // Push every frame so the swing leaves a dense smear toward the camera
      f.trail.push({
        x: f.x, y: f.y, phase: f.walkPhase, vx: f.vx, vy: f.vy,
        onGround: f.onGround, facing: f.facing, pose: this.poseFor(f),
      });
      const cap = this.lowPower ? 5 : 10;
      while (f.trail.length > cap) f.trail.shift();
    } else if (fast && (Math.abs(f.vx) > 200 || f.meleeKind)) {
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
      // Bamf Combo drives its own scripted hits; skip standard melee resolution.
      if (f.bamfCombo) continue;
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
              color: "oklch(0.6 0.18 25)",
            });
            // Big secondary shockwave for visual scale
            this.shockwaves.push({
              x: cx, y: cy, r: 20, rMax: m.range * 1.6, life: 0.7, maxLife: 0.7,
              color: "oklch(0.55 0.20 25)",
            });
            const target = f.id === "p1" ? this.p2 : this.p1;
            const dist = Math.abs(target.x - cx);
            if (dist < m.range * 1.4) {
              if (target.onGround) {
                this.applyMeleeHit(f, target, m, target.x, target.y + 60);
              } else {
                // Airborne / flying target: yank them out of the sky into a ragdoll
                const dir = Math.sign(target.x - cx) || f.facing;
                target.flying = false;
                target.vy = 220; // slam downward
                target.vx = dir * 180;
                target.onGround = false;
                target.ragdollT = Math.max(target.ragdollT, 1.1);
                target.ragdollEnergy = 1;
                target.ragdollAV = dir * 5;
                target.ragdollImmuneT = 1.0;
                if (target.iframeT <= 0) {
                  const airDmg = Math.max(6, Math.round(m.damage * 0.35));
                  target.hp = Math.max(0, target.hp - airDmg);
                  target.hitFlash = 0.3;
                  if (target.hp <= 0 && this.phase === "fight") {
                    this.phase = "ko"; this.winner = f.id;
                  }
                }
                this.burst(target.x, target.y + 30, "oklch(0.7 0.20 25)", 12);
                Sfx.play("thud", 0.7);
              }
            }
            f.meleeHitMask.add(1);
            // Massive whole-screen shake
            this.shake = Math.max(this.shake, m.shake * 2.2);
            this.hitstopT = Math.max(this.hitstopT, 0.12);
            this.impactFlash = Math.max(this.impactFlash, 0.85);
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
            // Raycast against blocking platforms (cover + solid platforms) so the beam is occluded.
            const beamMaxLen = m.range;
            const blockHit = this.raycastPlatforms(sx, sy, desired, beamMaxLen);
            const beamLen = blockHit ? blockHit.dist : beamMaxLen;
            this.beams.push({ owner: f.id, x: sx, y: sy, angle: desired, length: beamLen, life: 0.05 });
            // Spark at the impact point if blocked
            if (blockHit && Math.random() < 0.6) {
              const ex = sx + Math.cos(desired) * beamLen;
              const ey = sy + Math.sin(desired) * beamLen;
              this.particles.push({
                x: ex + (Math.random() - 0.5) * 8, y: ey + (Math.random() - 0.5) * 8,
                vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 100,
                life: 0.35, maxLife: 0.35,
                color: "oklch(0.92 0.20 60)", size: 1.5 + Math.random() * 1.8,
              });
            }
            // Hit only if target is within beam cone AND closer than the blocker
            const ang = Math.abs(((angle - desired + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            const targetDist = Math.hypot(dx, dy);
            if (ang < 0.18 && targetDist < beamLen) {
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

  private updateBamfCombo(a: Fighter, dt: number) {
    if (!a.bamfCombo) return;
    const combo = a.bamfCombo;
    combo.t += dt;
    a.iframeT = Math.max(a.iframeT, 0.25);
    a.vx = 0; a.vy = 0; a.onGround = a.y >= GROUND_Y - FIGHTER_H - 1;
    a.stunT = 0; a.webSnareT = 0; a.ragdollImmuneT = 0;

    // Tick the visible swing through the pose system so the punch/kick animates.
    if (a.meleeKind === "bamfPunch" || a.meleeKind === "bamfKick") {
      a.meleeT += dt;
      if (a.meleeT >= a.meleeDur) {
        a.meleeKind = null; a.meleeT = 0; a.attackAnim = 0;
      } else {
        a.attackAnim = Math.max(a.attackAnim, a.meleeDur - a.meleeT);
      }
    }

    if (combo.t < combo.nextAt) return;

    const t = combo.targetId === "p1" ? this.p1 : this.p2;
    const step = combo.step;
    if (step >= 3) {
      a.bamfCombo = null;
      a.iframeT = Math.max(a.iframeT, 0.4);
      a.meleeKind = null;
      return;
    }

    type Step = { tx: number; ty: number; kbDir: 1 | -1; kbY: number; kbX: number; kind: "bamfPunch" | "bamfKick"; ragdoll: number; spin: number; dmg: number; hs: number; sh: number; slow: number };
    const steps: Step[] = [
      { tx: t.x, ty: Math.max(40, t.y - 72),
        kbDir: (t.x >= a.x ? 1 : -1) as 1 | -1, kbY: -180, kbX: 220,
        kind: "bamfPunch", ragdoll: 0.6, spin: 4,
        dmg: BAMF_COMBO_DMG[0], hs: BAMF_COMBO_HITSTOP[0], sh: BAMF_COMBO_SHAKE[0], slow: 0.12 },
      { tx: Math.max(40, t.x - 60), ty: Math.max(40, Math.min(GROUND_Y - FIGHTER_H, t.y)),
        kbDir: 1, kbY: -260, kbX: 320,
        kind: "bamfKick", ragdoll: 0.7, spin: 6,
        dmg: BAMF_COMBO_DMG[1], hs: BAMF_COMBO_HITSTOP[1], sh: BAMF_COMBO_SHAKE[1], slow: 0.18 },
      { tx: Math.max(40, t.x - 56), ty: Math.max(40, Math.min(GROUND_Y - FIGHTER_H, t.y)),
        kbDir: 1, kbY: -360, kbX: 560,
        kind: "bamfPunch", ragdoll: 1.0, spin: 8,
        dmg: BAMF_COMBO_DMG[2], hs: BAMF_COMBO_HITSTOP[2], sh: BAMF_COMBO_SHAKE[2], slow: 0.4 },
    ];
    const s = steps[step];

    // Departure puff at old position + ghost trail
    this.bamfPuff(a.x, a.y + FIGHTER_H / 2, "depart");
    for (let i = 0; i < 3; i++) {
      a.trail.push({
        x: a.x, y: a.y, phase: a.walkPhase, vx: 0, vy: 0,
        onGround: true, facing: a.facing, pose: this.poseFor(a),
      });
    }

    // Teleport
    a.x = Math.max(30, Math.min(W - 30, s.tx));
    a.y = s.ty;
    a.facing = (t.x >= a.x ? 1 : -1) as 1 | -1;
    a.facingT = a.facing;
    a.onGround = a.y >= GROUND_Y - FIGHTER_H - 1;
    Sfx.play("bamf", 1.0);

    // Arrival puff + sharp impact ring
    this.bamfPuff(a.x, a.y + FIGHTER_H / 2, "arrive");
    this.shockwaves.push({
      x: a.x, y: a.y + FIGHTER_H / 2, r: 8, rMax: 64,
      life: 0.32, maxLife: 0.32, color: "oklch(0.75 0.22 305)",
    });

    // Drive the visible swing through the pose system
    const stepDur = BAMF_COMBO_STEP * 0.95;
    a.meleeKind = s.kind;
    a.meleeT = 0;
    a.meleeDur = stepDur;
    a.attackAnim = stepDur;
    Sfx.play("whoosh", 0.5);

    // ---- Depth-aware hit alignment ----
    // The visible strike limb extends ~38–40px (perspective-stretched) from the
    // attacker's shoulder/hip toward the camera-facing direction. Place the hit
    // and impact FX at that projected limb tip rather than at target.x so the
    // 3D z-offset illusion lines up with the actual hitbox.
    const reachWorld = s.kind === "bamfPunch" ? 40 : 36;
    const limbTipX = a.x + a.facing * reachWorld;
    // Strike Y matches limb height: punch ~ shoulder (head/upper-torso),
    // kick ~ hip / mid-torso. Account for perspective scale lift (~6-8px up).
    const shoulderWorldY = a.y + 28; // shoulder approx
    const hipWorldY = a.y + 56;
    const limbTipY = (s.kind === "bamfPunch" ? shoulderWorldY : hipWorldY) - 4;
    // Hit only if depth-aware hitbox actually overlaps the target body
    const hitsTarget =
      Math.abs(limbTipX - t.x) < 38 &&
      limbTipY > t.y - 8 &&
      limbTipY < t.y + FIGHTER_H + 8;

    if (hitsTarget && t.iframeT <= 0 && t.downedT <= 0 && t.getUpT <= 0) {
      t.ragdollImmuneT = 0;
      t.hp = Math.max(0, t.hp - s.dmg);
      t.hitFlash = 0.55;
      t.vx = s.kbDir * s.kbX;
      t.vy = s.kbY;
      t.onGround = false;
      t.ragdollT = s.ragdoll;
      t.ragdollPhase = 0;
      t.ragdollAng = 0;
      t.ragdollAV = s.kbDir * s.spin + (Math.random() - 0.5) * 3;
      t.ragdollEnergy = 1;
      applyImpulse(t.wobble, s.kbDir, -0.7, 1.0);
      this.shake = Math.max(this.shake, s.sh);
      this.hitstopT = Math.max(this.hitstopT, s.hs);
      this.impactFlash = 1;
      this.slowmoT = Math.max(this.slowmoT, s.slow);
      this.slowmoMode = "impact";

      // Impact spawns AT the projected limb tip (pulled slightly toward target body)
      const ix = limbTipX * 0.4 + t.x * 0.6;
      const iy = limbTipY * 0.5 + (t.y + (s.kind === "bamfPunch" ? 32 : 50)) * 0.5;
      this.burst(ix, iy, "oklch(0.96 0.06 80)", 26);
      this.burst(ix, iy, "oklch(0.7 0.22 305)", 22);
      this.shockwaves.push({ x: ix, y: iy, r: 4, rMax: 70, life: 0.4, maxLife: 0.4, color: "oklch(0.95 0.18 95)" });
      this.shockwaves.push({ x: ix, y: iy, r: 10, rMax: 90, life: 0.5, maxLife: 0.5, color: "oklch(0.55 0.22 305)" });
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
        const sp = 280 + Math.random() * 240;
        this.particles.push({
          x: ix, y: iy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 70,
          life: 0.4 + Math.random() * 0.25, maxLife: 0.65,
          color: i % 2 ? "oklch(0.95 0.05 80)" : "oklch(0.6 0.22 300)",
          size: 2 + Math.random() * 2.6,
        });
      }
      // Direction-biased motion-blur smear
      for (let i = 0; i < 8; i++) {
        const sp = 360 + Math.random() * 240;
        this.particles.push({
          x: ix, y: iy + (Math.random() - 0.5) * 12,
          vx: s.kbDir * sp, vy: -120 + (Math.random() - 0.5) * 80,
          life: 0.3 + Math.random() * 0.2, maxLife: 0.5,
          color: "oklch(0.92 0.04 280)",
          size: 1.6 + Math.random() * 1.6,
        });
      }
      Sfx.play(step === 2 ? "heavy" : "punch", 1);
      if (t.hp <= 0) { this.phase = "ko"; this.winner = a.id; a.bamfCombo = null; return; }
    }

    combo.step = step + 1;
    combo.nextAt = combo.t + BAMF_COMBO_STEP;
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

  /** Raycast against blocking platforms (cover blocks fully; thin platforms also block lasers). Returns nearest hit or null. */
  private raycastPlatforms(sx: number, sy: number, angle: number, maxLen: number): { dist: number } | null {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best: number | null = null;
    for (const pl of this.platforms) {
      // Slab method: ray vs AABB
      const minX = pl.x, maxX = pl.x + pl.w;
      const minY = pl.y, maxY = pl.y + pl.h;
      let tmin = 0, tmax = maxLen;
      if (Math.abs(dx) < 1e-6) {
        if (sx < minX || sx > maxX) continue;
      } else {
        let t1 = (minX - sx) / dx, t2 = (maxX - sx) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dy) < 1e-6) {
        if (sy < minY || sy > maxY) continue;
      } else {
        let t1 = (minY - sy) / dy, t2 = (maxY - sy) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin >= 0 && tmin <= maxLen && (best === null || tmin < best)) best = tmin;
    }
    return best === null ? null : { dist: best };
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
    const pw = getPowerSpec(f.skin.id);
    return {
      id: f.id, name: f.name,
      hp: f.hp, maxHp: 100,
      fireCd: f.fireCd, fireCdMax: FIRE_CD,
      teleCd: f.teleCd, teleCdMax: TELE_CD,
      meleeCd: f.meleeCd, meleeCdMax: f.move.cooldown,
      meleeName: f.move.name,
      teleporting: f.teleporting,
      frenzyCd: f.frenzyCd, frenzyCdMax: FRENZY_CD,
      hasFrenzy: f.skin.id === "hulk",
      frenzyActive: f.frenzy !== null,
      hasPower1: !!pw.power1,
      hasPower2: !!pw.power2,
      power1Name: pw.power1?.name ?? "",
      power2Name: pw.power2?.name ?? "",
      power1Cd: f.power1Cd, power1CdMax: pw.power1?.cd ?? 1,
      power2Cd: f.power2Cd, power2CdMax: pw.power2?.cd ?? 1,
      frozen: f.freezeT > 0,
      freezeRemaining: f.freezeT,
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
      const bamf = f.meleeKind === "bamfPunch" || f.meleeKind === "bamfKick";
      if (bamf) {
        // Additive purple tint for depth-implying motion smear
        ctx.globalCompositeOperation = "lighter";
      }
      for (let i = 0; i < f.trail.length; i++) {
        const a = (i + 1) / (f.trail.length + 1) * (bamf ? 0.55 : 0.4);
        ctx.globalAlpha = a;
        const t = f.trail[i];
        this.drawFighterAt(f, t.x, t.y, t.pose, true);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // Hide attacker (and target) during frenzy — replaced by video clip below.
    const frenzyAttacker = this.p1.frenzy ? this.p1 : (this.p2.frenzy ? this.p2 : null);
    if (frenzyAttacker !== this.p1) this.drawFighter(this.p1);
    if (frenzyAttacker !== this.p2) this.drawFighter(this.p2);

    // Frenzy overlay — prefer frame sequence for mobile reliability, fall back to video.
    if (frenzyAttacker) {
      const fr = frenzyAttacker.frenzy!;
      const trans = Math.min(1, fr.transitionT / 0.25);
      const ease = trans * trans * (3 - 2 * trans);
      const fade = Math.min(1, fr.t * 6) * Math.min(1, (fr.dur - fr.t) * 4);
      const targetH = FIGHTER_H * 2.55;
      const frameIndex = Math.max(0, Math.min(FRENZY_FRAME_COUNT - 1, Math.floor((fr.t / fr.dur) * FRENZY_FRAME_COUNT)));
      const source = this.frenzyFrames[frameIndex]?.complete
        ? this.frenzyFrames[frameIndex]
        : (this.frenzyVideoReady ? this.frenzyVideo : null);
      const ratio = source ? ((source as HTMLImageElement).naturalWidth || (source as HTMLVideoElement).videoWidth || 16) / (((source as HTMLImageElement).naturalHeight || (source as HTMLVideoElement).videoHeight || 9)) : (16 / 9);
      const targetW = targetH * ratio;
      const cx = frenzyAttacker.x + frenzyAttacker.facing * 6;
      const cy = frenzyAttacker.y + FIGHTER_H * 0.52;
      const facing = frenzyAttacker.facing;
      const pulse = fr.punchPulse;
      ctx.save();
      ctx.translate(cx, cy);
      // Punch-driven micro punch-in zoom
      const punchZoom = 1 + pulse * 0.08;
      ctx.scale(facing * (0.68 + ease * 0.32) * punchZoom, (0.68 + ease * 0.32) * punchZoom);
      ctx.globalCompositeOperation = source === this.frenzyVideo ? "screen" : "source-over";
      // Subtle screen-shake driven jitter for impact
      const jx = (Math.random() - 0.5) * (4 + pulse * 10);
      const jy = (Math.random() - 0.5) * (4 + pulse * 10);
      if (source) {
        try {
          // Motion blur trail: multiple offset passes during punch pulse
          if (pulse > 0.05 && !this.lowPower) {
            const blurPasses = 3;
            for (let i = 1; i <= blurPasses; i++) {
              const offset = (i / blurPasses) * 14 * pulse * facing;
              ctx.globalAlpha = fade * pulse * 0.22;
              ctx.drawImage(source, -targetW / 2 - offset + jx, -targetH / 2 + jy, targetW, targetH);
            }
          }
          ctx.globalAlpha = fade;
          ctx.drawImage(source, -targetW / 2 + jx, -targetH / 2 + jy, targetW, targetH);
          // White overlay flash on the sprite during punch impact
          if (pulse > 0.1) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = fade * pulse * 0.5;
            ctx.drawImage(source, -targetW / 2 + jx, -targetH / 2 + jy, targetW, targetH);
          }
        } catch { /* source may not be decode-ready */ }
      }
      ctx.restore();
      // Per-punch radial flash centered on target
      if (pulse > 0.05) {
        const tx = frenzyAttacker.x + facing * 96;
        const ty = frenzyAttacker.y + FIGHTER_H * 0.55;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pulse * 0.55;
        const grad = ctx.createRadialGradient(tx, ty, 4, tx, ty, 140);
        grad.addColorStop(0, "oklch(0.98 0.18 50)");
        grad.addColorStop(0.5, "oklch(0.85 0.20 30)");
        grad.addColorStop(1, "oklch(0.20 0.15 25 / 0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(tx, ty, 140, 0, Math.PI * 2); ctx.fill();
        // White streaks emanating outward
        ctx.strokeStyle = "oklch(1 0.05 80)";
        ctx.lineWidth = 2;
        ctx.globalAlpha = pulse * 0.7;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + fr.t * 4;
          const r1 = 30 + (1 - pulse) * 20;
          const r2 = 70 + pulse * 50;
          ctx.beginPath();
          ctx.moveTo(tx + Math.cos(a) * r1, ty + Math.sin(a) * r1);
          ctx.lineTo(tx + Math.cos(a) * r2, ty + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      // Transition flash burst on the first frames
      if (trans < 1) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 1 - ease;
        ctx.fillStyle = "oklch(0.78 0.22 25)";
        ctx.beginPath();
        ctx.arc(cx, cy, 80 + ease * 120, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }

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

    // ---- Lightning orbs (Flash power 2) ----
    ctx.globalCompositeOperation = "lighter";
    for (const lo of this.lightnings) {
      const fade = Math.min(1, lo.life * 4);
      if (!this.lowPower) { ctx.shadowBlur = 30; ctx.shadowColor = "oklch(0.95 0.18 95)"; }
      ctx.fillStyle = "oklch(0.95 0.18 95)";
      ctx.globalAlpha = fade * 0.85;
      ctx.beginPath(); ctx.arc(lo.x, lo.y, 10 + Math.sin(lo.phase) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "oklch(0.99 0.06 95)";
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(lo.x, lo.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "oklch(0.95 0.18 95)";
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = fade * 0.85;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + lo.phase * 0.4;
        let px = lo.x, py = lo.y;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          const r = 6 + k * 5;
          const jag = (Math.random() - 0.5) * 6;
          px = lo.x + Math.cos(a) * r + Math.cos(a + Math.PI / 2) * jag;
          py = lo.y + Math.sin(a) * r + Math.sin(a + Math.PI / 2) * jag;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";

    // ---- Time Freeze ring around frozen victim ----
    if (this.timeFreezeT > 0 && this.timeFreezer) {
      const victim = this.timeFreezer === "p1" ? this.p2 : this.p1;
      const fade = Math.min(1, this.timeFreezeT * 2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "oklch(0.92 0.14 220)";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.65 * fade;
      const ringR = 50 + Math.sin(this.elapsed * 6) * 4;
      ctx.beginPath(); ctx.arc(victim.x, victim.y + 40, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "oklch(0.95 0.16 220)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + this.elapsed * 0.3;
        const r1 = ringR - 4, r2 = ringR + 4;
        ctx.beginPath();
        ctx.moveTo(victim.x + Math.cos(a) * r1, victim.y + 40 + Math.sin(a) * r1);
        ctx.lineTo(victim.x + Math.cos(a) * r2, victim.y + 40 + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

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

    // ---- Bamf strike depth FX (perspective scale + z-shadow) ----
    // Drives a punch-in zoom toward the camera plus a darker offset shadow underfoot
    // to fake a Z-axis (depth) push during the active swing window.
    let bamfScale = 1;
    let bamfActive = false;
    if (!ghost && (f.meleeKind === "bamfPunch" || f.meleeKind === "bamfKick") && f.meleeDur > 0) {
      bamfActive = true;
      const p = Math.min(1, f.meleeT / f.meleeDur);
      // Bell curve peaking near contact (~45%) → zooms toward camera then settles
      const bell = Math.sin(Math.min(1, p * 1.6) * Math.PI);
      bamfScale = 1 + bell * 0.18;
      // Z-offset shadow: heavier offset under the fighter to imply forward push
      if (f.onGround) {
        ctx.save();
        ctx.fillStyle = `oklch(0 0 0 / ${0.18 + bell * 0.22})`;
        ctx.beginPath();
        ctx.ellipse(x + f.facing * bell * 6, y + FIGHTER_H - 1, 22 + bell * 10, 5 + bell * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(x, y);
    if (bamfActive) {
      // Perspective scale anchored at the feet so the head/fist swell forward.
      ctx.translate(0, FIGHTER_H);
      ctx.scale(bamfScale, bamfScale);
      ctx.translate(0, -FIGHTER_H);
    }
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

    // ---- Hulk: muscle bulges on limbs ----
    if (skin.id === "hulk" && !ghost) {
      const muscleFill = `color-mix(in oklab, ${limbColor} 70%, white)`;
      const muscleShade = `color-mix(in oklab, ${limbColor} 60%, black)`;
      const drawMuscle = (j: [number, number, number, number, number, number], rx: number, ry: number) => {
        // bulge near upper segment (between joint and mid)
        const ux = (j[0] + j[2]) / 2;
        const uy = (j[1] + j[3]) / 2;
        const ang = Math.atan2(j[3] - j[1], j[2] - j[0]);
        ctx.save();
        ctx.translate(ux, uy);
        ctx.rotate(ang);
        ctx.fillStyle = muscleFill;
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.ellipse(0, -ry * 0.4, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = muscleShade;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.ellipse(0, ry * 0.5, rx * 0.85, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };
      // Biceps + forearms
      drawMuscle(pose.armL, 7, 4.5);
      drawMuscle(pose.armR, 7, 4.5);
      drawMuscle([pose.armL[2], pose.armL[3], pose.armL[4], pose.armL[5], pose.armL[4], pose.armL[5]], 5.5, 3.6);
      drawMuscle([pose.armR[2], pose.armR[3], pose.armR[4], pose.armR[5], pose.armR[4], pose.armR[5]], 5.5, 3.6);
      // Quads + calves
      drawMuscle(pose.legL, 8, 5);
      drawMuscle(pose.legR, 8, 5);
      drawMuscle([pose.legL[2], pose.legL[3], pose.legL[4], pose.legL[5], pose.legL[4], pose.legL[5]], 6, 4);
      drawMuscle([pose.legR[2], pose.legR[3], pose.legR[4], pose.legR[5], pose.legR[4], pose.legR[5]], 6, 4);
      ctx.globalAlpha = 1;

      // Pecs + abs on torso
      const torsoMid = (shoulderY + hipY) / 2;
      ctx.save();
      // Pecs (two large ellipses just below shoulder line)
      ctx.fillStyle = muscleFill;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(-5, shoulderY + 6, 6, 5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, shoulderY + 6, 6, 5, 0.2, 0, Math.PI * 2); ctx.fill();
      // Pec separation shadow
      ctx.strokeStyle = muscleShade;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(0, shoulderY + 2); ctx.lineTo(0, shoulderY + 11); ctx.stroke();
      // Abs (3 horizontal pairs)
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        const ay = torsoMid - 1 + i * 4;
        ctx.beginPath(); ctx.moveTo(-4, ay); ctx.lineTo(-1, ay); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1, ay); ctx.lineTo(4, ay); ctx.stroke();
      }
      // Center ab line
      ctx.beginPath(); ctx.moveTo(0, shoulderY + 12); ctx.lineTo(0, hipY - 2); ctx.stroke();
      // Shoulder traps
      ctx.fillStyle = muscleFill;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.ellipse(-7, shoulderY - 1, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, shoulderY - 1, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill();
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

    // ---- Hulk: angry expression (furrowed brows, scowl, bared teeth) ----
    if (skin.id === "hulk" && !ghost) {
      ctx.save();
      // Furrowed thick brows angled inward over the eyes
      ctx.strokeStyle = "oklch(0.10 0.05 25)";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      // Left brow: outer-low to inner-high (angry V)
      ctx.beginPath();
      ctx.moveTo(-5.5, headY - 2.6);
      ctx.lineTo(-1.2, headY - 1.4);
      ctx.stroke();
      // Right brow
      ctx.beginPath();
      ctx.moveTo(5.5, headY - 2.6);
      ctx.lineTo(1.2, headY - 1.4);
      ctx.stroke();
      // Brow shadow / forehead crease
      ctx.strokeStyle = "oklch(0.18 0.10 25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, headY - 4);
      ctx.lineTo(0, headY - 3.4);
      ctx.lineTo(3, headY - 4);
      ctx.stroke();
      // Snarling mouth — open, downturned, with bared teeth
      const my = headY + 4.5;
      // Dark mouth interior
      ctx.fillStyle = "oklch(0.12 0.02 25)";
      ctx.beginPath();
      ctx.moveTo(-4.5, my);
      ctx.quadraticCurveTo(-2, my + 2.4, 0, my + 1.8);
      ctx.quadraticCurveTo(2, my + 2.4, 4.5, my);
      ctx.quadraticCurveTo(2, my + 0.4, 0, my + 0.6);
      ctx.quadraticCurveTo(-2, my + 0.4, -4.5, my);
      ctx.closePath();
      ctx.fill();
      // Bared teeth
      ctx.fillStyle = "oklch(0.95 0.02 80)";
      ctx.fillRect(-3.2, my + 0.7, 1.2, 1.2);
      ctx.fillRect(-1.6, my + 0.9, 1.2, 1.2);
      ctx.fillRect(0.4, my + 0.9, 1.2, 1.2);
      ctx.fillRect(2.0, my + 0.7, 1.2, 1.2);
      // Strong jawline shadow
      ctx.strokeStyle = "oklch(0.16 0.06 25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-headR + 1, headY + 2);
      ctx.quadraticCurveTo(0, headY + headR - 1, headR - 1, headY + 2);
      ctx.stroke();
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

interface PowerSpec {
  power1?: { name: string; cd: number };
  power2?: { name: string; cd: number };
}
function getPowerSpec(id: SkinId): PowerSpec {
  switch (id) {
    case "flash":
      return {
        power1: { name: "Time Freeze", cd: TIMEFREEZE_CD },
        power2: { name: "Lightning Blast", cd: LIGHTNING_CD },
      };
    case "superman":
      return {
        power1: { name: "Solar Flare", cd: SOLAR_FLARE_CD },
        power2: { name: "Heat Vision", cd: HEAT_VISION_CD },
      };
    case "ironman":
      return {
        power1: { name: "Unibeam", cd: UNIBEAM_CD },
        power2: { name: "Micro-Missiles", cd: MICRO_MISSILE_CD },
      };
    case "heatwave":
      return {
        power1: { name: "Inferno Wall", cd: INFERNO_WALL_CD },
        power2: { name: "Magma Blast", cd: MAGMA_BLAST_CD },
      };
    case "nightcrawler":
      return {
        power1: { name: "Bamf Cloud", cd: BAMF_CLOUD_CD },
        power2: { name: "Bamf Combo", cd: BAMF_COMBO_CD },
      };
    default:
      return {};
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
