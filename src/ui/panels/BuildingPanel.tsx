import { useState } from 'preact/hooks';
import type { GameController } from '../../game/controller';
import { FACTIONS } from '../../sim/factions';
import { BUILDINGS, CITY, CITY_TIERS, DEFENSES, FOOD, TICK_RATE, ticks } from '../../sim/rules';
import { cityProduction, fortifications, garrisonStrength, militiaStrength, playerBalance } from '../../sim/simulation';
import { heroCityBonus } from '../../sim/hero';
import {
  NEUTRAL,
  cityBuildings,
  cityTier,
  getCity,
  heroInCity,
  housing,
  recruitable,
  tierName,
  type Building,
  type City,
} from '../../sim/state';
import { Bar, Stat } from '../common';
import { fmt, rate } from '../hooks';
import { BarracksPanel } from './BarracksPanel';
import { BuildMenu, defenseSummary } from './BuildMenu';
import { ShipyardPanel } from './ShipyardPanel';
import { Market } from './TradePanel';

export function BuildingPanel({ ctl, building }: { ctl: GameController; building: Building }) {
  const [showBuild, setShowBuild] = useState(false);
  const state = ctl.state;
  const city = getCity(state, building.cityId);
  if (!city) return null;
  const s = BUILDINGS[building.kind];
  const mine = city.owner === ctl.me;

  if (!mine) return <ForeignCity ctl={ctl} city={city} building={building} />;

  const hall = cityBuildings(state, city.id).find((b) => b.kind === 'municipio');
  const building_done = building.buildLeft <= 0;

  return (
    <div>
      <div class="row spread">
        <h2>{s.name}</h2>
        {building.kind !== 'municipio' && hall && (
          <button class="small" onClick={() => ctl.select({ kind: 'building', id: hall.id })}>{city.name}</button>
        )}
      </div>
      <div class="sub">{s.description}</div>

      {!building_done ? (
        <div class="mt">
          <Stat label="In costruzione">{Math.ceil(building.buildLeft / TICK_RATE)} s</Stat>
          <Bar value={1 - building.buildLeft / ticks(s.buildSeconds)} color="gold" />
        </div>
      ) : (
        <div class="mt">
          <Stat label="Integrità">{fmt(building.hp)}/{s.hp}</Stat>
          <Bar value={building.hp / s.hp} />
        </div>
      )}

      {building.kind === 'municipio' && <CityOverview ctl={ctl} city={city} />}
      {building_done && building.kind === 'cantiere' && <ShipyardPanel ctl={ctl} building={building} city={city} />}
      {building_done && building.kind === 'caserma' && <BarracksPanel ctl={ctl} building={building} city={city} />}
      {building_done && (s.food > 0 || s.wood > 0 || (s.gold > 0 && building.kind !== 'municipio') || s.housing > 0) && building.kind !== 'municipio' && (
        <div class="mt">
          {s.food > 0 && <Stat label="Produce cibo">{rate(s.food)}</Stat>}
          {s.wood > 0 && <Stat label="Produce legno">{rate(s.wood)}{building.kind === 'segheria' ? ' (×1,6 vicino ai boschi)' : ''}</Stat>}
          {s.gold > 0 && <Stat label="Produce oro">{rate(s.gold)}</Stat>}
          {s.housing > 0 && <Stat label="Alloggi">{s.housing} abitanti</Stat>}
        </div>
      )}
      {DEFENSES.includes(building.kind) && <div class="sub gold mt">{defenseSummary(building.kind)}</div>}

      <div class="mt">
        <button class={showBuild ? 'active' : ''} onClick={() => setShowBuild(!showBuild)}>
          {showBuild ? 'Chiudi costruzioni' : 'Costruisci edifici…'}
        </button>
      </div>
      {showBuild && <BuildMenu ctl={ctl} city={city} />}
    </div>
  );
}

function CityOverview({ ctl, city }: { ctl: GameController; city: City }) {
  const state = ctl.state;
  const cap = housing(state, city.id);
  const tier = cityTier(city);
  const next = CITY_TIERS.find((t) => t.tier === tier + 1);
  const prod = cityProduction(state, city);
  const men = city.garrison.sailors + city.garrison.soldiers;
  const eat = city.population * FOOD.perCitizen + men * FOOD.perMan;
  const counts = new Map<string, number>();
  for (const b of cityBuildings(state, city.id)) counts.set(BUILDINGS[b.kind].name, (counts.get(BUILDINGS[b.kind].name) ?? 0) + 1);
  const balance = playerBalance(state, ctl.me);
  const faction = FACTIONS[state.players[ctl.me].faction!];

  return (
    <div>
      <h3>{city.name} · {tierName(tier)}</h3>
      <Stat label="Abitanti">{Math.floor(city.population)} / {cap}</Stat>
      <Bar value={city.population / Math.max(1, cap)} />
      <div class="sub">
        {city.population >= cap - 0.5
          ? 'Città piena: costruisci case per farla crescere.'
          : state.players[ctl.me].food <= 0
            ? 'Senza cibo la città non cresce!'
            : 'La popolazione cresce finché c’è cibo e posto nelle case.'}
        {next && ` Diventa ${next.name.toLowerCase()} a ${next.population} abitanti.`}
      </div>

      <h3>Guarnigione</h3>
      <div class="grid2">
        <Stat label={faction.sailors}>{fmt(city.garrison.sailors)}</Stat>
        <Stat label="Soldati">{fmt(city.garrison.soldiers)}</Stat>
      </div>
      <Stat label="Arruolabili ora">{recruitable(city)}</Stat>
      <div class="sub">Più è grande la città, più uomini puoi arruolare in caserma.</div>

      <h3>Economia della città</h3>
      <div class="grid2">
        <Stat label="Oro">{rate(prod.gold)}</Stat>
        <Stat label="Legno">{rate(prod.wood)}</Stat>
        <Stat label="Cibo prodotto">{rate(prod.food)}</Stat>
        <Stat label="Cibo consumato">{rate(-eat)}</Stat>
      </div>
      <div class={`sub ${balance.food < 0 ? 'bad' : ''}`}>
        Bilancio cibo di tutto il regno: {rate(balance.food)}{balance.food < 0 ? ' — servono fattorie o pescherie!' : ''}
      </div>

      {heroInCity(state, city.id) && (
        <div class="card mt gold">★ Il capitano {heroInCity(state, city.id)!.name} è qui: difesa della guarnigione {`+${Math.round((heroCityBonus(heroInCity(state, city.id)!).defense - 1) * 100)}%`}.</div>
      )}
      <Defenses ctl={ctl} city={city} />
      {city.siege && (
        <div class="card bad mt">
          Assedio! {Math.ceil(city.siege.soldiers)} soldati di {state.players[city.siege.owner].name} contro la guarnigione.
        </div>
      )}

      <h3>Edifici</h3>
      <div class="sub">{[...counts].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}</div>
    </div>
  );
}

function ForeignCity({ ctl, city, building }: { ctl: GameController; city: City; building: Building }) {
  const state = ctl.state;
  const owner = state.players[city.owner];
  const s = BUILDINGS[building.kind];
  const towers = cityBuildings(state, city.id).filter((b) => b.kind === 'torre' && b.hp > 0).length;
  const defense = garrisonStrength(state, city) + militiaStrength(state, city);
  return (
    <div>
      <h2>{s.name}</h2>
      <div class="sub">
        {city.name} · {city.owner === NEUTRAL ? 'coloni indipendenti' : `${owner.name} (${FACTIONS[owner.faction!].name})`}
      </div>
      <div class="mt">
        <Stat label="Integrità">{fmt(building.hp)}/{s.hp}</Stat>
        <Bar value={building.hp / s.hp} />
      </div>
      <h3>Difese della città</h3>
      <Stat label="Abitanti">{Math.floor(city.population)}</Stat>
      <Stat label="Soldati">{fmt(city.garrison.soldiers)}</Stat>
      <Stat label="Marinai">{fmt(city.garrison.sailors)}</Stat>
      <Stat label="Torri">{towers}</Stat>
      <Stat label="Forza difensiva">{fmt(defense)}</Stat>
      <div class="sub mt">
        Con le navi selezionate: <b>clic destro</b> per bombardare questo edificio. Per conquistare la città
        imbarca soldati e usa <b>Sbarca truppe</b> (<kbd>L</kbd>): servono più della guarnigione, e la milizia
        degli abitanti ({fmt(city.population * CITY.militiaPerCitizen)}) e le torri resistono finché gli assalitori non sono abbastanza.
      </div>
      {city.owner === NEUTRAL && <Market city={city} />}
      {city.siege && <div class="card mt">Assedio in corso: {Math.ceil(city.siege.soldiers)} soldati di {state.players[city.siege.owner].name}.</div>}
    </div>
  );
}

/** Riepilogo delle difese della città. */
function Defenses({ ctl, city }: { ctl: GameController; city: City }) {
  const f = fortifications(ctl.state, city);
  const kinds = Object.entries(f.count) as [keyof typeof BUILDINGS, number][];
  if (!kinds.length) return <div class="sub mt">Nessuna difesa: costruisci mura, terrapieni, fossati, torri, bastioni o batterie costiere.</div>;
  return (
    <div>
      <h3>Difese</h3>
      <div class="sub">{kinds.map(([k, n]) => `${BUILDINGS[k].name} ${n > 1 ? `×${n}` : ''}`).join(' · ')}</div>
      <div class="grid2">
        <Stat label="Guarnigione">+{Math.round((f.defense - 1) * 100)}%</Stat>
        <Stat label="Forza fissa">{fmt(f.militia)}</Stat>
        {f.moat > 0 && <Stat label="Assalitori">−{Math.round(f.moat * 100)}%</Stat>}
      </div>
    </div>
  );
}
