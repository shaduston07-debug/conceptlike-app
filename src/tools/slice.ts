import type { AppCtx, Ptr, Tool } from './context';
import type { Item, StrokeItem, Mat } from '../core/types';
import { itemBounds } from '../core/items';
import { crossings, selfCrossings, splitAt, nearestOnStroke, cumLengths, strokeRange, pieceItem } from '../core/strokeOps';
import { rectsOverlap, apply } from '../core/geom';

/**
 * Trim: erase the piece of a stroke between its nearest intersections with other strokes.
 * Cut: split strokes into separate pieces wherever the slice line crosses them.
 */
export class SliceTool implements Tool {
  private path: number[] = [];
  private active = false;
  constructor(private app: AppCtx) {}
  busy() { return this.active; }

  down(p: Ptr) {
    this.active = true;
    this.app.editor.clearSelection();
    this.app.editor.liveShapeId = null;
    this.path = [p.wx, p.wy];
  }
  move(_p: Ptr, batch: Ptr[]) {
    if (!this.active) return;
    for (const b of batch) this.path.push(b.wx, b.wy);
    this.app.renderer.requestOverlay();
  }
  up() {
    if (!this.active) return;
    this.active = false;
    const ed = this.app.editor;
    if (ed.sliceMode === 'cut') this.cut();
    else this.trim();
    this.path = [];
    this.app.renderer.requestOverlay();
  }
  cancel() {
    this.active = false;
    this.path = [];
  }

  private strokes(): StrokeItem[] {
    const out: StrokeItem[] = [];
    for (const l of this.app.editor.doc.layers) {
      if (!l.visible || l.locked) continue;
      for (const it of l.items) if (it.kind === 'stroke' && it.brush !== 'softEraser') out.push(it);
    }
    return out;
  }

  private cut() {
    if (this.path.length < 4) return;
    const pathItem = { pts: this.path };
    const changes = new Map<string, Item[]>();
    const pr = pathRect(this.path);
    for (const s of this.strokes()) {
      if (!rectsOverlap(itemBounds(s), pr)) continue;
      const xs = crossings(s, pathItem, 2);
      if (!xs.length) continue;
      changes.set(s.id, splitAt(s, xs));
    }
    if (changes.size) this.app.editor.editItems(changes, 'Slice');
    else this.app.toast('Draw across strokes to slice them');
  }

  private trim() {
    const ed = this.app.editor;
    const tol = 14 / this.app.zoom();
    const all = this.strokes();
    const changes = new Map<string, Item[] | null>();
    // collect touched strokes with the touched arc positions
    const path = this.path.length === 2 ? this.path : this.path;
    for (const s of all) {
      const b = itemBounds(s);
      const pr = pathRect(path);
      if (!rectsOverlap(b, { x0: pr.x0 - tol, y0: pr.y0 - tol, x1: pr.x1 + tol, y1: pr.y1 + tol })) continue;
      const touched: number[] = [];
      for (let i = 0; i < path.length; i += 2) {
        const r = nearestOnStroke(s, path[i], path[i + 1]);
        if (r.d <= tol + s.size / 2) touched.push(r.s);
      }
      if (!touched.length) continue;
      // cut positions from intersections with other strokes and itself
      const cuts: number[] = [];
      for (const o of all) {
        if (o.id === s.id) continue;
        if (!rectsOverlap(b, itemBounds(o))) continue;
        cuts.push(...crossings(s, o));
      }
      cuts.push(...selfCrossings(s));
      cuts.sort((a, c) => a - c);
      const cum = cumLengths(s.pts);
      const L = cum[cum.length - 1];
      const bounds = [0, ...cuts.filter((c) => c > 1e-6 && c < L - 1e-6), L];
      const remove = new Set<number>();
      for (const t of touched) {
        for (let i = 0; i < bounds.length - 1; i++) if (t >= bounds[i] && t <= bounds[i + 1]) { remove.add(i); break; }
      }
      const pieces: StrokeItem[] = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        if (remove.has(i) || bounds[i + 1] - bounds[i] < 1e-6) continue;
        pieces.push(pieceItem(s, strokeRange(s.pts, cum, bounds[i], bounds[i + 1])));
      }
      // merge adjacent kept pieces back together
      changes.set(s.id, mergeAdjacent(pieces, s));
    }
    if (changes.size) ed.editItems(changes, 'Trim');
  }

  overlay(ctx: CanvasRenderingContext2D, view: Mat) {
    if (this.path.length < 4) return;
    ctx.strokeStyle = this.app.editor.sliceMode === 'cut' ? '#ff4d6d' : '#ff8a00';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < this.path.length; i += 2) {
      const q = apply(view, this.path[i], this.path[i + 1]);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function mergeAdjacent(pieces: StrokeItem[], _src: StrokeItem): StrokeItem[] {
  if (pieces.length < 2) return pieces;
  const out: StrokeItem[] = [pieces[0]];
  for (let i = 1; i < pieces.length; i++) {
    const a = out[out.length - 1], b = pieces[i];
    const ax = a.pts[a.pts.length - 4], ay = a.pts[a.pts.length - 3];
    if (Math.hypot(ax - b.pts[0], ay - b.pts[1]) < 1e-6) out[out.length - 1] = { ...a, pts: [...a.pts, ...b.pts.slice(4)] };
    else out.push(b);
  }
  return out;
}

function pathRect(path: number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < path.length; i += 2) {
    x0 = Math.min(x0, path[i]); x1 = Math.max(x1, path[i]);
    y0 = Math.min(y0, path[i + 1]); y1 = Math.max(y1, path[i + 1]);
  }
  return { x0, y0, x1, y1 };
}
