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
    const tuck = vy < 0 ? 1 : 0.5;
    const kneeX = 7 * tuck;
    const kneeY = hipYBase + 14;
    const footX = 5 * tuck;
    const footY = hipYBase + 22 + (1 - tuck) * 14;
    const handX = 14 + facing * 4;
    const handY = 28;
    return {
      headOffsetY: -2,
      shoulderY: 28,
      hipY: hipYBase,
      legL: [-3, hipYBase, -3 - kneeX, kneeY, -2 - footX, footY],
      legR: [3, hipYBase, 3 + kneeX, kneeY, 2 + footX, footY],
      armL: [-4, 28, -10, 32, -handX, handY],
      armR: [4, 28, 10, 32, handX, handY],
      handL: [-handX, handY],
      handR: [handX, handY],
      footL: [-2 - footX, footY],
      footR: [2 + footX, footY],
      lean: facing * 0.12,
      shoulderRoll: 0,
    };
  }

  const amp = moving ? Math.min(1, speed / 200) : 0;
  const stride = 13 * amp;
  const lift = 16 * amp;

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
  const armSwingMax = moving ? 14 : 0;
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
