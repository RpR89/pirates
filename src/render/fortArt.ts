import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import type { LookColors } from './shipArt';
import { CELL_PX, TILE_PX } from './terrain';

/** Scala rispetto al disegno di riferimento a 16 px per casella. */
const K = TILE_PX / 16;
const u = (v: number) => Math.max(1, Math.round(v * K));
const FINE = Math.max(3, Math.round(K * 0.9));
const LINE_W = Math.max(1, Math.round(K / 3));

const OUTLINE = '#1e1a16';
const STONE = '#aaa497';
const STONE_DARK = '#7d776c';
const STONE_LIGHT = '#c4beb1';
const EARTH = '#8a6a40';
const EARTH_DARK = '#6a4e2c';
const GRASS = '#5f9e44';
const GRASS_DARK = '#4a8436';
const WOOD = '#9a6a3c';
const WOOD_DARK = '#6e4a28';
const IRON = '#2a2a2e';

/** Direzioni delle giunzioni a linea: N, NE, E, SE, S, SO, O, NO (bit 0..7). */
export const LINE_DIRS: readonly [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/** Distanza dal "nastro" di una difesa a linea e posizione lungo il tratto più vicino. */
function band(mask: number): (x: number, y: number) => { d: number; t: number } {
  const T = CELL_PX;
  const cx = T / 2;
  const cy = T / 2;
  const segs: [number, number][] = [];
  LINE_DIRS.forEach(([dx, dy], i) => {
    if (mask & (1 << i)) segs.push([cx + dx * T * 0.5, cy + dy * T * 0.5]);
  });
  return (x, y) => {
    let best = { d: Math.hypot(x - cx, y - cy) - (segs.length === 0 || segs.length > 2 ? u(1) : 0), t: 0 };
    for (const [ex, ey] of segs) {
      const vx = ex - cx;
      const vy = ey - cy;
      const len2 = vx * vx + vy * vy;
      const t = Math.max(0, Math.min(1, ((x - cx) * vx + (y - cy) * vy) / len2));
      const d = Math.hypot(x - (cx + vx * t), y - (cy + vy * t));
      if (d < best.d) best = { d, t: t * Math.sqrt(len2) };
    }
    return best;
  };
}

/** Terrapieno: argine erboso con la palizzata in cima. */
export function drawEarthwork(mask: number, overhang: number): PixelSheet {
  const s = new PixelSheet(CELL_PX, CELL_PX + overhang);
  earthwork(s, overhang, mask, overhang);
  s.outline(OUTLINE, LINE_W);
  return s;
}

/** Disegna il terrapieno su un foglio esistente; l'impronta inizia a `fy`, il dorso sale di `face`. */
export function earthwork(s: PixelSheet, fy: number, mask: number, face: number) {
  const T = CELL_PX;
  const sample = band(mask);
  const half = u(2);
  const top = fy - face;
  const post = u(1.3);
  // Scarpata esterna (verso sud) in terra battuta.
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      for (let j = 1; j <= face; j++) {
        if (sample(x + 0.5, y - j + 0.5).d <= half) {
          s.set(x, top + y + face, hash2(x, y + j, 3) % 5 === 0 ? EARTH : EARTH_DARK);
          break;
        }
      }
    }
  }
  // Dorso erboso, più chiaro al centro.
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const { d } = sample(x + 0.5, y + 0.5);
      if (d > half) continue;
      const edge = d > half - u(0.6);
      const n = hash2(x, y, 9);
      s.set(x, top + y, edge ? (n % 3 ? EARTH : EARTH_DARK) : n % 7 === 0 ? GRASS_DARK : d < half * 0.4 ? shade(GRASS, 0.08) : GRASS);
    }
  }
  // Palizzata: pali appuntiti lungo il centro del nastro.
  const step = Math.max(3, u(1.3));
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const { d, t } = sample(x + 0.5, y + 0.5);
      if (d < LINE_W + 0.5 && Math.round(t) % step === 0) {
        s.rect(x - Math.floor(LINE_W / 2), top + y - post, LINE_W + 1, post, WOOD_DARK);
        s.set(x, top + y - post, shade(WOOD, 0.3));
      }
    }
  }
}

/** Fossato: canale d'acqua con sponde fangose, un po' incassato nel terreno. */
export function drawMoat(mask: number): PixelSheet {
  const T = CELL_PX;
  const s = new PixelSheet(T, T);
  const sample = band(mask);
  const half = u(1.8);
  const bankW = u(0.7);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const { d } = sample(x + 0.5, y + 0.5);
      if (d > half) continue;
      const bank = d > half - bankW;
      const n = hash2(x, y, 5);
      let c: string;
      if (bank) c = n % 4 === 0 ? '#5a4428' : '#735634';
      else {
        const depth = 1 - d / (half - bankW);
        c = depth > 0.55 ? '#2a5a6e' : depth > 0.25 ? '#33707e' : '#3f8590';
        if (n % 37 === 0) c = '#6aaab0';
      }
      // L'argine nord fa ombra sull'acqua.
      if (!bank && sample(x + 0.5, y - u(0.8) + 0.5).d > half - bankW) c = shade(c, -0.25);
      s.set(x, y, c);
    }
  }
  s.outline('#3a2c1a', LINE_W);
  return s;
}

function flag(s: PixelSheet, x: number, y: number, c: LookColors, height: number) {
  s.rect(x, y, LINE_W, height, '#3b2f22');
  const fw = u(6);
  const fh = u(4);
  for (let i = 0; i < fw; i++) {
    const off = Math.round(Math.sin((i / fw) * Math.PI * 1.5) * K * 0.4);
    for (let j = 0; j < fh; j++) {
      const inner = i > fw * 0.3 && i < fw * 0.7 && j > fh * 0.25 && j < fh * 0.75;
      s.set(x + LINE_W + i, y + j + off, inner ? c.flagDetail : c.flag);
    }
  }
}

/** Cannone visto dall'alto su affusto di legno, con la bocca verso l'alto. */
function cannon(s: PixelSheet, x: number, y: number, len = 7) {
  s.rect(x - u(1.6), y + u(len - 3), u(3.2), u(3.5), WOOD_DARK); // affusto
  s.rect(x - u(1.6), y + u(len - 3), u(3.2), LINE_W, WOOD);
  s.disc(x - u(1.9), y + u(len - 1), u(0.9), '#3a2a1a'); // ruote
  s.disc(x + u(1.9), y + u(len - 1), u(0.9), '#3a2a1a');
  s.rect(x - u(0.8), y, u(1.6), u(len), IRON); // canna
  s.rect(x - u(0.8), y, LINE_W, u(len), '#4a4a52');
  s.disc(x, y + u(len) - u(0.2), u(1.1), IRON);
  s.rect(x - u(1), y, u(2), u(0.6), '#1a1a1e'); // bocca
}

function stoneFill(s: PixelSheet, x: number, y: number, light = false) {
  const row = Math.floor(y / FINE);
  const joint = y % FINE === 0 || (x + (row % 2) * FINE) % (FINE * 2) === 0;
  const base = light ? STONE_LIGHT : STONE;
  s.set(x, y, joint ? STONE_DARK : hash2(x, y, 6) % 7 === 0 ? shade(base, 0.06) : base);
}

/**
 * Bastione a punta di freccia visto dall'alto, con la punta verso l'alto:
 * parapetto in pietra, terrapieno interno, cannoni sulle due facce e garitta.
 * `dir` ruota la punta: 0 nord, 1 est, 2 sud, 3 ovest.
 */
export function drawBastion(c: LookColors, dir: number): PixelSheet {
  const N = TILE_PX * 2;
  const s = new PixelSheet(N, N);
  const cx = N / 2;
  const shoulder = N * 0.42; // dove i fianchi diventano facce
  const inside = (x: number, y: number, inset: number) => {
    if (y > N - 1 - inset || y < inset * 1.6) return false;
    if (x < inset || x > N - 1 - inset) return false;
    if (y >= shoulder) return true;
    const half = ((N / 2 - inset) * (y - inset * 1.6)) / (shoulder - inset * 1.6);
    return Math.abs(x + 0.5 - cx) <= half;
  };
  const rim = u(2.4);
  // Ombra.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x - u(1.2), y - u(1.6), u(1))) s.set(x, y, '#000000', 0.22);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!inside(x, y, u(1))) continue;
      if (!inside(x, y, u(1) + rim)) stoneFill(s, x, y, (x + y) % 2 === 0 && y < shoulder);
      else if (!inside(x, y, u(1) + rim + LINE_W * 2)) s.set(x, y, STONE_DARK);
      else s.set(x, y, hash2(x, y, 11) % 6 === 0 ? EARTH : '#9a7a4e');
    }
  }
  // Cannoniere e cannoni sulle due facce.
  for (const side of [-1, 1]) {
    for (const f of [0.35, 0.7]) {
      const y = Math.round(u(4) + (shoulder - u(4)) * f);
      const x = Math.round(cx + side * (N / 2 - u(1)) * ((y - u(1.6)) / shoulder) * 0.82);
      s.rect(x - u(1), y - u(1.4), u(2), u(1.4), STONE_DARK); // feritoia
      cannon(s, x, y - u(0.6), 6);
    }
  }
  // Cannone di punta e garitta.
  cannon(s, Math.floor(cx), u(7), 6);
  s.disc(cx, u(4.8), u(1.8), STONE_LIGHT);
  s.disc(cx, u(4.8), u(1.1), STONE_DARK);
  // Palle e polvere sul terrapieno.
  for (let k = 0; k < 6; k++) s.disc(cx - u(4) + (k % 3) * u(1.1), N - u(6) - Math.floor(k / 3) * u(1), u(0.5), IRON);
  s.disc(cx + u(4), N - u(6), u(1.4), WOOD);
  flag(s, Math.floor(cx) + u(5), N - u(14), c, u(9));
  s.outline(OUTLINE, LINE_W);
  return s.rotated(dir);
}

/**
 * Batteria costiera vista dall'alto, puntata verso l'alto (il mare): parapetto di
 * gabbioni, tre cannoni pesanti, polveriera e piramidi di palle.
 */
export function drawBattery(c: LookColors, dir: number): PixelSheet {
  const N = TILE_PX * 2;
  const s = new PixelSheet(N, N);
  const m = u(1.5);
  // Ombra e piattaforma in terra battuta.
  s.rect(m + u(1), m + u(1.5), N - 2 * m, N - 2 * m, '#000000', 0.2);
  for (let y = m; y < N - m; y++) for (let x = m; x < N - m; x++) s.set(x, y, hash2(x, y, 4) % 9 === 0 ? EARTH : '#a8845a');
  // Pavimento in tavole sotto i cannoni.
  for (let y = u(8); y < u(18); y++) for (let x = u(3); x < N - u(3); x++) s.set(x, y, (y % FINE === 0) ? WOOD_DARK : hash2(x, y, 2) % 11 === 0 ? shade('#b88a55', -0.1) : '#b88a55');
  // Parapetto frontale in pietra con gabbioni.
  for (let y = m; y < m + u(5); y++) for (let x = m; x < N - m; x++) stoneFill(s, x, y, y < m + u(2));
  const gab = u(2.4);
  for (let gx = m + gab; gx < N - m - gab; gx += gab * 2.2) {
    s.disc(gx, m + u(6), gab, '#7a5a34');
    s.disc(gx, m + u(6), gab * 0.7, '#9a7a4e');
    for (let a = 0; a < 6; a++) s.set(Math.round(gx + Math.cos(a) * gab * 0.85), Math.round(m + u(6) + Math.sin(a) * gab * 0.85), WOOD_DARK);
  }
  // Tre cannoni pesanti nelle cannoniere.
  for (const f of [0.2, 0.5, 0.8]) {
    const x = Math.round(m + (N - 2 * m) * f);
    s.rect(x - u(1.6), m, u(3.2), u(5), '#5a554c'); // cannoniera
    cannon(s, x, m + u(1), 9);
  }
  // Polveriera, barili e palle.
  const hx = N - m - u(10);
  const hy = N - m - u(9);
  s.rect(hx, hy, u(9), u(8), STONE_DARK);
  s.rect(hx + LINE_W, hy + LINE_W, u(9) - 2 * LINE_W, u(5), '#5a3a2a');
  for (let i = 0; i < u(9); i += FINE) s.rect(hx + i, hy + LINE_W, LINE_W, u(5), '#4a2e20');
  s.rect(hx + u(3.5), hy + u(5.5), u(2), u(2.5), WOOD_DARK);
  for (let k = 0; k < 3; k++) s.disc(m + u(4) + k * u(2.8), N - m - u(4), u(1.2), WOOD);
  for (let row = 0; row < 3; row++) for (let k = 0; k <= row; k++) s.disc(m + u(16) + (k - row / 2) * u(1.2), N - m - u(8) + row * u(1), u(0.55), IRON);
  flag(s, m + u(2), N - m - u(13), c, u(10));
  s.outline(OUTLINE, LINE_W);
  return s.rotated(dir);
}
