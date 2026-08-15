import { PuppetRenderer } from './renderer';
import { HandState, LimbOffsets, Point2D, clamp, lerp } from './gestures';

/**
 * Drives the puppets with synthetic hand states so the app can be tested
 * without a webcam. The body follows the mouse and the arms wave
 * sinusoidally around the shoulders - ideal for verifying cut-out rig crops
 * and pivots. When the mouse is idle the body simply stays put (no drifting).
 */
export class HandSimulator {
  private renderer: PuppetRenderer;
  private rafId: number | null = null;
  private running: boolean = false;
  private startTime: number = performance.now();
  private mouseTarget: Point2D | null = null;
  private current: Point2D = { x: 0, y: 0 };
  private lastPointer: Point2D = { x: 400, y: 300 };

  constructor(renderer: PuppetRenderer) {
    this.renderer = renderer;
    const onMove = (e: PointerEvent | MouseEvent) => {
      const stage = document.getElementById('pixi-viewport');
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, Math.max(1, rect.width));
      const y = clamp(e.clientY - rect.top, 0, Math.max(1, rect.height));
      this.mouseTarget = { x, y };
      this.lastPointer = { x, y };
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getLastPointerPosition(): Point2D {
    return { ...this.lastPointer };
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    const stage = document.getElementById('pixi-viewport');
    const w = stage?.clientWidth || 800;
    const h = stage?.clientHeight || 600;
    this.current = this.mouseTarget ? { ...this.mouseTarget } : { x: w / 2, y: h / 2 };
    this.loop();
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    this.update();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(): void {
    const t = (performance.now() - this.startTime) / 1000;
    const stage = document.getElementById('pixi-viewport');
    const w = stage?.clientWidth || 800;
    const h = stage?.clientHeight || 600;

    // Body follows the mouse; when idle it simply stays where it is.
    if (this.mouseTarget) {
      this.current.x = lerp(this.current.x, this.mouseTarget.x, 0.25);
      this.current.y = lerp(this.current.y, this.mouseTarget.y, 0.25);
    }

    const leftState = this.buildState('Left', t, this.current, w, h);
    const rightState = this.buildState(
      'Right',
      t,
      {
        x: Math.min(w - 60, Math.max(60, this.current.x + 240)),
        y: this.current.y,
      },
      w,
      h
    );

    this.renderer.updateHandState(leftState);
    this.renderer.updateHandState(rightState);
  }

  public buildState(handType: 'Left' | 'Right', t: number, pos: Point2D, w = 800, h = 600): HandState {
    // Different phase per hand so the two puppets never move in lockstep.
    const phase = handType === 'Left' ? 0 : Math.PI * 0.7;
    const restAngle = Math.PI / 2;

    // Each limb follows its OWN sine (frequency, amplitude and offset differ),
    // so no limb is just a copy of another - it mimics real finger-driven
    // tracking where every finger moves independently.
    const arm = (freq: number, ph: number, amp: number, len: number): Point2D => {
      const a = restAngle + amp * Math.sin(t * freq + phase + ph);
      return { x: Math.cos(a) * len, y: Math.sin(a) * len };
    };

    const kickL = Math.sin(t * 2.1 + phase);
    const kickR = Math.sin(t * 1.9 + phase + Math.PI * 0.6);

    const limbs: LimbOffsets = {
      head: { x: Math.sin(t * 1.3 + phase) * 5, y: -42 },
      leftArm: arm(1.7, 0.5, 0.9, 125),
      rightArm: arm(1.4, -0.7, 1.05, 120),
      leftLeg: { x: -26 + kickL * 38, y: 55 + Math.abs(kickL) * 22 },
      rightLeg: { x: 26 - kickR * 38, y: 55 + Math.abs(kickR) * 22 },
    };

    const normX = clamp(pos.x / Math.max(1, w), 0, 1);
    const normY = clamp(pos.y / Math.max(1, h), 0, 1);

    return {
      handType,
      wristPosition: { x: normX, y: normY },
      rawPositionPixels: pos,
      smoothedPosition: pos,
      pinchDistance: 0.05,
      isPinching: Math.sin(t) > 0.7,
      mouthOpenRatio: 0.5 + 0.5 * Math.sin(t * 1.8 + phase),
      fingerSplay: 0.5,
      fistFactor: 0,
      middleFingerFactor: 0,
      // Simulated "hand upright" base angle so the renderer's mild in-plane
      // rotation keeps the puppet level instead of leaning it.
      rotation: -Math.PI / 2,
      limbs,
    };
  }
}