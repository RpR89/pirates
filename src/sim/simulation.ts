import type { Command, PlayerCommand } from './commands';
import { isLand, isSea, nearestSea, type Point } from './map';
import { findPath } from './pathfinding';
import {
  BUILDINGS,
  COMBAT,
  SHIPS,
  TICK_RATE,
  VILLAGE,
  buildingCost,
  ticks,
  type Cost,
  type ShipKind,
} from './rules';
import {
  NEUTRAL,
  addVillage,
  distance,
  foundingSite,
  getShip,
  getVillage,
  isEnemy,
  spawnShip,
  villageCenter,
  villageMaxHp,
  type GameState,
  type Player,
  type PlayerId,
  type ProductionItem,
  type Ship,
  type Village,
} from './state';

/**
 * Avanza la simulazione di un tick. Deterministica: stesso stato + stessi comandi
 * → stesso risultato su ogni macchina (base per il multiplayer lockstep).
 * Muta lo stato sul posto.
 */
export function step(state: GameState, commands: readonly PlayerCommand[]): void {
  if (state.winner !== null) return;
  state.events = [];

  const ordered = [...commands].sort((a, b) => a.player - b.player);
  for (const c of ordered) applyCommand(state, c.player, c.command);

  updateVillages(state);
  for (const ship of state.ships) updateShip(state, ship);
  for (const village of state.villages) villageFire(state, village);
  removeSunkShips(state);
  checkElimination(state);

  state.tick++;
}

// ---------------------------------------------------------------- comandi

function ownedShips(state: GameState, player: PlayerId, ids: readonly number[]): Ship[] {
  const unique = [...new Set(ids)];
  return unique
    .map((id) => getShip(state, id))
    .filter((s): s is Ship => s !== undefined && s.owner === player);
}

/** Posizioni di formazione attorno al punto di arrivo, in ordine deterministico. */
const FORMATION: readonly Point[] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 2, y: 0 },
  { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 0, y: -2 }, { x: 2, y: 1 }, { x: -2, y: 1 },
  { x: 2, y: -1 }, { x: -2, y: -1 }, { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 },
];

function applyCommand(state: GameState, player: PlayerId, cmd: Command): void {
  if (!state.players[player]?.alive) return;
  switch (cmd.type) {
    case 'move': {
      ownedShips(state, player, cmd.shipIds).forEach((ship, i) => {
        const off = FORMATION[i % FORMATION.length];
        const ring = Math.floor(i / FORMATION.length) + 1;
        const target = { x: cmd.x + off.x * 1.5 * ring, y: cmd.y + off.y * 1.5 * ring };
        const path = findPath(state.map, ship, target);
        ship.path = path ?? [];
        ship.order = path ? { type: 'move' } : { type: 'idle' };
      });
      break;
    }
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
        if (SHIPS[ship.kind].damage <= 0) continue;
        ship.order = { type: 'attackShip', targetId: target.id, capture: cmd.capture };
        ship.repath = 0;
      }
      break;
    }
    case 'attackVillage': {
      const target = getVillage(state, cmd.targetId);
      if (!target || target.owner === player) return;
      for (const ship of ownedShips(state, player, cmd.shipIds)) {
        if (SHIPS[ship.kind].damage <= 0) continue;
        ship.order = { type: 'attackVillage', targetId: target.id };
        ship.repath = 0;
      }
      break;
    }
    case 'found': {
      const [ship] = ownedShips(state, player, [cmd.shipId]);
      if (!ship || ship.kind !== 'colony') return;
      const site = foundingSite(state, cmd.x, cmd.y);
      if (!site) return;
      const path = findPath(state.map, ship, { x: site.dock.x + 0.5, y: site.dock.y + 0.5 });
      if (!path) return;
      ship.path = path;
      ship.order = { type: 'found', x: site.x, y: site.y };
      break;
    }
    case 'build':
      enqueue(state, player, cmd.villageId, cmd.item);
      break;
  }
}

function canAfford(p: Player, cost: Cost): boolean {
  return p.gold >= cost.gold && p.wood >= cost.wood;
}

/** Costo e validità di un elemento di produzione, o null se non costruibile ora. */
export function productionCost(village: Village, item: ProductionItem): Cost | null {
  if (village.queue.length >= VILLAGE.queueMax) return null;
  if (item.type === 'ship') {
    const stats = SHIPS[item.ship];
    return village.buildings.cantiere >= stats.shipyardLevel ? stats.cost : null;
  }
  const queued = village.queue.filter(
    (q) => q.item.type === 'building' && q.item.building === item.building,
  ).length;
  const level = village.buildings[item.building] + queued;
  return level < BUILDINGS[item.building].maxLevel ? buildingCost(item.building, level) : null;
}

export function canBuild(state: GameState, player: PlayerId, villageId: number, item: ProductionItem): boolean {
  const village = getVillage(state, villageId);
  if (!village || village.owner !== player) return false;
  const cost = productionCost(village, item);
  return cost !== null && canAfford(state.players[player], cost);
}

function enqueue(state: GameState, player: PlayerId, villageId: number, item: ProductionItem): void {
  const village = getVillage(state, villageId);
  if (!village || village.owner !== player) return;
  const cost = productionCost(village, item);
  const p = state.players[player];
  if (!cost || !canAfford(p, cost)) return;
  p.gold -= cost.gold;
  p.wood -= cost.wood;
  const seconds = item.type === 'ship' ? SHIPS[item.ship].buildSeconds : BUILDINGS[item.building].buildSeconds;
  village.queue.push({ item, ticksLeft: ticks(seconds), totalTicks: ticks(seconds) });
}

// ---------------------------------------------------------------- villaggi

export function villageIncome(v: Village): Cost {
  return {
    gold: VILLAGE.goldPerSecond + v.buildings.mercato * VILLAGE.goldPerMercato,
    wood: VILLAGE.woodPerSecond + v.buildings.segheria * VILLAGE.woodPerSegheria,
  };
}

function updateVillages(state: GameState): void {
  for (const v of state.villages) {
    if (v.owner !== NEUTRAL) {
      const p = state.players[v.owner];
      const income = villageIncome(v);
      p.gold += income.gold / TICK_RATE;
      p.wood += income.wood / TICK_RATE;
    }

    const current = v.queue[0];
    if (current && --current.ticksLeft <= 0) {
      v.queue.shift();
      completeProduction(state, v, current.item);
    }

    const max = villageMaxHp(v);
    if (v.hp < max && state.tick - v.lastDamagedTick > ticks(VILLAGE.regenDelaySeconds)) {
      v.hp = Math.min(max, v.hp + VILLAGE.regenPerSecond / TICK_RATE);
    }
    if (v.cooldown > 0) v.cooldown--;
  }
}

function completeProduction(state: GameState, v: Village, item: ProductionItem): void {
  if (item.type === 'ship') {
    const ship = spawnShip(state, v.owner, item.ship, v.dock.x + 0.5, v.dock.y + 0.5);
    state.events.push({ type: 'shipBuilt', shipId: ship.id, owner: v.owner, kind: item.ship });
  } else {
    v.buildings[item.building]++;
    if (item.building === 'forte') v.hp += VILLAGE.hpPerForte;
    state.events.push({
      type: 'buildingDone',
      villageId: v.id,
      owner: v.owner,
      building: item.building,
      level: v.buildings[item.building],
    });
  }
}

function villageFire(state: GameState, v: Village): void {
  if (v.cooldown > 0 || v.hp <= 0) return;
  const center = villageCenter(v);
  let target: Ship | null = null;
  let bestD = Infinity;
  for (const s of state.ships) {
    if (s.hp <= 0 || s.owner === v.owner) continue;
    // I villaggi neutrali rispondono solo a chi li attacca.
    const hostile =
      v.owner === NEUTRAL
        ? s.order.type === 'attackVillage' && s.order.targetId === v.id
        : isEnemy(v.owner, s.owner);
    if (!hostile) continue;
    const d = distance(center, s);
    if (d <= VILLAGE.range && d < bestD) {
      target = s;
      bestD = d;
    }
  }
  if (!target) return;
  target.hp -= VILLAGE.baseDamage + v.buildings.forte * VILLAGE.damagePerForte;
  v.cooldown = ticks(VILLAGE.reloadSeconds);
  state.events.push({ type: 'shot', from: center, to: { x: target.x, y: target.y }, hit: true });
  if (target.hp <= 0) markSunkBy.set(target.id, v.owner);
}

// ---------------------------------------------------------------- navi

/** Chi ha affondato ogni nave in questo tick (per gli eventi). */
const markSunkBy = new Map<number, PlayerId>();

function chase(state: GameState, ship: Ship, goal: Point): void {
  if (ship.repath > 0 && ship.path.length > 0) {
    ship.repath--;
    return;
  }
  ship.path = findPath(state.map, ship, goal) ?? [];
  ship.repath = ticks(COMBAT.repathSeconds);
}

function moveAlongPath(ship: Ship): void {
  let remaining = SHIPS[ship.kind].speed / TICK_RATE;
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

function updateShip(state: GameState, ship: Ship): void {
  if (ship.hp <= 0) return;
  const stats = SHIPS[ship.kind];
  const order = ship.order;

  switch (order.type) {
    case 'idle':
      break;
    case 'move':
      if (ship.path.length === 0) ship.order = { type: 'idle' };
      break;
    case 'attackShip': {
      const target = getShip(state, order.targetId);
      if (!target || target.hp <= 0 || !isEnemy(ship.owner, target.owner)) {
        ship.order = { type: 'idle' };
        ship.path = [];
        break;
      }
      const d = distance(ship, target);
      const boardable = order.capture && target.hp <= SHIPS[target.kind].hp * COMBAT.captureHpRatio;
      if (boardable && d <= COMBAT.boardRange) {
        captureShip(state, target, ship.owner);
        ship.order = { type: 'idle' };
        ship.path = [];
      } else if (boardable || d > stats.range * 0.85) {
        chase(state, ship, target);
      } else {
        ship.path = [];
      }
      break;
    }
    case 'attackVillage': {
      const target = getVillage(state, order.targetId);
      if (!target || target.owner === ship.owner) {
        ship.order = { type: 'idle' };
        ship.path = [];
        break;
      }
      const d = distance(ship, villageCenter(target));
      if (target.hp <= 0 && d <= VILLAGE.conquerRange) {
        captureVillage(state, target, ship.owner);
        ship.order = { type: 'idle' };
        ship.path = [];
      } else if (d > (target.hp <= 0 ? VILLAGE.conquerRange : stats.range * 0.85)) {
        chase(state, ship, { x: target.dock.x + 0.5, y: target.dock.y + 0.5 });
      } else {
        ship.path = [];
      }
      break;
    }
    case 'found': {
      const site = foundingSite(state, order.x, order.y);
      if (!site) {
        ship.order = { type: 'idle' };
        ship.path = [];
        break;
      }
      if (distance(ship, { x: site.dock.x + 0.5, y: site.dock.y + 0.5 }) <= 1.5) {
        const v = addVillage(state, ship.owner, site);
        v.hp = villageMaxHp(v) * VILLAGE.restartHpRatio;
        ship.hp = 0; // l'equipaggio scende a terra: la nave diventa il villaggio
        state.events.push({ type: 'villageFounded', villageId: v.id, owner: v.owner });
      } else if (ship.path.length === 0) {
        ship.order = { type: 'idle' };
      }
      break;
    }
  }

  moveAlongPath(ship);
  if (ship.cooldown > 0) ship.cooldown--;
  if (stats.damage > 0 && ship.cooldown === 0) shipFire(state, ship);
}

function shipFire(state: GameState, ship: Ship): void {
  const stats = SHIPS[ship.kind];
  const order = ship.order;

  if (order.type === 'attackShip') {
    const t = getShip(state, order.targetId);
    const holdFire = order.capture && t && t.hp <= SHIPS[t.kind].hp * COMBAT.captureHpRatio;
    if (t && !holdFire && t.hp > 0 && distance(ship, t) <= stats.range) {
      fireAtShip(state, ship, t);
      return;
    }
  }
  if (order.type === 'attackVillage') {
    const v = getVillage(state, order.targetId);
    if (v && v.hp > 0 && distance(ship, villageCenter(v)) <= stats.range) {
      const center = villageCenter(v);
      v.hp = Math.max(0, v.hp - stats.damage);
      v.lastDamagedTick = state.tick;
      ship.cooldown = ticks(stats.reloadSeconds);
      state.events.push({ type: 'shot', from: { x: ship.x, y: ship.y }, to: center, hit: true });
      return;
    }
  }

  // Fuoco automatico sulla nave nemica più vicina.
  let target: Ship | null = null;
  let bestD = Infinity;
  for (const s of state.ships) {
    if (s.hp <= 0 || !isEnemy(ship.owner, s.owner)) continue;
    const d = distance(ship, s);
    if (d <= stats.range && d < bestD) {
      target = s;
      bestD = d;
    }
  }
  if (target) fireAtShip(state, ship, target);
}

function fireAtShip(state: GameState, ship: Ship, target: Ship): void {
  const stats = SHIPS[ship.kind];
  target.hp -= stats.damage;
  ship.cooldown = ticks(stats.reloadSeconds);
  state.events.push({ type: 'shot', from: { x: ship.x, y: ship.y }, to: { x: target.x, y: target.y }, hit: true });
  if (target.hp <= 0) markSunkBy.set(target.id, ship.owner);
}

function captureShip(state: GameState, target: Ship, newOwner: PlayerId): void {
  const from = target.owner;
  target.owner = newOwner;
  target.order = { type: 'idle' };
  target.path = [];
  state.events.push({ type: 'shipCaptured', shipId: target.id, from, to: newOwner });
}

function captureVillage(state: GameState, v: Village, newOwner: PlayerId): void {
  const from = v.owner;
  v.owner = newOwner;
  v.hp = villageMaxHp(v) * VILLAGE.restartHpRatio;
  v.queue = []; // la produzione in corso va persa nel saccheggio
  v.lastDamagedTick = state.tick;
  state.events.push({ type: 'villageCaptured', villageId: v.id, from, to: newOwner });
}

function removeSunkShips(state: GameState): void {
  const survivors: Ship[] = [];
  for (const s of state.ships) {
    if (s.hp > 0) {
      survivors.push(s);
    } else if (s.order.type !== 'found') {
      state.events.push({
        type: 'shipSunk',
        shipId: s.id,
        owner: s.owner,
        by: markSunkBy.get(s.id) ?? NEUTRAL,
        x: s.x,
        y: s.y,
      });
    }
  }
  state.ships = survivors;
  markSunkBy.clear();
}

function checkElimination(state: GameState): void {
  const contenders = state.players.filter((p) => p.id !== NEUTRAL);
  for (const p of contenders) {
    if (!p.alive) continue;
    const hasAny =
      state.villages.some((v) => v.owner === p.id) || state.ships.some((s) => s.owner === p.id);
    if (!hasAny) {
      p.alive = false;
      state.events.push({ type: 'playerEliminated', player: p.id });
    }
  }
  const alive = contenders.filter((p) => p.alive);
  if (contenders.length > 1 && alive.length <= 1) state.winner = alive[0]?.id ?? NEUTRAL;
}

// ---------------------------------------------------------------- utilità per UI e IA

export function isSeaPoint(state: GameState, p: Point): boolean {
  return isSea(state.map, Math.floor(p.x), Math.floor(p.y));
}

export function isLandPoint(state: GameState, p: Point): boolean {
  return isLand(state.map, Math.floor(p.x), Math.floor(p.y));
}

export function nearestSeaPoint(state: GameState, p: Point): Point | null {
  return nearestSea(state.map, p.x, p.y);
}

export function shipKindsOf(ships: readonly Ship[]): Record<ShipKind, number> {
  const out: Record<ShipKind, number> = { sloop: 0, galleon: 0, colony: 0 };
  for (const s of ships) out[s.kind]++;
  return out;
}
