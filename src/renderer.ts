import { Application, Container, Sprite, Graphics, Assets, Texture, Text, TextStyle, FederatedPointerEvent, TilingSprite } from 'pixi.js';
import { HandState, clamp, shortestAngleDelta, spreadFactor, Point2D } from './gestures';
import { CutoutRigConfig, armRotation } from './rig';
import { RigRenderParts, buildRigParts, fetchRigConfig, loadLocalCharacterConfig } from './rigAssets';
import { ChainProp } from './chainProp';

export type PuppetPreset = 'fox' | 'robot' | 'custom' | 'none' | `rig:${string}`;

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
  private stripOffset: number = 0;
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

  // Manual pose editing (stop-motion fine-tuning): drag rig parts directly.
  private poseEditing: boolean = false;
  private dragInfo: Map<Sprite, PartDragInfo> = new Map();
  private procDragTargets: Map<Container, PartDragInfo> = new Map();
  private activeDrag: ActiveDrag | null = null;

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

  public async initialize(parentElement: HTMLElement): Promise<void> {
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundColor: 0x1e1e2e,
      antialias: true,
      preference: 'webgl',
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
  public setPoseEditing(enabled: boolean): void {
    this.poseEditing = enabled;
    this.dragInfo.clear();

    for (const puppet of [this.leftPuppet, this.rightPuppet]) {
      if (puppet.rig) {
        const { parts, config } = puppet.rig;

        const entries: Array<{ sprite?: Sprite; part: RigPartKey; movable: boolean }> = [
          { sprite: parts.bodySprite, part: 'body', movable: true },
          { sprite: parts.leftArmSprite, part: 'leftArm', movable: !!config.parts.leftArm.movable },
          { sprite: parts.rightArmSprite, part: 'rightArm', movable: !!config.parts.rightArm.movable },
          { sprite: parts.leftLegSprite, part: 'leftLeg', movable: !!config.parts.leftLeg?.movable },
          { sprite: parts.rightLegSprite, part: 'rightLeg', movable: !!config.parts.rightLeg?.movable },
          { sprite: parts.headSprite, part: 'head', movable: !!config.parts.head?.movable },
        ];

        for (const entry of entries) {
          if (!entry.sprite) continue;
          const sprite = entry.sprite;
          sprite.eventMode = enabled && entry.movable ? 'static' : 'none';
          sprite.cursor = enabled && entry.movable ? 'pointer' : 'default';
          if (enabled) {
            this.dragInfo.set(sprite, { puppet, part: entry.part });
            sprite.on('pointerdown', this.onPartPointerDown);
          } else {
            sprite.off('pointerdown', this.onPartPointerDown);
          }
        }
        continue;
      }

      // Procedural puppets (fox/robot/custom): make every part draggable with
      // the mouse so stop-motion framing works without camera/gesture input.
      const procTargets: Array<{ target: Container; part: RigPartKey }> = [
        { target: puppet.torso, part: 'body' },
        { target: puppet.headGraphic, part: 'head' },
        { target: puppet.leftArm, part: 'leftArm' },
        { target: puppet.rightArm, part: 'rightArm' },
        { target: puppet.leftLeg, part: 'leftLeg' },
        { target: puppet.rightLeg, part: 'rightLeg' },
      ];
      if (puppet.preset === 'custom' && puppet.customSpriteClosed) {
        procTargets.push({ target: puppet.customSpriteClosed, part: 'body' });
        if (puppet.customSpriteOpen) procTargets.push({ target: puppet.customSpriteOpen, part: 'body' });
      }
      for (const { target, part } of procTargets) {
        target.eventMode = enabled ? 'static' : 'none';
        target.cursor = enabled ? 'pointer' : 'default';
        if (enabled) {
          this.procDragTargets.set(target, { puppet, part });
          target.on('pointerdown', this.onProcPartPointerDown);
        } else {
          this.procDragTargets.delete(target);
          target.off('pointerdown', this.onProcPartPointerDown);
        }
      }
    }

    if (enabled) {
      this.app.stage.eventMode = 'static';
      this.app.stage.on('pointermove', this.onStagePointerMove);
      this.app.stage.on('pointerup', this.onStagePointerUp);
      this.app.stage.on('pointerupoutside', this.onStagePointerUp);
    } else {
      this.app.stage.off('pointermove', this.onStagePointerMove);
      this.app.stage.off('pointerup', this.onStagePointerUp);
      this.app.stage.off('pointerupoutside', this.onStagePointerUp);
      this.endDrag();
    }
  }

  private onPartPointerDown = (e: FederatedPointerEvent): void => {
    if (!this.poseEditing) return;
    const sprite = e.currentTarget as Sprite;
    const info = this.dragInfo.get(sprite);
    if (!info) return;

    if (info.part === 'body') {
      this.activeDrag = {
        puppet: info.puppet,
        part: info.part,
        startPointer: { x: e.global.x, y: e.global.y },
        startRotation: 0,
        startContainerPos: { x: info.puppet.container.position.x, y: info.puppet.container.position.y },
        jointGlobal: { x: 0, y: 0 },
      };
    } else {
      const joint = sprite.getGlobalPosition();
      this.activeDrag = {
        puppet: info.puppet,
        part: info.part,
        sprite,
        startPointer: { x: e.global.x, y: e.global.y },
        startRotation: sprite.rotation,
        startContainerPos: { x: info.puppet.container.position.x, y: info.puppet.container.position.y },
        jointGlobal: { x: joint.x, y: joint.y },
      };
    }
  };

  private onProcPartPointerDown = (e: FederatedPointerEvent): void => {
    if (!this.poseEditing) return;
    const target = e.currentTarget as Container;
    const info = this.procDragTargets.get(target);
    if (!info) return;

    const puppet = info.puppet;
    const isBody = info.part === 'body';
    this.activeDrag = {
      puppet,
      part: info.part,
      startPointer: { x: e.global.x, y: e.global.y },
      startRotation: 0,
      startContainerPos: { x: puppet.container.position.x, y: puppet.container.position.y },
      jointGlobal: { x: 0, y: 0 },
      startLocal: isBody ? undefined : puppet.container.toLocal({ x: e.global.x, y: e.global.y }),
      procedural: true,
    };
  };

  private onStagePointerMove = (e: FederatedPointerEvent): void => {
    const drag = this.activeDrag;
    if (!drag) return;

    if (drag.part === 'body') {
      // Convert the pointer delta into world (zoom-corrected) space so the
      // puppet stays under the cursor even while the stage is zoomed.
      const startWorld = this.worldContainer.toLocal({ x: drag.startPointer.x, y: drag.startPointer.y });
      const nowWorld = this.worldContainer.toLocal({ x: e.global.x, y: e.global.y });
      drag.puppet.container.position.set(
        drag.startContainerPos.x + (nowWorld.x - startWorld.x),
        drag.startContainerPos.y + (nowWorld.y - startWorld.y)
      );
      return;
    }

    if (drag.procedural) {
      const puppet = drag.puppet;
      const local = puppet.container.toLocal({ x: e.global.x, y: e.global.y });
      if (!puppet.manualPose) puppet.manualPose = {};
      if (drag.part === 'head') {
        puppet.headContainer.position.set(local.x, local.y);
        puppet.manualPose.head = { x: local.x, y: local.y };
        return;
      }
      if (drag.part === 'leftArm' || drag.part === 'rightArm' || drag.part === 'leftLeg' || drag.part === 'rightLeg') {
        puppet.manualPose[drag.part] = { x: local.x, y: local.y };
        this.renderProceduralPuppet(puppet);
      }
      return;
    }

    if (!drag.sprite) return;
    const angle = Math.atan2(e.global.y - drag.jointGlobal.y, e.global.x - drag.jointGlobal.x);
    const angle0 = Math.atan2(drag.startPointer.y - drag.jointGlobal.y, drag.startPointer.x - drag.jointGlobal.x);
    drag.sprite.rotation = drag.startRotation + (angle - angle0);
  };

  private onStagePointerUp = (): void => {
    this.endDrag();
  };

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
      this.stripOffset = 0;
      this.updateStripOffsets();
    } catch (err) {
      console.error('Failed to load strip background image:', err);
    }
  }

  /** Pans the visible window(s) of the strip backgrounds. The near layer pans
   * faster than the far layer by the configured parallax factor for depth. */
  public setStripOffset(offsetX: number): void {
    this.stripOffset = offsetX;
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
      this.bgTiling.tilePosition.x = -this.stripOffset;
    }
    if (this.bgTilingNear && this.bgTilingNear.visible) {
      this.bgTilingNear.tilePosition.x = -this.stripOffset * this.stripParallaxFactor;
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
    } catch (err) {
      console.error('Failed to load custom background image:', err);
    }
  }

  public updateHandState(state: HandState): void {
    const isLeft = state.handType === 'Left';
    const puppet = isLeft ? this.leftPuppet : this.rightPuppet;

    if (!puppet.container) return;

    if (this.isFrozen || !this.handFollowEnabled) return;

    if (isLeft) this.lastLeftState = state;
    else this.lastRightState = state;

    // Empty slot: keep hand tracking for other features but don't move a puppet.
    if (puppet.preset === 'none') return;

    // Smooth position update for Torso center
    puppet.container.position.set(state.smoothedPosition.x, state.smoothedPosition.y);

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
    this.updateHandState(neutral);
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
