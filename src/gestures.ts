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
  smoothedPosition: Point2D; // LERP smoothed position
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
 * Matches new MediaPipe hand detections to Puppet slots (Left / Right) based on spatial proximity
 * to eliminate hand swapping/teleportation when hands get close or cross each other.
 */
export function matchDetectedHandsToPuppets(
  detectedHands: DetectedHandInput[],
  lastLeftPos?: Point2D,
  lastRightPos?: Point2D,
  canvasWidth: number = 1000,
  canvasHeight: number = 800
): MatchedHandOutput[] {
  if (detectedHands.length === 0) return [];

  // Convert raw palm centers to canvas pixel coordinates (mirrored X)
  const handPixels = detectedHands.map((dh) => {
    const palm = dh.landmarks[9] || dh.landmarks[0] || { x: 0.5, y: 0.5, z: 0 };
    return {
      x: (1.0 - palm.x) * canvasWidth,
      y: palm.y * canvasHeight,
      mediaPipeLabel: dh.mediaPipeLabel,
      landmarks: dh.landmarks,
    };
  });

  if (detectedHands.length === 1) {
    const h = handPixels[0];
    let assignedSlot: 'Left' | 'Right' = h.mediaPipeLabel;

    // Spatial proximity override if previous positions exist
    if (lastLeftPos && lastRightPos) {
      const distToLeft = calculateDistance2D(h, lastLeftPos);
      const distToRight = calculateDistance2D(h, lastRightPos);
      assignedSlot = distToLeft <= distToRight ? 'Left' : 'Right';
    } else if (lastLeftPos) {
      const distToLeft = calculateDistance2D(h, lastLeftPos);
      assignedSlot = distToLeft < 350 ? 'Left' : h.mediaPipeLabel;
    } else if (lastRightPos) {
      const distToRight = calculateDistance2D(h, lastRightPos);
      assignedSlot = distToRight < 350 ? 'Right' : h.mediaPipeLabel;
    }

    return [{ puppetSlot: assignedSlot, landmarks: h.landmarks }];
  }

  // 2 hands detected: compute distances to Left and Right puppet positions
  const h0 = handPixels[0];
  const h1 = handPixels[1];

  if (lastLeftPos && lastRightPos) {
    // Option A: h0 -> Left, h1 -> Right
    const costA = calculateDistance2D(h0, lastLeftPos) + calculateDistance2D(h1, lastRightPos);
    // Option B: h0 -> Right, h1 -> Left
    const costB = calculateDistance2D(h0, lastRightPos) + calculateDistance2D(h1, lastLeftPos);

    if (costA <= costB) {
      return [
        { puppetSlot: 'Left', landmarks: h0.landmarks },
        { puppetSlot: 'Right', landmarks: h1.landmarks },
      ];
    } else {
      return [
        { puppetSlot: 'Right', landmarks: h0.landmarks },
        { puppetSlot: 'Left', landmarks: h1.landmarks },
      ];
    }
  }

  // Fallback: assign left-most X coordinate on screen to Left Puppet, right-most X to Right Puppet
  if (h0.x <= h1.x) {
    return [
      { puppetSlot: 'Left', landmarks: h0.landmarks },
      { puppetSlot: 'Right', landmarks: h1.landmarks },
    ];
  } else {
    return [
      { puppetSlot: 'Right', landmarks: h0.landmarks },
      { puppetSlot: 'Left', landmarks: h1.landmarks },
    ];
  }
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
  alpha: number = 0.35,
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

  // Adaptive LERP + Outlier Jump Rejection
  let smoothedPosition: Point2D;
  if (prevSmoothedPos) {
    const distDelta = calculateDistance2D(prevSmoothedPos, rawPositionPixels);

    // Reject erratic jumps (> 250px in 1 frame) to stop teleporting
    if (distDelta > 250) {
      const scaleStep = 250 / distDelta;
      rawPositionPixels.x = prevSmoothedPos.x + (rawPositionPixels.x - prevSmoothedPos.x) * scaleStep;
      rawPositionPixels.y = prevSmoothedPos.y + (rawPositionPixels.y - prevSmoothedPos.y) * scaleStep;
    }

    // Adaptive alpha based on base alpha parameter and movement velocity
    const adaptiveAlpha = clamp(alpha * 0.5 + (distDelta / 150) * 0.25, 0.15, 0.6);

    smoothedPosition = {
      x: lerp(prevSmoothedPos.x, rawPositionPixels.x, adaptiveAlpha),
      y: lerp(prevSmoothedPos.y, rawPositionPixels.y, adaptiveAlpha),
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

  // Pinch distance kept only for reference if needed
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
