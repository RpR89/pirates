import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../game/controller';
import {
  AUTO_SLOT,
  MAX_SLOTS,
  deleteSave,
  downloadSave,
  listSaves,
  newSlotId,
  pickSaveFile,
  readSave,
  writeSave,
  type SaveFile,
  type SaveSlot,
} from '../game/saves';
import { FACTIONS } from '../sim/factions';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Elenco dei salvataggi nel browser, con carica ed elimina. */
export function SaveList({ onLoad, onError }: { onLoad: (file: SaveFile) => void; onError: (text: string) => void }) {
  const [slots, setSlots] = useState<SaveSlot[]>(listSaves);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!slots.length) return <div class="sub">Nessuna partita salvata in questo browser.</div>;
  return (
    <div>
      {slots.map((s) => (
        <div class="card row spread">
          <div>
            <div class="title">{s.id === AUTO_SLOT ? '⟳ ' : ''}{s.label}</div>
            <div class="sub">
              {FACTIONS[s.setup.faction]?.name ?? ''} · {s.minutes} min di gioco · {when(s.savedAt)}
            </div>
          </div>
          <div class="row" style={{ gap: 4 }}>
            <button
              class="small"
              onClick={() => {
                const file = readSave(s.id);
                if (file) onLoad(file);
                else onError('Salvataggio illeggibile');
              }}
            >
              Carica
            </button>
            <button
              class={`small ${confirm === s.id ? 'active' : ''}`}
              title="Elimina"
              onClick={() => {
                if (confirm !== s.id) return setConfirm(s.id);
                deleteSave(s.id);
                setConfirm(null);
                setSlots(listSaves());
              }}
            >
              {confirm === s.id ? 'Sicuro?' : '✕'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pulsante che importa un salvataggio da file. */
export function ImportButton({ onLoad, onError }: { onLoad: (file: SaveFile) => void; onError: (text: string) => void }) {
  return (
    <button onClick={() => pickSaveFile().then(onLoad, (e: Error) => onError(e.message))}>Importa da file…</button>
  );
}

/** Salvataggio automatico della partita in corso. */
export function autosave(ctl: GameController): string | null {
  if (ctl.state.winner !== null) return null;
  return writeSave(AUTO_SLOT, ctl.saveFile(`Automatico · ${ctl.state.players[ctl.me].name}`));
}

/** Menu di gioco: salva, carica, esporta, esci. La partita resta in pausa finché è aperto. */
export function GameMenu({ ctl, onClose, onExit, onLoad }: { ctl: GameController; onClose: () => void; onExit: () => void; onLoad: (file: SaveFile) => void }) {
  const state = ctl.state;
  const home = state.cities.find((c) => c.owner === ctl.me);
  const minutes = Math.floor(state.tick / 600);
  const [label, setLabel] = useState(`${state.players[ctl.me].name}${home ? ` · ${home.name}` : ''} · ${minutes} min`);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const was = ctl.session.paused;
    ctl.session.paused = true;
    ctl.emit();
    return () => {
      ctl.session.paused = was;
      ctl.emit();
    };
  }, []);

  const manual = listSaves().filter((s) => s.id !== AUTO_SLOT).length;
  const save = () => {
    const error = writeSave(newSlotId(), ctl.saveFile(label.trim() || 'Partita'));
    setNote(error ? { text: error, bad: true } : { text: 'Partita salvata.', bad: false });
    setVersion(version + 1);
  };
  const error = (text: string) => setNote({ text, bad: true });

  return (
    <div class="overlay interactive">
      <div class="panel" style={{ width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
        <div class="row spread">
          <h2>Menu</h2>
          <button class="small" onClick={onClose}>Torna al gioco</button>
        </div>

        <h3>Salva partita</h3>
        <div class="row">
          <input class="grow" value={label} maxLength={60} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button class="primary" disabled={manual >= MAX_SLOTS} onClick={save}>Salva</button>
        </div>
        {manual >= MAX_SLOTS && <div class="sub bad">Hai già {MAX_SLOTS} salvataggi: eliminane uno per salvare ancora.</div>}
        <div class="sub">I salvataggi restano in questo browser. Ogni 2 minuti la partita si salva anche da sola (⟳).</div>
        <div class="row mt">
          <button onClick={() => downloadSave(ctl.saveFile(label.trim() || 'Partita'))}>Esporta su file</button>
          <ImportButton onLoad={onLoad} onError={error} />
        </div>
        {note && <div class={`sub mt ${note.bad ? 'bad' : 'gold'}`}>{note.text}</div>}

        <h3>Carica partita</h3>
        <SaveList key={version} onLoad={onLoad} onError={error} />

        <div class="row mt" style={{ marginTop: 16 }}>
          <div class="grow" />
          <button onClick={onExit}>Esci al menu principale</button>
        </div>
      </div>
    </div>
  );
}
