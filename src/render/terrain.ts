import { Tile, isWaterTile, tileAt, type TileMap } from '../sim/map';
import { bayer, hash2, hex, mix, type RGB } from './color';

export const TILE_PX = 72;
/** Scala dei dettagli rispetto alle caselle da 16 px su cui sono stati tarati. */
const K = TILE_PX / 16;
const HALF = TILE_PX / 2;
/** Caselle per lato di un blocco di terreno (generato a richiesta). */
export const CHUNK_TILES = 8;

// Codici di terreno a livello di pixel.
const WATER = 0;
const SAND = 1;
const GRASS = 2;
const FOREST = 3;
const ROCK = 4;

const WATER_LEVELS: RGB[] = ['#8fe0d6', '#6ccdd0', '#4fb4ca', '#3d9ac0', '#3383b2', '#2c6ea2', '#265d91', '#215083', '#1d4677'].map(hex);
const WAVE_LIGHT = hex('#6aaad8');
const FOAM = hex('#f2fbf8');
const FOAM2 = hex('#c6f0e8');
const SAND_C = hex('#ecd59f');
const SAND_DARK = hex('#d8bc82');
const SAND_LIGHT = hex('#f7e7bd');
const SAND_WET = hex('#cdb07a');
const SAND_WET_DARK = hex('#b99c68');
const GRASS_A = hex('#72b652');
const GRASS_B = hex('#62a647');
const GRASS_C = hex('#52963c');
const GRASS_D = hex('#45863a');
const GRASS_TUFT = hex('#3a7a30');
const GRASS_LIGHT = hex('#8cc864');
const FOREST_GROUND = hex('#467f36');
const FOREST_DARK = hex('#3a6e2e');
const ROCK_C = hex('#8d9098');
const ROCK_DARK = hex('#62656e');
const ROCK_DEEP = hex('#4e5159');
const ROCK_LIGHT = hex('#b4b7be');
const ROCK_SPECK = hex('#7a7d86');
const FLOWERS = ['#f3df6a', '#f4f1ea', '#e88a9a', '#9ab8f0'].map(hex);
const TREE = ['#1c4820', '#24602a', '#2f7434', '#3d8a3c', '#55a548', '#6fbb58'].map(hex);
const TRUNK = hex('#6b4a2a');
const PALM = ['#2a6428', '#3f8a34', '#58a844', '#78c058'].map(hex);

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
  for (let i = 0; i < field.length; i++) if (!isWaterTile(map.tiles[i])) field[i] = 0;
  chamfer(field, width, height);
  return field;
}

/** Trasformata di distanza a due passate (approssima la distanza euclidea). */
function chamfer(f: Float32Array, width: number, height: number): void {
  const D = 1.4142;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = f[i];
      if (x > 0) v = Math.min(v, f[i - 1] + 1);
      if (y > 0) v = Math.min(v, f[i - width] + 1);
      if (x > 0 && y > 0) v = Math.min(v, f[i - width - 1] + D);
      if (x < width - 1 && y > 0) v = Math.min(v, f[i - width + 1] + D);
      f[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = f[i];
      if (x < width - 1) v = Math.min(v, f[i + 1] + 1);
      if (y < height - 1) v = Math.min(v, f[i + width] + 1);
      if (x < width - 1 && y < height - 1) v = Math.min(v, f[i + width + 1] + D);
      if (x > 0 && y < height - 1) v = Math.min(v, f[i + width - 1] + D);
      f[i] = v;
    }
  }
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
  // Bordo della costa leggermente ondulato (calcolato solo vicino alla costa).
  const wobble = () => (lowNoise(gx, gy, TILE_PX * 0.45, 31) - 0.5) * TILE_PX * 0.22;
  const dx = Math.abs(px + 0.5 - HALF);
  const dy = Math.abs(py + 0.5 - HALF);
  const corner = dx * dx + dy * dy > HALF * HALF * 0.6;
  if (!water && corner && isWaterTile(ax) && isWaterTile(ay) && Math.sqrt(dx * dx + dy * dy) > HALF + wobble()) return WATER;
  if (water && corner && !isWaterTile(ax) && !isWaterTile(ay) && Math.sqrt(dx * dx + dy * dy) > HALF + wobble()) {
    return terrainOf(ax) === ROCK ? SAND : terrainOf(ax);
  }
  if (water) {
    // Lungo i bordi dritti: piccole insenature e sporgenze.
    const edge = Math.min(px, TILE_PX - 1 - px, py, TILE_PX - 1 - py);
    if (edge < TILE_PX * 0.12) {
      const nx = px < HALF ? tileAt(map, tx - 1, ty) : tileAt(map, tx + 1, ty);
      const ny = py < HALF ? tileAt(map, tx, ty - 1) : tileAt(map, tx, ty + 1);
      const near = Math.min(px, TILE_PX - 1 - px) < Math.min(py, TILE_PX - 1 - py) ? nx : ny;
      if (!isWaterTile(near) && edge < wobble()) return terrainOf(near) === ROCK ? SAND : terrainOf(near);
    }
    return WATER;
  }
  // Confini irregolari tra i tipi di terra.
  const block = Math.max(2, Math.round(K));
  const j = hash2(Math.floor(gx / block), Math.floor(gy / block), 7);
  const jitter = Math.round(3 * K);
  const span = jitter * 2 + 1;
  const jt = tileAt(map, Math.floor((gx + ((j % span) - jitter)) / TILE_PX), Math.floor((gy + (((j >> 3) % span) - jitter)) / TILE_PX));
  return isWaterTile(jt) ? terrainOf(t) : terrainOf(jt);
}

/** Valore liscio a bassa frequenza (0..1). */
function lowNoise(gx: number, gy: number, s: number, salt: number): number {
  const x = gx / s;
  const y = gy / s;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number) => (hash2(a, b, salt) & 1023) / 1023;
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
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
  const M = Math.ceil(3 * K);
  const TW = W + M * 2;
  const TH = H + M * 2;
  const types = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) types[y * TW + x] = pixelTerrain(map, gx0 + x - M, gy0 + y - M);
  }
  const typeAt = (x: number, y: number) => types[(y + M) * TW + (x + M)];

  // Distanze in pixel: dall'acqua alla terra (schiuma) e dalla terra all'acqua (sabbia bagnata).
  const toLand = new Float32Array(TW * TH);
  const toWater = new Float32Array(TW * TH);
  for (let i = 0; i < types.length; i++) {
    toLand[i] = types[i] === WATER ? 1e9 : 0;
    toWater[i] = types[i] === WATER ? 0 : 1e9;
  }
  chamfer(toLand, TW, TH);
  chamfer(toWater, TW, TH);
  const distLand = (x: number, y: number) => toLand[(y + M) * TW + (x + M)];
  const distWater = (x: number, y: number) => toWater[(y + M) * TW + (x + M)];

  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, c: RGB) => {
    const i = (y * W + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };

  const foamTime = K * 0.8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = gx0 + x;
      const gy = gy0 + y;
      const t = typeAt(x, y);
      const r = hash2(gx, gy);
      let c: RGB;
      if (t === WATER) {
        const dl = distLand(x, y);
        // Due linee di schiuma: una sulla riva e un'onda che si frange poco più al largo.
        const wave = lowNoise(gx, gy, TILE_PX * 0.6, 41);
        if (dl <= foamTime + wave * K * 0.6) c = FOAM;
        else if (dl <= foamTime * 2.4 && (r % 3 !== 0 || dl <= foamTime * 1.6)) c = FOAM2;
        else if (Math.abs(dl - (K * 4.2 + wave * K * 2)) < K * 0.35 && r % 4 !== 0) c = FOAM2;
        else {
          // Profondità interpolata dal campo delle distanze in caselle.
          const fx = (gx + 0.5) / TILE_PX - 0.5;
          const fy = (gy + 0.5) / TILE_PX - 0.5;
          const ix = Math.max(0, Math.min(map.width - 2, Math.floor(fx)));
          const iy = Math.max(0, Math.min(map.height - 2, Math.floor(fy)));
          const ax = Math.max(0, Math.min(1, fx - ix));
          const ay = Math.max(0, Math.min(1, fy - iy));
          const f = (i: number, j: number) => Math.min(field[(iy + j) * map.width + ix + i], 9);
          const d = (f(0, 0) * (1 - ax) + f(1, 0) * ax) * (1 - ay) + (f(0, 1) * (1 - ax) + f(1, 1) * ax) * ay;
          const shimmer = (lowNoise(gx, gy, TILE_PX * 1.3, 43) - 0.5) * 0.8;
          const level = Math.max(0, Math.min(WATER_LEVELS.length - 1, Math.floor(d * 1.25 + shimmer + (bayer(gx, gy) - 0.5) * 0.9)));
          c = WATER_LEVELS[level];
          // Piccole onde sul mare aperto: archi chiari.
          if (level >= 4) {
            const cw = Math.round(TILE_PX * 1.1);
            const ch = Math.round(TILE_PX * 0.6);
            const cellX = Math.floor(gx / cw);
            const cellY = Math.floor(gy / ch);
            const h = hash2(cellX, cellY, 11);
            const len = Math.round(K * 2.2);
            const wx = cellX * cw + (h % (cw - len));
            const wy = cellY * ch + ((h >> 6) % (ch - 3));
            const lx = gx - wx;
            if (lx >= 0 && lx < len) {
              const arc = Math.round(Math.sin((lx / len) * Math.PI) * K * 0.5);
              if (gy === wy - arc) c = mix(c, WAVE_LIGHT, 0.85);
              else if (gy === wy - arc + 1) c = mix(c, WAVE_LIGHT, 0.35);
            }
          }
        }
      } else if (t === SAND) {
        const dw = distWater(x, y);
        if (dw <= K * 1.2) c = r % 5 === 0 ? SAND_WET_DARK : SAND_WET;
        else if (dw <= K * 2 && r % 2 === 0) c = SAND_WET;
        else {
          const n = lowNoise(gx, gy, TILE_PX * 0.5, 13);
          c = r % 11 === 0 ? SAND_DARK : r % 17 === 0 ? SAND_LIGHT : n > 0.72 && (r & 3) === 0 ? SAND_DARK : SAND_C;
          // Piccole conchiglie e sassolini.
          if (r % 2003 === 0) c = SAND_LIGHT;
        }
      } else if (t === GRASS) {
        const n = lowNoise(gx, gy, TILE_PX * 2.5, 3) * 0.7 + lowNoise(gx, gy, TILE_PX * 0.6, 5) * 0.3 + (bayer(gx, gy) - 0.5) * 0.18;
        c = n < 0.34 ? GRASS_D : n < 0.48 ? GRASS_C : n < 0.62 ? GRASS_B : GRASS_A;
        // Ciuffi d'erba: una "v" scura con la punta chiara.
        const tuft = hash2(Math.floor(gx / 5), Math.floor(gy / 7), 17);
        if (tuft % 9 === 0 && (gx % 5) === 2 && (gy % 7) < 3) c = (gy % 7) === 0 ? GRASS_LIGHT : GRASS_TUFT;
        else if (r % 1500 === 0) c = FLOWERS[r % FLOWERS.length];
      } else if (t === FOREST) {
        const n = lowNoise(gx, gy, TILE_PX * 0.7, 23);
        c = n < 0.45 ? FOREST_DARK : FOREST_GROUND;
        if (r % 9 === 0) c = GRASS_TUFT;
      } else {
        // Colline rocciose: rilievo da un rumore a media frequenza, luce da nord-ovest.
        const h = (ax: number, ay: number) => lowNoise(ax, ay, TILE_PX * 0.4, 13) * 0.65 + lowNoise(ax, ay, TILE_PX * 0.16, 17) * 0.35;
        const step = Math.max(1, Math.round(K / 2));
        const slope = h(gx - step, gy - step) - h(gx + step, gy + step) + (bayer(gx, gy) - 0.5) * 0.025;
        c = slope > 0.05 ? ROCK_LIGHT : slope > 0.015 ? mix(ROCK_C, ROCK_LIGHT, 0.5) : slope < -0.05 ? ROCK_DEEP : slope < -0.015 ? ROCK_DARK : r % 7 === 0 ? ROCK_SPECK : ROCK_C;
        if (typeAt(x, y + 1) !== ROCK && typeAt(x, y + 1) !== WATER) c = ROCK_DARK;
        else if (r % 61 === 0 && lowNoise(gx, gy, TILE_PX * 0.5, 19) > 0.6) c = GRASS_C;
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

  // Alberi, cespugli e palme, anche quelli delle caselle vicine che sconfinano nel blocco.
  type Tree = { x: number; y: number; r: number; kind: 'tree' | 'bush' | 'palm'; seed: number };
  const trees: Tree[] = [];
  for (let ty = ty0 - 1; ty <= ty0 + th; ty++) {
    for (let tx = tx0 - 1; tx <= tx0 + tw; tx++) {
      const t = tileAt(map, tx, ty);
      const h = hash2(tx, ty, 21);
      if (t === Tile.Forest) {
        const n = 2 + (h % 3);
        for (let k = 0; k < n; k++) {
          const hk = hash2(tx, ty, 30 + k);
          const spread = TILE_PX - Math.round(6 * K);
          trees.push({
            x: tx * TILE_PX + Math.round(3 * K) + (hk % spread) - gx0,
            y: ty * TILE_PX + Math.round(3 * K) + ((hk >> 8) % spread) - gy0,
            r: Math.round((4 + ((hk >> 16) % 3)) * K),
            kind: 'tree',
            seed: hk,
          });
        }
      } else if (t === Tile.Grass && h % 7 === 0) {
        trees.push({ x: tx * TILE_PX + HALF + (h % 21) - 10 - gx0, y: ty * TILE_PX + HALF + ((h >> 5) % 21) - 10 - gy0, r: Math.round((3.5 + (h % 2)) * K), kind: 'tree', seed: h });
      } else if (t === Tile.Grass && h % 5 === 1) {
        trees.push({ x: tx * TILE_PX + (h % TILE_PX) - gx0, y: ty * TILE_PX + ((h >> 7) % TILE_PX) - gy0, r: Math.round(1.6 * K), kind: 'bush', seed: h });
      } else if (t === Tile.Sand && h % 6 === 0) {
        trees.push({ x: tx * TILE_PX + HALF + (h % 15) - 7 - gx0, y: ty * TILE_PX + HALF + ((h >> 4) % 15) - 7 - gy0, r: Math.round(5 * K), kind: 'palm', seed: h });
      }
    }
  }
  trees.sort((a, b) => a.y - b.y || a.x - b.x);

  const sh = Math.round(K * 0.8); // spostamento dell'ombra
  for (const tr of trees) {
    if (tr.kind === 'palm') {
      const fronds = 7;
      const rot = (tr.seed % 100) / 100;
      // Ombra delle fronde.
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rot;
        for (let s = 1; s <= tr.r; s++) {
          const w = Math.max(1, Math.round(K * 0.7 * Math.sin((s / tr.r) * Math.PI)));
          for (let k = -w; k <= w; k++) darken(Math.round(tr.x + sh * 2 + Math.cos(a) * s - Math.sin(a) * k), Math.round(tr.y + sh * 3 + Math.sin(a) * s + Math.cos(a) * k), 0.78);
        }
      }
      // Fronde: foglie larghe al centro, con la nervatura chiara.
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + rot;
        for (let s = 1; s <= tr.r; s++) {
          const w = Math.max(1, Math.round(K * 0.7 * Math.sin((s / tr.r) * Math.PI)));
          for (let k = -w; k <= w; k++) {
            const c = k === 0 ? PALM[3] : Math.abs(k) === w ? PALM[0] : s > tr.r * 0.6 ? PALM[1] : PALM[2];
            paint(Math.round(tr.x + Math.cos(a) * s - Math.sin(a) * k), Math.round(tr.y + Math.sin(a) * s + Math.cos(a) * k), c);
          }
        }
      }
      for (let k = 0; k < Math.round(K); k++) paint(tr.x + k - 1, tr.y, hex('#8a6a3a'));
      continue;
    }
    const r = tr.r;
    // Ombra proiettata verso sud-est.
    for (let y = -r; y <= r + sh * 4; y++) {
      for (let x = -r; x <= r + sh * 3; x++) {
        const sx = x - sh * 2;
        const sy = y - sh * 3;
        if (sx * sx + sy * sy <= r * r) darken(tr.x + x, tr.y + y, 0.7);
      }
    }
    if (tr.kind === 'tree') for (let k = 0; k < Math.round(K * 0.8); k++) paint(tr.x + k, tr.y + r - 1, TRUNK);
    // Chioma "a nuvola": cerchi sovrapposti con luce da nord-ovest.
    const lobes = tr.kind === 'bush' ? 1 : 5;
    for (let l = 0; l < lobes; l++) {
      const a = (l / lobes) * Math.PI * 2 + (tr.seed % 10);
      const lr = lobes === 1 ? r : r * 0.62;
      const lx = lobes === 1 ? 0 : Math.cos(a) * r * 0.38;
      const ly = lobes === 1 ? 0 : Math.sin(a) * r * 0.38;
      const R = Math.ceil(lr);
      for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
          const d2 = x * x + y * y;
          if (d2 > lr * lr) continue;
          const px = Math.round(tr.x + lx + x);
          const py = Math.round(tr.y + ly + y);
          const gnx = (lx + x) / r;
          const gny = (ly + y) / r;
          const n = (hash2(px + gx0, py + gy0, 9) % 100) / 100;
          const light = -(gnx * 0.6 + gny * 0.8) * 1.2 + (x * -0.6 + y * -0.8) / lr * 0.5 + (n - 0.5) * 0.45;
          let c = light > 0.75 ? TREE[5] : light > 0.35 ? TREE[4] : light > 0 ? TREE[3] : light > -0.4 ? TREE[2] : light > -0.8 ? TREE[1] : TREE[0];
          if (d2 > (lr - 1) * (lr - 1)) c = light > 0.3 ? TREE[3] : TREE[0];
          paint(px, py, c);
        }
      }
    }
  }

  return { width: W, height: H, data };
}

/** Anteprima di tutta la mappa a bassa risoluzione, con colori sfumati tra le caselle. */
export function renderOverview(map: TileMap, field: Float32Array, px: number): ChunkImage {
  const W = map.width * px;
  const H = map.height * px;
  const data = new Uint8ClampedArray(W * H * 4);
  const land: Record<number, RGB> = {
    [Tile.Sand]: SAND_C,
    [Tile.Grass]: GRASS_B,
    [Tile.Forest]: TREE[2],
    [Tile.Rock]: ROCK_C,
  };
  const tileColor = (tx: number, ty: number): RGB => {
    const t = tileAt(map, tx, ty);
    if (!isWaterTile(t)) return land[t] ?? GRASS_B;
    const x = Math.max(0, Math.min(map.width - 1, tx));
    const y = Math.max(0, Math.min(map.height - 1, ty));
    const d = Math.min(field[y * map.width + x], 9);
    return WATER_LEVELS[Math.max(0, Math.min(WATER_LEVELS.length - 1, Math.floor(d * 1.25)))];
  };
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / px - 0.5;
    const ty = Math.floor(fy);
    const ay = fy - ty;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / px - 0.5;
      const tx = Math.floor(fx);
      const ax = fx - tx;
      const c = mix(mix(tileColor(tx, ty), tileColor(tx + 1, ty), ax), mix(tileColor(tx, ty + 1), tileColor(tx + 1, ty + 1), ax), ay);
      const i = (y * W + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
