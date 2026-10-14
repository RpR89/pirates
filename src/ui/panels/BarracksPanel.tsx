import { useState } from 'preact/hooks';
import type { GameController } from '../../game/controller';
import { FACTIONS } from '../../sim/factions';
import { TICK_RATE, UNITS, type UnitKind } from '../../sim/rules';
import { QUEUE_MAX, recruitCost, recruitProblem } from '../../sim/simulation';
import { recruitable, type Building, type City } from '../../sim/state';
import { Bar, CostLabel, Stat } from '../common';
import { fmt } from '../hooks';

export function BarracksPanel({ ctl, building, city }: { ctl: GameController; building: Building; city: City }) {
  const state = ctl.state;
  const me = state.players[ctl.me];
  const faction = FACTIONS[me.faction!];
  const max = recruitable(city);
  const labels: Record<UnitKind, { name: string; text: string }> = {
    sailors: { name: faction.sailors, text: 'Manovrano le navi: senza abbastanza marinai una nave è lenta e spara piano. Servono anche per varare.' },
    soldiers: { name: faction.soldiers, text: 'Combattono negli arrembaggi e negli sbarchi, e difendono la città.' },
  };

  return (
    <div>
      <h3>Arruolamento</h3>
      <Stat label="Abitanti">{Math.floor(city.population)}</Stat>
      <Stat label="Arruolabili ora">{max}</Stat>
      <div class="sub">Si arruola fino a metà della popolazione: più la città è grande, più uomini puoi prendere. Gli arruolati lasciano la popolazione.</div>
      <div class="grid2 mt">
        <Stat label={faction.sailors}>{fmt(city.garrison.sailors)}</Stat>
        <Stat label="Soldati">{fmt(city.garrison.soldiers)}</Stat>
      </div>

      {(['sailors', 'soldiers'] as const).map((unit) => (
        <RecruitRow ctl={ctl} building={building} unit={unit} max={max} label={labels[unit]} gold={me.gold} />
      ))}

      <h3>Addestramento ({building.queue.length}/{QUEUE_MAX})</h3>
      {building.queue.length === 0 && <div class="sub">Nessun reparto in addestramento.</div>}
      {building.queue.map((q, i) =>
        q.type === 'recruit' ? (
          <div class="card">
            <div class="row spread">
              <span>{q.count} {q.unit === 'sailors' ? faction.sailors : faction.soldiers}</span>
              <span class="sub">{Math.ceil(q.ticksLeft / TICK_RATE)} s</span>
            </div>
            {i === 0 && <Bar value={1 - q.ticksLeft / q.totalTicks} color="gold" />}
          </div>
        ) : null,
      )}
    </div>
  );
}

function RecruitRow({ ctl, building, unit, max, label, gold }: {
  ctl: GameController; building: Building; unit: UnitKind; max: number; label: { name: string; text: string }; gold: number;
}) {
  const [count, setCount] = useState(5);
  const n = Math.max(1, Math.min(count, Math.max(1, max)));
  const problem = recruitProblem(ctl.state, ctl.me, building.id, unit, n);
  return (
    <div class="card">
      <div class="row spread">
        <span class="title">{label.name}</span>
        <span class="sub">{UNITS[unit].gold} oro l’uno</span>
      </div>
      <div class="sub">{label.text}</div>
      <div class="row" style={{ marginTop: 6 }}>
        <button class="small" onClick={() => setCount(Math.max(1, n - 5))}>−5</button>
        <button class="small" onClick={() => setCount(Math.max(1, n - 1))}>−1</button>
        <b style={{ minWidth: 28, textAlign: 'center' }}>{n}</b>
        <button class="small" onClick={() => setCount(n + 1)}>+1</button>
        <button class="small" onClick={() => setCount(n + 5)}>+5</button>
        <button class="small" onClick={() => setCount(max)}>max</button>
        <div class="grow" />
        <CostLabel cost={recruitCost(unit, n)} gold={gold} wood={0} />
      </div>
      <div class="row spread" style={{ marginTop: 4 }}>
        <span class="sub bad">{problem ?? ''}</span>
        <button class="small primary" disabled={!!problem} onClick={() => ctl.issue({ type: 'recruit', buildingId: building.id, unit, count: n })}>
          Arruola
        </button>
      </div>
    </div>
  );
}
