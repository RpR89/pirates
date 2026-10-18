import { FACTIONS, NEUTRAL_CITY_NAMES, NEUTRAL_LOOK, type FactionId } from './factions';
import { generateHero, type Hero, type HeroProfile } from './hero';
import { Tile, findCoastalSites, generateMap, isLand, isSea, nearestSea, tileAt, type Point, type TileMap } from './map';
import { mulberry32, shuffle } from './rng';
import {
  BUILDINGS,
  CITY,
  CITY_TIERS,
  RECRUIT,
  SHIPS,
  START,
  type BuildingKind,
  type ShipClass,
  ticks,
  type UnitKind,
} from './rules';

export type PlayerId = number;
export const NEUTRAL: PlayerId = 0;

export interface Player {
  id: PlayerId;
  name: string;
  faction: FactionId | null;
  gold: number;
  wood: number;
  food: number;
  alive: boolean;
  starvingTicks: number;
  shipNameIndex: number;
  cityNameIndex: number;
}

export interface Crew {
  sailors: number;
  soldiers: number;
}

export interface City {
  id: number;
  owner: PlayerId;
  name: string;
  /** Centro del municipio (coordinate caselle, intere). */
  cx: number;
  cy: number;
  /** Casella di mare dove attraccano le navi. */
  dock: Point;
  population: number;
  garrison: Crew;
  /** Truppe nemiche sbarcate che assediano la città. */
  siege: { owner: PlayerId; soldiers: number } | null;
}

export type QueueEntry =
  | { type: 'ship'; cls: ShipClass; name: string; ticksLeft: number; totalTicks: number }
  | { type: 'recruit'; unit: UnitKind; count: number; ticksLeft: number; totalTicks: number };

export interface Building {
  id: number;
  cityId: number;
  kind: BuildingKind;
  /** Angolo in alto a sinistra (caselle). */
  x: number;
  y: number;
  hp: number;
  /** Tick mancanti al completamento (0 = finito). */
  buildLeft: number;
  queue: QueueEntry[];
  cooldown: number;
  lastDamagedTick: number;
}

export type ShipOrder =
  | { type: 'idle' }
  | { type: 'move' }
  | { type: 'attackShip'; targetId: number; board: boolean }
  | { type: 'attackBuilding'; targetId: number }
  | { type: 'land'; cityId: number }
  | { type: 'found'; x: number; y: number };

export interface Ship {
  id: number;
  owner: PlayerId;
  name: string;
  cls: ShipClass;
  x: number;
  y: number;
  hp: number;
  sailors: number;
  soldiers: number;
  colonists: number;
  path: Point[];
  order: ShipOrder;
  cooldown: number;
  repath: number;
}

export type GameEvent =
  | { type: 'shot'; from: Point; to: Point }
  | { type: 'shipSunk'; shipId: number; name: string; owner: PlayerId; by: PlayerId; x: number; y: number }
  | { type: 'shipCaptured'; shipId: number; name: string; from: PlayerId; to: PlayerId }
  | { type: 'boardingRepelled'; shipId: number; attacker: PlayerId; defender: PlayerId }
  | { type: 'shipLaunched'; shipId: number; owner: PlayerId; cityId: number }
  | { type: 'recruited'; cityId: number; owner: PlayerId; unit: UnitKind; count: number }
  | { type: 'buildingDone'; buildingId: number; owner: PlayerId; kind: BuildingKind }
  | { type: 'buildingDestroyed'; buildingId: number; owner: PlayerId; kind: BuildingKind; x: number; y: number }
  | { type: 'troopsLanded'; cityId: number; owner: PlayerId; defender: PlayerId; soldiers: number; from: Point }
  | { type: 'assaultFailed'; cityId: number; attacker: PlayerId; defender: PlayerId }
  | { type: 'cityCaptured'; cityId: number; from: PlayerId; to: PlayerId }
  | { type: 'cityFounded'; cityId: number; owner: PlayerId }
  | { type: 'famine'; owner: PlayerId }
  | { type: 'heroLost'; owner: PlayerId; reason: 'shipwreck' | 'captured' | 'cityLost' }
  | { type: 'heroReturned'; owner: PlayerId; cityId: number }
  | { type: 'heroLevelUp'; owner: PlayerId; level: number }
  | { type: 'playerEliminated'; player: PlayerId };

export interface GameState {
  tick: number;
  seed: number;
  map: TileMap;
  players: Player[];
  cities: City[];
  buildings: Building[];
  ships: Ship[];
  nextId: number;
  neutralNames: string[];
  /** Il capitano di ogni giocatore (neutrali esclusi). */
  heroes: Hero[];
  events: GameEvent[];
  winner: PlayerId | null;
}

export interface PlayerSetup {
  name: string;
  faction: FactionId;
  /** Capitano già generato (dal menu); se manca viene generato dal seme della partita. */
  hero?: HeroProfile;
}

export interface GameOptions {
  width?: number;
  height?: number;
  neutralCities?: number;
}

// ------------------------------------------------------------------ utilità

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isEnemy(a: PlayerId, b: PlayerId): boolean {
  return a !== b && a !== NEUTRAL && b !== NEUTRAL;
}

export function look(state: GameState, owner: PlayerId) {
  const faction = state.players[owner]?.faction;
  return faction ? FACTIONS[faction] : NEUTRAL_LOOK;
}

export function modifiers(state: GameState, owner: PlayerId) {
  return look(state, owner).modifiers;
}

export function getShip(state: GameState, id: number): Ship | undefined {
  return state.ships.find((s) => s.id === id);
}

export function getCity(state: GameState, id: number): City | undefined {
  return state.cities.find((c) => c.id === id);
}

export function heroOf(state: GameState, owner: PlayerId): Hero | undefined {
  return state.heroes.find((h) => h.owner === owner);
}

/** Il capitano imbarcato su questa nave, se c'è. */
export function heroOnShip(state: GameState, shipId: number): Hero | undefined {
  return state.heroes.find((h) => h.location.type === 'ship' && h.location.shipId === shipId);
}

/** Il capitano presente in questa città, se c'è. */
export function heroInCity(state: GameState, cityId: number): Hero | undefined {
  return state.heroes.find((h) => h.location.type === 'city' && h.location.cityId === cityId);
}

export function getBuilding(state: GameState, id: number): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function cityCenter(c: City): Point {
  return { x: c.cx + 0.5, y: c.cy + 0.5 };
}

export function buildingCenter(b: Building): Point {
  const s = BUILDINGS[b.kind];
  return { x: b.x + s.w / 2, y: b.y + s.h / 2 };
}

export function buildingOwner(state: GameState, b: Building): PlayerId {
  return getCity(state, b.cityId)?.owner ?? NEUTRAL;
}

export function cityBuildings(state: GameState, cityId: number): Building[] {
  return state.buildings.filter((b) => b.cityId === cityId);
}

export function municipioOf(state: GameState, cityId: number): Building | undefined {
  return state.buildings.find((b) => b.cityId === cityId && b.kind === 'municipio');
}

export function isComplete(b: Building): boolean {
  return b.buildLeft <= 0;
}

export function housing(state: GameState, cityId: number): number {
  return cityBuildings(state, cityId)
    .filter(isComplete)
    .reduce((n, b) => n + BUILDINGS[b.kind].housing, 0);
}

export function cityTier(city: City): number {
  let tier = 1;
  for (const t of CITY_TIERS) if (city.population >= t.population) tier = t.tier;
  return tier;
}

export function tierName(tier: number): string {
  return CITY_TIERS.find((t) => t.tier === tier)?.name ?? '';
}

/** Uomini arruolabili ora: cresce con la città. */
export function recruitable(city: City): number {
  const byShare = Math.floor(city.population * RECRUIT.maxShare);
  const byMin = Math.floor(city.population - RECRUIT.minPopulation);
  return Math.max(0, Math.min(byShare, byMin, RECRUIT.maxBatch));
}

export function shipMaxHp(state: GameState, s: Ship): number {
  return Math.round(SHIPS[s.cls].hp * modifiers(state, s.owner).shipHp);
}

export function shipMen(s: Ship): number {
  return s.sailors + s.soldiers;
}

/** Efficienza di manovra e di fuoco in base ai marinai a bordo. */
export function crewEfficiency(s: Ship): number {
  const need = SHIPS[s.cls].crew;
  const ratio = need > 0 ? Math.min(1, s.sailors / need) : 1;
  return 0.3 + 0.7 * ratio;
}

/** Nome proprio di una nuova nave, dal repertorio della fazione. */
export function suggestShipName(state: GameState, owner: PlayerId, offset = 0): string {
  const p = state.players[owner];
  const pool = look(state, owner) === NEUTRAL_LOOK ? ['Speranza'] : FACTIONS[p.faction!].shipNames;
  const index = p.shipNameIndex + offset;
  const base = pool[index % pool.length];
  const round = Math.floor(index / pool.length);
  const roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  return round === 0 ? base : `${base}${roman[round] ?? ` ${round + 1}`}`;
}

function nextCityName(state: GameState, owner: PlayerId): string {
  if (owner === NEUTRAL) {
    const i = state.players[NEUTRAL].cityNameIndex++;
    return state.neutralNames[i % state.neutralNames.length];
  }
  const p = state.players[owner];
  const pool = FACTIONS[p.faction!].cityNames;
  const i = p.cityNameIndex++;
  return i < pool.length ? pool[i] : `${pool[i % pool.length]} ${Math.floor(i / pool.length) + 1}`;
}

// ------------------------------------------------------------------ terreno e piazzamento

/** Griglia di occupazione degli edifici, ricostruita solo quando la lista cambia. */
const occupancyCache = new WeakMap<Building[], { length: number; grid: Int32Array; width: number }>();

function occupancy(state: GameState): Int32Array {
  const list = state.buildings;
  const cached = occupancyCache.get(list);
  if (cached && cached.length === list.length && cached.width === state.map.width) return cached.grid;
  const { width, height } = state.map;
  const grid = new Int32Array(width * height).fill(-1);
  list.forEach((b, i) => {
    const s = BUILDINGS[b.kind];
    for (let y = b.y; y < b.y + s.h; y++) {
      for (let x = b.x; x < b.x + s.w; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) grid[y * width + x] = i;
      }
    }
  });
  occupancyCache.set(list, { length: list.length, grid, width });
  return grid;
}

export function buildingAtTile(state: GameState, x: number, y: number): Building | undefined {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  const i = occupancy(state)[y * state.map.width + x];
  return i >= 0 ? state.buildings[i] : undefined;
}

function buildableTile(state: GameState, x: number, y: number): boolean {
  return isLand(state.map, x, y) && tileAt(state.map, x, y) !== Tile.Rock && !buildingAtTile(state, x, y);
}

/** Casella di mare accanto all'impronta, o null. */
export function footprintDock(map: TileMap, x: number, y: number, w: number, h: number): Point | null {
  for (let i = 0; i < w; i++) {
    if (isSea(map, x + i, y + h)) return { x: x + i, y: y + h };
    if (isSea(map, x + i, y - 1)) return { x: x + i, y: y - 1 };
  }
  for (let j = 0; j < h; j++) {
    if (isSea(map, x + w, y + j)) return { x: x + w, y: y + j };
    if (isSea(map, x - 1, y + j)) return { x: x - 1, y: y + j };
  }
  return null;
}

/** Punto di varo delle navi di un cantiere. */
export function shipyardDock(state: GameState, b: Building): Point {
  const s = BUILDINGS[b.kind];
  const dock = footprintDock(state.map, b.x, b.y, s.w, s.h) ?? nearestSea(state.map, b.x, b.y, 6) ?? { x: b.x, y: b.y };
  return { x: dock.x + 0.5, y: dock.y + 0.5 };
}

/** Una porta si può aprire sopra un tratto di mura o di terrapieno della stessa città. */
export function isGateSite(b: Building, cityId: number): boolean {
  return b.cityId === cityId && (b.kind === 'mura' || b.kind === 'terrapieno');
}

/** Motivo per cui non si può costruire qui, o null se si può. */
export function placementProblem(
  state: GameState,
  player: PlayerId,
  cityId: number,
  kind: BuildingKind,
  x: number,
  y: number,
): string | null {
  const city = getCity(state, cityId);
  if (!city || city.owner !== player) return 'Non è una tua città';
  if (kind === 'municipio') return 'Il municipio nasce solo con una nuova città';
  const s = BUILDINGS[kind];
  if (s.factions && !s.factions.includes(state.players[player]?.faction as FactionId)) return 'La tua fazione non può costruirlo';
  if (cityTier(city) < s.tier) return `Serve un ${tierName(s.tier).toLowerCase()} (popolazione ${CITY_TIERS[s.tier - 1].population})`;
  const center = cityCenter(city);
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const tx = x + i;
      const ty = y + j;
      if (distance({ x: tx + 0.5, y: ty + 0.5 }, center) > CITY.radius) return 'Troppo lontano dal municipio';
      const occupant = buildingAtTile(state, tx, ty);
      if (occupant && !(kind === 'porta' && isGateSite(occupant, cityId))) return 'Spazio occupato';
      if (!isLand(state.map, tx, ty)) return 'Serve terraferma';
      if (tileAt(state.map, tx, ty) === Tile.Rock) return 'Terreno roccioso';
    }
  }
  if (s.coastal && !footprintDock(state.map, x, y, s.w, s.h)) return 'Deve toccare il mare';
  return null;
}

/** Prima posizione valida per un edificio, la più vicina al municipio. */
export function findPlacement(state: GameState, cityId: number, kind: BuildingKind): Point | null {
  const city = getCity(state, cityId);
  if (!city) return null;
  const r = CITY.radius;
  const candidates: Point[] = [];
  for (let y = city.cy - r; y <= city.cy + r; y++) {
    for (let x = city.cx - r; x <= city.cx + r; x++) candidates.push({ x, y });
  }
  const s = BUILDINGS[kind];
  const c = cityCenter(city);
  candidates.sort((a, b) => {
    const da = distance({ x: a.x + s.w / 2, y: a.y + s.h / 2 }, c);
    const db = distance({ x: b.x + s.w / 2, y: b.y + s.h / 2 }, c);
    return da - db || a.y - b.y || a.x - b.x;
  });
  // Lascia un passaggio libero attorno al municipio e la strada davanti alle porte.
  const m = municipioOf(state, cityId);
  const doors = new Set(
    cityBuildings(state, cityId)
      .filter((b) => !BUILDINGS[b.kind].line)
      .map((b) => `${b.x + Math.floor(BUILDINGS[b.kind].w / 2)},${b.y + BUILDINGS[b.kind].h}`),
  );
  const coversDoor = (p: Point) => {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) if (doors.has(`${p.x + i},${p.y + j}`)) return true;
    return false;
  };
  for (const p of candidates) {
    if (m && p.x + s.w > m.x - 1 && p.x < m.x + 4 && p.y + s.h > m.y - 1 && p.y < m.y + 4) continue;
    if (!s.line) {
      if (coversDoor(p)) continue;
      // La propria porta deve affacciarsi su una casella libera (non serve agli edifici sulla costa).
      const door = { x: p.x + Math.floor(s.w / 2), y: p.y + s.h };
      if (!s.coastal && !buildableTile(state, door.x, door.y)) continue;
    }
    if (!placementProblem(state, city.owner, cityId, kind, p.x, p.y)) return p;
  }
  return null;
}

/** Motivo per cui non si può fondare una città con centro in (x, y), o null. */
export function foundingProblem(state: GameState, x: number, y: number): string | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      if (!buildableTile(state, cx + i, cy + j)) return 'Serve uno spazio di terra libero di 3x3 caselle';
    }
  }
  for (const c of state.cities) {
    if (distance({ x: cx, y: cy }, { x: c.cx, y: c.cy }) < CITY.minDistance) return 'Troppo vicino a un\'altra città';
  }
  if (!nearestSea(state.map, cx, cy, 4)) return 'Troppo lontano dal mare';
  return null;
}

// ------------------------------------------------------------------ creazione

export function spawnShip(
  state: GameState,
  owner: PlayerId,
  cls: ShipClass,
  x: number,
  y: number,
  name = suggestShipName(state, owner),
  crew: Partial<Crew> = {},
): Ship {
  const ship: Ship = {
    id: state.nextId++,
    owner,
    name,
    cls,
    x,
    y,
    hp: 0,
    sailors: crew.sailors ?? SHIPS[cls].crew,
    soldiers: crew.soldiers ?? 0,
    colonists: 0,
    path: [],
    order: { type: 'idle' },
    cooldown: 0,
    repath: 0,
  };
  ship.hp = shipMaxHp(state, ship);
  if (name === suggestShipName(state, owner)) state.players[owner].shipNameIndex++;
  state.ships.push(ship);
  return ship;
}

export function addBuilding(state: GameState, cityId: number, kind: BuildingKind, x: number, y: number, complete: boolean): Building {
  const b: Building = {
    id: state.nextId++,
    cityId,
    kind,
    x,
    y,
    hp: BUILDINGS[kind].hp,
    buildLeft: complete ? 0 : ticks(BUILDINGS[kind].buildSeconds),
    queue: [],
    cooldown: 0,
    lastDamagedTick: -1_000_000,
  };
  state.buildings.push(b);
  return b;
}

export function addCity(state: GameState, owner: PlayerId, cx: number, cy: number, population: number, garrison: Crew): City {
  const dock = nearestSea(state.map, cx, cy, 4) ?? { x: cx, y: cy };
  const city: City = {
    id: state.nextId++,
    owner,
    name: nextCityName(state, owner),
    cx,
    cy,
    dock,
    population,
    garrison: { ...garrison },
    siege: null,
  };
  state.cities.push(city);
  addBuilding(state, city.id, 'municipio', cx - 1, cy - 1, true);
  return city;
}

const START_ANCHORS: readonly Point[] = [
  { x: 0.18, y: 0.22 },
  { x: 0.82, y: 0.78 },
  { x: 0.82, y: 0.22 },
  { x: 0.18, y: 0.78 },
];

/** Centri possibili per una città: terra libera 3x3 vicino al mare. */
export function cityCandidates(state: GameState): Point[] {
  const seen = new Set<number>();
  const out: Point[] = [];
  for (const site of findCoastalSites(state.map)) {
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [0, 2], [2, 0], [0, -2], [-2, 0]]) {
      const x = site.x + dx;
      const y = site.y + dy;
      const key = y * state.map.width + x;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!foundingProblem(state, x, y)) out.push({ x, y });
    }
  }
  return out;
}

export function createGame(seed: number, setups: PlayerSetup[], options: GameOptions = {}): GameState {
  if (setups.length < 1 || setups.length > START_ANCHORS.length) {
    throw new Error(`Numero di giocatori non supportato: ${setups.length}`);
  }
  const map = generateMap(seed, options.width ?? 280, options.height ?? 210);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const newPlayer = (id: PlayerId, name: string, faction: FactionId | null): Player => ({
    id, name, faction,
    gold: faction ? START.gold : 0,
    wood: faction ? START.wood : 0,
    food: faction ? START.food : 0,
    alive: true, starvingTicks: 0, shipNameIndex: 0, cityNameIndex: 0,
  });
  const state: GameState = {
    tick: 0,
    seed,
    map,
    players: [newPlayer(NEUTRAL, NEUTRAL_LOOK.name, null), ...setups.map((s, i) => newPlayer(i + 1, s.name, s.faction))],
    cities: [],
    buildings: [],
    ships: [],
    nextId: 1,
    neutralNames: shuffle([...NEUTRAL_CITY_NAMES], rng),
    heroes: [],
    events: [],
    winner: null,
  };

  const candidates = cityCandidates(state);
  const valid = (p: Point) => !foundingProblem(state, p.x, p.y);

  setups.forEach((_, i) => {
    const owner = i + 1;
    const anchor = { x: START_ANCHORS[i].x * map.width, y: START_ANCHORS[i].y * map.height };
    const site = [...candidates]
      .filter((p) => valid(p) && state.cities.every((c) => distance(p, { x: c.cx, y: c.cy }) > CITY.minDistance * 2.5))
      .sort((a, b) => distance(a, anchor) - distance(b, anchor))
      .find((p) => findPlacementForNewCity(state, p));
    if (!site) throw new Error('Mappa senza spazio per le città di partenza');
    const city = addCity(state, owner, site.x, site.y, START.population, { sailors: START.sailors, soldiers: START.soldiers });
    for (const kind of ['cantiere', 'fattoria', 'segheria', 'casa', 'casa'] as const) {
      const p = findPlacement(state, city.id, kind);
      if (p) addBuilding(state, city.id, kind, p.x, p.y, true);
    }
    const yard = state.buildings.find((b) => b.cityId === city.id && b.kind === 'cantiere');
    const dock = yard ? shipyardDock(state, yard) : { x: city.dock.x + 0.5, y: city.dock.y + 0.5 };
    spawnShip(state, owner, 'sloop', dock.x, dock.y, undefined, { sailors: 8, soldiers: 4 });
    const profile = setups[i].hero ?? generateHero(Math.floor(rng() * 1e9), setups[i].faction, FACTIONS[setups[i].faction].leader);
    state.heroes.push({ ...profile, skills: { ...profile.skills }, owner, xp: 0, location: { type: 'city', cityId: city.id } });
  });

  const neutralCount = options.neutralCities ?? 10;
  for (const p of shuffle([...candidates], rng)) {
    if (state.cities.length >= setups.length + neutralCount) break;
    if (!valid(p) || state.cities.some((c) => distance(p, { x: c.cx, y: c.cy }) < CITY.minDistance * 1.3)) continue;
    const population = 20 + Math.floor(rng() * 30);
    const city = addCity(state, NEUTRAL, p.x, p.y, population, { sailors: 0, soldiers: 8 + Math.floor(rng() * 14) });
    const extra: BuildingKind[] = ['torre', 'casa', 'casa', 'fattoria', 'casa'];
    for (const kind of extra.slice(0, 3 + Math.floor(rng() * 3))) {
      const at = findPlacementIgnoringTier(state, city.id, kind);
      if (at) addBuilding(state, city.id, kind, at.x, at.y, true);
    }
  }

  return state;
}

/** La città di partenza deve avere spazio per cantiere, fattoria e una buona area edificabile. */
function findPlacementForNewCity(state: GameState, p: Point): boolean {
  let free = 0;
  for (let y = p.y - CITY.radius; y <= p.y + CITY.radius; y++) {
    for (let x = p.x - CITY.radius; x <= p.x + CITY.radius; x++) {
      if (distance({ x: x + 0.5, y: y + 0.5 }, { x: p.x + 0.5, y: p.y + 0.5 }) <= CITY.radius && buildableTile(state, x, y)) free++;
    }
  }
  if (free < 150) return false;
  const probe: City = { id: -1, owner: -1, name: '', cx: p.x, cy: p.y, dock: p, population: 0, garrison: { sailors: 0, soldiers: 0 }, siege: null };
  state.cities.push(probe);
  const id = state.nextId;
  const m = addBuilding(state, -1, 'municipio', p.x - 1, p.y - 1, true);
  const yardAt = findPlacement(state, -1, 'cantiere');
  const yard = yardAt && addBuilding(state, -1, 'cantiere', yardAt.x, yardAt.y, true);
  const ok = yard !== null && findPlacement(state, -1, 'fattoria') !== null;
  state.cities.pop();
  state.buildings = state.buildings.filter((b) => b !== m && b !== yard);
  state.nextId = id;
  return ok;
}

function findPlacementIgnoringTier(state: GameState, cityId: number, kind: BuildingKind): Point | null {
  const city = getCity(state, cityId)!;
  const pop = city.population;
  city.population = 1000;
  const p = findPlacement(state, cityId, kind);
  city.population = pop;
  return p;
}

