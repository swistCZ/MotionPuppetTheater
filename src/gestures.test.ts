import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp,
  calculateDistance2D,
  calculateAngleRadians,
  processHandLandmarks,
  Point3D
} from './gestures';

describe('gestures math module', () => {
  it('lerp and clamp work correctly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('calculateDistance2D and calculateAngleRadians compute distance and angle', () => {
    expect(calculateDistance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(calculateAngleRadians({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2);
  });

  it('processHandLandmarks mirrors X and extracts finger splay and mouth ratio', () => {
    const landmarks: Point3D[] = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 }));
    // Landmark 0 (Wrist): x=0.2 => Mirrored x=0.8
    landmarks[0] = { x: 0.2, y: 0.5, z: 0 };
    landmarks[9] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[4] = { x: 0.2, y: 0.5, z: 0 };
    landmarks[8] = { x: 0.2, y: 0.51, z: 0 }; // Close to landmark 4 => Pinching

    const state = processHandLandmarks(landmarks, 'Left', 1000, 800);

    expect(state.handType).toBe('Left');
    expect(state.isPinching).toBe(true);
    expect(state.wristPosition.x).toBeCloseTo(0.8); // Mirrored X
    expect(state.mouthOpenRatio).toBeLessThan(0.2);
  });
});
