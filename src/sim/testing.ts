import type { Command, PlayerCommand } from './commands';
import { step } from './simulation';
import { createGame, type GameState, type PlayerId } from './state';

export function newGame(seed = 42): GameState {
  return createGame(seed, [
    { name: 'UNO', color: '#b13e53' },
    { name: 'DUE', color: '#ef7d57' },
  ]);
}

export function run(state: GameState, ticks: number, commands: [PlayerId, Command][] = []): void {
  const first: PlayerCommand[] = commands.map(([player, command]) => ({ player, tick: state.tick, command }));
  step(state, first);
  for (let i = 1; i < ticks; i++) step(state, []);
}

/** Primo villaggio e prima nave di un giocatore. */
export function home(state: GameState, player: PlayerId) {
  const village = state.villages.find((v) => v.owner === player)!;
  const ship = state.ships.find((s) => s.owner === player)!;
  return { village, ship };
}
