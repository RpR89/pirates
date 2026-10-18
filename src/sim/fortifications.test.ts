import { describe, expect, it } from 'vitest';
import type { FactionId } from './factions';
import { BUILDINGS, ticks, type BuildingKind } from './rules';
import { buildProblem, fortifications, garrisonStrength } from './simulation';
import { addBuilding, findPlacement, spawnShip, type GameState } from './state';
import { home, newGame, run } from './testing';

/** Città di partenza abbastanza grande per tutti gli edifici, con risorse illimitate. */
function rich(faction: FactionId) {
  const state = newGame(42, [faction, faction === 'pirati' ? 'inglesi' : 'pirati']);
  for (const h of state.heroes) h.location = { type: 'away', returnTick: 1e9 };
  const { city } = home(state, 1);
  city.population = 90;
  state.players[1].gold = state.players[1].wood = 100_000;
  return { state, city };
}

function canBuildSomewhere(state: GameState, cityId: number, kind: BuildingKind): boolean {
  const p = findPlacement(state, cityId, kind);
  return !!p && !buildProblem(state, 1, cityId, kind, p.x, p.y);
}

describe('difese', () => {
  it('i pirati hanno terrapieni, fossati e batterie, ma non mura e bastioni', () => {
    const pir = rich('pirati');
    for (const k of ['terrapieno', 'fossato', 'batteria'] as const) expect(canBuildSomewhere(pir.state, pir.city.id, k)).toBe(true);
    for (const k of ['mura', 'bastione'] as const) expect(canBuildSomewhere(pir.state, pir.city.id, k)).toBe(false);
    const eng = rich('inglesi');
    for (const k of ['mura', 'terrapieno', 'fossato', 'bastione', 'batteria'] as const) expect(canBuildSomewhere(eng.state, eng.city.id, k)).toBe(true);
  });

  it('la batteria va sulla costa', () => {
    const { state, city } = rich('spagnoli');
    expect(buildProblem(state, 1, city.id, 'batteria', city.cx - 1, city.cy + 3)).toBeTruthy();
  });

  it('un bastione rafforza la guarnigione più di una torre', () => {
    const a = rich('francesi');
    const b = rich('francesi');
    const base = garrisonStrength(a.state, a.city);
    const put = (s: GameState, cityId: number, kind: BuildingKind) => {
      const p = findPlacement(s, cityId, kind)!;
      addBuilding(s, cityId, kind, p.x, p.y, true);
    };
    put(a.state, a.city.id, 'torre');
    put(b.state, b.city.id, 'bastione');
    expect(garrisonStrength(a.state, a.city)).toBeCloseTo(base * (1 + BUILDINGS.torre.defense), 5);
    expect(garrisonStrength(b.state, b.city)).toBeGreaterThan(garrisonStrength(a.state, a.city));
    expect(fortifications(b.state, b.city).militia).toBe(BUILDINGS.bastione.militia);
  });

  it('i fossati indeboliscono gli assalitori', () => {
    const losses = (moats: number) => {
      const { state, city } = rich('inglesi');
      const target = state.cities.find((c) => c.owner === 0)!;
      target.garrison.soldiers = 40;
      let placed = 0;
      for (let dy = -9; dy <= 9 && placed < moats; dy++) {
        for (let dx = -9; dx <= 9 && placed < moats; dx++) {
          const x = target.cx + dx;
          const y = target.cy + dy;
          if (!state.buildings.some((b) => b.x === x && b.y === y) && state.map.tiles[y * state.map.width + x] >= 2 && state.map.tiles[y * state.map.width + x] <= 4) {
            addBuilding(state, target.id, 'fossato', x, y, true);
            placed++;
          }
        }
      }
      void city;
      const ship = spawnShip(state, 1, 'galeone', target.dock.x + 0.5, target.dock.y + 0.5, 'S', { sailors: 40, soldiers: 60 });
      run(state, 1, [[1, { type: 'land', shipIds: [ship.id], cityId: target.id }]]);
      run(state, 10);
      return 40 - target.garrison.soldiers; // perdite inflitte ai difensori
    };
    expect(losses(20)).toBeLessThan(losses(0) * 0.65);
  });

  it('la batteria costiera colpisce navi lontane che la torre non raggiunge', () => {
    for (const [kind, expectHit] of [['batteria', true], ['torre', false]] as const) {
      const { state, city } = rich('spagnoli');
      const p = findPlacement(state, city.id, kind)!;
      const b = addBuilding(state, city.id, kind, p.x, p.y, true);
      const s = BUILDINGS[kind];
      // Una nave nemica a 8,5 caselle: dentro la gittata della batteria (9), fuori da quella della torre (6).
      const cx = b.x + s.w / 2;
      const cy = b.y + s.h / 2;
      let target: { x: number; y: number } | null = null;
      for (let a = 0; a < 64 && !target; a++) {
        const x = cx + Math.cos((a / 64) * Math.PI * 2) * 8.5;
        const y = cy + Math.sin((a / 64) * Math.PI * 2) * 8.5;
        const t = state.map.tiles[Math.floor(y) * state.map.width + Math.floor(x)];
        if (t <= 1 && state.map.region[Math.floor(y) * state.map.width + Math.floor(x)] === state.map.mainRegion) target = { x, y };
      }
      const enemy = spawnShip(state, 2, 'galeone', target!.x, target!.y, 'Bersaglio', { sailors: 40 });
      enemy.order = { type: 'move' };
      const hp = enemy.hp;
      run(state, ticks(5));
      expect(enemy.hp < hp).toBe(expectHit);
    }
  });
});
