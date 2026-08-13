import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp,
  calculateDistance2D,
  calculateAngleRadians,
  matchDetectedHandsToPuppets,
  DetectedHandInput
} from './gestures';

describe('gestures math & spatial matching module', () => {
  it('lerp and clamp work correctly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('calculateDistance2D and calculateAngleRadians compute distance and angle', () => {
    expect(calculateDistance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(calculateAngleRadians({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2);
  });

  it('matchDetectedHandsToPuppets prevents hand swapping based on spatial proximity', () => {
    const rawHands: DetectedHandInput[] = [
      {
        mediaPipeLabel: 'Left', // Erroneously swapped label by MediaPipe
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 })), // x=0.2 => Mirrored x=0.8 (800px)
      },
      {
        mediaPipeLabel: 'Right', // Erroneously swapped label by MediaPipe
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.5, z: 0 })), // x=0.8 => Mirrored x=0.2 (200px)
      },
    ];

    // Previous positions: Left puppet at x=200px, Right puppet at x=800px
    const matched = matchDetectedHandsToPuppets(rawHands, { x: 200, y: 400 }, { x: 800, y: 400 }, 1000, 800);

    expect(matched.length).toBe(2);
    const leftSlot = matched.find((m) => m.puppetSlot === 'Left');
    const rightSlot = matched.find((m) => m.puppetSlot === 'Right');

    expect(leftSlot).toBeDefined();
    expect(rightSlot).toBeDefined();
    // Left slot should get the hand near x=200px (raw x=0.8)
    expect(1.0 - leftSlot!.landmarks[9].x).toBeCloseTo(0.2); // Mirrored X = 0.2 (200px)
  });
});
