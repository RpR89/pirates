# Pirates — note per Claude

- Gioco 2D pixel art: Phaser 4 + Vite + TypeScript. Testi UI e commenti in italiano.
- Risoluzione logica 320×180 (`src/config.ts`), scalata con `Scale.FIT`; `pixelArt: true` — non usare coordinate frazionarie per elementi statici.
- Sprite: per ora griglie di caratteri in `src/art/sprites.ts` con colori da `src/art/palette.ts`; asset PNG veri vanno in `public/assets/`.
- Tenere la logica di gioco (fisica, regole, stato) in `src/logic/` come funzioni pure con test Vitest accanto (`*.test.ts`); le scene si limitano a input e rendering.
- Prima di pushare: `npm run typecheck && npm test && npm run build`.
