// ============================================================================
// LEGACY — DO NOT IMPORT
// Reference archive of the old procedural stick-figure attack/flight rig.
// Replaced by the sprite-sheet character (walk-sheet.png frames 0-29).
// Kept here in case we want to revive any of the special-move silhouettes.
// ============================================================================
/* eslint-disable */
// @ts-nocheck
import type { Pose } from "../animation";

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
