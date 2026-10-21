import type { GameState } from './state';

/** Impronta dello stato dinamico: in multiplayer serve a scoprire le desincronizzazioni. */
export function hashState(state: GameState): string {
  const json = JSON.stringify([state.tick, state.players, state.cities, state.buildings, state.ships, state.armies, state.nextId]);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
