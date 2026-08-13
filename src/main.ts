import { HandTracker } from './tracker';
import { processHandLandmarks, HandState, Point2D } from './gestures';
import { PuppetRenderer } from './renderer';
import { Texture } from 'pixi.js';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

class AppManager {
  private tracker: HandTracker;
  private renderer: PuppetRenderer;

  private videoElement: HTMLVideoElement;
  private debugCanvas: HTMLCanvasElement;
  private debugCtx: CanvasRenderingContext2D;
  private statusBanner: HTMLElement;

  private showDebugOverlay: boolean = false;

  // Smoothing position persistence across frames
  private prevPositions: Map<string, Point2D> = new Map();

  constructor() {
    this.videoElement = document.getElementById('webcam-video') as HTMLVideoElement;
    this.debugCanvas = document.getElementById('debug-canvas') as HTMLCanvasElement;
    this.debugCtx = this.debugCanvas.getContext('2d')!;
    this.statusBanner = document.getElementById('status-banner') as HTMLElement;

    const stageContainer = document.getElementById('pixi-viewport') as HTMLElement;
    const width = stageContainer.clientWidth || window.innerWidth;
    const height = stageContainer.clientHeight || window.innerHeight;

    this.tracker = new HandTracker(this.videoElement);
    this.renderer = new PuppetRenderer(width, height);

    this.init(stageContainer);
  }

  private async init(stageContainer: HTMLElement): Promise<void> {
    await this.renderer.initialize(stageContainer);

    this.resizeCanvas();
    window.addEventListener('resize', () => this.onWindowResize());

    this.setupUIControls();
  }

  private setupUIControls(): void {
    const btnCamera = document.getElementById('btn-camera') as HTMLButtonElement;
    const btnToggleDebug = document.getElementById('btn-toggle-debug') as HTMLButtonElement;
    const selectBgColor = document.getElementById('bg-color') as HTMLSelectElement;
    const uploadBg = document.getElementById('upload-bg') as HTMLInputElement;
    const uploadLeft = document.getElementById('upload-left-closed') as HTMLInputElement;
    const uploadRight = document.getElementById('upload-right-closed') as HTMLInputElement;

    // Toggle Camera
    btnCamera.addEventListener('click', async () => {
      if (this.tracker.getActiveState()) {
        this.tracker.stop();
        btnCamera.textContent = '📷 Spustit Kameru';
        btnCamera.classList.remove('btn-secondary');
        btnCamera.classList.add('btn-primary');
        this.showStatus('Kamera byla zastavena.');
      } else {
        btnCamera.textContent = '⏸️ Zastavit Kameru';
        btnCamera.classList.remove('btn-primary');
        btnCamera.classList.add('btn-secondary');
        this.showStatus('Spouštění kamery a MediaPipe Hands...');

        await this.tracker.start(
          (results) => this.handleTrackingResults(results),
          (err) => {
            this.showStatus(`Chyba kamery: ${err.message}`);
            btnCamera.textContent = '📷 Spustit Kameru';
            btnCamera.classList.remove('btn-secondary');
            btnCamera.classList.add('btn-primary');
          }
        );

        this.hideStatus();
      }
    });

    // Toggle Debug Overlay
    btnToggleDebug.addEventListener('click', () => {
      this.showDebugOverlay = !this.showDebugOverlay;
      if (this.showDebugOverlay) {
        this.debugCanvas.classList.add('active');
        btnToggleDebug.classList.add('btn-primary');
      } else {
        this.debugCanvas.classList.remove('active');
        btnToggleDebug.classList.remove('btn-primary');
        this.debugCtx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
      }
    });

    // Change Background Color
    selectBgColor.addEventListener('change', (e) => {
      const hexValue = parseInt((e.target as HTMLSelectElement).value, 16);
      this.renderer.setBackgroundColor(hexValue);
    });

    // Custom Background Upload
    uploadBg.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        const texture = Texture.from(url);
        this.renderer.setCustomBackgroundTexture(texture);
      }
    });

    // Custom Puppet Uploads
    uploadLeft.addEventListener('change', (e) => {
      this.handleCustomPuppetUpload('Left', e.target as HTMLInputElement);
    });

    uploadRight.addEventListener('change', (e) => {
      this.handleCustomPuppetUpload('Right', e.target as HTMLInputElement);
    });
  }

  private handleCustomPuppetUpload(handType: 'Left' | 'Right', input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const texture = Texture.from(url);
      // Use uploaded sprite for both open & closed or generate variant
      this.renderer.setCustomPuppetTextures(handType, texture, texture);
      this.showStatus(`Vlastní obrázek pro ${handType === 'Left' ? 'Levou' : 'Pravou'} loutku načten.`);
      setTimeout(() => this.hideStatus(), 3000);
    }
  }

  private handleTrackingResults(results: Results): void {
    const width = this.debugCanvas.width;
    const height = this.debugCanvas.height;

    if (this.showDebugOverlay) {
      this.debugCtx.save();
      this.debugCtx.clearRect(0, 0, width, height);

      // Draw mirrored video background on debug canvas if available
      if (results.image) {
        this.debugCtx.drawImage(results.image, 0, 0, width, height);
      }
    }

    const detectedHands = new Set<'Left' | 'Right'>();

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        // MediaPipe output label: "Left" or "Right"
        const handType = handedness.label as 'Left' | 'Right';
        detectedHands.add(handType);

        const prevPos = this.prevPositions.get(handType);

        // Process landmarks & gestures
        const state: HandState = processHandLandmarks(
          landmarks,
          handType,
          width,
          height,
          prevPos,
          0.35 // LERP alpha
        );

        // Store updated position for next frame smoothing
        this.prevPositions.set(handType, state.smoothedPosition);

        // Update Pixi.js puppet
        this.renderer.updateHandState(state);

        // Draw debug landmarks overlay
        if (this.showDebugOverlay) {
          drawConnectors(this.debugCtx, landmarks, HAND_CONNECTIONS, {
            color: handType === 'Left' ? '#00FF00' : '#FF00FF',
            lineWidth: 3,
          });
          drawLandmarks(this.debugCtx, landmarks, {
            color: state.isPinching ? '#FF0000' : '#00FFFF',
            lineWidth: 2,
            radius: 4,
          });
        }
      }
    }

    // Hide puppets for hands that were not detected in current frame
    if (!detectedHands.has('Left')) {
      this.renderer.hideHand('Left');
      this.prevPositions.delete('Left');
    }
    if (!detectedHands.has('Right')) {
      this.renderer.hideHand('Right');
      this.prevPositions.delete('Right');
    }

    if (this.showDebugOverlay) {
      this.debugCtx.restore();
    }
  }

  private onWindowResize(): void {
    this.resizeCanvas();
    const stageContainer = document.getElementById('pixi-viewport') as HTMLElement;
    const width = stageContainer.clientWidth || window.innerWidth;
    const height = stageContainer.clientHeight || window.innerHeight;
    this.renderer.resize(width, height);
  }

  private resizeCanvas(): void {
    const stageContainer = document.getElementById('pixi-viewport') as HTMLElement;
    const width = stageContainer.clientWidth || window.innerWidth;
    const height = stageContainer.clientHeight || window.innerHeight;

    this.debugCanvas.width = width;
    this.debugCanvas.height = height;
  }

  private showStatus(msg: string): void {
    this.statusBanner.textContent = msg;
    this.statusBanner.classList.remove('hidden');
  }

  private hideStatus(): void {
    this.statusBanner.classList.add('hidden');
  }
}

// Instantiate manager on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  new AppManager();
});
