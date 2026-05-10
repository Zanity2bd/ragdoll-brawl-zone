// OgunArena — Canvas 2D engine v3 (a Blkdom production)
// Per-skin signature melees with impact frames, ragdoll, slow-mo, SFX.

import { computeWalkPose, computeRagdollPose, blendPose, type Pose } from "./animation";
import { getMap, type MapId } from "./maps";
import { getSkin, type Skin, type SkinId } from "./skins";
import { MOVES, type MoveSpec } from "./combat";
import { Sfx } from "./sfx";
import { createWobble, stepWobble, applyWobble, applyImpulse, resetWobble, type WobbleState } from "./wobble";
import { CpuController, type Difficulty } from "./ai";
import {
  loadWalkSheet, isWalkSheetReady, drawWalkFrame,
  WALK_LOOP_FRAMES, PUNCH_FRAME_START, RECOVERY_FRAME,
  JUMP_TAKEOFF_FRAME, JUMP_RISE_FRAME, JUMP_APEX_FRAME, JUMP_LAND_FRAME,
  DOWN_FRAME, GETUP_FRAME_A, GETUP_FRAME_B, HURT_FRAME,
  KICK_CHAMBER_FRAME, KICK_HIT_FRAME, KNEE_CHAMBER_FRAME, KNEE_HIT_FRAME,
} from "./walkSprite";
// (taijutsu sprite removed)
import { getStance } from "./stances";
import { loadV2Sheet } from "./walkCycleV2";
import { loadAttackFx, spawnFx, tickFx, drawFxPool, type ActiveFx } from "./attackFx";

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
  koCinematicT: number; // seconds elapsed since KO trigger; UI waits to overlay
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
  walkSpeedSmooth: number; // low-passed |vx| feeding stride to kill jitter
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
  groundedT: number;       // continuous time on ground while ragdolling (for settle gate)
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
  // Cape & body secondary motion (spring-driven). All values are visual only.
  capeSwingX: number;   // current horizontal cape offset (px)
  capeSwingV: number;   // velocity of capeSwingX
  capeLift: number;     // how much the cape bottom flares up (0..1)
  bodyLagX: number;     // small body translation lag for impacts
  bodyLagV: number;     // velocity of bodyLagX
  bodyRoll: number;     // extra torso roll from turns/impacts (rad)
  bodyRollV: number;    // velocity for bodyRoll
  prevFacing: 1 | -1;   // to detect turns
  prevHitFlash: number; // to detect new impacts
  // ledge / drop-through state
  dropT: number;
  ledgeFlash: number;
  // jump feel: coyote + buffer + variable height
  coyoteT: number;
  jumpBufferT: number;
  jumpHeldT: number;       // remaining time variable-height boost is active
  airJumps: number;        // remaining mid-air jumps
  preJumpT: number;        // crouch anticipation before launch
  landSquashT: number;     // post-landing recovery (movement-locked, attack-cancel ok)
  landImpact: number;      // 0..1 cached at landing (drives squash depth + frame hold)
  // ragdoll secondary motion
  ragdollWobble: number;   // secondary floppy angle overlay (rad, decays with energy)
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
  // Nightcrawler Taijutsu Flurry — frame-driven scripted sequence
  bamfCombo: null | { t: number; targetId: PlayerId; hits: Set<number>; startX: number };
  // Spider-Man Web Swing — pendulum physics
  swing: null | { ax: number; ay: number; len: number; angle: number; angV: number; t: number };
  justLandedT: number;  // brief squash on touchdown
  // Universal basic punch — sprite-driven (frames 11–14 + recovery 15)
  punchT: number;       // 0 = idle, otherwise progress through PUNCH_DUR
  punchCd: number;
  punchHit: boolean;    // ensures one hit per swing
  recoverT: number;     // frame-15 transition timer (visual only)
  // 3-tap combo: 0 = next is basic punch, 1 = next is high kick, 2 = next is knee finisher
  comboStep: number;
  comboWindowT: number; // window during which the next tap chains the combo
  comboT: number;       // active timer for kick/knee swing
  comboDur: number;     // duration of current combo swing
  comboKind: "kick" | "knee" | null;
  comboHit: boolean;
  // Air juggle: hits stacked while target is airborne. Scales damage/KB
  // down with diminishing returns so launches stay cinematic but not abusive.
  juggleHits: number;
  juggleResetT: number;
  juggleFlash: number;
  // Parry window: tap PUNCH right before an incoming hit to deflect it,
  // stagger the attacker, and refund a chunk of super cooldown.
  parryT: number;
  parrySuccessT: number; // cosmetic flash after a successful parry
}

interface SmokeCloud {
  x: number; y: number; r: number; rMax: number; life: number; maxLife: number;
  vx?: number; vy?: number; hue?: number; seed?: number; dense?: boolean;
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
  /** Optional gravity multiplier (1 = full gravity). Used for blood droplets. */
  grav?: number;
  /** When true, on touching ground (GROUND_Y) particle stamps a ground decal. */
  blood?: boolean;
}

interface Shockwave { x: number; y: number; r: number; rMax: number; life: number; maxLife: number; color: string; }
interface Beam { owner: PlayerId; x: number; y: number; angle: number; length: number; life: number; overload?: boolean; red?: boolean; }

interface Platform {
  x: number; y: number; w: number; h: number;
  // "platform" = thin one-way ledge (jump up through, land on top, drop-through with down).
  // "cover"    = solid block: lands on top AND blocks horizontal movement & projectiles.
  kind: "platform" | "cover";
  accent?: string;
  destroyed?: boolean;
}

interface Debris {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; rot: number; rotV: number;
  life: number; maxLife: number; color: string;
}

// Foreground props are SOLID destructible cover. They block movement & attacks
// for grounded fighters; flying fighters pass over freely. Buildings expose a
// walkable door so ground fighters can move through them. High-power piercing
// abilities (laser overload) chain-damage them in sequence.
type PropKind = "car" | "building" | "barrel" | "crate" | "lamppost" | "trashcan" | "vending" | "pillar";
interface Prop {
  x: number; y: number; w: number; h: number;
  kind: PropKind;
  destroyed?: boolean;
  hp: number;            // current health
  maxHp: number;         // for damage visualization (cracks/flash)
  damageFlash: number;   // 0..1 white flash when hit, decays each tick
  hue?: number;          // primary hue for body color
  accent?: number;       // accent hue (glow / trim / door)
  hasDoor?: boolean;     // building only: walkable door at base
  doorX?: number;        // computed door rect (world coords)
  doorW?: number;
  doorY?: number;
  doorH?: number;
  seed?: number;
}

export interface Intents {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  teleport: boolean;
  melee: boolean;
  punch: boolean;
  // Analog flight steering, -1..1. When flying, replaces ground walk input.
  ax: number;
  ay: number;
  // Toggle flight on/off (edge-triggered)
  toggleFlight: boolean;
}

const W = 1280;
const H = 720;
const GROUND_Y = 600;
const GRAVITY = 1750;              // base — heavier than vanilla for committed arcs
const FALL_GRAVITY_MUL = 1.85;     // heavier on the way down → snappy fall
const LOW_JUMP_GRAVITY_MUL = 2.2;  // jump released early → kill ascent fast
const APEX_GRAVITY_MUL = 0.55;     // softens the very top of the arc (hang-time pop)
const MOVE_SPEED = 210;
const ACCEL = 1400;
const FRICTION = 1600;
const AIR_CONTROL = 0.55;          // accel multiplier in air
const JUMP_V = 690;                // bumped to compensate for stronger gravity
const JUMP_HOLD_T = 0.20;          // window during which holding jump keeps gravity light
const PRE_JUMP_T = 0.07;           // anticipation crouch before launch
const COYOTE_T = 0.09;             // post-leave grace
const JUMP_BUFFER_T = 0.11;        // press buffer
const MAX_AIR_JUMPS = 1;            // double-jump for non-flyers
const FIGHTER_H = 90;
// Universal basic punch — sprite-driven (frames 11–14 + recovery 15).
// Speed up frames 12–13 (impact window) for snap.
const PUNCH_F11 = 0.05;  // windup    -> frame 10
const PUNCH_F12 = 0.03;  // impact 1  -> frame 11 (hit active)
const PUNCH_F13 = 0.03;  // impact 2  -> frame 12 (hit active)
const PUNCH_F14 = 0.06;  // followthr -> frame 13
const PUNCH_DUR = PUNCH_F11 + PUNCH_F12 + PUNCH_F13 + PUNCH_F14;
const PUNCH_RECOVERY = 0.05;  // frame 14, no hit
const PUNCH_CD = 0.32;
const PUNCH_RANGE = 60;
const PUNCH_DMG = 1;
const FIGHTER_W = 30;

const FIRE_CD = 0.8;
const TELE_CD = 0.9;
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
const SUPER_DAMAGE = 26;          // nerfed from 46 — was a near one-shot
const SUPER_KB_X = 1180;
const SUPER_KB_Y = -440;
const SUPER_HITSTOP = 0.30;
const SUPER_SLOWMO = 0.55;
const SUPER_RAGDOLL = 1.15;
const SUPER_SHAKE = 46;

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
const HEAT_VISION_CD = 20;
const HEAT_VISION_DUR = 10.0;
const HEAT_VISION_DPS = 1; // mirrors Homelander laserSweep dps; overload triples
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
// Taijutsu Flurry — bamf-in then a smooth 5-strike combo (no per-hit teleport).
// Reference: taijutsu100..137 frames — alternating punch / high-kick / knee / punch / finisher.
const BAMF_COMBO_CD = 12;
const BAMF_COMBO_STEP = 0.22;       // legacy, unused (kept for refs)
const BAMF_COMBO_DMG = [8, 9, 10, 11, 18];
const BAMF_COMBO_HITSTOP = [0.05, 0.05, 0.06, 0.07, 0.18];
const BAMF_COMBO_SHAKE = [8, 9, 10, 12, 22];
const TAIJUTSU_FPS = 24;            // playback rate for the 42-frame sheet (~1.75s)

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

// ---- Ragdoll → get-up phase clock ----
// Single source of truth shared by update(), poseFor() and the renderer so the
// pose blend, sprite frame, vertical lift, lean, and FX never desync.
type RisePhase = "gather" | "press" | "kneel" | "coil" | "drive" | "settle";
interface RiseInfo {
  phase: RisePhase;
  /** 0..1 progress within the current phase */
  local: number;
  /** Hand-shaped vertical lift, 0 = on ground, 1 = standing eye-line */
  lift: number;
  /** Overall normalized progress 0..1 (echoes input) */
  u: number;
}
function risePhase(u: number): RiseInfo {
  // Phase windows.
  // gather 0.00-0.10  : on the ground, body drops shoulder
  // press  0.10-0.30  : push up onto hands, hips lift
  // kneel  0.30-0.50  : plant a knee — flat plateau (weight bearing)
  // coil   0.50-0.68  : anticipation crouch — small dip
  // drive  0.68-0.88  : explosive rise to standing
  // settle 0.88-1.00  : tiny overshoot then hold
  let phase: RisePhase;
  let local: number;
  if (u < 0.10) { phase = "gather"; local = u / 0.10; }
  else if (u < 0.30) { phase = "press"; local = (u - 0.10) / 0.20; }
  else if (u < 0.50) { phase = "kneel"; local = (u - 0.30) / 0.20; }
  else if (u < 0.68) { phase = "coil"; local = (u - 0.50) / 0.18; }
  else if (u < 0.88) { phase = "drive"; local = (u - 0.68) / 0.20; }
  else { phase = "settle"; local = (u - 0.88) / 0.12; }

  // lift curve — built to plateau on plant beats and explode on drive
  let lift: number;
  switch (phase) {
    case "gather": lift = 0.02 * local; break;
    case "press":  lift = 0.02 + 0.18 * (local * local * (3 - 2 * local)); break; // 0.02 -> 0.20
    case "kneel":  lift = 0.20 + 0.10 * local; break;                              // gentle 0.20 -> 0.30
    case "coil":   lift = 0.30 - 0.04 * Math.sin(local * Math.PI); break;          // dip below 0.30
    case "drive": {
      // easeOutQuart from 0.28 (post-dip) to 1.04 (overshoot)
      const e = 1 - Math.pow(1 - local, 4);
      lift = 0.28 + (1.04 - 0.28) * e;
      break;
    }
    case "settle": {
      // 1.04 → 1.00 settle
      lift = 1.04 - 0.04 * (local * local * (3 - 2 * local));
      break;
    }
  }
  return { phase, local, lift, u };
}

interface GroundDecal {
  x: number;
  w: number;          // half-width of the scuff ellipse
  life: number;
  maxLife: number;
  color: string;
}

/** Jagged ground crack from heavy slams (Hulk, Magma, finishers). */
interface Crack {
  x: number;          // impact x at GROUND_Y
  rays: Array<{ ang: number; len: number; jitter: number[] }>;
  life: number;
  maxLife: number;
  intensity: number;  // 0..1 — scales width/length
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
  private groundDecals: GroundDecal[] = [];
  private cracks: Crack[] = [];
  private shockwaves: Shockwave[] = [];
  private attackFx: ActiveFx[] = [];
  private beams: Beam[] = [];
  private lightnings: LightningOrb[] = [];
  private missiles: Missile[] = [];
  private fireWalls: FireWall[] = [];
  private magmas: MagmaBlast[] = [];
  private smokeClouds: SmokeCloud[] = [];
  private debris: Debris[] = [];
  private props: Prop[] = [];
  // One-shot VO flags — reset each match.
  private homelanderVoPlayed = false;
  // Beam edge-trigger tracking for start/end recoil + shake + audio.
  private beamWasActive: Record<PlayerId, boolean> = { p1: false, p2: false };
  // Deferred SFX cues — fire at engine-time T (survives pause; cleared on reset).
  private pendingSfx: Array<{ at: number; name: import("./sfx").SfxName; vol: number }> = [];
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
    p1: { left: false, right: false, jump: false, fire: false, teleport: false, melee: false, punch: false, ax: 0, ay: 0, toggleFlight: false },
    p2: { left: false, right: false, jump: false, fire: false, teleport: false, melee: false, punch: false, ax: 0, ay: 0, toggleFlight: false },
  };

  private teleTargeting: PlayerId | null = null;
  private slowmoT = 0;
  private slowmoMode: "tele" | "impact" | null = null;
  private hitstopT = 0;
  private impactFlash = 0;

  private shake = 0;
  // Directional shake: punches the camera *toward* the strike direction
  // before settling, on top of the legacy omnidirectional random shake.
  private shakeDirX = 0;
  private shakeDirY = 0;
  private shakeDirT = 0;
  private shakeDirDur = 0;
  // Zoom-punch: short multiplicative zoom kick on big hits.
  // 0 = no effect; positive values briefly multiply camZoom.
  private zoomPunch = 0;
  private zoomPunchT = 0;
  private zoomPunchDur = 0;
  private introT = 1.5;
  private phase: "intro" | "fight" | "ko" = "intro";
  private winner: PlayerId | null = null;
  private koCinematicT = 0;
  private koFocus: { x: number; y: number } | null = null;
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
    loadWalkSheet();
    
    loadV2Sheet();
    loadAttackFx();
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
    // sy here is already a foot-anchored target — feed it through the resolver
    // (which expects a midpoint-style sy) by offsetting then letting it clamp.
    const dest = this.resolveTeleportTarget(sx, sy + FIGHTER_H / 2);
    f.x = dest.x; f.y = dest.y;
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
  }

  /** Signature Nightcrawler teleport puff: dense purple smoke + curling tendrils + sparks. */
  private bamfPuff(x: number, y: number, mode: "depart" | "arrive" | "strike") {
    // Realistic billowing brimstone: many small overlapping puffs that drift
    // upward with turbulence rather than a few hard discs.
    const puffs = mode === "strike" ? 10 : (mode === "arrive" ? 18 : 16);
    for (let i = 0; i < puffs; i++) {
      const ox = (Math.random() - 0.5) * 28;
      const oy = (Math.random() - 0.5) * 22;
      const rMax = 18 + Math.random() * 22 + (mode === "arrive" ? 6 : 0);
      const life = 0.9 + Math.random() * 0.7;
      // Hue: deep violet -> dusty grey-purple (brimstone)
      const hue = 290 + Math.random() * 25;
      this.smokeClouds.push({
        x: x + ox, y: y + oy,
        r: 6 + Math.random() * 6,
        rMax,
        life, maxLife: life,
        vx: (Math.random() - 0.5) * 28,
        vy: -18 - Math.random() * 36,
        hue,
        seed: Math.random() * 1000,
        dense: true,
      });
    }
    // Low ground hugging dark cloud
    if (mode !== "strike") {
      for (let i = 0; i < 6; i++) {
        const ox = (Math.random() - 0.5) * 50;
        this.smokeClouds.push({
          x: x + ox, y: y + 10 + Math.random() * 8,
          r: 8, rMax: 26 + Math.random() * 14,
          life: 1.3, maxLife: 1.3,
          vx: ox * 0.6, vy: -4 - Math.random() * 8,
          hue: 285 + Math.random() * 10,
          seed: Math.random() * 1000,
          dense: true,
        });
      }
    }
    this.burst(x, y, "oklch(0.55 0.22 305)", mode === "arrive" ? 22 : 18);
    // Glowing embers / sulphur sparks
    const count = mode === "strike" ? 8 : 16;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(ang) * sp * 0.7,
        vy: Math.sin(ang) * sp * 0.4 - 60 - Math.random() * 40,
        life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
        color: i % 2 === 0 ? "oklch(0.78 0.22 305)" : "oklch(0.92 0.18 60)",
        size: 1.6 + Math.random() * 2.2,
      });
    }
    for (let i = 0; i < (mode === "arrive" ? 12 : 6); i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
        life: 0.22 + Math.random() * 0.18, maxLife: 0.45,
        color: "oklch(0.97 0.18 95)",
        size: 1.3 + Math.random() * 1.4,
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
    this.attackFx = [];
    this.beams = [];
    this.lightnings = [];
    this.missiles = [];
    this.fireWalls = [];
    this.magmas = [];
    this.smokeClouds = [];
    this.debris = [];
    this.cracks = [];
    this.groundDecals = [];
    this.homelanderVoPlayed = false;
    this.beamWasActive = { p1: false, p2: false };
    // Restore any platforms destroyed by overload from a previous round
    for (const pl of this.platforms) pl.destroyed = false;
    this.props = this.buildPropsForMap(this.mapId);
    this.pendingSfx = [];
    this.timeFreezeT = 0; this.timeFreezer = null;
    this.teleTargeting = null;
    this.slowmoT = 0; this.slowmoMode = null;
    this.hitstopT = 0; this.impactFlash = 0;
    this.shake = 0;
    this.shakeDirX = 0; this.shakeDirY = 0; this.shakeDirT = 0; this.shakeDirDur = 0;
    this.zoomPunch = 0; this.zoomPunchT = 0; this.zoomPunchDur = 0;
    this.introT = 1.2;
    this.phase = "intro";
    this.winner = null;
    this.koCinematicT = 0;
    this.koFocus = null;
    this.emit();
  }

  /**
   * Centralized "this hit feels heavy" funnel. Layers directional shake,
   * zoom-punch, hit-stop, and white-flash from a single intensity value.
   * Additive on top of legacy `this.shake` / `this.hitstopT` calls — safe
   * to sprinkle next to existing impact code without removing the old lines.
   *
   * intensity: 0..1 (0.4 = light hit, 0.7 = heavy, 1.0 = super/finisher)
   * dirX/dirY: world-space direction the strike is travelling. Camera
   *            kicks ALONG this vector so the player feels the punch land.
   */
  private impact(opts: {
    intensity: number;
    dirX?: number;
    dirY?: number;
    flash?: number;
    hitstop?: number;
    zoom?: number;
  }) {
    const i = Math.max(0, Math.min(1, opts.intensity));
    // Directional shake: decays over ~120-220ms scaled by intensity.
    const dx = opts.dirX ?? 0;
    const dy = opts.dirY ?? 0;
    const len = Math.hypot(dx, dy) || 1;
    const kickStrength = 6 + i * 18; // px at peak, in screen space
    this.shakeDirX = (dx / len) * kickStrength;
    this.shakeDirY = (dy / len) * kickStrength;
    this.shakeDirDur = 0.12 + i * 0.10;
    this.shakeDirT = this.shakeDirDur;
    // Zoom-punch: 1.0 → 1+kick → 1.0 over ~180ms. Heavy hits punch harder.
    const z = opts.zoom ?? (0.02 + i * 0.045);
    this.zoomPunch = Math.max(this.zoomPunch, z);
    this.zoomPunchDur = 0.18 + i * 0.08;
    this.zoomPunchT = this.zoomPunchDur;
    // Layer hit-stop and white flash on top of existing scalars (max so we
    // never *reduce* what other code already set this frame).
    const hs = opts.hitstop ?? (0.04 + i * 0.10);
    this.hitstopT = Math.max(this.hitstopT, hs);
    const fl = opts.flash ?? (0.25 + i * 0.55);
    this.impactFlash = Math.max(this.impactFlash, fl);
    // Background omni-shake floor scales with intensity.
    this.shake = Math.max(this.shake, 8 + i * 28);
  }

  /**
   * Single funnel for "fight is over". Stamps cinematic state once so the UI
   * can hold off the K.O. overlay until the slow-mo + zoom + flash plays out.
   */
  private triggerKo(winnerId: PlayerId) {
    if (this.phase !== "fight") return;
    this.phase = "ko";
    this.winner = winnerId;
    this.koCinematicT = 0;
    const loser = winnerId === "p1" ? this.p2 : this.p1;
    this.koFocus = { x: loser.x, y: loser.y + FIGHTER_H * 0.4 };
    // Massive juice on the killing blow
    this.shake = Math.max(this.shake, 44);
    this.hitstopT = Math.max(this.hitstopT, 0.22);
    this.slowmoT = Math.max(this.slowmoT, 1.1);
    this.slowmoMode = "impact";
    this.impactFlash = 1;
    // KO: heaviest possible zoom punch + lateral kick toward the loser.
    const koDir = winnerId === "p1" ? 1 : -1;
    this.impact({ intensity: 1.0, dirX: koDir, dirY: -0.5, zoom: 0.09, flash: 0, hitstop: 0 });
    // Finisher blood burst at the loser's torso — sells the kill.
    this.spawnBlood(loser.x, loser.y + FIGHTER_H * 0.45, koDir as 1 | -1, 1);
    this.spawnBlood(loser.x, loser.y + FIGHTER_H * 0.30, koDir as 1 | -1, 0.85);
    Sfx.play("boom", 0.9);
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
      walkPhase: 0, walkSpeedSmooth: 0, attackAnim: 0, skin,
      move, meleeCd: 0, meleeT: 0, meleeDur: 0, meleeKind: null,
      meleeHitMask: new Set(),
      ragdollT: 0, ragdollPhase: 0, ragdollAng: 0, ragdollAV: 0, ragdollEnergy: 0,
      downedT: 0, getUpT: 0, getUpDur: 0, iframeT: 0, ragdollImmuneT: 0, groundedT: 0, lastLean: 0,
      slowedT: 0,
      trail: [],
      canFly, flying: canFly, hoverPhase: 0, superCd: 0,
      capeSwingX: 0, capeSwingV: 0, capeLift: 0,
      bodyLagX: 0, bodyLagV: 0, bodyRoll: 0, bodyRollV: 0,
      prevFacing: 1, prevHitFlash: 0,
      dropT: 0, ledgeFlash: 0,
      coyoteT: 0, jumpBufferT: 0, jumpHeldT: 0, airJumps: 0,
      preJumpT: 0, landSquashT: 0, landImpact: 0, ragdollWobble: 0,
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
      swing: null,
      punchT: 0, punchCd: 0, punchHit: false, recoverT: 0, justLandedT: 0,
      comboStep: 0, comboWindowT: 0, comboT: 0, comboDur: 0, comboKind: null, comboHit: false,
      juggleHits: 0, juggleResetT: 0, juggleFlash: 0,
      parryT: 0, parrySuccessT: 0,
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
  pressPunch(p: PlayerId) { this.intents[p].punch = true; }
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
          if (t.hp <= 0) { this.triggerKo(a.id); }
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
          if (t.hp <= 0) { this.triggerKo(a.id); }
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
        // Cast feedback — quick crack + camera kick
        this.shake = Math.max(this.shake, 10);
        this.impactFlash = Math.max(this.impactFlash, 0.35);
        Sfx.play("blip", 0.8); Sfx.play("whoosh", 0.9); Sfx.play("shock", 0.6);
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
          vx: dir * 380,
          vy: -120,
          life: 3.0, maxLife: 3.0, phase: 0,
          exploded: false, explosionT: 0,
        });
        // void unused
        void speed;
        this.burst(a.x + dir * 14, a.y + 28, "oklch(0.78 0.22 40)", 20);
        this.burst(a.x + dir * 14, a.y + 28, "oklch(0.96 0.16 80)", 12);
        this.shockwaves.push({ x: a.x + dir * 14, y: a.y + 28, r: 6, rMax: 70, life: 0.28, maxLife: 0.28, color: "oklch(0.92 0.20 60)" });
        this.shake = Math.max(this.shake, 8);
        this.impactFlash = Math.max(this.impactFlash, 0.3);
        Sfx.play("whoosh", 0.9); Sfx.play("boom", 0.45); Sfx.play("heavy", 0.4);
        return true;
      }
      case "nightcrawler": {
        // Taijutsu Flurry — frame-driven scripted sequence (42 frames).
        if (a.bamfCombo) return false;
        a.power2Cd = BAMF_COMBO_CD;
        // Bamf-in to point-blank in front of target
        const dir = (t.x >= a.x ? 1 : -1) as 1 | -1;
        this.bamfPuff(a.x, a.y + FIGHTER_H / 2, "depart");
        Sfx.play("bamf", 1.0);
        a.x = Math.max(30, Math.min(W - 30, t.x - dir * 38));
        a.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, GROUND_Y - FIGHTER_H));
        a.facing = dir; a.facingT = dir;
        a.onGround = true; a.vx = 0; a.vy = 0;
        this.bamfPuff(a.x, a.y + FIGHTER_H / 2, "arrive");
        a.bamfCombo = { t: 0, targetId: t.id, hits: new Set(), startX: a.x };
        a.stunT = 0; a.webSnareT = 0; a.slowedT = 0;
        a.iframeT = Math.max(a.iframeT, 0.3);
        return true;
      }
      case "spiderman": {
        // Web Swing — fire web upward to a high anchor and pendulum-swing.
        // Anchoring rules:
        //   - Picks an anchor in front of the player (in facing direction)
        //   - Anchor sits well above current head height for satisfying arcs
        //   - Cancels if already swinging (re-press releases)
        if (a.swing) {
          this.releaseSwing(a, true);
          return true;
        }
        a.power2Cd = 0.5; // short tap CD; jump cancels & re-grapples freely
        const dir = a.facing;
        const anchorX = Math.max(80, Math.min(W - 80, a.x + dir * 220));
        const anchorY = Math.max(60, Math.min(GROUND_Y - 220, a.y - 180));
        const dx = a.x - anchorX, dy = (a.y + FIGHTER_H * 0.35) - anchorY;
        const len = Math.hypot(dx, dy) || 1;
        const angle = Math.atan2(dx, dy); // 0 = straight down
        // Convert current linear velocity to tangential angular velocity
        const tx = Math.cos(angle), ty = -Math.sin(angle); // tangent dir
        const tangSpeed = a.vx * tx + a.vy * ty;
        const angV = tangSpeed / len + dir * 1.6; // give a kick in facing dir
        a.swing = { ax: anchorX, ay: anchorY, len, angle, angV, t: 0 };
        a.onGround = false;
        a.airJumps = 1;
        Sfx.play("whoosh", 0.8);
        // Web shoot burst at anchor
        this.burst(anchorX, anchorY, "oklch(0.95 0.02 240)", 8);
        return true;
      }
    }
    return false;
  }

  /** Release Spider-Man from his current web swing, converting angular → linear velocity. */
  private releaseSwing(a: Fighter, boost: boolean) {
    const sw = a.swing;
    if (!sw) return;
    // Tangent: derivative of (ax + sin(angle)*len, ay + cos(angle)*len)
    const tx = Math.cos(sw.angle);
    const ty = -Math.sin(sw.angle);
    const v = sw.angV * sw.len;
    a.vx = tx * v * (boost ? 1.18 : 1.0);
    a.vy = ty * v * (boost ? 1.18 : 1.0) - (boost ? 60 : 0);
    a.swing = null;
    a.onGround = false;
    Sfx.play("whoosh", 0.6);
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

  /** Clamp a desired teleport target so the fighter never lands inside a
   *  cover/platform block, off the stage, or below the ground. The fighter
   *  occupies a FIGHTER_W x FIGHTER_H box anchored at (x, y) → (x±W/2, y..y+H).
   *  Strategy: clamp to arena bounds first, then if the box overlaps any
   *  non-destroyed cover, search outward (above first, then sides, then below)
   *  for the nearest spot that's clear. If nothing fits, fall back to the
   *  fighter's current position. */
  private resolveTeleportTarget(sx: number, sy: number): { x: number; y: number } {
    const hw = FIGHTER_W / 2;
    const minX = 30 + hw;
    const maxX = W - 30 - hw;
    const minY = 20;                    // keep head on screen
    const maxY = GROUND_Y - FIGHTER_H;  // feet rest on the ground line
    const boxOverlaps = (x: number, y: number) => {
      if (x < minX || x > maxX || y < minY || y > maxY) return true;
      for (const pl of this.platforms) {
        if (pl.destroyed) continue;
        // Cover blocks are fully solid. One-way "platform" ledges only block
        // the body if the fighter would spawn embedded inside the slab itself.
        if (pl.kind === "cover") {
          if (x + hw > pl.x && x - hw < pl.x + pl.w &&
              y + FIGHTER_H > pl.y && y < pl.y + pl.h) return true;
        } else {
          if (x + hw > pl.x && x - hw < pl.x + pl.w &&
              y + FIGHTER_H > pl.y + 2 && y + FIGHTER_H - 4 < pl.y + pl.h) return true;
        }
      }
      return false;
    };

    let x = Math.max(minX, Math.min(maxX, sx));
    let y = Math.max(minY, Math.min(maxY, sy - FIGHTER_H / 2));
    if (!boxOverlaps(x, y)) return { x, y };

    // Spiral search outward in steps for the nearest clear spot.
    const step = 12;
    for (let r = step; r <= 320; r += step) {
      // Try directly above first (most natural — drop onto the obstacle's top).
      for (const dy of [-r, -r + step / 2, r, 0]) {
        for (const dx of [0, -r, r, -r / 2, r / 2]) {
          const tx = Math.max(minX, Math.min(maxX, x + dx));
          const ty = Math.max(minY, Math.min(maxY, y + dy));
          if (!boxOverlaps(tx, ty)) return { x: tx, y: ty };
        }
      }
    }
    return { x, y };
  }

  handlePointer(canvasX: number, canvasY: number) {
    if (!this.teleTargeting) return;
    const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
    const { sx, sy } = this.cssToStage(canvasX, canvasY);
    const dest = this.resolveTeleportTarget(sx, sy);
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "depart");
    Sfx.play("bamf", 0.9);
    f.x = dest.x; f.y = dest.y;
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
    this.teleTargeting = null;
    if (this.slowmoMode === "tele") { this.slowmoT = 0; this.slowmoMode = null; }
    this.emit();
  }

  /** Tap-to-swing for Spider-Man. Fires a web to the tapped point and starts a
   *  pendulum swing. If already swinging, the tap releases (with a momentum
   *  boost), then a follow-up tap re-attaches at the new point. The anchor is
   *  clamped to sit above the player so pendulum motion is always natural. */
  tapWebSwing(p: PlayerId, canvasX: number, canvasY: number): boolean {
    const f = p === "p1" ? this.p1 : this.p2;
    if (f.skin.id !== "spiderman") return false;
    if (f.ragdollT > 0 || f.downedT > 0 || f.getUpT > 0 || f.stunT > 0) return false;
    if (f.frenzy) return false;
    if (f.swing) { this.releaseSwing(f, true); return true; }
    const { sx, sy } = this.cssToStage(canvasX, canvasY);
    const anchorX = Math.max(40, Math.min(W - 40, sx));
    // Force anchor to sit above the player's head for a real pendulum arc.
    const aboveHead = f.y - 80;
    const anchorY = Math.max(40, Math.min(aboveHead, sy));
    const dx = f.x - anchorX;
    const dy = (f.y + FIGHTER_H * 0.35) - anchorY;
    const len = Math.max(120, Math.min(420, Math.hypot(dx, dy)));
    const angle = Math.atan2(dx, dy);
    const tx = Math.cos(angle), ty = -Math.sin(angle);
    const tangSpeed = f.vx * tx + f.vy * ty;
    const dir = anchorX >= f.x ? 1 : -1;
    const angV = tangSpeed / len + dir * 0.9;
    f.swing = { ax: anchorX, ay: anchorY, len, angle, angV, t: 0 };
    f.onGround = false;
    f.airJumps = 1;
    f.facing = dir;
    f.power2Cd = 0.25;
    Sfx.play("whoosh", 0.85);
    // Silk burst at anchor + a faint puff at the hand to sell the shot.
    this.burst(anchorX, anchorY, "oklch(0.97 0.03 240)", 14);
    this.burst(f.x, f.y + 28, "oklch(0.97 0.03 240)", 5);
    return true;
  }

  /** Instantaneous tap-to-teleport for Nightcrawler. No aim, no slow-mo. */
  tapTeleport(p: PlayerId, canvasX: number, canvasY: number): boolean {
    const f = p === "p1" ? this.p1 : this.p2;
    if (f.skin.id !== "nightcrawler") return false;
    if (f.teleCd > 0 || f.teleporting) return false;
    if (f.ragdollT > 0 || f.downedT > 0 || f.getUpT > 0) return false;
    const { sx, sy } = this.cssToStage(canvasX, canvasY);
    const dest = this.resolveTeleportTarget(sx, sy);
    f.teleCd = TELE_CD;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "depart");
    Sfx.play("bamf", 0.95);
    f.x = dest.x; f.y = dest.y;
    f.facing = (p === "p1" ? this.p2.x : this.p1.x) >= f.x ? 1 : -1;
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
    this.emit();
    return true;
  }

  isTeleTargeting() { return this.teleTargeting; }

  setLowPower(v: boolean) { this.lowPower = v; }

  private update(dt: number) {
    this.elapsed += dt;
    // Fire any deferred SFX whose scheduled engine-time has passed.
    if (this.pendingSfx.length) {
      const due = this.pendingSfx.filter(p => p.at <= this.elapsed);
      if (due.length) {
        for (const p of due) Sfx.play(p.name, p.vol);
        this.pendingSfx = this.pendingSfx.filter(p => p.at > this.elapsed);
      }
    }
    this.impactFlash = Math.max(0, this.impactFlash - dt * 4);
    // Decay directional shake + zoom-punch (run on real dt so they aren't
    // affected by hit-stop pause — they should resolve smoothly).
    if (this.shakeDirT > 0) this.shakeDirT = Math.max(0, this.shakeDirT - dt);
    if (this.zoomPunchT > 0) this.zoomPunchT = Math.max(0, this.zoomPunchT - dt);

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

    if (this.phase === "ko") this.koCinematicT += dt;

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
      // Auto-face the opponent only when we are NOT mid-attack and NOT airborne.
      // Flipping during a melee or jump produces visible pose/render desync;
      // the character commits to a direction for the duration of those actions.
      const canFlip = (f: typeof this.p1) =>
        !f.ragdollT && !f.downedT && !f.getUpT && !f.meleeKind && f.attackAnim <= 0
        && (f.onGround || f.flying);
      if (!isFrozenFor("p1") && canFlip(this.p1)) this.p1.facing = this.p2.x > this.p1.x ? 1 : -1;
      if (!isFrozenFor("p2") && canFlip(this.p2)) this.p2.facing = this.p1.x > this.p2.x ? 1 : -1;
      this.resolveMelees(sdt);
      this.updateBamfCombo(this.p1, dt);
      this.updateBamfCombo(this.p2, dt);
    }
    for (const f of [this.p1, this.p2]) {
      if (freezeActive && f.id !== this.timeFreezer) continue;
      // Slower, smoother yaw lerp so the turn reads as a 3D pivot, not a snap-flip.
      f.facingT += (f.facing - f.facingT) * Math.min(1, dt * 5.5);
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
          if (pl.destroyed) continue;
          if (pl.kind !== "cover") continue;
          if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) {
            this.burst(pr.x, pr.y, pr.glow, 14);
            this.shake = Math.max(this.shake, 6);
            pr.life = 0;
            break;
          }
        }
        // Bolts also damage props (with door pass-through for buildings)
        if (pr.life > 0) {
          for (const p of this.props) {
            if (p.destroyed) continue;
            if (pr.x > p.x && pr.x < p.x + p.w && pr.y > p.y && pr.y < p.y + p.h) {
              if (this.pointInDoor(p, pr.x, pr.y)) continue;
              this.damageProp(p, pr.damage ?? FIRE_DAMAGE, pr.x, pr.y);
              this.burst(pr.x, pr.y, pr.glow, 14);
              this.shake = Math.max(this.shake, 6);
              pr.life = 0;
              break;
            }
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
          this.triggerKo(pr.owner);
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -50 && p.x < W + 50);

    for (const p of this.particles) {
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      // Optional gravity (blood droplets, debris-like sparks)
      if (p.grav) {
        p.vy += 1400 * p.grav * sdt;
        p.vx *= Math.pow(0.86, dt * 60);
      }
      p.life -= dt;
      // Blood droplets that hit the ground stamp a pooling decal then die.
      if (p.blood && p.y >= GROUND_Y - 1) {
        if (this.groundDecals.length < 80) {
          const r = 4 + Math.random() * 6 + p.size * 0.8;
          this.groundDecals.push({
            x: p.x,
            w: r,
            life: 6 + Math.random() * 3,
            maxLife: 9,
            color: "oklch(0.32 0.18 25)",
          });
        }
        p.life = 0;
      }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const d of this.groundDecals) d.life -= dt;
    this.groundDecals = this.groundDecals.filter(d => d.life > 0);
    for (const c of this.cracks) c.life -= dt;
    this.cracks = this.cracks.filter(c => c.life > 0);

    // Smoke clouds — drift, expand, swirl, fade
    for (const sc of this.smokeClouds) {
      sc.life -= dt;
      sc.r += (sc.rMax - sc.r) * Math.min(1, dt * 1.6);
      if (sc.vx !== undefined) {
        const t = (sc.maxLife - sc.life);
        // Turbulence: gentle sinusoidal swirl
        const seed = sc.seed ?? 0;
        const swirl = Math.sin(t * 3 + seed) * 16;
        sc.x += (sc.vx + swirl) * sdt;
        sc.y += (sc.vy ?? 0) * sdt;
        // Air drag + buoyant rise
        sc.vx *= Math.exp(-1.2 * dt);
        sc.vy = (sc.vy ?? 0) * Math.exp(-0.6 * dt) - 8 * dt;
      }
    }
    this.smokeClouds = this.smokeClouds.filter(s => s.life > 0);

    for (const sw of this.shockwaves) {
      sw.life -= dt; sw.r += (sw.rMax - sw.r) * Math.min(1, dt * 4);
    }
    this.shockwaves = this.shockwaves.filter(s => s.life > 0);
    tickFx(this.attackFx, dt);
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
          tgt.hitFlash = 0.45;
          tgt.vx += Math.sign(lo.vx || 1) * 320;
          tgt.vy = -260; tgt.onGround = false;
          if (tgt.ragdollImmuneT <= 0) {
            tgt.ragdollT = 0.5;
            tgt.ragdollEnergy = 1;
            tgt.ragdollAV = Math.sign(lo.vx || 1) * 5;
          }
          this.shake = Math.max(this.shake, 32);
          this.impactFlash = Math.max(this.impactFlash, 1.0);
          this.hitstopT = Math.max(this.hitstopT, 0.12);
          // Multi-ring electric explosion
          this.shockwaves.push({ x: lo.x, y: lo.y, r: 6, rMax: 200, life: 0.5, maxLife: 0.5, color: "oklch(0.98 0.18 95)" });
          this.shockwaves.push({ x: lo.x, y: lo.y, r: 14, rMax: 280, life: 0.65, maxLife: 0.65, color: "oklch(0.85 0.22 260)" });
          this.shockwaves.push({ x: lo.x, y: lo.y, r: 22, rMax: 360, life: 0.8, maxLife: 0.8, color: "oklch(0.95 0.10 220)" });
          this.burst(lo.x, lo.y, "oklch(0.98 0.18 95)", 48);
          this.burst(lo.x, lo.y, "oklch(0.78 0.22 260)", 28);
          // Crackling arc particles outward
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 260 + Math.random() * 320;
            this.particles.push({
              x: lo.x, y: lo.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
              life: 0.55, maxLife: 0.55,
              color: Math.random() < 0.5 ? "oklch(0.98 0.18 95)" : "oklch(0.85 0.22 260)",
              size: 2 + Math.random() * 2.5,
            });
          }
          Sfx.play("boom", 0.85); Sfx.play("shock", 1.0); Sfx.play("blip", 0.9); Sfx.play("heavy", 0.5);
          // Lightning consumed in the explosion
          lo.life = 0;
          if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(lo.owner); }
        }
      }
    }
    this.lightnings = this.lightnings.filter(lo => lo.life > 0 && lo.x > -100 && lo.x < W + 100 && lo.y > -100 && lo.y < H + 100);

    // ---- Heat Vision sustained beam (Superman) — mirrors Homelander laserSweep ----
    for (const f of [this.p1, this.p2]) {
      if (freezeActive && f.id !== this.timeFreezer) continue;
      if (f.heatVisionT > 0) {
        f.heatVisionT -= dt;
        const tgt = f.id === "p1" ? this.p2 : this.p1;
        const activeT = HEAT_VISION_DUR - f.heatVisionT;
        const overload = activeT > Math.max(0, HEAT_VISION_DUR - 3);
        const eye = this.getEyeWorldPos(f);
        const sx = eye.x; const sy = eye.y;
        const tx = tgt.x; const ty = tgt.y + 30;
        const dxh = tx - sx; const dyh = ty - sy;
        const desired = Math.atan2(dyh, dxh);
        const beamMaxLen = overload ? 4000 : 520;
        const blockHit = overload ? null : this.raycastPlatforms(sx, sy, desired, beamMaxLen);
        const beamLen = blockHit ? blockHit.dist : beamMaxLen;
        this.beams.push({
          owner: f.id, x: sx, y: sy, angle: desired, length: beamLen, life: 0.05,
          overload, red: true,
        });
        // Spark at impact
        if (blockHit && Math.random() < 0.6) {
          const ex = sx + Math.cos(desired) * beamLen;
          const ey = sy + Math.sin(desired) * beamLen;
          this.particles.push({
            x: ex + (Math.random() - 0.5) * 8, y: ey + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 100,
            life: 0.35, maxLife: 0.35,
            color: "oklch(0.78 0.28 28)", size: 1.5 + Math.random() * 1.8,
          });
        }
        // Overload: pierce + shatter platforms AND props
        if (overload) {
          const exP = sx + Math.cos(desired) * beamLen;
          const eyP = sy + Math.sin(desired) * beamLen;
          this.overloadShatterProps(sx, sy, exP, eyP);
        }
        if (overload) {
          const ex = sx + Math.cos(desired) * beamLen;
          const ey = sy + Math.sin(desired) * beamLen;
          for (const pl of this.platforms) {
            if (pl.destroyed) continue;
            if (!this.segmentIntersectsRect(sx, sy, ex, ey, pl.x, pl.y, pl.w, pl.h)) continue;
            pl.destroyed = true;
            this.shake = Math.max(this.shake, 22);
            this.impactFlash = Math.max(this.impactFlash, 0.6);
            this.shockwaves.push({
              x: pl.x + pl.w / 2, y: pl.y + pl.h / 2,
              r: 8, rMax: Math.max(pl.w, pl.h) * 1.6,
              life: 0.5, maxLife: 0.5, color: "oklch(0.78 0.28 28)",
            });
            const cols = Math.max(3, Math.round(pl.w / 18));
            const rows = Math.max(2, Math.round(Math.max(pl.h, 14) / 16));
            const cw = pl.w / cols;
            const ch = Math.max(8, pl.h / rows);
            for (let cy = 0; cy < rows; cy++) {
              for (let cx = 0; cx < cols; cx++) {
                const px = pl.x + cx * cw + cw / 2;
                const py = pl.y + cy * ch + ch / 2;
                const blast = 240 + Math.random() * 220;
                const ang2 = Math.atan2(py - sy, px - sx);
                this.debris.push({
                  x: px, y: py,
                  vx: Math.cos(ang2) * blast + (Math.random() - 0.5) * 80,
                  vy: Math.sin(ang2) * blast - 120 - Math.random() * 140,
                  w: cw * (0.7 + Math.random() * 0.4),
                  h: ch * (0.7 + Math.random() * 0.4),
                  rot: Math.random() * Math.PI,
                  rotV: (Math.random() - 0.5) * 12,
                  life: 1.4 + Math.random() * 0.6, maxLife: 2.0,
                  color: pl.kind === "cover"
                    ? (Math.random() < 0.5 ? "oklch(0.40 0.04 30)" : "oklch(0.28 0.04 30)")
                    : "oklch(0.45 0.16 30)",
                });
              }
            }
            Sfx.play("boom", 0.6);
          }
        }
        // Damage
        const ang = Math.abs(((desired - desired + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const targetDist = Math.hypot(dxh, dyh);
        const inBeam = ang < (overload ? 0.22 : 0.18) && targetDist < beamLen;
        if (inBeam && tgt.iframeT <= 0 && tgt.downedT <= 0 && tgt.getUpT <= 0) {
          const dps = HEAT_VISION_DPS * (overload ? 3 : 1);
          tgt.hp = Math.max(0, tgt.hp - dps * dt);
          tgt.hitFlash = overload ? 0.35 : 0.15;
          this.particles.push({
            x: tgt.x + (Math.random() - 0.5) * 20, y: tgt.y + 20 + Math.random() * 30,
            vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 80,
            life: 0.5, maxLife: 0.5,
            color: overload ? "oklch(0.65 0.30 28)" : "oklch(0.78 0.28 28)",
            size: 2 + Math.random() * 2,
          });
          if (overload) {
            this.shake = Math.max(this.shake, 6);
            this.impactFlash = Math.max(this.impactFlash, 0.25);
          }
          if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(f.id); }
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
            if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(f.id); }
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

    // ---- Beam start/end edge-triggers (recoil + camera shake + audio) ----
    // Unified for Homelander laserSweep, Superman heat vision, Iron Man unibeam fire.
    for (const f of [this.p1, this.p2]) {
      const isHomelaserActive = f.meleeKind === "laserSweep" && f.meleeT >= f.move.windup && f.meleeT < f.move.windup + f.move.active;
      const active = isHomelaserActive || f.heatVisionT > 0 || f.unibeamFireT > 0;
      const wasActive = this.beamWasActive[f.id];
      if (active && !wasActive) {
        // START: body recoil away from beam direction + camera shake + audio
        f.bodyLagV -= f.facing * 220;
        f.wobble.bvx -= f.facing * 180;
        f.wobble.bvy -= 60;
        f.wobble.squashV -= 5;
        f.bodyRollV -= f.facing * 1.6;
        this.shake = Math.max(this.shake, 18);
        this.impactFlash = Math.max(this.impactFlash, 0.45);
        this.shockwaves.push({
          x: f.x + f.facing * 16, y: f.y + 28, r: 6, rMax: 110,
          life: 0.35, maxLife: 0.35,
          color: f.skin.glow ?? "oklch(0.95 0.18 60)",
        });
        // Always play the homelander laser sample whenever any laser starts.
        Sfx.play("homelanderLaser", 0.95);
      } else if (!active && wasActive) {
        // END: settling recoil pop + smaller shake
        f.bodyLagV += f.facing * 110;
        f.wobble.bvx += f.facing * 80;
        f.wobble.squashV += 3;
        this.shake = Math.max(this.shake, 10);
        this.impactFlash = Math.max(this.impactFlash, 0.25);
      }
      this.beamWasActive[f.id] = active;
    }

    // ---- Debris physics (cover blocks shattered by overload) ----
    if (this.debris.length) {
      for (const d of this.debris) {
        d.life -= dt;
        d.vy += GRAVITY * dt * 0.6;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.rotV * dt;
        if (d.y > GROUND_Y - d.h * 0.5) {
          d.y = GROUND_Y - d.h * 0.5;
          d.vy *= -0.32; d.vx *= 0.7; d.rotV *= 0.6;
          if (Math.abs(d.vy) < 30) d.vy = 0;
        }
      }
      this.debris = this.debris.filter(d => d.life > 0);
    }

    // Decay prop damage-flash each tick
    for (const p of this.props) {
      if (p.damageFlash > 0) p.damageFlash = Math.max(0, p.damageFlash - dt * 3);
    }


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
        if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(ms.owner); }
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
            if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(fw.owner); }
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
        const tgt = mb.owner === "p1" ? this.p2 : this.p1;
        // Homing steer toward target (chases through the air)
        const tcx = tgt.x;
        const tcy = tgt.y + 30;
        const hdx = tcx - mb.x, hdy = tcy - mb.y;
        const hd = Math.hypot(hdx, hdy) || 1;
        const speed = Math.hypot(mb.vx, mb.vy) || 1;
        const desiredSpeed = Math.max(540, speed);
        const dvx = (hdx / hd) * desiredSpeed;
        const dvy = (hdy / hd) * desiredSpeed;
        const turn = Math.min(1, sdt * 3.2);
        mb.vx += (dvx - mb.vx) * turn;
        mb.vy += (dvy - mb.vy) * turn;
        // Light gravity so it still arcs subtly
        mb.vy += GRAVITY * 0.18 * sdt;
        mb.x += mb.vx * sdt; mb.y += mb.vy * sdt;
        // Flame trail — multi-layer (core white, mid yellow, outer orange smoke)
        if (!this.lowPower) {
          const ang = Math.atan2(mb.vy, mb.vx);
          const back = ang + Math.PI;
          for (let i = 0; i < 3; i++) {
            const off = i * 6;
            const px = mb.x + Math.cos(back) * off + (Math.random() - 0.5) * 4;
            const py = mb.y + Math.sin(back) * off + (Math.random() - 0.5) * 4;
            const pal = i === 0 ? "oklch(0.98 0.16 95)" : i === 1 ? "oklch(0.88 0.22 60)" : "oklch(0.62 0.20 35)";
            this.particles.push({
              x: px, y: py,
              vx: -Math.cos(ang) * (40 + Math.random() * 60) + (Math.random() - 0.5) * 30,
              vy: -Math.sin(ang) * (40 + Math.random() * 60) + (Math.random() - 0.5) * 30 - 20,
              life: 0.4 + Math.random() * 0.25, maxLife: 0.6,
              color: pal, size: 4 - i + Math.random() * 2.5,
            });
          }
          // Dark smoke puff
          if (Math.random() < 0.4) {
            this.particles.push({
              x: mb.x + (Math.random() - 0.5) * 8, y: mb.y + (Math.random() - 0.5) * 8,
              vx: -Math.cos(ang) * 30, vy: -Math.sin(ang) * 30 - 30 - Math.random() * 30,
              life: 0.6, maxLife: 0.6,
              color: "oklch(0.30 0.04 40)", size: 5 + Math.random() * 3,
            });
          }
        }
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
            if (tgt.hp <= 0 && this.phase === "fight") { this.triggerKo(mb.owner); }
          }
          this.shockwaves.push({ x: ex, y: ey, r: 10, rMax: MAGMA_BLAST_RADIUS, life: 0.5, maxLife: 0.5, color: "oklch(0.96 0.18 60)" });
          this.shockwaves.push({ x: ex, y: ey, r: 18, rMax: MAGMA_BLAST_RADIUS * 1.4, life: 0.7, maxLife: 0.7, color: "oklch(0.62 0.22 25)" });
          this.shockwaves.push({ x: ex, y: ey, r: 28, rMax: MAGMA_BLAST_RADIUS * 1.8, life: 0.9, maxLife: 0.9, color: "oklch(0.40 0.10 30)" });
          this.burst(ex, ey, "oklch(0.96 0.18 80)", 40);
          this.burst(ex, ey, "oklch(0.78 0.22 40)", 32);
          this.burst(ex, ey, "oklch(0.30 0.04 40)", 18);
          // Outward fire shrapnel
          for (let i = 0; i < 22; i++) {
            const aa = Math.random() * Math.PI * 2;
            const sp = 220 + Math.random() * 320;
            this.particles.push({
              x: ex, y: ey, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp - 80,
              life: 0.6, maxLife: 0.6,
              color: Math.random() < 0.5 ? "oklch(0.96 0.18 70)" : "oklch(0.65 0.22 30)",
              size: 2 + Math.random() * 3,
            });
          }
          this.shake = Math.max(this.shake, 32);
          this.spawnCrack(ex, 1);
          this.impactFlash = Math.max(this.impactFlash, 0.95);
          this.hitstopT = Math.max(this.hitstopT, 0.14);
          Sfx.play("boom", 1.0); Sfx.play("heavy", 0.85); Sfx.play("thud", 0.7); Sfx.play("shock", 0.4);
        }
      } else {
        mb.explosionT += dt;
        if (mb.explosionT > 0.5) mb.life = 0;
      }
    }
    this.magmas = this.magmas.filter(mb => mb.life > 0 && mb.x > -100 && mb.x < W + 100);

    this.shake = Math.max(0, this.shake - dt * 40);

    // ---- Adaptive music intensity ----
    // Ramp up when either fighter is critical, near-KO, or actively trading
    // hits. Hit-stop / shake also bumps intensity briefly.
    if (this.phase === "fight") {
      const lowHp = Math.min(this.p1.hp, this.p2.hp);
      const hpDanger = lowHp < 30 ? (30 - lowHp) / 30 : 0;
      const heat = Math.min(1, this.shake / 30);
      const intensity = Math.max(hpDanger * 0.85 + heat * 0.4, hpDanger);
      Sfx.setMusicIntensity(Math.min(1, intensity), dt);
    } else {
      Sfx.setMusicIntensity(0, dt);
    }

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
          this.triggerKo(f.id);
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
        this.spawnCrack(target.x, 1);
        this.spawnCrack(f.x, 0.7);
        Sfx.play("boom", 1);
        f.frenzy = null;
      }
      return;
    }

    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.attackAnim = Math.max(0, f.attackAnim - dt);
    f.slowedT = Math.max(0, f.slowedT - dt);
    f.hoverPhase += dt * HOVER_RATE * Math.PI * 2;

    // ---- Cape & body secondary motion (spring-mass) ----
    // Heavier feel: lower stiffness + higher damping → slower, weightier swing.
    // Bigger turn whip & impact kicks so direction changes read clearly.
    {
      const turn = f.facing !== f.prevFacing ? 1 : 0;
      f.prevFacing = f.facing;
      // Detect a fresh impact this frame (hitFlash jumps upward on hit).
      const impact = f.hitFlash > f.prevHitFlash + 0.05 ? Math.min(1, f.hitFlash) : 0;
      f.prevHitFlash = f.hitFlash;

      // ---- Cape horizontal swing ----
      // Wind drag target: trails opposite the velocity direction. Stronger
      // weighting to vx so the cape lags behind during sprints / flight.
      const windTarget = -Math.sign(f.vx || f.facing) * Math.min(22, Math.abs(f.vx) * 0.06)
                       + (f.flying ? -f.facing * 7 : 0);
      const k = 26;     // softer stiffness → slower, heavier swing (~0.8s period)
      const c = 4.2;    // underdamped so it overshoots & settles (visible weight)
      const accel = (windTarget - f.capeSwingX) * k - f.capeSwingV * c;
      f.capeSwingV += accel * dt;
      // Turn whip — fires opposite the NEW facing for that "snap & trail" moment.
      if (turn) f.capeSwingV += -f.facing * 56;
      // Impact kick — heavier shove + a small lift jolt (handled below via capeLift).
      if (impact > 0) f.capeSwingV += -f.facing * 38 * impact;
      f.capeSwingX += f.capeSwingV * dt;
      f.capeSwingX = Math.max(-30, Math.min(30, f.capeSwingX));

      // ---- Cape lift (flares up under fast motion / flight / impact) ----
      const liftTarget = Math.min(1, Math.abs(f.vx) / 320 + (f.flying ? 0.4 : 0));
      // Asymmetric lerp: rises fast, settles slowly → cape "puffs" then sinks
      const liftRate = liftTarget > f.capeLift ? 6 : 2.2;
      f.capeLift += (liftTarget - f.capeLift) * Math.min(1, dt * liftRate);
      if (impact > 0) f.capeLift = Math.min(1, f.capeLift + 0.35 * impact);

      // ---- Body translation lag (impacts only) ----
      // Heavier mass: lower k, more damping → small but slow recoil shove.
      const bk = 55, bc = 9;
      const ba = (0 - f.bodyLagX) * bk - f.bodyLagV * bc;
      f.bodyLagV += ba * dt;
      if (impact > 0) f.bodyLagV += -f.facing * 130 * impact;
      f.bodyLagX += f.bodyLagV * dt;
      f.bodyLagX = Math.max(-12, Math.min(12, f.bodyLagX));

      // ---- Body roll from turn whip & impact ----
      // Underdamped so the torso visibly rocks, then settles.
      const rk = 38, rc = 6.5;
      const ra = (0 - f.bodyRoll) * rk - f.bodyRollV * rc;
      f.bodyRollV += ra * dt;
      if (turn) f.bodyRollV += f.facing * 7.5;
      if (impact > 0) f.bodyRollV += -f.facing * 6.0 * impact;
      f.bodyRoll += f.bodyRollV * dt;
      f.bodyRoll = Math.max(-0.45, Math.min(0.45, f.bodyRoll));
    }


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
      // Air drag (slightly stronger so tumbles don't drift forever)
      f.vx *= Math.pow(0.965, dt * 60);
      f.vy *= Math.pow(0.99, dt * 60);
      f.x += f.vx * ldt;
      f.y += f.vy * ldt;
      // Angular: torque from horizontal speed; damp gradually
      const targetAV = Math.sign(f.vx) * Math.min(12, Math.abs(f.vx) * 0.02);
      f.ragdollAV += (targetAV - f.ragdollAV) * Math.min(1, dt * 2);
      f.ragdollAV *= Math.pow(0.94, dt * 60);
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
          // Aggressive ground friction + angular damping → ragdoll settles.
          f.vx *= Math.pow(0.42, dt * 60);
          f.ragdollAV *= Math.pow(0.55, dt * 60);
          f.onGround = true;
          // Track grounded time so we don't snap-flat mid-roll.
          f.groundedT += dt;
          // Settle gate: slow + angle near rest + grounded long enough.
          if (
            Math.abs(f.vx) < 35 &&
            Math.abs(f.ragdollAV) < 1.2 &&
            f.groundedT > 0.18
          ) {
            // Transition: ragdoll → downed (laydown). Snap angle softly toward
            // the nearest face-down/up rest pose; the downed branch eases it.
            f.ragdollT = 0;
            f.downedT = 0.28;
            const tgt = Math.abs(Math.sin(f.ragdollAng)) > 0.5
              ? (Math.PI / 2) * Math.sign(Math.sin(f.ragdollAng))
              : 0;
            f.ragdollAng = tgt;
            f.ragdollAV = 0;
            f.groundedT = 0;
          }
        }
      } else {
        // Airborne — reset grounded accumulator.
        f.groundedT = 0;
      }
      return;
    }

    // Downed (laying on ground) — locked, then triggers get-up.
    if (f.downedT > 0) {
      f.downedT -= dt;
      f.vx *= Math.pow(0.4, dt * 60);
      f.vy = 0;
      f.onGround = true;
      if (f.downedT <= 0) {
        // Phased rise driven by risePhase(): gather→press→kneel→coil→drive→settle.
        f.getUpDur = 0.95;
        f.getUpT = f.getUpDur;
        // Soft gather scuff — small puff to sell the first weight shift.
        if (!this.lowPower) {
          for (let i = 0; i < 4; i++) {
            this.particles.push({
              x: f.x + (Math.random() - 0.5) * 22,
              y: GROUND_Y - 2,
              vx: (Math.random() - 0.5) * 50,
              vy: -8 - Math.random() * 22,
              life: 0.4, maxLife: 0.4,
              color: "oklch(0.74 0.02 60)",
              size: 1.4 + Math.random() * 1.4,
            });
          }
          Sfx.play("thud", 0.10);
        }
      }
      return;
    }

    // Get-up animation — locked while rising.
    if (f.getUpT > 0) {
      f.getUpT -= dt;
      f.vx *= Math.pow(0.4, dt * 60);
      f.vy = 0;
      f.onGround = true;
      // Smoothly damp ragdollAng toward 0 during the early gather/press phases
      // so a face-down body rotates back to vertical without a visible snap.
      const u = 1 - (f.getUpT / Math.max(0.001, f.getUpDur));
      if (u < 0.30 && f.ragdollAng !== 0) {
        const k = Math.pow(0.001, dt / 0.10); // 90% to zero in 100ms
        f.ragdollAng *= k;
        if (Math.abs(f.ragdollAng) < 0.01) f.ragdollAng = 0;
      }
      if (f.getUpT <= 0) {
        f.iframeT = 1.0;            // 1s post-rise invulnerability
        f.ragdollImmuneT = 2.0;     // anti-chain window
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
      // Leading-edge glow particle (front of fist) — bigger during the active
      // strike phase to sell the foreshortened punch coming at the camera.
      if (!this.lowPower) {
        const u = Math.min(1, d.t / Math.max(0.001, d.dur));
        const punchGlow = u > 0.35 ? Math.sin(Math.min(1, (u - 0.35) / 0.65) * Math.PI) : 0;
        const glowSize = 5 + Math.random() * 3 + punchGlow * 10;
        // Position glow at the projected fist tip
        const fistX = f.x + f.facing * (24 + punchGlow * 22);
        const fistY = f.y + FIGHTER_H * 0.42 - punchGlow * 4;
        this.particles.push({
          x: fistX, y: fistY,
          vx: f.vx * 0.15, vy: f.vy * 0.15,
          life: 0.25, maxLife: 0.25,
          color: punchGlow > 0.4 ? "oklch(0.99 0.10 75)" : "oklch(0.98 0.05 80)",
          size: glowSize,
        });
        // Concentric "shockwave-in-air" puff while accelerating
        if (punchGlow > 0.5 && Math.random() < 0.5) {
          this.particles.push({
            x: fistX - f.facing * 8, y: fistY,
            vx: -f.vx * 0.05, vy: 0,
            life: 0.35, maxLife: 0.35,
            color: "oklch(0.92 0.04 230)",
            size: 8 + Math.random() * 6,
          });
        }
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
      intent.melee = false; intent.fire = false; intent.punch = false;
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

    // ---- Air-juggle bookkeeping ----
    // Once the fighter is grounded & stable, the juggle counter unwinds.
    if (f.parryT > 0) f.parryT = Math.max(0, f.parryT - dt);
    if (f.parrySuccessT > 0) f.parrySuccessT = Math.max(0, f.parrySuccessT - dt * 1.4);
    if (f.juggleFlash > 0) f.juggleFlash = Math.max(0, f.juggleFlash - dt * 1.6);
    if (f.juggleHits > 0) {
      const stable = f.onGround && f.ragdollT <= 0 && f.downedT <= 0 && f.getUpT <= 0;
      if (stable) {
        f.juggleResetT -= dt;
        if (f.juggleResetT <= 0) f.juggleHits = 0;
      } else {
        f.juggleResetT = 0.45; // grace period after landing before reset
      }
    }

    // ---- Universal basic punch + 3-tap combo (punch → high-kick → knee) ----
    f.punchCd = Math.max(0, f.punchCd - dt);
    if (f.recoverT > 0) f.recoverT = Math.max(0, f.recoverT - dt);
    if (f.comboWindowT > 0) {
      f.comboWindowT = Math.max(0, f.comboWindowT - dt);
      if (f.comboWindowT === 0) f.comboStep = 0;
    }
    // Active combo swing (kick / knee)
    if (f.comboKind && f.comboT > 0) {
      f.comboT += dt;
      const u = f.comboT / Math.max(0.001, f.comboDur);
      const inActive = u >= 0.35 && u <= 0.7;
      if (inActive && !f.comboHit) {
        const target = f.id === "p1" ? this.p2 : this.p1;
        const dx = (target.x - f.x) * f.facing;
        const range = f.comboKind === "kick" ? 78 : 58;
        const dmg = f.comboKind === "kick" ? 4 : 6;
        if (dx > -10 && dx < range && Math.abs(target.y - f.y) < FIGHTER_H) {
          if (target.iframeT <= 0 && target.downedT <= 0 && target.getUpT <= 0) {
            f.comboHit = true;
            target.hp = Math.max(0, target.hp - dmg);
            target.hitFlash = 0.28;
            target.vx += f.facing * (f.comboKind === "kick" ? 220 : 180);
            target.vy -= f.comboKind === "knee" ? 180 : 60;
            const ix = target.x;
            const iy = target.y + (f.comboKind === "knee" ? 50 : 32);
            this.shockwaves.push({ x: ix, y: iy, r: 4, rMax: 46, life: 0.2, maxLife: 0.2, color: "oklch(0.95 0.05 80)" });
            this.burst(ix, iy, "oklch(0.95 0.06 80)", 10);
            this.shake = Math.max(this.shake, 9);
            this.hitstopT = Math.max(this.hitstopT, 0.08);
            this.impactFlash = Math.max(this.impactFlash, 0.3);
            Sfx.play("attackImpact", 0.9);
            if (target.hp <= 0 && this.phase === "fight") { this.triggerKo(f.id); }
          }
        }
      }
      if (f.comboT >= f.comboDur) {
        f.comboKind = null; f.comboT = 0; f.comboHit = false;
        f.recoverT = 0.08;
      }
    }
    if (f.punchT > 0) {
      f.punchT += dt;
      const pt = f.punchT;
      const hitStart = PUNCH_F11;
      const hitEnd = PUNCH_F11 + PUNCH_F12 + PUNCH_F13;
      const inActive = pt >= hitStart && pt < hitEnd;
      if (inActive && !f.punchHit) {
        const target = f.id === "p1" ? this.p2 : this.p1;
        const dx = (target.x - f.x) * f.facing;
        if (dx > -10 && dx < PUNCH_RANGE && Math.abs(target.y - f.y) < FIGHTER_H) {
          if (this.meleeBlockedByProp(f, PUNCH_RANGE, PUNCH_DMG)) {
            f.punchHit = true;
            this.shake = Math.max(this.shake, 3);
            Sfx.play("thud", 0.35);
          } else if (target.iframeT <= 0 && target.downedT <= 0 && target.getUpT <= 0) {
            f.punchHit = true;
            target.hp = Math.max(0, target.hp - PUNCH_DMG);
            target.hitFlash = 0.22;
            target.vx += f.facing * 90;
            target.vy -= 30;
            const ix = target.x;
            const iy = target.y + 36;
            this.shockwaves.push({ x: ix, y: iy, r: 4, rMax: 38, life: 0.18, maxLife: 0.18, color: "oklch(0.95 0.04 80)" });
            this.shockwaves.push({ x: ix, y: iy, r: 2, rMax: 22, life: 0.12, maxLife: 0.12, color: "oklch(0.99 0.02 250)" });
            this.burst(ix, iy, "oklch(0.95 0.06 80)", 8);
            this.shake = Math.max(this.shake, 6);
            this.hitstopT = Math.max(this.hitstopT, 0.06);
            this.impactFlash = Math.max(this.impactFlash, 0.22);
            Sfx.play("punch", 0.8);
            if (target.hp <= 0 && this.phase === "fight") { this.triggerKo(f.id); }
          }
        }
      }
      if (pt >= PUNCH_DUR) {
        f.punchT = 0;
        f.punchHit = false;
        f.recoverT = PUNCH_RECOVERY;
        // Open combo window so a quick re-tap chains into kick
        f.comboStep = 1;
        f.comboWindowT = 0.45;
      }
    }
    if (intent.punch && f.punchT === 0 && f.comboKind == null && f.punchCd <= 0 && !f.meleeKind && !f.dash && !f.frenzy && f.ragdollT <= 0 && f.downedT <= 0 && f.getUpT <= 0 && f.wobble.staggerT < 0.2) {
      // Arm a tight parry window on every punch tap. If a hit lands within
      // the next ~140ms it'll be deflected (see applyMeleeHit).
      f.parryT = 0.14;
      if (f.comboStep === 1 && f.comboWindowT > 0) {
        // Step 2: high kick
        f.comboKind = "kick"; f.comboT = 0.0001; f.comboDur = 0.32; f.comboHit = false;
        f.attackAnim = Math.max(f.attackAnim, 0.32);
        f.comboStep = 2; f.comboWindowT = 0.5;
        f.punchCd = PUNCH_CD;
        Sfx.play("whoosh", 0.5);
      } else if (f.comboStep === 2 && f.comboWindowT > 0) {
        // Step 3: knee finisher
        f.comboKind = "knee"; f.comboT = 0.0001; f.comboDur = 0.36; f.comboHit = false;
        f.attackAnim = Math.max(f.attackAnim, 0.36);
        f.comboStep = 0; f.comboWindowT = 0;
        f.punchCd = PUNCH_CD * 1.5;
        Sfx.play("whoosh", 0.6);
      } else if (f.recoverT === 0) {
        f.punchT = 0.0001;
        f.punchHit = false;
        f.punchCd = PUNCH_CD;
        f.attackAnim = Math.max(f.attackAnim, PUNCH_DUR);
        Sfx.play("whoosh", 0.35);
      }
    }
    intent.punch = false;
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
        // Soft body aura that bleeds downward (read as warmth/lift)
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
          // Trailing speed sparks behind the fighter
          const back = -Math.sign(f.vx || f.facing);
          const sparkN = Math.min(4, 1 + Math.floor(flySpeed / 110));
          for (let i = 0; i < sparkN; i++) {
            this.particles.push({
              x: f.x + back * (8 + Math.random() * 18),
              y: f.y + FIGHTER_H * 0.45 + (Math.random() - 0.5) * 22,
              vx: -f.vx * 0.22 + (Math.random() - 0.5) * 30,
              vy: -f.vy * 0.22 + (Math.random() - 0.5) * 30,
              life: 0.34, maxLife: 0.34,
              color: i === 0 ? "oklch(0.97 0.05 80)" : f.skin.glow,
              size: 1.6 + Math.random() * 2,
            });
          }
          // Lead-fist contrail: tight bright streak from the punched-forward hand
          if (Math.random() < 0.7) {
            const fwd = Math.sign(f.vx || f.facing);
            const handX = f.x + fwd * 26;
            const handY = f.y + 30 - flySpeed * 0.02;
            this.particles.push({
              x: handX + (Math.random() - 0.5) * 4,
              y: handY + (Math.random() - 0.5) * 4,
              vx: -f.vx * 0.35 + (Math.random() - 0.5) * 14,
              vy: -f.vy * 0.35 + (Math.random() - 0.5) * 14,
              life: 0.28, maxLife: 0.28,
              color: "oklch(0.99 0.04 80)",
              size: 1.4 + Math.random() * 1.4,
            });
          }
        }
        if (ascending) {
          // Downward jet wash from the feet
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
    } else if (f.swing) {
      // ---- Spider-Man Web Swing: pendulum physics ----
      const sw = f.swing;
      sw.t += ldt;
      if (f.jumpBufferT > 0) f.jumpBufferT = Math.max(0, f.jumpBufferT - ldt);
      // Steering: left/right input pumps the pendulum (like a child on a swing)
      let pump = 0;
      if (intent.left) pump -= 1;
      if (intent.right) pump += 1;
      pump += intent.ax;
      // Gravity-driven angular accel: a = -(g/len) * sin(angle)
      const g = 1500;
      const angA = -(g / sw.len) * Math.sin(sw.angle) + pump * 6.5;
      sw.angV += angA * ldt;
      // Light damping for stability — feels alive but never explodes
      sw.angV *= Math.exp(-0.6 * ldt);
      // Clamp angular velocity so the pendulum stays controllable
      const maxAngV = 7.5;
      if (sw.angV > maxAngV) sw.angV = maxAngV;
      else if (sw.angV < -maxAngV) sw.angV = -maxAngV;
      sw.angle += sw.angV * ldt;
      // Position from pendulum
      const newX = sw.ax + Math.sin(sw.angle) * sw.len;
      const newY = sw.ay + Math.cos(sw.angle) * sw.len;
      // Track linear velocity for smooth release
      f.vx = (newX - f.x) / Math.max(ldt, 1e-4);
      f.vy = (newY - f.y) / Math.max(ldt, 1e-4);
      f.x = newX;
      f.y = newY - FIGHTER_H * 0.35;
      f.onGround = false;
      f.facing = sw.angV >= 0 ? 1 : -1;
      // Jump = release with momentum boost
      if (intent.jump && f.jumpBufferT > 0) {
        f.jumpBufferT = 0;
        this.releaseSwing(f, true);
      }
      // Auto-release if anchor too far / fighter hits ground
      if (f.y + FIGHTER_H >= GROUND_Y - 1 || sw.t > 4.5) {
        this.releaseSwing(f, false);
      }
      // Subtle motion trail
      if (!this.lowPower && Math.random() < 0.4) {
        this.particles.push({
          x: f.x + (Math.random() - 0.5) * 6,
          y: f.y + 30,
          vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
          color: "oklch(0.95 0.02 240 / 0.6)", size: 1.2,
        });
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
      // Speedsters (Flash, A-Train) move noticeably faster than baseline
      const speedsterMul = (f.skin.id === "flash" || f.skin.id === "atrain") ? 1.85 : 1;
      if (move !== 0) {
        const target = move * MOVE_SPEED * moveMul * speedsterMul;
        const a = ACCEL * accelMul * airMul * ldt;
        if (f.vx < target) f.vx = Math.min(target, f.vx + a);
        else if (f.vx > target) f.vx = Math.max(target, f.vx - a);
      } else {
        const fr = FRICTION * (f.onGround ? 1 : 0.25) * ldt;
        if (f.vx > 0) f.vx = Math.max(0, f.vx - fr);
        else if (f.vx < 0) f.vx = Math.min(0, f.vx + fr);
      }

      // ---- Jump feel: anticipation + coyote + buffered press + variable height + 1 air-jump ----
      if (f.onGround) { f.coyoteT = COYOTE_T; f.airJumps = MAX_AIR_JUMPS; }
      else f.coyoteT = Math.max(0, f.coyoteT - ldt);
      if (f.jumpBufferT > 0) f.jumpBufferT = Math.max(0, f.jumpBufferT - ldt);
      if (f.jumpHeldT > 0) f.jumpHeldT = Math.max(0, f.jumpHeldT - ldt);
      if (f.landSquashT > 0) f.landSquashT = Math.max(0, f.landSquashT - ldt);

      const wantsDrop = !locked && intent.jump && intent.ay > 0.5 && f.onGround;

      // Anticipation crouch tick — when expires, fire the actual launch.
      if (f.preJumpT > 0) {
        f.preJumpT -= ldt;
        // Lock horizontal during crouch so the launch reads as decisive.
        f.vx *= Math.pow(0.25, ldt * 60);
        if (f.preJumpT <= 0) {
          f.preJumpT = 0;
          // Apply launch
          f.vy = -JUMP_V;
          f.onGround = false;
          f.coyoteT = 0;
          f.jumpHeldT = JUMP_HOLD_T;
          // Strong stretch springing out of crouch
          f.wobble.squashV -= 9;
          f.wobble.bvy -= 30;
          if (!this.lowPower) {
            for (let i = 0; i < 7; i++) {
              this.particles.push({
                x: f.x + (Math.random() - 0.5) * 22,
                y: f.y + FIGHTER_H - 2,
                vx: (Math.random() - 0.5) * 130,
                vy: -18 - Math.random() * 40,
                life: 0.36, maxLife: 0.36,
                color: "oklch(0.8 0.03 230)",
                size: 1.6 + Math.random() * 1.6,
              });
            }
          }
          Sfx.play("whoosh", 0.18);
        }
      } else if (wantsDrop) {
        f.dropT = 0.18;
        f.onGround = false;
        f.y += 2;
        f.jumpBufferT = 0;
      } else if (!locked && f.jumpBufferT > 0 && (f.onGround || f.coyoteT > 0) && f.landSquashT <= 0.04) {
        // Ground / coyote jump → enter anticipation crouch first.
        // Skip preJump if airborne via coyote (no time to crouch in air).
        if (f.onGround) {
          f.preJumpT = PRE_JUMP_T;
          // Visible knee-bend dip
          f.wobble.bvy += 22;
          f.wobble.squashV += 4;
        } else {
          // Coyote: launch immediately
          f.vy = -JUMP_V;
          f.coyoteT = 0;
          f.jumpHeldT = JUMP_HOLD_T;
          f.wobble.squashV -= 6;
        }
        f.jumpBufferT = 0;
      } else if (!locked && f.jumpBufferT > 0 && f.airJumps > 0 && !f.onGround) {
        // Mid-air double jump — instant, no anticipation
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

      // Variable-height: jump released early during ascent → cut upward velocity hard.
      if (!intent.jump && f.vy < 0 && f.jumpHeldT > 0) {
        f.vy *= 0.45;
        f.jumpHeldT = 0;
      }

      if (f.dropT > 0) f.dropT -= ldt;
      if (f.ledgeFlash > 0) f.ledgeFlash -= ldt;

      if (!f.meleeKind) {
        const canFire = f.skin.id === "heatwave";
        const canTele = f.skin.id === "nightcrawler";
        if (canFire && intent.fire && f.fireCd <= 0 && !f.teleporting) this.fire(f);
        if (canTele && intent.teleport && f.teleCd <= 0 && !f.teleporting && this.teleTargeting === null) {
          // Keyboard teleport: blink toward the opponent instantly (no aim, no slow-mo).
          const opp = f.id === "p1" ? this.p2 : this.p1;
          const side = opp.x >= f.x ? -1 : 1;
          const dest = this.resolveTeleportTarget(opp.x + side * 80, opp.y + FIGHTER_H / 2);
          f.teleCd = TELE_CD;
          this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "depart");
          Sfx.play("bamf", 0.95);
          f.x = dest.x; f.y = dest.y;
          f.facing = opp.x >= f.x ? 1 : -1;
          f.vx = 0; f.vy = 0;
          this.bamfPuff(f.x, f.y + FIGHTER_H / 2, "arrive");
        }
        if (intent.melee && f.meleeCd <= 0 && f.wobble.staggerT < 0.18) this.startMelee(f);
      }

      if (f.onGround) {
        // Stride-locked phase, but driven by a low-passed speed so per-frame
        // physics jitter (collision pushback, friction noise) doesn't translate
        // into stride hiccups. This is the #1 source of perceived "jitter".
        const STRIDE_PIXELS = 56 * getStance(f.skin.id).strideMul;
        const rawSpeed = Math.abs(f.vx);
        // Smoothing: ~120ms time constant — fast enough to feel responsive,
        // slow enough to absorb single-frame velocity spikes.
        const tau = 0.12;
        const k = 1 - Math.exp(-ldt / tau);
        f.walkSpeedSmooth += (rawSpeed - f.walkSpeedSmooth) * k;
        const speed = f.walkSpeedSmooth;
        if (speed > 18) {
          f.walkPhase += (speed / STRIDE_PIXELS) * Math.PI * 2 * ldt;
        } else {
          // Idle: ease phase toward 0 (neutral pose) — no modulo wrap so it
          // can't snap across the 2π boundary mid-decay (which caused a pop).
          f.walkPhase += (0 - f.walkPhase) * Math.min(1, ldt * 6);
        }
      } else {
        f.walkPhase += ldt * 1.2;
      }

      const prevY = f.y;
      // Variable gravity:
      //  - Ascending + jump held + within hold window → very light (boost arc)
      //  - Near apex (|vy| < 90)                       → softened hang for that "snap" pop
      //  - Ascending + jump released                   → heavy (kills early-release height)
      //  - Falling                                     → heaviest (decisive descent)
      let gMul: number;
      if (f.vy < 0) {
        if (intent.jump && f.jumpHeldT > 0) gMul = 0.55;
        else gMul = LOW_JUMP_GRAVITY_MUL;
      } else if (f.vy < 90) {
        gMul = APEX_GRAVITY_MUL;
      } else {
        gMul = FALL_GRAVITY_MUL;
      }
      f.vy += GRAVITY * gMul * ldt;
      // Terminal velocity
      if (f.vy > 1500) f.vy = 1500;
      f.x += f.vx * ldt;
      f.y += f.vy * ldt;

      if (f.x < 30) { f.x = 30; f.vx = 0; }
      if (f.x > W - 30) { f.x = W - 30; f.vx = 0; }

      // Cover blocks: solid horizontal collision (lateral) — push fighter out.
      for (const pl of this.platforms) {
        if (pl.destroyed) continue;
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

      // Solid props: block grounded fighters laterally. Flyers pass over freely.
      // Buildings expose a walkable door so ground fighters can move through.
      if (!f.flying) {
        for (const p of this.props) {
          if (p.destroyed) continue;
          const hw = FIGHTER_W / 2;
          const overlapX = f.x + hw > p.x && f.x - hw < p.x + p.w;
          const overlapY = f.y + FIGHTER_H > p.y + 2 && f.y < p.y + p.h;
          if (!overlapX || !overlapY) continue;
          if (p.kind === "building") continue; // phase through buildings (top-landing still works)
          if (this.fighterInDoor(p, f.x, f.y)) continue; // walk through door
          const fromLeft = (f.x + hw) - p.x;
          const fromRight = (p.x + p.w) - (f.x - hw);
          if (fromLeft < fromRight) { f.x = p.x - hw; if (f.vx > 0) f.vx = 0; }
          else { f.x = p.x + p.w + hw; if (f.vx < 0) f.vx = 0; }
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
        if (pl.destroyed) continue;
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

      // Top-land on solid props (cars, crates, vending, etc.) — buildings too,
      // unless the fighter is dropping into the doorway.
      if (!f.flying) {
        for (const p of this.props) {
          if (p.destroyed) continue;
          const feet = f.y + FIGHTER_H;
          const prevFeet = prevY + FIGHTER_H;
          const hw = FIGHTER_W / 2;
          const overX = f.x + hw > p.x && f.x - hw < p.x + p.w;
          if (!overX) continue;
          if (f.vy >= 0 && prevFeet <= p.y + 2 && feet >= p.y && f.dropT <= 0) {
            f.y = p.y - FIGHTER_H; f.vy = 0; f.onGround = true;
            landedOn = { x: p.x, y: p.y, w: p.w, h: p.h, kind: "cover" };
          }
        }
      }

      // Landing impact: squash + dust scaled by impact velocity
      // Decay landing-squash sprite timer every frame
      f.justLandedT = Math.max(0, f.justLandedT - dt);
      if (landedOn && wasAirborne) {
        const impact = Math.max(0, Math.min(1, landingVy / 800));
        f.justLandedT = 0.10 + impact * 0.06;
        // Movement-locked recovery scaled by impact (cancellable into attack).
        f.landSquashT = 0.08 + impact * 0.16;
        f.landImpact = impact;
        f.wobble.squashV -= 4 + impact * 9;     // squash on land
        f.wobble.bvy += 100 * impact;            // body dips
        // Kill residual horizontal velocity proportional to impact (heavy thud feel).
        f.vx *= (1 - 0.55 * impact);
        if (impact > 0.2) this.shake = Math.max(this.shake, 4 + impact * 8);
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
    stepWobble(f.wobble, dt, f.vx, f.vy, f.onGround, f.flying, this.lowPower, f.skin.id === "spiderman");

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

    // ---- Per-skin signature ambient FX ----
    if (!this.lowPower && this.particles.length < 220) {
      // Spider-Man: faint web string trails when airborne and moving fast.
      if (f.skin.id === "spiderman" && !f.onGround && Math.abs(f.vx) > 220) {
        if (Math.random() < 0.55) {
          this.particles.push({
            x: f.x - f.facing * 6,
            y: f.y + 30 + (Math.random() - 0.5) * 18,
            vx: -f.vx * 0.08 + (Math.random() - 0.5) * 30,
            vy: -f.vy * 0.05 + 10 + Math.random() * 20,
            life: 0.45, maxLife: 0.45,
            color: "oklch(0.96 0.02 240)",
            size: 1.2 + Math.random() * 1.2,
          });
        }
      }
      // Superman: cool ice-breath puffs when standing still on ground (idle exhale).
      if (
        f.skin.id === "superman" && f.onGround && !f.flying &&
        Math.abs(f.vx) < 30 && !f.meleeKind && f.heatVisionT <= 0 &&
        f.stunT <= 0 && f.ragdollT <= 0 && f.downedT <= 0 && f.getUpT <= 0
      ) {
        // Exhale every ~2.6s, gated on a noisy phase derived from elapsed.
        const phase = (this.elapsed + (f.id === "p1" ? 0 : 1.3)) % 2.6;
        if (phase < 0.65) {
          // Within the breath window, emit a small puff each frame at a low rate.
          if (Math.random() < 0.35) {
            const headX = f.x + f.facing * 10;
            const headY = f.y + 14;
            this.particles.push({
              x: headX + f.facing * (4 + Math.random() * 6),
              y: headY + (Math.random() - 0.5) * 3,
              vx: f.facing * (35 + Math.random() * 30),
              vy: -8 - Math.random() * 14,
              life: 0.55 + Math.random() * 0.25, maxLife: 0.8,
              color: Math.random() < 0.5 ? "oklch(0.96 0.03 220)" : "oklch(0.92 0.05 230)",
              size: 2.5 + Math.random() * 2.5,
            });
          }
        }
      }
    }
  }

  private startMelee(f: Fighter) {
    // Flash's old Phase Strike rapid-punch is disabled; Flash uses the basic kick instead.
    if (f.skin.id === "flash") return;
    const m = f.move;
    f.meleeCd = m.cooldown;
    f.meleeKind = m.kind;
    f.meleeT = 0;
    f.meleeDur = m.windup + m.active + m.recover;
    f.meleeHitMask.clear();
    f.attackAnim = m.windup + m.active;
    if (m.windupSfx) Sfx.play(m.windupSfx, 0.6);
    // Charge-ring telegraph for the new sprite-driven specials.
    if (m.kind === "heatPunch" || m.kind === "crowbar" || m.kind === "repulsor" || m.kind === "groundSmash") {
      const cy = m.kind === "groundSmash" ? f.y + FIGHTER_H - 6 : f.y + 36;
      const col: GlobalCompositeOperation = "lighter";
      spawnFx(this.attackFx, "chargeRing", f.x + f.facing * 8, cy, {
        size: m.kind === "groundSmash" ? 38 : 28,
        life: Math.max(0.18, m.windup),
        spin: 6, grow: 18, blend: col, facing: f.facing as 1 | -1,
      });
    }
    // (Homelander laser SFX is played on every beam start via the beam edge-trigger
    //  in update(), so it plays for any laser/heat-vision/unibeam in any match.)
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

  private resolveMelees(dt: number = 1 / 60) {
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
              // Cover absorbs the strike
              if (this.meleeBlockedByProp(f, m.range, m.damage)) {
                f.meleeHitMask.add(1);
                this.shake = Math.max(this.shake, 5);
                Sfx.play("thud", 0.5);
                break;
              }
              this.applyMeleeHit(f, target, m, target.x, target.y + 40);
              f.meleeHitMask.add(1);
              // Sprite FX: slash arc trailing the strike + impact star at contact.
              const ix = (f.x + target.x) / 2 + f.facing * 6;
              const iy = target.y + 40;
              spawnFx(this.attackFx, "slashArc", ix, iy, {
                size: 46, life: 0.22, facing: f.facing as 1 | -1,
                rot: m.kind === "crowbar" ? -0.2 : 0,
              });
              spawnFx(this.attackFx, "impactStar", target.x, iy, {
                size: 30, life: 0.28, grow: 60, spin: 4,
              });
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
            // Sprite shockwave ring overlay (additive) — sells the impact.
            spawnFx(this.attackFx, "shockRing", cx, cy, {
              size: m.range * 0.6, life: 0.55, grow: m.range * 1.4, blend: "lighter",
            });
            spawnFx(this.attackFx, "impactStar", cx, cy - 8, {
              size: 44, life: 0.32, grow: 80,
            });
            // Hulk signature: ground crack at slam point.
            this.spawnCrack(cx, 0.85);
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
                    this.triggerKo(f.id);
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
              // Cover blocks the flurry tick (and takes damage)
              if (this.meleeBlockedByProp(f, m.range, m.damage)) {
                f.meleeHitMask.add(tick);
                break;
              }
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
              if (target.hp <= 0) { this.triggerKo(f.id); }
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
            // Time spent in the active window so far (0..m.active)
            const activeT = t - m.windup;
            // Final 3 seconds: OVERLOAD — thicker red beam, pierces all cover, heavier dps
            const overload = activeT > Math.max(0, m.active - 3);
            // Compute world-space eye position (mid-point between both eyes) so
            // the beam stays anchored to Homelander's face through lean / roll / flight.
            const eye = this.getEyeWorldPos(f);
            const sx = eye.x; const sy = eye.y;
            // Aim straight at the opponent's chest — beam can angle freely up/down/back.
            const tx = target.x; const ty = target.y + 30;
            const dx = tx - sx; const dy = ty - sy;
            const desired = Math.atan2(dy, dx);
            const angle = desired;
            // Normal beam: blocked by cover AND props (whichever is closer).
            // Overload: pierces everything (chain-shatter handled below).
            const beamMaxLen = overload ? 4000 : m.range;
            const platHit = overload ? null : this.raycastPlatforms(sx, sy, desired, beamMaxLen);
            let beamLen = platHit ? platHit.dist : beamMaxLen;
            let blockedProp: Prop | null = null;
            if (!overload) {
              const exFull = sx + Math.cos(desired) * beamLen;
              const eyFull = sy + Math.sin(desired) * beamLen;
              const ph = this.firstPropHit(sx, sy, exFull, eyFull);
              if (ph) {
                beamLen = beamLen * ph.t;
                blockedProp = ph.prop;
              }
            }
            const blockHit: { dist: number } | null = platHit || (blockedProp ? { dist: beamLen } : null);
            if (blockedProp) {
              // Sustained damage on the prop while the beam holds against it
              this.damageProp(blockedProp, m.damage * 1.5 * dt, sx, sy);
            }
            // Tag the beam so the renderer can switch to the red overload look.
            this.beams.push({
              owner: f.id, x: sx, y: sy, angle: desired, length: beamLen, life: 0.05,
              overload,
            });
            // Spark at impact / pierce point
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
            // During overload: spawn molten "burn-through" particles along cover blocks
            // it punches through, so the player visually reads the pierce.
            if (overload && !this.lowPower && Math.random() < 0.5) {
              for (const pl of this.platforms) {
                if (pl.kind !== "cover") continue;
                // Beam axis-aligned segment crossing the cover bbox
                const inX = sx + Math.cos(desired);
                if ((pl.x < target.x && pl.x + pl.w > sx) || (pl.x < sx && pl.x + pl.w > target.x)) {
                  const burnX = pl.x + Math.random() * pl.w;
                  const burnY = pl.y + Math.random() * pl.h;
                  this.particles.push({
                    x: burnX, y: burnY,
                    vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 80,
                    life: 0.45, maxLife: 0.45,
                    color: Math.random() < 0.5 ? "oklch(0.78 0.28 28)" : "oklch(0.95 0.20 70)",
                    size: 1.6 + Math.random() * 2.2,
                  });
                  void inX;
                }
              }
            }
            // Overload's "destroyer" pass: melt any platform the beam crosses
            // and shatter it into fluid debris chunks. Runs only during overload.
            if (overload) {
              const ex = sx + Math.cos(desired) * beamLen;
              const ey = sy + Math.sin(desired) * beamLen;
              this.overloadShatterProps(sx, sy, ex, ey);
              for (const pl of this.platforms) {
                if (pl.destroyed) continue;
                if (!this.segmentIntersectsRect(sx, sy, ex, ey, pl.x, pl.y, pl.w, pl.h)) continue;
                pl.destroyed = true;
                this.shake = Math.max(this.shake, 22);
                this.impactFlash = Math.max(this.impactFlash, 0.6);
                this.shockwaves.push({
                  x: pl.x + pl.w / 2, y: pl.y + pl.h / 2,
                  r: 8, rMax: Math.max(pl.w, pl.h) * 1.6,
                  life: 0.5, maxLife: 0.5, color: "oklch(0.85 0.22 40)",
                });
                // Shatter into a grid of chunks for a fluid breakup
                const cols = Math.max(3, Math.round(pl.w / 18));
                const rows = Math.max(2, Math.round(Math.max(pl.h, 14) / 16));
                const cw = pl.w / cols;
                const ch = Math.max(8, pl.h / rows);
                for (let cy = 0; cy < rows; cy++) {
                  for (let cx = 0; cx < cols; cx++) {
                    const px = pl.x + cx * cw + cw / 2;
                    const py = pl.y + cy * ch + ch / 2;
                    const blast = 240 + Math.random() * 220;
                    const ang2 = Math.atan2(py - sy, px - sx);
                    this.debris.push({
                      x: px, y: py,
                      vx: Math.cos(ang2) * blast + (Math.random() - 0.5) * 80,
                      vy: Math.sin(ang2) * blast - 120 - Math.random() * 140,
                      w: cw * (0.7 + Math.random() * 0.4),
                      h: ch * (0.7 + Math.random() * 0.4),
                      rot: Math.random() * Math.PI,
                      rotV: (Math.random() - 0.5) * 12,
                      life: 1.4 + Math.random() * 0.6,
                      maxLife: 2.0,
                      color: pl.kind === "cover"
                        ? (Math.random() < 0.5 ? "oklch(0.40 0.04 250)" : "oklch(0.28 0.04 250)")
                        : "oklch(0.45 0.16 230)",
                    });
                  }
                }
                // Molten ember burst
                for (let i = 0; i < 18; i++) {
                  const a = Math.random() * Math.PI * 2;
                  const s = 80 + Math.random() * 220;
                  this.particles.push({
                    x: pl.x + pl.w / 2, y: pl.y + pl.h / 2,
                    vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
                    life: 0.6, maxLife: 0.6,
                    color: Math.random() < 0.5 ? "oklch(0.80 0.26 30)" : "oklch(0.95 0.20 70)",
                    size: 2 + Math.random() * 2.4,
                  });
                }
                Sfx.play("boom", 0.6);
              }
            }
            // Hit if target is within beam cone AND closer than the blocker (or overload pierces)
            const ang = Math.abs(((angle - desired + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            const targetDist = Math.hypot(dx, dy);
            const inBeam = ang < (overload ? 0.22 : 0.18) && targetDist < beamLen;
            if (inBeam) {
              // Damage per second = m.damage normally (1 dps -> 10 total over 10s).
              // Overload triples the rate so the final 3s adds a real punch.
              const dps = m.damage * (overload ? 3 : 1);
              if (target.iframeT <= 0 && target.downedT <= 0 && target.getUpT <= 0) {
                target.hp = Math.max(0, target.hp - dps * dt);
              }
              target.hitFlash = overload ? 0.35 : 0.15;
              this.particles.push({
                x: target.x + (Math.random() - 0.5) * 20, y: target.y + 20 + Math.random() * 30,
                vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 80,
                life: 0.5, maxLife: 0.5,
                color: overload ? "oklch(0.78 0.28 28)" : "oklch(0.85 0.18 60)",
                size: 2 + Math.random() * 2,
              });
              if (overload) {
                // Continuous shake + screen flash during overload contact
                this.shake = Math.max(this.shake, 6);
                this.impactFlash = Math.max(this.impactFlash, 0.25);
              }
              if (target.hp <= 0) { this.triggerKo(f.id); }
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

  // Frame-driven taijutsu flurry. The 42 sheet frames play at TAIJUTSU_FPS;
  // contact frames trigger one hit each. The renderer in drawFighterAt swaps
  // to drawTaijutsuFrame while bamfCombo is active so the visible animation
  // is the literal sheet (tinted to the skin), not a procedural pose.
  private updateBamfCombo(a: Fighter, dt: number) {
    if (!a.bamfCombo) return;
    const combo = a.bamfCombo;
    combo.t += dt;
    a.iframeT = Math.max(a.iframeT, 0.25);
    a.stunT = 0; a.webSnareT = 0; a.ragdollImmuneT = 0;
    a.meleeKind = null; a.attackAnim = 0; a.meleeT = 0; a.meleeDur = 0;
    a.punchT = 0; a.comboT = 0; a.comboKind = null;
    a.vy = 0; a.onGround = true;

    const t = combo.targetId === "p1" ? this.p1 : this.p2;
    const dir = (t.x >= a.x ? 1 : -1) as 1 | -1;
    a.facing = dir; a.facingT = dir;
    // Stay glued in front of target so flurry reads as a tight rush.
    const desiredX = t.x - dir * 38;
    a.x += (desiredX - a.x) * Math.min(1, dt * 14);
    a.vx = 0;

    const FPS = TAIJUTSU_FPS;
    const frame = Math.floor(combo.t * FPS);
    const TOTAL = 42;

    // Hit beats — frame indices that connect, with damage tier.
    // Sequence read from the sheet: jab(7), cross(11), high-kick-1(15),
    // high-kick-2(19), splits-sweep(23), launching-axe-kick(27).
    type Beat = { f: number; dmg: number; finisher?: boolean; sfx: "punch" | "heavy"; kind: "punch" | "kick" };
    const beats: Beat[] = [
      { f: 7,  dmg: BAMF_COMBO_DMG[0], sfx: "punch", kind: "punch" },
      { f: 11, dmg: BAMF_COMBO_DMG[1], sfx: "punch", kind: "punch" },
      { f: 15, dmg: BAMF_COMBO_DMG[2], sfx: "punch", kind: "kick" },
      { f: 19, dmg: BAMF_COMBO_DMG[2], sfx: "punch", kind: "kick" },
      { f: 23, dmg: BAMF_COMBO_DMG[3], sfx: "punch", kind: "kick" },
      { f: 27, dmg: BAMF_COMBO_DMG[4], sfx: "heavy", kind: "kick", finisher: true },
    ];

    for (const beat of beats) {
      if (frame >= beat.f && !combo.hits.has(beat.f)) {
        combo.hits.add(beat.f);
        this.applyTaijutsuHit(a, t, dir, beat);
        if (a.bamfCombo == null) return;
      }
    }

    if (frame >= TOTAL - 1) {
      a.bamfCombo = null;
      a.iframeT = Math.max(a.iframeT, 0.4);
    }
  }

  private applyTaijutsuHit(
    a: Fighter, t: Fighter, dir: 1 | -1,
    beat: { f: number; dmg: number; finisher?: boolean; sfx: "punch" | "heavy"; kind: "punch" | "kick" },
  ) {
    const isFinisher = !!beat.finisher;
    const ix = t.x;
    const iy = t.y + (beat.kind === "punch" ? 32 : 50);
    Sfx.play("whoosh", 0.35);
    if (t.iframeT > 0 || t.downedT > 0 || t.getUpT > 0) return;
    t.ragdollImmuneT = 0;
    t.hp = Math.max(0, t.hp - beat.dmg);
    t.hitFlash = isFinisher ? 0.55 : 0.3;
    if (isFinisher) {
      t.vx = dir * 520; t.vy = -360; t.onGround = false;
      t.ragdollT = 1.0; t.ragdollPhase = 0; t.ragdollAng = 0;
      t.ragdollAV = dir * 7 + (Math.random() - 0.5) * 3;
      t.ragdollEnergy = 1;
    } else {
      t.vx = dir * (beat.kind === "kick" ? 30 : 22);
      t.wobble.staggerT = Math.max(t.wobble.staggerT, 0.18);
    }
    applyImpulse(t.wobble, dir, -0.5, isFinisher ? 1.0 : 0.45);
    this.shake = Math.max(this.shake, isFinisher ? 22 : 9);
    this.hitstopT = Math.max(this.hitstopT, isFinisher ? 0.18 : 0.05);
    this.impactFlash = isFinisher ? 1 : 0.4;
    if (isFinisher) { this.slowmoT = Math.max(this.slowmoT, 0.4); this.slowmoMode = "impact"; }
    this.burst(ix, iy, "oklch(0.96 0.06 80)", isFinisher ? 26 : 12);
    this.burst(ix, iy, "oklch(0.7 0.22 305)", isFinisher ? 22 : 10);
    this.shockwaves.push({ x: ix, y: iy, r: 4, rMax: isFinisher ? 70 : 36, life: 0.32, maxLife: 0.32, color: "oklch(0.95 0.18 95)" });
    if (isFinisher) {
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
    }
    Sfx.play(beat.sfx, isFinisher ? 1 : 0.7);
    if (t.hp <= 0) { this.triggerKo(a.id); a.bamfCombo = null; }
  }

  private applyMeleeHit(f: Fighter, target: Fighter, m: MoveSpec, fx: number, fy: number) {
    // I-frames: ignore hit entirely
    if (target.iframeT > 0) return;
    // During downed/getup the target is on the floor — skip melee hits (mercy)
    if (target.downedT > 0 || target.getUpT > 0) return;
    // ---- PARRY ----
    // Target tapped PUNCH within the parry window AND is facing the attacker.
    // Deflect: 0 damage, attacker staggered + brief stun, defender flashes,
    // super cooldown is slashed by 40% as the meter-fill reward.
    const targetFaces = Math.sign(f.x - target.x) === target.facing;
    if (target.parryT > 0 && targetFaces) {
      target.parryT = 0;
      target.parrySuccessT = 0.5;
      target.iframeT = Math.max(target.iframeT, 0.18);
      target.superCd = Math.max(0, target.superCd - SUPER_CD * 0.4);
      // Stagger the attacker — interrupt their swing, knock them back light.
      f.punchT = 0; f.comboKind = null; f.comboT = 0;
      f.meleeT = Math.max(f.meleeT, f.meleeDur - 0.05); // skip to recover
      f.vx = -f.facing * 220;
      f.wobble.staggerT = Math.max(f.wobble.staggerT, 0.32);
      f.wobble.staggerDir = (-f.facing) as 1 | -1;
      f.wobble.staggerMag = 0.7;
      applyImpulse(f.wobble, -f.facing as 1 | -1, -0.3, 0.7);
      // FX: bright clang ring + sparks
      this.hitstopT = Math.max(this.hitstopT, 0.12);
      this.shake = Math.max(this.shake, 14);
      this.impact({ intensity: 0.55, dirX: -f.facing, dirY: -0.3, zoom: 0.025, flash: 0, hitstop: 0 });
      this.shockwaves.push({
        x: fx, y: fy, r: 8, rMax: 90,
        life: 0.4, maxLife: 0.4, color: "oklch(0.95 0.18 90)",
      });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const sp = 220 + Math.random() * 180;
        this.particles.push({
          x: fx, y: fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: 0.35 + Math.random() * 0.2, maxLife: 0.55,
          color: i % 2 ? "oklch(0.95 0.18 90)" : "oklch(0.98 0.05 80)",
          size: 1.6 + Math.random() * 1.8,
        });
      }
      Sfx.play("blip", 0.9);
      Sfx.play("jab", 0.4);
      return;
    }
    target.hp = Math.max(0, target.hp - m.damage);
    target.hitFlash = 0.35;
    // Air-juggle: if target is airborne (or already in a juggle), tally
    // hits with diminishing returns. 1.0 → 0.85 → 0.7 → 0.55 → 0.45 → 0.4
    const wasAirborne = !target.onGround || target.ragdollT > 0;
    if (wasAirborne) {
      target.juggleHits = Math.min(target.juggleHits + 1, 8);
      target.juggleFlash = 1;
    }
    const juggleScale = target.juggleHits > 1
      ? Math.max(0.4, 1 - (target.juggleHits - 1) * 0.15)
      : 1;
    // Anti-chain: reduced knockback if recently ragdolled
    const kbScale = (target.ragdollImmuneT > 0 ? 0.45 : 1) * juggleScale;
    target.vx = f.facing * m.knockbackX * kbScale;
    // Mid-juggle: bias upward keep-up so combos read like a launch chain.
    const kbY = wasAirborne && target.juggleHits > 1
      ? Math.min(m.knockbackY * juggleScale, -180)
      : m.knockbackY * kbScale;
    target.vy = kbY;
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
    // Centralized hit-feel layer — directional camera kick + zoom-punch
    // sized by move damage. Strikes that hit harder shake the camera ALONG
    // the strike vector, sell follow-through, and pop a quick zoom.
    const intensity = Math.min(1, Math.max(0.25, m.damage / 22));
    this.impact({
      intensity,
      dirX: f.facing,
      dirY: -0.25, // small upward bias — punches read as lifting the camera
      flash: 0,    // already set above
      hitstop: 0,  // already set above
    });
    this.burst(fx, fy, f.skin.glow, 28);
    this.spawnBlood(fx, fy, f.facing as 1 | -1, intensity);
    this.shockwaves.push({ x: fx, y: fy, r: 6, rMax: 80, life: 0.35, maxLife: 0.35, color: "oklch(0.95 0.05 80)" });
    Sfx.play(m.hitSfx, 1);
    // Layered impact stack — adds whoosh + body thud + heavy boom on big hits
    Sfx.playHit(intensity);
    if (target.hp <= 0 && this.phase === "fight") {
      this.triggerKo(f.id);
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
    // Super: max-intensity directional impact + heavy zoom punch.
    this.impact({ intensity: 1.0, dirX: dir, dirY: -0.4, zoom: 0.07, flash: 0, hitstop: 0 });
    // Cinematic glow burst — multi-ring shockwaves + dense particle explosion
    const cx = t.x, cy = t.y + FIGHTER_H * 0.5;
    this.burst(cx, cy, attacker.skin.glow, 64);
    this.burst(cx, cy, "oklch(0.98 0.10 80)", 48);
    this.burst(cx, cy, "oklch(0.92 0.18 30)", 36);
    // Heavy arterial spray for super impact
    this.spawnBlood(cx, cy, dir as 1 | -1, 1);
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
      this.triggerKo(attacker.id);
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

  /**
   * Hulk-style ground crack decal: 4–7 jagged rays radiating from impact x at
   * GROUND_Y. Persists ~5s, fades. Capped at 16 active so the floor doesn't
   * become a solid black mat on long matches.
   */
  private spawnCrack(x: number, intensity: number) {
    if (this.lowPower && intensity < 0.7) return;
    if (this.cracks.length > 16) this.cracks.shift();
    const it = Math.max(0.3, Math.min(1, intensity));
    const rayN = 4 + Math.floor(Math.random() * 4);
    const rays: Crack["rays"] = [];
    for (let i = 0; i < rayN; i++) {
      const ang = -Math.PI + (i / rayN) * Math.PI + (Math.random() - 0.5) * 0.4;
      const len = (28 + Math.random() * 38) * it;
      // 3-segment polyline jitter offsets (perpendicular wiggle)
      const jitter = [
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 5,
      ];
      rays.push({ ang, len, jitter });
    }
    this.cracks.push({
      x, rays, life: 5, maxLife: 5, intensity: it,
    });
  }

  /**
   * Anger-of-Stick blood spray.
   * Emits an arterial cone of droplets in `dir` direction with gravity, plus a
   * fine mist back-spray. Droplets stamp ground decals on landing. Hard-capped
   * so heavy combos don't tank mobile framerate.
   *
   * intensity: 0–1. KO/super = 1, light jab = ~0.25.
   */
  private spawnBlood(x: number, y: number, dir: 1 | -1, intensity: number) {
    if (this.lowPower && intensity < 0.6) return; // skip cheap hits on low-end
    const cap = this.lowPower ? 160 : 260;
    if (this.particles.length > cap) return;
    const i = Math.max(0, Math.min(1, intensity));
    // Deep arterial red → bright crimson highlights
    const deep = "oklch(0.38 0.20 25)";
    const bright = "oklch(0.55 0.24 28)";
    // Main arterial spray (forward cone in strike direction)
    const n = Math.round(6 + i * 22);
    for (let k = 0; k < n; k++) {
      const spread = (Math.random() - 0.5) * 1.1;
      const ang = -Math.PI * 0.18 + spread + (dir === 1 ? 0 : Math.PI);
      const sp = 180 + Math.random() * (220 + i * 360);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60 * i,
        life: 0.55 + Math.random() * 0.55,
        maxLife: 1.1,
        color: Math.random() < 0.65 ? deep : bright,
        size: 1.5 + Math.random() * (2 + i * 2.5),
        grav: 1,
        blood: true,
      });
    }
    // Back-spatter mist (no gravity, fast fade)
    const m = Math.round(4 + i * 10);
    for (let k = 0; k < m; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 30,
        life: 0.18 + Math.random() * 0.22,
        maxLife: 0.4,
        color: deep,
        size: 1 + Math.random() * 1.6,
      });
    }
  }

  /** Liang-Barsky segment-vs-AABB test. */
  private segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rx, (rx + rw) - x1, y1 - ry, (ry + rh) - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  /** Raycast against blocking platforms (cover blocks fully; thin platforms also block lasers). Returns nearest hit or null. */
  private raycastPlatforms(sx: number, sy: number, angle: number, maxLen: number): { dist: number } | null {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best: number | null = null;
    for (const pl of this.platforms) {
      if (pl.destroyed) continue;
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

  /** Build flavor props (cars, buildings, etc.) per map. Walk-through; shatterable by laser overload. */
  private buildPropsForMap(mapId: MapId): Prop[] {
    const out: Prop[] = [];
    const gy = GROUND_Y;
    const hpFor: Record<PropKind, number> = {
      barrel: 35, trashcan: 25, crate: 45, lamppost: 30,
      vending: 65, car: 110, pillar: 160, building: 260,
    };
    const add = (p: Omit<Prop, "hp" | "maxHp" | "damageFlash"> & { hp?: number; maxHp?: number }) => {
      const max = p.maxHp ?? p.hp ?? hpFor[p.kind];
      const full: Prop = { ...p, hp: p.hp ?? max, maxHp: max, damageFlash: 0 };
      if (full.kind === "building" && full.hasDoor) {
        full.doorW = 36;
        full.doorH = 56;
        full.doorX = full.x + full.w / 2 - 18;
        full.doorY = full.y + full.h - 56;
      }
      out.push(full);
    };
    switch (mapId) {
      case "neon-city": {
        // Cyber sedan + neon storefront w/ glowing door + lamppost
        add({ kind: "car", x: 80, y: gy - 56, w: 170, h: 56, hue: 320, accent: 200, seed: 1 });
        add({ kind: "building", x: 320, y: gy - 220, w: 170, h: 220, hue: 280, accent: 180, hasDoor: true, seed: 2 });
        add({ kind: "lamppost", x: 530, y: gy - 240, w: 8, h: 240, accent: 60 });
        add({ kind: "vending", x: 1030, y: gy - 110, w: 60, h: 110, hue: 200, accent: 150 });
        add({ kind: "car", x: 1130, y: gy - 56, w: 150, h: 56, hue: 25, accent: 60, seed: 3 });
        break;
      }
      case "cyber-dojo": {
        add({ kind: "barrel", x: 100, y: gy - 70, w: 44, h: 70, hue: 30, accent: 60, seed: 1 });
        add({ kind: "barrel", x: 150, y: gy - 70, w: 44, h: 70, hue: 30, accent: 60, seed: 2 });
        add({ kind: "pillar", x: 1080, y: gy - 220, w: 36, h: 220, hue: 20, accent: 30 });
        add({ kind: "crate", x: 1140, y: gy - 70, w: 70, h: 70, hue: 40, accent: 60, seed: 3 });
        break;
      }
      case "hells-arena": {
        add({ kind: "pillar", x: 60, y: gy - 260, w: 40, h: 260, hue: 20, accent: 35 });
        add({ kind: "pillar", x: 1180, y: gy - 260, w: 40, h: 260, hue: 20, accent: 35 });
        add({ kind: "barrel", x: 1110, y: gy - 70, w: 44, h: 70, hue: 25, accent: 50, seed: 1 });
        break;
      }
      case "backstreet": {
        add({ kind: "car", x: 70, y: gy - 56, w: 160, h: 56, hue: 25, accent: 60, seed: 1 });
        add({ kind: "trashcan", x: 250, y: gy - 70, w: 36, h: 70, hue: 150, accent: 80 });
        add({ kind: "vending", x: 1030, y: gy - 110, w: 56, h: 110, hue: 25, accent: 60 });
        add({ kind: "building", x: 1100, y: gy - 240, w: 180, h: 240, hue: 30, accent: 80, hasDoor: true, seed: 2 });
        break;
      }
      case "car-park": {
        add({ kind: "car", x: 60, y: gy - 56, w: 160, h: 56, hue: 0, accent: 25, seed: 1 });
        add({ kind: "car", x: 1080, y: gy - 56, w: 160, h: 56, hue: 230, accent: 200, seed: 2 });
        add({ kind: "barrel", x: 60, y: gy - 70, w: 36, h: 70, hue: 30, accent: 60, seed: 3 });
        break;
      }
      case "temple": {
        add({ kind: "pillar", x: 1180, y: gy - 280, w: 40, h: 280, hue: 60, accent: 50 });
        add({ kind: "crate", x: 90, y: gy - 60, w: 60, h: 60, hue: 40, accent: 60 });
        break;
      }
      case "living-room": {
        add({ kind: "vending", x: 60, y: gy - 110, w: 50, h: 110, hue: 30, accent: 60 });
        add({ kind: "trashcan", x: 1190, y: gy - 60, w: 32, h: 60, hue: 90, accent: 50 });
        break;
      }
      case "spaceship": {
        add({ kind: "barrel", x: 70, y: gy - 70, w: 44, h: 70, hue: 200, accent: 25, seed: 1 });
        add({ kind: "crate", x: 1180, y: gy - 70, w: 70, h: 70, hue: 220, accent: 200, seed: 2 });
        break;
      }
      case "rooftop-dusk": {
        add({ kind: "building", x: 60, y: gy - 240, w: 160, h: 240, hue: 30, accent: 60, hasDoor: true, seed: 1 });
        add({ kind: "vending", x: 1140, y: gy - 110, w: 50, h: 110, hue: 220, accent: 200 });
        break;
      }
      case "warehouse": {
        add({ kind: "crate", x: 70, y: gy - 70, w: 70, h: 70, hue: 40, accent: 60, seed: 1 });
        add({ kind: "crate", x: 145, y: gy - 70, w: 70, h: 70, hue: 40, accent: 60, seed: 2 });
        add({ kind: "barrel", x: 1100, y: gy - 70, w: 44, h: 70, hue: 30, accent: 60, seed: 3 });
        add({ kind: "barrel", x: 1150, y: gy - 70, w: 44, h: 70, hue: 30, accent: 60, seed: 4 });
        break;
      }
      case "subway": {
        add({ kind: "vending", x: 70, y: gy - 110, w: 56, h: 110, hue: 0, accent: 25 });
        add({ kind: "trashcan", x: 1190, y: gy - 60, w: 32, h: 60, hue: 240, accent: 220 });
        break;
      }
      case "forest": {
        add({ kind: "barrel", x: 70, y: gy - 70, w: 44, h: 70, hue: 90, accent: 130, seed: 1 });
        add({ kind: "crate", x: 1180, y: gy - 60, w: 60, h: 60, hue: 60, accent: 90, seed: 2 });
        break;
      }
      case "space": {
        add({ kind: "crate", x: 70, y: gy - 60, w: 60, h: 60, hue: 260, accent: 220 });
        add({ kind: "crate", x: 1180, y: gy - 60, w: 60, h: 60, hue: 260, accent: 220 });
        break;
      }
    }
    return out;
  }

  /** Shatter a prop into many debris chunks + ember burst. */
  private shatterProp(p: Prop, sx: number, sy: number) {
    if (p.destroyed) return;
    p.destroyed = true;
    this.shake = Math.max(this.shake, 18);
    this.impactFlash = Math.max(this.impactFlash, 0.5);
    this.shockwaves.push({
      x: p.x + p.w / 2, y: p.y + p.h / 2,
      r: 8, rMax: Math.max(p.w, p.h) * 1.8,
      life: 0.5, maxLife: 0.5, color: "oklch(0.85 0.22 40)",
    });
    const cols = Math.max(3, Math.round(p.w / 16));
    const rows = Math.max(3, Math.round(p.h / 16));
    const cw = p.w / cols, ch = p.h / rows;
    const baseHue = p.hue ?? 250;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const px = p.x + cx * cw + cw / 2;
        const py = p.y + cy * ch + ch / 2;
        const blast = 220 + Math.random() * 240;
        const ang2 = Math.atan2(py - sy, px - sx);
        this.debris.push({
          x: px, y: py,
          vx: Math.cos(ang2) * blast + (Math.random() - 0.5) * 90,
          vy: Math.sin(ang2) * blast - 140 - Math.random() * 160,
          w: cw * (0.7 + Math.random() * 0.4),
          h: ch * (0.7 + Math.random() * 0.4),
          rot: Math.random() * Math.PI,
          rotV: (Math.random() - 0.5) * 14,
          life: 1.4 + Math.random() * 0.8, maxLife: 2.2,
          color: `oklch(${0.28 + Math.random() * 0.18} 0.06 ${baseHue})`,
        });
      }
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 240;
      this.particles.push({
        x: p.x + p.w / 2, y: p.y + p.h / 2,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.6, maxLife: 0.6,
        color: Math.random() < 0.5 ? "oklch(0.80 0.26 30)" : "oklch(0.95 0.20 70)",
        size: 2 + Math.random() * 2.4,
      });
    }
    Sfx.play("boom", 0.55);
  }

  /** During laser overload, shatter any prop the beam segment crosses. */
  private overloadShatterProps(sx: number, sy: number, ex: number, ey: number) {
    for (const p of this.props) {
      if (p.destroyed) continue;
      if (this.segmentIntersectsRect(sx, sy, ex, ey, p.x, p.y, p.w, p.h)) {
        this.shatterProp(p, sx, sy);
      }
    }
  }

  /** Apply damage to a prop. Triggers shatter when depleted. */
  private damageProp(p: Prop, amount: number, sx: number, sy: number) {
    if (p.destroyed || amount <= 0) return;
    p.hp = Math.max(0, p.hp - amount);
    p.damageFlash = Math.min(1, p.damageFlash + 0.6);
    // Small chip burst — premium feedback without spam
    if (!this.lowPower) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const hue = p.hue ?? 250;
      const n = Math.min(8, 2 + Math.round(amount / 6));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 160;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * p.w * 0.6,
          y: cy + (Math.random() - 0.5) * p.h * 0.6,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
          life: 0.32, maxLife: 0.32,
          color: `oklch(0.65 0.10 ${hue})`,
          size: 1.4 + Math.random() * 1.6,
        });
      }
    }
    if (p.hp <= 0) this.shatterProp(p, sx, sy);
  }

  /** True if (x,y) is inside the walkable door rect of a building. */
  private pointInDoor(p: Prop, x: number, y: number): boolean {
    if (p.kind !== "building" || !p.hasDoor || p.doorX == null) return false;
    return x > p.doorX && x < p.doorX + (p.doorW ?? 0)
      && y > (p.doorY ?? 0) && y < (p.doorY ?? 0) + (p.doorH ?? 0);
  }

  /** True if the fighter's hitbox overlaps the door (used to allow walk-through). */
  private fighterInDoor(p: Prop, fx: number, fy: number): boolean {
    if (p.kind !== "building" || !p.hasDoor || p.doorX == null) return false;
    const hw = FIGHTER_W / 2;
    const dy = p.doorY ?? 0;
    const dh = p.doorH ?? 0;
    const dx = p.doorX;
    const dw = p.doorW ?? 0;
    // Fighter's feet must be inside the door arch range
    const feet = fy + FIGHTER_H;
    const overlapX = fx + hw > dx - 4 && fx - hw < dx + dw + 4;
    const overlapY = feet > dy && fy < dy + dh;
    return overlapX && overlapY;
  }

  /** Find first non-destroyed prop the segment hits. Returns prop + dist. */
  private firstPropHit(sx: number, sy: number, ex: number, ey: number): { prop: Prop; t: number } | null {
    let best: { prop: Prop; t: number } | null = null;
    for (const p of this.props) {
      if (p.destroyed) continue;
      const t = this.segmentRectEntryT(sx, sy, ex, ey, p.x, p.y, p.w, p.h);
      if (t == null) continue;
      if (best == null || t < best.t) best = { prop: p, t };
    }
    return best;
  }

  /** Returns parametric t in [0,1] of segment entry into rect, or null. */
  private segmentRectEntryT(sx: number, sy: number, ex: number, ey: number,
                            rx: number, ry: number, rw: number, rh: number): number | null {
    const dx = ex - sx, dy = ey - sy;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-6) {
      if (sx < rx || sx > rx + rw) return null;
    } else {
      let t1 = (rx - sx) / dx, t2 = (rx + rw - sx) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (Math.abs(dy) < 1e-6) {
      if (sy < ry || sy > ry + rh) return null;
    } else {
      let t1 = (ry - sy) / dy, t2 = (ry + rh - sy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return Math.max(0, tmin);
  }

  /**
   * Returns the FIRST solid prop blocking a melee swing from attacker `f` to a
   * point at offset `range` in front of them. Buildings count as cover unless
   * the attacker is standing in the door. Flying attackers ignore cover.
   * If a prop is in the way, it is damaged for `damage` and we return true so
   * the caller can SKIP applying damage to the opponent (cover absorbs the hit).
   */
  private meleeBlockedByProp(f: Fighter, range: number, damage: number): boolean {
    if (f.flying) return false;
    const sx = f.x, sy = f.y + FIGHTER_H * 0.45;
    const ex = f.x + f.facing * range, ey = sy;
    const hit = this.firstPropHit(sx, sy, ex, ey);
    if (!hit) return false;
    const p = hit.prop;
    // Allow ground fighters to attack THROUGH the doorway
    if (this.fighterInDoor(p, f.x, f.y)) return false;
    this.damageProp(p, damage, sx, sy);
    return true;
  }


  /** Render all map props with kind-specific premium look. Walk-through; pulses if has door. */
  private drawProps(ctx: CanvasRenderingContext2D) {
    if (!this.props.length) return;
    const t = this.elapsed;
    for (const p of this.props) {
      if (p.destroyed) continue;
      const hue = p.hue ?? 250;
      const acc = p.accent ?? hue;
      const seed = p.seed ?? 1;
      switch (p.kind) {
        case "car": {
          // Body
          const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
          g.addColorStop(0, `oklch(0.42 0.10 ${hue})`);
          g.addColorStop(1, `oklch(0.18 0.06 ${hue})`);
          ctx.fillStyle = g;
          ctx.fillRect(p.x, p.y + p.h * 0.4, p.w, p.h * 0.6);
          // Cabin (greenhouse)
          ctx.fillStyle = `oklch(0.22 0.06 ${hue})`;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w * 0.18, p.y + p.h * 0.4);
          ctx.lineTo(p.x + p.w * 0.32, p.y);
          ctx.lineTo(p.x + p.w * 0.72, p.y);
          ctx.lineTo(p.x + p.w * 0.86, p.y + p.h * 0.4);
          ctx.closePath(); ctx.fill();
          // Windows (tinted glow)
          ctx.fillStyle = `oklch(0.55 0.18 ${acc} / 0.55)`;
          ctx.fillRect(p.x + p.w * 0.34, p.y + 4, p.w * 0.13, p.h * 0.34);
          ctx.fillRect(p.x + p.w * 0.53, p.y + 4, p.w * 0.13, p.h * 0.34);
          // Highlight strip
          ctx.fillStyle = `oklch(0.85 0.10 ${acc} / 0.85)`;
          ctx.fillRect(p.x + 4, p.y + p.h * 0.42, p.w - 8, 2);
          // Headlight glow
          ctx.shadowBlur = 16; ctx.shadowColor = `oklch(0.95 0.18 ${acc})`;
          ctx.fillStyle = `oklch(0.95 0.18 ${acc})`;
          ctx.fillRect(p.x + p.w - 6, p.y + p.h * 0.55, 4, 6);
          ctx.shadowBlur = 0;
          // Wheels
          ctx.fillStyle = "oklch(0.08 0 0)";
          ctx.beginPath(); ctx.arc(p.x + p.w * 0.22, p.y + p.h, p.h * 0.32, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + p.w * 0.78, p.y + p.h, p.h * 0.32, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `oklch(0.45 0.04 ${hue})`;
          ctx.beginPath(); ctx.arc(p.x + p.w * 0.22, p.y + p.h, p.h * 0.14, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + p.w * 0.78, p.y + p.h, p.h * 0.14, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case "building": {
          // Facade
          const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
          g.addColorStop(0, `oklch(0.22 0.05 ${hue})`);
          g.addColorStop(1, `oklch(0.10 0.03 ${hue})`);
          ctx.fillStyle = g;
          ctx.fillRect(p.x, p.y, p.w, p.h);
          // Roof trim
          ctx.fillStyle = `oklch(0.32 0.08 ${hue})`;
          ctx.fillRect(p.x - 4, p.y, p.w + 8, 8);
          // Windows grid (random lit)
          const cols = 4, rows = Math.max(3, Math.floor(p.h / 50));
          const ww = (p.w - 24) / cols - 6;
          const wh = 22;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const wx = p.x + 12 + c * (ww + 6);
              const wy = p.y + 18 + r * (wh + 12);
              if (wy + wh > p.y + p.h - 60) continue;
              const lit = ((r * 7 + c * 3 + seed) % 5) < 3;
              const flick = lit ? (0.7 + 0.3 * Math.sin(t * 2 + r + c)) : 0.15;
              ctx.shadowBlur = lit ? 8 : 0; ctx.shadowColor = `oklch(0.85 0.12 ${acc})`;
              ctx.fillStyle = `oklch(${lit ? 0.75 : 0.22} 0.12 ${acc} / ${flick})`;
              ctx.fillRect(wx, wy, ww, wh);
              ctx.shadowBlur = 0;
            }
          }
          // Walkable glowing door
          if (p.hasDoor) {
            const dw = 36, dh = 56;
            const dx = p.x + p.w / 2 - dw / 2;
            const dy = p.y + p.h - dh;
            // Door frame glow pulse
            const pulse = 0.55 + 0.45 * Math.sin(t * 2.4);
            ctx.shadowBlur = 14 * pulse; ctx.shadowColor = `oklch(0.85 0.22 ${acc})`;
            ctx.fillStyle = `oklch(0.18 0.04 ${hue})`;
            ctx.fillRect(dx - 3, dy - 3, dw + 6, dh + 3);
            ctx.fillStyle = `oklch(${0.45 + 0.25 * pulse} 0.20 ${acc})`;
            ctx.fillRect(dx, dy, dw, dh);
            ctx.shadowBlur = 0;
            // Door arch highlight + handle
            ctx.fillStyle = `oklch(0.92 0.10 ${acc} / 0.9)`;
            ctx.fillRect(dx, dy, dw, 2);
            ctx.fillStyle = "oklch(0.85 0.05 80)";
            ctx.beginPath(); ctx.arc(dx + dw - 6, dy + dh / 2, 2, 0, Math.PI * 2); ctx.fill();
            // Welcoming light spill on ground
            ctx.fillStyle = `oklch(0.85 0.18 ${acc} / ${0.10 * pulse})`;
            ctx.beginPath();
            ctx.moveTo(dx, dy + dh);
            ctx.lineTo(dx - 18, dy + dh + 22);
            ctx.lineTo(dx + dw + 18, dy + dh + 22);
            ctx.lineTo(dx + dw, dy + dh);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case "lamppost": {
          ctx.fillStyle = `oklch(0.18 0.01 ${hue})`;
          ctx.fillRect(p.x, p.y, p.w, p.h);
          // Crossarm
          ctx.fillRect(p.x - 24, p.y, 60, 6);
          // Bulb glow
          const flick = 0.7 + 0.3 * Math.sin(t * 11) * Math.sin(t * 3);
          ctx.shadowBlur = 22 * flick; ctx.shadowColor = `oklch(0.9 0.16 ${acc})`;
          ctx.fillStyle = `oklch(0.9 0.16 ${acc} / ${0.6 + 0.4 * flick})`;
          ctx.beginPath(); ctx.arc(p.x + 32, p.y + 4, 6, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          // Light cone on ground
          ctx.fillStyle = `oklch(0.85 0.12 ${acc} / 0.08)`;
          ctx.beginPath();
          ctx.moveTo(p.x + 32, p.y + 8);
          ctx.lineTo(p.x + 32 - 60, p.y + p.h);
          ctx.lineTo(p.x + 32 + 60, p.y + p.h);
          ctx.closePath(); ctx.fill();
          break;
        }
        case "vending": {
          const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
          g.addColorStop(0, `oklch(0.42 0.16 ${hue})`);
          g.addColorStop(1, `oklch(0.28 0.12 ${hue})`);
          ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
          // Display window
          ctx.fillStyle = "oklch(0.10 0.02 240)";
          ctx.fillRect(p.x + 4, p.y + 8, p.w - 8, p.h * 0.55);
          // Bottles
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
              ctx.fillStyle = `oklch(0.7 0.18 ${(i * 80 + j * 40) % 360})`;
              ctx.fillRect(p.x + 8 + i * (p.w / 3), p.y + 12 + j * 22, p.w / 3 - 6, 16);
            }
          }
          // Glow trim
          const flick = 0.6 + 0.4 * Math.sin(t * 4 + seed);
          ctx.shadowBlur = 10 * flick; ctx.shadowColor = `oklch(0.85 0.20 ${acc})`;
          ctx.fillStyle = `oklch(0.85 0.20 ${acc} / ${0.6 + 0.4 * flick})`;
          ctx.fillRect(p.x, p.y + p.h * 0.6, p.w, 3);
          ctx.shadowBlur = 0;
          break;
        }
        case "barrel": {
          const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
          g.addColorStop(0, `oklch(0.30 0.08 ${hue})`);
          g.addColorStop(0.5, `oklch(0.46 0.10 ${hue})`);
          g.addColorStop(1, `oklch(0.22 0.06 ${hue})`);
          ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
          // Bands
          ctx.fillStyle = `oklch(0.18 0.04 ${hue})`;
          ctx.fillRect(p.x, p.y + p.h * 0.2, p.w, 3);
          ctx.fillRect(p.x, p.y + p.h * 0.7, p.w, 3);
          // Hazard symbol
          ctx.fillStyle = `oklch(0.85 0.20 ${acc})`;
          ctx.fillRect(p.x + p.w / 2 - 6, p.y + p.h * 0.4, 12, 12);
          break;
        }
        case "crate": {
          const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
          g.addColorStop(0, `oklch(0.42 0.06 ${hue})`);
          g.addColorStop(1, `oklch(0.22 0.04 ${hue})`);
          ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
          // Cross planks
          ctx.strokeStyle = `oklch(0.14 0.03 ${hue})`; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y + p.h);
          ctx.moveTo(p.x + p.w, p.y); ctx.lineTo(p.x, p.y + p.h);
          ctx.rect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
          ctx.stroke();
          break;
        }
        case "trashcan": {
          ctx.fillStyle = `oklch(0.28 0.05 ${hue})`;
          ctx.fillRect(p.x, p.y + 6, p.w, p.h - 6);
          ctx.fillStyle = `oklch(0.40 0.06 ${hue})`;
          ctx.fillRect(p.x - 2, p.y, p.w + 4, 8);
          // Vertical ribs
          ctx.strokeStyle = `oklch(0.18 0.03 ${hue})`; ctx.lineWidth = 1;
          for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(p.x + (p.w * i / 4), p.y + 10);
            ctx.lineTo(p.x + (p.w * i / 4), p.y + p.h - 4);
            ctx.stroke();
          }
          break;
        }
        case "pillar": {
          const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
          g.addColorStop(0, `oklch(0.18 0.02 ${hue})`);
          g.addColorStop(0.5, `oklch(0.34 0.04 ${hue})`);
          g.addColorStop(1, `oklch(0.18 0.02 ${hue})`);
          ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
          // Caps
          ctx.fillStyle = `oklch(0.40 0.05 ${hue})`;
          ctx.fillRect(p.x - 6, p.y, p.w + 12, 12);
          ctx.fillRect(p.x - 6, p.y + p.h - 12, p.w + 12, 12);
          // Cracks
          ctx.strokeStyle = `oklch(0.08 0.02 ${hue})`; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w * 0.3, p.y + 18);
          ctx.lineTo(p.x + p.w * 0.5, p.y + p.h * 0.5);
          ctx.lineTo(p.x + p.w * 0.4, p.y + p.h - 18);
          ctx.stroke();
          break;
        }
      }

      // ---- Damage visualization: cracks + white flash overlay ----
      const dmgRatio = 1 - p.hp / p.maxHp;
      if (dmgRatio > 0.05) {
        // Crack lines, more as HP drops. Deterministic from seed.
        const s = (p.seed ?? 1) * 9301;
        const tier = dmgRatio > 0.75 ? 3 : dmgRatio > 0.45 ? 2 : 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.w, p.h);
        ctx.clip();
        ctx.strokeStyle = `oklch(0.08 0.02 ${hue} / ${0.45 + dmgRatio * 0.4})`;
        ctx.lineWidth = 1 + dmgRatio * 1.5;
        for (let i = 0; i < tier * 2; i++) {
          const r1 = ((s + i * 113) % 1000) / 1000;
          const r2 = ((s + i * 271) % 1000) / 1000;
          const r3 = ((s + i * 419) % 1000) / 1000;
          const r4 = ((s + i * 587) % 1000) / 1000;
          ctx.beginPath();
          ctx.moveTo(p.x + r1 * p.w, p.y + r2 * p.h);
          ctx.lineTo(p.x + r3 * p.w, p.y + r4 * p.h);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (p.damageFlash > 0.01) {
        ctx.fillStyle = `oklch(0.98 0.05 60 / ${p.damageFlash * 0.55})`;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
    }
  }

  private buildSnapshot(): GameSnapshot {
    return {
      p1: this.snapPlayer(this.p1),
      p2: this.snapPlayer(this.p2),
      winner: this.winner, phase: this.phase,
      slowmo: this.slowmoT > 0,
      teleTargeting: this.teleTargeting !== null,
      koCinematicT: this.koCinematicT,
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
      const p = computeRagdollPose(f.ragdollPhase, FIGHTER_H, f.ragdollAng);
      // Override lean with physical body angle for stable visual
      return { ...p, lean: f.ragdollAng };
    }
    if (f.downedT > 0) {
      const targetAng = f.ragdollAng >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const p = computeRagdollPose(f.ragdollPhase, FIGHTER_H, targetAng);
      // Lay flat — snap angle to ±90°, freeze tumble. Add tiny breathing rise.
      const breath = Math.sin(f.ragdollPhase * 2.4) * 0.6;
      return { ...p, hipY: p.hipY + breath, shoulderY: p.shoulderY + breath * 0.6, lean: targetAng };
    }
    if (f.getUpT > 0) {
      // Phased rise driven by the same risePhase() clock the renderer uses,
      // so cape/head/eye anchors stay glued to the sprite frame.
      const u = 1 - (f.getUpT / Math.max(0.001, f.getUpDur));
      const info = risePhase(u);
      const targetAng = f.ragdollAng >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const flat = computeRagdollPose(f.ragdollPhase, FIGHTER_H, targetAng);
      const stand = computeWalkPose(0, 0, true, 0, false, f.facing, FIGHTER_H);
      const press: Pose = {
        headOffsetY: 28, shoulderY: 50, hipY: 70,
        legL: [-4, 70, -6, 78, -10, 84], legR: [4, 70, 6, 78, 10, 84],
        armL: [-6, 50, -12, 64, -18, 76], armR: [6, 50, 12, 64, 18, 76],
        handL: [-18, 76], handR: [18, 76],
        footL: [-10, 84], footR: [10, 84],
        lean: targetAng * 0.55, shoulderRoll: 0,
      };
      const kneel: Pose = {
        headOffsetY: 14, shoulderY: 36, hipY: 58,
        legL: [-5, 58, -8, 70, -12, 80], legR: [5, 58, 6, 68, 8, 80],
        armL: [-6, 36, -10, 50, -12, 60], armR: [6, 36, 10, 50, 12, 58],
        handL: [-12, 60], handR: [12, 58],
        footL: [-12, 80], footR: [8, 80],
        lean: targetAng * 0.18, shoulderRoll: 0,
      };
      const coil: Pose = {
        headOffsetY: 8, shoulderY: 28, hipY: 50,
        legL: [-6, 50, -10, 62, -10, 78], legR: [6, 50, 10, 62, 10, 78],
        armL: [-7, 28, -10, 40, -8, 52], armR: [7, 28, 10, 40, 8, 52],
        handL: [-8, 52], handR: [8, 52],
        footL: [-10, 78], footR: [10, 78],
        lean: targetAng * 0.08, shoulderRoll: 0,
      };
      const smooth = (x: number) => x * x * (3 - 2 * x);
      let out: Pose;
      let leanOut: number;
      switch (info.phase) {
        case "gather": {
          const e = smooth(info.local);
          leanOut = targetAng * (1 - e * 0.45);
          out = blendPose(flat, press, e, leanOut);
          break;
        }
        case "press": {
          const e = smooth(info.local);
          leanOut = targetAng * (0.55 - e * 0.37);
          out = blendPose(press, kneel, e, leanOut);
          break;
        }
        case "kneel": {
          leanOut = targetAng * 0.18 * (1 - info.local * 0.3);
          out = { ...kneel, lean: leanOut };
          break;
        }
        case "coil": {
          const e = smooth(info.local);
          leanOut = targetAng * (0.18 - e * 0.10);
          out = blendPose(kneel, coil, e, leanOut);
          break;
        }
        case "drive": {
          const e = 1 - Math.pow(1 - info.local, 4);
          leanOut = targetAng * 0.08 * (1 - e);
          out = blendPose(coil, stand, e, leanOut);
          break;
        }
        default: {
          const breath = Math.sin(info.local * Math.PI) * 0.6;
          out = { ...stand, shoulderY: stand.shoulderY + breath, lean: 0 };
          break;
        }
      }
      return out;
    }
    // Use the rendered facing (sign of facingT) so pose direction stays in sync
    // with the yaw scale we apply at draw time. Both flip at the same instant
    // (when facingT crosses zero), avoiding any pose/render desync.
    const renderFacing: 1 | -1 = f.facingT >= 0 ? 1 : -1;
    // Sprite-sheet character is authoritative — no procedural attack/flight
    // pose overlays. Only the walk pose is computed here; the renderer reads
    // it for cape/torso/head positioning while sprite frames draw the body.
    const base = computeWalkPose(f.walkPhase, f.vx, f.onGround, f.vy, f.attackAnim > 0 || f.punchT > 0, renderFacing, FIGHTER_H);
    return applyWobble(base, f.wobble, this.lowPower, f.onGround && !f.flying);
  }

  /**
   * World-space position of the eye-line mid-point, accounting for body lean /
   * roll / head bob. Mirrors transforms in drawFighterAt: translate(x+bodyLagX, y)
   * → rotate(lean+bodyRoll) around feet → eye at local (facing*3, headY).
   */
  private getEyeWorldPos(f: Fighter): { x: number; y: number } {
    const pose = this.poseFor(f);
    const headR = 12;
    const headY = headR + 2 + pose.headOffsetY;
    const ex = f.facingT * 3;
    const ey = headY;
    const a = pose.lean + f.bodyRoll;
    const dyL = ey - FIGHTER_H;
    const cos = Math.cos(a); const sin = Math.sin(a);
    const rx = ex * cos - dyL * sin;
    const ry = ex * sin + dyL * cos + FIGHTER_H;
    return { x: f.x + f.bodyLagX + rx, y: f.y + ry };
  }

  // ---------------- RENDER ----------------
  // Visible world rect for current frame (set by render, used by pointer mapping).
  private viewScale = 1;
  private viewOffX = 0;
  private viewOffY = 0;

  private render() {
    const ctx = this.ctx;
    // Legacy omni-shake (random jitter both axes)
    const shx = (Math.random() - 0.5) * this.shake;
    const shy = (Math.random() - 0.5) * this.shake;
    // Directional kick — eased pulse along the strike vector. Peaks at
    // ~30% of the duration then settles, reading as a real punch land.
    let dirShx = 0, dirShy = 0;
    if (this.shakeDirT > 0 && this.shakeDirDur > 0) {
      const u = 1 - this.shakeDirT / this.shakeDirDur; // 0→1
      // pulse: fast rise, slower fall — sin(πu)^0.6 with bias
      const pulse = Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - u * 0.4);
      dirShx = this.shakeDirX * pulse;
      dirShy = this.shakeDirY * pulse;
    }

    const cw = this.canvas.width, ch = this.canvas.height;

    // ---- Camera: center between fighters, zoom in for closeup combat. ----
    // Base scale = cover-fit so the screen is always edge-to-edge filled.
    const baseScale = Math.max(cw / W, ch / H);
    // Zoom factor: closer when fighters are near each other, pulls back when far.
    const dx = Math.abs(this.p1.x - this.p2.x);
    const dy = Math.abs((this.p1.y + FIGHTER_H * 0.5) - (this.p2.y + FIGHTER_H * 0.5));
    const spread = Math.hypot(dx, dy);
    // Map spread → desired zoom (close fight = 2.0x, far fight = 1.35x)
    let targetZoom = Math.max(1.35, Math.min(2.0, 520 / Math.max(220, spread)));
    // KO cinematic: punch in hard on the loser for ~1.4s
    const koActive = this.phase === "ko" && this.koCinematicT < 1.4;
    if (koActive) {
      targetZoom = 2.6;
    }
    this.camZoom += (targetZoom - this.camZoom) * (koActive ? 0.18 : 0.08);
    // Multiplicative zoom-punch overlay — bell curve that fades to 0.
    let zoomMul = 1;
    if (this.zoomPunchT > 0 && this.zoomPunchDur > 0) {
      const u = 1 - this.zoomPunchT / this.zoomPunchDur;
      const bell = Math.sin(Math.PI * u);
      zoomMul = 1 + this.zoomPunch * bell;
    }
    const worldScale = baseScale * this.camZoom * zoomMul;

    // Visible world half-extents (in world units)
    const vw = cw / worldScale, vh = ch / worldScale;
    // Target focus = midpoint of fighters (slightly above feet for headroom)
    let tx = (this.p1.x + this.p2.x) / 2;
    let ty = (this.p1.y + this.p2.y) / 2 + FIGHTER_H * 0.3 - 40;
    if (koActive && this.koFocus) {
      tx = this.koFocus.x;
      ty = this.koFocus.y;
    }
    // Clamp camera so visible window stays inside the stage (no black edges).
    const minCx = vw / 2, maxCx = W - vw / 2;
    const minCy = vh / 2, maxCy = H - vh / 2;
    const clampedTx = vw >= W ? W / 2 : Math.max(minCx, Math.min(maxCx, tx));
    const clampedTy = vh >= H ? H / 2 : Math.max(minCy, Math.min(maxCy, ty));
    // Smooth follow
    this.camX += (clampedTx - this.camX) * 0.12;
    this.camY += (clampedTy - this.camY) * 0.12;

    const offX = cw / 2 - this.camX * worldScale + shx + dirShx;
    const offY = ch / 2 - this.camY * worldScale + shy + dirShy;

    this.viewScale = worldScale;
    this.viewOffX = offX;
    this.viewOffY = offY;

    ctx.save();
    // Background fill in case any map leaves gaps
    ctx.fillStyle = "oklch(0.06 0.02 250)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(worldScale, 0, 0, worldScale, offX, offY);

    getMap(this.mapId).drawBackground(ctx, this.elapsed, W, H, GROUND_Y);

    // Smoke clouds — multi-blob volumetric brimstone with soft alpha falloff.
    // Drawn under particles so glowing embers/sparks pop on top.
    if (this.smokeClouds.length) {
      ctx.globalCompositeOperation = "source-over";
      for (const sc of this.smokeClouds) {
        const t = sc.life / sc.maxLife;
        // Fade in fast, out slow — looks like dispersing smoke
        const fade = t < 0.85 ? Math.min(1, t / 0.25) * (t / 0.85) : (1 - (t - 0.85) / 0.15) * 0.0 + 1;
        const alpha = Math.max(0, Math.min(1, fade)) * 0.55;
        const hue = sc.hue ?? 295;
        const seed = sc.seed ?? 0;
        // Lightness drifts darker as smoke ages and rises
        const L1 = 0.32 - (1 - t) * 0.06;
        const L2 = 0.18 - (1 - t) * 0.04;
        // Outer halo (soft, dark)
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = `oklch(${L2} 0.06 ${hue.toFixed(0)})`;
        ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r * 1.35, 0, Math.PI * 2); ctx.fill();
        // Body — multi-blob clusters for billowing look
        if (sc.dense && !this.lowPower) {
          const blobs = 5;
          for (let i = 0; i < blobs; i++) {
            const ang = (i / blobs) * Math.PI * 2 + seed;
            const off = sc.r * 0.45;
            const bx = sc.x + Math.cos(ang) * off;
            const by = sc.y + Math.sin(ang) * off * 0.7;
            const br = sc.r * (0.55 + 0.18 * Math.sin(seed + i * 1.7));
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = `oklch(${L1} 0.08 ${hue.toFixed(0)})`;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Core highlight (slight purple glow)
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.18;
        ctx.fillStyle = `oklch(0.55 0.18 ${hue.toFixed(0)})`;
        ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    }

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
      if (pl.destroyed) continue;
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

    // Foreground props (cars, buildings, lampposts, barrels, etc.) — shatterable by overload.
    this.drawProps(ctx);


    if (this.debris.length) {
      ctx.globalCompositeOperation = "source-over";
      for (const d of this.debris) {
        const a = Math.min(1, d.life / 0.6);
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.globalAlpha = a;
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        if (d.life > d.maxLife - 0.5) {
          ctx.fillStyle = "oklch(0.85 0.22 50 / 0.7)";
          ctx.fillRect(-d.w / 2, -d.h / 2, d.w, 1.5);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }


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

    // Ground decals (scuff ellipses from rises) — under everything else.
    if (this.groundDecals.length > 0) {
      ctx.save();
      for (const d of this.groundDecals) {
        const a = Math.max(0, d.life / d.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(d.x, GROUND_Y - 0.5, d.w, Math.max(2, d.w * 0.18), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Ground cracks — jagged radial fractures from heavy slams.
    if (this.cracks.length > 0) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const c of this.cracks) {
        const a = Math.max(0, c.life / c.maxLife);
        // Dark crack body
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = "oklch(0.10 0.02 40)";
        ctx.lineWidth = 2.2 * c.intensity + 0.6;
        for (const r of c.rays) {
          const cx = Math.cos(r.ang), cy = Math.sin(r.ang) * 0.35; // flatten to floor plane
          const nx = -Math.sin(r.ang), ny = Math.cos(r.ang) * 0.35;
          const x0 = c.x, y0 = GROUND_Y - 0.5;
          const x1 = x0 + cx * r.len * 0.33 + nx * r.jitter[0];
          const y1 = y0 + cy * r.len * 0.33 + ny * r.jitter[0];
          const x2 = x0 + cx * r.len * 0.66 + nx * r.jitter[1];
          const y2 = y0 + cy * r.len * 0.66 + ny * r.jitter[1];
          const x3 = x0 + cx * r.len + nx * r.jitter[2];
          const y3 = y0 + cy * r.len + ny * r.jitter[2];
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.stroke();
        }
        // Inner highlight (lighter rim) for depth
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = "oklch(0.55 0.04 40)";
        ctx.lineWidth = 0.8;
        for (const r of c.rays) {
          const cx = Math.cos(r.ang), cy = Math.sin(r.ang) * 0.35;
          const x3 = c.x + cx * r.len;
          const y3 = GROUND_Y - 0.5 + cy * r.len;
          ctx.beginPath();
          ctx.moveTo(c.x, GROUND_Y - 0.5);
          ctx.lineTo(x3, y3);
          ctx.stroke();
        }
        // Central impact dot
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = "oklch(0.08 0.02 40)";
        ctx.beginPath();
        ctx.ellipse(c.x, GROUND_Y - 0.5, 4 * c.intensity + 1.5, 1.5 * c.intensity + 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
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
    if (frenzyAttacker !== this.p1) { this.drawFlightAura(this.p1); this.drawFighter(this.p1); }
    if (frenzyAttacker !== this.p2) { this.drawFlightAura(this.p2); this.drawFighter(this.p2); }
    // Sprite-based attack FX overlays (charge ring, slash arc, impact star, shockwave).
    drawFxPool(ctx, this.attackFx);
    // Web-swing tethers — silky double strand with glow + slight slack curve.
    for (const f of [this.p1, this.p2]) {
      if (!f.swing) continue;
      const ctx = this.ctx; if (!ctx) continue;
      const hx = f.x; const hy = f.y + 28;
      const ax = f.swing.ax, ay = f.swing.ay;
      const dx = hx - ax, dy = hy - ay;
      const dist = Math.hypot(dx, dy) || 1;
      // Slack: bow the strand downward proportional to length.
      const sag = Math.min(28, dist * 0.06 + 6);
      const mx = (ax + hx) / 2;
      const my = (ay + hy) / 2 + sag;
      const drawStrand = (ox: number, oy: number, alpha: number, w: number, blur: number) => {
        ctx.save();
        ctx.strokeStyle = `oklch(0.98 0.02 240 / ${alpha})`;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.shadowColor = "oklch(0.95 0.04 240)";
        ctx.shadowBlur = blur;
        ctx.beginPath();
        ctx.moveTo(ax + ox, ay + oy);
        ctx.quadraticCurveTo(mx + ox, my + oy, hx + ox, hy + oy);
        ctx.stroke();
        ctx.restore();
      };
      // Outer glow
      drawStrand(0, 0, 0.25, 5.5, 14);
      // Twin silk strands (slight perpendicular offset)
      const px = -dy / dist, py = dx / dist;
      drawStrand(px * 1.2, py * 1.2, 0.95, 1.4, 6);
      drawStrand(-px * 1.2, -py * 1.2, 0.85, 1.2, 4);
      // Anchor splat (web stuck to surface)
      ctx.save();
      ctx.fillStyle = "oklch(0.97 0.02 240 / 0.9)";
      ctx.shadowColor = "oklch(0.95 0.04 240)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Tiny radial threads at anchor
      ctx.strokeStyle = "oklch(0.97 0.02 240 / 0.55)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * 7, ay + Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.restore();
    }

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
      // Red palette for Superman heat vision; gold/orange for Homelander/Iron Man.
      const isRed = !!b.red;
      const outerColor = isRed
        ? (b.overload ? "oklch(0.55 0.30 25)" : "oklch(0.70 0.28 25)")
        : (b.overload ? "oklch(0.78 0.28 28)" : "oklch(0.92 0.20 60)");
      const coreColor = isRed ? "oklch(0.92 0.18 22)" : "oklch(0.99 0.05 80)";
      const glowColor = isRed ? "oklch(0.65 0.28 25)" : "oklch(0.85 0.20 60)";
      const widthMul = b.overload ? 1.8 : 1;
      if (!this.lowPower) { ctx.shadowBlur = 22 * widthMul; ctx.shadowColor = glowColor; }
      ctx.strokeStyle = outerColor;
      ctx.lineWidth = 5 * widthMul;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = 1.6 * widthMul;
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

    // Speed lines: dense radial streaks during a super-punch dash to convey
    // the camera tearing through the air with the fighter. Centered on the
    // attacker's screen-space position, fading at the edges.
    const dasher = this.p1.dash ? this.p1 : (this.p2.dash ? this.p2 : null);
    if (dasher && dasher.dash) {
      const u = Math.min(1, dasher.dash.t / Math.max(0.001, dasher.dash.dur));
      // Ramp in fast, peak through mid-dash, fade just before impact
      const intensity = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      const cxS = (dasher.x - this.camX) * worldScale + cw / 2;
      const cyS = (dasher.y + FIGHTER_H * 0.45 - this.camY) * worldScale + ch / 2;
      const facing = dasher.facing;
      const maxR = Math.hypot(cw, ch) * 0.65;
      // Tinted black wash from the edges inward (vignette darken to focus eye)
      const wash = ctx.createRadialGradient(cxS, cyS, maxR * 0.18, cxS, cyS, maxR);
      wash.addColorStop(0, "rgba(0,0,0,0)");
      wash.addColorStop(1, `rgba(0,0,0,${(0.45 * intensity).toFixed(3)})`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const lineCount = this.lowPower ? 36 : 90;
      const seed = Math.floor(this.elapsed * 60);
      for (let i = 0; i < lineCount; i++) {
        // Pseudo-random but stable per-frame angle around the attacker
        const r = ((i * 9301 + 49297 + seed * 73) % 233280) / 233280;
        // Bias angles toward the direction of travel: clamp around facing
        const spread = 1.05;
        const ang = (r - 0.5) * Math.PI * spread + (facing > 0 ? 0 : Math.PI);
        // Distance from center: start near the fighter, extend past the edge
        const r0 = 90 + ((i * 7919) % 220);
        const len = 80 + ((i * 6151) % 260) + intensity * 180;
        const sx = cxS + Math.cos(ang) * r0;
        const sy = cyS + Math.sin(ang) * r0;
        const ex = sx + Math.cos(ang) * len;
        const ey = sy + Math.sin(ang) * len;
        const a = (0.18 + 0.55 * intensity) * (0.4 + 0.6 * (1 - r0 / 320));
        ctx.strokeStyle = i % 7 === 0
          ? `rgba(255,235,170,${a.toFixed(3)})`
          : `rgba(235,240,255,${(a * 0.7).toFixed(3)})`;
        ctx.lineWidth = i % 11 === 0 ? 2.2 : 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();

      // Chromatic-aberration tinted ring around the focal point for "punch-in" feel
      if (!this.lowPower) {
        const ring = ctx.createRadialGradient(cxS, cyS, 30, cxS, cyS, 200);
        ring.addColorStop(0, `rgba(255,210,140,${(0.18 * intensity).toFixed(3)})`);
        ring.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ring;
        ctx.fillRect(0, 0, cw, ch);
      }
    }

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

  /** Layered VFX rendered under a flying fighter: ground shadow that scales
   *  with altitude, sonic cone for high-speed cruise, and a soft heat aura. */
  private drawFlightAura(f: Fighter) {
    if (!f.flying) return;
    const ctx = this.ctx;
    const speed = Math.hypot(f.vx, f.vy);
    const horiz = Math.min(1, speed / 320);

    // ---- Ground shadow (scales with altitude — higher fighter, smaller/softer shadow) ----
    const altitude = (GROUND_Y - (f.y + FIGHTER_H));
    const altNorm = Math.min(1, altitude / 360);
    const shW = 28 * (1 - altNorm * 0.55);
    const shH = 5 * (1 - altNorm * 0.6);
    const shAlpha = 0.32 * (1 - altNorm * 0.55);
    if (shAlpha > 0.04) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${shAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(f.x + f.vx * 0.04, GROUND_Y - 1, shW, shH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.lowPower) return;

    // ---- Heat shimmer / hover aura ring (visible at low speed) ----
    if (horiz < 0.55) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3 + (f.id === "p1" ? 0 : 1.3));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (0.18 + pulse * 0.12) * (1 - horiz);
      const grad = ctx.createRadialGradient(f.x, f.y + FIGHTER_H * 0.55, 4, f.x, f.y + FIGHTER_H * 0.55, 48);
      grad.addColorStop(0, f.skin.glow);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(f.x, f.y + FIGHTER_H * 0.55, 48, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ---- Sonic cone: stretched glow behind the fighter at cruise speed ----
    if (horiz > 0.45) {
      const back = -Math.sign(f.vx || f.facing);
      const len = 38 + horiz * 90;
      const wid = 14 + horiz * 18;
      const cx = f.x;
      const cy = f.y + FIGHTER_H * 0.45;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(cx, cy);
      // Tilt the cone along velocity vector
      const ang = Math.atan2(f.vy, f.vx) || 0;
      ctx.rotate(ang + (back < 0 ? Math.PI : 0));
      // Outer soft cone
      const g = ctx.createLinearGradient(0, 0, -len, 0);
      g.addColorStop(0, `${f.skin.glow}`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.35 * horiz;
      ctx.beginPath();
      ctx.moveTo(0, -wid * 0.5);
      ctx.quadraticCurveTo(-len * 0.5, 0, -len, 0);
      ctx.quadraticCurveTo(-len * 0.5, 0, 0, wid * 0.5);
      ctx.closePath();
      ctx.fill();
      // Bright inner streak
      ctx.globalAlpha = 0.55 * horiz;
      ctx.strokeStyle = "oklch(0.97 0.06 80)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 0.85, 0); ctx.stroke();
      ctx.restore();

      // ---- Air-displacement ripples (curved arcs in front of the fighter) ----
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fwd = -back;
      for (let i = 0; i < 2; i++) {
        const off = 18 + i * 14 + (this.elapsed * 60 * horiz) % 16;
        const rx = f.x + fwd * off;
        const ry = f.y + FIGHTER_H * 0.45;
        ctx.globalAlpha = 0.18 * horiz * (1 - i * 0.4);
        ctx.strokeStyle = "oklch(0.95 0.04 220)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ry, 12 + i * 5, fwd > 0 ? -1.0 : Math.PI - 1.0, fwd > 0 ? 1.0 : Math.PI + 1.0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawFighter(f: Fighter) {
    const pose = this.poseFor(f);
    this.drawFighterAt(f, f.x, f.y, pose, false);
    this.drawDamageOverlay(f);
    this.drawJuggleCounter(f);
    this.drawParryFlash(f);
  }

  /** Bright "PARRY!" pop above a fighter who just deflected a hit. */
  private drawParryFlash(f: Fighter) {
    if (f.parrySuccessT <= 0) return;
    const ctx = this.ctx;
    const a = Math.min(1, f.parrySuccessT * 1.6);
    const pop = 1 + (1 - a) * 0.45;
    const y = f.y - 30 - (1 - a) * 18;
    ctx.save();
    ctx.translate(f.x, y);
    ctx.scale(pop, pop);
    ctx.font = "900 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = `oklch(0.18 0.06 80 / ${0.9 * a})`;
    ctx.fillStyle = `oklch(0.95 0.20 95 / ${a})`;
    ctx.strokeText("PARRY!", 0, 0);
    ctx.fillText("PARRY!", 0, 0);
    ctx.restore();
  }

  /** Floating "xN HIT" tag above an actively juggled fighter. */
  private drawJuggleCounter(f: Fighter) {
    if (f.juggleHits < 2 || f.juggleFlash <= 0) return;
    const ctx = this.ctx;
    const a = Math.min(1, f.juggleFlash);
    const pop = 1 + (1 - a) * 0.35;
    const y = f.y - 18 - (1 - a) * 14;
    ctx.save();
    ctx.translate(f.x, y);
    ctx.scale(pop, pop);
    ctx.font = "700 14px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = `oklch(0.18 0.04 30 / ${0.85 * a})`;
    ctx.fillStyle = f.juggleHits >= 5
      ? `oklch(0.78 0.22 30 / ${a})`
      : `oklch(0.92 0.16 80 / ${a})`;
    const txt = `×${f.juggleHits} HIT`;
    ctx.strokeText(txt, 0, 0);
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  /**
   * Anger-of-Stick damage state: as HP drops the body shows progressive
   * blood/bruising. Drawn AFTER the sprite so it tints whatever frame is
   * on screen. Hidden during ragdoll/down because we want the silhouette
   * clean during cinematic moments (the blood spray sells those instead).
   */
  private drawDamageOverlay(f: Fighter) {
    if (f.ragdollT > 0 || f.downedT > 0 || f.getUpT > 0) return;
    const hp = Math.max(0, f.hp);
    if (hp >= 60) return; // no visible damage above 60% HP
    const ctx = this.ctx;
    // Tier curve: 60→0 maps to 0→1 intensity
    const t = Math.min(1, (60 - hp) / 60);
    const x = f.x + f.bodyLagX;
    const top = f.y + FIGHTER_H * 0.10;
    const h = FIGHTER_H * 0.65;
    const w = FIGHTER_H * 0.34;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // Bruise wash — desaturated dark red, gets stronger
    ctx.globalAlpha = 0.18 + t * 0.42;
    ctx.fillStyle = hp < 15
      ? "oklch(0.30 0.18 22)"          // soaked
      : hp < 30 ? "oklch(0.42 0.15 22)" // blood streaks
      : "oklch(0.55 0.10 25)";          // light bruise
    ctx.beginPath();
    ctx.ellipse(x, top + h * 0.5, w, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Drip streaks (only at lower tiers)
    if (hp < 30 && !this.lowPower) {
      ctx.save();
      ctx.strokeStyle = "oklch(0.32 0.18 25)";
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55 + t * 0.3;
      const seed = (f.id === "p1" ? 13 : 27);
      const drips = hp < 15 ? 5 : 3;
      for (let i = 0; i < drips; i++) {
        const ox = ((seed * (i + 1) * 53) % 19) - 9;
        const sy = top + (i * 8 + (seed % 7));
        const len = 8 + ((seed * (i + 3)) % 12) + t * 10;
        ctx.beginPath();
        ctx.moveTo(x + ox, sy);
        ctx.lineTo(x + ox + (i % 2 ? 1 : -1), sy + len);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawFighterAt(f: Fighter, x: number, y: number, pose: Pose, ghost: boolean) {
    const ctx = this.ctx;
    const skin = f.skin;

    // ---- Sprite-sheet walk override ----
    // Replace the procedural body render with the imported walk sheet
    // animation when the fighter is in a normal grounded walk state. Falls
    // back to the procedural renderer for attacks, ragdoll, flight, KO, etc.
    // Sprite walk plays whenever the fighter is grounded (even during attacks
    // / kicks) — the procedural attack pose draws on top so arms still swing
    // but the legs stay visible from the sprite. Disabled only for ragdoll,
    // KO, get-up, and flight where the procedural rig owns the full body.
    // Sprite renderer covers walk, punch, jump, ragdoll, down/get-up, and hurt.
    // Procedural rig still owns: flight and special melee arms.
    const spriteReady = !ghost && isWalkSheetReady();
    const useSpriteWalk = spriteReady;

    // (Taijutsu sprite playback removed — Nightcrawler uses default sprite rig.)

    if (useSpriteWalk) {
      // Soft accent pool — only when grounded
      if (f.onGround && !this.lowPower) {
        ctx.save();
        const grad = ctx.createRadialGradient(x, y + FIGHTER_H - 1, 1, x, y + FIGHTER_H - 1, 28);
        grad.addColorStop(0, `color-mix(in oklab, ${skin.glow} 28%, transparent)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y + FIGHTER_H - 1, 28, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Iframe pulse — visible "I'm invulnerable" tell after a rise.
      if (!ghost && f.iframeT > 0 && f.ragdollT <= 0 && f.downedT <= 0 && f.getUpT <= 0 && !this.lowPower) {
        const pulse = 0.18 + Math.abs(Math.sin(this.elapsed * Math.PI * 5.5)) * 0.22;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(
          x, y + FIGHTER_H * 0.55, 4,
          x, y + FIGHTER_H * 0.55, FIGHTER_H * 0.55,
        );
        g.addColorStop(0, `color-mix(in oklab, ${skin.glow} ${Math.round(pulse * 100)}%, transparent)`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y + FIGHTER_H * 0.55, FIGHTER_H * 0.32, FIGHTER_H * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const renderFacing: 1 | -1 = f.facingT >= 0 ? 1 : -1;
      const drawFrame = (idx: number) =>
        drawWalkFrame(ctx, skin, idx, x + f.bodyLagX, y + FIGHTER_H, renderFacing, FIGHTER_H);

      // ---- Ragdoll tumble (rotate down silhouette by physics angle) ----
      if (f.ragdollT > 0) {
        ctx.save();
        ctx.translate(x + f.bodyLagX, y + FIGHTER_H * 0.5);
        ctx.rotate(f.ragdollAng);
        ctx.translate(0, FIGHTER_H * 0.5);
        drawWalkFrame(ctx, skin, DOWN_FRAME, 0, 0, renderFacing, FIGHTER_H);
        ctx.restore();
        return;
      }

      // ---- Downed (KO laydown) ----
      if (f.downedT > 0) { drawFrame(DOWN_FRAME); return; }

      // ---- Get-up (phased rise: gather/press/kneel/coil/drive/settle) ----
      // Pose, sprite, lift, lean, and FX share one risePhase() clock.
      if (f.getUpT > 0) {
        const total = Math.max(0.001, f.getUpDur);
        const u = 1 - (f.getUpT / total);
        const info = risePhase(u);
        // Sprite frame per phase.
        let idx: number;
        switch (info.phase) {
          case "gather": idx = DOWN_FRAME; break;
          case "press":  idx = GETUP_FRAME_A; break;
          case "kneel":  idx = GETUP_FRAME_B; break;
          case "coil":   idx = KNEE_CHAMBER_FRAME; break;
          case "drive":  idx = info.local < 0.6 ? KNEE_CHAMBER_FRAME : RECOVERY_FRAME; break;
          default:       idx = 0; break;
        }
        // Vertical lift: 0 = fully prone, 1 = standing. Driven by hand-shaped
        // curve so we plant on kneel and explode on drive instead of drifting.
        const groundLift = (1 - info.lift) * (FIGHTER_H * 0.46);
        // Forward weight-shift lean — peaks on press, settles to 0 on stand.
        const leanCurve =
          info.phase === "gather" ? info.local * 0.6
          : info.phase === "press" ? 0.6 + info.local * 0.4
          : info.phase === "kneel" ? 1.0 - info.local * 0.6
          : info.phase === "coil"  ? 0.4 - info.local * 0.4
          : 0;
        const leanPx = leanCurve * 4 * renderFacing;
        const sway = Math.sin(u * Math.PI * 1.4) * 1.0 * renderFacing;
        // Squash & stretch — compress on coil, stretch on drive, settle on stand.
        const sx =
          info.phase === "coil" ? 1 + info.local * 0.04
          : info.phase === "drive" ? 1.04 - info.local * 0.04
          : 1;
        const sy =
          info.phase === "press" ? 0.94 + info.local * 0.04
          : info.phase === "coil" ? 0.96 - info.local * 0.04
          : info.phase === "drive" ? 0.92 + info.local * 0.10
          : info.phase === "settle" ? 1.02 - info.local * 0.02
          : 0.96;
        ctx.save();
        ctx.translate(x + f.bodyLagX + leanPx + sway, y + FIGHTER_H + groundLift);
        ctx.scale(sx, sy);
        // Motion-blur afterimage — concentrated on the drive (explosive) phase.
        const blurAmt =
          info.phase === "drive" ? 0.18 + info.local * 0.18
          : info.phase === "press" ? 0.12
          : info.phase === "settle" ? 0.10 * (1 - info.local)
          : 0;
        if (blurAmt > 0 && !this.lowPower) {
          ctx.save();
          ctx.globalAlpha = blurAmt;
          ctx.globalCompositeOperation = "lighter";
          drawWalkFrame(ctx, skin, idx, 0, 4, renderFacing, FIGHTER_H);
          ctx.globalAlpha = blurAmt * 0.55;
          drawWalkFrame(ctx, skin, idx, -2 * renderFacing, 8, renderFacing, FIGHTER_H);
          ctx.restore();
        }
        drawWalkFrame(ctx, skin, idx, 0, 0, renderFacing, FIGHTER_H);
        ctx.restore();

        // ---- Phase-entry beats: audio, FX, decals ----
        if (!this.lowPower && f.getUpT > 0) {
          const lastU = 1 - ((f.getUpT + 0.016) / total);
          const lastInfo = risePhase(Math.max(0, lastU));
          if (lastInfo.phase !== info.phase) {
            // We just crossed into a new phase.
            switch (info.phase) {
              case "press": {
                // Hand plant — small foot scuff
                for (let i = 0; i < 4; i++) {
                  this.particles.push({
                    x: f.x + (Math.random() - 0.5) * 18,
                    y: GROUND_Y - 1,
                    vx: (Math.random() - 0.5) * 60,
                    vy: -10 - Math.random() * 22,
                    life: 0.4, maxLife: 0.4,
                    color: "oklch(0.8 0.02 60)",
                    size: 1.2 + Math.random() * 1.4,
                  });
                }
                this.groundDecals.push({
                  x: f.x + renderFacing * 6, w: 14,
                  life: 1.2, maxLife: 1.2,
                  color: "oklch(0.22 0.02 30 / 0.45)",
                });
                Sfx.play("thud", 0.10);
                break;
              }
              case "kneel": {
                // Knee plant — slightly bigger scuff
                for (let i = 0; i < 6; i++) {
                  this.particles.push({
                    x: f.x + (Math.random() - 0.5) * 22,
                    y: GROUND_Y - 1,
                    vx: (Math.random() - 0.5) * 90,
                    vy: -14 - Math.random() * 28,
                    life: 0.5, maxLife: 0.5,
                    color: "oklch(0.82 0.02 60)",
                    size: 1.4 + Math.random() * 1.6,
                  });
                }
                this.groundDecals.push({
                  x: f.x, w: 18,
                  life: 1.4, maxLife: 1.4,
                  color: "oklch(0.22 0.02 30 / 0.5)",
                });
                Sfx.play("thud", 0.18);
                break;
              }
              case "drive": {
                // Hero beat — explosive launch into stand.
                for (let i = 0; i < 16; i++) {
                  const dir = (Math.random() < 0.5 ? -1 : 1);
                  this.particles.push({
                    x: f.x + (Math.random() - 0.5) * 30,
                    y: GROUND_Y - 1 - Math.random() * 4,
                    vx: dir * (90 + Math.random() * 220),
                    vy: -25 - Math.random() * 70,
                    life: 0.75, maxLife: 0.75,
                    color: "oklch(0.86 0.02 60)",
                    size: 1.6 + Math.random() * 2.6,
                  });
                }
                for (let i = 0; i < 8; i++) {
                  this.particles.push({
                    x: f.x + (Math.random() - 0.5) * 18,
                    y: GROUND_Y - 2,
                    vx: (Math.random() - 0.5) * 90,
                    vy: -60 - Math.random() * 80,
                    life: 0.6, maxLife: 0.6,
                    color: skin.glow,
                    size: 1.2 + Math.random() * 1.4,
                  });
                }
                this.groundDecals.push({
                  x: f.x, w: 28,
                  life: 1.8, maxLife: 1.8,
                  color: "oklch(0.20 0.02 30 / 0.6)",
                });
                // Skin-tinted shock-ring flash
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                const ringGrad = ctx.createRadialGradient(
                  f.x, GROUND_Y - 2, 4,
                  f.x, GROUND_Y - 2, 60,
                );
                ringGrad.addColorStop(0, `color-mix(in oklab, ${skin.glow} 70%, transparent)`);
                ringGrad.addColorStop(0.6, `color-mix(in oklab, ${skin.glow} 20%, transparent)`);
                ringGrad.addColorStop(1, "transparent");
                ctx.fillStyle = ringGrad;
                ctx.beginPath();
                ctx.ellipse(f.x, GROUND_Y - 2, 60, 14, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                this.shake = Math.max(this.shake, 8);
                Sfx.play("thud", 0.32);
                break;
              }
              case "settle": {
                // Soft landing tap.
                this.shake = Math.max(this.shake, 2);
                break;
              }
            }
          }
          // Continuous low-rim glow during the drive window
          if (info.phase === "drive") {
            const glowA = Math.sin(info.local * Math.PI) * 0.55;
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const g = ctx.createRadialGradient(
              f.x, GROUND_Y - 2, 2,
              f.x, GROUND_Y - 2, 36,
            );
            g.addColorStop(0, `color-mix(in oklab, ${skin.glow} ${Math.round(glowA * 100)}%, transparent)`);
            g.addColorStop(1, "transparent");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(f.x, GROUND_Y - 2, 36, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        return;
      }

      // ---- Airborne (jump/fall) ----
      if (!f.onGround) {
        if (f.vy < -120) drawFrame(JUMP_RISE_FRAME);
        else if (f.vy < 60) drawFrame(JUMP_APEX_FRAME);
        else drawFrame(JUMP_APEX_FRAME);
        return;
      }

      // ---- Just landed (squash) ----
      if (f.justLandedT > 0) { drawFrame(JUMP_LAND_FRAME); return; }

      // ---- Combo swing (high kick / knee finisher) ----
      if (f.comboKind && f.comboT > 0) {
        const u = f.comboT / Math.max(0.001, f.comboDur);
        if (f.comboKind === "kick") {
          drawFrame(u < 0.4 ? KICK_CHAMBER_FRAME : KICK_HIT_FRAME);
        } else {
          drawFrame(u < 0.4 ? KNEE_CHAMBER_FRAME : KNEE_HIT_FRAME);
        }
        return;
      }

      // ---- Punch one-shot (frames 10..13) ----
      if (f.punchT > 0) {
        const pt = f.punchT;
        let pIdx = 0;
        if (pt < PUNCH_F11) pIdx = 0;
        else if (pt < PUNCH_F11 + PUNCH_F12) pIdx = 1;
        else if (pt < PUNCH_F11 + PUNCH_F12 + PUNCH_F13) pIdx = 2;
        else pIdx = 3;
        drawFrame(PUNCH_FRAME_START + pIdx);
        return;
      }

      // ---- Punch recovery ----
      if (f.recoverT > 0) { drawFrame(RECOVERY_FRAME); return; }

      // ---- Hurt flinch (briefly during heavy hit flash) ----
      if (f.hitFlash > 0.25 && f.meleeKind == null && f.attackAnim <= 0) {
        drawFrame(HURT_FRAME);
        return;
      }

      // ---- Walk loop (frames 0..9 from walk-sheet.png) ----
      // Premium-feel rules:
      //   1) NEVER alpha-crossfade two stickman frames — translucent line art
      //      overlapping itself reads as ghost-limbs / flicker.
      //   2) NO ctx.rotate on the body — sub-degree rotation at DPR 1.75
      //      shimmers along every limb edge.
      //   3) Snap ONLY the Y coord to integer device pixels. Horizontal X must
      //      stay sub-pixel or slow walks visibly stair-step.
      //   4) Snap bob to half-pixels so the body never floats between rows.
      //   5) Use high-quality image smoothing so the scaled sprite stays crisp.
      const moving = f.walkSpeedSmooth > 18;
      const cycleF = ((f.walkPhase / (Math.PI * 2)) % 1 + 1) % 1;
      const speedNorm = Math.min(1, f.walkSpeedSmooth / 240);
      const stance = getStance(f.skin.id);
      const bobAmp = (0.8 + speedNorm * 1.2) * stance.bobMul;
      const bobRaw = moving
        ? -Math.cos(cycleF * Math.PI * 4) * bobAmp           // up at footfall
        : Math.sin(this.elapsed * 1.6 + (f.id === "p1" ? 0 : 1.3)) * 0.4 * stance.idleMul;
      // Per-character side-to-side shoulder sway (heavy fighters lumber).
      const swayRaw = moving ? Math.sin(cycleF * Math.PI * 2) * stance.sway : 0;
      // Quantize to half-pixels — keeps motion visible but stable.
      const bob = Math.round(bobRaw * 2) / 2;
      const sway = Math.round(swayRaw * 2) / 2;
      // Forward lean scales with speed and faces direction of travel.
      const lean = stance.lean * speedNorm * renderFacing;

      // Single opaque frame (no crossfade) — selected from continuous phase.
      const fIdxRaw = moving ? cycleF * WALK_LOOP_FRAMES : 0;
      const f0 = Math.floor(fIdxRaw) % WALK_LOOP_FRAMES;

      const drawX = x + f.bodyLagX + sway + lean;    // sub-pixel — smooth slide
      const drawY = Math.round(y + FIGHTER_H - bob + stance.crouch); // integer — kill shimmer
      const prevSmoothing = ctx.imageSmoothingEnabled;
      const prevQuality = ctx.imageSmoothingQuality;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawWalkFrame(ctx, skin, f0, drawX, drawY, renderFacing, FIGHTER_H);
      ctx.imageSmoothingEnabled = prevSmoothing;
      ctx.imageSmoothingQuality = prevQuality;

      // Sprite is authoritative for the body; FX (slash arc, beams, etc.)
      // and overlays (cape, emblem, eyes) layer on top elsewhere.
      return;
    }

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
    // Body translation lag: small horizontal shove on impact, springs back to 0
    ctx.translate(x + (ghost ? 0 : f.bodyLagX), y);
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
      // Subtle motion-driven squash & stretch (anchored at the feet).
      const moveStretch = 1 + moving * 0.04;
      const moveSquash = 1 / moveStretch;
      const hitSquash = 1 + hit * 0.18;
      const hitStretch = 1 / hitSquash;
      const ssX = moveSquash * hitSquash;
      const ssY = moveStretch * hitStretch;
      ctx.translate(0, FIGHTER_H);
      ctx.scale(squash * ssX, (2 - squash) * ssY);
      ctx.scale(breath, breath);
      ctx.rotate(wob);
      ctx.translate(0, -FIGHTER_H);
    }
    ctx.translate(0, FIGHTER_H);
    ctx.rotate(pose.lean + (ghost ? 0 : f.bodyRoll));
    // Yaw turn: fake a 3D pivot around the spine. Pose is computed in the rendered
    // facing (sign of facingT). We:
    //  - scale X by |facingT| (perspective foreshortening as the torso rotates)
    //  - skew slightly so the leading edge of the body slips forward (depth cue)
    //  - tilt vertically a hair so the chest pitches with the spin (no paper-flat look)
    // Floor the magnitude so the silhouette never fully collapses to a line.
    if (!ghost) {
      const t = f.facingT;
      const mag = Math.abs(t);
      const yawMag = 0.22 + 0.78 * mag;            // 0.22..1
      const turnAmt = 1 - mag;                     // 0..1, peaks mid-turn
      // Skew direction: lead with the new facing
      const skew = (f.facing) * turnAmt * 0.18;    // radians-ish (canvas matrix uses tan)
      const ysquash = 1 - turnAmt * 0.06;          // small vertical settle
      // Apply a single matrix: [yawMag, 0, skew, ysquash, 0, 0]
      ctx.transform(yawMag, 0, Math.tan(skew * 0.6) * 0.4, ysquash, 0, 0);
    }
    ctx.translate(0, -FIGHTER_H);

    const headR = 12;
    const headY = headR + 2 + pose.headOffsetY;
    const shoulderY = pose.shoulderY;
    const hipY = pose.hipY;

    const bodyColor = f.hitFlash > 0 && !ghost ? "oklch(0.95 0.20 30)" : skin.body;
    const limbColor = skin.limb ?? bodyColor;
    const headColor = skin.head ?? bodyColor;

    if (f.onGround && !ghost && f.ragdollT <= 0) {
      // Soft contact light pool — grounds the character without a hard
      // disc shadow (the disc was reading as a floating UFO under the feet).
      if (!this.lowPower) {
        const grad = ctx.createRadialGradient(0, FIGHTER_H - 1, 1, 0, FIGHTER_H - 1, 28);
        grad.addColorStop(0, `color-mix(in oklab, ${skin.glow} 28%, transparent)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, FIGHTER_H - 1, 28, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (skin.cape) {
      ctx.save();
      // Counter-rotate the cape so it hangs/trails in WORLD space (gravity + wind),
      // not perpendicular to a pitched body. We pivot at the shoulders.
      const bodyAngle = pose.lean + (ghost ? 0 : f.bodyRoll);
      ctx.translate(0, shoulderY - 2);
      ctx.rotate(-bodyAngle);
      // Cape's own hang angle in world space: gravity pulls down, wind pushes
      // opposite the facing direction proportional to speed.
      const windAngle = -f.facing * Math.min(0.9, Math.abs(f.vx) / 520) + (f.flying ? -f.facing * 0.15 : 0);
      ctx.rotate(windAngle);
      ctx.translate(0, -(shoulderY - 2));

      const wobble = Math.sin(f.walkPhase * 0.6) * 2;
      const sw = f.capeSwingX + wobble;        // bottom horizontal sway (spring)
      const swMid = sw * 0.55;                 // anchored near shoulders
      const lift = f.capeLift * 14;            // raises bottom edge in flight/sprints
      const curl = -Math.sign(sw) * Math.min(6, Math.abs(sw) * 0.35); // trailing whip curl
      ctx.fillStyle = skin.cape;
      ctx.beginPath();
      ctx.moveTo(-7, shoulderY - 2);
      ctx.lineTo(7, shoulderY - 2);
      ctx.quadraticCurveTo(11 + swMid, hipY + 22 - lift * 0.4, 5 + sw + curl, hipY + 40 - lift);
      ctx.lineTo(-5 + sw + curl, hipY + 40 - lift);
      ctx.quadraticCurveTo(-11 + swMid, hipY + 22 - lift * 0.4, -7, shoulderY - 2);
      ctx.fill();
      if (skin.capeAccent) {
        ctx.fillStyle = skin.capeAccent;
        ctx.fillRect(-1.5 + swMid * 0.5, shoulderY, 3, hipY + 36 - shoulderY - lift * 0.6);
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

    // ---- Nightcrawler tail: long whippy curl behind the hip ----
    if (skin.id === "nightcrawler" && !ghost) {
      ctx.save();
      const t = this.elapsed + (f.id === "p1" ? 0 : 1.3);
      const back = -f.facing;
      const moving = Math.min(1, Math.abs(f.vx) / 240);
      const sway = Math.sin(t * 3.2) * (4 + moving * 6) + back * (8 + moving * 6);
      const sway2 = Math.sin(t * 4.6 + 1.1) * (3 + moving * 4);
      // Anchor at lower spine just above the hip.
      const ax = back * 2;
      const ay = pose.hipY - 2;
      // Three control points for a snake-like curl.
      const c1x = back * 14 + sway * 0.4;
      const c1y = pose.hipY + 14;
      const c2x = back * 26 + sway;
      const c2y = pose.hipY + 26 + sway2 * 0.3;
      const tipX = back * 36 + sway * 1.4;
      const tipY = pose.hipY + 12 + sway2;     // tip curls back upward
      // Outline pass
      ctx.strokeStyle = "oklch(0.10 0.02 250)";
      ctx.lineCap = "round";
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
      ctx.stroke();
      // Main stroke
      ctx.strokeStyle = skin.body;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
      ctx.stroke();
      // Spade tip
      ctx.fillStyle = skin.body;
      ctx.beginPath();
      ctx.ellipse(tipX + back * 2, tipY, 4.5, 2.6, Math.atan2(tipY - c2y, tipX - c2x), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ---- Size-driven dimensions ----
    // Match the SkinPicker preview look: slim stickman lines, no chunky
    // outline pass. Iconic accents (cape, ears, mask, emblem) layer on top.
    const baseW = skin.thickBody ? 5 : 4;
    const lowerW = baseW;                                            // uniform stroke like preview
    const torsoW = skin.thickBody ? 7 : 5;
    const overlap = 0;

    // ---- Curvature: facing-anchored sign, velocity / state amplitude ----
    const speedNorm = Math.min(1, Math.abs(f.vx) / 210);
    const flexAmt = 0.35
      + 0.45 * speedNorm
      + (f.attackAnim > 0 ? 0.35 : 0)
      + (f.flying ? 0.25 : 0);
    const flexBase = baseW * 0.30 * flexAmt;
    const fSign = f.facingT >= 0 ? 1 : -1;
    // arms bow outward, legs bow inward — sign anchored to facing, never to limb vector
    const dirArmL = -1 * fSign;
    const dirArmR =  1 * fSign;
    const dirLegL =  1 * fSign;
    const dirLegR = -1 * fSign;

    const drawAllLimbs = (uW: number, lW: number, withFlex: boolean) => {
      const m = withFlex ? flexBase : 0;
      drawLimb(ctx, pose.legL, uW, lW, dirLegL, m, overlap);
      drawLimb(ctx, pose.legR, uW, lW, dirLegR, m, overlap);
      drawLimb(ctx, pose.armL, uW, lW, dirArmL, m, overlap);
      drawLimb(ctx, pose.armR, uW, lW, dirArmR, m, overlap);
    };

    // ---- Outer glow pass (subtle accent, no dark outline) ----
    if (!this.lowPower && !ghost) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = skin.glow;
      ctx.strokeStyle = `color-mix(in oklab, ${skin.glow} 60%, transparent)`;
      ctx.globalAlpha = 0.4;
      const gW = baseW + 1.5;
      drawAllLimbs(gW, gW, true);
      ctx.beginPath(); ctx.moveTo(0, shoulderY); ctx.lineTo(0, hipY); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ---- Main limb stroke ----
    ctx.strokeStyle = limbColor;
    drawAllLimbs(baseW, lowerW, true);

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

    // Torso (uses sized torsoW)
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = torsoW;
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

    // Tiny shoulder caps (hidden under outline). Hip cap removed — overlap covers it.
    ctx.fillStyle = limbColor;
    const jr = baseW * 0.32;
    ctx.beginPath(); ctx.arc(-4, shoulderY, jr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, shoulderY, jr, 0, Math.PI * 2); ctx.fill();

    if (skin.emblem) {
      const ey = (shoulderY + hipY) / 2;
      ctx.fillStyle = skin.emblem.color;
      ctx.strokeStyle = skin.emblem.color;
      drawEmblem(ctx, skin.emblem, ey, shoulderY, hipY);
    }

    // Head: fill disc first, then proportional rim. Highlight follows below.
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

    // Crowbar prop removed with legacy procedural attack rig.

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
    case "spiderman":
      return {
        power1: { name: "Web Snare", cd: WEB_SNARE_CD },
        power2: { name: "Web Swing", cd: 0.5 },
      };
    default:
      return {};
  }
}

// Draw a limb as two tapered segments with optional torso-overlap and a perpendicular
// curvature nudge applied to the elbow. Pass upperW=lowerW for a uniform stroke
// (used by the outline pass with a wider width). When upperW===lowerW we draw a
// single quadratic so the rim has no width discontinuity.
function drawLimb(
  ctx: CanvasRenderingContext2D,
  j: [number, number, number, number, number, number],
  upperW?: number,
  lowerW?: number,
  flexDir = 0,
  flexMag = 0,
  overlap = 0,
) {
  let sx = j[0], sy = j[1];
  const ex = j[2], ey = j[3];
  const hx = j[4], hy = j[5];

  // Overlap into the torso along the start->elbow direction.
  if (overlap > 0) {
    const dx = ex - sx, dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    sx -= (dx / len) * overlap;
    sy -= (dy / len) * overlap;
  }

  // Perpendicular nudge to elbow control point. Direction sign comes from caller
  // (facing-anchored), magnitude is velocity/state-modulated. Perp is taken from
  // the start->hand vector so the curve always bows along the limb's axis.
  let cx = ex, cy = ey;
  if (flexMag !== 0 && flexDir !== 0) {
    const vx = hx - sx, vy = hy - sy;
    const vlen = Math.hypot(vx, vy) || 1;
    const px = -vy / vlen, py = vx / vlen;
    cx = ex + px * flexMag * flexDir;
    cy = ey + py * flexMag * flexDir;
  }

  if (upperW == null || lowerW == null || Math.abs(upperW - lowerW) < 0.05) {
    // Uniform stroke (outline / glow / highlight passes use this).
    if (upperW != null) ctx.lineWidth = upperW;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, hx, hy);
    ctx.stroke();
    return;
  }

  // Tapered: split at elbow, stroke upper segment full width, lower thinner.
  // We approximate by re-using the same quadratic but stopping/starting at the
  // midpoint of the curve (the point on the curve at t=0.5).
  const t = 0.5;
  const midX = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * hx;
  const midY = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * hy;

  // Upper half: start -> mid, with elbow control.
  ctx.lineWidth = upperW;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, midX, midY);
  ctx.stroke();

  // Lower half: mid -> hand, same elbow control gives a continuous tangent.
  ctx.lineWidth = lowerW;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.quadraticCurveTo(cx, cy, hx, hy);
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
