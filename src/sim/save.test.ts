import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { ticks } from './rules';
import { decodeTiles, deserializeGame, encodeTiles, serializeGame } from './save';
import { home, newGame, run } from './testing';

describe('salvataggi', () => {
  it('la mappa compressa si ricostruisce uguale', () => {
    const state = newGame(7);
    const text = encodeTiles(state.map.tiles);
    expect(text.length).toBeLessThan(state.map.tiles.length / 2);
    expect(decodeTiles(text, state.map.tiles.length)).toEqual(state.map.tiles);
  });

  it('una partita caricata prosegue esattamente come l’originale', () => {
    const state = newGame(42);
    const { ship } = home(state, 1);
    run(state, ticks(30), [[1, { type: 'move', shipIds: [ship.id], x: ship.x + 6, y: ship.y }]]);
    const saved = JSON.parse(JSON.stringify(serializeGame(state)));
    const loaded = deserializeGame(saved);
    expect(hashState(loaded)).toBe(hashState(state));
    expect(loaded.map.region).toEqual(state.map.region);
    expect(loaded.map.mainRegion).toBe(state.map.mainRegion);
    run(state, ticks(60));
    run(loaded, ticks(60));
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('rifiuta i file che non sono salvataggi', () => {
    expect(() => deserializeGame({} as never)).toThrow();
    const saved = serializeGame(newGame(42));
    expect(() => deserializeGame({ ...saved, version: 99 })).toThrow();
    expect(() => deserializeGame({ ...saved, tiles: 'zz' })).toThrow();
  });
});
