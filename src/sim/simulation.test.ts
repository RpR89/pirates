import { describe, expect, it } from 'vitest';
import { AIController } from './ai';
import { hashState } from './hash';
import { BUILDINGS, CITY, SHIPS, START, TICK_RATE, ticks } from './rules';
import { playerBalance, step } from './simulation';
import {
  NEUTRAL,
  cityBuildings,
  findPlacement,
  housing,
  recruitable,
  shipyardDock,
  spawnShip,
  type City,
  type GameState,
} from './state';
import { home, newGame, run } from './testing';

describe('partenza', () => {
  it('ogni fazione ha una città con edifici, guarnigione e uno sloop con nome proprio', () => {
    const state = newGame();
    for (const p of [1, 2]) {
      const { city, ship } = home(state, p);
      const kinds = cityBuildings(state, city.id).map((b) => b.kind);
      expect(kinds).toEqual(expect.arrayContaining(['municipio', 'cantiere', 'fattoria', 'segheria', 'casa']));
      expect(city.garrison).toEqual({ sailors: START.sailors, soldiers: START.soldiers });
      expect(ship.cls).toBe('sloop');
      expect(ship.name.length).toBeGreaterThan(2);
    }
    expect(home(state, 1).ship.name).toMatch(/^HMS /);
    expect(state.cities.filter((c) => c.owner === NEUTRAL).length).toBeGreaterThan(3);
  });
});

describe('economia e cibo', () => {
  it('la città produce e consuma cibo; la popolazione cresce fino agli alloggi', () => {
    const state = newGame();
    const { city } = home(state, 1);
    const before = { ...state.players[1] };
    const balance = playerBalance(state, 1);
    run(state, ticks(10));
    expect(state.players[1].food - before.food).toBeCloseTo(balance.food * 10, -1);
    expect(state.players[1].gold).toBeGreaterThan(before.gold);
    run(state, ticks(600));
    expect(city.population).toBeCloseTo(housing(state, city.id), 0);
  });

  it('senza cibo la popolazione cala e gli uomini disertano', () => {
    const state = newGame();
    const { city, ship } = home(state, 1);
    city.garrison.soldiers += 200; // un esercito che la città non riesce a sfamare
    state.players[1].food = 0;
    const pop = city.population;
    const men = ship.sailors + ship.soldiers + city.garrison.sailors + city.garrison.soldiers;
    run(state, 1);
    expect(state.events.some((e) => e.type === 'famine' && e.owner === 1)).toBe(true);
    run(state, ticks(30));
    expect(city.population).toBeLessThan(pop);
    expect(ship.sailors + ship.soldiers + city.garrison.sailors + city.garrison.soldiers).toBeLessThan(men);
  });
});

describe('edifici piazzati dal giocatore', () => {
  it('si costruisce dove si sceglie, pagando e aspettando il cantiere', () => {
    const state = newGame();
    const { city } = home(state, 1);
    const at = findPlacement(state, city.id, 'casa')!;
    const gold = state.players[1].gold;
    run(state, 1, [[1, { type: 'placeBuilding', cityId: city.id, kind: 'casa', x: at.x, y: at.y }]]);
    const house = state.buildings.find((b) => b.x === at.x && b.y === at.y)!;
    expect(house.kind).toBe('casa');
    expect(house.buildLeft).toBeGreaterThan(0);
    expect(state.players[1].gold).toBeLessThan(gold - BUILDINGS.casa.cost.gold + 5);
    const cap = housing(state, city.id);
    run(state, ticks(BUILDINGS.casa.buildSeconds));
    expect(housing(state, city.id)).toBe(cap + BUILDINGS.casa.housing);
  });

  it('rifiuta posizioni non valide', () => {
    const state = newGame();
    const { city, building } = home(state, 1);
    const yard = building('cantiere');
    const count = state.buildings.length;
    run(state, 1, [
      [1, { type: 'placeBuilding', cityId: city.id, kind: 'casa', x: yard.x, y: yard.y }], // occupato
      [1, { type: 'placeBuilding', cityId: city.id, kind: 'casa', x: city.cx + CITY.radius + 3, y: city.cy }], // lontano
      [1, { type: 'placeBuilding', cityId: city.id, kind: 'casa', x: city.dock.x, y: city.dock.y }], // in mare
      [2, { type: 'placeBuilding', cityId: city.id, kind: 'casa', x: city.cx + 3, y: city.cy }], // città altrui
      [1, { type: 'placeBuilding', cityId: city.id, kind: 'mercato', x: city.cx + 3, y: city.cy }], // serve un paese
    ]);
    expect(state.buildings.length).toBe(count);
  });
});

describe('cantiere e caserma', () => {
  it('vara una nave con il nome scelto, usando i marinai della città', () => {
    const state = newGame();
    const { city, building } = home(state, 1);
    const yard = building('cantiere');
    const sailors = city.garrison.sailors;
    run(state, 1, [[1, { type: 'buildShip', buildingId: yard.id, cls: 'sloop', name: '  La  Perla <Rossa>  ' }]]);
    expect(city.garrison.sailors).toBe(sailors - SHIPS.sloop.crew);
    run(state, ticks(SHIPS.sloop.buildSeconds));
    const ship = state.ships.find((s) => s.name === 'La Perla Rossa')!;
    expect(ship).toBeDefined();
    expect(ship.sailors).toBe(SHIPS.sloop.crew);
    const dock = shipyardDock(state, yard);
    expect(Math.hypot(ship.x - dock.x, ship.y - dock.y)).toBeLessThan(0.01);
  });

  it('senza marinai non si vara nulla', () => {
    const state = newGame();
    const { city, building } = home(state, 1);
    city.garrison.sailors = 2;
    run(state, 1, [[1, { type: 'buildShip', buildingId: building('cantiere').id, cls: 'sloop', name: 'X' }]]);
    expect(building('cantiere').queue).toHaveLength(0);
  });

  it('più grande è la città, più uomini si possono arruolare', () => {
    const small = { population: 20 } as City;
    const big = { population: 90 } as City;
    expect(recruitable(big)).toBeGreaterThan(recruitable(small));

    const state = newGame();
    const { city } = home(state, 1);
    state.players[1].gold = 10_000;
    const at = findPlacement(state, city.id, 'caserma')!;
    run(state, ticks(BUILDINGS.caserma.buildSeconds) + 2, [[1, { type: 'placeBuilding', cityId: city.id, kind: 'caserma', x: at.x, y: at.y }]]);
    const barracks = state.buildings.find((b) => b.kind === 'caserma')!;
    const pop = city.population;
    const tooMany = recruitable(city) + 1;
    run(state, 1, [[1, { type: 'recruit', buildingId: barracks.id, unit: 'soldiers', count: tooMany }]]);
    expect(barracks.queue).toHaveLength(0);
    const soldiers = city.garrison.soldiers;
    run(state, 1, [[1, { type: 'recruit', buildingId: barracks.id, unit: 'soldiers', count: 5 }]]);
    expect(city.population).toBeLessThan(pop - 4);
    run(state, ticks(10));
    expect(city.garrison.soldiers).toBe(soldiers + 5);
  });

  it('si può rinominare una propria nave, non quelle altrui', () => {
    const state = newGame();
    const mine = home(state, 1).ship;
    const theirs = home(state, 2).ship;
    const theirName = theirs.name;
    run(state, 1, [
      [1, { type: 'renameShip', shipId: mine.id, name: 'Intrepida' }],
      [1, { type: 'renameShip', shipId: theirs.id, name: 'Rubata' }],
    ]);
    expect(mine.name).toBe('Intrepida');
    expect(theirs.name).toBe(theirName);
  });

  it('imbarca e sbarca uomini solo in porto', () => {
    const state = newGame();
    const { city, ship } = home(state, 1);
    const soldiers = ship.soldiers;
    run(state, 1, [[1, { type: 'transfer', shipId: ship.id, cityId: city.id, sailors: 0, soldiers: 5 }]]);
    expect(ship.soldiers).toBe(soldiers + 5);
    run(state, 1, [[1, { type: 'transfer', shipId: ship.id, cityId: city.id, sailors: 0, soldiers: -3 }]]);
    expect(ship.soldiers).toBe(soldiers + 2);
    ship.x = 5.5;
    ship.y = 5.5;
    run(state, 1, [[1, { type: 'transfer', shipId: ship.id, cityId: city.id, sailors: 0, soldiers: 5 }]]);
    expect(ship.soldiers).toBe(soldiers + 2);
  });
});

/** Due navi nemiche vicine, in mare aperto. */
function duel(state: GameState) {
  const a = spawnShip(state, 1, 'fregata', 5.5, 5.5, 'Alfa', { sailors: 30, soldiers: 30 });
  const b = spawnShip(state, 2, 'sloop', 8.5, 5.5, 'Beta', { sailors: 8, soldiers: 2 });
  return { a, b };
}

describe('battaglie navali', () => {
  it('a cannonate una nave affonda', () => {
    const state = newGame();
    const { a, b } = duel(state);
    run(state, ticks(40));
    expect(state.ships.includes(b)).toBe(false);
    expect(state.ships.includes(a)).toBe(true);
  });

  it("l'abbordaggio cattura la nave e la nave mantiene il suo nome", () => {
    const state = newGame();
    const { a, b } = duel(state);
    b.order = { type: 'move' }; // nessun fuoco automatico verso di noi per questo test
    run(state, 1, [[1, { type: 'attackShip', shipIds: [a.id], targetId: b.id, board: true }]]);
    run(state, ticks(10));
    expect(b.owner).toBe(1);
    expect(b.name).toBe('Beta');
    expect(b.sailors).toBeGreaterThan(0);
  });

  it("un equipaggio troppo debole viene respinto nell'abbordaggio", () => {
    const state = newGame();
    const a = spawnShip(state, 1, 'sloop', 5.5, 5.5, 'Debole', { sailors: 4, soldiers: 0 });
    const b = spawnShip(state, 2, 'galeone', 6.5, 5.5, 'Forte', { sailors: 40, soldiers: 60 });
    run(state, 1, [[1, { type: 'attackShip', shipIds: [a.id], targetId: b.id, board: true }]]);
    run(state, 5);
    expect(b.owner).toBe(2);
  });
});

describe('conquista e fondazione', () => {
  function neutralTarget(state: GameState) {
    return state.cities.find((c) => c.owner === NEUTRAL)!;
  }

  it('le truppe sbarcate conquistano una città se sono abbastanza', () => {
    const state = newGame();
    const city = neutralTarget(state);
    for (const b of cityBuildings(state, city.id)) if (b.kind === 'torre') b.hp = 1;
    const ship = spawnShip(state, 1, 'galeone', city.dock.x + 0.5, city.dock.y + 0.5, 'Sbarco', { sailors: 40, soldiers: 80 });
    run(state, 1, [[1, { type: 'land', shipIds: [ship.id], cityId: city.id }]]);
    expect(city.siege?.owner).toBe(1);
    let captured = false;
    for (let t = 0; t < ticks(60) && !captured; t++) {
      run(state, 1);
      captured = state.events.some((e) => e.type === 'cityCaptured' && e.cityId === city.id);
    }
    expect(captured).toBe(true);
    expect(city.owner).toBe(1);
    expect(city.garrison.soldiers).toBeGreaterThan(0);
  });

  it('uno sbarco troppo debole fallisce', () => {
    const state = newGame();
    const city = neutralTarget(state);
    const ship = spawnShip(state, 1, 'sloop', city.dock.x + 0.5, city.dock.y + 0.5, 'Pochi', { sailors: 8, soldiers: 2 });
    run(state, 1, [[1, { type: 'land', shipIds: [ship.id], cityId: city.id }]]);
    run(state, ticks(30));
    expect(city.owner).toBe(NEUTRAL);
    expect(city.siege).toBeNull();
  });

  it('la nave coloniale fonda una città con i suoi coloni', () => {
    const state = newGame();
    const { city } = home(state, 1);
    const ship = spawnShip(state, 1, 'mercantile', city.dock.x + 0.5, city.dock.y + 0.5, 'Coloni', { sailors: 6, soldiers: 4 });
    ship.colonists = SHIPS.mercantile.colonists;
    const site = new AIControllerProbe(1).site(state, ship);
    run(state, 1, [[1, { type: 'found', shipId: ship.id, x: site.x, y: site.y }]]);
    for (let t = 0; t < ticks(180) && !state.events.some((e) => e.type === 'cityFounded'); t++) run(state, 1);
    const founded = state.cities.find((c) => c.cx === site.x && c.cy === site.y);
    expect(founded?.owner).toBe(1);
    expect(founded?.population).toBe(SHIPS.mercantile.colonists);
    expect(founded?.garrison).toEqual({ sailors: 6, soldiers: 4 });
    expect(cityBuildings(state, founded!.id).map((b) => b.kind)).toEqual(['municipio']);
  });
});

/** Accesso al cercatore di siti dell'IA, per i test. */
class AIControllerProbe extends AIController {
  site(state: GameState, ship: Parameters<AIController['think']>[0]['ships'][number]) {
    return (this as unknown as { nearestFreeSite: (s: GameState, sh: typeof ship) => { x: number; y: number } }).nearestFreeSite(state, ship);
  }
}

describe('fine partita', () => {
  it("chi perde tutte le città e le navi è eliminato e l'altro vince", () => {
    const state = newGame();
    state.ships = state.ships.filter((s) => s.owner !== 2);
    for (const c of state.cities) if (c.owner === 2) c.owner = NEUTRAL;
    run(state, 1);
    expect(state.players[2].alive).toBe(false);
    expect(state.winner).toBe(1);
  });
});

describe('determinismo (base del multiplayer lockstep)', () => {
  it('due simulazioni con stesso seed e stessi comandi restano identiche', () => {
    const play = () => {
      const state = newGame(99, ['francesi', 'spagnoli', 'pirati']);
      const ais = [1, 2, 3].map((p) => new AIController(p));
      const hashes: string[] = [];
      for (let t = 0; t < ticks(300); t++) {
        const cmds = ais.flatMap((ai) => ai.think(state).map((command) => ({ player: ai.player, tick: state.tick, command })));
        step(state, cmds);
        if (t % (TICK_RATE * 30) === 0) hashes.push(hashState(state));
      }
      return { hashes, state };
    };
    const a = play();
    const b = play();
    expect(a.hashes).toEqual(b.hashes);
    // Nel frattempo l'IA ha davvero giocato: costruito, arruolato, varato.
    expect(a.state.buildings.length).toBeGreaterThan(30);
    expect(a.state.ships.length).toBeGreaterThan(4);
  });
});
