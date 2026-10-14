import type { ComponentChildren } from 'preact';
import type { Cost } from '../sim/rules';
import { fmt } from './hooks';

export function Bar({ value, color }: { value: number; color?: 'gold' }) {
  return (
    <div class={`bar ${color ?? ''}`}>
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color ? undefined : value > 0.6 ? '#8fd16a' : value > 0.3 ? '#e9b949' : '#ff7a5c' }} />
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="stat">
      <span class="muted">{label}</span>
      <b>{children}</b>
    </div>
  );
}

export function CostLabel({ cost, gold, wood }: { cost: Cost; gold: number; wood: number }) {
  return (
    <span class="cost">
      <span class={gold < cost.gold ? 'bad' : 'gold'}>{fmt(cost.gold)} oro</span>
      {cost.wood > 0 && <> · <span class={wood < cost.wood ? 'bad' : ''}>{fmt(cost.wood)} legno</span></>}
    </span>
  );
}

export function Flag({ flag, detail, pirate }: { flag: string; detail: string; pirate?: boolean }) {
  return (
    <div class="flag" style={{ background: flag }}>
      {pirate ? (
        <div style={{ position: 'absolute', left: 15, top: 6, width: 10, height: 10, background: detail, borderRadius: 5 }} />
      ) : (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 6, background: detail }} />
      )}
    </div>
  );
}
