// Skin catalog — Marvel / DC / The Boys (stickman style)

export type SkinId =
  | "spiderman" | "ironman" | "hulk"
  | "batman" | "superman" | "flash"
  | "homelander" | "butcher" | "atrain";

export type Universe = "Marvel" | "DC" | "The Boys";

export interface Skin {
  id: SkinId;
  name: string;
  universe: Universe;
  body: string;       // line color
  glow: string;       // shadow color
  limb?: string;      // optional separate limb color
  cape?: string;      // cape color (drawn behind torso)
  capeAccent?: string;
  cowlEars?: boolean;
  glowingEyes?: string;     // color of laser eyes
  emblem?: { shape: "oval" | "shield" | "circle" | "stripe" | "spider"; color: string };
  thickBody?: boolean;
  streaks?: string;         // motion streak color
  beard?: boolean;
}

export const SKINS: Skin[] = [
  // Marvel
  { id: "spiderman", name: "Spider-Man", universe: "Marvel",
    body: "oklch(0.65 0.22 25)", glow: "oklch(0.7 0.25 20)",
    limb: "oklch(0.55 0.22 260)",
    emblem: { shape: "spider", color: "oklch(0.2 0.05 260)" } },
  { id: "ironman", name: "Iron Man", universe: "Marvel",
    body: "oklch(0.6 0.22 25)", glow: "oklch(0.85 0.18 85)",
    limb: "oklch(0.85 0.18 85)", thickBody: true,
    emblem: { shape: "circle", color: "oklch(0.95 0.15 200)" } },
  { id: "hulk", name: "Hulk", universe: "Marvel",
    body: "oklch(0.65 0.22 145)", glow: "oklch(0.7 0.25 140)",
    thickBody: true },

  // DC
  { id: "batman", name: "Batman", universe: "DC",
    body: "oklch(0.25 0.02 280)", glow: "oklch(0.5 0.1 280)",
    cape: "oklch(0.2 0.02 280)", cowlEars: true,
    emblem: { shape: "oval", color: "oklch(0.85 0.18 90)" } },
  { id: "superman", name: "Superman", universe: "DC",
    body: "oklch(0.5 0.22 260)", glow: "oklch(0.65 0.25 255)",
    cape: "oklch(0.55 0.22 25)", capeAccent: "oklch(0.7 0.25 20)",
    emblem: { shape: "shield", color: "oklch(0.85 0.18 85)" } },
  { id: "flash", name: "The Flash", universe: "DC",
    body: "oklch(0.6 0.22 25)", glow: "oklch(0.85 0.18 85)",
    streaks: "oklch(0.9 0.18 85)",
    emblem: { shape: "shield", color: "oklch(0.95 0.15 90)" } },

  // The Boys
  { id: "homelander", name: "Homelander", universe: "The Boys",
    body: "oklch(0.4 0.15 260)", glow: "oklch(0.6 0.2 255)",
    cape: "oklch(0.55 0.22 25)", capeAccent: "oklch(0.95 0.02 250)",
    glowingEyes: "oklch(0.95 0.15 60)" },
  { id: "butcher", name: "Butcher", universe: "The Boys",
    body: "oklch(0.2 0.02 280)", glow: "oklch(0.45 0.05 280)",
    thickBody: true, beard: true },
  { id: "atrain", name: "A-Train", universe: "The Boys",
    body: "oklch(0.55 0.22 25)", glow: "oklch(0.7 0.25 20)",
    streaks: "oklch(0.95 0.05 90)",
    emblem: { shape: "stripe", color: "oklch(0.95 0.02 250)" } },
];

export function getSkin(id: SkinId): Skin {
  return SKINS.find(s => s.id === id) ?? SKINS[0];
}
