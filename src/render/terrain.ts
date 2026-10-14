import { Tile, isWaterTile, tileAt, type TileMap } from '../sim/map';
import { bayer, hash2, hex, mix, type RGB } from './color';

export const TILE_PX = 24;
/** Scala dei dettagli rispetto alle caselle da 16 px su cui sono stati tarati. */
const K = TILE_PX / 16;
const HALF = TILE_PX / 2;
export const CHUNK_TILES = 32;

// Codici di terreno a livello di pixel.
const WATER = 0;
const SAND = 1;
const GRASS = 2;
const FOREST = 3;
const ROCK = 4;

const WATER_LEVELS: RGB[] = ['#86dbd2', '#5cc2cc', '#3fa5c6', '#3388b6', '#2c70a3', '#255d90', '#1f4f80'].map(hex);
const WAVE_LIGHT = hex('#5d9fd0');
const FOAM = hex('#eefaf6');
const FOAM2 = hex('#bdeee6');
const SAND_C = hex('#ecd59f');
const SAND_DARK = hex('#d8bc82');
const SAND_LIGHT = hex('#f7e7bd');
const SAND_WET = hex('#cfb27a');
const GRASS_A = hex('#6db24f');
const GRASS_B = hex('#5ba244');
const GRASS_C = hex('#4c933a');
const GRASS_TUFT = hex('#3d7d31');
const FOREST_GROUND = hex('#447f37');
const ROCK_C = hex('#8d9098');
const ROCK_DARK = hex('#62656e');
const ROCK_LIGHT = hex('#b4b7be');
const ROCK_SPECK = hex('#7a7d86');
const FLOWER_Y = hex('#f3df6a');
const FLOWER_W = hex('#f4f1ea');
const TREE = ['#1f4d22', '#2a6a2c', '#3a853a', '#56a548'].map(hex);
const PALM = ['#2f6e2e', '#4f9a3c', '#6fb94f'].map(hex);

function terrainOf(t: number): number {
  switch (t) {
    case Tile.Sand: return SAND;
    case Tile.Grass: return GRASS;
    case Tile.Forest: return FOREST;
    case Tile.Rock: return ROCK;
    default: return WATER;
  }
}

/** Distanza (in caselle) di ogni casella d'acqua dalla terra più vicina; 0 sulla terra. */
export function waterDistanceField(map: TileMap): Float32Array {
  const { width, height } = map;
  const field = new Float32Array(width * height).fill(1e9);
  const queue: number[] = [];
  for (let i = 0; i < field.length; i++) {
    if (!isWaterTile(map.tiles[i])) {
      field[i] = 0;
      queue.push(i);
    }
  }
  // Chamfer a due passate: approssima bene la distanza euclidea.
  const D = 1.4142;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = field[i];
      if (x > 0) v = Math.min(v, field[i - 1] + 1);
      if (y > 0) v = Math.min(v, field[i - width] + 1);
      if (x > 0 && y > 0) v = Math.min(v, field[i - width - 1] + D);
      if (x < width - 1 && y > 0) v = Math.min(v, field[i - width + 1] + D);
      field[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = field[i];
      if (x < width - 1) v = Math.min(v, field[i + 1] + 1);
      if (y < height - 1) v = Math.min(v, field[i + width] + 1);
      if (x < width - 1 && y < height - 1) v = Math.min(v, field[i + width + 1] + D);
      if (x > 0 && y < height - 1) v = Math.min(v, field[i + width - 1] + D);
      field[i] = v;
    }
  }
  return field;
}

/** Terreno del pixel globale (gx, gy), con coste e angoli arrotondati. */
function pixelTerrain(map: TileMap, gx: number, gy: number): number {
  const tx = Math.floor(gx / TILE_PX);
  const ty = Math.floor(gy / TILE_PX);
  const px = gx - tx * TILE_PX;
  const py = gy - ty * TILE_PX;
  const t = tileAt(map, tx, ty);
  const water = isWaterTile(t);
  const qx = px < HALF ? -1 : 1;
  const qy = py < HALF ? -1 : 1;
  const ax = tileAt(map, tx + qx, ty);
  const ay = tileAt(map, tx, ty + qy);
  const dx = Math.abs(px + 0.5 - HALF);
  const dy = Math.abs(py + 0.5 - HALF);
  const far = dx * dx + dy * dy > HALF * HALF;
  if (!water && isWaterTile(ax) && isWaterTile(ay) && far) return WATER;
  if (water && !isWaterTile(ax) && !isWaterTile(ay) && far) return terrainOf(ax) === ROCK ? SAND : terrainOf(ax);
  if (water) return WATER;
  // Confini irregolari tra i tipi di terra.
  const j = hash2(gx >> 2, gy >> 2, 7);
  const jitter = Math.round(3 * K);
  const span = jitter * 2 + 1;
  const jt = tileAt(map, Math.floor((gx + ((j % span) - jitter)) / TILE_PX), Math.floor((gy + (((j >> 3) % span) - jitter)) / TILE_PX));
  return isWaterTile(jt) ? terrainOf(t) : terrainOf(jt);
}

/** Valore liscio a bassa frequenza, per variare il colore dei prati. */
function lowNoise(gx: number, gy: number, s = 40, salt = 3): number {
  const x = gx / s;
  const y = gy / s;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v = (a: number, b: number) => (hash2(a, b, salt) & 1023) / 1023;
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * fx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

export interface ChunkImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Disegna un blocco di CHUNK_TILES×CHUNK_TILES caselle. */
export function renderChunk(map: TileMap, field: Float32Array, chunkX: number, chunkY: number): ChunkImage {
  const tiles = CHUNK_TILES;
  const tx0 = chunkX * tiles;
  const ty0 = chunkY * tiles;
  const tw = Math.min(tiles, map.width - tx0);
  const th = Math.min(tiles, map.height - ty0);
  const W = tw * TILE_PX;
  const H = th * TILE_PX;
  const gx0 = tx0 * TILE_PX;
  const gy0 = ty0 * TILE_PX;

  // Terreno per pixel con un margine, per schiuma e bordi.
  const M = 3;
  const TW = W + M * 2;
  const types = new Uint8Array(TW * (H + M * 2));
  for (let y = 0; y < H + M * 2; y++) {
    for (let x = 0; x < TW; x++) types[y * TW + x] = pixelTerrain(map, gx0 + x - M, gy0 + y - M);
  }
  const typeAt = (x: number, y: number) => types[(y + M) * TW + (x + M)];
  const nearType = (x: number, y: number, kind: number, r: number, not = false) => {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.abs(i) + Math.abs(j) > r) continue;
        const t = typeAt(x + i, y + j);
        if (not ? t !== kind : t === kind) return true;
      }
    }
    return false;
  };

  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, c: RGB) => {
    const i = (y * W + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = gx0 + x;
      const gy = gy0 + y;
      const t = typeAt(x, y);
      const r = hash2(gx, gy);
      let c: RGB;
      if (t === WATER) {
        if (nearType(x, y, WATER, 1, true)) c = FOAM;
        else if (nearType(x, y, WATER, 2, true) && r % 3 !== 0) c = FOAM2;
        else {
          // Profondità interpolata dal campo delle distanze.
          const fx = (gx + 0.5) / TILE_PX - 0.5;
          const fy = (gy + 0.5) / TILE_PX - 0.5;
          const ix = Math.max(0, Math.min(map.width - 2, Math.floor(fx)));
          const iy = Math.max(0, Math.min(map.height - 2, Math.floor(fy)));
          const ax = Math.max(0, Math.min(1, fx - ix));
          const ay = Math.max(0, Math.min(1, fy - iy));
          const f = (i: number, j: number) => Math.min(field[(iy + j) * map.width + ix + i], 8);
          const d = (f(0, 0) * (1 - ax) + f(1, 0) * ax) * (1 - ay) + (f(0, 1) * (1 - ax) + f(1, 1) * ax) * ay;
          const level = Math.max(0, Math.min(6, Math.floor(d * 1.5 - 0.3 + (bayer(gx, gy) - 0.5) * 0.9)));
          c = WATER_LEVELS[level];
          // Piccole onde sul mare aperto.
          if (level >= 3) {
            const cellX = Math.floor(gx / 26);
            const cellY = Math.floor(gy / 14);
            const h = hash2(cellX, cellY, 11);
            const wx = cellX * 26 + (h % 18);
            const wy = cellY * 14 + ((h >> 5) % 10);
            if ((gy === wy && gx >= wx && gx < wx + 4) || (gy === wy - 1 && gx >= wx + 1 && gx < wx + 3)) {
              c = mix(c, WAVE_LIGHT, 0.7);
            }
          }
        }
      } else if (t === SAND) {
        c = nearType(x, y, WATER, 2) ? SAND_WET : r % 11 === 0 ? SAND_DARK : r % 17 === 0 ? SAND_LIGHT : SAND_C;
      } else if (t === GRASS) {
        const n = lowNoise(gx, gy) + (bayer(gx, gy) - 0.5) * 0.25;
        c = n < 0.38 ? GRASS_C : n < 0.62 ? GRASS_B : GRASS_A;
        if (r % 41 === 0) c = GRASS_TUFT;
        else if (r % 997 === 0) c = FLOWER_Y;
        else if (r % 1201 === 0) c = FLOWER_W;
      } else if (t === FOREST) {
        c = r % 9 === 0 ? GRASS_TUFT : FOREST_GROUND;
      } else {
        // Colline rocciose: rilievo da un rumore a media frequenza, luce da nord-ovest.
        const h = (ax: number, ay: number) => lowNoise(ax, ay, 9, 13) * 0.7 + lowNoise(ax, ay, 4, 17) * 0.3;
        const slope = h(gx - 1, gy - 1) - h(gx + 1, gy + 1) + (bayer(gx, gy) - 0.5) * 0.03;
        c = slope > 0.035 ? ROCK_LIGHT : slope < -0.035 ? ROCK_DARK : r % 7 === 0 ? ROCK_SPECK : ROCK_C;
        if (typeAt(x, y + 1) !== ROCK && typeAt(x, y + 1) !== WATER) c = ROCK_DARK;
        else if (r % 53 === 0 && lowNoise(gx, gy, 12, 19) > 0.55) c = GRASS_C;
      }
      put(x, y, c);
    }
  }

  const darken = (x: number, y: number, k: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    data[i] *= k;
    data[i + 1] *= k;
    data[i + 2] *= k;
  };
  const paint = (x: number, y: number, c: RGB) => {
    if (x >= 0 && y >= 0 && x < W && y < H) put(x, y, c);
  };

  // Alberi e palme, anche quelli delle caselle vicine che sconfinano nel blocco.
  type Tree = { x: number; y: number; r: number; palm: boolean; seed: number };
  const trees: Tree[] = [];
  for (let ty = ty0 - 1; ty <= ty0 + th; ty++) {
    for (let tx = tx0 - 1; tx <= tx0 + tw; tx++) {
      const t = tileAt(map, tx, ty);
      const h = hash2(tx, ty, 21);
      if (t === Tile.Forest) {
        const n = 1 + (h % 2);
        for (let k = 0; k < n; k++) {
          const hk = hash2(tx, ty, 30 + k);
          const spread = Math.round(9 * K);
          trees.push({ x: tx * TILE_PX + Math.round(4 * K) + (hk % spread) - gx0, y: ty * TILE_PX + Math.round(4 * K) + ((hk >> 4) % spread) - gy0, r: Math.round((5 + ((hk >> 8) % 3)) * K), palm: false, seed: hk });
        }
      } else if (t === Tile.Grass && h % 9 === 0) {
        trees.push({ x: tx * TILE_PX + HALF + (h % 5) - 2 - gx0, y: ty * TILE_PX + HALF + ((h >> 3) % 5) - 2 - gy0, r: Math.round((4 + (h % 2)) * K), palm: false, seed: h });
      } else if (t === Tile.Sand && h % 7 === 0) {
        trees.push({ x: tx * TILE_PX + HALF - gx0, y: ty * TILE_PX + HALF - gy0, r: Math.round(5 * K), palm: true, seed: h });
      }
    }
  }
  trees.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const tr of trees) {
    if (tr.palm) {
      // Ombra e foglie a stella viste dall'alto.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (tr.seed % 10) / 10;
        for (let s = 1; s <= tr.r; s++) darken(Math.round(tr.x + 2 + Math.cos(a) * s), Math.round(tr.y + 3 + Math.sin(a) * s), 0.8);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (tr.seed % 10) / 10;
        for (let s = 1; s <= tr.r; s++) {
          const c = s === tr.r ? PALM[0] : s > tr.r / 2 ? PALM[1] : PALM[2];
          paint(Math.round(tr.x + Math.cos(a) * s), Math.round(tr.y + Math.sin(a) * s), c);
          paint(Math.round(tr.x + Math.cos(a) * s + Math.sin(a) * 0.8), Math.round(tr.y + Math.sin(a) * s - Math.cos(a) * 0.8), PALM[1]);
        }
      }
      paint(tr.x, tr.y, hex('#8a6a3a'));
      continue;
    }
    const r = tr.r;
    for (let y = -r - 1; y <= r + 4; y++) {
      for (let x = -r - 1; x <= r + 3; x++) {
        const sx = x - 2;
        const sy = y - 3;
        if (sx * sx + sy * sy <= r * r) darken(tr.x + x, tr.y + y, 0.72);
      }
    }
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        const angle = Math.atan2(y, x);
        const bump = (hash2(tr.seed, Math.floor((angle + Math.PI) * 2.5)) % 3) * 0.5;
        const rr = r + bump - 0.5;
        const d2 = x * x + y * y;
        if (d2 > rr * rr) continue;
        const nx = x / r;
        const ny = y / r;
        const light = -(nx * 0.6 + ny * 0.8) + ((hash2(tr.x + x, tr.y + y, 9) % 100) / 100 - 0.5) * 0.5;
        let c = light > 0.45 ? TREE[3] : light > 0 ? TREE[2] : light > -0.45 ? TREE[1] : TREE[0];
        if (d2 > (rr - 1) * (rr - 1)) c = light > 0.3 ? TREE[2] : TREE[0];
        paint(tr.x + x, tr.y + y, c);
      }
    }
  }

  return { width: W, height: H, data };
}
