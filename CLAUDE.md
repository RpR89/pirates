# Pirates — note per Claude

- RTS 2D in pixel art a tema pirati, vista dall'alto: Phaser 4 (mondo) + Preact (menu) + Vite + TypeScript. Testi UI e commenti in italiano.
- **Il multiplayer deve restare possibile.** Regole non negoziabili:
  - Tutta la logica di gioco sta in `src/sim/`, senza import da Phaser, Preact né dal DOM.
  - La simulazione è deterministica: niente `Math.random`, `Date`, `performance`, `Math.hypot`/trigonometria nel codice di `src/sim/` (usa `mulberry32` con seed e `Math.sqrt`).
  - Ogni azione di giocatore o IA è un `Command` (`src/sim/commands.ts`) applicato in `step()`; scene e UI non modificano mai lo stato: passano da `GameController.issue()`.
  - Ogni comando va validato nella simulazione (proprietario, costi, requisiti). Le funzioni `*Problem()` in `simulation.ts`/`state.ts` danno il motivo in italiano e servono anche alla UI.
- Bilanciamento solo in `src/sim/rules.ts`; fazioni, bonus e nomi propri in `src/sim/factions.ts`; capitano (abilità, livelli, bonus) in `src/sim/hero.ts`.
- Grafica procedurale in `src/render/` con `TILE_PX` = 72 px per casella: navi, edifici, mura, soldati e ritratti disegnati con `PixelSheet` e scalati da `TILE_PX`. `npm run dev` → `/art.html` mostra la galleria di tutti gli sprite.
- Il terreno non sta tutto in memoria: `TerrainStreamer` lo genera a blocchi vicino alla visuale in Web Worker (`terrainWorker.ts`), scarta quelli lontani e mostra sotto un'anteprima a bassa risoluzione. Zoom a livelli fissi (0.2–1), filtro lineare.
- Sbarchi e assedi sono animati da `src/scenes/SiegeLayer.ts`, che segue lo stato della simulazione (solo grafica).
- Le difese sono edifici con `defense`/`militia`/`moat` in `rules.ts`, sommati da `fortifications()` in `simulation.ts`; quelle a linea (`line: true`) si tracciano trascinando e si disegnano con le giunzioni in 8 direzioni (`fortArt.ts`). Bastioni e batterie sono orientati dalla scena (verso l'esterno / verso il mare). Le porte (`porta`) sostituiscono un tratto di mura/terrapieno (`isGateSite()` in `state.ts`), si orientano perpendicolari ai tratti vicini e sono in pietra se toccano le mura (bit 256 della variante).
- Le strade (`src/scenes/RoadLayer.ts`) sono solo grafica: percorsi minimi dalle porte degli edifici alla piazza; mura e terrapieni le fermano, porte della cinta e fossati no. `findPlacement()` (IA e città iniziali) lascia libere le caselle davanti alle porte.
- `src/game/controller.ts` collega sessione, scena e menu (selezione, modalità di piazzamento/sbarco, messaggi).
- Test Vitest accanto ai file in `src/sim/` (`*.test.ts`); helper in `src/sim/testing.ts`.
- `?debug` espone `window.game` e `window.ctl`; `?autostart&faction=pirati&seed=42&rivals=2` salta il menu (test end-to-end con Playwright).
- Prima di pushare: `npm run typecheck && npm test && npm run build`.
