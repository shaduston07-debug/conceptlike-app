import type { AppCtx, Ptr, Tool } from './context';
import type { FillItem, Mat, Item } from '../core/types';
import { dilate, floodFill, traceContours, chaikin } from '../core/flood';
import { simplify, inv, apply, uid, rectsOverlap } from '../core/geom';
import { hitItem, itemBounds } from '../core/items';
import { renderLayerItems } from '../render/renderer';
import { visibleWorld } from '../render/background';

export class FillTool implements Tool {
  private path: number[] = [];
  private start: Ptr | null = null;
  private moved = false;
  constructor(private app: AppCtx) {}
  busy() { return !!this.start; }

  down(p: Ptr) {
    this.app.editor.clearSelection();
    this.app.editor.liveShapeId = null;
    this.start = p;
    this.moved = false;
    this.path = [p.wx, p.wy];
  }
  move(p: Ptr, batch: Ptr[]) {
    if (!this.start) return;
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 8) this.moved = true;
    for (const b of batch) this.path.push(b.wx, b.wy);
    this.app.renderer.requestOverlay();
  }
  up(p: Ptr) {
    if (!this.start) return;
    const ed = this.app.editor;
    const layer = ed.activeLayer;
    this.start = null;
    if (!layer.visible || layer.locked) {
      this.app.toast(layer.locked ? 'Layer is locked' : 'Layer is hidden');
      this.path = [];
      return;
    }
    if (this.moved && this.path.length >= 6) {
      // lasso fill
      const poly = simplify(this.path, 0.6 / this.app.zoom());
      this.insert({ kind: 'fill', id: uid('i'), color: ed.fillColor, opacity: ed.fillOpacity, polys: [poly] });
    } else {
      // tap on an existing fill = recolour it
      const tol = 2 / this.app.zoom();
      for (let i = layer.items.length - 1; i >= 0; i--) {
        const it = layer.items[i];
        if (it.kind === 'fill' && hitItem(it, p.wx, p.wy, tol)) {
          const m = new Map<string, Item>([[it.id, { ...it, color: ed.fillColor, opacity: ed.fillOpacity }]]);
          ed.editItems(m, 'Recolor fill');
          this.path = [];
          return;
        }
      }
      this.flood(p);
    }
    this.path = [];
    this.app.renderer.requestOverlay();
  }
  cancel() {
    this.start = null;
    this.path = [];
  }

  private insert(f: FillItem) {
    const ed = this.app.editor;
    const layer = ed.activeLayer;
    // place the fill just below the first stroke it overlaps so line work stays on top
    const fb = itemBounds(f);
    let idx = layer.items.findIndex((it) => it.kind !== 'fill' && rectsOverlap(itemBounds(it), fb));
    if (idx < 0) idx = layer.items.length;
    const items = layer.items.slice();
    items.splice(idx, 0, f);
    ed.updateLayer(layer.id, { items }, false);
    ed.commit('Fill');
  }

  private flood(p: Ptr) {
    const ed = this.app.editor;
    const r = this.app.renderer;
    // rasterise at CSS pixel resolution (enough precision, 4x cheaper than device pixels)
    const w = r.w, h = r.h;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const view = ed.doc.view.m;
    const world = visibleWorld(view, w, h);
    for (const l of ed.doc.layers) {
      if (!l.visible) continue;
      if (!ed.fillAllLayers && l.id !== ed.doc.activeLayer) continue;
      const lc = document.createElement('canvas');
      lc.width = w; lc.height = h;
      const lctx = lc.getContext('2d')!;
      renderLayerItems(lctx, { ...l, items: l.items.filter((i) => i.kind !== 'fill') }, view, world);
      ctx.globalAlpha = 1;
      ctx.drawImage(lc, 0, 0);
    }
    const data = ctx.getImageData(0, 0, w, h).data;
    let barrier: Uint8Array = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) barrier[i] = data[i * 4 + 3] > 60 ? 1 : 0;
    const gap = Math.max(0, Math.round(ed.fillGap));
    if (gap > 0) barrier = dilate(barrier, w, h, gap);
    const sx = Math.round(p.x), sy = Math.round(p.y);
    if (barrier[sy * w + sx]) {
      this.app.toast('Tap inside an enclosed area');
      return;
    }
    const res = floodFill(barrier, w, h, sx, sy);
    if (res.touchesEdge) {
      this.app.toast('Area isn’t closed — zoom out or close the gap');
      return;
    }
    if (res.count < 4) return;
    // grow under the line work so there are no halos
    const grown = dilate(res.mask, w, h, gap + 2);
    for (let i = 0; i < w * h; i++) if (grown[i] && !res.mask[i]) {
      // only grow into ink, not into other empty regions
      if (!(data[i * 4 + 3] > 8) && !barrier[i]) grown[i] = 0;
    }
    const loops = traceContours(grown, w, h);
    const iv = inv(view);
    const polys: number[][] = [];
    for (const loop of loops) {
      const sm = simplify(chaikin(loop, 2), 0.45);
      if (sm.length < 6) continue;
      const out: number[] = [];
      for (let i = 0; i < sm.length; i += 2) {
        const q = apply(iv, sm[i], sm[i + 1]);
        out.push(q.x, q.y);
      }
      polys.push(out);
    }
    if (!polys.length) return;
    this.insert({ kind: 'fill', id: uid('i'), color: ed.fillColor, opacity: ed.fillOpacity, polys });
  }

  overlay(ctx: CanvasRenderingContext2D, view: Mat) {
    if (!this.moved || this.path.length < 4) return;
    ctx.beginPath();
    for (let i = 0; i < this.path.length; i += 2) {
      const q = apply(view, this.path[i], this.path[i + 1]);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.globalAlpha = this.app.editor.fillOpacity * 0.8;
    ctx.fillStyle = this.app.editor.fillColor;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
