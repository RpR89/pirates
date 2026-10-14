# Pirates — note per Claude

- RTS 2D in pixel art a tema pirati, vista dall'alto: Phaser 4 (mondo) + Preact (menu) + Vite + TypeScript. Testi UI e commenti in italiano.
- **Il multiplayer deve restare possibile.** Regole non negoziabili:
  - Tutta la logica di gioco sta in `src/sim/`, senza import da Phaser, Preact né dal DOM.
  - La simulazione è deterministica: niente `Math.random`, `Date`, `performance`, `Math.hypot`/trigonometria nel codice di `src/sim/` (usa `mulberry32` con seed e `Math.sqrt`).
  - Ogni azione di giocatore o IA è un `Command` (`src/sim/commands.ts`) applicato in `step()`; scene e UI non modificano mai lo stato: passano da `GameController.issue()`.
  - Ogni comando va validato nella simulazione (proprietario, costi, requisiti). Le funzioni `*Problem()` in `simulation.ts`/`state.ts` danno il motivo in italiano e servono anche alla UI.
- Bilanciamento solo in `src/sim/rules.ts`; fazioni, bonus e nomi propri in `src/sim/factions.ts`; capitano (abilità, livelli, bonus) in `src/sim/hero.ts`.
- Grafica procedurale in `src/render/` (terreno a blocchi, `TILE_PX` = 24 px per casella; navi, edifici, mura e ritratti disegnati con `PixelSheet`, scalati con `TILE_PX / 16`). `npm run dev` → `/art.html` mostra la galleria di tutti gli sprite.
- `src/game/controller.ts` collega sessione, scena e menu (selezione, modalità di piazzamento/sbarco, messaggi).
- Test Vitest accanto ai file in `src/sim/` (`*.test.ts`); helper in `src/sim/testing.ts`.
- `?debug` espone `window.game` e `window.ctl`; `?autostart&faction=pirati&seed=42&rivals=2` salta il menu (test end-to-end con Playwright).
- Prima di pushare: `npm run typecheck && npm test && npm run build`.
