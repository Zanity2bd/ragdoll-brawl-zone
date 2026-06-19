// Skin catalog — Marvel / DC / The Boys (premium stickman style, non-neon)

export type SkinId =
  | "spiderman" | "ironman" | "wolverine"
  | "batman" | "superman" | "flash"
  | "homelander" | "butcher" | "atrain"
  // Legacy ids are kept type-compatible for existing engine internals and old
  // saved/debug routes; they are not exposed in the selectable SKINS roster.
  | "hulk" | "nightcrawler" | "heatwave";

export type Universe = "Marvel" | "DC" | "The Boys";

export interface SilhouetteProfile {
  coat:      { flare: number; hemDrop: number; sideDrop: number; color: string; interiorShade: string; weight: number };
  shoulders: { widthMul: number; slumpPx: number; color: string; highlight: string };
  jaw:       { widthMul: number; dropMul: number };
  neck:      { widthMul: number; heightMul: number };
  beard:     { widthMul: number; heightMul: number; color: string; undersideShade: string };
  limbs:     { upperArmMul: number; forearmMul: number; thighMul: number; calfMul: number };
  minVolume: { coatWidth: number; shoulderWidth: number; beardWidth: number };
  taperRule: { shoulderIsMax: boolean; legsTaperIn: boolean; beardMaxOfShoulder: number };
}

export interface Skin {
  id: SkinId;
  name: string;
  universe: Universe;
  body: string;             // torso line color
  limb?: string;            // arms/legs line color (silhouette base tint)
  arms?: string;            // upper-body recolor (arms + torso area); falls back to limb
  head?: string;            // head outline (mask) color — defaults to body
  skinTone?: string;        // exposed face skin (drawn as filled head)
  skinToneMode?: "face" | "fullHead";
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
  silhouette?: SilhouetteProfile;
}

export const SKINS: Skin[] = [
  // Marvel
  { id: "spiderman", name: "Spider-Man", universe: "Marvel",
    // Pure stickman silhouette: blue limbs, red head/hands/feet, slim red torso stripe.
    // NO thickBody — Spider-Man is athletic + agile, not a tank.
    body: "oklch(0.50 0.16 25)", limb: "oklch(0.32 0.12 260)",
    head: "oklch(0.50 0.16 25)",
    gloves: "oklch(0.50 0.16 25)", boots: "oklch(0.50 0.16 25)",
    emblem: { shape: "spider", color: "oklch(0.14 0.04 260)" },
    glow: "oklch(0.55 0.18 20)" },

  { id: "ironman", name: "Iron Man", universe: "Marvel",
    body: "oklch(0.48 0.18 25)", limb: "oklch(0.65 0.16 85)",
    head: "oklch(0.65 0.16 85)",
    gloves: "oklch(0.65 0.16 85)", boots: "oklch(0.65 0.16 85)",
    emblem: { shape: "circle", color: "oklch(0.78 0.14 200)" },
    thickBody: true,
    glow: "oklch(0.78 0.14 200)" },

  { id: "wolverine", name: "Wolverine", universe: "Marvel",
    body: "oklch(0.78 0.16 86)", limb: "oklch(0.22 0.08 255)",
    head: "oklch(0.78 0.16 86)",
    gloves: "oklch(0.16 0.06 255)", boots: "oklch(0.13 0.05 255)",
    emblem: { shape: "stripe", color: "oklch(0.13 0.05 255)" },
    thickBody: true,
    glow: "oklch(0.86 0.14 85)" },

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

  // The Boys
  { id: "homelander", name: "Homelander", universe: "The Boys",
    body: "oklch(0.78 0.06 250)", limb: "oklch(0.78 0.06 250)",
    head: "oklch(0.30 0.05 30)", skinTone: "oklch(0.74 0.08 50)",
    gloves: "oklch(0.40 0.16 260)", boots: "oklch(0.40 0.16 260)",
    cape: "oklch(0.45 0.20 25)", capeAccent: "oklch(0.92 0.04 250)",
    glowingEyes: "oklch(0.82 0.18 60)",
    glow: "oklch(0.55 0.18 30)" },

  { id: "butcher", name: "Butcher", universe: "The Boys",
    // Billy Butcher — silhouette-authored: coat + shoulders + bearded jaw baked
    // into the cached sprite frame via SilhouetteProfile (see walkSprite.ts).
    body: "oklch(0.30 0.015 250)",
    limb: "oklch(0.18 0.04 260)",          // dark dark blue legs/base
    head: "oklch(0.74 0.07 55)",           // peach skin tone for face/jaw
    glow: "oklch(0.55 0.06 220)",
    silhouette: {
      coat: {
        flare: 1.45, hemDrop: 24, sideDrop: 8,
        color: "oklch(0.30 0.015 250)",
        interiorShade: "oklch(0.22 0.012 250)",
        weight: 0.85,
      },
      shoulders: {
        widthMul: 1.38, slumpPx: 1,
        color: "oklch(0.32 0.015 250)",
        highlight: "oklch(0.38 0.015 250)",
      },
      jaw:   { widthMul: 0.92, dropMul: 0.55 },
      neck:  { widthMul: 1.18, heightMul: 0.9 },
      beard: {
        widthMul: 0.88, heightMul: 0.55,
        color: "oklch(0.17 0.01 30)",
        undersideShade: "oklch(0.11 0.01 30)",
      },
      limbs: { upperArmMul: 1.28, forearmMul: 1.15, thighMul: 1.22, calfMul: 1.08 },
      minVolume: { coatWidth: 0.78, shoulderWidth: 0.85, beardWidth: 0.70 },
      taperRule: { shoulderIsMax: true, legsTaperIn: true, beardMaxOfShoulder: 0.85 },
    },
  },

  { id: "atrain", name: "A-Train", universe: "The Boys",
    body: "oklch(0.30 0.13 252)", limb: "oklch(0.27 0.12 252)",
    head: "oklch(0.28 0.12 252)",
    gloves: "oklch(0.92 0.02 250)", boots: "oklch(0.92 0.02 250)",
    streaks: "oklch(0.72 0.22 28)",
    emblem: { shape: "stripe", color: "oklch(0.92 0.02 250)" },
    glow: "oklch(0.44 0.16 255)" },
];

const INTERNAL_SKINS: Skin[] = [
  { id: "nightcrawler", name: "Nightcrawler", universe: "Marvel",
    body: "oklch(0.18 0.10 292)", limb: "oklch(0.20 0.12 292)",
    head: "oklch(0.13 0.08 288)",
    gloves: "oklch(0.12 0.06 288)", boots: "oklch(0.12 0.06 288)",
    glowingEyes: "oklch(0.88 0.18 75)",
    emblem: { shape: "stripe", color: "oklch(0.66 0.22 302)" },
    glow: "oklch(0.62 0.22 300)" },

  { id: "hulk", name: "Hulk", universe: "Marvel",
    body: "oklch(0.42 0.13 145)", limb: "oklch(0.48 0.15 145)",
    head: "oklch(0.44 0.13 145)",
    gloves: "oklch(0.42 0.13 145)", boots: "oklch(0.28 0.10 292)",
    thickBody: true,
    glow: "oklch(0.58 0.16 145)" },

  { id: "heatwave", name: "Heatwave", universe: "DC",
    body: "oklch(0.48 0.20 38)", limb: "oklch(0.40 0.16 45)",
    head: "oklch(0.36 0.16 38)",
    gloves: "oklch(0.78 0.18 70)", boots: "oklch(0.30 0.12 38)",
    glowingEyes: "oklch(0.96 0.18 80)",
    emblem: { shape: "circle", color: "oklch(0.86 0.18 70)" },
    thickBody: true,
    glow: "oklch(0.86 0.20 52)" },
];

export function getSkin(id: SkinId): Skin {
  return SKINS.find(s => s.id === id) ?? INTERNAL_SKINS.find(s => s.id === id) ?? SKINS[0];
}
