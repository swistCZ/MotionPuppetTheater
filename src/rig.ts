export interface Point {
  x: number;
  y: number;
}

/** A single cut-out part: its own transparent image file (path or data URL). */
export interface RigPartFile {
  src: string;
  cleanBackground?: boolean;
  cleanTolerance?: number;
  /**
   * Movable/animated (swings, bobs) vs static (just placed at its rest pose).
   * Body is always the moving root and ignores this flag.
   */
  movable?: boolean;
}

/** An upper limb part (upper arm / thigh): joint pivot + where the lower part attaches. */
export interface RigLimbUpperDef {
  /** Shoulder/hip joint in the upper-limb image coordinates (px from top-left). */
  pivot: Point;
  /**
   * Joint point (elbow/knee) in the upper-limb image coordinates where the
   * lower part (forearm/shin) attaches. Auto-centered on the upper limb's
   * joint end in the builder; adjust it only when the artwork is not a
   * straight rod. Must lie below the pivot.
   */
  attach: Point;
}

export interface RigArmDef extends RigLimbUpperDef {
  /** Radians; the arm's resting pointing direction (y-down coords), typically ~90 deg (hanging down). */
  restHandAngle: number;
}

/** A rotating leg (thigh): hip pivot + resting angle in radians. */
export interface RigLimbDef extends RigLimbUpperDef {
  /** Radians; the leg's resting angle (0 = straight down). */
  restAngle: number;
}

/** A lower limb part (forearm / shin): pivots at the elbow/knee joint. */
export interface RigLowerLimbDef {
  /** Elbow/knee joint pivot in the lower-limb image coordinates (px from top-left). */
  pivot: Point;
}

/** Precomputed two-bone IK geometry for one limb in image-pixel space. */
export interface RigLimbIK {
  /** Upper-segment length (shoulder/hip to elbow/knee), in image px. */
  len1: number;
  /** Lower-segment length (elbow/knee to hand/foot), in image px. */
  len2: number;
  /** Natural pointing direction of the upper segment in the image (radians, y-down). */
  phi1: number;
  /** Natural pointing direction of the lower segment relative to the upper (radians, y-down). */
  phi2: number;
  /** Bend direction: +1 = bend "down" (elbows), -1 = bend "up" (knees). */
  bendSign: 1 | -1;
}

/** Solved two-bone inverse kinematics for a limb in image-pixel space. */
export interface RigLimbPose {
  /** Absolute rotation of the upper segment around the root (radians, y-down). */
  angle1: number;
  /** Rotation of the lower segment relative to the upper (radians). */
  angle2: number;
}

/**
 * Analytic two-bone IK solver (shoulder → elbow → hand, or hip → knee → foot).
 * `target` is the desired hand/foot position relative to the root, with y-down
 * coordinates. Returns absolute angles: `angle1` around the root, `angle2`
 * around the joint (relative to the upper segment). `bendSign` selects which
 * side the joint bends toward: +1 bends in the +y sense (down, elbows),
 * -1 bends the other way (knees).
 */
export function solveTwoBoneIK(target: Point, len1: number, len2: number, bendSign: 1 | -1): RigLimbPose {
  const tx = target.x;
  const ty = target.y;
  const d = Math.hypot(tx, ty);
  const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

  if (len1 <= 0 || len2 <= 0 || d < 1e-6) {
    return { angle1: Math.atan2(ty, tx) || 0, angle2: 0 };
  }

  const dClamped = Math.min(Math.max(d, Math.abs(len1 - len2) + 1e-6), len1 + len2);
  const a = clamp1((len1 * len1 + dClamped * dClamped - len2 * len2) / (2 * len1 * dClamped));
  const b = clamp1((len1 * len1 + len2 * len2 - dClamped * dClamped) / (2 * len1 * len2));

  const elbowOffset = bendSign * Math.acos(a);
  const angle1 = Math.atan2(ty, tx) + elbowOffset;
  const angle2 = -bendSign * (Math.PI - Math.acos(b));
  return { angle1, angle2 };
}

export interface RigHeadDef {
  /** Bob amplitude multiplier (0 = no bob). Default 1. */
  bob?: number;
}

export interface CutoutRigConfig {
  id: string;
  name: string;
  displayScale: number;
  maxArmDelta?: number;
  attribution?: string;
  parts: {
    body: RigPartFile;
    head?: RigPartFile;
    /** Upper arm (shoulder → elbow). */
    leftArm: RigPartFile;
    rightArm: RigPartFile;
    /** Lower arm (elbow → hand). When present the arm bends via two-bone IK. */
    leftForearm?: RigPartFile;
    rightForearm?: RigPartFile;
    /** Thigh (hip → knee). */
    leftLeg?: RigPartFile;
    rightLeg?: RigPartFile;
    /** Shin (knee → foot). When present the leg bends via two-bone IK. */
    leftShin?: RigPartFile;
    rightShin?: RigPartFile;
  };
  body: {
    /** Shoulder anchors in body-image coordinates (px from top-left). */
    shoulderL: Point;
    shoulderR: Point;
    /** Head anchor on the body (head sprite center), optional. */
    neck?: Point;
    hipL?: Point;
    hipR?: Point;
  };
  leftArm: RigArmDef;
  rightArm: RigArmDef;
  leftForearm?: RigLowerLimbDef;
  rightForearm?: RigLowerLimbDef;
  leftLeg?: RigLimbDef;
  rightLeg?: RigLimbDef;
  leftShin?: RigLowerLimbDef;
  rightShin?: RigLowerLimbDef;
  head?: RigHeadDef;
}

/** Part image dimensions for bounds checking, keyed by part. */
export type RigDimensions = {
  body: Point;
  head?: Point;
  leftArm: Point;
  rightArm: Point;
  leftForearm?: Point;
  rightForearm?: Point;
  leftLeg?: Point;
  rightLeg?: Point;
  leftShin?: Point;
  rightShin?: Point;
};

/**
 * Light structural validation of a rig config. Bounds are checked only when
 * image dimensions are provided.
 */
export function validateRigConfig(config: CutoutRigConfig, dimensions?: RigDimensions): string[] {
  const errors: string[] = [];

  if (!config.id) errors.push('chybí id');
  if (!config.parts?.body?.src) errors.push('chybí parts.body.src');
  if (!config.parts?.leftArm?.src) errors.push('chybí parts.leftArm.src');
  if (!config.parts?.rightArm?.src) errors.push('chybí parts.rightArm.src');
  if (!config.body) errors.push('chybí body (ramena)');

  const checkPointIn = (name: string, pt: Point | undefined, dim: Point | undefined): void => {
    if (!pt || !dim) return;
    if (pt.x < 0 || pt.y < 0 || pt.x > dim.x || pt.y > dim.y) {
      errors.push(`${name} je mimo obrázek`);
    }
  };

  const checkLimb = (
    name: string,
    def: { pivot?: Point; attach?: Point } | undefined,
    dim: Point | undefined
  ): void => {
    if (!def) {
      errors.push(`chybí ${name}`);
      return;
    }
    checkPointIn(`${name}.pivot`, def.pivot, dim);
    checkPointIn(`${name}.attach`, def.attach, dim);
    if (def.pivot && def.attach && def.attach.y <= def.pivot.y) {
      errors.push(`${name}.attach musí být níž než pivot`);
    }
  };

  const checkLowerLimb = (name: string, def: { pivot?: Point } | undefined, dim: Point | undefined): void => {
    if (!def) {
      errors.push(`chybí ${name}`);
      return;
    }
    checkPointIn(`${name}.pivot`, def.pivot, dim);
  };

  checkLimb('leftArm', config.leftArm, dimensions?.leftArm);
  checkLimb('rightArm', config.rightArm, dimensions?.rightArm);

  // Optional parts are validated only when present.
  if (config.parts?.leftForearm || config.leftForearm) checkLowerLimb('leftForearm', config.leftForearm, dimensions?.leftForearm);
  if (config.parts?.rightForearm || config.rightForearm) checkLowerLimb('rightForearm', config.rightForearm, dimensions?.rightForearm);
  if (config.parts?.leftLeg || config.leftLeg) checkLimb('leftLeg', config.leftLeg, dimensions?.leftLeg);
  if (config.parts?.rightLeg || config.rightLeg) checkLimb('rightLeg', config.rightLeg, dimensions?.rightLeg);
  if (config.parts?.leftShin || config.leftShin) checkLowerLimb('leftShin', config.leftShin, dimensions?.leftShin);
  if (config.parts?.rightShin || config.rightShin) checkLowerLimb('rightShin', config.rightShin, dimensions?.rightShin);

  if (dimensions?.body) {
    const b = config.body;
    if (b) {
      checkPointIn('body.shoulderL', b.shoulderL, dimensions.body);
      checkPointIn('body.shoulderR', b.shoulderR, dimensions.body);
      checkPointIn('body.neck', b.neck, dimensions.body);
      checkPointIn('body.hipL', b.hipL, dimensions.body);
      checkPointIn('body.hipR', b.hipR, dimensions.body);
    }
  }

  return errors;
}

/**
 * Computes the arm sprite rotation around the shoulder so that the arm's hand
 * points along the given limb vector (from palm toward fingertip, y-down).
 */
export function armRotation(limb: Point, restHandAngle: number, maxDelta: number): number {
  if (Math.abs(limb.x) < 1e-6 && Math.abs(limb.y) < 1e-6) return restHandAngle;
  const targetAngle = Math.atan2(limb.y, limb.x);
  let delta = targetAngle - restHandAngle;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  delta = Math.max(-maxDelta, Math.min(maxDelta, delta));
  return restHandAngle + delta;
}
