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

export interface RigArmDef {
  /** Shoulder joint in arm-image coordinates (px from top-left). */
  pivot: Point;
  /** Radians; the arm's resting pointing direction (y-down coords), typically ~90 deg (hanging down). */
  restHandAngle: number;
}

/** A rotating limb (leg): hip pivot + resting angle in radians. */
export interface RigLimbDef {
  /** Hip joint in leg-image coordinates (px from top-left). */
  pivot: Point;
  /** Radians; the leg's resting angle (0 = straight down). */
  restAngle: number;
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
    leftArm: RigPartFile;
    rightArm: RigPartFile;
    leftLeg?: RigPartFile;
    rightLeg?: RigPartFile;
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
  leftLeg?: RigLimbDef;
  rightLeg?: RigLimbDef;
  head?: RigHeadDef;
}

/** Part image dimensions for bounds checking, keyed by part. */
export type RigDimensions = {
  body: Point;
  head?: Point;
  leftArm: Point;
  rightArm: Point;
  leftLeg?: Point;
  rightLeg?: Point;
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

  const checkLimb = (name: string, def: { pivot?: Point } | undefined, dim: Point | undefined): void => {
    if (!def) {
      errors.push(`chybí ${name}`);
      return;
    }
    checkPointIn(`${name}.pivot`, def.pivot, dim);
  };
  checkLimb('leftArm', config.leftArm, dimensions?.leftArm);
  checkLimb('rightArm', config.rightArm, dimensions?.rightArm);

  // Optional parts are validated only when present.
  if (config.parts?.leftLeg || config.leftLeg) checkLimb('leftLeg', config.leftLeg, dimensions?.leftLeg);
  if (config.parts?.rightLeg || config.rightLeg) checkLimb('rightLeg', config.rightLeg, dimensions?.rightLeg);

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
