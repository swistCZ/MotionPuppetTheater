export interface StopMotionFrame {
  id: string;
  dataUrl: string;
}

export interface StopMotionElements {
  panel: HTMLElement;
  strip: HTMLElement;
  onionCanvas: HTMLCanvasElement;
  playCanvas: HTMLCanvasElement;
  btnSnap: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnDuplicate: HTMLButtonElement;
  btnLeft: HTMLButtonElement;
  btnRight: HTMLButtonElement;
  btnPlay: HTMLButtonElement;
  btnOnion: HTMLButtonElement;
  fpsSelect: HTMLSelectElement;
}

const ONION_ALPHA = 0.4;

/**
 * Stop-motion timeline controller: captures snapshots of the Pixi stage as
 * frames, manages the thumbnail strip (select/delete/duplicate/reorder),
 * draws the onion-skin ghost behind the live stage and plays the frames back
 * on an overlay. Lives inside the stop-motion mode (toggled from the app bar).
 */
export class StopMotionController {
  private frames: StopMotionFrame[] = [];
  private selectedIndex: number | null = null;
  private onionEnabled: boolean = false;
  private playing: boolean = false;
  private playTimer: number | null = null;
  private playIndex: number = 0;

  private onionCtx: CanvasRenderingContext2D;
  private playCtx: CanvasRenderingContext2D;

  constructor(
    private canvasSource: () => HTMLCanvasElement,
    private elements: StopMotionElements
  ) {
    this.onionCtx = elements.onionCanvas.getContext('2d')!;
    this.playCtx = elements.playCanvas.getContext('2d')!;

    this.elements.btnSnap.addEventListener('click', () => this.snapFrame());
    this.elements.btnDelete.addEventListener('click', () => this.deleteSelected());
    this.elements.btnDuplicate.addEventListener('click', () => this.duplicateSelected());
    this.elements.btnLeft.addEventListener('click', () => this.moveSelected(-1));
    this.elements.btnRight.addEventListener('click', () => this.moveSelected(1));
    this.elements.btnPlay.addEventListener('click', () => {
      if (this.playing) this.stopPlayback();
      else void this.startPlayback();
    });
    this.elements.btnOnion.addEventListener('click', () => this.toggleOnion());
    this.elements.fpsSelect.addEventListener('change', () => {
      if (this.playing) this.restartPlayback();
    });
  }

  public setModeActive(active: boolean): void {
    this.elements.panel.classList.toggle('hidden', !active);
    if (!active) {
      this.stopPlayback();
      this.setOnionEnabled(false);
      this.updateOnion();
    }
  }

  public resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.elements.onionCanvas.width = Math.round(width * dpr);
    this.elements.onionCanvas.height = Math.round(height * dpr);
    this.elements.onionCanvas.style.width = `${width}px`;
    this.elements.onionCanvas.style.height = `${height}px`;
    this.elements.playCanvas.width = Math.round(width * dpr);
    this.elements.playCanvas.height = Math.round(height * dpr);
    this.elements.playCanvas.style.width = `${width}px`;
    this.elements.playCanvas.style.height = `${height}px`;
    this.updateOnion();
  }

  public getFrameCount(): number {
    return this.frames.length;
  }

  public getIsPlaying(): boolean {
    return this.playing;
  }

  public snapFrame(): void {
    const canvas = this.canvasSource();
    const dataUrl = canvas.toDataURL('image/png');
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    this.frames.push({ id, dataUrl });
    this.selectedIndex = this.frames.length - 1;
    this.renderStrip();
    this.updateOnion();
    this.updateButtons();
  }

  public deleteSelected(): void {
    if (this.selectedIndex === null) return;
    this.frames.splice(this.selectedIndex, 1);
    if (this.frames.length === 0) {
      this.selectedIndex = null;
    } else {
      this.selectedIndex = Math.min(this.selectedIndex, this.frames.length - 1);
    }
    this.renderStrip();
    this.updateOnion();
    this.updateButtons();
  }

  public duplicateSelected(): void {
    if (this.selectedIndex === null) return;
    const copy = this.frames[this.selectedIndex];
    const dup = { ...copy, id: `${copy.id}-dup-${Date.now()}` };
    this.frames.splice(this.selectedIndex + 1, 0, dup);
    this.selectedIndex += 1;
    this.renderStrip();
    this.updateOnion();
    this.updateButtons();
  }

  public moveSelected(delta: -1 | 1): void {
    if (this.selectedIndex === null) return;
    const target = this.selectedIndex + delta;
    if (target < 0 || target >= this.frames.length) return;
    const [frame] = this.frames.splice(this.selectedIndex, 1);
    this.frames.splice(target, 0, frame);
    this.selectedIndex = target;
    this.renderStrip();
    this.updateOnion();
    this.updateButtons();
  }

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

  /** Draws the selected (or last) frame as a semi-transparent ghost. */
  private updateOnion(): void {
    if (!this.onionEnabled) return;
    const frame = this.selectedIndex !== null ? this.frames[this.selectedIndex] : this.frames[this.frames.length - 1];
    if (!frame) {
      this.onionCtx.clearRect(0, 0, this.elements.onionCanvas.width, this.elements.onionCanvas.height);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (!this.onionEnabled) return;
      this.onionCtx.clearRect(0, 0, this.elements.onionCanvas.width, this.elements.onionCanvas.height);
      this.onionCtx.globalAlpha = ONION_ALPHA;
      this.onionCtx.drawImage(
        img,
        0,
        0,
        this.elements.onionCanvas.width,
        this.elements.onionCanvas.height
      );
      this.onionCtx.globalAlpha = 1;
    };
    img.src = frame.dataUrl;
  }

  private async startPlayback(): Promise<void> {
    if (this.frames.length === 0) return;
    this.stopPlayback();
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
    this.playIndex = 0;
    this.drawPlayFrame(images);

    this.playTimer = window.setInterval(() => {
      this.playIndex = (this.playIndex + 1) % images.length;
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

  private renderStrip(): void {
    const strip = this.elements.strip;
    strip.textContent = '';

    this.frames.forEach((frame, index) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'sm-frame-thumb';
      thumb.title = `Snímek ${index + 1}`;
      if (index === this.selectedIndex) thumb.classList.add('selected');

      const img = document.createElement('img');
      img.src = frame.dataUrl;
      img.alt = `Snímek ${index + 1}`;

      const label = document.createElement('span');
      label.className = 'sm-frame-index';
      label.textContent = String(index + 1);

      thumb.appendChild(img);
      thumb.appendChild(label);
      thumb.addEventListener('click', () => {
        this.selectedIndex = index;
        this.renderStrip();
        this.updateOnion();
        this.updateButtons();
      });
      strip.appendChild(thumb);
    });
  }

  private updateButtons(): void {
    const count = this.frames.length;
    const hasSelection = this.selectedIndex !== null && count > 0;
    this.elements.btnDelete.disabled = !hasSelection;
    this.elements.btnDuplicate.disabled = !hasSelection;
    this.elements.btnPlay.disabled = count === 0;
    this.elements.btnLeft.disabled = !hasSelection || this.selectedIndex === 0;
    this.elements.btnRight.disabled = !hasSelection || this.selectedIndex === count - 1;
  }
}