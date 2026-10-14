import type { FactionId } from './factions';
import { mulberry32 } from './rng';
import type { PlayerId } from './state';

/** Le abilità del capitano: ognuna da 1 a 10. */
export const HERO_SKILLS = ['navigazione', 'artiglieria', 'spada', 'comando'] as const;
export type HeroSkill = (typeof HERO_SKILLS)[number];

export const HERO_SKILL_INFO: Record<HeroSkill, { name: string; effect: string }> = {
  navigazione: { name: 'Navigazione', effect: 'velocità della nave su cui è imbarcato' },
  artiglieria: { name: 'Artiglieria', effect: 'danno dei cannoni della sua nave e delle torri della sua città' },
  spada: { name: 'Spada', effect: 'forza negli arrembaggi, in attacco e in difesa' },
  comando: { name: 'Comando', effect: 'forza della guarnigione della città in cui si trova' },
};

export type HeroLocation =
  | { type: 'city'; cityId: number }
  | { type: 'ship'; shipId: number }
  /** Naufragato o in fuga: torna in una città al tick indicato. */
  | { type: 'away'; returnTick: number };

export interface HeroProfile {
  name: string;
  /** Seme del ritratto e delle abilità. */
  seed: number;
  skills: Record<HeroSkill, number>;
  /** Divisa scelta per il ritratto (solo estetica). */
  uniform: number;
}

export interface Hero extends HeroProfile {
  owner: PlayerId;
  xp: number;
  location: HeroLocation;
}

/** Abilità in cui ogni fazione tende a eccellere. */
const FACTION_BIAS: Record<FactionId, Record<HeroSkill, number>> = {
  pirati: { navigazione: 2, artiglieria: 1, spada: 4, comando: 1 },
  inglesi: { navigazione: 2, artiglieria: 4, spada: 1, comando: 2 },
  francesi: { navigazione: 2, artiglieria: 1, spada: 2, comando: 4 },
  spagnoli: { navigazione: 3, artiglieria: 1, spada: 2, comando: 3 },
};

export const HERO = {
  basePoints: 2,
  extraPoints: 12,
  maxSkill: 10,
  xpPerLevel: 3,
  maxLevel: 10,
  /** Secondi prima che un capitano naufragato o fuggito torni in città. */
  returnSeconds: 60,
};

/** Genera un capitano in modo deterministico dal seme. */
export function generateHero(seed: number, faction: FactionId, name: string): HeroProfile {
  const rng = mulberry32(seed);
  const skills = Object.fromEntries(HERO_SKILLS.map((s) => [s, HERO.basePoints])) as Record<HeroSkill, number>;
  const bias = FACTION_BIAS[faction];
  const total = HERO_SKILLS.reduce((n, s) => n + bias[s], 0);
  for (let i = 0; i < HERO.extraPoints; i++) {
    let r = rng() * total;
    for (const s of HERO_SKILLS) {
      r -= bias[s];
      if (r < 0) {
        if (skills[s] < HERO.maxSkill) skills[s]++;
        else i--;
        break;
      }
    }
  }
  return { name, seed, skills, uniform: Math.floor(rng() * 3) };
}

export function heroLevel(h: Hero): number {
  return Math.min(HERO.maxLevel, 1 + Math.floor(h.xp / HERO.xpPerLevel));
}

/** Moltiplicatori che il capitano dà alla nave su cui è imbarcato. */
export function heroShipBonus(h: Hero) {
  const lv = (heroLevel(h) - 1) * 0.02;
  return {
    cannon: 1 + h.skills.artiglieria * 0.04 + lv,
    speed: 1 + h.skills.navigazione * 0.03 + lv / 2,
    boarding: 1 + h.skills.spada * 0.07 + lv,
  };
}

/** Moltiplicatori che il capitano dà alla città in cui si trova. */
export function heroCityBonus(h: Hero) {
  const lv = (heroLevel(h) - 1) * 0.02;
  return {
    defense: 1 + h.skills.comando * 0.06 + lv,
    towers: 1 + h.skills.artiglieria * 0.03 + lv,
  };
}
