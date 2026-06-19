import type { SkinId } from "./skins";

export type HairShape =
  | "none"
  | "slick"
  | "fade"
  | "messy"
  | "sharp"
  | "cowl"
  | "ears"
  | "widowPeak"
  | "helmet"
  | "speedFins"
  | "spiderMask";

export type CapeShape = "none" | "short" | "hero" | "banner" | "ragged";
export type BodyShape = "athletic" | "armored" | "broad" | "sprinter" | "coat" | "bruiser" | "lean";

export interface CharacterPresentationProfile {
  bodyShape: BodyShape;
  shoulderMul: number;
  torsoMul: number;
  hipMul: number;
  headMul: number;
  neckMul: number;
  stanceLean: number;
  gloveMul: number;
  bootMul: number;
  hair: HairShape;
  cape: CapeShape;
  capeLength: number;
  capeWidth: number;
  coatLength: number;
  emblemScale: number;
  eyeScale: number;
  silhouetteBias: number;
  tail: boolean;
  claws: boolean;
}

const DEFAULT_PROFILE: CharacterPresentationProfile = {
  bodyShape: "athletic",
  shoulderMul: 1,
  torsoMul: 1,
  hipMul: 1,
  headMul: 1,
  neckMul: 1,
  stanceLean: 0,
  gloveMul: 1,
  bootMul: 1,
  hair: "none",
  cape: "none",
  capeLength: 1,
  capeWidth: 1,
  coatLength: 0,
  emblemScale: 1,
  eyeScale: 1,
  silhouetteBias: 1,
  tail: false,
  claws: false,
};

const PRESENTATION: Partial<Record<SkinId, Partial<CharacterPresentationProfile>>> = {
  spiderman: {
    bodyShape: "athletic",
    shoulderMul: 0.8,
    torsoMul: 0.72,
    hipMul: 0.68,
    headMul: 0.92,
    neckMul: 0.72,
    stanceLean: 0.2,
    gloveMul: 1.06,
    bootMul: 1.05,
    hair: "spiderMask",
    eyeScale: 1.36,
    emblemScale: 0.9,
    silhouetteBias: 0.92,
  },
  ironman: {
    bodyShape: "armored",
    shoulderMul: 1.28,
    torsoMul: 1.22,
    hipMul: 1.05,
    headMul: 1.05,
    neckMul: 0.95,
    gloveMul: 1.12,
    bootMul: 1.12,
    hair: "helmet",
    emblemScale: 1.08,
    silhouetteBias: 1.12,
  },
  wolverine: {
    bodyShape: "broad",
    shoulderMul: 1.18,
    torsoMul: 1.05,
    hipMul: 0.94,
    headMul: 1.02,
    neckMul: 0.9,
    gloveMul: 1.2,
    bootMul: 1.1,
    hair: "ears",
    claws: true,
    emblemScale: 0.9,
    silhouetteBias: 1.08,
  },
  batman: {
    bodyShape: "broad",
    shoulderMul: 1.38,
    torsoMul: 1.18,
    hipMul: 1,
    headMul: 1.02,
    neckMul: 0.95,
    gloveMul: 1.08,
    bootMul: 1.12,
    hair: "cowl",
    cape: "short",
    capeLength: 0.74,
    capeWidth: 1.18,
    emblemScale: 1.06,
    silhouetteBias: 1.2,
  },
  superman: {
    bodyShape: "broad",
    shoulderMul: 1.24,
    torsoMul: 1.14,
    hipMul: 0.96,
    headMul: 1,
    neckMul: 1,
    hair: "widowPeak",
    cape: "hero",
    capeLength: 1.04,
    capeWidth: 1,
    emblemScale: 1.15,
    silhouetteBias: 1.08,
  },
  flash: {
    bodyShape: "sprinter",
    shoulderMul: 1.02,
    torsoMul: 0.92,
    hipMul: 0.84,
    headMul: 0.98,
    neckMul: 0.82,
    stanceLean: 0.12,
    gloveMul: 1.02,
    bootMul: 1.22,
    hair: "speedFins",
    emblemScale: 0.95,
    silhouetteBias: 0.98,
  },
  homelander: {
    bodyShape: "broad",
    shoulderMul: 1.34,
    torsoMul: 1.16,
    hipMul: 0.96,
    headMul: 1.03,
    neckMul: 1.05,
    hair: "slick",
    cape: "banner",
    capeLength: 1.12,
    capeWidth: 1.1,
    emblemScale: 1.06,
    silhouetteBias: 1.16,
  },
  butcher: {
    bodyShape: "coat",
    shoulderMul: 1.34,
    torsoMul: 1.16,
    hipMul: 1.18,
    headMul: 1.03,
    neckMul: 1,
    gloveMul: 1.04,
    bootMul: 1.1,
    hair: "messy",
    coatLength: 1.25,
    emblemScale: 0.88,
    silhouetteBias: 1.22,
  },
  atrain: {
    bodyShape: "sprinter",
    shoulderMul: 0.96,
    torsoMul: 0.82,
    hipMul: 0.68,
    headMul: 0.92,
    neckMul: 0.78,
    stanceLean: 0.3,
    gloveMul: 1.08,
    bootMul: 1.32,
    hair: "fade",
    emblemScale: 0.92,
    silhouetteBias: 1,
  },
  hulk: {
    bodyShape: "bruiser",
    shoulderMul: 1.58,
    torsoMul: 1.42,
    hipMul: 1.22,
    headMul: 1.08,
    neckMul: 1.22,
    gloveMul: 1.28,
    bootMul: 1.18,
    hair: "messy",
    silhouetteBias: 1.42,
  },
  nightcrawler: {
    bodyShape: "lean",
    shoulderMul: 0.88,
    torsoMul: 0.78,
    hipMul: 0.72,
    headMul: 0.98,
    neckMul: 0.76,
    stanceLean: 0.18,
    gloveMul: 0.95,
    bootMul: 1.02,
    hair: "sharp",
    cape: "none",
    tail: true,
    emblemScale: 0.8,
    eyeScale: 1.18,
    silhouetteBias: 0.92,
  },
  heatwave: {
    bodyShape: "armored",
    shoulderMul: 1.18,
    torsoMul: 1.08,
    hipMul: 0.98,
    headMul: 1,
    neckMul: 0.95,
    gloveMul: 1.1,
    bootMul: 1.1,
    hair: "helmet",
    emblemScale: 1,
    silhouetteBias: 1.06,
  },
};

export function getCharacterPresentation(id: SkinId): CharacterPresentationProfile {
  return { ...DEFAULT_PROFILE, ...PRESENTATION[id] };
}
