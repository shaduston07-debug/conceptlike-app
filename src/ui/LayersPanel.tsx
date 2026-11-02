import { useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import type { Layer, BlendMode } from '../core/types';
import { useEditor, PanelTitle, SliderRow } from './common';
import { Icon } from './icons';
import { renderLayerItems } from '../render/renderer';
import { itemsBounds } from '../core/items';
import { rectValid } from '../core/geom';

const thumbCache = new WeakMap<Layer, string>();
function layerThumb(l: Layer, bg: string): string {
  let t = thumbCache.get(l);
  if (t !== undefined) return t;
  const b = itemsBounds(l.items.filter((i) => !(i.kind === 'stroke' && i.brush === 'softEraser')));
  if (!rectValid(b)) { thumbCache.set(l, ''); return ''; }
  const W = 104, H = 80;
  const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.08 + 1;
  const s = Math.min(W / (b.x1 - b.x0 + pad * 2), H / (b.y1 - b.y0 + pad * 2));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const ox = (W - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy = (H - (b.y1 - b.y0) * s) / 2 - b.y0 * s;
  renderLayerItems(ctx, l, [s, 0, 0, s, ox, oy], null);
  t = c.toDataURL('image/png');
  thumbCache.set(l, t);
  return t;
}

const BLENDS: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const blendLabel = (b: string) => b.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function LayersPanel({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  useEditor(ed, ['doc', 'ui']);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dy: number; startY: number; from: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const layers = [...ed.doc.layers].reverse(); // top first
  const ROW = 54;
  const onGripDown = (e: PointerEvent, l: Layer) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setOpen(null);
    setDrag({ id: l.id, dy: 0, startY: e.clientY, from: layers.findIndex((x) => x.id === l.id) });
  };
  const onGripMove = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY });
  };
  const onGripUp = () => {
    if (!drag) return;
    const to = Math.max(0, Math.min(layers.length - 1, drag.from + Math.round(drag.dy / ROW)));
    if (to !== drag.from) {
      // convert top-first index to bottom-first
      ed.moveLayer(drag.id, layers.length - 1 - to);
    }
    setDrag(null);
  };
  const dragTo = drag ? Math.max(0, Math.min(layers.length - 1, drag.from + Math.round(drag.dy / ROW))) : -1;
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Layers" onClose={onClose}>
        <button class="ibtn sm" title="New layer" onClick={() => ed.addLayer()}><Icon name="plus" size={20} /></button>
      </PanelTitle>
      <div ref={listRef} style={{ padding: '6px 0' }}>
        {layers.map((l, i) => {
          const active = l.id === ed.doc.activeLayer;
          let shift = 0;
          if (drag && drag.id !== l.id) {
            if (drag.from < i && i <= dragTo) shift = -ROW;
            else if (drag.from > i && i >= dragTo) shift = ROW;
          }
          const isDrag = drag?.id === l.id;
          const thumb = layerThumb(l, ed.doc.background.color);
          return (
            <div key={l.id}>
              <div class={'layer-row' + (active ? ' on' : '') + (isDrag ? ' dragging' : '')}
                style={{ transform: `translateY(${isDrag ? drag!.dy : shift}px)`, transition: isDrag ? 'none' : 'transform .15s', opacity: l.visible ? 1 : 0.55 }}
                onClick={() => { if (active) setOpen(open === l.id ? null : l.id); else ed.setActiveLayer(l.id); }}>
                <div class="grip" onPointerDown={(e) => onGripDown(e as any, l)} onPointerMove={(e) => onGripMove(e as any)} onPointerUp={onGripUp} onPointerCancel={onGripUp} onClick={(e) => e.stopPropagation()}>
                  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
                </div>
                <div class="layer-thumb" style={{ background: ed.doc.background.color }}>{thumb && <img src={thumb} />}</div>
                <div class="layer-name">
                  <div class="n">{l.name}</div>
                  <div class="s">{l.items.length} item{l.items.length === 1 ? '' : 's'} · {Math.round(l.opacity * 100)}%{l.blend !== 'normal' ? ' · ' + blendLabel(l.blend) : ''}</div>
                </div>
                <button class="ibtn sm" onClick={(e) => { e.stopPropagation(); ed.updateLayer(l.id, { locked: !l.locked }); }}><Icon name={l.locked ? 'lock' : 'unlock'} size={17} className={l.locked ? '' : 'dim'} /></button>
                <button class="ibtn sm" onClick={(e) => { e.stopPropagation(); ed.updateLayer(l.id, { visible: !l.visible }); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} size={18} /></button>
              </div>
              {open === l.id && !drag && <LayerDetail ed={ed} l={l} />}
            </div>
          );
        })}
      </div>
      <div class="sec">
        <div class="hint">Tap the active layer for options. Drag the handle to reorder.</div>
      </div>
    </div>
  );
}

function LayerDetail({ ed, l }: { ed: Editor; l: Layer }) {
  const [op, setOp] = useState(l.opacity);
  const idx = ed.doc.layers.findIndex((x) => x.id === l.id);
  return (
    <div class="layer-detail" onClick={(e) => e.stopPropagation()}>
      <div class="row">
        <input class="tinput" value={l.name} onChange={(e) => ed.updateLayer(l.id, { name: (e.target as HTMLInputElement).value || l.name })} />
      </div>
      <SliderRow label="Opacity" value={op} min={0} max={1} fmt={(v) => Math.round(v * 100) + '%'}
        onChange={(v) => { setOp(v); ed.updateLayer(l.id, { opacity: v }, false); }} onEnd={() => ed.updateLayer(l.id, { opacity: op })} />
      <div class="row">
        <span style={{ minWidth: '76px', color: 'var(--text-2)' }}>Blend</span>
        <select class="tinput" value={l.blend} onChange={(e) => ed.updateLayer(l.id, { blend: (e.target as HTMLSelectElement).value as BlendMode })}>
          {BLENDS.map((b) => <option value={b}>{blendLabel(b)}</option>)}
        </select>
      </div>
      <div class="row" style={{ flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
        <button class="btn" onClick={() => ed.duplicateLayer(l.id)}><Icon name="duplicate" size={16} />Duplicate</button>
        <button class="btn" disabled={idx <= 0} onClick={() => ed.mergeDown(l.id)}><Icon name="merge" size={16} />Merge down</button>
        <button class="btn" onClick={() => { ed.setTool('select'); ed.setSelection(l.items.map((i) => i.id)); }}>Select</button>
        <button class="btn" onClick={() => ed.updateLayer(l.id, { items: [] })}>Clear</button>
        <button class="btn danger" onClick={() => ed.deleteLayer(l.id)}><Icon name="trash" size={16} />Delete</button>
      </div>
    </div>
  );
}
