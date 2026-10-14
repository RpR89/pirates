import type { FactionId } from '../sim/factions';
import { shade } from './color';
import { PixelSheet } from './pixels';
import { UNIFORMS } from './portrait';
import { TILE_PX } from './terrain';

/** Scala rispetto a un soldatino disegnato per caselle da 72 px. */
const k = TILE_PX / 72;
const u = (v: number) => Math.max(1, Math.round(v * k));

interface TroopLook {
  coat: string;
  facing: string;
  trousers: string;
  hat: 'tricorne' | 'bandana' | 'none';
  hatColor: string;
  musket: boolean;
}

/** Aspetto dei soldati: la divisa "di truppa" della fazione, o la milizia dei coloni. */
export function troopLook(faction: FactionId | null, militia = false): TroopLook {
  if (!faction || militia) return { coat: '#8a6a44', facing: '#6a4a2a', trousers: '#c9b48a', hat: 'none', hatColor: '#4a3520', musket: false };
  const uni = UNIFORMS[faction][1];
  if (faction === 'pirati') return { coat: '#efe8d8', facing: '#3a5a9a', trousers: '#5a3a24', hat: 'bandana', hatColor: '#9e2a2a', musket: false };
  return { coat: uni.coat, facing: uni.facing, trousers: '#e8e0cc', hat: 'tricorne', hatColor: '#15151c', musket: true };
}

/**
 * Soldatino visto dall'alto in scorcio (circa un terzo di casella), con due pose
 * per la camminata. Le armi: moschetto per i regolari, sciabola per i pirati.
 */
export function drawTrooper(look: TroopLook, frame: 0 | 1): PixelSheet {
  const W = u(16);
  const H = u(26);
  const s = new PixelSheet(W, H);
  const cx = Math.floor(W / 2);
  // Gambe (alternate nella camminata).
  const legY = u(17);
  const step = frame === 0 ? u(1.5) : -u(1.5);
  s.rect(cx - u(4), legY + Math.max(0, step), u(3.2), u(7) - Math.abs(step), look.trousers);
  s.rect(cx + u(1), legY + Math.max(0, -step), u(3.2), u(7) - Math.abs(step), look.trousers);
  s.rect(cx - u(4), legY + u(6), u(3.2), u(2), '#2a2420');
  s.rect(cx + u(1), legY + u(6), u(3.2), u(2), '#2a2420');
  // Corpo: giubba con i risvolti e la cintura.
  s.rect(cx - u(5.5), u(8), u(11), u(10), look.coat);
  s.rect(cx - u(5.5), u(8), u(2), u(10), shade(look.coat, 0.12));
  s.rect(cx + u(3.5), u(8), u(2), u(10), shade(look.coat, -0.2));
  s.rect(cx - u(1.5), u(8), u(3), u(9), look.facing);
  s.rect(cx - u(5.5), u(15), u(11), u(1.2), '#2a2420');
  // Braccia.
  s.rect(cx - u(7.5), u(9), u(2.2), u(7), shade(look.coat, -0.08));
  s.rect(cx + u(5.3), u(9), u(2.2), u(7), shade(look.coat, -0.15));
  // Testa e copricapo.
  s.disc(cx + 0.5, u(5.5), u(3.6), '#e8c39e');
  s.rect(cx + u(1), u(5), u(2), u(1.5), shade('#e8c39e', -0.2));
  if (look.hat === 'tricorne') {
    s.rect(cx - u(5.5), u(1.5), u(11), u(3), look.hatColor);
    s.rect(cx - u(3.5), 0, u(7), u(2.5), look.hatColor);
    s.rect(cx - u(5.5), u(4), u(11), Math.max(1, u(0.6)), '#e8e0cc');
  } else if (look.hat === 'bandana') {
    s.rect(cx - u(3.8), u(1.5), u(7.6), u(3), look.hatColor);
    s.rect(cx + u(3.5), u(3), u(2.5), u(2), look.hatColor);
  } else {
    s.rect(cx - u(3.6), u(1.6), u(7.2), u(2.2), '#5a3a24'); // capelli
  }
  // Arma.
  if (look.musket) {
    s.rect(cx + u(6.5), 0, u(1.2), u(17), '#5a4028');
    s.rect(cx + u(6.5), 0, u(1.2), u(4), '#8d9098');
  } else {
    s.rect(cx + u(6.5), u(4), u(1), u(10), '#c4c7cc');
    s.rect(cx + u(5.5), u(13), u(3), u(1.2), '#e3b23c');
  }
  s.outline('#1b1712', Math.max(1, Math.round(k)));
  return s;
}

/** Scialuppa a remi vista dall'alto, prua verso l'alto, con i rematori. */
export function drawRowboat(look: TroopLook): PixelSheet {
  const W = u(22);
  const H = u(40);
  const s = new PixelSheet(W, H);
  const cx = W / 2;
  const L = H - u(4);
  for (let y = 0; y < L; y++) {
    const t = y / L;
    const half = (t < 0.3 ? Math.sqrt(t / 0.3) : t > 0.9 ? 1 - (t - 0.9) * 2 : 1) * u(7);
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const edge = Math.abs(x + 0.5 - cx) > half - u(1.4);
      s.set(x, u(2) + y, edge ? '#6e4a28' : (y % u(5) === 0 ? '#8a5e34' : '#b88a55'));
    }
  }
  // Banchi con i rematori e i remi.
  for (let r = 0; r < 3; r++) {
    const y = u(10) + r * u(8);
    s.rect(Math.floor(cx - u(5)), y, u(10), u(1.2), '#6e4a28');
    s.disc(cx, y - u(1.5), u(2.2), look.coat);
    s.disc(cx, y - u(2.5), u(1.4), '#e8c39e');
    s.line(Math.floor(cx - u(5)), y, Math.floor(cx - u(11)), y + u(3), '#5a4028');
    s.line(Math.floor(cx + u(5)), y, Math.floor(cx + u(11)), y + u(3), '#5a4028');
  }
  s.outline('#1b1712', Math.max(1, Math.round(k)));
  return s;
}
