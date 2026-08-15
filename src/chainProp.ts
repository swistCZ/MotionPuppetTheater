import { Container, Sprite, Texture } from 'pixi.js';
import { lerp } from './gestures';

export interface ChainPropConfig {
  segments: number;
  segLength: number;
  gravity: number;
  damping: number;
  flutterAmplitude: number;
  flutterFrequency: number;
  leafMinScale: number;
  leafMaxScale: number;
}

export const DEFAULT_CHAIN_CONFIG: ChainPropConfig = {
  segments: 9,
  segLength: 42,
  gravity: 0.18,
  damping: 0.985,
  flutterAmplitude: 0.22,
  flutterFrequency: 0.02,
  leafMinScale: 0.6,
  leafMaxScale: 1.3,
};

interface VerletPoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * A chain of connected leaves (a generic "prop") hanging from a tracked hand
 * point. Verlet physics give it gravity + inertia (secondary motion); each
 * leaf additionally flutters with a phase-shifted sine so the whole garland
 * "třepotá" as the hand moves. Leaves come in varying sizes.
 */
export class ChainProp {
  private container: Container = new Container();
  private points: VerletPoint[] = [];
  private leafSprites: Sprite[] = [];
  private leafScales: number[] = [];
  private timeMs: number = 0;
  private enabled: boolean = false;

  constructor(private config: ChainPropConfig = DEFAULT_CHAIN_CONFIG) {
    const texture = ChainProp.createLeafTexture(48);

    for (let i = 0; i < config.segments; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      this.leafSprites.push(sprite);
      this.container.addChild(sprite);

      const t = config.segments === 1 ? 0 : i / (config.segments - 1);
      const jitter = Math.sin(i * 7.3) * 0.25;
      this.leafScales.push(lerp(config.leafMinScale, config.leafMaxScale, t) * (1 + jitter));
    }

    for (let i = 0; i <= config.segments; i++) {
      this.points.push({ x: 0, y: 0, px: 0, py: 0 });
    }
  }

  /** Draws a simple teardrop leaf (tip up, base down) on a square canvas. */
  public static createLeafTexture(size: number): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.04);
    ctx.bezierCurveTo(size * 0.96, size * 0.3, size * 0.86, size * 0.92, size * 0.5, size * 0.96);
    ctx.bezierCurveTo(size * 0.14, size * 0.92, size * 0.04, size * 0.3, size * 0.5, size * 0.04);
    ctx.closePath();
    ctx.fillStyle = '#3fb950';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.strokeStyle = '#2ea043';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.08);
    ctx.lineTo(size * 0.5, size * 0.9);
    ctx.strokeStyle = '#1f6f2f';
    ctx.stroke();

    return Texture.from(canvas);
  }

  public getContainer(): Container {
    return this.container;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean, x = 0, y = 0): void {
    this.enabled = enabled;
    this.container.visible = enabled;
    if (enabled) {
      this.reset(x, y);
    }
  }

  private reset(x: number, y: number): void {
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      p.x = x;
      p.y = y + i * this.config.segLength;
      p.px = p.x;
      p.py = p.y;
    }
  }

  public update(dtMs: number, anchorX: number, anchorY: number): void {
    if (!this.enabled) return;
    this.timeMs += dtMs;
    const pts = this.points;
    const { segLength, damping, gravity, flutterAmplitude, flutterFrequency } = this.config;

    // Pin the head to the hand and let the rest fall freely.
    pts[0].x = anchorX;
    pts[0].y = anchorY;
    pts[0].px = anchorX;
    pts[0].py = anchorY;

    // Verlet integration (inertia + gravity).
    const g = gravity * dtMs;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;
    }

    // Distance constraints between consecutive points.
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - segLength) / dist;
        b.x -= dx * diff * 0.5;
        b.y -= dy * diff * 0.5;
      }
      pts[0].x = anchorX;
      pts[0].y = anchorY;
    }

    // Render each leaf along its segment, pointing down the chain + fluttering.
    for (let i = 0; i < this.leafSprites.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const sprite = this.leafSprites[i];
      sprite.position.set((a.x + b.x) / 2, (a.y + b.y) / 2);
      sprite.scale.set(this.leafScales[i]);

      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const flutter = Math.sin(this.timeMs * flutterFrequency + i * 1.1) * flutterAmplitude;
      sprite.rotation = angle + Math.PI / 2 + flutter;
    }
  }
}