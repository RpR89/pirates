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
}

const PLANS: Record<ShipClass, ShipPlan> = {
  sloop: { masts: [0.42], sailWidth: 4, guns: 2, stripe: false, cargo: false, jib: true },
  brigantino: { masts: [0.3, 0.6], sailWidth: 6, guns: 4, stripe: false, cargo: false, jib: true },
  fregata: { masts: [0.24, 0.47, 0.7], sailWidth: 8, guns: 7, stripe: true, cargo: false, jib: true },
  galeone: { masts: [0.24, 0.46, 0.68], sailWidth: 8, guns: 8, stripe: true, cargo: false, jib: false },
  mercantile: { masts: [0.3, 0.64], sailWidth: 6, guns: 0, stripe: false, cargo: true, jib: false },
};

const DECK = '#b8874f';
const DECK_DARK = '#9a6d3c';
const OUTLINE = '#1b1712';

/** Margine dello sprite attorno allo scafo (vele e bompresso sporgono). */
export function shipSpriteSize(cls: ShipClass): { w: number; h: number } {
  const s = SHIPS[cls];
  return { w: s.beam + PLANS[cls].sailWidth * 2 + 4, h: s.length + 8 };
}

/** Disegna una nave vista dall'alto, con la prua verso l'alto. */
export function drawShip(cls: ShipClass, colors: LookColors): PixelSheet {
  const stats = SHIPS[cls];
  const plan = PLANS[cls];
  const { w, h } = shipSpriteSize(cls);
  const sheet = new PixelSheet(w, h);
  const L = stats.length;
  const B = stats.beam;
  const top = 5; // spazio per il bompresso
  const cx = w / 2;

  const halfWidth = (y: number): number => {
    const t = y / L;
    if (t < 0.38) return (B / 2) * Math.sqrt(Math.max(0, t / 0.38)) * 0.98 + 0.4;
    if (t > 0.9) return (B / 2) * (1 - (t - 0.9) * 1.2);
    return B / 2;
  };

  // Bompresso.
  if (plan.jib) {
    for (let y = top - 4; y < top + 2; y++) sheet.set(Math.floor(cx), y, '#5a4028');
  }

  // Scafo.
  const hull = colors.hull;
  for (let y = 0; y < L; y++) {
    const hw = halfWidth(y + 0.5);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx > hw) continue;
      let c: string;
      if (dx > hw - 1) c = shade(hull, -0.35);
      else if (dx > hw - 2) c = plan.stripe && y % 4 < 2 ? colors.hullStripe : hull;
      else if (dx > hw - 2.6 && y > L * 0.15) c = shade(hull, 0.15);
      else c = (Math.floor(x - cx + 50) % 3 === 0) ? DECK_DARK : DECK;
      sheet.set(x, top + y, c);
    }
  }

  // Cassero di poppa (ponte rialzato).
  const qd = Math.floor(L * 0.84);
  for (let y = qd; y < L - 1; y++) {
    const hw = halfWidth(y + 0.5) - 2;
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      if (dx <= hw) sheet.set(x, top + y, y === qd ? shade(DECK, -0.35) : shade(DECK, 0.12));
    }
  }

  // Cannoni sui fianchi.
  for (let g = 0; g < plan.guns; g++) {
    const y = Math.floor(L * 0.3 + ((L * 0.5) / Math.max(1, plan.guns)) * g);
    const hw = halfWidth(y);
    sheet.set(Math.floor(cx - hw - 1), top + y, '#2a2a2e');
    sheet.set(Math.ceil(cx + hw), top + y, '#2a2a2e');
  }

  // Carico della nave coloniale.
  if (plan.cargo) {
    for (const [fy, fx] of [[0.46, -2], [0.46, 1], [0.53, -1]] as const) {
      const y = top + Math.floor(L * fy);
      sheet.rect(Math.floor(cx + fx * 2), y, 3, 3, '#8a5a2e');
      sheet.set(Math.floor(cx + fx * 2), y, '#a8743e');
    }
  }

  // Alberi e vele trasversali.
  for (const m of plan.masts) {
    const y = top + Math.floor(L * m);
    const span = Math.floor(halfWidth(L * m) + plan.sailWidth);
    const thick = cls === 'sloop' ? 3 : 4;
    for (let x = -span; x <= span; x++) {
      const edge = Math.abs(x) / span;
      const bulge = edge < 0.8 ? 1 : 0; // la vela gonfia sporge al centro
      for (let j = 0; j < thick + bulge; j++) {
        const yy = y - 1 + j;
        const c = j === thick + bulge - 1 ? colors.sailShade : j === 0 ? shade(colors.sail, 0.1) : colors.sail;
        sheet.set(Math.floor(cx + x), yy, c);
      }
    }
    // Pennone e coffa.
    for (let x = -span; x <= span; x++) sheet.set(Math.floor(cx + x), y - 2, shade(colors.sailShade, -0.45));
    sheet.rect(Math.floor(cx) - 1, y, 2, 2, '#4a3520');
  }

  // Vela di fiocco (triangolo verso prua).
  if (plan.jib) {
    for (let j = 0; j < 5; j++) {
      for (let x = -Math.floor(j / 2); x <= Math.floor(j / 2); x++) sheet.set(Math.floor(cx + x), top + 1 + j, colors.sail);
    }
  }

  // Bandiera a poppa.
  const fy = top + L - 1;
  sheet.rect(Math.floor(cx) - 2, fy, 5, 3, colors.flag);
  sheet.set(Math.floor(cx), fy + 1, colors.flagDetail);
  sheet.set(Math.floor(cx) - 1, fy + 1, colors.flagDetail);

  sheet.outline(OUTLINE);
  return sheet;
}
