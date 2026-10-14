import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, stepShip, type ShipInput } from './ship';

const bounds = { width: 320, height: 180, margin: 8 };
const idle: ShipInput = { left: false, right: false, up: false, down: false };
const start = { x: 160, y: 90, vx: 0, vy: 0 };

describe('stepShip', () => {
  it('resta ferma senza input', () => {
    expect(stepShip(start, idle, 1 / 60, bounds)).toEqual(start);
  });

  it('accelera nella direzione premuta', () => {
    const next = stepShip(start, { ...idle, right: true }, 1 / 60, bounds);
    expect(next.vx).toBeGreaterThan(0);
    expect(next.x).toBeGreaterThan(start.x);
    expect(next.vy).toBe(0);
  });

  it('non supera la velocità massima', () => {
    let s = start;
    for (let i = 0; i < 600; i++) {
      s = stepShip(s, { ...idle, right: true, down: true }, 1 / 60, { ...bounds, width: 1e6, height: 1e6 });
    }
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(DEFAULT_TUNING.maxSpeed + 1e-9);
  });

  it('rallenta per attrito quando si rilascia', () => {
    const moving = { ...start, vx: 50 };
    const next = stepShip(moving, idle, 1 / 60, bounds);
    expect(next.vx).toBeLessThan(50);
    expect(next.vx).toBeGreaterThan(0);
  });

  it('resta dentro i bordi e azzera la velocità contro il bordo', () => {
    const atEdge = { x: 311, y: 90, vx: 60, vy: 0 };
    const next = stepShip(atEdge, { ...idle, right: true }, 1 / 10, bounds);
    expect(next.x).toBe(bounds.width - bounds.margin);
    expect(next.vx).toBe(0);
  });
});
