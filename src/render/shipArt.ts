import { SHIPS, type ShipClass } from '../sim/rules';
import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import { TILE_PX } from './terrain';

/** Scala dei dettagli (tarati a 24 px per casella). */
const k = TILE_PX / 24;
const u = (v: number) => Math.max(1, Math.round(v * k));

export interface LookColors {
  flag: string;
  flagDetail: string;
  sail: string;
  sailShade: string;
  hull: string;
  hullStripe: string;
  roof: string;
  roofShade: string;
  wall: string;
}

interface ShipPlan {
  masts: number[]; // posizioni lungo lo scafo (0 = prua, 1 = poppa)
  sailWidth: number; // pixel (a 24 px per casella) oltre la larghezza dello scafo
  guns: number; // per lato
  stripe: boolean;
  cargo: boolean;
  jib: boolean;
  boat: boolean; // scialuppa sul ponte
}

const PLANS: Record<ShipClass, ShipPlan> = {
  sloop: { masts: [0.42], sailWidth: 6, guns: 3, stripe: false, cargo: false, jib: true, boat: false },
  brigantino: { masts: [0.3, 0.6], sailWidth: 9, guns: 5, stripe: false, cargo: false, jib: true, boat: true },
  fregata: { masts: [0.23, 0.46, 0.69], sailWidth: 11, guns: 9, stripe: true, cargo: false, jib: true, boat: true },
  galeone: { masts: [0.23, 0.45, 0.67], sailWidth: 12, guns: 10, stripe: true, cargo: false, jib: false, boat: true },
  mercantile: { masts: [0.3, 0.64], sailWidth: 9, guns: 0, stripe: false, cargo: true, jib: false, boat: false },
  fluyt: { masts: [0.24, 0.5, 0.74], sailWidth: 9, guns: 0, stripe: false, cargo: true, jib: true, boat: true },
};

const DECK = '#bf8f55';
const DECK_DARK = '#9d703f';
const DECK_LIGHT = '#d1a46a';
const OUTLINE = '#1b1712';
const ROPE = '#4a3a28';
const IRON = '#2a2a2e';

/** Dimensioni dello sprite (vele e bompresso sporgono dallo scafo). */
export function shipSpriteSize(cls: ShipClass): { w: number; h: number } {
  const s = SHIPS[cls];
  return { w: Math.round(s.beam * TILE_PX) + u(PLANS[cls].sailWidth) * 2 + u(6), h: Math.round(s.length * TILE_PX) + u(12) };
}

/** Disegna una nave vista dall'alto, con la prua verso l'alto. */
export function drawShip(cls: ShipClass, colors: LookColors): PixelSheet {
  const stats = SHIPS[cls];
  const plan = PLANS[cls];
  const { w, h } = shipSpriteSize(cls);
  const sheet = new PixelSheet(w, h);
  const L = Math.round(stats.length * TILE_PX);
  const B = Math.round(stats.beam * TILE_PX);
  const top = u(7); // spazio per il bompresso
  const cx = w / 2;
  const mid = Math.floor(cx);

  const halfWidth = (y: number): number => {
    const t = y / L;
    if (t < 0.36) return (B / 2) * Math.sqrt(Math.max(0, t / 0.36)) * 0.98 + 0.4;
    if (t > 0.9) return (B / 2) * (1 - (t - 0.9) * 1.3);
    return B / 2;
  };

  // Bompresso e strallo.
  if (plan.jib) {
    sheet.rect(mid - Math.floor(u(1) / 2), top - u(6), u(1), u(9), '#5a4028');
    sheet.line(mid, top - u(6), mid, top + u(4), shade('#5a4028', 0.25));
  }

  // Scafo: fiancata con ombra, cinta colorata, parapetto e ponte di tavole.
  const hull = colors.hull;
  const plankW = u(3);
  for (let y = 0; y < L; y++) {
    const hw = halfWidth(y + 0.5);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx > hw) continue;
      const left = x + 0.5 < cx;
      let c: string;
      if (dx > hw - u(1)) c = shade(hull, left ? -0.2 : -0.45);
      else if (dx > hw - u(2)) c = left ? shade(hull, 0.08) : hull;
      else if (dx > hw - u(3)) c = plan.stripe && y % u(6) < u(3) ? colors.hullStripe : shade(hull, 0.15);
      else if (dx > hw - u(4) && y > L * 0.12) c = shade(DECK, -0.28); // parapetto
      else {
        // Tavole lungo la nave, con giunte sfalsate e venature.
        const plank = Math.floor((x - cx + 1000) / plankW);
        const seam = (x - cx + 1000) % plankW === 0;
        const joint = (y + plank * 17) % (plankW * 7) === 0;
        const grain = hash2(x, y, plank) % 9 === 0;
        c = seam || joint ? DECK_DARK : grain ? shade(DECK, -0.08) : plank % 2 ? DECK : shade(DECK, 0.04);
        if (!seam && (y + plank) % (plankW * 5) === 1) c = DECK_LIGHT;
      }
      sheet.set(x, top + y, c);
    }
  }

  // Cassero di poppa (ponte rialzato) con la sua ringhiera.
  const qd = Math.floor(L * 0.82);
  for (let y = qd; y < L - u(2); y++) {
    const hw = halfWidth(y + 0.5) - u(3);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx > hw) continue;
      const edge = y < qd + u(1);
      sheet.set(x, top + y, edge ? shade(DECK, -0.4) : (x + y) % (plankW * 2) === 0 ? DECK : DECK_LIGHT);
    }
  }
  // Timone e finestre della cabina a poppa.
  sheet.disc(mid + 0.5, top + qd + u(4), u(1.6), '#6a4a2a');
  sheet.disc(mid + 0.5, top + qd + u(4), u(0.8), '#8a6a3a');
  for (let i = -2; i <= 2; i += 2) sheet.rect(mid + u(i) - Math.floor(u(1) / 2), top + L - u(3), u(1), u(1), '#f2d27a');

  // Boccaporti con grata.
  for (const f of [0.36, 0.56]) {
    if (plan.masts.some((m) => Math.abs(m - f) < 0.06)) continue;
    const y = top + Math.floor(L * f);
    sheet.rect(mid - u(2), y, u(4), u(3), shade(DECK, -0.45));
    for (let gx = 0; gx < u(4); gx += 2) for (let gy = 0; gy < u(3); gy += 2) sheet.set(mid - u(2) + gx, y + gy, '#3b2a1a');
  }

  // Scialuppa di servizio.
  if (plan.boat) {
    const y = top + Math.floor(L * 0.5) - u(2);
    sheet.rect(mid - u(2), y, u(4), u(7), '#7a5230');
    sheet.rect(mid - u(1.4), y + u(1), u(2.8), u(5), '#a8784a');
    for (let j = 1; j < 3; j++) sheet.rect(mid - u(1.4), y + u(2 * j), u(2.8), 1, '#7a5230');
  }

  // Cannoni: bocche sporgenti dai due fianchi, con il loro affusto.
  for (let g = 0; g < plan.guns; g++) {
    const y = Math.floor(L * 0.26 + ((L * 0.56) / Math.max(1, plan.guns)) * g);
    const hw = halfWidth(y);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? Math.floor(cx - hw) - 1 : Math.ceil(cx + hw);
      for (let i = 0; i < u(2); i++) sheet.rect(edge + side * i, top + y, 1, u(1), IRON);
      sheet.rect(side < 0 ? edge + u(1) : edge - u(3), top + y - 1, u(2), u(1) + 2, '#5a4028');
    }
  }

  // Carico della nave coloniale: casse e botti.
  if (plan.cargo) {
    for (const [fy, fx] of [[0.42, -3], [0.42, 1], [0.5, -1], [0.74, -3], [0.74, 1]] as const) {
      const y = top + Math.floor(L * fy);
      sheet.rect(mid + u(fx), y, u(3), u(3), '#8a5a2e');
      sheet.line(mid + u(fx), y, mid + u(fx) + u(3) - 1, y + u(3) - 1, '#6a4220');
      sheet.rect(mid + u(fx), y, u(3), 1, '#a8743e');
    }
  }

  // Alberi: sartie, pennoni e vele trasversali gonfie.
  for (const m of plan.masts) {
    const y = top + Math.floor(L * m);
    const hw = halfWidth(L * m);
    const span = Math.floor(hw + u(plan.sailWidth));
    for (const side of [-1, 1]) {
      for (let r = 0; r < 3; r++) sheet.line(mid + side * Math.floor(hw - u(1)), y + u(3) + r * u(1.5), mid + side * u(1), y + u(1), ROPE);
    }
    const thick = u(cls === 'sloop' ? 4 : 6);
    for (let x = -span; x <= span; x++) {
      const edge = Math.abs(x) / span;
      const bulge = Math.round(u(2) * Math.max(0, 1 - edge * edge)); // la vela gonfia sporge al centro
      const rows = thick + bulge;
      for (let j = 0; j < rows; j++) {
        const t = j / rows;
        let c = t > 0.8 ? colors.sailShade : t < 0.15 ? shade(colors.sail, 0.14) : colors.sail;
        if (t > 0.55 && t <= 0.8 && edge > 0.6) c = shade(colors.sail, -0.06);
        if (t <= 0.8 && (x + 1000) % u(5) === 0) c = shade(c, -0.07); // cuciture dei teli
        sheet.set(mid + x, y - u(1) + j, c);
      }
    }
    for (let x = -span - u(1); x <= span + u(1); x++) sheet.rect(mid + x, y - u(2), 1, Math.max(1, u(0.7)), shade(colors.sailShade, -0.5));
    sheet.disc(mid + 0.5, y + u(2.2), u(1.6), '#4a3520'); // coffa
    sheet.disc(mid + 0.5, y + u(2.2), u(0.8), '#6a4a2a');
  }

  // Fiocchi a prua.
  if (plan.jib) {
    const rows = u(7);
    for (let j = 0; j < rows; j++) {
      const half = Math.floor((j / rows) * u(3.5));
      for (let x = -half; x <= half; x++) sheet.set(mid + x, top + u(1) + j, j >= rows - u(1) ? colors.sailShade : x === 0 ? shade(colors.sail, -0.05) : colors.sail);
    }
  }

  // Bandiera a poppa, mossa dal vento, e fanale.
  const fy = top + L - 1;
  sheet.rect(mid - u(3), fy + u(1), u(7), u(4), colors.flag);
  sheet.rect(mid - u(1), fy + u(2), u(3), u(2), colors.flagDetail);
  sheet.rect(mid + u(3), fy + u(4), u(1), u(1), shade(colors.flag, -0.3));
  sheet.rect(mid, fy, 1, u(1), ROPE);
  sheet.disc(mid + 0.5, top + L - u(5), u(0.9), '#f2d27a');

  sheet.outline(OUTLINE, Math.max(1, Math.round(k * 0.7)));
  return sheet;
}
