import type { Editor } from '../core/editor';
import type { GuideKind, PaperKind, PerspectiveMode, Unit } from '../core/types';
import { useEditor, PanelTitle, Seg, SliderRow, ToggleRow } from './common';
import { Icon } from './icons';
import { defaultGuide, GUIDE_LABELS } from '../core/guides';
import { apply, inv, matScale } from '../core/geom';
import { UNITS, PER_PX } from '../core/measure';
import { ARTBOARD_PRESETS } from '../core/doc';

export const PAPERS: { v: PaperKind; l: string }[] = [
  { v: 'blank', l: 'Blank' }, { v: 'dots', l: 'Dots' }, { v: 'grid', l: 'Grid' }, { v: 'graph', l: 'Graph' }, { v: 'lines', l: 'Lines' }, { v: 'iso', l: 'Isometric' },
];
const GUIDES: GuideKind[] = ['line', 'circle', 'ellipse', 'rect', 'polygon', 'arc', 'curve', 'protractor'];
const GUIDE_ICON: Record<GuideKind, string> = { line: 'line', circle: 'circle', ellipse: 'ellipse', rect: 'rect', polygon: 'polygon', arc: 'arc', curve: 'curve', protractor: 'protractor' };
const SCALES = [
  { l: '1:1', k: 1 }, { l: '1:10', k: 10 }, { l: '1:20', k: 20 }, { l: '1:50', k: 50 }, { l: '1:100', k: 100 }, { l: '1:500', k: 500 },
];

export function PrecisionPanel({ ed, onClose, editPerspective, setEditPerspective, viewSize }: {
  ed: Editor; onClose: () => void; editPerspective: boolean; setEditPerspective: (v: boolean) => void; viewSize: () => { w: number; h: number };
}) {
  useEditor(ed, ['ui', 'doc', 'settings']);
  const d = ed.doc;
  const bg = d.background;
  const s = ed.settings;
  const center = () => {
    const { w, h } = viewSize();
    const iv = inv(d.view.m);
    const c = apply(iv, w / 2, h / 2);
    return { ...c, r: Math.min(w, h) * 0.3 / matScale(d.view.m) };
  };
  const setPersp = (mode: PerspectiveMode) => {
    if (mode === 'none') { ed.setPerspective({ mode }); setEditPerspective(false); return; }
    const c = center();
    const R = c.r * 2.2;
    let vps: { x: number; y: number }[];
    if (mode === '1pt') vps = [{ x: c.x, y: c.y - c.r * 0.2 }];
    else if (mode === '2pt') vps = [{ x: c.x - R, y: c.y - c.r * 0.2 }, { x: c.x + R, y: c.y - c.r * 0.2 }];
    else vps = [{ x: c.x - R, y: c.y - c.r * 0.6 }, { x: c.x + R, y: c.y - c.r * 0.6 }, { x: c.x, y: c.y + R * 1.4 }];
    ed.setPerspective({ mode, vps, horizon: vps[0].y });
    setEditPerspective(true);
  };
  const m = d.measure;
  const scaleK = PER_PX[m.unit] ? m.perWorld / PER_PX[m.unit] : 1;
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Precision" onClose={onClose} />
      <div class="sec">
        <h4>Guides</h4>
        <div class="grid-btns">
          {GUIDES.map((g) => (
            <button class={'tile' + (d.guide?.kind === g ? ' on' : '')} onClick={() => {
              if (d.guide?.kind === g) { ed.setGuide(null); return; }
              const c = center();
              ed.setGuide(defaultGuide(g, c.x, c.y, c.r));
            }}>
              <Icon name={GUIDE_ICON[g]} />
              {GUIDE_LABELS[g]}
            </button>
          ))}
        </div>
        {d.guide && (
          <div class="row" style={{ marginTop: '8px', gap: '6px' }}>
            {d.guide.kind === 'polygon' && (
              <>
                <span style={{ color: 'var(--text-2)' }}>Sides</span>
                <input type="range" min={3} max={12} step={1} value={d.guide.sides || 6} onInput={(e) => ed.setGuide({ ...d.guide!, sides: +(e.target as HTMLInputElement).value })} />
                <span class="v">{d.guide.sides || 6}</span>
              </>
            )}
            {d.guide.kind === 'line' && (
              <Seg value={d.guide.infinite === false ? 0 : 1} onChange={(v) => ed.setGuide({ ...d.guide!, infinite: !!v })} options={[{ v: 1, l: 'Infinite' }, { v: 0, l: 'Segment' }]} />
            )}
            <span class="spacer" style={{ flex: 1 }} />
            <button class="btn danger" onClick={() => ed.setGuide(null)}>Remove guide</button>
          </div>
        )}
        <div class="hint">Drag the handles to shape the guide. Strokes that start near it snap to it.</div>
      </div>
      <div class="sec">
        <h4>Snapping</h4>
        <ToggleRow label="Live shapes" on={s.liveShapes} onChange={(v) => ed.setSettings({ liveShapes: v })} hint="Pause at the end of a stroke to turn it into a clean line, arc, circle or polygon." />
        <ToggleRow label="Snap to guide" on={s.guideSnap} onChange={(v) => ed.setSettings({ guideSnap: v })} />
        <ToggleRow label="Snap to grid" on={s.gridSnap} onChange={(v) => ed.setSettings({ gridSnap: v })} />
        <ToggleRow label="Snap angles" on={s.angleSnap} onChange={(v) => ed.setSettings({ angleSnap: v })} />
        <ToggleRow label="Snap to perspective" on={s.perspectiveSnap} onChange={(v) => ed.setSettings({ perspectiveSnap: v })} />
      </div>
      <div class="sec">
        <h4>Perspective</h4>
        <Seg value={d.perspective.mode} onChange={setPersp} options={[{ v: 'none', l: 'Off' }, { v: '1pt', l: '1-Point' }, { v: '2pt', l: '2-Point' }, { v: '3pt', l: '3-Point' }]} />
        {d.perspective.mode !== 'none' && (
          <>
            <ToggleRow label="Edit vanishing points" on={editPerspective} onChange={setEditPerspective} />
            <ToggleRow label="Show grid" on={d.perspective.visible} onChange={(v) => ed.setPerspective({ visible: v })} />
            <SliderRow label="Density" value={d.perspective.density} min={8} max={120} step={1} onChange={(v) => ed.setPerspective({ density: v }, false)} onEnd={() => ed.commit('Perspective')} />
          </>
        )}
      </div>
      <div class="sec">
        <h4>Paper</h4>
        <div class="grid-btns" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {PAPERS.map((p) => (
            <button class={'tile' + (bg.paper === p.v ? ' on' : '')} onClick={() => ed.setBackground({ paper: p.v })}>
              <PaperIcon kind={p.v} />
              {p.l}
            </button>
          ))}
        </div>
        <SliderRow label="Grid size" value={bg.gridSize} min={5} max={200} step={1} onChange={(v) => ed.setBackground({ gridSize: v }, false)} onEnd={() => ed.commit('Grid')} />
        <SliderRow label="Grid opacity" value={bg.gridOpacity} min={0.05} max={1} onChange={(v) => ed.setBackground({ gridOpacity: v }, false)} onEnd={() => ed.commit('Grid')} fmt={(v) => Math.round(v * 100) + '%'} />
        <div class="row">
          <label>Paper color</label>
          {['#ffffff', '#f7f3ea', '#eef1f4', '#2a2d33', '#141518'].map((c) => (
            <button class={'sw' + (bg.color === c ? ' on' : '')} style={{ width: '26px', background: c }} onClick={() => ed.setBackground({ color: c, gridColor: c === '#2a2d33' || c === '#141518' ? '#9aa3b2' : '#7a8699' })} />
          ))}
          <input type="color" value={bg.color} onChange={(e) => ed.setBackground({ color: (e.target as HTMLInputElement).value })} style={{ width: '30px', height: '30px', border: 0, background: 'none', padding: 0 }} />
        </div>
        <div class="row">
          <label>Grid color</label>
          <input type="color" value={bg.gridColor} onChange={(e) => ed.setBackground({ gridColor: (e.target as HTMLInputElement).value })} style={{ width: '30px', height: '30px', border: 0, background: 'none', padding: 0 }} />
        </div>
        <ToggleRow label="Include grid in exports" on={bg.exportGrid} onChange={(v) => ed.setBackground({ exportGrid: v })} />
      </div>
      <div class="sec">
        <h4>Measure</h4>
        <ToggleRow label="Show measurements" on={s.measureOn} onChange={(v) => ed.setSettings({ measureOn: v })} hint="Shows lengths of lines and shapes, and the size of selections." />
        <div class="row">
          <span style={{ minWidth: '76px', color: 'var(--text-2)' }}>Units</span>
          <select class="tinput" value={m.unit} onChange={(e) => {
            const u = (e.target as HTMLSelectElement).value as Unit;
            ed.setMeasure({ unit: u, perWorld: PER_PX[u] * scaleK, precision: u === 'px' || u === 'mm' ? 0 : u === 'm' ? 2 : 1 });
          }}>
            {UNITS.map((u) => <option value={u.id}>{u.label}</option>)}
          </select>
        </div>
        <div class="row">
          <span style={{ minWidth: '76px', color: 'var(--text-2)' }}>Scale</span>
          <div class="seg" style={{ flex: 1 }}>
            {SCALES.map((sc) => (
              <button class={Math.abs(scaleK - sc.k) < 1e-6 ? 'on' : ''} onClick={() => ed.setMeasure({ perWorld: PER_PX[m.unit] * sc.k })}>{sc.l}</button>
            ))}
          </div>
        </div>
        <div class="row">
          <span style={{ minWidth: '76px', color: 'var(--text-2)' }}>Precision</span>
          <Seg value={m.precision} onChange={(v) => ed.setMeasure({ precision: v })} options={[{ v: 0, l: '0' }, { v: 1, l: '0.0' }, { v: 2, l: '0.00' }]} />
        </div>
      </div>
      <div class="sec">
        <h4>Artboard</h4>
        <select class="tinput" value={d.artboard ? d.artboard.name : ''} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (!v) { ed.setArtboard(null); return; }
          const p = ARTBOARD_PRESETS.find((x) => x.name === v);
          if (p) ed.setArtboard({ x: d.artboard?.x ?? 0, y: d.artboard?.y ?? 0, w: p.w, h: p.h, name: p.name });
        }}>
          <option value="">Infinite canvas (no artboard)</option>
          {ARTBOARD_PRESETS.map((p) => <option value={p.name}>{p.name} — {p.w}×{p.h}</option>)}
          {d.artboard && !ARTBOARD_PRESETS.find((p) => p.name === d.artboard!.name) && <option value={d.artboard.name}>{d.artboard.name}</option>}
        </select>
        {d.artboard && (
          <div class="row" style={{ marginTop: '6px' }}>
            <input class="tinput" type="number" value={Math.round(d.artboard.w)} onChange={(e) => ed.setArtboard({ ...d.artboard!, w: Math.max(16, +(e.target as HTMLInputElement).value), name: 'Custom' })} />
            <span>×</span>
            <input class="tinput" type="number" value={Math.round(d.artboard.h)} onChange={(e) => ed.setArtboard({ ...d.artboard!, h: Math.max(16, +(e.target as HTMLInputElement).value), name: 'Custom' })} />
            <span style={{ color: 'var(--text-3)' }}>px</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PaperIcon({ kind }: { kind: PaperKind }) {
  const inner: Record<PaperKind, string> = {
    blank: '',
    dots: Array.from({ length: 16 }, (_, i) => `<circle cx="${4 + (i % 4) * 5.3}" cy="${4 + Math.floor(i / 4) * 5.3}" r="0.9" fill="currentColor"/>`).join(''),
    grid: '<path d="M2 7.3h20M2 12.6h20M2 17.9h20M7.3 2v20M12.6 2v20M17.9 2v20" stroke="currentColor" stroke-width=".8"/>',
    graph: '<path d="M2 5h20M2 8h20M2 14h20M2 17h20M2 20h20M5 2v20M8 2v20M14 2v20M17 2v20M20 2v20" stroke="currentColor" stroke-width=".4"/><path d="M2 11h20M11 2v20" stroke="currentColor" stroke-width="1"/>',
    lines: '<path d="M2 6h20M2 10h20M2 14h20M2 18h20" stroke="currentColor" stroke-width=".8"/>',
    iso: '<path d="M7 2v20M12 2v20M17 2v20M2 5l20 11.5M2 10.5l20 11.5M2 16l11 6.3M2 16.5 22 5M2 22 22 10.5M11 2 2 7.2" stroke="currentColor" stroke-width=".6"/>',
  };
  return <svg width="24" height="24" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity=".6" /><g dangerouslySetInnerHTML={{ __html: inner[kind] }} /></svg>;
}
