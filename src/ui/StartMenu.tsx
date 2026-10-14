import { useState } from 'preact/hooks';
import type { GameSetup } from '../game/controller';
import { FACTIONS, FACTION_IDS, MAX_NAME_LENGTH, type FactionId } from '../sim/factions';
import { generateHero } from '../sim/hero';
import { Flag } from './common';
import { HeroSheet } from './HeroCard';

const randomSeed = () => Math.floor(Math.random() * 1e9) + 1;

export function StartMenu({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [faction, setFaction] = useState<FactionId>('pirati');
  const [captain, setCaptain] = useState('');
  const [rivals, setRivals] = useState(2);
  const [seed, setSeed] = useState('');
  const [heroSeed, setHeroSeed] = useState(randomSeed);
  const hero = generateHero(heroSeed, faction, captain.trim() || 'Capitano');

  const start = () => {
    const parsed = Number(seed);
    onStart({
      faction,
      captain: captain.trim() || 'Capitano',
      rivals,
      seed: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : randomSeed(),
      hero,
    });
  };

  return (
    <div class="menu-backdrop">
      <div class="menu">
        <h1>PIRATES</h1>
        <div class="tagline">Costruisci città, arma flotte e conquista i mari dei Caraibi.</div>

        <div class="panel">
          <h2>Scegli la tua bandiera</h2>
          <div class="factions mt">
            {FACTION_IDS.map((id) => {
              const f = FACTIONS[id];
              return (
                <button type="button" class={`panel faction ${faction === id ? 'selected' : ''}`} onClick={() => setFaction(id)}>
                  <div class="row">
                    <Flag flag={f.colors.flag} detail={f.colors.flagDetail} pirate={id === 'pirati'} />
                    <span class="name">{f.name}</span>
                  </div>
                  <span>{f.description}</span>
                  <span class="gold" style={{ fontSize: 13 }}>{f.bonus}</span>
                  <span class="muted" style={{ fontSize: 13 }}>Soldati: {f.soldiers}</span>
                </button>
              );
            })}
          </div>

          <h2 style={{ marginTop: 16 }}>Il tuo capitano</h2>
          <div class="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 320, flex: 1 }}>
              <HeroSheet hero={hero} faction={faction} />
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label class="row">
                <span>Nome</span>
                <input class="grow" value={captain} maxLength={MAX_NAME_LENGTH} placeholder="Capitano" onInput={(e) => setCaptain((e.target as HTMLInputElement).value)} />
              </label>
              <div class="row mt">
                <button onClick={() => setHeroSeed(randomSeed())}>Genera un altro capitano</button>
              </div>
              <div class="sub mt">
                Imbarcato, il capitano potenzia la sua nave (navigazione, artiglieria, spada);
                in città rafforza la difesa (comando). Cresce di livello in battaglia.
              </div>
            </div>
          </div>

          <div class="row wrap mt" style={{ gap: 16, marginTop: 16 }}>
            <label class="row">
              <span>Avversari</span>
              <select value={rivals} onChange={(e) => setRivals(Number((e.target as HTMLSelectElement).value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <label class="row">
              <span>Mappa n.</span>
              <input style={{ width: 120 }} value={seed} placeholder="casuale" onInput={(e) => setSeed((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
            </label>
            <div class="grow" />
            <button class="primary" style={{ fontSize: 20, padding: '6px 24px' }} onClick={start}>
              Salpa!
            </button>
          </div>
        </div>

        <div class="panel mt sub" style={{ marginTop: 12, lineHeight: 1.5 }}>
          <b class="gold">Come si gioca.</b> Clic sinistro seleziona navi ed edifici (trascina per più navi), clic destro dà ordini.
          Costruisci gli edifici dove vuoi nel territorio della città: case per crescere, fattorie e pescherie per il cibo,
          caserma per arruolare marinai e soldati (più la città è grande, più uomini puoi arruolare), cantiere per varare navi con il loro nome.
          Imbarca soldati, abborda le navi nemiche o sbarca per conquistare le città. <kbd>WASD</kbd> scorre, rotella zoom,
          <kbd>B</kbd> arrembaggio, <kbd>L</kbd> sbarco, <kbd>H</kbd> città, <kbd>P</kbd> pausa.
        </div>
      </div>
    </div>
  );
}
