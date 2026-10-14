// Risoluzione logica del gioco: bassa e scalata per ottenere pixel netti.
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

export const LOCAL_PLAYER = 1;
export const PLAYER_COLORS = ['#b13e53', '#ef7d57', '#a7f070', '#41a6f6'];

/** Seed della partita: da ?seed=123 nell'URL, altrimenti casuale. */
export function gameSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isFinite(fromUrl) && fromUrl > 0 ? Math.floor(fromUrl) : Math.floor(Math.random() * 1e9) + 1;
}
