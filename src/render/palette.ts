// Palette condivisa degli sprite: ogni carattere mappa su un colore, '.' è trasparente.
// 'f' è il colore del proprietario (bandiera) e viene sostituito per ogni giocatore.
export const PALETTE: Record<string, string> = {
  k: '#1a1c2c', // contorno
  w: '#f4f4f4', // vela
  W: '#c2c3c7', // vela in ombra
  b: '#a0663a', // legno chiaro
  d: '#6b3e22', // legno scuro
  y: '#ffcd75', // oro / finestre illuminate
  o: '#b13e53', // tetti
  g: '#38b764', // foglie
  G: '#257179', // foglie scure
  n: '#8a5a32', // tronco
  s: '#94b0c2', // pietra chiara
  S: '#566c86', // pietra scura
  c: '#73eff7', // schiuma
};

export const TILE_COLORS = {
  deep: '#29508f',
  deepLight: '#3366a8',
  shallow: '#3b8fd0',
  shallowLight: '#55a7e0',
  foam: '#c9f1ff',
  sand: '#f2d49b',
  sandDark: '#dcb877',
  grass: '#4fa35a',
  grassDark: '#3e8a4a',
  forest: '#2f6e3f',
  tree: '#1f4f2e',
  trunk: '#6b3e22',
  rock: '#7d8291',
  rockLight: '#a3a8b5',
  rockDark: '#585c68',
};
