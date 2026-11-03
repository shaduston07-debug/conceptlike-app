import type { Editor } from '../core/editor';
import type { PageFrame } from '../core/types';
import { useEditor, Seg, ToggleRow } from './common';
import { Icon } from './icons';
import { PAPER_SIZES, defaultPage, fitPageTo, pagePixels, pageDims, pageRect } from '../core/page';
import { contentBounds } from '../export/raster';
import { apply, inv, matScale } from '../core/geom';

/** Ensure the document has a page frame, creating one that fits the drawing (or the view). */
export function ensurePage(ed: Editor, viewSize: () => { w: number; h: number }): PageFrame {
  if (ed.doc.page) return ed.doc.page;
  const { w, h } = viewSize();
  const c = apply(inv(ed.doc.view.m), w / 2, h / 2);
  let pg = defaultPage(c.x, c.y);
  const b = contentBounds(ed.doc);
  if (b) {
    pg = { ...pg, landscape: b.x1 - b.x0 > b.y1 - b.y0 };
    pg = fitPageTo(pg, b);
  } else {
    // empty drawing: size the page so the whole sheet is visible
    const z = matScale(ed.doc.view.m);
    const r = pageRect(pg);
    const k = Math.min(1, (0.8 * Math.min(w / z / (r.x1 - r.x0), h / z / (r.y1 - r.y0))));
    pg = { ...pg, scale: k };
  }
  ed.setPage(pg);
  return pg;
}

export function PageSettings({ ed, viewSize }: { ed: Editor; viewSize: () => { w: number; h: number } }) {
  useEditor(ed, ['ui', 'overlay']);
  const pg = ed.doc.page;
  if (!pg) return null;
  const set = (p: Partial<PageFrame>) => ed.setPage({ ...pg, ...p });
  const px = pagePixels(pg);
  const dims = pageDims(pg);
  const isCustom = !PAPER_SIZES.find((s) => s.name === pg.preset);
  return (
    <div>
      <div class="row">
        <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Paper</span>
        <select class="tinput" value={isCustom ? 'Custom' : pg.preset} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          const s = PAPER_SIZES.find((x) => x.name === v);
          if (s) set({ preset: s.name, wmm: s.w, hmm: s.h });
          else set({ preset: 'Custom' });
        }}>
          {PAPER_SIZES.map((s) => <option value={s.name}>{s.name} — {s.w} × {s.h} mm</option>)}
          <option value="Custom">Custom size…</option>
        </select>
      </div>
      {isCustom && (
        <div class="row">
          <input class="tinput" type="number" step="any" value={+pg.wmm.toFixed(1)} onChange={(e) => set({ wmm: Math.max(10, +(e.target as HTMLInputElement).value || pg.wmm) })} />
          <span>×</span>
          <input class="tinput" type="number" step="any" value={+pg.hmm.toFixed(1)} onChange={(e) => set({ hmm: Math.max(10, +(e.target as HTMLInputElement).value || pg.hmm) })} />
          <span style={{ color: 'var(--text-3)' }}>mm</span>
        </div>
      )}
      <div class="row">
        <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Orientation</span>
        <Seg value={pg.landscape ? 1 : 0} onChange={(v) => set({ landscape: !!v })} options={[{ v: 0, l: 'Portrait' }, { v: 1, l: 'Landscape' }]} />
      </div>
      <div class="row">
        <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Quality</span>
        <Seg value={pg.dpi} onChange={(v) => set({ dpi: v })} options={[{ v: 72, l: '72' }, { v: 150, l: '150' }, { v: 300, l: '300' }, { v: 600, l: '600 dpi' }]} />
      </div>
      <div class="row">
        <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Scale</span>
        <input class="tinput" type="number" step="any" style={{ flex: '0 0 84px' }} value={+(pg.scale * 100).toFixed(1)}
          onChange={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) set({ scale: v / 100 }); }} />
        <span style={{ color: 'var(--text-3)' }}>%</span>
      </div>
      <div class="row" style={{ marginBottom: '4px' }}>
        <div class="seg" style={{ flex: 1 }}>
          {[25, 50, 100, 200, 400].map((k) => (
            <button class={Math.abs(pg.scale * 100 - k) < 0.05 ? 'on' : ''} onClick={() => set({ scale: k / 100 })}>{k}%</button>
          ))}
        </div>
      </div>
      <div class="hint" style={{ marginTop: 0 }}>
        At 100% one canvas pixel prints as 1/96 inch. Larger scale fits more of the infinite canvas on the sheet.
        Output: {dims.wmm.toFixed(0)} × {dims.hmm.toFixed(0)} mm · {px.w} × {px.h} px
      </div>
      <div class="row" style={{ gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        <button class="btn" onClick={() => { const b = contentBounds(ed.doc); if (b) ed.setPage(fitPageTo(pg, b)); }}><Icon name="fit" size={16} />Fit drawing</button>
        <button class="btn" onClick={() => {
          const { w, h } = viewSize();
          const c = apply(inv(ed.doc.view.m), w / 2, h / 2);
          set({ x: c.x, y: c.y });
        }}><Icon name="hand" size={16} />Move to view</button>
        <button class="btn danger" onClick={() => ed.setPage(null)}><Icon name="trash" size={16} />Remove</button>
      </div>
      <ToggleRow label="Show page on canvas" on={pg.visible} onChange={(v) => set({ visible: v })} hint="Drag the orange centre handle to move the page and the corner handle to change its scale." />
    </div>
  );
}
