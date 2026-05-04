// Procedural walk-cycle pose for stickman fighters.

export interface Pose {
  // joint offsets relative to a fighter centered at (0,0) with feet at y=H
  headOffsetY: number;
  shoulderY: number;
  hipY: number;
  // legs: each = [hipX, hipY, kneeX, kneeY, footX, footY] relative
  legL: [number, number, number, number, number, number];
  legR: [number, number, number, number, number, number];
  // arms: shoulder -> elbow -> hand
  armL: [number, number, number, number, number, number];
  armR: [number, number, number, number, number, number];
  lean: number; // body lean angle (radians)
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

  // Idle breathing
  const breath = Math.sin(phase * 1.2) * 1.5;

  const headOffsetY = breath - 2;
  const shoulderY = 28 + breath;
  const hipY = 56;

  // Lean forward when running
  const lean = moving ? facing * Math.min(0.18, speed / 1500) : 0;

  // ----- Air pose -----
  if (!onGround) {
    const tuck = vy < 0 ? 1 : 0.4; // jumping vs falling
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

  // ----- Ground pose (walk or idle) -----
  // step amplitude scales with speed
  const amp = moving ? Math.min(1, speed / 220) : 0;
  const stepLen = 14 * amp;
  const lift = 10 * amp;

  const phL = Math.sin(phase);
  const phR = Math.sin(phase + Math.PI);

  // hip positions
  const hxL = -3, hxR = 3;
  // foot positions: alternating forward/back
  const footLY = H - (Math.max(0, phL) * lift); // raised when phase positive
  const footLX = hxL + phL * stepLen;
  const footRY = H - (Math.max(0, phR) * lift);
  const footRX = hxR + phR * stepLen;
  // knees: midpoint pulled slightly forward + bent
  const kneeBend = 6 + amp * 4;
  const kneeLX = hxL + phL * stepLen * 0.5 + (phL > 0 ? facing * 2 : 0);
  const kneeLY = (hipY + footLY) / 2 + kneeBend - Math.max(0, phL) * 4;
  const kneeRX = hxR + phR * stepLen * 0.5 + (phR > 0 ? facing * 2 : 0);
  const kneeRY = (hipY + footRY) / 2 + kneeBend - Math.max(0, phR) * 4;

  // arm swing — opposite phase
  const armSwing = (moving ? 12 : 4) * amp + (moving ? 0 : 0);
  const sxL = -4, sxR = 4;
  const handLX = sxL - phR * armSwing;
  const handLY = shoulderY + 22 - Math.max(0, -phR) * 4;
  const handRX = sxR - phL * armSwing;
  const handRY = shoulderY + 22 - Math.max(0, -phL) * 4;
  const elbowLX = (sxL + handLX) / 2 + 2;
  const elbowLY = (shoulderY + handLY) / 2 + 4;
  const elbowRX = (sxR + handRX) / 2 - 2;
  const elbowRY = (shoulderY + handRY) / 2 + 4;

  // attack: punch the front arm forward
  if (attacking) {
    const ahx = facing * 26;
    const ahy = shoulderY + 4;
    if (facing > 0) {
      return {
        headOffsetY, shoulderY, hipY,
        legL: [hxL, hipY, kneeLX, kneeLY, footLX, footLY],
        legR: [hxR, hipY, kneeRX, kneeRY, footRX, footRY],
        armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
        armR: [sxR, shoulderY, sxR + 8, shoulderY, ahx, ahy],
        lean,
      };
    } else {
      return {
        headOffsetY, shoulderY, hipY,
        legL: [hxL, hipY, kneeLX, kneeLY, footLX, footLY],
        legR: [hxR, hipY, kneeRX, kneeRY, footRX, footRY],
        armL: [sxL, shoulderY, sxL - 8, shoulderY, ahx, ahy],
        armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
        lean,
      };
    }
  }

  return {
    headOffsetY, shoulderY, hipY,
    legL: [hxL, hipY, kneeLX, kneeLY, footLX, footLY],
    legR: [hxR, hipY, kneeRX, kneeRY, footRX, footRY],
    armL: [sxL, shoulderY, elbowLX, elbowLY, handLX, handLY],
    armR: [sxR, shoulderY, elbowRX, elbowRY, handRX, handRY],
    lean,
  };
}
