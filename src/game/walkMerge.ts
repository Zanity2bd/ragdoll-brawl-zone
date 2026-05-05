// Merge the original 10-frame walk loop (walk-sheet.png frames 0..9) with the
// 6 hand-drawn keyposes (walkCycleV2). Builds a 16-slot lookup by stride phase.
//
// Phase convention: 0..1 over a full stride cycle. We classify each source
// frame by its phase using the existing per-frame anchors (foot/leg spread + lead-leg
// sign). Frames covering only one stride-half can serve the opposite half via mirror.
//
// Result: MERGED[16] = { a, b, blend } for crossfaded sub-pose draw.

import { WALK_ANCHORS } from "./walkAnchors";
import { WALK_LOOP_FRAMES } from "./walkSprite";
import { getV2Anchors, V2_FRAME_COUNT, isV2Ready } from "./walkCycleV2";

export type SourceKind = "sheet" | "v2";

export interface MergedSlotEntry {
  source: SourceKind;
  frame: number;
  mirror: boolean;
}
export interface MergedSlot {
  a: MergedSlotEntry;
  b: MergedSlotEntry;
  blend: number; // 0..1 weight of b
}

export const MERGED_SLOTS = 16;

interface Candidate { source: SourceKind; frame: number; phase: number; mirror: boolean }

let merged: MergedSlot[] | null = null;
let builtWith = 0; // number of v2 anchors at build time

// Approximate phase for each of the 10 sheet walk frames based on observed
// anchor data + the engine's existing usage. The sheet covers a near-complete
// cycle; we space them evenly with a small empirical offset.
const SHEET_PHASES: number[] = [
  0.00, 0.06, 0.12, 0.18, 0.25,  // first stride half (left lead)
  0.50, 0.56, 0.62, 0.68, 0.75,  // second stride half (right lead)
];

function phaseFromV2(idx: number): number {
  // The 6 hand-drawn frames depict a single stride half (contact → mid → push-off
  // → pass → reach → heel-plant). Map evenly to phase [0, 0.5).
  return (idx / V2_FRAME_COUNT) * 0.5;
}

function buildCandidates(): Candidate[] {
  const out: Candidate[] = [];
  // Sheet frames (no mirror — they already cover both halves).
  for (let i = 0; i < WALK_LOOP_FRAMES && i < WALK_ANCHORS.length; i++) {
    out.push({ source: "sheet", frame: i, phase: SHEET_PHASES[i] ?? (i / WALK_LOOP_FRAMES), mirror: false });
  }
  // V2 frames cover [0, 0.5); mirror copies cover [0.5, 1.0).
  const v2 = getV2Anchors();
  if (v2.length > 0) {
    for (let i = 0; i < V2_FRAME_COUNT; i++) {
      out.push({ source: "v2", frame: i, phase: phaseFromV2(i), mirror: false });
      out.push({ source: "v2", frame: i, phase: phaseFromV2(i) + 0.5, mirror: true });
    }
  }
  return out;
}

function phaseDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

function rebuild() {
  const cands = buildCandidates();
  const slots: MergedSlot[] = [];
  for (let s = 0; s < MERGED_SLOTS; s++) {
    const target = s / MERGED_SLOTS;
    // Pick two nearest candidates by circular phase distance.
    let best = cands[0], second = cands[1] ?? cands[0];
    let bd = phaseDist(target, best.phase);
    let sd = phaseDist(target, second.phase);
    if (sd < bd) { const tc = best; best = second; second = tc; const td = bd; bd = sd; sd = td; }
    for (let i = 2; i < cands.length; i++) {
      const c = cands[i];
      const d = phaseDist(target, c.phase);
      if (d < bd) { second = best; sd = bd; best = c; bd = d; }
      else if (d < sd) { second = c; sd = d; }
    }
    const total = bd + sd;
    const blend = total > 0.0001 ? bd / total : 0;
    slots.push({
      a: { source: best.source, frame: best.frame, mirror: best.mirror },
      b: { source: second.source, frame: second.frame, mirror: second.mirror },
      blend,
    });
  }
  merged = slots;
  builtWith = getV2Anchors().length;
}

export function getMergedSlot(slot01: number): MergedSlot {
  const v2Count = getV2Anchors().length;
  if (!merged || builtWith !== v2Count) rebuild();
  const n = MERGED_SLOTS;
  const i = ((Math.floor(slot01 * n) % n) + n) % n;
  return merged![i];
}

export function isMergedReady(): boolean {
  return isV2Ready();
}

export { MERGED_SLOTS as _MERGED_SLOTS_COUNT };
