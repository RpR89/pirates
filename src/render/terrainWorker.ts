// Thread di disegno del terreno: riceve la mappa una volta, poi disegna blocchi su richiesta.
import type { TileMap } from '../sim/map';
import { renderChunk } from './terrain';

interface InitMessage {
  type: 'init';
  map: TileMap;
  field: Float32Array;
}

interface ChunkMessage {
  type: 'chunk';
  x: number;
  y: number;
}

let map: TileMap | null = null;
let field: Float32Array | null = null;

self.onmessage = (e: MessageEvent<InitMessage | ChunkMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    map = msg.map;
    field = msg.field;
    return;
  }
  if (!map || !field) return;
  const chunk = renderChunk(map, field, msg.x, msg.y);
  (self as unknown as Worker).postMessage({ x: msg.x, y: msg.y, width: chunk.width, height: chunk.height, data: chunk.data }, [chunk.data.buffer]);
};
