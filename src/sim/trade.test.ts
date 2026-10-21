import { describe, expect, it } from 'vitest';
import { SHIPS, TRADE, ticks } from './rules';
import { routeProblem, saleValue, tradePrice } from './simulation';
import { NEUTRAL, distance, spawnShip, type GameState, type TradeStop } from './state';
import { home, newGame, run } from './testing';

const stop = (cityId: number, load = 0, sell = 0): TradeStop => ({ cityId, load: { wood: load, food: load }, sell: { wood: sell, food: sell } });

function setup(): { state: GameState; fluytId: number; homeId: number; marketId: number } {
  const state = newGame(42, ['inglesi', 'pirati']);
  const { city } = home(state, 1);
  const dock = { x: city.dock.x + 0.5, y: city.dock.y + 0.5 };
  const fluyt = spawnShip(state, 1, 'fluyt', dock.x, dock.y, 'Mercurio', { sailors: SHIPS.fluyt.crew });
  const market = state.cities
    .filter((c) => c.owner === NEUTRAL)
    .sort((a, b) => distance(a.dock, city.dock) - distance(b.dock, city.dock))[0];
  state.players[1].wood = 500;
  state.players[1].food = 500;
  return { state, fluytId: fluyt.id, homeId: city.id, marketId: market.id };
}

describe('rotte commerciali', () => {
  it('solo le navi da carico seguono una rotta, e solo verso città proprie o neutrali', () => {
    const { state, fluytId, homeId, marketId } = setup();
    const sloop = home(state, 1).ship;
    expect(routeProblem(state, 1, sloop.id, [stop(homeId)])).toBeTruthy();
    expect(routeProblem(state, 1, fluytId, [])).toBeTruthy();
    expect(routeProblem(state, 1, fluytId, [stop(homeId, 50), stop(marketId, 0, 50)])).toBeNull();
    const enemy = state.cities.find((c) => c.owner === 2)!;
    expect(routeProblem(state, 1, fluytId, [stop(enemy.id, 0, 50)])).toBeTruthy();
    expect(routeProblem(state, 2, fluytId, [stop(homeId)])).toBeTruthy();
  });

  it('la nave carica in patria, vende nella città neutrale e porta a casa oro', () => {
    const { state, fluytId, homeId, marketId } = setup();
    const p = state.players[1];
    const wood = p.wood;
    run(state, 1, [[1, { type: 'setRoute', shipId: fluytId, stops: [stop(homeId, 60), stop(marketId, 0, 60)] }]]);
    const fluyt = state.ships.find((s) => s.id === fluytId)!;
    expect(fluyt.order.type).toBe('trade');
    run(state, ticks(TRADE.stopSeconds) + 2);
    expect(fluyt.cargo).toEqual({ wood: 60, food: 60 });
    expect(p.wood).toBeLessThan(wood - 40); // 60 caricati, meno la produzione nel frattempo
    const market = state.cities.find((c) => c.id === marketId)!;
    for (let i = 0; i < ticks(240) && fluyt.earned === 0; i++) run(state, 1);
    expect(fluyt.earned).toBeGreaterThan(30);
    expect(fluyt.cargo).toEqual({ wood: 0, food: 0 });
    expect(market.market.wood).toBeGreaterThan(0);
  });

  it('più si vende, meno si guadagna; poi i prezzi risalgono', () => {
    const { state, marketId } = setup();
    const market = state.cities.find((c) => c.id === marketId)!;
    const full = tradePrice(market, 'food');
    expect(saleValue(market, 'food', 100)).toBeLessThan(full * 100);
    market.market.food = 150;
    const low = tradePrice(market, 'food');
    expect(low).toBeLessThan(full);
    run(state, ticks(120));
    expect(tradePrice(market, 'food')).toBeGreaterThan(low);
  });
});
