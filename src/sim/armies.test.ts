import { describe, expect, it } from 'vitest';
import { isWalkable, type Point } from './map';
import { findLandPath } from './pathfinding';
import { ARMY, SHIPS, ticks } from './rules';
import { repairRate } from './simulation';
import { NEUTRAL, distance, shipMaxHp, type Army, type City, type GameState } from './state';
import { home, newGame, run } from './testing';

/** Casella a piedi a distanza r..r+2 dal centro della città, raggiungibile via terra. */
function landNear(state: GameState, city: City, r: number): Point {
  const c = { x: city.cx + 0.5, y: city.cy + 0.5 };
  for (let rr = r; rr <= r + 3; rr++) {
    for (let a = 0; a < 64; a++) {
      const x = Math.floor(c.x + Math.cos((a / 64) * Math.PI * 2) * rr);
      const y = Math.floor(c.y + Math.sin((a / 64) * Math.PI * 2) * rr);
      if (isWalkable(state.map, x, y) && findLandPath(state.map, { x: x + 0.5, y: y + 0.5 }, c)) return { x: x + 0.5, y: y + 0.5 };
    }
  }
  throw new Error('nessuna casella adatta');
}

function addArmy(state: GameState, owner: number, at: Point, soldiers: number): Army {
  const a: Army = { id: state.nextId++, owner, x: at.x, y: at.y, soldiers, path: [], order: { type: 'idle' }, repath: 0 };
  state.armies.push(a);
  return a;
}

describe('riparazioni', () => {
  it('una nave ferma nel porto di casa si ripara spendendo legno, in mare aperto no', () => {
    const state = newGame(42);
    const { ship, city } = home(state, 1);
    const max = shipMaxHp(state, ship);
    ship.hp = max / 2;
    ship.x = city.dock.x + 0.5;
    ship.y = city.dock.y + 0.5;
    expect(repairRate(state, ship)).toBeGreaterThan(0);
    const wood = state.players[1].wood;
    run(state, ticks(5));
    expect(ship.hp).toBeGreaterThan(max / 2 + 5);
    expect(state.players[1].wood).toBeLessThan(wood + 10); // legno speso (al netto della produzione)
    ship.x += 25;
    ship.hp = max / 2;
    expect(repairRate(state, ship)).toBe(0);
  });
});

describe('reparti a terra', () => {
  it('le navi sbarcano i soldati su una costa qualsiasi', () => {
    const state = newGame(42);
    const { ship, city } = home(state, 1);
    ship.soldiers = 20;
    const at = landNear(state, city, 6);
    run(state, 1, [[1, { type: 'disembark', shipIds: [ship.id], x: at.x, y: at.y }]]);
    for (let i = 0; i < ticks(90) && !state.armies.length; i++) run(state, 1);
    expect(state.armies).toHaveLength(1);
    expect(state.armies[0].soldiers).toBe(20);
    expect(ship.soldiers).toBe(0);
  });

  it('un reparto marcia fino a una città neutrale e la assalta', () => {
    const state = newGame(42);
    // Una città neutrale con terra percorribile attorno.
    const pick = state.cities
      .filter((c) => c.owner === NEUTRAL)
      .map((c) => {
        try {
          return { city: c, at: landNear(state, c, 11) };
        } catch {
          return null;
        }
      })
      .find((x) => x !== null)!;
    const target = pick.city;
    const army = addArmy(state, 1, pick.at, 120);
    run(state, 1, [[1, { type: 'armyCity', armyIds: [army.id], cityId: target.id }]]);
    for (let i = 0; i < ticks(60) && state.armies.length; i++) run(state, 1);
    expect(state.armies).toHaveLength(0);
    expect(target.siege?.owner === 1 || target.owner === 1).toBe(true);
  });

  it('entra in una città propria come guarnigione e si reimbarca sulle navi', () => {
    const state = newGame(42);
    const { city, ship } = home(state, 1);
    const before = city.garrison.soldiers;
    const army = addArmy(state, 1, landNear(state, city, 14), 15);
    run(state, 1, [[1, { type: 'armyCity', armyIds: [army.id], cityId: city.id }]]);
    for (let i = 0; i < ticks(60) && state.armies.length; i++) run(state, 1);
    expect(city.garrison.soldiers).toBeCloseTo(before + 15, 5);

    expect(state.armies).toHaveLength(0);

    const room = SHIPS[ship.cls].capacity - ship.sailors - ship.soldiers;
    const onShip = ship.soldiers;
    const squad = addArmy(state, 1, { x: ship.x, y: ship.y }, room - 1);
    run(state, 1, [[1, { type: 'armyEmbark', armyIds: [squad.id], shipId: ship.id }]]);
    run(state, 2);
    expect(ship.soldiers).toBe(onShip + room - 1);
    expect(state.armies).toHaveLength(0);
  });

  it('due reparti nemici a contatto combattono: vince il più numeroso', () => {
    const state = newGame(42);
    const { city } = home(state, 1);
    const at = landNear(state, city, 16);
    const big = addArmy(state, 1, at, 60);
    const small = addArmy(state, 2, { x: at.x + 0.5, y: at.y }, 20);
    expect(distance(big, small)).toBeLessThan(ARMY.meleeRange);
    for (let i = 0; i < ticks(60) && state.armies.includes(small); i++) run(state, 1);
    expect(state.armies.includes(small)).toBe(false);
    expect(big.soldiers).toBeGreaterThan(30);
  });
});
