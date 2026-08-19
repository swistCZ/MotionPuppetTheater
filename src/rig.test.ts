import { describe, it, expect } from 'vitest';
import { armRotation, solveTwoBoneIK, validateRigConfig, CutoutRigConfig } from './rig';

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
    leftLeg: { src: 'characters/demo/left_leg.svg', movable: true },
    rightLeg: { src: 'characters/demo/right_leg.svg', movable: true },
  },
  body: {
    shoulderL: { x: 130, y: 120 },
    shoulderR: { x: 170, y: 120 },
    neck: { x: 150, y: 88 },
    hipL: { x: 126, y: 258 },
    hipR: { x: 174, y: 258 },
  },
  leftArm: { pivot: { x: 30, y: 24 }, restHandAngle: 1.666 },
  rightArm: { pivot: { x: 30, y: 24 }, restHandAngle: 1.476 },
  leftLeg: { pivot: { x: 22, y: 8 }, restAngle: 0 },
  rightLeg: { pivot: { x: 22, y: 8 }, restAngle: 0 },
  head: { bob: 1 },
};

const dims = {
  body: { x: 300, y: 400 },
  head: { x: 120, y: 120 },
  leftArm: { x: 60, y: 160 },
  rightArm: { x: 60, y: 160 },
  leftLeg: { x: 44, y: 150 },
  rightLeg: { x: 44, y: 150 },
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
      leftArm: { pivot: { x: 1, y: 1 }, restHandAngle: 1.5 },
      rightArm: { pivot: { x: 1, y: 1 }, restHandAngle: 1.5 },
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

  it('rejects an elbow above its shoulder pivot', () => {
    const bad = {
      ...baseConfig,
      leftArm: { ...baseConfig.leftArm, elbow: { x: 30, y: 10 } },
    };
    const errors = validateRigConfig(bad, dims);
    expect(errors.some((e) => e.includes('leftArm.elbow'))).toBe(true);
  });

  it('accepts an elbow below the pivot', () => {
    const ok = {
      ...baseConfig,
      leftArm: { ...baseConfig.leftArm, elbow: { x: 26, y: 90 } },
      rightArm: { ...baseConfig.rightArm, elbow: { x: 26, y: 90 } },
    };
    expect(validateRigConfig(ok, dims)).toEqual([]);
  });

  it('accepts a knee below the hip pivot', () => {
    const ok = {
      ...baseConfig,
      leftLeg: { ...baseConfig.leftLeg!, knee: { x: 22, y: 60 } },
      rightLeg: { ...baseConfig.rightLeg!, knee: { x: 22, y: 60 } },
    };
    expect(validateRigConfig(ok, dims)).toEqual([]);
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