import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { zipSync } from 'fflate';

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
  btnExportWebm: HTMLButtonElement;
  btnExportGif: HTMLButtonElement;
  btnExportZip: HTMLButtonElement;
  fpsSelect: HTMLSelectElement;
  onStatus?: (message: string) => void;
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
  private exporting: boolean = false;

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
    this.elements.btnExportWebm.addEventListener('click', () => void this.exportWebM());
    this.elements.btnExportGif.addEventListener('click', () => void this.exportGif());
    this.elements.btnExportZip.addEventListener('click', () => this.exportZip());
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

  // --- Export (WebM / GIF / PNG-ZIP) ---

  /**
   * Records the frames as a WebM/MP4 video at the selected fps by drawing each
   * frame to a canvas and pushing it into the MediaStream via requestFrame().
   */
  private async exportWebM(): Promise<void> {
    if (this.exporting || this.frames.length === 0) return;
    this.setExporting(true);
    this.stopPlayback();
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
      const mimeType = this.getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
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

  private updateButtons(): void {
    const count = this.frames.length;
    const busy = this.exporting;
    const hasSelection = this.selectedIndex !== null && count > 0;

    this.elements.btnSnap.disabled = busy;
    this.elements.btnDelete.disabled = busy || !hasSelection;
    this.elements.btnDuplicate.disabled = busy || !hasSelection;
    this.elements.btnPlay.disabled = busy || count === 0;
    this.elements.btnLeft.disabled = busy || !hasSelection || this.selectedIndex === 0;
    this.elements.btnRight.disabled = busy || !hasSelection || this.selectedIndex === count - 1;
    this.elements.btnExportWebm.disabled = busy || count === 0;
    this.elements.btnExportGif.disabled = busy || count === 0;
    this.elements.btnExportZip.disabled = busy || count === 0;
  }
}