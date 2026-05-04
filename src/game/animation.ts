// Procedural walk-cycle pose for stickman fighters.
// Premium gait: smooth sinusoidal swing, planted stance, gentle vertical bob,
// active arm counter-swing, subtle hand bob and shoulder/hip roll.

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
  // Smooth sinusoidal stride (no hard stance/swing seam)
  const phase = c * Math.PI * 2;
  // Foot moves on an ellipse: forward+back continuously, lifts only on swing half
  const forward = Math.cos(phase); // -1..1
  const liftCurve = Math.max(0, Math.sin(phase)); // 0..1, only positive half
  const footX = hipX + stride * forward + facing * 1.5;
  const footY = H - lift * liftCurve;
  const lifted = liftCurve;

  // Knee bends more when lifted; bias forward in facing direction.
  const baseBend = 5 + amp * 2;
  const swingBend = 12 * lifted;
  const kneeForward = facing * (3 + 5 * lifted);
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
  const moving = speed > 8;

  const breath = Math.sin(phase * 0.9) * 1.0;
  const headOffsetY = breath - 2;
  const shoulderYBase = 28 + breath;
  const hipYBase = 56;

  const lean = moving ? facing * Math.min(0.16, speed / 1700) : 0;

  if (!onGround) {
    // Three-phase jump: launch (vy<<0) → apex (|vy|≈0) → fall (vy>0).
    // Knees tuck high during launch, splay outward at apex, extend on fall to "stick" landing.
    const apex = 1 - Math.min(1, Math.abs(vy) / 320); // 1 at apex, 0 launching/falling fast
    const launching = vy < 0;
    const fallT = launching ? 0 : Math.min(1, vy / 320);
    const tuck = launching ? Math.min(1, -vy / 380) : 0;

    // Hip/knee/foot
    const legSplay = 4 + apex * 4;
    const kneeY = hipYBase + (10 + tuck * 12 - fallT * 4);
    const kneeXIn = 5 + tuck * 4;
    const footTuck = launching ? 14 + tuck * 6 : 22 + fallT * 10;
    const footYL = hipYBase + footTuck;
    const footYR = hipYBase + footTuck - apex * 3;

    // Arms swing forward on launch, splay wide at apex, pull back on fall
    const armForward = facing * (10 + tuck * 8);
    const armApexOut = facing * (-2 - apex * 6);
    const armFallBack = facing * (-12 - fallT * 4);
    const handX = launching ? armForward : (apex > 0.5 ? armApexOut : armFallBack);
    const handY = 22 + (launching ? -tuck * 6 : apex * 2 + fallT * 6);
    const handXOpp = -handX * 0.7;

    const lean = facing * (0.08 + tuck * 0.08 - fallT * 0.04);

    return {
      headOffsetY: -3 - tuck * 1.5,
      shoulderY: 28 - tuck * 1.5,
      hipY: hipYBase - tuck * 1,
      legL: [-3, hipYBase, -3 - kneeXIn, kneeY, -2 - legSplay, footYL],
      legR: [3, hipYBase, 3 + kneeXIn, kneeY, 2 + legSplay, footYR],
      armL: [-4, 28, -10, 30 + apex * 2, handXOpp, handY + 2],
      armR: [4, 28, 10, 30 + apex * 2, handX, handY],
      handL: [handXOpp, handY + 2],
      handR: [handX, handY],
      footL: [-2 - legSplay, footYL],
      footR: [2 + legSplay, footYR],
      lean,
      shoulderRoll: -facing * apex * 0.05,
    };
  }

  const amp = moving ? Math.min(1, speed / 160) : 0;
  const stride = 15 * amp;
  const lift = 18 * amp;

  // Body bob: dips at heel-strike (twice per gait cycle), but smoother
  const bob = moving ? (1 - Math.cos(phase * 2)) * 0.9 * amp : 0;
  const shoulderY = shoulderYBase - bob * 0.6;
  const hipY = hipYBase + bob * 0.4;

  // Slight torso roll opposite to swinging leg
  const shoulderRoll = moving ? Math.sin(phase) * 0.04 * amp : 0;

  const hxL = -3, hxR = 3;
  const cycL = phase / (Math.PI * 2);
  const cycR = cycL + 0.5;

  const L = legPose(cycL, hxL, hipY, stride, lift, facing, H, amp);
  const R = legPose(cycR, hxR, hipY, stride, lift, facing, H, amp);

  // Arms counter-swing the legs; idle arms have a gentle micro-sway
  const sxL = -4, sxR = 4;
  const armSwingMax = moving ? 16 + amp * 6 : 0;
  const idleSwayL = moving ? 0 : Math.sin(phase * 0.7) * 0.6;
  const idleSwayR = moving ? 0 : Math.sin(phase * 0.7 + Math.PI) * 0.6;
  // Arm L counter-swings R leg, and vice versa
  const swingL = Math.cos((cycR) * Math.PI * 2);
  const swingR = Math.cos((cycL) * Math.PI * 2);

  const handLBob = moving ? Math.max(0, -swingL) * 2.5 : 0;
  const handRBob = moving ? Math.max(0, -swingR) * 2.5 : 0;

  const handLX = sxL + swingL * armSwingMax + idleSwayL;
  const handLY = shoulderY + 22 + handLBob;
  const handRX = sxR + swingR * armSwingMax + idleSwayR;
  const handRY = shoulderY + 22 + handRBob;

  // Elbows: nudge inward slightly, with a touch of forward bias by facing
  const elbowLX = (sxL + handLX) / 2 + facing * 1.5 + (handLX < sxL ? -1 : 1);
  const elbowLY = (shoulderY + handLY) / 2 + 5;
  const elbowRX = (sxR + handRX) / 2 - facing * 1.5 + (handRX > sxR ? 1 : -1);
  const elbowRY = (shoulderY + handRY) / 2 + 5;

  if (attacking) {
    const ahx = facing * 28;
    const ahy = shoulderY + 4;
    const aex = facing * 14;
    const aey = shoulderY + 2;
    if (facing > 0) {
      return {
        headOffsetY: headOffsetY - bob * 0.4,
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
      headOffsetY: headOffsetY - bob * 0.4,
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
    headOffsetY: headOffsetY - bob * 0.4,
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
      // heroic stance, hands at hips
      out.armL = [-4, sy, -8, sy + 6, -10, sy + 16];
      out.armR = [4, sy, 8, sy + 6, 10, sy + 16];
      out.handL = [-10, sy + 16];
      out.handR = [10, sy + 16];
      out.headOffsetY -= 1;
      break;
    }
  }
  return out;
}

// Tumbling ragdoll pose used while a fighter is launched.
export function computeRagdollPose(t: number, H: number): Pose {
  const sy = 30;
  const hipY = 56;
  const spin = t * 14;
  const cx = Math.cos(spin) * 8;
  const sx = Math.sin(spin) * 8;
  return {
    headOffsetY: -2 + sx * 0.5,
    shoulderY: sy,
    hipY,
    legL: [-3, hipY, -8 + cx, hipY + 12, -14 + cx * 1.4, hipY + 22],
    legR: [3, hipY, 8 - cx, hipY + 12, 14 - cx * 1.4, hipY + 22],
    armL: [-4, sy, -10 - sx, sy + 10, -16 - sx * 1.4, sy + 18],
    armR: [4, sy, 10 + sx, sy + 10, 16 + sx * 1.4, sy + 18],
    handL: [-16 - sx * 1.4, sy + 18],
    handR: [16 + sx * 1.4, sy + 18],
    footL: [-14 + cx * 1.4, hipY + 22],
    footR: [14 - cx * 1.4, hipY + 22],
    lean: spin * 0.3,
    shoulderRoll: 0,
  };
}

// ----- Flight pose -----
// Superhero glide: body leans forward when fast, upright + bobbing when hovering.
// Lead arm extended forward (Superman/Homelander), trailing arm tucked.
export function computeFlightPose(
  phase: number,
  vx: number,
  vy: number,
  hoverPhase: number,
  facing: 1 | -1,
  _H: number,
): Pose {
  const speed = Math.hypot(vx, vy);
  const horiz = Math.min(1, speed / 360);
  const goingUp = vy < -40;
  const goingDown = vy > 40;

  const pitch = facing * (0.05 + horiz * 0.55) + (goingUp ? -0.12 : 0) + (goingDown ? 0.18 : 0);
  const bob = (1 - horiz) * Math.sin(hoverPhase) * 1.8;

  const shoulderY = 28 + bob;
  const hipY = 56 + bob * 0.5;
  const headOffsetY = -3 + bob * 0.4;

  // Legs trail BEHIND the body (opposite of facing direction).
  const trail = horiz;
  const flutter = Math.sin(phase * 1.8) * (0.4 + (1 - horiz) * 1.6);
  // Behind = -facing direction
  const back = -facing;
  // When ascending, legs tuck more vertical (downward); cruising/descending, they stretch back.
  const verticalLean = goingUp ? 0.35 : (goingDown ? -0.15 : 0);
  const trailReach = 10 + trail * 26;
  const kneeReach = 5 + trail * 14;
  const droop = (1 - trail) * 14 * (goingUp ? 0.2 : 1); // legs hang when hovering, tuck when ascending

  const footBaseY = hipY + 22 + droop + bob;
  const kneeBaseY = hipY + 12 + droop * 0.6;

  const footLX = back * trailReach - 3 * facing;
  const footRX = back * trailReach + 3 * facing;
  const kneeLX = back * kneeReach - 2 * facing;
  const kneeRX = back * kneeReach + 2 * facing;

  // Vertical lean lifts feet up (ascending) or pushes them down (descending)
  const vY = verticalLean * 18;

  const footL: [number, number] = [footLX, footBaseY - vY + flutter];
  const footR: [number, number] = [footRX, footBaseY - vY - flutter * 0.7];
  const legL: [number, number, number, number, number, number] =
    [-3, hipY, kneeLX, kneeBaseY - vY * 0.5 + flutter * 0.5, footL[0], footL[1]];
  const legR: [number, number, number, number, number, number] =
    [3, hipY, kneeRX, kneeBaseY - vY * 0.5 - flutter * 0.4, footR[0], footR[1]];

  const lead = horiz;
  let leadHandX: number, leadHandY: number, leadElbowX: number, leadElbowY: number;
  let trailHandX: number, trailHandY: number, trailElbowX: number, trailElbowY: number;

  if (goingUp && horiz < 0.55) {
    leadHandX = facing * 6; leadHandY = shoulderY - 22;
    leadElbowX = facing * 4; leadElbowY = shoulderY - 8;
    trailHandX = -facing * 6; trailHandY = shoulderY - 18;
    trailElbowX = -facing * 4; trailElbowY = shoulderY - 6;
  } else {
    leadHandX = facing * (16 + lead * 14);
    leadHandY = shoulderY + 4 - lead * 4;
    leadElbowX = facing * (8 + lead * 6);
    leadElbowY = shoulderY + 6;
    trailHandX = -facing * (4 + (1 - lead) * 4);
    trailHandY = shoulderY + 18 + (1 - lead) * 4;
    trailElbowX = -facing * 6;
    trailElbowY = shoulderY + 10;
  }

  const armR: [number, number, number, number, number, number] =
    facing > 0
      ? [4, shoulderY, leadElbowX, leadElbowY, leadHandX, leadHandY]
      : [4, shoulderY, trailElbowX, trailElbowY, trailHandX, trailHandY];
  const armL: [number, number, number, number, number, number] =
    facing > 0
      ? [-4, shoulderY, trailElbowX, trailElbowY, trailHandX, trailHandY]
      : [-4, shoulderY, leadElbowX, leadElbowY, leadHandX, leadHandY];

  return {
    headOffsetY,
    shoulderY,
    hipY,
    legL, legR,
    armL, armR,
    handL: [armL[4], armL[5]],
    handR: [armR[4], armR[5]],
    footL, footR,
    lean: pitch,
    shoulderRoll: Math.sin(phase * 0.5) * 0.03 * (1 - horiz),
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
