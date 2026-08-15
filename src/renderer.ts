import { Application, Container, Sprite, Graphics, Assets, Texture, Text, TextStyle } from 'pixi.js';
import { HandState, clamp, shortestAngleDelta, spreadFactor } from './gestures';
import { CutoutRigConfig, armRotation } from './rig';
import { RigRenderParts, buildRigParts, fetchRigConfig, loadLocalCharacterConfig } from './rigAssets';

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
  private currentBgColorHex: number = 0x2d3748;

  // Motion Freeze
  private isFrozen: boolean = false;

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();

    this.bgGraphics = new Graphics();
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

    parentElement.appendChild(this.app.canvas as HTMLCanvasElement);

    // Add background graphics
    this.app.stage.addChild(this.bgGraphics);
    this.drawDefaultBackground(this.currentBgColorHex);

    // Add puppet containers
    this.app.stage.addChild(this.leftPuppet.container);
    this.app.stage.addChild(this.rightPuppet.container);

    // Add Theremin container
    this.thereminContainer.addChild(this.leftThereminOrb);
    this.thereminContainer.addChild(this.rightThereminOrb);
    this.thereminContainer.addChild(this.leftThereminText);
    this.thereminContainer.addChild(this.rightThereminText);
    this.thereminContainer.visible = false;
    this.app.stage.addChild(this.thereminContainer);

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
    } else {
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
    this.drawDefaultBackground(colorHex);
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

    if (this.isFrozen) return;

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
    puppet.headContainer.position.set(state.limbs.head.x, state.limbs.head.y);

    // 2. Animate Jaw / Mouth opening directly driven by index finger bending
    puppet.jaw.position.y = state.mouthOpenRatio * 28;

    // 3. Update Articulated Limbs (Arms & Legs) in real time
    const limbColor = this.getPrimaryColorForPreset(puppet.preset);
    const strokeColor = this.getSecondaryColorForPreset(puppet.preset);

    // Finger splay stretches the limbs outward (open palm) or tucks them in (fist).
    const spread = spreadFactor(state.fingerSplay);

    // Left Arm (driven by Thumb)
    puppet.leftArm.clear();
    puppet.leftArm
      .moveTo(-25, -10)
      .lineTo(state.limbs.leftArm.x * spread, state.limbs.leftArm.y * spread)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(state.limbs.leftArm.x * spread, state.limbs.leftArm.y * spread, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Arm (driven by Middle Finger)
    puppet.rightArm.clear();
    puppet.rightArm
      .moveTo(25, -10)
      .lineTo(state.limbs.rightArm.x * spread, state.limbs.rightArm.y * spread)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(state.limbs.rightArm.x * spread, state.limbs.rightArm.y * spread, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Left Leg (driven by Ring Finger)
    puppet.leftLeg.clear();
    puppet.leftLeg
      .moveTo(-20, 30)
      .lineTo(state.limbs.leftLeg.x * spread, state.limbs.leftLeg.y * spread)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(state.limbs.leftLeg.x * spread - 5, state.limbs.leftLeg.y * spread + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Leg (driven by Pinky Finger)
    puppet.rightLeg.clear();
    puppet.rightLeg
      .moveTo(20, 30)
      .lineTo(state.limbs.rightLeg.x * spread, state.limbs.rightLeg.y * spread)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(state.limbs.rightLeg.x * spread + 5, state.limbs.rightLeg.y * spread + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });
  }

  public hideHand(handType: 'Left' | 'Right'): void {
    const puppet = handType === 'Left' ? this.leftPuppet : this.rightPuppet;
    puppet.container.position.set(-500, -500);
    if (handType === 'Left') this.lastLeftState = undefined;
    else this.lastRightState = undefined;
  }

  public getLastHandState(handType: 'Left' | 'Right'): HandState | undefined {
    return handType === 'Left' ? this.lastLeftState : this.lastRightState;
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
