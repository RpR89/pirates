import { SHIPS, type ShipClass } from '../sim/rules';
import { shade } from './color';
import { PixelSheet } from './pixels';

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
  sailWidth: number; // pixel oltre la larghezza dello scafo
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
  return { w: s.beam + PLANS[cls].sailWidth * 2 + 6, h: s.length + 12 };
}

/** Disegna una nave vista dall'alto, con la prua verso l'alto. */
export function drawShip(cls: ShipClass, colors: LookColors): PixelSheet {
  const stats = SHIPS[cls];
  const plan = PLANS[cls];
  const { w, h } = shipSpriteSize(cls);
  const sheet = new PixelSheet(w, h);
  const L = stats.length;
  const B = stats.beam;
  const top = 7; // spazio per il bompresso
  const cx = w / 2;
  const mid = Math.floor(cx);

  const halfWidth = (y: number): number => {
    const t = y / L;
    if (t < 0.36) return (B / 2) * Math.sqrt(Math.max(0, t / 0.36)) * 0.98 + 0.4;
    if (t > 0.9) return (B / 2) * (1 - (t - 0.9) * 1.3);
    return B / 2;
  };

  // Bompresso con il suo strallo.
  if (plan.jib) {
    for (let y = top - 6; y < top + 3; y++) sheet.set(mid, y, '#5a4028');
    sheet.set(mid, top - 6, shade('#5a4028', 0.3));
  }

  // Scafo: fiancata, cinta colorata, ponte di tavole.
  const hull = colors.hull;
  for (let y = 0; y < L; y++) {
    const hw = halfWidth(y + 0.5);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx > hw) continue;
      let c: string;
      if (dx > hw - 1) c = shade(hull, -0.35);
      else if (dx > hw - 2) c = hull;
      else if (dx > hw - 3) c = plan.stripe && y % 6 < 3 ? colors.hullStripe : shade(hull, 0.12);
      else if (dx > hw - 4 && y > L * 0.12) c = shade(DECK, -0.25); // parapetto
      else {
        // Tavole lungo la nave, con giunte sfalsate.
        const plank = Math.floor(x - cx + 100);
        c = plank % 3 === 0 ? DECK_DARK : (y + plank * 5) % 11 === 0 ? DECK_DARK : DECK;
        if (plank % 3 === 1 && (y + plank) % 7 === 0) c = DECK_LIGHT;
      }
      sheet.set(x, top + y, c);
    }
  }

  // Cassero di poppa e castello di prua (ponti rialzati).
  const qd = Math.floor(L * 0.82);
  for (let y = qd; y < L - 2; y++) {
    const hw = halfWidth(y + 0.5) - 3;
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx <= hw) sheet.set(x, top + y, y === qd ? shade(DECK, -0.4) : (x + y) % 3 === 0 ? DECK : DECK_LIGHT);
    }
  }
  // Finestre della cabina del capitano a poppa.
  for (let i = -2; i <= 2; i += 2) sheet.set(mid + i, top + L - 3, '#f2d27a');

  // Boccaporti sul ponte.
  for (const f of [0.36, 0.56]) {
    if (plan.masts.some((m) => Math.abs(m - f) < 0.06)) continue;
    const y = top + Math.floor(L * f);
    sheet.rect(mid - 2, y, 4, 3, shade(DECK, -0.45));
    sheet.rect(mid - 1, y + 1, 2, 1, '#3b2a1a');
  }

  // Scialuppa di servizio.
  if (plan.boat) {
    const y = top + Math.floor(L * 0.5) - 2;
    sheet.rect(mid - 2, y, 4, 7, '#7a5230');
    sheet.rect(mid - 1, y + 1, 2, 5, '#a8784a');
  }

  // Cannoni: bocche sporgenti dai due fianchi (doppia fila sui vascelli grandi).
  for (let g = 0; g < plan.guns; g++) {
    const y = Math.floor(L * 0.26 + ((L * 0.56) / Math.max(1, plan.guns)) * g);
    const hw = halfWidth(y);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? Math.floor(cx - hw) - 1 : Math.ceil(cx + hw);
      sheet.set(edge, top + y, IRON);
      sheet.set(edge + side, top + y, IRON);
    }
  }

  // Carico della nave coloniale: casse e botti.
  if (plan.cargo) {
    for (const [fy, fx] of [[0.42, -3], [0.42, 1], [0.5, -1], [0.74, -3], [0.74, 1]] as const) {
      const y = top + Math.floor(L * fy);
      sheet.rect(mid + fx, y, 3, 3, '#8a5a2e');
      sheet.set(mid + fx + 1, y + 1, '#a8743e');
    }
  }

  // Alberi: sartie, pennoni e vele trasversali gonfie.
  for (const m of plan.masts) {
    const y = top + Math.floor(L * m);
    const hw = halfWidth(L * m);
    const span = Math.floor(hw + plan.sailWidth);
    // Sartie dal fianco all'albero.
    for (const side of [-1, 1]) sheet.line(mid + side * Math.floor(hw - 1), y + 4, mid + side, y + 1, ROPE);
    const thick = cls === 'sloop' ? 4 : 6;
    for (let x = -span; x <= span; x++) {
      const edge = Math.abs(x) / span;
      const bulge = edge < 0.85 ? (edge < 0.5 ? 2 : 1) : 0; // il centro della vela è più gonfio
      for (let j = 0; j < thick + bulge; j++) {
        const last = j === thick + bulge - 1;
        let c = last ? colors.sailShade : j === 0 ? shade(colors.sail, 0.12) : colors.sail;
        if (!last && j > 0 && (x + 100) % 5 === 0) c = shade(colors.sail, -0.06); // cuciture dei teli
        sheet.set(mid + x, y - 1 + j, c);
      }
    }
    for (let x = -span - 1; x <= span + 1; x++) sheet.set(mid + x, y - 2, shade(colors.sailShade, -0.5));
    sheet.rect(mid - 1, y + 1, 3, 3, '#4a3520'); // coffa
    sheet.set(mid, y + 2, '#6a4a2a');
  }

  // Fiocchi a prua.
  if (plan.jib) {
    for (let j = 0; j < 7; j++) {
      const half = Math.floor(j / 2);
      for (let x = -half; x <= half; x++) sheet.set(mid + x, top + 1 + j, j === 6 ? colors.sailShade : colors.sail);
    }
  }

  // Bandiera a poppa, mossa dal vento.
  const fy = top + L - 1;
  sheet.rect(mid - 3, fy + 1, 7, 4, colors.flag);
  sheet.rect(mid - 1, fy + 2, 3, 2, colors.flagDetail);
  sheet.set(mid + 3, fy + 4, shade(colors.flag, -0.3));
  sheet.set(mid, fy, ROPE);

  sheet.outline(OUTLINE);
  return sheet;
}
