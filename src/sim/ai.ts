import type { Command } from './commands';
import { findCoastalSites, type CoastalSite } from './map';
import { SHIPS, TICK_RATE, type BuildingKind } from './rules';
import { canBuild } from './simulation';
import {
  NEUTRAL,
  distance,
  foundingSite,
  isEnemy,
  villageCenter,
  type GameState,
  type PlayerId,
  type ProductionItem,
  type Ship,
  type Village,
} from './state';

/**
 * IA avversaria. Legge lo stato e produce comandi come un giocatore umano:
 * nessun accesso privilegiato alla simulazione. È deterministica, quindi in
 * lockstep ogni client può eseguirla ottenendo gli stessi comandi.
 */
export class AIController {
  private sites: CoastalSite[] | null = null;

  constructor(readonly player: PlayerId, private readonly thinkEverySeconds = 1) {}

  think(state: GameState): Command[] {
    const period = Math.round(this.thinkEverySeconds * TICK_RATE);
    if ((state.tick + this.player) % period !== 0) return [];
    if (!state.players[this.player]?.alive) return [];

    const commands: Command[] = [];
    const myVillages = state.villages.filter((v) => v.owner === this.player);
    const myShips = state.ships.filter((s) => s.owner === this.player);
    const warships = myShips.filter((s) => SHIPS[s.kind].damage > 0);
    const colonies = myShips.filter((s) => s.kind === 'colony');
    const minutes = state.tick / TICK_RATE / 60;

    // Economia e produzione: al massimo un acquisto per decisione.
    for (const v of myVillages) {
      if (v.queue.length >= 2) continue;
      const item = this.chooseProduction(state, v, {
        warships: warships.length,
        colonies: colonies.length + this.queuedColonies(myVillages),
        villages: myVillages.length,
        minutes,
      });
      if (item) {
        commands.push({ type: 'build', villageId: v.id, item });
        break;
      }
    }

    // Colonie inattive: fonda il villaggio nel sito libero più vicino.
    for (const c of colonies) {
      if (c.order.type !== 'idle') continue;
      const site = this.nearestFreeSite(state, c);
      if (site) commands.push({ type: 'found', shipId: c.id, x: site.x, y: site.y });
    }

    const idle = warships.filter((s) => s.order.type === 'idle');

    // Difesa: navi nemiche vicino ai nostri villaggi.
    for (const v of myVillages) {
      const intruder = state.ships.find(
        (s) => isEnemy(this.player, s.owner) && distance(s, villageCenter(v)) < 12,
      );
      if (intruder && idle.length) {
        commands.push({
          type: 'attackShip',
          shipIds: idle.splice(0).map((s) => s.id),
          targetId: intruder.id,
          capture: intruder.kind === 'colony',
        });
        break;
      }
    }

    // Attacco: con una flotta sufficiente punta al villaggio altrui più vicino.
    const fleetSize = Math.min(3 + Math.floor(minutes / 4), 8);
    if (idle.length >= fleetSize) {
      const target = this.nearestTargetVillage(state, idle);
      if (target) {
        commands.push({ type: 'attackVillage', shipIds: idle.map((s) => s.id), targetId: target.id });
      }
    }

    return commands;
  }

  private chooseProduction(
    state: GameState,
    v: Village,
    ctx: { warships: number; colonies: number; villages: number; minutes: number },
  ): ProductionItem | null {
    const b = v.buildings;
    const building = (building: BuildingKind): ProductionItem => ({ type: 'building', building });
    const queued = (kind: BuildingKind) =>
      v.queue.some((q) => q.item.type === 'building' && q.item.building === kind);
    const wants: ProductionItem[] = [];

    if (b.cantiere === 0 && !queued('cantiere')) wants.push(building('cantiere'));
    if (b.mercato === 0 && !queued('mercato')) wants.push(building('mercato'));
    if (b.segheria === 0 && !queued('segheria')) wants.push(building('segheria'));
    if (ctx.warships < 2) wants.push({ type: 'ship', ship: 'sloop' });
    if (ctx.colonies === 0 && ctx.villages < 4 && ctx.minutes > 1.5) wants.push({ type: 'ship', ship: 'colony' });
    const targetFleet = Math.min(4 + Math.floor(ctx.minutes / 2), 14);
    if (ctx.warships < targetFleet) {
      wants.push({ type: 'ship', ship: b.cantiere >= 2 && ctx.warships % 2 === 1 ? 'galleon' : 'sloop' });
    }
    if (b.mercato < 2 && !queued('mercato')) wants.push(building('mercato'));
    if (b.segheria < 2 && !queued('segheria')) wants.push(building('segheria'));
    if (b.cantiere < 2 && !queued('cantiere')) wants.push(building('cantiere'));
    if (b.forte < 1 && !queued('forte')) wants.push(building('forte'));
    if (b.mercato < 3 && !queued('mercato')) wants.push(building('mercato'));
    if (b.forte < 2 && !queued('forte')) wants.push(building('forte'));

    return wants.find((item) => canBuild(state, this.player, v.id, item)) ?? null;
  }

  private queuedColonies(villages: Village[]): number {
    return villages.reduce(
      (n, v) => n + v.queue.filter((q) => q.item.type === 'ship' && q.item.ship === 'colony').length,
      0,
    );
  }

  private nearestFreeSite(state: GameState, ship: Ship): CoastalSite | null {
    this.sites ??= findCoastalSites(state.map);
    let best: CoastalSite | null = null;
    let bestD = Infinity;
    for (const site of this.sites) {
      const d = distance(ship, site);
      if (d < bestD && foundingSite(state, site.x, site.y)) {
        best = site;
        bestD = d;
      }
    }
    return best;
  }

  private nearestTargetVillage(state: GameState, fleet: Ship[]): Village | null {
    const cx = fleet.reduce((n, s) => n + s.x, 0) / fleet.length;
    const cy = fleet.reduce((n, s) => n + s.y, 0) / fleet.length;
    let best: Village | null = null;
    let bestScore = Infinity;
    for (const v of state.villages) {
      if (v.owner === this.player) continue;
      // Preferisce i villaggi neutrali e quelli poco difesi.
      const score = distance({ x: cx, y: cy }, v) + v.buildings.forte * 15 + (v.owner === NEUTRAL ? 0 : 10);
      if (score < bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  }
}
