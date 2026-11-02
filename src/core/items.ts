import type { Item, Mat, StrokeItem, ShapeMeta, ImageItem, TextItem, FillItem } from './types';
import { strokeBounds } from './stroke';
import {
  apply, emptyRect, rectAdd, rectTransform, segDist2, pointInPoly, matScale, mul, uid, type Rect,
} from './geom';

const bboxCache = new WeakMap<Item, Rect>();

let measureCtx: CanvasRenderingContext2D | null = null;
export function textMetrics(t: TextItem): { w: number; h: number; lines: string[]; lineH: number; widths: number[] } {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  measureCtx.font = textFont(t);
  const lines = t.text.split('\n');
  const widths = lines.map((l) => measureCtx!.measureText(l || ' ').width);
  const lineH = t.size * 1.25;
  return { w: Math.max(4, ...widths), h: Math.max(lineH, lines.length * lineH), lines, lineH, widths };
}
export const textFont = (t: TextItem) => `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px ${t.font}`;

export function itemBounds(it: Item): Rect {
  let r = bboxCache.get(it);
  if (r) return r;
  switch (it.kind) {
    case 'stroke':
      r = strokeBounds(it);
      break;
    case 'fill': {
      r = emptyRect();
      for (const p of it.polys) for (let i = 0; i < p.length; i += 2) rectAdd(r, p[i], p[i + 1]);
      break;
    }
    case 'image':
      r = rectTransform({ x0: 0, y0: 0, x1: it.w, y1: it.h }, it.m);
      break;
    case 'text': {
      const tm = textMetrics(it);
      r = rectTransform({ x0: 0, y0: 0, x1: tm.w, y1: tm.h }, it.m);
      break;
    }
  }
  bboxCache.set(it, r);
  return r;
}

export function itemsBounds(items: Item[]): Rect {
  const r = emptyRect();
  for (const it of items) {
    const b = itemBounds(it);
    rectAdd(r, b.x0, b.y0);
    rectAdd(r, b.x1, b.y1);
  }
  return r;
}

/** Local oriented frame (for images/text) - returns 4 corners in world space. */
export function itemCorners(it: ImageItem | TextItem): number[] {
  let w: number, h: number;
  if (it.kind === 'image') ({ w, h } = it);
  else ({ w, h } = textMetrics(it));
  const out: number[] = [];
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
    const p = apply(it.m, x, y);
    out.push(p.x, p.y);
  }
  return out;
}

/** Hit test an item against a world-space point with tolerance (world units). */
export function hitItem(it: Item, x: number, y: number, tol: number): boolean {
  const b = itemBounds(it);
  if (x < b.x0 - tol || x > b.x1 + tol || y < b.y0 - tol || y > b.y1 + tol) return false;
  switch (it.kind) {
    case 'stroke': {
      const p = it.pts;
      const n = p.length / 4;
      if (n === 1) return Math.hypot(p[0] - x, p[1] - y) <= it.size / 2 + tol;
      for (let i = 0; i < n - 1; i++) {
        const r = (it.size / 2) * Math.max(0.4, p[i * 4 + 2]) + tol;
        if (segDist2(x, y, p[i * 4], p[i * 4 + 1], p[i * 4 + 4], p[i * 4 + 5]).d2 <= r * r) return true;
      }
      return false;
    }
    case 'fill': {
      let inside = false;
      for (const poly of it.polys) if (pointInPoly(x, y, poly)) inside = !inside;
      return inside;
    }
    case 'image':
    case 'text':
      return pointInPoly(x, y, itemCorners(it));
  }
}

/** True if the item has any geometry inside the lasso polygon (centre-weighted). */
export function itemInLasso(it: Item, poly: number[]): boolean {
  const pts = itemSamplePoints(it);
  if (!pts.length) return false;
  let inside = 0;
  const total = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) if (pointInPoly(pts[i], pts[i + 1], poly)) inside++;
  return inside / total >= 0.5;
}

export function itemSamplePoints(it: Item): number[] {
  switch (it.kind) {
    case 'stroke': {
      const out: number[] = [];
      for (let i = 0; i < it.pts.length; i += 4) out.push(it.pts[i], it.pts[i + 1]);
      return out;
    }
    case 'fill':
      return it.polys.flat();
    case 'image':
    case 'text': {
      const c = itemCorners(it);
      const b = itemBounds(it);
      return [...c, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    }
  }
}

function transformShape(s: ShapeMeta | undefined, m: Mat): ShapeMeta | undefined {
  if (!s) return undefined;
  const tp = (pts: number[]) => {
    const o: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const p = apply(m, pts[i], pts[i + 1]);
      o.push(p.x, p.y);
    }
    return o;
  };
  switch (s.type) {
    case 'line':
    case 'bezier':
      return { ...s, pts: tp(s.pts) };
    case 'polyline':
      return { ...s, pts: tp(s.pts) };
    case 'ellipse': {
      // transform via local frame
      const local: Mat = [Math.cos(s.rot) * s.rx, Math.sin(s.rot) * s.rx, -Math.sin(s.rot) * s.ry, Math.cos(s.rot) * s.ry, s.cx, s.cy];
      const f = mul(m, local);
      const rx = Math.hypot(f[0], f[1]), ry = Math.hypot(f[2], f[3]);
      // non-uniform scales may skew; approximate by axes lengths
      return { type: 'ellipse', cx: f[4], cy: f[5], rx, ry, rot: Math.atan2(f[1], f[0]) };
    }
    case 'arc': {
      const c = apply(m, s.cx, s.cy);
      const k = matScale(m);
      const rot = Math.atan2(m[1], m[0]);
      const flip = m[0] * m[3] - m[1] * m[2] < 0;
      if (flip) {
        const p0 = apply(m, s.cx + Math.cos(s.a0) * s.r, s.cy + Math.sin(s.a0) * s.r);
        const a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
        return { type: 'arc', cx: c.x, cy: c.y, r: s.r * k, a0, a1: a0 - (s.a1 - s.a0) };
      }
      return { type: 'arc', cx: c.x, cy: c.y, r: s.r * k, a0: s.a0 + rot, a1: s.a1 + rot };
    }
  }
}

export function transformItem(it: Item, m: Mat, keepId = true): Item {
  const id = keepId ? it.id : uid('i');
  switch (it.kind) {
    case 'stroke': {
      const k = matScale(m);
      const pts = it.pts.slice();
      for (let i = 0; i < pts.length; i += 4) {
        const p = apply(m, pts[i], pts[i + 1]);
        pts[i] = p.x;
        pts[i + 1] = p.y;
      }
      const s: StrokeItem = { ...it, id, pts, size: it.size * k };
      const sh = transformShape(it.shape, m);
      if (sh) s.shape = sh;
      else delete s.shape;
      return s;
    }
    case 'fill': {
      const polys = it.polys.map((poly) => {
        const o: number[] = [];
        for (let i = 0; i < poly.length; i += 2) {
          const p = apply(m, poly[i], poly[i + 1]);
          o.push(p.x, p.y);
        }
        return o;
      });
      return { ...it, id, polys } as FillItem;
    }
    case 'image':
    case 'text':
      return { ...it, id, m: mul(m, it.m) };
  }
}

export function cloneItem(it: Item): Item {
  return { ...JSON.parse(JSON.stringify(it)), id: uid('i') };
}

export function itemColor(it: Item): string | null {
  return it.kind === 'image' ? null : it.color;
}
