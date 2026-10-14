import type { PlayerCommand } from '../sim/commands';

/**
 * Canale dei comandi tra i giocatori e la simulazione.
 * In single player è locale; per il multiplayer basterà un'implementazione di
 * rete (lockstep: ogni client invia i propri comandi per un tick futuro e
 * avanza solo quando ha ricevuto quelli di tutti).
 */
export interface CommandTransport {
  /** Invia un comando del giocatore locale. */
  send(command: PlayerCommand): void;
  /** Comandi di tutti i giocatori da applicare al tick indicato. */
  collect(tick: number): PlayerCommand[];
  /** false se mancano ancora comandi remoti per questo tick (la simulazione aspetta). */
  ready(tick: number): boolean;
}

export class LocalTransport implements CommandTransport {
  private queue: PlayerCommand[] = [];

  send(command: PlayerCommand): void {
    this.queue.push(command);
  }

  collect(tick: number): PlayerCommand[] {
    const due = this.queue.filter((c) => c.tick <= tick);
    this.queue = this.queue.filter((c) => c.tick > tick);
    return due;
  }

  ready(): boolean {
    return true;
  }
}
