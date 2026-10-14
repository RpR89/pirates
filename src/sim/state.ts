import { coastalSiteAt, findCoastalSites, generateMap, type CoastalSite, type Point, type TileMap } from './map';
import { mulberry32, shuffle } from './rng';
import {
  SHIPS,
  START_RESOURCES,
  VILLAGE,
  type BuildingKind,
  type ShipKind,
} from './rules';

export type PlayerId = number;
export const NEUTRAL: PlayerId = 0;

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  gold: number;
  wood: number;
  alive: boolean;
}

export type ShipOrder =
  | { type: 'idle' }
  | { type: 'move' }
  | { type: 'attackShip'; targetId: number; capture: boolean }
  | { type: 'attackVillage'; targetId: number }
  | { type: 'found'; x: number; y: number };

export interface Ship {
  id: number;
  owner: PlayerId;
  kind: ShipKind;
  x: number;
  y: number;
  hp: number;
  path: Point[];
  order: ShipOrder;
  cooldown: number;
  repath: number;
}

export type ProductionItem =
  | { type: 'ship'; ship: ShipKind }
  | { type: 'building'; building: BuildingKind };

export interface QueueEntry {
  item: ProductionItem;
  ticksLeft: number;
  totalTicks: number;
}

export interface Village {
  id: number;
  owner: PlayerId;
  name: string;
  x: number;
  y: number;
  dock: Point;
  hp: number;
  buildings: Record<BuildingKind, number>;
  queue: QueueEntry[];
  cooldown: number;
  lastDamagedTick: number;
}

export type GameEvent =
  | { type: 'shot'; from: Point; to: Point; hit: boolean }
  | { type: 'shipSunk'; shipId: number; owner: PlayerId; by: PlayerId; x: number; y: number }
  | { type: 'shipCaptured'; shipId: number; from: PlayerId; to: PlayerId }
  | { type: 'shipBuilt'; shipId: number; owner: PlayerId; kind: ShipKind }
  | { type: 'buildingDone'; villageId: number; owner: PlayerId; building: BuildingKind; level: number }
  | { type: 'villageCaptured'; villageId: number; from: PlayerId; to: PlayerId }
  | { type: 'villageFounded'; villageId: number; owner: PlayerId }
  | { type: 'playerEliminated'; player: PlayerId };

export interface GameState {
  tick: number;
  seed: number;
  map: TileMap;
  players: Player[];
  ships: Ship[];
  villages: Village[];
  nextId: number;
  nameIndex: number;
  names: string[];
  events: GameEvent[];
  winner: PlayerId | null;
}

export interface PlayerSetup {
  name: string;
  color: string;
}

export interface GameOptions {
  width?: number;
  height?: number;
  neutralVillages?: number;
}

const VILLAGE_NAMES = [
  'TORTUGA', 'PORTO REALE', 'ISOLA NERA', 'BAIA DEL TESCHIO', 'PUNTA CORVO',
  'CALA ROSSA', 'SAN ROCCO', 'NIDO DEL GABBIANO', 'ROCCA SALATA', 'PORTO FANTASMA',
  'ISOLA DEL RUM', 'BAIA DEI RELITTI', 'CAPO TEMPESTA', 'PORTO ZAFFIRO', 'ISOLA DELLE OSSA',
  'CALA DEL CORSARO', 'PUNTA ARGENTO', 'BAIA SERENA', 'FORTE DELLA SIRENA', 'ISOLA PERDUTA',
];

export const NEUTRAL_COLOR = '#94b0c2';

export function villageMaxHp(v: Village): number {
  return VILLAGE.baseHp + v.buildings.forte * VILLAGE.hpPerForte;
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Centro della casella del villaggio, in coordinate caselle. */
export function villageCenter(v: Village): Point {
  return { x: v.x + 0.5, y: v.y + 0.5 };
}

export function getShip(state: GameState, id: number): Ship | undefined {
  return state.ships.find((s) => s.id === id);
}

export function getVillage(state: GameState, id: number): Village | undefined {
  return state.villages.find((v) => v.id === id);
}

export function isEnemy(a: PlayerId, b: PlayerId): boolean {
  return a !== b && a !== NEUTRAL && b !== NEUTRAL;
}

export function nextVillageName(state: GameState): string {
  const base = state.names[state.nameIndex % state.names.length];
  const round = Math.floor(state.nameIndex / state.names.length);
  state.nameIndex++;
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function spawnShip(state: GameState, owner: PlayerId, kind: ShipKind, x: number, y: number): Ship {
  const ship: Ship = {
    id: state.nextId++,
    owner,
    kind,
    x,
    y,
    hp: SHIPS[kind].hp,
    path: [],
    order: { type: 'idle' },
    cooldown: 0,
    repath: 0,
  };
  state.ships.push(ship);
  return ship;
}

export function addVillage(state: GameState, owner: PlayerId, site: CoastalSite): Village {
  const village: Village = {
    id: state.nextId++,
    owner,
    name: nextVillageName(state),
    x: site.x,
    y: site.y,
    dock: { x: site.dock.x, y: site.dock.y },
    hp: VILLAGE.baseHp,
    buildings: { cantiere: 0, mercato: 0, segheria: 0, forte: 0 },
    queue: [],
    cooldown: 0,
    lastDamagedTick: -1_000_000,
  };
  state.villages.push(village);
  return village;
}

/** Sito valido per fondare un villaggio: costa sull'oceano, lontano dagli altri. */
export function foundingSite(state: GameState, x: number, y: number): CoastalSite | null {
  const site = coastalSiteAt(state.map, Math.floor(x), Math.floor(y));
  if (!site) return null;
  for (const v of state.villages) {
    if (distance(v, site) < VILLAGE.minDistance) return null;
  }
  return site;
}

const START_ANCHORS: readonly Point[] = [
  { x: 0.2, y: 0.25 },
  { x: 0.8, y: 0.75 },
  { x: 0.8, y: 0.25 },
  { x: 0.2, y: 0.75 },
  { x: 0.5, y: 0.2 },
  { x: 0.5, y: 0.8 },
];

export function createGame(seed: number, setups: PlayerSetup[], options: GameOptions = {}): GameState {
  if (setups.length < 1 || setups.length > START_ANCHORS.length) {
    throw new Error(`Numero di giocatori non supportato: ${setups.length}`);
  }
  const map = generateMap(seed, options.width ?? 160, options.height ?? 120);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state: GameState = {
    tick: 0,
    seed,
    map,
    players: [
      { id: NEUTRAL, name: 'NEUTRALE', color: NEUTRAL_COLOR, gold: 0, wood: 0, alive: true },
      ...setups.map((s, i) => ({
        id: i + 1,
        name: s.name,
        color: s.color,
        gold: START_RESOURCES.gold,
        wood: START_RESOURCES.wood,
        alive: true,
      })),
    ],
    ships: [],
    villages: [],
    nextId: 1,
    nameIndex: 0,
    names: shuffle([...VILLAGE_NAMES], rng),
    events: [],
    winner: null,
  };

  const sites = findCoastalSites(map);
  const farFromAll = (site: CoastalSite, min: number) =>
    state.villages.every((v) => distance(v, site) >= min);

  setups.forEach((_, i) => {
    const anchor = { x: START_ANCHORS[i].x * map.width, y: START_ANCHORS[i].y * map.height };
    let best: CoastalSite | null = null;
    let bestD = Infinity;
    for (const site of sites) {
      const d = distance(site, anchor);
      if (d < bestD && farFromAll(site, VILLAGE.minDistance * 3)) {
        best = site;
        bestD = d;
      }
    }
    if (!best) throw new Error('Mappa senza coste disponibili');
    const v = addVillage(state, i + 1, best);
    v.buildings.cantiere = 1;
    spawnShip(state, i + 1, 'sloop', v.dock.x + 0.5, v.dock.y + 0.5);
  });

  const neutralCount = options.neutralVillages ?? 7;
  for (const site of shuffle([...sites], rng)) {
    if (state.villages.length >= setups.length + neutralCount) break;
    if (!farFromAll(site, VILLAGE.minDistance * 1.8)) continue;
    const v = addVillage(state, NEUTRAL, site);
    v.buildings.forte = 1;
    v.hp = villageMaxHp(v);
  }

  return state;
}
