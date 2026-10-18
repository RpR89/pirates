import type { Command, PlayerCommand } from './commands';
import { sanitizeName } from './factions';
import { HERO, heroCityBonus, heroLevel, heroShipBonus, type Hero } from './hero';
import { Tile, nearestSea, tileAt, type Point } from './map';
import { findPath } from './pathfinding';
import {
  BUILDINGS,
  CITY,
  COMBAT,
  FOOD,
  FOREST_BONUS,
  RECRUIT,
  SHIPS,
  FORTIFICATIONS,
  TICK_RATE,
  UNITS,
  ticks,
  type BuildingKind,
  type Cost,
  type ShipClass,
  type UnitKind,
} from './rules';
import {
  NEUTRAL,
  addBuilding,
  buildingAtTile,
  isGateSite,
  addCity,
  buildingCenter,
  buildingOwner,
  cityBuildings,
  cityTier,
  crewEfficiency,
  distance,
  foundingProblem,
  getBuilding,
  getCity,
  getShip,
  heroInCity,
  heroOf,
  heroOnShip,
  housing,
  isComplete,
  isEnemy,
  modifiers,
  placementProblem,
  recruitable,
  shipMaxHp,
  shipMen,
  shipyardDock,
  spawnShip,
  suggestShipName,
  type Building,
  type City,
  type GameState,
  type Player,
  type PlayerId,
  type Ship,
} from './state';

/**
 * Avanza la simulazione di un tick. Deterministica: stesso stato + stessi comandi
 * → stesso risultato su ogni macchina (base per il multiplayer lockstep).
 * Muta lo stato sul posto.
 */
export function step(state: GameState, commands: readonly PlayerCommand[]): void {
  if (state.winner !== null) return;
  state.events = [];
  const ctx: TickContext = { sunkBy: new Map(), founded: new Map() };

  const ordered = [...commands].sort((a, b) => a.player - b.player);
  for (const c of ordered) applyCommand(state, c.player, c.command);

  for (const p of state.players) if (p.id !== NEUTRAL && p.alive) updateEconomy(state, p);
  for (const city of state.cities) updateCity(state, city);
  for (const b of state.buildings) updateBuilding(state, b, ctx);
  for (const ship of state.ships) updateShip(state, ship, ctx);
  removeSunkShips(state, ctx);
  removeDestroyedBuildings(state);
  updateHeroes(state);
  checkElimination(state);

  state.tick++;
}

interface TickContext {
  /** Chi ha affondato ogni nave in questo tick. */
  sunkBy: Map<number, PlayerId>;
  /** Navi coloniali sbarcate per fondare una città (non affondate) → città fondata. */
  founded: Map<number, number>;
}

// ================================================================ costi e rendite

export function shipCost(state: GameState, owner: PlayerId, cls: ShipClass): Cost {
  const base = SHIPS[cls].cost;
  const k = cls === 'sloop' || cls === 'brigantino' ? modifiers(state, owner).smallShipCost : 1;
  return { gold: Math.round(base.gold * k), wood: Math.round(base.wood * k) };
}

export function recruitCost(unit: UnitKind, count: number): Cost {
  return { gold: UNITS[unit].gold * count, wood: 0 };
}

function canAfford(p: Player, cost: Cost): boolean {
  return p.gold >= cost.gold && p.wood >= cost.wood;
}

function pay(p: Player, cost: Cost): void {
  p.gold -= cost.gold;
  p.wood -= cost.wood;
}

function nearForest(state: GameState, b: Building): boolean {
  for (let y = b.y - 3; y <= b.y + 4; y++) {
    for (let x = b.x - 3; x <= b.x + 4; x++) {
      if (tileAt(state.map, x, y) === Tile.Forest) return true;
    }
  }
  return false;
}

export interface Income {
  gold: number;
  wood: number;
  food: number;
}

/** Produzione al secondo di una città (senza i consumi). */
export function cityProduction(state: GameState, city: City): Income {
  const out: Income = { gold: 0, wood: 0, food: 0 };
  if (city.owner === NEUTRAL) return out;
  for (const b of cityBuildings(state, city.id)) {
    if (!isComplete(b) || b.hp <= 0) continue;
    const s = BUILDINGS[b.kind];
    out.gold += s.gold;
    out.food += s.food;
    out.wood += s.wood * (b.kind === 'segheria' && nearForest(state, b) ? FOREST_BONUS : 1);
  }
  out.gold += city.population * CITY.taxPerCitizen;
  out.gold *= modifiers(state, city.owner).goldIncome;
  return out;
}

/** Bilancio al secondo di un giocatore: produzione meno consumi di cibo. */
export function playerBalance(state: GameState, player: PlayerId): Income & { foodUse: number } {
  const total: Income = { gold: 0, wood: 0, food: 0 };
  let foodUse = 0;
  for (const c of state.cities) {
    if (c.owner !== player) continue;
    const p = cityProduction(state, c);
    total.gold += p.gold;
    total.wood += p.wood;
    total.food += p.food;
    foodUse += c.population * FOOD.perCitizen + (c.garrison.sailors + c.garrison.soldiers) * FOOD.perMan;
  }
  for (const s of state.ships) if (s.owner === player) foodUse += (shipMen(s) + s.colonists) * FOOD.perMan;
  return { ...total, food: total.food - foodUse, foodUse };
}

// ================================================================ comandi

function ownedShips(state: GameState, player: PlayerId, ids: readonly number[]): Ship[] {
  return [...new Set(ids)]
    .map((id) => getShip(state, id))
    .filter((s): s is Ship => s !== undefined && s.owner === player);
}

function ownedBuilding(state: GameState, player: PlayerId, id: number, kind: BuildingKind): Building | null {
  const b = getBuilding(state, id);
  if (!b || b.kind !== kind || !isComplete(b) || buildingOwner(state, b) !== player) return null;
  return b;
}

/** Posizioni di formazione attorno al punto di arrivo, in ordine deterministico. */
const FORMATION: readonly Point[] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 2, y: 0 },
  { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 0, y: -2 }, { x: 2, y: 1 }, { x: -2, y: 1 },
  { x: 2, y: -1 }, { x: -2, y: -1 }, { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 },
];

export const QUEUE_MAX = 5;

/** Motivo per cui non si può varare una nave, o null. */
export function shipProblem(state: GameState, player: PlayerId, buildingId: number, cls: ShipClass): string | null {
  const yard = ownedBuilding(state, player, buildingId, 'cantiere');
  if (!yard) return 'Serve un cantiere navale completato';
  const city = getCity(state, yard.cityId)!;
  const s = SHIPS[cls];
  if (cityTier(city) < s.tier) return s.tier === 2 ? 'Serve un paese (35 abitanti)' : 'Serve una città (80 abitanti)';
  if (yard.queue.length >= QUEUE_MAX) return 'Coda piena';
  if (!canAfford(state.players[player], shipCost(state, player, cls))) return 'Risorse insufficienti';
  if (city.garrison.sailors < s.crew) return `Servono ${s.crew} marinai in città`;
  if (s.colonists > 0 && city.population - s.colonists < RECRUIT.minPopulation) return `Servono ${s.colonists + RECRUIT.minPopulation} abitanti`;
  return null;
}

/** Motivo per cui non si può arruolare, o null. */
export function recruitProblem(state: GameState, player: PlayerId, buildingId: number, unit: UnitKind, count: number): string | null {
  const barracks = ownedBuilding(state, player, buildingId, 'caserma');
  if (!barracks) return 'Serve una caserma completata';
  const city = getCity(state, barracks.cityId)!;
  if (!Number.isInteger(count) || count < 1) return 'Numero non valido';
  if (count > recruitable(city)) return `Puoi arruolare al massimo ${recruitable(city)} uomini: fai crescere la città`;
  if (barracks.queue.length >= QUEUE_MAX) return 'Coda piena';
  if (!canAfford(state.players[player], recruitCost(unit, count))) return 'Oro insufficiente';
  return null;
}

export function buildProblem(state: GameState, player: PlayerId, cityId: number, kind: BuildingKind, x: number, y: number): string | null {
  const problem = placementProblem(state, player, cityId, kind, x, y);
  if (problem) return problem;
  if (!canAfford(state.players[player], BUILDINGS[kind].cost)) return 'Risorse insufficienti';
  return null;
}

/** Il punto di attracco più vicino della città a cui la nave può trasferire uomini. */
export function dockedCity(state: GameState, ship: Ship): City | null {
  for (const c of state.cities) {
    if (c.owner !== ship.owner) continue;
    if (distance(ship, { x: c.dock.x + 0.5, y: c.dock.y + 0.5 }) <= COMBAT.dockRange) return c;
    for (const b of cityBuildings(state, c.id)) {
      if (b.kind === 'cantiere' && distance(ship, shipyardDock(state, b)) <= COMBAT.dockRange) return c;
    }
  }
  return null;
}

function applyCommand(state: GameState, player: PlayerId, cmd: Command): void {
  if (!state.players[player]?.alive) return;
  switch (cmd.type) {
    case 'move':
      ownedShips(state, player, cmd.shipIds).forEach((ship, i) => {
        const off = FORMATION[i % FORMATION.length];
        const ring = Math.floor(i / FORMATION.length) + 1;
        const path = findPath(state.map, ship, { x: cmd.x + off.x * 1.6 * ring, y: cmd.y + off.y * 1.6 * ring });
        ship.path = path ?? [];
        ship.order = path ? { type: 'move' } : { type: 'idle' };
      });
      break;
    case 'stop':
      for (const ship of ownedShips(state, player, cmd.shipIds)) {
        ship.path = [];
        ship.order = { type: 'idle' };
      }
      break;
    case 'attackShip': {
      const target = getShip(state, cmd.targetId);
      if (!target || !isEnemy(player, target.owner)) return;
      for (const ship of ownedShips(state, player, cmd.shipIds)) {
        if (!cmd.board && SHIPS[ship.cls].damage <= 0) continue;
        ship.order = { type: 'attackShip', targetId: target.id, board: cmd.board };
        ship.repath = 0;
      }
      break;
    }
    case 'attackBuilding': {
      const target = getBuilding(state, cmd.targetId);
      if (!target || buildingOwner(state, target) === player) return;
      for (const ship of ownedShips(state, player, cmd.shipIds)) {
        if (SHIPS[ship.cls].damage <= 0) continue;
        ship.order = { type: 'attackBuilding', targetId: target.id };
        ship.repath = 0;
      }
      break;
    }
    case 'land': {
      const city = getCity(state, cmd.cityId);
      if (!city || city.owner === player) return;
      for (const ship of ownedShips(state, player, cmd.shipIds)) {
        if (ship.soldiers < 1) continue;
        ship.order = { type: 'land', cityId: city.id };
        ship.repath = 0;
      }
      break;
    }
    case 'found': {
      const [ship] = ownedShips(state, player, [cmd.shipId]);
      if (!ship || ship.colonists <= 0 || foundingProblem(state, cmd.x, cmd.y)) return;
      const dock = nearestSea(state.map, Math.floor(cmd.x), Math.floor(cmd.y), 4);
      const path = dock && findPath(state.map, ship, { x: dock.x + 0.5, y: dock.y + 0.5 });
      if (!path) return;
      ship.path = path;
      ship.order = { type: 'found', x: Math.floor(cmd.x), y: Math.floor(cmd.y) };
      break;
    }
    case 'placeBuilding': {
      if (buildProblem(state, player, cmd.cityId, cmd.kind, cmd.x, cmd.y)) return;
      pay(state.players[player], BUILDINGS[cmd.kind].cost);
      // Una porta sostituisce il tratto di cinta su cui viene aperta.
      const replaced = cmd.kind === 'porta' ? buildingAtTile(state, cmd.x, cmd.y) : undefined;
      if (replaced && isGateSite(replaced, cmd.cityId)) state.buildings = state.buildings.filter((b) => b !== replaced);
      addBuilding(state, cmd.cityId, cmd.kind, cmd.x, cmd.y, false);
      break;
    }
    case 'buildShip': {
      if (shipProblem(state, player, cmd.buildingId, cmd.cls)) return;
      const yard = getBuilding(state, cmd.buildingId)!;
      const city = getCity(state, yard.cityId)!;
      const s = SHIPS[cmd.cls];
      pay(state.players[player], shipCost(state, player, cmd.cls));
      city.garrison.sailors -= s.crew;
      city.population -= s.colonists;
      const name = sanitizeName(cmd.name) ?? suggestShipName(state, player);
      if (name === suggestShipName(state, player)) state.players[player].shipNameIndex++;
      yard.queue.push({ type: 'ship', cls: cmd.cls, name, ticksLeft: ticks(s.buildSeconds), totalTicks: ticks(s.buildSeconds) });
      break;
    }
    case 'recruit': {
      if (recruitProblem(state, player, cmd.buildingId, cmd.unit, cmd.count)) return;
      const barracks = getBuilding(state, cmd.buildingId)!;
      const city = getCity(state, barracks.cityId)!;
      pay(state.players[player], recruitCost(cmd.unit, cmd.count));
      city.population -= cmd.count;
      const t = Math.max(1, ticks(UNITS[cmd.unit].trainSeconds * cmd.count));
      barracks.queue.push({ type: 'recruit', unit: cmd.unit, count: cmd.count, ticksLeft: t, totalTicks: t });
      break;
    }
    case 'transfer': {
      const [ship] = ownedShips(state, player, [cmd.shipId]);
      const city = getCity(state, cmd.cityId);
      if (!ship || !city || city.owner !== player || dockedCity(state, ship)?.id !== city.id) return;
      transfer(ship, city, 'sailors', Math.trunc(cmd.sailors));
      transfer(ship, city, 'soldiers', Math.trunc(cmd.soldiers));
      break;
    }
    case 'heroBoard': {
      const hero = heroOf(state, player);
      const [ship] = ownedShips(state, player, [cmd.shipId]);
      if (!hero || !ship || hero.location.type !== 'city') return;
      if (dockedCity(state, ship)?.id !== hero.location.cityId) return;
      hero.location = { type: 'ship', shipId: ship.id };
      break;
    }
    case 'heroLand': {
      const hero = heroOf(state, player);
      if (!hero || hero.location.type !== 'ship') return;
      const ship = getShip(state, hero.location.shipId);
      const city = ship && dockedCity(state, ship);
      if (!city) return;
      hero.location = { type: 'city', cityId: city.id };
      break;
    }
    case 'renameShip': {
      const [ship] = ownedShips(state, player, [cmd.shipId]);
      const name = sanitizeName(cmd.name);
      if (ship && name) ship.name = name;
      break;
    }
  }
}

/** Sposta uomini: delta > 0 imbarca dalla città, delta < 0 sbarca in città. */
function transfer(ship: Ship, city: City, unit: UnitKind, delta: number): void {
  if (delta > 0) {
    const room = SHIPS[ship.cls].capacity - shipMen(ship);
    const n = Math.min(delta, Math.floor(city.garrison[unit]), room);
    if (n <= 0) return;
    city.garrison[unit] -= n;
    ship[unit] += n;
  } else if (delta < 0) {
    const n = Math.min(-delta, Math.floor(ship[unit]));
    if (n <= 0) return;
    ship[unit] -= n;
    city.garrison[unit] += n;
  }
}

// ================================================================ economia e città

function updateEconomy(state: GameState, p: Player): void {
  const balance = playerBalance(state, p.id);
  p.gold += balance.gold / TICK_RATE;
  p.wood += balance.wood / TICK_RATE;
  p.food += balance.food / TICK_RATE;
  if (p.food > 0) {
    p.starvingTicks = 0;
    return;
  }
  p.food = 0;
  if (p.starvingTicks === 0) state.events.push({ type: 'famine', owner: p.id });
  p.starvingTicks++;
  for (const c of state.cities) {
    if (c.owner === p.id) c.population = Math.max(1, c.population - CITY.starvationLoss / TICK_RATE);
  }
  if (p.starvingTicks % ticks(FOOD.desertionSeconds) === 0) {
    const desert = (crew: { sailors: number; soldiers: number }) => {
      crew.sailors = Math.max(0, crew.sailors - Math.max(1, Math.round(crew.sailors * FOOD.desertionShare)));
      crew.soldiers = Math.max(0, crew.soldiers - Math.max(1, Math.round(crew.soldiers * FOOD.desertionShare)));
    };
    for (const c of state.cities) if (c.owner === p.id) desert(c.garrison);
    for (const s of state.ships) if (s.owner === p.id) desert(s);
  }
}

function updateCity(state: GameState, city: City): void {
  if (city.owner !== NEUTRAL && !city.siege) {
    const cap = housing(state, city.id);
    const fed = state.players[city.owner].food > 0;
    if (fed && city.population < cap) {
      const growth = (CITY.growthBase + city.population * CITY.growthPerCitizen) / TICK_RATE;
      city.population = Math.min(cap, city.population + growth);
    } else if (city.population > cap + 0.5) {
      city.population -= CITY.starvationLoss / TICK_RATE;
    }
  }
  if (city.siege) resolveAssault(state, city);
}

export interface Fortifications {
  /** Moltiplicatore della guarnigione (difese e capitano). */
  defense: number;
  /** Forza fissa delle difese (si somma alla milizia). */
  militia: number;
  /** Indebolimento degli assalitori dovuto ai fossati (0..maxMoat). */
  moat: number;
  /** Quanti edifici difensivi completi e integri ci sono, per tipo. */
  count: Partial<Record<BuildingKind, number>>;
}

/** Riepilogo delle difese di una città. */
export function fortifications(state: GameState, city: City): Fortifications {
  let defense = 0;
  let militia = 0;
  let moat = 0;
  const count: Partial<Record<BuildingKind, number>> = {};
  for (const b of cityBuildings(state, city.id)) {
    if (!isComplete(b) || b.hp <= 0) continue;
    const s = BUILDINGS[b.kind];
    if (s.defense === 0 && s.militia === 0 && s.moat === 0) continue;
    defense += s.defense;
    militia += s.militia;
    moat += s.moat;
    count[b.kind] = (count[b.kind] ?? 0) + 1;
  }
  const hero = heroInCity(state, city.id);
  return {
    defense: (1 + Math.min(FORTIFICATIONS.maxDefense, defense)) * (hero ? heroCityBonus(hero).defense : 1),
    militia,
    moat: Math.min(FORTIFICATIONS.maxMoat, moat),
    count,
  };
}

/** Moltiplicatore della guarnigione dato da difese e capitano. */
export function defenseMultiplier(state: GameState, city: City): number {
  return fortifications(state, city).defense;
}

/** Forza difensiva di milizia cittadina e difese (non subisce perdite). */
export function militiaStrength(state: GameState, city: City): number {
  return city.population * CITY.militiaPerCitizen + fortifications(state, city).militia;
}

export function garrisonStrength(state: GameState, city: City): number {
  const power = modifiers(state, city.owner).soldierPower;
  const base = city.garrison.soldiers * UNITS.soldiers.power * power + city.garrison.sailors * UNITS.sailors.power;
  return base * defenseMultiplier(state, city);
}

function resolveAssault(state: GameState, city: City): void {
  const siege = city.siege!;
  const attMods = modifiers(state, siege.owner);
  // Chi deve attraversare i fossati combatte peggio.
  const attPower = UNITS.soldiers.power * attMods.soldierPower * (1 - fortifications(state, city).moat);
  const att = siege.soldiers * attPower;
  const garrison = garrisonStrength(state, city);
  const militia = militiaStrength(state, city);

  // Le perdite si dividono per la resistenza (PF) dei soldati di ciascuna fazione.
  siege.soldiers -= ((garrison + militia) * COMBAT.assaultRate) / (attPower * attMods.soldierHp);

  const defMods = modifiers(state, city.owner);
  // Mura e capitano moltiplicano la forza: per ucciderli serve più danno.
  let loss = (att * COMBAT.assaultRate) / (defMods.soldierHp * defenseMultiplier(state, city));
  const defPower = UNITS.soldiers.power * defMods.soldierPower;
  const soldierLoss = Math.min(city.garrison.soldiers, loss / defPower);
  city.garrison.soldiers -= soldierLoss;
  loss -= soldierLoss * defPower;
  city.garrison.sailors = Math.max(0, city.garrison.sailors - loss / UNITS.sailors.power);

  const garrisonLeft = city.garrison.soldiers + city.garrison.sailors;
  if (siege.soldiers < 0.5) {
    city.siege = null;
    state.events.push({ type: 'assaultFailed', cityId: city.id, attacker: siege.owner, defender: city.owner });
  } else if (garrisonLeft < 0.5 && siege.soldiers * attPower > militia) {
    captureCity(state, city, siege.owner, siege.soldiers);
  }
}

function captureCity(state: GameState, city: City, newOwner: PlayerId, soldiers: number): void {
  const from = city.owner;
  const hero = heroInCity(state, city.id);
  if (hero) loseHero(state, hero, 'cityLost');
  city.owner = newOwner;
  city.garrison = { sailors: 0, soldiers };
  city.siege = null;
  city.population = Math.max(1, city.population * (1 - CITY.capturePopulationLoss));
  for (const b of cityBuildings(state, city.id)) {
    b.queue = [];
    b.lastDamagedTick = state.tick;
    if (b.kind === 'municipio') b.hp = Math.max(b.hp, BUILDINGS.municipio.hp * 0.3);
  }
  state.events.push({ type: 'cityCaptured', cityId: city.id, from, to: newOwner });
}

// ================================================================ edifici

function updateBuilding(state: GameState, b: Building, ctx: TickContext): void {
  const city = getCity(state, b.cityId);
  if (!city) return;
  const owner = city.owner;

  if (b.buildLeft > 0) {
    if (--b.buildLeft === 0) state.events.push({ type: 'buildingDone', buildingId: b.id, owner, kind: b.kind });
    return;
  }

  const max = BUILDINGS[b.kind].hp;
  if (b.hp < max && !city.siege && state.tick - b.lastDamagedTick > ticks(CITY.regenDelaySeconds)) {
    b.hp = Math.min(max, b.hp + CITY.regenPerSecond / TICK_RATE);
  }

  const current = b.queue[0];
  if (current && --current.ticksLeft <= 0) {
    b.queue.shift();
    if (current.type === 'ship') {
      const dock = shipyardDock(state, b);
      const ship = spawnShip(state, owner, current.cls, dock.x, dock.y, current.name, { sailors: SHIPS[current.cls].crew });
      ship.colonists = SHIPS[current.cls].colonists;
      state.events.push({ type: 'shipLaunched', shipId: ship.id, owner, cityId: city.id });
    } else {
      city.garrison[current.unit] += current.count;
      state.events.push({ type: 'recruited', cityId: city.id, owner, unit: current.unit, count: current.count });
    }
  }

  if (b.cooldown > 0) b.cooldown--;
  const stats = BUILDINGS[b.kind];
  if (stats.damage > 0 && b.hp > 0 && b.cooldown === 0) buildingFire(state, b, city, ctx);
}

function hostileToCity(state: GameState, s: Ship, city: City): boolean {
  if (s.owner === city.owner) return false;
  if (city.owner !== NEUTRAL) return isEnemy(city.owner, s.owner);
  // Le città neutrali rispondono solo a chi le attacca.
  if (city.siege?.owner === s.owner) return true;
  const o = s.order;
  if (o.type === 'land') return o.cityId === city.id;
  if (o.type === 'attackBuilding') return getBuilding(state, o.targetId)?.cityId === city.id;
  return false;
}

function buildingFire(state: GameState, b: Building, city: City, ctx: TickContext): void {
  const stats = BUILDINGS[b.kind];
  const center = buildingCenter(b);
  let target: Ship | null = null;
  let bestD = Infinity;
  for (const s of state.ships) {
    if (s.hp <= 0 || !hostileToCity(state, s, city)) continue;
    const d = distance(center, s);
    if (d <= stats.range && d < bestD) {
      target = s;
      bestD = d;
    }
  }
  if (!target) return;
  const hero = heroInCity(state, city.id);
  target.hp -= stats.damage * modifiers(state, city.owner).cannonDamage * (hero ? heroCityBonus(hero).towers : 1);
  b.cooldown = ticks(stats.reloadSeconds);
  state.events.push({ type: 'shot', from: center, to: { x: target.x, y: target.y } });
  if (target.hp <= 0 && !ctx.sunkBy.has(target.id)) ctx.sunkBy.set(target.id, city.owner);
}

function removeDestroyedBuildings(state: GameState): void {
  state.buildings = state.buildings.filter((b) => {
    if (b.hp > 0 || b.kind === 'municipio') return true;
    const c = buildingCenter(b);
    state.events.push({ type: 'buildingDestroyed', buildingId: b.id, owner: buildingOwner(state, b), kind: b.kind, x: c.x, y: c.y });
    return false;
  });
}

// ================================================================ navi

function chase(state: GameState, ship: Ship, goal: Point): void {
  if (ship.repath > 0 && ship.path.length > 0) {
    ship.repath--;
    return;
  }
  ship.path = findPath(state.map, ship, goal) ?? [];
  ship.repath = ticks(COMBAT.repathSeconds);
}

function moveAlongPath(state: GameState, ship: Ship): void {
  const hero = heroOnShip(state, ship.id);
  const heroSpeed = hero ? heroShipBonus(hero).speed : 1;
  let remaining = (SHIPS[ship.cls].speed * modifiers(state, ship.owner).shipSpeed * heroSpeed * crewEfficiency(ship)) / TICK_RATE;
  while (remaining > 0 && ship.path.length > 0) {
    const wp = ship.path[0];
    const dx = wp.x - ship.x;
    const dy = wp.y - ship.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= remaining) {
      ship.x = wp.x;
      ship.y = wp.y;
      ship.path.shift();
      remaining -= d;
    } else {
      ship.x += (dx / d) * remaining;
      ship.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
}

function idle(ship: Ship): void {
  ship.order = { type: 'idle' };
  ship.path = [];
}

/** Distanza di tiro verso un edificio: conta anche la sua grandezza. */
function buildingReach(b: Building): number {
  const s = BUILDINGS[b.kind];
  return Math.max(s.w, s.h) / 2;
}

function updateShip(state: GameState, ship: Ship, ctx: TickContext): void {
  if (ship.hp <= 0) return;
  const stats = SHIPS[ship.cls];
  const order = ship.order;

  switch (order.type) {
    case 'idle':
      break;
    case 'move':
      if (ship.path.length === 0) idle(ship);
      break;
    case 'attackShip': {
      const target = getShip(state, order.targetId);
      if (!target || target.hp <= 0 || !isEnemy(ship.owner, target.owner)) {
        idle(ship);
        break;
      }
      const d = distance(ship, target);
      if (order.board) {
        if (d <= COMBAT.boardRange) resolveBoarding(state, ship, target);
        else chase(state, ship, target);
      } else if (d > stats.range * 0.85) {
        chase(state, ship, target);
      } else {
        ship.path = [];
      }
      break;
    }
    case 'attackBuilding': {
      const target = getBuilding(state, order.targetId);
      if (!target || target.hp <= 0 || buildingOwner(state, target) === ship.owner) {
        idle(ship);
        break;
      }
      const c = buildingCenter(target);
      if (distance(ship, c) > stats.range * 0.85 + buildingReach(target)) {
        const goal = nearestSea(state.map, c.x, c.y, 8);
        if (goal) chase(state, ship, { x: goal.x + 0.5, y: goal.y + 0.5 });
        else idle(ship);
      } else {
        ship.path = [];
      }
      break;
    }
    case 'land': {
      const city = getCity(state, order.cityId);
      if (!city || city.owner === ship.owner || ship.soldiers < 1) {
        idle(ship);
        break;
      }
      const dock = { x: city.dock.x + 0.5, y: city.dock.y + 0.5 };
      if (distance(ship, dock) <= COMBAT.dockRange) {
        if (city.siege && city.siege.owner !== ship.owner) {
          idle(ship); // un altro esercito sta già assediando
          break;
        }
        const landed = Math.floor(ship.soldiers);
        city.siege = city.siege ?? { owner: ship.owner, soldiers: 0 };
        city.siege.soldiers += landed;
        ship.soldiers -= landed;
        state.events.push({ type: 'troopsLanded', cityId: city.id, owner: ship.owner, defender: city.owner, soldiers: landed, from: { x: ship.x, y: ship.y } });
        idle(ship);
      } else {
        chase(state, ship, dock);
      }
      break;
    }
    case 'found': {
      if (foundingProblem(state, order.x, order.y)) {
        idle(ship);
        break;
      }
      const dock = nearestSea(state.map, order.x, order.y, 4);
      if (dock && distance(ship, { x: dock.x + 0.5, y: dock.y + 0.5 }) <= 2) {
        const city = addCity(state, ship.owner, order.x, order.y, ship.colonists, { sailors: ship.sailors, soldiers: ship.soldiers });
        ctx.founded.set(ship.id, city.id);
        ship.hp = 0;
        state.events.push({ type: 'cityFounded', cityId: city.id, owner: ship.owner });
        return;
      }
      if (ship.path.length === 0) idle(ship);
      break;
    }
  }

  moveAlongPath(state, ship);
  if (ship.cooldown > 0) ship.cooldown--;
  if (stats.damage > 0 && ship.cooldown === 0) shipFire(state, ship, ctx);
}

function shipFire(state: GameState, ship: Ship, ctx: TickContext): void {
  const stats = SHIPS[ship.cls];
  const order = ship.order;

  if (order.type === 'attackShip' && !order.board) {
    const t = getShip(state, order.targetId);
    if (t && t.hp > 0 && distance(ship, t) <= stats.range) return fireAt(state, ship, t, ctx);
  }
  if (order.type === 'attackBuilding') {
    const b = getBuilding(state, order.targetId);
    if (b && b.hp > 0) {
      const c = buildingCenter(b);
      if (distance(ship, c) <= stats.range + buildingReach(b)) {
        b.hp = Math.max(0, b.hp - damageOf(state, ship));
        b.lastDamagedTick = state.tick;
        ship.cooldown = reloadTicks(ship);
        state.events.push({ type: 'shot', from: { x: ship.x, y: ship.y }, to: c });
        return;
      }
    }
  }
  // Durante l'abbordaggio non si spara al bersaglio, ma ci si difende dagli altri.
  const avoid = order.type === 'attackShip' && order.board ? order.targetId : -1;
  let target: Ship | null = null;
  let bestD = Infinity;
  for (const s of state.ships) {
    if (s.hp <= 0 || s.id === avoid || !isEnemy(ship.owner, s.owner)) continue;
    const d = distance(ship, s);
    if (d <= stats.range && d < bestD) {
      target = s;
      bestD = d;
    }
  }
  if (target) fireAt(state, ship, target, ctx);
}

function damageOf(state: GameState, ship: Ship): number {
  const hero = heroOnShip(state, ship.id);
  return SHIPS[ship.cls].damage * modifiers(state, ship.owner).cannonDamage * (hero ? heroShipBonus(hero).cannon : 1);
}

function reloadTicks(ship: Ship): number {
  return Math.max(1, Math.round(ticks(SHIPS[ship.cls].reloadSeconds) / crewEfficiency(ship)));
}

function fireAt(state: GameState, ship: Ship, target: Ship, ctx: TickContext): void {
  target.hp -= damageOf(state, ship);
  ship.cooldown = reloadTicks(ship);
  state.events.push({ type: 'shot', from: { x: ship.x, y: ship.y }, to: { x: target.x, y: target.y } });
  if (target.hp <= 0 && !ctx.sunkBy.has(target.id)) {
    ctx.sunkBy.set(target.id, ship.owner);
    gainXp(state, heroOnShip(state, ship.id), 1);
  }
}

/** Forza di un equipaggio nell'arrembaggio. */
export function boardingStrength(state: GameState, s: Ship): number {
  const m = modifiers(state, s.owner);
  const hero = heroOnShip(state, s.id);
  return (s.soldiers * UNITS.soldiers.power * m.soldierPower + s.sailors * UNITS.sailors.power) * m.boarding * (hero ? heroShipBonus(hero).boarding : 1);
}

function resolveBoarding(state: GameState, ship: Ship, target: Ship): void {
  const att = boardingStrength(state, ship);
  // Un equipaggio con lo scafo a pezzi si difende peggio.
  const def = boardingStrength(state, target) * (0.5 + 0.5 * (target.hp / shipMaxHp(state, target)));
  idle(ship);
  if (att <= 0) return;
  const attHp = modifiers(state, ship.owner).soldierHp;
  const defHp = modifiers(state, target.owner).soldierHp;
  if (att > def) {
    const survive = 1 - ((def / att) * 0.6) / attHp;
    ship.sailors = Math.floor(ship.sailors * survive);
    ship.soldiers = Math.floor(ship.soldiers * survive);
    const prizeCrew = Math.min(SHIPS[target.cls].crew, Math.floor(ship.sailors / 2));
    const from = target.owner;
    target.owner = ship.owner;
    target.sailors = prizeCrew;
    target.soldiers = 0;
    target.colonists = 0;
    ship.sailors -= prizeCrew;
    idle(target);
    const captain = heroOnShip(state, target.id);
    if (captain) loseHero(state, captain, 'captured');
    gainXp(state, heroOnShip(state, ship.id), 2);
    state.events.push({ type: 'shipCaptured', shipId: target.id, name: target.name, from, to: ship.owner });
  } else {
    const survive = 1 - Math.min(0.9, (att / Math.max(def, 0.01)) * 0.6) / defHp;
    const attSurvive = 1 - 0.6 / attHp;
    target.sailors = Math.floor(target.sailors * survive);
    target.soldiers = Math.floor(target.soldiers * survive);
    ship.sailors = Math.floor(ship.sailors * attSurvive);
    ship.soldiers = Math.floor(ship.soldiers * attSurvive);
    state.events.push({ type: 'boardingRepelled', shipId: target.id, attacker: ship.owner, defender: target.owner });
  }
}

function removeSunkShips(state: GameState, ctx: TickContext): void {
  const survivors: Ship[] = [];
  for (const s of state.ships) {
    if (s.hp > 0) {
      survivors.push(s);
      continue;
    }
    const hero = heroOnShip(state, s.id);
    if (hero) {
      // Una nave coloniale che fonda una città porta il capitano a terra.
      const founded = ctx.founded.get(s.id);
      if (founded !== undefined) hero.location = { type: 'city', cityId: founded };
      else loseHero(state, hero, 'shipwreck');
    }
    if (!ctx.founded.has(s.id)) {
      state.events.push({ type: 'shipSunk', shipId: s.id, name: s.name, owner: s.owner, by: ctx.sunkBy.get(s.id) ?? NEUTRAL, x: s.x, y: s.y });
    }
  }
  state.ships = survivors;
}

// ================================================================ capitano

function loseHero(state: GameState, hero: Hero, reason: 'shipwreck' | 'captured' | 'cityLost'): void {
  hero.location = { type: 'away', returnTick: state.tick + ticks(HERO.returnSeconds) };
  state.events.push({ type: 'heroLost', owner: hero.owner, reason });
}

function gainXp(state: GameState, hero: Hero | undefined, xp: number): void {
  if (!hero) return;
  const before = heroLevel(hero);
  hero.xp += xp;
  const after = heroLevel(hero);
  if (after > before) state.events.push({ type: 'heroLevelUp', owner: hero.owner, level: after });
}

function updateHeroes(state: GameState): void {
  for (const hero of state.heroes) {
    const loc = hero.location;
    // Un capitano su una nave che non esiste più o non è più sua è disperso.
    if (loc.type === 'ship') {
      const ship = getShip(state, loc.shipId);
      if (!ship || ship.owner !== hero.owner) loseHero(state, hero, 'shipwreck');
    } else if (loc.type === 'city') {
      if (getCity(state, loc.cityId)?.owner !== hero.owner) loseHero(state, hero, 'cityLost');
    } else if (state.tick >= loc.returnTick) {
      const home = state.cities.find((c) => c.owner === hero.owner);
      if (home) {
        hero.location = { type: 'city', cityId: home.id };
        state.events.push({ type: 'heroReturned', owner: hero.owner, cityId: home.id });
      }
    }
  }
}

function checkElimination(state: GameState): void {
  const contenders = state.players.filter((p) => p.id !== NEUTRAL);
  for (const p of contenders) {
    if (!p.alive) continue;
    const hasAny = state.cities.some((c) => c.owner === p.id) || state.ships.some((s) => s.owner === p.id);
    if (!hasAny) {
      p.alive = false;
      state.events.push({ type: 'playerEliminated', player: p.id });
    }
  }
  const alive = contenders.filter((p) => p.alive);
  if (contenders.length > 1 && alive.length <= 1) state.winner = alive[0]?.id ?? NEUTRAL;
}

