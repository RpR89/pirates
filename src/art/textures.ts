import type Phaser from 'phaser';
import { PALETTE } from './palette';
import type { PixelSprite } from './sprites';

/** Disegna una griglia di caratteri su un canvas e la registra come texture. */
export function createPixelTexture(
  scene: Phaser.Scene,
  key: string,
  sprite: PixelSprite,
): void {
  const height = sprite.length;
  const width = Math.max(...sprite.map((row) => row.length));
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  sprite.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  texture.refresh();
}
