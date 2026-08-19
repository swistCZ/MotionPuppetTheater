import { Texture, Sprite, Container, Rectangle } from 'pixi.js';
import { CutoutRigConfig, Point, RigArmDef, RigLimbDef, RigLimbIK, RigLowerLimbDef, RigPartFile } from './rig';

export interface RigRenderParts {
  bodySprite: Sprite;
  headContainer?: Container;
  headSprite?: Sprite;
  leftArmContainer: Container;
  leftArmSprite: Sprite;
  leftArmLower?: Sprite;
  leftArmIK?: RigLimbIK;
  rightArmContainer: Container;
  rightArmSprite: Sprite;
  rightArmLower?: Sprite;
  rightArmIK?: RigLimbIK;
  leftLegContainer?: Container;
  leftLegSprite?: Sprite;
  leftLegLower?: Sprite;
  leftLegIK?: RigLimbIK;
  rightLegContainer?: Container;
  rightLegSprite?: Sprite;
  rightLegLower?: Sprite;
  rightLegIK?: RigLimbIK;
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

  // Respect the texture's frame: sub-textures (e.g. a limb split at the
  // elbow) must only scan the pixels inside their own region of the canvas.
  const frame = texture.frame;
  const fx = frame.x;
  const fy = frame.y;
  const fw = frame.width;
  const fh = frame.height;

  const resource = texture.source.resource;
  let canvas: HTMLCanvasElement | null = null;
  if (resource instanceof HTMLCanvasElement) {
    canvas = resource;
  } else if (resource instanceof HTMLImageElement) {
    canvas = document.createElement('canvas');
    canvas.width = resource.naturalWidth;
    canvas.height = resource.naturalHeight;
    const drawCtx = canvas.getContext('2d');
    if (drawCtx) drawCtx.drawImage(resource, 0, 0);
  }
  if (!canvas) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return new Rectangle(-w * anchorX, -h * anchorY, w, h);
  }

  let minX = fx + fw;
  let minY = fy + fh;
  let maxX = fx - 1;
  let maxY = fy - 1;
  for (let y = fy; y < fy + fh; y++) {
    for (let x = fx; x < fx + fw; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < fx - 1) return new Rectangle(-w * anchorX, -h * anchorY, w, h);

  const x0 = Math.max(fx, minX - margin);
  const y0 = Math.max(fy, minY - margin);
  const x1 = Math.min(fx + fw, maxX + 1 + margin);
  const y1 = Math.min(fy + fh, maxY + 1 + margin);
  // Convert texture-pixel bounds into sprite-local coords (origin = anchor).
  return new Rectangle(x0 - (fx + w * anchorX), y0 - (fy + h * anchorY), x1 - x0, y1 - y0);
}

/**
 * Finds the limb's far end: the opaque pixel farthest from the given joint,
 * scanning only the lower region (y >= joint.y). Used as the hand/foot for
 * two-bone IK. Falls back to the bottom-center of the image when the canvas
 * cannot be read.
 */
export function computeLimbEnd(canvas: HTMLCanvasElement, joint: Point): Point {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: joint.x, y: canvas.height };
  const { width, height } = canvas;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return { x: joint.x, y: height };
  }
  return scanLimbEnd(data, width, height, joint);
}

/**
 * Pure pixel scan behind {@link computeLimbEnd}. Among opaque pixels below the
 * joint it first finds the farthest from the joint, then picks the one closest
 * to the joint's column. That way round ends that rasterize with antialiased
 * edge pixels pick their center-bottom rather than a slightly-offside side
 * pixel, keeping phi2 on the limb's true axis.
 */
export function scanLimbEnd(data: Uint8ClampedArray, width: number, height: number, joint: Point): Point {
  let bestD = -1;
  for (let y = Math.max(0, Math.floor(joint.y)); y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
      const dx = x - joint.x;
      const dy = y - joint.y;
      const d = dx * dx + dy * dy;
      if (d > bestD) bestD = d;
    }
  }
  let bestX = joint.x;
  let bestY = height;
  let bestMin = Infinity;
  let bestD2 = -1;
  for (let y = Math.max(0, Math.floor(joint.y)); y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
      const dx = x - joint.x;
      const dy = y - joint.y;
      const d = dx * dx + dy * dy;
      const adx = Math.abs(dx);
      if (d >= (Math.sqrt(bestD) - 1) ** 2 && (adx < bestMin || (adx === bestMin && d > bestD2))) {
        bestMin = adx;
        bestD2 = d;
        bestX = x;
        bestY = y;
      }
    }
  }
  return { x: bestX, y: bestY };
}

/** Opaque-pixel bounding box of a canvas in image coordinates. */
export function opaqueBounds(canvas: HTMLCanvasElement): { l: number; t: number; w: number; h: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  if (!ctx) return { l: 0, t: 0, w: width, h: height };
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return { l: 0, t: 0, w: width, h: height };
  }
  let l = width;
  let t = height;
  let r = -1;
  let b = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  if (r < 0) return { l: 0, t: 0, w: width, h: height };
  return { l, t, w: r - l, h: b - t };
}

/**
 * Builds one limb from an upper part (upper arm / thigh) and, when supplied,
 * an attached lower part (forearm / shin). Without a lower part the upper is a
 * single rigid sprite. With one, the lower sprite hangs from the upper's
 * attach point (its own pivot sits exactly there) and the two-bone IK geometry
 * is precomputed for the renderer.
 */
function buildBoneLimb(
  upperCanvas: HTMLCanvasElement,
  upperPivot: Point,
  attach: Point | undefined,
  lower: { canvas: HTMLCanvasElement; pivot: Point } | undefined,
  restAbs: number,
  bendSign: 1 | -1
): { sprite: Sprite; lower?: Sprite; ik?: RigLimbIK } {
  const uw = upperCanvas.width;
  const uh = upperCanvas.height;
  const sprite = new Sprite(Texture.from(upperCanvas));
  const ax = upperPivot.x / uw;
  const ay = upperPivot.y / uh;
  sprite.anchor.set(ax, ay);
  sprite.hitArea = computeOpaqueBounds(sprite.texture, ax, ay);

  if (!lower) {
    sprite.rotation = restAbs;
    return { sprite };
  }

  const joint = attach ?? defaultAttach(upperCanvas);
  const lowerSprite = new Sprite(Texture.from(lower.canvas));
  const lw = lower.canvas.width;
  const lh = lower.canvas.height;
  const lax = lower.pivot.x / lw;
  const lay = lower.pivot.y / lh;
  lowerSprite.anchor.set(lax, lay);
  lowerSprite.hitArea = computeOpaqueBounds(lowerSprite.texture, lax, lay);

  const lowerContainer = new Container();
  lowerContainer.position.set(joint.x - upperPivot.x, joint.y - upperPivot.y);
  lowerContainer.addChild(lowerSprite);
  sprite.addChild(lowerContainer);

  const hand = computeLimbEnd(lower.canvas, lower.pivot);
  const ik: RigLimbIK = {
    len1: Math.hypot(joint.x - upperPivot.x, joint.y - upperPivot.y),
    len2: Math.hypot(hand.x - lower.pivot.x, hand.y - lower.pivot.y),
    phi1: Math.atan2(joint.y - upperPivot.y, joint.x - upperPivot.x),
    phi2: Math.atan2(hand.y - lower.pivot.y, hand.x - lower.pivot.x),
    bendSign,
  };
  sprite.rotation = restAbs - ik.phi1;
  lowerSprite.rotation = ik.phi1 - ik.phi2;

  return { sprite, lower: lowerSprite, ik };
}

/** Fallback joint: the bottom-center of the upper limb's opaque pixels. */
function defaultAttach(canvas: HTMLCanvasElement): Point {
  const b = opaqueBounds(canvas);
  return { x: Math.round(b.l + b.w / 2), y: Math.round(b.t + b.h) };
}

/** Loads the lower part (if any) and builds the two-part limb. */
async function buildLimb(
  upperCanvas: HTMLCanvasElement,
  upperDef: RigArmDef | RigLimbDef,
  lowerPart: RigPartFile | undefined,
  lowerDef: RigLowerLimbDef | undefined,
  bendSign: 1 | -1
): Promise<{ sprite: Sprite; lower?: Sprite; ik?: RigLimbIK }> {
  const lower = lowerPart && lowerDef ? { canvas: await loadPartCanvas(lowerPart), pivot: lowerDef.pivot } : undefined;
  const restAbs =
    'restHandAngle' in upperDef ? upperDef.restHandAngle : (upperDef.restAngle ?? 0) + Math.PI / 2;
  return buildBoneLimb(upperCanvas, upperDef.pivot, upperDef.attach, lower, restAbs, bendSign);
}

/**
 * Builds the sprite hierarchy for a cut-out rig. The puppet container (which
 * owns these parts) is expected to be positioned at the smoothed palm point.
 * The body sprite is anchored center; arms/legs are anchored at their joint
 * pivot and rotated per-frame; the head is anchored center and bobs. Every
 * sprite gets a trimmed hit area so only its visible pixels are draggable.
 */
export async function buildRigParts(config: CutoutRigConfig): Promise<RigRenderParts> {
  const bodyCanvas = await loadPartCanvas(config.parts.body);
  const leftArmCanvas = await loadPartCanvas(config.parts.leftArm);
  const rightArmCanvas = await loadPartCanvas(config.parts.rightArm);

  const bodySprite = new Sprite(Texture.from(bodyCanvas));
  bodySprite.anchor.set(0.5, 0.5);
  bodySprite.hitArea = computeOpaqueBounds(bodySprite.texture, 0.5, 0.5);

  const leftArmLimb = await buildLimb(
    leftArmCanvas,
    config.leftArm,
    config.parts.leftForearm,
    config.leftForearm,
    1
  );
  const leftArmSprite = leftArmLimb.sprite;

  const rightArmLimb = await buildLimb(
    rightArmCanvas,
    config.rightArm,
    config.parts.rightForearm,
    config.rightForearm,
    1
  );
  const rightArmSprite = rightArmLimb.sprite;

  const leftArmContainer = new Container();
  leftArmContainer.addChild(leftArmSprite);
  const rightArmContainer = new Container();
  rightArmContainer.addChild(rightArmSprite);

  let headContainer: Container | undefined;
  let headSprite: Sprite | undefined;
  if (config.parts.head) {
    const headCanvas = await loadPartCanvas(config.parts.head);
    headSprite = new Sprite(Texture.from(headCanvas));
    headSprite.anchor.set(0.5, 0.5);
    headSprite.hitArea = computeOpaqueBounds(headSprite.texture, 0.5, 0.5);
    headContainer = new Container();
    headContainer.addChild(headSprite);
  }

  let leftLegContainer: Container | undefined;
  let leftLegSprite: Sprite | undefined;
  let leftLegLower: Sprite | undefined;
  let leftLegIK: RigLimbIK | undefined;
  if (config.parts.leftLeg && config.leftLeg) {
    const legCanvas = await loadPartCanvas(config.parts.leftLeg);
    const limb = await buildLimb(
      legCanvas,
      config.leftLeg,
      config.parts.leftShin,
      config.leftShin,
      -1
    );
    leftLegSprite = limb.sprite;
    leftLegLower = limb.lower;
    leftLegIK = limb.ik;
    leftLegContainer = new Container();
    leftLegContainer.addChild(leftLegSprite);
  }

  let rightLegContainer: Container | undefined;
  let rightLegSprite: Sprite | undefined;
  let rightLegLower: Sprite | undefined;
  let rightLegIK: RigLimbIK | undefined;
  if (config.parts.rightLeg && config.rightLeg) {
    const legCanvas = await loadPartCanvas(config.parts.rightLeg);
    const limb = await buildLimb(
      legCanvas,
      config.rightLeg,
      config.parts.rightShin,
      config.rightShin,
      -1
    );
    rightLegSprite = limb.sprite;
    rightLegLower = limb.lower;
    rightLegIK = limb.ik;
    rightLegContainer = new Container();
    rightLegContainer.addChild(rightLegSprite);
  }

  return {
    bodySprite,
    headContainer,
    headSprite,
    leftArmContainer,
    leftArmSprite,
    leftArmLower: leftArmLimb.lower,
    leftArmIK: leftArmLimb.ik,
    rightArmContainer,
    rightArmSprite,
    rightArmLower: rightArmLimb.lower,
    rightArmIK: rightArmLimb.ik,
    leftLegContainer,
    leftLegSprite,
    leftLegLower,
    leftLegIK,
    rightLegContainer,
    rightLegSprite,
    rightLegLower,
    rightLegIK,
  };
}