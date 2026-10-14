import { BUILDINGS, type BuildingKind } from '../sim/rules';
import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import type { LookColors } from './shipArt';
import { TILE_PX } from './terrain';

/** Scala rispetto al disegno di riferimento a 16 px per casella. */
const K = TILE_PX / 16;
const u = (v: number) => Math.round(v * K);

/** Pixel extra sopra l'impronta, per tetti e torri che "salgono". */
export function buildingOverhang(kind: BuildingKind): number {
  return u(kind === 'torre' ? 14 : kind === 'municipio' ? 14 : kind === 'casa' ? 6 : kind === 'mura' ? 5 : 9);
}

const OUTLINE = '#1e1a16';
const STONE = '#aaa497';
const STONE_DARK = '#7d776c';
const STONE_LIGHT = '#c4beb1';
const WOOD = '#9a6a3c';
const WOOD_DARK = '#6e4a28';
const PLANK = '#b88a55';
const DIRT = '#9c7a4e';
const WINDOW = '#3a3f52';
const WINDOW_LIT = '#f2d27a';

/**
 * Casa vista dall'alto in scorcio: tetto a due falde (luce da nord-ovest)
 * sopra una facciata con porta, finestre e travi.
 */
function house(
  s: PixelSheet, x: number, y: number, w: number, roofH: number, wallH: number, c: LookColors,
  opts: { door?: boolean; windows?: number; chimney?: boolean } = {},
) {
  // Ombra a terra verso sud-est.
  s.rect(x + 2, y + roofH + wallH, w, 2, '#000000', 0.25);
  s.rect(x + w, y + 3, 3, roofH + wallH - 1, '#000000', 0.25);
  // Facciata con zoccolo in pietra.
  s.rect(x, y + roofH, w, wallH, c.wall);
  s.rect(x, y + roofH, w, 1, shade(c.wall, -0.35));
  s.rect(x, y + roofH + wallH - 2, w, 2, STONE_DARK);
  for (let i = x; i < x + w; i += 3) s.set(i, y + roofH + wallH - 2, STONE);
  for (const bx of [x, x + w - 1]) for (let j = 1; j < wallH - 2; j++) s.set(bx, y + roofH + j, shade(c.wall, -0.25));
  const windows = opts.windows ?? Math.max(1, Math.floor(w / 8));
  for (let i = 0; i < windows; i++) {
    const wx = x + Math.round(((i + 1) * w) / (windows + 1)) - 1;
    if (wallH >= 7) {
      const lit = hash2(x, i) & 1;
      s.rect(wx - 1, y + roofH + 2, 4, 4, shade(c.wall, -0.3));
      s.rect(wx, y + roofH + 3, 2, 2, lit ? WINDOW_LIT : WINDOW);
    }
  }
  if (opts.door !== false && wallH >= 6) {
    const dx = x + Math.floor(w / 2) - 2;
    s.rect(dx, y + roofH + wallH - 6, 4, 5, WOOD_DARK);
    s.rect(dx + 1, y + roofH + wallH - 5, 2, 4, WOOD);
    s.set(dx + 2, y + roofH + wallH - 3, '#e3b23c');
  }
  // Tetto: falda nord chiara, falda sud scura, tegole a file sfalsate.
  const ridge = y + Math.floor(roofH / 2);
  for (let j = 0; j < roofH; j++) {
    const yy = y + j;
    const base = yy < ridge ? shade(c.roof, 0.14) : c.roofShade;
    for (let i = 0; i < w; i++) {
      const row = j % 3 === 2;
      const joint = (i + (Math.floor(j / 3) % 2) * 2) % 4 === 0 && j % 3 === 1;
      s.set(x + i, yy, row ? shade(base, -0.15) : joint ? shade(base, -0.08) : base);
    }
  }
  s.rect(x, ridge, w, 1, shade(c.roof, 0.35));
  s.rect(x, y, w, 1, shade(c.roof, 0.25));
  if (opts.chimney) {
    s.rect(x + w - 6, y + 1, 3, 4, STONE_DARK);
    s.rect(x + w - 6, y + 1, 3, 1, STONE_LIGHT);
  }
}

function flag(s: PixelSheet, x: number, y: number, c: LookColors, height: number) {
  for (let j = 0; j < height; j++) s.set(x, y + j, '#3b2f22');
  s.set(x, y - 1, '#e3b23c');
  s.rect(x + 1, y, 7, 5, c.flag);
  s.rect(x + 3, y + 1, 3, 3, c.flagDetail);
  s.set(x + 7, y + 4, shade(c.flag, -0.3));
}

function ground(s: PixelSheet, x: number, y: number, w: number, h: number, color: string, speck: string) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) s.set(x + i, y + j, hash2(i + x * 7, j + y * 13, 4) % 7 === 0 ? speck : color);
  }
}

function paving(s: PixelSheet, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const joint = j % 5 === 4 || (i + (Math.floor(j / 5) % 2) * 4) % 8 === 7;
      s.set(x + i, y + j, joint ? STONE_DARK : hash2(i, j, 2) % 5 === 0 ? STONE_LIGHT : STONE);
    }
  }
}

function barrel(s: PixelSheet, x: number, y: number) {
  s.disc(x + 2, y + 2, 2.4, WOOD);
  s.disc(x + 2, y + 2, 1.2, shade(WOOD, 0.2));
  s.set(x + 1, y + 1, shade(WOOD, 0.4));
}

function crate(s: PixelSheet, x: number, y: number) {
  s.rect(x, y, 4, 4, '#a8743e');
  s.line(x, y, x + 3, y + 3, '#7a5228');
  s.set(x, y, '#c4925a');
}

/** Disegna un edificio completo. L'impronta occupa la parte bassa dello sprite. */
export function drawBuilding(kind: BuildingKind, c: LookColors, wallMask = 0): PixelSheet {
  const st = BUILDINGS[kind];
  const W = st.w * TILE_PX;
  const over = buildingOverhang(kind);
  const H = st.h * TILE_PX + over;
  const s = new PixelSheet(W, H);
  const fy = over; // y dove inizia l'impronta
  const T = TILE_PX;

  switch (kind) {
    case 'casa':
      house(s, 1, fy - u(5), T - 3, u(10), u(8), c, { chimney: true });
      break;

    case 'municipio': {
      paving(s, 0, fy + u(5), W, 3 * T - u(5));
      house(s, u(4), fy - u(12), W - u(8), u(20), u(14), c, { windows: 6, chimney: true });
      // Portico con colonne e scalinata.
      for (let k = 0; k < 5; k++) {
        const px = u(14) + Math.round((k * (W - u(28))) / 4);
        s.rect(px, fy + u(9), 3, u(13), '#efe8d8');
        s.set(px, fy + u(9), '#ffffff');
      }
      for (let k = 0; k < 3; k++) s.rect(u(11) - k * 2, fy + u(22) + k * 2, W - u(22) + k * 4, 2, k % 2 ? STONE : STONE_LIGHT);
      flag(s, Math.floor(W / 2), fy - u(14), c, u(10));
      // Fontana nella piazza.
      const fx = W / 2;
      const fyy = fy + u(36);
      s.disc(fx, fyy, u(6), STONE_DARK);
      s.disc(fx, fyy, u(5), '#5cc2cc');
      s.disc(fx, fyy, u(2), STONE_LIGHT);
      s.set(Math.floor(fx), Math.floor(fyy) - 1, '#eefaf6');
      for (const [bx, by] of [[3, 30], [41, 32], [6, 42], [40, 42]]) barrel(s, u(bx), fy + u(by));
      break;
    }

    case 'fattoria': {
      // Campo arato a file, con steccato e spaventapasseri.
      for (let j = u(5); j < 2 * T; j++) {
        for (let i = 0; i < 2 * T; i++) {
          const row = j % 5;
          const crop = row >= 1 && row <= 3;
          const ripe = i > T;
          const h = hash2(i, j);
          s.set(i, fy + j, crop ? (ripe ? (h % 3 ? '#d9b84a' : '#c49c34') : (h % 3 ? '#6aae3e' : '#559a32')) : (h % 4 ? DIRT : '#8a6a40'));
        }
      }
      for (let i = 0; i < 2 * T; i++) {
        s.set(i, fy + u(4), WOOD_DARK);
        s.set(i, fy + 2 * T - 1, WOOD_DARK);
        if (i % 4 === 0) { s.set(i, fy + u(4) - 1, WOOD); s.set(i, fy + 2 * T - 2, WOOD); }
      }
      for (let j = u(4); j < 2 * T; j++) {
        s.set(0, fy + j, WOOD_DARK);
        s.set(2 * T - 1, fy + j, WOOD_DARK);
      }
      house(s, 2, fy - u(7), u(14), u(9), u(8), { ...c, roof: '#9e3b2f', roofShade: '#7d2d24', wall: '#c9a06a' }, { windows: 0 });
      // Covone di fieno e spaventapasseri.
      s.disc(u(26), fy + u(8), u(3), '#e3c45a');
      s.disc(u(26) - 1, fy + u(8) - 1, u(1.5), '#f2dc85');
      s.rect(u(22), fy + u(20), 1, 6, WOOD_DARK);
      s.rect(u(22) - 3, fy + u(20) + 2, 7, 1, WOOD_DARK);
      s.disc(u(22), fy + u(20), 1.6, '#d9b84a');
      break;
    }

    case 'pescheria': {
      ground(s, 0, fy + 2, 2 * T, 2 * T - 2, '#d9c08a', '#c7ab72');
      // Pontile di assi con pali.
      for (let j = fy + u(13); j < fy + 2 * T; j++) {
        for (let i = u(18); i < u(30); i++) s.set(i, j, (j - fy) % 4 === 0 ? WOOD_DARK : (i % 5 === 0 ? shade(PLANK, -0.1) : PLANK));
      }
      for (const px of [u(18), u(30) - 1]) for (let j = fy + u(14); j < fy + 2 * T; j += 6) s.rect(px - 1, j, 2, 2, WOOD_DARK);
      house(s, 2, fy - u(5), u(15), u(10), u(8), c, { windows: 1 });
      // Rastrelliera con pesci ad essiccare.
      for (let i = u(3); i < u(15); i++) s.set(i, fy + u(18), WOOD_DARK);
      for (let i = u(3) + 1; i < u(15); i += 3) {
        s.set(i, fy + u(18) + 1, '#c8d4dc');
        s.set(i, fy + u(18) + 2, '#9fb0bd');
        s.set(i, fy + u(18) + 3, '#c8d4dc');
      }
      // Barchetta con remi.
      const bx = u(21);
      const by = fy + u(3);
      s.rect(bx, by + 1, 7, 12, WOOD);
      s.rect(bx + 1, by + 2, 5, 10, PLANK);
      s.rect(bx + 2, by, 3, 1, WOOD);
      for (const yy of [by + 4, by + 8]) s.rect(bx + 1, yy, 5, 1, WOOD_DARK);
      s.line(bx - 3, by + 6, bx, by + 6, WOOD_DARK);
      s.line(bx + 7, by + 6, bx + 10, by + 6, WOOD_DARK);
      // Rete da pesca.
      for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) if ((i + j) % 2 === 0) s.set(u(4) + i, fy + u(25) + j, '#6a7a6a');
      barrel(s, u(13), fy + u(24));
      break;
    }

    case 'segheria': {
      ground(s, 0, fy + 2, 2 * T, 2 * T - 2, DIRT, '#b08a5a');
      house(s, 1, fy - u(7), u(17), u(10), u(8), c, { windows: 1 });
      // Cataste di tronchi (sezioni con gli anelli).
      for (const [lx, ly] of [[20, 4], [25, 4], [22, 8], [20, 20], [25, 20], [22, 24]] as const) {
        const cx = u(lx) + u(2);
        const cy = fy + u(ly) + u(2);
        s.disc(cx, cy, u(2.6), WOOD_DARK);
        s.disc(cx, cy, u(1.8), '#d8b07a');
        s.disc(cx, cy, u(0.8), '#b88a55');
      }
      // Tronco lungo sul banco con la sega.
      s.rect(u(3), fy + u(21), u(14), u(3), WOOD);
      s.rect(u(3), fy + u(21), u(14), 1, shade(WOOD, 0.25));
      for (let i = u(3); i < u(17); i += 4) s.set(i, fy + u(22), WOOD_DARK);
      s.rect(u(9), fy + u(19), 2, u(7), '#8d9098');
      s.set(u(9), fy + u(19), '#c4c7cc');
      for (let i = 0; i < 9; i++) s.set(u(4) + i * 2, fy + u(28), hash2(i, 3) % 2 ? '#e6cf9a' : '#d4b77d');
      break;
    }

    case 'mercato': {
      paving(s, 0, fy + 2, 2 * T, 2 * T - 2);
      const awnings = [['#c8463a', '#f2ece0'], ['#3d6bb5', '#f2ece0'], ['#d9a52e', '#f2ece0'], ['#4f9a5a', '#f2ece0']];
      awnings.forEach(([a, b], i) => {
        const ax = u(2) + (i % 2) * T;
        const ay = fy - u(5) + Math.floor(i / 2) * u(17);
        const aw = T - u(4);
        s.rect(ax + 2, ay + u(10), aw, 3, '#000000', 0.25);
        for (let j = 0; j < u(10); j++) {
          for (let k = 0; k < aw; k++) s.set(ax + k, ay + j, Math.floor(k / 3) % 2 ? a : b);
        }
        for (let k = 0; k < aw; k += 3) s.set(ax + k, ay + u(10), shade(a, -0.3));
        s.rect(ax, ay, aw, 1, shade(b, 0.1));
        crate(s, ax + 2, ay + u(11));
        barrel(s, ax + aw - 6, ay + u(11));
      });
      break;
    }

    case 'cantiere': {
      ground(s, 0, fy + 2, 2 * T, 2 * T - 2, '#c9b07c', '#b49a66');
      // Scalo di varo.
      for (let j = fy + 2; j < fy + 2 * T; j++) {
        for (let i = u(8); i < u(24); i++) s.set(i, j, i % 5 === 0 ? WOOD_DARK : (j % 7 === 0 ? shade(PLANK, -0.1) : PLANK));
      }
      // Scheletro di una nave: chiglia e costole.
      for (let j = fy + u(4); j < fy + u(30); j++) s.set(T, j, WOOD_DARK);
      for (let k = 0; k < 8; k++) {
        const j = fy + u(6) + k * u(3);
        const half = u(3) + Math.min(k, 7 - k) * 2;
        for (let i = -half; i <= half; i++) if (Math.abs(i) >= half - 1) s.set(T + i, j, '#5a3d22');
        s.line(T - half, j, T - half + 1, j + 2, '#5a3d22');
        s.line(T + half, j, T + half - 1, j + 2, '#5a3d22');
      }
      // Gru, carrucola e cataste di tavole.
      s.rect(u(2), fy + u(4), 3, u(20), '#4a3520');
      s.rect(u(2), fy + u(4), u(10), 3, '#4a3520');
      for (let j = 0; j < 4; j++) s.set(u(11), fy + u(4) + 3 + j, ROPE_COLOR);
      s.rect(u(11) - 1, fy + u(4) + 7, 3, 3, '#8d9098');
      for (let k = 0; k < 4; k++) s.rect(u(25), fy + u(5) + k * 3, u(6), 2, k % 2 ? PLANK : WOOD);
      barrel(s, u(26), fy + u(23));
      break;
    }

    case 'caserma': {
      ground(s, 0, fy + 2, 2 * T, 2 * T - 2, '#c9b07c', '#b8a06c');
      house(s, 1, fy - u(9), 2 * T - 2, u(13), u(10), c, { windows: 5 });
      // Piazza d'armi: soldati in fila nel colore della bandiera, con moschetto.
      const uniform = c.flag === '#1a1c2c' ? '#3a3f4f' : c.flag;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 6; k++) {
          const sx = u(4) + k * u(4);
          const sy = fy + u(19) + r * u(6);
          s.rect(sx, sy, 3, 4, uniform);
          s.rect(sx, sy + 1, 3, 1, shade(uniform, 0.25));
          s.rect(sx, sy - 2, 3, 2, '#e8c39e');
          s.rect(sx, sy - 3, 3, 1, '#2a2420');
          s.set(sx + 3, sy - 2, '#5a5a5e');
          s.set(sx + 3, sy - 1, '#5a5a5e');
        }
      }
      flag(s, u(28), fy + u(13), c, u(9));
      break;
    }

    case 'torre': {
      // Torre rotonda vista dall'alto: merli, piattaforma e cannone.
      const cx = T / 2;
      const cy = fy + T / 2 - 1;
      s.disc(cx + 2, cy + 2, T / 2, '#000000', 0.25);
      s.rect(2, cy, T - 4, u(6), STONE_DARK); // base "verticale"
      for (let i = 3; i < T - 3; i += 4) s.rect(i, cy + 2, 2, 1, STONE);
      s.disc(cx, cy, T / 2 - 0.5, STONE_DARK);
      s.disc(cx, cy, T / 2 - 1.5, STONE);
      s.disc(cx, cy, T / 2 - 4, shade(STONE, -0.18));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        s.rect(Math.round(cx + Math.cos(a) * (T / 2 - 2.5)) - 1, Math.round(cy + Math.sin(a) * (T / 2 - 2.5)) - 1, 3, 3, STONE_LIGHT);
      }
      s.rect(cx, cy - 1, u(7), 3, IRON);
      s.disc(cx - 1, cy, 2.5, '#3a3a40');
      flag(s, Math.floor(cx) - 4, fy - u(13), c, u(12));
      break;
    }

    case 'mura':
      drawWall(s, fy, wallMask, c);
      break;
  }

  s.outline(OUTLINE);
  return s;
}

const IRON = '#2a2a2e';
const ROPE_COLOR = '#4a3a28';

/**
 * Tratto di mura che si collega ai vicini (bit: 1 = nord, 2 = est, 4 = sud, 8 = ovest).
 * In alto il camminamento con i merli, sotto la faccia esterna in pietra.
 */
function drawWall(s: PixelSheet, fy: number, mask: number, c: LookColors) {
  const T = TILE_PX;
  const t = u(10); // spessore delle mura
  const a = Math.floor((T - t) / 2);
  const face = u(5); // altezza della faccia visibile
  const rects: [number, number, number, number][] = [[a, a, t, t]];
  if (mask & 1) rects.push([a, 0, t, a + 1]);
  if (mask & 2) rects.push([a + t - 1, a, T - a - t + 1, t]);
  if (mask & 4) rects.push([a, a + t - 1, t, T - a - t + 1]);
  if (mask & 8) rects.push([0, a, a + 1, t]);
  // Il camminamento è rialzato di `face` pixel: sotto si vede la parete in pietra.
  const top = fy - face;
  for (const [x, y, w, h] of rects) {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < face; j++) {
        const brick = j % 3 === 2 || (i + x + (Math.floor(j / 3) % 2) * 2) % 5 === 0;
        s.set(x + i, top + y + h + j, brick ? shade(STONE_DARK, -0.2) : STONE_DARK);
      }
    }
  }
  // Camminamento in pietra.
  for (const [x, y, w, h] of rects) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const joint = (j + y) % 4 === 3 || (i + x + (Math.floor((j + y) / 4) % 2) * 3) % 6 === 5;
        s.set(x + i, top + y + j, joint ? STONE_DARK : hash2(x + i, y + j, 8) % 6 === 0 ? STONE_LIGHT : STONE);
      }
    }
  }
  // Merli lungo i bordi.
  for (const [x, y, w, h] of rects) {
    for (let i = 0; i < w; i += 3) {
      s.rect(x + i, top + y, 2, 2, STONE_LIGHT);
      s.rect(x + i, top + y + h - 2, 2, 2, STONE_LIGHT);
    }
    for (let j = 0; j < h; j += 3) {
      s.rect(x, top + y + j, 2, 2, STONE_LIGHT);
      s.rect(x + w - 2, top + y + j, 2, 2, STONE_LIGHT);
    }
  }
  // Pilastro isolato: un piccolo stendardo.
  if (mask === 0) flag(s, Math.floor(T / 2), top + a - u(5), c, u(6));
}

/** Cantiere edile: fondamenta, impalcature e materiali. */
export function drawConstruction(w: number, h: number): PixelSheet {
  const W = w * TILE_PX;
  const H = h * TILE_PX + u(6);
  const s = new PixelSheet(W, H);
  const fy = u(6);
  ground(s, 1, fy + 1, W - 2, H - fy - 2, DIRT, '#8a6a40');
  s.frame(2, fy + 2, W - 4, H - fy - 4, STONE_DARK);
  s.frame(3, fy + 3, W - 6, H - fy - 6, STONE);
  // Impalcatura.
  for (let i = 4; i < W - 4; i += u(5)) for (let j = fy - u(4); j < H - 4; j++) if (j % 2 === 0) s.set(i, j, WOOD);
  for (let j = fy; j < H - 4; j += u(5)) for (let i = 4; i < W - 4; i++) s.set(i, j, WOOD_DARK);
  for (let k = 0; k < Math.max(1, w); k++) {
    s.rect(u(4) + k * u(10), H - u(8), u(6), 2, PLANK);
    s.rect(u(4) + k * u(10), H - u(8) + 2, u(6), 2, WOOD);
  }
  s.outline(OUTLINE);
  return s;
}
