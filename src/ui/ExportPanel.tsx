import { useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import { PanelTitle, Seg, ToggleRow, toast, useEditor } from './common';
import { PageSettings, ensurePage } from './PageSettings';
import { pagePixels, pageDims } from '../core/page';
import { Icon } from './icons';
import { exportRect, clampScale, renderRegion, canvasToBlob, preloadImages, renderLayerToCanvas, type ExportArea } from '../export/raster';
import { exportSVG } from '../export/svg';
import { exportPDF } from '../export/pdf';
import { exportPSD } from '../export/psd';
import { zip } from '../export/zip';
import { shareFile, saveToPhotos, isNative } from '../storage/kv';
import { serializeDoc } from '../storage/docs';
import { visibleWorld } from '../render/background';
import type { Rect } from '../core/geom';

type Fmt = 'png' | 'jpg' | 'svg' | 'pdf' | 'psd' | 'layers' | 'draftwell';
const FORMATS: { v: Fmt; l: string; d: string }[] = [
  { v: 'png', l: 'PNG', d: 'Image with transparency' },
  { v: 'jpg', l: 'JPG', d: 'Compact image' },
  { v: 'svg', l: 'SVG', d: 'Scalable vector' },
  { v: 'pdf', l: 'PDF', d: 'Vector or raster document' },
  { v: 'psd', l: 'PSD', d: 'Layered Photoshop file' },
  { v: 'layers', l: 'Layers', d: 'ZIP of PNG per layer' },
  { v: 'draftwell', l: 'Draftwell', d: 'Editable drawing file' },
];

export function ExportPanel({ ed, onClose, viewSize }: { ed: Editor; onClose: () => void; viewSize: () => { w: number; h: number } }) {
  const [fmt, setFmt] = useState<Fmt>(() => (localStorage.getItem('draftwell.exfmt') as Fmt) || 'png');
  const hasSel = ed.selection.size > 0;
  const [area, setAreaRaw] = useState<ExportArea>(hasSel ? 'selection' : ed.doc.page ? 'page' : ed.doc.artboard ? 'artboard' : 'drawing');
  const setArea = (a: ExportArea) => {
    if (a === 'page') ensurePage(ed, viewSize);
    setAreaRaw(a);
  };
  useEditor(ed, ['ui', 'overlay']);
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [grid, setGrid] = useState(ed.doc.background.exportGrid);
  const [raster, setRaster] = useState(false);
  const [busy, setBusy] = useState(false);
  const doc = ed.doc;
  const vs = viewSize();
  const viewRect = visibleWorld(doc.view.m, vs.w, vs.h);
  const selB = ed.selectionBounds();
  const r: Rect = exportRect(doc, area, viewRect, selB);
  const page = area === 'page' ? ed.doc.page : null;
  const pagePx = page ? pagePixels(page) : null;
  const pageMM = page ? pageDims(page) : null;
  const s = clampScale(r, pagePx ? pagePx.w / (r.x1 - r.x0) : scale);
  const pxW = Math.round((r.x1 - r.x0) * s), pxH = Math.round((r.y1 - r.y0) * s);
  const vector = fmt === 'svg' || (fmt === 'pdf' && !raster);
  const fname = (ext: string) => `${(doc.name || 'Drawing').replace(/[\\/:*?"<>|]+/g, '_')}.${ext}`;
  const onlyIds = area === 'selection' && hasSel ? new Set(ed.selection) : undefined;

  const build = async (): Promise<{ name: string; mime: string; blob: Blob } | null> => {
    await preloadImages(doc);
    switch (fmt) {
      case 'png': case 'jpg': {
        const c = renderRegion(doc, r, { scale: s, transparent: fmt === 'png' && transparent, grid, onlyIds });
        const blob = await canvasToBlob(c, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
        return { name: fname(fmt), mime: fmt === 'png' ? 'image/png' : 'image/jpeg', blob };
      }
      case 'svg':
        return { name: fname('svg'), mime: 'image/svg+xml', blob: new Blob([exportSVG(doc, r, { transparent, onlyIds, pageMM: pageMM ? { w: pageMM.wmm, h: pageMM.hmm } : undefined })], { type: 'image/svg+xml' }) };
      case 'pdf': {
        const d = await exportPDF(onlyIds ? { ...doc, layers: doc.layers.map((l) => ({ ...l, items: l.items.filter((i) => onlyIds.has(i.id)) })) } : doc, r, { transparent, raster, scale: s, pageMM: pageMM ? { w: pageMM.wmm, h: pageMM.hmm } : undefined });
        return { name: fname('pdf'), mime: 'application/pdf', blob: new Blob([d as BlobPart], { type: 'application/pdf' }) };
      }
      case 'psd': {
        const d = exportPSD(doc, r, s, transparent);
        return { name: fname('psd'), mime: 'image/vnd.adobe.photoshop', blob: new Blob([d as BlobPart], { type: 'image/vnd.adobe.photoshop' }) };
      }
      case 'layers': {
        const files: { name: string; data: Uint8Array }[] = [];
        let i = 1;
        for (const l of doc.layers) {
          const c = renderLayerToCanvas(doc, l, r, s, onlyIds);
          const b = await canvasToBlob(c, 'image/png');
          files.push({ name: `${String(i++).padStart(2, '0')} ${l.name.replace(/[\\/:*?"<>|]+/g, '_')}.png`, data: new Uint8Array(await b.arrayBuffer()) });
        }
        const z = zip(files);
        return { name: fname('zip'), mime: 'application/zip', blob: new Blob([z as BlobPart], { type: 'application/zip' }) };
      }
      case 'draftwell':
        return { name: fname('draftwell'), mime: 'application/json', blob: new Blob([serializeDoc(doc)], { type: 'application/json' }) };
    }
  };

  const run = async (photos = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await build();
      if (!f) return;
      if (photos) {
        const ok = await saveToPhotos(f.blob);
        toast(ok ? 'Saved to Photos' : 'Could not save to Photos');
      } else await shareFile(f.name, f.mime, f.blob);
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setFmtP = (f: Fmt) => { setFmt(f); try { localStorage.setItem('draftwell.exfmt', f); } catch {} };
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Export" onClose={onClose} />
      <div class="sec">
        <h4>Format</h4>
        <div class="grid-btns">
          {FORMATS.map((f) => (
            <button class={'tile' + (fmt === f.v ? ' on' : '')} onClick={() => setFmtP(f.v)} title={f.d}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'inherit' }}>{f.l}</span>
            </button>
          ))}
        </div>
        <div class="hint">{FORMATS.find((f) => f.v === fmt)!.d}</div>
      </div>
      {fmt !== 'draftwell' && (
        <div class="sec">
          <h4>Area</h4>
          <Seg value={area} onChange={setArea} options={[
            { v: 'drawing', l: 'Drawing' },
            { v: 'page', l: 'Page' },
            ...(doc.artboard ? [{ v: 'artboard' as ExportArea, l: 'Artboard' }] : []),
            { v: 'view', l: 'View' },
            ...(hasSel ? [{ v: 'selection' as ExportArea, l: 'Selection' }] : []),
          ]} />
          {area === 'page' && ed.doc.page && (
            <div style={{ marginTop: '12px' }}><PageSettings ed={ed} viewSize={viewSize} /></div>
          )}
          {!vector && area !== 'page' && (
            <>
              <h4 style={{ marginTop: '12px' }}>Resolution</h4>
              <Seg value={scale} onChange={setScale} options={[{ v: 1, l: '1×' }, { v: 2, l: '2×' }, { v: 3, l: '3×' }, { v: 4, l: '4×' }, { v: 8, l: '8×' }]} />
              <div class="hint">{pxW} × {pxH} px{s < scale - 1e-6 ? ' (limited by device memory)' : ''}</div>
            </>
          )}
          {(fmt === 'png' || fmt === 'svg' || fmt === 'pdf' || fmt === 'psd') && (
            <ToggleRow label="Transparent background" on={transparent} onChange={setTransparent} />
          )}
          {(fmt === 'png' || fmt === 'jpg') && <ToggleRow label="Include grid" on={grid} onChange={setGrid} />}
          {fmt === 'pdf' && <ToggleRow label="Rasterize (exact look)" on={raster} onChange={setRaster} hint="Vector PDFs approximate soft brushes like airbrush and watercolor." />}
        </div>
      )}
      <div class="sec">
        <button class="btn primary wide" disabled={busy} onClick={() => run(false)}>
          <Icon name="share" size={18} />{busy ? 'Exporting…' : isNative() ? 'Share / Save to Files' : 'Download'}
        </button>
        {isNative() && (fmt === 'png' || fmt === 'jpg') && (
          <button class="btn wide" style={{ marginTop: '8px' }} disabled={busy} onClick={() => run(true)}>
            <Icon name="image" size={18} />Save to Photos
          </button>
        )}
      </div>
    </div>
  );
}
