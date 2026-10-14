import type { GameController } from '../../game/controller';
import { BUILDABLE, BUILDINGS, CITY_TIERS } from '../../sim/rules';
import { cityTier, type City } from '../../sim/state';
import { CostLabel } from '../common';

/** Menu costruzioni: si sceglie l'edificio, poi si clicca sulla mappa dove piazzarlo. */
export function BuildMenu({ ctl, city }: { ctl: GameController; city: City }) {
  const me = ctl.state.players[ctl.me];
  const tier = cityTier(city);
  const placing = ctl.mode.type === 'place' ? ctl.mode.kind : null;
  return (
    <div>
      <h3>Costruisci a {city.name}</h3>
      <div class="sub">Scegli un edificio e clicca sulla mappa, entro il cerchio della città. Shift+clic per piazzarne altri; tasto destro o Esc annulla.</div>
      {BUILDABLE.map((kind) => {
        const s = BUILDINGS[kind];
        const locked = tier < s.tier;
        const affordable = me.gold >= s.cost.gold && me.wood >= s.cost.wood;
        return (
          <div class={`card ${locked ? 'disabled' : ''}`}>
            <div class="row spread">
              <span class="title">{s.name}</span>
              <CostLabel cost={s.cost} gold={me.gold} wood={me.wood} />
            </div>
            <div class="sub">{s.description}</div>
            <div class="row spread mt" style={{ marginTop: 4 }}>
              <span class="sub">
                {s.w}×{s.h} caselle{s.coastal ? ' · sulla costa' : ''}
                {locked ? ` · serve ${CITY_TIERS[s.tier - 1].name.toLowerCase()} (${CITY_TIERS[s.tier - 1].population} ab.)` : ''}
              </span>
              <button
                class={`small ${placing === kind ? 'active' : ''}`}
                disabled={locked || !affordable}
                onClick={() => ctl.setMode({ type: 'place', kind, cityId: city.id })}
              >
                {placing === kind ? 'Piazzando…' : 'Piazza'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
