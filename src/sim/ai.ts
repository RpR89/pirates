import type { Command } from './commands';
import { BUILDINGS, SHIPS, TICK_RATE, UNITS, type BuildingKind, type ShipClass } from './rules';
import {
  buildProblem,
  dockedCity,
  garrisonStrength,
  playerBalance,
  recruitProblem,
  shipProblem,
} from './simulation';
import {
  NEUTRAL,
  buildingCenter,
  cityBuildings,
  cityCandidates,
  cityTier,
  distance,
  findPlacement,
  foundingProblem,
  housing,
  isComplete,
  isEnemy,
  recruitable,
  suggestShipName,
  type City,
  type GameState,
  type PlayerId,
  type Ship,
} from './state';
import type { Point } from './map';

/**
 * IA avversaria. Legge lo stato e produce comandi come un giocatore umano:
 * nessun accesso privilegiato alla simulazione. È deterministica, quindi in
 * lockstep ogni client può eseguirla ottenendo gli stessi comandi.
 */
export class AIController {
  private sites: Point[] | null = null;

  constructor(readonly player: PlayerId, private readonly thinkEverySeconds = 2) {}

  think(state: GameState): Command[] {
    const period = Math.round(this.thinkEverySeconds * TICK_RATE);
    if ((state.tick + this.player * 3) % period !== 0) return [];
    if (!state.players[this.player]?.alive) return [];

    const out: Command[] = [];
    const cities = state.cities.filter((c) => c.owner === this.player);
    const ships = state.ships.filter((s) => s.owner === this.player);
    const minutes = state.tick / TICK_RATE / 60;

    this.planBuildings(state, cities, out);
    this.planRecruits(state, cities, minutes, out);
    this.planShips(state, cities, ships, minutes, out);
    this.planFleet(state, cities, ships, minutes, out);
    return out;
  }

  // -------------------------------------------------------------- economia

  private planBuildings(state: GameState, cities: City[], out: Command[]): void {
    const balance = playerBalance(state, this.player);
    const p = state.players[this.player];
    for (const city of cities) {
      const buildings = cityBuildings(state, city.id);
      if (buildings.filter((b) => !isComplete(b)).length >= 2) continue;
      const count = (k: BuildingKind) => buildings.filter((b) => b.kind === k).length;
      const tier = cityTier(city);
      const tight = city.population >= housing(state, city.id) - 3;
      const wants: BuildingKind[] = [];
      if (balance.food < 0.4 || p.food < 40) wants.push('pescheria', 'fattoria');
      if (!count('segheria') || (balance.wood < 1.5 && count('segheria') < 3)) wants.push('segheria');
      if (!count('caserma') && count('casa') >= 2) wants.push('caserma');
      if (!count('cantiere')) wants.push('cantiere');
      if (tight && count('casa') < 4) wants.push('casa');
      if (!count('caserma')) wants.push('caserma');
      if (tier >= 2 && count('mercato') < 1) wants.push('mercato');
      if (tier >= 2 && count('torre') < 2) wants.push('torre');
      if (tight && count('casa') < 14) wants.push('casa');
      if (tier >= 3 && count('mercato') < 2) wants.push('mercato');
      if (count('fattoria') + count('pescheria') < 2 + Math.floor(city.population / 60)) wants.push('pescheria', 'fattoria');
      const canWall = BUILDINGS.mura.factions?.includes(p.faction!) ?? true;
      if (canWall && tier >= 2 && count('mura') < 24 && p.wood > 150) {
        const at = this.wallSpot(state, city);
        if (at) {
          out.push({ type: 'placeBuilding', cityId: city.id, kind: 'mura', x: at.x, y: at.y });
          return;
        }
      }
      for (const kind of wants) {
        const at = findPlacement(state, city.id, kind);
        if (at && !buildProblem(state, this.player, city.id, kind, at.x, at.y)) {
          out.push({ type: 'placeBuilding', cityId: city.id, kind, x: at.x, y: at.y });
          return; // una spesa per decisione
        }
      }
    }
  }

  private planRecruits(state: GameState, cities: City[], minutes: number, out: Command[]): void {
    const p = state.players[this.player];
    for (const city of cities) {
      const barracks = cityBuildings(state, city.id).find((b) => b.kind === 'caserma' && isComplete(b));
      if (!barracks || barracks.queue.length > 0) continue;
      // Lascia crescere le città piccole: arruola solo dalla popolazione in eccesso.
      const n = Math.min(10, recruitable(city), Math.floor(city.population - 25));
      if (n < 3) continue;
      const wantSoldiers = Math.min(15 + minutes * 4, 90);
      const unit = city.garrison.sailors < 25 ? 'sailors' : city.garrison.soldiers < wantSoldiers ? 'soldiers' : null;
      if (!unit || p.gold < UNITS[unit].gold * n + 60) continue;
      if (!recruitProblem(state, this.player, barracks.id, unit, n)) {
        out.push({ type: 'recruit', buildingId: barracks.id, unit, count: n });
        return;
      }
    }
  }

  private planShips(state: GameState, cities: City[], ships: Ship[], minutes: number, out: Command[]): void {
    const warships = ships.filter((s) => SHIPS[s.cls].damage > 0).length;
    const queued = (cls: ShipClass) =>
      state.buildings.filter((b) => b.queue.some((q) => q.type === 'ship' && q.cls === cls) && cities.some((c) => c.id === b.cityId)).length;
    const colonies = ships.filter((s) => s.cls === 'mercantile').length + queued('mercantile');
    const wantWarships = Math.min(2 + Math.floor(minutes / 1.5), 14);
    const wantCities = Math.min(2 + Math.floor(minutes / 5), 6);

    for (const city of cities) {
      const yard = cityBuildings(state, city.id).find((b) => b.kind === 'cantiere' && isComplete(b));
      if (!yard || yard.queue.length > 0) continue;
      const options: ShipClass[] = [];
      if (cities.length < wantCities && colonies === 0 && minutes > 2) options.push('mercantile');
      if (warships < wantWarships) options.push('galeone', 'fregata', 'brigantino', 'sloop');
      const cls = options.find((c) => !shipProblem(state, this.player, yard.id, c));
      if (cls) {
        out.push({ type: 'buildShip', buildingId: yard.id, cls, name: suggestShipName(state, this.player) });
        return;
      }
    }
  }

  // -------------------------------------------------------------- flotta

  private planFleet(state: GameState, cities: City[], ships: Ship[], minutes: number, out: Command[]): void {
    const idle = ships.filter((s) => s.order.type === 'idle');

    // Navi coloniali: fondano la città nel sito libero più vicino.
    for (const s of idle.filter((x) => x.colonists > 0)) {
      const site = this.nearestFreeSite(state, s);
      if (site) out.push({ type: 'found', shipId: s.id, x: site.x, y: site.y });
    }

    const warships = idle.filter((s) => SHIPS[s.cls].damage > 0);

    // Imbarca truppe e marinai quando la nave è in porto.
    const ready: Ship[] = [];
    for (const s of warships) {
      const city = dockedCity(state, s);
      const room = SHIPS[s.cls].capacity - s.sailors - s.soldiers;
      if (city) {
        const sailors = Math.max(0, Math.min(SHIPS[s.cls].crew - s.sailors, Math.floor(city.garrison.sailors)));
        const soldiers = Math.max(0, Math.min(room - sailors, Math.floor(city.garrison.soldiers) - 8));
        if (sailors > 0 || soldiers > 0) {
          out.push({ type: 'transfer', shipId: s.id, cityId: city.id, sailors, soldiers });
          continue;
        }
      }
      ready.push(s);
    }

    // Difesa: navi nemiche vicino alle nostre città.
    for (const c of cities) {
      const intruder = state.ships.find((s) => isEnemy(this.player, s.owner) && distance(s, { x: c.cx, y: c.cy }) < 14);
      if (intruder && ready.length) {
        out.push({ type: 'attackShip', shipIds: ready.splice(0).map((s) => s.id), targetId: intruder.id, board: intruder.cls === 'mercantile' });
        return;
      }
    }

    const fleetSize = Math.min(3 + Math.floor(minutes / 4), 8);
    const troops = ready.reduce((n, s) => n + s.soldiers, 0);
    const target = this.chooseTarget(state, ready);
    if (!target) return;
    const near = ready.filter((s) => distance(s, { x: target.cx, y: target.cy }) < 12);

    // Flotta già davanti al bersaglio: prima le torri, poi lo sbarco.
    if (near.length) {
      const tower = cityBuildings(state, target.id)
        .filter((b) => b.kind === 'torre' && b.hp > 0)
        .sort((a, b) => distance(buildingCenter(a), near[0]) - distance(buildingCenter(b), near[0]))[0];
      if (tower) out.push({ type: 'attackBuilding', shipIds: near.map((s) => s.id), targetId: tower.id });
      else {
        const landers = near.filter((s) => s.soldiers >= 1);
        if (landers.length) out.push({ type: 'land', shipIds: landers.map((s) => s.id), cityId: target.id });
      }
      return;
    }

    if (ready.length >= fleetSize && troops >= 20) {
      out.push({ type: 'move', shipIds: ready.map((s) => s.id), x: target.dock.x + 0.5, y: target.dock.y + 0.5 });
      return;
    }

    // Navi senza truppe e lontane da casa: tornano in porto a imbarcare.
    const home = cities[0];
    const strays = ready.filter((s) => s.soldiers < 5 && !dockedCity(state, s));
    if (home && strays.length) {
      out.push({ type: 'move', shipIds: strays.map((s) => s.id), x: home.dock.x + 0.5, y: home.dock.y + 0.5 });
    }
  }

  /** Un tratto di mura libero sull'anello attorno al municipio. */
  private wallSpot(state: GameState, city: City): Point | null {
    const spots: Point[] = [];
    for (let y = city.cy - 6; y <= city.cy + 6; y++) {
      for (let x = city.cx - 6; x <= city.cx + 6; x++) {
        const d = distance({ x, y }, { x: city.cx, y: city.cy });
        if (d >= 4.5 && d < 5.5) spots.push({ x, y });
      }
    }
    spots.sort((a, b) => a.y - b.y || a.x - b.x);
    return spots.find((p) => !buildProblem(state, this.player, city.id, 'mura', p.x, p.y)) ?? null;
  }

  private chooseTarget(state: GameState, fleet: Ship[]): City | null {
    if (!fleet.length) return null;
    const cx = fleet.reduce((n, s) => n + s.x, 0) / fleet.length;
    const cy = fleet.reduce((n, s) => n + s.y, 0) / fleet.length;
    let best: City | null = null;
    let bestScore = Infinity;
    for (const c of state.cities) {
      if (c.owner === this.player) continue;
      if (c.siege && c.siege.owner !== this.player) continue;
      const towers = cityBuildings(state, c.id).filter((b) => b.kind === 'torre' && b.hp > 0).length;
      const score =
        distance({ x: cx, y: cy }, { x: c.cx, y: c.cy }) +
        garrisonStrength(state, c) * 1.5 +
        towers * 15 +
        (c.owner === NEUTRAL ? 0 : 20);
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return best;
  }

  private nearestFreeSite(state: GameState, ship: Ship): Point | null {
    this.sites ??= cityCandidates(state);
    const byDistance = this.sites
      .map((site) => ({ site, d: distance(ship, site) }))
      .sort((a, b) => a.d - b.d || a.site.y - b.site.y || a.site.x - b.site.x);
    return byDistance.find(({ site }) => !foundingProblem(state, site.x, site.y))?.site ?? null;
  }
}
