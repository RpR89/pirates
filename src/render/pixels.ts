import { hex, type RGB } from './color';

/** Piccolo "foglio" di pixel su cui disegnare sprite in modo procedurale. */
export class PixelSheet {
  readonly data: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, color: string | RGB, alpha = 1): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const c = typeof color === 'string' ? hex(color) : color;
    const i = (y * this.width + x) * 4;
    if (alpha >= 1 || this.data[i + 3] === 0) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = Math.round(alpha * 255);
    } else {
      this.data[i] = this.data[i] + (c[0] - this.data[i]) * alpha;
      this.data[i + 1] = this.data[i + 1] + (c[1] - this.data[i + 1]) * alpha;
      this.data[i + 2] = this.data[i + 2] + (c[2] - this.data[i + 2]) * alpha;
    }
  }

  rect(x: number, y: number, w: number, h: number, color: string | RGB, alpha = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color, alpha);
  }

  /** Contorno di un rettangolo. */
  frame(x: number, y: number, w: number, h: number, color: string | RGB): void {
    for (let i = 0; i < w; i++) {
      this.set(x + i, y, color);
      this.set(x + i, y + h - 1, color);
    }
    for (let j = 0; j < h; j++) {
      this.set(x, y + j, color);
      this.set(x + w - 1, y + j, color);
    }
  }

  disc(cx: number, cy: number, r: number, color: string | RGB, alpha = 1): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, color, alpha);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string | RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      this.set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), color);
    }
  }

  isEmpty(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.data[(y * this.width + x) * 4 + 3] === 0;
  }

  /** Aggiunge un contorno scuro attorno ai pixel pieni (stile sprite). */
  outline(color: string | RGB): void {
    const add: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.isEmpty(x, y)) continue;
        if (!this.isEmpty(x + 1, y) || !this.isEmpty(x - 1, y) || !this.isEmpty(x, y + 1) || !this.isEmpty(x, y - 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, color);
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.width, this.height), 0, 0);
    return canvas;
  }
}
