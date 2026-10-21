import { mapFromTiles } from './map';
import { SHIP_CLASSES, BUILDINGS } from './rules';
import type { GameState } from './state';

/**
 * Salvataggi: lo stato è fatto di dati semplici, quindi basta una copia JSON.
 * La mappa viene compressa (sequenze di caselle uguali) e le regioni d'acqua
 * ricalcolate al caricamento. Nessun accesso al DOM: lo spazio di archiviazione
 * lo sceglie chi chiama (vedi src/game/saves.ts).
 */
export const SAVE_VERSION = 1;

export interface SavedGame {
  version: number;
  width: number;
  height: number;
  /** Caselle della mappa codificate a sequenze: "tipo×quante" separati da virgole, in base 36. */
  tiles: string;
  state: Omit<GameState, 'map' | 'events'>;
}

export function encodeTiles(tiles: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < tiles.length; ) {
    let j = i;
    while (j < tiles.length && tiles[j] === tiles[i]) j++;
    out.push(`${tiles[i].toString(36)}${(j - i).toString(36)}`);
    i = j;
  }
  return out.join(',');
}

export function decodeTiles(text: string, length: number): Uint8Array {
  const tiles = new Uint8Array(length);
  let at = 0;
  for (const run of text.split(',')) {
    const value = parseInt(run[0], 36);
    const count = parseInt(run.slice(1), 36);
    if (!Number.isFinite(value) || !Number.isFinite(count) || count <= 0 || at + count > length) throw new Error('Mappa danneggiata');
    tiles.fill(value, at, at + count);
    at += count;
  }
  if (at !== length) throw new Error('Mappa incompleta');
  return tiles;
}

export function serializeGame(state: GameState): SavedGame {
  const { map, events: _events, ...rest } = state;
  return {
    version: SAVE_VERSION,
    width: map.width,
    height: map.height,
    tiles: encodeTiles(map.tiles),
    state: JSON.parse(JSON.stringify(rest)),
  };
}

/** Ricostruisce una partita salvata; lancia un errore (in italiano) se il salvataggio non è valido. */
export function deserializeGame(data: SavedGame): GameState {
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') throw new Error('Non è un salvataggio di Pirates');
  if (data.version > SAVE_VERSION) throw new Error('Salvataggio di una versione più recente del gioco');
  const { width, height } = data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Mappa non valida');
  const map = mapFromTiles(width, height, decodeTiles(data.tiles, width * height));
  const s = JSON.parse(JSON.stringify(data.state)) as Omit<GameState, 'map' | 'events'>;
  if (!Array.isArray(s.players) || !Array.isArray(s.cities) || !Array.isArray(s.buildings) || !Array.isArray(s.ships)) {
    throw new Error('Salvataggio danneggiato');
  }
  // Campi aggiunti nelle versioni successive: valori predefiniti per i salvataggi vecchi.
  for (const c of s.cities) c.market ??= { wood: 0, food: 0 };
  for (const ship of s.ships) {
    if (!SHIP_CLASSES.includes(ship.cls)) throw new Error('Salvataggio danneggiato');
    ship.cargo ??= { wood: 0, food: 0 };
    ship.route ??= null;
    ship.earned ??= 0;
  }
  if (s.buildings.some((b) => !BUILDINGS[b.kind])) throw new Error('Salvataggio danneggiato');
  s.heroes ??= [];
  return { ...s, map, events: [] };
}
