export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Schiarisce (amount > 0) o scurisce (amount < 0) un colore. */
export function shade(c: string, amount: number): string {
  const rgb = hex(c);
  return toHex(amount >= 0 ? mix(rgb, [255, 255, 255], amount) : mix(rgb, [0, 0, 0], -amount));
}

export function toNumber(c: string): number {
  return parseInt(c.slice(1), 16);
}

/** Hash intero deterministico per i dettagli decorativi. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 1442695041, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Matrice di Bayer 4×4 per il dithering ordinato (valori 0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x: number, y: number): number {
  return BAYER[(y & 3) * 4 + (x & 3)];
}
