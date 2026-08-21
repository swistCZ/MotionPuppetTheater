import { describe, it, expect } from 'vitest';
import { migrateStagePoseSnapshot } from './snapshot';

const oldSnapshot = {
  leftPuppet: { preset: 'fox', position: { x: 10, y: 20 }, rotation: 0 },
  rightPuppet: { preset: 'robot', position: { x: 30, y: 40 }, rotation: 0 },
  background: {
    colorHex: 0x1e1e2e,
    stripActive: false,
    stripNearActive: false,
    stripOffsetX: 5,
    stripOffsetY: 6,
    stripParallaxFactor: 1.6,
  },
};

describe('migrateStagePoseSnapshot', () => {
  it('keeps leftPuppet and rightPuppet', () => {
    const out = migrateStagePoseSnapshot(oldSnapshot);
    expect(out.leftPuppet.preset).toBe('fox');
    expect(out.rightPuppet.preset).toBe('robot');
  });

  it('defaults missing puppets array to [] (legacy .mpt v1)', () => {
    const out = migrateStagePoseSnapshot(oldSnapshot);
    expect(out.puppets).toEqual([]);
  });

  it('preserves existing extra puppets', () => {
    const withExtras = {
      ...oldSnapshot,
      puppets: [
        { id: 'extra-1', preset: 'fox', position: { x: 1, y: 2 }, rotation: 0 },
        { id: 'extra-2', preset: 'rig:demo', position: { x: 3, y: 4 }, rotation: 0 },
      ],
    };
    const out = migrateStagePoseSnapshot(withExtras);
    expect(out.puppets).toHaveLength(2);
    expect(out.puppets![0].id).toBe('extra-1');
    expect(out.puppets![1].preset).toBe('rig:demo');
  });

  it('drops malformed puppets entries', () => {
    const withBad = {
      ...oldSnapshot,
      puppets: [{ preset: 'fox', position: { x: 1, y: 2 }, rotation: 0 }, null, 'x'],
    };
    const out = migrateStagePoseSnapshot(withBad);
    expect(out.puppets).toHaveLength(0);
  });

  it('fills a missing background with defaults', () => {
    const noBg = { leftPuppet: oldSnapshot.leftPuppet, rightPuppet: oldSnapshot.rightPuppet };
    const out = migrateStagePoseSnapshot(noBg);
    expect(out.background.colorHex).toBe(0x2d3748);
    expect(out.background.stripParallaxFactor).toBe(1.6);
  });

  it('throws on invalid input', () => {
    expect(() => migrateStagePoseSnapshot(null)).toThrow();
    expect(() => migrateStagePoseSnapshot({})).toThrow();
    expect(() => migrateStagePoseSnapshot('nope')).toThrow();
  });
});