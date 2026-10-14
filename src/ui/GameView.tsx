import type { GameController } from '../game/controller';
import { FACTIONS } from '../sim/factions';
import { BUILDINGS, TICK_RATE } from '../sim/rules';
import { playerBalance } from '../sim/simulation';
import { getShip } from '../sim/state';
import { fmt, rate, useGame } from './hooks';
import { Minimap } from './Minimap';
import { BuildingPanel } from './panels/BuildingPanel';
import { BuildMenu } from './panels/BuildMenu';
import { ForeignShipPanel, ShipsPanel } from './panels/ShipPanel';
import { useEffect, useState } from 'preact/hooks';
import { HeroPanel } from './HeroCard';
import { portraitUrl } from '../render/portrait';
import { heroLevel } from '../sim/hero';
import { heroOf } from '../sim/state';

export function GameView({ ctl, onExit }: { ctl: GameController; onExit: () => void }) {
  useGame(ctl);
  const [buildOpen, setBuildOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  // I pannelli aperti dai pulsanti si chiudono quando si seleziona qualcosa sulla mappa.
  useEffect(() => {
    if (ctl.selection.kind !== 'none') {
      setHeroOpen(false);
      setBuildOpen(false);
    }
  }, [ctl.selection]);
  const state = ctl.state;
  const me = state.players[ctl.me];
  const faction = FACTIONS[me.faction!];
  const balance = playerBalance(state, ctl.me);
  const myCities = state.cities.filter((c) => c.owner === ctl.me);
  const myShips = state.ships.filter((s) => s.owner === ctl.me);
  const population = myCities.reduce((n, c) => n + c.population, 0);
  const men = myCities.reduce((n, c) => n + c.garrison.sailors + c.garrison.soldiers, 0) + myShips.reduce((n, s) => n + s.sailors + s.soldiers, 0);
  const seconds = Math.floor(state.tick / TICK_RATE);
  const now = performance.now();

  const sel = ctl.selection;
  const ships = ctl.selectedShips();
  const building = ctl.selectedBuilding();
  const foreignShip = sel.kind === 'ship' ? getShip(state, sel.id) : undefined;
  const focusCity = ctl.focusCity();

  let panel = null;
  if (ships.length) panel = <ShipsPanel ctl={ctl} ships={ships} />;
  else if (building) panel = <BuildingPanel key={building.id} ctl={ctl} building={building} />;
  else if (foreignShip) panel = <ForeignShipPanel ctl={ctl} ship={foreignShip} />;
  else if (heroOpen) panel = <HeroPanel ctl={ctl} />;
  else if (buildOpen && focusCity) panel = <BuildMenu ctl={ctl} city={focusCity} />;
  const hero = heroOf(state, ctl.me);

  const resource = (label: string, value: number, perSec: number, color: string, warn = false) => (
    <span class="res">
      <span class="icon" style={{ background: color }} />
      <span class="muted">{label}</span>
      <span class={`val ${warn ? 'bad' : ''}`}>{fmt(value)}</span>
      <span class={`rate ${perSec < 0 ? 'bad' : 'muted'}`}>{rate(perSec)}</span>
    </span>
  );

  const mode = ctl.mode;
  return (
    <>
      <div class="panel topbar interactive">
        {hero && (
          <button
            class="small"
            style={{ padding: 2, display: 'flex', alignItems: 'center', gap: 6 }}
            title="Il tuo capitano"
            onClick={() => {
              setBuildOpen(false);
              ctl.select({ kind: 'none' });
              setHeroOpen(true);
              ctl.focusHero(false);
            }}
          >
            <img src={portraitUrl(hero.seed, me.faction!, hero.uniform)} width={36} height={36} style={{ imageRendering: 'pixelated', display: 'block' }} alt="" />
            <span style={{ paddingRight: 6 }}>Lv {heroLevel(hero)}{hero.location.type === 'away' ? ' · disperso' : ''}</span>
          </button>
        )}
        <span class="gold" style={{ fontWeight: 600 }}>{me.name}</span>
        <span class="muted">{faction.name}</span>
        {resource('Oro', me.gold, balance.gold, '#e9b949')}
        {resource('Legno', me.wood, balance.wood, '#9a6a3c')}
        {resource('Cibo', me.food, balance.food, '#8fd16a', me.food <= 0)}
        <span class="res"><span class="muted">Abitanti</span><span class="val">{fmt(population)}</span></span>
        <span class="res"><span class="muted">Uomini</span><span class="val">{fmt(men)}</span></span>
        <span class="res"><span class="muted">Navi</span><span class="val">{myShips.length}</span></span>
        <span class="res"><span class="muted">Città</span><span class="val">{myCities.length}</span></span>
        <div class="grow" />
        <span class={ctl.session.paused ? 'bad' : 'muted'}>
          {ctl.session.paused ? 'PAUSA · ' : ''}{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <button class="small" onClick={() => ctl.togglePause()}>{ctl.session.paused ? 'Riprendi' : 'Pausa'}</button>
        <button class="small" onClick={onExit}>Menu</button>
      </div>

      {mode.type === 'place' && (
        <div class="panel mode-hint">Piazza: <b class="gold">{BUILDINGS[mode.kind].name}</b> — clic sinistro per costruire, destro o Esc per annullare</div>
      )}
      {mode.type === 'land' && (
        <div class="panel mode-hint">Sbarco: clicca su una città nemica o neutrale — destro o Esc per annullare</div>
      )}

      {panel && <div class="panel side interactive">{panel}</div>}

      <div class="messages">
        {ctl.messages.filter((m) => now - m.at < 8000).map((m) => (
          <div class={`panel message ${m.tone}`} style={{ opacity: Math.min(1, (8000 - (now - m.at)) / 1000) }}>{m.text}</div>
        ))}
      </div>

      <div class="bottom-left">
        <Minimap ctl={ctl} />
        <div class="actions interactive">
          <button
            class={buildOpen && !building && !ships.length ? 'active' : ''}
            disabled={!focusCity}
            onClick={() => {
              ctl.select({ kind: 'none' });
              setHeroOpen(false);
              setBuildOpen(true);
            }}
          >
            Costruisci
          </button>
          <button onClick={() => ctl.goHome()}>Città (H)</button>
          <button
            disabled={!myShips.length}
            onClick={() => {
              setBuildOpen(false);
              ctl.select({ kind: 'ships', ids: myShips.map((s) => s.id) });
            }}
          >
            Tutte le navi
          </button>
        </div>
      </div>

      {state.winner !== null && (
        <div class="overlay">
          <div class="panel">
            <h1>{state.winner === ctl.me ? 'Vittoria!' : 'Sconfitta'}</h1>
            <p>{state.winner === ctl.me ? 'I Caraibi sono tuoi, capitano.' : 'La tua flotta riposa in fondo al mare.'}</p>
            <button class="primary" onClick={onExit}>Nuova partita</button>
          </div>
        </div>
      )}
    </>
  );
}
