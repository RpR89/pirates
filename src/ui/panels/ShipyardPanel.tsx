import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../../game/controller';
import { MAX_NAME_LENGTH } from '../../sim/factions';
import { CITY_TIERS, SHIPS, SHIP_CLASSES, TICK_RATE, type ShipClass } from '../../sim/rules';
import { QUEUE_MAX, shipCost, shipProblem } from '../../sim/simulation';
import { modifiers, suggestShipName, type Building, type City } from '../../sim/state';
import { Bar, CostLabel } from '../common';

export function ShipyardPanel({ ctl, building, city }: { ctl: GameController; building: Building; city: City }) {
  const state = ctl.state;
  const me = state.players[ctl.me];
  const [offset, setOffset] = useState(0);
  const suggested = suggestShipName(state, ctl.me, offset);
  const [name, setName] = useState(suggested);
  const [edited, setEdited] = useState(false);

  // Segue il suggerimento finché il giocatore non scrive un nome suo.
  useEffect(() => {
    if (!edited) setName(suggested);
  }, [suggested, edited]);

  const launch = (cls: ShipClass) => {
    ctl.issue({ type: 'buildShip', buildingId: building.id, cls, name: name.trim() || suggested });
    setEdited(false);
    setOffset(0);
  };

  const speed = modifiers(state, ctl.me).shipSpeed;

  return (
    <div>
      <h3>Varo di una nave</h3>
      <label class="sub">Nome della nave</label>
      <div class="row">
        <input
          class="grow"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onInput={(e) => {
            setName((e.target as HTMLInputElement).value);
            setEdited(true);
          }}
        />
        <button class="small" title="Un altro nome" onClick={() => { setEdited(false); setOffset(offset + 1); }}>Altro</button>
      </div>
      <div class="sub">Marinai disponibili in città: {Math.floor(city.garrison.sailors)}</div>

      {SHIP_CLASSES.map((cls) => {
        const s = SHIPS[cls];
        const problem = shipProblem(state, ctl.me, building.id, cls);
        const cost = shipCost(state, ctl.me, cls);
        return (
          <div class={`card ${problem && problem.startsWith('Serve una') ? 'disabled' : ''}`}>
            <div class="row spread">
              <span class="title">{s.name}</span>
              <CostLabel cost={cost} gold={me.gold} wood={me.wood} />
            </div>
            <div class="sub">{s.description}</div>
            <div class="sub">
              Scafo {s.hp} · {s.damage ? `cannoni ${s.damage} (gittata ${s.range})` : 'disarmata'} · velocità {(s.speed * speed).toFixed(1)}
              <br />
              Equipaggio {s.crew} marinai · capienza {s.capacity} uomini{s.colonists ? ` · ${s.colonists} coloni` : ''} · {s.buildSeconds} s
              {s.tier > 1 ? ` · serve ${CITY_TIERS[s.tier - 1].name.toLowerCase()}` : ''}
            </div>
            <div class="row spread" style={{ marginTop: 4 }}>
              <span class="sub bad">{problem ?? ''}</span>
              <button class="small primary" disabled={!!problem} onClick={() => launch(cls)}>Vara</button>
            </div>
          </div>
        );
      })}

      <h3>In cantiere ({building.queue.length}/{QUEUE_MAX})</h3>
      {building.queue.length === 0 && <div class="sub">Nessuna nave in costruzione.</div>}
      {building.queue.map((q, i) =>
        q.type === 'ship' ? (
          <div class="card">
            <div class="row spread">
              <span><b>{q.name}</b> <span class="sub">{SHIPS[q.cls].name}</span></span>
              <span class="sub">{Math.ceil(q.ticksLeft / TICK_RATE)} s</span>
            </div>
            {i === 0 && <Bar value={1 - q.ticksLeft / q.totalTicks} color="gold" />}
          </div>
        ) : null,
      )}
    </div>
  );
}
