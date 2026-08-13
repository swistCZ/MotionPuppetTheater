import { describe, it, expect } from 'vitest';
import {
  lerp,
  calculateDistance2D,
  calculateAngleRadians,
  processHandLandmarks,
  Point3D
} from './gestures';

describe('gestures math module', () => {
  it('lerp should linearly interpolate correctly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0.3)).toBe(13);
    expect(lerp(100, 100, 0.5)).toBe(100);
  });

  it('calculateDistance2D should compute Euclidean distance', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 3, y: 4 };
    expect(calculateDistance2D(p1, p2)).toBeCloseTo(5);
  });

  it('calculateAngleRadians should compute orientation angle', () => {
    const wrist = { x: 0, y: 0 };
    const middleBase = { x: 0, y: -1 }; // Pointing straight up
    expect(calculateAngleRadians(wrist, middleBase)).toBeCloseTo(-Math.PI / 2);
  });

  it('processHandLandmarks should extract pinch state and smooth position', () => {
    // Mock 21 landmarks
    const landmarks: Point3D[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    
    // Landmark 0 (Wrist): (0.5, 0.5)
    landmarks[0] = { x: 0.5, y: 0.5, z: 0 };
    // Landmark 9 (Middle finger MCP): (0.5, 0.3)
    landmarks[9] = { x: 0.5, y: 0.3, z: 0 };
    // Landmark 4 (Thumb tip): (0.4, 0.4, 0)
    landmarks[4] = { x: 0.4, y: 0.4, z: 0 };
    // Landmark 8 (Index tip): (0.42, 0.42, 0) -> Close distance => Pinching
    landmarks[8] = { x: 0.42, y: 0.42, z: 0 };

    const state = processHandLandmarks(landmarks, 'Left', 1000, 800, { x: 400, y: 400 }, 0.5, 0.08);

    expect(state.handType).toBe('Left');
    expect(state.isPinching).toBe(true);
    // Landmark 0 mapped to (500, 400), smoothed with prev (400, 400) alpha 0.5 => (450, 400)
    expect(state.smoothedPosition.x).toBe(450);
    expect(state.smoothedPosition.y).toBe(400);
  });
});
