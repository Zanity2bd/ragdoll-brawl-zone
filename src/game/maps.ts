// Animated battle maps — procedural canvas backgrounds.

export type MapId =
  | "neon-city" | "cyber-dojo" | "hells-arena"
  | "backstreet" | "car-park" | "temple" | "living-room"
  | "spaceship" | "space" | "rooftop-dusk" | "warehouse"
  | "subway" | "forest";

export type MapTone = "neon" | "dark";

export interface BattleMap {
  id: MapId;
  name: string;
  tagline: string;
  tone: MapTone;
  accent: string;
  drawBackground: (ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) => void;
}

// ---------------- Neon City ----------------
function drawNeonCity(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "oklch(0.12 0.08 290)");
  grad.addColorStop(0.6, "oklch(0.18 0.12 320)");
  grad.addColorStop(1, "oklch(0.10 0.06 275)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.shadowBlur = 30;
  ctx.shadowColor = "oklch(0.85 0.1 320)";
  ctx.fillStyle = "oklch(0.9 0.05 320)";
  ctx.beginPath(); ctx.arc(W * 0.78, 130, 50, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  const offB = (t * 8) % 80;
  ctx.fillStyle = "oklch(0.16 0.06 280)";
  for (let i = -1; i < 12; i++) {
    const x = i * 110 - offB;
    const h = 80 + ((i * 53) % 90);
    ctx.fillRect(x, GROUND_Y - h - 60, 70, h);
  }

  const offF = (t * 22) % 120;
  for (let i = -1; i < 12; i++) {
    const x = i * 120 - offF;
    const h = 140 + ((i * 91) % 130);
    ctx.fillStyle = "oklch(0.10 0.05 280)";
    ctx.fillRect(x, GROUND_Y - h, 100, h);
    ctx.fillStyle = `oklch(0.78 0.18 ${(i * 40) % 360} / 0.7)`;
    for (let wy = 0; wy < h - 20; wy += 20) {
      for (let wx = 8; wx < 92; wx += 18) {
        if (((i * 7 + wx + wy) % 5) === 0) {
          ctx.fillRect(x + wx, GROUND_Y - h + wy + 10, 6, 8);
        }
      }
    }
  }

  const bx = (W * 1.2 - (t * 60) % (W + 400));
  ctx.shadowBlur = 14; ctx.shadowColor = "oklch(0.75 0.25 20)";
  ctx.fillStyle = "oklch(0.65 0.25 25)";
  ctx.fillRect(bx, 200, 220, 36);
  ctx.shadowBlur = 0;

  ctx.shadowBlur = 14; ctx.shadowColor = "oklch(0.75 0.25 320)";
  ctx.strokeStyle = "oklch(0.8 0.22 320)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;
}

// ---------------- Cyber Dojo ----------------
function drawCyberDojo(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "oklch(0.18 0.06 30)");
  grad.addColorStop(1, "oklch(0.12 0.08 350)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "oklch(0.15 0.04 340)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W; x += 40) {
    const y = GROUND_Y - 120 - Math.sin(x * 0.008) * 60 - ((x * 13) % 40);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y); ctx.closePath(); ctx.fill();

  for (let i = 0; i < 8; i++) {
    const x = 60 + i * 170;
    const sway = Math.sin(t * 0.8 + i) * 6;
    ctx.strokeStyle = "oklch(0.22 0.06 150)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.quadraticCurveTo(x + sway, GROUND_Y - 200, x + sway * 2, GROUND_Y - 380); ctx.stroke();
  }

  const lanterns = [{ x: 180, y: 140 }, { x: 520, y: 100 }, { x: 880, y: 160 }, { x: 1140, y: 110 }];
  for (const L of lanterns) {
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + L.x);
    ctx.shadowBlur = 22 * pulse; ctx.shadowColor = "oklch(0.8 0.2 30)";
    ctx.fillStyle = `oklch(0.7 0.22 30 / ${pulse})`;
    ctx.beginPath(); ctx.ellipse(L.x, L.y, 22, 28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "oklch(0.4 0.05 280)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x, 0); ctx.lineTo(L.x, L.y - 28); ctx.stroke();
  }

  ctx.fillStyle = "oklch(0.85 0.15 0 / 0.7)";
  for (let i = 0; i < 12; i++) {
    const seed = i * 91.7;
    const x = (seed * 137 + t * 30 + Math.sin(t + i) * 40) % W;
    const y = (seed * 53 + t * 60) % (GROUND_Y - 20);
    ctx.fillRect(x, y, 4, 2);
  }

  ctx.shadowBlur = 12; ctx.shadowColor = "oklch(0.8 0.2 30)";
  ctx.strokeStyle = "oklch(0.85 0.18 25)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;
}

// ---------------- Hell's Arena ----------------
function drawHellsArena(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "oklch(0.10 0.06 25)");
  grad.addColorStop(0.7, "oklch(0.22 0.15 35)");
  grad.addColorStop(1, "oklch(0.35 0.22 45)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "oklch(0.13 0.04 30)";
  for (let i = 0; i < 5; i++) {
    const x = i * 280 + 60;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, GROUND_Y - 200);
    ctx.quadraticCurveTo(x + 80, GROUND_Y - 320, x + 160, GROUND_Y - 200);
    ctx.lineTo(x + 160, GROUND_Y);
    ctx.closePath(); ctx.fill();
  }

  for (let i = 0; i < 4; i++) {
    const cx = 200 + i * 280;
    const sway = Math.sin(t * 0.6 + i) * 18;
    ctx.strokeStyle = "oklch(0.4 0.02 60)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let s = 0; s < 12; s++) {
      const x = cx + sway * (s / 12);
      const y = s * 18;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 14; ctx.shadowColor = "oklch(0.85 0.22 50)";
  ctx.strokeStyle = `oklch(0.8 0.25 45 / ${0.6 + 0.4 * Math.sin(t * 2)})`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 220 + 30, GROUND_Y + 5);
    ctx.lineTo(i * 220 + 80, GROUND_Y + 30);
    ctx.lineTo(i * 220 + 140, GROUND_Y + 12);
    ctx.lineTo(i * 220 + 210, GROUND_Y + 40);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  for (let i = 0; i < 18; i++) {
    const seed = i * 73.3;
    const x = (seed * 191 + Math.sin(t + i) * 60) % W;
    const y = GROUND_Y - ((seed * 41 + t * 80) % (GROUND_Y - 20));
    const a = y / GROUND_Y;
    ctx.fillStyle = `oklch(0.85 0.22 ${40 + i % 20} / ${a})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const fbT = (t * 0.16) % 1;
  if (fbT < 0.4) {
    const fx = fbT / 0.4;
    const x = fx * W;
    const y = 200 + Math.sin(fx * Math.PI) * -120 + 100;
    ctx.shadowBlur = 18; ctx.shadowColor = "oklch(0.85 0.25 50)";
    ctx.fillStyle = "oklch(0.9 0.22 60)";
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.shadowBlur = 14; ctx.shadowColor = "oklch(0.85 0.25 45)";
  ctx.strokeStyle = "oklch(0.8 0.25 45)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;
}

// ============================================================
// DARK / REALISTIC MAPS — muted palette, minimal shadowBlur
// ============================================================

// Helper: solid fill rect
const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
};

// ---------------- Backstreet Town ----------------
function drawBackstreet(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "oklch(0.14 0.02 260)");
  g.addColorStop(1, "oklch(0.10 0.02 240)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // brick wall back
  ctx.fillStyle = "oklch(0.20 0.04 40)";
  ctx.fillRect(0, GROUND_Y - 360, W, 360);
  ctx.fillStyle = "oklch(0.16 0.03 40)";
  for (let y = GROUND_Y - 360; y < GROUND_Y; y += 22) {
    const off = ((y / 22) % 2) * 30;
    for (let x = -off; x < W; x += 60) ctx.fillRect(x, y, 56, 2);
    for (let x = -off; x < W; x += 60) ctx.fillRect(x + 28, y, 2, 22);
  }

  // dumpster
  rect(ctx, 120, GROUND_Y - 90, 160, 90, "oklch(0.22 0.05 150)");
  rect(ctx, 120, GROUND_Y - 100, 160, 12, "oklch(0.28 0.05 150)");

  // streetlamp with flicker
  const flick = (Math.sin(t * 13) + Math.sin(t * 7.3)) * 0.5;
  const on = flick > -0.6 ? 1 : 0.2;
  rect(ctx, 900, GROUND_Y - 320, 6, 320, "oklch(0.22 0.01 60)");
  rect(ctx, 900, GROUND_Y - 320, 80, 6, "oklch(0.22 0.01 60)");
  ctx.shadowBlur = 18 * on; ctx.shadowColor = "oklch(0.85 0.12 80)";
  ctx.fillStyle = `oklch(0.78 0.12 80 / ${0.5 + 0.5 * on})`;
  ctx.beginPath(); ctx.arc(975, GROUND_Y - 312, 10, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // light cone
  ctx.fillStyle = `oklch(0.75 0.1 80 / ${0.08 * on})`;
  ctx.beginPath();
  ctx.moveTo(975, GROUND_Y - 305);
  ctx.lineTo(975 - 80, GROUND_Y);
  ctx.lineTo(975 + 80, GROUND_Y);
  ctx.closePath(); ctx.fill();

  // rain
  ctx.strokeStyle = "oklch(0.55 0.02 240 / 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const seed = i * 47.3;
    const x = (seed * 91 + t * 60) % W;
    const y = (seed * 31 + t * 700) % H;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); ctx.stroke();
  }

  // wet ground line
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.30 0.02 240)");
}

// ---------------- Underground Car Park ----------------
function drawCarPark(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  ctx.fillStyle = "oklch(0.16 0.005 240)"; ctx.fillRect(0, 0, W, H);

  // ceiling
  rect(ctx, 0, 0, W, 60, "oklch(0.20 0.005 240)");
  // pillars
  for (let i = 0; i < 5; i++) {
    const x = 100 + i * 280;
    rect(ctx, x, 60, 70, GROUND_Y - 60, "oklch(0.22 0.005 240)");
    rect(ctx, x - 6, 60, 82, 14, "oklch(0.26 0.005 240)");
    rect(ctx, x - 6, GROUND_Y - 14, 82, 14, "oklch(0.18 0.005 240)");
  }

  // parked cars (silhouettes)
  for (let i = 0; i < 3; i++) {
    const x = 220 + i * 360;
    rect(ctx, x, GROUND_Y - 60, 180, 50, "oklch(0.12 0.01 260)");
    rect(ctx, x + 30, GROUND_Y - 90, 120, 30, "oklch(0.12 0.01 260)");
    ctx.fillStyle = "oklch(0.08 0 0)";
    ctx.beginPath(); ctx.arc(x + 35, GROUND_Y - 10, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 145, GROUND_Y - 10, 14, 0, Math.PI * 2); ctx.fill();
  }

  // swinging fluorescent tube
  const sway = Math.sin(t * 0.9) * 0.08;
  const flick = Math.sin(t * 31) > 0.85 ? 0.4 : 1;
  ctx.save();
  ctx.translate(W * 0.5, 60);
  ctx.rotate(sway);
  ctx.strokeStyle = "oklch(0.30 0.005 240)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-30, 30); ctx.moveTo(30, 0); ctx.lineTo(30, 30); ctx.stroke();
  rect(ctx, -90, 30, 180, 10, "oklch(0.40 0.005 240)");
  ctx.shadowBlur = 12; ctx.shadowColor = "oklch(0.9 0.02 240)";
  ctx.fillStyle = `oklch(0.92 0.02 240 / ${0.7 * flick})`;
  ctx.fillRect(-86, 33, 172, 4);
  ctx.shadowBlur = 0;
  ctx.restore();

  // fog band
  ctx.fillStyle = `oklch(0.30 0.005 240 / 0.18)`;
  ctx.fillRect(0, GROUND_Y - 40, W, 40);

  // ground oil streaks
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.10 0.005 240)");
  ctx.fillStyle = "oklch(0.06 0 0 / 0.4)";
  for (let i = 0; i < 6; i++) ctx.fillRect((i * 200 + 80), GROUND_Y + 4, 80, 4);
}

// ---------------- Forgotten Temple ----------------
function drawTemple(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "oklch(0.16 0.02 60)");
  g.addColorStop(1, "oklch(0.10 0.02 50)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // back wall
  rect(ctx, 0, 0, W, GROUND_Y, "oklch(0.14 0.015 60)");

  // shafts of light
  for (let i = 0; i < 3; i++) {
    const x = 200 + i * 380;
    ctx.fillStyle = "oklch(0.85 0.06 80 / 0.05)";
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + 60, 0);
    ctx.lineTo(x + 140, GROUND_Y); ctx.lineTo(x - 20, GROUND_Y);
    ctx.closePath(); ctx.fill();
  }

  // columns
  for (let i = 0; i < 4; i++) {
    const x = 80 + i * 360;
    rect(ctx, x, 60, 70, GROUND_Y - 60, "oklch(0.22 0.02 60)");
    rect(ctx, x - 10, 60, 90, 18, "oklch(0.26 0.02 60)");
    rect(ctx, x - 10, GROUND_Y - 18, 90, 18, "oklch(0.20 0.02 60)");
    // cracks
    ctx.strokeStyle = "oklch(0.10 0.01 40)"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, 80); ctx.lineTo(x + 30, 200); ctx.lineTo(x + 22, 350);
    ctx.stroke();
  }

  // hanging vines swaying
  for (let i = 0; i < 6; i++) {
    const x = 60 + i * 220;
    const sway = Math.sin(t * 0.5 + i) * 8;
    ctx.strokeStyle = "oklch(0.28 0.06 150)"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sway, 100, x + sway * 1.5, 220);
    ctx.stroke();
  }

  // dust motes
  ctx.fillStyle = "oklch(0.85 0.04 80 / 0.35)";
  for (let i = 0; i < 14; i++) {
    const seed = i * 53.7;
    const x = (seed * 137 + Math.sin(t * 0.3 + i) * 30) % W;
    const y = (seed * 71 + t * 12) % GROUND_Y;
    ctx.fillRect(x, y, 2, 2);
  }

  // cracked floor
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.20 0.02 60)");
  ctx.strokeStyle = "oklch(0.08 0.01 40)"; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 160 + 20, GROUND_Y + 8);
    ctx.lineTo(i * 160 + 60, GROUND_Y + 24);
    ctx.lineTo(i * 160 + 110, GROUND_Y + 10);
    ctx.stroke();
  }
}

// ---------------- Suburban Living Room ----------------
function drawLivingRoom(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  // wall
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, "oklch(0.22 0.02 80)");
  g.addColorStop(1, "oklch(0.16 0.02 70)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);
  // floor
  rect(ctx, 0, GROUND_Y, W, H - GROUND_Y, "oklch(0.14 0.03 50)");
  // wood floor lines
  ctx.strokeStyle = "oklch(0.10 0.02 40)"; ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(i * 130, GROUND_Y); ctx.lineTo(i * 130 + 40, H); ctx.stroke();
  }

  // wainscot
  rect(ctx, 0, GROUND_Y - 80, W, 6, "oklch(0.30 0.02 80)");
  rect(ctx, 0, GROUND_Y - 80, W, 80, "oklch(0.18 0.02 70)");

  // framed pictures
  for (let i = 0; i < 3; i++) {
    const x = 140 + i * 280;
    rect(ctx, x, 120, 110, 80, "oklch(0.28 0.03 60)");
    rect(ctx, x + 6, 126, 98, 68, "oklch(0.16 0.04 250)");
  }

  // TV with static
  const tvX = W * 0.58, tvY = 200;
  rect(ctx, tvX, tvY, 240, 150, "oklch(0.08 0 0)");
  // static
  for (let i = 0; i < 50; i++) {
    const x = tvX + 6 + Math.random() * 228;
    const y = tvY + 6 + Math.random() * 138;
    ctx.fillStyle = `oklch(${0.4 + Math.random() * 0.5} 0.01 240 / 0.7)`;
    ctx.fillRect(x, y, 3, 2);
  }
  // tv glow on wall
  const glow = 0.5 + 0.5 * Math.sin(t * 6);
  ctx.fillStyle = `oklch(0.7 0.05 240 / ${0.08 * glow})`;
  ctx.fillRect(tvX - 60, tvY - 40, 360, 240);

  // sofa
  rect(ctx, 120, GROUND_Y - 110, 360, 110, "oklch(0.20 0.03 30)");
  rect(ctx, 100, GROUND_Y - 130, 30, 130, "oklch(0.22 0.03 30)");
  rect(ctx, 470, GROUND_Y - 130, 30, 130, "oklch(0.22 0.03 30)");
  rect(ctx, 140, GROUND_Y - 90, 100, 30, "oklch(0.26 0.03 30)");
  rect(ctx, 250, GROUND_Y - 90, 100, 30, "oklch(0.26 0.03 30)");
  rect(ctx, 360, GROUND_Y - 90, 100, 30, "oklch(0.26 0.03 30)");

  // floor lamp
  rect(ctx, W - 180, GROUND_Y - 280, 4, 280, "oklch(0.30 0.01 60)");
  ctx.fillStyle = "oklch(0.55 0.08 80)";
  ctx.beginPath();
  ctx.moveTo(W - 220, GROUND_Y - 280);
  ctx.lineTo(W - 140, GROUND_Y - 280);
  ctx.lineTo(W - 160, GROUND_Y - 240);
  ctx.lineTo(W - 200, GROUND_Y - 240);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "oklch(0.85 0.1 80 / 0.12)";
  ctx.beginPath();
  ctx.arc(W - 180, GROUND_Y - 240, 120, 0, Math.PI * 2); ctx.fill();

  // ceiling fan rotating shadow
  const fanA = t * 4;
  ctx.save();
  ctx.translate(W * 0.4, 80);
  ctx.rotate(fanA);
  ctx.fillStyle = "oklch(0.10 0 0 / 0.5)";
  for (let b = 0; b < 4; b++) {
    ctx.save();
    ctx.rotate((b * Math.PI) / 2);
    ctx.fillRect(0, -6, 80, 12);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------- Derelict Spaceship Corridor ----------------
function drawSpaceship(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  ctx.fillStyle = "oklch(0.14 0.005 240)"; ctx.fillRect(0, 0, W, H);

  // perspective corridor
  ctx.fillStyle = "oklch(0.08 0.005 240)";
  ctx.beginPath();
  ctx.moveTo(W * 0.4, GROUND_Y - 200);
  ctx.lineTo(W * 0.6, GROUND_Y - 200);
  ctx.lineTo(W * 0.55, GROUND_Y - 60);
  ctx.lineTo(W * 0.45, GROUND_Y - 60);
  ctx.closePath(); ctx.fill();

  // wall panels
  for (let i = 0; i < 8; i++) {
    const x = i * 160;
    rect(ctx, x, 0, 156, GROUND_Y, "oklch(0.18 0.005 240)");
    rect(ctx, x + 4, 0, 4, GROUND_Y, "oklch(0.10 0.005 240)");
    // rivets
    ctx.fillStyle = "oklch(0.12 0.005 240)";
    for (let r = 0; r < 6; r++) {
      ctx.beginPath(); ctx.arc(x + 14, 60 + r * 80, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 144, 60 + r * 80, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // red alert strip blinking
  const alert = (Math.sin(t * 3) + 1) * 0.5;
  ctx.shadowBlur = 14 * alert; ctx.shadowColor = "oklch(0.6 0.22 25)";
  ctx.fillStyle = `oklch(0.55 0.22 25 / ${0.4 + 0.6 * alert})`;
  ctx.fillRect(0, 30, W, 6);
  ctx.shadowBlur = 0;

  // broken panel sparks
  const px = W * 0.18, py = GROUND_Y - 220;
  rect(ctx, px - 30, py - 20, 60, 60, "oklch(0.06 0 0)");
  if ((t % 1.4) < 0.18) {
    ctx.fillStyle = "oklch(0.9 0.18 90)";
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI;
      const r = Math.random() * 40;
      ctx.fillRect(px + Math.cos(a) * r, py + Math.sin(a) * r, 2, 2);
    }
  }

  // exposed wires hanging
  for (let i = 0; i < 4; i++) {
    const x = 180 + i * 240;
    const sway = Math.sin(t * 0.7 + i) * 3;
    ctx.strokeStyle = i % 2 ? "oklch(0.35 0.1 30)" : "oklch(0.30 0.04 240)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + sway, 60, x + sway * 1.5, 110);
    ctx.stroke();
  }

  // floor grating
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.24 0.005 240)");
  ctx.strokeStyle = "oklch(0.10 0.005 240)";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath(); ctx.moveTo(i * 32, GROUND_Y + 2); ctx.lineTo(i * 32, GROUND_Y + 10); ctx.stroke();
  }
}

// ---------------- Open Space (Zero-G) ----------------
function drawSpace(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  ctx.fillStyle = "oklch(0.06 0.02 270)"; ctx.fillRect(0, 0, W, H);

  // starfield (deterministic)
  for (let i = 0; i < 120; i++) {
    const seed = i * 39.7;
    const x = (seed * 191) % W;
    const y = (seed * 73) % H;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
    ctx.fillStyle = `oklch(0.95 0.02 250 / ${0.3 + 0.5 * tw})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // brighter stars
  for (let i = 0; i < 18; i++) {
    const seed = i * 113;
    const x = (seed * 71) % W;
    const y = (seed * 53) % (H * 0.7);
    ctx.fillStyle = "oklch(0.95 0.04 250)";
    ctx.fillRect(x, y, 2, 2);
  }

  // distant planet
  const px = W * 0.78, py = 180;
  ctx.fillStyle = "oklch(0.20 0.06 30)";
  ctx.beginPath(); ctx.arc(px, py, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "oklch(0.28 0.08 35)";
  ctx.beginPath(); ctx.arc(px - 20 + Math.sin(t * 0.1) * 4, py - 10, 70, 0, Math.PI * 2); ctx.fill();
  // ring
  ctx.strokeStyle = "oklch(0.40 0.05 60 / 0.6)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(px, py + 10, 130, 22, 0.3, 0, Math.PI * 2); ctx.stroke();

  // drifting debris
  for (let i = 0; i < 10; i++) {
    const seed = i * 67.1;
    const x = (seed * 211 + t * 18) % W;
    const y = (seed * 91 + Math.sin(t * 0.4 + i) * 10) % (GROUND_Y - 40);
    ctx.fillStyle = "oklch(0.30 0.02 260)";
    ctx.fillRect(x, y, 6, 4);
  }

  // energy plate (ground)
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.5);
  ctx.shadowBlur = 16; ctx.shadowColor = `oklch(0.7 0.12 240 / ${pulse})`;
  ctx.strokeStyle = `oklch(0.7 0.1 240 / ${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "oklch(0.16 0.02 240 / 0.5)";
  ctx.fillRect(0, GROUND_Y, W, 8);
}

// ---------------- Rooftop at Dusk ----------------
function drawRooftopDusk(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "oklch(0.30 0.06 40)");
  g.addColorStop(0.5, "oklch(0.22 0.04 30)");
  g.addColorStop(1, "oklch(0.14 0.02 260)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // sun low
  ctx.fillStyle = "oklch(0.55 0.12 50)";
  ctx.beginPath(); ctx.arc(W * 0.25, 280, 50, 0, Math.PI * 2); ctx.fill();

  // clouds parallax
  ctx.fillStyle = "oklch(0.30 0.03 30 / 0.7)";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 320) - (t * 8) % (W + 320));
    ctx.beginPath();
    ctx.ellipse(x, 180 + i * 12, 110, 22, 0, 0, Math.PI * 2); ctx.fill();
  }

  // distant skyline
  ctx.fillStyle = "oklch(0.10 0.02 260)";
  for (let i = 0; i < 14; i++) {
    const x = i * 110;
    const h = 60 + ((i * 41) % 100);
    ctx.fillRect(x, GROUND_Y - h - 20, 90, h);
  }

  // rooftop deck
  rect(ctx, 0, GROUND_Y - 20, W, 20, "oklch(0.16 0.02 60)");

  // AC units
  for (let i = 0; i < 3; i++) {
    const x = 180 + i * 360;
    rect(ctx, x, GROUND_Y - 90, 120, 70, "oklch(0.30 0.005 240)");
    rect(ctx, x + 10, GROUND_Y - 80, 100, 50, "oklch(0.20 0.005 240)");
    // fan
    ctx.save();
    ctx.translate(x + 60, GROUND_Y - 55);
    ctx.rotate(t * 6 + i);
    ctx.fillStyle = "oklch(0.12 0 0)";
    for (let b = 0; b < 4; b++) {
      ctx.save(); ctx.rotate((b * Math.PI) / 2);
      ctx.fillRect(0, -3, 22, 6);
      ctx.restore();
    }
    ctx.restore();
  }

  // antenna
  rect(ctx, W - 150, GROUND_Y - 240, 4, 220, "oklch(0.20 0.005 240)");
  ctx.strokeStyle = "oklch(0.20 0.005 240)"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(W - 170, GROUND_Y - 230 + i * 40); ctx.lineTo(W - 128, GROUND_Y - 230 + i * 40);
    ctx.stroke();
  }

  // pigeons crossing
  for (let i = 0; i < 3; i++) {
    const cx = ((t * 40 + i * 320) % (W + 200)) - 100;
    const cy = 220 + i * 40 + Math.sin(t * 2 + i) * 6;
    ctx.strokeStyle = "oklch(0.10 0.01 60)"; ctx.lineWidth = 2;
    ctx.beginPath();
    const flap = Math.sin(t * 8 + i) * 6;
    ctx.moveTo(cx - 8, cy + flap);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 8, cy + flap);
    ctx.stroke();
  }
}

// ---------------- Warehouse ----------------
function drawWarehouse(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  ctx.fillStyle = "oklch(0.14 0.01 60)"; ctx.fillRect(0, 0, W, H);

  // back wall
  rect(ctx, 0, 0, W, GROUND_Y, "oklch(0.18 0.01 60)");
  // corrugated lines
  ctx.strokeStyle = "oklch(0.14 0.01 60)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y); ctx.stroke();
  }

  // high windows with dusty light
  for (let i = 0; i < 5; i++) {
    const x = 100 + i * 240;
    rect(ctx, x, 60, 140, 80, "oklch(0.32 0.04 80)");
    rect(ctx, x + 68, 60, 4, 80, "oklch(0.12 0.01 60)");
    rect(ctx, x, 96, 140, 4, "oklch(0.12 0.01 60)");
    // light shaft
    ctx.fillStyle = "oklch(0.65 0.08 80 / 0.06)";
    ctx.beginPath();
    ctx.moveTo(x + 20, 140); ctx.lineTo(x + 120, 140);
    ctx.lineTo(x + 200, GROUND_Y); ctx.lineTo(x - 60, GROUND_Y);
    ctx.closePath(); ctx.fill();
  }

  // crates stacked
  const crate = (x: number, y: number, w: number, h: number) => {
    rect(ctx, x, y, w, h, "oklch(0.30 0.06 60)");
    rect(ctx, x, y, w, 4, "oklch(0.36 0.06 60)");
    rect(ctx, x, y + h - 4, w, 4, "oklch(0.22 0.06 60)");
    ctx.strokeStyle = "oklch(0.20 0.05 60)"; ctx.lineWidth = 1;
    ctx.strokeRect(x + 6, y + 8, w - 12, h - 16);
  };
  crate(80, GROUND_Y - 100, 100, 100);
  crate(80, GROUND_Y - 200, 100, 100);
  crate(190, GROUND_Y - 100, 100, 100);
  crate(W - 240, GROUND_Y - 120, 120, 120);
  crate(W - 360, GROUND_Y - 90, 100, 90);

  // hanging chain hook swaying
  const sway = Math.sin(t * 0.7) * 14;
  ctx.strokeStyle = "oklch(0.35 0.01 60)"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = 0; s < 16; s++) {
    const x = W * 0.5 + sway * (s / 16);
    const y = s * 18;
    if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = "oklch(0.30 0.02 60)";
  ctx.beginPath(); ctx.arc(W * 0.5 + sway, 16 * 18, 14, 0, Math.PI * 2); ctx.fill();

  // dust motes
  ctx.fillStyle = "oklch(0.85 0.05 80 / 0.3)";
  for (let i = 0; i < 16; i++) {
    const seed = i * 41.7;
    const x = (seed * 137 + Math.sin(t * 0.4 + i) * 20) % W;
    const y = (seed * 71 + t * 14) % GROUND_Y;
    ctx.fillRect(x, y, 2, 2);
  }

  // floor
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.20 0.02 60)");
}

// ---------------- Subway Platform ----------------
function drawSubway(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  ctx.fillStyle = "oklch(0.10 0.005 240)"; ctx.fillRect(0, 0, W, H);

  // tiled wall
  rect(ctx, 0, 0, W, GROUND_Y - 60, "oklch(0.85 0.01 240)");
  ctx.strokeStyle = "oklch(0.65 0.01 240)"; ctx.lineWidth = 1;
  for (let y = 0; y < GROUND_Y - 60; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y - 60); ctx.stroke();
  }
  // grime overlay
  ctx.fillStyle = "oklch(0.10 0.01 60 / 0.35)";
  ctx.fillRect(0, 0, W, GROUND_Y - 60);

  // platform edge
  rect(ctx, 0, GROUND_Y - 60, W, 60, "oklch(0.18 0.005 240)");
  // yellow safety line
  rect(ctx, 0, GROUND_Y - 14, W, 6, "oklch(0.78 0.16 90)");

  // tunnel below
  rect(ctx, 0, GROUND_Y, W, H - GROUND_Y, "oklch(0.04 0 0)");
  // rails
  rect(ctx, 60, GROUND_Y + 40, W - 120, 3, "oklch(0.40 0.01 240)");
  rect(ctx, 60, GROUND_Y + 70, W - 120, 3, "oklch(0.40 0.01 240)");

  // train light approaching every ~8s
  const cyc = (t % 8) / 8;
  if (cyc > 0.5) {
    const k = (cyc - 0.5) / 0.5; // 0 -> 1
    const r = 8 + k * 80;
    const x = W - 40 - k * (W - 80);
    ctx.shadowBlur = 30 * k; ctx.shadowColor = "oklch(0.95 0.06 80)";
    ctx.fillStyle = `oklch(0.95 0.04 80 / ${0.4 + 0.6 * k})`;
    ctx.beginPath(); ctx.arc(x, GROUND_Y + 40, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // fluorescent flicker on ceiling
  const flick = Math.sin(t * 27) > 0.8 ? 0.4 : 1;
  ctx.fillStyle = `oklch(0.92 0.02 240 / ${0.18 * flick})`;
  ctx.fillRect(0, 0, W, 30);

  // station sign
  rect(ctx, W * 0.5 - 100, 80, 200, 50, "oklch(0.18 0.06 240)");
  ctx.fillStyle = "oklch(0.92 0.02 240)";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText("DOWNTOWN", W * 0.5, 112);
  ctx.textAlign = "start";
}

// ---------------- Foggy Forest Clearing ----------------
function drawForest(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, GROUND_Y: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "oklch(0.18 0.02 250)");
  g.addColorStop(1, "oklch(0.10 0.02 240)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // moon glow (overcast)
  ctx.fillStyle = "oklch(0.32 0.02 250 / 0.4)";
  ctx.beginPath(); ctx.arc(W * 0.7, 160, 80, 0, Math.PI * 2); ctx.fill();

  // back trees layer
  const drawTrees = (count: number, baseH: number, color: string, off: number) => {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = i * (W / count) + off;
      const trunkH = baseH + ((i * 53) % 60);
      // trunk
      ctx.fillRect(x, GROUND_Y - trunkH, 12, trunkH);
      // canopy
      ctx.beginPath();
      ctx.moveTo(x - 30, GROUND_Y - trunkH);
      ctx.lineTo(x + 6, GROUND_Y - trunkH - 110);
      ctx.lineTo(x + 42, GROUND_Y - trunkH);
      ctx.closePath(); ctx.fill();
    }
  };
  drawTrees(10, 200, "oklch(0.10 0.02 240)", 20);
  drawTrees(8, 260, "oklch(0.08 0.02 240)", 70);

  // fog ribbons
  for (let i = 0; i < 4; i++) {
    const y = GROUND_Y - 40 - i * 40;
    const x = ((t * (10 + i * 4)) % (W + 200)) - 200;
    ctx.fillStyle = `oklch(0.55 0.01 240 / ${0.10 - i * 0.02})`;
    ctx.beginPath();
    ctx.ellipse(x + 200, y, 240, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W - x, y - 10, 200, 24, 0, 0, Math.PI * 2); ctx.fill();
  }

  // falling leaves
  ctx.fillStyle = "oklch(0.45 0.08 60 / 0.7)";
  for (let i = 0; i < 14; i++) {
    const seed = i * 83.3;
    const x = (seed * 137 + t * 25 + Math.sin(t * 0.8 + i) * 30) % W;
    const y = (seed * 53 + t * 50) % (GROUND_Y - 20);
    ctx.fillRect(x, y, 4, 2);
  }

  // ground (mossy)
  rect(ctx, 0, GROUND_Y, W, H - GROUND_Y, "oklch(0.12 0.03 140)");
  rect(ctx, 0, GROUND_Y, W, 2, "oklch(0.20 0.04 140)");
  // grass tufts
  ctx.strokeStyle = "oklch(0.18 0.04 140)"; ctx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    const x = i * 45 + 10;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 3, GROUND_Y - 8);
    ctx.moveTo(x + 4, GROUND_Y); ctx.lineTo(x + 6, GROUND_Y - 6);
    ctx.stroke();
  }
}

export const MAPS: BattleMap[] = [
  { id: "neon-city", name: "Neon City Rooftop", tagline: "Skyline / billboards / rain-slick steel",
    tone: "neon", accent: "oklch(0.8 0.22 320)", drawBackground: drawNeonCity },
  { id: "cyber-dojo", name: "Cyber Dojo", tagline: "Lanterns / bamboo / falling petals",
    tone: "neon", accent: "oklch(0.85 0.18 25)", drawBackground: drawCyberDojo },
  { id: "hells-arena", name: "Hell's Arena", tagline: "Lava cracks / chains / rising embers",
    tone: "neon", accent: "oklch(0.85 0.25 45)", drawBackground: drawHellsArena },

  { id: "backstreet", name: "Backstreet Town", tagline: "Brick walls / flickering lamp / rain",
    tone: "dark", accent: "oklch(0.65 0.08 80)", drawBackground: drawBackstreet },
  { id: "car-park", name: "Underground Car Park", tagline: "Concrete pillars / swinging tube / fog",
    tone: "dark", accent: "oklch(0.70 0.02 240)", drawBackground: drawCarPark },
  { id: "temple", name: "Forgotten Temple", tagline: "Stone columns / vines / dust shafts",
    tone: "dark", accent: "oklch(0.55 0.06 80)", drawBackground: drawTemple },
  { id: "living-room", name: "Suburban Living Room", tagline: "Sofa / TV static / ceiling fan",
    tone: "dark", accent: "oklch(0.55 0.06 60)", drawBackground: drawLivingRoom },
  { id: "spaceship", name: "Derelict Spaceship", tagline: "Riveted steel / alert strip / sparks",
    tone: "dark", accent: "oklch(0.55 0.18 25)", drawBackground: drawSpaceship },
  { id: "space", name: "Open Space", tagline: "Starfield / ringed planet / debris",
    tone: "dark", accent: "oklch(0.65 0.12 240)", drawBackground: drawSpace },
  { id: "rooftop-dusk", name: "Rooftop at Dusk", tagline: "AC units / dusk haze / drifting clouds",
    tone: "dark", accent: "oklch(0.55 0.12 50)", drawBackground: drawRooftopDusk },
  { id: "warehouse", name: "Abandoned Warehouse", tagline: "Crates / chain hook / dusty light",
    tone: "dark", accent: "oklch(0.50 0.06 60)", drawBackground: drawWarehouse },
  { id: "subway", name: "Subway Platform", tagline: "Tiles / safety line / approaching train",
    tone: "dark", accent: "oklch(0.78 0.16 90)", drawBackground: drawSubway },
  { id: "forest", name: "Foggy Forest Clearing", tagline: "Trees / fog ribbons / falling leaves",
    tone: "dark", accent: "oklch(0.45 0.06 140)", drawBackground: drawForest },
];

export function getMap(id: MapId): BattleMap {
  return MAPS.find(m => m.id === id) ?? MAPS[0];
}
