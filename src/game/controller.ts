import { GameSession } from '../net/session';
import { LocalTransport } from '../net/transport';
import { AIController } from '../sim/ai';
import type { Command } from '../sim/commands';
import { FACTIONS, FACTION_IDS, type FactionId } from '../sim/factions';
import type { Point } from '../sim/map';
import { mulberry32, shuffle } from '../sim/rng';
import { BUILDINGS, SHIPS, type BuildingKind } from '../sim/rules';
import {
  createGame,
  getBuilding,
  getCity,
  getShip,
  type Building,
  type City,
  type GameEvent,
  type PlayerId,
  type Ship,
} from '../sim/state';

export const LOCAL_PLAYER: PlayerId = 1;

export interface GameSetup {
  faction: FactionId;
  captain: string;
  rivals: number;
  seed: number;
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'ships'; ids: number[] }
  | { kind: 'ship'; id: number } // nave altrui, solo informazioni
  | { kind: 'building'; id: number };

export type Mode =
  | { type: 'normal' }
  | { type: 'place'; kind: BuildingKind; cityId: number }
  | { type: 'land' };

export type Tone = 'good' | 'bad' | 'info';

export interface Message {
  id: number;
  text: string;
  tone: Tone;
  at: number;
}

/**
 * Ponte tra simulazione, scena Phaser e interfaccia: tiene sessione, selezione,
 * modalità di input e messaggi. Non modifica mai lo stato di gioco: emette comandi.
 */
export class GameController {
  readonly session: GameSession;
  selection: Selection = { kind: 'none' };
  mode: Mode = { type: 'normal' };
  boarding = false;
  messages: Message[] = [];
  /** Imposta dalla scena: centra la telecamera su un punto (caselle). */
  centerOn: (p: Point) => void = () => {};
  /** Area visibile della telecamera, in caselle (per la minimappa). */
  view = { x: 0, y: 0, w: 0, h: 0 };

  private listeners = new Set<() => void>();
  private messageId = 0;

  constructor(readonly setup: GameSetup) {
    const rng = mulberry32(setup.seed ^ 0x5bd1e995);
    const others = shuffle(FACTION_IDS.filter((f) => f !== setup.faction), rng).slice(0, setup.rivals);
    const state = createGame(setup.seed, [
      { name: setup.captain || 'Capitano', faction: setup.faction },
      ...others.map((f) => ({ name: FACTIONS[f].leader, faction: f })),
    ]);
    const ais = others.map((_, i) => new AIController(i + 2));
    this.session = new GameSession(state, LOCAL_PLAYER, new LocalTransport(), ais);
  }

  get state() {
    return this.session.state;
  }

  get me(): PlayerId {
    return this.session.localPlayer;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  issue(command: Command): void {
    this.session.issue(command);
    this.emit();
  }

  select(selection: Selection): void {
    this.selection = selection;
    if (this.mode.type === 'land') this.mode = { type: 'normal' };
    this.emit();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.emit();
  }

  toggleBoarding(): void {
    this.boarding = !this.boarding;
    this.emit();
  }

  togglePause(): void {
    this.session.paused = !this.session.paused;
    this.emit();
  }

  message(text: string, tone: Tone = 'info'): void {
    this.messages = [...this.messages.slice(-5), { id: this.messageId++, text, tone, at: performance.now() }];
    this.emit();
  }

  /** Navi selezionate che appartengono al giocatore e esistono ancora. */
  selectedShips(): Ship[] {
    const sel = this.selection;
    if (sel.kind !== 'ships') return [];
    return sel.ids.map((id) => getShip(this.state, id)).filter((s): s is Ship => !!s && s.owner === this.me);
  }

  selectedBuilding(): Building | null {
    const sel = this.selection;
    return sel.kind === 'building' ? getBuilding(this.state, sel.id) ?? null : null;
  }

  /** Città di riferimento per il menu costruzioni: quella selezionata o la prima. */
  focusCity(): City | null {
    const b = this.selectedBuilding();
    const city = b ? getCity(this.state, b.cityId) : undefined;
    if (city && city.owner === this.me) return city;
    return this.state.cities.find((c) => c.owner === this.me) ?? null;
  }

  stopSelected(): void {
    const ids = this.selectedShips().map((s) => s.id);
    if (ids.length) this.issue({ type: 'stop', shipIds: ids });
  }

  goHome(): void {
    const city = this.focusCity();
    if (!city) return;
    this.centerOn({ x: city.cx + 0.5, y: city.cy + 0.5 });
    const hall = this.state.buildings.find((b) => b.cityId === city.id && b.kind === 'municipio');
    if (hall) this.select({ kind: 'building', id: hall.id });
  }

  /** Rimuove dalla selezione ciò che non esiste più o non è più nostro. */
  cleanSelection(): void {
    const sel = this.selection;
    if (sel.kind === 'ships') {
      const ids = this.selectedShips().map((s) => s.id);
      if (ids.length !== sel.ids.length) this.selection = ids.length ? { kind: 'ships', ids } : { kind: 'none' };
    } else if (sel.kind === 'ship' && !getShip(this.state, sel.id)) {
      this.selection = { kind: 'none' };
    } else if (sel.kind === 'building' && !getBuilding(this.state, sel.id)) {
      this.selection = { kind: 'none' };
    }
    if (this.mode.type === 'place') {
      const city = getCity(this.state, this.mode.cityId);
      if (!city || city.owner !== this.me) this.mode = { type: 'normal' };
    }
  }

  handleEvents(events: GameEvent[]): void {
    const me = this.me;
    const state = this.state;
    const cityName = (id: number) => getCity(state, id)?.name ?? '';
    const who = (p: PlayerId) => state.players[p]?.name ?? '';
    for (const e of events) {
      switch (e.type) {
        case 'shipSunk':
          if (e.owner === me) this.message(`La ${e.name} è stata affondata!`, 'bad');
          else if (e.by === me) this.message(`Hai affondato la ${e.name}!`, 'good');
          break;
        case 'shipCaptured':
          if (e.to === me) this.message(`Arrembaggio riuscito: la ${e.name} ora è tua!`, 'good');
          else if (e.from === me) this.message(`La ${e.name} è stata catturata dai nemici!`, 'bad');
          break;
        case 'boardingRepelled':
          if (e.attacker === me) this.message('Arrembaggio respinto: servono più uomini.', 'bad');
          else if (e.defender === me) this.message('Abbiamo respinto un arrembaggio!', 'good');
          break;
        case 'shipLaunched': {
          if (e.owner !== me) break;
          const ship = getShip(state, e.shipId);
          if (ship) this.message(`Varata la ${ship.name} (${SHIPS[ship.cls].name}) a ${cityName(e.cityId)}`, 'good');
          break;
        }
        case 'recruited':
          if (e.owner === me) this.message(`${e.count} ${e.unit === 'sailors' ? 'marinai' : 'soldati'} arruolati a ${cityName(e.cityId)}`, 'info');
          break;
        case 'buildingDone':
          if (e.owner === me) this.message(`${BUILDINGS[e.kind].name} completato`, 'info');
          break;
        case 'buildingDestroyed':
          if (e.owner === me) this.message(`Il nemico ha distrutto un edificio: ${BUILDINGS[e.kind].name}`, 'bad');
          break;
        case 'troopsLanded':
          if (e.owner === me) this.message(`${e.soldiers} soldati sbarcati a ${cityName(e.cityId)}: all'assalto!`, 'info');
          else if (e.defender === me) this.message(`${who(e.owner)} ha sbarcato truppe a ${cityName(e.cityId)}!`, 'bad');
          break;
        case 'assaultFailed':
          if (e.attacker === me) this.message(`L'assalto a ${cityName(e.cityId)} è fallito.`, 'bad');
          else if (e.defender === me) this.message(`${cityName(e.cityId)} ha respinto l'assalto!`, 'good');
          break;
        case 'cityCaptured':
          if (e.to === me) this.message(`Hai conquistato ${cityName(e.cityId)}!`, 'good');
          else if (e.from === me) this.message(`Hai perso ${cityName(e.cityId)}!`, 'bad');
          break;
        case 'cityFounded':
          if (e.owner === me) this.message(`Fondata la città di ${cityName(e.cityId)}!`, 'good');
          break;
        case 'famine':
          if (e.owner === me) this.message('Carestia! Senza cibo la gente se ne va e gli uomini disertano.', 'bad');
          break;
        case 'playerEliminated':
          if (e.player !== me) this.message(`${who(e.player)} è stato sconfitto!`, 'good');
          break;
      }
    }
  }
}
