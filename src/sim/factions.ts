// Le quattro fazioni giocabili: nomi, colori, bonus e nomi propri di navi e città.

export type FactionId = 'pirati' | 'inglesi' | 'francesi' | 'spagnoli';

export interface Faction {
  id: FactionId;
  name: string;
  /** Nome breve del capo, per l'IA. */
  leader: string;
  soldiers: string;
  sailors: string;
  description: string;
  bonus: string;
  colors: {
    flag: string;
    flagDetail: string;
    sail: string;
    sailShade: string;
    hull: string;
    hullStripe: string;
    roof: string;
    roofShade: string;
    wall: string;
  };
  modifiers: {
    boarding: number; // forza nell'abbordaggio
    soldierPower: number; // forza dei soldati negli assalti
    cannonDamage: number;
    shipHp: number;
    shipSpeed: number;
    goldIncome: number;
    smallShipCost: number; // sloop e brigantino
  };
  shipNames: string[];
  cityNames: string[];
}

const NEUTRAL_MODS: Faction['modifiers'] = {
  boarding: 1,
  soldierPower: 1,
  cannonDamage: 1,
  shipHp: 1,
  shipSpeed: 1,
  goldIncome: 1,
  smallShipCost: 1,
};

export const FACTIONS: Record<FactionId, Faction> = {
  pirati: {
    id: 'pirati',
    name: 'Fratellanza della Costa',
    leader: 'Barbanera',
    soldiers: 'Filibustieri',
    sailors: 'Ciurma',
    description: 'Fuorilegge senza bandiera: navi agili, arrembaggi feroci.',
    bonus: 'Abbordaggio +40%, sloop e brigantini costano il 20% in meno',
    colors: {
      flag: '#1a1c2c', flagDetail: '#f4f4f4', sail: '#3a3f4f', sailShade: '#2a2d3a',
      hull: '#5b3a24', hullStripe: '#8f2f2f', roof: '#6b4a2e', roofShade: '#4e3520', wall: '#a7825a',
    },
    modifiers: { ...NEUTRAL_MODS, boarding: 1.4, smallShipCost: 0.8 },
    shipNames: [
      'Vendetta Nera', "Teschio d'Oro", 'Squalo Rosso', 'Corvo dei Mari', 'Fortuna Ribelle',
      'Lama Insanguinata', 'Spettro del Sud', 'Sirena Dannata', 'Tempesta', 'Re dei Mari',
      'Diavolo Rosso', 'Rum e Polvere', 'Ancora Maledetta', 'Gabbiano Nero', 'Furia',
      'Marea Rossa', 'Medusa', 'Kraken', 'Scorpione', 'Sciabola', 'Avvoltoio', 'Uragano',
    ],
    cityNames: ['Tortuga', 'Nassau', 'Isola del Teschio', 'Baia dei Relitti', 'Covo del Corvo', 'Porto Libero'],
  },
  inglesi: {
    id: 'inglesi',
    name: 'Royal Navy',
    leader: 'Ammiraglio Nelson',
    soldiers: 'Royal Marines',
    sailors: 'Marinai',
    description: 'La flotta più disciplinata del mondo, maestra nel cannoneggiamento.',
    bonus: 'Danno dei cannoni +20%, scafi +10%',
    colors: {
      flag: '#b8283a', flagDetail: '#f4f4f4', sail: '#f2efe6', sailShade: '#cfc9b8',
      hull: '#26232b', hullStripe: '#e3b23c', roof: '#5a6170', roofShade: '#434957', wall: '#a24b3b',
    },
    modifiers: { ...NEUTRAL_MODS, cannonDamage: 1.2, shipHp: 1.1 },
    shipNames: [
      'HMS Victory', 'HMS Dauntless', 'HMS Valiant', 'HMS Resolute', 'HMS Indomitable',
      'HMS Defiance', 'HMS Intrepid', 'HMS Thunderer', 'HMS Bellerophon', 'HMS Agamemnon',
      'HMS Swiftsure', 'HMS Vanguard', 'HMS Royal Oak', 'HMS Endeavour', 'HMS Revenge',
      'HMS Lion', 'HMS Neptune', 'HMS Ajax', 'HMS Orion', 'HMS Mars', 'HMS Temeraire', 'HMS Conqueror',
    ],
    cityNames: ['Port Royal', 'Kingston', 'Bridgetown', 'Saint John', 'Georgetown', 'Falmouth'],
  },
  francesi: {
    id: 'francesi',
    name: 'Marine Royale',
    leader: 'Ammiraglio de Grasse',
    soldiers: 'Fusiliers Marins',
    sailors: 'Matelots',
    description: 'Navi eleganti e velocissime, progettate dai migliori ingegneri.',
    bonus: 'Velocità delle navi +15%',
    colors: {
      flag: '#2b4ea2', flagDetail: '#f4f4f4', sail: '#f4f1e8', sailShade: '#d2ccbb',
      hull: '#2c3f6b', hullStripe: '#d9c27a', roof: '#4f6a8f', roofShade: '#3b5272', wall: '#e8dcc0',
    },
    modifiers: { ...NEUTRAL_MODS, shipSpeed: 1.15 },
    shipNames: [
      'Le Redoutable', "L'Intrépide", 'Le Triomphant', 'La Gloire', 'Le Fougueux',
      "L'Aigle", 'Le Héros', 'La Belle Poule', 'Le Formidable', 'Le Vengeur',
      "L'Orient", 'Le Superbe', 'La Sirène', 'Le Terrible', 'La Licorne',
      'Le Neptune', 'Le Bucentaure', "L'Audacieux", 'Le Glorieux', 'La Résolue', 'Le Soleil Royal', "L'Achille",
    ],
    cityNames: ['Port-au-Prince', 'Fort-de-France', 'Basse-Terre', 'Saint-Pierre', 'Cap-Français', 'Fort-Royal'],
  },
  spagnoli: {
    id: 'spagnoli',
    name: 'Armada Española',
    leader: 'Almirante Gravina',
    soldiers: 'Infantería de Marina',
    sailors: 'Marineros',
    description: "Padroni delle miniere del Nuovo Mondo e dei tercios più temuti.",
    bonus: 'Oro +25%, soldati +15% negli assalti',
    colors: {
      flag: '#c8a227', flagDetail: '#a3242f', sail: '#efe8d5', sailShade: '#cbc0a3',
      hull: '#6b2a22', hullStripe: '#d6a64a', roof: '#b5532f', roofShade: '#8e3f22', wall: '#efe6d4',
    },
    modifiers: { ...NEUTRAL_MODS, goldIncome: 1.25, soldierPower: 1.15 },
    shipNames: [
      'Santísima Trinidad', 'San Juan Nepomuceno', 'Nuestra Señora de Atocha', 'San Ildefonso',
      'Príncipe de Asturias', 'Santa Ana', 'San Felipe', 'Neptuno', 'Rayo', 'Bahama', 'Monarca',
      'Argonauta', 'San Agustín', 'Santa María', 'San Justo', 'Montañés', 'San Leandro',
      'Castilla', 'Galicia', 'Concepción', 'San Francisco de Asís', 'Real Carlos',
    ],
    cityNames: ['Santo Domingo', 'Cartagena', 'San Juan', 'La Habana', 'Portobelo', 'Veracruz'],
  },
};

export const FACTION_IDS: readonly FactionId[] = ['pirati', 'inglesi', 'francesi', 'spagnoli'];

/** Aspetto dei villaggi neutrali (coloni indipendenti). */
export const NEUTRAL_LOOK = {
  name: 'Coloni indipendenti',
  colors: {
    flag: '#7a8a6a', flagDetail: '#e8e0c8', sail: '#e8e0c8', sailShade: '#c8bea2',
    hull: '#6b4a2e', hullStripe: '#8a6a40', roof: '#c9a85a', roofShade: '#a8883f', wall: '#d8c6a0',
  },
  modifiers: NEUTRAL_MODS,
};

export const NEUTRAL_CITY_NAMES = [
  'San Rocco', 'Isola Verde', 'Punta Corvo', 'Cala Rossa', 'Rocca Salata', 'Porto Zaffiro',
  'Capo Tempesta', 'Baia Serena', 'Punta Argento', 'Isola Perduta', 'Porto Fantasma', 'Isola del Rum',
];

/** Massima lunghezza del nome di una nave. */
export const MAX_NAME_LENGTH = 28;

/** Pulisce un nome scritto dal giocatore; null se non valido. */
export function sanitizeName(raw: string): string | null {
  const cleaned = raw
    .replace(/[^\p{L}\p{N} '.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length >= 1 ? cleaned : null;
}
