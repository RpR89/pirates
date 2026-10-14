import { describe, expect, it } from 'vitest';
import { Tile, findCoastalSites, generateMap, isSea, isWaterTile } from './map';
import { findPath, hasSeaLineOfSight } from './pathfinding';
import { newGame } from './testing';

describe('generateMap', () => {
  it('è deterministica a parità di seed', () => {
    expect(generateMap(7).tiles).toEqual(generateMap(7).tiles);
    expect(generateMap(7).tiles).not.toEqual(generateMap(8).tiles);
  });

  it('ha il bordo di mare aperto e una quota ragionevole di terra', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const map = generateMap(seed);
      for (let x = 0; x < map.width; x++) {
        expect(isSea(map, x, 0)).toBe(true);
        expect(isSea(map, x, map.height - 1)).toBe(true);
      }
      const land = map.tiles.filter((t) => !isWaterTile(t)).length / map.tiles.length;
      expect(land).toBeGreaterThan(0.08);
      expect(land).toBeLessThan(0.5);
      expect(findCoastalSites(map).length).toBeGreaterThan(50);
    }
  });
});

describe('findPath', () => {
  it('collega i porti dei due giocatori restando in mare', () => {
    const state = newGame();
    const [a, b] = state.cities;
    const from = { x: a.dock.x + 0.5, y: a.dock.y + 0.5 };
    const path = findPath(state.map, from, { x: b.dock.x + 0.5, y: b.dock.y + 0.5 });
    expect(path).not.toBeNull();
    let prev = from;
    for (const p of path!) {
      expect(isSea(state.map, Math.floor(p.x), Math.floor(p.y))).toBe(true);
      expect(hasSeaLineOfSight(state.map, prev, p) || prev === from).toBe(true);
      prev = p;
    }
    expect(path![path!.length - 1]).toEqual({ x: b.dock.x + 0.5, y: b.dock.y + 0.5 });
  });

  it('se la destinazione è terra, si ferma sulla casella di mare più vicina', () => {
    const state = newGame();
    const c = state.cities[0];
    expect(state.map.tiles[c.cy * state.map.width + c.cx]).not.toBe(Tile.Deep);
    const path = findPath(state.map, { x: 5.5, y: 5.5 }, { x: c.cx + 0.5, y: c.cy + 0.5 });
    const end = path![path!.length - 1];
    expect(isSea(state.map, Math.floor(end.x), Math.floor(end.y))).toBe(true);
    expect(Math.hypot(end.x - c.cx, end.y - c.cy)).toBeLessThan(5);
  });
});
