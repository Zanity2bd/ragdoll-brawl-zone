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
