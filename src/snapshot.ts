import { StagePoseSnapshot, ExtraPuppetPoseSnapshot } from './renderer';

/**
 * Normalizes a possibly-foreign StagePoseSnapshot (e.g. loaded from an old
 * `.mpt` project file written before multi-puppet support) into the current
 * shape. Old snapshots only carried `leftPuppet`/`rightPuppet`; the `puppets`
 * array is guaranteed to exist afterwards.
 */
export function migrateStagePoseSnapshot(raw: unknown): StagePoseSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Neplatná póza snímku.');
  }
  const snap = raw as Partial<StagePoseSnapshot>;
  if (!snap.leftPuppet || !snap.rightPuppet) {
    throw new Error('Póza snímku musí obsahovat levou i pravou loutku.');
  }
  return {
    leftPuppet: snap.leftPuppet,
    rightPuppet: snap.rightPuppet,
    puppets: Array.isArray(snap.puppets)
      ? (snap.puppets as ExtraPuppetPoseSnapshot[]).filter((p) => p && typeof p.id === 'string')
      : [],
    background: snap.background ?? {
      colorHex: 0x2d3748,
      stripActive: false,
      stripNearActive: false,
      stripOffsetX: 0,
      stripOffsetY: 0,
      stripParallaxFactor: 1.6,
    },
  };
}