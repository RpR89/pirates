import Phaser from 'phaser';
import { drawRoad } from '../render/roadArt';
import { TILE_PX } from '../render/terrain';
import { Tile, isLand, tileAt, type Point } from '../sim/map';
import { BUILDINGS, CITY } from '../sim/rules';
import { buildingAtTile, cityBuildings, cityTier, isComplete, type City, type GameState } from '../sim/state';

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
        images.push(this.scene.add.image(p.x * TILE_PX, p.y * TILE_PX, this.texture(mask, cobbled)).setOrigin(0, 0).setDepth(5));
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
    const r = CITY.radius + 1;
    // Le strade escono dalla cinta solo dalle porte e passano i fossati sui ponti,
    // mura e terrapieni le fermano.
    const gate = (x: number, y: number) => {
      const b = buildingAtTile(state, x, y);
      return !!b && (b.kind === 'porta' || b.kind === 'fossato');
    };
    const free = (x: number, y: number) =>
      isLand(map, x, y) && tileAt(map, x, y) !== Tile.Rock && (!buildingAtTile(state, x, y) || gate(x, y)) &&
      Math.hypot(x - city.cx, y - city.cy) <= r;
    const plaza = { x: city.cx, y: city.cy + 2 };
    const key = (x: number, y: number) => `${x},${y}`;
    const parent = new Map<string, string | null>();
    const queue: Point[] = [];
    // Le strade partono dalla piazza sotto il municipio o, se non c'è spazio, da
    // qualunque casella libera attorno al municipio.
    const ring: Point[] = [];
    for (let dx = -1; dx <= 1; dx++) ring.push({ x: plaza.x + dx, y: plaza.y });
    for (let i = -2; i <= 2; i++) ring.push({ x: city.cx + i, y: city.cy - 2 }, { x: city.cx - 2, y: city.cy + i }, { x: city.cx + 2, y: city.cy + i });
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
    const out = new Map<string, Point & { gate: boolean }>();
    let linked = 0;
    for (const door of doors) {
      // Se la porta è occupata, cerca una casella libera accanto.
      let start: string | null = null;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const k = key(door.x + dx, door.y + dy);
        if (parent.has(k)) {
          start = k;
          break;
        }
      }
      if (start) linked++;
      for (let k = start; k !== null && !out.has(k); k = parent.get(k) ?? null) {
        const [x, y] = k.split(',').map(Number);
        out.set(k, { x, y, gate: gate(x, y) });
      }
    }
    this.connected.set(city.id, { doors: doors.length, linked });
    return out;
  }
}
