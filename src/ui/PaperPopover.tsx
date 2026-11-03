import type { Editor } from '../core/editor';
import { useEditor, PanelTitle, SliderRow } from './common';
import { PaperIcon, PAPERS } from './PrecisionPanel';

const PAPER_COLORS: { c: string; grid: string }[] = [
  { c: '#ffffff', grid: '#7a8699' },
  { c: '#f7f3ea', grid: '#9b8f78' },
  { c: '#eef1f4', grid: '#7a8699' },
  { c: '#e8f0f8', grid: '#5f87b8' },
  { c: '#2a2d33', grid: '#9aa3b2' },
  { c: '#141518', grid: '#9aa3b2' },
  { c: '#1f3a5f', grid: '#a9c3e6' },
];

/** Quick paper switcher available from the canvas top bar. */
export function PaperPopover({ ed, onClose, onMore }: { ed: Editor; onClose: () => void; onMore: () => void }) {
  useEditor(ed, ['ui', 'doc']);
  const bg = ed.doc.background;
  return (
    <div class="popover panel-right" style={{ width: '300px' }} onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Paper" onClose={onClose} />
      <div class="sec">
        <div class="grid-btns" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {PAPERS.map((p) => (
            <button class={'tile' + (bg.paper === p.v ? ' on' : '')} onClick={() => ed.setBackground({ paper: p.v })}>
              <PaperIcon kind={p.v} />
              {p.l}
            </button>
          ))}
        </div>
      </div>
      {bg.paper !== 'blank' && (
        <div class="sec">
          <SliderRow label="Spacing" value={bg.gridSize} min={5} max={200} step={1} onChange={(v) => ed.setBackground({ gridSize: v }, false)} onEnd={() => ed.commit('Grid')} />
          <SliderRow label="Strength" value={bg.gridOpacity} min={0.05} max={1} onChange={(v) => ed.setBackground({ gridOpacity: v }, false)} onEnd={() => ed.commit('Grid')} fmt={(v) => Math.round(v * 100) + '%'} />
        </div>
      )}
      <div class="sec">
        <div class="row" style={{ gap: '8px' }}>
          {PAPER_COLORS.map((p) => (
            <button class={'sw' + (bg.color === p.c ? ' on' : '')} style={{ width: '28px', background: p.c }} onClick={() => ed.setBackground({ color: p.c, gridColor: p.grid })} />
          ))}
          <input type="color" value={bg.color} onChange={(e) => ed.setBackground({ color: (e.target as HTMLInputElement).value })} style={{ width: '30px', height: '30px', border: 0, background: 'none', padding: 0 }} />
        </div>
        <button class="btn wide" style={{ marginTop: '10px' }} onClick={onMore}>Guides, perspective &amp; artboard…</button>
      </div>
    </div>
  );
}
