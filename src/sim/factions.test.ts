import { describe, expect, it } from 'vitest';
import { WALLS, ticks } from './rules';
import { boardingStrength, cityProduction, garrisonStrength } from './simulation';
import { NEUTRAL, cityBuildings, heroOf, spawnShip, type GameState } from './state';
import { home, newGame, run } from './testing';

/** Toglie i capitani dal gioco per confrontare solo le fazioni. */
function noHeroes(state: GameState) {
  for (const h of state.heroes) h.location = { type: 'away', returnTick: 1e9 };
}

describe('mura', () => {
  it('inglesi, francesi e spagnoli possono costruirle, i pirati no', () => {
    for (const [faction, allowed] of [['inglesi', true], ['francesi', true], ['spagnoli', true], ['pirati', false]] as const) {
      const state = newGame(42, [faction, faction === 'pirati' ? 'inglesi' : 'pirati']);
      const { city } = home(state, 1);
      const before = state.buildings.length;
      let placed = false;
      for (let dy = -6; dy <= 6 && !placed; dy++) {
        for (let dx = -6; dx <= 6 && !placed; dx++) {
          run(state, 1, [[1, { type: 'placeBuilding', cityId: city.id, kind: 'mura', x: city.cx + dx, y: city.cy + dy }]]);
          placed = state.buildings.length > before;
        }
      }
      expect(placed).toBe(allowed);
    }
  });

  it('rendono la guarnigione più forte', () => {
    const state = newGame(42, ['spagnoli', 'pirati']);
    noHeroes(state);
    const { city } = home(state, 1);
    const before = garrisonStrength(state, city);
    state.players[1].gold = state.players[1].wood = 10_000;
    for (let dx = -6; dx <= 6; dx++) {
      for (const dy of [-5, 5]) run(state, 1, [[1, { type: 'placeBuilding', cityId: city.id, kind: 'mura', x: city.cx + dx, y: city.cy + dy }]]);
    }
    run(state, ticks(10));
    const walls = cityBuildings(state, city.id).filter((b) => b.kind === 'mura').length;
    expect(walls).toBeGreaterThan(3);
    expect(garrisonStrength(state, city)).toBeCloseTo(before * (1 + Math.min(WALLS.maxDefense, walls * WALLS.defensePerSegment)), 5);
  });
});

describe('carattere delle fazioni', () => {
  it('i pirati sono i più forti negli arrembaggi', () => {
    const state = newGame(42, ['pirati', 'inglesi']);
    noHeroes(state);
    const crew = { sailors: 10, soldiers: 10 };
    const pirate = spawnShip(state, 1, 'brigantino', 5.5, 5.5, 'P', crew);
    const brit = spawnShip(state, 2, 'brigantino', 5.5, 8.5, 'B', crew);
    expect(boardingStrength(state, pirate)).toBeGreaterThan(boardingStrength(state, brit) * 2);
  });

  it('la Royal Navy vince il duello tra navi uguali', () => {
    const state = newGame(42, ['inglesi', 'francesi']);
    noHeroes(state);
    const brit = spawnShip(state, 1, 'fregata', 5.5, 5.5, 'B', { sailors: 30 });
    const french = spawnShip(state, 2, 'fregata', 9.5, 5.5, 'F', { sailors: 30 });
    run(state, ticks(120));
    expect(state.ships.includes(french)).toBe(false);
    expect(state.ships.includes(brit)).toBe(true);
  });

  it('i soldati francesi perdono meno uomini negli assalti', () => {
    const losses = (faction: 'francesi' | 'inglesi') => {
      const state = newGame(42, [faction, 'pirati']);
      noHeroes(state);
      const target = state.cities.find((c) => c.owner === NEUTRAL)!;
      target.garrison.soldiers = 60;
      const ship = spawnShip(state, 1, 'galeone', target.dock.x + 0.5, target.dock.y + 0.5, 'S', { sailors: 40, soldiers: 60 });
      run(state, 1, [[1, { type: 'land', shipIds: [ship.id], cityId: target.id }]]);
      run(state, 10); // un secondo di battaglia
      return 60 - (target.siege?.soldiers ?? 0);
    };
    expect(losses('francesi')).toBeLessThan(losses('inglesi') * 0.7);
  });

  it('gli spagnoli producono molto più oro', () => {
    const gold = (faction: 'spagnoli' | 'inglesi') => {
      const state = newGame(42, [faction, 'pirati']);
      return cityProduction(state, home(state, 1).city).gold;
    };
    expect(gold('spagnoli')).toBeCloseTo(gold('inglesi') * 1.6, 5);
  });

  it('il capitano conta: un buon spadaccino ribalta un arrembaggio', () => {
    const state = newGame(42, ['inglesi', 'pirati']);
    const hero = heroOf(state, 1)!;
    hero.skills.spada = 10;
    const ship = spawnShip(state, 1, 'brigantino', 5.5, 5.5, 'H', { sailors: 10, soldiers: 10 });
    const without = boardingStrength(state, ship);
    hero.location = { type: 'ship', shipId: ship.id };
    expect(boardingStrength(state, ship)).toBeCloseTo(without * 1.7, 5);
  });
});
