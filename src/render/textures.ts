import type Phaser from 'phaser';
import { Tile, isWaterTile, tileAt, type TileMap } from '../sim/map';
import { PALETTE, TILE_COLORS } from './palette';
import type { PixelSprite } from './sprites';

export const TILE_PX = 8;

/** Registra una griglia di caratteri come texture; 'f' prende il colore indicato. */
export function createPixelTexture(
  scene: Phaser.Scene,
  key: string,
  sprite: PixelSprite,
  flagColor = '#f4f4f4',
): void {
  if (scene.textures.exists(key)) return;
  const height = sprite.length;
  const width = Math.max(...sprite.map((row) => row.length));
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  sprite.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = char === 'f' ? flagColor : PALETTE[char];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  texture.refresh();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hash intero deterministico per i dettagli decorativi delle caselle. */
function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Disegna l'intera mappa in una texture (TILE_PX pixel per casella). */
export function createMapTexture(scene: Phaser.Scene, key: string, map: TileMap): void {
  const w = map.width * TILE_PX;
  const h = map.height * TILE_PX;
  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return;
  const ctx = texture.getContext();
  const image = ctx.createImageData(w, h);
  const data = image.data;
  const C = Object.fromEntries(
    Object.entries(TILE_COLORS).map(([k, v]) => [k, hexToRgb(v)]),
  ) as Record<keyof typeof TILE_COLORS, [number, number, number]>;

  const put = (px: number, py: number, c: [number, number, number]) => {
    const i = (py * w + px) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = tileAt(map, tx, ty);
      const water = isWaterTile(t);
      const landN = !isWaterTile(tileAt(map, tx, ty - 1));
      const landS = !isWaterTile(tileAt(map, tx, ty + 1));
      const landW = !isWaterTile(tileAt(map, tx - 1, ty));
      const landE = !isWaterTile(tileAt(map, tx + 1, ty));
      const treeX = 1 + (hash(tx, ty, 1) % 3);
      const treeY = 1 + (hash(tx, ty, 2) % 2);

      for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) {
          const gx = tx * TILE_PX + px;
          const gy = ty * TILE_PX + py;
          const r = hash(gx, gy);
          let c: [number, number, number];
          if (water) {
            c = t === Tile.Deep ? C.deep : C.shallow;
            if (r % 41 === 0) c = t === Tile.Deep ? C.deepLight : C.shallowLight;
            const edge =
              (landN && py === 0) || (landS && py === TILE_PX - 1) ||
              (landW && px === 0) || (landE && px === TILE_PX - 1);
            if (edge && r % 4 !== 0) c = C.foam;
          } else if (t === Tile.Sand) {
            c = r % 9 === 0 ? C.sandDark : C.sand;
          } else if (t === Tile.Grass) {
            c = r % 7 === 0 ? C.grassDark : C.grass;
          } else if (t === Tile.Forest) {
            c = r % 6 === 0 ? C.grassDark : C.forest;
            const lx = px - treeX;
            const ly = py - treeY;
            if (lx >= 0 && lx < 5 && ly >= 0 && ly < 4 && !((lx === 0 || lx === 4) && (ly === 0 || ly === 3))) {
              c = ly === 0 || lx === 0 ? C.grass : C.tree;
            }
            if (lx === 2 && (ly === 4 || ly === 5)) c = C.trunk;
          } else {
            c = C.rock;
            if (px + py < 5 && r % 3 !== 0) c = C.rockLight;
            if (px + py > 10) c = C.rockDark;
          }
          put(gx, gy, c);
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.refresh();
}

/** Minimappa: un pixel ogni `scale` caselle. */
export function createMinimapTexture(scene: Phaser.Scene, key: string, map: TileMap, scale: number): void {
  const w = Math.ceil(map.width / scale);
  const h = Math.ceil(map.height / scale);
  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return;
  const ctx = texture.getContext();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tileAt(map, x * scale, y * scale);
      ctx.fillStyle =
        t === Tile.Deep ? TILE_COLORS.deep
        : t === Tile.Shallow ? TILE_COLORS.shallow
        : t === Tile.Sand ? TILE_COLORS.sand
        : t === Tile.Grass ? TILE_COLORS.grass
        : t === Tile.Forest ? TILE_COLORS.forest
        : TILE_COLORS.rock;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.refresh();
}
