import Phaser from 'phaser';
import { TILE_PX } from '../render/terrain';
import { drawRowboat, drawTrooper, troopLook } from '../render/troopArt';
import { isLand, type Point } from '../sim/map';
import { getCity, type City, type GameEvent, type GameState, type PlayerId } from '../sim/state';

/** Figure massime per schieramento: oltre, una figura rappresenta più uomini. */
const MAX_FIGURES = 28;
const WALK_SPEED = TILE_PX * 1.1; // pixel al secondo

interface Figure {
  sprite: Phaser.GameObjects.Image;
  look: string;
  target: Point;
  walking: boolean;
  dying: boolean;
}

interface Battle {
  cityId: number;
  attacker: PlayerId;
  attackers: Figure[];
  defenders: Figure[];
  /** Uomini rappresentati da ogni figura. */
  ratio: number;
  shore: Point;
  center: Point;
  /** Figure in arrivo con le scialuppe (non ancora sbarcate). */
  incoming: number;
  shotAt: number;
  ending: boolean;
}

/**
 * Lo sbarco e l'assedio visti sulla mappa: scialuppe, soldati che marciano e
 * combattono, perdite che cadono. Solo grafica: segue lo stato della simulazione.
 */
export class SiegeLayer {
  private battles = new Map<number, Battle>();

  constructor(private scene: Phaser.Scene, private state: () => GameState) {}

  lookKey(owner: PlayerId, militia = false): string {
    const faction = this.state().players[owner]?.faction ?? null;
    const id = `${militia ? 'militia' : faction ?? 'neutral'}`;
    for (const frame of [0, 1] as const) {
      const key = `trooper-${id}-${frame}`;
      if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawTrooper(troopLook(faction, militia), frame).toCanvas());
    }
    return `trooper-${id}`;
  }

  boatKey(owner: PlayerId): string {
    const faction = this.state().players[owner]?.faction ?? null;
    const key = `rowboat-${faction ?? 'neutral'}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawRowboat(troopLook(faction)).toCanvas());
    return key;
  }

  /** Punto di sbarco: la prima casella di terra dal molo verso il municipio. */
  private shoreOf(city: City): Point {
    const map = this.state().map;
    let x = city.dock.x + 0.5;
    let y = city.dock.y + 0.5;
    const dx = city.cx + 0.5 - x;
    const dy = city.cy + 0.5 - y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 20; i++) {
      if (isLand(map, Math.floor(x), Math.floor(y))) break;
      x += (dx / len) * 0.5;
      y += (dy / len) * 0.5;
    }
    return { x: x * TILE_PX, y: y * TILE_PX };
  }

  private battleFor(city: City, attacker: PlayerId): Battle {
    let b = this.battles.get(city.id);
    if (!b) {
      b = {
        cityId: city.id,
        attacker,
        attackers: [],
        defenders: [],
        ratio: 1,
        shore: this.shoreOf(city),
        center: { x: (city.cx + 0.5) * TILE_PX, y: (city.cy + 0.5) * TILE_PX },
        incoming: 0,
        shotAt: 0,
        ending: false,
      };
      this.battles.set(city.id, b);
    }
    return b;
  }

  /** Posizione nella schiera: file perpendicolari alla linea costa → municipio. */
  private slot(b: Battle, side: 'att' | 'def', i: number): Point {
    let dx = b.shore.x - b.center.x;
    let dy = b.shore.y - b.center.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // I difensori si schierano davanti al municipio, gli assalitori sulla riva:
    // le distanze si adattano allo spazio tra la costa e la città.
    const defDist = Math.min(TILE_PX * 1.9, len * 0.45);
    const attDist = Math.max(defDist + TILE_PX * 0.9, Math.min(len - TILE_PX * 0.3, defDist + TILE_PX * 2));
    const perRow = 8;
    const row = Math.floor(i / perRow);
    const col = (i % perRow) - (perRow - 1) / 2;
    const depth = (side === 'att' ? attDist : defDist) + (side === 'att' ? -row : -row) * TILE_PX * 0.3;
    const spread = col * TILE_PX * 0.36 + (((i * 37) % 7) - 3) * TILE_PX * 0.03;
    return { x: b.center.x + dx * depth - dy * spread, y: b.center.y + dy * depth + dx * spread };
  }

  private spawn(b: Battle, side: 'att' | 'def', owner: PlayerId, from: Point, militia = false): void {
    const list = side === 'att' ? b.attackers : b.defenders;
    const look = this.lookKey(owner, militia);
    const target = this.slot(b, side, list.length);
    const sprite = this.scene.add.image(from.x, from.y, `${look}-0`).setDepth(26).setOrigin(0.5, 0.9);
    sprite.setFlipX(target.x < from.x);
    list.push({ sprite, look, target, walking: true, dying: false });
  }

  private kill(f: Figure): void {
    if (f.dying) return;
    f.dying = true;
    this.scene.tweens.add({
      targets: f.sprite,
      angle: f.sprite.flipX ? -90 : 90,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeIn',
      onComplete: () => f.sprite.destroy(),
    });
  }

  handleEvents(events: GameEvent[]): void {
    const state = this.state();
    for (const e of events) {
      if (e.type === 'troopsLanded') {
        const city = getCity(state, e.cityId);
        if (!city) continue;
        const b = this.battleFor(city, e.owner);
        b.ending = false;
        b.attacker = e.owner;
        const total = (city.siege?.soldiers ?? e.soldiers);
        b.ratio = Math.max(1, Math.ceil(total / MAX_FIGURES));
        const figures = Math.max(1, Math.min(MAX_FIGURES - b.attackers.length, Math.round(e.soldiers / b.ratio)));
        this.landBoats(b, e.owner, { x: e.from.x * TILE_PX, y: e.from.y * TILE_PX }, figures);
      } else if (e.type === 'cityCaptured') {
        const b = this.battles.get(e.cityId);
        if (!b) continue;
        b.ending = true;
        for (const f of b.defenders) this.kill(f);
        // I vincitori entrano in città e si disperdono.
        for (const f of b.attackers) {
          if (f.dying) continue;
          f.target = { x: b.center.x + (Math.random() - 0.5) * TILE_PX * 1.5, y: b.center.y + (Math.random() - 0.5) * TILE_PX };
          f.walking = true;
          this.scene.tweens.add({ targets: f.sprite, alpha: 0, delay: 2200, duration: 800, onComplete: () => f.sprite.destroy() });
        }
        this.scene.time.delayedCall(3200, () => this.battles.delete(e.cityId));
      } else if (e.type === 'assaultFailed') {
        const b = this.battles.get(e.cityId);
        if (!b) continue;
        b.ending = true;
        for (const f of b.attackers) this.kill(f);
        for (const f of b.defenders) this.scene.tweens.add({ targets: f.sprite, alpha: 0, delay: 1500, duration: 800, onComplete: () => f.sprite.destroy() });
        this.scene.time.delayedCall(2500, () => this.battles.delete(e.cityId));
      }
    }
  }

  /** Scialuppe dalla nave alla riva; all'arrivo scendono i soldati. */
  private landBoats(b: Battle, owner: PlayerId, from: Point, figures: number): void {
    const boats = Math.max(1, Math.min(4, Math.ceil(figures / 7)));
    b.incoming += figures;
    const key = this.boatKey(owner);
    for (let i = 0; i < boats; i++) {
      const n = Math.floor(figures / boats) + (i < figures % boats ? 1 : 0);
      const off = (i - (boats - 1) / 2) * TILE_PX * 0.45;
      const dx = b.shore.x - from.x;
      const dy = b.shore.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const start = { x: from.x - (dy / len) * off, y: from.y + (dx / len) * off };
      const end = { x: b.shore.x - (dy / len) * off * 0.6 - (dx / len) * TILE_PX * 0.25, y: b.shore.y + (dx / len) * off * 0.6 - (dy / len) * TILE_PX * 0.25 };
      const boat = this.scene.add.image(start.x, start.y, key).setDepth(29).setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      this.scene.tweens.add({
        targets: boat,
        x: end.x,
        y: end.y,
        duration: Math.max(900, (len / (TILE_PX * 1.6)) * 1000),
        delay: i * 180,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          for (let k = 0; k < n; k++) this.spawn(b, 'att', owner, { x: end.x + (Math.random() - 0.5) * TILE_PX * 0.3, y: end.y + (Math.random() - 0.5) * TILE_PX * 0.3 });
          b.incoming = Math.max(0, b.incoming - n);
          this.scene.tweens.add({ targets: boat, x: start.x, y: start.y, alpha: 0, duration: 1600, delay: 300, onComplete: () => boat.destroy() });
        },
      });
    }
  }

  update(time: number, delta: number, puff: (x: number, y: number, color: number, count: number, spread?: number) => void): void {
    const state = this.state();
    for (const city of state.cities) {
      if (!city.siege) continue;
      const b = this.battleFor(city, city.siege.owner);
      if (b.ending) continue;
      // Difensori: guarnigione, o milizia se la guarnigione è finita.
      const garrison = city.garrison.soldiers + city.garrison.sailors;
      const militia = garrison < 0.5;
      const wantDef = militia ? Math.min(8, Math.ceil(city.population / 10)) : Math.min(MAX_FIGURES, Math.ceil(garrison / b.ratio));
      const alive = (l: Figure[]) => l.filter((f) => !f.dying);
      const defs = alive(b.defenders);
      if (defs.length < wantDef && (b.defenders.length === 0 || militia)) {
        for (let i = defs.length; i < wantDef; i++) this.spawn(b, 'def', city.owner, { x: b.center.x + (Math.random() - 0.5) * TILE_PX, y: b.center.y }, militia);
      } else if (defs.length > wantDef) {
        for (const f of defs.slice(wantDef)) this.kill(f);
      }
      // Assalitori: le perdite reali fanno cadere le figure.
      const atts = alive(b.attackers);
      const wantAtt = Math.ceil(city.siege.soldiers / b.ratio) - b.incoming;
      if (atts.length > Math.max(0, wantAtt)) {
        for (const f of atts.slice(Math.max(0, wantAtt))) this.kill(f);
      } else if (atts.length === 0 && b.incoming === 0 && wantAtt > 0) {
        // Assedio già in corso (per esempio entrando in vista): schiera subito le truppe.
        for (let i = 0; i < Math.min(MAX_FIGURES, wantAtt); i++) {
          this.spawn(b, 'att', city.siege.owner, this.slot(b, 'att', i));
        }
      }
      // Colpi di moschetto tra le schiere.
      if (time > b.shotAt) {
        b.shotAt = time + 120 + Math.random() * 200;
        const shooters = [...alive(b.attackers), ...alive(b.defenders)].filter((f) => !f.walking);
        const f = shooters[Math.floor(Math.random() * shooters.length)];
        if (f) {
          const dir = f.sprite.flipX ? -1 : 1;
          puff(f.sprite.x + dir * TILE_PX * 0.12, f.sprite.y - TILE_PX * 0.2, 0xf2efe6, 3, 3);
        }
      }
    }

    // Movimento e animazione delle figure.
    for (const b of this.battles.values()) {
      for (const f of [...b.attackers, ...b.defenders]) {
        if (!f.sprite.active || f.dying) continue;
        const dx = f.target.x - f.sprite.x;
        const dy = f.target.y - f.sprite.y;
        const d = Math.hypot(dx, dy);
        const stepLen = (WALK_SPEED * delta) / 1000;
        if (d > 1) {
          f.walking = true;
          f.sprite.x += (dx / d) * Math.min(d, stepLen);
          f.sprite.y += (dy / d) * Math.min(d, stepLen);
          f.sprite.setFlipX(dx < 0);
          f.sprite.setTexture(`${f.look}-${Math.floor(time / 180) % 2}`);
        } else if (f.walking) {
          f.walking = false;
          f.sprite.setTexture(`${f.look}-0`);
          // Fronte al nemico.
          f.sprite.setFlipX(b.attackers.includes(f) ? b.center.x < f.sprite.x : b.shore.x < f.sprite.x);
        }
        f.sprite.setDepth(26 + f.sprite.y / 100000);
      }
      b.attackers = b.attackers.filter((f) => f.sprite.active);
      b.defenders = b.defenders.filter((f) => f.sprite.active);
    }
  }
}
