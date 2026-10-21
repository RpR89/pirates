import { deserializeGame, type SavedGame } from '../sim/save';
import type { GameState } from '../sim/state';
import type { GameSetup } from './controller';

/** File di salvataggio: la partita più quel che serve a riprenderla (impostazioni, visuale). */
export interface SaveFile {
  format: 'pirates-save';
  label: string;
  savedAt: string;
  setup: GameSetup;
  /** Minuti di gioco, per l'elenco. */
  minutes: number;
  /** Centro della visuale, in caselle. */
  view?: { x: number; y: number };
  game: SavedGame;
}

export interface SaveSlot {
  id: string;
  label: string;
  savedAt: string;
  setup: GameSetup;
  minutes: number;
}

const PREFIX = 'pirates.save.';
export const AUTO_SLOT = 'auto';
export const MAX_SLOTS = 12;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Salvataggi presenti nel browser, dal più recente. */
export function listSaves(): SaveSlot[] {
  const ls = storage();
  if (!ls) return [];
  const out: SaveSlot[] = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const f = JSON.parse(ls.getItem(key) ?? '') as SaveFile;
      if (f.format === 'pirates-save') out.push({ id: key.slice(PREFIX.length), label: f.label, savedAt: f.savedAt, setup: f.setup, minutes: f.minutes });
    } catch {
      // salvataggio illeggibile: lo ignoriamo
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function readSave(id: string): SaveFile | null {
  try {
    const text = storage()?.getItem(PREFIX + id);
    return text ? parseSaveFile(text) : null;
  } catch {
    return null;
  }
}

/** Scrive un salvataggio; restituisce il motivo dell'errore, o null se è andato bene. */
export function writeSave(id: string, file: SaveFile): string | null {
  const ls = storage();
  if (!ls) return 'Il browser non permette di salvare (navigazione privata?)';
  try {
    ls.setItem(PREFIX + id, JSON.stringify(file));
    return null;
  } catch {
    return 'Spazio esaurito: elimina qualche salvataggio o esportalo su file';
  }
}

export function deleteSave(id: string): void {
  try {
    storage()?.removeItem(PREFIX + id);
  } catch {
    // niente da fare
  }
}

/** Nuovo identificativo per uno slot manuale. */
export function newSlotId(): string {
  return `s${Date.now().toString(36)}`;
}

export function parseSaveFile(text: string): SaveFile {
  let f: SaveFile;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un salvataggio di Pirates');
  }
  if (f?.format !== 'pirates-save' || !f.game || !f.setup) throw new Error('Il file non è un salvataggio di Pirates');
  return f;
}

/** Stato di gioco di un salvataggio (lancia un errore se è danneggiato). */
export function loadGameState(file: SaveFile): GameState {
  return deserializeGame(file.game);
}

/** Scarica il salvataggio come file .json. */
export function downloadSave(file: SaveFile): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = file.label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'partita';
  a.href = url;
  a.download = `pirates-${safe}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Chiede un file all'utente e lo legge come salvataggio. */
export function pickSaveFile(): Promise<SaveFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      f.text().then((t) => resolve(parseSaveFile(t)), reject);
    };
    input.click();
  });
}
