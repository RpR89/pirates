# Pirates

Strategia in tempo reale 2D in pixel art a tema pirati. Costruisci il tuo villaggio,
vara una flotta, affonda o abborda le navi nemiche, fonda nuove colonie e conquista
i villaggi avversari in un arcipelago di dimensioni definite.

Oggi si gioca in single player contro l'IA (Barbanera); l'architettura è pronta
per il multiplayer.

## Come si gioca

| Comando | Azione |
| --- | --- |
| Clic sinistro | Seleziona una nave o un villaggio (Shift aggiunge) |
| Trascina | Selezione multipla delle navi |
| Clic destro | Muovi, attacca una nave o un villaggio, fonda (nave colonia su una costa) |
| `1`–`7` | Costruisci navi ed edifici nel villaggio selezionato |
| `B` | Abbordaggio: le navi sotto il 30% di PF vengono catturate invece che affondate |
| `X` | Ferma le navi selezionate |
| Frecce / WASD, rotella | Scorri la mappa, zoom |
| `H` / `P` | Torna al villaggio / pausa |

- **Villaggi** producono oro e legno. Edifici: *cantiere* (navi; livello 2 per il
  galeone), *mercato* (oro), *segheria* (legno), *forte* (PF e cannoni).
- **Navi**: *sloop* (veloce), *galeone* (potente), *colonia* (fonda un villaggio).
- **Conquista**: porta un villaggio a 0 PF e avvicina una nave.
- **Vittoria**: elimina tutti gli avversari (niente villaggi né navi).

Con `?seed=123` nell'URL si rigioca la stessa mappa; con `?debug` il gioco è
ispezionabile da console (`window.game`).

## Architettura

```
src/
  sim/        simulazione pura e deterministica, nessuna dipendenza da Phaser
    state.ts        tipi dello stato e creazione della partita
    simulation.ts   step(): avanza di un tick applicando i comandi
    commands.ts     tutto ciò che un giocatore può fare
    rules.ts        bilanciamento (costi, statistiche, tempi)
    map.ts          generazione dell'arcipelago da seed
    pathfinding.ts  A* sul mare
    ai.ts           IA: legge lo stato ed emette comandi come un giocatore
  net/        sessione a passo fisso e transport dei comandi
  render/     palette, sprite pixel art, font bitmap, texture
  scenes/     Phaser: Boot, World (mappa, unità, input), Hud (interfaccia)
```

Principi che tengono aperto il multiplayer:

1. **Simulazione separata dalla grafica.** La grafica legge lo stato e gli eventi,
   non lo modifica mai.
2. **Solo comandi.** Giocatore e IA agiscono esclusivamente con `Command`
   serializzabili, validati dalla simulazione (non si comanda ciò che non è tuo).
3. **Tick fissi e determinismo.** 10 tick/s, nessun `Math.random` né orologio nella
   simulazione; `hashState()` serve a rilevare desincronizzazioni.
4. **Transport intercambiabile.** `LocalTransport` oggi; per il multiplayer basta
   un transport di rete (lockstep o server autoritativo) che implementi
   `CommandTransport`.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # test della simulazione
npm run typecheck
npm run build      # build di produzione in dist/
```

## Deploy

Il repository è pensato per Vercel (preset Vite, nessuna configurazione): ogni
push su `main` va in produzione, ogni pull request riceve un'anteprima.
