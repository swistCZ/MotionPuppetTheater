import { HandTracker } from './tracker';
import {
  processHandLandmarks,
  matchDetectedHandsToPuppets,
  DetectedHandInput,
  HandState,
  Point2D
} from './gestures';
import { PuppetRenderer, PuppetPreset } from './renderer';
import { ThereminSynth } from './theremin';
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
  private fpsBadge: HTMLElement;

  private showDebugOverlay: boolean = false;
  private isMotionFrozen: boolean = false;

  // Real-time Display FPS Loop
  private lastFrameTime: number = performance.now();
  private frameCount: number = 0;

  // Persistence buffers to eliminate flickering when hand detection drops briefly
  private prevPositions: Map<string, Point2D> = new Map();
  private missingFrames: Map<'Left' | 'Right', number> = new Map([
    ['Left', 999],
    ['Right', 999],
  ]);

  constructor() {
    this.videoElement = document.getElementById('webcam-video') as HTMLVideoElement;
    this.debugCanvas = document.getElementById('debug-canvas') as HTMLCanvasElement;
    this.debugCtx = this.debugCanvas.getContext('2d')!;
    this.statusBanner = document.getElementById('status-banner') as HTMLElement;
    this.fpsBadge = document.getElementById('fps-badge') as HTMLElement;

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
    this.startDisplayLoop();
  }

  private startDisplayLoop(): void {
    const loop = () => {
      this.updateFps();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
        btnCamera.textContent = '📷 Kamera';
        btnCamera.classList.remove('btn-secondary');
        btnCamera.classList.add('btn-primary');
        this.showStatus('Kamera byla zastavena.');
      } else {
        btnCamera.textContent = '⏸️ Zastavit';
        btnCamera.classList.remove('btn-primary');
        btnCamera.classList.add('btn-secondary');
        this.showStatus('Spouštění kamery...');

        await this.tracker.start(
          (results) => this.handleTrackingResults(results),
          (err) => {
            this.showStatus(`Chyba kamery: ${err.message}`);
            btnCamera.textContent = '📷 Kamera';
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
        btnToggleFreeze.textContent = '🔒 Zamknuto';
        btnToggleFreeze.classList.remove('btn-secondary');
        btnToggleFreeze.classList.add('btn-primary');
        this.showStatus('Pohyb loutek byl uzamčen.');
      } else {
        btnToggleFreeze.textContent = '🔓 Pohyb';
        btnToggleFreeze.classList.remove('btn-primary');
        btnToggleFreeze.classList.add('btn-secondary');
        this.showStatus('Pohyb loutek aktivní.');
      }
      setTimeout(() => this.hideStatus(), 2000);
    });

    // Toggle Theremin Audio Synthesizer
    btnToggleTheremin.addEventListener('click', () => {
      const active = this.theremin.toggle();
      this.renderer.setThereminMode(active);

      if (active) {
        btnToggleTheremin.textContent = '🎵 Theremin (ZAP)';
        btnToggleTheremin.classList.remove('btn-secondary');
        btnToggleTheremin.classList.add('btn-primary');
        this.showStatus('Theremin zvuky aktivní! Levá ruka = frekvence, pravá ruka = hlasitost.');
      } else {
        btnToggleTheremin.textContent = '🎵 Theremin';
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

    // Custom Background Upload via FileReader Data URL
    uploadBg.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const dataUrl = evt.target?.result as string;
          if (dataUrl) {
            await this.renderer.setCustomBackgroundDataUrl(dataUrl);
            this.showStatus('Vlastní obrázek pozadí byl úspěšně načten!');
            setTimeout(() => this.hideStatus(), 3000);
          }
        };
        reader.readAsDataURL(file);
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
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;
        if (dataUrl) {
          await this.renderer.setCustomPuppetDataUrl(handType, dataUrl);
          this.showStatus(`Vlastní PNG obrázek pro ${handType === 'Left' ? 'Levou' : 'Pravou'} loutku načten.`);
          setTimeout(() => this.hideStatus(), 3000);
        }
      };
      reader.readAsDataURL(file);
    }
  }

  private handleTrackingResults(results: Results): void {
    const width = this.debugCanvas.width;
    const height = this.debugCanvas.height;

    if (this.showDebugOverlay) {
      this.debugCtx.save();
      this.debugCtx.clearRect(0, 0, width, height);

      if (results.image) {
        this.debugCtx.scale(-1, 1);
        this.debugCtx.drawImage(results.image, -width, 0, width, height);
        this.debugCtx.scale(-1, 1);
      }
    }

    const detectedHands = new Set<'Left' | 'Right'>();
    let leftHandState: HandState | undefined;
    let rightHandState: HandState | undefined;

    if (results.multiHandLandmarks && results.multiHandedness) {
      // 1. Prepare raw hand inputs
      const rawInputs: DetectedHandInput[] = [];
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        rawInputs.push({
          landmarks,
          mediaPipeLabel: handedness.label as 'Left' | 'Right',
        });
      }

      // 2. Spatial proximity matching to prevent hand swapping/teleportation
      const prevLeft = this.prevPositions.get('Left');
      const prevRight = this.prevPositions.get('Right');
      const matchedHands = matchDetectedHandsToPuppets(rawInputs, prevLeft, prevRight, width, height);

      // 3. Process matched hands
      for (const matched of matchedHands) {
        const handType = matched.puppetSlot;
        const landmarks = matched.landmarks;

        detectedHands.add(handType);
        this.missingFrames.set(handType, 0); // Reset missing frames counter

        const prevPos = this.prevPositions.get(handType);

        // Process landmarks & gestures with responsive LERP alpha 0.45
        const state: HandState = processHandLandmarks(
          landmarks,
          handType,
          width,
          height,
          prevPos,
          0.45
        );

        if (handType === 'Left') {
          leftHandState = state;
        } else {
          rightHandState = state;
        }

        // Store updated position
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

    // Update Theremin audio & visual orbs
    if (this.theremin.isEnabled()) {
      const leftY = leftHandState ? leftHandState.wristPosition.y : undefined;
      const rightY = rightHandState ? rightHandState.wristPosition.y : undefined;

      this.theremin.updateHands(leftY, rightY);

      // Compute display metrics
      const activePitchY = leftY !== undefined ? leftY : rightY;
      const pitchRatio = activePitchY !== undefined ? 1.0 - Math.max(0, Math.min(1, activePitchY)) : 0.5;
      const freq = 130 + pitchRatio * 750;
      const volRatio = rightY !== undefined ? 1.0 - Math.max(0, Math.min(1, rightY)) : (leftY !== undefined ? 0.5 : 0);

      this.renderer.updateThereminVisuals(leftHandState, rightHandState, freq, volRatio);
    }

    // Handle missing hand frames
    if (!this.isMotionFrozen) {
      (['Left', 'Right'] as const).forEach((hand) => {
        if (!detectedHands.has(hand)) {
          const count = (this.missingFrames.get(hand) || 0) + 1;
          this.missingFrames.set(hand, count);

          if (count > 6) { // Hide after 6 consecutive missing frames (~0.2 sec)
            this.renderer.hideHand(hand);
            this.prevPositions.delete(hand);
          }
        }
      });
    }

    if (this.showDebugOverlay) {
      this.debugCtx.restore();
    }
  }

  private updateFps(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed >= 1000) {
      const currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsBadge.textContent = `⚡ ${currentFps} FPS`;
      this.frameCount = 0;
      this.lastFrameTime = now;
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
