import { isSea, nearestSea, type Point, type TileMap } from './map';

const SQRT2 = 1.4142135623730951;
const DIRS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const k = this.keys;
    const v = this.values;
    let i = k.length;
    k.push(key);
    v.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = value;
  }

  pop(): number {
    const k = this.keys;
    const v = this.values;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        if (l >= k.length) break;
        const c = r < k.length && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/** Il segmento resta in mare, con un piccolo margine dalla costa. */
export function hasSeaLineOfSight(map: TileMap, a: Point, b: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.25);
  const m = 0.3;
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    if (
      !isSea(map, Math.floor(x - m), Math.floor(y - m)) ||
      !isSea(map, Math.floor(x + m), Math.floor(y - m)) ||
      !isSea(map, Math.floor(x - m), Math.floor(y + m)) ||
      !isSea(map, Math.floor(x + m), Math.floor(y + m))
    ) {
      return false;
    }
  }
  return true;
}

/**
 * A* sulla griglia di mare. Coordinate in caselle (float).
 * Restituisce i waypoint (centri casella, semplificati) esclusa la partenza, o null.
 */
export function findPath(map: TileMap, from: Point, to: Point): Point[] | null {
  const start = isSea(map, Math.floor(from.x), Math.floor(from.y))
    ? { x: Math.floor(from.x), y: Math.floor(from.y) }
    : nearestSea(map, from.x, from.y, 3);
  const goalExact = isSea(map, Math.floor(to.x), Math.floor(to.y));
  const goal = goalExact ? { x: Math.floor(to.x), y: Math.floor(to.y) } : nearestSea(map, to.x, to.y, 8);
  if (!start || !goal) return null;

  const w = map.width;
  const startI = start.y * w + start.x;
  const goalI = goal.y * w + goal.x;
  const end: Point = goalExact ? { x: to.x, y: to.y } : { x: goal.x + 0.5, y: goal.y + 0.5 };
  if (startI === goalI) return [end];

  const n = w * map.height;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new MinHeap();
  const h = (x: number, y: number) => {
    const ax = Math.abs(x - goal.x);
    const ay = Math.abs(y - goal.y);
    return Math.max(ax, ay) + (SQRT2 - 1) * Math.min(ax, ay);
  };
  g[startI] = 0;
  open.push(h(start.x, start.y), startI);

  while (open.size) {
    const cur = open.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isSea(map, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!isSea(map, cx + dx, cy) || !isSea(map, cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        open.push(ng + h(nx, ny), ni);
      }
    }
  }
  if (came[goalI] === -1) return null;

  const raw: Point[] = [];
  for (let i = goalI; i !== startI; i = came[i]) {
    const x = i % w;
    raw.push({ x: x + 0.5, y: (i - x) / w + 0.5 });
  }
  raw.reverse();
  raw[raw.length - 1] = end;

  // Semplificazione: salta i waypoint visibili in linea retta.
  const path: Point[] = [];
  let anchor: Point = { x: from.x, y: from.y };
  let i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !hasSeaLineOfSight(map, anchor, raw[j])) j--;
    path.push(raw[j]);
    anchor = raw[j];
    i = j + 1;
  }
  return path;
}
