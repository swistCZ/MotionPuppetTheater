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
  mouthOpenRatio: number; // Continuous 0.0 (closed) to 1.0 (fully open)
  fingerSplay: number; // Continuous 0.0 (fist/together) to 1.0 (spread fingers)
  isWinking: boolean; // True if index finger folded
  rotation: number; // Angle in radians
  limbs: LimbOffsets; // Dynamic 5-finger articulated limb positions
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
  const indexTip = mirroredLandmarks[8] || { x: 0.45, y: 0.2, z: 0 };
  const indexPip = mirroredLandmarks[6] || { x: 0.45, y: 0.28, z: 0 };
  const middleTip = mirroredLandmarks[12] || { x: 0.5, y: 0.18, z: 0 };
  const ringTip = mirroredLandmarks[16] || { x: 0.55, y: 0.2, z: 0 };
  const pinkyTip = mirroredLandmarks[20] || { x: 0.6, y: 0.25, z: 0 };

  const wristPosition: Point2D = { x: wrist.x, y: wrist.y };

  // Convert torso base (palm center) to canvas pixel space
  const rawPositionPixels: Point2D = {
    x: palmCenter.x * canvasWidth,
    y: palmCenter.y * canvasHeight,
  };

  // LERP smoothing
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
  const scale = 250; // Scale factor for finger movement sensitivity
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

  // Calculate pinch distance between thumb and index tip
  const pinchDistance = calculateDistance2D(
    { x: thumbTip.x, y: thumbTip.y },
    { x: indexTip.x, y: indexTip.y }
  );

  const isPinching = pinchDistance < pinchThreshold;

  // Continuous mouth opening ratio
  const mouthOpenRatio = clamp((pinchDistance - 0.03) / 0.15, 0.0, 1.0);

  // Finger splay metric
  const indexPinkyDist = calculateDistance2D(
    { x: indexTip.x, y: indexTip.y },
    { x: pinkyTip.x, y: pinkyTip.y }
  );
  const fingerSplay = clamp((indexPinkyDist - 0.1) / 0.25, 0.0, 1.0);

  // Winking / Expression trigger
  const indexFolded = calculateDistance2D(
    { x: indexTip.x, y: indexTip.y },
    { x: wrist.x, y: wrist.y }
  ) < calculateDistance2D(
    { x: indexPip.x, y: indexPip.y },
    { x: wrist.x, y: wrist.y }
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
    isWinking: indexFolded,
    rotation,
    limbs,
  };
}
