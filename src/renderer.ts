import { Application, Container, Sprite, Graphics, Assets, Texture, Text, TextStyle } from 'pixi.js';
import { HandState } from './gestures';

export type PuppetPreset = 'dragon' | 'bunny' | 'fox' | 'robot' | 'cat' | 'custom';

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
  customSpriteClosed?: Sprite;
  customSpriteOpen?: Sprite;
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

  // Background
  private bgGraphics: Graphics;
  private bgSprite: Sprite | null = null;
  private currentBgColorHex: number = 0x2d3748;

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();

    this.bgGraphics = new Graphics();
    this.leftPuppet = this.createEmptyPuppet('dragon');
    this.rightPuppet = this.createEmptyPuppet('bunny');

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

  public async initialize(parentElement: HTMLElement): Promise<void> {
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundColor: 0x1e1e2e,
      antialias: true,
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
    this.buildPuppetPreset('Left', 'dragon');
    this.buildPuppetPreset('Right', 'bunny');
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

    // Dim/hide puppets when Theremin mode is ON
    this.leftPuppet.container.alpha = enabled ? 0.2 : 1.0;
    this.rightPuppet.container.alpha = enabled ? 0.2 : 1.0;
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

      this.leftThereminText.text = `🎵 ${Math.round(frequency)} Hz`;
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

      this.rightThereminText.text = `🔊 ${Math.round(volumeRatio * 100)}% Vol`;
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

    // Smooth position update for Torso center
    puppet.container.position.set(state.smoothedPosition.x, state.smoothedPosition.y);

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

    // Left Arm (driven by Thumb)
    puppet.leftArm.clear();
    puppet.leftArm
      .moveTo(-25, -10)
      .lineTo(state.limbs.leftArm.x, state.limbs.leftArm.y)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(state.limbs.leftArm.x, state.limbs.leftArm.y, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Arm (driven by Middle Finger)
    puppet.rightArm.clear();
    puppet.rightArm
      .moveTo(25, -10)
      .lineTo(state.limbs.rightArm.x, state.limbs.rightArm.y)
      .stroke({ width: 12, color: strokeColor, cap: 'round' })
      .circle(state.limbs.rightArm.x, state.limbs.rightArm.y, 10)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Left Leg (driven by Ring Finger)
    puppet.leftLeg.clear();
    puppet.leftLeg
      .moveTo(-20, 30)
      .lineTo(state.limbs.leftLeg.x, state.limbs.leftLeg.y)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(state.limbs.leftLeg.x - 5, state.limbs.leftLeg.y + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });

    // Right Leg (driven by Pinky Finger)
    puppet.rightLeg.clear();
    puppet.rightLeg
      .moveTo(20, 30)
      .lineTo(state.limbs.rightLeg.x, state.limbs.rightLeg.y)
      .stroke({ width: 14, color: strokeColor, cap: 'round' })
      .ellipse(state.limbs.rightLeg.x + 5, state.limbs.rightLeg.y + 4, 14, 8)
      .fill(limbColor)
      .stroke({ width: 3, color: strokeColor });
  }

  public hideHand(handType: 'Left' | 'Right'): void {
    const puppet = handType === 'Left' ? this.leftPuppet : this.rightPuppet;
    puppet.container.position.set(-500, -500);
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

  public buildPuppetPreset(handType: 'Left' | 'Right', preset: PuppetPreset): void {
    const isLeft = handType === 'Left';
    const puppet = isLeft ? this.leftPuppet : this.rightPuppet;
    puppet.preset = preset;

    puppet.container.removeChildren();

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
      case 'dragon':
        this.drawDragonPreset(puppet);
        break;
      case 'bunny':
        this.drawBunnyPreset(puppet);
        break;
      case 'fox':
        this.drawFoxPreset(puppet);
        break;
      case 'robot':
        this.drawRobotPreset(puppet);
        break;
      case 'cat':
        this.drawCatPreset(puppet);
        break;
      default:
        this.drawDragonPreset(puppet);
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
      case 'dragon': return 0x48bb78;
      case 'bunny': return 0xb794f4;
      case 'fox': return 0xed8936;
      case 'robot': return 0xc0c9d6;
      case 'cat': return 0xf6e05e;
      default: return 0x48bb78;
    }
  }

  private getSecondaryColorForPreset(preset: PuppetPreset): number {
    switch (preset) {
      case 'dragon': return 0x2f855a;
      case 'bunny': return 0x6b46c1;
      case 'fox': return 0xc05621;
      case 'robot': return 0x4a5568;
      case 'cat': return 0xd69e2e;
      default: return 0x2f855a;
    }
  }

  // 1. Dragon Preset
  private drawDragonPreset(p: DynamicPuppet): void {
    p.torso.roundRect(-30, -20, 60, 70, 20).fill(0x48bb78).stroke({ width: 4, color: 0x2f855a });
    p.torso.roundRect(-20, -10, 40, 50, 15).fill(0xf6e05e);

    p.headGraphic.circle(0, 0, 45).fill(0x48bb78).stroke({ width: 4, color: 0x2f855a });
    p.headGraphic.poly([-20, -30, -35, -60, -10, -40]).fill(0xf6e05e).stroke({ width: 3, color: 0x2f855a });
    p.headGraphic.poly([20, -30, 35, -60, 10, -40]).fill(0xf6e05e).stroke({ width: 3, color: 0x2f855a });

    p.leftEye.circle(-16, -10, 9).fill(0xffffff).circle(-14, -10, 4).fill(0x1a202c);
    p.rightEye.circle(16, -10, 9).fill(0xffffff).circle(14, -10, 4).fill(0x1a202c);

    p.jaw.arc(0, 10, 18, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 3, color: 0x1a202c });
  }

  // 2. Bunny Preset
  private drawBunnyPreset(p: DynamicPuppet): void {
    p.torso.roundRect(-28, -20, 56, 65, 20).fill(0xb794f4).stroke({ width: 4, color: 0x6b46c1 });
    p.torso.circle(0, 10, 18).fill(0xffffff);

    p.headGraphic.circle(0, 0, 42).fill(0xb794f4).stroke({ width: 4, color: 0x6b46c1 });
    p.headGraphic.ellipse(-18, -55, 10, 30).fill(0xb794f4).stroke({ width: 3, color: 0x6b46c1 });
    p.headGraphic.ellipse(18, -55, 10, 30).fill(0xb794f4).stroke({ width: 3, color: 0x6b46c1 });

    p.leftEye.circle(-15, -8, 8).fill(0xffffff).circle(-13, -8, 3).fill(0x1a202c);
    p.rightEye.circle(15, -8, 8).fill(0xffffff).circle(13, -8, 3).fill(0x1a202c);

    p.jaw.arc(0, 10, 15, 0, Math.PI, false).fill(0xf687b3).stroke({ width: 2, color: 0x1a202c });
  }

  // 3. Fox Preset
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

  // 4. Robot Preset
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

  // 5. Cat Preset
  private drawCatPreset(p: DynamicPuppet): void {
    p.torso.roundRect(-28, -20, 56, 65, 20).fill(0xf6e05e).stroke({ width: 4, color: 0xd69e2e });

    p.headGraphic.circle(0, 0, 42).fill(0xf6e05e).stroke({ width: 4, color: 0xd69e2e });
    p.headGraphic.poly([-30, -15, -20, -50, -5, -25]).fill(0xf6e05e).stroke({ width: 3, color: 0xd69e2e });
    p.headGraphic.poly([30, -15, 20, -50, 5, -25]).fill(0xf6e05e).stroke({ width: 3, color: 0xd69e2e });

    p.leftEye.ellipse(-15, -8, 8, 10).fill(0x48bb78).circle(-15, -8, 3).fill(0x1a202c);
    p.rightEye.ellipse(15, -8, 8, 10).fill(0x48bb78).circle(15, -8, 3).fill(0x1a202c);

    p.jaw.arc(0, 10, 15, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 2, color: 0x1a202c });
  }
}
