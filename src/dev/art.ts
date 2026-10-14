// Galleria di sviluppo: mostra terreno, navi ed edifici di ogni fazione (npm run dev → /art.html).
import { FACTIONS, FACTION_IDS, NEUTRAL_LOOK } from '../sim/factions';
import { generateMap } from '../sim/map';
import { BUILDINGS, SHIP_CLASSES, type BuildingKind } from '../sim/rules';
import { drawBuilding, drawConstruction } from '../render/buildingArt';
import { drawShip } from '../render/shipArt';
import { renderChunk, waterDistanceField } from '../render/terrain';
import type { PixelSheet } from '../render/pixels';

const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 4);

function show(sheet: PixelSheet, k = scale): void {
  const c = sheet.toCanvas();
  c.style.width = `${sheet.width * k}px`;
  c.style.height = `${sheet.height * k}px`;
  document.body.append(c);
}

function title(text: string): void {
  const h = document.createElement('h2');
  h.textContent = text;
  document.body.append(h);
}

const looks = [...FACTION_IDS.map((id) => ({ name: FACTIONS[id].name, colors: FACTIONS[id].colors })), { name: NEUTRAL_LOOK.name, colors: NEUTRAL_LOOK.colors }];

if (params.has('terrain')) {
  const map = generateMap(Number(params.get('seed') ?? 42), 200, 150);
  const field = waterDistanceField(map);
  const t0 = performance.now();
  const [cx, cy] = (params.get('terrain') || '1,1').split(',').map(Number);
  for (let y = cy; y < cy + 2; y++) {
    for (let x = cx; x < cx + 2; x++) {
      const chunk = renderChunk(map, field, x, y);
      const c = document.createElement('canvas');
      c.width = chunk.width;
      c.height = chunk.height;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(chunk.data), chunk.width, chunk.height), 0, 0);
      c.style.width = `${chunk.width * 2}px`;
      c.style.margin = '0';
      document.body.append(c);
    }
    document.body.append(document.createElement('br'));
  }
  title(`4 blocchi in ${(performance.now() - t0).toFixed(0)} ms`);
} else {
  for (const look of looks) {
    title(look.name);
    for (const cls of SHIP_CLASSES) show(drawShip(cls, look.colors));
    for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) show(drawBuilding(kind, look.colors), scale - 1);
  }
  title('In costruzione');
  for (const size of [1, 2, 3]) show(drawConstruction(size, size), scale - 1);
}
