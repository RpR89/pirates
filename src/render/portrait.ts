import type { FactionId } from '../sim/factions';
import { mulberry32 } from '../sim/rng';
import { shade } from './color';
import { PixelSheet } from './pixels';

export const PORTRAIT_SIZE = 96;

type Hat = 'bicorne' | 'tricorne' | 'bandana' | 'feather';
type Shirt = 'jabot' | 'open' | 'striped';

export interface Uniform {
  name: string;
  coat: string;
  facing: string; // risvolti e colletto
  lace: string; // galloni e bottoni
  waistcoat: string;
  shirt: Shirt;
  epaulettes: 0 | 1 | 2;
  sash?: string;
  crossbelt?: string;
  medal?: boolean;
  hat: Hat;
  hatColor: string;
  hatTrim: string;
  cockade?: string;
  skull?: boolean;
  powdered?: boolean; // parrucca incipriata
  background: string;
}

/** Divise disponibili per ogni fazione (ispirate a quelle del Settecento). */
export const UNIFORMS: Record<FactionId, Uniform[]> = {
  inglesi: [
    { name: 'Capitano di vascello', coat: '#1c2a4e', facing: '#f2efe6', lace: '#e3b23c', waistcoat: '#f2efe6', shirt: 'jabot', epaulettes: 1, hat: 'bicorne', hatColor: '#15151c', hatTrim: '#e3b23c', cockade: '#15151c', powdered: true, background: '#2a3550' },
    { name: 'Ufficiale dei Royal Marines', coat: '#b3242c', facing: '#f2efe6', lace: '#e3b23c', waistcoat: '#f2efe6', shirt: 'jabot', epaulettes: 1, crossbelt: '#f2efe6', hat: 'tricorne', hatColor: '#15151c', hatTrim: '#f2efe6', cockade: '#15151c', background: '#4a2a2a' },
    { name: 'Ammiraglio', coat: '#16213f', facing: '#16213f', lace: '#f0c64a', waistcoat: '#f2efe6', shirt: 'jabot', epaulettes: 2, medal: true, hat: 'bicorne', hatColor: '#15151c', hatTrim: '#f0c64a', cockade: '#15151c', powdered: true, background: '#26304a' },
  ],
  francesi: [
    { name: 'Capitaine de vaisseau', coat: '#22408a', facing: '#c8283a', lace: '#e3b23c', waistcoat: '#c8283a', shirt: 'jabot', epaulettes: 1, hat: 'bicorne', hatColor: '#15151c', hatTrim: '#e3b23c', cockade: '#f4f1ea', powdered: true, background: '#26355a' },
    { name: 'Fusilier marin', coat: '#2a4a96', facing: '#f2efe6', lace: '#d8d2c0', waistcoat: '#f2efe6', shirt: 'jabot', epaulettes: 0, crossbelt: '#f2efe6', hat: 'tricorne', hatColor: '#15151c', hatTrim: '#f2efe6', cockade: '#f4f1ea', background: '#2a3a5a' },
    { name: 'Amiral', coat: '#1e3576', facing: '#1e3576', lace: '#f0c64a', waistcoat: '#c8283a', shirt: 'jabot', epaulettes: 2, sash: '#5aa0e0', medal: true, hat: 'bicorne', hatColor: '#15151c', hatTrim: '#f0c64a', cockade: '#f4f1ea', powdered: true, background: '#243055' },
  ],
  spagnoli: [
    { name: 'Capitán de navío', coat: '#1f2c56', facing: '#b3242c', lace: '#e3b23c', waistcoat: '#b3242c', shirt: 'jabot', epaulettes: 1, sash: '#b3242c', hat: 'tricorne', hatColor: '#15151c', hatTrim: '#e3b23c', cockade: '#b3242c', background: '#3a2a3a' },
    { name: 'Infantería de Marina', coat: '#24346a', facing: '#b3242c', lace: '#d8d2c0', waistcoat: '#b3242c', shirt: 'jabot', epaulettes: 0, crossbelt: '#e8e0cc', hat: 'tricorne', hatColor: '#15151c', hatTrim: '#e8e0cc', cockade: '#b3242c', background: '#2f2a44' },
    { name: 'Almirante', coat: '#1a2448', facing: '#b3242c', lace: '#f0c64a', waistcoat: '#b3242c', shirt: 'jabot', epaulettes: 2, sash: '#b3242c', medal: true, hat: 'bicorne', hatColor: '#15151c', hatTrim: '#f0c64a', cockade: '#b3242c', background: '#382638' },
  ],
  pirati: [
    { name: 'Capitano corsaro', coat: '#7a2420', facing: '#5a1a18', lace: '#e3b23c', waistcoat: '#2a2420', shirt: 'open', epaulettes: 0, crossbelt: '#3a2a1e', hat: 'tricorne', hatColor: '#1e1c22', hatTrim: '#e3b23c', skull: true, background: '#2e2622' },
    { name: 'Filibustiere', coat: '#5a3a24', facing: '#4a2e1c', lace: '#b8b0a0', waistcoat: '#3a2a1e', shirt: 'striped', epaulettes: 0, crossbelt: '#2a2420', hat: 'bandana', hatColor: '#9e2a2a', hatTrim: '#f2efe6', background: '#2a2a26' },
    { name: 'Gentiluomo di ventura', coat: '#1e1c22', facing: '#2e2a32', lace: '#c9c4bc', waistcoat: '#7a2420', shirt: 'jabot', epaulettes: 0, sash: '#7a2420', hat: 'feather', hatColor: '#1e1c22', hatTrim: '#c9c4bc', background: '#26222a' },
  ],
};

const SKINS = ['#f3cfac', '#e5b48a', '#cc9566', '#b07648', '#875332', '#613b22'];
const HAIRS = ['#2a1d14', '#4a2f1c', '#7a4a24', '#a8743a', '#d8c08a', '#6e2a18', '#3a3530'];
const EYES = ['#2a3a5a', '#3a5a2a', '#4a3020', '#2a2a2a', '#4a6a8a'];

/** Ritratto del capitano, deterministico dal seme e dalla divisa scelta. */
export function drawPortrait(seed: number, faction: FactionId, uniformIndex = 0): PixelSheet {
  const rng = mulberry32(seed ^ 0x2f6b);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const S = PORTRAIT_SIZE;
  const s = new PixelSheet(S, S);
  const uni = UNIFORMS[faction][((uniformIndex % 3) + 3) % 3];
  const skin = pick(SKINS);
  const skinDark = shade(skin, -0.16);
  const skinLight = shade(skin, 0.12);
  const hair = uni.powdered && rng() < 0.75 ? '#e6e2da' : pick(HAIRS);
  const eye = pick(EYES);
  const beard = rng();
  const pirate = faction === 'pirati';
  const eyepatch = pirate && rng() < 0.35;
  const scar = rng() < (pirate ? 0.5 : 0.15);
  const earring = pirate && rng() < 0.6;
  const moustache = rng() < 0.5;
  const cx = 48;

  // Sfondo con vignettatura.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - 40) / 70;
      s.set(x, y, shade(uni.background, 0.12 - d * 0.35));
    }
  }

  // ---- Busto: giubba, risvolti, panciotto, camicia.
  const shoulderY = 70;
  for (let y = shoulderY; y < S; y++) {
    const half = Math.min(46, 22 + (y - shoulderY) * 2.2);
    for (let x = Math.round(cx - half); x < cx + half; x++) {
      const side = (x - cx) / half;
      s.set(x, y, side > 0.55 ? shade(uni.coat, -0.18) : side < -0.7 ? shade(uni.coat, 0.08) : uni.coat);
    }
  }
  // Panciotto e camicia al centro.
  for (let y = shoulderY + 2; y < S; y++) {
    const half = 9 + (y - shoulderY) * 0.35;
    for (let x = Math.round(cx - half); x < cx + half; x++) s.set(x, y, uni.waistcoat);
  }
  if (uni.shirt === 'open') {
    for (let y = shoulderY; y < S; y++) {
      const half = Math.max(2, 9 - (y - shoulderY) * 0.35);
      for (let x = Math.round(cx - half); x < cx + half; x++) s.set(x, y, y < shoulderY + 6 ? skinDark : '#efe8d8');
    }
    s.rect(cx - 7, shoulderY - 1, 14, 6, skin);
  } else if (uni.shirt === 'striped') {
    for (let y = shoulderY; y < S; y++) {
      const half = 10 + (y - shoulderY) * 0.3;
      for (let x = Math.round(cx - half); x < cx + half; x++) s.set(x, y, Math.floor(y / 3) % 2 ? '#efe8d8' : '#3a5a9a');
    }
  } else {
    // Jabot di pizzo.
    for (let y = shoulderY - 2; y < shoulderY + 14; y++) {
      const half = 5 - Math.abs(y - (shoulderY + 4)) * 0.3;
      for (let x = Math.round(cx - half); x < cx + half; x++) s.set(x, y, (x + y) % 3 === 0 ? '#d8d2c4' : '#f4f1ea');
    }
  }
  // Risvolti (revers) colorati con gallone.
  for (let y = shoulderY; y < S; y++) {
    const t = y - shoulderY;
    const inner = 10 + t * 0.35;
    const outer = inner + Math.max(4, 9 - t * 0.12);
    for (const dir of [-1, 1]) {
      for (let x = inner; x < outer; x++) s.set(cx + dir * x - (dir < 0 ? 1 : 0), y, uni.facing);
      s.set(cx + dir * Math.round(outer) - (dir < 0 ? 1 : 0), y, uni.lace);
      if (t % 6 === 3) s.rect(cx + dir * Math.round(inner + 2) - (dir < 0 ? 2 : 0), y, 2, 2, uni.lace); // bottoni
    }
  }
  // Colletto.
  s.rect(cx - 14, shoulderY - 3, 9, 5, uni.facing);
  s.rect(cx + 5, shoulderY - 3, 9, 5, uni.facing);
  // Spalline con frange.
  const epaulette = (x: number) => {
    s.rect(x, shoulderY + 1, 14, 5, uni.lace);
    s.rect(x, shoulderY + 1, 14, 1, shade(uni.lace, 0.3));
    for (let i = 0; i < 14; i += 2) s.rect(x + i, shoulderY + 6, 1, 5, shade(uni.lace, -0.15));
  };
  if (uni.epaulettes >= 1) epaulette(cx + 22);
  if (uni.epaulettes >= 2) epaulette(cx - 36);
  // Fascia, bandoliera, medaglia.
  if (uni.sash) {
    for (let y = shoulderY + 6; y < S; y++) {
      const x = cx - 26 + (y - shoulderY - 6) * 1.6;
      s.rect(Math.round(x), y, 7, 1, (y % 4 === 0) ? shade(uni.sash, -0.15) : uni.sash);
    }
  }
  if (uni.crossbelt) {
    for (let y = shoulderY + 2; y < S; y++) {
      const x = cx + 24 - (y - shoulderY - 2) * 1.7;
      s.rect(Math.round(x), y, 5, 1, uni.crossbelt);
    }
  }
  if (uni.medal) {
    s.disc(cx - 18, shoulderY + 14, 3, '#f0c64a');
    s.disc(cx - 18, shoulderY + 14, 1.5, '#c8283a');
    s.rect(cx - 19, shoulderY + 8, 2, 4, '#5aa0e0');
  }

  // ---- Collo e testa.
  s.rect(cx - 7, 60, 14, 12, skinDark);
  s.rect(cx - 7, 60, 4, 12, shade(skinDark, -0.08));
  const headTop = 24;
  const headBottom = 66;
  for (let y = headTop; y < headBottom; y++) {
    const t = (y - (headTop + headBottom) / 2) / ((headBottom - headTop) / 2);
    const half = Math.round(17 * Math.sqrt(Math.max(0, 1 - t * t * (t > 0 ? 1.15 : 0.85))));
    for (let x = cx - half; x < cx + half; x++) {
      const rel = (x - cx) / Math.max(1, half);
      s.set(x, y, rel > 0.62 ? skinDark : rel < -0.75 ? skinLight : skin);
    }
  }
  // Guance e mento.
  s.disc(cx - 9, 50, 3, shade(skin, -0.04));
  s.disc(cx + 9, 50, 3, shade(skin, -0.08));
  s.rect(cx - 5, 62, 10, 2, skinDark);
  // Orecchie.
  for (const dir of [-1, 1]) {
    s.disc(cx + dir * 17, 44, 3.5, skinDark);
    s.disc(cx + dir * 17, 44, 1.5, shade(skinDark, -0.15));
  }
  if (earring) s.disc(cx - 17, 49, 1.6, '#f0c64a');

  // Capelli: codino legato o lunghi sciolti.
  if (uni.powdered || rng() < 0.5) {
    for (const dir of [-1, 1]) {
      s.rect(cx + dir * 17 - (dir < 0 ? 5 : 0), 30, 5, 12, hair);
      s.disc(cx + dir * 19, 40, 3, hair); // boccoli
    }
  } else {
    for (const dir of [-1, 1]) s.rect(cx + dir * 17 - (dir < 0 ? 5 : 0), 30, 5, 30, hair);
  }

  // Occhi, sopracciglia, naso, bocca.
  const browY = 38;
  for (const dir of [-1, 1]) {
    s.rect(cx + dir * 8 - (dir < 0 ? 6 : 0) + (dir > 0 ? 1 : 0), browY, 6, 2, uni.powdered && hair === '#e6e2da' ? '#7a6a5a' : shade(hair, -0.2));
  }
  const eyeAt = (x: number) => {
    s.rect(x, 42, 6, 3, '#f4f1ea');
    s.rect(x + 2, 42, 3, 3, eye);
    s.rect(x + 3, 43, 1, 1, '#121014');
    s.rect(x, 41, 6, 1, shade(skin, -0.3));
  };
  eyeAt(cx - 13);
  if (eyepatch) {
    s.rect(cx + 6, 40, 8, 7, '#121014');
    s.line(cx - 17, 32, cx + 17, 40, '#121014');
    s.line(cx - 17, 33, cx + 17, 41, '#121014');
  } else eyeAt(cx + 7);
  for (let y = 44; y < 54; y++) s.rect(cx - 1 + Math.floor((y - 44) / 6), y, 3, 1, y > 50 ? skinDark : shade(skin, -0.08));
  s.rect(cx - 3, 53, 7, 2, skinDark);
  s.rect(cx - 5, 58, 10, 2, '#8a3a2e');
  s.rect(cx - 4, 59, 8, 1, '#b05a4a');
  if (scar) {
    s.line(cx - 14, 46, cx - 10, 56, '#b0564a');
    s.line(cx - 13, 46, cx - 9, 56, shade('#b0564a', 0.2));
  }

  // Barba e baffi.
  const beardColor = uni.powdered && hair === '#e6e2da' ? '#7a6a5a' : hair;
  if (beard > 0.62) {
    for (let y = 52; y < 70; y++) {
      const half = 15 - Math.max(0, y - 60) * 1.6;
      for (let x = Math.round(cx - half); x < cx + half; x++) {
        if (y < 57 && Math.abs(x - cx) < 6) continue;
        if (y >= 57 && y <= 60 && Math.abs(x - cx) < 5) continue;
        s.set(x, y, (x * 3 + y) % 7 === 0 ? shade(beardColor, 0.18) : beardColor);
      }
    }
  } else if (moustache || beard > 0.3) {
    for (let x = -8; x <= 8; x++) s.rect(cx + x, 56 + Math.round(Math.abs(x) / 4), 1, 2, beardColor);
  }

  // ---- Cappello.
  const hat = uni.hatColor;
  switch (uni.hat) {
    case 'bicorne':
      for (let y = 8; y < 33; y++) {
        const half = Math.round(34 - Math.abs(y - 23) * 2.1);
        for (let x = cx - half; x < cx + half; x++) s.set(x, y, y > 28 ? shade(hat, 0.15) : hat);
      }
      for (let x = -32; x < 32; x++) s.set(cx + x, 30 - Math.round(Math.abs(x) / 9), uni.hatTrim);
      for (let x = -32; x < 32; x++) s.set(cx + x, 31 - Math.round(Math.abs(x) / 9), uni.hatTrim);
      if (uni.cockade) {
        s.disc(cx - 10, 20, 5, uni.cockade);
        s.disc(cx - 10, 20, 2.5, shade(uni.cockade, uni.cockade === '#15151c' ? 0.25 : -0.15));
        s.rect(cx - 11, 14, 2, 12, uni.hatTrim);
      }
      break;
    case 'tricorne':
      for (let y = 12; y < 32; y++) {
        const half = Math.round(18 + Math.max(0, y - 20) * 1.4);
        for (let x = cx - half; x < cx + half; x++) s.set(x, y, y >= 28 ? shade(hat, 0.18) : hat);
      }
      s.rect(cx - 33, 28, 66, 2, uni.hatTrim);
      s.rect(cx - 30, 30, 60, 2, shade(hat, 0.1));
      if (uni.cockade) s.disc(cx + 18, 24, 4, uni.cockade);
      if (uni.skull) {
        s.disc(cx, 19, 4, '#f4f1ea');
        s.rect(cx - 3, 22, 6, 3, '#f4f1ea');
        s.rect(cx - 2, 18, 1, 2, '#121014');
        s.rect(cx + 1, 18, 1, 2, '#121014');
        s.line(cx - 6, 26, cx + 6, 30, '#f4f1ea');
        s.line(cx + 6, 26, cx - 6, 30, '#f4f1ea');
      }
      break;
    case 'bandana':
      for (let y = 18; y < 33; y++) {
        const half = Math.round(18 - Math.max(0, 22 - y) * 1.2);
        for (let x = cx - half; x < cx + half; x++) s.set(x, y, (x + y) % 9 === 0 ? uni.hatTrim : (y % 4 === 0 ? shade(hat, 0.15) : hat));
      }
      for (let k = 0; k < 8; k++) s.rect(cx + 16 + k, 28 + k, 4, 3, hat);
      break;
    case 'feather':
      s.rect(cx - 36, 26, 72, 6, hat);
      s.rect(cx - 36, 26, 72, 1, shade(hat, 0.2));
      for (let y = 8; y < 27; y++) s.rect(cx - 17, y, 34, 1, hat);
      s.rect(cx - 17, 22, 34, 4, uni.hatTrim);
      // Piuma.
      for (let k = 0; k < 30; k++) {
        const x = cx + 6 + k;
        const y = 20 - Math.round(Math.sin((k / 30) * Math.PI) * 14);
        s.rect(x, y, 1, 4, k % 3 ? '#f4f1ea' : '#d8d2c0');
      }
      break;
  }

  s.frame(0, 0, S, S, '#8a6a3e');
  s.frame(1, 1, S - 2, S - 2, '#c9a35a');
  s.frame(2, 2, S - 4, S - 4, '#4a3720');
  return s;
}

const cache = new Map<string, string>();

/** Ritratto come immagine (data URL) per l'interfaccia. */
export function portraitUrl(seed: number, faction: FactionId, uniform = 0): string {
  const key = `${seed}-${faction}-${uniform}`;
  let url = cache.get(key);
  if (!url) {
    url = drawPortrait(seed, faction, uniform).toCanvas().toDataURL();
    cache.set(key, url);
  }
  return url;
}
