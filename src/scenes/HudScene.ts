import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAR_W, FONT_KEY, fontText } from '../render/font';
import { TILE_PX, createMinimapTexture } from '../render/textures';
import { BUILDINGS, BUILDING_KINDS, SHIPS, SHIP_KINDS, TICK_RATE } from '../sim/rules';
import { canBuild, productionCost, shipKindsOf, villageIncome } from '../sim/simulation';
import { NEUTRAL, villageMaxHp, type GameEvent, type ProductionItem } from '../sim/state';
import type { WorldScene } from './WorldScene';

const TOP_H = 11;
const PANEL_Y = 204;
const MINIMAP_SCALE = 2;
const MINIMAP_X = GAME_WIDTH - 82;
const MINIMAP_Y = PANEL_Y + 1;

const COLORS = {
  panel: 0x1a1c2c,
  panelEdge: 0x333c57,
  button: 0x29366f,
  buttonOff: 0x262b44,
  text: 0xf4f4f4,
  dim: 0x94b0c2,
  gold: 0xffcd75,
  wood: 0xc28d5b,
  bad: 0xef7d57,
};

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  action: () => void;
}

interface Message {
  text: string;
  until: number;
}

export class HudScene extends Phaser.Scene {
  private world!: WorldScene;
  private g!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private textIndex = 0;
  private buttons: Button[] = [];
  private messages: Message[] = [];
  private minimapDots!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.world = this.scene.get('World') as WorldScene;
    const map = this.world.session.state.map;
    const key = `minimap-${this.world.session.state.seed}`;
    if (!this.textures.exists(key)) createMinimapTexture(this, key, map, MINIMAP_SCALE);

    this.g = this.add.graphics();
    this.add.image(MINIMAP_X, MINIMAP_Y, key).setOrigin(0, 0);
    this.minimapDots = this.add.graphics();
    this.texts = [];
    this.messages = [];

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      for (const b of this.buttons) {
        if (b.enabled && p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) {
          b.action();
          return;
        }
      }
      this.minimapClick(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.minimapClick(p);
    });

    const kb = this.input.keyboard!;
    const numbers = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
    numbers.forEach((name, i) => kb.on(`keydown-${name}`, () => this.villageAction(i)));
  }

  /** Il punto (coordinate schermo) è sopra l'interfaccia? */
  isOverUI(_x: number, y: number): boolean {
    return y < TOP_H || y >= PANEL_Y || this.world.session.state.winner !== null;
  }

  message(text: string): void {
    this.messages.push({ text: fontText(text), until: this.time.now + 5000 });
    if (this.messages.length > 4) this.messages.shift();
  }

  handleEvents(events: GameEvent[]): void {
    const me = this.world.me;
    const state = this.world.session.state;
    const villageName = (id: number) => state.villages.find((v) => v.id === id)?.name ?? '';
    for (const e of events) {
      switch (e.type) {
        case 'shipSunk':
          if (e.owner === me) this.message(`LA TUA NAVE E' STATA AFFONDATA`);
          else if (e.by === me) this.message('NAVE NEMICA AFFONDATA!');
          break;
        case 'shipCaptured':
          if (e.to === me) this.message('NAVE NEMICA ABBORDATA E CATTURATA!');
          else if (e.from === me) this.message(`UNA TUA NAVE E' STATA ABBORDATA!`);
          break;
        case 'shipBuilt':
          if (e.owner === me) this.message(`${SHIPS[e.kind].name} PRONTO AL MOLO`);
          break;
        case 'buildingDone':
          if (e.owner === me) this.message(`${BUILDINGS[e.building].name} LIVELLO ${e.level} COMPLETATO`);
          break;
        case 'villageCaptured':
          if (e.to === me) this.message(`HAI CONQUISTATO ${villageName(e.villageId)}!`);
          else if (e.from === me) this.message(`HAI PERSO ${villageName(e.villageId)}!`);
          break;
        case 'villageFounded':
          if (e.owner === me) this.message(`FONDATO IL VILLAGGIO ${villageName(e.villageId)}`);
          break;
        case 'playerEliminated':
          if (e.player !== me) this.message(`${state.players[e.player].name} E' STATO SCONFITTO`);
          break;
      }
    }
  }

  // ------------------------------------------------------------ disegno

  update(): void {
    this.g.clear();
    this.minimapDots.clear();
    this.textIndex = 0;
    this.buttons = [];

    this.drawTopBar();
    this.drawPanel();
    this.drawMinimap();
    this.drawMessages();
    this.drawGameOver();

    for (let i = this.textIndex; i < this.texts.length; i++) this.texts[i].setVisible(false);
  }

  /** Riusa gli oggetti testo tra un frame e l'altro. */
  private text(x: number, y: number, value: string, tint = COLORS.text): Phaser.GameObjects.BitmapText {
    let t = this.texts[this.textIndex];
    if (!t) {
      t = this.add.bitmapText(0, 0, FONT_KEY, '').setDepth(10);
      this.texts.push(t);
    }
    this.textIndex++;
    t.setText(value).setPosition(Math.round(x), Math.round(y)).setTint(tint).setVisible(true).setScale(1).setOrigin(0, 0).setAlpha(1);
    return t;
  }

  private drawTopBar(): void {
    const { state, paused } = this.world.session;
    const me = state.players[this.world.me];
    this.g.fillStyle(COLORS.panel, 0.92).fillRect(0, 0, GAME_WIDTH, TOP_H);
    this.g.fillStyle(COLORS.panelEdge, 1).fillRect(0, TOP_H - 1, GAME_WIDTH, 1);

    let x = 4;
    const part = (label: string, value: string, tint: number) => {
      this.text(x, 3, label, COLORS.dim);
      x += (label.length + 1) * CHAR_W;
      this.text(x, 3, value, tint);
      x += (value.length + 2) * CHAR_W;
    };
    part('ORO', String(Math.floor(me.gold)), COLORS.gold);
    part('LEGNO', String(Math.floor(me.wood)), COLORS.wood);
    part('NAVI', String(state.ships.filter((s) => s.owner === me.id).length), COLORS.text);
    part('VILLAGGI', String(state.villages.filter((v) => v.owner === me.id).length), COLORS.text);
    part('ABBORDAGGIO [B]', this.world.boardingMode ? 'SI' : 'NO', this.world.boardingMode ? COLORS.gold : COLORS.dim);

    const seconds = Math.floor(state.tick / TICK_RATE);
    const clock = `${paused ? 'PAUSA  ' : ''}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    this.text(GAME_WIDTH - 4 - clock.length * CHAR_W, 3, clock, paused ? COLORS.bad : COLORS.dim);
  }

  private drawPanel(): void {
    this.g.fillStyle(COLORS.panel, 0.95).fillRect(0, PANEL_Y, GAME_WIDTH, GAME_HEIGHT - PANEL_Y);
    this.g.fillStyle(COLORS.panelEdge, 1).fillRect(0, PANEL_Y, GAME_WIDTH, 1);

    const sel = this.world.selection;
    const state = this.world.session.state;
    if (sel.ships.length) this.drawShipsPanel();
    else if (sel.villageId !== null) this.drawVillagePanel(sel.villageId);
    else if (sel.inspectShipId !== null) {
      const s = state.ships.find((x) => x.id === sel.inspectShipId);
      if (s) {
        const owner = state.players[s.owner];
        this.text(4, PANEL_Y + 4, `${SHIPS[s.kind].name} DI ${owner.name}`, COLORS.text);
        this.text(4, PANEL_Y + 13, `PF ${Math.ceil(s.hp)}/${SHIPS[s.kind].hp}`, COLORS.dim);
        this.text(4, PANEL_Y + 26, 'SELEZIONA LE TUE NAVI E CLICCA COL DESTRO PER ATTACCARE.', COLORS.dim);
        this.text(4, PANEL_Y + 34, 'CON L\'ABBORDAGGIO ATTIVO [B] LE NAVI SOTTO IL 30% DEI PF', COLORS.dim);
        this.text(4, PANEL_Y + 42, 'VENGONO CATTURATE INVECE CHE AFFONDATE.', COLORS.dim);
      }
    } else {
      this.text(4, PANEL_Y + 4, 'COMANDI', COLORS.gold);
      this.text(4, PANEL_Y + 13, 'SINISTRO: SELEZIONA - TRASCINA PER PIU\' NAVI - SHIFT AGGIUNGE', COLORS.dim);
      this.text(4, PANEL_Y + 21, 'DESTRO: MUOVI, ATTACCA NAVI O VILLAGGI, FONDA (NAVE COLONIA)', COLORS.dim);
      this.text(4, PANEL_Y + 29, 'FRECCE/WASD: SCORRI   ROTELLA: ZOOM   H: VILLAGGIO   P: PAUSA', COLORS.dim);
      this.text(4, PANEL_Y + 37, 'B: ABBORDAGGIO   X: FERMA   1-7: COSTRUISCI NEL VILLAGGIO', COLORS.dim);
      this.text(4, PANEL_Y + 49, 'OBIETTIVO: CONQUISTA TUTTI I VILLAGGI E AFFONDA BARBANERA!', COLORS.text);
    }
  }

  private drawShipsPanel(): void {
    const state = this.world.session.state;
    const ships = state.ships.filter((s) => this.world.selection.ships.includes(s.id));
    const kinds = shipKindsOf(ships);
    const hp = ships.reduce((n, s) => n + s.hp, 0);
    const maxHp = ships.reduce((n, s) => n + SHIPS[s.kind].hp, 0);

    this.text(4, PANEL_Y + 4, ships.length === 1 ? SHIPS[ships[0].kind].name : `${ships.length} NAVI SELEZIONATE`, COLORS.text);
    this.text(4, PANEL_Y + 13, SHIP_KINDS.filter((k) => kinds[k]).map((k) => `${SHIPS[k].name} ${kinds[k]}`).join('   '), COLORS.dim);
    this.text(4, PANEL_Y + 21, `PF ${Math.ceil(hp)}/${maxHp}`, COLORS.dim);
    if (ships.length === 1) {
      const s = SHIPS[ships[0].kind];
      this.text(4, PANEL_Y + 29, s.damage ? `DANNO ${s.damage}  GITTATA ${s.range}  VELOCITA ${s.speed}` : `VELOCITA ${s.speed}`, COLORS.dim);
    }
    const hint = kinds.colony
      ? 'COLONIA: DESTRO SU UNA COSTA LIBERA PER FONDARE UN VILLAGGIO'
      : 'DESTRO: MUOVI / ATTACCA UNA NAVE O UN VILLAGGIO';
    this.text(4, PANEL_Y + 38, hint, kinds.colony ? COLORS.gold : COLORS.dim);

    const y = PANEL_Y + 47;
    this.button(4, y, 120, 'B ABBORDAGGIO: ' + (this.world.boardingMode ? 'SI' : 'NO'), '', true, () => this.world.toggleBoarding());
    this.button(128, y, 60, 'X FERMA', '', true, () => this.world.stopSelected());
  }

  private villageItems(): ProductionItem[] {
    return [
      ...SHIP_KINDS.map((ship): ProductionItem => ({ type: 'ship', ship })),
      ...BUILDING_KINDS.map((building): ProductionItem => ({ type: 'building', building })),
    ];
  }

  private villageAction(index: number): void {
    const id = this.world.selection.villageId;
    if (id === null) return;
    const item = this.villageItems()[index];
    if (item && canBuild(this.world.session.state, this.world.me, id, item)) {
      this.world.issue({ type: 'build', villageId: id, item });
    }
  }

  private drawVillagePanel(id: number): void {
    const state = this.world.session.state;
    const v = state.villages.find((x) => x.id === id);
    if (!v) return;
    const owner = state.players[v.owner];
    const mine = v.owner === this.world.me;
    const income = villageIncome(v);

    this.text(4, PANEL_Y + 3, v.name, COLORS.text);
    const ownerLabel = v.owner === NEUTRAL ? 'VILLAGGIO NEUTRALE' : mine ? 'IL TUO VILLAGGIO' : `DI ${owner.name}`;
    this.text(4 + (v.name.length + 2) * CHAR_W, PANEL_Y + 3, ownerLabel, mine ? COLORS.gold : COLORS.bad);
    this.text(4, PANEL_Y + 11, `PF ${Math.ceil(v.hp)}/${villageMaxHp(v)}`, COLORS.dim);
    const lv = BUILDING_KINDS.map((b) => `${BUILDINGS[b].name} ${v.buildings[b]}`).join('  ');
    this.text(76, PANEL_Y + 11, lv, COLORS.dim);

    if (!mine) {
      this.text(4, PANEL_Y + 26, 'ATTACCALO CON LE TUE NAVI (DESTRO): A 0 PF UNA NAVE VICINA', COLORS.dim);
      this.text(4, PANEL_Y + 34, 'LO CONQUISTA. IL FORTE LO RENDE PIU\' RESISTENTE E PERICOLOSO.', COLORS.dim);
      return;
    }

    const current = v.queue[0];
    const queueText = current
      ? `IN CORSO: ${current.item.type === 'ship' ? SHIPS[current.item.ship].name : BUILDINGS[current.item.building].name} ${Math.ceil(current.ticksLeft / TICK_RATE)}S` +
        (v.queue.length > 1 ? `  (+${v.queue.length - 1} IN CODA)` : '')
      : `RENDITA: +${income.gold.toFixed(1)} ORO  +${income.wood.toFixed(1)} LEGNO AL SECONDO`;
    this.text(4, PANEL_Y + 19, queueText, current ? COLORS.gold : COLORS.dim);

    const items = this.villageItems();
    const bw = 96;
    items.forEach((item, i) => {
      const row = i < 3 ? 0 : 1;
      const col = i < 3 ? i : i - 3;
      const x = 4 + col * (bw + 2);
      const y = PANEL_Y + 27 + row * 20;
      const cost = productionCost(v, item);
      const enabled = canBuild(state, this.world.me, v.id, item);
      let label: string;
      let sub: string;
      if (item.type === 'ship') {
        const s = SHIPS[item.ship];
        label = `${i + 1} ${s.name}`;
        sub = cost ? `${cost.gold} ORO ${cost.wood} LEGNO` : `SERVE CANTIERE ${s.shipyardLevel}`;
      } else {
        const b = BUILDINGS[item.building];
        label = `${i + 1} ${b.name} ${v.buildings[item.building] + 1}`;
        sub = cost ? `${cost.gold} ORO ${cost.wood} LEGNO` : v.buildings[item.building] >= b.maxLevel ? 'LIVELLO MASSIMO' : 'GIA\' IN CODA';
      }
      this.button(x, y, bw, label, sub, enabled, () => this.villageAction(i));
    });
  }

  private button(x: number, y: number, w: number, label: string, sub: string, enabled: boolean, action: () => void): void {
    const h = sub ? 18 : 10;
    this.g.fillStyle(enabled ? COLORS.button : COLORS.buttonOff, 1).fillRect(x, y, w, h);
    this.g.fillStyle(enabled ? 0x3b5dc9 : COLORS.panelEdge, 1).fillRect(x, y, w, 1);
    this.text(x + 3, y + 2, label, enabled ? COLORS.text : COLORS.dim);
    if (sub) this.text(x + 3, y + 10, sub, enabled ? COLORS.gold : COLORS.dim);
    this.buttons.push({ x, y, w, h, enabled, action });
  }

  private drawMinimap(): void {
    const state = this.world.session.state;
    const g = this.minimapDots;
    const w = state.map.width / MINIMAP_SCALE;
    const h = state.map.height / MINIMAP_SCALE;
    g.lineStyle(1, COLORS.panelEdge, 1).strokeRect(MINIMAP_X - 0.5, MINIMAP_Y - 0.5, w + 1, h + 1);
    const hex = (id: number) => Phaser.Display.Color.HexStringToColor(state.players[id].color).color;
    for (const v of state.villages) {
      g.fillStyle(0x1a1c2c, 1).fillRect(MINIMAP_X + Math.floor(v.x / MINIMAP_SCALE) - 2, MINIMAP_Y + Math.floor(v.y / MINIMAP_SCALE) - 2, 4, 4);
      g.fillStyle(hex(v.owner), 1).fillRect(MINIMAP_X + Math.floor(v.x / MINIMAP_SCALE) - 1, MINIMAP_Y + Math.floor(v.y / MINIMAP_SCALE) - 1, 2, 2);
    }
    for (const s of state.ships) {
      g.fillStyle(hex(s.owner), 1).fillRect(MINIMAP_X + Math.floor(s.x / MINIMAP_SCALE), MINIMAP_Y + Math.floor(s.y / MINIMAP_SCALE), 1, 1);
    }
    const view = this.world.cameras.main.worldView;
    const k = TILE_PX * MINIMAP_SCALE;
    g.lineStyle(1, 0xffffff, 0.9).strokeRect(
      MINIMAP_X + Math.round(view.x / k) + 0.5,
      MINIMAP_Y + Math.round(view.y / k) + 0.5,
      Math.round(view.width / k),
      Math.round(view.height / k),
    );
  }

  private minimapClick(p: Phaser.Input.Pointer): void {
    const map = this.world.session.state.map;
    const x = (p.x - MINIMAP_X) * MINIMAP_SCALE;
    const y = (p.y - MINIMAP_Y) * MINIMAP_SCALE;
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) this.world.centerOnTile(x, y);
  }

  private drawMessages(): void {
    const now = this.time.now;
    this.messages = this.messages.filter((m) => m.until > now);
    this.messages.forEach((m, i) => {
      const x = GAME_WIDTH - 4 - m.text.length * CHAR_W;
      this.g.fillStyle(COLORS.panel, 0.7).fillRect(x - 2, TOP_H + 3 + i * 9, m.text.length * CHAR_W + 3, 9);
      this.text(x, TOP_H + 5 + i * 9, m.text, COLORS.text).setAlpha(Math.min(1, (m.until - now) / 800));
    });
  }

  private drawGameOver(): void {
    const { winner } = this.world.session.state;
    if (winner === null) return;
    const won = winner === this.world.me;
    this.g.fillStyle(0x000000, 0.6).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const title = won ? 'VITTORIA!' : 'SCONFITTA';
    this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, title, won ? COLORS.gold : COLORS.bad).setOrigin(0.5).setScale(4);
    const sub = won ? 'I SETTE MARI SONO TUOI, CAPITANO.' : 'LA TUA FLOTTA RIPOSA IN FONDO AL MARE.';
    this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 6, sub, COLORS.text).setOrigin(0.5);
    this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 'PREMI R PER UNA NUOVA PARTITA', COLORS.dim).setOrigin(0.5);
  }
}
