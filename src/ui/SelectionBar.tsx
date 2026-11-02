import { useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import type { Item, Mat } from '../core/types';
import { useEditor, PanelTitle, toast } from './common';
import { Icon } from './icons';
import { about, scale, rotate, translate } from '../core/geom';
import { copySelection, cutSelection, paste, hasClipboard } from './clipboard';
import { formatLength } from '../core/measure';
import type { PanelId } from './Toolbar';

export function SelectionBar({ ed, viewSize, setPanel }: { ed: Editor; viewSize: () => { w: number; h: number }; setPanel: (p: PanelId) => void }) {
  useEditor(ed, ['ui', 'doc']);
  const [layerMenu, setLayerMenu] = useState(false);
  const [more, setMore] = useState(false);
  if (!ed.selection.size) return null;
  const b = ed.selectionBounds();
  if (!b) return null;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const tf = (m: Mat, label: string) => ed.transformSelection(about(m, cx, cy), label);
  const restyle = () => {
    const p = ed.presets[ed.lastDrawPreset] || ed.preset;
    const zoomK = ed.settings.scaleBrushWithZoom ? Math.hypot(ed.doc.view.m[0], ed.doc.view.m[1]) : 1;
    const ch = new Map<string, Item>();
    for (const it of ed.selectedItems) {
      if (it.kind === 'stroke') ch.set(it.id, { ...it, brush: p.brush, color: p.color, opacity: p.opacity, size: p.size / zoomK });
      else if (it.kind === 'fill' || it.kind === 'text') ch.set(it.id, { ...it, color: p.color });
    }
    ed.editItems(ch, 'Restyle');
    toast('Applied ' + (p.name || p.brush));
  };
  const recolor = () => {
    const p = ed.presets[ed.lastDrawPreset] || ed.preset;
    const ch = new Map<string, Item>();
    for (const it of ed.selectedItems) if (it.kind !== 'image') ch.set(it.id, { ...it, color: p.color } as Item);
    ed.editItems(ch, 'Color');
  };
  const n = ed.selection.size;
  return (
    <>
      <div class="strip selbar" onPointerDown={(e) => e.stopPropagation()}>
        <span class="lbl">{n} selected{ed.settings.measureOn ? ` · ${formatLength(b.x1 - b.x0, ed.doc.measure)} × ${formatLength(b.y1 - b.y0, ed.doc.measure)}` : ''}</span>
        <div class="sep" />
        <button class="ibtn sm" title="Duplicate" onClick={() => ed.duplicateSelection()}><Icon name="duplicate" size={19} /></button>
        <button class="ibtn sm" title="Copy" onClick={() => { copySelection(ed); toast('Copied'); }}><Icon name="copy" size={19} /></button>
        <button class="ibtn sm" title="Cut" onClick={() => cutSelection(ed)}><Icon name="cut" size={19} /></button>
        <button class="ibtn sm" title="Paste" disabled={!hasClipboard()} onClick={() => { const v = viewSize(); paste(ed, v.w, v.h); }}><Icon name="paste" size={19} /></button>
        <button class="ibtn sm" title="Delete" onClick={() => ed.deleteItems([...ed.selection])}><Icon name="trash" size={19} /></button>
        <div class="sep" />
        <button class="ibtn sm" title="Flip horizontal" onClick={() => tf(scale(-1, 1), 'Flip')}><Icon name="flipH" size={19} /></button>
        <button class="ibtn sm" title="Flip vertical" onClick={() => tf(scale(1, -1), 'Flip')}><Icon name="flipV" size={19} /></button>
        <button class="ibtn sm" title="Rotate 90°" onClick={() => tf(rotate(Math.PI / 2), 'Rotate')}><Icon name="rotate" size={19} /></button>
        <button class="ibtn sm" title="Restyle with current tool" onClick={restyle}><Icon name="restyle" size={19} /></button>
        <button class="ibtn sm" title="Apply current color" onClick={recolor}><span style={{ width: '18px', height: '18px', borderRadius: '50%', background: (ed.presets[ed.lastDrawPreset] || ed.preset).color, boxShadow: '0 0 0 1px var(--border)' }} /></button>
        <div class="sep" />
        <button class="ibtn sm" title="More" onClick={() => setMore(!more)}><Icon name="more" size={19} /></button>
        <button class="ibtn sm" title="Done" onClick={() => ed.clearSelection()}><Icon name="check" size={19} /></button>
      </div>
      {more && (
        <div class="menu" style={{ top: '118px', left: '50%', transform: 'translateX(-50%)' }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => { ed.orderSelection('front'); setMore(false); }}><Icon name="front" size={18} />Bring to front</button>
          <button onClick={() => { ed.orderSelection('forward'); setMore(false); }}><Icon name="front" size={18} />Bring forward</button>
          <button onClick={() => { ed.orderSelection('backward'); setMore(false); }}><Icon name="back" size={18} />Send backward</button>
          <button onClick={() => { ed.orderSelection('back'); setMore(false); }}><Icon name="back" size={18} />Send to back</button>
          <button onClick={() => { setLayerMenu(true); setMore(false); }}><Icon name="layers" size={18} />Move to layer…</button>
          <button onClick={() => { setPanel('transform'); setMore(false); }}><Icon name="transform" size={18} />Transform…</button>
          <button onClick={() => { setPanel('library'); setMore(false); }}><Icon name="library" size={18} />Save to library…</button>
          <button onClick={() => { setPanel('export'); setMore(false); }}><Icon name="share" size={18} />Export selection…</button>
        </div>
      )}
      {layerMenu && (
        <div class="menu" style={{ top: '118px', left: '50%', transform: 'translateX(-50%)' }} onPointerDown={(e) => e.stopPropagation()}>
          {[...ed.doc.layers].reverse().map((l) => (
            <button onClick={() => { ed.moveSelectionToLayer(l.id); setLayerMenu(false); }} disabled={l.locked}>
              <Icon name="layers" size={18} />{l.name}{l.id === ed.doc.activeLayer ? ' (current)' : ''}
            </button>
          ))}
          <button onClick={() => { const l = ed.addLayer(); ed.moveSelectionToLayer(l.id); setLayerMenu(false); }}><Icon name="plus" size={18} />New layer</button>
          <button onClick={() => setLayerMenu(false)}><Icon name="close" size={18} />Cancel</button>
        </div>
      )}
    </>
  );
}

export function TransformPanel({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  useEditor(ed, ['ui', 'doc']);
  const b = ed.selectionBounds();
  const [rot, setRot] = useState(0);
  if (!b) return null;
  const m = ed.doc.measure;
  const toU = (v: number) => +(v * m.perWorld).toFixed(Math.max(2, m.precision));
  const fromU = (v: number) => v / m.perWorld;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const field = (label: string, value: number, apply: (v: number) => void) => (
    <div class="row">
      <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>{label}</span>
      <input class="tinput" type="number" step="any" value={toU(value)} onChange={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (isFinite(v)) apply(fromU(v)); }} />
      <span style={{ color: 'var(--text-3)', minWidth: '24px' }}>{m.unit}</span>
    </div>
  );
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Transform" onClose={onClose} />
      <div class="sec">
        {field('X', b.x0, (v) => ed.transformSelection(translate(v - b.x0, 0), 'Move'))}
        {field('Y', b.y0, (v) => ed.transformSelection(translate(0, v - b.y0), 'Move'))}
        {field('Width', w, (v) => v > 0 && w > 0 && ed.transformSelection(about(scale(v / w, 1), b.x0, b.y0), 'Scale'))}
        {field('Height', h, (v) => v > 0 && h > 0 && ed.transformSelection(about(scale(1, v / h), b.x0, b.y0), 'Scale'))}
        <div class="row">
          <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Rotate</span>
          <input class="tinput" type="number" step="any" value={rot} onInput={(e) => setRot(parseFloat((e.target as HTMLInputElement).value) || 0)} />
          <button class="btn" onClick={() => { ed.transformSelection(about(rotate((rot * Math.PI) / 180), (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), 'Rotate'); }}>Apply</button>
        </div>
        <div class="row">
          <span style={{ minWidth: '70px', color: 'var(--text-2)' }}>Scale %</span>
          {[50, 200].map((k) => <button class="btn" onClick={() => ed.transformSelection(about(scale(k / 100), (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), 'Scale')}>{k}%</button>)}
        </div>
      </div>
    </div>
  );
}
