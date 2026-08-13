import { Application, Container, Sprite, Texture, Graphics } from 'pixi.js';
import { HandState } from './gestures';

export type PuppetPreset = 'dragon' | 'bunny' | 'fox' | 'robot' | 'cat' | 'custom';

interface DynamicPuppet {
  container: Container;
  body: Graphics;
  leftEarWing: Graphics;
  rightEarWing: Graphics;
  leftEye: Graphics;
  rightEye: Graphics;
  jaw: Graphics;
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
    this.leftPuppet.container.position.set(-200, -200);
    this.rightPuppet.container.position.set(-200, -200);

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

    // Smooth position update
    puppet.container.position.set(state.smoothedPosition.x, state.smoothedPosition.y);

    // Rotation angle
    puppet.container.rotation = state.rotation + Math.PI / 2;

    if (puppet.preset === 'custom' && puppet.customSpriteClosed && puppet.customSpriteOpen) {
      // Custom PNG sprite handling
      puppet.customSpriteClosed.visible = state.isPinching;
      puppet.customSpriteOpen.visible = !state.isPinching;
      return;
    }

    // Dynamic finger-reactive animations
    // 1. Jaw / Mouth opening based on continuous mouthOpenRatio
    const jawDrop = state.mouthOpenRatio * 35;
    puppet.jaw.position.y = jawDrop;

    // 2. Ears / Wings / Horns wiggling based on finger splay
    const splayAngle = (state.fingerSplay - 0.5) * 0.6;
    puppet.leftEarWing.rotation = -splayAngle;
    puppet.rightEarWing.rotation = splayAngle;

    // 3. Eye winking based on isWinking
    if (state.isWinking) {
      puppet.leftEye.scale.y = 0.1; // Squint/wink
    } else {
      puppet.leftEye.scale.y = 1.0;
    }
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
    closedSprite.width = 160;
    closedSprite.height = 160;

    const openSprite = new Sprite(openTexture);
    openSprite.anchor.set(0.5, 0.5);
    openSprite.width = 160;
    openSprite.height = 160;
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

    puppet.body.clear();
    puppet.leftEarWing.clear();
    puppet.rightEarWing.clear();
    puppet.leftEye.clear();
    puppet.rightEye.clear();
    puppet.jaw.clear();

    puppet.leftEarWing.rotation = 0;
    puppet.rightEarWing.rotation = 0;
    puppet.jaw.position.set(0, 0);

    switch (preset) {
      case 'dragon':
        this.drawDragonPuppet(puppet);
        break;
      case 'bunny':
        this.drawBunnyPuppet(puppet);
        break;
      case 'fox':
        this.drawFoxPuppet(puppet);
        break;
      case 'robot':
        this.drawRobotPuppet(puppet);
        break;
      case 'cat':
        this.drawCatPuppet(puppet);
        break;
      default:
        this.drawDragonPuppet(puppet);
        break;
    }

    puppet.container.addChild(puppet.leftEarWing);
    puppet.container.addChild(puppet.rightEarWing);
    puppet.container.addChild(puppet.body);
    puppet.container.addChild(puppet.jaw);
    puppet.container.addChild(puppet.leftEye);
    puppet.container.addChild(puppet.rightEye);
  }

  private drawDefaultBackground(colorHex: number): void {
    this.bgGraphics.clear();
    this.bgGraphics.rect(0, 0, this.width, this.height);
    this.bgGraphics.fill(colorHex);
  }

  private createEmptyPuppet(preset: PuppetPreset): DynamicPuppet {
    return {
      container: new Container(),
      body: new Graphics(),
      leftEarWing: new Graphics(),
      rightEarWing: new Graphics(),
      leftEye: new Graphics(),
      rightEye: new Graphics(),
      jaw: new Graphics(),
      preset,
    };
  }

  // Preset 1: Dragon / Monster
  private drawDragonPuppet(p: DynamicPuppet): void {
    // Wings / Horns
    p.leftEarWing.moveTo(-20, -40).lineTo(-70, -80).lineTo(-40, -10).fill(0xf6e05e).stroke({ width: 4, color: 0x2f855a });
    p.rightEarWing.moveTo(20, -40).lineTo(70, -80).lineTo(40, -10).fill(0xf6e05e).stroke({ width: 4, color: 0x2f855a });

    // Main Head
    p.body.circle(0, 0, 65).fill(0x48bb78).stroke({ width: 5, color: 0x2f855a });

    // Eyes
    p.leftEye.circle(-25, -20, 12).fill(0xffffff).circle(-23, -20, 5).fill(0x1a202c);
    p.rightEye.circle(25, -20, 12).fill(0xffffff).circle(23, -20, 5).fill(0x1a202c);

    // Jaw / Mouth
    p.jaw.arc(0, 15, 25, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 4, color: 0x1a202c });
    p.jaw.moveTo(-15, 15).lineTo(-10, 25).lineTo(-5, 15).fill(0xffffff); // Teeth
    p.jaw.moveTo(15, 15).lineTo(10, 25).lineTo(5, 15).fill(0xffffff);
  }

  // Preset 2: Bunny
  private drawBunnyPuppet(p: DynamicPuppet): void {
    // Long Ears
    p.leftEarWing.ellipse(-25, -70, 14, 40).fill(0x9f7aea).stroke({ width: 4, color: 0x6b46c1 });
    p.rightEarWing.ellipse(25, -70, 14, 40).fill(0x9f7aea).stroke({ width: 4, color: 0x6b46c1 });

    // Head
    p.body.circle(0, 0, 60).fill(0xb794f4).stroke({ width: 5, color: 0x6b46c1 });

    // Eyes
    p.leftEye.circle(-22, -15, 10).fill(0xffffff).circle(-20, -15, 4).fill(0x1a202c);
    p.rightEye.circle(22, -15, 10).fill(0xffffff).circle(20, -15, 4).fill(0x1a202c);

    // Nose & Mouth
    p.body.poly([-6, 10, 6, 10, 0, 16]).fill(0xfbb6ce);
    p.jaw.arc(0, 18, 18, 0, Math.PI, false).fill(0xf687b3).stroke({ width: 3, color: 0x1a202c });
  }

  // Preset 3: Fox
  private drawFoxPuppet(p: DynamicPuppet): void {
    // Pointy Ears
    p.leftEarWing.poly([-45, -20, -25, -75, -5, -40]).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });
    p.rightEarWing.poly([45, -20, 25, -75, 5, -40]).fill(0xed8936).stroke({ width: 4, color: 0xc05621 });

    // Head
    p.body.poly([0, 60, -65, -10, 65, -10]).fill(0xed8936).stroke({ width: 5, color: 0xc05621 });
    p.body.poly([0, 60, -35, 10, 35, 10]).fill(0xffffff);

    // Eyes
    p.leftEye.circle(-25, -10, 9).fill(0x1a202c);
    p.rightEye.circle(25, -10, 9).fill(0x1a202c);

    // Jaw
    p.jaw.arc(0, 25, 16, 0, Math.PI, false).fill(0xe53e3e);
  }

  // Preset 4: Robot
  private drawRobotPuppet(p: DynamicPuppet): void {
    // Antennas
    p.leftEarWing.rect(-45, -60, 8, 30).fill(0xa0aec0);
    p.leftEarWing.circle(-41, -65, 8).fill(0x3182ce);
    p.rightEarWing.rect(37, -60, 8, 30).fill(0xa0aec0);
    p.rightEarWing.circle(41, -65, 8).fill(0x3182ce);

    // Head Box
    p.body.roundRect(-55, -45, 110, 90, 12).fill(0xc0c9d6).stroke({ width: 5, color: 0x4a5568 });

    // Visor / Eyes
    p.leftEye.rect(-35, -25, 25, 18).fill(0x3182ce).rect(-30, -20, 8, 8).fill(0x63b3ed);
    p.rightEye.rect(10, -25, 25, 18).fill(0x3182ce).rect(15, -20, 8, 8).fill(0x63b3ed);

    // Mechanical Jaw
    p.jaw.rect(-30, 12, 60, 20).fill(0x4a5568).stroke({ width: 3, color: 0x2d3748 });
    p.jaw.rect(-25, 16, 50, 4).fill(0x3182ce);
  }

  // Preset 5: Cat / Tiger
  private drawCatPuppet(p: DynamicPuppet): void {
    // Cat Ears
    p.leftEarWing.poly([-45, -20, -30, -65, -10, -35]).fill(0xecc94b).stroke({ width: 4, color: 0xd69e2e });
    p.rightEarWing.poly([45, -20, 30, -65, 10, -35]).fill(0xecc94b).stroke({ width: 4, color: 0xd69e2e });

    // Head
    p.body.circle(0, 0, 60).fill(0xf6e05e).stroke({ width: 5, color: 0xd69e2e });

    // Tiger Stripes
    p.body.poly([0, -55, -10, -40, 10, -40]).fill(0x1a202c);
    p.body.poly([-55, 0, -40, -10, -40, 10]).fill(0x1a202c);
    p.body.poly([55, 0, 40, -10, 40, 10]).fill(0x1a202c);

    // Eyes
    p.leftEye.ellipse(-22, -15, 10, 12).fill(0x48bb78).circle(-22, -15, 4).fill(0x1a202c);
    p.rightEye.ellipse(22, -15, 10, 12).fill(0x48bb78).circle(22, -15, 4).fill(0x1a202c);

    // Whiskers
    p.body.moveTo(-25, 10).lineTo(-60, 5);
    p.body.moveTo(-25, 15).lineTo(-58, 20);
    p.body.moveTo(25, 10).lineTo(60, 5);
    p.body.moveTo(25, 15).lineTo(58, 20);
    p.body.stroke({ width: 3, color: 0x1a202c });

    // Jaw
    p.jaw.arc(0, 18, 18, 0, Math.PI, false).fill(0xe53e3e).stroke({ width: 3, color: 0x1a202c });
  }
}
