# Pirates

Strategia in tempo reale in pixel art, vista dall'alto, nei mari dei Caraibi.
Scegli una bandiera (Fratellanza della Costa, Royal Navy, Marine Royale o Armada
Española), fai crescere le tue città, arruola uomini, vara navi a cui dai un nome
e conquista l'arcipelago. Single player contro l'IA, con l'architettura pronta
per il multiplayer.

## Come si gioca

- **Città.** Clicca sul municipio per il menu della città. Con *Costruisci* scegli
  un edificio e lo piazzi tu, dove vuoi, entro il cerchio della città: case
  (abitanti), fattorie e pescherie (cibo), segheria (legno), mercato (oro),
  cantiere navale, caserma, torri di difesa. Cantiere e pescheria vanno sulla costa.
- **Popolazione e cibo.** Gli abitanti crescono se c'è cibo e posto nelle case,
  e pagano le tasse. Abitanti e uomini mangiano: in carestia la gente se ne va e
  gli uomini disertano. A 35 abitanti la città diventa *paese*, a 80 *città*:
  si sbloccano edifici e navi più grandi.
- **Arruolamento.** In caserma arruoli marinai e soldati tra gli abitanti: più la
  città è grande, più uomini puoi arruolare.
- **Navi.** Nel cantiere scegli il tipo (sloop, brigantino, fregata, galeone,
  nave coloniale) e scrivi il nome, o usi quello proposto dalla tua fazione.
  Ogni nave si può rinominare. I marinai la manovrano, i soldati combattono.
  In porto imbarchi e sbarchi gli uomini.
- **Guerra.** Clic destro per attaccare a cannonate. Con l'arrembaggio (`B`)
  catturi le navi, se i tuoi uomini sono più forti. Bombarda le torri e sbarca le
  truppe (`L`) per conquistare le città. La nave coloniale fonda nuove città.

| Comando | Azione |
| --- | --- |
| Clic sinistro / trascina | Seleziona navi ed edifici |
| Clic destro | Muovi, attacca, bombarda, fonda |
| `WASD` / frecce, rotella, tasto centrale | Scorri, zoom, trascina la mappa |
| `B` / `L` / `X` | Arrembaggio / sbarco / ferma |
| `H` / `P` / `Esc` | Città / pausa / annulla |

## Architettura

```
src/
  sim/      simulazione pura e deterministica (regole, stato, comandi, IA, mappa)
  net/      sessione a passo fisso e transport dei comandi (locale; domani di rete)
  game/     controller (selezione, modalità, messaggi) e tastiera
  render/   grafica procedurale: terreno, navi, edifici
  scenes/   scena Phaser del mondo
  ui/       menu e pannelli in Preact
```

Il multiplayer resta possibile perché giocatore e IA agiscono solo tramite
comandi serializzabili, la simulazione è deterministica a 10 tick al secondo e
`hashState()` permette di rilevare le desincronizzazioni: basta un transport di
rete al posto di `LocalTransport`.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173 (galleria degli sprite: /art.html)
npm test
npm run typecheck
npm run build
```

Il deploy su Vercel è automatico a ogni push su `main`.
