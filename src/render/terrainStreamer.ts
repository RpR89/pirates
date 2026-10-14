import Phaser from 'phaser';
import type { TileMap } from '../sim/map';
import { CHUNK_TILES, TILE_PX, renderChunk, renderOverview, waterDistanceField } from './terrain';

interface ChunkResult {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface LoadedChunk {
  image: Phaser.GameObjects.Image;
  key: string;
  lastSeen: number;
}

/** Sotto questo zoom basta l'anteprima a bassa risoluzione. */
const DETAIL_MIN_ZOOM = 0.3;
/** Blocchi tenuti in memoria al massimo (circa 1,3 MB di texture ciascuno). */
const MAX_CHUNKS = 70;
const OVERVIEW_PX = 8;

/**
 * Terreno a blocchi generati su richiesta in thread separati: si disegnano solo i
 * pezzi vicini alla visuale e si scartano quelli lontani. Sotto c'è sempre
 * un'anteprima di tutta la mappa a bassa risoluzione.
 */
export class TerrainStreamer {
  private workers: Worker[] = [];
  private nextWorker = 0;
  private detailVisible = true;
  private pending = new Set<string>();
  private loaded = new Map<string, LoadedChunk>();
  private field: Float32Array;
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly prefix: string;

  constructor(private scene: Phaser.Scene, private map: TileMap, seed: number) {
    this.field = waterDistanceField(map);
    this.chunksX = Math.ceil(map.width / CHUNK_TILES);
    this.chunksY = Math.ceil(map.height / CHUNK_TILES);
    this.prefix = `terrain-${seed}`;

    const overview = renderOverview(map, this.field, OVERVIEW_PX);
    const key = `${this.prefix}-overview`;
    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, toCanvas(overview));
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    scene.add.image(0, 0, key).setOrigin(0, 0).setScale(TILE_PX / OVERVIEW_PX).setDepth(-1);

    const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<ChunkResult>) => this.receive(e.data);
        w.postMessage({ type: 'init', map, field: this.field });
        this.workers.push(w);
      }
    } catch {
      this.workers = []; // senza worker si disegna sul thread principale, un blocco per fotogramma
    }
  }

  private chunkKey(x: number, y: number): string {
    return `${this.prefix}-${x}-${y}`;
  }

  private receive(c: ChunkResult): void {
    const key = this.chunkKey(c.x, c.y);
    this.pending.delete(key);
    if (!this.scene.sys.isActive() || this.loaded.has(key)) return;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, toCanvas(c));
    const size = CHUNK_TILES * TILE_PX;
    const image = this.scene.add.image(c.x * size, c.y * size, key).setOrigin(0, 0).setDepth(0).setAlpha(0).setVisible(this.detailVisible);
    this.scene.tweens.add({ targets: image, alpha: 1, duration: 180 });
    this.loaded.set(key, { image, key, lastSeen: this.scene.time.now });
  }

  /** Da chiamare a ogni fotogramma con la visuale della telecamera. */
  update(cam: Phaser.Cameras.Scene2D.Camera): void {
    // Da molto lontano si vede solo l'anteprima: niente mosaico di blocchi a metà.
    const detail = cam.zoom >= DETAIL_MIN_ZOOM;
    if (detail !== this.detailVisible) {
      this.detailVisible = detail;
      for (const c of this.loaded.values()) c.image.setVisible(detail);
    }
    if (!detail) return;
    const size = CHUNK_TILES * TILE_PX;
    const view = cam.worldView;
    const x0 = Math.max(0, Math.floor(view.x / size) - 1);
    const y0 = Math.max(0, Math.floor(view.y / size) - 1);
    const x1 = Math.min(this.chunksX - 1, Math.floor((view.x + view.width) / size) + 1);
    const y1 = Math.min(this.chunksY - 1, Math.floor((view.y + view.height) / size) + 1);
    const now = this.scene.time.now;
    const cx = (view.x + view.width / 2) / size;
    const cy = (view.y + view.height / 2) / size;

    const wanted: { x: number; y: number; d: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = this.chunkKey(x, y);
        const chunk = this.loaded.get(key);
        if (chunk) chunk.lastSeen = now;
        else if (!this.pending.has(key)) wanted.push({ x, y, d: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    if (this.workers.length) {
      const free = this.workers.length * 2 - this.pending.size;
      for (const w of wanted.slice(0, Math.max(0, free))) {
        this.pending.add(this.chunkKey(w.x, w.y));
        this.workers[this.nextWorker++ % this.workers.length].postMessage({ type: 'chunk', x: w.x, y: w.y });
      }
    } else if (wanted.length) {
      const w = wanted[0];
      const c = renderChunk(this.map, this.field, w.x, w.y);
      this.receive({ x: w.x, y: w.y, ...c });
    }

    // Libera i blocchi non visti da più tempo.
    if (this.loaded.size > MAX_CHUNKS) {
      const old = [...this.loaded.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [key, chunk] of old.slice(0, this.loaded.size - MAX_CHUNKS)) {
        if (chunk.lastSeen === now) break;
        chunk.image.destroy();
        this.scene.textures.remove(key);
        this.loaded.delete(key);
      }
    }
  }

  /** Quanti blocchi sono pronti (per i test). */
  get readyCount(): number {
    return this.loaded.size;
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}

function toCanvas(c: { width: number; height: number; data: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = c.width;
  canvas.height = c.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(c.data), c.width, c.height), 0, 0);
  return canvas;
}
