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
  const lean = moving ? facing * Math.min(0.22, speed / 1300) : 0;

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

  // Smoothstep amp ramp — eliminates the hard idle/walk snap when vx crosses threshold
  const ampLin = Math.min(1, speed / 160);
  const amp = ampLin * ampLin * (3 - 2 * ampLin);
  // ---- High-knee run cycle (matches the reference run video) ----
  // Sharper, taller knee lift, deeper stride. Walk reads as walk at low amp.
  const stride = 14 * amp + 10 * amp * amp;          // up to ~24 at sprint
  const lift = 18 * amp + 18 * amp * amp;            // knees punch up to hip line


  // Phase-delayed body bobs: hips lead, shoulders & head lag (~80–140ms).
  // The spine "follows" the pelvis instead of moving in lockstep.
  const bobHip = moving ? (1 - Math.cos(phase * 2)) * 0.9 * amp : 0;
  const bobShoulder = moving ? (1 - Math.cos(phase * 2 - 0.5)) * 0.9 * amp : 0;
  const bobHead = moving ? (1 - Math.cos(phase * 2 - 0.9)) * 0.9 * amp : 0;
  // Heel-strike micro-dip biases the dip onto the contact half — gives weight
  const heelDip = moving ? Math.max(0, -Math.cos(phase * 2)) * 1.0 * amp : 0;

  // Hip sway: pelvis shifts toward the planted foot each step.
  const hipSwayX = moving ? Math.sin(phase) * 1.6 * amp : 0;

  const shoulderY = shoulderYBase - bobShoulder * 0.6;
  const hipY = hipYBase + bobHip * 0.4 + heelDip;

  // Slight torso roll opposite to swinging leg
  const shoulderRoll = moving ? Math.sin(phase) * 0.04 * amp : 0;

  // Asymmetric leg signature (universal — left strides slightly longer, right lifts higher).
  // Breaks the perfect-mirror loop without per-character state.
  const strideL = stride * 1.00;
  const strideR = stride * 1.04;
  const liftL = lift * 1.03;
  const liftR = lift * 1.00;
  const hxL = -3 + hipSwayX, hxR = 3 + hipSwayX;
  const cycL = phase / (Math.PI * 2);
  const cycR = cycL + 0.5;

  const L = legPose(cycL, hxL, hipY, strideL, liftL, facing, H, amp);
  const R = legPose(cycR, hxR, hipY, strideR, liftR, facing, H, amp);

  // Arms counter-swing the legs; idle arms have a gentle micro-sway.
  // Shoulder anchor counter-sways the hips for natural balance.
  const sxL = -4 - hipSwayX * 0.5, sxR = 4 - hipSwayX * 0.5;
  const armSwingMax = moving ? 14 * amp + 10 * amp * amp : 0;
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

  // Asymmetric elbow bend: more bend on back-swing, straighter on forward swing.
  const backL = Math.max(0, -swingL); // 0..1 when L arm goes back relative to facing
  const backR = Math.max(0, -swingR);
  const elbowLX = (sxL + handLX) / 2 + facing * 1.5 + (handLX < sxL ? -1 : 1) - facing * backL * 3 * amp;
  const elbowLY = (shoulderY + handLY) / 2 + 5 + backL * 4 * amp;
  const elbowRX = (sxR + handRX) / 2 - facing * 1.5 + (handRX > sxR ? 1 : -1) - facing * backR * 3 * amp;
  const elbowRY = (shoulderY + handRY) / 2 + 5 + backR * 4 * amp;

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
