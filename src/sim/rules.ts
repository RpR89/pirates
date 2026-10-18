// Bilanciamento del gioco: tutti i numeri modificabili stanno qui.

import type { FactionId } from './factions';

export const TICK_RATE = 10; // tick di simulazione al secondo
export const TICK_MS = 1000 / TICK_RATE;

export const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

/**
 * Gli edifici stanno su una griglia più fine della mappa: ogni casella di mappa
 * è divisa in SUB×SUB caselle edificio. Posizioni e dimensioni degli edifici
 * (x, y, w, h) sono in caselle edificio; tutto il resto è in caselle di mappa.
 */
export const SUB = 2;

export interface Cost {
  gold: number;
  wood: number;
}

// ------------------------------------------------------------------ navi

export type ShipClass = 'sloop' | 'brigantino' | 'fregata' | 'galeone' | 'mercantile';
export const SHIP_CLASSES: readonly ShipClass[] = ['sloop', 'brigantino', 'fregata', 'galeone', 'mercantile'];

export interface ShipStats {
  name: string;
  description: string;
  cost: Cost;
  buildSeconds: number;
  hp: number;
  damage: number;
  range: number; // caselle
  reloadSeconds: number;
  speed: number; // caselle al secondo
  /** Marinai necessari per manovrare a piena efficienza (presi dalla guarnigione al varo). */
  crew: number;
  /** Uomini totali trasportabili (marinai + soldati). */
  capacity: number;
  /** Coloni imbarcati al varo (solo mercantile): fondano una nuova città. */
  colonists: number;
  /** Dimensione minima della città (vedi CITY_TIERS). */
  tier: number;
  /** Dimensioni dello scafo visto dall'alto, in caselle (solo per la grafica). */
  length: number;
  beam: number;
}

export const SHIPS: Record<ShipClass, ShipStats> = {
  sloop: {
    name: 'Sloop',
    description: 'Piccolo e veloce, ideale per esplorare e cacciare mercantili.',
    cost: { gold: 80, wood: 60 }, buildSeconds: 12,
    hp: 100, damage: 6, range: 4.5, reloadSeconds: 1.5, speed: 4.59,
    crew: 8, capacity: 20, colonists: 0, tier: 1, length: 1.5, beam: 0.625,
  },
  brigantino: {
    name: 'Brigantino',
    description: 'Due alberi, buon equilibrio tra cannoni, velocità e truppe.',
    cost: { gold: 160, wood: 120 }, buildSeconds: 20,
    hp: 180, damage: 10, range: 5, reloadSeconds: 1.8, speed: 3.92,
    crew: 15, capacity: 40, colonists: 0, tier: 2, length: 1.875, beam: 0.75,
  },
  fregata: {
    name: 'Fregata',
    description: 'Nave da guerra rapida con una lunga batteria di cannoni.',
    cost: { gold: 300, wood: 220 }, buildSeconds: 30,
    hp: 300, damage: 16, range: 6, reloadSeconds: 2, speed: 3.51,
    crew: 30, capacity: 70, colonists: 0, tier: 3, length: 2.375, beam: 0.875,
  },
  galeone: {
    name: 'Galeone',
    description: 'Una fortezza galleggiante: lento, ma porta un esercito.',
    cost: { gold: 420, wood: 320 }, buildSeconds: 40,
    hp: 450, damage: 20, range: 5.5, reloadSeconds: 2.8, speed: 2.43,
    crew: 40, capacity: 120, colonists: 0, tier: 3, length: 2.75, beam: 1.125,
  },
  mercantile: {
    name: 'Nave coloniale',
    description: 'Trasporta coloni per fondare una nuova città su una costa libera.',
    cost: { gold: 150, wood: 150 }, buildSeconds: 20,
    hp: 120, damage: 0, range: 0, reloadSeconds: 0, speed: 3.24,
    crew: 6, capacity: 20, colonists: 15, tier: 1, length: 1.875, beam: 0.875,
  },
};

// ------------------------------------------------------------------ edifici

export type BuildingKind =
  | 'municipio' | 'casa' | 'fattoria' | 'pescheria' | 'segheria'
  | 'mercato' | 'cantiere' | 'caserma'
  | 'torre' | 'mura' | 'terrapieno' | 'porta' | 'fossato' | 'bastione' | 'batteria';

/** Edifici che il giocatore può costruire (il municipio nasce con la città). */
export const BUILDABLE: readonly BuildingKind[] = [
  'casa', 'fattoria', 'pescheria', 'segheria', 'mercato', 'cantiere', 'caserma',
  'torre', 'mura', 'terrapieno', 'porta', 'fossato', 'bastione', 'batteria',
];

export interface BuildingStats {
  name: string;
  description: string;
  w: number; // caselle edificio (SUB per casella di mappa)
  h: number;
  cost: Cost;
  buildSeconds: number;
  hp: number;
  /** Deve toccare il mare (porto). */
  coastal: boolean;
  tier: number;
  housing: number;
  food: number; // al secondo
  wood: number;
  gold: number;
  /** Cannoni (torri e municipio). */
  damage: number;
  range: number;
  reloadSeconds: number;
  /** Se presente, solo queste fazioni possono costruirlo. */
  factions?: readonly FactionId[];
  /** Si traccia trascinando, una casella alla volta (mura, terrapieni, fossati). */
  line: boolean;
  /** Difese: quanto aumenta la forza della guarnigione negli assedi (somma, con un massimo). */
  defense: number;
  /** Difese: forza fissa che resiste agli assalitori senza subire perdite. */
  militia: number;
  /** Fossati: quanto indebolisce gli assalitori (somma, con un massimo). */
  moat: number;
}

const B = (s: Partial<BuildingStats> & Pick<BuildingStats, 'name' | 'description' | 'w' | 'h' | 'cost' | 'buildSeconds' | 'hp'>): BuildingStats => ({
  coastal: false, tier: 1, housing: 0, food: 0, wood: 0, gold: 0, damage: 0, range: 0, reloadSeconds: 0, line: false, defense: 0, militia: 0, moat: 0, ...s,
});

export const BUILDINGS: Record<BuildingKind, BuildingStats> = {
  municipio: B({ name: 'Municipio', description: 'Il cuore della città: alloggi, tasse e un cannone di difesa.', w: 4, h: 4, cost: { gold: 0, wood: 0 }, buildSeconds: 0, hp: 800, housing: 12, gold: 0.6, wood: 0.4, food: 0.8, damage: 5, range: 5, reloadSeconds: 2.5 }),
  casa: B({ name: 'Casa', description: 'Alloggi per 8 abitanti: la città può crescere.', w: 2, h: 2, cost: { gold: 30, wood: 40 }, buildSeconds: 8, hp: 120, housing: 8 }),
  fattoria: B({ name: 'Fattoria', description: 'Campi coltivati: produce cibo.', w: 3, h: 3, cost: { gold: 40, wood: 50 }, buildSeconds: 12, hp: 150, food: 1.6 }),
  pescheria: B({ name: 'Pescheria', description: 'Pontile e barche da pesca: molto cibo, ma va sulla costa.', w: 3, h: 3, cost: { gold: 60, wood: 50 }, buildSeconds: 12, hp: 150, food: 2.2, coastal: true }),
  segheria: B({ name: 'Segheria', description: 'Taglia il legname: rende di più vicino ai boschi.', w: 3, h: 3, cost: { gold: 40, wood: 20 }, buildSeconds: 10, hp: 150, wood: 1 }),
  mercato: B({ name: 'Mercato', description: 'Commercio e dazi: produce oro.', w: 3, h: 3, cost: { gold: 80, wood: 80 }, buildSeconds: 15, hp: 180, gold: 1.2, tier: 2 }),
  cantiere: B({ name: 'Cantiere navale', description: 'Costruisce le navi. Va sulla costa.', w: 3, h: 3, cost: { gold: 100, wood: 120 }, buildSeconds: 18, hp: 250, coastal: true }),
  caserma: B({ name: 'Caserma', description: 'Arruola marinai e soldati tra gli abitanti.', w: 3, h: 3, cost: { gold: 100, wood: 80 }, buildSeconds: 15, hp: 300 }),
  torre: B({ name: 'Torre di difesa', description: 'Cannoni contro le navi nemiche e rinforzo per la guarnigione.', w: 2, h: 2, cost: { gold: 90, wood: 110 }, buildSeconds: 15, hp: 350, damage: 10, range: 6, reloadSeconds: 2, tier: 2, defense: 0.05, militia: 5 }),
  mura: B({ name: 'Mura', description: 'Mura in pietra: si tracciano trascinando, anche in diagonale. Rendono la guarnigione molto più forte negli assedi.', w: 1, h: 1, cost: { gold: 3, wood: 5 }, buildSeconds: 3, hp: 400, line: true, defense: 0.02, militia: 0.75, factions: ['inglesi', 'francesi', 'spagnoli'] }),
  terrapieno: B({ name: 'Terrapieno', description: 'Argine di terra con palizzata: economico e veloce, protegge meno delle mura. Si traccia trascinando.', w: 1, h: 1, cost: { gold: 1, wood: 3 }, buildSeconds: 2, hp: 250, line: true, defense: 0.0125, militia: 0.5 }),
  porta: B({ name: 'Porta', description: 'Porta della cinta: in pietra nelle mura, di legno nei terrapieni. Si piazza anche sopra un tratto già costruito, che sostituisce. Le strade escono dalla cinta solo dalle porte.', w: 1, h: 1, cost: { gold: 20, wood: 25 }, buildSeconds: 6, hp: 500, line: true, defense: 0.04, militia: 1.5 }),
  fossato: B({ name: 'Fossato', description: 'Canale d’acqua scavato attorno alla città: gli assalitori che lo devono attraversare combattono peggio. Si traccia trascinando.', w: 1, h: 1, cost: { gold: 2, wood: 1 }, buildSeconds: 3, hp: 600, line: true, moat: 0.0125 }),
  bastione: B({ name: 'Bastione', description: 'Fortificazione in pietra a punta, armata di cannoni: spara alle navi e rafforza molto la guarnigione.', w: 4, h: 4, cost: { gold: 220, wood: 260 }, buildSeconds: 30, hp: 1200, damage: 18, range: 7.5, reloadSeconds: 2.4, tier: 2, defense: 0.15, militia: 8, factions: ['inglesi', 'francesi', 'spagnoli'] }),
  batteria: B({ name: 'Batteria costiera', description: 'Piazzola di cannoni pesanti sulla costa: la gittata più lunga, per chiudere l’ingresso del porto.', w: 4, h: 4, cost: { gold: 160, wood: 180 }, buildSeconds: 24, hp: 700, damage: 26, range: 9, reloadSeconds: 3.2, tier: 2, coastal: true, militia: 2 }),
};

export const FORTIFICATIONS = {
  /** Massimo aumento della forza della guarnigione dato dalle difese. */
  maxDefense: 1.5,
  /** Massimo indebolimento degli assalitori dato dai fossati. */
  maxMoat: 0.5,
};

/** Edifici che contano come difese nel menu costruzioni. */
export const DEFENSES: readonly BuildingKind[] = ['torre', 'mura', 'terrapieno', 'porta', 'fossato', 'bastione', 'batteria'];

/** Moltiplicatore della segheria con boschi entro 3 caselle. */
export const FOREST_BONUS = 1.6;

// ------------------------------------------------------------------ città

/** Soglie di popolazione per i livelli della città. */
export const CITY_TIERS = [
  { tier: 1, name: 'Villaggio', population: 0 },
  { tier: 2, name: 'Paese', population: 35 },
  { tier: 3, name: 'Città', population: 80 },
] as const;

export const CITY = {
  /** Gli edifici devono stare entro questa distanza dal centro del municipio. */
  radius: 13,
  /** Distanza minima tra i centri di due città. */
  minDistance: 32,
  taxPerCitizen: 0.02, // oro al secondo per abitante
  growthBase: 0.1, // abitanti al secondo
  growthPerCitizen: 0.0015,
  starvationLoss: 0.15, // abitanti al secondo persi senza cibo
  militiaPerCitizen: 0.15, // forza difensiva degli abitanti
  capturePopulationLoss: 0.2,
  regenDelaySeconds: 10,
  regenPerSecond: 4,
};

// ------------------------------------------------------------------ uomini e cibo

export type UnitKind = 'sailors' | 'soldiers';

export const UNITS: Record<UnitKind, { gold: number; trainSeconds: number; power: number }> = {
  sailors: { gold: 4, trainSeconds: 0.4, power: 0.4 },
  soldiers: { gold: 10, trainSeconds: 0.8, power: 1 },
};

export const RECRUIT = {
  /** Frazione degli abitanti arruolabile in un colpo: città più grandi → più uomini. */
  maxShare: 0.5,
  /** Abitanti che devono restare in città. */
  minPopulation: 4,
  maxBatch: 50,
};

export const FOOD = {
  perCitizen: 0.03, // cibo al secondo
  perMan: 0.05, // marinai e soldati, in città o in mare
  /** Ogni quanto, senza cibo, una parte degli uomini diserta. */
  desertionSeconds: 6,
  desertionShare: 0.05,
};

// ------------------------------------------------------------------ combattimento

export const COMBAT = {
  boardRange: 1.6,
  /** Raggio entro cui le navi possono sbarcare truppe o trasferire uomini. */
  dockRange: 3,
  repathSeconds: 0.5,
  /** Rapidità delle perdite negli assalti a terra (per tick). */
  assaultRate: 0.007,
  minCrewEfficiency: 0.3,
};

export const START = {
  gold: 300,
  wood: 250,
  food: 120,
  population: 18,
  sailors: 12,
  soldiers: 8,
};
