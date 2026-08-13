import { HandTracker } from './tracker';
import { processHandLandmarks, HandState, Point2D } from './gestures';
import { PuppetRenderer, PuppetPreset } from './renderer';
import { ThereminSynth } from './theremin';
import { Texture } from 'pixi.js';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

class AppManager {
  private tracker: HandTracker;
  private renderer: PuppetRenderer;
  private theremin: ThereminSynth;

  private videoElement: HTMLVideoElement;
  private debugCanvas: HTMLCanvasElement;
  private debugCtx: CanvasRenderingContext2D;
  private statusBanner: HTMLElement;

  private showDebugOverlay: boolean = false;
  private isMotionFrozen: boolean = false;

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
    this.theremin = new ThereminSynth();

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
    const btnToggleFreeze = document.getElementById('btn-toggle-freeze') as HTMLButtonElement;
    const btnToggleTheremin = document.getElementById('btn-toggle-theremin') as HTMLButtonElement;

    const selectLeftPuppet = document.getElementById('select-left-puppet') as HTMLSelectElement;
    const selectRightPuppet = document.getElementById('select-right-puppet') as HTMLSelectElement;
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

    // Toggle Motion Freeze / Lock
    btnToggleFreeze.addEventListener('click', () => {
      this.isMotionFrozen = !this.isMotionFrozen;
      if (this.isMotionFrozen) {
        btnToggleFreeze.textContent = '🔒 Pohyb Zamknut';
        btnToggleFreeze.classList.remove('btn-secondary');
        btnToggleFreeze.classList.add('btn-primary');
        this.showStatus('Pohyb loutek byl uzamčen.');
      } else {
        btnToggleFreeze.textContent = '🔓 Pohyb Aktivní';
        btnToggleFreeze.classList.remove('btn-primary');
        btnToggleFreeze.classList.add('btn-secondary');
        this.showStatus('Pohyb loutek aktivní.');
      }
      setTimeout(() => this.hideStatus(), 2000);
    });

    // Toggle Theremin Audio Synthesizer
    btnToggleTheremin.addEventListener('click', () => {
      const active = this.theremin.toggle();
      if (active) {
        btnToggleTheremin.textContent = '🎵 Theremin Zvuk (ZAP)';
        btnToggleTheremin.classList.remove('btn-secondary');
        btnToggleTheremin.classList.add('btn-primary');
        this.showStatus('Theremin zvuky aktivní! Levá ruka = výška tónu, pravá ruka = hlasitost.');
      } else {
        btnToggleTheremin.textContent = '🎵 Theremin Vypnut';
        btnToggleTheremin.classList.remove('btn-primary');
        btnToggleTheremin.classList.add('btn-secondary');
        this.showStatus('Theremin vypnut.');
      }
      setTimeout(() => this.hideStatus(), 3000);
    });

    // Preset Selection
    selectLeftPuppet.addEventListener('change', (e) => {
      const preset = (e.target as HTMLSelectElement).value as PuppetPreset;
      this.renderer.buildPuppetPreset('Left', preset);
    });

    selectRightPuppet.addEventListener('change', (e) => {
      const preset = (e.target as HTMLSelectElement).value as PuppetPreset;
      this.renderer.buildPuppetPreset('Right', preset);
    });

    // Change Background Color
    selectBgColor.addEventListener('change', (e) => {
      const hexValue = parseInt((e.target as HTMLSelectElement).value, 16);
      this.renderer.setBackgroundColor(hexValue);
    });

    // Custom Background Upload (Reliable Image element decode)
    uploadBg.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const img = new Image();
        img.onload = () => {
          const texture = Texture.from(img);
          this.renderer.setCustomBackgroundTexture(texture);
          this.showStatus('Vlastní obrázek pozadí byl úspěšně načten.');
          setTimeout(() => this.hideStatus(), 3000);
        };
        img.onerror = () => {
          this.showStatus('Chyba při načítání obrázku pozadí.');
        };
        img.src = URL.createObjectURL(file);
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
      const img = new Image();
      img.onload = () => {
        const texture = Texture.from(img);
        this.renderer.setCustomPuppetTextures(handType, texture, texture);
        this.showStatus(`Vlastní obrázek pro ${handType === 'Left' ? 'Levou' : 'Pravou'} loutku načten.`);
        setTimeout(() => this.hideStatus(), 3000);
      };
      img.src = URL.createObjectURL(file);
    }
  }

  private handleTrackingResults(results: Results): void {
    const width = this.debugCanvas.width;
    const height = this.debugCanvas.height;

    if (this.showDebugOverlay) {
      this.debugCtx.save();
      this.debugCtx.clearRect(0, 0, width, height);

      // Draw mirrored video frame on debug overlay
      if (results.image) {
        this.debugCtx.scale(-1, 1);
        this.debugCtx.drawImage(results.image, -width, 0, width, height);
        this.debugCtx.scale(-1, 1);
      }
    }

    const detectedHands = new Set<'Left' | 'Right'>();
    let leftY: number | undefined;
    let rightY: number | undefined;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
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

        // Track Y position for Theremin synth
        if (handType === 'Left') {
          leftY = state.wristPosition.y;
        } else {
          rightY = state.wristPosition.y;
        }

        // Store updated position for next frame smoothing
        this.prevPositions.set(handType, state.smoothedPosition);

        // Update Pixi.js puppet if motion is not frozen
        if (!this.isMotionFrozen) {
          this.renderer.updateHandState(state);
        }

        // Draw debug landmarks overlay (mirrored X)
        if (this.showDebugOverlay) {
          const mirroredLandmarks = landmarks.map((lm) => ({
            x: 1.0 - lm.x,
            y: lm.y,
            z: lm.z,
          }));

          drawConnectors(this.debugCtx, mirroredLandmarks, HAND_CONNECTIONS, {
            color: handType === 'Left' ? '#00FF00' : '#FF00FF',
            lineWidth: 3,
          });
          drawLandmarks(this.debugCtx, mirroredLandmarks, {
            color: state.isPinching ? '#FF0000' : '#00FFFF',
            lineWidth: 2,
            radius: 4,
          });
        }
      }
    }

    // Update Theremin sound synthesizer
    if (this.theremin.isEnabled()) {
      this.theremin.updateHands(leftY, rightY);
    }

    // Hide puppets if not detected and not frozen
    if (!this.isMotionFrozen) {
      if (!detectedHands.has('Left')) {
        this.renderer.hideHand('Left');
        this.prevPositions.delete('Left');
      }
      if (!detectedHands.has('Right')) {
        this.renderer.hideHand('Right');
        this.prevPositions.delete('Right');
      }
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
