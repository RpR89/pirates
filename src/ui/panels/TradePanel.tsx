import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../../game/controller';
import { GOODS, SHIPS, TRADE, type Good } from '../../sim/rules';
import { routeProblem, tradePrice } from '../../sim/simulation';
import { NEUTRAL, distance, getCity, type City, type Ship, type TradeStop } from '../../sim/state';
import { Bar, Stat } from '../common';
import { fmt } from '../hooks';

const GOOD_NAME: Record<Good, string> = { wood: 'legno', food: 'cibo' };

export function price(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prezzi che una città neutrale paga ora per le merci. */
export function Market({ city }: { city: City }) {
  return (
    <div>
      <h3>Mercato</h3>
      {GOODS.map((g) => (
        <Stat label={`Compra ${GOOD_NAME[g]}`}>{price(tradePrice(city, g))} oro</Stat>
      ))}
      <div class="sub">
        Manda una nave da carico (Fluyt) con una rotta commerciale: il prezzo scende man mano che vendi e risale mentre la città consuma la merce.
      </div>
    </div>
  );
}

function sameStops(a: TradeStop[], b: TradeStop[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Editor della rotta commerciale di una nave da carico. */
export function TradePanel({ ctl, ship }: { ctl: GameController; ship: Ship }) {
  const state = ctl.state;
  const cap = SHIPS[ship.cls].cargo;
  const [stops, setStops] = useState<TradeStop[]>(() => ship.route?.stops.map((s) => structuredClone(s)) ?? []);
  useEffect(() => setStops(ship.route?.stops.map((s) => structuredClone(s)) ?? []), [ship.id]);
  const [pick, setPick] = useState<number | null>(null);

  const partners = state.cities
    .filter((c) => c.owner === ctl.me || c.owner === NEUTRAL)
    .sort((a, b) => (a.owner === b.owner ? distance(ship, a.dock) - distance(ship, b.dock) : a.owner === ctl.me ? -1 : 1));
  const chosen = pick ?? partners[0]?.id ?? null;
  const active = ship.order.type === 'trade' && !!ship.route;
  const changed = !ship.route || !sameStops(stops, ship.route.stops);
  const problem = routeProblem(state, ctl.me, ship.id, stops);

  const update = (i: number, f: (s: TradeStop) => void) => {
    const next = stops.map((s) => structuredClone(s));
    f(next[i]);
    setStops(next);
  };
  const move = (i: number, d: number) => {
    const next = [...stops];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setStops(next);
  };
  const add = () => {
    const city = getCity(state, chosen ?? -1);
    if (!city || stops.length >= TRADE.maxStops) return;
    const own = city.owner === ctl.me;
    const half = Math.floor(cap / 2);
    setStops([...stops, { cityId: city.id, load: { wood: own ? half : 0, food: own ? half : 0 }, sell: { wood: own ? 0 : cap, food: own ? 0 : cap } }]);
  };
  const amount = (i: number, side: 'load' | 'sell', g: Good, value: number) => (
    <label class="row" style={{ gap: 4 }}>
      <span class="sub">{GOOD_NAME[g]}</span>
      <input
        type="number"
        min={0}
        max={cap}
        step={5}
        value={value}
        style={{ width: 64 }}
        onInput={(e) => {
          const n = Math.max(0, Math.min(cap, Math.floor(Number((e.target as HTMLInputElement).value) || 0)));
          update(i, (s) => (s[side][g] = n));
        }}
      />
    </label>
  );

  return (
    <div>
      <h3>Rotta commerciale</h3>
      <Stat label="Stiva">{fmt(ship.cargo.wood)} legno · {fmt(ship.cargo.food)} cibo / {cap}</Stat>
      <Bar value={(ship.cargo.wood + ship.cargo.food) / cap} color="gold" />
      <Stat label="Guadagno totale">{fmt(ship.earned)} oro</Stat>
      <div class="sub">
        La nave percorre le tappe in ciclo: nelle tue città <b>carica</b> legno e cibo dalle tue scorte, in quelle neutrali li <b>vende</b> per oro.
        Le quantità valgono a ogni passaggio.
      </div>

      {stops.map((s, i) => {
        const city = getCity(state, s.cityId);
        if (!city) return null;
        const own = city.owner === ctl.me;
        const current = active && ship.route?.next === i && !changed;
        return (
          <div class="card" style={current ? { borderColor: 'var(--gold)' } : undefined}>
            <div class="row spread">
              <span class="title">{i + 1}. {city.name}</span>
              <span class="row" style={{ gap: 2 }}>
                <button class="small" disabled={i === 0} onClick={() => move(i, -1)} title="Sposta su">↑</button>
                <button class="small" disabled={i === stops.length - 1} onClick={() => move(i, 1)} title="Sposta giù">↓</button>
                <button class="small" onClick={() => setStops(stops.filter((_, j) => j !== i))} title="Togli">✕</button>
              </span>
            </div>
            <div class="sub">
              {own ? 'Tua città' : city.owner === NEUTRAL ? `Neutrale · paga ${GOODS.map((g) => `${GOOD_NAME[g]} ${price(tradePrice(city, g))}`).join(', ')} oro` : 'Non commercia più con te'}
              {current ? (ship.route!.wait > 0 ? ' · in porto' : ' · prossima tappa') : ''}
            </div>
            <div class="row wrap" style={{ marginTop: 4 }}>
              <span class="sub">{own ? 'Carica' : 'Vendi'}</span>
              {GOODS.map((g) => amount(i, own ? 'load' : 'sell', g, own ? s.load[g] : s.sell[g]))}
            </div>
          </div>
        );
      })}

      <div class="row mt">
        <select class="grow" value={chosen ?? undefined} onChange={(e) => setPick(Number((e.target as HTMLSelectElement).value))}>
          {partners.map((c) => (
            <option value={c.id}>
              {c.name} — {c.owner === ctl.me ? 'tua' : 'neutrale'} · {Math.round(distance(ship, c.dock))} caselle
            </option>
          ))}
        </select>
        <button class="small" disabled={chosen === null || stops.length >= TRADE.maxStops} onClick={add}>Aggiungi tappa</button>
      </div>
      <div class="row mt">
        <button disabled={!!problem || (active && !changed)} title={problem ?? ''} onClick={() => ctl.issue({ type: 'setRoute', shipId: ship.id, stops })}>
          {active ? (changed ? 'Aggiorna rotta' : 'Rotta attiva') : ship.route && !changed ? 'Riprendi rotta' : 'Avvia rotta'}
        </button>
        {active && <button onClick={() => ctl.issue({ type: 'stop', shipIds: [ship.id] })}>Ferma</button>}
      </div>
      {problem && stops.length > 0 && <div class="sub bad">{problem}</div>}
    </div>
  );
}
