import { AIController } from '../sim/ai';
import type { Command, PlayerCommand } from '../sim/commands';
import { TICK_MS } from '../sim/rules';
import { step } from '../sim/simulation';
import type { GameEvent, GameState, PlayerId } from '../sim/state';
import type { CommandTransport } from './transport';

/** Ritardo (in tick) tra l'emissione di un comando e la sua esecuzione. */
export const INPUT_DELAY_TICKS = 1;

/**
 * Fa girare la simulazione a passo fisso, raccogliendo i comandi dal transport
 * e dalle IA. La grafica legge lo stato e gli eventi, ma non lo modifica mai.
 */
export class GameSession {
  private accumulator = 0;
  private pendingEvents: GameEvent[] = [];
  paused = false;

  constructor(
    readonly state: GameState,
    readonly localPlayer: PlayerId,
    private readonly transport: CommandTransport,
    private readonly ais: AIController[] = [],
  ) {}

  issue(command: Command): void {
    const c: PlayerCommand = {
      player: this.localPlayer,
      tick: this.state.tick + INPUT_DELAY_TICKS,
      command,
    };
    this.transport.send(c);
  }

  /** Avanza del tempo reale trascorso; esegue zero o più tick. */
  advance(deltaMs: number): void {
    if (this.paused || this.state.winner !== null) return;
    this.accumulator = Math.min(this.accumulator + deltaMs, TICK_MS * 10);
    while (this.accumulator >= TICK_MS && this.transport.ready(this.state.tick)) {
      const commands = this.transport.collect(this.state.tick);
      for (const ai of this.ais) {
        for (const command of ai.think(this.state)) {
          commands.push({ player: ai.player, tick: this.state.tick, command });
        }
      }
      step(this.state, commands);
      this.pendingEvents.push(...this.state.events);
      this.accumulator -= TICK_MS;
    }
  }

  /** Frazione del tick corrente già trascorsa, per interpolare le posizioni. */
  get alpha(): number {
    return this.accumulator / TICK_MS;
  }

  drainEvents(): GameEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }
}
