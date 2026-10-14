import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { stepShip, type ShipState } from '../logic/ship';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class SeaScene extends Phaser.Scene {
  private ship!: Phaser.GameObjects.Image;
  private state: ShipState = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, vx: 0, vy: 0 };
  private keys!: Keys;
  private coins!: Phaser.GameObjects.Group;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('Sea');
  }

  create(): void {
    for (let i = 0; i < 40; i++) {
      const wave = this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        'wave',
      );
      this.tweens.add({
        targets: wave,
        x: wave.x + 6,
        duration: Phaser.Math.Between(1200, 2200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.coins = this.add.group();
    for (let i = 0; i < 5; i++) this.spawnCoin();

    this.ship = this.add.image(this.state.x, this.state.y, 'ship');

    this.keys = this.input.keyboard!.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
    }) as Keys;

    this.scoreText = this.add.text(4, 4, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffcd75',
    });
    this.updateScore();
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    this.state = stepShip(
      this.state,
      {
        left: k.left.isDown || k.a.isDown,
        right: k.right.isDown || k.d.isDown,
        up: k.up.isDown || k.w.isDown,
        down: k.down.isDown || k.s.isDown,
      },
      delta / 1000,
      { width: GAME_WIDTH, height: GAME_HEIGHT, margin: 8 },
    );
    this.ship.setPosition(this.state.x, this.state.y);
    if (this.state.vx !== 0) this.ship.setFlipX(this.state.vx < 0);

    for (const coin of this.coins.getChildren() as Phaser.GameObjects.Image[]) {
      if (Phaser.Math.Distance.Between(coin.x, coin.y, this.ship.x, this.ship.y) < 10) {
        coin.destroy();
        this.score++;
        this.updateScore();
        this.spawnCoin();
      }
    }
  }

  private spawnCoin(): void {
    const coin = this.add.image(
      Phaser.Math.Between(16, GAME_WIDTH - 16),
      Phaser.Math.Between(16, GAME_HEIGHT - 16),
      'coin',
    );
    this.tweens.add({ targets: coin, y: coin.y - 2, duration: 600, yoyo: true, repeat: -1 });
    this.coins.add(coin);
  }

  private updateScore(): void {
    this.scoreText.setText(`DOBLONI ${this.score}`);
  }
}
