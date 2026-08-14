import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp,
  calculateDistance2D,
  calculateAngleRadians,
  matchDetectedHandsToPuppets,
  DetectedHandInput,
  Point2D
} from './gestures';

/** Builds a hand whose palm (landmark 9) lands at the given mirrored screen coords. */
function handAt(screenX: number, screenY: number, label: 'Left' | 'Right' = 'Left'): DetectedHandInput {
  const rawX = 1.0 - screenX / 1000;
  const rawY = screenY / 800;
  return {
    mediaPipeLabel: label,
    landmarks: Array.from({ length: 21 }, () => ({ x: rawX, y: rawY, z: 0 })),
  };
}

describe('gestures math & matching module', () => {
  it('lerp and clamp work correctly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('calculateDistance2D and calculateAngleRadians compute distance and angle', () => {
    expect(calculateDistance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(calculateAngleRadians({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2);
  });

  it('matchDetectedHandsToPuppets assigns leftmost hand to Left Puppet and rightmost to Right Puppet', () => {
    const rawHands: DetectedHandInput[] = [
      {
        mediaPipeLabel: 'Right',
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.5, z: 0 })), // x=0.8 => Mirrored x=0.2 (200px)
      },
      {
        mediaPipeLabel: 'Left',
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 })), // x=0.2 => Mirrored x=0.8 (800px)
      },
    ];

    const matched = matchDetectedHandsToPuppets(rawHands, undefined, undefined, 1000, 800);

    expect(matched.length).toBe(2);
    const leftSlot = matched.find((m) => m.puppetSlot === 'Left');
    const rightSlot = matched.find((m) => m.puppetSlot === 'Right');

    expect(leftSlot).toBeDefined();
    expect(rightSlot).toBeDefined();
    // Left slot should get the hand near x=200px (raw x=0.8)
    expect(1.0 - leftSlot!.landmarks[9].x).toBeCloseTo(0.2);
  });

  it('proximity matching keeps two hands on their stable slots (no swap)', () => {
    const lastLeft: Point2D = { x: 200, y: 400 };
    const lastRight: Point2D = { x: 800, y: 400 };

    // Hands move slightly toward each other, each still closest to its own slot.
    const matched = matchDetectedHandsToPuppets(
      [handAt(340, 400), handAt(660, 400)],
      lastLeft,
      lastRight,
      1000,
      800
    );

    const leftSlot = matched.find((m) => m.puppetSlot === 'Left')!;
    const rightSlot = matched.find((m) => m.puppetSlot === 'Right')!;
    expect(1.0 - leftSlot.landmarks[9].x).toBeCloseTo(0.34);
    expect(1.0 - rightSlot.landmarks[9].x).toBeCloseTo(0.66);
  });

  it('proximity matching recovers from a crossing without teleporting slots', () => {
    // History is stale (physical left hand is still near 600, right near 200),
    // as it is right after a crossing. Greedy keeps continuity instead of X-sorting.
    const lastLeft: Point2D = { x: 600, y: 400 };
    const lastRight: Point2D = { x: 200, y: 400 };

    const matched = matchDetectedHandsToPuppets(
      [handAt(700, 400), handAt(300, 400)],
      lastLeft,
      lastRight,
      1000,
      800
    );

    // Left puppet keeps the hand near 600px (now at 700), Right keeps the one near 200px (now at 300).
    const leftSlot = matched.find((m) => m.puppetSlot === 'Left')!;
    const rightSlot = matched.find((m) => m.puppetSlot === 'Right')!;
    expect(1.0 - leftSlot.landmarks[9].x).toBeCloseTo(0.7);
    expect(1.0 - rightSlot.landmarks[9].x).toBeCloseTo(0.3);
  });

  it('single hand crossing the screen half keeps its slot when history exists', () => {
    const lastLeft: Point2D = { x: 600, y: 400 };

    // Single hand now on the RIGHT half (x=700) but Left slot history exists.
    const matched = matchDetectedHandsToPuppets(
      [handAt(700, 400, 'Left')],
      lastLeft,
      undefined,
      1000,
      800
    );

    expect(matched.length).toBe(1);
    expect(matched[0].puppetSlot).toBe('Left');
  });

  it('single hand with no history falls back to screen half', () => {
    const matched = matchDetectedHandsToPuppets([handAt(700, 400)], undefined, undefined, 1000, 800);
    expect(matched[0].puppetSlot).toBe('Right');
  });
});
