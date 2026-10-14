import { mulberry32 } from './rng';

export const Tile = {
  Deep: 0,
  Shallow: 1,
  Sand: 2,
  Grass: 3,
  Forest: 4,
  Rock: 5,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export interface Point {
  x: number;
  y: number;
}

export interface TileMap {
  width: number;
  height: number;
  tiles: Uint8Array;
  /** Componente connessa d'acqua di ogni casella (-1 per la terra). */
  region: Int32Array;
  /** La regione d'acqua più grande: l'oceano navigabile. */
  mainRegion: number;
}

export interface CoastalSite {
  x: number;
  y: number;
  dock: Point;
}

export function isWaterTile(t: number): boolean {
  return t === Tile.Deep || t === Tile.Shallow;
}

export function inBounds(map: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: TileMap, x: number, y: number): number {
  return inBounds(map, x, y) ? map.tiles[y * map.width + x] : Tile.Rock;
}

/** Casella d'acqua collegata all'oceano: le navi possono solo stare qui. */
export function isSea(map: TileMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  return isWaterTile(map.tiles[i]) && map.region[i] === map.mainRegion;
}

export function isLand(map: TileMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && !isWaterTile(map.tiles[y * map.width + x]);
}

const DOCK_DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Una casella di terra affacciata sull'oceano, con l'approdo per le navi. */
export function coastalSiteAt(map: TileMap, x: number, y: number): CoastalSite | null {
  if (!isLand(map, x, y) || tileAt(map, x, y) === Tile.Rock) return null;
  for (const d of DOCK_DIRS) {
    if (isSea(map, x + d.x, y + d.y)) return { x, y, dock: { x: x + d.x, y: y + d.y } };
  }
  return null;
}

export function findCoastalSites(map: TileMap): CoastalSite[] {
  const sites: CoastalSite[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const site = coastalSiteAt(map, x, y);
      if (site) sites.push(site);
    }
  }
  return sites;
}

/** Casella di mare più vicina a (x, y) entro maxRadius, o null. */
export function nearestSea(map: TileMap, x: number, y: number, maxRadius = 8): Point | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let r = 0; r <= maxRadius; r++) {
    let best: Point | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isSea(map, cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: cx + dx, y: cy + dy };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(rng: () => number, width: number, height: number, cell: number): Float32Array {
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / cell);
    const ty = smooth((y % cell) / cell);
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(x / cell);
      const tx = smooth((x % cell) / cell);
      const a = grid[gy * gw + gx];
      const b = grid[gy * gw + gx + 1];
      const c = grid[(gy + 1) * gw + gx];
      const d = grid[(gy + 1) * gw + gx + 1];
      const top = a + (b - a) * tx;
      const bottom = c + (d - c) * tx;
      out[y * width + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** Frazione della mappa coperta da terra. */
export const LAND_SHARE = 0.3;

/** Genera un arcipelago deterministico circondato dall'oceano. */
export function generateMap(seed: number, width = 280, height = 210): TileMap {
  const rng = mulberry32(seed);
  const n1 = valueNoise(rng, width, height, 42);
  const n2 = valueNoise(rng, width, height, 17);
  const n3 = valueNoise(rng, width, height, 7);
  const tiles = new Uint8Array(width * height);
  const heights = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let h = n1[i] * 0.55 + n2[i] * 0.3 + n3[i] * 0.15;
      const nx = Math.abs((x / (width - 1)) * 2 - 1);
      const ny = Math.abs((y / (height - 1)) * 2 - 1);
      const edge = Math.max(nx, ny);
      if (edge > 0.75) h -= smooth(Math.min(1, (edge - 0.75) / 0.25)) * 0.35;
      heights[i] = h;
    }
  }

  // Soglia adattiva: ogni mappa ha la stessa quota di terra, qualunque sia il seme.
  const sorted = Float32Array.from(heights).sort();
  const level = sorted[Math.floor(sorted.length * (1 - LAND_SHARE))];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const h = heights[i];
      const border = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      let t: TileType;
      if (border || h < level - 0.04) t = Tile.Deep;
      else if (h < level) t = Tile.Shallow;
      else if (h < level + 0.025) t = Tile.Sand;
      else if (h < level + 0.085) t = Tile.Grass;
      else if (h < level + 0.19) t = Tile.Forest;
      else t = Tile.Rock;
      tiles[i] = t;
    }
  }

  const region = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < tiles.length; start++) {
    if (region[start] !== -1 || !isWaterTile(tiles[start])) continue;
    const id = sizes.length;
    let size = 0;
    region[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && region[n] === -1 && isWaterTile(tiles[n])) {
          region[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  let mainRegion = 0;
  sizes.forEach((s, id) => {
    if (s > sizes[mainRegion]) mainRegion = id;
  });

  return { width, height, tiles, region, mainRegion };
}
