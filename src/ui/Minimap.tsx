import { useEffect, useRef } from 'preact/hooks';
import type { GameController } from '../game/controller';
import { Tile, tileAt } from '../sim/map';
import { FACTION_COLOR } from '../scenes/WorldScene';

const COLORS: Record<number, string> = {
  [Tile.Deep]: '#22578c',
  [Tile.Shallow]: '#3fa5c6',
  [Tile.Sand]: '#ecd59f',
  [Tile.Grass]: '#5ba244',
  [Tile.Forest]: '#2f6e2e',
  [Tile.Rock]: '#8d9098',
};

export function Minimap({ ctl }: { ctl: GameController }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const map = ctl.state.map;

  useEffect(() => {
    const b = document.createElement('canvas');
    b.width = map.width;
    b.height = map.height;
    const g = b.getContext('2d')!;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        g.fillStyle = COLORS[tileAt(map, x, y)] ?? '#000';
        g.fillRect(x, y, 1, 1);
      }
    }
    base.current = b;
  }, [map]);

  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c || !base.current) return;
      const g = c.getContext('2d')!;
      g.drawImage(base.current, 0, 0);
      const state = ctl.state;
      for (const city of state.cities) {
        g.fillStyle = '#1b1712';
        g.fillRect(city.cx - 2, city.cy - 2, 5, 5);
        g.fillStyle = FACTION_COLOR(state, city.owner);
        g.fillRect(city.cx - 1, city.cy - 1, 3, 3);
      }
      for (const s of state.ships) {
        g.fillStyle = FACTION_COLOR(state, s.owner);
        g.fillRect(Math.floor(s.x), Math.floor(s.y), 2, 2);
      }
      const v = ctl.view;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.strokeRect(Math.round(v.x) + 0.5, Math.round(v.y) + 0.5, Math.round(v.w), Math.round(v.h));
    };
    draw();
    const timer = window.setInterval(draw, 200);
    return () => window.clearInterval(timer);
  }, [ctl]);

  const jump = (e: MouseEvent) => {
    if (!(e.buttons & 1) && e.type !== 'mousedown') return;
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    ctl.centerOn({ x: ((e.clientX - r.left) / r.width) * map.width, y: ((e.clientY - r.top) / r.height) * map.height });
  };

  return (
    <div class="panel minimap interactive">
      <canvas ref={ref} width={map.width} height={map.height} style={{ width: map.width, height: map.height }} onMouseDown={jump} onMouseMove={jump} />
    </div>
  );
}
