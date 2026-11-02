import type { Editor } from '../core/editor';
import { BRUSHES } from '../core/brushes';
import { Icon } from './icons';
import { fmtSize } from './Toolbar';

/**
 * Radial palette that opens right at the pencil tip (squeeze / double-tap):
 * inner ring = undo, redo, eraser, select; middle ring = tool presets; outer ring = recent colours.
 */
export function QuickPalette({ ed, x, y, w, h, onClose }: { ed: Editor; x: number; y: number; w: number; h: number; onClose: () => void }) {
  const R = 150;
  const cx = Math.max(R + 8, Math.min(w - R - 8, x));
  const cy = Math.max(R + 8, Math.min(h - R - 8, y));
  const presets = ed.presets.slice(0, 12);
  const colors = [...new Set([...ed.settings.recentColors, '#14161a', '#ffffff', '#e5484d', '#2f80ed', '#3bb273', '#f2c94c'])].slice(0, 14);
  const ring = (n: number, r: number, i: number, offset = -Math.PI / 2) => {
    const a = offset + (i / n) * Math.PI * 2;
    return { left: cx + Math.cos(a) * r, top: cy + Math.sin(a) * r };
  };
  const act = (f: () => void) => (e: Event) => { e.stopPropagation(); f(); onClose(); };
  const inner: { icon: string; label: string; f: () => void }[] = [
    { icon: 'undo', label: 'Undo', f: () => ed.undo() },
    { icon: 'eraser', label: 'Eraser', f: () => ed.setTool('eraser') },
    { icon: 'redo', label: 'Redo', f: () => ed.redo() },
    { icon: 'select', label: 'Select', f: () => ed.setTool('select') },
  ];
  const curColor = ed.preset.color.toLowerCase();
  return (
    <div class="qp-scrim" onPointerDown={(e) => { e.stopPropagation(); onClose(); }}>
      <div class="qp-disc" style={{ left: cx - R + 'px', top: cy - R + 'px', width: R * 2 + 'px', height: R * 2 + 'px' }} onPointerDown={(e) => e.stopPropagation()} />
      {inner.map((b, i) => {
        const p = ring(inner.length, 44, i);
        return (
          <button class="qp-btn" title={b.label} style={{ left: p.left + 'px', top: p.top + 'px' }} onPointerDown={(e) => e.stopPropagation()} onClick={act(b.f)}>
            <Icon name={b.icon} size={19} />
          </button>
        );
      })}
      {presets.map((t, i) => {
        const p = ring(presets.length, 92, i);
        const on = ed.tool === 'draw' && ed.activePreset === i;
        const dot = Math.max(6, Math.min(22, 5 + Math.sqrt(t.size) * 2.4));
        return (
          <button class={'qp-tool' + (on ? ' on' : '')} title={t.name || BRUSHES[t.brush].label} style={{ left: p.left + 'px', top: p.top + 'px' }}
            onPointerDown={(e) => e.stopPropagation()} onClick={act(() => ed.selectPreset(i))}>
            <span style={{ width: dot + 'px', height: dot + 'px', background: t.brush === 'softEraser' ? '#f2b8c0' : t.color, opacity: Math.max(0.35, t.opacity) }} />
            <em>{fmtSize(t.size)}</em>
          </button>
        );
      })}
      {colors.map((c, i) => {
        const p = ring(colors.length, 134, i, -Math.PI / 2 + Math.PI / colors.length);
        return (
          <button class={'qp-color' + (c.toLowerCase() === curColor ? ' on' : '')} style={{ left: p.left + 'px', top: p.top + 'px', background: c }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={act(() => { ed.updatePreset({ color: c }, ed.tool === 'draw' ? ed.activePreset : ed.lastDrawPreset); ed.addRecentColor(c); })} />
        );
      })}
    </div>
  );
}
