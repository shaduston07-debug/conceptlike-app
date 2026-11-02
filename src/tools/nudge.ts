import type { AppCtx, Ptr, Tool } from './context';
import type { Item, StrokeItem, Mat } from '../core/types';
import { itemBounds } from '../core/items';
import { densify } from '../core/strokeOps';

export class NudgeTool implements Tool {
  private active = false;
  private start: Ptr | null = null;
  private orig = new Map<string, StrokeItem>();
  private hoverPt: Ptr | null = null;
  private cur: Ptr | null = null;
  constructor(private app: AppCtx) {}
  busy() { return this.active; }

  private R() { return this.app.editor.nudgeSize / this.app.zoom(); }

  down(p: Ptr) {
    const ed = this.app.editor;
    ed.clearSelection();
    ed.liveShapeId = null;
    this.active = true;
    this.start = p;
    this.cur = p;
    this.orig.clear();
    const R = this.R();
    for (const l of ed.doc.layers) {
      if (!l.visible || l.locked) continue;
      for (const it of l.items) {
        if (it.kind !== 'stroke') continue;
        const b = itemBounds(it);
        if (p.wx < b.x0 - R || p.wx > b.x1 + R || p.wy < b.y0 - R || p.wy > b.y1 + R) continue;
        let near = false;
        for (let i = 0; i < it.pts.length && !near; i += 4) near = Math.hypot(it.pts[i] - p.wx, it.pts[i + 1] - p.wy) < R;
        if (!near) {
          // check segments for sparse strokes
          const d = densify(it.pts, R / 3);
          for (let i = 0; i < d.length && !near; i += 4) near = Math.hypot(d[i] - p.wx, d[i + 1] - p.wy) < R;
          if (near) this.orig.set(it.id, { ...it, pts: d });
        } else this.orig.set(it.id, { ...it, pts: densify(it.pts, R / 4) });
      }
    }
  }

  move(p: Ptr) {
    if (!this.active || !this.start) return;
    this.cur = p;
    const dx = p.wx - this.start.wx, dy = p.wy - this.start.wy;
    const R = this.R();
    const sx = this.start.wx, sy = this.start.wy;
    const changes = new Map<string, Item>();
    for (const [id, it] of this.orig) {
      const pts = it.pts.slice();
      for (let i = 0; i < pts.length; i += 4) {
        const d = Math.hypot(pts[i] - sx, pts[i + 1] - sy);
        if (d >= R) continue;
        const t = 1 - d / R;
        const w = t * t * (3 - 2 * t);
        pts[i] += dx * w;
        pts[i + 1] += dy * w;
      }
      const n: StrokeItem = { ...it, pts };
      delete n.shape;
      changes.set(id, n);
    }
    if (changes.size) this.app.editor.editItems(changes, 'Nudge', false);
    this.app.renderer.requestOverlay();
  }

  up() {
    if (!this.active) return;
    this.active = false;
    this.cur = null;
    if (this.orig.size) this.app.editor.commit('Nudge');
    this.orig.clear();
    this.app.renderer.requestOverlay();
  }
  cancel() { this.up(); }
  hover(p: Ptr | null) { this.hoverPt = p; this.app.renderer.requestOverlay(); }

  overlay(ctx: CanvasRenderingContext2D, _v: Mat) {
    const p = this.cur || this.hoverPt;
    if (!p) return;
    const r = this.app.editor.nudgeSize;
    ctx.strokeStyle = 'rgba(47,107,255,0.8)';
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(47,107,255,0.8)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
