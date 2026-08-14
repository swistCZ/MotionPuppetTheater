import { PuppetRenderer } from './renderer';
import { HandState, LimbOffsets, Point2D, lerp } from './gestures';

/**
 * Drives the puppets with synthetic hand states so the app can be tested
 * without a webcam. The body follows the mouse (or an idle demo path) and
 * the arms wave sinusoidally around the shoulders - ideal for verifying
 * cut-out rig crops and pivots.
 */
export class HandSimulator {
  private renderer: PuppetRenderer;
  private rafId: number | null = null;
  private running: boolean = false;
  private startTime: number = performance.now();
  private mouseTarget: Point2D | null = null;
  private lastMouseMove: number = 0;
  private current: Point2D = { x: 0, y: 0 };

  constructor(renderer: PuppetRenderer) {
    this.renderer = renderer;
    window.addEventListener('pointermove', (e) => {
      const stage = document.getElementById('pixi-viewport') as HTMLElement;
      const rect = stage.getBoundingClientRect();
      this.mouseTarget = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.lastMouseMove = performance.now();
    });
  }

  public isRunning(): boolean {
    return this.running;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    const stage = document.getElementById('pixi-viewport') as HTMLElement;
    this.current = { x: (stage.clientWidth || 800) / 2, y: (stage.clientHeight || 600) / 2 };
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
    const stage = document.getElementById('pixi-viewport') as HTMLElement;
    const w = stage.clientWidth || 800;
    const h = stage.clientHeight || 600;

    const idleTime = performance.now() - this.lastMouseMove;
    if (this.mouseTarget && idleTime < 2000) {
      this.current.x = lerp(this.current.x, this.mouseTarget.x, 0.15);
      this.current.y = lerp(this.current.y, this.mouseTarget.y, 0.15);
    } else {
      const tx = w / 2 + Math.sin(t * 0.6) * w * 0.28;
      const ty = h / 2 + Math.sin(t * 0.9) * h * 0.18;
      this.current.x = lerp(this.current.x, tx, 0.05);
      this.current.y = lerp(this.current.y, ty, 0.05);
    }

    const leftState = this.buildState('Left', t, this.current);
    const rightState = this.buildState('Right', t, {
      x: Math.min(w - 60, this.current.x + 280),
      y: this.current.y,
    });

    this.renderer.updateHandState(leftState);
    this.renderer.updateHandState(rightState);
  }

  private buildState(handType: 'Left' | 'Right', t: number, pos: Point2D): HandState {
    const phase = handType === 'Left' ? 0 : Math.PI;
    const swing = 1.05 * Math.sin(t * 1.6 + phase);
    const restAngle = Math.PI / 2;

    const makeLimb = (offset: number): Point2D => ({
      x: Math.cos(restAngle + swing + offset) * 130,
      y: Math.sin(restAngle + swing + offset) * 130,
    });

    const kick = Math.sin(t * 2.0 + phase) * 55;
    const limbs: LimbOffsets = {
      head: { x: Math.sin(t * 1.2 + phase) * 6, y: -42 },
      leftArm: makeLimb(-0.25),
      rightArm: makeLimb(0.25),
      leftLeg: { x: -30, y: 55 + kick },
      rightLeg: { x: 30, y: 55 - kick },
    };

    return {
      handType,
      wristPosition: { x: pos.x / 1000, y: pos.y / 800 },
      rawPositionPixels: pos,
      smoothedPosition: pos,
      pinchDistance: 0.05,
      isPinching: Math.sin(t) > 0.7,
      mouthOpenRatio: 0.5 + 0.5 * Math.sin(t * 1.8 + phase),
      fingerSplay: 0.5,
      rotation: 0,
      limbs,
    };
  }
}