// Stickman Neon Duel — Canvas 2D engine v2
// Animated maps + hero skins + smooth walk cycle.

import { computeWalkPose } from "./animation";
import { getMap, type MapId } from "./maps";
import { getSkin, type Skin, type SkinId } from "./skins";

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
  teleporting: boolean;
}

export interface GameSnapshot {
  p1: PlayerState;
  p2: PlayerState;
  winner: PlayerId | null;
  phase: "intro" | "fight" | "ko";
  slowmo: boolean;
}

interface Fighter {
  id: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  facingT: number; // smoothed facing for lean
  onGround: boolean;
  hp: number;
  hitFlash: number;
  fireCd: number;
  teleCd: number;
  teleporting: boolean;
  name: string;
  walkPhase: number;
  attackAnim: number;
  skin: Skin;
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

interface Platform { x: number; y: number; w: number; h: number; }

export interface Intents {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  teleport: boolean;
}

const W = 1280;
const H = 720;
const GROUND_Y = 600;
const GRAVITY = 1500;
const MOVE_SPEED = 210;
const ACCEL = 1400;
const FRICTION = 1600;
const JUMP_V = 620;
const FIGHTER_H = 90;
const FIGHTER_W = 30;

const FIRE_CD = 0.8;
const TELE_CD = 4.0;
const FIRE_DAMAGE = 12;
const FIRE_KNOCKBACK = 320;

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private last = 0;
  private raf = 0;
  private running = false;
  private elapsed = 0;
  private lowPower = false;
  private snapAccum = 0;

  private mapId: MapId = "neon-city";
  private p1Skin: SkinId = "spiderman";
  private p2Skin: SkinId = "homelander";

  private p1!: Fighter;
  private p2!: Fighter;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private platforms: Platform[] = [
    { x: 280, y: 440, w: 220, h: 12 },
    { x: 780, y: 440, w: 220, h: 12 },
  ];

  private intents: Record<PlayerId, Intents> = {
    p1: { left: false, right: false, jump: false, fire: false, teleport: false },
    p2: { left: false, right: false, jump: false, fire: false, teleport: false },
  };

  private teleTargeting: PlayerId | null = null;
  private slowmoT = 0;

  private shake = 0;
  private introT = 1.5;
  private phase: "intro" | "fight" | "ko" = "intro";
  private winner: PlayerId | null = null;

  public onSnapshot: ((s: GameSnapshot) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    this.ctx = ctx;
    this.reset();
  }

  configure(mapId: MapId, p1Skin: SkinId, p2Skin: SkinId) {
    this.mapId = mapId;
    this.p1Skin = p1Skin;
    this.p2Skin = p2Skin;
    this.reset();
  }

  reset() {
    this.p1 = this.makeFighter("p1", 260, getSkin(this.p1Skin));
    this.p2 = this.makeFighter("p2", 1020, getSkin(this.p2Skin));
    this.p2.facing = -1; this.p2.facingT = -1;
    this.projectiles = [];
    this.particles = [];
    this.teleTargeting = null;
    this.slowmoT = 0;
    this.shake = 0;
    this.introT = 1.2;
    this.phase = "intro";
    this.winner = null;
    this.emit();
  }

  private makeFighter(id: PlayerId, x: number, skin: Skin): Fighter {
    return {
      id, x, y: GROUND_Y - FIGHTER_H,
      vx: 0, vy: 0, facing: 1, facingT: 1,
      onGround: true, hp: 100, hitFlash: 0,
      fireCd: 0, teleCd: 0, teleporting: false,
      name: skin.name,
      walkPhase: 0, attackAnim: 0, skin,
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
  pressJump(p: PlayerId) { this.intents[p].jump = true; }

  handlePointer(canvasX: number, canvasY: number) {
    if (!this.teleTargeting) return;
    const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
    const rect = this.canvas.getBoundingClientRect();
    const sx = canvasX * (W / rect.width);
    const sy = canvasY * (H / rect.height);
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 24);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy - FIGHTER_H / 2));
    f.vx = 0; f.vy = 0; f.teleporting = false;
    this.burst(f.x, f.y + FIGHTER_H / 2, f.skin.glow, 32);
    this.teleTargeting = null; this.slowmoT = 0;
    this.emit();
  }

  isTeleTargeting() { return this.teleTargeting; }

  setLowPower(v: boolean) { this.lowPower = v; }

  private update(dt: number) {
    this.elapsed += dt;
    const timeScale = this.slowmoT > 0 ? 0.15 : 1;
    const sdt = dt * timeScale;
    this.slowmoT = Math.max(0, this.slowmoT - dt);

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) this.phase = "fight";
    }

    const ambientRate = this.lowPower ? 0.1 : 0.4;
    const maxParticles = this.lowPower ? 120 : 400;
    if (Math.random() < ambientRate && this.particles.length < maxParticles) {
      this.particles.push({
        x: Math.random() * W, y: H,
        vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 30,
        life: 4, maxLife: 4,
        color: Math.random() > 0.5 ? "oklch(0.75 0.22 215)" : "oklch(0.65 0.30 345)",
        size: 1 + Math.random() * 1.5,
      });
    }

    if (this.phase === "fight") {
      this.updateFighter(this.p1, sdt);
      this.updateFighter(this.p2, sdt);
      this.p1.facing = this.p2.x > this.p1.x ? 1 : -1;
      this.p2.facing = this.p1.x > this.p2.x ? 1 : -1;
    }
    // smooth facing
    for (const f of [this.p1, this.p2]) {
      f.facingT += (f.facing - f.facingT) * Math.min(1, dt * 8);
    }

    for (const pr of this.projectiles) {
      pr.x += pr.vx * sdt; pr.y += pr.vy * sdt; pr.life -= dt;
      if (!this.lowPower || Math.random() < 0.5) {
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
      if (Math.abs(pr.x - target.x) < FIGHTER_W && pr.y > target.y && pr.y < target.y + FIGHTER_H) {
        target.hp = Math.max(0, target.hp - FIRE_DAMAGE);
        target.hitFlash = 0.25;
        target.vx += Math.sign(pr.vx) * FIRE_KNOCKBACK;
        target.vy = -240;
        target.onGround = false;
        this.shake = 14;
        this.burst(pr.x, pr.y, pr.glow, 18);
        pr.life = 0;
        if (target.hp <= 0 && this.phase === "fight") {
          this.phase = "ko"; this.winner = pr.owner;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -50 && p.x < W + 50);

    for (const p of this.particles) { p.x += p.vx * sdt; p.y += p.vy * sdt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);

    this.shake = Math.max(0, this.shake - dt * 40);

    // Throttle React HUD updates to ~10 Hz
    this.snapAccum += dt;
    if (this.snapAccum >= 0.1 || this.phase !== "fight") {
      this.snapAccum = 0;
      this.emit();
    }

    for (const id of ["p1", "p2"] as PlayerId[]) {
      this.intents[id].fire = false;
      this.intents[id].teleport = false;
      this.intents[id].jump = false;
    }
  }

  private updateFighter(f: Fighter, dt: number) {
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.teleCd = Math.max(0, f.teleCd - dt);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    f.attackAnim = Math.max(0, f.attackAnim - dt);

    const intent = this.intents[f.id];
    let move = 0;
    if (intent.left) move -= 1;
    if (intent.right) move += 1;

    if (move !== 0) {
      const target = move * MOVE_SPEED;
      const a = ACCEL * dt;
      if (f.vx < target) f.vx = Math.min(target, f.vx + a);
      else if (f.vx > target) f.vx = Math.max(target, f.vx - a);
    } else {
      const fr = FRICTION * dt;
      if (f.vx > 0) f.vx = Math.max(0, f.vx - fr);
      else if (f.vx < 0) f.vx = Math.min(0, f.vx + fr);
    }

    if (intent.jump && f.onGround) { f.vy = -JUMP_V; f.onGround = false; }
    if (intent.fire && f.fireCd <= 0 && !f.teleporting) this.fire(f);
    if (intent.teleport && f.teleCd <= 0 && !f.teleporting && this.teleTargeting === null) {
      f.teleporting = true; f.teleCd = TELE_CD;
      this.teleTargeting = f.id; this.slowmoT = 5;
    }

    // walk phase advances based on horizontal speed
    if (f.onGround) {
      f.walkPhase += dt * (1.6 + Math.abs(f.vx) * 0.018);
    } else {
      f.walkPhase += dt * 1.2;
    }

    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    if (f.x < 30) { f.x = 30; f.vx = 0; }
    if (f.x > W - 30) { f.x = W - 30; f.vx = 0; }

    if (f.y + FIGHTER_H >= GROUND_Y) {
      f.y = GROUND_Y - FIGHTER_H; f.vy = 0; f.onGround = true;
    } else { f.onGround = false; }

    for (const pl of this.platforms) {
      const prevY = f.y - f.vy * dt;
      const feet = f.y + FIGHTER_H;
      const prevFeet = prevY + FIGHTER_H;
      if (
        f.vy >= 0 &&
        prevFeet <= pl.y + 2 &&
        feet >= pl.y &&
        f.x + FIGHTER_W / 2 > pl.x &&
        f.x - FIGHTER_W / 2 < pl.x + pl.w
      ) {
        f.y = pl.y - FIGHTER_H; f.vy = 0; f.onGround = true;
      }
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
    });
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

  private emit() {
    this.onSnapshot?.({
      p1: this.snapPlayer(this.p1),
      p2: this.snapPlayer(this.p2),
      winner: this.winner, phase: this.phase,
      slowmo: this.slowmoT > 0,
    });
  }
  private snapPlayer(f: Fighter): PlayerState {
    return {
      id: f.id, name: f.name,
      hp: f.hp, maxHp: 100,
      fireCd: f.fireCd, fireCdMax: FIRE_CD,
      teleCd: f.teleCd, teleCdMax: TELE_CD,
      teleporting: f.teleporting,
    };
  }

  // ---------------- RENDER ----------------
  private render() {
    const ctx = this.ctx;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, sx, sy);

    // Animated background
    getMap(this.mapId).drawBackground(ctx, this.elapsed, W, H, GROUND_Y);

    // Particles
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Platforms
    for (const pl of this.platforms) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = "oklch(0.75 0.22 215)";
      ctx.fillStyle = "oklch(0.4 0.15 230)";
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.shadowBlur = 0;
    }

    this.drawFighter(this.p1);
    this.drawFighter(this.p2);

    ctx.globalCompositeOperation = "lighter";
    for (const pr of this.projectiles) {
      ctx.shadowBlur = 28; ctx.shadowColor = pr.glow;
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";

    if (this.teleTargeting) {
      ctx.fillStyle = "oklch(0.1 0.05 275 / 0.45)";
      ctx.fillRect(0, 0, W, H);
      const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
      ctx.shadowBlur = 30; ctx.shadowColor = f.skin.glow;
      ctx.strokeStyle = f.skin.body;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(20, 20, W - 40, H - 40);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private drawFighter(f: Fighter) {
    const ctx = this.ctx;
    const skin = f.skin;
    const pose = computeWalkPose(
      f.walkPhase, f.vx, f.onGround, f.vy, f.attackAnim > 0, f.facing, FIGHTER_H,
    );

    ctx.save();
    // Origin at fighter top-center
    ctx.translate(f.x, f.y);
    // small body lean
    ctx.translate(0, FIGHTER_H);
    ctx.rotate(pose.lean);
    ctx.translate(0, -FIGHTER_H);

    const headR = 10;
    const headY = headR + 2 + pose.headOffsetY;
    const shoulderY = pose.shoulderY;
    const hipY = pose.hipY;

    const bodyColor = f.hitFlash > 0 ? "oklch(0.95 0.2 30)" : skin.body;
    const limbColor = skin.limb ?? bodyColor;

    // Cape (drawn behind torso)
    if (skin.cape) {
      ctx.save();
      const sway = Math.sin(f.walkPhase * 0.6) * 3 + (-f.facing) * Math.min(8, Math.abs(f.vx) * 0.05);
      ctx.shadowBlur = 14; ctx.shadowColor = skin.cape;
      ctx.fillStyle = skin.cape;
      ctx.beginPath();
      ctx.moveTo(-6, shoulderY - 2);
      ctx.lineTo(6, shoulderY - 2);
      ctx.quadraticCurveTo(10 + sway * f.facing, hipY + 18, 4 + sway * f.facing, hipY + 36);
      ctx.lineTo(-4 + sway * f.facing, hipY + 36);
      ctx.quadraticCurveTo(-10 + sway * f.facing, hipY + 18, -6, shoulderY - 2);
      ctx.fill();
      if (skin.capeAccent) {
        ctx.fillStyle = skin.capeAccent;
        ctx.fillRect(-2 + sway * f.facing * 0.5, shoulderY, 4, hipY + 32 - shoulderY);
      }
      ctx.restore();
    }

    // Speed streaks
    if (skin.streaks && Math.abs(f.vx) > 80 && f.onGround) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = skin.streaks;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = 0.6 - i * 0.15;
        ctx.globalAlpha = a;
        ctx.beginPath();
        const sx = -f.facing * (10 + i * 8);
        const ey = 30 + i * 12;
        ctx.moveTo(sx, ey);
        ctx.lineTo(sx - f.facing * 26, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.shadowBlur = 22;
    ctx.shadowColor = skin.glow;
    ctx.lineCap = "round";
    ctx.lineWidth = skin.thickBody ? 5 : 3.5;

    // Body (torso line)
    ctx.strokeStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(0, shoulderY);
    ctx.lineTo(0, hipY);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    // Cowl ears (Batman)
    if (skin.cowlEars) {
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(-headR + 2, headY - headR + 2);
      ctx.lineTo(-headR - 2, headY - headR - 8);
      ctx.lineTo(-2, headY - headR);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headR - 2, headY - headR + 2);
      ctx.lineTo(headR + 2, headY - headR - 8);
      ctx.lineTo(2, headY - headR);
      ctx.closePath(); ctx.fill();
    }

    // Glowing eyes (Homelander)
    if (skin.glowingEyes) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const flick = 0.6 + 0.4 * Math.sin(performance.now() * 0.02);
      ctx.shadowBlur = 14; ctx.shadowColor = skin.glowingEyes;
      ctx.fillStyle = skin.glowingEyes;
      ctx.globalAlpha = flick;
      ctx.beginPath(); ctx.arc(-3, headY, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, headY, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Beard (Butcher)
    if (skin.beard) {
      ctx.fillStyle = "oklch(0.15 0.02 60)";
      ctx.beginPath(); ctx.ellipse(0, headY + 4, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Spider eye patches
    if (skin.id === "spiderman") {
      ctx.fillStyle = "oklch(0.95 0.02 250)";
      ctx.beginPath(); ctx.ellipse(-4, headY - 1, 3, 2, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, headY - 1, 3, 2, 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // Emblem on chest
    if (skin.emblem) {
      const ey = (shoulderY + hipY) / 2;
      ctx.fillStyle = skin.emblem.color;
      ctx.shadowBlur = 12; ctx.shadowColor = skin.emblem.color;
      switch (skin.emblem.shape) {
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
          ctx.strokeStyle = skin.emblem.color; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-5, ey - 3); ctx.lineTo(5, ey + 3);
          ctx.moveTo(5, ey - 3); ctx.lineTo(-5, ey + 3);
          ctx.stroke();
          break;
      }
      ctx.shadowBlur = 22; ctx.shadowColor = skin.glow;
    }

    // Limbs
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = skin.thickBody ? 4.5 : 3.5;

    // legs
    drawLimb(ctx, pose.legL);
    drawLimb(ctx, pose.legR);
    // arms
    drawLimb(ctx, pose.armL);
    drawLimb(ctx, pose.armR);

    ctx.restore();
  }
}

function drawLimb(ctx: CanvasRenderingContext2D, j: [number, number, number, number, number, number]) {
  ctx.beginPath();
  ctx.moveTo(j[0], j[1]);
  ctx.lineTo(j[2], j[3]);
  ctx.lineTo(j[4], j[5]);
  ctx.stroke();
}
