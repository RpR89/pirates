// Logica di movimento della nave, indipendente da Phaser così da poterla testare.

export interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ShipInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface ShipTuning {
  acceleration: number; // px/s²
  drag: number; // frazione di velocità persa al secondo (0..1)
  maxSpeed: number; // px/s
}

export interface Bounds {
  width: number;
  height: number;
  margin: number;
}

export const DEFAULT_TUNING: ShipTuning = {
  acceleration: 160,
  drag: 0.9,
  maxSpeed: 70,
};

export function stepShip(
  state: ShipState,
  input: ShipInput,
  dt: number,
  bounds: Bounds,
  tuning: ShipTuning = DEFAULT_TUNING,
): ShipState {
  const ax = (Number(input.right) - Number(input.left)) * tuning.acceleration;
  const ay = (Number(input.down) - Number(input.up)) * tuning.acceleration;

  const damping = Math.pow(1 - tuning.drag, dt);
  let vx = (state.vx + ax * dt) * damping;
  let vy = (state.vy + ay * dt) * damping;

  const speed = Math.hypot(vx, vy);
  if (speed > tuning.maxSpeed) {
    vx = (vx / speed) * tuning.maxSpeed;
    vy = (vy / speed) * tuning.maxSpeed;
  }

  const x = clamp(state.x + vx * dt, bounds.margin, bounds.width - bounds.margin);
  const y = clamp(state.y + vy * dt, bounds.margin, bounds.height - bounds.margin);

  return { x, y, vx: x === state.x + vx * dt ? vx : 0, vy: y === state.y + vy * dt ? vy : 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
