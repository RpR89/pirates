import { BUILDINGS, type BuildingKind } from '../sim/rules';
import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import type { LookColors } from './shipArt';
import { CELL_PX, TILE_PX } from './terrain';
import { LINE_DIRS, drawBastion, drawBattery, drawEarthwork, drawMoat, earthwork } from './fortArt';

/**
 * I disegni sono pensati in "unità di riferimento" (16 per casella) e scalati a
 * TILE_PX; le trame (tegole, assi, selciato) invece lavorano sui pixel veri,
 * così a risoluzione alta gli edifici guadagnano dettaglio.
 */
const K = TILE_PX / 16;
const u = (v: number) => Math.max(1, Math.round(v * K));
/** Passo delle trame fini (tegole, assi). */
const FINE = Math.max(3, Math.round(K * 0.9));

/**
 * Lato del disegno in caselle di mappa. Gli edifici sono disegnati in grande e
 * scalati dalla scena sulla loro impronta (in caselle edificio): così restano
 * dettagliati anche se occupano meno spazio. Le difese a linea si disegnano
 * direttamente a misura di casella edificio.
 */
function artTiles(kind: BuildingKind): number {
  return kind === 'municipio' ? 3 : kind === 'casa' || kind === 'torre' ? 1 : 2;
}

/** Scala con cui la scena disegna lo sprite di un edificio completato. */
export function buildingArtScale(kind: BuildingKind): number {
  const st = BUILDINGS[kind];
  if (st.line) return 1;
  return (st.w * CELL_PX) / (artTiles(kind) * TILE_PX);
}

/** Pixel extra sopra l'impronta, per tetti e torri che "salgono" (nella scala del disegno). */
export function buildingOverhang(kind: BuildingKind): number {
  if (kind === 'fossato' || kind === 'bastione' || kind === 'batteria') return 0;
  return u(kind === 'torre' ? 14 : kind === 'municipio' ? 14 : kind === 'casa' ? 6 : kind === 'mura' ? 2.5 : kind === 'terrapieno' ? 1.6 : kind === 'porta' ? 4 : 9);
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
const IRON = '#2a2a2e';
const ROPE = '#4a3a28';

function windowAt(s: PixelSheet, x: number, y: number, wall: string, lit: boolean) {
  const w = u(2.4);
  const h = u(2.8);
  s.rect(x - u(0.4), y - u(0.4), w + u(0.8), h + u(0.8), shade(wall, -0.35)); // cornice
  s.rect(x, y, w, h, lit ? WINDOW_LIT : WINDOW);
  s.rect(x + Math.floor(w / 2), y, Math.max(1, Math.round(K / 3)), h, shade(wall, -0.2)); // montante
  s.rect(x, y + Math.floor(h / 2), w, Math.max(1, Math.round(K / 3)), shade(wall, -0.2));
  s.rect(x - u(1), y, u(0.8), h, shade(wall, -0.45)); // persiane
  s.rect(x + w + u(0.2), y, u(0.8), h, shade(wall, -0.45));
  if (lit) s.rect(x, y, Math.max(1, Math.round(K / 3)), Math.max(1, Math.round(K / 3)), '#fff3c4');
}

/**
 * Casa vista dall'alto in scorcio: tetto a due falde (luce da nord-ovest)
 * sopra una facciata con porta, finestre e zoccolo in pietra.
 */
function house(
  s: PixelSheet, x: number, y: number, w: number, roofH: number, wallH: number, c: LookColors,
  opts: { door?: boolean; windows?: number; chimney?: boolean } = {},
) {
  // Ombra a terra verso sud-est.
  s.rect(x + u(1), y + roofH + wallH, w, u(1.4), '#000000', 0.25);
  s.rect(x + w, y + u(2), u(1.6), roofH + wallH - u(1), '#000000', 0.25);
  // Facciata intonacata con zoccolo in pietra.
  for (let j = 0; j < wallH; j++) {
    for (let i = 0; i < w; i++) {
      const n = hash2(x + i, y + j, 5);
      s.set(x + i, y + roofH + j, n % 13 === 0 ? shade(c.wall, -0.06) : n % 17 === 0 ? shade(c.wall, 0.05) : c.wall);
    }
  }
  s.rect(x, y + roofH, w, u(0.6), shade(c.wall, -0.4)); // ombra della gronda
  const plinth = u(1.4);
  for (let j = 0; j < plinth; j++) {
    for (let i = 0; i < w; i++) {
      const joint = j === 0 || (i + (j > plinth / 2 ? FINE : 0)) % (FINE * 2) === 0;
      s.set(x + i, y + roofH + wallH - plinth + j, joint ? STONE_DARK : STONE);
    }
  }
  for (const bx of [x, x + w - u(0.6)]) s.rect(bx, y + roofH, u(0.6), wallH - plinth, shade(c.wall, -0.25));
  const windows = opts.windows ?? Math.max(1, Math.floor(w / u(8)));
  if (wallH >= u(6)) {
    for (let i = 0; i < windows; i++) {
      const wx = x + Math.round(((i + 1) * w) / (windows + 1)) - u(1.2);
      if (opts.door !== false && Math.abs(wx + u(1.2) - (x + w / 2)) < u(3)) continue;
      windowAt(s, wx, y + roofH + u(1.6), c.wall, (hash2(x, i) & 1) === 1);
    }
  }
  if (opts.door !== false && wallH >= u(5)) {
    const dw = u(3);
    const dh = Math.min(wallH - u(1), u(4.6));
    const dx = x + Math.floor(w / 2 - dw / 2);
    const dy = y + roofH + wallH - dh;
    s.rect(dx - u(0.4), dy - u(0.4), dw + u(0.8), dh + u(0.4), shade(c.wall, -0.4));
    s.rect(dx, dy, dw, dh, WOOD_DARK);
    for (let i = dx + FINE; i < dx + dw; i += FINE) s.rect(i, dy, 1, dh, shade(WOOD_DARK, -0.25));
    s.rect(dx + dw - u(0.9), dy + Math.floor(dh / 2), Math.max(1, Math.round(K / 2)), Math.max(1, Math.round(K / 2)), '#e3b23c');
  }
  // Tetto: falda nord chiara, falda sud scura, tegole a file sfalsate.
  const ridge = y + Math.floor(roofH / 2);
  for (let j = 0; j < roofH; j++) {
    const yy = y + j;
    const north = yy < ridge;
    const base = north ? shade(c.roof, 0.14) : c.roofShade;
    const row = Math.floor(j / FINE);
    for (let i = 0; i < w; i++) {
      const col = Math.floor((i + (row % 2) * Math.floor(FINE / 2) * 2) / (FINE * 2));
      const edgeRow = j % FINE === FINE - 1;
      const edgeCol = (i + (row % 2) * FINE) % (FINE * 2) === 0;
      const tone = hash2(col, row, 3) % 5;
      let cc = tone === 0 ? shade(base, -0.06) : tone === 1 ? shade(base, 0.05) : base;
      if (edgeRow) cc = shade(base, -0.2);
      else if (edgeCol) cc = shade(base, -0.12);
      s.set(x + i, yy, cc);
    }
  }
  s.rect(x, ridge - Math.floor(u(0.6) / 2), w, u(0.7), shade(c.roof, 0.35)); // colmo
  s.rect(x, y, w, Math.max(1, Math.round(K / 3)), shade(c.roof, 0.25));
  s.rect(x, y, Math.max(1, Math.round(K / 3)), roofH, shade(c.roof, 0.2));
  if (opts.chimney) {
    const cx = x + w - u(5);
    s.rect(cx, y + u(0.6), u(2.4), u(3.4), STONE_DARK);
    s.rect(cx, y + u(0.6), u(2.4), u(0.8), STONE_LIGHT);
    s.rect(cx + u(0.5), y + u(0.9), u(1.4), u(0.6), '#2a2420');
  }
}

function flag(s: PixelSheet, x: number, y: number, c: LookColors, height: number) {
  s.rect(x, y, Math.max(1, Math.round(K / 2)), height, '#3b2f22');
  s.disc(x + 0.5, y, u(0.6), '#e3b23c');
  const fw = u(6);
  const fh = u(4);
  // Bandiera che sventola: ogni colonna leggermente spostata.
  for (let i = 0; i < fw; i++) {
    const off = Math.round(Math.sin((i / fw) * Math.PI * 1.5) * K * 0.4);
    for (let j = 0; j < fh; j++) {
      const inner = i > fw * 0.3 && i < fw * 0.7 && j > fh * 0.25 && j < fh * 0.75;
      s.set(x + 1 + i, y + j + off, inner ? c.flagDetail : j === fh - 1 ? shade(c.flag, -0.3) : c.flag);
    }
  }
}

function ground(s: PixelSheet, x: number, y: number, w: number, h: number, color: string, speck: string) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const n = hash2(i + x * 7, j + y * 13, 4);
      s.set(x + i, y + j, n % 7 === 0 ? speck : n % 23 === 0 ? shade(color, 0.08) : color);
    }
  }
}

/** Selciato di pietre irregolari. */
function paving(s: PixelSheet, x: number, y: number, w: number, h: number) {
  const cell = Math.max(4, Math.round(K * 1.6));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const row = Math.floor(j / cell);
      const shift = (hash2(row, 0, 6) % cell);
      const col = Math.floor((i + shift) / (cell * 1.4));
      const joint = j % cell === cell - 1 || Math.floor((i + shift) % (cell * 1.4)) === 0;
      const tone = hash2(col, row, 2) % 4;
      s.set(x + i, y + j, joint ? STONE_DARK : tone === 0 ? STONE_LIGHT : tone === 1 ? shade(STONE, -0.06) : STONE);
    }
  }
}

function barrel(s: PixelSheet, x: number, y: number) {
  const r = u(1.3);
  s.disc(x + r, y + r, r, WOOD);
  s.disc(x + r, y + r, r * 0.7, shade(WOOD, 0.15));
  s.disc(x + r, y + r, r * 0.25, WOOD_DARK);
  for (let a = 0; a < 8; a++) s.set(Math.round(x + r + Math.cos(a) * r * 0.85), Math.round(y + r + Math.sin(a) * r * 0.85), IRON);
}

function crate(s: PixelSheet, x: number, y: number) {
  const z = u(2.2);
  s.rect(x, y, z, z, '#a8743e');
  s.frame(x, y, z, z, '#7a5228');
  s.line(x, y, x + z - 1, y + z - 1, '#7a5228');
  s.line(x + z - 1, y, x, y + z - 1, '#7a5228');
}

/** Piccola figura vista dall'alto in scorcio (soldati in caserma). */
function figure(s: PixelSheet, x: number, y: number, uniform: string, hat: string) {
  const w = u(1.6);
  s.rect(x, y + u(1.2), w, u(2), uniform);
  s.rect(x, y + u(1.2), w, Math.max(1, Math.round(K / 3)), shade(uniform, 0.3));
  s.rect(x, y + u(3.2), Math.floor(w / 2), u(0.8), '#e8e0cc');
  s.rect(x + Math.ceil(w / 2), y + u(3.2), Math.floor(w / 2), u(0.8), '#e8e0cc');
  s.rect(x, y + u(0.2), w, u(1), '#e8c39e');
  s.rect(x - Math.round(K / 3), y, w + Math.round(K / 1.5), u(0.6), hat);
  s.rect(x + w, y - u(0.6), Math.max(1, Math.round(K / 3)), u(3), '#5a5a5e'); // moschetto
}

/** Disegna un edificio completo. L'impronta occupa la parte bassa dello sprite. */
/**
 * `variant`: giunzioni per le difese a linea (mura, terrapieni, fossati) oppure
 * orientamento (0 N, 1 E, 2 S, 3 O) per bastioni e batterie.
 */
export function drawBuilding(kind: BuildingKind, c: LookColors, variant = 0): PixelSheet {
  if (kind === 'terrapieno') return drawEarthwork(variant, buildingOverhang(kind));
  if (kind === 'fossato') return drawMoat(variant);
  if (kind === 'bastione') return drawBastion(c, variant);
  if (kind === 'batteria') return drawBattery(c, variant);
  if (kind === 'porta') return drawGate(variant & 255, variant >= 256, c);
  if (kind === 'mura') {
    const over = buildingOverhang(kind);
    const s = new PixelSheet(CELL_PX, CELL_PX + over);
    drawWall(s, over, variant, c);
    s.outline(OUTLINE, Math.max(1, Math.round(K / 3)));
    return s;
  }
  const W = artTiles(kind) * TILE_PX;
  const over = buildingOverhang(kind);
  const H = W + over;
  const s = new PixelSheet(W, H);
  const fy = over; // y dove inizia l'impronta
  const T = TILE_PX;

  switch (kind) {
    case 'casa':
      house(s, u(0.5), fy - u(5), T - u(2), u(10), u(8), c, { chimney: true });
      break;

    case 'municipio': {
      paving(s, 0, fy + u(5), W, 3 * T - u(5));
      house(s, u(4), fy - u(12), W - u(8), u(20), u(14), c, { windows: 6, chimney: true });
      // Portico con colonne e scalinata.
      for (let k = 0; k < 5; k++) {
        const px = u(14) + Math.round((k * (W - u(28))) / 4);
        s.rect(px, fy + u(9), u(1.6), u(13), '#efe8d8');
        s.rect(px, fy + u(9), Math.max(1, Math.round(K / 3)), u(13), '#ffffff');
        s.rect(px + u(1.6) - Math.max(1, Math.round(K / 3)), fy + u(9), Math.max(1, Math.round(K / 3)), u(13), '#cfc6b2');
        s.rect(px - u(0.4), fy + u(8.6), u(2.4), u(0.8), '#d8d0bc');
      }
      for (let k = 0; k < 3; k++) s.rect(u(11) - u(k), fy + u(22) + u(k * 1.2), W - u(22) + u(k * 2), u(1.2), k % 2 ? STONE : STONE_LIGHT);
      flag(s, Math.floor(W / 2), fy - u(14), c, u(10));
      // Fontana nella piazza.
      const fx = W / 2;
      const fyy = fy + u(36);
      s.disc(fx + u(0.6), fyy + u(0.8), u(6), '#000000', 0.2);
      s.disc(fx, fyy, u(6), STONE_DARK);
      s.disc(fx, fyy, u(5.2), STONE_LIGHT);
      s.disc(fx, fyy, u(4.6), '#5cc2cc');
      s.disc(fx - u(1.5), fyy - u(1.5), u(1.5), '#8fe0d6');
      s.disc(fx, fyy, u(1.6), STONE_LIGHT);
      s.disc(fx, fyy, u(0.7), '#eefaf6');
      for (const [bx, by] of [[3, 30], [41, 32], [6, 42], [40, 42]]) barrel(s, u(bx), fy + u(by));
      crate(s, u(9), fy + u(42));
      break;
    }

    case 'fattoria': {
      // Campo arato a file, con steccato e spaventapasseri.
      const row = Math.max(4, Math.round(K * 1.25));
      for (let j = u(5); j < 2 * T; j++) {
        for (let i = 0; i < 2 * T; i++) {
          const r = j % row;
          const crop = r >= 1 && r <= row - 2;
          const ripe = i > T;
          const h = hash2(i, j);
          s.set(i, fy + j, crop
            ? (ripe ? (h % 3 ? '#d9b84a' : h % 5 ? '#c49c34' : '#e8cc6a') : (h % 3 ? '#6aae3e' : h % 5 ? '#559a32' : '#7cc050'))
            : (h % 4 ? DIRT : '#8a6a40'));
        }
      }
      const post = Math.max(1, Math.round(K / 2));
      for (let i = 0; i < 2 * T; i++) {
        s.rect(i, fy + u(4), 1, post, WOOD_DARK);
        s.rect(i, fy + 2 * T - post, 1, post, WOOD_DARK);
        if (i % u(4) === 0) { s.rect(i, fy + u(4) - post, post, post * 3, WOOD); s.rect(i, fy + 2 * T - post * 2, post, post * 2, WOOD); }
      }
      for (let j = u(4); j < 2 * T; j++) {
        s.rect(0, fy + j, post, 1, WOOD_DARK);
        s.rect(2 * T - post, fy + j, post, 1, WOOD_DARK);
      }
      house(s, u(1), fy - u(7), u(14), u(9), u(8), { ...c, roof: '#9e3b2f', roofShade: '#7d2d24', wall: '#c9a06a' }, { windows: 0 });
      // Covone di fieno e spaventapasseri.
      s.disc(u(26), fy + u(8), u(3), '#c9a83a');
      s.disc(u(26) - u(0.5), fy + u(8) - u(0.5), u(2.4), '#e3c45a');
      s.disc(u(26) - u(1), fy + u(8) - u(1), u(1.2), '#f2dc85');
      s.rect(u(22), fy + u(19), u(0.5), u(6), WOOD_DARK);
      s.rect(u(20), fy + u(21), u(4.5), u(0.5), WOOD_DARK);
      s.disc(u(22.2), fy + u(19), u(1.2), '#d9b84a');
      s.rect(u(21), fy + u(20.5), u(2.5), u(2), '#8f2f2f');
      break;
    }

    case 'pescheria': {
      ground(s, 0, fy + u(1), 2 * T, 2 * T - u(1), '#d9c08a', '#c7ab72');
      // Pontile di assi con pali.
      for (let j = fy + u(13); j < fy + 2 * T; j++) {
        for (let i = u(18); i < u(30); i++) {
          const seam = (j - fy) % FINE === 0;
          s.set(i, j, seam ? WOOD_DARK : hash2(i, j, 8) % 11 === 0 ? shade(PLANK, -0.12) : PLANK);
        }
      }
      for (const px of [u(18), u(30) - u(1)]) for (let j = fy + u(14); j < fy + 2 * T; j += u(4)) s.disc(px + u(0.5), j, u(0.8), WOOD_DARK);
      house(s, u(1), fy - u(5), u(15), u(10), u(8), c, { windows: 1 });
      // Rastrelliera con pesci ad essiccare.
      s.rect(u(3), fy + u(18), u(12), u(0.5), WOOD_DARK);
      for (let i = u(3.5); i < u(15); i += u(1.6)) {
        s.rect(i, fy + u(18.5), u(0.8), u(1.6), '#c8d4dc');
        s.rect(i, fy + u(18.5) + u(1.6), u(0.8), u(0.5), '#9fb0bd');
      }
      // Barchetta con remi.
      const bx = u(21);
      const by = fy + u(3);
      s.rect(bx, by + u(1), u(5), u(10), WOOD);
      s.rect(bx + u(0.8), by + u(1.8), u(3.4), u(8.4), PLANK);
      s.disc(bx + u(2.5), by + u(1.2), u(1.8), WOOD);
      for (const yy of [by + u(4), by + u(7.5)]) s.rect(bx + u(0.8), yy, u(3.4), u(0.6), WOOD_DARK);
      s.line(bx - u(3), by + u(6), bx, by + u(5.5), WOOD_DARK);
      s.line(bx + u(5), by + u(5.5), bx + u(8), by + u(6), WOOD_DARK);
      // Rete da pesca.
      for (let j = 0; j < u(5); j++) for (let i = 0; i < u(7); i++) if ((i + j) % 3 === 0) s.set(u(4) + i, fy + u(25) + j, '#6a7a6a');
      barrel(s, u(13), fy + u(24));
      break;
    }

    case 'segheria': {
      ground(s, 0, fy + u(1), 2 * T, 2 * T - u(1), DIRT, '#b08a5a');
      house(s, u(1), fy - u(7), u(17), u(10), u(8), c, { windows: 1 });
      // Cataste di tronchi (sezioni con gli anelli).
      for (const [lx, ly] of [[20, 4], [25, 4], [22, 8], [20, 20], [25, 20], [22, 24]] as const) {
        const cx = u(lx) + u(2);
        const cy = fy + u(ly) + u(2);
        s.disc(cx, cy, u(2.6), WOOD_DARK);
        s.disc(cx, cy, u(2.1), '#d8b07a');
        s.disc(cx, cy, u(1.4), '#c99e66');
        s.disc(cx, cy, u(0.7), '#b88a55');
      }
      // Tronco lungo sul banco con la sega.
      s.rect(u(3), fy + u(21), u(14), u(3), WOOD);
      s.rect(u(3), fy + u(21), u(14), u(0.6), shade(WOOD, 0.25));
      for (let i = u(3); i < u(17); i += FINE * 2) s.rect(i, fy + u(22), FINE, 1, WOOD_DARK);
      s.rect(u(9), fy + u(19), u(0.8), u(7), '#8d9098');
      s.rect(u(9), fy + u(19), u(0.8), u(0.8), '#c4c7cc');
      for (let i = 0; i < 24; i++) s.set(u(4) + hash2(i, 1) % u(12), fy + u(27) + (hash2(i, 2) % u(3)), hash2(i, 3) % 2 ? '#e6cf9a' : '#d4b77d');
      break;
    }

    case 'mercato': {
      paving(s, 0, fy + u(1), 2 * T, 2 * T - u(1));
      const awnings = [['#c8463a', '#f2ece0'], ['#3d6bb5', '#f2ece0'], ['#d9a52e', '#f2ece0'], ['#4f9a5a', '#f2ece0']];
      awnings.forEach(([a, b], i) => {
        const ax = u(2) + (i % 2) * T;
        const ay = fy - u(5) + Math.floor(i / 2) * u(17);
        const aw = T - u(4);
        const stripe = Math.max(2, Math.round(K * 0.9));
        s.rect(ax + u(1), ay + u(10), aw, u(1.6), '#000000', 0.25);
        for (let j = 0; j < u(10); j++) {
          for (let k = 0; k < aw; k++) {
            const base = Math.floor(k / stripe) % 2 ? a : b;
            s.set(ax + k, ay + j, j < u(4.5) ? shade(base, 0.08) : base);
          }
        }
        for (let k = 0; k < aw; k += stripe * 2) s.rect(ax + k, ay + u(10), stripe, u(0.6), shade(a, -0.3)); // frangia
        s.rect(ax, ay + u(4.8), aw, Math.max(1, Math.round(K / 3)), shade(b, -0.2));
        crate(s, ax + u(1.5), ay + u(11));
        barrel(s, ax + aw - u(4), ay + u(11));
      });
      break;
    }

    case 'cantiere': {
      ground(s, 0, fy + u(1), 2 * T, 2 * T - u(1), '#c9b07c', '#b49a66');
      // Scalo di varo.
      for (let j = fy + u(1); j < fy + 2 * T; j++) {
        for (let i = u(8); i < u(24); i++) {
          const seam = (i - u(8)) % (FINE * 2) === 0;
          s.set(i, j, seam ? WOOD_DARK : hash2(i, j, 7) % 13 === 0 ? shade(PLANK, -0.1) : PLANK);
        }
      }
      // Scheletro di una nave: chiglia e costole.
      s.rect(T - u(0.4), fy + u(4), u(0.8), u(26), WOOD_DARK);
      for (let k = 0; k < 8; k++) {
        const j = fy + u(6) + k * u(3);
        const half = u(3) + Math.min(k, 7 - k) * u(1.2);
        s.rect(T - half, j, half * 2, u(0.6), '#5a3d22');
        s.rect(T - half, j, u(0.6), u(2), '#5a3d22');
        s.rect(T + half - u(0.6), j, u(0.6), u(2), '#5a3d22');
      }
      // Gru, carrucola e cataste di tavole.
      s.rect(u(2), fy + u(4), u(1.4), u(20), '#4a3520');
      s.rect(u(2), fy + u(4), u(10), u(1.4), '#4a3520');
      s.rect(u(11), fy + u(5.4), Math.max(1, Math.round(K / 3)), u(3), ROPE);
      s.disc(u(11) + 0.5, fy + u(9), u(1), '#8d9098');
      for (let k = 0; k < 4; k++) s.rect(u(25), fy + u(5) + k * u(1.8), u(6), u(1.4), k % 2 ? PLANK : WOOD);
      barrel(s, u(26), fy + u(23));
      break;
    }

    case 'caserma': {
      ground(s, 0, fy + u(1), 2 * T, 2 * T - u(1), '#c9b07c', '#b8a06c');
      house(s, u(1), fy - u(9), 2 * T - u(2), u(13), u(10), c, { windows: 5 });
      // Piazza d'armi: soldati in fila nel colore della bandiera, con moschetto.
      const uniform = c.flag === '#1a1c2c' ? '#3a3f4f' : c.flag;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 6; k++) figure(s, u(3) + k * u(4.2), fy + u(17) + r * u(6.5), uniform, '#2a2420');
      }
      flag(s, u(28), fy + u(13), c, u(9));
      break;
    }

    case 'torre': {
      // Torre rotonda vista dall'alto: merli, piattaforma e cannone.
      const cx = T / 2;
      const cy = fy + T / 2 - u(1);
      const R = T / 2 - u(0.5);
      s.disc(cx + u(1), cy + u(1.4), R, '#000000', 0.25);
      s.rect(u(1.5), cy, T - u(3), u(6), STONE_DARK); // base "verticale"
      for (let j = 0; j < u(6); j++) for (let i = u(1.5); i < T - u(1.5); i++) if ((i + (Math.floor(j / FINE) % 2) * FINE) % (FINE * 2) === 0 || j % FINE === 0) s.set(i, cy + j, shade(STONE_DARK, -0.15));
      s.disc(cx, cy, R, STONE_DARK);
      s.disc(cx, cy, R - u(0.8), STONE);
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y < (R - u(0.8)) ** 2 && hash2(x, y, 4) % 9 === 0) s.set(cx + x, cy + y, STONE_LIGHT);
      s.disc(cx, cy, R - u(3), shade(STONE, -0.18));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const mx = Math.round(cx + Math.cos(a) * (R - u(1.4)));
        const my = Math.round(cy + Math.sin(a) * (R - u(1.4)));
        s.rect(mx - u(0.9), my - u(0.9), u(1.8), u(1.8), STONE_LIGHT);
        s.rect(mx - u(0.9), my + u(0.5), u(1.8), u(0.4), STONE_DARK);
      }
      s.rect(cx, cy - u(0.6), u(7), u(1.4), IRON);
      s.disc(cx - u(0.5), cy, u(2), '#3a3a40');
      s.disc(cx - u(0.8), cy - u(0.3), u(0.8), '#5a5a62');
      flag(s, Math.floor(cx) - u(4), fy - u(13), c, u(12));
      break;
    }

  }

  s.outline(OUTLINE, Math.max(1, Math.round(K / 3)));
  return s;
}


/**
 * Tratto di mura sottile che si collega ai vicini in 8 direzioni: un camminamento
 * in pietra con i merli, rialzato sopra la sua parete esterna.
 */
function drawWall(s: PixelSheet, fy: number, mask: number, c: LookColors) {
  const T = CELL_PX;
  const half = u(1.3); // metà spessore: mura fini
  const face = u(3); // altezza della parete visibile
  const top = fy - face;
  const cx = T / 2;
  const cy = T / 2;
  const segs: [number, number][] = [];
  LINE_DIRS.forEach(([dx, dy], i) => {
    if (mask & (1 << i)) segs.push([cx + dx * T * 0.5, cy + dy * T * 0.5]);
  });

  /** Distanza dal nastro delle mura e posizione lungo il tratto più vicino. */
  const sample = (x: number, y: number): { d: number; t: number } => {
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

  // Parete esterna: lo stesso nastro, spostato in basso e più scuro.
  for (let y = 0; y < T + face; y++) {
    for (let x = 0; x < T; x++) {
      for (let j = 1; j <= face; j++) {
        const { d } = sample(x + 0.5, y - j + 0.5);
        if (d <= half) {
          const brick = j % FINE === 0 || (x + Math.floor(j / FINE) * FINE) % (FINE * 2) === 0;
          s.set(x, top + y, brick ? shade(STONE_DARK, -0.22) : STONE_DARK);
          break;
        }
      }
    }
  }
  // Camminamento con i merli.
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const { d, t } = sample(x + 0.5, y + 0.5);
      if (d > half) continue;
      const rim = d > half - u(0.5);
      const merlon = rim && Math.floor(t / u(1.6)) % 2 === 0;
      const stone = hash2(x, y, 8) % 6 === 0 ? STONE_LIGHT : STONE;
      s.set(x, top + y, merlon ? STONE_LIGHT : rim ? shade(STONE, -0.12) : (x + y) % (FINE * 2) === 0 ? STONE_DARK : stone);
    }
  }
  // Pilastro isolato o crocevia: uno stendardo.
  if (mask === 0) flag(s, Math.floor(cx), top + cy - u(5), c, u(5));
}

/**
 * Porta della cinta: due torri ai lati di un passaggio lastricato con i battenti
 * aperti. In pietra con le mura (`stone`), di tronchi con i terrapieni. Il
 * passaggio è perpendicolare ai tratti vicini (`mask`), che si disegnano come bracci.
 */
function drawGate(mask: number, stone: boolean, c: LookColors): PixelSheet {
  const T = CELL_PX;
  const over = buildingOverhang('porta');
  const s = new PixelSheet(T, T + over);
  const fy = over;
  // Bracci verso i tratti collegati.
  if (mask) {
    if (stone) drawWall(s, fy, mask, c);
    else earthwork(s, fy, mask, buildingOverhang('terrapieno'));
  }
  // Muro orizzontale (vicini a est/ovest o solo in diagonale): passaggio nord-sud.
  const ns = (mask & 0b01000100) !== 0 || (mask & 0b00010001) === 0;
  const cx = T / 2;
  const cy = fy + T / 2;
  const pw = u(3); // larghezza del passaggio
  const tw = u(2.5); // lato delle torri
  const H = stone ? u(3) : u(2.5); // altezza delle torri
  const top = stone ? STONE : PLANK;
  const side = stone ? STONE_DARK : WOOD_DARK;
  const pave = (x: number, y: number) => s.set(x, y, (x + Math.floor(y / FINE)) % FINE === 0 || y % FINE === 0 ? '#8d8270' : hash2(x, y, 12) % 5 === 0 ? '#b9ae98' : '#a99e88');

  const tower = (tx: number, ty: number) => {
    // `tx, ty`: angolo in alto a sinistra della base; la cima sta H più su.
    s.rect(tx + u(0.5), ty - H + u(0.6), tw, tw + H, '#000000', 0.22); // ombra
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < tw; i++) {
        const joint = stone ? j % FINE === 0 || (i + (Math.floor(j / FINE) % 2) * FINE) % (FINE * 2) === 0 : i % FINE === 0;
        s.set(tx + i, ty + tw - H + j, joint ? shade(side, -0.2) : side);
      }
    }
    for (let j = 0; j < tw; j++) {
      for (let i = 0; i < tw; i++) {
        const rim = i < u(0.5) || j < u(0.5) || i >= tw - u(0.5) || j >= tw - u(0.5);
        let col = stone ? (hash2(tx + i, j, 7) % 6 === 0 ? STONE_LIGHT : top) : j % FINE === 0 ? WOOD : top;
        if (rim) col = stone ? (Math.floor((i + j) / u(0.8)) % 2 === 0 ? STONE_LIGHT : shade(STONE, -0.12)) : WOOD_DARK;
        s.set(tx + i, ty - H + j, col);
      }
    }
    if (stone) {
      // Piattaforma incassata dietro i merli.
      s.rect(tx + u(0.7), ty - H + u(0.7), tw - u(1.4), tw - u(1.4), shade(STONE, -0.16));
      s.rect(tx + u(0.7), ty - H + u(0.7), tw - u(1.4), Math.max(1, Math.round(K / 3)), STONE_DARK);
    } else {
      // Tetto a punta della garitta di legno.
      s.rect(tx + u(0.6), ty - H + u(0.6), tw - u(1.2), tw - u(1.2), '#7a4a2a');
      s.rect(tx + u(0.6), ty - H + u(0.6), tw - u(1.2), u(0.4), '#9a5e36');
    }
  };
  const leaf = (x: number, y: number, w: number, h: number) => {
    s.rect(x, y, w, h, WOOD);
    s.rect(x, y, w, Math.max(1, Math.round(K / 3)), PLANK);
    for (let k = 0; k < Math.max(w, h); k += FINE) s.set(x + (w > h ? k : 0), y + (w > h ? 0 : k), IRON);
  };

  if (ns) {
    for (let y = fy; y < fy + T; y++) for (let x = Math.round(cx - pw / 2); x < Math.round(cx + pw / 2); x++) pave(x, y);
    // Battenti aperti verso l'interno, ai lati del passaggio.
    leaf(Math.round(cx - pw / 2), cy - H - u(3), u(0.6), u(2));
    leaf(Math.round(cx + pw / 2) - u(0.6), cy - H - u(3), u(0.6), u(2));
    // Arco sopra il passaggio: camminamento in alto e volta scura sotto.
    const ax = Math.round(cx - pw / 2);
    const ay = cy - u(0.8) - H;
    s.rect(ax, ay, pw, u(1.6), top);
    s.rect(ax, ay + u(1.6), pw, H, side);
    s.rect(ax + u(0.5), ay + u(1.6) + u(0.5), pw - u(1), H - u(0.5), '#2a221c');
    tower(Math.round(cx - pw / 2 - tw), cy - Math.round(tw / 2));
    tower(Math.round(cx + pw / 2), cy - Math.round(tw / 2));
  } else {
    for (let y = Math.round(cy - pw / 2); y < Math.round(cy + pw / 2); y++) for (let x = 0; x < T; x++) pave(x, y);
    leaf(Math.round(cx - u(3)), Math.round(cy - pw / 2), u(2), u(0.6));
    leaf(Math.round(cx - u(3)), Math.round(cy + pw / 2) - u(0.6), u(2), u(0.6));
    // Ponte coperto tra le due torri, rialzato.
    const by = Math.round(cy - pw / 2) - H;
    s.rect(Math.round(cx - u(0.8)) + u(0.5), by + u(0.6), u(1.6), pw, '#000000', 0.25);
    s.rect(Math.round(cx - u(0.8)), by, u(1.6), pw, top);
    s.rect(Math.round(cx - u(0.8)), by, Math.max(1, Math.round(K / 3)), pw, side);
    s.rect(Math.round(cx + u(0.8)) - Math.max(1, Math.round(K / 3)), by, Math.max(1, Math.round(K / 3)), pw, side);
    tower(Math.round(cx - tw / 2), Math.round(cy - pw / 2 - tw));
    tower(Math.round(cx - tw / 2), Math.round(cy + pw / 2));
  }
  // Stendardo sulla porta.
  flag(s, ns ? Math.round(cx + pw / 2 + tw / 2) : Math.round(cx + tw / 2) - u(0.5), (ns ? cy - Math.round(tw / 2) : Math.round(cy + pw / 2)) - H - u(4), c, u(4));
  s.outline(OUTLINE, Math.max(1, Math.round(K / 3)));
  return s;
}

/** Cantiere edile su un'impronta di w×h caselle edificio: fondamenta, impalcature e materiali. */
export function drawConstruction(w: number, h: number): PixelSheet {
  const W = w * CELL_PX;
  const H = h * CELL_PX + u(6);
  const s = new PixelSheet(W, H);
  const fy = u(6);
  ground(s, u(0.5), fy + u(0.5), W - u(1), H - fy - u(1), DIRT, '#8a6a40');
  s.rect(u(1), fy + u(1), W - u(2), u(1), STONE_DARK);
  s.rect(u(1), H - u(2), W - u(2), u(1), STONE_DARK);
  s.rect(u(1), fy + u(1), u(1), H - fy - u(3), STONE_DARK);
  s.rect(W - u(2), fy + u(1), u(1), H - fy - u(3), STONE_DARK);
  // Impalcatura.
  for (let i = u(2.5); i < W - u(2); i += u(5)) s.rect(i, fy - u(4), u(0.6), H - fy + u(2), WOOD);
  for (let j = fy; j < H - u(2); j += u(5)) s.rect(u(2), j, W - u(4), u(0.6), WOOD_DARK);
  for (let k = 0; k < Math.max(1, Math.floor((w * CELL_PX) / u(10)) - 1); k++) {
    s.rect(u(4) + k * u(10), H - u(8), u(6), u(1.2), PLANK);
    s.rect(u(4) + k * u(10), H - u(8) + u(1.2), u(6), u(1.2), WOOD);
  }
  s.outline(OUTLINE, Math.max(1, Math.round(K / 3)));
  return s;
}
