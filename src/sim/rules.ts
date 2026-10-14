// Bilanciamento del gioco: tutti i numeri modificabili stanno qui.

export const TICK_RATE = 10; // tick di simulazione al secondo
export const TICK_MS = 1000 / TICK_RATE;

export const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

export interface Cost {
  gold: number;
  wood: number;
}

export type ShipKind = 'sloop' | 'galleon' | 'colony';
export type BuildingKind = 'cantiere' | 'mercato' | 'segheria' | 'forte';

export interface ShipStats {
  name: string;
  cost: Cost;
  buildSeconds: number;
  hp: number;
  damage: number;
  range: number; // caselle
  reloadSeconds: number;
  speed: number; // caselle al secondo
  shipyardLevel: number; // livello di cantiere richiesto
}

export const SHIPS: Record<ShipKind, ShipStats> = {
  sloop: {
    name: 'SLOOP',
    cost: { gold: 60, wood: 40 },
    buildSeconds: 10,
    hp: 80,
    damage: 8,
    range: 4,
    reloadSeconds: 1.5,
    speed: 3.2,
    shipyardLevel: 1,
  },
  galleon: {
    name: 'GALEONE',
    cost: { gold: 160, wood: 120 },
    buildSeconds: 25,
    hp: 220,
    damage: 18,
    range: 5,
    reloadSeconds: 2.5,
    speed: 1.8,
    shipyardLevel: 2,
  },
  colony: {
    name: 'COLONIA',
    cost: { gold: 120, wood: 100 },
    buildSeconds: 18,
    hp: 60,
    damage: 0,
    range: 0,
    reloadSeconds: 0,
    speed: 2.2,
    shipyardLevel: 1,
  },
};

export const SHIP_KINDS: readonly ShipKind[] = ['sloop', 'galleon', 'colony'];

export interface BuildingStats {
  name: string;
  baseCost: Cost;
  buildSeconds: number;
  maxLevel: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingStats> = {
  cantiere: { name: 'CANTIERE', baseCost: { gold: 60, wood: 80 }, buildSeconds: 15, maxLevel: 2 },
  mercato: { name: 'MERCATO', baseCost: { gold: 50, wood: 40 }, buildSeconds: 12, maxLevel: 3 },
  segheria: { name: 'SEGHERIA', baseCost: { gold: 40, wood: 30 }, buildSeconds: 10, maxLevel: 3 },
  forte: { name: 'FORTE', baseCost: { gold: 80, wood: 100 }, buildSeconds: 20, maxLevel: 3 },
};

export const BUILDING_KINDS: readonly BuildingKind[] = ['cantiere', 'mercato', 'segheria', 'forte'];

/** Costo per portare un edificio dal livello `level` a `level + 1`. */
export function buildingCost(kind: BuildingKind, level: number): Cost {
  const base = BUILDINGS[kind].baseCost;
  return { gold: base.gold * (level + 1), wood: base.wood * (level + 1) };
}

export const VILLAGE = {
  baseHp: 300,
  hpPerForte: 150,
  goldPerSecond: 1,
  goldPerMercato: 1.5,
  woodPerSecond: 0.5,
  woodPerSegheria: 1.5,
  baseDamage: 3,
  damagePerForte: 5,
  range: 5,
  reloadSeconds: 2,
  regenPerSecond: 3,
  regenDelaySeconds: 8,
  /** Distanza minima tra due villaggi (caselle). */
  minDistance: 10,
  /** Distanza entro cui una nave può conquistare un villaggio a 0 PF. */
  conquerRange: 3.5,
  /** PF (frazione del massimo) con cui riparte un villaggio conquistato o fondato. */
  restartHpRatio: 0.3,
  queueMax: 5,
};

export const COMBAT = {
  /** Sotto questa frazione di PF una nave può essere abbordata. */
  captureHpRatio: 0.3,
  boardRange: 1.5,
  repathSeconds: 0.5,
};

export const START_RESOURCES: Cost = { gold: 200, wood: 150 };
