import type { AppCtx, Handle, Ptr } from './context';
import type { Mat, ShapeMeta, StrokeItem, Item } from '../core/types';
import { guideHandles, moveGuideHandle, guidePath } from '../core/guides';
import { apply, dist, rectsOverlap } from '../core/geom';
import { shapePoints } from '../core/shapes';
import { VP_COLORS } from '../render/background';
import { gridSnapper } from './snap';
import { formatLength } from '../core/measure';
import { itemBounds } from '../core/items';
import { visibleWorld } from '../render/background';
import { label } from './draw';
import { ACCENT } from './select';

/** All draggable on-canvas handles (guides, vanishing points, live shapes). */
export function collectHandles(app: AppCtx, editPerspective: boolean): Handle[] {
  const ed = app.editor;
  const view = ed.doc.view.m;
  const out: Handle[] = [];
  const g = ed.doc.guide;
  if (g) {
    for (const h of guideHandles(g)) {
      const s = apply(view, h.x, h.y);
      let orig: number[] = g.pts;
      out.push({
        x: s.x, y: s.y,
        drag: (p: Ptr, start: Ptr) => {
          const cur = ed.doc.guide;
          if (!cur) return;
          if (orig === g.pts && start) orig = cur.pts.slice();
          let dx = p.wx - start.wx, dy = p.wy - start.wy;
          const snap = gridSnapper(ed);
          if (snap && h.idx >= 0) {
            const q = snap(orig[h.idx] + dx, orig[h.idx + 1] + dy);
            dx = q.x - orig[h.idx]; dy = q.y - orig[h.idx + 1];
          }
          ed.setGuide(moveGuideHandle(cur, h, dx, dy, orig));
        },
        end: () => { orig = g.pts; },
      });
    }
  }
  const persp = ed.doc.perspective;
  if (persp.mode !== 'none' && editPerspective) {
    persp.vps.forEach((vp, i) => {
      const s = apply(view, vp.x, vp.y);
      let orig = { ...vp };
      out.push({
        x: s.x, y: s.y,
        drag: (p, start) => {
          const vps = ed.doc.perspective.vps.slice();
          const nx = orig.x + (p.wx - start.wx), ny = orig.y + (p.wy - start.wy);
          vps[i] = { x: nx, y: ny };
          // two-point setups keep both vanishing points on a level horizon
          if ((persp.mode === '2pt' || persp.mode === '3pt') && i < 2 && vps[1 - i]) vps[1 - i] = { x: vps[1 - i].x, y: ny };
          ed.setPerspective({ vps, horizon: vps[0].y }, false);
        },
        end: () => {
          orig = { ...ed.doc.perspective.vps[i] };
          ed.commit('Perspective');
        },
      });
    });
  }
  // live shape handles
  const live = ed.liveShapeId ? (ed.findItem(ed.liveShapeId) as StrokeItem | undefined) : undefined;
  if (live && live.kind === 'stroke' && live.shape) {
    const sh = live.shape;
    for (const hp of shapeHandlePoints(sh)) {
      const s = apply(view, hp.x, hp.y);
      out.push({
        x: s.x, y: s.y,
        drag: (p) => {
          const cur = ed.findItem(live.id) as StrokeItem | undefined;
          if (!cur || !cur.shape) return;
          const snap = gridSnapper(ed);
          const q = snap ? snap(p.wx, p.wy) : { x: p.wx, y: p.wy };
          const nsh = moveShapeHandle(sh, hp.key, q.x, q.y);
          const avgP = cur.pts.length ? cur.pts[2] : 0.5;
          const spacing = Math.max(cur.size * 0.3, 0.6 / app.zoom());
          const n: StrokeItem = { ...cur, shape: nsh, pts: shapePoints(nsh, avgP, spacing) };
          ed.editItems(new Map<string, Item>([[cur.id, n]]), 'Edit shape', false);
        },
        end: () => ed.commit('Edit shape'),
      });
    }
  }
  return out;
}

interface SHP { key: string; x: number; y: number }
function shapeHandlePoints(s: ShapeMeta): SHP[] {
  switch (s.type) {
    case 'line': return [{ key: 'p0', x: s.pts[0], y: s.pts[1] }, { key: 'p1', x: s.pts[2], y: s.pts[3] }];
    case 'polyline': {
      const o: SHP[] = [];
      for (let i = 0; i < s.pts.length; i += 2) o.push({ key: 'v' + i, x: s.pts[i], y: s.pts[i + 1] });
      return o;
    }
    case 'ellipse': {
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      return [
        { key: 'c', x: s.cx, y: s.cy },
        { key: 'rx', x: s.cx + c * s.rx, y: s.cy + sn * s.rx },
        { key: 'ry', x: s.cx - sn * s.ry, y: s.cy + c * s.ry },
      ];
    }
    case 'arc': {
      const am = (s.a0 + s.a1) / 2;
      return [
        { key: 'a0', x: s.cx + Math.cos(s.a0) * s.r, y: s.cy + Math.sin(s.a0) * s.r },
        { key: 'am', x: s.cx + Math.cos(am) * s.r, y: s.cy + Math.sin(am) * s.r },
        { key: 'a1', x: s.cx + Math.cos(s.a1) * s.r, y: s.cy + Math.sin(s.a1) * s.r },
      ];
    }
    case 'bezier': {
      const o: SHP[] = [];
      for (let i = 0; i < 8; i += 2) o.push({ key: 'b' + i, x: s.pts[i], y: s.pts[i + 1] });
      return o;
    }
  }
}

function moveShapeHandle(s: ShapeMeta, key: string, x: number, y: number): ShapeMeta {
  switch (s.type) {
    case 'line': {
      const pts = s.pts.slice();
      if (key === 'p0') { pts[0] = x; pts[1] = y; } else { pts[2] = x; pts[3] = y; }
      return { ...s, pts };
    }
    case 'polyline': {
      const pts = s.pts.slice();
      const i = parseInt(key.slice(1), 10);
      pts[i] = x; pts[i + 1] = y;
      return { ...s, pts };
    }
    case 'ellipse': {
      if (key === 'c') return { ...s, cx: x, cy: y };
      if (key === 'rx') {
        const rot = Math.atan2(y - s.cy, x - s.cx);
        const rx = dist(s.cx, s.cy, x, y);
        return s.rx === s.ry ? { ...s, rx, ry: rx, rot } : { ...s, rx, rot };
      }
      const ry = Math.abs(-(x - s.cx) * Math.sin(s.rot) + (y - s.cy) * Math.cos(s.rot));
      return { ...s, ry };
    }
    case 'arc': {
      const pts = shapeHandlePoints(s);
      const get = (k: string) => (k === key ? { x, y } : pts.find((p) => p.key === k)!);
      const a = get('a0'), m = get('am'), b = get('a1');
      const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
      if (Math.abs(d) < 1e-9) return s;
      const a2 = a.x ** 2 + a.y ** 2, m2 = m.x ** 2 + m.y ** 2, b2 = b.x ** 2 + b.y ** 2;
      const cx = (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d;
      const cy = (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d;
      const r = dist(cx, cy, a.x, a.y);
      const A0 = Math.atan2(a.y - cy, a.x - cx);
      const AM = Math.atan2(m.y - cy, m.x - cx);
      const A1 = Math.atan2(b.y - cy, b.x - cx);
      const norm = (v: number) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let sweep = norm(A1 - A0);
      if (norm(AM - A0) > sweep) sweep -= Math.PI * 2;
      return { type: 'arc', cx, cy, r, a0: A0, a1: A0 + sweep };
    }
    case 'bezier': {
      const pts = s.pts.slice();
      const i = parseInt(key.slice(1), 10);
      pts[i] = x; pts[i + 1] = y;
      return { ...s, pts };
    }
  }
}

/** Overlay: guide geometry + handles, VP handles, live shape handles, measurement labels. */
export function drawGuidesOverlay(app: AppCtx, ctx: CanvasRenderingContext2D, view: Mat, editPerspective: boolean) {
  const ed = app.editor;
  const g = ed.doc.guide;
  if (g) {
    const gp = guidePath(g);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,170,255,0.75)';
    ctx.beginPath();
    for (let i = 0; i < gp.pts.length; i += 2) {
      const q = apply(view, gp.pts[i], gp.pts[i + 1]);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    // halo band showing the snap zone
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(0,170,255,0.08)';
    ctx.stroke();
    if (g.kind === 'curve') {
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(0,140,220,0.6)';
      const p = g.pts.map((v, i) => v + (i % 2 ? 0 : 0));
      const a = apply(view, p[0], p[1]), b = apply(view, p[2], p[3]), c = apply(view, p[4], p[5]), d = apply(view, p[6], p[7]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (g.kind === 'protractor') {
      const c = apply(view, g.pts[0], g.pts[1]);
      const r = dist(g.pts[0], g.pts[1], g.pts[2], g.pts[3]) * app.zoom();
      ctx.strokeStyle = 'rgba(0,140,220,0.7)';
      ctx.lineWidth = 1;
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,110,190,0.9)';
      ctx.textAlign = 'center';
      const rot = Math.atan2(view[1], view[0]);
      for (let deg = 0; deg < 360; deg += 5) {
        const a = (deg * Math.PI) / 180 + rot;
        const len = deg % 45 === 0 ? 16 : deg % 15 === 0 ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(c.x + Math.cos(a) * r, c.y - Math.sin(a) * r);
        ctx.lineTo(c.x + Math.cos(a) * (r - len), c.y - Math.sin(a) * (r - len));
        ctx.stroke();
        if (deg % 15 === 0) ctx.fillText(String(deg), c.x + Math.cos(a) * (r - 24), c.y - Math.sin(a) * (r - 24) + 3);
      }
      ctx.textAlign = 'left';
    }
    if (g.kind === 'line') {
      const a = apply(view, g.pts[0], g.pts[1]), b = apply(view, g.pts[2], g.pts[3]);
      const ang = (Math.atan2(-(g.pts[3] - g.pts[1]), g.pts[2] - g.pts[0]) * 180) / Math.PI;
      const L = dist(g.pts[0], g.pts[1], g.pts[2], g.pts[3]);
      label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 26, `${((ang + 360) % 360).toFixed(1)}°  ${formatLength(L, ed.doc.measure)}`, 'rgba(0,140,220,0.95)');
    }
    for (const h of guideHandles(g)) {
      const s = apply(view, h.x, h.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, h.role === 'move' ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = h.role === 'move' ? 'rgba(0,170,255,0.95)' : '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,150,235,1)';
      ctx.stroke();
      if (h.role === 'move') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y);
        ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  const persp = ed.doc.perspective;
  if (persp.mode !== 'none' && editPerspective) {
    persp.vps.forEach((vp, i) => {
      const s = apply(view, vp.x, vp.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = VP_COLORS[i % 3];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    });
  }
  const live = ed.liveShapeId ? ed.findItem(ed.liveShapeId) : undefined;
  if (live && live.kind === 'stroke' && live.shape && ed.tool === 'draw') {
    for (const hp of shapeHandlePoints(live.shape)) {
      const s = apply(view, hp.x, hp.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
    }
  }
  if (ed.settings.measureOn) drawMeasurements(app, ctx, view);
}

function drawMeasurements(app: AppCtx, ctx: CanvasRenderingContext2D, view: Mat) {
  const ed = app.editor;
  const r = app.renderer;
  const world = visibleWorld(view, r.w, r.h);
  const m = ed.doc.measure;
  let count = 0;
  for (const l of ed.doc.layers) {
    if (!l.visible) continue;
    for (const it of l.items) {
      if (it.kind !== 'stroke' || !it.shape) continue;
      if (!rectsOverlap(itemBounds(it), world)) continue;
      if (++count > 200) return;
      const s = it.shape;
      switch (s.type) {
        case 'line': {
          const a = apply(view, s.pts[0], s.pts[1]), b = apply(view, s.pts[2], s.pts[3]);
          label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 14, formatLength(dist(s.pts[0], s.pts[1], s.pts[2], s.pts[3]), m), '#30343c');
          break;
        }
        case 'polyline': {
          const k = s.pts.length / 2;
          const segs = s.closed ? k : k - 1;
          for (let i = 0; i < segs; i++) {
            const j = (i + 1) % k;
            const a = apply(view, s.pts[i * 2], s.pts[i * 2 + 1]), b = apply(view, s.pts[j * 2], s.pts[j * 2 + 1]);
            label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, formatLength(dist(s.pts[i * 2], s.pts[i * 2 + 1], s.pts[j * 2], s.pts[j * 2 + 1]), m), '#30343c');
          }
          break;
        }
        case 'ellipse': {
          const c = apply(view, s.cx, s.cy);
          label(ctx, c.x, c.y, s.rx === s.ry ? `⌀ ${formatLength(s.rx * 2, m)}` : `${formatLength(s.rx * 2, m)} × ${formatLength(s.ry * 2, m)}`, '#30343c');
          break;
        }
        case 'arc': {
          const am = (s.a0 + s.a1) / 2;
          const c = apply(view, s.cx + Math.cos(am) * s.r, s.cy + Math.sin(am) * s.r);
          label(ctx, c.x, c.y - 14, `R ${formatLength(s.r, m)}`, '#30343c');
          break;
        }
        default:
      }
    }
  }
}
