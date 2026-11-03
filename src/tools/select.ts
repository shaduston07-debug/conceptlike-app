import type { AppCtx, Ptr, Tool } from './context';
import type { Mat, Item } from '../core/types';
import { apply, about, scale, rotate, translate, mul, inv, pointInPoly, I, normAngle, type Rect } from '../core/geom';
import { hitItem, itemInLasso, itemBounds } from '../core/items';
import { drawItemAt, deviceCtx, groupPath, fillPath } from '../render/draw';
import { strokeOutline } from '../core/stroke';
import { formatLength } from '../core/measure';
import { label } from './draw';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';
type Phase = 'idle' | 'lasso' | 'rect' | 'move' | 'scale' | 'rotate' | 'gesture';

export const ACCENT = '#2f6bff';

export class SelectTool implements Tool {
  private phase: Phase = 'idle';
  private lasso: number[] = [];
  private start: Ptr | null = null;
  private moved = false;
  private handle: HandleId | null = null;
  private bounds: Rect | null = null;
  private tm: Mat = I;
  private additive = false;

  constructor(private app: AppCtx) {}
  busy() { return this.phase !== 'idle'; }

  private screenCorners(b: Rect, view: Mat) {
    return [apply(view, b.x0, b.y0), apply(view, b.x1, b.y0), apply(view, b.x1, b.y1), apply(view, b.x0, b.y1)];
  }

  private handlePositions(b: Rect, view: Mat): { id: HandleId; x: number; y: number; wx: number; wy: number }[] {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const w: [HandleId, number, number][] = [
      ['nw', b.x0, b.y0], ['n', cx, b.y0], ['ne', b.x1, b.y0], ['e', b.x1, cy],
      ['se', b.x1, b.y1], ['s', cx, b.y1], ['sw', b.x0, b.y1], ['w', b.x0, cy],
    ];
    const out = w.map(([id, x, y]) => ({ id, wx: x, wy: y, ...apply(view, x, y) }));
    // rotation handle: offset from top-centre in screen space, away from the centre
    const top = apply(view, cx, b.y0), c = apply(view, cx, cy);
    let dx = top.x - c.x, dy = top.y - c.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const rp = { x: top.x + dx * 34, y: top.y + dy * 34 };
    const rw = this.app.toWorld(rp.x, rp.y);
    out.push({ id: 'rot', x: rp.x, y: rp.y, wx: rw.x, wy: rw.y });
    return out;
  }

  down(p: Ptr) {
    const ed = this.app.editor;
    ed.liveShapeId = null;
    this.start = p;
    this.moved = false;
    this.additive = !!p.shift;
    const b = ed.selectionBounds();
    const view = ed.doc.view.m;
    if (b && !this.additive) {
      const hr = p.type === 'mouse' ? 10 : 22;
      for (const h of this.handlePositions(b, view)) {
        if (Math.hypot(h.x - p.x, h.y - p.y) < hr) {
          this.handle = h.id;
          this.bounds = b;
          this.phase = h.id === 'rot' ? 'rotate' : 'scale';
          this.beginTransform();
          return;
        }
      }
      const poly = this.screenCorners(b, view).flatMap((q) => [q.x, q.y]);
      if (pointInPoly(p.x, p.y, poly) || hitSelected(ed.selectedItems, p.wx, p.wy, 8 / this.app.zoom())) {
        this.phase = 'move';
        this.bounds = b;
        this.beginTransform();
        return;
      }
    }
    this.phase = ed.selectMode === 'rect' ? 'rect' : 'lasso';
    this.lasso = [p.wx, p.wy];
  }

  private beginTransform() {
    const ed = this.app.editor;
    this.tm = I;
    ed.hidden = new Set(ed.selection);
    ed.emit('doc');
  }

  move(p: Ptr, batch: Ptr[]) {
    if (!this.start) return;
    const s = this.start;
    if (Math.hypot(p.x - s.x, p.y - s.y) > 5) this.moved = true;
    const ed = this.app.editor;
    switch (this.phase) {
      case 'lasso':
        for (const b of batch) this.lasso.push(b.wx, b.wy);
        break;
      case 'rect':
        this.lasso = [s.wx, s.wy, p.wx, p.wy];
        break;
      case 'move':
        this.tm = translate(p.wx - s.wx, p.wy - s.wy);
        break;
      case 'scale': {
        const b = this.bounds!;
        const h = this.handle!;
        const px = h.includes('w') ? b.x1 : h.includes('e') ? b.x0 : (b.x0 + b.x1) / 2;
        const py = h.includes('n') ? b.y1 : h.includes('s') ? b.y0 : (b.y0 + b.y1) / 2;
        const hx = h.includes('w') ? b.x0 : h.includes('e') ? b.x1 : px;
        const hy = h.includes('n') ? b.y0 : h.includes('s') ? b.y1 : py;
        let sx = 1, sy = 1;
        if (h.length === 2) {
          const vx = hx - px, vy = hy - py;
          const k = ((p.wx - px) * vx + (p.wy - py) * vy) / (vx * vx + vy * vy || 1);
          if (p.alt) {
            sx = hx !== px ? (p.wx - px) / (hx - px) : 1;
            sy = hy !== py ? (p.wy - py) / (hy - py) : 1;
          } else sx = sy = k;
        } else if (h === 'e' || h === 'w') sx = (p.wx - px) / (hx - px || 1);
        else sy = (p.wy - py) / (hy - py || 1);
        if (Math.abs(sx) < 1e-3) sx = 1e-3 * Math.sign(sx || 1);
        if (Math.abs(sy) < 1e-3) sy = 1e-3 * Math.sign(sy || 1);
        this.tm = about(scale(sx, sy), px, py);
        break;
      }
      case 'rotate': {
        const b = this.bounds!;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        let a = Math.atan2(p.wy - cy, p.wx - cx) - Math.atan2(s.wy - cy, s.wx - cx);
        a = normAngle(a);
        if (ed.settings.angleSnap) {
          const st = Math.PI / 12;
          const sa = Math.round(a / st) * st;
          if (Math.abs(a - sa) < (3 * Math.PI) / 180) a = sa;
        }
        this.tm = about(rotate(a), cx, cy);
        break;
      }
    }
    this.app.renderer.requestOverlay();
  }

  up(p: Ptr) {
    const ed = this.app.editor;
    const phase = this.phase;
    this.phase = 'idle';
    if (phase === 'move' || phase === 'scale' || phase === 'rotate') {
      ed.hidden = new Set();
      if (this.moved && !isIdentity(this.tm)) ed.transformSelection(this.tm, phase === 'move' ? 'Move' : phase === 'scale' ? 'Scale' : 'Rotate');
      else {
        ed.emit('doc');
        if (!this.moved && phase === 'move') this.tapSelect(p);
      }
      this.tm = I;
    } else if (phase === 'lasso' || phase === 'rect') {
      if (!this.moved || ed.selectMode === 'tap') this.tapSelect(p);
      else this.lassoSelect();
    }
    this.lasso = [];
    this.start = null;
    this.app.renderer.requestOverlay();
  }

  private candidates(): Item[] {
    const ed = this.app.editor;
    const out: Item[] = [];
    for (const l of ed.doc.layers) {
      if (!l.visible || l.locked) continue;
      if (!ed.selectAllLayers && l.id !== ed.doc.activeLayer) continue;
      out.push(...l.items);
    }
    return out;
  }

  private tapSelect(p: Ptr) {
    const ed = this.app.editor;
    const tol = (p.type === 'mouse' ? 6 : 12) / this.app.zoom();
    const items = this.candidates();
    let hit: Item | null = null;
    for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], p.wx, p.wy, tol)) { hit = items[i]; break; }
    if (!hit) {
      if (!this.additive) ed.clearSelection();
      return;
    }
    if (this.additive) {
      const s = new Set(ed.selection);
      if (s.has(hit.id)) s.delete(hit.id); else s.add(hit.id);
      ed.setSelection(s);
    } else ed.setSelection([hit.id]);
  }

  private lassoSelect() {
    const ed = this.app.editor;
    let poly = this.lasso;
    if (ed.selectMode === 'rect' && poly.length === 4) {
      const [x0, y0, x1, y1] = poly;
      poly = [x0, y0, x1, y0, x1, y1, x0, y1];
    }
    if (poly.length < 6) return;
    const ids = this.candidates().filter((it) => itemInLasso(it, poly)).map((i) => i.id);
    if (this.additive) ed.setSelection([...ed.selection, ...ids]);
    else ed.setSelection(ids);
  }

  cancel() {
    const ed = this.app.editor;
    if (this.phase === 'move' || this.phase === 'scale' || this.phase === 'rotate') {
      ed.hidden = new Set();
      ed.emit('doc');
    }
    this.phase = 'idle';
    this.lasso = [];
    this.start = null;
    this.tm = I;
  }

  // ----- two finger transform of the selection -----
  wantsGesture(pts: { x: number; y: number }[]) {
    const ed = this.app.editor;
    const b = ed.selectionBounds();
    if (!b || this.phase !== 'idle') return false;
    const c = this.screenCorners(b, ed.doc.view.m);
    const xs = c.map((q) => q.x), ys = c.map((q) => q.y);
    const pad = 30;
    return pts.every((q) => q.x > Math.min(...xs) - pad && q.x < Math.max(...xs) + pad && q.y > Math.min(...ys) - pad && q.y < Math.max(...ys) + pad);
  }
  gesture(screenM: Mat) {
    const ed = this.app.editor;
    if (this.phase !== 'gesture') {
      this.phase = 'gesture';
      this.bounds = ed.selectionBounds();
      this.beginTransform();
    }
    const v = ed.doc.view.m;
    this.tm = mul(inv(v), mul(screenM, v));
    this.app.renderer.requestOverlay();
  }
  gestureEnd() {
    const ed = this.app.editor;
    if (this.phase !== 'gesture') return;
    this.phase = 'idle';
    ed.hidden = new Set();
    if (!isIdentity(this.tm)) ed.transformSelection(this.tm, 'Transform');
    else ed.emit('doc');
    this.tm = I;
  }

  deactivate() {
    this.cancel();
  }

  overlay(ctx: CanvasRenderingContext2D, view: Mat) {
    const ed = this.app.editor;
    const dpr = this.app.renderer.dpr;
    // lasso / marquee
    if ((this.phase === 'lasso' || this.phase === 'rect') && this.lasso.length >= 4) {
      ctx.beginPath();
      let pts = this.lasso;
      if (this.phase === 'rect') {
        const [x0, y0, x1, y1] = pts;
        pts = [x0, y0, x1, y0, x1, y1, x0, y1];
      }
      for (let i = 0; i < pts.length; i += 2) {
        const q = apply(view, pts[i], pts[i + 1]);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(47,107,255,0.08)';
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const sel = ed.selectedItems;
    if (!sel.length) return;
    const transforming = this.phase === 'move' || this.phase === 'scale' || this.phase === 'rotate' || this.phase === 'gesture';
    const full = mul(scale(dpr), mul(view, this.tm));
    if (transforming) {
      // draw the items being transformed
      ctx.save();
      for (const it of sel) drawItemAt(ctx, it, full);
      ctx.restore();
    }
    // highlight
    if (sel.length <= 600) {
      ctx.save();
      for (const it of sel) {
        const dc = deviceCtx(ctx, full, itemBounds(it));
        ctx.fillStyle = 'rgba(47,107,255,0.28)';
        if (it.kind === 'stroke') for (const g of strokeOutline(it).groups) ctx.fill(groupPath(g, dc.o));
        else if (it.kind === 'fill') ctx.fill(fillPath(it, dc.o), 'evenodd');
      }
      ctx.restore();
    }
    let b = ed.selectionBounds()!;
    const corners = [apply(this.tm, b.x0, b.y0), apply(this.tm, b.x1, b.y0), apply(this.tm, b.x1, b.y1), apply(this.tm, b.x0, b.y1)];
    const sc = corners.map((q) => apply(view, q.x, q.y));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    sc.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (!transforming || this.phase !== 'gesture') {
      if (!isIdentity(this.tm)) {
        b = transformRect(b, this.tm);
      }
      const hs = this.handlePositions(b, view);
      const top = hs.find((h) => h.id === 'n')!;
      const rot = hs.find((h) => h.id === 'rot')!;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(rot.x, rot.y);
      ctx.stroke();
      for (const h of hs) {
        ctx.beginPath();
        if (h.id === 'rot') ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
        else if (h.id.length === 2) ctx.rect(h.x - 6, h.y - 6, 12, 12);
        else ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (ed.settings.measureOn || transforming) {
      const bb = transformRect(ed.selectionBounds()!, this.tm);
      const bottom = apply(view, (bb.x0 + bb.x1) / 2, bb.y1);
      label(ctx, bottom.x, bottom.y + 26, `${formatLength(bb.x1 - bb.x0, ed.doc.measure)} × ${formatLength(bb.y1 - bb.y0, ed.doc.measure)}`, '#30343c');
    }
  }
}

function transformRect(b: Rect, m: Mat): Rect {
  const pts = [apply(m, b.x0, b.y0), apply(m, b.x1, b.y0), apply(m, b.x1, b.y1), apply(m, b.x0, b.y1)];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}

function isIdentity(m: Mat) {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

function hitSelected(items: Item[], x: number, y: number, tol: number) {
  return items.some((it) => {
    const b = itemBounds(it);
    return x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol && hitItem(it, x, y, tol);
  });
}
