import type { GameController } from '../../game/controller';
import { FACTIONS } from '../../sim/factions';
import { armyStrength } from '../../sim/armies';
import { getCity, getShip, type Army } from '../../sim/state';
import { Stat } from '../common';
import { fmt } from '../hooks';

function orderText(ctl: GameController, a: Army): string {
  const o = a.order;
  switch (o.type) {
    case 'idle': return 'In attesa di ordini';
    case 'move': return 'In marcia';
    case 'city': {
      const city = getCity(ctl.state, o.cityId);
      return city?.owner === a.owner ? `Verso ${city.name} (rinforzi)` : `All’assalto di ${city?.name ?? '—'}`;
    }
    case 'embark': return `Si imbarca sulla ${getShip(ctl.state, o.shipId)?.name ?? '—'}`;
    case 'attackArmy': return 'All’attacco di un reparto nemico';
  }
}

/** Reparti a terra del giocatore. */
export function ArmyPanel({ ctl, armies }: { ctl: GameController; armies: Army[] }) {
  const state = ctl.state;
  const faction = FACTIONS[state.players[ctl.me].faction!];
  const soldiers = armies.reduce((n, a) => n + a.soldiers, 0);
  const strength = armies.reduce((n, a) => n + armyStrength(state, a), 0);
  return (
    <div>
      <h2>{armies.length === 1 ? `Reparto di ${faction.soldiers}` : `${armies.length} reparti a terra`}</h2>
      {armies.map((a) => <div class="sub">{fmt(a.soldiers)} soldati · {orderText(ctl, a)}</div>)}
      <div class="mt">
        <Stat label="Soldati">{fmt(soldiers)}</Stat>
        <Stat label="Forza">{fmt(strength)}</Stat>
      </div>
      <h3>Ordini (clic destro)</h3>
      <div class="sub">
        Su un punto di terra: <b>marcia</b>. Su una città nemica o neutrale: <b>assalto</b> (le mura e i fossati la difendono, le torri sparano a chi si avvicina).
        Su una tua città: <b>rinforza</b> la guarnigione. Su una tua nave vicina alla costa: <b>reimbarco</b>. Su un reparto nemico: <b>attacco</b>.
      </div>
      <div class="row mt">
        <button onClick={() => ctl.stopSelected()} title="X">Ferma</button>
      </div>
    </div>
  );
}

/** Reparto a terra altrui, solo informazioni. */
export function ForeignArmyPanel({ ctl, army }: { ctl: GameController; army: Army }) {
  const owner = ctl.state.players[army.owner];
  return (
    <div>
      <h2>Reparto nemico</h2>
      <div class="sub">{owner.name}{owner.faction ? ` (${FACTIONS[owner.faction].name})` : ''}</div>
      <div class="mt">
        <Stat label="Soldati">{fmt(army.soldiers)}</Stat>
        <Stat label="Forza">{fmt(armyStrength(ctl.state, army))}</Stat>
      </div>
      <div class="sub mt">Seleziona i tuoi reparti a terra e fai clic destro su questo per attaccarlo.</div>
    </div>
  );
}
