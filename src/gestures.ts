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

  // Calculate limb offset vectors relative to Palm Center (scaled to pixel coordinates)
  const scale = 250;
  const limbs: LimbOffsets = {
    head: {
      x: (indexTip.x - palmCenter.x) * scale,
      y: (indexTip.y - palmCenter.y) * scale - 40,
    },
    leftArm: {
      x: (thumbTip.x - palmCenter.x) * scale - 50,
      y: (thumbTip.y - palmCenter.y) * scale,
    },
    rightArm: {
      x: (middleTip.x - palmCenter.x) * scale + 50,
      y: (middleTip.y - palmCenter.y) * scale,
    },
    leftLeg: {
      x: (ringTip.x - palmCenter.x) * scale - 25,
      y: (ringTip.y - palmCenter.y) * scale + 60,
    },
    rightLeg: {
      x: (pinkyTip.x - palmCenter.x) * scale + 25,
      y: (pinkyTip.y - palmCenter.y) * scale + 60,
    },
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
    rotation,
    limbs,
  };
}
