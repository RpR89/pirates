import { hash2, shade } from './color';
import { PixelSheet } from './pixels';
import { CELL_PX, TILE_PX } from './terrain';

const K = TILE_PX / 16;

/**
 * Casella edificio di strada (bit dei vicini: 1 N, 2 E, 4 S, 8 O): la casella è
 * tutta lastricata, con il bordo sui lati senza vicini e gli angoli esterni arrotondati,
 * così i tratti affiancati si fondono senza buchi.
 * Sterrato nei villaggi, acciottolato quando la città cresce.
 */
export function drawRoad(mask: number, cobbled: boolean): PixelSheet {
  const T = CELL_PX;
  const s = new PixelSheet(T, T);
  const open = { n: !(mask & 1), e: !(mask & 2), s: !(mask & 4), w: !(mask & 8) };
  const rim = K * 0.7;
  const round = K * 1.6;
  const stone = Math.max(3, Math.round(K * 1.3));
  const corner = (dx: number, dy: number) => dx < round && dy < round && Math.hypot(round - dx, round - dy) > round;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const xr = T - 1 - x;
      const yb = T - 1 - y;
      if ((open.n && open.w && corner(x, y)) || (open.n && open.e && corner(xr, y)) || (open.s && open.w && corner(x, yb)) || (open.s && open.e && corner(xr, yb))) continue;
      const edge = (open.n && y < rim) || (open.s && yb < rim) || (open.w && x < rim) || (open.e && xr < rim);
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
        // Solchi dei carri lungo i tratti dritti.
        const vertical = !open.n || !open.s;
        const horizontal = !open.e || !open.w;
        if (!edge && ((vertical && Math.abs(Math.abs(x + 0.5 - T / 2) - T * 0.2) < K * 0.25) || (horizontal && Math.abs(Math.abs(y + 0.5 - T / 2) - T * 0.2) < K * 0.25))) col = shade(col, -0.1);
      }
      s.set(x, y, col);
    }
  }
  return s;
}
