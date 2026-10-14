import Phaser from 'phaser';
import { LOCAL_PLAYER, PLAYER_COLORS, gameSeed } from '../config';
import { GameSession } from '../net/session';
import { LocalTransport } from '../net/transport';
import { FONT_KEY } from '../render/font';
import { COLONY, FORT, GALLEON, SLOOP, VILLAGE } from '../render/sprites';
import { TILE_PX, createMapTexture, createPixelTexture } from '../render/textures';
import { AIController } from '../sim/ai';
import type { Command } from '../sim/commands';
import { Tile, isLand, tileAt, type Point } from '../sim/map';
import { COMBAT, SHIPS, type ShipKind } from '../sim/rules';
import {
  createGame,
  foundingSite,
  isEnemy,
  villageMaxHp,
  type GameEvent,
  type PlayerId,
  type Ship,
  type Village,
} from '../sim/state';
import type { HudScene } from './HudScene';

const SHIP_SPRITES: Record<ShipKind, readonly string[]> = { sloop: SLOOP, galleon: GALLEON, colony: COLONY };

interface ShipVisual {
  sprite: Phaser.GameObjects.Image;
  prev: Point;
  cur: Point;
  owner: PlayerId;
}

interface VillageVisual {
  sprite: Phaser.GameObjects.Image;
  key: string;
}

export interface Selection {
  ships: number[];
  villageId: number | null;
  /** Nave non nostra selezionata solo per vederne le informazioni. */
  inspectShipId: number | null;
}

const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;

export class WorldScene extends Phaser.Scene {
  session!: GameSession;
  selection: Selection = { ships: [], villageId: null, inspectShipId: null };
  boardingMode = false;

  private shipVisuals = new Map<number, ShipVisual>();
  private villageVisuals = new Map<number, VillageVisual>();
  private overlay!: Phaser.GameObjects.Graphics;
  private lastTick = -1;
  private dragStart: { world: Point; screen: Point } | null = null;
  private dragEnd: Point | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: HudScene;

  constructor() {
    super('World');
  }

  get me(): PlayerId {
    return this.session.localPlayer;
  }

  create(): void {
    const seed = gameSeed();
    const state = createGame(seed, [
      { name: 'TU', color: PLAYER_COLORS[0] },
      { name: 'BARBANERA', color: PLAYER_COLORS[1] },
    ]);
    this.session = new GameSession(state, LOCAL_PLAYER, new LocalTransport(), [new AIController(2)]);
    this.selection = { ships: [], villageId: null, inspectShipId: null };
    this.shipVisuals.clear();
    this.villageVisuals.clear();
    this.lastTick = -1;

    for (const p of state.players) {
      for (const kind of Object.keys(SHIP_SPRITES) as ShipKind[]) {
        createPixelTexture(this, `ship-${kind}-${p.id}`, SHIP_SPRITES[kind], p.color);
      }
      createPixelTexture(this, `village-${p.id}`, VILLAGE, p.color);
      createPixelTexture(this, `fort-${p.id}`, FORT, p.color);
    }

    const mapKey = `map-${seed}`;
    if (!this.textures.exists(mapKey)) createMapTexture(this, mapKey, state.map);
    this.add.image(0, 0, mapKey).setOrigin(0, 0).setDepth(0);
    this.addWaves();

    this.overlay = this.add.graphics().setDepth(50);

    const worldW = state.map.width * TILE_PX;
    const worldH = state.map.height * TILE_PX;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.setRoundPixels(true);
    const home = state.villages.find((v) => v.owner === this.me);
    if (home) this.centerOnTile(home.x, home.y);

    this.setupInput();
    this.scene.launch('Hud');
    this.hud = this.scene.get('Hud') as HudScene;
  }

  private addWaves(): void {
    const { map } = this.session.state;
    const rng = new Phaser.Math.RandomDataGenerator([String(this.session.state.seed)]);
    for (let i = 0; i < 260; i++) {
      const tx = rng.between(0, map.width - 1);
      const ty = rng.between(0, map.height - 1);
      if (tileAt(map, tx, ty) !== Tile.Deep) continue;
      const wave = this.add.image(tx * TILE_PX + 4, ty * TILE_PX + 4, 'wave').setDepth(1).setAlpha(0.7);
      this.tweens.add({
        targets: wave,
        x: wave.x + 4,
        alpha: 0.2,
        duration: rng.between(1400, 2600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: rng.between(0, 1500),
      });
    }
  }

  // ------------------------------------------------------------ input

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-B', () => this.toggleBoarding());
    kb.on('keydown-X', () => this.stopSelected());
    kb.on('keydown-H', () => this.goHome());
    kb.on('keydown-P', () => (this.session.paused = !this.session.paused));
    kb.on('keydown-ESC', () => this.clearSelection());
    kb.on('keydown-R', () => {
      if (this.session.state.winner !== null) window.location.search = '';
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.hud?.isOverUI(p.x, p.y)) return;
      if (p.rightButtonDown()) {
        this.orderAt(p.worldX, p.worldY);
      } else if (p.leftButtonDown()) {
        this.dragStart = { world: { x: p.worldX, y: p.worldY }, screen: { x: p.x, y: p.y } };
        this.dragEnd = null;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragStart && p.leftButtonDown()) this.dragEnd = { x: p.worldX, y: p.worldY };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart) return;
      const start = this.dragStart;
      this.dragStart = null;
      this.dragEnd = null;
      const moved = Math.abs(p.x - start.screen.x) + Math.abs(p.y - start.screen.y);
      if (moved < 4) this.selectAt(p.worldX, p.worldY, p.event.shiftKey);
      else this.selectBox(start.world, { x: p.worldX, y: p.worldY }, p.event.shiftKey);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -1 : 1), 1, 3));
    });
  }

  toggleBoarding(): void {
    this.boardingMode = !this.boardingMode;
  }

  stopSelected(): void {
    if (this.selection.ships.length) this.session.issue({ type: 'stop', shipIds: this.selection.ships });
  }

  goHome(): void {
    const v = this.session.state.villages.find((x) => x.owner === this.me);
    if (v) {
      this.centerOnTile(v.x, v.y);
      this.selection = { ships: [], villageId: v.id, inspectShipId: null };
    }
  }

  clearSelection(): void {
    this.selection = { ships: [], villageId: null, inspectShipId: null };
  }

  centerOnTile(tx: number, ty: number): void {
    this.cameras.main.centerOn(tx * TILE_PX + TILE_PX / 2, ty * TILE_PX + TILE_PX / 2);
  }

  issue(command: Command): void {
    this.session.issue(command);
  }

  private shipAt(wx: number, wy: number): Ship | null {
    let best: Ship | null = null;
    let bestD = 9;
    for (const s of this.session.state.ships) {
      const v = this.shipVisuals.get(s.id);
      const x = v ? v.sprite.x : s.x * TILE_PX;
      const y = v ? v.sprite.y : s.y * TILE_PX;
      const d = Math.hypot(x - wx, y - wy);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private villageAt(wx: number, wy: number): Village | null {
    for (const v of this.session.state.villages) {
      const cx = (v.x + 0.5) * TILE_PX;
      const cy = (v.y + 0.5) * TILE_PX;
      if (Math.abs(wx - cx) <= 9 && Math.abs(wy - cy) <= 9) return v;
    }
    return null;
  }

  private selectAt(wx: number, wy: number, additive: boolean): void {
    const ship = this.shipAt(wx, wy);
    if (ship && ship.owner === this.me) {
      const ships = additive ? [...new Set([...this.selection.ships, ship.id])] : [ship.id];
      this.selection = { ships, villageId: null, inspectShipId: null };
      return;
    }
    if (ship) {
      this.selection = { ships: [], villageId: null, inspectShipId: ship.id };
      return;
    }
    const village = this.villageAt(wx, wy);
    if (village) {
      this.selection = { ships: [], villageId: village.id, inspectShipId: null };
      return;
    }
    if (!additive) this.clearSelection();
  }

  private selectBox(a: Point, b: Point, additive: boolean): void {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const ids = this.session.state.ships
      .filter((s) => {
        if (s.owner !== this.me) return false;
        const v = this.shipVisuals.get(s.id);
        const x = v ? v.sprite.x : s.x * TILE_PX;
        const y = v ? v.sprite.y : s.y * TILE_PX;
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
      })
      .map((s) => s.id);
    const ships = additive ? [...new Set([...this.selection.ships, ...ids])] : ids;
    this.selection = { ships, villageId: null, inspectShipId: null };
  }

  private orderAt(wx: number, wy: number): void {
    const state = this.session.state;
    const mine = this.selection.ships
      .map((id) => state.ships.find((s) => s.id === id))
      .filter((s): s is Ship => !!s && s.owner === this.me);
    if (!mine.length) return;
    const ids = mine.map((s) => s.id);
    const tx = wx / TILE_PX;
    const ty = wy / TILE_PX;

    const ship = this.shipAt(wx, wy);
    if (ship && isEnemy(this.me, ship.owner)) {
      this.issue({ type: 'attackShip', shipIds: ids, targetId: ship.id, capture: this.boardingMode });
      this.flashMarker(wx, wy, 0xff4040);
      return;
    }
    const village = this.villageAt(wx, wy);
    if (village && village.owner !== this.me) {
      this.issue({ type: 'attackVillage', shipIds: ids, targetId: village.id });
      this.flashMarker(wx, wy, 0xff4040);
      return;
    }
    const colony = mine.find((s) => s.kind === 'colony');
    if (colony && isLand(state.map, Math.floor(tx), Math.floor(ty))) {
      if (foundingSite(state, tx, ty)) {
        this.issue({ type: 'found', shipId: colony.id, x: tx, y: ty });
        this.flashMarker(wx, wy, 0xffcd75);
      } else {
        this.hud.message('QUI NON SI PUO\' FONDARE: SERVE UNA COSTA LIBERA LONTANA DAGLI ALTRI VILLAGGI');
      }
      return;
    }
    this.issue({ type: 'move', shipIds: ids, x: tx, y: ty });
    this.flashMarker(wx, wy, 0xffffff);
  }

  private flashMarker(x: number, y: number, tint: number): void {
    const m = this.add.image(x, y, 'marker').setDepth(60).setTint(tint);
    this.tweens.add({ targets: m, alpha: 0, scale: 1.6, duration: 450, onComplete: () => m.destroy() });
  }

  // ------------------------------------------------------------ ciclo

  update(_time: number, delta: number): void {
    this.panCamera(delta);
    this.session.advance(delta);
    const events = this.session.drainEvents();
    this.syncVillages();
    this.syncShips();
    this.cleanSelection();
    this.playEvents(events);
    this.hud?.handleEvents(events);
    this.drawOverlay();
  }

  private panCamera(delta: number): void {
    const k = this.keys;
    const cam = this.cameras.main;
    const speed = (220 / cam.zoom) * (delta / 1000);
    if (k.LEFT.isDown || k.A.isDown) cam.scrollX -= speed;
    if (k.RIGHT.isDown || k.D.isDown) cam.scrollX += speed;
    if (k.UP.isDown || k.W.isDown) cam.scrollY -= speed;
    if (k.DOWN.isDown || k.S.isDown) cam.scrollY += speed;
  }

  private syncVillages(): void {
    const seen = new Set<number>();
    for (const v of this.session.state.villages) {
      seen.add(v.id);
      const key = `${v.buildings.forte > 0 ? 'fort' : 'village'}-${v.owner}`;
      let vis = this.villageVisuals.get(v.id);
      if (!vis) {
        const sprite = this.add.image((v.x + 0.5) * TILE_PX, (v.y + 0.5) * TILE_PX - 2, key).setDepth(10);
        vis = { sprite, key };
        this.villageVisuals.set(v.id, vis);
      } else if (vis.key !== key) {
        vis.sprite.setTexture(key);
        vis.key = key;
      }
    }
    for (const [id, vis] of this.villageVisuals) {
      if (!seen.has(id)) {
        vis.sprite.destroy();
        this.villageVisuals.delete(id);
      }
    }
  }

  private syncShips(): void {
    const state = this.session.state;
    const tickChanged = state.tick !== this.lastTick;
    this.lastTick = state.tick;
    const alpha = Math.min(1, this.session.alpha);
    const seen = new Set<number>();

    for (const s of state.ships) {
      seen.add(s.id);
      let vis = this.shipVisuals.get(s.id);
      if (!vis) {
        const sprite = this.add.image(s.x * TILE_PX, s.y * TILE_PX, `ship-${s.kind}-${s.owner}`);
        vis = { sprite, prev: { x: s.x, y: s.y }, cur: { x: s.x, y: s.y }, owner: s.owner };
        this.shipVisuals.set(s.id, vis);
      }
      if (tickChanged) {
        vis.prev = vis.cur;
        vis.cur = { x: s.x, y: s.y };
      }
      if (vis.owner !== s.owner) {
        vis.sprite.setTexture(`ship-${s.kind}-${s.owner}`);
        vis.owner = s.owner;
      }
      const x = vis.prev.x + (vis.cur.x - vis.prev.x) * alpha;
      const y = vis.prev.y + (vis.cur.y - vis.prev.y) * alpha;
      const dx = vis.cur.x - vis.prev.x;
      if (Math.abs(dx) > 0.01) vis.sprite.setFlipX(dx < 0);
      // Leggero beccheggio, solo estetico.
      const bob = Math.round(Math.sin((this.time.now + s.id * 400) / 500) * 0.6);
      vis.sprite.setPosition(Math.round(x * TILE_PX), Math.round(y * TILE_PX) - 3 + bob);
      vis.sprite.setDepth(20 + y / 1000);
    }
    for (const [id, vis] of this.shipVisuals) {
      if (!seen.has(id)) {
        vis.sprite.destroy();
        this.shipVisuals.delete(id);
      }
    }
  }

  private cleanSelection(): void {
    const state = this.session.state;
    const sel = this.selection;
    sel.ships = sel.ships.filter((id) => state.ships.some((s) => s.id === id && s.owner === this.me));
    if (sel.villageId !== null && !state.villages.some((v) => v.id === sel.villageId)) sel.villageId = null;
    if (sel.inspectShipId !== null && !state.ships.some((s) => s.id === sel.inspectShipId)) sel.inspectShipId = null;
  }

  private playEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'shot') {
        const ball = this.add.rectangle(e.from.x * TILE_PX, e.from.y * TILE_PX - 3, 2, 2, 0x1a1c2c).setDepth(40);
        this.tweens.add({
          targets: ball,
          x: e.to.x * TILE_PX,
          y: e.to.y * TILE_PX - 3,
          duration: 220,
          onComplete: () => {
            ball.destroy();
            this.puff(e.to.x * TILE_PX, e.to.y * TILE_PX - 3, 0xef7d57, 3);
          },
        });
        this.puff(e.from.x * TILE_PX, e.from.y * TILE_PX - 4, 0xf4f4f4, 2);
      } else if (e.type === 'shipSunk') {
        this.puff(e.x * TILE_PX, e.y * TILE_PX - 3, 0x6b3e22, 8);
        this.puff(e.x * TILE_PX, e.y * TILE_PX - 3, 0xc9f1ff, 6);
      } else if (e.type === 'shipCaptured') {
        const vis = this.shipVisuals.get(e.shipId);
        if (vis) this.floatText(vis.sprite.x, vis.sprite.y - 10, 'ABBORDATA!');
      } else if (e.type === 'villageCaptured' || e.type === 'villageFounded') {
        const vis = this.villageVisuals.get(e.villageId);
        if (vis) this.floatText(vis.sprite.x, vis.sprite.y - 12, e.type === 'villageFounded' ? 'FONDATO!' : 'CONQUISTATO!');
      }
    }
  }

  private puff(x: number, y: number, tint: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random();
      const dist = 3 + Math.random() * 5;
      const p = this.add.rectangle(x, y, 1, 1, tint).setDepth(41);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 300 + Math.random() * 300,
        onComplete: () => p.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, text: string): void {
    const t = this.add.bitmapText(Math.round(x), Math.round(y), FONT_KEY, text).setOrigin(0.5).setDepth(70);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const state = this.session.state;
    g.clear();

    const selected = new Set(this.selection.ships);
    if (this.selection.inspectShipId !== null) selected.add(this.selection.inspectShipId);

    for (const s of state.ships) {
      const vis = this.shipVisuals.get(s.id);
      if (!vis) continue;
      const { x, y, width, height } = vis.sprite;
      const max = SHIPS[s.kind].hp;
      const isSel = selected.has(s.id);
      if (isSel) {
        this.brackets(g, x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2, color(state.players[s.owner].color));
        if (s.owner === this.me) this.orderLine(g, s, x, y);
      }
      if (isSel || s.hp < max) {
        const boardable = s.hp <= max * COMBAT.captureHpRatio;
        this.hpBar(g, x, y - height / 2 - 3, 12, s.hp / max, boardable);
      }
    }

    for (const v of state.villages) {
      const vis = this.villageVisuals.get(v.id);
      if (!vis) continue;
      const { x, y, width, height } = vis.sprite;
      const max = villageMaxHp(v);
      const isSel = this.selection.villageId === v.id;
      if (isSel) this.brackets(g, x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2, color(state.players[v.owner].color));
      if (isSel || v.hp < max) this.hpBar(g, x, y - height / 2 - 3, 14, v.hp / max, false);
    }

    if (this.dragStart && this.dragEnd) {
      const a = this.dragStart.world;
      const b = this.dragEnd;
      g.lineStyle(1, 0xffffff, 0.9);
      g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
  }

  private orderLine(g: Phaser.GameObjects.Graphics, s: Ship, x: number, y: number): void {
    const state = this.session.state;
    let to: Point | null = null;
    let c = 0xffffff;
    if (s.order.type === 'attackShip') {
      const order = s.order;
      const t = state.ships.find((o) => o.id === order.targetId);
      if (t) to = { x: t.x * TILE_PX, y: t.y * TILE_PX };
      c = order.capture ? 0xffcd75 : 0xff4040;
    } else if (s.order.type === 'attackVillage') {
      const order = s.order;
      const v = state.villages.find((o) => o.id === order.targetId);
      if (v) to = { x: (v.x + 0.5) * TILE_PX, y: (v.y + 0.5) * TILE_PX };
      c = 0xff4040;
    } else if (s.path.length) {
      const end = s.path[s.path.length - 1];
      to = { x: end.x * TILE_PX, y: end.y * TILE_PX };
      c = s.order.type === 'found' ? 0xffcd75 : 0xffffff;
    }
    if (!to) return;
    g.lineStyle(1, c, 0.35);
    g.lineBetween(x, y, to.x, to.y);
  }

  private brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: number): void {
    const l = 3;
    g.fillStyle(c, 1);
    for (const [bx, by, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      g.fillRect(Math.round(sx > 0 ? bx : bx - l + 1), Math.round(by), l, 1);
      g.fillRect(Math.round(bx), Math.round(sy > 0 ? by : by - l + 1), 1, l);
    }
  }

  private hpBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, ratio: number, boardable: boolean): void {
    const x = Math.round(cx - w / 2);
    const yy = Math.round(y);
    g.fillStyle(0x1a1c2c, 1);
    g.fillRect(x - 1, yy - 1, w + 2, 4);
    g.fillStyle(0x333c57, 1);
    g.fillRect(x, yy, w, 2);
    const fill = ratio > 0.6 ? 0x38b764 : ratio > 0.3 ? 0xffcd75 : 0xb13e53;
    g.fillStyle(boardable ? 0xffcd75 : fill, 1);
    g.fillRect(x, yy, Math.max(0, Math.round(w * Math.max(0, ratio))), 2);
  }
}
