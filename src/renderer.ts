import { Application, Container, Sprite, Texture, Graphics } from 'pixi.js';
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

  // Background
  private bgGraphics: Graphics;
  private bgSprite: Sprite | null = null;

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();

    this.bgGraphics = new Graphics();
    this.leftPuppet = this.createEmptyPuppet('dragon');
    this.rightPuppet = this.createEmptyPuppet('bunny');
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

    // Add background first
    this.app.stage.addChild(this.bgGraphics);
    this.drawDefaultBackground(0x2d3748);

    // Add puppet containers
    this.app.stage.addChild(this.leftPuppet.container);
    this.app.stage.addChild(this.rightPuppet.container);

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
    this.drawDefaultBackground(0x2d3748);
  }

  public setBackgroundColor(colorHex: number): void {
    if (this.bgSprite) {
      this.bgSprite.visible = false;
    }
    this.drawDefaultBackground(colorHex);
  }

  public setCustomBackgroundTexture(texture: Texture): void {
    if (!this.bgSprite) {
      this.bgSprite = new Sprite(texture);
      this.app.stage.addChildAt(this.bgSprite, 0);
    } else {
      this.bgSprite.texture = texture;
    }
    this.bgSprite.width = this.width;
    this.bgSprite.height = this.height;
    this.bgSprite.visible = true;
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

    // 2. Animate Jaw / Mouth opening
    puppet.jaw.position.y = state.mouthOpenRatio * 25;

    // 3. Eye winking
    puppet.leftEye.scale.y = state.isWinking ? 0.1 : 1.0;

    // 4. Update Articulated Limbs (Arms & Legs) in real time
    // Colors based on preset
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

  public setCustomPuppetTextures(
    handType: 'Left' | 'Right',
    closedTexture: Texture,
    openTexture: Texture
  ): void {
    const isLeft = handType === 'Left';
    const puppet = isLeft ? this.leftPuppet : this.rightPuppet;
    puppet.preset = 'custom';

    puppet.container.removeChildren();

    const closedSprite = new Sprite(closedTexture);
    closedSprite.anchor.set(0.5, 0.5);
    closedSprite.width = 180;
    closedSprite.height = 180;

    const openSprite = new Sprite(openTexture);
    openSprite.anchor.set(0.5, 0.5);
    openSprite.width = 180;
    openSprite.height = 180;
    openSprite.visible = false;

    puppet.container.addChild(closedSprite);
    puppet.container.addChild(openSprite);

    puppet.customSpriteClosed = closedSprite;
    puppet.customSpriteOpen = openSprite;
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
    // Torso
    p.torso.roundRect(-30, -20, 60, 70, 20).fill(0x48bb78).stroke({ width: 4, color: 0x2f855a });
    p.torso.roundRect(-20, -10, 40, 50, 15).fill(0xf6e05e); // Belly plate

    // Head
    p.headGraphic.circle(0, 0, 45).fill(0x48bb78).stroke({ width: 4, color: 0x2f855a });
    // Horns
    p.headGraphic.poly([-20, -30, -35, -60, -10, -40]).fill(0xf6e05e).stroke({ width: 3, color: 0x2f855a });
    p.headGraphic.poly([20, -30, 35, -60, 10, -40]).fill(0xf6e05e).stroke({ width: 3, color: 0x2f855a });

    // Eyes
    p.leftEye.circle(-16, -10, 9).fill(0xffffff).circle(-14, -10, 4).fill(0x1a202c);
    p.rightEye.circle(16, -10, 9).fill(0xffffff).circle(14, -10, 4).fill(0x1a202c);

    // Jaw
    p.jaw.arc(0, 10, 18, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 3, color: 0x1a202c });
  }

  // 2. Bunny Preset
  private drawBunnyPreset(p: DynamicPuppet): void {
    // Torso
    p.torso.roundRect(-28, -20, 56, 65, 20).fill(0xb794f4).stroke({ width: 4, color: 0x6b46c1 });
    p.torso.circle(0, 10, 18).fill(0xffffff); // White belly

    // Head
    p.headGraphic.circle(0, 0, 42).fill(0xb794f4).stroke({ width: 4, color: 0x6b46c1 });
    // Long Ears
    p.headGraphic.ellipse(-18, -55, 10, 30).fill(0xb794f4).stroke({ width: 3, color: 0x6b46c1 });
    p.headGraphic.ellipse(18, -55, 10, 30).fill(0xb794f4).stroke({ width: 3, color: 0x6b46c1 });

    // Eyes
    p.leftEye.circle(-15, -8, 8).fill(0xffffff).circle(-13, -8, 3).fill(0x1a202c);
    p.rightEye.circle(15, -8, 8).fill(0xffffff).circle(13, -8, 3).fill(0x1a202c);

    // Jaw
    p.jaw.arc(0, 10, 15, 0, Math.PI, false).fill(0xf687b3).stroke({ width: 2, color: 0x1a202c });
  }

  // 3. Fox Preset
  private drawFoxPreset(p: DynamicPuppet): void {
    // Torso
    p.torso.roundRect(-30, -20, 60, 65, 18).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });
    p.torso.ellipse(0, 12, 16, 22).fill(0xffffff); // White chest

    // Head
    p.headGraphic.poly([0, 40, -45, -10, 45, -10]).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });
    p.headGraphic.poly([-30, -10, -20, -50, -5, -25]).fill(0xed8936).stroke({ width: 3, color: 0xc05621 }); // Ears
    p.headGraphic.poly([30, -10, 20, -50, 5, -25]).fill(0xed8936).stroke({ width: 3, color: 0xc05621 });

    // Eyes
    p.leftEye.circle(-18, -5, 7).fill(0x1a202c);
    p.rightEye.circle(18, -5, 7).fill(0x1a202c);

    // Jaw
    p.jaw.arc(0, 16, 14, 0, Math.PI, false).fill(0xe53e3e);
  }

  // 4. Robot Preset
  private drawRobotPreset(p: DynamicPuppet): void {
    // Torso Box
    p.torso.roundRect(-35, -20, 70, 70, 10).fill(0xc0c9d6).stroke({ width: 4, color: 0x4a5568 });
    p.torso.rect(-18, -5, 36, 25).fill(0x3182ce).stroke({ width: 2, color: 0x2d3748 }); // Screen

    // Head Box
    p.headGraphic.roundRect(-38, -35, 76, 55, 8).fill(0xc0c9d6).stroke({ width: 4, color: 0x4a5568 });
    p.headGraphic.rect(-4, -50, 8, 15).fill(0xa0aec0); // Antenna
    p.headGraphic.circle(0, -53, 6).fill(0x3182ce);

    // Eyes
    p.leftEye.rect(-25, -20, 18, 14).fill(0x3182ce);
    p.rightEye.rect(7, -20, 18, 14).fill(0x3182ce);

    // Jaw
    p.jaw.rect(-20, 5, 40, 12).fill(0x4a5568);
  }

  // 5. Cat Preset
  private drawCatPreset(p: DynamicPuppet): void {
    // Torso
    p.torso.roundRect(-28, -20, 56, 65, 20).fill(0xf6e05e).stroke({ width: 4, color: 0xd69e2e });

    // Head
    p.headGraphic.circle(0, 0, 42).fill(0xf6e05e).stroke({ width: 4, color: 0xd69e2e });
    p.headGraphic.poly([-30, -15, -20, -50, -5, -25]).fill(0xf6e05e).stroke({ width: 3, color: 0xd69e2e }); // Ears
    p.headGraphic.poly([30, -15, 20, -50, 5, -25]).fill(0xf6e05e).stroke({ width: 3, color: 0xd69e2e });

    // Eyes
    p.leftEye.ellipse(-15, -8, 8, 10).fill(0x48bb78).circle(-15, -8, 3).fill(0x1a202c);
    p.rightEye.ellipse(15, -8, 8, 10).fill(0x48bb78).circle(15, -8, 3).fill(0x1a202c);

    // Jaw
    p.jaw.arc(0, 10, 15, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 2, color: 0x1a202c });
  }
}
