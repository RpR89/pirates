import type { FactionId } from '../sim/factions';
import { mulberry32 } from '../sim/rng';
import { shade } from './color';
import { PixelSheet } from './pixels';

const SKINS = ['#f1c9a5', '#e0ac7e', '#c68c5c', '#a86f45', '#7d4e2e', '#5c3820'];
const HAIRS = ['#2a1d14', '#4a2f1c', '#7a4a24', '#b07a3a', '#d8c08a', '#8a8a88', '#c9c4bc', '#6e2a18'];
const EYES = ['#2a3a5a', '#3a5a2a', '#4a3020', '#2a2a2a'];

interface Outfit {
  coat: string;
  trim: string;
  hat: string;
  hatTrim: string;
  style: 'tricorne' | 'bicorne' | 'cappello' | 'bandana';
}

const OUTFITS: Record<FactionId, Outfit[]> = {
  pirati: [
    { coat: '#5a2a2a', trim: '#c9a227', hat: '#1e1c22', hatTrim: '#e8e2d4', style: 'tricorne' },
    { coat: '#2e3a2a', trim: '#b8b0a0', hat: '#8f2f2f', hatTrim: '#e8e2d4', style: 'bandana' },
    { coat: '#3a2a1e', trim: '#c9a227', hat: '#2a2420', hatTrim: '#c9a227', style: 'tricorne' },
  ],
  inglesi: [{ coat: '#1e2a4a', trim: '#e3b23c', hat: '#1a1a22', hatTrim: '#e3b23c', style: 'bicorne' }],
  francesi: [{ coat: '#24448a', trim: '#f2ece0', hat: '#1a1a22', hatTrim: '#e8e2d4', style: 'bicorne' }],
  spagnoli: [{ coat: '#7a1e22', trim: '#e3b23c', hat: '#2a2420', hatTrim: '#e3b23c', style: 'cappello' }],
};

export const PORTRAIT_SIZE = 48;

/** Ritratto in pixel art del capitano, deterministico dal seme. */
export function drawPortrait(seed: number, faction: FactionId, background = '#2c2219'): PixelSheet {
  const rng = mulberry32(seed ^ 0x2f6b);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const S = PORTRAIT_SIZE;
  const s = new PixelSheet(S, S);
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const eye = pick(EYES);
  const outfit = pick(OUTFITS[faction]);
  const beard = rng();
  const pirate = faction === 'pirati';
  const eyepatch = pirate && rng() < 0.4;
  const scar = rng() < (pirate ? 0.5 : 0.15);
  const earring = pirate && rng() < 0.5;
  const longHair = rng() < 0.5;

  s.rect(0, 0, S, S, background);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y) % 7 === 0) s.set(x, y, shade(background, 0.06));

  const cx = 24;
  // Giubba, colletto e bottoni.
  for (let y = 36; y < S; y++) {
    const half = 12 + Math.min(10, (y - 36) * 2);
    for (let x = cx - half; x < cx + half; x++) s.set(x, y, (x + y) % 9 === 0 ? shade(outfit.coat, -0.1) : outfit.coat);
  }
  for (let y = 37; y < S; y++) {
    s.set(cx - 5 - (y - 37) / 2, y, outfit.trim);
    s.set(cx + 4 + (y - 37) / 2, y, outfit.trim);
  }
  s.rect(cx - 3, 36, 6, 6, '#efe8d8'); // camicia
  for (let y = 39; y < S; y += 3) s.set(cx, y, outfit.trim);
  if (faction !== 'pirati') {
    // Spalline da ufficiale.
    s.rect(cx - 16, 37, 6, 3, outfit.trim);
    s.rect(cx + 10, 37, 6, 3, outfit.trim);
  }

  // Collo e testa.
  s.rect(cx - 4, 31, 8, 6, shade(skin, -0.12));
  for (let y = 12; y < 34; y++) {
    const t = (y - 22.5) / 11;
    const half = Math.round(9 * Math.sqrt(Math.max(0, 1 - t * t * (t > 0 ? 1.1 : 0.9))));
    for (let x = cx - half; x < cx + half; x++) s.set(x, y, x > cx + half - 3 ? shade(skin, -0.12) : skin);
  }
  // Orecchie.
  s.rect(cx - 10, 21, 2, 4, shade(skin, -0.1));
  s.rect(cx + 8, 21, 2, 4, shade(skin, -0.1));
  if (earring) s.set(cx - 10, 26, '#e3b23c');

  // Capelli lunghi ai lati.
  if (longHair) {
    s.rect(cx - 11, 14, 3, 16, hair);
    s.rect(cx + 8, 14, 3, 16, hair);
  }
  // Sopracciglia, occhi, naso, bocca.
  s.rect(cx - 6, 19, 4, 1, shade(hair, -0.2));
  s.rect(cx + 2, 19, 4, 1, shade(hair, -0.2));
  s.rect(cx - 5, 21, 2, 2, '#f4f1ea');
  s.set(cx - 4, 21, eye);
  s.set(cx - 4, 22, eye);
  if (eyepatch) {
    s.rect(cx + 2, 20, 4, 4, '#121014');
    s.line(cx - 8, 16, cx + 9, 20, '#121014');
  } else {
    s.rect(cx + 3, 21, 2, 2, '#f4f1ea');
    s.set(cx + 3, 21, eye);
    s.set(cx + 3, 22, eye);
  }
  s.rect(cx - 1, 23, 2, 4, shade(skin, -0.18));
  s.set(cx + 1, 26, shade(skin, -0.25));
  s.rect(cx - 3, 29, 6, 1, '#7a3a2e');
  if (scar) s.line(cx - 7, 23, cx - 5, 28, '#b0564a');

  // Barba e baffi.
  if (beard > 0.66) {
    for (let y = 26; y < 35; y++) {
      const half = 8 - Math.max(0, y - 31) * 2;
      for (let x = cx - half; x < cx + half; x++) if (y > 28 || x < cx - 3 || x > cx + 2) s.set(x, y, (x + y) % 4 === 0 ? shade(hair, 0.15) : hair);
    }
    s.rect(cx - 3, 29, 6, 1, '#5a2a22');
  } else if (beard > 0.33) {
    s.rect(cx - 4, 27, 8, 2, hair);
    s.set(cx - 5, 28, hair);
    s.set(cx + 4, 28, hair);
  }

  // Copricapo.
  const hat = outfit.hat;
  switch (outfit.style) {
    case 'tricorne':
      for (let y = 6; y < 16; y++) {
        const half = 9 + Math.max(0, y - 10) * 2;
        for (let x = cx - half; x < cx + half; x++) s.set(x, y, y >= 13 ? shade(hat, 0.12) : hat);
      }
      s.rect(cx - 15, 14, 30, 2, outfit.hatTrim);
      if (faction === 'pirati') {
        // Teschio sul tricorno.
        s.rect(cx - 2, 8, 4, 3, '#f4f1ea');
        s.set(cx - 1, 9, '#121014');
        s.set(cx + 1, 9, '#121014');
        s.rect(cx - 1, 11, 2, 1, '#f4f1ea');
      }
      break;
    case 'bicorne':
      for (let y = 4; y < 16; y++) {
        const half = Math.round(16 - Math.abs(y - 11) * 1.4);
        for (let x = cx - half; x < cx + half; x++) s.set(x, y, hat);
      }
      s.rect(cx - 15, 14, 30, 1, outfit.hatTrim);
      s.disc(cx - 4, 10, 2.5, faction === 'francesi' ? '#c8283a' : outfit.hatTrim);
      s.disc(cx - 4, 10, 1.2, faction === 'francesi' ? '#f4f1ea' : shade(outfit.hatTrim, -0.3));
      break;
    case 'cappello':
      s.rect(cx - 16, 13, 32, 3, hat);
      for (let y = 5; y < 14; y++) s.rect(cx - 9, y, 18, 1, hat);
      s.rect(cx - 9, 11, 18, 2, outfit.hatTrim);
      // Piuma.
      for (let k = 0; k < 8; k++) s.set(cx + 7 + k, 9 - Math.floor(k / 2), k % 2 ? '#f4f1ea' : '#d8d2c0');
      break;
    case 'bandana':
      for (let y = 9; y < 16; y++) s.rect(cx - 10, y, 20, 1, y % 3 === 0 ? shade(hat, 0.2) : hat);
      for (let k = 0; k < 4; k++) s.rect(cx + 9 + k, 14 + k, 2, 2, hat);
      for (let x = cx - 10; x < cx + 10; x += 4) s.set(x, 12, outfit.hatTrim);
      break;
  }

  s.frame(0, 0, S, S, '#8a6a3e');
  s.frame(1, 1, S - 2, S - 2, '#4a3720');
  return s;
}

/** Ritratto come immagine (data URL) per l'interfaccia. */
export function portraitUrl(seed: number, faction: FactionId): string {
  return drawPortrait(seed, faction).toCanvas().toDataURL();
}
