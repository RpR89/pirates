import type { GameController } from '../game/controller';
import { FACTIONS, type FactionId } from '../sim/factions';
import { HERO, HERO_SKILLS, HERO_SKILL_INFO, heroCityBonus, heroLevel, heroShipBonus, type Hero, type HeroProfile } from '../sim/hero';
import { dockedCity } from '../sim/simulation';
import { getCity, getShip, heroOf, type Ship } from '../sim/state';
import { UNIFORMS, portraitUrl } from '../render/portrait';
import { Bar } from './common';

const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;

/** Ritratto e abilità di un capitano (anche prima della partita). */
export function HeroSheet({ hero, faction, compact }: { hero: HeroProfile; faction: FactionId; compact?: boolean }) {
  return (
    <div class="row" style={{ alignItems: 'flex-start', gap: 10 }}>
      <div style={{ textAlign: 'center' }}>
        <img src={portraitUrl(hero.seed, faction, hero.uniform)} width={compact ? 96 : 144} height={compact ? 96 : 144} style={{ imageRendering: 'pixelated', display: 'block' }} alt="" />
        <div class="sub" style={{ maxWidth: compact ? 96 : 144 }}>{UNIFORMS[faction][hero.uniform % 3].name}</div>
      </div>
      <div class="grow">
        {HERO_SKILLS.map((s) => (
          <div title={`Migliora: ${HERO_SKILL_INFO[s].effect}`}>
            <div class="stat"><span class="muted">{HERO_SKILL_INFO[s].name}</span><b>{hero.skills[s]}/{HERO.maxSkill}</b></div>
            <Bar value={hero.skills[s] / HERO.maxSkill} color="gold" />
          </div>
        ))}
      </div>
    </div>
  );
}

function where(ctl: GameController, hero: Hero): string {
  const loc = hero.location;
  if (loc.type === 'ship') return `a bordo della ${getShip(ctl.state, loc.shipId)?.name ?? ''}`;
  if (loc.type === 'city') return `a ${getCity(ctl.state, loc.cityId)?.name ?? ''}`;
  return 'disperso: sta tornando';
}

/** Scheda del capitano in partita, con i bonus che sta dando ora. */
export function HeroPanel({ ctl }: { ctl: GameController }) {
  const hero = heroOf(ctl.state, ctl.me);
  if (!hero) return null;
  const faction = ctl.state.players[ctl.me].faction!;
  const ship = heroShipBonus(hero);
  const city = heroCityBonus(hero);
  const lv = heroLevel(hero);
  return (
    <div>
      <h2>{hero.name}</h2>
      <div class="sub">Capitano della {FACTIONS[faction].name} · livello {lv} · {where(ctl, hero)}</div>
      <div class="mt"><HeroSheet hero={hero} faction={faction} /></div>
      {lv < HERO.maxLevel && <div class="sub mt">Esperienza: {hero.xp} · prossimo livello a {lv * HERO.xpPerLevel}. Si guadagna affondando e catturando navi.</div>}
      <h3>Bonus</h3>
      <div class="sub">Imbarcato: cannoni {pct(ship.cannon)}, velocità {pct(ship.speed)}, arrembaggio {pct(ship.boarding)}.</div>
      <div class="sub">In città: difesa della guarnigione {pct(city.defense)}, torri {pct(city.towers)}.</div>
      <div class="sub mt">Per imbarcarlo seleziona una nave in porto nella sua città e usa “Imbarca il capitano”. Se la nave affonda, il capitano naufraga e torna dopo un minuto.</div>
    </div>
  );
}

/** Pulsanti per imbarcare o sbarcare il capitano dalla nave selezionata. */
export function HeroShipActions({ ctl, ship }: { ctl: GameController; ship: Ship }) {
  const hero = heroOf(ctl.state, ctl.me);
  if (!hero) return null;
  const docked = dockedCity(ctl.state, ship);
  const loc = hero.location;
  if (loc.type === 'ship' && loc.shipId === ship.id) {
    return (
      <div class="card mt gold">
        <div class="row spread">
          <span>★ Il capitano {hero.name} è a bordo</span>
          <button class="small" disabled={!docked} title={docked ? '' : 'Solo in porto'} onClick={() => ctl.issue({ type: 'heroLand' })}>Sbarca</button>
        </div>
      </div>
    );
  }
  if (loc.type === 'city' && docked && docked.id === loc.cityId) {
    return (
      <div class="card mt">
        <div class="row spread">
          <span>Il capitano {hero.name} è in città</span>
          <button class="small primary" onClick={() => ctl.issue({ type: 'heroBoard', shipId: ship.id })}>Imbarca il capitano</button>
        </div>
      </div>
    );
  }
  return null;
}
