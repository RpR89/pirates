import type { Command } from './commands';
import { isWalkable, nearestWalkable, type Point } from './map';
import { findLandPath } from './pathfinding';
import { ARMY, COMBAT, SHIPS, TICK_RATE, UNITS, ticks } from './rules';
import {
  NEUTRAL,
  distance,
  getArmy,
  getCity,
  getShip,
  isEnemy,
  modifiers,
  shipMen,
  type Army,
  type City,
  type GameState,
  type PlayerId,
  type Ship,
} from './state';

/**
 * Reparti a terra: soldati sbarcati fuori dalle città. Si muovono a piedi
 * (A* sulla terraferma), assaltano o rinforzano le città, si reimbarcano e
 * combattono in mischia con i reparti nemici.
 */

type ArmyCommand = Extract<Command, { armyIds: number[] }>;

function ownedArmies(state: GameState, player: PlayerId, ids: readonly number[]): Army[] {
  return [...new Set(ids)].map((id) => getArmy(state, id)).filter((a): a is Army => !!a && a.owner === player);
}

/** Forza di combattimento di un reparto. */
export function armyStrength(state: GameState, a: Army): number {
  return a.soldiers * UNITS.soldiers.power * modifiers(state, a.owner).soldierPower;
}

/** Sbarca tutti i soldati della nave sulla terra vicina; si unisce a un reparto amico già lì. */
export function landArmy(state: GameState, ship: Ship, at: Point): Army | null {
  const soldiers = Math.floor(ship.soldiers);
  if (soldiers < 1) return null;
  ship.soldiers -= soldiers;
  let army = state.armies.find((a) => a.owner === ship.owner && a.order.type === 'idle' && distance(a, at) <= ARMY.mergeRange);
  if (army) army.soldiers += soldiers;
  else {
    army = { id: state.nextId++, owner: ship.owner, x: at.x, y: at.y, soldiers, path: [], order: { type: 'idle' }, repath: 0 };
    state.armies.push(army);
  }
  state.events.push({ type: 'armyLanded', armyId: army.id, owner: ship.owner, soldiers, from: { x: ship.x, y: ship.y }, to: at });
  return army;
}

/** Applica un comando ai reparti; false se il comando non riguarda i reparti. */
export function applyArmyCommand(state: GameState, player: PlayerId, cmd: Command): boolean {
  if (!('armyIds' in cmd)) return false;
  const c = cmd as ArmyCommand;
  const armies = ownedArmies(state, player, c.armyIds);
  switch (c.type) {
    case 'armyMove': {
      if (!isWalkable(state.map, Math.floor(c.x), Math.floor(c.y))) return true;
      armies.forEach((a, i) => {
        // Piccola formazione attorno al punto scelto.
        const off = i === 0 ? { x: 0, y: 0 } : { x: ((i % 3) - 1) * 0.9, y: Math.ceil(i / 3) * 0.9 };
        const goal = isWalkable(state.map, Math.floor(c.x + off.x), Math.floor(c.y + off.y)) ? { x: c.x + off.x, y: c.y + off.y } : { x: c.x, y: c.y };
        const path = findLandPath(state.map, a, goal);
        a.path = path ?? [];
        a.order = path ? { type: 'move' } : { type: 'idle' };
      });
      return true;
    }
    case 'armyCity': {
      if (!getCity(state, c.cityId)) return true;
      for (const a of armies) {
        a.order = { type: 'city', cityId: c.cityId };
        a.repath = 0;
        a.path = [];
      }
      return true;
    }
    case 'armyEmbark': {
      const ship = getShip(state, c.shipId);
      if (!ship || ship.owner !== player) return true;
      for (const a of armies) {
        a.order = { type: 'embark', shipId: ship.id };
        a.repath = 0;
        a.path = [];
      }
      return true;
    }
    case 'armyAttack': {
      const target = getArmy(state, c.targetId);
      if (!target || !isEnemy(player, target.owner)) return true;
      for (const a of armies) {
        a.order = { type: 'attackArmy', targetId: target.id };
        a.repath = 0;
        a.path = [];
      }
      return true;
    }
    case 'armyStop':
      for (const a of armies) {
        a.order = { type: 'idle' };
        a.path = [];
      }
      return true;
  }
  return true;
}

function chaseOnLand(state: GameState, a: Army, goal: Point): void {
  if (a.repath > 0 && a.path.length > 0) {
    a.repath--;
    return;
  }
  a.path = findLandPath(state.map, a, goal) ?? [];
  a.repath = ticks(1);
}

function march(a: Army): void {
  let remaining = ARMY.speed / TICK_RATE;
  while (remaining > 0 && a.path.length > 0) {
    const wp = a.path[0];
    const dx = wp.x - a.x;
    const dy = wp.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= remaining) {
      a.x = wp.x;
      a.y = wp.y;
      a.path.shift();
      remaining -= d;
    } else {
      a.x += (dx / d) * remaining;
      a.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
}

/** Il reparto raggiunge una città: entra nella propria, assalta le altre. Restituisce true se è stato assorbito. */
function reachCity(state: GameState, a: Army, city: City): boolean {
  if (city.owner === a.owner) {
    city.garrison.soldiers += a.soldiers;
    a.soldiers = 0;
    return true;
  }
  if (city.siege && city.siege.owner !== a.owner) return false; // c'è già un altro assedio: aspetta
  city.siege = city.siege ?? { owner: a.owner, soldiers: 0 };
  city.siege.soldiers += a.soldiers;
  state.events.push({ type: 'troopsLanded', cityId: city.id, owner: a.owner, defender: city.owner, soldiers: Math.floor(a.soldiers), from: { x: a.x, y: a.y } });
  a.soldiers = 0;
  return true;
}

/** Un tick per tutti i reparti: ordini, marcia, mischia, perdite. */
export function updateArmies(state: GameState): void {
  const absorbed = new Set<number>();
  for (const a of state.armies) {
    const o = a.order;
    switch (o.type) {
      case 'move':
        if (a.path.length === 0) a.order = { type: 'idle' };
        break;
      case 'city': {
        const city = getCity(state, o.cityId);
        if (!city) {
          a.order = { type: 'idle' };
          break;
        }
        const center = { x: city.cx + 0.5, y: city.cy + 0.5 };
        if (distance(a, center) <= ARMY.cityReach) {
          a.path = [];
          if (reachCity(state, a, city)) absorbed.add(a.id);
        } else {
          chaseOnLand(state, a, center);
          if (a.path.length === 0) a.order = { type: 'idle' }; // irraggiungibile a piedi
        }
        break;
      }
      case 'embark': {
        const ship = getShip(state, o.shipId);
        if (!ship || ship.owner !== a.owner || ship.hp <= 0) {
          a.order = { type: 'idle' };
          break;
        }
        if (distance(a, ship) <= ARMY.embarkRange) {
          a.path = [];
          const room = Math.floor(SHIPS[ship.cls].capacity - shipMen(ship));
          const n = Math.max(0, Math.min(room, Math.floor(a.soldiers)));
          ship.soldiers += n;
          a.soldiers -= n;
          if (a.soldiers < 1) absorbed.add(a.id); // tutti a bordo (chi non c'entra resta a terra)
          a.order = { type: 'idle' };
        } else {
          const shore = nearestWalkable(state.map, ship.x, ship.y, 4);
          if (!shore) {
            a.order = { type: 'idle' };
            break;
          }
          chaseOnLand(state, a, { x: shore.x + 0.5, y: shore.y + 0.5 });
          if (a.path.length === 0 && distance(a, ship) > ARMY.embarkRange + 1.5) a.order = { type: 'idle' };
        }
        break;
      }
      case 'attackArmy': {
        const t = getArmy(state, o.targetId);
        if (!t || t.soldiers <= 0 || !isEnemy(a.owner, t.owner)) {
          a.order = { type: 'idle' };
          a.path = [];
          break;
        }
        if (distance(a, t) > ARMY.meleeRange * 0.8) chaseOnLand(state, a, t);
        else a.path = [];
        break;
      }
    }
    march(a);
  }

  // Mischia: ogni reparto subisce la forza dei nemici a contatto (calcolo simultaneo).
  const losses = new Map<number, number>();
  for (const a of state.armies) {
    if (absorbed.has(a.id)) continue;
    let enemy = 0;
    for (const e of state.armies) {
      if (e === a || absorbed.has(e.id) || !isEnemy(a.owner, e.owner)) continue;
      if (distance(a, e) <= ARMY.meleeRange) enemy += armyStrength(state, e);
    }
    if (enemy > 0) {
      const mods = modifiers(state, a.owner);
      losses.set(a.id, (enemy * COMBAT.assaultRate) / (UNITS.soldiers.power * mods.soldierPower * mods.soldierHp));
    }
  }
  for (const a of state.armies) a.soldiers -= losses.get(a.id) ?? 0;

  state.armies = state.armies.filter((a) => {
    if (absorbed.has(a.id)) return false;
    if (a.soldiers >= 0.5) return true;
    state.events.push({ type: 'armyLost', owner: a.owner, x: a.x, y: a.y });
    return false;
  });
}

/** Un reparto è un bersaglio per le difese della città? */
export function armyHostileToCity(a: Army, city: City): boolean {
  if (a.owner === city.owner) return false;
  if (city.owner !== NEUTRAL) return isEnemy(city.owner, a.owner);
  return (a.order.type === 'city' && a.order.cityId === city.id) || city.siege?.owner === a.owner;
}
