import Phaser from 'phaser';
import { useEffect, useState } from 'preact/hooks';
import { GameController, type GameSetup } from '../game/controller';
import { Keyboard } from '../game/keyboard';
import { loadGameState, type SaveFile } from '../game/saves';
import { WorldScene } from '../scenes/WorldScene';
import { GameView } from './GameView';
import { StartMenu } from './StartMenu';

interface Running {
  id: number;
  ctl: GameController;
  game: Phaser.Game;
  keyboard: Keyboard;
}

let launches = 0;

async function launch(setup: GameSetup, saved?: SaveFile): Promise<Running> {
  await document.fonts.load('10px "Pixelify Sans"').catch(() => undefined);
  const ctl = new GameController(setup, saved ? loadGameState(saved) : undefined);
  if (saved?.view) ctl.startView = saved.view;
  const keyboard = new Keyboard();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#10263f',
    // Grafica a 72 px per casella vista quasi sempre rimpicciolita: filtro lineare.
    pixelArt: false,
    antialias: true,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  });
  game.scene.add('World', WorldScene, true, { controller: ctl, keyboard });
  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, { game, ctl });
  }
  return { id: ++launches, ctl, game, keyboard };
}

export function App() {
  const [running, setRunning] = useState<Running | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const stop = () => {
    if (!running) return;
    running.game.destroy(true);
    running.keyboard.destroy();
  };
  const exit = () => {
    stop();
    setRunning(null);
  };
  const load = (file: SaveFile) => {
    try {
      loadGameState(file); // verifica prima di chiudere la partita in corso
    } catch (e) {
      setLoadError((e as Error).message);
      return;
    }
    stop();
    setRunning(null);
    setLoadError(null);
    void launch(file.setup, file).then(setRunning, (e: Error) => setLoadError(e.message));
  };

  // Avvio diretto per i test: ?autostart&faction=inglesi&seed=42
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('autostart')) {
      launch({
        faction: (p.get('faction') as GameSetup['faction']) ?? 'pirati',
        captain: p.get('captain') ?? 'Capitano',
        rivals: Number(p.get('rivals') ?? 2),
        seed: Number(p.get('seed') ?? 42),
      }).then(setRunning);
    }
  }, []);

  if (!running) return <StartMenu onStart={(setup) => void launch(setup).then(setRunning)} onLoad={load} loadError={loadError} />;
  return <GameView key={running.id} ctl={running.ctl} onExit={exit} onLoad={load} loadError={loadError} />;
}
