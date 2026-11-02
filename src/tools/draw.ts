import type { AppCtx, Ptr, Tool } from './context';
import type { ShapeMeta, StrokeItem, Mat } from '../core/types';
import { BRUSHES } from '../core/brushes';
import { recognize, shapePoints, snapLine } from '../core/shapes';
import { guidePath, projectGuide, guideBetween, type GuidePath } from '../core/guides';
import { simplify, uid, apply, dist } from '../core/geom';
import { angleStep, gridSnapper, perspectiveDirections } from './snap';
import { VP_COLORS } from '../render/background';
import { formatLength } from '../core/measure';

type Mode = 'free' | 'guide' | 'persp' | 'shape';

export class DrawTool implements Tool {
  private active = false;
  private pts: number[] = []; // smoothed: x y p tilt
  private raw: number[] = []; // raw x y p
  private mode: Mode = 'free';
  private shape: ShapeMeta | null = null;
  private gp: GuidePath | null = null;
  private s0 = 0;
  private sCur = 0;
  private perspDir: { x: number; y: number; vp: number } | null = null;
  private start = { x: 0, y: 0 };
  private size = 1;
  private seed = 1;
  private holdTimer = 0;
  private anchor = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  private item: StrokeItem | null = null;
  private hoverPt: Ptr | null = null;

  constructor(private app: AppCtx) {}

  busy() { return this.active; }

  down(p: Ptr) {
    const ed = this.app.editor;
    const layer = ed.activeLayer;
    if (!layer.visible || layer.locked) {
      this.app.toast(layer.locked ? 'Layer is locked' : 'Layer is hidden');
      return;
    }
    ed.clearSelection();
    ed.liveShapeId = null;
    const preset = ed.preset;
    const zoom = this.app.zoom();
    this.size = ed.settings.scaleBrushWithZoom ? preset.size / zoom : preset.size;
    this.seed = (Math.random() * 1e9) | 0;
    this.active = true;
    this.pts = [];
    this.raw = [];
    this.shape = null;
    this.mode = 'free';
    this.perspDir = null;
    this.start = { x: p.wx, y: p.wy };
    this.anchor = { x: p.x, y: p.y };
    this.lastScreen = { x: p.x, y: p.y };
    const g = ed.doc.guide;
    if (g && ed.settings.guideSnap) {
      const gp = guidePath(g);
      const pr = projectGuide(gp, p.wx, p.wy);
      if (pr.d * zoom < 40) {
        this.mode = 'guide';
        this.gp = gp;
        this.s0 = this.sCur = pr.s;
      }
    }
    if (this.mode === 'free' && ed.doc.perspective.mode !== 'none' && ed.settings.perspectiveSnap && ed.doc.perspective.vps.length) {
      this.mode = 'persp';
    }
    this.app.renderer.beginLive();
    this.addPoint(p);
    this.update();
    this.armHold();
  }

  private armHold() {
    clearTimeout(this.holdTimer);
    const ed = this.app.editor;
    if (!ed.settings.liveShapes || this.mode !== 'free') return;
    this.holdTimer = window.setTimeout(() => this.onHold(), ed.settings.shapeHoldMs);
  }

  private onHold() {
    if (!this.active || this.mode !== 'free') return;
    const ed = this.app.editor;
    const xy: number[] = [];
    for (let i = 0; i < this.raw.length; i += 3) xy.push(this.raw[i], this.raw[i + 1]);
    const zoom = this.app.zoom();
    const sh = recognize(xy, {
      angleSnap: ed.settings.angleSnap,
      angleStep: angleStep(ed.doc),
      snapPoint: gridSnapper(ed),
      minLen: 18 / zoom,
    });
    if (!sh) return;
    this.shape = sh;
    this.mode = 'shape';
    this.update();
    this.app.renderer.requestOverlay();
  }

  private addPoint(b: Ptr) {
    const ed = this.app.editor;
    const pr = Math.max(0.02, b.p);
    this.raw.push(b.wx, b.wy, pr);
    switch (this.mode) {
      case 'free': {
        const s = ed.preset.smoothing;
        if (!this.pts.length) {
          this.pts.push(b.wx, b.wy, pr, b.tilt);
          return;
        }
        const n = this.pts.length;
        const lx = this.pts[n - 4], ly = this.pts[n - 3];
        const k = 1 - Math.min(0.92, s * 0.9);
        const x = lx + (b.wx - lx) * k, y = ly + (b.wy - ly) * k;
        const minStep = 0.35 / this.app.zoom();
        if (dist(lx, ly, x, y) < minStep) {
          // update pressure of the last point so taps get the right weight
          this.pts[n - 2] = Math.max(this.pts[n - 2], pr);
          return;
        }
        this.pts.push(x, y, pr, b.tilt);
        break;
      }
      case 'guide': {
        const gp = this.gp!;
        const r = projectGuide(gp, b.wx, b.wy);
        if (gp.closed) {
          const L = gp.length;
          const cur = ((this.sCur % L) + L) % L;
          let d = r.s - cur;
          if (d > L / 2) d -= L;
          if (d < -L / 2) d += L;
          this.sCur += d;
          if (this.sCur - this.s0 > L) this.sCur = this.s0 + L;
          if (this.s0 - this.sCur > L) this.sCur = this.s0 - L;
        } else this.sCur = r.s;
        break;
      }
      case 'persp': {
        if (!this.perspDir) {
          const zoom = this.app.zoom();
          const d = dist(this.start.x, this.start.y, b.wx, b.wy) * zoom;
          if (d > 12) {
            const mx = b.wx - this.start.x, my = b.wy - this.start.y;
            const L = Math.hypot(mx, my);
            let best = null as null | { x: number; y: number; vp: number };
            let bestCos = -1;
            for (const dir of perspectiveDirections(ed.doc, this.start.x, this.start.y)) {
              const c = Math.abs((mx * dir.x + my * dir.y) / L);
              if (c > bestCos) { bestCos = c; best = dir; }
            }
            this.perspDir = best;
          }
        }
        break;
      }
      case 'shape': {
        if (this.shape && this.shape.type === 'line') {
          const sh = this.shape;
          const pts = snapLine([sh.pts[0], sh.pts[1], b.wx, b.wy], {
            angleSnap: ed.settings.angleSnap, angleStep: angleStep(ed.doc), snapPoint: gridSnapper(ed), minLen: 0,
          });
          this.shape = { type: 'line', pts: [sh.pts[0], sh.pts[1], pts[2], pts[3]] };
        }
        break;
      }
    }
  }

  private avgPressure(): number {
    let s = 0, n = 0;
    for (let i = 2; i < this.raw.length; i += 3) { s += this.raw[i]; n++; }
    return n ? s / n : 0.5;
  }

  private spacing() { return Math.max(this.size * 0.3, 0.6 / this.app.zoom()); }

  private buildPts(): number[] {
    switch (this.mode) {
      case 'free':
        return this.pts.slice();
      case 'guide': {
        const xy = guideBetween(this.gp!, this.s0, this.sCur, this.spacing());
        return this.withPressure(xy);
      }
      case 'persp': {
        const last = this.raw.length - 3;
        const cx = this.raw[last], cy = this.raw[last + 1];
        if (!this.perspDir) return this.withPressure([this.start.x, this.start.y, cx, cy], true);
        const d = this.perspDir;
        const t = (cx - this.start.x) * d.x + (cy - this.start.y) * d.y;
        return this.withPressure([this.start.x, this.start.y, this.start.x + d.x * t, this.start.y + d.y * t], true);
      }
      case 'shape':
        return shapePoints(this.shape!, this.avgPressure(), this.spacing());
    }
  }

  /** Assign pressure along a generated centreline from the recorded pressure history. */
  private withPressure(xy: number[], densifyLine = false): number[] {
    if (densifyLine && xy.length === 4) {
      const n = Math.max(1, Math.ceil(dist(xy[0], xy[1], xy[2], xy[3]) / this.spacing()));
      const o: number[] = [];
      for (let i = 0; i <= n; i++) o.push(xy[0] + ((xy[2] - xy[0]) * i) / n, xy[1] + ((xy[3] - xy[1]) * i) / n);
      xy = o;
    }
    const m = xy.length / 2;
    const rn = this.raw.length / 3;
    const out: number[] = [];
    for (let i = 0; i < m; i++) {
      const f = m > 1 ? i / (m - 1) : 0;
      const ri = Math.min(rn - 1, Math.round(f * (rn - 1)));
      out.push(xy[i * 2], xy[i * 2 + 1], this.raw[ri * 3 + 2], 0);
    }
    return out;
  }

  private makeItem(pts: number[]): StrokeItem {
    const ed = this.app.editor;
    const pr = ed.preset;
    const it: StrokeItem = {
      kind: 'stroke', id: uid('i'), brush: pr.brush, color: pr.brush === 'softEraser' ? '#000000' : pr.color,
      opacity: pr.opacity, size: this.size, pts, seed: this.seed,
    };
    if (!pr.pressureSize) for (let i = 2; i < pts.length; i += 4) pts[i] = 0.75;
    if (this.mode === 'shape' && this.shape) it.shape = this.shape;
    else if (this.mode === 'persp' && this.perspDir) it.shape = { type: 'line', pts: [pts[0], pts[1], pts[pts.length - 4], pts[pts.length - 3]] };
    return it;
  }

  private update() {
    const pts = this.buildPts();
    if (!pts.length) return;
    this.item = this.makeItem(pts);
    this.app.renderer.updateLive([this.item]);
    if (this.mode !== 'free' || this.app.editor.settings.measureOn) this.app.renderer.requestOverlay();
  }

  move(p: Ptr, batch: Ptr[]) {
    if (!this.active) return;
    for (const b of batch) this.addPoint(b);
    if (dist(p.x, p.y, this.anchor.x, this.anchor.y) > 4) {
      this.anchor = { x: p.x, y: p.y };
      if (this.mode === 'free') this.armHold();
    }
    this.lastScreen = { x: p.x, y: p.y };
    this.update();
  }

  up(p: Ptr) {
    if (!this.active) return;
    clearTimeout(this.holdTimer);
    if (this.mode === 'free' && this.raw.length) {
      // catch up with the pen so smoothing never shortens the stroke
      const n = this.pts.length;
      if (n && dist(this.pts[n - 4], this.pts[n - 3], p.wx, p.wy) > 0.3 / this.app.zoom()) this.pts.push(p.wx, p.wy, this.pts[n - 2], p.tilt);
    } else {
      this.addPoint({ ...p, p: this.raw.length ? this.raw[this.raw.length - 1] : p.p });
    }
    let pts = this.buildPts();
    if (this.mode === 'free' && pts.length > 8) pts = simplify(pts, 0.12 / this.app.zoom(), 4);
    const item = this.makeItem(pts);
    this.active = false;
    this.app.renderer.endLive();
    const ed = this.app.editor;
    ed.addItems([item], ed.doc.activeLayer, BRUSHES[item.brush].label);
    if (item.shape && this.mode === 'shape') ed.liveShapeId = item.id;
    this.item = null;
    this.mode = 'free';
    this.app.renderer.requestOverlay();
  }

  cancel() {
    clearTimeout(this.holdTimer);
    if (!this.active) return;
    this.active = false;
    this.item = null;
    this.app.renderer.cancelLive();
    this.app.renderer.requestOverlay();
  }

  hover(p: Ptr | null) {
    this.hoverPt = p;
    this.app.renderer.requestOverlay();
  }

  overlay(ctx: CanvasRenderingContext2D, view: Mat) {
    const ed = this.app.editor;
    const zoom = this.app.zoom();
    // perspective guide ray
    if (this.active && this.mode === 'persp' && this.perspDir) {
      const d = this.perspDir;
      const a = apply(view, this.start.x - d.x * 1e5, this.start.y - d.y * 1e5);
      const b = apply(view, this.start.x + d.x * 1e5, this.start.y + d.y * 1e5);
      ctx.strokeStyle = d.vp >= 0 ? VP_COLORS[d.vp % 3] : '#7a7f8c';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // live measurement for straight strokes
    if (this.active && this.item && (ed.settings.measureOn || this.mode === 'shape') && this.item.shape) {
      const sh = this.item.shape;
      if (sh.type === 'line' && ed.settings.measureOn) {
        const L = dist(sh.pts[0], sh.pts[1], sh.pts[2], sh.pts[3]);
        const ang = (Math.atan2(-(sh.pts[3] - sh.pts[1]), sh.pts[2] - sh.pts[0]) * 180) / Math.PI;
        const s = apply(view, sh.pts[2], sh.pts[3]);
        label(ctx, s.x + 14, s.y - 14, `${formatLength(L, ed.doc.measure)}  ${((ang + 360) % 360).toFixed(1)}°`);
      }
    }
    if (this.active && this.mode === 'shape') {
      const s = this.lastScreen;
      ctx.fillStyle = 'rgba(64,120,255,0.95)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // hover brush preview
    const h = this.hoverPt;
    if (!this.active && h && ed.settings.hoverPreview) {
      const pr = ed.preset;
      const r = Math.max(1.5, ((ed.settings.scaleBrushWithZoom ? pr.size : pr.size * zoom) / 2) * (BRUSHES[pr.brush].pmax));
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 1, 0, Math.PI * 2);
      ctx.stroke();
      if (pr.brush !== 'softEraser') {
        ctx.fillStyle = pr.color;
        ctx.globalAlpha = pr.opacity * 0.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, Math.max(1, r - 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color = '#2b6cff') {
  ctx.font = '600 12px -apple-system, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  roundRect(ctx, x - w / 2, y - 10, w, 20, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
