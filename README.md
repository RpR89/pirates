# Pirates

Strategia in tempo reale in pixel art, vista dall'alto, nei mari dei Caraibi.
Scegli una bandiera, genera il tuo capitano, fai crescere le tue città, arruola
uomini, vara navi a cui dai un nome e conquista l'arcipelago. Single player contro l'IA, con l'architettura pronta
per il multiplayer.

## Fazioni

| Fazione | Punto di forza |
| --- | --- |
| Fratellanza della Costa (pirati) | Arrembaggio +80%, corpo a corpo +40%, navi piccole più economiche; niente mura |
| Royal Navy | Cannoni +40% e scafi +20%: domina lo scontro tra navi |
| Marine Royale | Soldati con il 70% di PF in più: perdono molti meno uomini |
| Armada Española | Produzione di oro +60% |

## Il capitano

All'inizio generi il tuo capitano (ritratto e abilità: navigazione, artiglieria,
spada, comando) e puoi rigenerarlo finché ti piace, scegliendo anche la divisa
(tre per nazione: dal capitano di vascello all'ammiraglio, o il corsaro, il
filibustiere e il gentiluomo di ventura per i pirati). Imbarcato potenzia la sua nave
(velocità, cannoni, arrembaggio); in città rafforza la guarnigione e le torri. Sale
di livello affondando e catturando navi. Se la sua nave affonda naufraga e torna in
una tua città dopo un minuto.

## Come si gioca

- **Città.** Clicca sul municipio per il menu della città. Con *Costruisci* scegli
  un edificio e lo piazzi tu, dove vuoi, entro il cerchio della città, su una
  griglia fine (mezza casella di mappa): case
  (abitanti), fattorie e pescherie (cibo), segheria (legno), mercato (oro),
  cantiere navale e caserma. Cantiere e pescheria vanno sulla costa. Le strade
  si tracciano da sole: collegano ogni edificio alla piazza del municipio
  (sterrate nei villaggi, acciottolate nei paesi e nelle città).
- **Difese.** Si costruiscono anche queste:

  | Difesa | Effetto | Chi |
  | --- | --- | --- |
  | Mura | Si tracciano trascinando, anche in diagonale; guarnigione molto più forte | non i pirati |
  | Terrapieno | Argine con palizzata, economico; protegge meno delle mura | tutti |
  | Porta | In pietra nelle mura, di legno nei terrapieni; si piazza anche sopra un tratto già costruito. Le strade escono dalla cinta solo dalle porte | tutti |
  | Fossato | Canale d'acqua: chi assalta la città combatte peggio | tutti |
  | Torre | Cannoni contro le navi e rinforzo alla guarnigione | tutti |
  | Bastione | Fortificazione a punta con cannoni, rivolta verso l'esterno | non i pirati |
  | Batteria costiera | Cannoni pesanti puntati sul mare, gittata più lunga: chiude il porto | tutti |
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
- **Commercio.** Il Fluyt è una nave da carico: nel suo pannello imposti una
  rotta commerciale con fino a 8 tappe, percorse in ciclo. In ogni tua città
  scegli quanto legno e cibo caricare, in ogni città neutrale quanto venderne.
  Ogni città neutrale paga prezzi diversi (li vedi cliccando sul suo municipio);
  il prezzo scende man mano che vendi e risale mentre la città consuma la merce,
  quindi conviene alternare più mercati. Attento ai nemici: un fluyt catturato
  perde la rotta e il carico.
- **Salvataggi.** *Menu* mette in pausa e permette di salvare, caricare,
  esportare su file e importare. La partita si salva anche da sola ogni 2 minuti
  e quando esci; dal menu iniziale riprendi da *Riprendi una partita*.
- **Guerra.** Clic destro per attaccare a cannonate. Con l'arrembaggio (`B`)
  catturi le navi, se i tuoi uomini sono più forti. Bombarda le torri e sbarca le
  truppe (`L`): clic su una città nemica per assaltarla dal porto, oppure su una
  costa qualsiasi per far scendere i soldati a terra. I reparti a terra si
  selezionano e si guidano come le navi: clic destro su un punto per marciare, su
  una città nemica o neutrale per assaltarla, su una tua città per rinforzarla, su
  una tua nave per reimbarcarsi, su un reparto nemico per attaccarlo. Le torri
  sparano anche ai reparti che si avvicinano. La nave coloniale fonda nuove città.
- **Riparazioni.** Una nave ferma nel porto di una tua città si ripara da sola
  spendendo legno, il doppio più in fretta al molo del cantiere navale.

| Comando | Azione |
| --- | --- |
| Clic sinistro / trascina | Seleziona navi ed edifici |
| Clic destro | Muovi, attacca, bombarda, fonda |
| `WASD` / frecce, rotella, tasto centrale | Scorri, zoom (da tutta la mappa al dettaglio 1:1), trascina la mappa |
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
