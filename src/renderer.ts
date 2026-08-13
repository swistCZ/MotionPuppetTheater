import { Application, Container, Sprite, Texture, Graphics } from 'pixi.js';
import { HandState } from './gestures';

export class PuppetRenderer {
  private app: Application;

  // Puppets
  private leftPuppetContainer: Container;
  private rightPuppetContainer: Container;

  private leftSpriteClosed: Sprite | null = null;
  private leftSpriteOpen: Sprite | null = null;

  private rightSpriteClosed: Sprite | null = null;
  private rightSpriteOpen: Sprite | null = null;

  // Background
  private bgGraphics: Graphics;
  private bgSprite: Sprite | null = null;

  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();

    this.leftPuppetContainer = new Container();
    this.rightPuppetContainer = new Container();
    this.bgGraphics = new Graphics();
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
    this.app.stage.addChild(this.leftPuppetContainer);
    this.app.stage.addChild(this.rightPuppetContainer);

    // Initial position offscreen
    this.leftPuppetContainer.position.set(-200, -200);
    this.rightPuppetContainer.position.set(-200, -200);

    // Create default procedural puppets
    this.createDefaultPuppets();
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
    const targetContainer = isLeft ? this.leftPuppetContainer : this.rightPuppetContainer;
    const spriteClosed = isLeft ? this.leftSpriteClosed : this.rightSpriteClosed;
    const spriteOpen = isLeft ? this.leftSpriteOpen : this.rightSpriteOpen;

    if (!targetContainer || !spriteClosed || !spriteOpen) return;

    // Smooth position update
    targetContainer.position.set(state.smoothedPosition.x, state.smoothedPosition.y);

    // Rotation (optional adjustment based on hand angle)
    targetContainer.rotation = state.rotation + Math.PI / 2;

    // Mouth state toggle based on pinch gesture
    if (state.isPinching) {
      spriteClosed.visible = true;
      spriteOpen.visible = false;
    } else {
      spriteClosed.visible = false;
      spriteOpen.visible = true;
    }
  }

  public hideHand(handType: 'Left' | 'Right'): void {
    const targetContainer = handType === 'Left' ? this.leftPuppetContainer : this.rightPuppetContainer;
    targetContainer.position.set(-500, -500);
  }

  public setCustomPuppetTextures(
    handType: 'Left' | 'Right',
    closedTexture: Texture,
    openTexture: Texture
  ): void {
    const isLeft = handType === 'Left';
    const container = isLeft ? this.leftPuppetContainer : this.rightPuppetContainer;

    container.removeChildren();

    const closedSprite = new Sprite(closedTexture);
    closedSprite.anchor.set(0.5, 0.5);
    closedSprite.width = 160;
    closedSprite.height = 160;

    const openSprite = new Sprite(openTexture);
    openSprite.anchor.set(0.5, 0.5);
    openSprite.width = 160;
    openSprite.height = 160;
    openSprite.visible = false;

    container.addChild(closedSprite);
    container.addChild(openSprite);

    if (isLeft) {
      this.leftSpriteClosed = closedSprite;
      this.leftSpriteOpen = openSprite;
    } else {
      this.rightSpriteClosed = closedSprite;
      this.rightSpriteOpen = openSprite;
    }
  }

  private drawDefaultBackground(colorHex: number): void {
    this.bgGraphics.clear();
    this.bgGraphics.rect(0, 0, this.width, this.height);
    this.bgGraphics.fill(colorHex);
  }

  private createDefaultPuppets(): void {
    // Generate Left Puppet (Green Monster)
    const leftClosedTex = this.generateProceduralPuppetTexture('Left', false);
    const leftOpenTex = this.generateProceduralPuppetTexture('Left', true);
    this.setCustomPuppetTextures('Left', leftClosedTex, leftOpenTex);

    // Generate Right Puppet (Purple Rabbit)
    const rightClosedTex = this.generateProceduralPuppetTexture('Right', false);
    const rightOpenTex = this.generateProceduralPuppetTexture('Right', true);
    this.setCustomPuppetTextures('Right', rightClosedTex, rightOpenTex);
  }

  private generateProceduralPuppetTexture(handType: 'Left' | 'Right', isOpen: boolean): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;

    const isLeft = handType === 'Left';
    const primaryColor = isLeft ? '#48bb78' : '#9f7aea'; // Green vs Purple
    const secondaryColor = isLeft ? '#2f855a' : '#6b46c1';

    // Body Circle
    ctx.beginPath();
    ctx.arc(100, 100, 75, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = secondaryColor;
    ctx.stroke();

    // Ears / Horns
    if (isLeft) {
      // Monster Horns
      ctx.beginPath();
      ctx.moveTo(60, 45); ctx.lineTo(40, 15); ctx.lineTo(75, 30);
      ctx.moveTo(140, 45); ctx.lineTo(160, 15); ctx.lineTo(125, 30);
      ctx.fillStyle = '#f6e05e';
      ctx.fill();
      ctx.stroke();
    } else {
      // Rabbit Ears
      ctx.beginPath();
      ctx.ellipse(65, 30, 15, 35, -0.2, 0, Math.PI * 2);
      ctx.ellipse(135, 30, 15, 35, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
      ctx.stroke();
    }

    // Eyes
    ctx.beginPath();
    ctx.arc(70, 80, 14, 0, Math.PI * 2);
    ctx.arc(130, 80, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(72, 80, 6, 0, Math.PI * 2);
    ctx.arc(128, 80, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1a202c';
    ctx.fill();

    // Mouth (Closed vs Open)
    if (isOpen) {
      // Wide open mouth with tongue
      ctx.beginPath();
      ctx.arc(100, 120, 24, 0, Math.PI, false);
      ctx.fillStyle = '#e53e3e';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a202c';
      ctx.stroke();

      // Tongue
      ctx.beginPath();
      ctx.arc(100, 134, 12, 0, Math.PI, false);
      ctx.fillStyle = '#feb2b2';
      ctx.fill();
    } else {
      // Closed smile mouth
      ctx.beginPath();
      ctx.arc(100, 115, 18, 0.2, Math.PI - 0.2, false);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a202c';
      ctx.stroke();
    }

    return Texture.from(canvas);
  }
}
