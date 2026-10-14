import Phaser from 'phaser';

// Font bitmap 3×5 (cella 4×6). Solo maiuscole: il testo viene convertito.
const GLYPHS: Record<string, string> = {
  A: '.x.x.xxxxx.xx.x', B: 'xx.x.xxx.x.xxx.', C: '.xxx..x..x...xx', D: 'xx.x.xx.xx.xxx.',
  E: 'xxxx..xx.x..xxx', F: 'xxxx..xx.x..x..', G: '.xxx..x.xx.x.xx', H: 'x.xx.xxxxx.xx.x',
  I: 'xxx.x..x..x.xxx', J: '..x..x..xx.x.x.', K: 'x.xx.xxx.x.xx.x', L: 'x..x..x..x..xxx',
  M: 'x.xxxxxxxx.xx.x', N: 'xx.x.xx.xx.xx.x', O: '.x.x.xx.xx.x.x.', P: 'xx.x.xxx.x..x..',
  Q: '.x.x.xx.xxx..xx', R: 'xx.x.xxx.x.xx.x', S: '.xxx...x...xxx.', T: 'xxx.x..x..x..x.',
  U: 'x.xx.xx.xx.xxxx', V: 'x.xx.xx.xx.x.x.', W: 'x.xx.xxxxxxxx.x', X: 'x.xx.x.x.x.xx.x',
  Y: 'x.xx.x.x..x..x.', Z: 'xxx..x.x.x..xxx',
  '0': 'xxxx.xx.xx.xxxx', '1': '.x.xx..x..x.xxx', '2': 'xx...x.x.x..xxx', '3': 'xx...x.x...xxx.',
  '4': 'x.xx.xxxx..x..x', '5': 'xxxx..xx...xxx.', '6': '.xxx..xxxx.xxxx', '7': 'xxx..x.x..x..x.',
  '8': 'xxxx.xxxxx.xxxx', '9': 'xxxx.xxxx..xxx.',
  ' ': '...............', '.': '.............x.', ',': '..........x.x..', ':': '....x.....x....',
  '!': '.x..x..x.....x.', '?': 'xx...x.x.....x.', '-': '......xxx......', '/': '..x..x.x.x..x..',
  '(': '.x.x..x..x...x.', ')': '.x...x..x..x.x.', '+': '....x.xxx.x....', '%': 'x.x..x.x.x..x.x',
  "'": '.x..x..........', '>': 'x...x...x.x.x..', '<': '..x.x.x...x...x', '=': '...xxx...xxx...',
  '[': 'xx.x..x..x..xx.', ']': '.xx..x..x..x.xx',
};

export const FONT_KEY = 'pixel';
export const CHAR_W = 4;
export const CHAR_H = 6;

export function createPixelFont(scene: Phaser.Scene): void {
  const chars = Object.keys(GLYPHS).join('');
  const texture = scene.textures.createCanvas('pixel-font', chars.length * CHAR_W, CHAR_H);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.fillStyle = '#ffffff';
  [...chars].forEach((ch, i) => {
    const g = GLYPHS[ch];
    for (let p = 0; p < 15; p++) {
      if (g[p] === 'x') ctx.fillRect(i * CHAR_W + (p % 3), Math.floor(p / 3), 1, 1);
    }
  });
  texture.refresh();
  scene.cache.bitmapFont.add(
    FONT_KEY,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: 'pixel-font',
      width: CHAR_W,
      height: CHAR_H,
      chars,
      charsPerRow: chars.length,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 1,
    }),
  );
}

/** Normalizza il testo per il font: maiuscole, niente accenti. */
export function fontText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 .,:!?\-/()+%'><=[\]\n]/g, ' ');
}
