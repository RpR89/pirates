import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../../game/controller';
import { FACTIONS, MAX_NAME_LENGTH } from '../../sim/factions';
import { REPAIR, SHIPS } from '../../sim/rules';
import { boardingStrength, dockedCity, repairRate } from '../../sim/simulation';
import { crewEfficiency, getBuilding, getCity, getShip, shipMaxHp, shipMen, type Ship } from '../../sim/state';
import { Bar, Stat } from '../common';
import { HeroShipActions } from '../HeroCard';
import { TradePanel } from './TradePanel';
import { fmt } from '../hooks';

function orderText(ctl: GameController, s: Ship): string {
  const o = s.order;
  const state = ctl.state;
  switch (o.type) {
    case 'idle': return 'In attesa di ordini';
    case 'move': return 'In navigazione';
    case 'attackShip': return `${o.board ? 'Arrembaggio' : 'Attacco'}: ${getShip(state, o.targetId)?.name ?? '—'}`;
    case 'attackBuilding': {
      const b = getBuilding(state, o.targetId);
      return `Bombarda ${b ? getCity(state, b.cityId)?.name ?? '' : ''}`;
    }
    case 'land': return `Sbarco a ${getCity(state, o.cityId)?.name ?? '—'}`;
    case 'found': return 'Verso il sito della nuova città';
    case 'disembark': return 'Verso la costa per lo sbarco';
    case 'trade': {
      const r = s.route;
      const stop = r?.stops[r.next];
      const name = stop ? getCity(state, stop.cityId)?.name ?? '—' : '—';
      return r && r.wait > 0 ? `In porto a ${name}` : `Rotta commerciale: verso ${name}`;
    }
  }
}

export function ShipsPanel({ ctl, ships }: { ctl: GameController; ships: Ship[] }) {
  const soldiers = ships.reduce((n, s) => n + s.soldiers, 0);
  return (
    <div>
      {ships.length === 1 ? (
        <SingleShip ctl={ctl} ship={ships[0]} />
      ) : (
        <div>
          <h2>Flotta di {ships.length} navi</h2>
          <div class="sub">Clic su una nave per i suoi dettagli.</div>
          {ships.map((s) => (
            <div class="card interactive" style={{ cursor: 'pointer' }} onClick={() => ctl.select({ kind: 'ships', ids: [s.id] })}>
              <div class="row spread">
                <b>{s.name}</b>
                <span class="sub">{SHIPS[s.cls].name}</span>
              </div>
              <Bar value={s.hp / shipMaxHp(ctl.state, s)} />
              <div class="sub">{fmt(s.sailors)} marinai · {fmt(s.soldiers)} soldati · {orderText(ctl, s)}</div>
            </div>
          ))}
        </div>
      )}

      <h3>Ordini</h3>
      <div class="sub">Clic destro: muovi, attacca una nave, bombarda un edificio{ships.some((s) => s.colonists) ? ', o fonda una città su una costa libera' : ''}. Con <b>Sbarca truppe</b> scegli una costa qualsiasi: i soldati scendono a terra e li guidi come le navi.</div>
      <div class="row wrap mt">
        <button class={ctl.boarding ? 'active' : ''} onClick={() => ctl.toggleBoarding()} title="B">
          Arrembaggio: {ctl.boarding ? 'sì' : 'no'}
        </button>
        <button disabled={soldiers < 1} class={ctl.mode.type === 'land' ? 'active' : ''} onClick={() => ctl.setMode({ type: 'land' })} title="L">
          Sbarca truppe ({fmt(soldiers)})
        </button>
        <button onClick={() => ctl.stopSelected()} title="X">Ferma</button>
      </div>
      <div class="sub mt">
        Con l’arrembaggio attivo le navi abbordano invece di cannoneggiare: vince chi ha più uomini (i soldati contano più dei marinai),
        e uno scafo danneggiato si difende peggio.
      </div>
    </div>
  );
}

function SingleShip({ ctl, ship }: { ctl: GameController; ship: Ship }) {
  const state = ctl.state;
  const s = SHIPS[ship.cls];
  const [name, setName] = useState(ship.name);
  useEffect(() => setName(ship.name), [ship.id, ship.name]);
  const max = shipMaxHp(state, ship);
  const docked = dockedCity(state, ship);
  const faction = FACTIONS[state.players[ctl.me].faction!];

  return (
    <div>
      <div class="row">
        <input
          class="grow"
          style={{ fontSize: 18, fontWeight: 600, color: 'var(--gold)' }}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && ctl.issue({ type: 'renameShip', shipId: ship.id, name })}
        />
        <button class="small" disabled={!name.trim() || name === ship.name} onClick={() => ctl.issue({ type: 'renameShip', shipId: ship.id, name })}>
          Rinomina
        </button>
      </div>
      <div class="sub">{s.name} · {orderText(ctl, ship)}</div>

      <div class="mt">
        <Stat label="Scafo">{fmt(ship.hp)}/{max}</Stat>
        <Bar value={ship.hp / max} />
      </div>
      {repairRate(state, ship) > 0 ? (
        <div class="sub gold">
          In riparazione al molo: +{fmt(repairRate(state, ship))} scafo/s, {(REPAIR.woodPerHp * repairRate(state, ship)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} legno/s
          {state.players[ctl.me].wood < 1 ? ' — manca il legno!' : ''}
        </div>
      ) : (
        ship.hp < max && <div class="sub">Ferma la nave nel porto di una tua città per ripararla (più veloce al cantiere navale).</div>
      )}
      <div class="grid2 mt">
        <Stat label={faction.sailors}>{fmt(ship.sailors)}/{s.crew}</Stat>
        <Stat label="Soldati">{fmt(ship.soldiers)}</Stat>
        <Stat label="A bordo">{fmt(shipMen(ship))}/{s.capacity}</Stat>
        <Stat label="Efficienza">{Math.round(crewEfficiency(ship) * 100)}%</Stat>
        {s.damage > 0 && <Stat label="Cannoni">{s.damage} · {s.range}</Stat>}
        <Stat label="Arrembaggio">{fmt(boardingStrength(state, ship))}</Stat>
      </div>
      {ship.colonists > 0 && <div class="card mt gold">{ship.colonists} coloni a bordo: clic destro su una costa libera per fondare una città.</div>}
      {ship.sailors < s.crew && <div class="sub bad">Pochi marinai: la nave è lenta e ricarica piano. Imbarcane altri in porto.</div>}

      {s.cargo > 0 && <TradePanel ctl={ctl} ship={ship} />}
      <HeroShipActions ctl={ctl} ship={ship} />
      {docked ? <Transfer ctl={ctl} ship={ship} cityId={docked.id} /> : <div class="sub mt">Avvicinati al porto di una tua città per imbarcare o sbarcare uomini.</div>}
    </div>
  );
}

function Transfer({ ctl, ship, cityId }: { ctl: GameController; ship: Ship; cityId: number }) {
  const city = getCity(ctl.state, cityId)!;
  const room = SHIPS[ship.cls].capacity - shipMen(ship);
  const move = (sailors: number, soldiers: number) => ctl.issue({ type: 'transfer', shipId: ship.id, cityId, sailors, soldiers });
  const row = (label: string, unit: 'sailors' | 'soldiers', onShip: number, inCity: number) => {
    const delta = (n: number) => (unit === 'sailors' ? move(n, 0) : move(0, n));
    return (
      <div class="card">
        <div class="row spread">
          <span class="title">{label}</span>
          <span class="sub">nave {fmt(onShip)} · città {fmt(inCity)}</span>
        </div>
        <div class="row" style={{ marginTop: 4 }}>
          <span class="sub">Sbarca</span>
          <button class="small" disabled={onShip < 1} onClick={() => delta(-onShip)}>tutti</button>
          <button class="small" disabled={onShip < 1} onClick={() => delta(-5)}>5</button>
          <div class="grow" />
          <span class="sub">Imbarca</span>
          <button class="small" disabled={inCity < 1 || room < 1} onClick={() => delta(5)}>5</button>
          <button class="small" disabled={inCity < 1 || room < 1} onClick={() => delta(Math.floor(inCity))}>max</button>
        </div>
      </div>
    );
  };
  return (
    <div>
      <h3>In porto a {city.name}</h3>
      <div class="sub">Posto libero a bordo: {room}</div>
      {row('Marinai', 'sailors', ship.sailors, city.garrison.sailors)}
      {row('Soldati', 'soldiers', ship.soldiers, city.garrison.soldiers)}
    </div>
  );
}

export function ForeignShipPanel({ ctl, ship }: { ctl: GameController; ship: Ship }) {
  const state = ctl.state;
  const owner = state.players[ship.owner];
  const s = SHIPS[ship.cls];
  const max = shipMaxHp(state, ship);
  return (
    <div>
      <h2>{ship.name}</h2>
      <div class="sub">{s.name} di {owner.name}{owner.faction ? ` (${FACTIONS[owner.faction].name})` : ''}</div>
      <div class="mt">
        <Stat label="Scafo">{fmt(ship.hp)}/{max}</Stat>
        <Bar value={ship.hp / max} />
      </div>
      <Stat label="Marinai">{fmt(ship.sailors)}</Stat>
      <Stat label="Soldati">{fmt(ship.soldiers)}</Stat>
      <Stat label="Forza d’arrembaggio">{fmt(boardingStrength(state, ship) * (0.5 + 0.5 * ship.hp / max))}</Stat>
      <div class="sub mt">
        Seleziona le tue navi e fai clic destro su questa per attaccarla. Con l’arrembaggio (<kbd>B</kbd>) la catturi, se i tuoi uomini sono più forti.
      </div>
    </div>
  );
}
