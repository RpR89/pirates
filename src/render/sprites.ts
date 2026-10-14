// Sprite in pixel art come griglie di caratteri (vedi palette.ts). Le navi guardano a destra.
export type PixelSprite = readonly string[];

export const SLOOP: PixelSprite = [
  '.......kff....',
  '.......kff....',
  '.......k......',
  '......kwk.....',
  '.....kwwWk....',
  '....kwwwwWk...',
  '...kwwwwwwWk..',
  '..kkkkkkkkkkk.',
  'kkk....k....kk',
  'kbbbbbbbbbbbbk',
  '.kdyddddyddk..',
  '..kkkkkkkkk...',
];

export const GALLEON: PixelSprite = [
  '....kff......kff....',
  '....kff......kff....',
  '....k........k......',
  '..kkkkkk...kkkkkkk..',
  '..kwwwwk...kwwwwWk..',
  '..kwwwWk...kwwwwWk..',
  '..kkkkkk...kkkkkkk..',
  '..kwwwwk...kwwwwWk..',
  '..kwwwWk...kwwwwWk..',
  '..kkkkkk...kkkkkkk..',
  'kkkk.k........k...kk',
  'kbbkkkkkkkkkkkkkkkbk',
  'kbbbbbbbbbbbbbbbbbk.',
  'kdkddkddkddkddkddk..',
  '.kddddddddddddddk...',
  '..kkkkkkkkkkkkkk....',
];

export const COLONY: PixelSprite = [
  '.......kff......',
  '.......kff......',
  '.......k........',
  '....kkkkkkkk....',
  '....kwwwwwWk....',
  '....kwwwwwWk....',
  '....kwwwwwWk....',
  '....kkkkkkkk....',
  '..kkkk.k.kkkk...',
  '..kbdk.k.kbdk...',
  'kkkkkkkkkkkkkkk.',
  'kbbbbbbbbbbbbbk.',
  '.kddddddddddk...',
  '..kkkkkkkkkk....',
];

export const VILLAGE: PixelSprite = [
  '.............kff',
  '.............kff',
  '..g.g........k..',
  '.gGgGg.......k..',
  'g.Gng.g......k..',
  '...n.....kkkkkkk',
  '...n....kooooook',
  '.kkkkk.koooooook',
  'kooook.kkkkkkkkk',
  'kkkkkk.kbbbbbbbk',
  '.kbbk..kbykbbykk',
  '.kbyk..kbykbbykk',
  '.kbbk..kbbbbbbbk',
  '.kkkk..kkkkkkkkk',
];

export const FORT: PixelSprite = [
  '.......kff......',
  '.......kff......',
  '.......k........',
  '.....kkkkk......',
  '.....ksksk......',
  '.k.k.kssssk.k.k.',
  'kskskksSsskkskSk',
  'ksssssssssssssSk',
  'kssSssssskkssssk',
  'ksssssssskykssSk',
  'kssssSssskykssSk',
  'kkkkkkkkkkkkkkkk',
];

export const MARKER: PixelSprite = [
  'c...c',
  '.c.c.',
  '..c..',
  '.c.c.',
  'c...c',
];

export const WAVE: PixelSprite = [
  '.cc....',
  'c..c..c',
  '....cc.',
];
