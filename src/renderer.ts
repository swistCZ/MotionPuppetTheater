import { Application, Container, Sprite, Graphics, Assets, Texture, Text, TextStyle, FederatedPointerEvent, TilingSprite, Rectangle } from 'pixi.js';
import { HandState, clamp, shortestAngleDelta, spreadFactor, Point2D } from './gestures';
import { CutoutRigConfig, armRotation } from './rig';
import { RigRenderParts, buildRigParts, fetchRigConfig, loadLocalCharacterConfig } from './rigAssets';
import { ChainProp } from './chainProp';

const HANDLE_R = 14;

export type PuppetPreset = 'fox' | 'robot' | 'custom' | 'none' | `rig:${string}`;

export interface PuppetPoseSnapshot {
  preset: PuppetPreset;
  position: Point2D;
  rotation: number;
  manualPose?: Partial<Record<RigPartKey, Point2D>>;
  rigRotations?: {
    leftArm?: number;
    rightArm?: number;
    leftLeg?: number;
    rightLeg?: number;
  };
  headPosition?: Point2D;
}

export interface StagePoseSnapshot {
  leftPuppet: PuppetPoseSnapshot;
  rightPuppet: PuppetPoseSnapshot;
  background: {
    colorHex: number;
    stripActive: boolean;
    stripNearActive: boolean;
    stripOffsetX: number;
    stripOffsetY: number;
    stripParallaxFactor: number;
  };
}

// Mild in-plane rotation: an upright hand (wrist below palm) maps to 0 deg,
// and the container tilt is damped so the flat sprite only leans, never flips.
const ROT_BASE = -Math.PI / 2;
const ROT_DAMP = 0.35;
const ROT_ALPHA = 0.25;

interface RigPuppetState {
  config: CutoutRigConfig;
  parts: RigRenderParts;
  scale: number;
  maxArmDelta: number;
}

interface DynamicPuppet {
  container: Container;
  torso: Graphics;
  headContainer: Container;
  headGraphic: Graphics;
  leftEye: Graphics;
  rightEye: Graphics;
  jaw: Graphics;
  leftArm: Graphics;
  rightArm: Graphics;
  leftLeg: Graphics;
  rightLeg: Graphics;
  preset: PuppetPreset;
  lastRotation?: number;
  customSpriteClosed?: Sprite;
  customSpriteOpen?: Sprite;
  rig?: RigPuppetState;
  /** Manual mouse overrides for procedural parts (stop-motion framing). A real
   * hand frame clears them so the hands drive the puppet again. */
  manualPose?: Partial<Record<RigPartKey, Point2D>>;
  /** Visible grab handles for stop-motion mouse posing (not captured in snaps). */
  editHandles?: Container;
  handleByPart?: Partial<Record<RigPartKey, Graphics>>;
}

type RigPartKey = 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head';

interface PartDragInfo {
  puppet: DynamicPuppet;
  part: RigPartKey;
}

interface ActiveDrag {
  puppet: DynamicPuppet;
  part: RigPartKey;
  sprite?: Sprite;
  startPointer: Point2D;
  startRotation: number;
  startContainerPos: Point2D;
  jointGlobal: Point2D;
  startLocal?: Point2D;
  procedural?: boolean;
}

export class PuppetRenderer {
  private app: Application;

  // Puppets
  private leftPuppet: DynamicPuppet;
  private rightPuppet: DynamicPuppet;

  // Theremin Visual Orbs
  private thereminContainer: Container;
  private leftThereminOrb: Graphics;
  private rightThereminOrb: Graphics;
  private leftThereminText: Text;
  private rightThereminText: Text;
  private isThereminMode: boolean = false;
  private animFrameCounter: number = 0;
  private lastLeftState?: HandState;
  private lastRightState?: HandState;

  // Background
  private bgGraphics: Graphics;
  private bgSprite: Sprite | null = null;
  private bgTiling: TilingSprite | null = null;
  private bgTilingNear: TilingSprite | null = null;
  private stripFarDataUrl?: string;
  private stripNearDataUrl?: string;
  private customBgDataUrl?: string;
  private stripOffsetX: number = 0;
  private stripOffsetY: number = 0;
  private stripParallaxFactor: number = 1.6;
  private currentBgColorHex: number = 0x2d3748;

  // Camera zoom (stop-motion middle-finger gesture). Applied only to the
  // "world" layer so backgrounds always stay fullscreen and never expose gaps.
  private worldContainer: Container;
  private zoom: number = 1;
  private targetZoom: number = 1;

  // Motion Freeze
  private isFrozen: boolean = false;

  // Hand-follow: when disabled the puppets stop tracking the hands and stay
  // exactly where they are (stop-motion "manual placement" mode).
  private handFollowEnabled: boolean = true;

  // Chain prop (e.g. a garland of leaves) following the tracked hand.
  private chainProp!: ChainProp;

  // Manual pose editing (stop-motion fine-tuning): drag via visible handles.
  private poseEditing: boolean = false;
  private dragInfo: Map<Container, PartDragInfo> = new Map();
  private activeDrag: ActiveDrag | null = null;
  private handlesVisible: boolean = true;
  /** Handle currently under the pointer (wheel rotates limbs finely). */
  private hoveredHandle: PartDragInfo | null = null;

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();

    this.bgGraphics = new Graphics();
    this.worldContainer = new Container();
    this.leftPuppet = this.createEmptyPuppet('fox');
    this.rightPuppet = this.createEmptyPuppet('robot');

    this.thereminContainer = new Container();
    this.leftThereminOrb = new Graphics();
    this.rightThereminOrb = new Graphics();

    const textStyle = new TextStyle({
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#ffffff',
      stroke: { color: '#000000', width: 3 },
    });

    this.leftThereminText = new Text({ text: 'Pitch (Hz)', style: textStyle });
    this.rightThereminText = new Text({ text: 'Volume (%)', style: textStyle });
  }

  public getCanvasElement(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  /** Captures a clean PNG snapshot of the stage with edit handles temporarily hidden. */
  public captureStageDataUrl(): string {
    this.setEditHandlesVisible(false);
    this.app.renderer.render(this.app.stage);
    const canvas = this.app.canvas as HTMLCanvasElement;
    const dataUrl = canvas.toDataURL('image/png');
    this.setEditHandlesVisible(true);
    return dataUrl;
  }

  /** Forces a single present of the current scene (used before toDataURL). */
  public renderNow(): void {
    this.app.renderer.render(this.app.stage);
  }

  public async initialize(parentElement: HTMLElement): Promise<void> {
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundColor: 0x1e1e2e,
      antialias: true,
      preference: 'webgl',
      preserveDrawingBuffer: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    const pixiCanvas = this.app.canvas as HTMLCanvasElement;
    pixiCanvas.classList.add('pixi-canvas');
    // Pin the stage canvas to the viewport with inline styles so no CSS rule,
    // cascade order or layout context can push it out of view (this matches
    // how the overlay canvases already render). The onion/play/grid overlays
    // stack above it via their own higher z-index.
    pixiCanvas.style.position = 'absolute';
    pixiCanvas.style.top = '0';
    pixiCanvas.style.left = '0';
    pixiCanvas.style.zIndex = '1';
    pixiCanvas.style.display = 'block';
    pixiCanvas.style.opacity = '1';
    pixiCanvas.style.visibility = 'visible';
    parentElement.appendChild(pixiCanvas);

    // Report rendering state once so a broken canvas layout can be diagnosed
    // from the console (a fully working app logs a sized, visible canvas).
    console.info(
      '[mpt] stage canvas:',
      pixiCanvas.width,
      'x',
      pixiCanvas.height,
      'buffer |',
      pixiCanvas.style.width,
      'x',
      pixiCanvas.style.height,
      'style | display:',
      getComputedStyle(pixiCanvas).display,
      '| rect:',
      JSON.stringify(pixiCanvas.getBoundingClientRect())
    );

    // Add background graphics
    this.app.stage.addChild(this.bgGraphics);
    this.drawDefaultBackground(this.currentBgColorHex);

    // The world layer holds everything the stop-motion camera zoom affects
    // (puppets, theremin orbs, chain prop). Backgrounds stay on the stage so
    // zooming in never reveals gaps at the screen edges.
    this.app.stage.addChild(this.worldContainer);

    // Add puppet containers
    this.worldContainer.addChild(this.leftPuppet.container);
    this.worldContainer.addChild(this.rightPuppet.container);

    // Add Theremin container
    this.thereminContainer.addChild(this.leftThereminOrb);
    this.thereminContainer.addChild(this.rightThereminOrb);
    this.thereminContainer.addChild(this.leftThereminText);
    this.thereminContainer.addChild(this.rightThereminText);
    this.thereminContainer.visible = false;
    this.worldContainer.addChild(this.thereminContainer);

    // Chain prop (leaves/garland) rendered on top, driven by the ticker.
    this.chainProp = new ChainProp();
    this.worldContainer.addChild(this.chainProp.getContainer());
    this.chainProp.setEnabled(false);
    this.app.ticker.add((ticker) => this.updateChain(ticker.deltaMS));
    this.app.ticker.add(() => this.updateZoom());

    // Initial position offscreen
    this.leftPuppet.container.position.set(-300, -300);
    this.rightPuppet.container.position.set(-300, -300);

    // Build default character presets
    await this.buildPuppetPreset('Left', 'fox');
    await this.buildPuppetPreset('Right', 'robot');
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    if (this.poseEditing) {
      this.app.stage.hitArea = new Rectangle(0, 0, this.width, this.height);
    }

    if (this.bgSprite && this.bgSprite.visible) {
      this.bgSprite.width = this.width;
      this.bgSprite.height = this.height;
    }
    if (this.bgTiling && this.bgTiling.visible) {
      this.bgTiling.width = this.width;
      this.bgTiling.height = this.height;
    }
    if (this.bgTilingNear && this.bgTilingNear.visible) {
      this.bgTilingNear.width = this.width;
      this.bgTilingNear.height = this.height;
    }
    const anyLayerVisible =
      (this.bgSprite?.visible ?? false) ||
      (this.bgTiling?.visible ?? false) ||
      (this.bgTilingNear?.visible ?? false);
    if (!anyLayerVisible) {
      this.drawDefaultBackground(this.currentBgColorHex);
    }
  }

  public setThereminMode(enabled: boolean): void {
    this.isThereminMode = enabled;
    this.thereminContainer.visible = enabled;

    // Completely hide puppets when Theremin mode is ON
    this.leftPuppet.container.visible = !enabled;
    this.rightPuppet.container.visible = !enabled;
  }

  /**
   * Locks all puppet movement (also honored by the hand simulator, which
   * drives the puppets directly). Frozen puppets keep their pose and the
   * last hand state stays stale so Theremin also holds its note.
   */
  public setFrozen(frozen: boolean): void {
    this.isFrozen = frozen;
  }

  /**
   * Toggles whether the hands drive the puppets. Turning it off freezes the
   * puppets in place so they can be arranged manually (drag) and snapped with
   * full control over the final composition - this is the stop-motion
   * "manual placement" mode.
   */
  public setHandFollowEnabled(enabled: boolean): void {
    this.handFollowEnabled = enabled;
  }

  public isHandFollowEnabled(): boolean {
    return this.handFollowEnabled;
  }

  /** Shows/hides the chain prop (garland of leaves) attached to the hand. */
  public setChainPropEnabled(enabled: boolean): void {
    if (this.chainProp) {
      const anchor = this.lastLeftState?.smoothedPosition ?? this.lastRightState?.smoothedPosition;
      this.chainProp.setEnabled(enabled, anchor?.x ?? this.width / 2, anchor?.y ?? 40);
    }
  }

  public isChainPropEnabled(): boolean {
    return this.chainProp?.isEnabled() ?? false;
  }

  private updateChain(dtMs: number): void {
    if (!this.chainProp?.isEnabled()) return;
    const anchor = this.lastLeftState?.smoothedPosition ?? this.lastRightState?.smoothedPosition;
    if (!anchor) return;
    this.chainProp.update(dtMs, anchor.x, anchor.y);
  }

  /**
   * Smoothly eases the world layer toward the zoom target set by the
   * stop-motion middle-finger gesture. Zooming pivots around the stage center,
   * so the puppets magnify in place like a real camera dolly-in.
   */
  public setZoomTarget(target: number): void {
    this.targetZoom = clamp(target, 1, 1.8);
  }

  private updateZoom(): void {
    const delta = this.targetZoom - this.zoom;
    if (Math.abs(delta) < 0.0005) {
      this.zoom = this.targetZoom;
    } else {
      this.zoom += delta * 0.08;
    }
    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.pivot.set(this.width / 2, this.height / 2);
    this.worldContainer.position.set(this.width / 2, this.height / 2);
  }

  /**
   * Enables/disables manual pose editing (stop-motion fine-tuning). When
   * enabled, rig parts marked movable in their config can be dragged with the
   * mouse: arms/legs/head rotate around their joint pivot, the body moves the
   * whole puppet. While a part is being dragged the auto pose update for that
   * puppet is suspended so the drag is never overwritten by hand input.
   */
  /**
   * Hide/show the edit handles (called around snapFrame so the rings never
   * appear in a captured frame).
   */
  public setEditHandlesVisible(visible: boolean): void {
    this.handlesVisible = visible;
    for (const puppet of [this.leftPuppet, this.rightPuppet]) {
      if (puppet.editHandles) puppet.editHandles.visible = visible && this.poseEditing;
    }
  }

  public setPoseEditing(enabled: boolean): void {
    this.poseEditing = enabled;
    this.dragInfo.clear();
    this.endDrag();

    for (const puppet of [this.leftPuppet, this.rightPuppet]) {
      this.setupPoseEditingForPuppet(puppet, enabled);
    }

    // Full-stage hit area so pointer events keep firing while the cursor moves
    // off a small handle. Without this, drag often dies after a few pixels.
    this.app.stage.eventMode = enabled ? 'static' : 'auto';
    this.app.stage.hitArea = enabled ? new Rectangle(0, 0, this.width, this.height) : null;
    this.app.stage.interactiveChildren = true;

    if (enabled) {
      this.app.stage.on('pointermove', this.onStagePointerMove);
      this.app.stage.on('pointerup', this.onStagePointerUp);
      this.app.stage.on('pointerupoutside', this.onStagePointerUp);
      // Window listeners keep the drag alive even if the pointer leaves the canvas.
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      // Wheel over a handle = fine limb rotation (DOM wheel is more reliable than Pixi).
      (this.app.canvas as HTMLCanvasElement).addEventListener('wheel', this.onCanvasWheel, { passive: false });
    } else {
      this.app.stage.off('pointermove', this.onStagePointerMove);
      this.app.stage.off('pointerup', this.onStagePointerUp);
      this.app.stage.off('pointerupoutside', this.onStagePointerUp);
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
      (this.app.canvas as HTMLCanvasElement).removeEventListener('wheel', this.onCanvasWheel);
      this.hoveredHandle = null;
    }
  }

  /** Builds (or tears down) the visible grab-handle overlay for one puppet. */
  private setupPoseEditingForPuppet(puppet: DynamicPuppet, enabled: boolean): void {
    if (puppet.editHandles) {
      puppet.editHandles.destroy({ children: true });
      puppet.editHandles = undefined;
      puppet.handleByPart = undefined;
    }
    if (!enabled || puppet.preset === 'none') return;

    const handles = new Container();
    handles.eventMode = 'static';
    handles.interactiveChildren = true;
    const byPart: Partial<Record<RigPartKey, Graphics>> = {};

    const parts: RigPartKey[] = puppet.rig
      ? (['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as RigPartKey[]).filter((p) => {
          if (p === 'body') return true;
          if (p === 'head') return !!puppet.rig!.parts.headSprite && !!puppet.rig!.config.parts.head?.movable;
          if (p === 'leftArm') return !!puppet.rig!.config.parts.leftArm.movable;
          if (p === 'rightArm') return !!puppet.rig!.config.parts.rightArm.movable;
          if (p === 'leftLeg') return !!puppet.rig!.parts.leftLegSprite && !!puppet.rig!.config.parts.leftLeg?.movable;
          if (p === 'rightLeg') return !!puppet.rig!.parts.rightLegSprite && !!puppet.rig!.config.parts.rightLeg?.movable;
          return false;
        })
      : puppet.preset === 'custom'
        ? (['body'] as RigPartKey[])
        : (['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as RigPartKey[]);

    for (const part of parts) {
      const g = this.makeHandle(part === 'body' ? 0x58a6ff : 0x7ee787);
      this.dragInfo.set(g, { puppet, part });
      g.on('pointerdown', this.onHandlePointerDown);
      g.on('pointerover', this.onHandlePointerOver);
      g.on('pointerout', this.onHandlePointerOut);
      handles.addChild(g);
      byPart[part] = g;
    }

    puppet.editHandles = handles;
    puppet.handleByPart = byPart;
    // Topmost so handles always win hit-tests over the puppet sprites.
    puppet.container.addChild(handles);
    handles.visible = this.handlesVisible;
    this.layoutHandles(puppet);
  }

  private makeHandle(color: number): Graphics {
    const g = new Graphics();
    g.circle(0, 0, HANDLE_R).fill({ color, alpha: 0.85 }).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
    g.eventMode = 'static';
    g.cursor = 'grab';
    g.hitArea = new Rectangle(-HANDLE_R - 4, -HANDLE_R - 4, (HANDLE_R + 4) * 2, (HANDLE_R + 4) * 2);
    return g;
  }

  /** Places each handle at the current joint / body / limb endpoint. */
  private layoutHandles(puppet: DynamicPuppet): void {
    const by = puppet.handleByPart;
    if (!by) return;

    if (by.body) by.body.position.set(0, 0);

    if (puppet.rig) {
      const { parts, config } = puppet.rig;
      const bw = parts.bodySprite.texture.width;
      const bh = parts.bodySprite.texture.height;
      if (by.head && parts.headContainer) {
        by.head.position.copyFrom(parts.headContainer.position);
      }
      if (by.leftArm) {
        const s = config.body.shoulderL;
        by.leftArm.position.set(s.x - bw / 2, s.y - bh / 2);
      }
      if (by.rightArm) {
        const s = config.body.shoulderR;
        by.rightArm.position.set(s.x - bw / 2, s.y - bh / 2);
      }
      if (by.leftLeg && parts.leftLegContainer) {
        by.leftLeg.position.copyFrom(parts.leftLegContainer.position);
      } else if (by.leftLeg) {
        const hip = config.body.hipL ?? { x: bw * 0.38, y: bh * 0.85 };
        by.leftLeg.position.set(hip.x - bw / 2, hip.y - bh / 2);
      }
      if (by.rightLeg && parts.rightLegContainer) {
        by.rightLeg.position.copyFrom(parts.rightLegContainer.position);
      } else if (by.rightLeg) {
        const hip = config.body.hipR ?? { x: bw * 0.62, y: bh * 0.85 };
        by.rightLeg.position.set(hip.x - bw / 2, hip.y - bh / 2);
      }
      return;
    }

    // Procedural: body center, head center, limb endpoints from manual/hand pose.
    if (by.head) by.head.position.copyFrom(puppet.headContainer.position);
    const state = this.getLastHandStateForPuppet(puppet);
    const manual = puppet.manualPose ?? {};
    const spread = state ? spreadFactor(state.fingerSplay) : 1;
    const end = (part: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'): Point2D => {
      if (manual[part]) return manual[part]!;
      if (state) return { x: state.limbs[part].x * spread, y: state.limbs[part].y * spread };
      if (part === 'leftArm') return { x: -60, y: 10 };
      if (part === 'rightArm') return { x: 60, y: 10 };
      if (part === 'leftLeg') return { x: -22, y: 62 };
      return { x: 22, y: 62 };
    };
    if (by.leftArm) by.leftArm.position.set(end('leftArm').x, end('leftArm').y);
    if (by.rightArm) by.rightArm.position.set(end('rightArm').x, end('rightArm').y);
    if (by.leftLeg) by.leftLeg.position.set(end('leftLeg').x, end('leftLeg').y);
    if (by.rightLeg) by.rightLeg.position.set(end('rightLeg').x, end('rightLeg').y);
  }

  /** Re-poses and rebuilds handles for a puppet that was just (re)built while
   * pose editing is active. */
  private refreshPosedPuppet(puppet: DynamicPuppet): void {
    const state = this.getLastHandStateForPuppet(puppet);
    if (state) {
      this.updateHandState(state, true);
    } else {
      this.posePuppetNeutral(puppet, this.width * 0.35, this.height * 0.62);
    }
    if (this.poseEditing) this.setupPoseEditingForPuppet(puppet, true);
  }

  private onHandlePointerDown = (e: FederatedPointerEvent): void => {
    if (!this.poseEditing) return;
    e.stopPropagation();
    const target = e.currentTarget as Container;
    const info = this.dragInfo.get(target);
    if (!info) return;

    const puppet = info.puppet;
    const global = { x: e.global.x, y: e.global.y };
    this.activeDrag = {
      puppet,
      part: info.part,
      startPointer: global,
      startRotation: 0,
      startContainerPos: { x: puppet.container.position.x, y: puppet.container.position.y },
      jointGlobal: { x: 0, y: 0 },
      procedural: !puppet.rig,
    };
    if (target instanceof Graphics) target.cursor = 'grabbing';
  };

  private onHandlePointerOver = (e: FederatedPointerEvent): void => {
    const target = e.currentTarget as Container;
    const info = this.dragInfo.get(target);
    if (info) this.hoveredHandle = info;
  };

  private onHandlePointerOut = (e: FederatedPointerEvent): void => {
    const target = e.currentTarget as Container;
    const info = this.dragInfo.get(target);
    if (info && this.hoveredHandle === info) this.hoveredHandle = null;
  };

  /**
   * Fine limb rotation via the mouse wheel while hovering a green handle.
   * Body handle is ignored (move is drag-only). Step is small (~2.3°) for
   * precise stop-motion posing.
   */
  private onCanvasWheel = (e: WheelEvent): void => {
    if (!this.poseEditing || !this.hoveredHandle) return;
    const { puppet, part } = this.hoveredHandle;
    if (part === 'body') return;
    e.preventDefault();

    // Normalize delta across mice/trackpads; negative = rotate clockwise-ish.
    const steps = Math.sign(e.deltaY) || (e.deltaX ? Math.sign(e.deltaX) : 0);
    if (steps === 0) return;
    const delta = steps * 0.04;

    if (puppet.rig) {
      const { parts, config } = puppet.rig;
      if (part === 'head' && parts.headContainer) {
        parts.headContainer.position.y += steps * 2;
        if (puppet.handleByPart?.head) puppet.handleByPart.head.position.copyFrom(parts.headContainer.position);
        return;
      }
      const sprite =
        part === 'leftArm'
          ? parts.leftArmSprite
          : part === 'rightArm'
            ? parts.rightArmSprite
            : part === 'leftLeg'
              ? parts.leftLegSprite
              : parts.rightLegSprite;
      if (!sprite) return;
      const rest =
        part === 'leftArm'
          ? config.leftArm.restHandAngle
          : part === 'rightArm'
            ? config.rightArm.restHandAngle
            : part === 'leftLeg'
              ? (config.leftLeg?.restAngle ?? 0) + Math.PI / 2
              : (config.rightLeg?.restAngle ?? 0) + Math.PI / 2;
      const next = sprite.rotation + delta;
      const lo = rest - puppet.rig.maxArmDelta;
      const hi = rest + puppet.rig.maxArmDelta;
      sprite.rotation = Math.max(lo, Math.min(hi, next));
      return;
    }

    // Procedural: rotate the limb endpoint around the joint origin.
    if (part === 'head') {
      puppet.headContainer.position.y += steps * 2;
      if (!puppet.manualPose) puppet.manualPose = {};
      puppet.manualPose.head = { x: puppet.headContainer.position.x, y: puppet.headContainer.position.y };
      if (puppet.handleByPart?.head) puppet.handleByPart.head.position.copyFrom(puppet.headContainer.position);
      return;
    }
    if (part !== 'leftArm' && part !== 'rightArm' && part !== 'leftLeg' && part !== 'rightLeg') return;
    if (!puppet.manualPose) puppet.manualPose = {};
    const cur = puppet.manualPose[part] ?? this.defaultLimbEnd(part);
    const ox = part.endsWith('Arm') ? (part === 'leftArm' ? -25 : 25) : part === 'leftLeg' ? -20 : 20;
    const oy = part.endsWith('Arm') ? -10 : 30;
    const dx = cur.x - ox;
    const dy = cur.y - oy;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx) + delta;
    puppet.manualPose[part] = { x: ox + Math.cos(ang) * len, y: oy + Math.sin(ang) * len };
    this.renderProceduralPuppet(puppet);
    const h = puppet.handleByPart?.[part];
    if (h) h.position.set(puppet.manualPose[part]!.x, puppet.manualPose[part]!.y);
  };

  private defaultLimbEnd(part: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'): Point2D {
    if (part === 'leftArm') return { x: -60, y: 10 };
    if (part === 'rightArm') return { x: 60, y: 10 };
    if (part === 'leftLeg') return { x: -22, y: 62 };
    return { x: 22, y: 62 };
  }

  private globalFromEvent(e: FederatedPointerEvent | PointerEvent): Point2D {
    if ('global' in e && e.global) return { x: e.global.x, y: e.global.y };
    // Window pointer events: convert client coords into Pixi global space.
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const pe = e as PointerEvent;
    const sx = (pe.clientX - rect.left) * (this.width / Math.max(1, rect.width));
    const sy = (pe.clientY - rect.top) * (this.height / Math.max(1, rect.height));
    return { x: sx, y: sy };
  }

  private onStagePointerMove = (e: FederatedPointerEvent): void => {
    this.applyDragAt(this.globalFromEvent(e));
  };

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (!this.activeDrag) return;
    this.applyDragAt(this.globalFromEvent(e));
  };

  private onStagePointerUp = (): void => {
    this.endDrag();
  };

  private onWindowPointerUp = (): void => {
    this.endDrag();
  };

  private applyDragAt(global: Point2D): void {
    const drag = this.activeDrag;
    if (!drag) return;
    const puppet = drag.puppet;

    if (drag.part === 'body') {
      const startWorld = this.worldContainer.toLocal({ x: drag.startPointer.x, y: drag.startPointer.y });
      const nowWorld = this.worldContainer.toLocal({ x: global.x, y: global.y });
      puppet.container.position.set(
        drag.startContainerPos.x + (nowWorld.x - startWorld.x),
        drag.startContainerPos.y + (nowWorld.y - startWorld.y)
      );
      return;
    }

    if (puppet.rig) {
      const { config, parts } = puppet.rig;
      if (drag.part === 'head') {
        if (parts.headContainer) {
          const headPos = puppet.container.toLocal({ x: global.x, y: global.y });
          parts.headContainer.position.set(headPos.x, headPos.y);
          if (puppet.handleByPart?.head) puppet.handleByPart.head.position.copyFrom(parts.headContainer.position);
        }
        return;
      }
      const jointContainer =
        drag.part === 'leftArm'
          ? parts.leftArmContainer
          : drag.part === 'rightArm'
            ? parts.rightArmContainer
            : drag.part === 'leftLeg'
              ? parts.leftLegContainer
              : parts.rightLegContainer;
      const sprite =
        drag.part === 'leftArm'
          ? parts.leftArmSprite
          : drag.part === 'rightArm'
            ? parts.rightArmSprite
            : drag.part === 'leftLeg'
              ? parts.leftLegSprite
              : parts.rightLegSprite;
      if (!jointContainer || !sprite) return;
      const local = jointContainer.toLocal({ x: global.x, y: global.y });
      const rest =
        drag.part === 'leftArm'
          ? config.leftArm.restHandAngle
          : drag.part === 'rightArm'
            ? config.rightArm.restHandAngle
            : drag.part === 'leftLeg'
              ? (config.leftLeg?.restAngle ?? 0) + Math.PI / 2
              : (config.rightLeg?.restAngle ?? 0) + Math.PI / 2;
      sprite.rotation = armRotation(local, rest, puppet.rig.maxArmDelta);
      return;
    }

    // Procedural / custom PNG
    const local = puppet.container.toLocal({ x: global.x, y: global.y });
    if (!puppet.manualPose) puppet.manualPose = {};
    if (drag.part === 'head') {
      puppet.headContainer.position.set(local.x, local.y);
      puppet.manualPose.head = { x: local.x, y: local.y };
      if (puppet.handleByPart?.head) puppet.handleByPart.head.position.set(local.x, local.y);
      return;
    }
    if (drag.part === 'leftArm' || drag.part === 'rightArm' || drag.part === 'leftLeg' || drag.part === 'rightLeg') {
      puppet.manualPose[drag.part] = { x: local.x, y: local.y };
      this.renderProceduralPuppet(puppet);
      const h = puppet.handleByPart?.[drag.part];
      if (h) h.position.set(local.x, local.y);
    }
  }

  private endDrag(): void {
    this.activeDrag = null;
  }

  /** Redraws a procedural puppet using its manual mouse overrides for any part
   * that has been dragged, keeping every other part at the stored hand pose. */
  private renderProceduralPuppet(puppet: DynamicPuppet): void {
    if (puppet.rig || puppet.preset === 'custom' || puppet.preset === 'none') return;
    const state = this.getLastHandStateForPuppet(puppet);
    if (!state) return;
    const manual = puppet.manualPose ?? {};
    const limbColor = this.getPrimaryColorForPreset(puppet.preset);
    const strokeColor = this.getSecondaryColorForPreset(puppet.preset);
    const spread = spreadFactor(state.fingerSplay);
    this.drawProceduralLimbs(puppet, state, manual, spread, limbColor, strokeColor);
    const head = manual.head ?? state.limbs.head;
    puppet.headContainer.position.set(head.x, head.y);
  }

  private getLastHandStateForPuppet(puppet: DynamicPuppet): HandState | undefined {
    return puppet === this.leftPuppet ? this.lastLeftState : this.lastRightState;
  }

  /** Draws the four articulated limbs of a procedural puppet. `manual` holds
   * mouse-dragged endpoints, which are drawn at their exact position (spread
   * ignored); everything else follows the hand pose scaled by `spread`. */
  private drawProceduralLimbs(
    puppet: DynamicPuppet,
    state: HandState,
    manual: NonNullable<DynamicPuppet['manualPose']>,
    spread: number,
    limbColor: number,
    strokeColor: number
  ): void {
    const end = (part: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'): Point2D =>
      manual[part] ?? { x: state.limbs[part].x * spread, y: state.limbs[part].y * spread };

    // Left Arm (driven by Thumb)
    const la = end('leftArm');
    puppet.leftArm.clear();
    puppet.leftArm
      .moveTo(-25, -10)
      .lineTo(la.x, la.y)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(la.x, la.y, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Arm (driven by Middle Finger)
    const ra = end('rightArm');
    puppet.rightArm.clear();
    puppet.rightArm
      .moveTo(25, -10)
      .lineTo(ra.x, ra.y)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(ra.x, ra.y, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Left Leg (driven by Ring Finger)
    const ll = end('leftLeg');
    puppet.leftLeg.clear();
    puppet.leftLeg
      .moveTo(-20, 30)
      .lineTo(ll.x, ll.y)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(ll.x - 5, ll.y + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Leg (driven by Pinky Finger)
    const rl = end('rightLeg');
    puppet.rightLeg.clear();
    puppet.rightLeg
      .moveTo(20, 30)
      .lineTo(rl.x, rl.y)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(rl.x + 5, rl.y + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });
  }

  public updateThereminVisuals(
    leftHandState?: HandState,
    rightHandState?: HandState,
    frequency: number = 440,
    volumeRatio: number = 0.5
  ): void {
    if (!this.isThereminMode) return;

    this.animFrameCounter++;
    const pulsePhase = Math.sin(this.animFrameCounter * 0.15) * 8;

    // 1. Left Hand - Pitch Orb (Glowing Cyan/Blue)
    if (leftHandState) {
      const pos = leftHandState.smoothedPosition;
      this.leftThereminOrb.clear();

      // Outer Pulsing Aura
      const auraRadius = 45 + pulsePhase + (frequency / 800) * 15;
      this.leftThereminOrb.circle(pos.x, pos.y, auraRadius).fill({ color: 0x38bdf8, alpha: 0.25 });

      // Inner Core
      this.leftThereminOrb.circle(pos.x, pos.y, 28).fill(0x0284c7).stroke({ width: 4, color: 0xe0f2fe });

      this.leftThereminText.text = `${Math.round(frequency)} Hz`;
      this.leftThereminText.position.set(pos.x - 40, pos.y - 65);
      this.leftThereminText.visible = true;
    } else {
      this.leftThereminOrb.clear();
      this.leftThereminText.visible = false;
    }

    // 2. Right Hand - Volume Orb (Glowing Magenta/Pink)
    if (rightHandState) {
      const pos = rightHandState.smoothedPosition;
      this.rightThereminOrb.clear();

      // Outer Pulsing Aura proportional to volume
      const auraRadius = 35 + volumeRatio * 35 + pulsePhase;
      this.rightThereminOrb.circle(pos.x, pos.y, auraRadius).fill({ color: 0xf43f5e, alpha: 0.3 });

      // Inner Core
      this.rightThereminOrb.circle(pos.x, pos.y, 28).fill(0xe11d48).stroke({ width: 4, color: 0xffe4e6 });

      this.rightThereminText.text = `${Math.round(volumeRatio * 100)} %`;
      this.rightThereminText.position.set(pos.x - 45, pos.y - 65);
      this.rightThereminText.visible = true;
    } else {
      this.rightThereminOrb.clear();
      this.rightThereminText.visible = false;
    }
  }

  public setBackgroundColor(colorHex: number): void {
    this.currentBgColorHex = colorHex;
    if (this.bgSprite) {
      this.bgSprite.visible = false;
    }
    if (this.bgTiling) {
      this.bgTiling.visible = false;
    }
    if (this.bgTilingNear) {
      this.bgTilingNear.visible = false;
    }
    this.drawDefaultBackground(colorHex);
  }

  /**
   * Shows a long horizontal background image as a pan-able strip (TilingSprite
   * so it scrolls seamlessly). Only a viewport window of the stage width is
   * visible; call `setStripOffset` to pan it left/right.
   */
  public async setStripBackground(dataUrl: string): Promise<void> {
    try {
      let texture: Texture;
      try {
        texture = await Assets.load(dataUrl);
      } catch {
        texture = Texture.from(dataUrl);
      }

      if (!this.bgTiling) {
        this.bgTiling = new TilingSprite({ texture, width: this.width, height: this.height });
        this.app.stage.addChildAt(this.bgTiling, 0);
      } else {
        this.bgTiling.texture = texture;
      }

      this.bgTiling.width = this.width;
      this.bgTiling.height = this.height;
      this.bgTiling.visible = true;
      this.bgGraphics.clear();
      if (this.bgSprite) this.bgSprite.visible = false;
      this.stripFarDataUrl = dataUrl;
      this.stripOffsetX = 0;
      this.stripOffsetY = 0;
      this.updateStripOffsets();
    } catch (err) {
      console.error('Failed to load strip background image:', err);
    }
  }

  /** Pans the visible window of the strip backgrounds in 2D (X and Y). The near
   * layer pans faster than the far layer by the parallax factor for depth. */
  public setStripOffset(offsetX: number, offsetY: number = this.stripOffsetY): void {
    this.stripOffsetX = offsetX;
    this.stripOffsetY = offsetY;
    this.updateStripOffsets();
  }

  /**
   * Sets how much faster the near (foreground) strip pans than the far strip.
   * 1.0 = locked together, >1 = near layer moves faster (depth illusion).
   */
  public setParallaxFactor(factor: number): void {
    this.stripParallaxFactor = clamp(factor, 1, 5);
    this.updateStripOffsets();
  }

  private updateStripOffsets(): void {
    if (this.bgTiling && this.bgTiling.visible) {
      this.bgTiling.tilePosition.x = -this.stripOffsetX;
      this.bgTiling.tilePosition.y = -this.stripOffsetY;
    }
    if (this.bgTilingNear && this.bgTilingNear.visible) {
      this.bgTilingNear.tilePosition.x = -this.stripOffsetX * this.stripParallaxFactor;
      this.bgTilingNear.tilePosition.y = -this.stripOffsetY * this.stripParallaxFactor;
    }
  }

  public isStripActive(): boolean {
    return (!!this.bgTiling && this.bgTiling.visible) || (!!this.bgTilingNear && this.bgTilingNear.visible);
  }

  /** Hides both strips and restores the default solid background. */
  public clearStripBackground(): void {
    if (this.bgTiling) this.bgTiling.visible = false;
    if (this.bgTilingNear) this.bgTilingNear.visible = false;
    this.drawDefaultBackground(this.currentBgColorHex);
  }

  /**
   * Adds a second, "near" background strip that pans on top of the far strip.
   * Its pan speed follows the far strip offset multiplied by the parallax
   * factor, giving the scene depth when the window is panned.
   */
  public async setForegroundStripBackground(dataUrl: string): Promise<void> {
    try {
      let texture: Texture;
      try {
        texture = await Assets.load(dataUrl);
      } catch {
        texture = Texture.from(dataUrl);
      }

      if (!this.bgTilingNear) {
        this.bgTilingNear = new TilingSprite({ texture, width: this.width, height: this.height });
        // Layer order: far strip (0), near strip (1), solid graphics (2), world (3).
        this.app.stage.addChildAt(this.bgTilingNear, 1);
      } else {
        this.bgTilingNear.texture = texture;
      }

      this.bgTilingNear.width = this.width;
      this.bgTilingNear.height = this.height;
      this.bgTilingNear.tilePosition.x = 0;
      this.bgTilingNear.visible = true;
      this.bgGraphics.clear();
      if (this.bgSprite) this.bgSprite.visible = false;
      this.stripNearDataUrl = dataUrl;
      this.updateStripOffsets();
    } catch (err) {
      console.error('Failed to load near strip background image:', err);
    }
  }

  public async setCustomBackgroundDataUrl(dataUrl: string): Promise<void> {
    try {
      this.bgGraphics.clear();

      let texture: Texture;
      try {
        texture = await Assets.load(dataUrl);
      } catch {
        texture = Texture.from(dataUrl);
      }

      if (!this.bgSprite) {
        this.bgSprite = new Sprite(texture);
        this.app.stage.addChildAt(this.bgSprite, 0);
      } else {
        this.bgSprite.texture = texture;
      }

      this.bgSprite.width = this.width;
      this.bgSprite.height = this.height;
      this.bgSprite.visible = true;
      this.customBgDataUrl = dataUrl;
    } catch (err) {
      console.error('Failed to load custom background image:', err);
    }
  }

  public getBackgroundAssets(): { stripFarDataUrl?: string; stripNearDataUrl?: string; customBgDataUrl?: string } {
    return {
      stripFarDataUrl: this.stripFarDataUrl,
      stripNearDataUrl: this.stripNearDataUrl,
      customBgDataUrl: this.customBgDataUrl,
    };
  }

  /** Captures the exact pose state of both puppets and the background for timeline history / editing. */
  public capturePoseSnapshot(): StagePoseSnapshot {
    const capturePuppet = (puppet: DynamicPuppet): PuppetPoseSnapshot => {
      const snap: PuppetPoseSnapshot = {
        preset: puppet.preset,
        position: { x: puppet.container.position.x, y: puppet.container.position.y },
        rotation: puppet.container.rotation,
        manualPose: puppet.manualPose ? { ...puppet.manualPose } : undefined,
      };
      if (puppet.rig) {
        const { parts } = puppet.rig;
        snap.rigRotations = {
          leftArm: parts.leftArmSprite.rotation,
          rightArm: parts.rightArmSprite.rotation,
          leftLeg: parts.leftLegSprite?.rotation,
          rightLeg: parts.rightLegSprite?.rotation,
        };
        if (parts.headContainer) {
          snap.headPosition = { x: parts.headContainer.position.x, y: parts.headContainer.position.y };
        }
      }
      return snap;
    };

    return {
      leftPuppet: capturePuppet(this.leftPuppet),
      rightPuppet: capturePuppet(this.rightPuppet),
      background: {
        colorHex: this.currentBgColorHex,
        stripActive: !!(this.bgTiling && this.bgTiling.visible),
        stripNearActive: !!(this.bgTilingNear && this.bgTilingNear.visible),
        stripOffsetX: this.stripOffsetX,
        stripOffsetY: this.stripOffsetY,
        stripParallaxFactor: this.stripParallaxFactor,
      },
    };
  }

  /** Restores the exact pose of both puppets and background from a snapshot. */
  public async applyPoseSnapshot(snapshot: StagePoseSnapshot): Promise<void> {
    const applyPuppet = async (puppet: DynamicPuppet, snap: PuppetPoseSnapshot, handType: 'Left' | 'Right'): Promise<void> => {
      if (puppet.preset !== snap.preset) {
        await this.buildPuppetPreset(handType, snap.preset);
      }
      puppet.container.position.set(snap.position.x, snap.position.y);
      puppet.container.rotation = snap.rotation;
      puppet.manualPose = snap.manualPose ? { ...snap.manualPose } : undefined;

      if (puppet.rig) {
        const { parts } = puppet.rig;
        if (snap.rigRotations) {
          if (snap.rigRotations.leftArm !== undefined) parts.leftArmSprite.rotation = snap.rigRotations.leftArm;
          if (snap.rigRotations.rightArm !== undefined) parts.rightArmSprite.rotation = snap.rigRotations.rightArm;
          if (parts.leftLegSprite && snap.rigRotations.leftLeg !== undefined) parts.leftLegSprite.rotation = snap.rigRotations.leftLeg;
          if (parts.rightLegSprite && snap.rigRotations.rightLeg !== undefined) parts.rightLegSprite.rotation = snap.rigRotations.rightLeg;
        }
        if (parts.headContainer && snap.headPosition) {
          parts.headContainer.position.set(snap.headPosition.x, snap.headPosition.y);
        }
      } else if (puppet.preset !== 'none' && puppet.preset !== 'custom') {
        this.renderProceduralPuppet(puppet);
      }

      if (this.poseEditing) this.layoutHandles(puppet);
    };

    await applyPuppet(this.leftPuppet, snapshot.leftPuppet, 'Left');
    await applyPuppet(this.rightPuppet, snapshot.rightPuppet, 'Right');

    const bg = snapshot.background;
    this.currentBgColorHex = bg.colorHex;
    if (this.bgTiling) this.bgTiling.visible = bg.stripActive;
    if (this.bgTilingNear) this.bgTilingNear.visible = bg.stripNearActive;
    if (!bg.stripActive && !bg.stripNearActive && !this.bgSprite?.visible) {
      this.drawDefaultBackground(bg.colorHex);
    }
    this.stripParallaxFactor = bg.stripParallaxFactor;
    this.setStripOffset(bg.stripOffsetX, bg.stripOffsetY);
  }

  public updateHandState(state: HandState, force = false): void {
    const isLeft = state.handType === 'Left';
    const puppet = isLeft ? this.leftPuppet : this.rightPuppet;

    if (!puppet.container) return;

    // force=true is used for synthetic resting poses (stop-motion entry /
    // puppet rebuild) so the puppet still poses when Ruka is off.
    if (!force && (this.isFrozen || !this.handFollowEnabled)) return;

    // A live mouse drag on this puppet must win over the hand frame.
    if (this.activeDrag && this.activeDrag.puppet === puppet) return;

    if (isLeft) this.lastLeftState = state;
    else this.lastRightState = state;

    // Empty slot: keep hand tracking for other features but don't move a puppet.
    if (puppet.preset === 'none') return;

    // Smooth position update for Torso center
    puppet.container.position.set(state.smoothedPosition.x, state.smoothedPosition.y);
    // Handles stay glued to joints/endpoints while the hand drives the pose.
    if (this.poseEditing) this.layoutHandles(puppet);

    // Mild in-plane rotation (hand upright = 0), damped + EMA smoothed.
    const targetRot = state.rotation - ROT_BASE;
    const prevRot = puppet.lastRotation ?? targetRot;
    puppet.lastRotation = prevRot + shortestAngleDelta(prevRot, targetRot) * ROT_ALPHA;
    puppet.container.rotation = puppet.lastRotation * ROT_DAMP;

    // Cut-out rig: move body with the palm, swing movable parts around their joints.
    if (puppet.rig) {
      // While a part of this puppet is being dragged manually, the auto pose
      // update must not overwrite the drag.
      if (this.activeDrag && this.activeDrag.puppet === puppet) return;

      const { config, parts, maxArmDelta } = puppet.rig;
      const bw = parts.bodySprite.texture.width;
      const bh = parts.bodySprite.texture.height;

      const shoulderL = config.body.shoulderL;
      const shoulderR = config.body.shoulderR;
      parts.leftArmContainer.position.set(shoulderL.x - bw / 2, shoulderL.y - bh / 2);
      parts.rightArmContainer.position.set(shoulderR.x - bw / 2, shoulderR.y - bh / 2);

      const restL = config.leftArm.restHandAngle;
      const restR = config.rightArm.restHandAngle;
      // Finger splay amplifies the swing range (fist = tucks in, spread = wide).
      const spread = spreadFactor(state.fingerSplay);
      const armRotL = armRotation(state.limbs.leftArm, restL, maxArmDelta);
      const armRotR = armRotation(state.limbs.rightArm, restR, maxArmDelta);
      const deltaL = clamp((armRotL - restL) * spread, -maxArmDelta, maxArmDelta);
      const deltaR = clamp((armRotR - restR) * spread, -maxArmDelta, maxArmDelta);

      if (config.parts.leftArm.movable) parts.leftArmSprite.rotation = restL + deltaL;
      if (config.parts.rightArm.movable) parts.rightArmSprite.rotation = restR + deltaR;

      // Legs swing opposite to the same-side arm for a walking look, plus an
      // A-frame stance when the fingers are spread (spread palms = split).
      if (parts.leftLegContainer && config.leftLeg && parts.leftLegSprite) {
        const hipL = config.body.hipL ?? { x: bw * 0.38, y: bh * 0.85 };
        parts.leftLegContainer.position.set(hipL.x - bw / 2, hipL.y - bh / 2);
        if (config.parts.leftLeg?.movable) {
          parts.leftLegSprite.rotation = config.leftLeg.restAngle - 0.5 * deltaL - 0.35 * state.fingerSplay;
        }
      }
      if (parts.rightLegContainer && config.rightLeg && parts.rightLegSprite) {
        const hipR = config.body.hipR ?? { x: bw * 0.62, y: bh * 0.85 };
        parts.rightLegContainer.position.set(hipR.x - bw / 2, hipR.y - bh / 2);
        if (config.parts.rightLeg?.movable) {
          parts.rightLegSprite.rotation = config.rightLeg.restAngle - 0.5 * deltaR + 0.35 * state.fingerSplay;
        }
      }

      // Head bobs with the average arm swing when movable.
      if (parts.headContainer && parts.headSprite && config.parts.head) {
        const neck = config.body.neck ?? { x: bw * 0.5, y: bh * 0.2 };
        parts.headContainer.position.set(neck.x - bw / 2, neck.y - bh / 2);
        if (config.parts.head.movable) {
          const avgDelta = (deltaL + deltaR) / 2;
          const bob = (config.head?.bob ?? 1) * 0.03 * parts.headSprite.texture.height;
          parts.headContainer.position.y -= bob * avgDelta;
        }
      }
      return;
    }

    if (puppet.preset === 'custom' && puppet.customSpriteClosed && puppet.customSpriteOpen) {
      puppet.customSpriteClosed.visible = state.isPinching;
      puppet.customSpriteOpen.visible = !state.isPinching;
      return;
    }

    // 1. Position Head based on Index Finger movement
    // A manual mouse drag must win over the live hand while it is active, and
    // a real hand frame clears the manual overrides so the hands drive the
    // puppet again (unless hand-follow is switched off entirely).
    if (this.activeDrag && this.activeDrag.puppet === puppet) return;
    puppet.manualPose = undefined;
    const manual: NonNullable<DynamicPuppet['manualPose']> = {};
    const headPos = manual.head ?? state.limbs.head;
    puppet.headContainer.position.set(headPos.x, headPos.y);

    // 2. Animate Jaw / Mouth opening directly driven by index finger bending
    puppet.jaw.position.y = state.mouthOpenRatio * 28;

    // 3. Update Articulated Limbs (Arms & Legs) in real time
    const limbColor = this.getPrimaryColorForPreset(puppet.preset);
    const strokeColor = this.getSecondaryColorForPreset(puppet.preset);

    // Finger splay stretches the limbs outward (open palm) or tucks them in (fist).
    const spread = spreadFactor(state.fingerSplay);
    this.drawProceduralLimbs(puppet, state, manual, spread, limbColor, strokeColor);
  }

  public hideHand(handType: 'Left' | 'Right'): void {
    // Manual-placement mode: a running camera must not be able to move or
    // hide a puppet the user has arranged by hand (it would also make the
    // "nothing stays where I put it" symptom even with the stage visible).
    if (!this.handFollowEnabled) return;
    const puppet = handType === 'Left' ? this.leftPuppet : this.rightPuppet;
    puppet.container.position.set(-500, -500);
    if (handType === 'Left') this.lastLeftState = undefined;
    else this.lastRightState = undefined;
  }

  public getLastHandState(handType: 'Left' | 'Right'): HandState | undefined {
    return handType === 'Left' ? this.lastLeftState : this.lastRightState;
  }

  /**
   * Places puppets at sensible default spots (stop-motion entry) so they are
   * visible before any hand is tracked. Only slots without live tracking and
   * with an actual puppet preset are touched, so a running camera is never
   * overridden mid-pose.
   */
  public placePuppetsAtDefaults(): void {
    if (this.leftPuppet.preset !== 'none' && !this.lastLeftState) {
      this.posePuppetNeutral(this.leftPuppet, this.width * 0.35, this.height * 0.62);
    }
    if (this.rightPuppet.preset !== 'none' && !this.lastRightState) {
      this.posePuppetNeutral(this.rightPuppet, this.width * 0.65, this.height * 0.62);
    }
  }

  /** Renders a neutral resting pose at the given position by feeding the
   * puppet a synthetic hand state, so a never-tracked puppet still shows all
   * its limbs (not just torso and head). */
  private posePuppetNeutral(puppet: DynamicPuppet, x: number, y: number): void {
    const neutral: HandState = {
      handType: 'Left',
      wristPosition: { x: 0.5, y: 0.5 },
      rawPositionPixels: { x, y },
      smoothedPosition: { x, y },
      pinchDistance: 0.1,
      isPinching: false,
      mouthOpenRatio: 0.5,
      fingerSplay: 0.5,
      fistFactor: 0,
      middleFingerFactor: 0,
      rotation: -Math.PI / 2,
      limbs: {
        head: { x: 0, y: -70 },
        leftArm: { x: -60, y: 10 },
        rightArm: { x: 60, y: 10 },
        leftLeg: { x: -22, y: 62 },
        rightLeg: { x: 22, y: 62 },
      },
    };
    if (puppet === this.leftPuppet) this.lastLeftState = neutral;
    else this.lastRightState = neutral;
    this.updateHandState(neutral, true);
  }

  public async setCustomPuppetDataUrl(handType: 'Left' | 'Right', dataUrl: string): Promise<void> {
    try {
      let texture: Texture;
      try {
        texture = await Assets.load(dataUrl);
      } catch {
        texture = Texture.from(dataUrl);
      }

      const isLeft = handType === 'Left';
      const puppet = isLeft ? this.leftPuppet : this.rightPuppet;
      puppet.preset = 'custom';
      puppet.rig = undefined;

      puppet.container.removeChildren();

      const closedSprite = new Sprite(texture);
      closedSprite.anchor.set(0.5, 0.5);
      closedSprite.width = 180;
      closedSprite.height = 180;

      const openSprite = new Sprite(texture);
      openSprite.anchor.set(0.5, 0.5);
      openSprite.width = 180;
      openSprite.height = 180;
      openSprite.visible = false;

      puppet.container.addChild(closedSprite);
      puppet.container.addChild(openSprite);

      puppet.customSpriteClosed = closedSprite;
      puppet.customSpriteOpen = openSprite;

      if (this.poseEditing) this.refreshPosedPuppet(puppet);
    } catch (err) {
      console.error('Failed to load custom puppet image:', err);
    }
  }

  public async buildPuppetPreset(
    handType: 'Left' | 'Right',
    preset: PuppetPreset,
    rigConfigOverride?: CutoutRigConfig
  ): Promise<void> {
    const isLeft = handType === 'Left';
    const puppet = isLeft ? this.leftPuppet : this.rightPuppet;
    puppet.preset = preset;
    puppet.lastRotation = undefined;

    puppet.container.removeChildren();

    // Empty slot: hide the puppet entirely so only the other hand is used.
    if (preset === 'none') {
      puppet.rig = undefined;
      puppet.container.visible = false;
      return;
    }
    puppet.container.visible = true;

    // Cut-out rig presets (historical characters) are loaded asynchronously.
    if (preset.startsWith('rig:')) {
      if (preset.startsWith('rig:local:')) {
        const localId = preset.slice('rig:local:'.length);
        const config = loadLocalCharacterConfig(localId);
        if (config) {
          await this.buildRigPuppet(puppet, localId, config);
        } else {
          console.warn(`Local rig "${localId}" not found; falling back to default puppet.`);
        }
      } else {
        await this.buildRigPuppet(puppet, preset.slice(4), rigConfigOverride);
      }
      if (this.poseEditing) this.refreshPosedPuppet(puppet);
      return;
    }

    puppet.rig = undefined;

    puppet.torso.clear();
    puppet.headGraphic.clear();
    puppet.leftEye.clear();
    puppet.rightEye.clear();
    puppet.jaw.clear();
    puppet.leftArm.clear();
    puppet.rightArm.clear();
    puppet.leftLeg.clear();
    puppet.rightLeg.clear();

    puppet.headContainer.removeChildren();

    switch (preset) {
      case 'fox':
        this.drawFoxPreset(puppet);
        break;
      case 'robot':
        this.drawRobotPreset(puppet);
        break;
      default:
        this.drawFoxPreset(puppet);
        break;
    }

    // Assembly order: Legs -> Arms -> Torso -> Head Container
    puppet.container.addChild(puppet.leftLeg);
    puppet.container.addChild(puppet.rightLeg);
    puppet.container.addChild(puppet.leftArm);
    puppet.container.addChild(puppet.rightArm);
    puppet.container.addChild(puppet.torso);

    puppet.headContainer.addChild(puppet.headGraphic);
    puppet.headContainer.addChild(puppet.jaw);
    puppet.headContainer.addChild(puppet.leftEye);
    puppet.headContainer.addChild(puppet.rightEye);

    puppet.container.addChild(puppet.headContainer);

    if (this.poseEditing) this.refreshPosedPuppet(puppet);
  }

  /**
   * Builds a sprite-based cut-out puppet from a rig config.
   * Hierarchy: puppet.container -> rigRoot (scaled) -> body + legs + head + arms.
   */
  private async buildRigPuppet(puppet: DynamicPuppet, id: string, overrideConfig?: CutoutRigConfig): Promise<void> {
    try {
      const config = overrideConfig ?? (await fetchRigConfig(id));
      const parts = await buildRigParts(config);

      const rigRoot = new Container();
      rigRoot.scale.set(config.displayScale);
      rigRoot.addChild(parts.bodySprite);
      if (parts.leftLegContainer) rigRoot.addChild(parts.leftLegContainer);
      if (parts.rightLegContainer) rigRoot.addChild(parts.rightLegContainer);
      if (parts.headContainer) rigRoot.addChild(parts.headContainer);
      rigRoot.addChild(parts.leftArmContainer);
      rigRoot.addChild(parts.rightArmContainer);
      puppet.container.addChild(rigRoot);

      puppet.rig = {
        config,
        parts,
        scale: config.displayScale,
        maxArmDelta: config.maxArmDelta ?? 2.6,
      };
    } catch (err) {
      console.error(`Failed to build rig "${id}":`, err);
      puppet.rig = undefined;
    }
  }

  private drawDefaultBackground(colorHex: number): void {
    this.bgGraphics.clear();
    this.bgGraphics.rect(0, 0, this.width, this.height);
    this.bgGraphics.fill(colorHex);
  }

  private createEmptyPuppet(preset: PuppetPreset): DynamicPuppet {
    return {
      container: new Container(),
      torso: new Graphics(),
      headContainer: new Container(),
      headGraphic: new Graphics(),
      leftEye: new Graphics(),
      rightEye: new Graphics(),
      jaw: new Graphics(),
      leftArm: new Graphics(),
      rightArm: new Graphics(),
      leftLeg: new Graphics(),
      rightLeg: new Graphics(),
      preset,
    };
  }

  private getPrimaryColorForPreset(preset: PuppetPreset): number {
    switch (preset) {
      case 'fox': return 0xed8936;
      case 'robot': return 0xc0c9d6;
      default: return 0xed8936;
    }
  }

  private getSecondaryColorForPreset(preset: PuppetPreset): number {
    switch (preset) {
      case 'fox': return 0xc05621;
      case 'robot': return 0x4a5568;
      default: return 0xc05621;
    }
  }

  // 1. Fox Preset
  private drawFoxPreset(p: DynamicPuppet): void {
    p.torso.roundRect(-30, -20, 60, 65, 18).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });
    p.torso.ellipse(0, 12, 16, 22).fill(0xffffff);

    p.headGraphic.poly([0, 40, -45, -10, 45, -10]).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });
    p.headGraphic.poly([-30, -10, -20, -50, -5, -25]).fill(0xed8936).stroke({ width: 3, color: 0xc05621 });
    p.headGraphic.poly([30, -10, 20, -50, 5, -25]).fill(0xed8936).stroke({ width: 3, color: 0xc05621 });

    p.leftEye.circle(-18, -5, 7).fill(0x1a202c);
    p.rightEye.circle(18, -5, 7).fill(0x1a202c);

    p.jaw.arc(0, 16, 14, 0, Math.PI, false).fill(0xe53e3e);
  }

  // 2. Robot Preset
  private drawRobotPreset(p: DynamicPuppet): void {
    p.torso.roundRect(-35, -20, 70, 70, 10).fill(0xc0c9d6).stroke({ width: 4, color: 0x4a5568 });
    p.torso.rect(-18, -5, 36, 25).fill(0x3182ce).stroke({ width: 2, color: 0x2d3748 });

    p.headGraphic.roundRect(-38, -35, 76, 55, 8).fill(0xc0c9d6).stroke({ width: 4, color: 0x4a5568 });
    p.headGraphic.rect(-4, -50, 8, 15).fill(0xa0aec0);
    p.headGraphic.circle(0, -53, 6).fill(0x3182ce);

    p.leftEye.rect(-25, -20, 18, 14).fill(0x3182ce);
    p.rightEye.rect(7, -20, 18, 14).fill(0x3182ce);

    p.jaw.rect(-20, 5, 40, 12).fill(0x4a5568);
  }
}
