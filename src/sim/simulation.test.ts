import { describe, expect, it } from 'vitest';
import { AIController } from './ai';
import { hashState } from './hash';
import { findCoastalSites } from './map';
import { BUILDINGS, SHIPS, TICK_RATE, VILLAGE, ticks } from './rules';
import { step } from './simulation';
import { NEUTRAL, distance, spawnShip, villageMaxHp, type GameState } from './state';
import { home, newGame, run } from './testing';

describe('partenza', () => {
  it('ogni giocatore ha un villaggio con cantiere e uno sloop, più villaggi neutrali', () => {
    const state = newGame();
    for (const p of [1, 2]) {
      const { village, ship } = home(state, p);
      expect(village.buildings.cantiere).toBe(1);
      expect(ship.kind).toBe('sloop');
    }
    expect(state.villages.filter((v) => v.owner === NEUTRAL).length).toBeGreaterThan(2);
    const [a, b] = state.villages;
    expect(distance(a, b)).toBeGreaterThan(VILLAGE.minDistance * 3);
  });
});

describe('economia e produzione', () => {
  it('i villaggi producono oro e legno nel tempo', () => {
    const state = newGame();
    const before = { ...state.players[1] };
    run(state, ticks(10));
    expect(state.players[1].gold - before.gold).toBeCloseTo(VILLAGE.goldPerSecond * 10, 5);
    expect(state.players[1].wood - before.wood).toBeCloseTo(VILLAGE.woodPerSecond * 10, 5);
  });

  it('costruire una nave costa risorse e la nave appare al molo', () => {
    const state = newGame();
    const { village } = home(state, 1);
    const gold = state.players[1].gold;
    run(state, 1, [[1, { type: 'build', villageId: village.id, item: { type: 'ship', ship: 'sloop' } }]]);
    expect(state.players[1].gold).toBeCloseTo(gold - SHIPS.sloop.cost.gold + VILLAGE.goldPerSecond / TICK_RATE, 5);
    run(state, ticks(SHIPS.sloop.buildSeconds));
    expect(state.ships.filter((s) => s.owner === 1)).toHaveLength(2);
  });

  it('il galeone richiede il cantiere di livello 2', () => {
    const state = newGame();
    state.players[1].gold = state.players[1].wood = 10_000;
    const { village } = home(state, 1);
    run(state, 1, [[1, { type: 'build', villageId: village.id, item: { type: 'ship', ship: 'galleon' } }]]);
    expect(village.queue).toHaveLength(0);
    run(state, ticks(BUILDINGS.cantiere.buildSeconds) + 1, [
      [1, { type: 'build', villageId: village.id, item: { type: 'building', building: 'cantiere' } }],
    ]);
    expect(village.buildings.cantiere).toBe(2);
    run(state, 1, [[1, { type: 'build', villageId: village.id, item: { type: 'ship', ship: 'galleon' } }]]);
    expect(village.queue.map((q) => q.item)).toEqual([{ type: 'ship', ship: 'galleon' }]);
  });

  it('non si può comandare ciò che appartiene a un altro giocatore', () => {
    const state = newGame();
    const enemy = home(state, 2);
    const gold = state.players[2].gold;
    run(state, 1, [
      [1, { type: 'build', villageId: enemy.village.id, item: { type: 'ship', ship: 'sloop' } }],
      [1, { type: 'move', shipIds: [enemy.ship.id], x: 10, y: 10 }],
    ]);
    expect(enemy.village.queue).toHaveLength(0);
    expect(enemy.ship.order.type).toBe('idle');
    expect(state.players[2].gold).toBeGreaterThan(gold);
  });
});

/** Mette due navi nemiche vicine, in mare aperto. */
function duel(state: GameState) {
  const a = spawnShip(state, 1, 'galleon', 5.5, 5.5);
  const b = spawnShip(state, 2, 'sloop', 8.5, 5.5);
  return { a, b };
}

describe('combattimento', () => {
  it('le navi nemiche a portata si sparano e una affonda', () => {
    const state = newGame();
    const { a, b } = duel(state);
    run(state, ticks(30));
    expect(state.ships.includes(b)).toBe(false);
    expect(state.ships.includes(a)).toBe(true);
    expect(a.hp).toBeLessThan(SHIPS.galleon.hp);
  });

  it("con l'abbordaggio la nave nemica viene catturata invece che affondata", () => {
    const state = newGame();
    const { a, b } = duel(state);
    b.order = { type: 'move' }; // non reagisce: niente fuoco automatico per questo test
    b.hp = SHIPS.sloop.hp * 0.5;
    run(state, 1, [[1, { type: 'attackShip', shipIds: [a.id], targetId: b.id, capture: true }]]);
    run(state, ticks(20));
    expect(state.ships.includes(b)).toBe(true);
    expect(b.owner).toBe(1);
  });
});

describe('villaggi', () => {
  it('un villaggio neutrale ridotto a 0 PF viene conquistato', () => {
    const state = newGame();
    const target = state.villages.find((v) => v.owner === NEUTRAL)!;
    const fleet = [0, 1, 2, 3].map(() =>
      spawnShip(state, 1, 'galleon', target.dock.x + 0.5, target.dock.y + 0.5),
    );
    run(state, 1, [[1, { type: 'attackVillage', shipIds: fleet.map((s) => s.id), targetId: target.id }]]);
    let captured = false;
    for (let t = 0; t < ticks(60) && !captured; t++) {
      run(state, 1);
      captured = state.events.some((e) => e.type === 'villageCaptured' && e.villageId === target.id);
    }
    expect(captured).toBe(true);
    expect(target.owner).toBe(1);
    expect(target.hp).toBeCloseTo(villageMaxHp(target) * VILLAGE.restartHpRatio, 5);
  });

  it('la nave colonia fonda un villaggio su una costa libera', () => {
    const state = newGame();
    const { village } = home(state, 1);
    const colony = spawnShip(state, 1, 'colony', village.dock.x + 0.5, village.dock.y + 0.5);
    const site = findCoastalSites(state.map)
      .filter((s) => state.villages.every((v) => distance(v, s) >= VILLAGE.minDistance))
      .sort((p, q) => distance(p, village) - distance(q, village))[0];
    run(state, 1, [[1, { type: 'found', shipId: colony.id, x: site.x, y: site.y }]]);
    run(state, ticks(120));
    expect(state.ships.includes(colony)).toBe(false);
    const founded = state.villages.find((v) => v.x === site.x && v.y === site.y);
    expect(founded?.owner).toBe(1);
  });

  it('non si fonda troppo vicino a un altro villaggio', () => {
    const state = newGame();
    const { village } = home(state, 1);
    const colony = spawnShip(state, 1, 'colony', village.dock.x + 0.5, village.dock.y + 0.5);
    run(state, 1, [[1, { type: 'found', shipId: colony.id, x: village.x, y: village.y }]]);
    expect(colony.order.type).toBe('idle');
  });
});

describe('fine partita', () => {
  it('chi perde tutte le navi e i villaggi è eliminato e l\'altro vince', () => {
    const state = newGame();
    state.ships = state.ships.filter((s) => s.owner !== 2);
    for (const v of state.villages) if (v.owner === 2) v.owner = NEUTRAL;
    run(state, 1);
    expect(state.players[2].alive).toBe(false);
    expect(state.winner).toBe(1);
  });
});

describe('determinismo (base del multiplayer lockstep)', () => {
  it('due simulazioni con stesso seed e stessi comandi restano identiche', () => {
    const play = () => {
      const state = newGame(99);
      const ais = [new AIController(1), new AIController(2)];
      const hashes: string[] = [];
      for (let t = 0; t < ticks(240); t++) {
        const cmds = ais.flatMap((ai) =>
          ai.think(state).map((command) => ({ player: ai.player, tick: state.tick, command })),
        );
        step(state, cmds);
        if (t % 200 === 0) hashes.push(hashState(state));
      }
      return { hashes, state };
    };
    const a = play();
    const b = play();
    expect(a.hashes).toEqual(b.hashes);
    // L'IA nel frattempo ha davvero giocato.
    expect(a.state.ships.length + a.state.villages.filter((v) => v.owner !== NEUTRAL).length).toBeGreaterThan(6);
  });
});
