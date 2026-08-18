import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp,
  shortestAngleDelta,
  spreadFactor,
  fistFactor,
  middleFingerFactor,
  limbScale,
  LIMB_SCALE_MIN,
  LIMB_SCALE_MAX,
  calculateDistance2D,
  calculateAngleRadians,
  matchDetectedHandsToPuppets,
  processHandLandmarks,
  DetectedHandInput,
  Point2D,
  Point3D
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

  it('shortestAngleDelta takes the short way around the circle', () => {
    expect(shortestAngleDelta(0, 0)).toBeCloseTo(0);
    expect(shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    // Wraps instead of spinning ~2PI the long way.
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
    expect(shortestAngleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });

  it('spreadFactor maps finger splay to a limb spread multiplier', () => {
    expect(spreadFactor(0)).toBeCloseTo(0.7);
    expect(spreadFactor(1)).toBeCloseTo(1.5);
    expect(spreadFactor(0.5)).toBeCloseTo(1.1);
    // Clamps out-of-range splay values.
    expect(spreadFactor(-1)).toBeCloseTo(0.7);
    expect(spreadFactor(2)).toBeCloseTo(1.5);
  });

  it('limbScale keeps puppet reach consistent across hand distances', () => {
    // At the reference palm width the base scale is used.
    expect(limbScale(0.12)).toBeCloseTo(250);
    // A hand twice as close (bigger palm) uses half the scale ...
    expect(limbScale(0.24)).toBeCloseTo(125);
    // ... and a hand twice as far (smaller palm) uses double the scale.
    expect(limbScale(0.06)).toBeCloseTo(500);
  });

  it('limbScale falls back and clamps for degenerate palms', () => {
    expect(limbScale(0)).toBe(250);       // missing/unreliable palm data
    expect(limbScale(0.01)).toBe(250);    // below the reliable threshold
    expect(limbScale(0.5)).toBe(LIMB_SCALE_MIN); // huge palm -> min clamp
    expect(limbScale(0.021)).toBe(LIMB_SCALE_MAX); // tiny palm -> max clamp
  });

  it('fistFactor reads an open hand as 0 and a tight fist as 1', () => {
    // Open hand: tips ~1.0x palm width away from the palm center.
    expect(fistFactor(1.0, 1.0)).toBeCloseTo(0);
    // Tight fist: tips tucked to ~0.35x palm width.
    expect(fistFactor(0.35, 1.0)).toBeGreaterThan(0.9);
    // Fully curled tips read as a maximal fist.
    expect(fistFactor(0.3, 1.0)).toBeCloseTo(1);
  });

  it('fistFactor interpolates and clamps across the range', () => {
    expect(fistFactor(0.65, 1.0)).toBeCloseTo(0.5);
    expect(fistFactor(0, 1.0)).toBe(1);      // degenerate -> clamped fist
    expect(fistFactor(10, 1.0)).toBe(0);     // huge distance -> clamped open
    expect(fistFactor(0.5, 0.01)).toBe(0);   // unreliable palm -> open fallback
  });

  it('middleFingerFactor reads a raised middle finger as 1 and open hand as 0', () => {
    // Raised middle finger: middle tip far out, others curled in.
    expect(middleFingerFactor(1.3, 0.35, 1.0)).toBeCloseTo(1);
    // Open hand: middle tip extended but so are the other fingertips.
    expect(middleFingerFactor(1.2, 1.1, 1.0)).toBeCloseTo(0);
    // Relaxed fist: middle finger tucked too.
    expect(middleFingerFactor(0.35, 0.35, 1.0)).toBeCloseTo(0);
  });

  it('middleFingerFactor interpolates and falls back on unreliable palms', () => {
    // Half-raised middle finger.
    expect(middleFingerFactor(1.15, 0.4, 1.0)).toBeGreaterThan(0.4);
    expect(middleFingerFactor(1.15, 0.4, 1.0)).toBeLessThan(1);
    // Degenerate palm width -> no gesture.
    expect(middleFingerFactor(1.3, 0.35, 0.01)).toBe(0);
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

  describe('processHandLandmarks limb mapping (natural stance)', () => {
    /** Builds a realistic open palm facing the camera, fingers up and slightly
     * spread. For a Left hand the thumb sits on the image-left (x≈0.32); a
     * Right hand is its mirror image. */
    function openPalm(label: 'Left' | 'Right'): Point3D[] {
      const base = [
        [0.50, 0.75], // 0 wrist
        [0.40, 0.70], [0.36, 0.63], [0.34, 0.56], [0.32, 0.48], // 1-4 thumb
        [0.45, 0.50], [0.44, 0.40], [0.43, 0.33], [0.43, 0.27], // 5-8 index
        [0.50, 0.50], [0.49, 0.38], [0.48, 0.30], [0.48, 0.23], // 9-12 middle
        [0.55, 0.51], [0.55, 0.41], [0.56, 0.34], [0.56, 0.29], // 13-16 ring
        [0.61, 0.53], [0.61, 0.44], [0.62, 0.39], [0.62, 0.34], // 17-20 pinky
      ];
      return base.map(([x, y]) => ({
        x: label === 'Right' ? 1.0 - x : x,
        y,
        z: 0,
      }));
    }

    it('keeps arms out to the sides for a vertical open palm (Left hand)', () => {
      const state = processHandLandmarks(openPalm('Left'), 'Left', 1000, 800);
      expect(state.limbs.leftArm.x).toBeLessThan(0); // points puppet-left
      expect(state.limbs.rightArm.x).toBeGreaterThan(0); // points puppet-right
      expect(state.limbs.head.y).toBeLessThan(0); // head above torso
    });

    it('keeps legs pointing down and uncrossed for a vertical open palm (Left hand)', () => {
      const state = processHandLandmarks(openPalm('Left'), 'Left', 1000, 800);
      expect(state.limbs.leftLeg.y).toBeGreaterThan(0);
      expect(state.limbs.rightLeg.y).toBeGreaterThan(0);
      expect(state.limbs.leftLeg.x).toBeLessThan(state.limbs.rightLeg.x);
    });

    it('keeps arms out and legs down for a vertical open palm (Right hand)', () => {
      const state = processHandLandmarks(openPalm('Right'), 'Right', 1000, 800);
      expect(state.limbs.leftArm.x).toBeLessThan(0);
      expect(state.limbs.rightArm.x).toBeGreaterThan(0);
      expect(state.limbs.leftLeg.y).toBeGreaterThan(0);
      expect(state.limbs.rightLeg.y).toBeGreaterThan(0);
      expect(state.limbs.leftLeg.x).toBeLessThan(state.limbs.rightLeg.x);
    });

    it('tucks the arms in for a fist (fingertips curled to the palm)', () => {
      // Keep the knuckles (Mcps) spread so the palm width is realistic, but
      // curl every fingertip in toward the palm center as a real fist does.
      const fist = openPalm('Left').map((lm, i) => {
        const isTip = [4, 8, 12, 16, 20].includes(i);
        return { ...lm, x: isTip ? 0.5 : lm.x, y: isTip ? 0.5 : lm.y };
      });
      const openState = processHandLandmarks(openPalm('Left'), 'Left', 1000, 800);
      const fistState = processHandLandmarks(fist, 'Left', 1000, 800);
      const reach = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
      // Arms must pull in toward the torso when the fingers curl.
      expect(reach(fistState.limbs.leftArm)).toBeLessThan(reach(openState.limbs.leftArm));
      expect(reach(fistState.limbs.rightArm)).toBeLessThan(reach(openState.limbs.rightArm));
      // Legs keep pointing down (the puppet stays standing).
      expect(fistState.limbs.leftLeg.y).toBeGreaterThan(0);
      expect(fistState.limbs.rightLeg.y).toBeGreaterThan(0);
    });
  });
});
