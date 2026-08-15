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
import { StageRecorder } from './recorder';
import { HandSimulator } from './simulator';
import { StopMotionController } from './stopMotion';
import {
  fetchRigConfig,
  fetchRigIdList,
  listLocalCharacterIds,
  loadLocalCharacterConfig,
} from './rigAssets';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// A clenched fist (>= this fistFactor) locks the pose while in stop-motion mode.
const FIST_FREEZE_THRESHOLD = 0.6;

// The raised-middle-finger gesture (>= this middleFingerFactor) zooms the
// stage in while in stop-motion mode; above the threshold the factor maps
// linearly up to ZOOM_MAX_AMOUNT of additional magnification.
const ZOOM_GESTURE_THRESHOLD = 0.6;
const ZOOM_MAX_AMOUNT = 0.6;

class AppManager {
  private tracker: HandTracker;
  private renderer: PuppetRenderer;
  private theremin: ThereminSynth;
  private recorder: StageRecorder;
  private simulator: HandSimulator;
  private stopMotion: StopMotionController;

  private videoElement: HTMLVideoElement;
  private debugCanvas: HTMLCanvasElement;
  private debugCtx: CanvasRenderingContext2D;
  private statusBanner: HTMLElement;
  private fpsBadge: HTMLElement;
  private recBadge: HTMLElement;

  private showDebugOverlay: boolean = false;
  private isMotionFrozen: boolean = false;
  private stopMotionActive: boolean = false;
  private fistFreezeActive: boolean = false;
  private smStripOffset: number = 0;
  private smStripActive: boolean = false;
  private advanceStripAfterSnap: () => void = () => {};

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
    this.recBadge = document.getElementById('rec-badge') as HTMLElement;

    const stageContainer = document.getElementById('pixi-viewport') as HTMLElement;
    const width = stageContainer.clientWidth || window.innerWidth;
    const height = stageContainer.clientHeight || window.innerHeight;

    this.tracker = new HandTracker(this.videoElement);
    this.renderer = new PuppetRenderer(width, height);
    this.theremin = new ThereminSynth();
    this.recorder = new StageRecorder();
    this.simulator = new HandSimulator(this.renderer);
    this.stopMotion = new StopMotionController(
      () => this.renderer.getCanvasElement(),
      {
        panel: document.getElementById('sm-panel') as HTMLElement,
        strip: document.getElementById('sm-frame-strip') as HTMLElement,
        onionCanvas: document.getElementById('sm-onion-canvas') as HTMLCanvasElement,
        playCanvas: document.getElementById('sm-play-canvas') as HTMLCanvasElement,
        gridCanvas: document.getElementById('sm-grid-canvas') as HTMLCanvasElement,
        btnSnap: document.getElementById('sm-btn-snap') as HTMLButtonElement,
        btnDelete: document.getElementById('sm-btn-delete') as HTMLButtonElement,
        btnDuplicate: document.getElementById('sm-btn-duplicate') as HTMLButtonElement,
        btnLeft: document.getElementById('sm-btn-left') as HTMLButtonElement,
        btnRight: document.getElementById('sm-btn-right') as HTMLButtonElement,
        btnPlay: document.getElementById('sm-btn-play') as HTMLButtonElement,
        btnLoop: document.getElementById('sm-btn-loop') as HTMLButtonElement,
        btnReverse: document.getElementById('sm-btn-reverse') as HTMLButtonElement,
        btnOnion: document.getElementById('sm-btn-onion') as HTMLButtonElement,
        btnGrid: document.getElementById('sm-btn-grid') as HTMLButtonElement,
        btnAb: document.getElementById('sm-btn-ab') as HTMLButtonElement,
        btnUndo: document.getElementById('sm-btn-undo') as HTMLButtonElement,
        btnRedo: document.getElementById('sm-btn-redo') as HTMLButtonElement,
        btnClear: document.getElementById('sm-btn-clear') as HTMLButtonElement,
        btnExportWebm: document.getElementById('sm-btn-export-webm') as HTMLButtonElement,
        btnExportGif: document.getElementById('sm-btn-export-gif') as HTMLButtonElement,
        btnExportZip: document.getElementById('sm-btn-export-zip') as HTMLButtonElement,
        fpsSelect: document.getElementById('sm-fps') as HTMLSelectElement,
        ghostSelect: document.getElementById('sm-onion-ghosts') as HTMLSelectElement,
        audioSource: () => this.theremin.getAudioStreamNode(),
        onStatus: (message: string) => {
          this.showStatus(message);
          setTimeout(() => this.hideStatus(), 3000);
        },
        onAfterSnap: () => this.advanceStripAfterSnap(),
      }
    );

    this.init(stageContainer);
  }

  private async init(stageContainer: HTMLElement): Promise<void> {
    await this.renderer.initialize(stageContainer);

    this.resizeCanvas();
    this.resizeStopMotionOverlays();
    window.addEventListener('resize', () => this.onWindowResize());

    this.setupUIControls();
    await this.populateRigCharacters();
    this.startDisplayLoop();
  }

  /**
   * Populates the left/right puppet selects with cut-out rig characters
   * listed in public/characters/index.json.
   */
  private async populateRigCharacters(): Promise<void> {
    try {
      const selectLeft = document.getElementById('select-left-puppet') as HTMLSelectElement;
      const selectRight = document.getElementById('select-right-puppet') as HTMLSelectElement;

      const makeOption = (value: string, name: string): HTMLOptionElement => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name;
        return option;
      };

      // 1. File-based characters (public/characters/) — placed at the very top.
      const fileOptions: HTMLOptionElement[] = [];
      for (const id of await fetchRigIdList()) {
        let config;
        try {
          config = await fetchRigConfig(id);
        } catch {
          console.warn(`Skipping character "${id}": config.json is missing.`);
          continue;
        }

        // Drop characters whose rig data is broken (structural errors or
        // referenced part images that no longer exist).
        let partsOk = true;
        if (config && typeof config.parts === 'object') {
          for (const key of ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
            const part = config.parts[key];
            if (!part) continue; // optional part, not present
            if (!part.src) {
              partsOk = false;
              break;
            }
            if (part.src.startsWith('data:') || part.src.startsWith('blob:')) continue;
            try {
              const res = await fetch(part.src, { method: 'HEAD' });
              if (!res.ok) throw new Error(String(res.status));
            } catch {
              console.warn(`Skipping character "${id}": missing part image "${part.src}".`);
              partsOk = false;
              break;
            }
          }
        }
        if (!partsOk || !config) continue;

        fileOptions.push(makeOption(`rig:${id}`, config.name || id));
      }
      selectLeft.prepend(...fileOptions.map((o) => o.cloneNode(true) as HTMLOptionElement));
      selectRight.prepend(...fileOptions.map((o) => o.cloneNode(true) as HTMLOptionElement));

      // 2. Browser-local characters (saved from the builder) — their own category.
      const groupLocalL = document.createElement('optgroup');
      groupLocalL.label = 'Uložené v prohlížeči';
      const groupLocalR = document.createElement('optgroup');
      groupLocalR.label = 'Uložené v prohlížeči';

      for (const id of listLocalCharacterIds()) {
        const config = loadLocalCharacterConfig(id);
        if (!config) continue;
        const srcs = [
          config.parts?.body?.src,
          config.parts?.leftArm?.src,
          config.parts?.rightArm?.src,
          config.parts?.head?.src,
          config.parts?.leftLeg?.src,
          config.parts?.rightLeg?.src,
        ].filter((s) => s !== undefined);
        if (srcs.some((s) => !s)) {
          console.warn(`Skipping local character "${id}": missing part images.`);
          continue;
        }
        groupLocalL.appendChild(makeOption(`rig:local:${id}`, config.name || id));
        groupLocalR.appendChild(makeOption(`rig:local:${id}`, config.name || id));
      }
      if (groupLocalL.children.length > 0) selectLeft.appendChild(groupLocalL);
      if (groupLocalR.children.length > 0) selectRight.appendChild(groupLocalR);
    } catch (err) {
      console.warn('Failed to load rig characters:', err);
    }
  }

  private startDisplayLoop(): void {
    const loop = () => {
      this.updateFps();

      // Theremin is driven from the render loop so it also works in simulator
      // mode (handleTrackingResults early-returns while the sim is running).
      if (this.theremin.isEnabled()) {
        const leftState = this.renderer.getLastHandState('Left');
        const rightState = this.renderer.getLastHandState('Right');

        const leftY = leftState ? leftState.wristPosition.y : undefined;
        const rightY = rightState ? rightState.wristPosition.y : undefined;

        this.theremin.updateHands(leftY, rightY);

        const activePitchY = leftY !== undefined ? leftY : rightY;
        const pitchRatio = activePitchY !== undefined ? 1.0 - Math.max(0, Math.min(1, activePitchY)) : 0.5;
        const freq = 130 + pitchRatio * 750;
        const volRatio = rightY !== undefined ? 1.0 - Math.max(0, Math.min(1, rightY)) : (leftY !== undefined ? 0.5 : 0);

        this.renderer.updateThereminVisuals(leftState, rightState, freq, volRatio);
      }

      // In stop-motion mode a clenched fist locks the pose so the user can
      // snap a frame; releasing it unlocks so a new pose can be posed.
      if (this.stopMotionActive) {
        const leftState = this.renderer.getLastHandState('Left');
        const rightState = this.renderer.getLastHandState('Right');
        const fistHeld =
          (leftState !== undefined && leftState.fistFactor >= FIST_FREEZE_THRESHOLD) ||
          (rightState !== undefined && rightState.fistFactor >= FIST_FREEZE_THRESHOLD);
        if (fistHeld !== this.fistFreezeActive) {
          this.fistFreezeActive = fistHeld;
          this.renderer.setFrozen(fistHeld);
        }
      }

      // Camera zoom: raised middle finger zooms the stage in (stop-motion mode
      // only). Outside the mode, or when the gesture is released, ease back to
      // the normal 1.0 magnification.
      let zoomTarget = 1;
      if (this.stopMotionActive) {
        const leftState = this.renderer.getLastHandState('Left');
        const rightState = this.renderer.getLastHandState('Right');
        const zoomFactor = Math.max(
          leftState ? leftState.middleFingerFactor : 0,
          rightState ? rightState.middleFingerFactor : 0
        );
        if (zoomFactor > ZOOM_GESTURE_THRESHOLD) {
          const amount = ((zoomFactor - ZOOM_GESTURE_THRESHOLD) / (1 - ZOOM_GESTURE_THRESHOLD)) * ZOOM_MAX_AMOUNT;
          zoomTarget = 1 + amount;
        }
      }
      this.renderer.setZoomTarget(zoomTarget);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private setupUIControls(): void {
    const btnCamera = document.getElementById('btn-camera') as HTMLButtonElement;
    const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
    const btnToggleDebug = document.getElementById('btn-toggle-debug') as HTMLButtonElement;
    const btnToggleFreeze = document.getElementById('btn-toggle-freeze') as HTMLButtonElement;
    const btnToggleTheremin = document.getElementById('btn-toggle-theremin') as HTMLButtonElement;
    const btnSim = document.getElementById('btn-sim') as HTMLButtonElement;

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
        btnCamera.textContent = 'Kamera';
        btnCamera.classList.remove('btn-secondary');
        btnCamera.classList.add('btn-primary');
        this.showStatus('Kamera byla zastavena.');
      } else {
        btnCamera.textContent = 'Zastavit';
        btnCamera.classList.remove('btn-primary');
        btnCamera.classList.add('btn-secondary');
        this.showStatus('Spouštění kamery...');

        const resetButton = (): void => {
          btnCamera.textContent = 'Kamera';
          btnCamera.classList.remove('btn-secondary');
          btnCamera.classList.add('btn-primary');
        };

        try {
          const started = await this.tracker.start(
            (results) => this.handleTrackingResults(results),
            (err) => {
              this.showStatus(`Chyba kamery: ${err.message}`);
              resetButton();
            }
          );
          // Only clear the banner on success — on failure the error callback
          // already reported the problem and reset the button.
          if (started) {
            this.hideStatus();
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.showStatus(`Chyba kamery: ${message}`);
          resetButton();
        }
      }
    });

    // Toggle Stage Video Recording
    btnRecord.addEventListener('click', () => {
      if (this.recorder.getIsRecording()) {
        this.recorder.stop();
        btnRecord.textContent = 'Nahrávat';
        btnRecord.classList.remove('btn-secondary');
        btnRecord.classList.add('btn-danger');
        this.recBadge.classList.add('hidden');
        this.showStatus('Nahrávání dokončeno. Ukládám video na disk...');
        setTimeout(() => this.hideStatus(), 3000);
      } else {
        const audioNode = this.theremin.isEnabled() ? this.theremin.getAudioStreamNode() : undefined;
        const started = this.recorder.start(
          this.renderer.getCanvasElement(),
          audioNode,
          (elapsedText) => {
            this.recBadge.textContent = `REC ${elapsedText}`;
          }
        );

        if (started) {
          btnRecord.textContent = 'Uložit';
          btnRecord.classList.remove('btn-danger');
          btnRecord.classList.add('btn-secondary');
          this.recBadge.classList.remove('hidden');
          this.showStatus('Spuštěno nahrávání videa divadla v 60 FPS...');
          setTimeout(() => this.hideStatus(), 3000);
        } else {
          this.showStatus('Chyba: Prohlížeč nepodporuje nahrávání videa z plátna.');
        }
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
      this.renderer.setFrozen(this.isMotionFrozen);
      if (this.isMotionFrozen) {
        btnToggleFreeze.textContent = 'Zamknuto';
        btnToggleFreeze.classList.remove('btn-secondary');
        btnToggleFreeze.classList.add('btn-primary');
        this.showStatus('Pohyb loutek byl uzamčen.');
      } else {
        btnToggleFreeze.textContent = 'Pohyb';
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
        btnToggleTheremin.textContent = 'Theremin (ZAP)';
        btnToggleTheremin.classList.remove('btn-secondary');
        btnToggleTheremin.classList.add('btn-primary');
        this.showStatus('Theremin zvuky aktivní! Levá ruka = frekvence, pravá ruka = hlasitost.');
      } else {
        btnToggleTheremin.textContent = 'Theremin';
        btnToggleTheremin.classList.remove('btn-primary');
        btnToggleTheremin.classList.add('btn-secondary');
        this.showStatus('Theremin vypnut.');
      }
      setTimeout(() => this.hideStatus(), 3000);
    });

    // Toggle Hand Simulator (no webcam needed - body follows mouse, arms wave)
    const setSimButton = (active: boolean): void => {
      if (active) {
        btnSim.textContent = 'Simulace (ZAP)';
        btnSim.classList.remove('btn-secondary');
        btnSim.classList.add('btn-primary');
      } else {
        btnSim.textContent = 'Simulace';
        btnSim.classList.remove('btn-primary');
        btnSim.classList.add('btn-secondary');
      }
    };

    btnSim.addEventListener('click', () => {
      const active = this.simulator.isRunning();
      if (active) {
        this.simulator.stop();
      } else {
        this.simulator.start();
      }
      setSimButton(!active);
    });

    // Auto-start the simulator when opened with ?sim=1 (camera-free testing).
    if (new URLSearchParams(window.location.search).has('sim')) {
      this.simulator.start();
      setSimButton(true);
    }

    // Toggle Stop-Motion mode
    const btnStopMotion = document.getElementById('btn-stop-motion') as HTMLButtonElement;
    btnStopMotion.addEventListener('click', () => {
      this.stopMotionActive = !this.stopMotionActive;
      this.stopMotion.setModeActive(this.stopMotionActive);
      this.renderer.setPoseEditing(this.stopMotionActive);

      if (this.stopMotionActive) {
        btnStopMotion.textContent = 'Stop-motion (ZAP)';
        btnStopMotion.classList.remove('btn-secondary');
        btnStopMotion.classList.add('btn-primary');
        this.resizeStopMotionOverlays();
        this.showStatus('Stop-motion: pěst = zamknutí pózy, prostředníček = zoom, tažením myší doladíš díly, Snímek = uložit.');
      } else {
        btnStopMotion.textContent = 'Stop-motion';
        btnStopMotion.classList.remove('btn-primary');
        btnStopMotion.classList.add('btn-secondary');
        this.fistFreezeActive = false;
        this.renderer.setFrozen(this.isMotionFrozen);
        this.showStatus('Stop-motion režim vypnut.');
      }
      setTimeout(() => this.hideStatus(), 3000);
    });

    // Stop-Motion background controls (chroma green / custom color / pan-able strips)
    const smBtnGreen = document.getElementById('sm-btn-green') as HTMLButtonElement;
    const smBtnResetBg = document.getElementById('sm-btn-reset-bg') as HTMLButtonElement;
    const smBgColor = document.getElementById('sm-bg-color') as HTMLInputElement;
    const smUploadStrip = document.getElementById('sm-upload-strip') as HTMLInputElement;
    const smUploadStripNear = document.getElementById('sm-upload-strip-near') as HTMLInputElement;
    const smParallax = document.getElementById('sm-parallax') as HTMLInputElement;
    const smPanSlider = document.getElementById('sm-pan') as HTMLInputElement;

    const resetStripState = (): void => {
      this.smStripActive = false;
      this.smStripOffset = 0;
      smPanSlider.value = '0';
      smPanSlider.disabled = true;
    };

    smBtnGreen.addEventListener('click', () => {
      resetStripState();
      this.renderer.setBackgroundColor(0x00b140);
      this.showStatus('Klíčovací zelená nastavena.');
      setTimeout(() => this.hideStatus(), 2000);
    });

    smBgColor.addEventListener('input', () => {
      resetStripState();
      const hexValue = parseInt(smBgColor.value.slice(1), 16);
      this.renderer.setBackgroundColor(hexValue);
    });

    smBtnResetBg.addEventListener('click', () => {
      resetStripState();
      this.renderer.clearStripBackground();
      this.showStatus('Výchozí pozadí obnoveno.');
      setTimeout(() => this.hideStatus(), 2000);
    });

    smUploadStrip.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;
        if (!dataUrl) return;
        this.smStripOffset = 0;
        this.smStripActive = true;
        smPanSlider.value = '0';
        smPanSlider.disabled = false;
        await this.renderer.setStripBackground(dataUrl);
        this.showStatus('Vzdálený pruh načten — posouvej posuvníkem nebo krokem na snímek.');
        setTimeout(() => this.hideStatus(), 3000);
      };
      reader.readAsDataURL(file);
      (e.target as HTMLInputElement).value = '';
    });

    smUploadStripNear.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;
        if (!dataUrl) return;
        this.smStripActive = true;
        smPanSlider.disabled = false;
        await this.renderer.setForegroundStripBackground(dataUrl);
        this.showStatus('Blízký pruh načten — posouvá se rychleji (paralaxa).');
        setTimeout(() => this.hideStatus(), 3000);
      };
      reader.readAsDataURL(file);
      (e.target as HTMLInputElement).value = '';
    });

    smParallax.addEventListener('input', () => {
      const factor = parseFloat(smParallax.value) || 1.6;
      this.renderer.setParallaxFactor(factor);
    });

    smPanSlider.addEventListener('input', () => {
      this.smStripOffset = parseInt(smPanSlider.value, 10) || 0;
      this.renderer.setStripOffset(this.smStripOffset);
    });

    // Auto-advance the strip by the configured step after every captured frame.
    this.advanceStripAfterSnap = (): void => {
      const step = parseFloat((document.getElementById('sm-pan-step') as HTMLInputElement).value) || 0;
      if (!this.smStripActive || step <= 0) return;
      this.smStripOffset += step;
      smPanSlider.value = String(this.smStripOffset);
      this.renderer.setStripOffset(this.smStripOffset);
    };

    // Toggle the chain prop (garland of leaves) that follows the hand.
    const smBtnLeaves = document.getElementById('sm-btn-leaves') as HTMLButtonElement;
    smBtnLeaves.addEventListener('click', () => {
      const active = this.renderer.isChainPropEnabled();
      this.renderer.setChainPropEnabled(!active);
      smBtnLeaves.classList.toggle('btn-primary', !active);
      this.showStatus(!active ? 'Řetěz listí zapnut — sleduje ruku.' : 'Řetěz listí vypnut.');
      setTimeout(() => this.hideStatus(), 2000);
    });

    // Preset Selection
    selectLeftPuppet.addEventListener('change', async (e) => {
      const preset = (e.target as HTMLSelectElement).value as PuppetPreset;
      await this.renderer.buildPuppetPreset('Left', preset);
    });

    selectRightPuppet.addEventListener('change', async (e) => {
      const preset = (e.target as HTMLSelectElement).value as PuppetPreset;
      await this.renderer.buildPuppetPreset('Right', preset);
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
    // While the simulator is active it fully drives the puppets (no webcam needed).
    if (this.simulator.isRunning()) return;

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

        // Store updated position
        this.prevPositions.set(handType, state.smoothedPosition);

        // Update Pixi.js puppet (freeze is enforced inside the renderer so it
        // also applies while the hand simulator drives the puppets directly).
        this.renderer.updateHandState(state);

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
      this.fpsBadge.textContent = `${currentFps} FPS`;
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
    this.stopMotion.resize(width, height);
  }

  private resizeStopMotionOverlays(): void {
    const stageContainer = document.getElementById('pixi-viewport') as HTMLElement;
    const width = stageContainer.clientWidth || window.innerWidth;
    const height = stageContainer.clientHeight || window.innerHeight;
    this.stopMotion.resize(width, height);
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
