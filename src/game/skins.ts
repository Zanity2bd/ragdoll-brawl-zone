// Skin catalog — Marvel / DC / The Boys (premium stickman style, non-neon)

export type SkinId =
  | "spiderman" | "ironman" | "hulk" | "nightcrawler"
  | "batman" | "superman" | "flash" | "heatwave"
  | "homelander" | "butcher" | "atrain";

export type Universe = "Marvel" | "DC" | "The Boys";

export interface Skin {
  id: SkinId;
  name: string;
  universe: Universe;
  body: string;             // torso line color
  limb?: string;            // arms/legs line color
  head?: string;            // head outline (mask) color — defaults to body
  skinTone?: string;        // exposed face skin (drawn as filled head)
  gloves?: string;          // colored hand "fists"
  boots?: string;           // colored feet
  cape?: string;            // cape fill
  capeAccent?: string;      // cape inner stripe / lining
  cowlEars?: boolean;
  glowingEyes?: string;
  emblem?: { shape: "oval" | "shield" | "circle" | "stripe" | "spider" | "lightning"; color: string };
  thickBody?: boolean;
  noHead?: boolean;
  beard?: boolean;
  glow: string;             // subtle accent glow (used sparingly for emblem/eyes only)
  streaks?: string;
}

export const SKINS: Skin[] = [
  // Marvel
  { id: "spiderman", name: "Spider-Man", universe: "Marvel",
    body: "oklch(0.50 0.16 25)", limb: "oklch(0.32 0.12 260)",
    head: "oklch(0.50 0.16 25)",
    gloves: "oklch(0.50 0.16 25)", boots: "oklch(0.50 0.16 25)",
    emblem: { shape: "spider", color: "oklch(0.18 0.04 260)" },
    thickBody: true,
    glow: "oklch(0.55 0.18 20)" },

  { id: "ironman", name: "Iron Man", universe: "Marvel",
    body: "oklch(0.48 0.18 25)", limb: "oklch(0.65 0.16 85)",
    head: "oklch(0.65 0.16 85)",
    gloves: "oklch(0.65 0.16 85)", boots: "oklch(0.65 0.16 85)",
    emblem: { shape: "circle", color: "oklch(0.78 0.14 200)" },
    thickBody: true,
    glow: "oklch(0.78 0.14 200)" },

  { id: "hulk", name: "Hulk", universe: "Marvel",
    body: "oklch(0.32 0.18 25)", limb: "oklch(0.36 0.20 25)",
    head: "oklch(0.30 0.18 25)",
    gloves: "oklch(0.22 0.12 25)", boots: "oklch(0.18 0.08 25)",
    glowingEyes: "oklch(0.88 0.22 60)",
    emblem: { shape: "shield", color: "oklch(0.18 0.08 25)" },
    thickBody: true,
    glow: "oklch(0.62 0.24 25)" },

  { id: "nightcrawler", name: "Nightcrawler", universe: "Marvel",
    body: "oklch(0.32 0.12 260)", limb: "oklch(0.32 0.12 260)",
    head: "oklch(0.32 0.12 260)",
    gloves: "oklch(0.50 0.16 25)", boots: "oklch(0.50 0.16 25)",
    glowingEyes: "oklch(0.85 0.18 60)",
    glow: "oklch(0.55 0.20 280)" },

  // DC
  { id: "batman", name: "Batman", universe: "DC",
    body: "oklch(0.18 0.02 280)", limb: "oklch(0.18 0.02 280)",
    head: "oklch(0.18 0.02 280)",
    gloves: "oklch(0.18 0.02 280)", boots: "oklch(0.18 0.02 280)",
    cape: "oklch(0.16 0.02 280)", cowlEars: true,
    emblem: { shape: "oval", color: "oklch(0.78 0.16 90)" },
    glow: "oklch(0.40 0.04 280)" },

  { id: "superman", name: "Superman", universe: "DC",
    body: "oklch(0.40 0.18 260)", limb: "oklch(0.40 0.18 260)",
    head: "oklch(0.30 0.05 30)", skinTone: "oklch(0.72 0.08 50)",
    gloves: "oklch(0.40 0.18 260)", boots: "oklch(0.50 0.20 25)",
    cape: "oklch(0.45 0.20 25)", capeAccent: "oklch(0.55 0.22 20)",
    emblem: { shape: "shield", color: "oklch(0.78 0.16 85)" },
    glow: "oklch(0.55 0.18 255)" },

  { id: "flash", name: "The Flash", universe: "DC",
    body: "oklch(0.50 0.20 25)", limb: "oklch(0.50 0.20 25)",
    head: "oklch(0.50 0.20 25)",
    gloves: "oklch(0.78 0.16 85)", boots: "oklch(0.78 0.16 85)",
    streaks: "oklch(0.85 0.16 85)",
    emblem: { shape: "lightning", color: "oklch(0.85 0.16 85)" },
    glow: "oklch(0.78 0.16 85)" },

  { id: "heatwave", name: "Heatwave", universe: "DC",
    body: "oklch(0.30 0.04 60)", limb: "oklch(0.30 0.04 60)",
    head: "oklch(0.55 0.20 40)", skinTone: "oklch(0.68 0.10 50)",
    gloves: "oklch(0.50 0.18 35)", boots: "oklch(0.22 0.02 60)",
    thickBody: true,
    glow: "oklch(0.72 0.22 40)" },

  // The Boys
  { id: "homelander", name: "Homelander", universe: "The Boys",
    body: "oklch(0.78 0.06 250)", limb: "oklch(0.78 0.06 250)",
    head: "oklch(0.30 0.05 30)", skinTone: "oklch(0.74 0.08 50)",
    gloves: "oklch(0.40 0.16 260)", boots: "oklch(0.40 0.16 260)",
    cape: "oklch(0.45 0.20 25)", capeAccent: "oklch(0.92 0.04 250)",
    glowingEyes: "oklch(0.82 0.18 60)",
    glow: "oklch(0.55 0.18 30)" },

  { id: "butcher", name: "Butcher", universe: "The Boys",
    // Billy Butcher: dark trousers (limb), weathered slate jacket (body chest
    // patch), black hair cap + warm skin face + full beard — all baked in.
    body: "oklch(0.36 0.025 220)",
    limb: "oklch(0.18 0.01 250)",
    head: "oklch(0.14 0.01 30)",
    skinTone: "oklch(0.62 0.07 50)",
    gloves: "oklch(0.18 0.01 250)",
    boots: "oklch(0.12 0.01 250)",
    beard: true,
    glow: "oklch(0.55 0.06 220)" },

  { id: "atrain", name: "A-Train", universe: "The Boys",
    body: "oklch(0.45 0.20 25)", limb: "oklch(0.45 0.20 25)",
    head: "oklch(0.45 0.20 25)",
    gloves: "oklch(0.92 0.02 250)", boots: "oklch(0.92 0.02 250)",
    streaks: "oklch(0.92 0.02 250)",
    emblem: { shape: "stripe", color: "oklch(0.92 0.02 250)" },
    glow: "oklch(0.55 0.18 25)" },
];

export function getSkin(id: SkinId): Skin {
  return SKINS.find(s => s.id === id) ?? SKINS[0];
}
