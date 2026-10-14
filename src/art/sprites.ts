// Sprite in pixel art definiti come griglie di caratteri (vedi palette.ts).
export type PixelSprite = readonly string[];

export const SHIP: PixelSprite = [
  '.......kr.......',
  '.......krr......',
  '.......k........',
  '....kkkkkkkk....',
  '....kwwwwwwk....',
  '...kwwwwwwwwk...',
  '...kwwwwwwwwk...',
  '....kkkkkkkk....',
  '.......k........',
  '.kkkkkkkkkkkkkk.',
  '.kbbbbbbbbbbbbk.',
  '..kdbdbdbdbdbk..',
  '...kddddddddk...',
  '....kkkkkkkk....',
];

export const WAVE: PixelSprite = [
  '..ll....',
  '.l..l..l',
  'l....ll.',
];

export const COIN: PixelSprite = [
  '.kkkk.',
  'kyyyyk',
  'kyykyk',
  'kyykyk',
  'kyyyyk',
  '.kkkk.',
];
