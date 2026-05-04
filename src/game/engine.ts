// Stickman Neon Duel — Canvas 2D engine
// Pure client-side, no external deps.

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
  onGround: boolean;
  hp: number;
  hitFlash: number;
  fireCd: number;
  teleCd: number;
  teleporting: boolean;
  color: string;
  glow: string;
  name: string;
  walkPhase: number;
  attackAnim: number;
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

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
const GRAVITY = 1800;
const MOVE_SPEED = 320;
const JUMP_V = 720;
const FIGHTER_H = 90;
const FIGHTER_W = 30;

const FIRE_CD = 0.8;
const TELE_CD = 4.0;
const FIRE_DAMAGE = 12;
const FIRE_KNOCKBACK = 380;

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private last = 0;
  private raf = 0;
  private running = false;

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
  private prevIntents: Record<PlayerId, Intents> = {
    p1: { left: false, right: false, jump: false, fire: false, teleport: false },
    p2: { left: false, right: false, jump: false, fire: false, teleport: false },
  };

  // Teleport targeting
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

  reset() {
    this.p1 = this.makeFighter("p1", 260, "Hero", "oklch(0.85 0.18 210)", "oklch(0.75 0.22 215)");
    this.p2 = this.makeFighter("p2", 1020, "Villain", "oklch(0.72 0.28 340)", "oklch(0.65 0.30 345)");
    this.p2.facing = -1;
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

  private makeFighter(id: PlayerId, x: number, name: string, color: string, glow: string): Fighter {
    return {
      id,
      x,
      y: GROUND_Y - FIGHTER_H,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      hp: 100,
      hitFlash: 0,
      fireCd: 0,
      teleCd: 0,
      teleporting: false,
      color,
      glow,
      name,
      walkPhase: 0,
      attackAnim: 0,
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

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setIntent(p: PlayerId, intent: Partial<Intents>) {
    Object.assign(this.intents[p], intent);
  }

  // For touch buttons: discrete press
  pressFire(p: PlayerId) { this.intents[p].fire = true; }
  pressTeleport(p: PlayerId) { this.intents[p].teleport = true; }
  pressJump(p: PlayerId) { this.intents[p].jump = true; }

  // Click/tap on canvas — used for teleport target
  handlePointer(canvasX: number, canvasY: number) {
    if (!this.teleTargeting) return;
    const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
    const rect = this.canvas.getBoundingClientRect();
    const sx = (canvasX) * (W / rect.width);
    const sy = (canvasY) * (H / rect.height);
    // burst at old pos
    this.burst(f.x, f.y + FIGHTER_H / 2, f.glow, 24);
    f.x = Math.max(40, Math.min(W - 40, sx));
    f.y = Math.max(40, Math.min(GROUND_Y - FIGHTER_H, sy - FIGHTER_H / 2));
    f.vx = 0;
    f.vy = 0;
    f.teleporting = false;
    this.burst(f.x, f.y + FIGHTER_H / 2, f.glow, 32);
    this.teleTargeting = null;
    this.slowmoT = 0;
    this.emit();
  }

  isTeleTargeting() { return this.teleTargeting; }

  private update(dt: number) {
    // Slow-mo while targeting teleport
    const timeScale = this.slowmoT > 0 ? 0.15 : 1;
    const sdt = dt * timeScale;
    this.slowmoT = Math.max(0, this.slowmoT - dt);

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) this.phase = "fight";
    }

    // Ambient particles
    if (Math.random() < 0.4) {
      this.particles.push({
        x: Math.random() * W,
        y: H,
        vx: (Math.random() - 0.5) * 10,
        vy: -20 - Math.random() * 30,
        life: 4,
        maxLife: 4,
        color: Math.random() > 0.5 ? "oklch(0.75 0.22 215)" : "oklch(0.65 0.30 345)",
        size: 1 + Math.random() * 1.5,
      });
    }

    if (this.phase === "fight") {
      this.updateFighter(this.p1, sdt);
      this.updateFighter(this.p2, sdt);
      // Auto-face opponent
      this.p1.facing = this.p2.x > this.p1.x ? 1 : -1;
      this.p2.facing = this.p1.x > this.p2.x ? 1 : -1;
    }

    // Projectiles
    for (const pr of this.projectiles) {
      pr.x += pr.vx * sdt;
      pr.y += pr.vy * sdt;
      pr.life -= dt;
      // Trail
      this.particles.push({
        x: pr.x, y: pr.y,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        life: 0.4, maxLife: 0.4,
        color: pr.glow, size: 3,
      });
    }
    // Hit detection
    for (const pr of this.projectiles) {
      const target = pr.owner === "p1" ? this.p2 : this.p1;
      if (this.phase !== "fight") continue;
      if (Math.abs(pr.x - target.x) < FIGHTER_W && pr.y > target.y && pr.y < target.y + FIGHTER_H) {
        target.hp = Math.max(0, target.hp - FIRE_DAMAGE);
        target.hitFlash = 0.25;
        target.vx += Math.sign(pr.vx) * FIRE_KNOCKBACK;
        target.vy = -260;
        target.onGround = false;
        this.shake = 14;
        this.burst(pr.x, pr.y, pr.glow, 18);
        pr.life = 0;
        if (target.hp <= 0 && this.phase === "fight") {
          this.phase = "ko";
          this.winner = pr.owner;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -50 && p.x < W + 50);

    // Particles
    for (const p of this.particles) {
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    this.shake = Math.max(0, this.shake - dt * 40);

    // Snapshot for UI
    this.emit();

    // Track prev intents (for edge-triggered keyboard fire/teleport we use press flags)
    for (const id of ["p1", "p2"] as PlayerId[]) {
      this.prevIntents[id] = { ...this.intents[id] };
      // consume one-shot presses
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
    f.vx = move * MOVE_SPEED + f.vx * 0.85; // friction blend after knockback
    if (Math.abs(f.vx) < 5 && move === 0) f.vx = 0;

    if (intent.jump && f.onGround) {
      f.vy = -JUMP_V;
      f.onGround = false;
    }

    if (intent.fire && f.fireCd <= 0 && !f.teleporting) {
      this.fire(f);
    }
    if (intent.teleport && f.teleCd <= 0 && !f.teleporting && this.teleTargeting === null) {
      f.teleporting = true;
      f.teleCd = TELE_CD;
      this.teleTargeting = f.id;
      this.slowmoT = 5; // give them time
    }

    if (move !== 0 && f.onGround) f.walkPhase += dt * 12;

    // Physics
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // Walls
    if (f.x < 30) { f.x = 30; f.vx = 0; }
    if (f.x > W - 30) { f.x = W - 30; f.vx = 0; }

    // Ground
    if (f.y + FIGHTER_H >= GROUND_Y) {
      f.y = GROUND_Y - FIGHTER_H;
      f.vy = 0;
      f.onGround = true;
    } else {
      f.onGround = false;
    }

    // Platforms (one-way from above)
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
        f.y = pl.y - FIGHTER_H;
        f.vy = 0;
        f.onGround = true;
      }
    }
  }

  private fire(f: Fighter) {
    f.fireCd = FIRE_CD;
    f.attackAnim = 0.2;
    const speed = 720;
    this.projectiles.push({
      owner: f.id,
      x: f.x + f.facing * 30,
      y: f.y + 35,
      vx: f.facing * speed,
      vy: 0,
      life: 2,
      color: "oklch(0.85 0.18 50)",
      glow: "oklch(0.75 0.22 45)",
    });
    this.shake = 4;
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 220;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6, maxLife: 0.6,
        color, size: 2 + Math.random() * 2,
      });
    }
  }

  private emit() {
    this.onSnapshot?.({
      p1: this.snapPlayer(this.p1),
      p2: this.snapPlayer(this.p2),
      winner: this.winner,
      phase: this.phase,
      slowmo: this.slowmoT > 0,
    });
  }

  private snapPlayer(f: Fighter): PlayerState {
    return {
      id: f.id,
      name: f.name,
      hp: f.hp,
      maxHp: 100,
      fireCd: f.fireCd,
      fireCdMax: FIRE_CD,
      teleCd: f.teleCd,
      teleCdMax: TELE_CD,
      teleporting: f.teleporting,
    };
  }

  // ---------- RENDER ----------
  private render() {
    const ctx = this.ctx;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, sx, sy);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "oklch(0.10 0.05 275)");
    grad.addColorStop(1, "oklch(0.18 0.08 280)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Grid horizon
    ctx.strokeStyle = "oklch(0.35 0.15 280 / 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = GROUND_Y + i * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.globalAlpha = 1 - i / 12;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Horizon line
    ctx.shadowBlur = 24;
    ctx.shadowColor = "oklch(0.75 0.22 215)";
    ctx.strokeStyle = "oklch(0.85 0.18 210)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Particles (ambient + bursts)
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
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

    // Fighters
    this.drawFighter(this.p1);
    this.drawFighter(this.p2);

    // Projectiles
    ctx.globalCompositeOperation = "lighter";
    for (const pr of this.projectiles) {
      ctx.shadowBlur = 28;
      ctx.shadowColor = pr.glow;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";

    // Teleport targeting overlay
    if (this.teleTargeting) {
      ctx.fillStyle = "oklch(0.1 0.05 275 / 0.45)";
      ctx.fillRect(0, 0, W, H);
      const f = this.teleTargeting === "p1" ? this.p1 : this.p2;
      ctx.shadowBlur = 30;
      ctx.shadowColor = f.glow;
      ctx.strokeStyle = f.color;
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
    const cx = f.x;
    const top = f.y;
    const headR = 10;
    const headY = top + headR + 2;
    const neckY = headY + headR;
    const hipY = top + 55;
    const feetY = top + FIGHTER_H;

    const swing = Math.sin(f.walkPhase) * 14;
    const armSwing = Math.sin(f.walkPhase) * 18;
    const attacking = f.attackAnim > 0;

    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = f.glow;
    ctx.strokeStyle = f.hitFlash > 0 ? "oklch(0.95 0.2 30)" : f.color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";

    // Head
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(cx, neckY);
    ctx.lineTo(cx, hipY);
    ctx.stroke();

    // Arms
    const armY = neckY + 8;
    if (attacking) {
      ctx.beginPath();
      ctx.moveTo(cx, armY);
      ctx.lineTo(cx + f.facing * 28, armY - 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, armY);
      ctx.lineTo(cx - 14, armY + 18 + armSwing);
      ctx.moveTo(cx, armY);
      ctx.lineTo(cx + 14, armY + 18 - armSwing);
      ctx.stroke();
    }

    // Legs
    if (f.onGround) {
      ctx.beginPath();
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx - 10 + swing, feetY);
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx + 10 - swing, feetY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx - 12, feetY - 8);
      ctx.moveTo(cx, hipY);
      ctx.lineTo(cx + 12, feetY - 8);
      ctx.stroke();
    }

    ctx.restore();
  }
}
