import type { Command, PlayerCommand } from './commands';
import type { FactionId } from './factions';
import { step } from './simulation';
import { createGame, type GameState, type PlayerId } from './state';

export function newGame(seed = 42, factions: FactionId[] = ['inglesi', 'pirati']): GameState {
  return createGame(seed, factions.map((faction, i) => ({ name: `G${i + 1}`, faction })));
}

export function run(state: GameState, ticks: number, commands: [PlayerId, Command][] = []): void {
  const first: PlayerCommand[] = commands.map(([player, command]) => ({ player, tick: state.tick, command }));
  step(state, first);
  for (let i = 1; i < ticks; i++) step(state, []);
}

/** Prima città, municipio e prima nave di un giocatore. */
export function home(state: GameState, player: PlayerId) {
  const city = state.cities.find((c) => c.owner === player)!;
  const ship = state.ships.find((s) => s.owner === player)!;
  const building = (kind: string) => state.buildings.find((b) => b.cityId === city.id && b.kind === kind)!;
  return { city, ship, building };
}
