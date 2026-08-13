export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
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
 * Processes 21 hand landmarks from MediaPipe Hands and produces a HandState object.
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
  const middleMCP = mirroredLandmarks[9] || { x: 0.5, y: 0.3, z: 0 };
  const thumbTip = mirroredLandmarks[4] || { x: 0.4, y: 0.4, z: 0 };
  const indexTip = mirroredLandmarks[8] || { x: 0.4, y: 0.4, z: 0 };
  const indexPip = mirroredLandmarks[6] || { x: 0.4, y: 0.4, z: 0 };
  const pinkyTip = mirroredLandmarks[20] || { x: 0.6, y: 0.4, z: 0 };

  const wristPosition: Point2D = { x: wrist.x, y: wrist.y };

  // Convert to canvas pixel space
  const rawPositionPixels: Point2D = {
    x: wrist.x * canvasWidth,
    y: wrist.y * canvasHeight,
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

  // Calculate pinch distance
  const pinchDistance = calculateDistance2D(
    { x: thumbTip.x, y: thumbTip.y },
    { x: indexTip.x, y: indexTip.y }
  );

  const isPinching = pinchDistance < pinchThreshold;

  // Continuous mouth opening ratio (0.0 = pinch closed, 1.0 = wide open)
  const mouthOpenRatio = clamp((pinchDistance - 0.03) / 0.15, 0.0, 1.0);

  // Finger splay metric (distance between index tip and pinky tip)
  const indexPinkyDist = calculateDistance2D(
    { x: indexTip.x, y: indexTip.y },
    { x: pinkyTip.x, y: pinkyTip.y }
  );
  const fingerSplay = clamp((indexPinkyDist - 0.1) / 0.25, 0.0, 1.0);

  // Winking / Expression trigger (is index finger folded down)
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
    { x: middleMCP.x, y: middleMCP.y }
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
  };
}
