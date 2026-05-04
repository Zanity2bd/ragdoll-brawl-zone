// Animated battle maps — procedural canvas backgrounds.

export type MapId = "neon-city" | "cyber-dojo" | "hells-arena";

export interface BattleMap {
  id: MapId;
  name: string;
  tagline: string;
  // Returns CSS color for ground line accent.
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

  // distant moon
  ctx.shadowBlur = 30;
  ctx.shadowColor = "oklch(0.85 0.1 320)";
  ctx.fillStyle = "oklch(0.9 0.05 320)";
  ctx.beginPath(); ctx.arc(W * 0.78, 130, 50, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // back skyline (parallax slow) — fewer buildings, no shadows
  const offB = (t * 8) % 80;
  ctx.fillStyle = "oklch(0.16 0.06 280)";
  for (let i = -1; i < 12; i++) {
    const x = i * 110 - offB;
    const h = 80 + ((i * 53) % 90);
    ctx.fillRect(x, GROUND_Y - h - 60, 70, h);
  }

  // front skyline — static window pattern (no per-frame flicker math)
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

  // billboard scrolling
  const bx = (W * 1.2 - (t * 60) % (W + 400));
  ctx.shadowBlur = 14; ctx.shadowColor = "oklch(0.75 0.25 20)";
  ctx.fillStyle = "oklch(0.65 0.25 25)";
  ctx.fillRect(bx, 200, 220, 36);
  ctx.shadowBlur = 0;

  // ground neon line
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

  // distant mountains
  ctx.fillStyle = "oklch(0.15 0.04 340)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W; x += 40) {
    const y = GROUND_Y - 120 - Math.sin(x * 0.008) * 60 - ((x * 13) % 40);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y); ctx.closePath(); ctx.fill();

  // bamboo silhouettes swaying
  for (let i = 0; i < 8; i++) {
    const x = 60 + i * 170;
    const sway = Math.sin(t * 0.8 + i) * 6;
    ctx.strokeStyle = "oklch(0.22 0.06 150)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.quadraticCurveTo(x + sway, GROUND_Y - 200, x + sway * 2, GROUND_Y - 380); ctx.stroke();
  }

  // paper lanterns pulsing
  const lanterns = [{ x: 180, y: 140 }, { x: 520, y: 100 }, { x: 880, y: 160 }, { x: 1140, y: 110 }];
  for (const L of lanterns) {
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + L.x);
    ctx.shadowBlur = 50 * pulse; ctx.shadowColor = "oklch(0.8 0.2 30)";
    ctx.fillStyle = `oklch(0.7 0.22 30 / ${pulse})`;
    ctx.beginPath(); ctx.ellipse(L.x, L.y, 22, 28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "oklch(0.4 0.05 280)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x, 0); ctx.lineTo(L.x, L.y - 28); ctx.stroke();
  }

  // falling petals
  for (let i = 0; i < 30; i++) {
    const seed = i * 91.7;
    const x = (seed * 137 + t * 30 + Math.sin(t + i) * 40) % W;
    const y = (seed * 53 + t * 60) % (GROUND_Y - 20);
    ctx.fillStyle = `oklch(0.85 0.15 0 / 0.7)`;
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2, t + i, 0, Math.PI * 2); ctx.fill();
  }

  // ground
  ctx.shadowBlur = 24; ctx.shadowColor = "oklch(0.8 0.2 30)";
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

  // back rock arches
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

  // chains swinging
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

  // lava cracks
  ctx.shadowBlur = 30; ctx.shadowColor = "oklch(0.85 0.22 50)";
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

  // rising embers
  for (let i = 0; i < 50; i++) {
    const seed = i * 73.3;
    const x = (seed * 191 + Math.sin(t + i) * 60) % W;
    const y = GROUND_Y - ((seed * 41 + t * 80) % (GROUND_Y - 20));
    const a = y / GROUND_Y;
    ctx.fillStyle = `oklch(0.85 0.22 ${40 + i % 20} / ${a})`;
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  // occasional fireball arc
  const fbT = (t * 0.3) % 1;
  if (fbT < 0.4) {
    const fx = fbT / 0.4;
    const x = fx * W;
    const y = 200 + Math.sin(fx * Math.PI) * -120 + 100;
    ctx.shadowBlur = 40; ctx.shadowColor = "oklch(0.85 0.25 50)";
    ctx.fillStyle = "oklch(0.9 0.22 60)";
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.shadowBlur = 28; ctx.shadowColor = "oklch(0.85 0.25 45)";
  ctx.strokeStyle = "oklch(0.8 0.25 45)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;
}

export const MAPS: BattleMap[] = [
  { id: "neon-city", name: "Neon City Rooftop", tagline: "Skyline · billboards · rain-slick steel",
    accent: "oklch(0.8 0.22 320)", drawBackground: drawNeonCity },
  { id: "cyber-dojo", name: "Cyber Dojo", tagline: "Lanterns · bamboo · falling petals",
    accent: "oklch(0.85 0.18 25)", drawBackground: drawCyberDojo },
  { id: "hells-arena", name: "Hell's Arena", tagline: "Lava cracks · chains · rising embers",
    accent: "oklch(0.85 0.25 45)", drawBackground: drawHellsArena },
];

export function getMap(id: MapId): BattleMap {
  return MAPS.find(m => m.id === id) ?? MAPS[0];
}
