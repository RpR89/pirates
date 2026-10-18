import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import { TILE_PX } from './terrain';

const K = TILE_PX / 16;

/**
 * Casella di strada che si collega ai vicini (bit: 1 N, 2 E, 4 S, 8 O).
 * Sterrato nei villaggi, acciottolato quando la città cresce.
 */
export function drawRoad(mask: number, cobbled: boolean): PixelSheet {
  const T = TILE_PX;
  const s = new PixelSheet(T, T);
  const half = T * 0.22;
  const c = T / 2;
  const arms: [number, number][] = [];
  if (mask & 1) arms.push([0, -1]);
  if (mask & 2) arms.push([1, 0]);
  if (mask & 4) arms.push([0, 1]);
  if (mask & 8) arms.push([-1, 0]);
  const dist = (x: number, y: number) => {
    let d = Math.hypot(x - c, y - c) - (arms.length >= 3 ? half * 0.25 : 0);
    for (const [ax, ay] of arms) {
      const t = Math.max(0, ((x - c) * ax + (y - c) * ay) / (T / 2));
      const px = c + ax * Math.min(1, t) * (T / 2);
      const py = c + ay * Math.min(1, t) * (T / 2);
      d = Math.min(d, Math.hypot(x - px, y - py));
    }
    return d;
  };
  const stone = Math.max(3, Math.round(K * 1.3));
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = dist(x + 0.5, y + 0.5);
      if (d > half) continue;
      const edge = d > half - K * 0.7;
      const n = hash2(x, y, 12);
      let col: string;
      if (cobbled) {
        const row = Math.floor(y / stone);
        const joint = y % stone === 0 || (x + (row % 2) * Math.floor(stone / 2)) % stone === 0;
        const tone = hash2(Math.floor((x + (row % 2) * Math.floor(stone / 2)) / stone), row, 3) % 4;
        col = joint ? '#7d776c' : tone === 0 ? '#bdb6a6' : tone === 1 ? '#a39c8c' : '#b1aa99';
        if (edge) col = '#8a8272';
      } else {
        col = n % 9 === 0 ? '#9c7a4e' : n % 13 === 0 ? '#c4a676' : '#b39062';
        if (edge) col = n % 3 ? '#9c7e52' : '#8a6c44';
        // Solchi dei carri.
        if (!edge && Math.abs(d - half * 0.45) < K * 0.25) col = shade(col, -0.1);
      }
      s.set(x, y, col);
    }
  }
  return s;
}
