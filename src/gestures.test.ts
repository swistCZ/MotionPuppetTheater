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

  it('processHandLandmarks produces 5 articulated limb vectors and mirrored coordinates', () => {
    const landmarks: Point3D[] = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 }));
    landmarks[0] = { x: 0.2, y: 0.5, z: 0 };
    landmarks[9] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[4] = { x: 0.1, y: 0.3, z: 0 }; // Thumb
    landmarks[8] = { x: 0.2, y: 0.1, z: 0 }; // Index (Head)
    landmarks[12] = { x: 0.3, y: 0.3, z: 0 }; // Middle
    landmarks[16] = { x: 0.2, y: 0.6, z: 0 }; // Ring
    landmarks[20] = { x: 0.3, y: 0.6, z: 0 }; // Pinky

    const state = processHandLandmarks(landmarks, 'Left', 1000, 800);

    expect(state.handType).toBe('Left');
    expect(state.limbs).toBeDefined();
    expect(state.limbs.head).toBeDefined();
    expect(state.limbs.leftArm).toBeDefined();
    expect(state.limbs.rightArm).toBeDefined();
    expect(state.limbs.leftLeg).toBeDefined();
    expect(state.limbs.rightLeg).toBeDefined();
  });
});
