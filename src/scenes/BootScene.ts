import Phaser from 'phaser';
import { COIN, SHIP, WAVE } from '../art/sprites';
import { createPixelTexture } from '../art/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createPixelTexture(this, 'ship', SHIP);
    createPixelTexture(this, 'wave', WAVE);
    createPixelTexture(this, 'coin', COIN);
    this.scene.start('Sea');
  }
}
