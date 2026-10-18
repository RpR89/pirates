import type { GameController } from '../../game/controller';
import { BUILDABLE, BUILDINGS, CITY_TIERS, DEFENSES, type BuildingKind } from '../../sim/rules';
import { cityTier, type City } from '../../sim/state';
import { CostLabel } from '../common';

/** Effetto di una difesa in breve, per il menu. */
export function defenseSummary(kind: BuildingKind): string {
  const s = BUILDINGS[kind];
  const parts: string[] = [];
  if (s.damage > 0) parts.push(`cannoni ${s.damage} danni, gittata ${s.range}`);
  if (s.defense > 0) parts.push(`guarnigione +${Math.round(s.defense * 100)}%${s.line ? ' per tratto' : ''}`);
  if (s.militia > 0 && !s.line) parts.push(`forza fissa ${s.militia}`);
  if (s.moat > 0) parts.push(`assalitori −${Math.round(s.moat * 100)}% per tratto`);
  return parts.join(' · ');
}

/** Menu costruzioni: si sceglie l'edificio, poi si clicca sulla mappa dove piazzarlo. */
export function BuildMenu({ ctl, city }: { ctl: GameController; city: City }) {
  const me = ctl.state.players[ctl.me];
  const tier = cityTier(city);
  const placing = ctl.mode.type === 'place' ? ctl.mode.kind : null;

  const card = (kind: BuildingKind) => {
    const s = BUILDINGS[kind];
    const forbidden = !!s.factions && !s.factions.includes(me.faction!);
    if (forbidden) {
      return (
        <div class="card disabled">
          <div class="row spread"><span class="title">{s.name}</span></div>
          <div class="sub">I pirati non costruiscono {kind === 'mura' ? 'mura' : 'bastioni'}: si affidano a terrapieni, fossati, torri e batterie, e soprattutto all’arrembaggio.</div>
        </div>
      );
    }
    const locked = tier < s.tier;
    const affordable = me.gold >= s.cost.gold && me.wood >= s.cost.wood;
    const effect = DEFENSES.includes(kind) ? defenseSummary(kind) : '';
    return (
      <div class={`card ${locked ? 'disabled' : ''}`}>
        <div class="row spread">
          <span class="title">{s.name}</span>
          <CostLabel cost={s.cost} gold={me.gold} wood={me.wood} />
        </div>
        <div class="sub">{s.description}</div>
        {effect && <div class="sub gold">{effect}</div>}
        <div class="row spread mt" style={{ marginTop: 4 }}>
          <span class="sub">
            {s.line ? 'trascina per tracciarlo' : `${s.w}×${s.h} caselle`}{s.coastal ? ' · sulla costa' : ''}
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
  };

  return (
    <div>
      <h3>Costruisci a {city.name}</h3>
      <div class="sub">
        Scegli un edificio e clicca sulla mappa, entro il cerchio della città. Shift+clic per piazzarne altri;
        mura, terrapieni e fossati si tracciano tenendo premuto e trascinando. Tasto destro o Esc annulla.
      </div>
      <h3>Economia</h3>
      {BUILDABLE.filter((k) => !DEFENSES.includes(k)).map(card)}
      <h3>Difese</h3>
      <div class="sub">Bastioni e torri puntano i cannoni sulle navi; la batteria costiera chiude l’ingresso del porto con la gittata più lunga.</div>
      {BUILDABLE.filter((k) => DEFENSES.includes(k)).map(card)}
    </div>
  );
}
