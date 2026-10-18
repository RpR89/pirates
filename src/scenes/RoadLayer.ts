import Phaser from 'phaser';
import { drawRoad } from '../render/roadArt';
import { CELL_PX } from '../render/terrain';
import type { Point } from '../sim/map';
import { BUILDINGS, CITY, SUB } from '../sim/rules';
import { buildingAtCell, cellGround, cityBuildings, cityTier, isComplete, municipioOf, type City, type GameState } from '../sim/state';

interface CityRoads {
  signature: string;
  images: Phaser.GameObjects.Image[];
}

/**
 * Strade delle città: collegano la porta di ogni edificio alla piazza del municipio
 * con il percorso più breve tra le caselle libere. Solo grafica.
 */
export class RoadLayer {
  private roads = new Map<number, CityRoads>();
  private checkAt = 0;
  /** Porte collegate alla piazza, per città (diagnostica nei test). */
  readonly connected = new Map<number, { doors: number; linked: number }>();

  constructor(private scene: Phaser.Scene, private state: () => GameState) {}

  private texture(mask: number, cobbled: boolean): string {
    const key = `road-${cobbled ? 'c' : 'd'}-${mask}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawRoad(mask, cobbled).toCanvas());
    return key;
  }

  update(time: number): void {
    if (time < this.checkAt) return;
    this.checkAt = time + 700;
    const state = this.state();
    const seen = new Set<number>();
    for (const city of state.cities) {
      seen.add(city.id);
      const cobbled = cityTier(city) >= 2;
      const buildings = cityBuildings(state, city.id).filter((b) => isComplete(b) && !BUILDINGS[b.kind].line);
      // Anche la cinta conta: mura e terrapieni fermano le strade, porte e fossati no.
      const walls = cityBuildings(state, city.id).filter((b) => BUILDINGS[b.kind].line);
      const signature = `${cobbled}|${buildings.map((b) => `${b.x},${b.y}`).join(';')}|${walls.map((b) => `${b.kind[0]}${b.x},${b.y}`).join(';')}`;
      const current = this.roads.get(city.id);
      if (current?.signature === signature) continue;
      current?.images.forEach((i) => i.destroy());
      const tiles = this.network(state, city, buildings.map((b) => {
        const s = BUILDINGS[b.kind];
        return { x: b.x + Math.floor(s.w / 2), y: b.y + s.h };
      }));
      const images: Phaser.GameObjects.Image[] = [];
      for (const p of tiles.values()) {
        // Sotto porte e fossati non si disegna, ma la strada ci arriva fino al bordo.
        if (p.gate) continue;
        const mask = (tiles.has(`${p.x},${p.y - 1}`) ? 1 : 0) | (tiles.has(`${p.x + 1},${p.y}`) ? 2 : 0) | (tiles.has(`${p.x},${p.y + 1}`) ? 4 : 0) | (tiles.has(`${p.x - 1},${p.y}`) ? 8 : 0);
        images.push(this.scene.add.image(p.x * CELL_PX, p.y * CELL_PX, this.texture(mask, cobbled)).setOrigin(0, 0).setDepth(5));
      }
      this.roads.set(city.id, { signature, images });
    }
    for (const [id, r] of this.roads) {
      if (!seen.has(id)) {
        r.images.forEach((i) => i.destroy());
        this.roads.delete(id);
      }
    }
  }

  /** Caselle di strada: percorsi minimi dalle porte alla piazza (ricerca in ampiezza). */
  private network(state: GameState, city: City, doors: Point[]): Map<string, Point & { gate: boolean }> {
    const map = state.map;
    const r = (CITY.radius + 1) * SUB;
    const center = { x: (city.cx + 0.5) * SUB, y: (city.cy + 0.5) * SUB };
    // Le strade escono dalla cinta solo dalle porte e passano i fossati sui ponti,
    // mura e terrapieni le fermano.
    const gate = (x: number, y: number) => {
      const b = buildingAtCell(state, x, y);
      return !!b && (b.kind === 'porta' || b.kind === 'fossato');
    };
    const free = (x: number, y: number) =>
      cellGround(map, x, y) && (!buildingAtCell(state, x, y) || gate(x, y)) && Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y) <= r;
    const key = (x: number, y: number) => `${x},${y}`;
    const parent = new Map<string, string | null>();
    const queue: Point[] = [];
    // Le strade partono dalle caselle libere attorno al municipio, prima dalla piazza davanti.
    const m = municipioOf(state, city.id);
    const mw = BUILDINGS.municipio.w;
    const mx = m ? m.x : city.cx * SUB - 1;
    const my = m ? m.y : city.cy * SUB - 1;
    const ring: Point[] = [];
    for (let i = 0; i < mw; i++) ring.push({ x: mx + i, y: my + mw });
    for (let i = -1; i <= mw; i++) ring.push({ x: mx + i, y: my - 1 }, { x: mx + i, y: my + mw });
    for (let j = 0; j < mw; j++) ring.push({ x: mx - 1, y: my + j }, { x: mx + mw, y: my + j });
    for (const p of ring) {
      if (free(p.x, p.y) && !parent.has(key(p.x, p.y))) {
        parent.set(key(p.x, p.y), null);
        queue.push(p);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        const k = key(nx, ny);
        if (parent.has(k) || !free(nx, ny)) continue;
        parent.set(k, key(p.x, p.y));
        queue.push({ x: nx, y: ny });
      }
    }
    // Rete ad albero: ogni porta, dalla più vicina alla piazza, si allaccia alla
    // strada più conveniente (percorso minimo con costi), così i tratti si
    // riusano invece di affiancarsi, e le strade non costeggiano la cinta.
    const wall = (x: number, y: number) => {
      const b = buildingAtCell(state, x, y);
      return !!b && BUILDINGS[b.kind].line && b.kind !== 'porta';
    };
    const nearWall = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && wall(x + dx, y + dy)) return true;
      return false;
    };
    const seeds = new Set(ring.map((p) => key(p.x, p.y)).filter((k) => parent.get(k) === null));
    const out = new Map<string, Point & { gate: boolean }>();
    const starts: string[] = [];
    let linked = 0;
    for (const door of doors) {
      // Se la porta è occupata, cerca una casella libera accanto.
      const k = [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]].map(([dx, dy]) => key(door.x + dx, door.y + dy)).find((c) => parent.has(c));
      if (k) {
        linked++;
        starts.push(k);
      }
    }
    const depth = (k: string) => {
      let n = 0;
      for (let c: string | null = k; c !== null; c = parent.get(c) ?? null) n++;
      return n;
    };
    starts.sort((a, b) => depth(a) - depth(b));
    for (const startKey of starts) {
      if (out.has(startKey)) continue;
      // Dijkstra a secchi: costi interi piccoli.
      const cost = new Map<string, number>([[startKey, 0]]);
      const from = new Map<string, string | null>([[startKey, null]]);
      const buckets: string[][] = [[startKey]];
      let end: string | null = null;
      for (let c = 0; c < buckets.length && !end; c++) {
        for (const k of buckets[c] ?? []) {
          if (cost.get(k) !== c) continue;
          if (out.has(k) || seeds.has(k)) {
            end = k;
            break;
          }
          const [x, y] = k.split(',').map(Number);
          for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            const nk = key(nx, ny);
            if (!parent.has(nk)) continue;
            const step = out.has(nk) ? 1 : 3 + (nearWall(nx, ny) && !gate(nx, ny) ? 6 : 0);
            const nc = c + step;
            if (nc >= (cost.get(nk) ?? Infinity)) continue;
            cost.set(nk, nc);
            from.set(nk, k);
            (buckets[nc] ??= []).push(nk);
          }
        }
      }
      for (let k = end; k !== null; k = from.get(k) ?? null) {
        if (out.has(k) && k !== end) break;
        const [x, y] = k.split(',').map(Number);
        out.set(k, { x, y, gate: gate(x, y) });
      }
    }
    this.connected.set(city.id, { doors: doors.length, linked });
    return out;
  }
}
