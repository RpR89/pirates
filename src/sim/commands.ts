import type { PlayerId, ProductionItem } from './state';

/**
 * Tutto ciò che un giocatore (umano, IA o remoto) può fare passa da qui.
 * I comandi sono dati serializzabili: in multiplayer viaggeranno in rete.
 */
export type Command =
  | { type: 'move'; shipIds: number[]; x: number; y: number }
  | { type: 'attackShip'; shipIds: number[]; targetId: number; capture: boolean }
  | { type: 'attackVillage'; shipIds: number[]; targetId: number }
  | { type: 'found'; shipId: number; x: number; y: number }
  | { type: 'build'; villageId: number; item: ProductionItem }
  | { type: 'stop'; shipIds: number[] };

export interface PlayerCommand {
  player: PlayerId;
  /** Tick di simulazione in cui il comando va applicato. */
  tick: number;
  command: Command;
}
