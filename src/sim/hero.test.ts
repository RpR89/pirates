import { describe, expect, it } from 'vitest';
import { HERO, HERO_SKILLS, generateHero, heroLevel } from './hero';
import { ticks } from './rules';
import { boardingStrength, garrisonStrength } from './simulation';
import { getCity, heroOf, spawnShip } from './state';
import { home, newGame, run } from './testing';

describe('capitano', () => {
  it('è generato in modo deterministico, con abilità coerenti con la fazione', () => {
    const a = generateHero(123, 'pirati', 'Anne');
    expect(generateHero(123, 'pirati', 'Anne')).toEqual(a);
    expect(generateHero(124, 'pirati', 'Anne')).not.toEqual(a);
    const total = HERO_SKILLS.reduce((n, s) => n + a.skills[s], 0);
    expect(total).toBe(HERO_SKILLS.length * HERO.basePoints + HERO.extraPoints);
    // Su molti capitani, i pirati eccellono con la spada e gli inglesi con l'artiglieria.
    const avg = (f: 'pirati' | 'inglesi', s: 'spada' | 'artiglieria') =>
      Array.from({ length: 200 }, (_, i) => generateHero(i, f, 'X').skills[s]).reduce((n, v) => n + v, 0) / 200;
    expect(avg('pirati', 'spada')).toBeGreaterThan(avg('pirati', 'artiglieria'));
    expect(avg('inglesi', 'artiglieria')).toBeGreaterThan(avg('inglesi', 'spada'));
  });

  it('ogni giocatore parte con il suo capitano nella capitale', () => {
    const state = newGame();
    for (const p of [1, 2]) {
      const hero = heroOf(state, p)!;
      expect(hero.location).toEqual({ type: 'city', cityId: home(state, p).city.id });
    }
  });

  it('imbarcato potenzia la nave, in città potenzia la difesa', () => {
    const state = newGame();
    const { city, ship } = home(state, 1);
    const hero = heroOf(state, 1)!;
    hero.skills.spada = 10;
    hero.skills.comando = 10;
    const cityBefore = garrisonStrength(state, city);
    const shipBefore = boardingStrength(state, ship);
    run(state, 1, [[1, { type: 'heroBoard', shipId: ship.id }]]);
    expect(hero.location).toEqual({ type: 'ship', shipId: ship.id });
    expect(boardingStrength(state, ship)).toBeGreaterThan(shipBefore * 1.5);
    expect(garrisonStrength(state, city)).toBeLessThan(cityBefore);
    run(state, 1, [[1, { type: 'heroLand' }]]);
    expect(hero.location).toEqual({ type: 'city', cityId: city.id });
    expect(garrisonStrength(state, city)).toBeCloseTo(cityBefore, 5);
  });

  it('non sale su una nave lontana dalla sua città', () => {
    const state = newGame();
    const far = spawnShip(state, 1, 'sloop', 5.5, 5.5);
    run(state, 1, [[1, { type: 'heroBoard', shipId: far.id }]]);
    expect(heroOf(state, 1)!.location.type).toBe('city');
  });

  it('se la nave affonda naufraga e poi torna in città', () => {
    const state = newGame();
    const { ship, city } = home(state, 1);
    const hero = heroOf(state, 1)!;
    run(state, 1, [[1, { type: 'heroBoard', shipId: ship.id }]]);
    ship.hp = 0;
    run(state, 1);
    expect(hero.location.type).toBe('away');
    expect(state.events.some((e) => e.type === 'heroLost' && e.owner === 1)).toBe(true);
    run(state, ticks(HERO.returnSeconds) + 1);
    expect(hero.location).toEqual({ type: 'city', cityId: city.id });
  });

  it('guadagna esperienza affondando navi', () => {
    const state = newGame();
    const hero = heroOf(state, 1)!;
    const ship = spawnShip(state, 1, 'fregata', 5.5, 5.5, 'Ammiraglia', { sailors: 30 });
    hero.location = { type: 'ship', shipId: ship.id };
    for (let i = 0; i < 3; i++) spawnShip(state, 2, 'sloop', 8.5, 5.5 + i, `Preda ${i}`, { sailors: 2 }).order = { type: 'move' };
    run(state, ticks(90));
    expect(hero.xp).toBeGreaterThanOrEqual(3);
    expect(heroLevel(hero)).toBeGreaterThanOrEqual(2);
    expect(getCity(state, home(state, 1).city.id)).toBeDefined();
  });
});
