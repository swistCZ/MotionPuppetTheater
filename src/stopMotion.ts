import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { zipSync } from 'fflate';
import { StagePoseSnapshot } from './renderer';

export interface StopMotionFrame {
  id: string;
  dataUrl: string;
  pose?: StagePoseSnapshot;
}

export interface StopMotionProject {
  version: 1;
  name: string;
  createdAt: number;
  fps: number;
  frames: StopMotionFrame[];
  backgroundAssets?: {
    stripFarDataUrl?: string;
    stripNearDataUrl?: string;
    customBgDataUrl?: string;
  };
}

export interface StopMotionElements {
  panel: HTMLElement;
  strip: HTMLElement;
  onionCanvas: HTMLCanvasElement;
  playCanvas: HTMLCanvasElement;
  gridCanvas: HTMLCanvasElement;
  btnSnap: HTMLButtonElement;
  btnLoadPose?: HTMLButtonElement;
  btnUpdateFrame?: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnDuplicate: HTMLButtonElement;
  btnLeft: HTMLButtonElement;
  btnRight: HTMLButtonElement;
  btnPlay: HTMLButtonElement;
  btnLoop: HTMLButtonElement;
  btnReverse: HTMLButtonElement;
  btnOnion: HTMLButtonElement;
  btnGrid: HTMLButtonElement;
  btnAb: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnClear: HTMLButtonElement;
  btnExportWebm: HTMLButtonElement;
  btnExportGif: HTMLButtonElement;
  btnExportZip: HTMLButtonElement;
  btnSaveProject?: HTMLButtonElement;
  uploadProject?: HTMLInputElement;
  fpsSelect: HTMLSelectElement;
  ghostSelect: HTMLSelectElement;
  onStatus?: (message: string) => void;
  onAfterSnap?: () => void;
  audioSource?: () => MediaStreamAudioDestinationNode | undefined;
  /** Capture clean stage dataURL without handles. */
  captureStageDataUrl?: () => string;
  /** Hide/show stop-motion edit handles around a capture. */
  setHandlesVisible?: (visible: boolean) => void;
  /** Force a Pixi present so toDataURL sees the latest frame. */
  renderNow?: () => void;
  /** Optional windowed-strip chrome (prev/next + "n / total"). */
  stripPrev?: HTMLButtonElement;
  stripNext?: HTMLButtonElement;
  stripMeta?: HTMLElement;
  getPoseSnapshot?: () => StagePoseSnapshot;
  applyPoseSnapshot?: (snapshot: StagePoseSnapshot) => Promise<void> | void;
  getBackgroundAssets?: () => { stripFarDataUrl?: string; stripNearDataUrl?: string; customBgDataUrl?: string };
  applyBackgroundAssets?: (assets: { stripFarDataUrl?: string; stripNearDataUrl?: string; customBgDataUrl?: string }) => Promise<void> | void;
}

/** Max full-size thumbs rendered at once; beyond this the strip is windowed. */
const STRIP_WINDOW = 24;
const STRIP_DENSE_AT = 40;

const ONION_ALPHA = 0.4;
const GRID_STEP = 96;
const HISTORY_LIMIT = 50;

interface TimelineSnapshot {
  frames: StopMotionFrame[];
  selectedIndex: number | null;
}

/**
 * Stop-motion timeline controller: captures snapshots of the Pixi stage as
 * frames, manages the thumbnail strip (select/delete/duplicate/reorder),
 * draws the onion-skin ghost behind the live stage, plays the frames back and
 * exports them (WebM/MP4, GIF, PNG ZIP). Includes registration-grid and A/B
 * flip overlays plus full undo/redo of timeline edits.
 */
export class StopMotionController {
  private frames: StopMotionFrame[] = [];
  private selectedIndex: number | null = null;
  private onionEnabled: boolean = false;
  private playing: boolean = false;
  private playTimer: number | null = null;
  private playIndex: number = 0;
  private loopPlayback: boolean = true;
  private reversePlayback: boolean = false;
  private exporting: boolean = false;
  private modeActive: boolean = false;
  private abMode: boolean = false;
  private gridEnabled: boolean = false;
  private ghostCount: number = 1;
  private undoStack: TimelineSnapshot[] = [];
  private redoStack: TimelineSnapshot[] = [];
  private draggedFrameIndex: number | null = null;

  private onionCtx: CanvasRenderingContext2D;
  private playCtx: CanvasRenderingContext2D;
  private gridCtx: CanvasRenderingContext2D;

  constructor(
    private canvasSource: () => HTMLCanvasElement,
    private elements: StopMotionElements
  ) {
    this.onionCtx = elements.onionCanvas.getContext('2d')!;
    this.playCtx = elements.playCanvas.getContext('2d')!;
    this.gridCtx = elements.gridCanvas.getContext('2d')!;
    this.ghostCount = parseInt(elements.ghostSelect.value, 10) || 1;

    this.elements.btnSnap.addEventListener('click', () => this.snapFrame());
    this.elements.btnLoadPose?.addEventListener('click', () => void this.loadPoseForSelected());
    this.elements.btnUpdateFrame?.addEventListener('click', () => this.updateSelectedFrame());
    this.elements.btnDelete.addEventListener('click', () => this.deleteSelected());
    this.elements.btnDuplicate.addEventListener('click', () => this.duplicateSelected());
    this.elements.btnLeft.addEventListener('click', () => this.moveSelected(-1));
    this.elements.btnRight.addEventListener('click', () => this.moveSelected(1));
    this.elements.btnPlay.addEventListener('click', () => {
      if (this.playing) this.stopPlayback();
      else void this.startPlayback();
    });
    this.elements.btnLoop.addEventListener('click', () => {
      this.loopPlayback = !this.loopPlayback;
      this.elements.btnLoop.classList.toggle('btn-primary', this.loopPlayback);
    });
    this.elements.btnReverse.addEventListener('click', () => {
      this.reversePlayback = !this.reversePlayback;
      this.elements.btnReverse.classList.toggle('btn-primary', this.reversePlayback);
      if (this.playing) this.restartPlayback();
    });
    this.elements.btnOnion.addEventListener('click', () => this.toggleOnion());
    this.elements.btnGrid.addEventListener('click', () => this.toggleGrid());
    this.elements.btnAb.addEventListener('click', () => this.toggleAb());
    this.elements.btnUndo.addEventListener('click', () => this.undo());
    this.elements.btnRedo.addEventListener('click', () => this.redo());
    this.elements.btnClear.addEventListener('click', () => this.clearAll());
    this.elements.btnExportWebm.addEventListener('click', () => void this.exportWebM());
    this.elements.btnExportGif.addEventListener('click', () => void this.exportGif());
    this.elements.btnExportZip.addEventListener('click', () => this.exportZip());
    this.elements.btnSaveProject?.addEventListener('click', () => this.saveProject());
    this.elements.uploadProject?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.loadProjectFile(file);
        (e.target as HTMLInputElement).value = '';
      }
    });
    this.elements.fpsSelect.addEventListener('change', () => {
      if (this.playing) this.restartPlayback();
    });
    this.elements.ghostSelect.addEventListener('change', () => {
      this.ghostCount = parseInt(this.elements.ghostSelect.value, 10) || 1;
      this.updateOnion();
    });
    this.elements.stripPrev?.addEventListener('click', () => this.nudgeStripWindow(-STRIP_WINDOW));
    this.elements.stripNext?.addEventListener('click', () => this.nudgeStripWindow(STRIP_WINDOW));

    // Space bar captures a frame (capture phase so focused buttons don't
    // double-trigger and the page never scrolls).
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Space' || !this.modeActive) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.exporting || this.playing) return;
        this.snapFrame();
      },
      true
    );
  }

  public setModeActive(active: boolean): void {
    this.modeActive = active;
    this.elements.panel.classList.toggle('hidden', !active);
    if (active) {
      // Onion skin is on by default so the previous frame is always visible
      // while posing the next shot.
      this.setOnionEnabled(true);
      return;
    }
    this.stopPlayback();
    this.setOnionEnabled(false);
    this.clearAb();
    this.toggleGrid(false);
    this.updateOnion();
  }

  public resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [
      this.elements.onionCanvas,
      this.elements.playCanvas,
      this.elements.gridCanvas,
    ]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.updateOnion();
    if (this.gridEnabled) this.drawGrid();
  }

  public getFrameCount(): number {
    return this.frames.length;
  }

  public getIsPlaying(): boolean {
    return this.playing;
  }

  // --- Timeline edits (all record undo history) ---

  private captureCleanDataUrl(): string {
    if (this.elements.captureStageDataUrl) {
      return this.elements.captureStageDataUrl();
    }
    this.elements.setHandlesVisible?.(false);
    const canvas = this.canvasSource();
    this.elements.renderNow?.();
    const dataUrl = canvas.toDataURL('image/png');
    this.elements.setHandlesVisible?.(true);
    return dataUrl;
  }

  public snapFrame(): void {
    try {
      this.recordHistory();
      const dataUrl = this.captureCleanDataUrl();
      const pose = this.elements.getPoseSnapshot?.();
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
      this.frames.push({ id, dataUrl, pose });
      this.selectedIndex = this.frames.length - 1;
      this.afterEdit();
      this.elements.onAfterSnap?.();
      this.elements.onStatus?.(`Snímek ${this.frames.length} uložen.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Chyba při ukládání snímku:', err);
      this.elements.onStatus?.(`Chyba snímku: ${msg}`);
    }
  }

  /** Loads the pose snapshot from the selected frame back onto the live stage. */
  public async loadPoseForSelected(): Promise<void> {
    if (this.selectedIndex === null) return;
    const frame = this.frames[this.selectedIndex];
    if (!frame || !frame.pose) {
      this.elements.onStatus?.(`Snímek ${this.selectedIndex + 1} nemá uloženou pózu.`);
      return;
    }
    await this.elements.applyPoseSnapshot?.(frame.pose);
    this.elements.onStatus?.(`Póza ze snímku ${this.selectedIndex + 1} načtena na scénu.`);
  }

  /** Overwrites the selected frame with the live stage (new capture + new pose). */
  public updateSelectedFrame(): void {
    if (this.selectedIndex === null) return;
    this.recordHistory();
    const dataUrl = this.captureCleanDataUrl();
    const pose = this.elements.getPoseSnapshot?.();
    const existing = this.frames[this.selectedIndex];
    this.frames[this.selectedIndex] = { id: existing.id, dataUrl, pose };
    this.afterEdit();
    this.elements.onStatus?.(`Snímek ${this.selectedIndex + 1} byl přepsán aktuální scénou.`);
  }

  public deleteSelected(): void {
    if (this.selectedIndex === null) return;
    this.recordHistory();
    this.frames.splice(this.selectedIndex, 1);
    if (this.frames.length === 0) {
      this.selectedIndex = null;
    } else {
      this.selectedIndex = Math.min(this.selectedIndex, this.frames.length - 1);
    }
    this.afterEdit();
  }

  public duplicateSelected(): void {
    if (this.selectedIndex === null) return;
    this.recordHistory();
    const copy = this.frames[this.selectedIndex];
    const dup: StopMotionFrame = {
      ...copy,
      id: `${copy.id}-dup-${Date.now()}`,
      pose: copy.pose ? JSON.parse(JSON.stringify(copy.pose)) : undefined,
    };
    this.frames.splice(this.selectedIndex + 1, 0, dup);
    this.selectedIndex += 1;
    this.afterEdit();
  }

  public moveSelected(delta: -1 | 1): void {
    if (this.selectedIndex === null) return;
    const target = this.selectedIndex + delta;
    if (target < 0 || target >= this.frames.length) return;
    this.moveFrame(this.selectedIndex, target);
  }

  /** Moves a frame from one timeline position to another (used also by drag & drop). */
  public moveFrame(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.frames.length) return;
    if (toIndex < 0 || toIndex >= this.frames.length) return;
    this.recordHistory();
    const [frame] = this.frames.splice(fromIndex, 1);
    this.frames.splice(toIndex, 0, frame);
    this.selectedIndex = toIndex;
    this.afterEdit();
  }

  public clearAll(): void {
    if (this.frames.length === 0) return;
    const ok = window.confirm(
      `Opravdu smazat VŠECHNY snímky (${this.frames.length})? Tuto akci lze vrátit tlačítkem Zpět.`
    );
    if (!ok) return;
    this.recordHistory();
    this.frames = [];
    this.selectedIndex = null;
    this.afterEdit();
  }

  private recordHistory(): void {
    this.undoStack.push({ frames: [...this.frames], selectedIndex: this.selectedIndex });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push({ frames: [...this.frames], selectedIndex: this.selectedIndex });
    this.frames = entry.frames;
    this.selectedIndex = entry.selectedIndex;
    this.afterEdit();
  }

  private redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push({ frames: [...this.frames], selectedIndex: this.selectedIndex });
    this.frames = entry.frames;
    this.selectedIndex = entry.selectedIndex;
    this.afterEdit();
  }

  private afterEdit(): void {
    this.renderStrip();
    this.updateOnion();
    this.updateAb();
    this.updateButtons();
  }

  // --- Onion skin ---

  public toggleOnion(): void {
    this.setOnionEnabled(!this.onionEnabled);
    this.updateOnion();
  }

  private setOnionEnabled(enabled: boolean): void {
    this.onionEnabled = enabled;
    this.elements.onionCanvas.classList.toggle('active', enabled);
    this.elements.btnOnion.classList.toggle('btn-primary', enabled);
    if (!enabled) {
      this.onionCtx.clearRect(0, 0, this.elements.onionCanvas.width, this.elements.onionCanvas.height);
    }
  }

  /** Draws the last `ghostCount` frames ending at the reference frame, the
   * newest ghost most opaque. */
  private updateOnion(): void {
    if (!this.onionEnabled) return;
    const reference = this.selectedIndex !== null ? this.selectedIndex : this.frames.length - 1;
    if (reference < 0) {
      this.onionCtx.clearRect(0, 0, this.elements.onionCanvas.width, this.elements.onionCanvas.height);
      return;
    }
    const start = Math.max(0, reference - (this.ghostCount - 1));
    const subset = this.frames.slice(start, reference + 1);

    const images: HTMLImageElement[] = [];
    let pending = subset.length;
    if (pending === 0) return;
    for (const frame of subset) {
      const img = new Image();
      img.onload = () => {
        pending -= 1;
        if (pending === 0 && this.onionEnabled) this.drawGhosts(images);
      };
      img.onerror = () => {
        pending -= 1;
      };
      img.src = frame.dataUrl;
      images.push(img);
    }
  }

  private drawGhosts(images: HTMLImageElement[]): void {
    const canvas = this.elements.onionCanvas;
    this.onionCtx.clearRect(0, 0, canvas.width, canvas.height);
    const n = images.length;
    for (let i = 0; i < n; i++) {
      this.onionCtx.globalAlpha = ONION_ALPHA * (0.4 + (0.6 * (i + 1)) / n);
      this.onionCtx.drawImage(images[i], 0, 0, canvas.width, canvas.height);
    }
    this.onionCtx.globalAlpha = 1;
  }

  // --- Registration grid ---

  private toggleGrid(force?: boolean): void {
    this.gridEnabled = force ?? !this.gridEnabled;
    this.elements.gridCanvas.classList.toggle('active', this.gridEnabled);
    this.elements.btnGrid.classList.toggle('btn-primary', this.gridEnabled);
    if (this.gridEnabled) this.drawGrid();
    else this.gridCtx.clearRect(0, 0, this.elements.gridCanvas.width, this.elements.gridCanvas.height);
  }

  private drawGrid(): void {
    const canvas = this.elements.gridCanvas;
    const ctx = this.gridCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(88, 166, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = GRID_STEP; x < canvas.width; x += GRID_STEP) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = GRID_STEP; y < canvas.height; y += GRID_STEP) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
  }

  // --- A/B flip (live scene vs reference frame) ---

  private toggleAb(): void {
    if (this.abMode) {
      this.clearAb();
    } else {
      this.abMode = true;
      this.elements.btnAb.classList.add('btn-primary');
      this.stopPlayback();
      this.updateAb();
    }
    this.updateButtons();
  }

  private updateAb(): void {
    if (!this.abMode) return;
    const reference = this.selectedIndex !== null ? this.selectedIndex : this.frames.length - 1;
    if (reference < 0) {
      this.clearAb();
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (!this.abMode) return;
      const canvas = this.elements.playCanvas;
      canvas.classList.add('active');
      this.playCtx.clearRect(0, 0, canvas.width, canvas.height);
      this.playCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = this.frames[reference].dataUrl;
  }

  private clearAb(): void {
    this.abMode = false;
    this.elements.btnAb.classList.remove('btn-primary');
    this.elements.playCanvas.classList.remove('active');
    this.playCtx.clearRect(0, 0, this.elements.playCanvas.width, this.elements.playCanvas.height);
  }

  // --- Playback ---

  private async startPlayback(): Promise<void> {
    if (this.frames.length === 0) return;
    this.stopPlayback();
    if (this.abMode) this.clearAb();
    this.playing = true;
    this.elements.btnPlay.textContent = 'Stop';

    const images: HTMLImageElement[] = [];
    for (const frame of this.frames) {
      const img = new Image();
      img.src = frame.dataUrl;
      images.push(img);
    }
    try {
      await Promise.all(images.map((img) => img.decode()));
    } catch {
      // decode() can reject on some browsers; fall back to playing anyway.
    }

    const fps = parseInt(this.elements.fpsSelect.value, 10) || 24;
    this.elements.playCanvas.classList.add('active');
    this.playIndex = this.reversePlayback ? images.length - 1 : 0;
    this.drawPlayFrame(images);

    this.playTimer = window.setInterval(() => {
      if (this.reversePlayback) {
        this.playIndex -= 1;
        if (this.playIndex < 0) {
          if (!this.loopPlayback) {
            this.stopPlayback();
            return;
          }
          this.playIndex = images.length - 1;
        }
      } else {
        this.playIndex += 1;
        if (this.playIndex >= images.length) {
          if (!this.loopPlayback) {
            this.stopPlayback();
            return;
          }
          this.playIndex = 0;
        }
      }
      this.drawPlayFrame(images);
    }, 1000 / fps);
  }

  private drawPlayFrame(images: HTMLImageElement[]): void {
    const img = images[this.playIndex];
    if (!img) return;
    this.playCtx.clearRect(0, 0, this.elements.playCanvas.width, this.elements.playCanvas.height);
    this.playCtx.drawImage(img, 0, 0, this.elements.playCanvas.width, this.elements.playCanvas.height);
  }

  private restartPlayback(): void {
    if (!this.playing) return;
    void this.startPlayback();
  }

  private stopPlayback(): void {
    if (this.playTimer !== null) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    if (this.playing) {
      this.playing = false;
      this.elements.playCanvas.classList.remove('active');
      this.playCtx.clearRect(0, 0, this.elements.playCanvas.width, this.elements.playCanvas.height);
    }
    this.elements.btnPlay.textContent = 'Přehrát';
  }

  // --- Frame strip (windowed for large timelines) ---

  private stripWindowStart = 0;

  private nudgeStripWindow(delta: number): void {
    const total = this.frames.length;
    if (total <= STRIP_WINDOW) {
      this.stripWindowStart = 0;
      this.renderStrip();
      return;
    }
    const maxStart = Math.max(0, total - STRIP_WINDOW);
    this.stripWindowStart = Math.max(0, Math.min(maxStart, this.stripWindowStart + delta));
    this.renderStrip();
  }

  /** Keeps the selected frame inside the visible window when possible. */
  private ensureSelectionInWindow(): void {
    const total = this.frames.length;
    if (total <= STRIP_WINDOW) {
      this.stripWindowStart = 0;
      return;
    }
    const maxStart = Math.max(0, total - STRIP_WINDOW);
    const sel = this.selectedIndex ?? total - 1;
    if (sel < this.stripWindowStart) this.stripWindowStart = sel;
    else if (sel >= this.stripWindowStart + STRIP_WINDOW) {
      this.stripWindowStart = Math.min(maxStart, sel - STRIP_WINDOW + 1);
    }
    this.stripWindowStart = Math.max(0, Math.min(maxStart, this.stripWindowStart));
  }

  private renderStrip(): void {
    const strip = this.elements.strip;
    strip.textContent = '';
    const total = this.frames.length;
    this.ensureSelectionInWindow();

    strip.classList.toggle('dense', total >= STRIP_DENSE_AT);

    if (total === 0) {
      if (this.elements.stripMeta) this.elements.stripMeta.textContent = '';
      if (this.elements.stripPrev) this.elements.stripPrev.disabled = true;
      if (this.elements.stripNext) this.elements.stripNext.disabled = true;
      return;
    }

    const windowed = total > STRIP_WINDOW;
    const start = windowed ? this.stripWindowStart : 0;
    const end = windowed ? Math.min(total, start + STRIP_WINDOW) : total;

    if (windowed && start > 0) {
      const gap = document.createElement('span');
      gap.className = 'sm-frame-gap';
      gap.textContent = `…1–${start}`;
      gap.title = 'Starší snímky — použij šipku vlevo';
      strip.appendChild(gap);
    }

    for (let index = start; index < end; index++) {
      const frame = this.frames[index];
      const thumb = document.createElement('div');
      thumb.className = 'sm-frame-thumb';
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('tabindex', '0');
      thumb.title = `Snímek ${index + 1} / ${total}`;
      if (index === this.selectedIndex) thumb.classList.add('selected');

      const img = document.createElement('img');
      img.src = frame.dataUrl;
      img.alt = `Snímek ${index + 1}`;

      const label = document.createElement('span');
      label.className = 'sm-frame-index';
      label.textContent = String(index + 1);

      thumb.appendChild(img);
      thumb.appendChild(label);

      thumb.draggable = true;
      thumb.addEventListener('dragstart', (e) => {
        this.draggedFrameIndex = index;
        thumb.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        }
      });
      thumb.addEventListener('dragend', () => {
        this.draggedFrameIndex = null;
        thumb.classList.remove('dragging');
        strip.querySelectorAll('.sm-frame-thumb').forEach((t) => t.classList.remove('drag-over-left', 'drag-over-right'));
      });
      thumb.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        const rect = thumb.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        thumb.classList.toggle('drag-over-left', isLeft);
        thumb.classList.toggle('drag-over-right', !isLeft);
      });
      thumb.addEventListener('dragleave', () => {
        thumb.classList.remove('drag-over-left', 'drag-over-right');
      });
      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        thumb.classList.remove('drag-over-left', 'drag-over-right');
        const from = this.draggedFrameIndex;
        if (from === null || from === index) return;
        const rect = thumb.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        let target = isLeft ? index : index + 1;
        if (from < target) target -= 1;
        this.moveFrame(from, target);
      });

      const selectThis = () => {
        this.selectedIndex = index;
        this.renderStrip();
        this.updateOnion();
        this.updateAb();
        this.updateButtons();
      };
      thumb.addEventListener('click', selectThis);
      thumb.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          selectThis();
        }
      });
      thumb.addEventListener('dblclick', () => {
        void this.loadPoseForSelected();
      });
      strip.appendChild(thumb);
    }

    if (windowed && end < total) {
      const gap = document.createElement('span');
      gap.className = 'sm-frame-gap';
      gap.textContent = `…${end + 1}–${total}`;
      gap.title = 'Novější snímky — použij šipku vpravo';
      strip.appendChild(gap);
    }

    const sel = (this.selectedIndex ?? 0) + 1;
    if (this.elements.stripMeta) {
      this.elements.stripMeta.textContent = windowed
        ? `${sel}/${total} · ${start + 1}–${end}`
        : `${sel} / ${total}`;
    }
    if (this.elements.stripPrev) this.elements.stripPrev.disabled = !windowed || start <= 0;
    if (this.elements.stripNext) this.elements.stripNext.disabled = !windowed || end >= total;

    const selectedEl = strip.querySelector('.sm-frame-thumb.selected') as HTMLElement | null;
    selectedEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // --- Export (WebM / GIF / PNG-ZIP) ---

  /**
   * Records the frames as a WebM/MP4 video at the selected fps by drawing each
   * frame to a canvas and pushing it into the MediaStream via requestFrame().
   * When a Theremin audio node is provided (and enabled), its stream is mixed
   * into the recording as the soundtrack.
   */
  private async exportWebM(): Promise<void> {
    if (this.exporting || this.frames.length === 0) return;
    this.setExporting(true);
    this.stopPlayback();
    if (this.abMode) this.clearAb();
    try {
      const fps = parseInt(this.elements.fpsSelect.value, 10) || 24;
      const canvas = this.elements.playCanvas;
      const canvasStream = canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream };
      if (typeof canvasStream.captureStream !== 'function') {
        this.elements.onStatus?.('Export WebM není v tomto prohlížeči podporován.');
        return;
      }

      const stream = canvasStream.captureStream(0);
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };

      // Mix in the Theremin soundtrack when active.
      let combinedStream: MediaStream = stream;
      const audioNode = this.elements.audioSource?.();
      if (audioNode && audioNode.stream.getAudioTracks().length > 0) {
        combinedStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...audioNode.stream.getAudioTracks(),
        ]);
      }

      const mimeType = this.getSupportedMimeType();
      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      this.elements.onStatus?.('Exportuji WebM...');
      const images = await this.loadImages(this.frames);
      // Show the playback overlay while recording so captureStream always
      // captures a rendered canvas (some browsers emit black frames from
      // display:none canvases).
      this.elements.playCanvas.classList.add('active');
      recorder.start();

      const drawFrame = (img: HTMLImageElement): void => {
        this.playCtx.clearRect(0, 0, canvas.width, canvas.height);
        this.playCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (typeof track.requestFrame === 'function') track.requestFrame();
      };

      await new Promise<void>((resolve) => {
        drawFrame(images[0]);
        let i = 0;
        const timer = window.setInterval(() => {
          i += 1;
          if (i >= images.length) {
            clearInterval(timer);
            resolve();
            return;
          }
          drawFrame(images[i]);
        }, 1000 / fps);
      });

      recorder.stop();
      await stopped;
      if (chunks.length > 0) {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        this.downloadBlob(new Blob(chunks, { type: mimeType }), `stop-motion-${this.dateStamp()}.${ext}`);
        this.elements.onStatus?.('WebM export uložen.');
      } else {
        this.elements.onStatus?.('WebM export selhal (bez dat).');
      }
    } catch (err) {
      console.error('WebM export failed:', err);
      this.elements.onStatus?.('Chyba při exportu WebM.');
    } finally {
      this.elements.playCanvas.classList.remove('active');
      this.playCtx.clearRect(0, 0, this.elements.playCanvas.width, this.elements.playCanvas.height);
      this.setExporting(false);
    }
  }

  /** Encodes the frames as an animated GIF at the selected fps (capped width). */
  private async exportGif(): Promise<void> {
    if (this.exporting || this.frames.length === 0) return;
    this.setExporting(true);
    try {
      const fps = parseInt(this.elements.fpsSelect.value, 10) || 24;
      const delay = Math.max(1, Math.round(100 / fps)); // GIF delays are in centiseconds
      const size = this.getExportCanvasSize(1280);
      const tmp = document.createElement('canvas');
      tmp.width = size.width;
      tmp.height = size.height;
      const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
      const gif = GIFEncoder();

      this.elements.onStatus?.('Generuji GIF...');
      const images = await this.loadImages(this.frames);
      for (const img of images) {
        ctx.clearRect(0, 0, size.width, size.height);
        ctx.drawImage(img, 0, 0, size.width, size.height);
        const { data } = ctx.getImageData(0, 0, size.width, size.height);
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, size.width, size.height, { palette, delay });
      }
      gif.finish();
      this.downloadBlob(new Blob([gif.bytes()], { type: 'image/gif' }), `stop-motion-${this.dateStamp()}.gif`);
      this.elements.onStatus?.('GIF export uložen.');
    } catch (err) {
      console.error('GIF export failed:', err);
      this.elements.onStatus?.('Chyba při exportu GIF.');
    } finally {
      this.setExporting(false);
    }
  }

  /** Downloads all frames as PNG files inside a ZIP archive (original size). */
  private exportZip(): void {
    if (this.exporting || this.frames.length === 0) return;
    this.setExporting(true);
    try {
      const files: Record<string, Uint8Array> = {};
      this.frames.forEach((frame, i) => {
        const base64 = frame.dataUrl.split(',')[1];
        if (!base64) return;
        files[`frame-${String(i + 1).padStart(3, '0')}.png`] = this.base64ToBytes(base64);
      });
      const zipped = zipSync(files, { level: 6 });
      this.downloadBlob(
        new Blob([zipped], { type: 'application/zip' }),
        `stop-motion-frames-${this.dateStamp()}.zip`
      );
      this.elements.onStatus?.('PNG snímky staženy (ZIP).');
    } catch (err) {
      console.error('ZIP export failed:', err);
      this.elements.onStatus?.('Chyba při exportu ZIP.');
    } finally {
      this.setExporting(false);
    }
  }

  private async loadImages(frames: StopMotionFrame[]): Promise<HTMLImageElement[]> {
    const images: HTMLImageElement[] = [];
    for (const frame of frames) {
      const img = new Image();
      img.src = frame.dataUrl;
      images.push(img);
    }
    try {
      await Promise.all(images.map((img) => img.decode()));
    } catch {
      // decode() can reject on some browsers; fall back to exporting anyway.
    }
    return images;
  }

  private getExportCanvasSize(maxWidth: number): { width: number; height: number } {
    const base = this.elements.playCanvas;
    const scale = Math.min(1, maxWidth / base.width);
    return {
      width: Math.max(1, Math.round(base.width * scale)),
      height: Math.max(1, Math.round(base.height * scale)),
    };
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];
    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'video/webm';
  }

  private dateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private setExporting(busy: boolean): void {
    this.exporting = busy;
    this.updateButtons();
  }

  /** Saves the entire timeline project (all frames, poses and background assets) to an .mpt file. */
  public saveProject(): void {
    if (this.frames.length === 0) {
      this.elements.onStatus?.('Časová osa je prázdná — není co uložit.');
      return;
    }
    const project: StopMotionProject = {
      version: 1,
      name: `Animace-${this.dateStamp()}`,
      createdAt: Date.now(),
      fps: parseInt(this.elements.fpsSelect.value, 10) || 24,
      frames: this.frames,
      backgroundAssets: this.elements.getBackgroundAssets?.(),
    };
    const jsonStr = JSON.stringify(project);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `animace-${this.dateStamp()}.mpt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.elements.onStatus?.(`Projekt uložen (${this.frames.length} snímků).`);
  }

  /** Loads a previously saved project (.mpt or .json) from disk. */
  public async loadProjectFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Partial<StopMotionProject>;
      if (!json || !Array.isArray(json.frames)) {
        throw new Error('Neplatný formát souboru projektu (.mpt).');
      }
      this.recordHistory();
      if (json.backgroundAssets && this.elements.applyBackgroundAssets) {
        await this.elements.applyBackgroundAssets(json.backgroundAssets);
      }
      if (json.fps && this.elements.fpsSelect) {
        this.elements.fpsSelect.value = String(json.fps);
      }
      this.frames = json.frames;
      this.selectedIndex = this.frames.length > 0 ? 0 : null;
      if (this.selectedIndex !== null && this.frames[0]?.pose && this.elements.applyPoseSnapshot) {
        await this.elements.applyPoseSnapshot(this.frames[0].pose);
      }
      this.afterEdit();
      this.elements.onStatus?.(`Projekt načten: ${this.frames.length} snímků.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.elements.onStatus?.(`Chyba načtení projektu: ${msg}`);
    }
  }

  private updateButtons(): void {
    const count = this.frames.length;
    const busy = this.exporting;
    const hasSelection = this.selectedIndex !== null && count > 0;
    const selectedHasPose = hasSelection && !!this.frames[this.selectedIndex!]?.pose;

    this.elements.btnSnap.disabled = busy;
    if (this.elements.btnLoadPose) this.elements.btnLoadPose.disabled = busy || !selectedHasPose;
    if (this.elements.btnUpdateFrame) this.elements.btnUpdateFrame.disabled = busy || !hasSelection;
    this.elements.btnDelete.disabled = busy || !hasSelection;
    this.elements.btnDuplicate.disabled = busy || !hasSelection;
    this.elements.btnPlay.disabled = busy || count === 0;
    this.elements.btnLoop.disabled = busy || count === 0;
    this.elements.btnReverse.disabled = busy || count === 0;
    this.elements.btnLeft.disabled = busy || !hasSelection || this.selectedIndex === 0;
    this.elements.btnRight.disabled = busy || !hasSelection || this.selectedIndex === count - 1;
    this.elements.btnUndo.disabled = busy || this.undoStack.length === 0;
    this.elements.btnRedo.disabled = busy || this.redoStack.length === 0;
    this.elements.btnClear.disabled = busy || count === 0;
    this.elements.btnExportWebm.disabled = busy || count === 0;
    this.elements.btnExportGif.disabled = busy || count === 0;
    this.elements.btnExportZip.disabled = busy || count === 0;
    if (this.elements.btnSaveProject) this.elements.btnSaveProject.disabled = busy || count === 0;
  }
}