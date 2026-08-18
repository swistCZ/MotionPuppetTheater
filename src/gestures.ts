export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface LimbOffsets {
  head: Point2D;
  leftArm: Point2D;
  rightArm: Point2D;
  leftLeg: Point2D;
  rightLeg: Point2D;
}

export interface HandState {
  handType: 'Left' | 'Right';
  wristPosition: Point2D; // Normalized (0 to 1, mirrored X)
  rawPositionPixels: Point2D; // Canvas pixel coordinates
  smoothedPosition: Point2D; // Smooth mapped position
  pinchDistance: number; // Normalized distance between thumb and index tips
  isPinching: boolean; // True if mouth closed
  mouthOpenRatio: number; // Driven 100% exclusively by index finger flexion
  fingerSplay: number; // Continuous 0.0 (fist/together) to 1.0 (spread fingers)
  fistFactor: number; // 0.0 (open hand) to 1.0 (tight fist) - used to freeze poses
  middleFingerFactor: number; // 0.0 (no gesture) to 1.0 (middle finger up, others curled) - camera zoom
  rotation: number; // Angle in radians
  limbs: LimbOffsets; // Dynamic 5-finger articulated limb positions
}

export interface DetectedHandInput {
  landmarks: Point3D[];
  mediaPipeLabel: 'Left' | 'Right';
}

export interface MatchedHandOutput {
  puppetSlot: 'Left' | 'Right';
  landmarks: Point3D[];
}

// Limb scaling is derived from the hand's own palm width so the puppet's limb
// reach is consistent regardless of how far the hand is from the camera.
// PALM_REFERENCE_WIDTH = typical palm width as a fraction of the frame.
const PALM_REFERENCE_WIDTH = 0.12;
const LIMB_BASE_SCALE = 250;
export const LIMB_SCALE_MIN = 70;
export const LIMB_SCALE_MAX = 500;

/**
 * Linear interpolation between start and end.
 */
export function lerp(start: number, end: number, alpha: number): number {
  return start + alpha * (end - start);
}

/**
 * Clamps a value between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Shortest signed angular difference from `a` to `b`, wrapped to [-PI, PI].
 * Used for smooth rotation interpolation that never spins the long way around.
 */
export function shortestAngleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * Maps finger splay (0 = fist, 1 = spread) to a limb spread multiplier.
 * A fist tucks the puppet's limbs in (0.7x), spread fingers stretch them out (1.5x).
 */
export function spreadFactor(splay: number): number {
  return lerp(0.7, 1.5, clamp(splay, 0, 1));
}

/**
 * Fist detection: how curled the fingers are (0 = open hand, 1 = tight fist).
 * `avgTipDistance` is the mean distance of the four fingertips (index, middle,
 * ring, pinky) to the palm center, normalized by palm width so it is
 * independent of camera distance. An open hand holds its tips ~1.0-1.4x palm
 * width away; a fist tucks them in to ~0.3-0.5x.
 */
export function fistFactor(avgTipDistance: number, palmWidth: number): number {
  const ratio = palmWidth > 0.02 ? avgTipDistance / palmWidth : 1.0;
  return clamp(1 - (ratio - 0.3) / 0.7, 0, 1);
}

/**
 * Zoom gesture: how clearly the "middle finger up" pose is being made
 * (0 = not at all, 1 = clearly). The middle fingertip must be extended while
 * the other fingertips (index, ring, pinky) stay curled. Distances are
 * normalized by palm width so the gesture is independent of camera distance.
 * An extended middle tip holds ~1.0-1.4x palm width away from the palm center;
 * curled fingers tuck in to ~0.3-0.6x.
 */
export function middleFingerFactor(
  middleTipDistance: number,
  otherTipsDistance: number,
  palmWidth: number
): number {
  if (palmWidth <= 0.02) return 0;
  const middleRatio = middleTipDistance / palmWidth;
  const othersRatio = otherTipsDistance / palmWidth;
  const extended = clamp((middleRatio - 0.85) / 0.45, 0, 1);
  const curled = clamp(1 - (othersRatio - 0.5) / 0.4, 0, 1);
  return extended * curled;
}

/**
 * Derives the limb pixel scale from the hand's palm width (normalized coords)
 * so puppet reach is consistent regardless of camera distance. Falls back to
 * the base scale for degenerate palm widths and clamps to avoid amplifying
 * landmark noise.
 */
export function limbScale(palmWidth: number): number {
  if (palmWidth <= 0.02) return LIMB_BASE_SCALE;
  return clamp((PALM_REFERENCE_WIDTH / palmWidth) * LIMB_BASE_SCALE, LIMB_SCALE_MIN, LIMB_SCALE_MAX);
}

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function calculateDistance2D(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates angle in radians from point 1 to point 2.
 */
export function calculateAngleRadians(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Matches detected hands to puppet slots.
 *
 * Uses Spatial Proximity matching against the previous slot positions to keep
 * physical hands bound to their puppet (no swapping / teleporting), with a
 * deterministic X-sort fallback when no history is available yet.
 */
export function matchDetectedHandsToPuppets(
  detectedHands: DetectedHandInput[],
  lastLeftPos?: Point2D,
  lastRightPos?: Point2D,
  canvasWidth: number = 1000,
  canvasHeight: number = 800
): MatchedHandOutput[] {
  if (detectedHands.length === 0) return [];

  // Convert raw palm centers to mirrored screen coordinates
  const hands = detectedHands.map((dh) => {
    const palm = dh.landmarks[9] || dh.landmarks[0] || { x: 0.5, y: 0.5, z: 0 };
    return {
      screenX: (1.0 - palm.x) * canvasWidth,
      screenY: palm.y * canvasHeight,
      landmarks: dh.landmarks,
    };
  });

  // ---- Single detected hand ----
  if (hands.length === 1) {
    const h = hands[0];

    // Prefer continuity with whichever slot still holds history.
    if (lastLeftPos && !lastRightPos) {
      return [{ puppetSlot: 'Left', landmarks: h.landmarks }];
    }
    if (lastRightPos && !lastLeftPos) {
      return [{ puppetSlot: 'Right', landmarks: h.landmarks }];
    }
    if (lastLeftPos && lastRightPos) {
      const dLeft = distanceToPoint(h, lastLeftPos);
      const dRight = distanceToPoint(h, lastRightPos);
      return [{ puppetSlot: dLeft <= dRight ? 'Left' : 'Right', landmarks: h.landmarks }];
    }

    // No history: assign by screen half
    const slot: 'Left' | 'Right' = h.screenX < canvasWidth * 0.5 ? 'Left' : 'Right';
    return [{ puppetSlot: slot, landmarks: h.landmarks }];
  }

  // ---- Two detected hands ----
  const [h0, h1] = hands;

  if (lastLeftPos && lastRightPos) {
    const d0L = distanceToPoint(h0, lastLeftPos);
    const d0R = distanceToPoint(h0, lastRightPos);
    const d1L = distanceToPoint(h1, lastLeftPos);
    const d1R = distanceToPoint(h1, lastRightPos);

    // Greedy assignment minimizing total travel from previous positions.
    const assignmentA = d0L + d1R; // h0->Left, h1->Right
    const assignmentB = d0R + d1L; // h0->Right, h1->Left

    if (assignmentA <= assignmentB) {
      return [
        { puppetSlot: 'Left', landmarks: h0.landmarks },
        { puppetSlot: 'Right', landmarks: h1.landmarks },
      ];
    }
    return [
      { puppetSlot: 'Right', landmarks: h0.landmarks },
      { puppetSlot: 'Left', landmarks: h1.landmarks },
    ];
  }

  // Partial history: anchor the tracked slot to its nearest hand.
  if (lastLeftPos) {
    const d0 = distanceToPoint(h0, lastLeftPos);
    const d1 = distanceToPoint(h1, lastLeftPos);
    const leftHand = d0 <= d1 ? h0 : h1;
    const rightHand = leftHand === h0 ? h1 : h0;
    return [
      { puppetSlot: 'Left', landmarks: leftHand.landmarks },
      { puppetSlot: 'Right', landmarks: rightHand.landmarks },
    ];
  }
  if (lastRightPos) {
    const d0 = distanceToPoint(h0, lastRightPos);
    const d1 = distanceToPoint(h1, lastRightPos);
    const rightHand = d0 <= d1 ? h0 : h1;
    const leftHand = rightHand === h0 ? h1 : h0;
    return [
      { puppetSlot: 'Left', landmarks: leftHand.landmarks },
      { puppetSlot: 'Right', landmarks: rightHand.landmarks },
    ];
  }

  // No history: deterministic X-sort (leftmost on screen -> Left puppet)
  const sorted = [h0, h1].sort((a, b) => a.screenX - b.screenX);
  return [
    { puppetSlot: 'Left', landmarks: sorted[0].landmarks },
    { puppetSlot: 'Right', landmarks: sorted[1].landmarks },
  ];
}

function distanceToPoint(h: { screenX: number; screenY: number }, p: Point2D): number {
  const dx = h.screenX - p.x;
  const dy = h.screenY - p.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Processes 21 hand landmarks from MediaPipe Hands and produces a HandState object with articulated limbs.
 */
export function processHandLandmarks(
  landmarks: Point3D[],
  handType: 'Left' | 'Right',
  canvasWidth: number,
  canvasHeight: number,
  prevSmoothedPos?: Point2D,
  alpha: number = 0.45,
  pinchThreshold: number = 0.05
): HandState {
  // Mirror X coordinates for natural webcam interaction
  const mirroredLandmarks = landmarks.map((lm) => ({
    x: 1.0 - lm.x,
    y: lm.y,
    z: lm.z,
  }));

  const wrist = mirroredLandmarks[0] || { x: 0.5, y: 0.5, z: 0 };
  const palmCenter = mirroredLandmarks[9] || { x: 0.5, y: 0.3, z: 0 };
  const thumbTip = mirroredLandmarks[4] || { x: 0.35, y: 0.35, z: 0 };
  const indexMcp = mirroredLandmarks[5] || { x: 0.45, y: 0.32, z: 0 };
  const indexPip = mirroredLandmarks[6] || { x: 0.45, y: 0.28, z: 0 };
  const indexTip = mirroredLandmarks[8] || { x: 0.45, y: 0.2, z: 0 };
  const middleTip = mirroredLandmarks[12] || { x: 0.5, y: 0.18, z: 0 };
  const ringTip = mirroredLandmarks[16] || { x: 0.55, y: 0.2, z: 0 };
  const pinkyMcp = mirroredLandmarks[17] || { x: 0.55, y: 0.32, z: 0 };
  const pinkyTip = mirroredLandmarks[20] || { x: 0.6, y: 0.25, z: 0 };

  const wristPosition: Point2D = { x: wrist.x, y: wrist.y };

  // Convert torso base (palm center) to canvas pixel space
  const rawPositionPixels: Point2D = {
    x: palmCenter.x * canvasWidth,
    y: palmCenter.y * canvasHeight,
  };

  // High-performance responsive LERP smoothing (alpha = 0.45)
  let smoothedPosition: Point2D;
  if (prevSmoothedPos) {
    smoothedPosition = {
      x: lerp(prevSmoothedPos.x, rawPositionPixels.x, alpha),
      y: lerp(prevSmoothedPos.y, rawPositionPixels.y, alpha),
    };
  } else {
    smoothedPosition = { ...rawPositionPixels };
  }

  // Scale limbs by the palm width so a given gesture produces the same puppet
  // reach whether the hand is close or far (see `limbScale`).
  const palmWidth = calculateDistance2D(indexMcp, pinkyMcp);
  const scale = limbScale(palmWidth);

  // Hand-local frame so the puppet limbs stay natural regardless of how the
  // hand is rotated on screen:
  //   - `fwd` points along the fingers (palm -> middle fingertip),
  //   - `side` points toward the puppet's LEFT (the pinky side for a Left hand,
  //     the thumb side for a Right hand, after the X-mirror).
  // Each fingertip is then expressed as (across, along). Using only the ACROSS
  // component for the arms/legs keeps them hanging at the puppet's sides even
  // when the palm is held vertical (fingers up), which the old raw
  // tip-minus-palm mapping turned into twisted, up-pointing or crossed limbs.
  let fwdX = middleTip.x - palmCenter.x;
  let fwdY = middleTip.y - palmCenter.y;
  let fwdLen = Math.hypot(fwdX, fwdY);
  if (fwdLen < 1e-6) {
    fwdX = 0;
    fwdY = -1;
    fwdLen = 1;
  }
  fwdX /= fwdLen;
  fwdY /= fwdLen;

  let sideX = pinkyMcp.x - indexMcp.x;
  let sideY = pinkyMcp.y - indexMcp.y;
  let sideLen = Math.hypot(sideX, sideY);
  if (sideLen < 1e-6) {
    sideX = fwdY;
    sideY = -fwdX;
    sideLen = 1;
  }
  sideX /= sideLen;
  sideY /= sideLen;
  // The pinky side of the hand is the puppet's LEFT for a Left hand and the
  // puppet's RIGHT for a Right hand, so flip the axis for Right hands.
  if (handType === 'Right') {
    sideX = -sideX;
    sideY = -sideY;
  }

  const across = (p: Point2D): number => (p.x - palmCenter.x) * sideX + (p.y - palmCenter.y) * sideY; // + = puppet-left
  const along = (p: Point2D): number => (p.x - palmCenter.x) * fwdX + (p.y - palmCenter.y) * fwdY; // + = extended

  // Sort the four limb fingers by how far left they sit (puppet side), so the
  // puppet's arms and legs never cross, regardless of handedness or rotation.
  const limbFingers = [
    { a: across(thumbTip) },
    { a: across(middleTip) },
    { a: across(ringTip) },
    { a: across(pinkyTip) },
  ].sort((x, y) => y.a - x.a);
  const [armL, legL, legR, armR] = limbFingers; // leftmost -> leftArm, ..., rightmost -> rightArm

  const armSpan = scale * 1.7; // splay-driven horizontal arm reach
  const legSpan = scale * 1.15; // legs spread a little less than the arms
  const armBase = 45; // constant base reach so arms always stick out visibly
  const legBase = 16; // constant base stance so legs never collapse onto the body
  const armDrop = scale * 0.06 + 6; // arms rest slightly below the shoulders
  const legLen = scale * 0.36 + 24; // leg length

  // Calculate limb offset vectors relative to the torso center (scaled pixels).
  // The constant bases keep the reach predictable at every hand distance (the
  // `across` variation alone is too small to read on screen); the splay-driven
  // span adds a wide, clearly visible range from a tucked fist to spread palms.
  const limbs: LimbOffsets = {
    head: { x: -across(indexTip) * 0.6 * scale, y: -scale * 0.28 - along(indexTip) * scale * 0.4 },
    leftArm: { x: -(armBase + armL.a * armSpan), y: armDrop },
    rightArm: { x: armBase - armR.a * armSpan, y: armDrop },
    leftLeg: { x: -(legBase + legL.a * legSpan), y: legLen },
    rightLeg: { x: legBase - legR.a * legSpan, y: legLen },
  };

  // 100% EXCLUSIVE Index Finger Flexion for Mouth Opening
  const indexLengthCurrent = calculateDistance2D({ x: indexTip.x, y: indexTip.y }, { x: indexMcp.x, y: indexMcp.y });
  const indexLengthMax = calculateDistance2D({ x: indexPip.x, y: indexPip.y }, { x: indexMcp.x, y: indexMcp.y }) * 2.2;
  const mouthOpenRatio = clamp((indexLengthMax - indexLengthCurrent) / (indexLengthMax * 0.5), 0.0, 1.0);

  // Pinch distance
  const pinchDistance = calculateDistance2D(
    { x: thumbTip.x, y: thumbTip.y },
    { x: indexTip.x, y: indexTip.y }
  );
  const isPinching = pinchDistance < pinchThreshold;

  // Finger splay metric
  const indexPinkyDist = calculateDistance2D(
    { x: indexTip.x, y: indexTip.y },
    { x: pinkyTip.x, y: pinkyTip.y }
  );
  const fingerSplay = clamp((indexPinkyDist - 0.1) / 0.25, 0.0, 1.0);

  // Fist metric: mean fingertip distance to the palm center, normalized by
  // palm width. A clenched fist drives the stop-motion pose freeze.
  const avgTipDistance =
    (calculateDistance2D(indexTip, palmCenter) +
      calculateDistance2D(middleTip, palmCenter) +
      calculateDistance2D(ringTip, palmCenter) +
      calculateDistance2D(pinkyTip, palmCenter)) /
    4;
  const fistValue = fistFactor(avgTipDistance, palmWidth);

  // Zoom gesture: middle finger extended while the other fingertips are
  // curled. Drives the stop-motion camera zoom.
  const otherTipsDistance =
    (calculateDistance2D(indexTip, palmCenter) +
      calculateDistance2D(ringTip, palmCenter) +
      calculateDistance2D(pinkyTip, palmCenter)) /
    3;
  const middleFingerValue = middleFingerFactor(
    calculateDistance2D(middleTip, palmCenter),
    otherTipsDistance,
    palmWidth
  );

  // Rotation angle
  const rotation = calculateAngleRadians(
    { x: wrist.x, y: wrist.y },
    { x: palmCenter.x, y: palmCenter.y }
  );

  return {
    handType,
    wristPosition,
    rawPositionPixels,
    smoothedPosition,
    pinchDistance,
    isPinching,
    mouthOpenRatio,
    fingerSplay,
    fistFactor: fistValue,
    middleFingerFactor: middleFingerValue,
    rotation,
    limbs,
  };
}
