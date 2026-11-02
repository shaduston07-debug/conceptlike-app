import { useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import type { ToolId } from '../core/types';
import { useEditor } from './common';
import { BRUSHES } from '../core/brushes';
import { fmtSize, currentColor, type PanelId } from './Toolbar';

const UTILS: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' }, { id: 'eraser', label: 'Erase' }, { id: 'nudge', label: 'Nudge' },
  { id: 'slice', label: 'Slice' }, { id: 'fill', label: 'Fill' }, { id: 'text', label: 'Text' },
];

/** Floating radial tool wheel: inner ring = tools, outer ring = utilities, centre = colour; drag the hub to move. */
export function ToolWheel({ ed, panel, setPanel }: { ed: Editor; panel: PanelId; setPanel: (p: PanelId) => void }) {
  useEditor(ed, ['ui', 'settings']);
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('draftwell.wheel') || '') as { x: number; y: number }; } catch { return { x: 30, y: 300 }; }
  });
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);
  const R0 = 34, R1 = 78, R2 = 118;
  const C = 120;
  const presets = ed.presets.slice(0, 10);
  const seg = (i: number, n: number, r0: number, r1: number) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const p = (r: number, a: number) => `${C + Math.cos(a) * r} ${C + Math.sin(a) * r}`;
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
  };
  const mid = (i: number, n: number, r: number) => {
    const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
  };
  return (
    <div class="wheel" style={{ left: pos.x + 'px', top: pos.y + 'px' }} onPointerDown={(e) => e.stopPropagation()}>
      <svg width="240" height="240" viewBox="0 0 240 240">
        <defs>
          <filter id="wsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-opacity="0.22" /></filter>
        </defs>
        <circle cx={C} cy={C} r={R2} fill="var(--panel-solid)" filter="url(#wsh)" stroke="var(--border)" />
        {UTILS.map((u, i) => {
          const m = mid(i, UTILS.length, (R1 + R2) / 2);
          const on = ed.tool === u.id;
          return (
            <g key={u.id} onClick={() => { if (on) setPanel(panel === 'toolopts' ? null : 'toolopts'); else ed.setTool(u.id); }} style={{ cursor: 'pointer' }}>
              <path d={seg(i, UTILS.length, R1, R2)} fill={on ? 'var(--accent-soft)' : 'transparent'} stroke="var(--border)" />
              <text x={m.x} y={m.y + 4} text-anchor="middle" font-size="11" font-weight="600" fill={on ? 'var(--accent)' : 'var(--text-2)'}>{u.label}</text>
            </g>
          );
        })}
        {presets.map((p, i) => {
          const m = mid(i, presets.length, (R0 + R1) / 2);
          const on = ed.tool === 'draw' && ed.activePreset === i;
          return (
            <g key={p.id} onClick={() => { if (on) setPanel(panel === 'toolopts' ? null : 'toolopts'); else ed.selectPreset(i); }} style={{ cursor: 'pointer' }}>
              <path d={seg(i, presets.length, R0, R1)} fill={on ? 'var(--accent-soft)' : 'var(--panel-2)'} stroke="var(--border)" />
              <circle cx={m.x} cy={m.y - 5} r={Math.min(9, 2 + Math.sqrt(p.size))} fill={p.brush === 'softEraser' ? '#f2b8c0' : p.color} opacity={Math.max(0.35, p.opacity)} />
              <text x={m.x} y={m.y + 13} text-anchor="middle" font-size="8.5" fill="var(--text-2)">{(p.name || BRUSHES[p.brush].label).slice(0, 8)} {fmtSize(p.size)}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={R0 - 3} fill={currentColor(ed)} stroke="var(--panel-solid)" stroke-width="4"
          onPointerDown={(e) => {
            (e.currentTarget as any).setPointerCapture(e.pointerId);
            drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            if (Math.hypot(dx, dy) > 6) d.moved = true;
            if (d.moved) setPos({ x: d.x + dx, y: d.y + dy });
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (d && !d.moved) setPanel(panel === 'color' ? null : 'color');
            else try { localStorage.setItem('draftwell.wheel', JSON.stringify(pos)); } catch {}
          }}
        />
      </svg>
    </div>
  );
}
