// Procedural walk-cycle pose for stickman fighters.
// Grounded gait is driven by a baked Mixamo walk-cycle table (walkCycle.ts);
// idle, jump, attack, and flying-kick branches stay procedural.

import { WALK_CYCLE, WALK_HIP_SWAY } from "./walkCycle";

// Catmull–Rom cubic interpolation between baked frames.
// Synthesizes smooth in-between frames so the cycle reads at any framerate
// without visible "stepping" between the 24 baked keys.
const N_WALK = WALK_CYCLE.length;
function cr2(p0: readonly [number, number], p1: readonly [number, number], p2: readonly [number, number], p3: readonly [number, number], k: number): [number, number] {
  const k2 = k * k, k3 = k2 * k;
  // Standard Catmull–Rom basis (tension 0.5)
  const c0 = -0.5 * k3 + k2 - 0.5 * k;
  const c1 =  1.5 * k3 - 2.5 * k2 + 1;
  const c2 = -1.5 * k3 + 2 * k2 + 0.5 * k;
  const c3 =  0.5 * k3 - 0.5 * k2;
  return [
    p0[0] * c0 + p1[0] * c1 + p2[0] * c2 + p3[0] * c3,
    p0[1] * c0 + p1[1] * c1 + p2[1] * c2 + p3[1] * c3,
  ];
}
function cr1(a: number, b: number, c: number, d: number, k: number): number {
  const k2 = k * k, k3 = k2 * k;
  return (-0.5 * k3 + k2 - 0.5 * k) * a
       + ( 1.5 * k3 - 2.5 * k2 + 1) * b
       + (-1.5 * k3 + 2 * k2 + 0.5 * k) * c
       + ( 0.5 * k3 - 0.5 * k2) * d;
}
// Sample the baked walk cycle at a normalized time t (0..1, wraps).
// Returns the bones we actually use, in the same 2D normalized space (Y up,
// X = forward in facing direction, |hip→foot| ≈ 1).
function sampleWalk(t: number) {
  const f = (((t % 1) + 1) % 1) * N_WALK;
  const i1 = Math.floor(f) % N_WALK;
  const i0 = (i1 - 1 + N_WALK) % N_WALK;
  const i2 = (i1 + 1) % N_WALK;
  const i3 = (i1 + 2) % N_WALK;
  const k = f - Math.floor(f);
  const A = WALK_CYCLE[i0], B = WALK_CYCLE[i1], C = WALK_CYCLE[i2], D = WALK_CYCLE[i3];
  return {
    LU: cr2(A.LeftUpLeg, B.LeftUpLeg, C.LeftUpLeg, D.LeftUpLeg, k),
    LK: cr2(A.LeftLeg, B.LeftLeg, C.LeftLeg, D.LeftLeg, k),
    LF: cr2(A.LeftFoot, B.LeftFoot, C.LeftFoot, D.LeftFoot, k),
    RU: cr2(A.RightUpLeg, B.RightUpLeg, C.RightUpLeg, D.RightUpLeg, k),
    RK: cr2(A.RightLeg, B.RightLeg, C.RightLeg, D.RightLeg, k),
    RF: cr2(A.RightFoot, B.RightFoot, C.RightFoot, D.RightFoot, k),
    LA: cr2(A.LeftArm, B.LeftArm, C.LeftArm, D.LeftArm, k),
    LE: cr2(A.LeftForeArm, B.LeftForeArm, C.LeftForeArm, D.LeftForeArm, k),
    LH: cr2(A.LeftHand, B.LeftHand, C.LeftHand, D.LeftHand, k),
    RA: cr2(A.RightArm, B.RightArm, C.RightArm, D.RightArm, k),
    RE: cr2(A.RightForeArm, B.RightForeArm, C.RightForeArm, D.RightForeArm, k),
    RH: cr2(A.RightHand, B.RightHand, C.RightHand, D.RightHand, k),
    sway: cr1(WALK_HIP_SWAY[i0], WALK_HIP_SWAY[i1], WALK_HIP_SWAY[i2], WALK_HIP_SWAY[i3], k),
  };
}


export interface Pose {
  headOffsetY: number;
  shoulderY: number;
  hipY: number;
  // Each limb is [shoulderX, shoulderY, elbowX, elbowY, handX, handY]
  legL: [number, number, number, number, number, number];
  legR: [number, number, number, number, number, number];
  armL: [number, number, number, number, number, number];
  armR: [number, number, number, number, number, number];
  handL: [number, number]; // hand pivot point (for fist/glove)
  handR: [number, number];
  footL: [number, number]; // foot pivot point (for boot)
  footR: [number, number];
  lean: number;
  shoulderRoll: number; // small +/- rad rotation passed back for art
}

function legPose(
  cyc: number,
  hipX: number,
  hipY: number,
  stride: number,
  lift: number,
  facing: 1 | -1,
  H: number,
  amp: number,
): { joints: [number, number, number, number, number, number]; foot: [number, number] } {
  const c = ((cyc % 1) + 1) % 1;
  const phase = c * Math.PI * 2;
  const forward = Math.cos(phase); // -1..1
  // Sharpen lift at speed (shorter ground contact, snappier swing)
  const liftBase = Math.max(0, Math.sin(phase)); // 0..1
  const liftCurve = Math.pow(liftBase, 1 - 0.4 * amp);
  // Heel-toe roll: toe-leads on landing, heel-pushes on take-off
  const rollX = facing * Math.sin(phase) * 1.6 * amp;
  const footX = hipX + stride * forward + facing * 1.5 + rollX;
  // Tiny vertical pop at push-off so the foot reads as rolling, not sliding
  const pushPop = Math.max(0, -Math.cos(phase)) * 0.6 * amp;
  const footY = H - lift * liftCurve + pushPop;
  const lifted = liftCurve;

  // Knee bends more when lifted; curved forward arc through swing (not linear).
  const baseBend = 5 + amp * 2;
  const swingBend = 12 * lifted;
  const kneeArc = 4 * Math.sin(phase) * lifted;
  const kneeForward = facing * (3 + 5 * lifted + kneeArc);
  const kneeX = (hipX + footX) / 2 + kneeForward;
  const kneeY = (hipY + footY) / 2 + baseBend + swingBend;

  return {
    joints: [hipX, hipY, kneeX, kneeY, footX, footY],
    foot: [footX, footY],
  };
}

export function computeWalkPose(
  phase: number,
  vx: number,
  onGround: boolean,
  vy: number,
  attacking: boolean,
  facing: 1 | -1,
  H: number,
): Pose {
  const speed = Math.abs(vx);
  // Lower the moving threshold + smooth-step amp so start/stop blends instead of snapping.
  const moving = speed > 4;

  const breath = Math.sin(phase * 0.9) * 1.0;
  const headOffsetY = breath - 2;
  const shoulderYBase = 28 + breath;
  const hipYBase = 56;

  // Stronger lean at sprint (was speed/1700, capped 0.16)
  // Bigger forward lean at run speeds — matches reference run silhouette
  const lean = moving ? facing * Math.min(0.32, speed / 900) : 0;

  if (!onGround && attacking) {
    // ----- Flying kick (airborne basic kick) -----
    // Front leg snaps fully forward & extended, back leg tucks knee under butt,
    // arms sweep back for momentum, torso leans slightly forward.
    const apex = 1 - Math.min(1, Math.abs(vy) / 320);
    // Strike-pose intensity ramps up at apex / on the way down so the impact reads.
    const strike = 0.6 + 0.4 * apex;

    // Front (kicking) leg — straight, forward & slightly up
    const frontHipX = facing * 2;
    const frontKneeX = facing * (16 + 6 * strike);
    const frontKneeY = hipYBase + 2 - 4 * strike;       // raised toward hip line
    const frontFootX = facing * (34 + 10 * strike);     // full reach
    const frontFootY = hipYBase + 4 - 8 * strike;       // strike at hip height

    // Back leg — knee tucked high under body, foot pulled in
    const backHipX = -facing * 2;
    const backKneeX = -facing * 4;
    const backKneeY = hipYBase + 6 - 6 * strike;        // pulled up
    const backFootX = -facing * 8;
    const backFootY = hipYBase + 12 - 10 * strike;      // tucked under butt

    // Arms swept back behind for momentum & balance
    const sy = 28 - 1;
    const backArmHandX = -facing * (18 + 8 * strike);
    const backArmHandY = sy + 2 + 4 * strike;
    const backArmElbowX = -facing * (10 + 4 * strike);
    const backArmElbowY = sy + 4;
    // Front arm: bent across chest as guard
    const frontArmHandX = facing * (4 + 2 * strike);
    const frontArmHandY = sy - 2;
    const frontArmElbowX = facing * 8;
    const frontArmElbowY = sy + 4;

    const lean = facing * (0.18 + 0.10 * strike);

    if (facing > 0) {
      return {
        headOffsetY: -3 - 1 * strike,
        shoulderY: sy,
        hipY: hipYBase - 1,
        legR: [frontHipX, hipYBase, frontKneeX, frontKneeY, frontFootX, frontFootY],
        legL: [backHipX, hipYBase, backKneeX, backKneeY, backFootX, backFootY],
        armL: [-4, sy, frontArmElbowX, frontArmElbowY, frontArmHandX, frontArmHandY],
        armR: [4, sy, backArmElbowX, backArmElbowY, backArmHandX, backArmHandY],
        handL: [frontArmHandX, frontArmHandY],
        handR: [backArmHandX, backArmHandY],
        footR: [frontFootX, frontFootY],
        footL: [backFootX, backFootY],
        lean,
        shoulderRoll: facing * 0.18,
      };
    }
    return {
      headOffsetY: -3 - 1 * strike,
      shoulderY: sy,
      hipY: hipYBase - 1,
      legL: [frontHipX, hipYBase, frontKneeX, frontKneeY, frontFootX, frontFootY],
      legR: [backHipX, hipYBase, backKneeX, backKneeY, backFootX, backFootY],
      armR: [4, sy, frontArmElbowX, frontArmElbowY, frontArmHandX, frontArmHandY],
      armL: [-4, sy, backArmElbowX, backArmElbowY, backArmHandX, backArmHandY],
      handR: [frontArmHandX, frontArmHandY],
      handL: [backArmHandX, backArmHandY],
      footL: [frontFootX, frontFootY],
      footR: [backFootX, backFootY],
      lean,
      shoulderRoll: facing * 0.18,
    };
  }

  if (!onGround) {
    // Four-phase jump: launch (squat-extend) → rising → apex (tuck) → fall (reach for ground).
    // Smoothed with cosine ease so transitions between phases never pop.
    const apexLin = 1 - Math.min(1, Math.abs(vy) / 320);
    const apex = 0.5 - 0.5 * Math.cos(apexLin * Math.PI); // ease in/out (peak at apex)
    const launching = vy < 0;
    const fallLin = launching ? 0 : Math.min(1, vy / 380);
    const fallT = fallLin * fallLin * (3 - 2 * fallLin);
    // Strong push-off at the very start of the jump (when vy is most negative)
    const launchLin = launching ? Math.min(1, -vy / 420) : 0;
    const launchPush = launchLin * launchLin * (3 - 2 * launchLin);
    // Tuck during the second half of the rise / apex
    const tuckLin = launching ? Math.max(0, 1 - (-vy) / 420) : Math.max(0, 1 - vy / 240);
    const tuck = (1 - launchPush) * (tuckLin * tuckLin * (3 - 2 * tuckLin));

    // Air micro-rotation — body slowly tilts forward through the arc
    const airSpin = Math.sin(phase * 0.6) * 0.02;

    // Bicycle pump — alternating leg motion driven by vertical phase, peaks on launch.
    // Adds the visible "kicking up off the ground" feeling.
    const pumpPhase = phase * 1.6;
    const pumpAmt = launchPush * 0.85 + apex * 0.25;
    const legPumpL = Math.sin(pumpPhase) * pumpAmt;
    const legPumpR = -legPumpL;

    // Lead leg drives forward & up on push-off (extended below hip → drives knee high)
    // Trail leg extends down for the kick-off, then folds up
    const kneeUpL = launchPush * (8 + legPumpL * 6) + tuck * 16 - fallT * 4;
    const kneeUpR = launchPush * (8 + legPumpR * 6) + tuck * 16 - fallT * 4;
    const kneeXIn = 4 + tuck * 6 - fallT * 2;
    const kneeYL = hipYBase + (12 - kneeUpL);
    const kneeYR = hipYBase + (12 - kneeUpR);

    // Feet: on launch one foot is still pushing down (extended), the other is rising.
    // On apex both tuck up. On fall both extend down to "stick the landing".
    const footExtendL = launchPush * (10 - legPumpL * 8) + fallT * 14 - tuck * 12;
    const footExtendR = launchPush * (10 - legPumpR * 8) + fallT * 14 - tuck * 12;
    const footYL = hipYBase + 22 + footExtendL;
    const footYR = hipYBase + 22 + footExtendR;
    const legSplayBase = 4 + apex * 4;
    const footXL = -2 - legSplayBase - launchPush * 2;
    const footXR = 2 + legSplayBase + launchPush * 2;

    // Arms — windmill on launch (counter-balance), splay at apex, reach down on landing
    const armSwingX = facing * (8 - launchPush * 14 - apex * 18 - fallT * 4);
    const armSwingY = 24 - launchPush * 10 + apex * 4 + fallT * 10;
    const armCounterX = facing * (-6 + launchPush * 18 + apex * 6);
    const armCounterY = 24 - launchPush * 4 + apex * 2 + fallT * 8;
    const elbowBend = 4 + apex * 3 + launchPush * 2;

    const lean = facing * (0.06 + launchPush * 0.10 + tuck * 0.04 - fallT * 0.06) + airSpin;
    const sqUp = launchPush * 2; // small stretch on push-off

    return {
      headOffsetY: -3 - launchPush * 1 - tuck * 2 + fallT * 0.8,
      shoulderY: 28 - sqUp - tuck * 2 + fallT * 1,
      hipY: hipYBase - sqUp * 0.6 - tuck * 1 + fallT * 0.5,
      legL: [-3, hipYBase, -3 - kneeXIn, kneeYL, footXL, footYL],
      legR: [3, hipYBase, 3 + kneeXIn, kneeYR, footXR, footYR],
      armL: [-4, 28, -10 + armCounterX * 0.3, 30 + elbowBend, armCounterX, armCounterY],
      armR: [4, 28, 10 + armSwingX * 0.3, 30 + elbowBend, armSwingX, armSwingY],
      handL: [armCounterX, armCounterY],
      handR: [armSwingX, armSwingY],
      footL: [footXL, footYL],
      footR: [footXR, footYR],
      lean,
      shoulderRoll: -facing * apex * 0.08 + airSpin * 0.5,
    };
  }

  // Smoothstep amp ramp — eliminates the hard idle/walk snap when vx crosses threshold
  const ampLin = Math.min(1, speed / 160);
  const amp = ampLin * ampLin * (3 - 2 * ampLin);
  // Phase-delayed body bobs (kept from procedural cycle so spine "follows" hips)
  const bobHip = moving ? (1 - Math.cos(phase * 2)) * 0.9 * amp : 0;
  const bobShoulder = moving ? (1 - Math.cos(phase * 2 - 0.5)) * 0.9 * amp : 0;
  const bobHead = moving ? (1 - Math.cos(phase * 2 - 0.9)) * 0.9 * amp : 0;
  const heelDip = moving ? Math.max(0, -Math.cos(phase * 2)) * 1.0 * amp : 0;
  const hipSwayX = moving ? Math.sin(phase) * 1.6 * amp : 0;
  const shoulderY = shoulderYBase - bobShoulder * 0.6;
  const hipY = hipYBase + bobHip * 0.4 + heelDip;
  const shoulderRoll = moving ? Math.sin(phase) * 0.04 * amp : 0;

  // ---- Baked Mixamo walk cycle ----
  // Sample the FBX walk at the current phase and project into renderer space.
  // Renderer Y is down; FBX Y is up → invert. Bone scale = hip→foot pixels.
  const S = H - hipYBase; // ~34 in current rig
  const W = sampleWalk(phase / (Math.PI * 2));

  // Hip/shoulder anchors (with hip sway preserved from procedural code)
  const hxL = -3 + hipSwayX, hxR = 3 + hipSwayX;
  const sxL = -4 - hipSwayX * 0.5, sxR = 4 - hipSwayX * 0.5;

  // Helper: project a baked bone (hip-relative, normalized) → renderer XY
  // anchored at (anchorX, anchorY). amp blends idle→walk so start/stop is smooth.
  const proj = (b: readonly [number, number], anchorX: number, anchorY: number): [number, number] => [
    anchorX + facing * b[0] * S * amp,
    anchorY + (-b[1]) * S * amp,
  ];

  // Legs: knee/foot are hip-relative in the FBX (Hips at origin), so we anchor
  // them off hipY rather than the slightly tilted leg-hip.
  const lHipX = hxL + facing * W.LU[0] * S * amp;
  const lHipY = hipY + (-W.LU[1]) * S * amp;
  const rHipX = hxR + facing * W.RU[0] * S * amp;
  const rHipY = hipY + (-W.RU[1]) * S * amp;
  const lKnee = proj(W.LK, hxL, hipY);
  const lFoot = proj(W.LF, hxL, hipY);
  const rKnee = proj(W.RK, hxR, hipY);
  const rFoot = proj(W.RF, hxR, hipY);

  const L = {
    joints: [lHipX, lHipY, lKnee[0], lKnee[1], lFoot[0], lFoot[1]] as [number, number, number, number, number, number],
    foot: lFoot,
  };
  const R = {
    joints: [rHipX, rHipY, rKnee[0], rKnee[1], rFoot[0], rFoot[1]] as [number, number, number, number, number, number],
    foot: rFoot,
  };

  // Arms: elbows + hands are hip-relative in the FBX. Anchor off
  // (sxL/sxR, hipY) so they ride the body. Idle micro-sway only when amp is
  // tiny (i.e. stopping/starting).
  const idleSway = (1 - amp) * Math.sin(phase * 0.7) * 0.6;
  const lElbow = proj(W.LE, sxL, hipY);
  const lHandP = proj(W.LH, sxL, hipY);
  const rElbow = proj(W.RE, sxR, hipY);
  const rHandP = proj(W.RH, sxR, hipY);

  const handLX = lHandP[0] + idleSway, handLY = lHandP[1];
  const handRX = rHandP[0] - idleSway, handRY = rHandP[1];
  const elbowLX = lElbow[0], elbowLY = lElbow[1];
  const elbowRX = rElbow[0], elbowRY = rElbow[1];


  // Idle fighting stance — feet planted wide, knees bent, fists up in guard.
  // Subtle breathing keeps it from feeling frozen. Activates when not moving
  // and not attacking.
  if (!moving && !attacking) {
    const idleBreath = Math.sin(phase * 1.4) * 0.6;
    const sway = Math.sin(phase * 0.9) * 0.4;
    const stanceHipY = hipY + idleBreath * 0.5;
    const stanceShoulderY = shoulderY + idleBreath * 0.3;

    // Stance: lead foot forward (in facing direction), back foot planted behind.
    const leadHipX = facing * 1;
    const backHipX = -facing * 3;
    const leadFootX = facing * 6;
    const leadFootY = H;
    const backFootX = -facing * 10;
    const backFootY = H;
    const leadKneeX = facing * 4;
    const leadKneeY = stanceHipY + 20;
    const backKneeX = -facing * 7;
    const backKneeY = stanceHipY + 18;

    // Front arm (toward opponent): elbow tucked, fist raised at chin level.
    const frontHandX = facing * 8 + sway;
    const frontHandY = stanceShoulderY - 6;
    const frontElbowX = facing * 10;
    const frontElbowY = stanceShoulderY + 8;
    // Back arm: elbow drawn back, fist tucked near jaw on the back side.
    const rearHandX = -facing * 2 + sway * 0.5;
    const rearHandY = stanceShoulderY - 2;
    const rearElbowX = -facing * 9;
    const rearElbowY = stanceShoulderY + 10;

    const sxLead = facing * 3;
    const sxRear = -facing * 4;

    // Map lead/rear back to L/R based on facing
    const legLead: [number, number, number, number, number, number] =
      [leadHipX, stanceHipY, leadKneeX, leadKneeY, leadFootX, leadFootY];
    const legBack: [number, number, number, number, number, number] =
      [backHipX, stanceHipY, backKneeX, backKneeY, backFootX, backFootY];
    const armFront: [number, number, number, number, number, number] =
      [sxLead, stanceShoulderY, frontElbowX, frontElbowY, frontHandX, frontHandY];
    const armRear: [number, number, number, number, number, number] =
      [sxRear, stanceShoulderY, rearElbowX, rearElbowY, rearHandX, rearHandY];

    // facing > 0: lead is the right-side limb; facing < 0: lead is the left-side.
    const isRightLead = facing > 0;
    return {
      headOffsetY: headOffsetY - 1,
      shoulderY: stanceShoulderY,
      hipY: stanceHipY,
      legL: isRightLead ? legBack : legLead,
      legR: isRightLead ? legLead : legBack,
      armL: isRightLead ? armRear : armFront,
      armR: isRightLead ? armFront : armRear,
      handL: isRightLead ? [rearHandX, rearHandY] : [frontHandX, frontHandY],
      handR: isRightLead ? [frontHandX, frontHandY] : [rearHandX, rearHandY],
      footL: isRightLead ? [backFootX, backFootY] : [leadFootX, leadFootY],
      footR: isRightLead ? [leadFootX, leadFootY] : [backFootX, backFootY],
      lean: facing * 0.06,
      shoulderRoll: -facing * 0.08,
    };
  }

  if (attacking) {
    const ahx = facing * 28;
    const ahy = shoulderY + 4;
    const aex = facing * 14;
    const aey = shoulderY + 2;
    if (facing > 0) {
      return {
        headOffsetY: headOffsetY - bobHead * 0.4,
        shoulderY, hipY,
        legL: L.joints, legR: R.joints,
        armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
        armR: [sxR, shoulderY, aex, aey, ahx, ahy],
        handL: [handLX, handLY],
        handR: [ahx, ahy],
        footL: L.foot, footR: R.foot,
        lean, shoulderRoll,
      };
    }
    return {
      headOffsetY: headOffsetY - bobHead * 0.4,
      shoulderY, hipY,
      legL: L.joints, legR: R.joints,
      armL: [sxL, shoulderY, aex, aey, ahx, ahy],
      armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
      handL: [ahx, ahy],
      handR: [handRX, handRY],
      footL: L.foot, footR: R.foot,
      lean, shoulderRoll,
    };
  }

  return {
    headOffsetY: headOffsetY - bobHead * 0.4,
    shoulderY, hipY,
    legL: L.joints, legR: R.joints,
    armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
    armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
    handL: [handLX, handLY],
    handR: [handRX, handRY],
    footL: L.foot, footR: R.foot,
    lean, shoulderRoll,
  };
}

// ----- Attack pose (signature melee) -----
// progress: 0 wind-up start → 1 recover end. We split:
//   0..wp: wind-up (arm cocks back), wp..wp+ap: active strike, rest: recover.
export interface AttackTiming { wp: number; ap: number; }

export function computeAttackPose(
  walk: Pose,
  kind: string,
  progress: number,
  timing: AttackTiming,
  facing: 1 | -1,
): Pose {
  const p = Math.max(0, Math.min(1, progress));
  const inWind = p < timing.wp;
  const inActive = p >= timing.wp && p < timing.wp + timing.ap;
  const wt = inWind ? p / timing.wp : 1;
  const at = inActive ? (p - timing.wp) / timing.ap : (p < timing.wp ? 0 : 1);

  const out: Pose = {
    ...walk,
    armL: [...walk.armL] as Pose["armL"],
    armR: [...walk.armR] as Pose["armR"],
    handL: [...walk.handL] as Pose["handL"],
    handR: [...walk.handR] as Pose["handR"],
  };

  const sy = walk.shoulderY;
  const sxF = facing > 0 ? 4 : -4;

  const setStrike = (reach: number, height: number) => {
    const handX = facing * reach;
    const handY = sy + height;
    const elbowX = facing * (reach * 0.45);
    const elbowY = sy + height * 0.5 + 2;
    if (facing > 0) {
      out.armR = [sxF, sy, elbowX, elbowY, handX, handY];
      out.handR = [handX, handY];
    } else {
      out.armL = [sxF, sy, elbowX, elbowY, handX, handY];
      out.handL = [handX, handY];
    }
  };

  const setCock = (back: number, height: number) => {
    const handX = -facing * back;
    const handY = sy + height;
    const elbowX = -facing * (back * 0.5);
    const elbowY = sy + height * 0.4 - 2;
    if (facing > 0) {
      out.armR = [sxF, sy, elbowX, elbowY, handX, handY];
      out.handR = [handX, handY];
    } else {
      out.armL = [sxF, sy, elbowX, elbowY, handX, handY];
      out.handL = [handX, handY];
    }
  };

  switch (kind) {
    case "basicKick": {
      // Front snap kick: plant support leg, chamber knee high, snap foot
      // forward at hip height, retract. Body pivots over the support hip.
      const hipY = walk.hipY;
      const groundY = hipY + 34; // feet plant on ground (FIGHTER_H - hipYBase)
      const recT = !inWind && !inActive
        ? Math.min(1, Math.max(0, (p - timing.wp - timing.ap) / Math.max(0.0001, 1 - timing.wp - timing.ap)))
        : 0;
      const rt = recT;

      // Easing helpers
      const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
      const easeIn  = (t: number) => t * t;

      // Phase-driven kick extension and chamber.
      // chamber = how high the knee is pulled up (0..1)
      // extend  = how far the foot has snapped forward (0..1, can briefly exceed 1)
      let chamber: number, extend: number, retract: number;
      if (inWind) {
        chamber = easeOut(wt);     // pull knee up fast
        extend = 0;
        retract = 0;
      } else if (inActive) {
        // Knee stays chambered while shin whips out
        chamber = 1 - 0.25 * at;
        // Slight overshoot at peak for snap (1.08 then settle)
        const e = easeOut(at);
        extend = e * (1 + 0.08 * Math.sin(at * Math.PI));
        retract = 0;
      } else {
        // Recovery: pull leg back in, drop foot back to ground
        const r = easeIn(rt);
        chamber = 1 - 0.6 * r;
        extend = 1 - r;
        retract = r;
      }

      // Kicking leg geometry (in fighter-local space, +x = facing)
      // Hip is at (±3, hipY). Knee chambers up toward chest, then snaps forward.
      const hipKX = facing * 2;
      const hipKY = hipY;

      // Knee position: high & forward when chambered, drives forward as leg extends
      const kneeBaseY = hipY - 14 * chamber;          // up to ~14px above hip = chest height
      const kneeBaseX = facing * (6 + 10 * chamber);  // pulled in toward body
      // As leg extends, knee straightens out forward
      const kneeX = kneeBaseX + facing * 8 * extend;
      const kneeY = kneeBaseY + 6 * extend;           // drops slightly as leg straightens

      // Foot: chambered tight under butt, then whips out to full extension at hip height
      const chamberFootX = facing * 4;
      const chamberFootY = hipY + 2 - 18 * chamber;   // tucked up high
      const extendFootX = facing * (38 + 8 * extend); // full reach past knee
      const extendFootY = hipY + 4;                   // strike at hip height
      const footX = chamberFootX * (1 - extend) + extendFootX * extend;
      const footY = chamberFootY * (1 - extend) + extendFootY * extend;

      // Support leg: planted flat on the ground, slight bend for stability,
      // shifts under the body weight (toward the kicking side hip).
      const supX = -facing * 2;
      const supKneeX = -facing * 4;
      const supKneeY = hipY + 18;
      const supFootX = -facing * 1;
      const supFootY = groundY;                       // ON the ground — no float

      if (facing > 0) {
        out.legR = [hipKX, hipKY, kneeX, kneeY, footX, footY];
        out.footR = [footX, footY];
        out.legL = [supX, hipY, supKneeX, supKneeY, supFootX, supFootY];
        out.footL = [supFootX, supFootY];
      } else {
        out.legL = [hipKX, hipKY, kneeX, kneeY, footX, footY];
        out.footL = [footX, footY];
        out.legR = [supX, hipY, supKneeX, supKneeY, supFootX, supFootY];
        out.footR = [supFootX, supFootY];
      }

      // Arms throw back for momentum (real kicks pull arms opposite the leg).
      // Front arm pulls in to guard the face, back arm flares behind for balance.
      const armPhase = inWind ? wt * 0.6 : (inActive ? 0.6 + at * 0.4 : 1 - rt);
      const backHandX = -facing * (10 + 14 * armPhase);
      const backHandY = sy + 6 + 4 * armPhase;
      const backElbowX = -facing * (6 + 6 * armPhase);
      const backElbowY = sy + 4;
      const guardHandX = facing * (4 + 6 * armPhase);
      const guardHandY = sy - 2 - 4 * armPhase;       // raised toward face
      const guardElbowX = facing * 6;
      const guardElbowY = sy + 2;

      if (facing > 0) {
        // Right side kicks → left arm guards (front), right arm flares back
        out.armL = [-sxF, sy, guardElbowX, guardElbowY, guardHandX, guardHandY];
        out.handL = [guardHandX, guardHandY];
        out.armR = [sxF, sy, backElbowX, backElbowY, backHandX, backHandY];
        out.handR = [backHandX, backHandY];
      } else {
        out.armR = [sxF, sy, guardElbowX, guardElbowY, guardHandX, guardHandY];
        out.handR = [guardHandX, guardHandY];
        out.armL = [-sxF, sy, backElbowX, backElbowY, backHandX, backHandY];
        out.handL = [backHandX, backHandY];
      }

      // Body lean: chamber pulls torso back, snap throws it slightly forward,
      // then settles. Shoulder roll opens hip into the kick.
      const tilt = inWind ? -0.18 * wt
                : inActive ? -0.18 + 0.30 * at
                : 0.12 * (1 - rt);
      out.lean = (walk.lean ?? 0) + facing * tilt;
      out.shoulderRoll = (walk.shoulderRoll ?? 0) + facing * (0.10 + 0.10 * extend);
      // Head tracks the action: tucks slightly on chamber, pushes forward on snap
      out.headOffsetY = walk.headOffsetY + (inWind ? 1 * wt : (inActive ? -1.5 * at : -0.5 * (1 - rt)));
      // Hips dip under body weight onto support leg
      out.hipY = walk.hipY + 1 * chamber;
      break;
    }
    case "heatPunch": {
      if (inWind) setCock(18 + 8 * wt, -2 - 6 * wt);
      else if (inActive) setStrike(28 + 12 * at, 2);
      else setStrike(30, 4);
      break;
    }
    case "crowbar": {
      // Overhead swing
      const a = inWind ? -1.2 + 0.4 * wt : (inActive ? -0.8 + 2.0 * at : 1.2);
      const r = 28;
      const handX = facing * Math.cos(a) * r;
      const handY = sy + Math.sin(a) * r + 6;
      if (facing > 0) {
        out.armR = [sxF, sy, facing * 12, sy - 4, handX, handY];
        out.handR = [handX, handY];
      } else {
        out.armL = [sxF, sy, facing * 12, sy - 4, handX, handY];
        out.handL = [handX, handY];
      }
      break;
    }
    case "groundSmash": {
      if (inWind) {
        // both fists raised
        out.armL = [-4, sy, -10, sy - 8 - 6 * wt, -14, sy - 18 - 8 * wt];
        out.armR = [4, sy, 10, sy - 8 - 6 * wt, 14, sy - 18 - 8 * wt];
        out.handL = [-14, sy - 18 - 8 * wt];
        out.handR = [14, sy - 18 - 8 * wt];
      } else {
        out.armL = [-4, sy, -8, sy + 8, -10, sy + 22];
        out.armR = [4, sy, 8, sy + 8, 10, sy + 22];
        out.handL = [-10, sy + 22];
        out.handR = [10, sy + 22];
      }
      break;
    }
    case "speedFlurry":
    case "phaseStrike": {
      // Rapid alternating jabs
      const pulse = Math.sin(p * Math.PI * 12);
      const reach = 22 + pulse * 6;
      const handX = facing * reach;
      const handY = sy + 4;
      if (pulse > 0) {
        out.armR = [sxF, sy, facing * 12, sy + 2, handX, handY];
        out.handR = [handX, handY];
      } else {
        out.armL = [sxF, sy, facing * 12, sy + 2, handX, handY];
        out.handL = [handX, handY];
      }
      break;
    }
    case "webYank": {
      // arm extended forward palm-out
      if (inWind) setCock(8 + 4 * wt, -4);
      else setStrike(34, -2);
      break;
    }
    case "repulsor": {
      // palm forward
      const reach = inActive ? 22 + 6 * at : 18;
      setStrike(reach, 4);
      break;
    }
    case "batCombo": {
      // throw motion then kick
      if (inWind) setCock(14, -8);
      else if (inActive) setStrike(28 + 6 * at, 0);
      else setStrike(28, 4);
      break;
    }
    case "laserSweep": {
      // Menacing beam stance: chin up, chest pushed forward, weight back on the
      // rear leg, lead leg planted forward. Hands clenched at the sides — one
      // slightly forward like channeling power, the other curled tight back.
      // Subtle vertical sway (charging tremor) on the active sustain.
      const tremor = inActive ? Math.sin(at * Math.PI * 14) * 1.2 : 0;
      const cock = inWind ? wt : 1;
      // Forward chest push grows during wind-up, peaks during sustain
      const push = 2 * cock;
      // Head tipped back so the eyes (beam origin) face slightly up — menacing.
      out.headOffsetY = walk.headOffsetY - 3 - cock * 1.5 + tremor * 0.3;
      // Slight backward body lean (tilted into the beam direction)
      out.lean = (walk.lean ?? 0) + facing * (-0.12 - cock * 0.06);
      out.shoulderRoll = (walk.shoulderRoll ?? 0) + facing * 0.08;

      // Lead arm: held at the side, fist curled forward like braced for the beam recoil.
      // Trail arm: pulled back tight, elbow flared, fist clenched at the hip (power channel).
      const leadHandX = facing * (8 + push);
      const leadHandY = sy + 14 + tremor;
      const leadElbowX = facing * (7 + push * 0.5);
      const leadElbowY = sy + 7;
      const trailHandX = -facing * 6;
      const trailHandY = sy + 18 + tremor * 0.6;
      const trailElbowX = -facing * 9;
      const trailElbowY = sy + 8;
      if (facing > 0) {
        out.armR = [sxF, sy, leadElbowX, leadElbowY, leadHandX, leadHandY];
        out.handR = [leadHandX, leadHandY];
        out.armL = [-sxF, sy, trailElbowX, trailElbowY, trailHandX, trailHandY];
        out.handL = [trailHandX, trailHandY];
      } else {
        out.armL = [sxF, sy, leadElbowX, leadElbowY, leadHandX, leadHandY];
        out.handL = [leadHandX, leadHandY];
        out.armR = [-sxF, sy, trailElbowX, trailElbowY, trailHandX, trailHandY];
        out.handR = [trailHandX, trailHandY];
      }

      // Power stance legs: rear leg planted back, lead leg forward + slightly bent.
      // Only override when grounded (walk pose's airborne legs already read fine).
      const hipY = walk.hipY;
      const rearX = -facing * 8;
      const leadX = facing * 6;
      const rearKneeX = -facing * 7;
      const leadKneeX = facing * 5;
      const rearKneeY = hipY + 14;
      const leadKneeY = hipY + 16;
      const rearFootY = hipY + 24;
      const leadFootY = hipY + 24;
      if (facing > 0) {
        out.legL = [-3, hipY, rearKneeX, rearKneeY, rearX, rearFootY];
        out.footL = [rearX, rearFootY];
        out.legR = [3, hipY, leadKneeX, leadKneeY, leadX, leadFootY];
        out.footR = [leadX, leadFootY];
      } else {
        out.legR = [3, hipY, rearKneeX, rearKneeY, rearX, rearFootY];
        out.footR = [rearX, rearFootY];
        out.legL = [-3, hipY, leadKneeX, leadKneeY, leadX, leadFootY];
        out.footL = [leadX, leadFootY];
      }
      break;
    }
    case "bamfPunch": {
      // Lightning-fast straight cross. Cock back briefly, then snap forward with full extension.
      if (inWind) {
        setCock(14 + 6 * wt, -4 - 2 * wt);
        // Off-hand guards the face
        const gx = -facing * 6, gy = sy - 2;
        if (facing > 0) { out.armL = [-sxF, sy, -facing * 4, sy - 4, gx, gy]; out.handL = [gx, gy]; }
        else { out.armR = [-sxF, sy, -facing * 4, sy - 4, gx, gy]; out.handR = [gx, gy]; }
      } else if (inActive) {
        // Foreshortened limb-stretch: arm reach grows past natural length to fake
        // a fist coming straight at the camera (z-extrusion illusion).
        const stretch = 1 + at * 0.55; // up to 1.55x
        const reach = (30 + 12 * at) * stretch;
        setStrike(reach, -1);
        // Push the elbow further forward too so the limb segments compress (foreshortening)
        if (facing > 0) {
          out.armR = [sxF, sy, facing * (reach * 0.65), sy + 1, facing * reach, sy - 1];
          out.handR = [facing * reach, sy - 1];
        } else {
          out.armL = [sxF, sy, facing * (reach * 0.65), sy + 1, facing * reach, sy - 1];
          out.handL = [facing * reach, sy - 1];
        }
        out.lean = (out.lean ?? 0) + facing * 0.18;
      } else {
        setStrike(28, 2);
      }
      break;
    }
    case "bamfKick": {
      // Spinning roundhouse: lead leg arcs from low → horizontal → follow-through.
      const hipY = walk.hipY;
      // Arc angle: starts cocked back-low (~-0.6), sweeps forward to ~+1.4 during active
      const a = inWind
        ? -0.6 + 0.5 * wt
        : (inActive ? -0.1 + 1.5 * at : 1.4);
      // Foreshorten leg on the active strike for a 3D push toward the camera
      const stretch = inActive ? 1 + at * 0.5 : 1;
      const r = 26 * stretch;
      const footX = facing * Math.cos(a) * r;
      const footY = hipY + 8 + Math.sin(a) * r * 0.6;
      const kneeX = facing * Math.cos(a) * (r * 0.6);
      const kneeY = hipY + 10 + Math.sin(a) * r * 0.3;
      // Lead leg = back leg whips forward (use legR for facing right, legL for left)
      if (facing > 0) {
        out.legR = [3, hipY, kneeX, kneeY, footX, footY];
        out.footR = [footX, footY];
        // Plant leg slightly bent
        out.legL = [-3, hipY, -4, hipY + 14, -6, hipY + 24];
        out.footL = [-6, hipY + 24];
      } else {
        out.legL = [-3, hipY, kneeX, kneeY, footX, footY];
        out.footL = [footX, footY];
        out.legR = [3, hipY, 4, hipY + 14, 6, hipY + 24];
        out.footR = [6, hipY + 24];
      }
      // Arms: one out for balance, one tucked
      const balX = -facing * 16, balY = sy + 2;
      if (facing > 0) {
        out.armL = [-sxF, sy, -facing * 8, sy + 2, balX, balY];
        out.handL = [balX, balY];
        out.armR = [sxF, sy, facing * 4, sy + 4, facing * 6, sy + 8];
        out.handR = [facing * 6, sy + 8];
      } else {
        out.armR = [-sxF, sy, -facing * 8, sy + 2, balX, balY];
        out.handR = [balX, balY];
        out.armL = [sxF, sy, facing * 4, sy + 4, facing * 6, sy + 8];
        out.handL = [facing * 6, sy + 8];
      }
      // Body lean into the spin
      out.lean = (out.lean ?? 0) + facing * 0.22 * (inActive ? 1 : 0.4);
      out.headOffsetY -= 1;
      break;
    }
    case "supermanPunch": {
      // Single-arm hero punch — lead arm fully extended toward camera with
      // exaggerated foreshortening, body torqued behind it for power. Trail
      // arm whipped back along the body for streamline silhouette.
      const hipY = walk.hipY;
      // Wind-up: cock the lead fist back behind the head; sweep into a forward
      // straight cross during active; settle slightly forward in recovery.
      let stretch = 1, reach = 30, height = -2;
      if (inWind) {
        // arm pulled back & up — body coiled like a spring
        const k = wt;
        const handX = -facing * (10 + 6 * k);
        const handY = sy - 2 - 6 * k;
        const elbowX = -facing * (12 + 4 * k);
        const elbowY = sy - 2 - 2 * k;
        if (facing > 0) { out.armR = [sxF, sy, elbowX, elbowY, handX, handY]; out.handR = [handX, handY]; }
        else { out.armL = [sxF, sy, elbowX, elbowY, handX, handY]; out.handL = [handX, handY]; }
      } else if (inActive) {
        // Foreshortened: as `at` goes 0→1, the arm appears to extend toward
        // the camera. Elbow pushed forward so segment lengths compress.
        stretch = 1 + at * 0.85;       // up to 1.85x
        reach = (32 + 18 * at) * stretch;
        height = -3 + at * 4;
        const handX = facing * reach;
        const handY = sy + height;
        const elbowX = facing * (reach * 0.55);
        const elbowY = sy + height * 0.4 + 2;
        if (facing > 0) { out.armR = [sxF, sy, elbowX, elbowY, handX, handY]; out.handR = [handX, handY]; }
        else { out.armL = [sxF, sy, elbowX, elbowY, handX, handY]; out.handL = [handX, handY]; }
      } else {
        setStrike(34, 4);
      }
      // Trail arm pinned along the spine for aerodynamic silhouette
      const trailHandX = -facing * (14 + (inActive ? at * 8 : 0));
      const trailHandY = sy + 18;
      if (facing > 0) {
        out.armL = [-sxF, sy, -facing * 6, sy + 8, trailHandX, trailHandY];
        out.handL = [trailHandX, trailHandY];
      } else {
        out.armR = [-sxF, sy, -facing * 6, sy + 8, trailHandX, trailHandY];
        out.handR = [trailHandX, trailHandY];
      }
      // Legs trailed straight back like a missile
      const back = -facing;
      const trailReach = 30 + (inActive ? at * 10 : 0);
      const legY = hipY + 20;
      const footL: [number, number] = [back * trailReach - 4, legY + 2];
      const footR: [number, number] = [back * trailReach + 4, legY - 2];
      out.legL = [-3, hipY, back * 14 - 3, hipY + 10, footL[0], footL[1]];
      out.legR = [3, hipY, back * 14 + 3, hipY + 10, footR[0], footR[1]];
      out.footL = footL; out.footR = footR;
      // Body torque: lean strongly into the punch; head pushed forward of shoulders.
      const torque = inActive ? 0.32 + at * 0.12 : (inWind ? -0.10 * wt : 0.32);
      out.lean = (walk.lean ?? 0) + facing * torque;
      out.shoulderRoll = (walk.shoulderRoll ?? 0) + facing * 0.18;
      out.headOffsetY = walk.headOffsetY - 2 + (inActive ? at * 1.5 : 0);
      break;
    }
    case "homelanderPunch": {
      // Two-fist superman dive: BOTH arms locked together out front in a
      // wedge formation. Heavier, thicker silhouette. Body tucked tight.
      const hipY = walk.hipY;
      let reach = 28;
      if (inWind) {
        // Both fists drawn back to chest, elbows flared
        const k = wt;
        const cx1 = -facing * (4 + 4 * k);
        const cy1 = sy + 2;
        out.armL = [-4, sy, -facing * 8, sy + 4, cx1 - 4, cy1];
        out.armR = [4, sy, -facing * 8, sy + 4, cx1 + 4, cy1];
        out.handL = [cx1 - 4, cy1];
        out.handR = [cx1 + 4, cy1];
      } else if (inActive) {
        // BOTH arms thrust forward together, foreshortened toward the camera.
        const stretch = 1 + at * 0.9;
        reach = (32 + 20 * at) * stretch;
        const handY = sy - 2;
        const elbowReach = reach * 0.55;
        // Fists side-by-side (slight vertical stagger reads as 3D depth)
        const handAX = facing * reach;
        const handAY = handY - 2;
        const handBX = facing * (reach - 4);
        const handBY = handY + 4;
        out.armR = [4, sy, facing * elbowReach + 2, sy + 1, handAX, handAY];
        out.armL = [-4, sy, facing * elbowReach - 2, sy + 3, handBX, handBY];
        out.handR = [handAX, handAY];
        out.handL = [handBX, handBY];
      } else {
        const handY = sy + 2;
        out.armR = [4, sy, facing * 14, sy + 2, facing * 28, handY - 2];
        out.armL = [-4, sy, facing * 14, sy + 4, facing * 24, handY + 4];
        out.handR = [facing * 28, handY - 2];
        out.handL = [facing * 24, handY + 4];
      }
      // Legs streamed straight back, tight together
      const back = -facing;
      const trailReach = 32 + (inActive ? at * 12 : 0);
      const legY = hipY + 18;
      const footL: [number, number] = [back * trailReach - 3, legY + 2];
      const footR: [number, number] = [back * trailReach + 3, legY - 2];
      out.legL = [-3, hipY, back * 16 - 2, hipY + 8, footL[0], footL[1]];
      out.legR = [3, hipY, back * 16 + 2, hipY + 8, footR[0], footR[1]];
      out.footL = footL; out.footR = footR;
      // Heavier forward lean — committing his whole body weight
      const torque = inActive ? 0.40 + at * 0.10 : (inWind ? -0.06 * wt : 0.40);
      out.lean = (walk.lean ?? 0) + facing * torque;
      out.shoulderRoll = (walk.shoulderRoll ?? 0) + facing * 0.06;
      out.headOffsetY = walk.headOffsetY - 1 + (inActive ? at * 1 : 0);
      break;
    }
  }
  return out;
}

// Tumbling ragdoll pose used while a fighter is launched.
// Each limb is a damped pendulum with its own phase offset so the body
// flails organically instead of snapping in lockstep — gives a fluid,
// "rag-doll" silhouette at any framerate.
export function computeRagdollPose(t: number, _H: number, bodyAng: number = 0): Pose {
  const sy = 30;
  const hipY = 56;
  // Energy decays slower so the body keeps flailing for the full ragdoll window
  const energy = Math.exp(-t * 0.45);
  const spin = t * 13;
  // Per-limb phase offsets — golden-ratio spaced for natural asymmetry
  const phLA = spin * 1.23 + 0.0;
  const phRA = spin * 1.07 + 1.7;
  const phLL = spin * 0.91 + 3.2;
  const phRL = spin * 1.13 + 4.6;
  // Secondary high-frequency wobble (whip-like overshoot)
  const wob = Math.sin(t * 28) * 2.2 * energy;
  const wob2 = Math.cos(t * 19 + 0.7) * 1.8 * energy;

  // World-down vector projected into the body's local space.
  // The body is rotated by bodyAng at draw time, so to make limbs always
  // dangle toward real gravity we add this constant pull.
  const gx = Math.sin(-bodyAng);
  const gy = Math.cos(-bodyAng);
  // Gravity droop strength fades up as energy drops (limbs go limp as they tire)
  const droop = (1 - energy * 0.7) * 14;

  // Larger swing amplitudes so the limbs visibly flail
  const armSwL = (Math.cos(phLA) * 11 + Math.sin(phLA * 1.7) * 5) * energy;
  const armSwR = (Math.cos(phRA) * 11 + Math.sin(phRA * 1.7) * 5) * energy;
  const armDpL = (Math.sin(phLA) * 9 + 3) * energy + 6;
  const armDpR = (Math.sin(phRA) * 9 + 3) * energy + 6;

  const legSwL = (Math.cos(phLL) * 10 + Math.sin(phLL * 1.4) * 5) * energy;
  const legSwR = (Math.cos(phRL) * 10 + Math.sin(phRL * 1.4) * 5) * energy;
  const legDpL = (Math.sin(phLL) * 7) * energy + 6;
  const legDpR = (Math.sin(phRL) * 7) * energy + 6;

  // Shoulder + hip micro-shift from torso flop
  const torsoX = Math.sin(spin * 0.7) * 3 * energy;
  const torsoY = Math.cos(spin * 0.9) * 2 * energy;

  // Hand & foot positions: base swing + gravity droop pulling toward world-down
  const handLX = -16 + armSwL + gx * droop * 0.9;
  const handLY = sy + 18 + armDpL * 0.7 + wob + gy * droop * 0.9;
  const handRX = 16 + armSwR + gx * droop * 0.9;
  const handRY = sy + 18 + armDpR * 0.7 - wob + gy * droop * 0.9;
  const footLX = -13 + legSwL + gx * droop * 0.6;
  const footLY = hipY + 22 + legDpL * 0.7 + gy * droop * 0.6;
  const footRX = 13 + legSwR + gx * droop * 0.6;
  const footRY = hipY + 22 + legDpR * 0.7 + gy * droop * 0.6;

  return {
    headOffsetY: -2 + Math.sin(spin) * 2.4 * energy + wob * 0.4 + gy * droop * 0.15,
    shoulderY: sy + torsoY,
    hipY: hipY + torsoY * 0.5,
    legL: [-3 + torsoX, hipY, -7 + legSwL * 0.5 + gx * droop * 0.3, hipY + 12 + legDpL + gy * droop * 0.3, footLX, footLY],
    legR: [3 + torsoX, hipY, 7 + legSwR * 0.5 + gx * droop * 0.3, hipY + 12 + legDpR + gy * droop * 0.3, footRX, footRY],
    armL: [-4 + torsoX, sy, -10 + armSwL * 0.5 + gx * droop * 0.5, sy + 10 + armDpL + gy * droop * 0.5, handLX, handLY],
    armR: [4 + torsoX, sy, 10 + armSwR * 0.5 + gx * droop * 0.5, sy + 10 + armDpR + gy * droop * 0.5, handRX, handRY],
    handL: [handLX, handLY],
    handR: [handRX, handRY],
    footL: [footLX, footLY],
    footR: [footRX, footRY],
    lean: spin * 0.3,
    shoulderRoll: Math.sin(spin * 0.8) * 0.18 * energy + wob2 * 0.02,
  };
}

// ----- Flight pose -----
// Menacing hover stance — mirrors the Homelander laser stance: chin up, chest
// pushed forward, lead fist clenched at the side, trail fist tucked to the hip,
// power-stance legs (rear planted back, lead leg forward & slightly bent).
// A subtle hover bob + faint bank are layered on so it reads as airborne.
export function computeFlightPose(
  phase: number,
  vx: number,
  vy: number,
  hoverPhase: number,
  facing: 1 | -1,
  _H: number,
): Pose {
  // Hover bob (vertical) + faint side sway with motion
  const bob = Math.sin(hoverPhase) * 1.2;
  const tremor = Math.sin(phase * 4) * 0.4; // tiny chest tremor for life
  const bank = Math.max(-0.32, Math.min(0.32, vx / 620));

  const shoulderY = 28 + bob;
  const hipY = 56 + bob * 0.5;
  // Chin tipped up, head pushed slightly forward
  const headOffsetY = -2 + bob * 0.3 - 3.5;

  // Body leans subtly backward (into the menace) with vertical motion influence.
  const verticalLean = vy < -40 ? -0.05 : (vy > 40 ? 0.05 : 0);
  const lean = facing * (-0.14) + verticalLean;
  const shoulderRoll = facing * 0.08 + bank * 0.4;

  // ---- Arms: lead fist forward at side, trail fist tucked at hip ----
  const sxF = facing > 0 ? 4 : -4;
  const push = 2;
  const leadHandX = facing * (8 + push);
  const leadHandY = shoulderY + 14 + tremor;
  const leadElbowX = facing * (7 + push * 0.5);
  const leadElbowY = shoulderY + 7;
  const trailHandX = -facing * 6;
  const trailHandY = shoulderY + 18 + tremor * 0.6;
  const trailElbowX = -facing * 9;
  const trailElbowY = shoulderY + 8;

  let armR: [number, number, number, number, number, number];
  let armL: [number, number, number, number, number, number];
  if (facing > 0) {
    armR = [sxF, shoulderY, leadElbowX, leadElbowY, leadHandX, leadHandY];
    armL = [-sxF, shoulderY, trailElbowX, trailElbowY, trailHandX, trailHandY];
  } else {
    armL = [sxF, shoulderY, leadElbowX, leadElbowY, leadHandX, leadHandY];
    armR = [-sxF, shoulderY, trailElbowX, trailElbowY, trailHandX, trailHandY];
  }

  // ---- Legs: power stance (rear leg back, lead leg forward & slightly bent) ----
  const rearX = -facing * 8;
  const leadX = facing * 6;
  const rearKneeX = -facing * 7;
  const leadKneeX = facing * 5;
  const rearKneeY = hipY + 14;
  const leadKneeY = hipY + 16;
  const rearFootY = hipY + 24 + bob * 0.4;
  const leadFootY = hipY + 24 + bob * 0.4;

  let legR: [number, number, number, number, number, number];
  let legL: [number, number, number, number, number, number];
  if (facing > 0) {
    legL = [-3, hipY, rearKneeX, rearKneeY, rearX, rearFootY];
    legR = [3, hipY, leadKneeX, leadKneeY, leadX, leadFootY];
  } else {
    legR = [3, hipY, rearKneeX, rearKneeY, rearX, rearFootY];
    legL = [-3, hipY, leadKneeX, leadKneeY, leadX, leadFootY];
  }

  return {
    headOffsetY,
    shoulderY,
    hipY,
    legL, legR,
    armL, armR,
    handL: [armL[4], armL[5]],
    handR: [armR[4], armR[5]],
    footL: [legL[4], legL[5]],
    footR: [legR[4], legR[5]],
    lean,
    shoulderRoll,
  };
}


// Linear blend between two poses (a→b by t in 0..1). Optionally override lean.
export function blendPose(a: Pose, b: Pose, t: number, leanOverride?: number): Pose {
  const u = Math.max(0, Math.min(1, t));
  const lerp = (x: number, y: number) => x + (y - x) * u;
  const lerp6 = (
    A: [number, number, number, number, number, number],
    B: [number, number, number, number, number, number],
  ): [number, number, number, number, number, number] =>
    [lerp(A[0], B[0]), lerp(A[1], B[1]), lerp(A[2], B[2]), lerp(A[3], B[3]), lerp(A[4], B[4]), lerp(A[5], B[5])];
  const lerp2 = (A: [number, number], B: [number, number]): [number, number] =>
    [lerp(A[0], B[0]), lerp(A[1], B[1])];
  return {
    headOffsetY: lerp(a.headOffsetY, b.headOffsetY),
    shoulderY: lerp(a.shoulderY, b.shoulderY),
    hipY: lerp(a.hipY, b.hipY),
    legL: lerp6(a.legL, b.legL), legR: lerp6(a.legR, b.legR),
    armL: lerp6(a.armL, b.armL), armR: lerp6(a.armR, b.armR),
    handL: lerp2(a.handL, b.handL), handR: lerp2(a.handR, b.handR),
    footL: lerp2(a.footL, b.footL), footR: lerp2(a.footR, b.footR),
    lean: leanOverride ?? lerp(a.lean, b.lean),
    shoulderRoll: lerp(a.shoulderRoll, b.shoulderRoll),
  };
}
