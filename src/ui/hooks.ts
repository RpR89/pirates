import { useEffect, useReducer } from 'preact/hooks';
import type { GameController } from '../game/controller';

/** Ridisegna il componente quando il controller cambia e, comunque, alcune volte al secondo. */
export function useGame(ctl: GameController, everyMs = 250): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const force = () => bump(undefined);
    const unsubscribe = ctl.subscribe(force);
    const timer = window.setInterval(force, everyMs);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [ctl, everyMs]);
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('it-IT');
}

export function rate(n: number): string {
  const perMin = n * 60;
  return `${perMin >= 0 ? '+' : ''}${Math.round(perMin)}/min`;
}
