import { BUILDINGS, type BuildingKind } from '../sim/rules';
import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import type { LookColors } from './shipArt';
import { TILE_PX } from './terrain';

/** Pixel extra sopra l'impronta, per tetti e torri che "salgono". */
export function buildingOverhang(kind: BuildingKind): number {
  return kind === 'torre' ? 12 : kind === 'municipio' ? 12 : kind === 'casa' ? 5 : 8;
}

const OUTLINE = '#1e1a16';
const STONE = '#a8a296';
const STONE_DARK = '#7d776c';
const WOOD = '#9a6a3c';
const WOOD_DARK = '#6e4a28';
const PLANK = '#b88a55';
const DIRT = '#9c7a4e';
const WINDOW = '#3a3f52';
const WINDOW_LIT = '#f2d27a';

/**
 * Casetta vista dall'alto in scorcio: tetto a due falde (luce da nord-ovest)
 * sopra una facciata con porta e finestre.
 */
function house(s: PixelSheet, x: number, y: number, w: number, roofH: number, wallH: number, c: LookColors, opts: { door?: boolean; windows?: number; chimney?: boolean } = {}) {
  // Ombra a terra verso sud-est.
  s.rect(x + 2, y + roofH + wallH, w, 2, '#000000', 0.25);
  s.rect(x + w, y + 2, 2, roofH + wallH, '#000000', 0.25);
  // Facciata.
  s.rect(x, y + roofH, w, wallH, c.wall);
  s.rect(x, y + roofH, w, 1, shade(c.wall, -0.3));
  const windows = opts.windows ?? Math.max(1, Math.floor(w / 6));
  for (let i = 0; i < windows; i++) {
    const wx = x + Math.round(((i + 1) * w) / (windows + 1)) - 1;
    if (wallH >= 5) s.rect(wx, y + roofH + 2, 2, 2, (hash2(x, i) & 1) ? WINDOW_LIT : WINDOW);
  }
  if (opts.door !== false && wallH >= 4) s.rect(x + Math.floor(w / 2) - 1, y + roofH + wallH - 3, 3, 3, WOOD_DARK);
  // Tetto: falda nord chiara, falda sud scura, tegole a file.
  const ridge = y + Math.floor(roofH / 2);
  for (let j = 0; j < roofH; j++) {
    const yy = y + j;
    const base = yy < ridge ? shade(c.roof, 0.12) : c.roofShade;
    for (let i = 0; i < w; i++) {
      const tile = (j % 3 === 2) || ((i + (Math.floor(j / 3) % 2) * 2) % 4 === 0 && j % 3 === 1);
      s.set(x + i, yy, tile ? shade(base, -0.12) : base);
    }
  }
  s.rect(x, ridge, w, 1, shade(c.roof, 0.3));
  if (opts.chimney) {
    s.rect(x + w - 4, y + 1, 2, 3, STONE_DARK);
    s.set(x + w - 4, y + 1, STONE);
  }
}

function flag(s: PixelSheet, x: number, y: number, c: LookColors, height = 8) {
  for (let j = 0; j < height; j++) s.set(x, y + j, '#3b2f22');
  s.rect(x + 1, y, 5, 3, c.flag);
  s.set(x + 3, y + 1, c.flagDetail);
  s.set(x + 2, y + 1, c.flagDetail);
}

function ground(s: PixelSheet, x: number, y: number, w: number, h: number, color: string, speck: string) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) s.set(x + i, y + j, hash2(i + x * 7, j + y * 13, 4) % 7 === 0 ? speck : color);
  }
}

function paving(s: PixelSheet, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const joint = j % 4 === 3 || (i + (Math.floor(j / 4) % 2) * 3) % 6 === 5;
      s.set(x + i, y + j, joint ? STONE_DARK : hash2(i, j, 2) % 5 === 0 ? shade(STONE, 0.1) : STONE);
    }
  }
}

function barrel(s: PixelSheet, x: number, y: number) {
  s.disc(x + 1.5, y + 1.5, 1.6, WOOD);
  s.set(x + 1, y + 1, shade(WOOD, 0.25));
}

function crate(s: PixelSheet, x: number, y: number) {
  s.rect(x, y, 3, 3, '#a8743e');
  s.set(x + 1, y + 1, '#7a5228');
}

/** Disegna un edificio completo. L'impronta occupa la parte bassa dello sprite. */
export function drawBuilding(kind: BuildingKind, c: LookColors): PixelSheet {
  const st = BUILDINGS[kind];
  const W = st.w * TILE_PX;
  const over = buildingOverhang(kind);
  const H = st.h * TILE_PX + over;
  const s = new PixelSheet(W, H);
  const fy = over; // y dove inizia l'impronta

  switch (kind) {
    case 'casa':
      house(s, 1, fy - 4, 13, 9, 7, c, { chimney: true });
      break;

    case 'municipio': {
      paving(s, 0, fy + 4, W, 48 - 4);
      house(s, 5, fy - 10, 38, 18, 12, c, { windows: 5, chimney: true });
      // Colonne del portico.
      for (const px of [14, 20, 27, 33]) s.rect(px, fy + 8, 2, 12, '#efe8d8');
      s.rect(12, fy + 19, 24, 2, STONE_DARK);
      flag(s, 23, fy - 12 - 0, c, 9);
      // Fontana nella piazza.
      s.disc(24, fy + 34, 5, STONE_DARK);
      s.disc(24, fy + 34, 4, '#5cc2cc');
      s.set(24, fy + 33, '#eefaf6');
      for (const [bx, by] of [[4, 28], [40, 30], [8, 40]]) barrel(s, bx, fy + by);
      break;
    }

    case 'fattoria': {
      // Campo arato a file, con steccato.
      for (let j = 4; j < 32; j++) {
        for (let i = 0; i < 32; i++) {
          const row = j % 4;
          const crop = row === 1 || row === 2;
          const ripe = i > 14;
          s.set(i, fy + j, crop ? (ripe ? (hash2(i, j) % 3 ? '#d9b84a' : '#c49c34') : (hash2(i, j) % 3 ? '#6aae3e' : '#559a32')) : DIRT);
        }
      }
      for (let i = 0; i < 32; i++) {
        s.set(i, fy + 3, WOOD_DARK);
        s.set(i, fy + 31, WOOD_DARK);
      }
      for (let j = 3; j < 32; j++) {
        s.set(0, fy + j, WOOD_DARK);
        s.set(31, fy + j, WOOD_DARK);
      }
      house(s, 2, fy - 6, 12, 8, 6, { ...c, roof: '#9e3b2f', roofShade: '#7d2d24' }, { windows: 0 });
      s.disc(25, fy + 6, 2.5, '#e3c45a');
      s.set(24, fy + 5, '#f2dc85');
      break;
    }

    case 'pescheria': {
      ground(s, 0, fy + 2, 32, 30, '#d9c08a', '#c7ab72');
      // Pontile di assi.
      for (let j = fy + 14; j < fy + 32; j++) {
        for (let i = 18; i < 30; i++) s.set(i, j, (j - fy) % 3 === 0 ? WOOD_DARK : PLANK);
      }
      house(s, 2, fy - 4, 14, 9, 7, c, { windows: 1 });
      // Rastrelliera con pesci ad essiccare.
      for (let i = 3; i < 15; i++) s.set(i, fy + 18, WOOD_DARK);
      for (let i = 4; i < 15; i += 2) {
        s.set(i, fy + 19, '#c8d4dc');
        s.set(i, fy + 20, '#9fb0bd');
      }
      // Barchetta.
      s.rect(21, fy + 4, 5, 9, WOOD);
      s.rect(22, fy + 5, 3, 7, PLANK);
      s.set(23, fy + 3, WOOD);
      barrel(s, 4, fy + 24);
      barrel(s, 9, fy + 25);
      break;
    }

    case 'segheria': {
      ground(s, 0, fy + 2, 32, 30, DIRT, '#b08a5a');
      house(s, 1, fy - 6, 16, 9, 7, c, { windows: 1 });
      // Cataste di tronchi (sezioni circolari).
      for (const [lx, ly] of [[20, 4], [25, 4], [22, 9], [20, 20], [25, 20], [22, 25]] as const) {
        s.disc(lx + 2, fy + ly + 2, 2.4, WOOD_DARK);
        s.disc(lx + 2, fy + ly + 2, 1.4, '#d8b07a');
      }
      // Tronco lungo sul banco della sega.
      s.rect(3, fy + 22, 14, 3, WOOD);
      s.rect(3, fy + 22, 14, 1, shade(WOOD, 0.2));
      s.rect(9, fy + 20, 2, 7, '#8d9098');
      for (let i = 0; i < 6; i++) s.set(5 + i * 2, fy + 28, '#e6cf9a');
      break;
    }

    case 'mercato': {
      paving(s, 0, fy + 2, 32, 30);
      const awnings = [['#c8463a', '#f2ece0'], ['#3d6bb5', '#f2ece0'], ['#d9a52e', '#f2ece0'], ['#4f9a5a', '#f2ece0']];
      awnings.forEach(([a, b], i) => {
        const ax = 2 + (i % 2) * 16;
        const ay = fy - 4 + Math.floor(i / 2) * 17;
        s.rect(ax + 1, ay + 10, 12, 2, '#000000', 0.25);
        for (let j = 0; j < 9; j++) {
          for (let k = 0; k < 12; k++) s.set(ax + k, ay + j, Math.floor(k / 2) % 2 ? a : b);
        }
        s.rect(ax, ay + 9, 12, 1, shade(a, -0.3));
        crate(s, ax + 2, ay + 11);
        barrel(s, ax + 8, ay + 11);
      });
      break;
    }

    case 'cantiere': {
      ground(s, 0, fy + 2, 32, 30, '#c9b07c', '#b49a66');
      // Scalo di varo.
      for (let j = fy + 2; j < fy + 32; j++) {
        for (let i = 8; i < 24; i++) s.set(i, j, (i % 4 === 0) ? WOOD_DARK : PLANK);
      }
      // Scheletro di una nave in costruzione: chiglia e costole.
      for (let j = fy + 5; j < fy + 29; j++) s.set(16, j, WOOD_DARK);
      for (let k = 0; k < 7; k++) {
        const j = fy + 7 + k * 3;
        const half = 3 + Math.min(k, 6 - k);
        for (let i = -half; i <= half; i++) if (Math.abs(i) >= half - 1) s.set(16 + i, j, '#5a3d22');
      }
      // Gru e cataste.
      s.rect(2, fy + 4, 2, 20, '#4a3520');
      s.rect(2, fy + 4, 9, 2, '#4a3520');
      s.set(10, fy + 6, '#8d9098');
      s.set(10, fy + 7, '#8d9098');
      for (let k = 0; k < 3; k++) s.rect(25, fy + 6 + k * 3, 6, 2, k % 2 ? PLANK : WOOD);
      barrel(s, 26, fy + 24);
      break;
    }

    case 'caserma': {
      ground(s, 0, fy + 2, 32, 30, '#c9b07c', '#b8a06c');
      house(s, 1, fy - 8, 30, 12, 8, c, { windows: 4 });
      // Piazza d'armi con soldati in fila, nel colore della bandiera.
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 5; k++) {
          const sx = 5 + k * 5;
          const sy = fy + 19 + r * 6;
          s.rect(sx, sy, 2, 3, c.flag === '#1a1c2c' ? '#3a3f4f' : c.flag);
          s.set(sx, sy - 1, '#e8c39e');
          s.set(sx + 1, sy - 1, '#e8c39e');
        }
      }
      flag(s, 28, fy + 14, c, 8);
      break;
    }

    case 'torre': {
      // Torre rotonda vista dall'alto con merli e cannone.
      s.disc(9, fy + 7, 7.5, '#000000', 0.25);
      s.disc(8, fy + 6, 7.5, STONE_DARK);
      s.disc(8, fy + 6, 6.5, STONE);
      s.disc(8, fy + 6, 4.5, shade(STONE, -0.15));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        s.rect(Math.round(8 + Math.cos(a) * 6) - 1, Math.round(fy + 6 + Math.sin(a) * 6) - 1, 2, 2, shade(STONE, 0.2));
      }
      s.rect(8, fy + 5, 6, 2, '#2a2a2e');
      s.disc(7.5, fy + 6, 1.5, '#3a3a40');
      // Base in pietra (la parte "verticale" della torre).
      s.rect(2, fy + 11, 12, 4, STONE_DARK);
      for (let i = 2; i < 14; i += 3) s.set(i, fy + 12, STONE);
      flag(s, 8, fy - 11, c, 11);
      break;
    }
  }

  s.outline(OUTLINE);
  return s;
}

/** Cantiere edile: fondamenta, impalcature e materiali. */
export function drawConstruction(w: number, h: number): PixelSheet {
  const W = w * TILE_PX;
  const H = h * TILE_PX + 6;
  const s = new PixelSheet(W, H);
  const fy = 6;
  ground(s, 1, fy + 1, W - 2, H - fy - 2, DIRT, '#8a6a40');
  s.frame(2, fy + 2, W - 4, H - fy - 4, STONE_DARK);
  // Impalcatura.
  for (let i = 3; i < W - 3; i += 5) for (let j = fy - 4; j < H - 3; j++) if (j % 2 === 0) s.set(i, j, WOOD);
  for (let j = fy; j < H - 3; j += 5) for (let i = 3; i < W - 3; i++) s.set(i, j, WOOD_DARK);
  for (let k = 0; k < Math.max(1, w); k++) {
    s.rect(4 + k * 10, H - 8, 6, 2, PLANK);
    s.rect(4 + k * 10, H - 6, 6, 2, WOOD);
  }
  s.outline(OUTLINE);
  return s;
}
