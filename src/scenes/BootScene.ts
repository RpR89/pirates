import Phaser from 'phaser';
import { createPixelFont } from '../render/font';
import { MARKER, WAVE } from '../render/sprites';
import { createPixelTexture } from '../render/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createPixelFont(this);
    createPixelTexture(this, 'marker', MARKER);
    createPixelTexture(this, 'wave', WAVE);
    this.scene.start('World');
  }
}
