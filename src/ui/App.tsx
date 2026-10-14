import Phaser from 'phaser';
import { useEffect, useState } from 'preact/hooks';
import { GameController, type GameSetup } from '../game/controller';
import { Keyboard } from '../game/keyboard';
import { WorldScene } from '../scenes/WorldScene';
import { GameView } from './GameView';
import { StartMenu } from './StartMenu';

interface Running {
  ctl: GameController;
  game: Phaser.Game;
  keyboard: Keyboard;
}

async function launch(setup: GameSetup): Promise<Running> {
  await document.fonts.load('10px "Pixelify Sans"').catch(() => undefined);
  const ctl = new GameController(setup);
  const keyboard = new Keyboard();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#10263f',
    pixelArt: true,
    roundPixels: true,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  });
  game.scene.add('World', WorldScene, true, { controller: ctl, keyboard });
  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, { game, ctl });
  }
  return { ctl, game, keyboard };
}

export function App() {
  const [running, setRunning] = useState<Running | null>(null);

  const exit = () => {
    if (!running) return;
    running.game.destroy(true);
    running.keyboard.destroy();
    setRunning(null);
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

  if (!running) return <StartMenu onStart={(setup) => void launch(setup).then(setRunning)} />;
  return <GameView ctl={running.ctl} onExit={exit} />;
}
