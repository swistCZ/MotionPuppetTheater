import { Texture, Sprite, Container, Rectangle } from 'pixi.js';
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
  img.crossOrigin = 'anonymous';
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
 * Computes a hit area matching the sprite's opaque pixels (plus a margin), in
 * the sprite's LOCAL coordinates (origin at the anchor point). Texture-pixel
 * bounds alone are wrong for any non-zero anchor and make the torso
 * unclickable. Falls back to the full texture when pixels cannot be read.
 */
export function computeOpaqueBounds(
  texture: Texture,
  anchorX = 0.5,
  anchorY = 0.5,
  margin = 8
): Rectangle {
  const w = texture.width;
  const h = texture.height;
  if (w <= 0 || h <= 0) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  const resource = texture.source.resource;
  let canvas: HTMLCanvasElement | null = null;
  if (resource instanceof HTMLCanvasElement) {
    canvas = resource;
  } else if (resource instanceof HTMLImageElement) {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const drawCtx = canvas.getContext('2d');
    if (drawCtx) drawCtx.drawImage(resource, 0, 0);
  }
  if (!canvas) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return new Rectangle(-w * anchorX, -h * anchorY, w, h);
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  const x0 = Math.max(0, minX - margin);
  const y0 = Math.max(0, minY - margin);
  const x1 = Math.min(w, maxX + 1 + margin);
  const y1 = Math.min(h, maxY + 1 + margin);
  // Convert texture-pixel bounds into sprite-local coords (origin = anchor).
  return new Rectangle(x0 - w * anchorX, y0 - h * anchorY, x1 - x0, y1 - y0);
}

/**
 * Builds the sprite hierarchy for a cut-out rig. The puppet container (which
 * owns these parts) is expected to be positioned at the smoothed palm point.
 * The body sprite is anchored center; arms/legs are anchored at their joint
 * pivot and rotated per-frame; the head is anchored center and bobs. Every
 * sprite gets a trimmed hit area so only its visible pixels are draggable.
 */
export async function buildRigParts(config: CutoutRigConfig): Promise<RigRenderParts> {
  const bodyTexture = await loadPartTexture(config.parts.body);
  const leftTexture = await loadPartTexture(config.parts.leftArm);
  const rightTexture = await loadPartTexture(config.parts.rightArm);

  const bodySprite = new Sprite(bodyTexture);
  bodySprite.anchor.set(0.5, 0.5);
  bodySprite.hitArea = computeOpaqueBounds(bodyTexture, 0.5, 0.5);

  const leftArmSprite = new Sprite(leftTexture);
  const leftAx = config.leftArm.pivot.x / leftTexture.width;
  const leftAy = config.leftArm.pivot.y / leftTexture.height;
  leftArmSprite.anchor.set(leftAx, leftAy);
  leftArmSprite.rotation = config.leftArm.restHandAngle;
  leftArmSprite.hitArea = computeOpaqueBounds(leftTexture, leftAx, leftAy);

  const rightArmSprite = new Sprite(rightTexture);
  const rightAx = config.rightArm.pivot.x / rightTexture.width;
  const rightAy = config.rightArm.pivot.y / rightTexture.height;
  rightArmSprite.anchor.set(rightAx, rightAy);
  rightArmSprite.rotation = config.rightArm.restHandAngle;
  rightArmSprite.hitArea = computeOpaqueBounds(rightTexture, rightAx, rightAy);

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
    headSprite.hitArea = computeOpaqueBounds(headTexture, 0.5, 0.5);
    headContainer = new Container();
    headContainer.addChild(headSprite);
  }

  let leftLegContainer: Container | undefined;
  let leftLegSprite: Sprite | undefined;
  if (config.parts.leftLeg && config.leftLeg) {
    const legTexture = await loadPartTexture(config.parts.leftLeg);
    const ax = config.leftLeg.pivot.x / legTexture.width;
    const ay = config.leftLeg.pivot.y / legTexture.height;
    leftLegSprite = new Sprite(legTexture);
    leftLegSprite.anchor.set(ax, ay);
    leftLegSprite.rotation = config.leftLeg.restAngle;
    leftLegSprite.hitArea = computeOpaqueBounds(legTexture, ax, ay);
    leftLegContainer = new Container();
    leftLegContainer.addChild(leftLegSprite);
  }

  let rightLegContainer: Container | undefined;
  let rightLegSprite: Sprite | undefined;
  if (config.parts.rightLeg && config.rightLeg) {
    const legTexture = await loadPartTexture(config.parts.rightLeg);
    const ax = config.rightLeg.pivot.x / legTexture.width;
    const ay = config.rightLeg.pivot.y / legTexture.height;
    rightLegSprite = new Sprite(legTexture);
    rightLegSprite.anchor.set(ax, ay);
    rightLegSprite.rotation = config.rightLeg.restAngle;
    rightLegSprite.hitArea = computeOpaqueBounds(legTexture, ax, ay);
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