import { describe, it, expect } from 'vitest';
import { armRotation, solveTwoBoneIK, validateRigConfig, CutoutRigConfig } from './rig';
import { scanLimbEnd } from './rigAssets';

const baseConfig: CutoutRigConfig = {
  id: 'demo',
  name: 'Demo',
  displayScale: 0.75,
  maxArmDelta: 2.6,
  parts: {
    body: { src: 'characters/demo/body.svg' },
    head: { src: 'characters/demo/head.svg', movable: true },
    leftArm: { src: 'characters/demo/left_arm.svg', movable: true },
    rightArm: { src: 'characters/demo/right_arm.svg', movable: true },
    leftForearm: { src: 'characters/demo/left_forearm.svg' },
    rightForearm: { src: 'characters/demo/right_forearm.svg' },
    leftLeg: { src: 'characters/demo/left_leg.svg', movable: true },
    rightLeg: { src: 'characters/demo/right_leg.svg', movable: true },
    leftShin: { src: 'characters/demo/left_shin.svg' },
    rightShin: { src: 'characters/demo/right_shin.svg' },
  },
  body: {
    shoulderL: { x: 130, y: 120 },
    shoulderR: { x: 170, y: 120 },
    neck: { x: 150, y: 88 },
    hipL: { x: 126, y: 258 },
    hipR: { x: 174, y: 258 },
  },
  leftArm: { pivot: { x: 30, y: 24 }, restHandAngle: 1.666, attach: { x: 30, y: 60 } },
  rightArm: { pivot: { x: 30, y: 24 }, restHandAngle: 1.476, attach: { x: 30, y: 60 } },
  leftForearm: { pivot: { x: 30, y: 0 } },
  rightForearm: { pivot: { x: 30, y: 0 } },
  leftLeg: { pivot: { x: 22, y: 8 }, restAngle: 0, attach: { x: 22, y: 50 } },
  rightLeg: { pivot: { x: 22, y: 8 }, restAngle: 0, attach: { x: 22, y: 50 } },
  leftShin: { pivot: { x: 22, y: 0 } },
  rightShin: { pivot: { x: 22, y: 0 } },
  head: { bob: 1 },
};

const dims = {
  body: { x: 300, y: 400 },
  head: { x: 120, y: 120 },
  leftArm: { x: 60, y: 70 },
  rightArm: { x: 60, y: 70 },
  leftForearm: { x: 44, y: 80 },
  rightForearm: { x: 44, y: 80 },
  leftLeg: { x: 44, y: 56 },
  rightLeg: { x: 44, y: 56 },
  leftShin: { x: 44, y: 60 },
  rightShin: { x: 44, y: 60 },
};

describe('rig armRotation', () => {
  it('keeps rest angle when limb vector is zero', () => {
    expect(armRotation({ x: 0, y: 0 }, Math.PI / 2, 2.6)).toBeCloseTo(Math.PI / 2);
  });

  it('aims the arm hand at the limb direction', () => {
    expect(armRotation({ x: 0, y: 10 }, Math.PI / 2, 2.6)).toBeCloseTo(Math.PI / 2);
    expect(armRotation({ x: 10, y: 0 }, Math.PI / 2, 2.6)).toBeCloseTo(0);
  });

  it('clamps the swing to maxDelta', () => {
    const rot = armRotation({ x: -100, y: 0 }, Math.PI / 2, 1.0);
    expect(rot).toBeCloseTo(Math.PI / 2 + 1.0);
  });
});

describe('rig solveTwoBoneIK', () => {
  const fwd = (len1: number, len2: number, pose: { angle1: number; angle2: number }): { x: number; y: number } => ({
    x: len1 * Math.cos(pose.angle1) + len2 * Math.cos(pose.angle1 + pose.angle2),
    y: len1 * Math.sin(pose.angle1) + len2 * Math.sin(pose.angle1 + pose.angle2),
  });

  it('reaches a full-length target straight', () => {
    const pose = solveTwoBoneIK({ x: 2, y: 0 }, 1, 1, 1);
    expect(pose.angle1).toBeCloseTo(0);
    expect(pose.angle2).toBeCloseTo(0);
  });

  it('places the hand exactly on a short target with a downward elbow bend', () => {
    const pose = solveTwoBoneIK({ x: 1, y: 0 }, 1, 1, 1);
    expect(pose.angle1).toBeCloseTo(Math.PI / 3);
    expect(pose.angle2).toBeCloseTo(-(2 * Math.PI) / 3);
    const hand = fwd(1, 1, pose);
    expect(hand.x).toBeCloseTo(1);
    expect(hand.y).toBeCloseTo(0);
    expect(Math.sin(pose.angle1)).toBeGreaterThan(0);
  });

  it('mirrors the bend with a negative bend sign (knees)', () => {
    const pose = solveTwoBoneIK({ x: 1, y: 0 }, 1, 1, -1);
    expect(Math.sin(pose.angle1)).toBeLessThan(0);
    const hand = fwd(1, 1, pose);
    expect(hand.x).toBeCloseTo(1);
    expect(hand.y).toBeCloseTo(0);
  });

  it('clamps an unreachable target to full stretch along its direction', () => {
    const pose = solveTwoBoneIK({ x: 0, y: 5 }, 1, 1, 1);
    expect(pose.angle1).toBeCloseTo(Math.PI / 2);
    expect(pose.angle2).toBeCloseTo(0);
  });

  it('never returns NaN for a degenerate zero target', () => {
    const pose = solveTwoBoneIK({ x: 0, y: 0 }, 1, 1, 1);
    expect(Number.isNaN(pose.angle1)).toBe(false);
    expect(Number.isNaN(pose.angle2)).toBe(false);
  });

  it('reaches targets pointing up (negative y)', () => {
    const pose = solveTwoBoneIK({ x: 1, y: -1 }, 1, 1, 1);
    const hand = fwd(1, 1, pose);
    expect(hand.x).toBeCloseTo(1);
    expect(hand.y).toBeCloseTo(-1);
  });
});

describe('rig validateRigConfig', () => {
  it('accepts a valid config with head and legs', () => {
    expect(validateRigConfig(baseConfig, dims)).toEqual([]);
  });

  it('accepts a minimal config without head/legs', () => {
    const minimal = {
      id: 'x',
      name: 'X',
      displayScale: 1,
      parts: {
        body: { src: 'b' },
        leftArm: { src: 'l' },
        rightArm: { src: 'r' },
      },
      body: { shoulderL: { x: 1, y: 1 }, shoulderR: { x: 2, y: 2 } },
      leftArm: { pivot: { x: 1, y: 1 }, restHandAngle: 1.5, attach: { x: 1, y: 4 } },
      rightArm: { pivot: { x: 1, y: 1 }, restHandAngle: 1.5, attach: { x: 1, y: 4 } },
    };
    expect(validateRigConfig(minimal)).toEqual([]);
  });

  it('rejects a config missing a part source', () => {
    const bad = {
      ...baseConfig,
      parts: { ...baseConfig.parts, leftArm: { src: '' } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftArm.src'))).toBe(true);
  });

  it('rejects a pivot outside its arm image', () => {
    const bad = {
      ...baseConfig,
      leftArm: { ...baseConfig.leftArm, pivot: { x: 999, y: 0 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftArm.pivot'))).toBe(true);
  });

  it('rejects a leg pivot outside its leg image', () => {
    const bad = {
      ...baseConfig,
      leftLeg: { ...baseConfig.leftLeg!, pivot: { x: 0, y: 999 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftLeg.pivot'))).toBe(true);
  });

  it('rejects an attach point above its shoulder pivot', () => {
    const bad = {
      ...baseConfig,
      leftArm: { ...baseConfig.leftArm, attach: { x: 30, y: 10 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftArm.attach'))).toBe(true);
  });

  it('accepts an attach point below the pivot', () => {
    const ok = {
      ...baseConfig,
      leftArm: { ...baseConfig.leftArm, attach: { x: 30, y: 66 } },
      rightArm: { ...baseConfig.rightArm, attach: { x: 30, y: 66 } },
    };
    expect(validateRigConfig(ok, dims)).toEqual([]);
  });

  it('accepts a knee attach below the hip pivot', () => {
    const ok = {
      ...baseConfig,
      leftLeg: { ...baseConfig.leftLeg!, attach: { x: 22, y: 54 } },
      rightLeg: { ...baseConfig.rightLeg!, attach: { x: 22, y: 54 } },
    };
    expect(validateRigConfig(ok, dims)).toEqual([]);
  });

  it('rejects a forearm pivot outside its image', () => {
    const bad = {
      ...baseConfig,
      leftForearm: { ...baseConfig.leftForearm!, pivot: { x: 0, y: 999 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftForearm.pivot'))).toBe(true);
  });

  it('rejects a shin pivot outside its image', () => {
    const bad = {
      ...baseConfig,
      rightShin: { ...baseConfig.rightShin!, pivot: { x: -3, y: 0 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('rightShin.pivot'))).toBe(true);
  });

  it('rejects a shoulder outside the body image', () => {
    const bad = {
      ...baseConfig,
      body: { ...baseConfig.body, shoulderR: { x: -5, y: 120 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('shoulderR'))).toBe(true);
  });

  it('rejects a neck outside the body image', () => {
    const bad = {
      ...baseConfig,
      body: { ...baseConfig.body, neck: { x: 350, y: 88 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('body.neck'))).toBe(true);
  });
});

describe('rig scanLimbEnd', () => {
  const makeData = (width: number, height: number, opaque: Array<[number, number]>): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [x, y] of opaque) {
      data[(y * width + x) * 4 + 3] = 255;
    }
    return data;
  };

  it('returns the farthest opaque pixel', () => {
    const data = makeData(10, 20, [[2, 5], [6, 14], [4, 19]]);
    const end = scanLimbEnd(data, 10, 20, { x: 4, y: 0 });
    expect(end).toEqual({ x: 4, y: 19 });
  });

  it('picks the center-bottom of a round end instead of a side pixel', () => {
    // A vertical rod ending in a filled circle centered at x=4. The antialiased
    // edge leaves symmetric side pixels that are slightly farther from the
    // pivot than the (still opaque) center-bottom pixel; the scan must prefer
    // the pixel closest to the joint's column so phi2 stays on the limb axis.
    const width = 10;
    const height = 16;
    const opaque: Array<[number, number]> = [];
    for (let y = 0; y <= 10; y++) opaque.push([4, y]);
    for (let y = 11; y <= 14; y++) {
      for (let x = 2; x <= 6; x++) {
        if ((x - 4) ** 2 + (y - 12) ** 2 <= 16) opaque.push([x, y]);
      }
    }
    opaque.push([4, 15], [2, 15], [6, 15]);
    const end = scanLimbEnd(makeData(width, height, opaque), width, height, { x: 4, y: 0 });
    expect(end).toEqual({ x: 4, y: 15 });
    expect(Math.atan2(end.y - 0, end.x - 4)).toBeCloseTo(Math.PI / 2);
  });

  it('does not overshoot past the center of a symmetric end', () => {
    const width = 11;
    const height = 18;
    const opaque: Array<[number, number]> = [];
    for (let y = 0; y <= 12; y++) opaque.push([5, y]);
    for (let y = 13; y <= 16; y++) {
      for (let x = 1; x <= 9; x++) {
        if ((x - 5) ** 2 + (y - 15) ** 2 <= 25) opaque.push([x, y]);
      }
    }
    opaque.push([5, 17]); // bottom-center present and farthest
    const end = scanLimbEnd(makeData(width, height, opaque), width, height, { x: 5, y: 0 });
    expect(end).toEqual({ x: 5, y: 17 });
  });

  it('falls back to the farthest pixel when no center-aligned one exists', () => {
    const width = 10;
    const height = 15;
    const opaque: Array<[number, number]> = [];
    for (let y = 0; y <= 10; y++) opaque.push([4, y]);
    opaque.push([2, 13], [6, 13]); // bottom-center entirely absent
    const end = scanLimbEnd(makeData(width, height, opaque), width, height, { x: 4, y: 0 });
    expect(end).toEqual({ x: 2, y: 13 });
  });
});