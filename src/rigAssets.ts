import { Texture, Sprite, Container } from 'pixi.js';
import { CutoutRigConfig, RigPartFile } from './rig';

export interface RigRenderParts {
  bodySprite: Sprite;
  headContainer?: Container;
  headSprite?: Sprite;
  leftArmContainer: Container;
  leftArmSprite: Sprite;
  rightArmContainer: Container;
  rightArmSprite: Sprite;
  leftLegContainer?: Container;
  leftLegSprite?: Sprite;
  rightLegContainer?: Container;
  rightLegSprite?: Sprite;
}

/** Fetches the list of available rig character ids (from characters/index.json). */
export async function fetchRigIdList(): Promise<string[]> {
  const res = await fetch('characters/index.json');
  if (!res.ok) throw new Error('Nepodařilo se načíst seznam postav (characters/index.json).');
  return res.json();
}

/** Fetches a single rig config for the given character id. */
export async function fetchRigConfig(id: string): Promise<CutoutRigConfig> {
  const res = await fetch(`characters/${id}/config.json`);
  if (!res.ok) throw new Error(`Nepodařilo se načíst config postavy "${id}".`);
  return res.json();
}

// --- browser-local characters (saved from the builder) ---

const LOCAL_STORAGE_PREFIX = 'mpt.character.';

/** Lists character ids stored in the browser's localStorage. */
export function listLocalCharacterIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(LOCAL_STORAGE_PREFIX)) continue;
    const id = key.slice(LOCAL_STORAGE_PREFIX.length);
    if (loadLocalCharacterConfig(id)) ids.push(id);
  }
  return ids.sort();
}

/** Loads a character saved in localStorage, or null if missing/corrupt. */
export function loadLocalCharacterConfig(id: string): CutoutRigConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + id);
    if (!raw) return null;
    const config = JSON.parse(raw) as CutoutRigConfig;
    return config && config.id === id ? config : null;
  } catch {
    return null;
  }
}

/** Saves a character into localStorage (overwrites an existing id). */
export function saveLocalCharacter(config: CutoutRigConfig): void {
  localStorage.setItem(LOCAL_STORAGE_PREFIX + config.id, JSON.stringify(config));
}

/** Removes a character from localStorage. */
export function removeLocalCharacter(id: string): void {
  localStorage.removeItem(LOCAL_STORAGE_PREFIX + id);
}

/**
 * Loads a part image (path or data URL) into an offscreen canvas, optionally
 * removing a near-uniform background (e.g. white/parchment) first.
 */
export async function loadPartCanvas(part: RigPartFile): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = part.src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  if (part.cleanBackground) {
    return removeBackgroundPixels(canvas, part.cleanTolerance ?? 32);
  }
  return canvas;
}

/** Loads a part image and returns a Pixi texture. */
export async function loadPartTexture(part: RigPartFile): Promise<Texture> {
  return Texture.from(await loadPartCanvas(part));
}

/**
 * Removes near-uniform background pixels by sampling the four corners and
 * zeroing pixels within `tolerance` of that color.
 */
export function removeBackgroundPixels(canvas: HTMLCanvasElement, tolerance: number): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  const cornerIndices = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of cornerIndices) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  r /= 4;
  g /= 4;
  b /= 4;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - r;
    const dg = d[i + 1] - g;
    const db = d[i + 2] - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) {
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Builds the sprite hierarchy for a cut-out rig. The puppet container (which
 * owns these parts) is expected to be positioned at the smoothed palm point.
 * The body sprite is anchored center; arms/legs are anchored at their joint
 * pivot and rotated per-frame; the head is anchored center and bobs.
 */
export async function buildRigParts(config: CutoutRigConfig): Promise<RigRenderParts> {
  const bodyTexture = await loadPartTexture(config.parts.body);
  const leftTexture = await loadPartTexture(config.parts.leftArm);
  const rightTexture = await loadPartTexture(config.parts.rightArm);

  const bodySprite = new Sprite(bodyTexture);
  bodySprite.anchor.set(0.5, 0.5);

  const leftArmSprite = new Sprite(leftTexture);
  leftArmSprite.anchor.set(config.leftArm.pivot.x / leftTexture.width, config.leftArm.pivot.y / leftTexture.height);
  leftArmSprite.rotation = config.leftArm.restHandAngle;

  const rightArmSprite = new Sprite(rightTexture);
  rightArmSprite.anchor.set(config.rightArm.pivot.x / rightTexture.width, config.rightArm.pivot.y / rightTexture.height);
  rightArmSprite.rotation = config.rightArm.restHandAngle;

  const leftArmContainer = new Container();
  leftArmContainer.addChild(leftArmSprite);
  const rightArmContainer = new Container();
  rightArmContainer.addChild(rightArmSprite);

  let headContainer: Container | undefined;
  let headSprite: Sprite | undefined;
  if (config.parts.head) {
    const headTexture = await loadPartTexture(config.parts.head);
    headSprite = new Sprite(headTexture);
    headSprite.anchor.set(0.5, 0.5);
    headContainer = new Container();
    headContainer.addChild(headSprite);
  }

  let leftLegContainer: Container | undefined;
  let leftLegSprite: Sprite | undefined;
  if (config.parts.leftLeg && config.leftLeg) {
    const legTexture = await loadPartTexture(config.parts.leftLeg);
    leftLegSprite = new Sprite(legTexture);
    leftLegSprite.anchor.set(config.leftLeg.pivot.x / legTexture.width, config.leftLeg.pivot.y / legTexture.height);
    leftLegSprite.rotation = config.leftLeg.restAngle;
    leftLegContainer = new Container();
    leftLegContainer.addChild(leftLegSprite);
  }

  let rightLegContainer: Container | undefined;
  let rightLegSprite: Sprite | undefined;
  if (config.parts.rightLeg && config.rightLeg) {
    const legTexture = await loadPartTexture(config.parts.rightLeg);
    rightLegSprite = new Sprite(legTexture);
    rightLegSprite.anchor.set(config.rightLeg.pivot.x / legTexture.width, config.rightLeg.pivot.y / legTexture.height);
    rightLegSprite.rotation = config.rightLeg.restAngle;
    rightLegContainer = new Container();
    rightLegContainer.addChild(rightLegSprite);
  }

  return {
    bodySprite,
    headContainer,
    headSprite,
    leftArmContainer,
    leftArmSprite,
    rightArmContainer,
    rightArmSprite,
    leftLegContainer,
    leftLegSprite,
    rightLegContainer,
    rightLegSprite,
  };
}