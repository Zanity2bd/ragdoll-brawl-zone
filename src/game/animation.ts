// Procedural walk-cycle pose for stickman fighters.
// Two-phase gait per leg: STANCE (foot planted) and SWING (foot lifts and steps forward).

export interface Pose {
  headOffsetY: number;
  shoulderY: number;
  hipY: number;
  legL: [number, number, number, number, number, number];
  legR: [number, number, number, number, number, number];
  armL: [number, number, number, number, number, number];
  armR: [number, number, number, number, number, number];
  lean: number;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
): [number, number, number, number, number, number] {
  const c = ((cyc % 1) + 1) % 1;

  let footX: number;
  let footY: number;
  let lifted: number;

  if (c < 0.5) {
    // STANCE — foot planted, slides backward relative to hip
    const s = c / 0.5;
    footX = hipX + stride * (1 - 2 * s);
    footY = H;
    lifted = 0;
  } else {
    // SWING — foot lifts in an arc and steps forward
    const s = (c - 0.5) / 0.5;
    const e = easeInOut(s);
    footX = hipX + stride * (-1 + 2 * e);
    lifted = Math.sin(s * Math.PI);
    footY = H - lift * lifted;
  }

  const baseBend = 4 + amp * 2;
  const swingBend = 10 * lifted;
  const kneeForward = facing * (2 + 4 * lifted);
  const kneeX = (hipX + footX) / 2 + kneeForward;
  const kneeY = (hipY + footY) / 2 + baseBend + swingBend;

  return [hipX, hipY, kneeX, kneeY, footX, footY];
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

  const breath = Math.sin(phase * 0.9) * 1.2;
  const headOffsetY = breath - 2;
  const shoulderY = 28 + breath;
  const hipY = 56;

  const lean = moving ? facing * Math.min(0.14, speed / 1800) : 0;

  if (!onGround) {
    const tuck = vy < 0 ? 1 : 0.4;
    const kneeX = 6 * tuck;
    const kneeY = hipY + 14;
    const footX = 4 * tuck;
    const footY = hipY + 22 + (1 - tuck) * 14;
    return {
      headOffsetY: -2, shoulderY: 28, hipY,
      legL: [-3, hipY, -3 - kneeX, kneeY, -2 - footX, footY],
      legR: [3, hipY, 3 + kneeX, kneeY, 2 + footX, footY],
      armL: [-3, 30, -10, 36, -14 + facing * 4, 30],
      armR: [3, 30, 10, 36, 14 + facing * 4, 30],
      lean: facing * 0.1,
    };
  }

  const amp = moving ? Math.min(1, speed / 200) : 0;
  const stride = 12 * amp;
  const lift = 14 * amp;

  // Body bob — dips during double-support, twice per gait cycle
  const bob = moving ? Math.abs(Math.cos(phase * Math.PI)) * 1.5 * amp : 0;

  const hxL = -3, hxR = 3;
  const cycL = phase / (Math.PI * 2);
  const cycR = cycL + 0.5;

  const legL = legPose(cycL, hxL, hipY + bob, stride, lift, facing, H, amp);
  const legR = legPose(cycR, hxR, hipY + bob, stride, lift, facing, H, amp);

  const sxL = -4, sxR = 4;
  const armSwing = (moving ? 11 : 3) * Math.max(amp, moving ? 0.3 : 0);
  const swingL = Math.cos(cycR * Math.PI * 2);
  const swingR = Math.cos(cycL * Math.PI * 2);

  const handLX = sxL + swingL * armSwing;
  const handLY = shoulderY + 22 + Math.max(0, -swingL) * 2;
  const handRX = sxR + swingR * armSwing;
  const handRY = shoulderY + 22 + Math.max(0, -swingR) * 2;
  const elbowLX = (sxL + handLX) / 2 + facing * 2;
  const elbowLY = (shoulderY + handLY) / 2 + 5;
  const elbowRX = (sxR + handRX) / 2 - facing * 2;
  const elbowRY = (shoulderY + handRY) / 2 + 5;

  if (attacking) {
    const ahx = facing * 26;
    const ahy = shoulderY + 4;
    if (facing > 0) {
      return {
        headOffsetY: headOffsetY - bob, shoulderY: shoulderY - bob, hipY: hipY + bob,
        legL, legR,
        armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
        armR: [sxR, shoulderY, sxR + 8, shoulderY, ahx, ahy],
        lean,
      };
    }
    return {
      headOffsetY: headOffsetY - bob, shoulderY: shoulderY - bob, hipY: hipY + bob,
      legL, legR,
      armL: [sxL, shoulderY, sxL - 8, shoulderY, ahx, ahy],
      armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
      lean,
    };
  }

  return {
    headOffsetY: headOffsetY - bob,
    shoulderY: shoulderY - bob,
    hipY: hipY + bob,
    legL, legR,
    armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
    armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
    lean,
  };
}
