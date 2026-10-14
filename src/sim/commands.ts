import type { BuildingKind, ShipClass, UnitKind } from './rules';
import type { PlayerId } from './state';

/**
 * Tutto ciò che un giocatore (umano, IA o remoto) può fare passa da qui.
 * I comandi sono dati serializzabili: in multiplayer viaggeranno in rete.
 * La simulazione li valida tutti (proprietario, costi, requisiti).
 */
export type Command =
  | { type: 'move'; shipIds: number[]; x: number; y: number }
  | { type: 'stop'; shipIds: number[] }
  | { type: 'attackShip'; shipIds: number[]; targetId: number; board: boolean }
  | { type: 'attackBuilding'; shipIds: number[]; targetId: number }
  | { type: 'land'; shipIds: number[]; cityId: number }
  | { type: 'found'; shipId: number; x: number; y: number }
  | { type: 'placeBuilding'; cityId: number; kind: BuildingKind; x: number; y: number }
  | { type: 'buildShip'; buildingId: number; cls: ShipClass; name: string }
  | { type: 'recruit'; buildingId: number; unit: UnitKind; count: number }
  /** Positivo: imbarca dalla città alla nave; negativo: sbarca in città. */
  | { type: 'transfer'; shipId: number; cityId: number; sailors: number; soldiers: number }
  | { type: 'renameShip'; shipId: number; name: string };

export interface PlayerCommand {
  player: PlayerId;
  /** Tick di simulazione in cui il comando va applicato. */
  tick: number;
  command: Command;
}
