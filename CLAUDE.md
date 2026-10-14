# Pirates — note per Claude

- RTS 2D pixel art a tema pirati: Phaser 4 + Vite + TypeScript. Testi UI e commenti in italiano.
- **Il multiplayer deve restare possibile.** Regole non negoziabili:
  - Tutta la logica di gioco sta in `src/sim/`, senza import da Phaser né dal DOM.
  - La simulazione è deterministica: niente `Math.random`, `Date`, `performance`, `Math.hypot`/trigonometria nel codice di `src/sim/` (usa `mulberry32` con seed e `Math.sqrt`).
  - Ogni azione di giocatore o IA è un `Command` (`src/sim/commands.ts`) applicato in `step()`; le scene non modificano mai lo stato direttamente.
  - Ogni comando va validato nella simulazione (proprietario, costi, requisiti).
- Bilanciamento solo in `src/sim/rules.ts`.
- Risoluzione logica 480×270 (`src/config.ts`), `pixelArt: true`. Testo con il font bitmap `pixel` (`src/render/font.ts`, solo maiuscole: passa da `fontText()`).
- Sprite come griglie di caratteri in `src/render/sprites.ts`; `f` = colore del proprietario.
- Test Vitest accanto ai file in `src/sim/` (`*.test.ts`); helper in `src/sim/testing.ts`.
- `?debug` espone `window.game` per i test end-to-end con Playwright.
- Prima di pushare: `npm run typecheck && npm test && npm run build`.
