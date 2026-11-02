import type { AppCtx, Ptr, Tool } from './context';
import type { Item, Mat } from '../core/types';
import { eraseAlong } from '../core/strokeOps';
import { hitItem } from '../core/items';

export class EraserTool implements Tool {
  private active = false;
  private last: { x: number; y: number } | null = null;
  private hoverPt: Ptr | null = null;
  private cur: Ptr | null = null;
  private changed = false;

  constructor(private app: AppCtx) {}
  busy() { return this.active; }

  private radiusWorld(p?: Ptr) {
    const ed = this.app.editor;
    const pk = p && p.type === 'pen' ? 0.55 + 0.45 * p.p : 1;
    return ((ed.eraserSize / 2) * pk) / this.app.zoom();
  }

  down(p: Ptr) {
    this.active = true;
    this.changed = false;
    this.last = { x: p.wx, y: p.wy };
    this.cur = p;
    this.app.editor.clearSelection();
    this.app.editor.liveShapeId = null;
    this.eraseSeg(p.wx, p.wy, p.wx, p.wy, p);
  }

  private eraseSeg(x0: number, y0: number, x1: number, y1: number, p: Ptr) {
    const ed = this.app.editor;
    const r = this.radiusWorld(p);
    const path = x0 === x1 && y0 === y1 ? [x1, y1] : [x0, y0, x1, y1];
    const changes = new Map<string, Item | Item[] | null>();
    for (const l of ed.doc.layers) {
      if (!l.visible || l.locked) continue;
      for (const it of l.items) {
        if (ed.eraserMode === 'stroke' || it.kind !== 'stroke') {
          let hit = false;
          if (it.kind === 'stroke' || it.kind === 'fill' || ed.eraserMode === 'stroke') {
            // sample the segment
            const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.5)));
            for (let s = 0; s <= steps && !hit; s++) {
              const t = s / steps;
              hit = hitItem(it, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
            }
          }
          if (hit) changes.set(it.id, null);
          continue;
        }
        const pieces = eraseAlong(it, path, r);
        if (pieces) changes.set(it.id, pieces);
      }
    }
    if (changes.size) {
      this.changed = true;
      ed.editItems(changes, 'Erase', false);
    }
  }

  move(p: Ptr, batch: Ptr[]) {
    if (!this.active || !this.last) return;
    for (const b of batch) {
      this.eraseSeg(this.last.x, this.last.y, b.wx, b.wy, b);
      this.last = { x: b.wx, y: b.wy };
    }
    this.cur = p;
    this.app.renderer.requestOverlay();
  }

  up() {
    if (!this.active) return;
    this.active = false;
    this.cur = null;
    if (this.changed) this.app.editor.commit('Erase');
    this.app.renderer.requestOverlay();
  }

  cancel() {
    if (this.active && this.changed) this.app.editor.commit('Erase');
    this.active = false;
    this.cur = null;
  }

  hover(p: Ptr | null) {
    this.hoverPt = p;
    this.app.renderer.requestOverlay();
  }

  overlay(ctx: CanvasRenderingContext2D, _view: Mat) {
    const p = this.cur || this.hoverPt;
    if (!p) return;
    const r = this.radiusWorld(this.cur || undefined) * this.app.zoom();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,30,40,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
