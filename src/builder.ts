import { CutoutRigConfig, Point, RigDimensions, RigPartFile, validateRigConfig } from './rig';
import { saveLocalCharacter } from './rigAssets';

type PartKey = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'leftForearm' | 'rightForearm' | 'leftShin' | 'rightShin';
type Mode =
  | 'shoulderL'
  | 'shoulderR'
  | 'neck'
  | 'hipL'
  | 'hipR'
  | 'pivotL'
  | 'pivotR'
  | 'legPivotL'
  | 'legPivotR'
  | 'elbowL'
  | 'elbowR'
  | 'forearmL'
  | 'forearmR'
  | 'kneeL'
  | 'kneeR'
  | 'shinL'
  | 'shinR';

const ALL_PARTS: PartKey[] = [
  'body',
  'head',
  'leftArm',
  'rightArm',
  'leftForearm',
  'rightForearm',
  'leftLeg',
  'rightLeg',
  'leftShin',
  'rightShin',
];
const MOVABLE_PARTS: PartKey[] = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
const REQUIRED_PARTS: PartKey[] = ['body', 'leftArm', 'rightArm'];
const OPTIONAL_PARTS: PartKey[] = ['head', 'leftForearm', 'rightForearm', 'leftLeg', 'rightLeg', 'leftShin', 'rightShin'];

interface LoadedPart {
  img: HTMLImageElement;
  dataUrl: string;
  base: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** Config shape as imported, including legacy elbow/knee fields from configs
 * authored before the split-limb model. */
type LegacyRigConfig = CutoutRigConfig & {
  leftArm?: CutoutRigConfig['leftArm'] & { elbow?: Point };
  rightArm?: CutoutRigConfig['rightArm'] & { elbow?: Point };
  leftLeg?: CutoutRigConfig['leftLeg'] & { knee?: Point };
  rightLeg?: CutoutRigConfig['rightLeg'] & { knee?: Point };
};

/** Working copy of the config with all optional joints present. */
interface WorkingConfig extends CutoutRigConfig {
  body: CutoutRigConfig['body'] & { neck: Point; hipL: Point; hipR: Point };
  leftArm: CutoutRigConfig['leftArm'] & { attach: Point };
  rightArm: CutoutRigConfig['rightArm'] & { attach: Point };
  leftForearm: { pivot: Point };
  rightForearm: { pivot: Point };
  leftLeg: NonNullable<CutoutRigConfig['leftLeg']> & { attach: Point };
  rightLeg: NonNullable<CutoutRigConfig['rightLeg']> & { attach: Point };
  leftShin: { pivot: Point };
  rightShin: { pivot: Point };
  head: NonNullable<CutoutRigConfig['head']>;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id.replace(/^#/, '')) as T;

const parts: Partial<Record<PartKey, LoadedPart>> = {};
const touched = new Set<PartKey>();

const cfg: WorkingConfig = {
  id: 'postava',
  name: 'Moje postava',
  displayScale: 1,
  maxArmDelta: 2.6,
  parts: {
    body: { src: '' },
    head: { src: '' },
    leftArm: { src: '' },
    rightArm: { src: '' },
    leftForearm: { src: '' },
    rightForearm: { src: '' },
    leftLeg: { src: '' },
    rightLeg: { src: '' },
    leftShin: { src: '' },
    rightShin: { src: '' },
  },
  body: {
    shoulderL: { x: 0, y: 0 },
    shoulderR: { x: 0, y: 0 },
    neck: { x: 0, y: 0 },
    hipL: { x: 0, y: 0 },
    hipR: { x: 0, y: 0 },
  },
  leftArm: { pivot: { x: 0, y: 0 }, restHandAngle: Math.PI / 2, attach: { x: 0, y: 0 } },
  rightArm: { pivot: { x: 0, y: 0 }, restHandAngle: Math.PI / 2, attach: { x: 0, y: 0 } },
  leftForearm: { pivot: { x: 0, y: 0 } },
  rightForearm: { pivot: { x: 0, y: 0 } },
  leftLeg: { pivot: { x: 0, y: 0 }, restAngle: 0, attach: { x: 0, y: 0 } },
  rightLeg: { pivot: { x: 0, y: 0 }, restAngle: 0, attach: { x: 0, y: 0 } },
  leftShin: { pivot: { x: 0, y: 0 } },
  rightShin: { pivot: { x: 0, y: 0 } },
  head: { bob: 1 },
};

let mode: Mode = 'shoulderL';
let swing = false;
let start = performance.now();

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const round = (v: number): number => Math.round(v);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const rad2deg = (r: number): number => (r * 180) / Math.PI;
const deg2rad = (d: number): number => (d * Math.PI) / 180;

// --- background cleaning (same logic as runtime) ---
function removeBackgroundPixels(canvas: HTMLCanvasElement, tolerance: number): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const idx = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of idx) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  r /= 4;
  g /= 4;
  b /= 4;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);
    if (dist <= tolerance) d[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

interface Bounds {
  l: number;
  t: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function opaqueBounds(canvas: HTMLCanvasElement): Bounds {
  const ctx = canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let l = canvas.width;
  let t = canvas.height;
  let r = 0;
  let b = 0;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 16) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n === 0) return { l: 0, t: 0, w: canvas.width, h: canvas.height, cx: canvas.width / 2, cy: canvas.height / 2 };
  return { l, t, w: r - l, h: b - t, cx: sx / n, cy: sy / n };
}

// --- file loading ---
function cleanEnabled(): boolean {
  return ($('#cfg-clean') as HTMLInputElement).checked;
}

function movableOf(key: PartKey): boolean {
  if (key === 'body') return false;
  const el = document.getElementById(`mv-${key}`) as HTMLInputElement | null;
  return el ? el.checked : false;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Čtení souboru selhalo'));
    reader.readAsDataURL(blob);
  });
}

async function loadPartFromSrc(key: PartKey, part: RigPartFile, label: string): Promise<boolean> {
  let dataUrl = part.src;
  if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('blob:')) {
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(String(res.status));
      dataUrl = await blobToDataUrl(await res.blob());
    } catch {
      $<HTMLDivElement>('export-warn').textContent = `Obrázek "${part.src}" se nepodařilo načíst.`;
      return false;
    }
  }
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = dataUrl;
    });
  } catch {
    $<HTMLDivElement>('export-warn').textContent = `Soubor "${label}" není rozpoznán jako obrázek.`;
    return false;
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    $<HTMLDivElement>('export-warn').textContent = `"${label}" nemá rozměry (SVG bez width/height). Exportuj prosím PNG.`;
    return false;
  }
  const base = document.createElement('canvas');
  base.width = img.naturalWidth;
  base.height = img.naturalHeight;
  base.getContext('2d')!.drawImage(img, 0, 0);
  const canvas = cleanEnabled() ? removeBackgroundPixels(base, 32) : base;
  parts[key] = { img, dataUrl, base, canvas, width: img.naturalWidth, height: img.naturalHeight };
  markReady(key, label);
  return true;
}

function loadFile(key: PartKey, input: HTMLInputElement): void {
  const file = input.files?.[0];
  if (!file) return;
  void (async () => {
    const dataUrl = await blobToDataUrl(file);
    const ok = await loadPartFromSrc(key, { src: dataUrl }, file.name);
    if (ok) {
      applyDefaults(key);
      redraw();
    }
  })();
}

function applyDefaults(key: PartKey): void {
  if (touched.has(key)) return;
  const p = parts[key]!;
  const b = opaqueBounds(p.canvas);
  switch (key) {
    case 'body': {
      cfg.body.shoulderL = { x: round(b.l + b.w * 0.3), y: round(b.t + b.h * 0.18) };
      cfg.body.shoulderR = { x: round(b.l + b.w * 0.7), y: round(b.t + b.h * 0.18) };
      cfg.body.neck = { x: round(b.l + b.w * 0.5), y: round(b.t + b.h * 0.12) };
      cfg.body.hipL = { x: round(b.l + b.w * 0.34), y: round(b.t + b.h * 0.82) };
      cfg.body.hipR = { x: round(b.l + b.w * 0.66), y: round(b.t + b.h * 0.82) };
      break;
    }
    case 'leftArm':
    case 'rightArm': {
      const arm = key === 'leftArm' ? cfg.leftArm : cfg.rightArm;
      arm.pivot = { x: round(p.width / 2), y: Math.max(round(b.t + 4), 0) };
      arm.restHandAngle = Math.atan2(b.cy - arm.pivot.y, b.cx - arm.pivot.x);
      arm.attach = { x: round(b.l + b.w / 2), y: round(b.t + b.h) };
      break;
    }
    case 'leftForearm':
    case 'rightForearm': {
      const fa = key === 'leftForearm' ? cfg.leftForearm : cfg.rightForearm;
      fa.pivot = { x: round(b.l + b.w / 2), y: round(b.t) };
      break;
    }
    case 'leftLeg':
    case 'rightLeg': {
      const leg = key === 'leftLeg' ? cfg.leftLeg : cfg.rightLeg;
      leg.pivot = { x: round(p.width / 2), y: Math.max(round(b.t + 4), 0) };
      leg.restAngle = 0;
      leg.attach = { x: round(b.l + b.w / 2), y: round(b.t + b.h) };
      break;
    }
    case 'leftShin':
    case 'rightShin': {
      const sh = key === 'leftShin' ? cfg.leftShin : cfg.rightShin;
      sh.pivot = { x: round(b.l + b.w / 2), y: round(b.t) };
      break;
    }
    case 'head':
      break;
  }
}

/** Fills sensible joint defaults for any limb that still has a (0,0) attach or
 * pivot (e.g. configs imported before the split-limb model existed). */
function ensureLimbJoints(): void {
  const upperKey = (key: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'): 'leftForearm' | 'rightForearm' | 'leftShin' | 'rightShin' =>
    key === 'leftArm' ? 'leftForearm' : key === 'rightArm' ? 'rightForearm' : key === 'leftLeg' ? 'leftShin' : 'rightShin';
  for (const key of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
    const p = parts[key];
    if (!p) continue;
    const def =
      key === 'leftArm'
        ? cfg.leftArm
        : key === 'rightArm'
          ? cfg.rightArm
          : key === 'leftLeg'
            ? cfg.leftLeg
            : cfg.rightLeg;
    if (def.attach.x === 0 && def.attach.y === 0) {
      const b = opaqueBounds(p.canvas);
      def.attach = { x: round(b.l + b.w / 2), y: round(b.t + b.h) };
    }
    const lowerKey = upperKey(key);
    const lp = parts[lowerKey];
    const ldef =
      lowerKey === 'leftForearm'
        ? cfg.leftForearm
        : lowerKey === 'rightForearm'
          ? cfg.rightForearm
          : lowerKey === 'leftShin'
            ? cfg.leftShin
            : cfg.rightShin;
    if (lp && ldef.pivot.x === 0 && ldef.pivot.y === 0) {
      const b = opaqueBounds(lp.canvas);
      ldef.pivot = { x: round(b.l + b.w / 2), y: round(b.t) };
    }
  }
}

function markReady(key: PartKey, label: string): void {
  const dz = $(`dz-${key}`);
  dz.classList.add('ready');
  const thumb = dz.querySelector('.dz-thumb');
  if (thumb) thumb.innerHTML = '';
  const sub = dz.querySelector('.dz-sub');
  if (sub) sub.textContent = label;
  const img = document.createElement('img');
  img.src = parts[key]!.dataUrl;
  thumb?.appendChild(img);
}

function refreshCleaning(): void {
  for (const key of ALL_PARTS) {
    const p = parts[key];
    if (!p) continue;
    p.canvas = cleanEnabled() ? removeBackgroundPixels(p.base, 32) : p.base;
    applyDefaults(key);
  }
  redraw();
}

// --- import of an existing config.json ---
function syncFromCfg(): void {
  ($('#cfg-name') as HTMLInputElement).value = cfg.name;
  ($('#cfg-id') as HTMLInputElement).value = cfg.id;
  ($('#cfg-scale') as HTMLInputElement).value = String(cfg.displayScale);
  ($('#cfg-delta') as HTMLInputElement).value = String(cfg.maxArmDelta);
  ($('#cfg-restL') as HTMLInputElement).value = String(Math.round(rad2deg(cfg.leftArm.restHandAngle)));
  ($('#cfg-restR') as HTMLInputElement).value = String(Math.round(rad2deg(cfg.rightArm.restHandAngle)));
  ($('#cfg-restLegL') as HTMLInputElement).value = String(Math.round(rad2deg(cfg.leftLeg.restAngle)));
  ($('#cfg-restLegR') as HTMLInputElement).value = String(Math.round(rad2deg(cfg.rightLeg.restAngle)));
}

async function importConfig(file: File): Promise<void> {
  let json: LegacyRigConfig;
  try {
    json = JSON.parse(await file.text()) as LegacyRigConfig;
  } catch {
    $<HTMLDivElement>('export-warn').textContent = 'Soubor není platný JSON.';
    return;
  }
  if (!json.parts?.body || !json.parts?.leftArm || !json.parts?.rightArm || !json.body) {
    $<HTMLDivElement>('export-warn').textContent =
      'Toto nevypadá jako rig config (chybí parts.body / parts.leftArm / parts.rightArm / body).';
    return;
  }

  cfg.id = json.id || 'postava';
  cfg.name = json.name || 'Moje postava';
  cfg.displayScale = json.displayScale ?? 1;
  cfg.maxArmDelta = json.maxArmDelta ?? 2.6;
  cfg.body.shoulderL = { ...json.body.shoulderL };
  cfg.body.shoulderR = { ...json.body.shoulderR };
  cfg.body.neck = json.body.neck ? { ...json.body.neck } : cfg.body.neck;
  cfg.body.hipL = json.body.hipL ? { ...json.body.hipL } : cfg.body.hipL;
  cfg.body.hipR = json.body.hipR ? { ...json.body.hipR } : cfg.body.hipR;
  cfg.leftArm = {
    pivot: { ...json.leftArm.pivot },
    restHandAngle: json.leftArm.restHandAngle ?? Math.PI / 2,
    attach: json.leftArm.attach
      ? { ...json.leftArm.attach }
      : json.leftArm.elbow
        ? { ...json.leftArm.elbow }
        : { ...cfg.leftArm.attach },
  };
  cfg.rightArm = {
    pivot: { ...json.rightArm.pivot },
    restHandAngle: json.rightArm.restHandAngle ?? Math.PI / 2,
    attach: json.rightArm.attach
      ? { ...json.rightArm.attach }
      : json.rightArm.elbow
        ? { ...json.rightArm.elbow }
        : { ...cfg.rightArm.attach },
  };
  cfg.leftForearm = json.leftForearm
    ? { pivot: { ...json.leftForearm.pivot } }
    : { ...cfg.leftForearm };
  cfg.rightForearm = json.rightForearm
    ? { pivot: { ...json.rightForearm.pivot } }
    : { ...cfg.rightForearm };
  cfg.leftLeg = json.leftLeg
    ? {
        pivot: { ...json.leftLeg.pivot },
        restAngle: json.leftLeg.restAngle ?? 0,
        attach: json.leftLeg.attach
          ? { ...json.leftLeg.attach }
          : json.leftLeg.knee
            ? { ...json.leftLeg.knee }
            : { ...cfg.leftLeg.attach },
      }
    : cfg.leftLeg;
  cfg.rightLeg = json.rightLeg
    ? {
        pivot: { ...json.rightLeg.pivot },
        restAngle: json.rightLeg.restAngle ?? 0,
        attach: json.rightLeg.attach
          ? { ...json.rightLeg.attach }
          : json.rightLeg.knee
            ? { ...json.rightLeg.knee }
            : { ...cfg.rightLeg.attach },
      }
    : cfg.rightLeg;
  cfg.leftShin = json.leftShin ? { pivot: { ...json.leftShin.pivot } } : { ...cfg.leftShin };
  cfg.rightShin = json.rightShin ? { pivot: { ...json.rightShin.pivot } } : { ...cfg.rightShin };
  cfg.head = json.head ? { bob: json.head.bob ?? 1 } : cfg.head;

  ($('#cfg-clean') as HTMLInputElement).checked = Boolean(
    json.parts.body.cleanBackground ||
      json.parts.leftArm.cleanBackground ||
      json.parts.rightArm.cleanBackground ||
      json.parts.head?.cleanBackground ||
      json.parts.leftForearm?.cleanBackground ||
      json.parts.rightForearm?.cleanBackground ||
      json.parts.leftLeg?.cleanBackground ||
      json.parts.rightLeg?.cleanBackground ||
      json.parts.leftShin?.cleanBackground ||
      json.parts.rightShin?.cleanBackground
  );

  for (const key of MOVABLE_PARTS) {
    const el = document.getElementById(`mv-${key}`) as HTMLInputElement | null;
    if (el) el.checked = json.parts[key]?.movable ?? true;
  }

  touched.clear();
  for (const key of ALL_PARTS) delete parts[key];

  const labels: Record<PartKey, string> = {
    body: 'tělo',
    head: 'hlava',
    leftArm: 'levá paže (nadloktí)',
    rightArm: 'pravá paže (nadloktí)',
    leftForearm: 'levé předloktí',
    rightForearm: 'pravé předloktí',
    leftLeg: 'levá noha (stehno)',
    rightLeg: 'pravá noha (stehno)',
    leftShin: 'levá holeň',
    rightShin: 'pravá holeň',
  };

  const results: [PartKey, boolean][] = [];
  for (const key of REQUIRED_PARTS) {
    results.push([key, await loadPartFromSrc(key, json.parts[key] as RigPartFile, labels[key])]);
  }
  for (const key of OPTIONAL_PARTS) {
    if (json.parts[key]) {
      results.push([key, await loadPartFromSrc(key, json.parts[key]!, labels[key])]);
    }
  }
  for (const key of ALL_PARTS) if (parts[key]) touched.add(key);

  ensureLimbJoints();

  syncFromCfg();
  redraw();

  const okAll = results.every(([, ok]) => ok);
  $<HTMLDivElement>('export-warn').textContent = okAll
    ? 'Model načten. Můžeš upravovat a znovu uložit.'
    : 'Model načten částečně — zkontroluj chybějící obrázky výše.';
}

// --- rendering ---
function activeTarget(): { key: PartKey; point: Point } {
  switch (mode) {
    case 'shoulderL':
      return { key: 'body', point: cfg.body.shoulderL };
    case 'shoulderR':
      return { key: 'body', point: cfg.body.shoulderR };
    case 'neck':
      return { key: 'body', point: cfg.body.neck };
    case 'hipL':
      return { key: 'body', point: cfg.body.hipL };
    case 'hipR':
      return { key: 'body', point: cfg.body.hipR };
    case 'pivotL':
      return { key: 'leftArm', point: cfg.leftArm.pivot };
    case 'pivotR':
      return { key: 'rightArm', point: cfg.rightArm.pivot };
    case 'legPivotL':
      return { key: 'leftLeg', point: cfg.leftLeg.pivot };
    case 'legPivotR':
      return { key: 'rightLeg', point: cfg.rightLeg.pivot };
    case 'elbowL':
      return { key: 'leftArm', point: cfg.leftArm.attach };
    case 'elbowR':
      return { key: 'rightArm', point: cfg.rightArm.attach };
    case 'forearmL':
      return { key: 'leftForearm', point: cfg.leftForearm.pivot };
    case 'forearmR':
      return { key: 'rightForearm', point: cfg.rightForearm.pivot };
    case 'kneeL':
      return { key: 'leftLeg', point: cfg.leftLeg.attach };
    case 'kneeR':
      return { key: 'rightLeg', point: cfg.rightLeg.attach };
    case 'shinL':
      return { key: 'leftShin', point: cfg.leftShin.pivot };
    case 'shinR':
      return { key: 'rightShin', point: cfg.rightShin.pivot };
  }
}

function fitScale(w: number, h: number, maxW: number, maxH: number): number {
  return Math.min(maxW / w, maxH / h);
}

function drawMain(): void {
  const mc = $<HTMLCanvasElement>('main-preview');
  const ctx = mc.getContext('2d')!;
  ctx.clearRect(0, 0, mc.width, mc.height);
  const body = parts.body;
  if (!body) return;

  const scale = Math.min(fitScale(body.width, body.height, mc.width * 0.82, mc.height * 0.84), 2.2);
  const ox = (mc.width - body.width * scale) / 2;
  const oy = (mc.height - body.height * scale) / 2;
  const phase = ((performance.now() - start) / 1000) * 2.2;

  const drawLimb = (key: PartKey, at: Point, rest: number, swingDir: number): void => {
    const p = parts[key];
    if (!p) return;
    const joint =
      key === 'leftArm' ? cfg.leftArm : key === 'rightArm' ? cfg.rightArm : key === 'leftLeg' ? cfg.leftLeg : cfg.rightLeg;
    const lowerKey =
      key === 'leftArm'
        ? 'leftForearm'
        : key === 'rightArm'
          ? 'rightForearm'
          : key === 'leftLeg'
            ? 'leftShin'
            : 'rightShin';
    const lp = parts[lowerKey];
    const lowerDef = lp
      ? lowerKey === 'leftForearm'
        ? cfg.leftForearm
        : lowerKey === 'rightForearm'
          ? cfg.rightForearm
          : lowerKey === 'leftShin'
            ? cfg.leftShin
            : cfg.rightShin
      : null;
    const rot = swing && movableOf(key) ? rest + swingDir * 0.9 * Math.sin(phase) : rest;
    const rotU = lowerDef ? rot - Math.atan2(joint.attach.y - joint.pivot.y, joint.attach.x - joint.pivot.x) : rot;
    ctx.save();
    ctx.translate(ox + at.x * scale, oy + at.y * scale);
    ctx.rotate(rotU);
    ctx.drawImage(p.canvas, -joint.pivot.x * scale, -joint.pivot.y * scale, p.width * scale, p.height * scale);
    if (lp && lowerDef) {
      ctx.save();
      ctx.translate((joint.attach.x - joint.pivot.x) * scale, (joint.attach.y - joint.pivot.y) * scale);
      ctx.drawImage(lp.canvas, -lowerDef.pivot.x * scale, -lowerDef.pivot.y * scale, lp.width * scale, lp.height * scale);
      ctx.restore();
    }
    const jp = joint.attach;
    const activeMode =
      (key === 'leftArm' && mode === 'elbowL') ||
      (key === 'rightArm' && mode === 'elbowR') ||
      (key === 'leftLeg' && mode === 'kneeL') ||
      (key === 'rightLeg' && mode === 'kneeR');
    if (jp && (activeMode || (key.endsWith('Arm') && (mode === 'pivotL' || mode === 'pivotR')))) {
      const jx = (jp.x - joint.pivot.x) * scale;
      const jy = (jp.y - joint.pivot.y) * scale;
      ctx.beginPath();
      ctx.arc(jx, jy, activeMode ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = activeMode ? '#5eead4' : 'rgba(94, 234, 212, 0.45)';
      ctx.fill();
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  };

  ctx.drawImage(body.canvas, ox, oy, body.width * scale, body.height * scale);

  if (parts.leftLeg) drawLimb('leftLeg', cfg.body.hipL, cfg.leftLeg.restAngle, -1);
  if (parts.rightLeg) drawLimb('rightLeg', cfg.body.hipR, cfg.rightLeg.restAngle, -1);

  if (parts.head) {
    const h = parts.head;
    const bob = swing && movableOf('head') ? -0.03 * h.height * 0.9 * Math.sin(phase) : 0;
    ctx.drawImage(
      h.canvas,
      ox + cfg.body.neck.x * scale - (h.width * scale) / 2,
      oy + cfg.body.neck.y * scale - (h.height * scale) / 2 + bob * scale,
      h.width * scale,
      h.height * scale
    );
  }

  if (parts.leftArm) drawLimb('leftArm', cfg.body.shoulderL, cfg.leftArm.restHandAngle, 1);
  if (parts.rightArm) drawLimb('rightArm', cfg.body.shoulderR, cfg.rightArm.restHandAngle, 1);

  const points: [Point, Mode][] = [
    [cfg.body.shoulderL, 'shoulderL'],
    [cfg.body.shoulderR, 'shoulderR'],
    [cfg.body.neck, 'neck'],
    [cfg.body.hipL, 'hipL'],
    [cfg.body.hipR, 'hipR'],
  ];
  for (const [pt, m] of points) {
    const active = m === mode;
    const px = ox + pt.x * scale;
    const py = oy + pt.y * scale;
    ctx.beginPath();
    ctx.arc(px, py, active ? 8 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#f0b429' : 'rgba(240, 180, 41, 0.45)';
    ctx.fill();
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawPart(): void {
  const pc = $<HTMLCanvasElement>('part-preview');
  const ctx = pc.getContext('2d')!;
  ctx.clearRect(0, 0, pc.width, pc.height);
  const { key, point } = activeTarget();
  const p = parts[key];
  if (!p) return;

  const pad = 16;
  const scale = fitScale(p.width, p.height, pc.width - pad * 2, pc.height - pad * 2);
  const ox = (pc.width - p.width * scale) / 2;
  const oy = (pc.height - p.height * scale) / 2;
  ctx.drawImage(p.canvas, ox, oy, p.width * scale, p.height * scale);

  const isUpper = key === 'leftArm' || key === 'rightArm' || key === 'leftLeg' || key === 'rightLeg';
  const isLower = key === 'leftForearm' || key === 'rightForearm' || key === 'leftShin' || key === 'rightShin';
  const joint = isUpper
    ? key === 'leftArm'
      ? cfg.leftArm
      : key === 'rightArm'
        ? cfg.rightArm
        : key === 'leftLeg'
          ? cfg.leftLeg
          : cfg.rightLeg
    : null;

  const ring = (x: number, y: number, r: number, color: string, fill = true): void => {
    ctx.save();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (fill) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Arms: rest-direction guide always from the shoulder pivot.
  if (key === 'leftArm' || key === 'rightArm') {
    const rest = key === 'leftArm' ? cfg.leftArm.restHandAngle : cfg.rightArm.restHandAngle;
    const px = ox + joint!.pivot.x * scale;
    const py = oy + joint!.pivot.y * scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(88,166,255,.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(rest) * 46, py + Math.sin(rest) * 46);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (isUpper && joint) {
    const activeIsAttach = joint.attach === point;
    ring(ox + joint.pivot.x * scale, oy + joint.pivot.y * scale, 7, '#58a6ff', !activeIsAttach);
    ring(ox + joint.attach.x * scale, oy + joint.attach.y * scale, 7, activeIsAttach ? '#f85149' : '#5eead4', activeIsAttach);
  } else if (isLower) {
    ring(ox + point.x * scale, oy + point.y * scale, 7, '#f85149');
  } else {
    const px = ox + point.x * scale;
    const py = oy + point.y * scale;
    ring(px, py, 7, '#f85149');
  }
}

function previewPointFromEvent(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
  scale: number,
  ox: number,
  oy: number,
  maxX: number,
  maxY: number
): Point {
  const rect = canvas.getBoundingClientRect();
  const ix = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const iy = ((e.clientY - rect.top) / rect.height) * canvas.height;
  return { x: round(clamp((ix - ox) / scale, 0, maxX)), y: round(clamp((iy - oy) / scale, 0, maxY)) };
}

function partClick(e: MouseEvent): void {
  const { key, point } = activeTarget();
  const p = parts[key];
  if (!p || key === 'body') return;
  const pc = $<HTMLCanvasElement>('part-preview');
  const pad = 16;
  const scale = fitScale(p.width, p.height, pc.width - pad * 2, pc.height - pad * 2);
  const ox = (pc.width - p.width * scale) / 2;
  const oy = (pc.height - p.height * scale) / 2;
  const pt = previewPointFromEvent(e, pc, scale, ox, oy, p.width, p.height);
  point.x = pt.x;
  point.y = pt.y;
  touched.add(key);
  redraw();
}

function mainClick(e: MouseEvent): void {
  const body = parts.body;
  if (!body) return;
  const mc = $<HTMLCanvasElement>('main-preview');
  const scale = Math.min(fitScale(body.width, body.height, mc.width * 0.82, mc.height * 0.84), 2.2);
  const ox = (mc.width - body.width * scale) / 2;
  const oy = (mc.height - body.height * scale) / 2;
  const pt = previewPointFromEvent(e, mc, scale, ox, oy, body.width, body.height);
  switch (mode) {
    case 'shoulderL':
      cfg.body.shoulderL = pt;
      break;
    case 'shoulderR':
      cfg.body.shoulderR = pt;
      break;
    case 'neck':
      cfg.body.neck = pt;
      break;
    case 'hipL':
      cfg.body.hipL = pt;
      break;
    case 'hipR':
      cfg.body.hipR = pt;
      break;
    default:
      return;
  }
  touched.add('body');
  redraw();
}

function updatePtInputs(): void {
  const { point } = activeTarget();
  const x = $<HTMLInputElement>('pt-x');
  const y = $<HTMLInputElement>('pt-y');
  x.value = String(point.x);
  y.value = String(point.y);
}

function updateJson(): void {
  const out = buildConfig();
  $<HTMLTextAreaElement>('json-out').value = JSON.stringify(out, null, 2);
  const dims = buildDims();
  const errors = validateRigConfig(out, dims);
  const missing = REQUIRED_PARTS.filter((k) => !parts[k]);
  $<HTMLDivElement>('export-warn').textContent = [
    ...(missing.length ? [`chybí soubory: ${missing.join(', ')}`] : []),
    ...errors.map((e) => `Chyba: ${e}`),
  ].join('\n');
}

function buildDims(): RigDimensions {
  const dims: RigDimensions = { body: { x: 0, y: 0 }, leftArm: { x: 0, y: 0 }, rightArm: { x: 0, y: 0 } };
  for (const key of ALL_PARTS) {
    const p = parts[key];
    if (!p) continue;
    const pt = { x: p.width, y: p.height };
    switch (key) {
      case 'body':
      case 'head':
      case 'leftArm':
      case 'rightArm':
      case 'leftForearm':
      case 'rightForearm':
      case 'leftLeg':
      case 'rightLeg':
      case 'leftShin':
      case 'rightShin':
        dims[key] = pt;
    }
  }
  return dims;
}

function buildConfig(): CutoutRigConfig {
  const clean = cleanEnabled();
  const partFile = (key: PartKey): RigPartFile => ({
    src: parts[key]?.dataUrl ?? '',
    ...(clean ? { cleanBackground: true } : {}),
    ...(movableOf(key) ? { movable: true } : {}),
  });

  const out: CutoutRigConfig = {
    id: cfg.id,
    name: cfg.name,
    displayScale: cfg.displayScale,
    maxArmDelta: cfg.maxArmDelta,
    parts: { body: partFile('body'), leftArm: partFile('leftArm'), rightArm: partFile('rightArm') },
    body: {
      shoulderL: { ...cfg.body.shoulderL },
      shoulderR: { ...cfg.body.shoulderR },
    },
    leftArm: { pivot: { ...cfg.leftArm.pivot }, restHandAngle: round3(cfg.leftArm.restHandAngle), attach: { ...cfg.leftArm.attach } },
    rightArm: { pivot: { ...cfg.rightArm.pivot }, restHandAngle: round3(cfg.rightArm.restHandAngle), attach: { ...cfg.rightArm.attach } },
  };

  if (parts.head) {
    out.parts.head = partFile('head');
    out.body.neck = { ...cfg.body.neck };
    out.head = { bob: cfg.head.bob };
  }
  if (parts.leftForearm) {
    out.parts.leftForearm = partFile('leftForearm');
    out.leftForearm = { pivot: { ...cfg.leftForearm.pivot } };
  }
  if (parts.rightForearm) {
    out.parts.rightForearm = partFile('rightForearm');
    out.rightForearm = { pivot: { ...cfg.rightForearm.pivot } };
  }
  if (parts.leftLeg) {
    out.parts.leftLeg = partFile('leftLeg');
    out.body.hipL = { ...cfg.body.hipL };
    out.leftLeg = { pivot: { ...cfg.leftLeg.pivot }, restAngle: round3(cfg.leftLeg.restAngle), attach: { ...cfg.leftLeg.attach } };
  }
  if (parts.rightLeg) {
    out.parts.rightLeg = partFile('rightLeg');
    out.body.hipR = { ...cfg.body.hipR };
    out.rightLeg = { pivot: { ...cfg.rightLeg.pivot }, restAngle: round3(cfg.rightLeg.restAngle), attach: { ...cfg.rightLeg.attach } };
  }
  if (parts.leftShin) {
    out.parts.leftShin = partFile('leftShin');
    out.leftShin = { pivot: { ...cfg.leftShin.pivot } };
  }
  if (parts.rightShin) {
    out.parts.rightShin = partFile('rightShin');
    out.rightShin = { pivot: { ...cfg.rightShin.pivot } };
  }

  return out;
}

function redraw(): void {
  drawMain();
  drawPart();
  updatePtInputs();
  updateJson();
}

/** Returns the config only if all required parts are loaded and valid. */
function readyConfig(): CutoutRigConfig | null {
  if (REQUIRED_PARTS.some((k) => !parts[k])) {
    $<HTMLDivElement>('export-warn').textContent = 'Nejprve nahraj všechny povinné soubory (tělo + obě paže).';
    return null;
  }
  const out = buildConfig();
  const errors = validateRigConfig(out, buildDims());
  if (errors.length) {
    $<HTMLDivElement>('export-warn').textContent = `Nelze uložit: ${errors.join('; ')}`;
    return null;
  }
  return out;
}

// --- wiring ---
function wire(): void {
  for (const key of ALL_PARTS) {
    const input = $(`file-${key}`) as HTMLInputElement;
    input.addEventListener('change', () => loadFile(key, input));
  }

  $<HTMLCanvasElement>('part-preview').addEventListener('click', partClick);
  $<HTMLCanvasElement>('main-preview').addEventListener('click', mainClick);

  document.querySelectorAll<HTMLButtonElement>('.modebar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modebar button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode as Mode;
      redraw();
    });
  });

  for (const key of MOVABLE_PARTS) {
    const el = document.getElementById(`mv-${key}`) as HTMLInputElement | null;
    el?.addEventListener('change', redraw);
  }

  ($('#pt-x') as HTMLInputElement).addEventListener('input', (e) => {
    activeTarget().point.x = round(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });
  ($('#pt-y') as HTMLInputElement).addEventListener('input', (e) => {
    activeTarget().point.y = round(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });

  ($('#cfg-name') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.name = (e.target as HTMLInputElement).value;
    redraw();
  });
  ($('#cfg-id') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.id = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    ($('#cfg-id') as HTMLInputElement).value = cfg.id;
    redraw();
  });
  ($('#cfg-scale') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.displayScale = Number((e.target as HTMLInputElement).value) || 1;
    redraw();
  });
  ($('#cfg-delta') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.maxArmDelta = Number((e.target as HTMLInputElement).value) || 2.6;
    redraw();
  });
  ($('#cfg-restL') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.leftArm.restHandAngle = deg2rad(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });
  ($('#cfg-restR') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.rightArm.restHandAngle = deg2rad(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });
  ($('#cfg-restLegL') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.leftLeg.restAngle = deg2rad(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });
  ($('#cfg-restLegR') as HTMLInputElement).addEventListener('input', (e) => {
    cfg.rightLeg.restAngle = deg2rad(Number((e.target as HTMLInputElement).value) || 0);
    redraw();
  });
  ($('#cfg-swing') as HTMLInputElement).addEventListener('change', (e) => {
    swing = (e.target as HTMLInputElement).checked;
    start = performance.now();
  });
  ($('#cfg-clean') as HTMLInputElement).addEventListener('change', refreshCleaning);

  ($('#btn-import') as HTMLButtonElement).addEventListener('click', () => ($('#file-import') as HTMLInputElement).click());
  ($('#file-import') as HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void importConfig(file);
    input.value = '';
  });

  ($('#btn-save') as HTMLButtonElement).addEventListener('click', () => {
    const out = readyConfig();
    if (!out) return;
    try {
      saveLocalCharacter(out);
      $<HTMLDivElement>('export-warn').textContent = `Postava "${out.name}" uložena — na hlavní stránce ji najdeš v seznamu (tento prohlížeč).`;
    } catch {
      $<HTMLDivElement>('export-warn').textContent = 'Uložení do prohlížeče selhalo (úložiště plné nebo nedostupné).';
    }
  });

  ($('#btn-export') as HTMLButtonElement).addEventListener('click', () => {
    const out = readyConfig();
    if (!out) return;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${out.id}-config.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    $<HTMLDivElement>('export-warn').textContent = 'Staženo — viz návod v textu pod tlačítky.';
  });

  requestAnimationFrame(function loop() {
    if (swing) redraw();
    requestAnimationFrame(loop);
  });
}

$<HTMLInputElement>('cfg-restL').value = String(Math.round(rad2deg(cfg.leftArm.restHandAngle)));
$<HTMLInputElement>('cfg-restR').value = String(Math.round(rad2deg(cfg.rightArm.restHandAngle)));
$<HTMLInputElement>('cfg-restLegL').value = String(Math.round(rad2deg(cfg.leftLeg.restAngle)));
$<HTMLInputElement>('cfg-restLegR').value = String(Math.round(rad2deg(cfg.rightLeg.restAngle)));
wire();
redraw();