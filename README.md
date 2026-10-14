# Pirates

Gioco 2D in pixel art a tema pirati.

## Stack

- [Phaser 4](https://phaser.io) — motore di gioco 2D (modalità `pixelArt` attiva)
- [Vite](https://vite.dev) + TypeScript — sviluppo e build
- [Vitest](https://vitest.dev) — test della logica di gioco
- [Vercel](https://vercel.com) — deploy automatico (preset Vite, nessuna configurazione)

## Comandi

```bash
npm install
npm run dev        # server di sviluppo su http://localhost:5173
npm test           # test
npm run typecheck  # controllo tipi
npm run build      # build di produzione in dist/
```

## Struttura

```
src/
  main.ts          configurazione Phaser
  config.ts        risoluzione logica (320×180, scalata)
  art/             palette e sprite in pixel art (griglie di caratteri)
  logic/           logica pura, testabile senza Phaser
  scenes/          scene Phaser (Boot → Sea)
public/assets/     sprite PNG, suoni, mappe
```

## Controlli

Frecce o WASD per muovere la nave. Raccogli i dobloni.

## Deploy

Importa il repository su Vercel (Add New → Project). Ogni push su `main`
va in produzione, ogni pull request riceve un URL di anteprima.
