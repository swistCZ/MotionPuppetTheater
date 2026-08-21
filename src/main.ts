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
  private smStripOffsetX: number = 0;
  private smStripOffsetY: number = 0;
  private smStripActive: boolean = false;
  private smEmptyHint: HTMLElement;
  private smHintDismissed: boolean = false;
  private advanceStripAfterSnap: () => void = () => {};

  // Floating "Správa loutek" panel (multi-puppet, stop-motion mouse-only mode).
  private pmActiveId: string | null = null;
  private pmLayerDragId: string | null = null;

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
    this.smEmptyHint = document.getElementById('sm-empty-hint') as HTMLElement;

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
        frameCanvas: document.getElementById('sm-frame-canvas') as HTMLCanvasElement,
        btnFrame: document.getElementById('sm-btn-frame') as HTMLButtonElement,
        frameRatio: document.getElementById('sm-frame-ratio') as HTMLSelectElement,
        btnSnap: document.getElementById('sm-btn-snap') as HTMLButtonElement,
        btnLoadPose: document.getElementById('sm-btn-load-pose') as HTMLButtonElement,
        btnUpdateFrame: document.getElementById('sm-btn-update-frame') as HTMLButtonElement,
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
        btnSaveProject: document.getElementById('sm-btn-save-project') as HTMLButtonElement,
        uploadProject: document.getElementById('sm-upload-project') as HTMLInputElement,
        fpsSelect: document.getElementById('sm-fps') as HTMLSelectElement,
        ghostSelect: document.getElementById('sm-onion-ghosts') as HTMLSelectElement,
        audioSource: () => this.theremin.getAudioStreamNode(),
        onStatus: (message: string) => {
          this.showStatus(message);
          setTimeout(() => this.hideStatus(), 3000);
        },
        onAfterSnap: () => this.advanceStripAfterSnap(),
        captureStageDataUrl: () => this.renderer.captureStageDataUrl(),
        setHandlesVisible: (visible: boolean) => this.renderer.setEditHandlesVisible(visible),
        renderNow: () => this.renderer.renderNow(),
        stripPrev: document.getElementById('sm-strip-prev') as HTMLButtonElement,
        stripNext: document.getElementById('sm-strip-next') as HTMLButtonElement,
        stripMeta: document.getElementById('sm-strip-meta') as HTMLElement,
        getPoseSnapshot: () => this.renderer.capturePoseSnapshot(),
        applyPoseSnapshot: async (snap) => {
          await this.renderer.applyPoseSnapshot(snap);
        },
        getBackgroundAssets: () => this.renderer.getBackgroundAssets(),
        applyBackgroundAssets: async (assets) => {
          if (assets.stripFarDataUrl) await this.renderer.setStripBackground(assets.stripFarDataUrl);
          if (assets.stripNearDataUrl) await this.renderer.setForegroundStripBackground(assets.stripNearDataUrl);
          if (assets.customBgDataUrl) await this.renderer.setCustomBackgroundDataUrl(assets.customBgDataUrl);
        },
      }
    );

    this.init(stageContainer);
  }

  private async init(stageContainer: HTMLElement): Promise<void> {
    await this.renderer.initialize(stageContainer);

    ;(window as unknown as { __mptDebug?: unknown }).__mptDebug = this.renderer;
    ;(window as unknown as { __mptStopMotion?: unknown }).__mptStopMotion = this.stopMotion;

    this.resizeCanvas();
    const stage = document.getElementById('pixi-viewport') as HTMLElement;
    this.renderer.resize(stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight);
    this.resizeStopMotionOverlays();
    window.addEventListener('resize', () => this.onWindowResize());

    this.setupUIControls();
    await this.populateRigCharacters();
    await this.setupPuppetManager();
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
      // mode (handleTrackingResults early-returns while the sim is running) or
      // directly via mouse when the camera is not running.
      if (this.theremin.isEnabled()) {
        let leftState = this.renderer.getLastHandState('Left');
        let rightState = this.renderer.getLastHandState('Right');

        // If no camera tracking and no simulator is active, drive Theremin
        // directly from the mouse pointer so clicking "Theremin" immediately works.
        if (!leftState && !rightState) {
          const ptr = this.simulator.getLastPointerPosition();
          const stage = document.getElementById('pixi-viewport');
          const w = stage?.clientWidth || 800;
          const h = stage?.clientHeight || 600;
          leftState = this.simulator.buildState('Left', performance.now() / 1000, ptr, w, h);
          rightState = this.simulator.buildState(
            'Right',
            performance.now() / 1000,
            { x: Math.min(w - 60, ptr.x + 240), y: ptr.y },
            w,
            h
          );
        }

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

      // Guide the user until the first frame exists (or until dismissed):
      // explain how to pose and that Snímek (or Space) captures the frame.
      const wantHint = this.stopMotionActive && !this.smHintDismissed && this.stopMotion.getFrameCount() === 0;
      this.smEmptyHint.classList.toggle('hidden', !wantHint);

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

    // Toggle Camera. State convention shared with the other toggles:
    // ON (running) = btn-primary, OFF = btn-secondary.
    const setCameraButton = (state: 'off' | 'on' | 'starting'): void => {
      btnCamera.classList.remove('btn-primary', 'btn-secondary');
      if (state === 'on') {
        btnCamera.textContent = 'Zastavit';
        btnCamera.classList.add('btn-primary');
      } else {
        btnCamera.textContent = state === 'starting' ? 'Spouštění...' : 'Kamera';
        btnCamera.classList.add('btn-secondary');
      }
    };

    btnCamera.addEventListener('click', async () => {
      if (this.tracker.getActiveState()) {
        this.tracker.stop();
        setCameraButton('off');
        this.showStatus('Kamera byla zastavena.');
      } else {
        setCameraButton('starting');
        this.showStatus('Spouštění kamery...');

        try {
          const started = await this.tracker.start(
            (results) => this.handleTrackingResults(results),
            (err) => {
              this.showStatus(`Chyba kamery: ${err.message}`);
              setCameraButton('off');
            }
          );
          if (started) {
            setCameraButton('on');
            this.hideStatus();
          } else {
            setCameraButton('off');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.showStatus(`Chyba kamery: ${message}`);
          setCameraButton('off');
        }
      }
    });

    // Toggle Stage Video Recording. ON (recording) = btn-danger.
    btnRecord.addEventListener('click', () => {
      if (this.recorder.getIsRecording()) {
        this.recorder.stop();
        btnRecord.textContent = 'Nahrávat';
        btnRecord.classList.remove('btn-danger');
        btnRecord.classList.add('btn-secondary');
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
          btnRecord.classList.remove('btn-secondary');
          btnRecord.classList.add('btn-danger');
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
    const sceneGroup = document.querySelector('.scene-group') as HTMLElement;
    btnStopMotion.addEventListener('click', () => {
      this.stopMotionActive = !this.stopMotionActive;
      this.stopMotion.setModeActive(this.stopMotionActive);
      this.renderer.setPoseEditing(this.stopMotionActive);

      if (this.stopMotionActive) {
        this.smHintDismissed = false;
        btnStopMotion.textContent = 'Stop-motion (ZAP)';
        btnStopMotion.classList.remove('btn-secondary');
        btnStopMotion.classList.add('btn-primary');
        this.resizeStopMotionOverlays();
        // Make the puppets visible right away (resting pose) so the user sees
        // what they are posing before any hand is tracked.
        this.renderer.placePuppetsAtDefaults();
        // Sync the Ruka toggle to the actual hand-follow state (always true on
        // entry after the exit handler resets it), so the UI never lies.
        smBtnHand.textContent = this.renderer.isHandFollowEnabled() ? 'Ruka (ZAP)' : 'Ruka';
        smBtnHand.classList.toggle('btn-primary', this.renderer.isHandFollowEnabled());
        this.updatePuppetManagerVisibility();
        // The bottom panel owns the background controls while in this mode,
        // so hide the duplicated top-bar scene group.
        sceneGroup.classList.add('hidden');
        this.showStatus('Stop-motion: modré kroužky = chytací body (tělo = posun, zelené = končetiny/hlava). Snímek = uložit.');
      } else {
        btnStopMotion.textContent = 'Stop-motion';
        btnStopMotion.classList.remove('btn-primary');
        btnStopMotion.classList.add('btn-secondary');
        sceneGroup.classList.remove('hidden');
        this.fistFreezeActive = false;
        this.renderer.setFrozen(this.isMotionFrozen);
        // Hand-follow is a stop-motion framing setting (Ruka toggle). Leaving
        // the mode must restore default hand tracking, otherwise a session
        // where the user disabled Ruka silently leaves normal mode frozen.
        this.renderer.setHandFollowEnabled(true);
        this.updatePuppetManagerVisibility();
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
    const smPanX = document.getElementById('sm-pan-x') as HTMLInputElement;
    const smPanY = document.getElementById('sm-pan-y') as HTMLInputElement;
    const smPanStepX = document.getElementById('sm-pan-step-x') as HTMLInputElement;
    const smPanStepY = document.getElementById('sm-pan-step-y') as HTMLInputElement;

    const applyStripPan = (): void => {
      this.renderer.setStripOffset(this.smStripOffsetX, this.smStripOffsetY);
    };

    const resetStripState = (): void => {
      this.smStripActive = false;
      this.smStripOffsetX = 0;
      this.smStripOffsetY = 0;
      smPanX.value = '0';
      smPanY.value = '0';
      smPanX.disabled = true;
      smPanY.disabled = true;
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
        this.smStripOffsetX = 0;
        this.smStripOffsetY = 0;
        this.smStripActive = true;
        smPanX.value = '0';
        smPanY.value = '0';
        smPanX.disabled = false;
        smPanY.disabled = false;
        await this.renderer.setStripBackground(dataUrl);
        this.showStatus('Pozadí načteno — posouvej X/Y posuvníky (i svisle u velkého obrázku).');
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
        smPanX.disabled = false;
        smPanY.disabled = false;
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

    smPanX.addEventListener('input', () => {
      this.smStripOffsetX = parseInt(smPanX.value, 10) || 0;
      applyStripPan();
    });
    smPanY.addEventListener('input', () => {
      this.smStripOffsetY = parseInt(smPanY.value, 10) || 0;
      applyStripPan();
    });

    // Auto-advance the strip by the configured X/Y step after every captured frame.
    this.advanceStripAfterSnap = (): void => {
      if (!this.smStripActive) return;
      const stepX = parseFloat(smPanStepX.value) || 0;
      const stepY = parseFloat(smPanStepY.value) || 0;
      if (stepX === 0 && stepY === 0) return;
      this.smStripOffsetX += stepX;
      this.smStripOffsetY += stepY;
      smPanX.value = String(this.smStripOffsetX);
      smPanY.value = String(this.smStripOffsetY);
      applyStripPan();
    };

    // Toggle the chain prop (garland of leaves) that follows the hand.
    const smBtnLeaves = document.getElementById('sm-btn-leaves') as HTMLButtonElement;
    smBtnLeaves.addEventListener('click', () => {
      const active = this.renderer.isChainPropEnabled();
      this.renderer.setChainPropEnabled(!active);
      smBtnLeaves.classList.toggle('btn-primary', active);
      this.showStatus(!active ? 'Řetěz listí zapnut — sleduje ruku.' : 'Řetěz listí vypnut.');
      setTimeout(() => this.hideStatus(), 2000);
    });

    // Stop-Motion onboarding hint close button.
    const smHintClose = document.getElementById('sm-hint-close') as HTMLButtonElement | null;
    smHintClose?.addEventListener('click', () => {
      this.smHintDismissed = true;
      this.smEmptyHint.classList.add('hidden');
    });

    // Toggle hand-following (manual placement mode for precise arrangement).
    const smBtnHand = document.getElementById('sm-btn-hand') as HTMLButtonElement;
    smBtnHand.addEventListener('click', () => {
      const active = !this.renderer.isHandFollowEnabled();
      this.renderer.setHandFollowEnabled(active);
      smBtnHand.textContent = active ? 'Ruka (ZAP)' : 'Ruka';
      smBtnHand.classList.toggle('btn-primary', active);
      this.updatePuppetManagerVisibility();
      this.showStatus(
        active
          ? 'Ruce opět ovládají loutky.'
          : 'Sledování ruky vypnuto — loutky táhni myší, zůstanou na místě.'
      );
      setTimeout(() => this.hideStatus(), 2500);
    });

    // Help / manual modal (open via button, backdrop or Esc).
    const helpModal = document.getElementById('help-modal') as HTMLElement;
    const btnHelp = document.getElementById('btn-help') as HTMLButtonElement;
    const btnHelpClose = document.getElementById('btn-help-close') as HTMLButtonElement;

    const closeHelp = (): void => {
      helpModal.classList.add('hidden');
    };

    btnHelp.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
    btnHelpClose.addEventListener('click', closeHelp);
    helpModal.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.helpClose !== undefined) closeHelp();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) closeHelp();
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

  /** Builds the floating "Správa loutek" panel: character palette (drag & drop
   * onto the scene) and the on-stage layer list (select / reorder / delete). */
  private async setupPuppetManager(): Promise<void> {
    const manager = document.getElementById('puppet-manager') as HTMLElement;
    const palette = document.getElementById('pm-palette') as HTMLElement;
    const layers = document.getElementById('pm-layers') as HTMLElement;
    const btnToggle = document.getElementById('pm-toggle') as HTMLButtonElement;
    const header = manager.querySelector('.pm-header') as HTMLElement;

    // --- Collapse / expand (must not start a header drag) ---
    btnToggle.addEventListener('pointerdown', (e) => e.stopPropagation());
    btnToggle.addEventListener('click', () => {
      const collapsed = manager.classList.toggle('collapsed');
      btnToggle.innerHTML = collapsed ? '&#9652;' : '&#9662;';
    });

    // --- Draggable / dockable window ---
    let dragOffset = { x: 0, y: 0 };
    let dragStart = { x: 0, y: 0 };
    let dragging = false;
    header.addEventListener('pointerdown', (e) => {
      const rect = manager.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      dragStart = { x: e.clientX, y: e.clientY };
      dragging = false;
      header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
      if (!header.hasPointerCapture(e.pointerId)) return;
      if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 4) dragging = true;
      if (!dragging) return;
      manager.classList.remove('docked-left', 'docked-top', 'docked-bottom');
      manager.style.left = `${e.clientX - dragOffset.x}px`;
      manager.style.top = `${e.clientY - dragOffset.y}px`;
    });
    header.addEventListener('pointerup', (e) => {
      if (!header.hasPointerCapture(e.pointerId)) return;
      header.releasePointerCapture(e.pointerId);
      // Only dock when the user actually dragged (a plain click on the header
      // must not snap the window to an edge).
      if (!dragging) return;
      const rightGap = window.innerWidth - (e.clientX + (manager.offsetWidth - dragOffset.x));
      const topGap = e.clientY - dragOffset.y;
      const bottomGap = window.innerHeight - (e.clientY + (manager.offsetHeight - dragOffset.y));
      if (rightGap < 40) {
        manager.classList.add('docked-left');
        manager.style.left = '';
        manager.style.top = `${Math.max(8, topGap)}px`;
      } else if (topGap < 24) {
        manager.classList.add('docked-top');
        manager.style.top = '';
        manager.style.left = `${Math.max(8, e.clientX - dragOffset.x)}px`;
      } else if (bottomGap < 24) {
        manager.classList.add('docked-bottom');
        manager.style.bottom = '';
        manager.style.top = '';
        manager.style.left = `${Math.max(8, e.clientX - dragOffset.x)}px`;
      }
    });

    // --- Palette: character thumbnails, drag & drop onto the stage ---
    const entries: { preset: string; name: string; thumb?: string }[] = [
      { preset: 'fox', name: 'Liška' },
      { preset: 'robot', name: 'Robot' },
    ];
    for (const id of await fetchRigIdList()) {
      try {
        const cfg = await fetchRigConfig(id);
        entries.push({ preset: `rig:${id}`, name: cfg.name || id, thumb: cfg.parts?.body?.src });
      } catch {
        /* skip broken character */
      }
    }
    for (const id of listLocalCharacterIds()) {
      const cfg = loadLocalCharacterConfig(id);
      if (!cfg) continue;
      entries.push({ preset: `rig:local:${id}`, name: cfg.name || id, thumb: cfg.parts?.body?.src });
    }

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'pm-palette-item';
      item.draggable = true;
      item.title = entry.name;
      if (entry.thumb) {
        const img = document.createElement('img');
        img.className = 'pm-pal-thumb';
        img.src = entry.thumb;
        img.alt = '';
        item.appendChild(img);
      }
      const label = document.createElement('span');
      label.className = 'pm-pal-label';
      label.textContent = entry.name;
      item.appendChild(label);
      item.dataset.preset = entry.preset;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', entry.preset);
      });
      // Click = add at a cascading default position (drag & drop = exact spot).
      item.addEventListener('click', () => {
        const count = this.renderer.getExtraPuppets().length;
        const w = this.renderer.getWidth();
        const h = this.renderer.getHeight();
        const x = w * 0.5 + (count % 3 - 1) * 90;
        const y = h * 0.5 + Math.floor(count / 3) * 70;
        void this.addPuppetAt(entry.preset as PuppetPreset, x, y);
      });
      palette.appendChild(item);
    }

    // Drop target = whole stage container.
    const stage = document.getElementById('pixi-viewport') as HTMLElement;
    stage.addEventListener('dragover', (e) => e.preventDefault());
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      const preset = e.dataTransfer?.getData('text/plain') as PuppetPreset | undefined;
      if (!preset) return;
      const rect = stage.getBoundingClientRect();
      const gx = (e.clientX - rect.left) * (this.renderer.getWidth() / Math.max(1, rect.width));
      const gy = (e.clientY - rect.top) * (this.renderer.getHeight() / Math.max(1, rect.height));
      const local = this.renderer.stageToWorldLocal(gx, gy);
      void this.addPuppetAt(preset, local.x, local.y);
    });

    // --- Selection callback from the renderer (grab a puppet on stage) ---
    this.renderer.onPuppetSelect = (id) => {
      this.pmActiveId = id;
      this.renderer.setSelectedPuppet(id);
      this.refreshPmLayers();
    };

    // --- Delete selected puppet (live slots become empty, extras removed) ---
    const btnDeleteSelected = document.getElementById('pm-delete-selected') as HTMLButtonElement;
    btnDeleteSelected.addEventListener('click', () => {
      if (!this.pmActiveId) return;
      const id = this.pmActiveId;
      void (async () => {
        await this.renderer.removePuppet(id);
        this.pmActiveId = null;
        this.renderer.setSelectedPuppet(null);
        this.refreshPmLayers();
        this.showStatus('Loutka odebrána ze scény.');
        setTimeout(() => this.hideStatus(), 2000);
      })();
    });

    // --- Duplicate selected puppet ---
    const btnDuplicate = document.getElementById('pm-duplicate') as HTMLButtonElement;
    btnDuplicate.addEventListener('click', () => {
      if (!this.pmActiveId) return;
      const id = this.pmActiveId;
      void (async () => {
        const newId = await this.renderer.duplicatePuppet(id);
        if (newId) {
          this.pmActiveId = newId;
          this.renderer.setSelectedPuppet(newId);
          this.refreshPmLayers();
          this.showStatus('Loutka zduplikována.');
          setTimeout(() => this.hideStatus(), 2000);
        }
      })();
    });

    // --- Minimized strip controls (duplicate / delete act on the selection) ---
    const pmMinDuplicate = document.getElementById('pm-min-duplicate') as HTMLButtonElement;
    const pmMinDelete = document.getElementById('pm-min-delete') as HTMLButtonElement;
    pmMinDuplicate.addEventListener('pointerdown', (e) => e.stopPropagation());
    pmMinDelete.addEventListener('pointerdown', (e) => e.stopPropagation());
    pmMinDuplicate.addEventListener('click', () => btnDuplicate.click());
    pmMinDelete.addEventListener('click', () => btnDeleteSelected.click());

    // --- Layer list: click to select, drag to reorder ---
    layers.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.pm-layer') as HTMLElement | null;
      if (!row) return;
      this.pmActiveId = row.dataset.id ?? null;
      this.renderer.setSelectedPuppet(this.pmActiveId);
      this.refreshPmLayers();
    });
    layers.addEventListener('dragstart', (e) => {
      const row = (e.target as HTMLElement).closest('.pm-layer') as HTMLElement | null;
      if (!row) return;
      this.pmLayerDragId = row.dataset.id ?? null;
      e.dataTransfer?.setData('text/plain', this.pmLayerDragId ?? '');
    });
    layers.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!this.pmLayerDragId) return;
      const dragged = layers.querySelector(`.pm-layer[data-id="${this.pmLayerDragId}"]`) as HTMLElement | null;
      const over = (e.target as HTMLElement).closest('.pm-layer') as HTMLElement | null;
      if (!dragged || !over || over === dragged) return;
      const box = over.getBoundingClientRect();
      const before = e.clientY < box.top + box.height / 2;
      if (before) {
        if (over.previousSibling !== dragged) layers.insertBefore(dragged, over);
      } else {
        if (over.nextSibling !== dragged) layers.insertBefore(dragged, over.nextSibling);
      }
    });
    layers.addEventListener('dragend', () => {
      const order = Array.from(layers.querySelectorAll('.pm-layer')).map(
        (el) => (el as HTMLElement).dataset.id as string
      );
      // Layers list is front-to-back; reorder method expects front-to-back.
      this.renderer.reorderPuppets(order);
      this.refreshPmLayers();
      this.pmLayerDragId = null;
    });

this.refreshPmLayers();
  }

  /** Adds an extra puppet, selects it and refreshes the layer list. */
  private async addPuppetAt(preset: PuppetPreset, x: number, y: number): Promise<void> {
    const id = await this.renderer.addExtraPuppet(preset, x, y);
    this.pmActiveId = id;
    this.renderer.setSelectedPuppet(id);
    this.refreshPmLayers();
    this.showStatus(`Loutka přidána na scénu (${x.toFixed(0)}, ${y.toFixed(0)}).`);
    setTimeout(() => this.hideStatus(), 2000);
  }

  /** Rebuilds the on-stage layer list (front to back). Includes the live slots
   * (L1/L2) and every extra puppet added via the panel. */
  private refreshPmLayers(): void {
    const layers = document.getElementById('pm-layers') as HTMLElement;
    layers.innerHTML = '';
    const puppets = this.renderer.getStagePuppets();
    // Only show puppets that actually have a visible preset.
    const visible = puppets.filter((p) => p.preset !== 'none');
    for (const sp of [...visible].reverse()) {
      const row = document.createElement('div');
      row.className = 'pm-layer' + (sp.id === this.pmActiveId ? ' active' : '');
      row.dataset.id = sp.id;
      row.draggable = true;
      const handle = document.createElement('span');
      handle.className = 'pm-layer-handle';
      handle.textContent = '\u2630';
      row.appendChild(handle);
      const name = document.createElement('span');
      name.className = 'pm-layer-name';
      name.textContent = this.presetName(sp.preset) + (sp.live ? ' · ruce' : '');
      row.appendChild(name);
      layers.appendChild(row);
    }
    const btnDeleteSelected = document.getElementById('pm-delete-selected') as HTMLButtonElement;
    const btnDuplicate = document.getElementById('pm-duplicate') as HTMLButtonElement;
    const pmMinDuplicate = document.getElementById('pm-min-duplicate') as HTMLButtonElement;
    const pmMinDelete = document.getElementById('pm-min-delete') as HTMLButtonElement;
    const countEl = document.getElementById('pm-min-count') as HTMLElement;
    const hasSelection = this.pmActiveId !== null;
    btnDeleteSelected.disabled = !hasSelection;
    btnDuplicate.disabled = !hasSelection;
    pmMinDuplicate.disabled = !hasSelection;
    pmMinDelete.disabled = !hasSelection;
    countEl.textContent = String(visible.length);
  }

  private presetName(preset: string): string {
    if (preset === 'fox') return 'Liška';
    if (preset === 'robot') return 'Robot';
    if (preset === 'custom') return 'Vlastní';
    if (preset.startsWith('rig:local:')) {
      const cfg = loadLocalCharacterConfig(preset.slice('rig:local:'.length));
      return cfg?.name || 'Rig';
    }
    return 'Rig';
  }

  /** Shows/hides the floating puppet manager based on mode. */
  private updatePuppetManagerVisibility(): void {
    const manager = document.getElementById('puppet-manager') as HTMLElement;
    const visible = this.stopMotionActive && !this.renderer.isHandFollowEnabled();
    manager.classList.toggle('hidden', !visible);
    if (visible) this.refreshPmLayers();
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

    // Handle missing hand frames. In stop-motion mode a lost hand must NOT
    // remove the puppet from the stage - the user is framing a shot and needs
    // the puppet to stay visible (and draggable) even with no hand in view.
    if (!this.isMotionFrozen && !this.stopMotionActive) {
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
