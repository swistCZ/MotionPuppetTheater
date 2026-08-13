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
  wristPosition: Point2D; // Normalized (0 to 1)
  rawPositionPixels: Point2D; // Mapped to canvas pixels
  smoothedPosition: Point2D; // Smooth mapped position
  pinchDistance: number; // Normalized distance between thumb and index tips
  isPinching: boolean; // Mouth closed state
  rotation: number; // Orientation angle in radians
}

/**
 * Linear interpolation between start and end.
 */
export function lerp(start: number, end: number, alpha: number): number {
  return start + alpha * (end - start);
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
  pinchThreshold: number = 0.08
): HandState {
  // Landmark 0: Wrist
  // Landmark 9: Middle finger MCP (base of middle finger)
  // Landmark 4: Thumb tip
  // Landmark 8: Index finger tip

  const wrist = landmarks[0] || { x: 0.5, y: 0.5, z: 0 };
  const middleMCP = landmarks[9] || { x: 0.5, y: 0.3, z: 0 };
  const thumbTip = landmarks[4] || { x: 0.4, y: 0.4, z: 0 };
  const indexTip = landmarks[8] || { x: 0.4, y: 0.4, z: 0 };

  const wristPosition: Point2D = { x: wrist.x, y: wrist.y };

  // Convert to canvas pixel space
  const rawPositionPixels: Point2D = {
    x: wrist.x * canvasWidth,
    y: wrist.y * canvasHeight,
  };

  // Apply LERP smoothing if previous position exists
  let smoothedPosition: Point2D;
  if (prevSmoothedPos) {
    smoothedPosition = {
      x: lerp(prevSmoothedPos.x, rawPositionPixels.x, alpha),
      y: lerp(prevSmoothedPos.y, rawPositionPixels.y, alpha),
    };
  } else {
    smoothedPosition = { ...rawPositionPixels };
  }

  // Calculate pinch distance between thumb tip and index tip in normalized coordinates
  const pinchDistance = calculateDistance2D(
    { x: thumbTip.x, y: thumbTip.y },
    { x: indexTip.x, y: indexTip.y }
  );

  const isPinching = pinchDistance < pinchThreshold;

  // Calculate rotation angle relative to wrist pointing to middle finger base
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
    rotation,
  };
}
