import Phaser from 'phaser';
import type { GameController } from '../game/controller';
import type { Keyboard } from '../game/keyboard';
import { drawBuilding, drawConstruction, buildingOverhang } from '../render/buildingArt';
import { LINE_DIRS } from '../render/fortArt';
import { toNumber } from '../render/color';
import { drawShip } from '../render/shipArt';
import { TILE_PX } from '../render/terrain';
import { TerrainStreamer } from '../render/terrainStreamer';
import { SiegeLayer } from './SiegeLayer';
import { RoadLayer } from './RoadLayer';
import { FACTIONS } from '../sim/factions';
import { isLand, type Point } from '../sim/map';
import { BUILDINGS, CITY, SHIPS, ticks, type BuildingKind, type ShipClass } from '../sim/rules';
import { buildProblem } from '../sim/simulation';
import {
  NEUTRAL,
  buildingAtTile,
  buildingOwner,
  footprintDock,
  foundingProblem,
  getCity,
  isEnemy,
  look,
  placementProblem,
  shipMaxHp,
  type Building,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Ship,
} from '../sim/state';

interface ShipVisual {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  prev: Point;
  cur: Point;
  angle: number;
  owner: PlayerId;
  wakeAt: number;
}

interface BuildingVisual {
  sprite: Phaser.GameObjects.Image;
  key: string;
  smokeAt: number;
}

export interface WorldSceneData {
  controller: GameController;
  keyboard: Keyboard;
}

const lookId = (state: GameState, owner: PlayerId) => state.players[owner]?.faction ?? 'neutral';
/** Scala delle misure in pixel della scena (tarate a 24 px per casella). */
const S = TILE_PX / 24;
/** Livelli di zoom: da lontano (anteprima) fino al dettaglio 1:1. */
const ZOOMS = [0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1];
const shipLength = (s: Ship) => SHIPS[s.cls].length * TILE_PX;

export class WorldScene extends Phaser.Scene {
  private ctl!: GameController;
  private keyboard!: Keyboard;
  private terrain!: TerrainStreamer;
  private siege!: SiegeLayer;
  roads!: RoadLayer;
  private ships = new Map<number, ShipVisual>();
  private buildings = new Map<number, BuildingVisual>();
  private overlay!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelIndex = 0;
  private lastTick = -1;
  private dragStart: { world: Point; screen: Point } | null = null;
  private dragEnd: Point | null = null;
  private panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private pointerTile: Point = { x: 0, y: 0 };
  private hoverShip: number | null = null;
  /** Inizio del tratto di mura che si sta trascinando. */
  private wallStart: Point | null = null;

  constructor() {
    super('World');
  }

  init(data: WorldSceneData): void {
    this.ctl = data.controller;
    this.keyboard = data.keyboard;
  }

  get state(): GameState {
    return this.ctl.state;
  }

  create(): void {
    const { map } = this.state;
    this.terrain = new TerrainStreamer(this, map, this.state.seed);
    this.siege = new SiegeLayer(this, () => this.state);
    this.roads = new RoadLayer(this, () => this.state);
    this.events.once('shutdown', () => this.terrain.destroy());
    this.events.once('destroy', () => this.terrain.destroy());
    this.ships.clear();
    this.buildings.clear();
    this.lastTick = -1;

    this.overlay = this.add.graphics().setDepth(80);
    this.ghost = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(85).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width * TILE_PX, map.height * TILE_PX);
    cam.setZoom(0.5);
    cam.setBackgroundColor('#1f4f80');
    this.ctl.centerOn = (p) => cam.centerOn(p.x * TILE_PX, p.y * TILE_PX);
    const home = this.state.cities.find((c) => c.owner === this.ctl.me);
    if (home) this.ctl.centerOn({ x: home.cx + 0.5, y: home.cy + 2 });

    this.setupInput();
  }

  // ------------------------------------------------------------ texture

  /** Spessore delle linee in unità del mondo: costante a schermo a ogni zoom. */
  private lw(): number {
    return 1.5 / this.cameras.main.zoom;
  }

  private shipTexture(cls: ShipClass, owner: PlayerId): string {
    const id = lookId(this.state, owner);
    const key = `ship-${cls}-${id}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, drawShip(cls, look(this.state, owner).colors).toCanvas());
    return key;
  }

  private buildingTexture(b: Building): string {
    const s = BUILDINGS[b.kind];
    if (b.buildLeft > 0) {
      const key = `site-${s.w}x${s.h}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawConstruction(s.w, s.h).toCanvas());
      return key;
    }
    return this.kindTexture(b.kind, buildingOwner(this.state, b), this.variantOf(b.kind, b.cityId, b.x, b.y));
  }

  /** Variante grafica: giunzioni per le difese a linea, orientamento per bastioni e batterie. */
  private variantOf(kind: BuildingKind, cityId: number, x: number, y: number): number {
    if (kind === 'porta') {
      // Porta in pietra se tocca le mura, di legno se sta in un terrapieno.
      const stone = LINE_DIRS.some(([dx, dy]) => {
        const b = buildingAtTile(this.state, x + dx, y + dy);
        return !!b && b.cityId === cityId && b.kind === 'mura';
      });
      return this.lineMask(kind, cityId, x, y) + (stone ? 256 : 0);
    }
    if (BUILDINGS[kind].line) return this.lineMask(kind, cityId, x, y);
    if (kind !== 'bastione' && kind !== 'batteria') return 0;
    const s = BUILDINGS[kind];
    const center = { x: x + s.w / 2, y: y + s.h / 2 };
    let toward: Point | null = null;
    if (kind === 'bastione') {
      // La punta del bastione guarda fuori dalla città.
      const city = getCity(this.state, cityId);
      if (city) toward = { x: 2 * center.x - (city.cx + 0.5), y: 2 * center.y - (city.cy + 0.5) };
    } else {
      // I cannoni della batteria guardano il mare.
      const dock = footprintDock(this.state.map, x, y, s.w, s.h);
      if (dock) toward = { x: dock.x + 0.5, y: dock.y + 0.5 };
    }
    if (!toward) return 0;
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  }

  /**
   * Giunzioni di una difesa a linea in 8 direzioni (bit come LINE_DIRS). Una giunzione
   * diagonale si usa solo se nessuno dei due lati dritti accanto è già collegato.
   * Mura e terrapieni si uniscono anche a torri, bastioni e porte; i fossati solo tra loro.
   */
  private lineMask(kind: BuildingKind, cityId: number, x: number, y: number): number {
    const partners: Record<string, BuildingKind[]> = {
      mura: ['mura', 'torre', 'bastione', 'porta'],
      terrapieno: ['terrapieno', 'torre', 'bastione', 'porta'],
      porta: ['mura', 'terrapieno', 'torre', 'bastione'],
      fossato: ['fossato'],
    };
    const joins = (dx: number, dy: number) => {
      const other = buildingAtTile(this.state, x + dx, y + dy);
      return !!other && other.cityId === cityId && partners[kind].includes(other.kind);
    };
    let mask = 0;
    LINE_DIRS.forEach(([dx, dy], i) => {
      if (!joins(dx, dy)) return;
      if (dx !== 0 && dy !== 0 && (joins(dx, 0) || joins(0, dy))) return;
      mask |= 1 << i;
    });
    return mask;
  }

  private kindTexture(kind: BuildingKind, owner: PlayerId, variant = 0): string {
    const key = `bld-${kind}-${lookId(this.state, owner)}-${variant}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, drawBuilding(kind, look(this.state, owner).colors, variant).toCanvas());
    return key;
  }

  // ------------------------------------------------------------ input

  private setupInput(): void {
    const kb = this.keyboard;
    kb.on('b', () => this.ctl.toggleBoarding());
    kb.on('x', () => this.ctl.stopSelected());
    kb.on('h', () => this.ctl.goHome());
    kb.on('p', () => this.ctl.togglePause());
    kb.on('l', () => this.ctl.selectedShips().some((s) => s.soldiers >= 1) && this.ctl.setMode({ type: 'land' }));
    kb.on('escape', () => {
      if (this.ctl.mode.type !== 'normal') this.ctl.setMode({ type: 'normal' });
      else this.ctl.select({ kind: 'none' });
    });

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown()) {
        const cam = this.cameras.main;
        this.panStart = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        return;
      }
      if (p.rightButtonDown()) {
        if (this.ctl.mode.type !== 'normal') this.ctl.setMode({ type: 'normal' });
        else this.orderAt(p.worldX, p.worldY);
        return;
      }
      if (this.ctl.mode.type === 'place') {
        if (BUILDINGS[this.ctl.mode.kind].line) this.wallStart = { ...this.pointerTile };
        else this.placeAt(p.event.shiftKey);
        return;
      }
      if (this.ctl.mode.type === 'land') {
        this.landAt(p.worldX, p.worldY);
        return;
      }
      this.dragStart = { world: { x: p.worldX, y: p.worldY }, screen: { x: p.x, y: p.y } };
      this.dragEnd = null;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerTile = { x: Math.floor(p.worldX / TILE_PX), y: Math.floor(p.worldY / TILE_PX) };
      this.hoverShip = this.shipAt(p.worldX, p.worldY)?.id ?? null;
      if (this.panStart) {
        const cam = this.cameras.main;
        cam.scrollX = this.panStart.scrollX - (p.x - this.panStart.x) / cam.zoom;
        cam.scrollY = this.panStart.scrollY - (p.y - this.panStart.y) / cam.zoom;
      }
      if (this.dragStart && p.leftButtonDown()) this.dragEnd = { x: p.worldX, y: p.worldY };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.panStart = null;
      if (this.wallStart) {
        this.placeWalls(this.wallStart, this.pointerTile);
        this.wallStart = null;
        return;
      }
      if (!this.dragStart) return;
      const start = this.dragStart;
      this.dragStart = null;
      this.dragEnd = null;
      const moved = Math.abs(p.x - start.screen.x) + Math.abs(p.y - start.screen.y);
      if (moved < 5) this.selectAt(p.worldX, p.worldY, p.event.shiftKey);
      else this.selectBox(start.world, { x: p.worldX, y: p.worldY }, p.event.shiftKey);
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      const i = ZOOMS.findIndex((z) => z >= cam.zoom - 0.001);
      cam.setZoom(ZOOMS[Phaser.Math.Clamp((i < 0 ? ZOOMS.length - 1 : i) + (dy > 0 ? -1 : 1), 0, ZOOMS.length - 1)]);
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
  }

  private shipAt(wx: number, wy: number): Ship | null {
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const s of this.state.ships) {
      const v = this.ships.get(s.id);
      if (!v) continue;
      const reach = Math.max(TILE_PX * 0.4, shipLength(s) * 0.45);
      const d = Math.hypot(v.sprite.x - wx, v.sprite.y - wy);
      if (d < reach && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private buildingAt(wx: number, wy: number): Building | null {
    for (const b of this.state.buildings) {
      const s = BUILDINGS[b.kind];
      const x0 = b.x * TILE_PX;
      const y0 = b.y * TILE_PX - (b.buildLeft > 0 ? 4 : buildingOverhang(b.kind) / 2);
      if (wx >= x0 && wx < x0 + s.w * TILE_PX && wy >= y0 && wy < (b.y + s.h) * TILE_PX) return b;
    }
    return null;
  }

  private selectAt(wx: number, wy: number, additive: boolean): void {
    const ship = this.shipAt(wx, wy);
    const me = this.ctl.me;
    if (ship && ship.owner === me) {
      const current = this.ctl.selection.kind === 'ships' && additive ? this.ctl.selection.ids : [];
      this.ctl.select({ kind: 'ships', ids: [...new Set([...current, ship.id])] });
    } else if (ship) {
      this.ctl.select({ kind: 'ship', id: ship.id });
    } else {
      const b = this.buildingAt(wx, wy);
      if (b) this.ctl.select({ kind: 'building', id: b.id });
      else if (!additive) this.ctl.select({ kind: 'none' });
    }
  }

  private selectBox(a: Point, b: Point, additive: boolean): void {
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const ids = this.state.ships
      .filter((s) => {
        const v = this.ships.get(s.id);
        return s.owner === this.ctl.me && v && v.sprite.x >= x0 && v.sprite.x <= x1 && v.sprite.y >= y0 && v.sprite.y <= y1;
      })
      .map((s) => s.id);
    const current = this.ctl.selection.kind === 'ships' && additive ? this.ctl.selection.ids : [];
    const all = [...new Set([...current, ...ids])];
    this.ctl.select(all.length ? { kind: 'ships', ids: all } : { kind: 'none' });
  }

  private orderAt(wx: number, wy: number): void {
    const ships = this.ctl.selectedShips();
    if (!ships.length) return;
    const ids = ships.map((s) => s.id);
    const me = this.ctl.me;
    const tx = wx / TILE_PX;
    const ty = wy / TILE_PX;

    const ship = this.shipAt(wx, wy);
    if (ship && isEnemy(me, ship.owner)) {
      this.ctl.issue({ type: 'attackShip', shipIds: ids, targetId: ship.id, board: this.ctl.boarding });
      this.marker(wx, wy, this.ctl.boarding ? 0xffcd75 : 0xff5a4a);
      return;
    }
    const b = this.buildingAt(wx, wy);
    if (b && buildingOwner(this.state, b) !== me) {
      this.ctl.issue({ type: 'attackBuilding', shipIds: ids, targetId: b.id });
      this.marker(wx, wy, 0xff5a4a);
      return;
    }
    const colony = ships.find((s) => s.colonists > 0);
    if (colony && isLand(this.state.map, Math.floor(tx), Math.floor(ty)) && !b) {
      const problem = foundingProblem(this.state, tx, ty);
      if (problem) this.ctl.message(`Non si può fondare qui: ${problem.toLowerCase()}.`, 'bad');
      else {
        this.ctl.issue({ type: 'found', shipId: colony.id, x: tx, y: ty });
        this.marker(wx, wy, 0xffcd75);
      }
      return;
    }
    this.ctl.issue({ type: 'move', shipIds: ids, x: tx, y: ty });
    this.marker(wx, wy, 0xffffff);
  }

  private landAt(wx: number, wy: number): void {
    const b = this.buildingAt(wx, wy);
    const city = b && getCity(this.state, b.cityId);
    const ships = this.ctl.selectedShips().filter((s) => s.soldiers >= 1);
    if (!city || city.owner === this.ctl.me) {
      this.ctl.message('Scegli una città nemica o neutrale su cui sbarcare.', 'info');
      return;
    }
    if (!ships.length) {
      this.ctl.message('Nessuna nave selezionata ha soldati a bordo.', 'bad');
      this.ctl.setMode({ type: 'normal' });
      return;
    }
    this.ctl.issue({ type: 'land', shipIds: ships.map((s) => s.id), cityId: city.id });
    this.ctl.setMode({ type: 'normal' });
    this.marker(wx, wy, 0xffcd75);
  }

  private placementOrigin(kind: BuildingKind): Point {
    const s = BUILDINGS[kind];
    return { x: this.pointerTile.x - Math.floor((s.w - 1) / 2), y: this.pointerTile.y - Math.floor((s.h - 1) / 2) };
  }

  private placeAt(keepPlacing: boolean): void {
    const mode = this.ctl.mode;
    if (mode.type !== 'place') return;
    const at = this.placementOrigin(mode.kind);
    const problem = buildProblem(this.state, this.ctl.me, mode.cityId, mode.kind, at.x, at.y);
    if (problem) {
      this.ctl.message(problem, 'bad');
      return;
    }
    this.ctl.issue({ type: 'placeBuilding', cityId: mode.cityId, kind: mode.kind, x: at.x, y: at.y });
    if (!keepPlacing) this.ctl.setMode({ type: 'normal' });
  }

  private marker(x: number, y: number, tint: number): void {
    const g = this.add.graphics().setDepth(90);
    g.lineStyle(this.lw(), tint, 1);
    g.strokeCircle(0, 0, 4 * S);
    g.setPosition(x, y);
    this.tweens.add({ targets: g, scale: 2.2, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  // ------------------------------------------------------------ ciclo

  update(time: number, delta: number): void {
    this.panCamera(delta);
    this.terrain.update(this.cameras.main);
    this.ctl.session.advance(delta);
    const events = this.ctl.session.drainEvents();
    this.ctl.cleanSelection();
    this.roads.update(time);
    this.syncBuildings(time);
    this.syncShips(time);
    this.playEvents(events);
    this.siege.handleEvents(events);
    this.siege.update(time, delta, (x, y, c, n, spread) => this.puff(x, y, c, n, spread));
    if (events.length) this.ctl.handleEvents(events);
    this.drawOverlay();
    this.updateGhost();

    const view = this.cameras.main.worldView;
    this.ctl.view = { x: view.x / TILE_PX, y: view.y / TILE_PX, w: view.width / TILE_PX, h: view.height / TILE_PX };
  }

  private panCamera(delta: number): void {
    const k = this.keyboard;
    const cam = this.cameras.main;
    const speed = (700 / cam.zoom) * (delta / 1000);
    if (k.isDown('arrowleft', 'a')) cam.scrollX -= speed;
    if (k.isDown('arrowright', 'd')) cam.scrollX += speed;
    if (k.isDown('arrowup', 'w')) cam.scrollY -= speed;
    if (k.isDown('arrowdown', 's')) cam.scrollY += speed;
  }

  private syncBuildings(time: number): void {
    const seen = new Set<number>();
    for (const b of this.state.buildings) {
      seen.add(b.id);
      const key = this.buildingTexture(b);
      const s = BUILDINGS[b.kind];
      let vis = this.buildings.get(b.id);
      if (!vis) {
        const sprite = this.add.image(0, 0, key).setOrigin(0, 1);
        vis = { sprite, key, smokeAt: 0 };
        this.buildings.set(b.id, vis);
      }
      if (vis.key !== key) {
        vis.sprite.setTexture(key);
        vis.key = key;
      }
      vis.sprite.setPosition(b.x * TILE_PX, (b.y + s.h) * TILE_PX).setDepth(10 + (b.y + s.h) / 1000);
      // Fumo dagli edifici danneggiati.
      if (b.buildLeft <= 0 && b.hp < s.hp * 0.5 && time > vis.smokeAt) {
        vis.smokeAt = time + 250 + Math.random() * 300;
        this.smoke((b.x + Math.random() * s.w) * TILE_PX, (b.y + Math.random() * s.h) * TILE_PX);
      }
    }
    for (const [id, vis] of this.buildings) {
      if (!seen.has(id)) {
        vis.sprite.destroy();
        this.buildings.delete(id);
      }
    }
  }

  private syncShips(time: number): void {
    const state = this.state;
    const tickChanged = state.tick !== this.lastTick;
    this.lastTick = state.tick;
    const alpha = Math.min(1, this.ctl.session.alpha);
    const seen = new Set<number>();

    for (const s of state.ships) {
      seen.add(s.id);
      let vis = this.ships.get(s.id);
      if (!vis) {
        const key = this.shipTexture(s.cls, s.owner);
        const shadow = this.add.image(0, 0, key).setTint(0x0b1f3a).setTintMode(Phaser.TintModes.FILL).setAlpha(0.35).setDepth(19);
        const sprite = this.add.image(0, 0, key).setDepth(30);
        vis = { sprite, shadow, prev: { x: s.x, y: s.y }, cur: { x: s.x, y: s.y }, angle: Math.PI / 2, owner: s.owner, wakeAt: 0 };
        this.ships.set(s.id, vis);
      }
      if (tickChanged) {
        vis.prev = vis.cur;
        vis.cur = { x: s.x, y: s.y };
      }
      if (vis.owner !== s.owner) {
        const key = this.shipTexture(s.cls, s.owner);
        vis.sprite.setTexture(key);
        vis.shadow.setTexture(key);
        vis.owner = s.owner;
      }
      const x = (vis.prev.x + (vis.cur.x - vis.prev.x) * alpha) * TILE_PX;
      const y = (vis.prev.y + (vis.cur.y - vis.prev.y) * alpha) * TILE_PX;
      const dx = vis.cur.x - vis.prev.x;
      const dy = vis.cur.y - vis.prev.y;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.001;
      if (moving) {
        const target = Math.atan2(dy, dx);
        let diff = target - vis.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        vis.angle += diff * Math.min(1, 0.12 * (this.game.loop.delta / 16.7));
      }
      const rot = vis.angle + Math.PI / 2;
      const bob = Math.sin((time + s.id * 500) / 700) * 0.04;
      vis.sprite.setPosition(x, y).setRotation(rot + bob);
      vis.shadow.setPosition(x + 2 * S, y + 3 * S).setRotation(rot + bob);

      if (moving && time > vis.wakeAt) {
        vis.wakeAt = time + 90;
        const back = shipLength(s) / 2;
        this.wake(x - Math.cos(vis.angle) * back, y - Math.sin(vis.angle) * back, vis.angle);
      }
    }
    for (const [id, vis] of this.ships) {
      if (!seen.has(id)) {
        vis.sprite.destroy();
        vis.shadow.destroy();
        this.ships.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ effetti

  private wake(x: number, y: number, angle: number): void {
    for (const side of [-1, 1]) {
      const px = x + Math.cos(angle + Math.PI / 2) * side * 2 * S;
      const py = y + Math.sin(angle + Math.PI / 2) * side * 2 * S;
      const p = this.add.rectangle(px, py, S * 1.2, S * 1.2, 0xeefaf6, 0.8).setDepth(18);
      this.tweens.add({
        targets: p,
        x: px + Math.cos(angle + Math.PI / 2) * side * 4 * S,
        y: py + Math.sin(angle + Math.PI / 2) * side * 4 * S,
        alpha: 0,
        duration: 900,
        onComplete: () => p.destroy(),
      });
    }
  }

  private smoke(x: number, y: number): void {
    const p = this.add.circle(x, y, (2 + Math.random() * 2) * S, 0x55524c, 0.6).setDepth(60);
    this.tweens.add({ targets: p, y: y - 14 * S, x: x + 5 * S, alpha: 0, scale: 2, duration: 1600, onComplete: () => p.destroy() });
  }

  private puff(x: number, y: number, color: number, count: number, spread = 6): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random();
      const d = spread * S * (0.5 + Math.random());
      const p = this.add.rectangle(x, y, 2 * S, 2 * S, color).setDepth(70);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 350 + Math.random() * 350, onComplete: () => p.destroy() });
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: '"Pixelify Sans"', fontSize: '16px', color, stroke: '#1b1712', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(95)
      .setScale(1 / this.cameras.main.zoom)
      .setResolution(2);
    this.tweens.add({ targets: t, y: y - 16 * S, alpha: 0, duration: 1800, onComplete: () => t.destroy() });
  }

  private playEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const fx = e.from.x * TILE_PX;
          const fy = e.from.y * TILE_PX;
          const tx = e.to.x * TILE_PX + (Math.random() - 0.5) * 6 * S;
          const ty = e.to.y * TILE_PX + (Math.random() - 0.5) * 6 * S;
          this.puff(fx, fy, 0xf2efe6, 4, 4);
          const ball = this.add.circle(fx, fy, 1.2 * S, 0x1b1712).setDepth(75);
          this.tweens.add({
            targets: ball, x: tx, y: ty, duration: 260,
            onComplete: () => {
              ball.destroy();
              this.puff(tx, ty, 0xef7d57, 5, 5);
              this.puff(tx, ty, 0x55524c, 3, 7);
            },
          });
          break;
        }
        case 'shipSunk':
          this.puff(e.x * TILE_PX, e.y * TILE_PX, 0x6b4a2e, 12, 12);
          this.puff(e.x * TILE_PX, e.y * TILE_PX, 0xeefaf6, 10, 16);
          break;
        case 'shipCaptured': {
          const v = this.ships.get(e.shipId);
          if (v) this.floatText(v.sprite.x, v.sprite.y - 18 * S, 'Arrembaggio!', '#ffcd75');
          break;
        }
        case 'buildingDestroyed':
          this.puff(e.x * TILE_PX, e.y * TILE_PX, 0x8a6a40, 14, 14);
          for (let i = 0; i < 5; i++) this.smoke(e.x * TILE_PX + (Math.random() - 0.5) * 10, e.y * TILE_PX);
          break;
        case 'cityCaptured':
        case 'cityFounded': {
          const city = getCity(this.state, e.cityId);
          if (city) this.floatText((city.cx + 0.5) * TILE_PX, city.cy * TILE_PX - 20 * S, e.type === 'cityFounded' ? 'Fondata!' : 'Conquistata!', '#ffcd75');
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ sovrimpressioni

  private label(x: number, y: number, text: string, color = '#f1e3c2'): void {
    let t = this.labels[this.labelIndex];
    if (!t) {
      t = this.add
        .text(0, 0, '', { fontFamily: '"Pixelify Sans"', fontSize: '15px', color, stroke: '#1b1712', strokeThickness: 4 })
        .setOrigin(0.5, 1)
        .setDepth(96)
        .setResolution(2);
      this.labels.push(t);
    }
    this.labelIndex++;
    const zoom = this.cameras.main.zoom;
    t.setText(text).setColor(color).setPosition(x, y).setScale(1 / zoom).setVisible(true);
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const state = this.state;
    const me = this.ctl.me;
    const sel = this.ctl.selection;
    g.clear();
    this.labelIndex = 0;

    const selectedShips = new Set(sel.kind === 'ships' ? sel.ids : sel.kind === 'ship' ? [sel.id] : []);

    for (const s of state.ships) {
      const v = this.ships.get(s.id);
      if (!v) continue;
      const max = shipMaxHp(state, s);
      const isSel = selectedShips.has(s.id);
      const color = toNumber(FACTION_COLOR(state, s.owner));
      const len = shipLength(s);
      if (isSel) {
        g.lineStyle(this.lw(), color, 1);
        g.strokeCircle(v.sprite.x, v.sprite.y, len * 0.6);
        if (s.owner === me) this.orderLine(g, s, v.sprite.x, v.sprite.y);
      }
      if (isSel || s.hp < max || this.hoverShip === s.id) {
        this.hpBar(g, v.sprite.x, v.sprite.y - len * 0.6 - 4 * S, 18 * S, s.hp / max);
      }
      if (isSel || this.hoverShip === s.id) this.label(v.sprite.x, v.sprite.y - len * 0.6 - 8 * S, s.name, s.owner === me ? '#f1e3c2' : '#ffb59e');
    }

    const selBuilding = this.ctl.selectedBuilding();
    for (const b of state.buildings) {
      const s = BUILDINGS[b.kind];
      const x = b.x * TILE_PX;
      const y = b.y * TILE_PX;
      if (selBuilding?.id === b.id) {
        g.lineStyle(this.lw(), 0xffffff, 1);
        this.brackets(g, x - 1, y - 1, s.w * TILE_PX + 2, s.h * TILE_PX + 2);
      }
      if (b.buildLeft > 0) {
        const total = ticks(s.buildSeconds);
        this.bar(g, x + s.w * TILE_PX / 2, y - 3 * S, s.w * TILE_PX - 4 * S, 1 - b.buildLeft / total, 0xe3b23c);
      } else if (b.hp < s.hp) {
        this.hpBar(g, x + s.w * TILE_PX / 2, y - buildingOverhang(b.kind) - 3 * S, Math.min(30 * S, s.w * TILE_PX), b.hp / s.hp);
      }
    }

    // Capitani: una stella d'oro sopra la nave o il municipio dove si trovano.
    for (const hero of state.heroes) {
      const loc = hero.location;
      let at: Point | null = null;
      if (loc.type === 'ship') {
        const v = this.ships.get(loc.shipId);
        const ship = state.ships.find((x) => x.id === loc.shipId);
        if (v && ship) at = { x: v.sprite.x, y: v.sprite.y - shipLength(ship) * 0.6 - 12 * S };
      } else if (loc.type === 'city') {
        const c = getCity(state, loc.cityId);
        if (c) at = { x: (c.cx + 0.5) * TILE_PX + TILE_PX * 1.2, y: (c.cy - 1) * TILE_PX - 18 * S };
      }
      if (!at) continue;
      this.star(g, at.x, at.y, hero.owner === me ? 0xffd54a : 0xff8a6a);
      if (hero.owner === me && loc.type === 'ship') this.label(at.x, at.y - 6 * S, hero.name, '#ffe7a3');
    }

    // Città: nome, territorio della città selezionata e assedi.
    const focus = selBuilding ? getCity(state, selBuilding.cityId) : null;
    const placing = this.ctl.mode.type === 'place' ? getCity(state, this.ctl.mode.cityId) : null;
    for (const c of state.cities) {
      const px = (c.cx + 0.5) * TILE_PX;
      const py = (c.cy + 0.5) * TILE_PX;
      if (c === focus || c === placing) {
        g.lineStyle(this.lw(), 0xf1e3c2, 0.45);
        g.strokeCircle(px, py, CITY.radius * TILE_PX);
      }
      this.label(px, (c.cy - 1) * TILE_PX - 14 * S, c.name, c.owner === me ? '#ffe7a3' : c.owner === NEUTRAL ? '#d8d2c0' : '#ffb59e');
      if (c.siege) {
        const attacker = state.players[c.siege.owner];
        const def = Math.ceil(c.garrison.soldiers + c.garrison.sailors);
        this.label(px, (c.cy + 2) * TILE_PX + 12 * S, `Assedio: ${Math.ceil(c.siege.soldiers)} ${attacker?.name ?? ''} contro ${def}`, '#ff8a6a');
      }
    }

    if (this.dragStart && this.dragEnd) {
      const a = this.dragStart.world;
      const b = this.dragEnd;
      g.lineStyle(this.lw(), 0xffffff, 0.9);
      g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }

    for (let i = this.labelIndex; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  /** Caselle di una linea a 4 connessioni (i tratti di mura restano uniti). */
  /** Caselle di una linea (anche in diagonale): le mura seguono il trascinamento. */
  private wallLine(a: Point, b: Point): Point[] {
    const out: Point[] = [];
    const dx = Math.abs(b.x - a.x);
    const dy = -Math.abs(b.y - a.y);
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    let err = dx + dy;
    let { x, y } = a;
    for (;;) {
      out.push({ x, y });
      if ((x === b.x && y === b.y) || out.length >= 60) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return out;
  }

  private placeWalls(a: Point, b: Point): void {
    const mode = this.ctl.mode;
    if (mode.type !== 'place') return;
    const kind = mode.kind;
    const tiles = this.wallLine(a, b).filter((t) => !buildProblem(this.state, this.ctl.me, mode.cityId, kind, t.x, t.y));
    if (!tiles.length) {
      this.ctl.message(buildProblem(this.state, this.ctl.me, mode.cityId, kind, b.x, b.y) ?? 'Qui non si può costruire', 'bad');
      return;
    }
    for (const t of tiles) this.ctl.issue({ type: 'placeBuilding', cityId: mode.cityId, kind, x: t.x, y: t.y });
  }

  private updateGhost(): void {
    const mode = this.ctl.mode;
    if (mode.type !== 'place') {
      this.ghost.setVisible(false);
      return;
    }
    if (BUILDINGS[mode.kind].line) {
      // Anteprima del tratto: verde dove si può costruire, rosso altrove.
      this.ghost.setVisible(false);
      const g = this.overlay;
      const me = this.state.players[this.ctl.me];
      let budget = { gold: me.gold, wood: me.wood };
      for (const t of this.wallLine(this.wallStart ?? this.pointerTile, this.pointerTile)) {
        const cost = BUILDINGS[mode.kind].cost;
        const ok = !placementProblem(this.state, this.ctl.me, mode.cityId, mode.kind, t.x, t.y) && budget.gold >= cost.gold && budget.wood >= cost.wood;
        if (ok) budget = { gold: budget.gold - cost.gold, wood: budget.wood - cost.wood };
        g.fillStyle(ok ? 0x7dff7d : 0xff5a4a, 0.35).fillRect(t.x * TILE_PX, t.y * TILE_PX, TILE_PX, TILE_PX);
        g.lineStyle(this.lw(), ok ? 0x7dff7d : 0xff5a4a, 0.9).strokeRect(t.x * TILE_PX, t.y * TILE_PX, TILE_PX, TILE_PX);
      }
      return;
    }
    const at = this.placementOrigin(mode.kind);
    const s = BUILDINGS[mode.kind];
    const ok = !buildProblem(this.state, this.ctl.me, mode.cityId, mode.kind, at.x, at.y);
    this.ghost
      .setTexture(this.kindTexture(mode.kind, this.ctl.me, this.variantOf(mode.kind, mode.cityId, at.x, at.y)))
      .setOrigin(0, 1)
      .setPosition(at.x * TILE_PX, (at.y + s.h) * TILE_PX)
      .setAlpha(0.75)
      .setTint(ok ? 0xa8ffa8 : 0xff8080)
      .setVisible(true);
    const g = this.overlay;
    g.lineStyle(this.lw(), ok ? 0x7dff7d : 0xff5a4a, 1);
    g.strokeRect(at.x * TILE_PX, at.y * TILE_PX, s.w * TILE_PX, s.h * TILE_PX);
  }

  private orderLine(g: Phaser.GameObjects.Graphics, s: Ship, x: number, y: number): void {
    const state = this.state;
    let to: Point | null = null;
    let c = 0xffffff;
    const o = s.order;
    if (o.type === 'attackShip') {
      const t = state.ships.find((x) => x.id === o.targetId);
      if (t) to = { x: t.x * TILE_PX, y: t.y * TILE_PX };
      c = o.board ? 0xffcd75 : 0xff5a4a;
    } else if (o.type === 'attackBuilding') {
      const b = state.buildings.find((x) => x.id === o.targetId);
      if (b) to = { x: (b.x + BUILDINGS[b.kind].w / 2) * TILE_PX, y: (b.y + BUILDINGS[b.kind].h / 2) * TILE_PX };
      c = 0xff5a4a;
    } else if (o.type === 'land') {
      const city = getCity(state, o.cityId);
      if (city) to = { x: (city.dock.x + 0.5) * TILE_PX, y: (city.dock.y + 0.5) * TILE_PX };
      c = 0xffcd75;
    } else if (s.path.length) {
      const end = s.path[s.path.length - 1];
      to = { x: end.x * TILE_PX, y: end.y * TILE_PX };
      c = o.type === 'found' ? 0xffcd75 : 0xffffff;
    }
    if (!to) return;
    g.lineStyle(this.lw(), c, 0.4);
    g.lineBetween(x, y, to.x, to.y);
    g.fillStyle(c, 0.8);
    g.fillCircle(to.x, to.y, 1.5 * S);
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 2.2 : 5) * S;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    g.fillStyle(0x1b1712, 1).fillCircle(x, y, 6 * S);
    g.fillStyle(color, 1).fillPoints(pts, true);
  }

  private brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const l = 4 * S;
    g.lineBetween(x, y, x + l, y);
    g.lineBetween(x, y, x, y + l);
    g.lineBetween(x + w, y, x + w - l, y);
    g.lineBetween(x + w, y, x + w, y + l);
    g.lineBetween(x, y + h, x + l, y + h);
    g.lineBetween(x, y + h, x, y + h - l);
    g.lineBetween(x + w, y + h, x + w - l, y + h);
    g.lineBetween(x + w, y + h, x + w, y + h - l);
  }

  private bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, ratio: number, color: number): void {
    const x = Math.round(cx - w / 2);
    const h = 2 * S;
    g.fillStyle(0x1b1712, 1).fillRect(x - S, y - S, w + 2 * S, h + 2 * S);
    g.fillStyle(0x3a3328, 1).fillRect(x, y, w, h);
    g.fillStyle(color, 1).fillRect(x, y, Math.max(0, w * Math.min(1, ratio)), h);
  }

  private hpBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, ratio: number): void {
    this.bar(g, cx, y, w, ratio, ratio > 0.6 ? 0x5bc04a : ratio > 0.3 ? 0xe3b23c : 0xd9473a);
  }
}

/** Colore distintivo di un giocatore (bandiera, o un colore leggibile per i pirati). */
export function FACTION_COLOR(state: GameState, owner: PlayerId): string {
  const f = state.players[owner]?.faction;
  if (!f) return '#d8d2c0';
  return f === 'pirati' ? '#e8e8e8' : FACTIONS[f].colors.flag === '#c8a227' ? '#e3b23c' : FACTIONS[f].colors.flag;
}

