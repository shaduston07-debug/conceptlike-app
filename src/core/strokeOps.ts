import type { StrokeItem } from './types';
import { segIntersect, segDist2, rectsOverlap, uid } from './geom';
import { itemBounds } from './items';

/** Insert interpolated samples so that no segment is longer than `maxSeg`. */
export function densify(pts: number[], maxSeg: number): number[] {
  const n = pts.length / 4;
  if (n < 2) return pts.slice();
  const out: number[] = [pts[0], pts[1], pts[2], pts[3]];
  for (let i = 1; i < n; i++) {
    const ax = pts[i * 4 - 4], ay = pts[i * 4 - 3], bx = pts[i * 4], by = pts[i * 4 + 1];
    const L = Math.hypot(bx - ax, by - ay);
    const k = Math.min(400, Math.ceil(L / maxSeg));
    for (let s = 1; s <= k; s++) {
      const t = s / k;
      for (let c = 0; c < 4; c++) out.push(pts[i * 4 - 4 + c] + (pts[i * 4 + c] - pts[i * 4 - 4 + c]) * t);
    }
  }
  return out;
}

export function cumLengths(pts: number[]): number[] {
  const n = pts.length / 4;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i * 4] - pts[i * 4 - 4], pts[i * 4 + 1] - pts[i * 4 - 3]));
  return cum;
}

/** Sub-range of a stroke between arc-length positions a and b. */
export function strokeRange(pts: number[], cum: number[], a: number, b: number): number[] {
  const n = pts.length / 4;
  const out: number[] = [];
  const interp = (s: number) => {
    let i = 1;
    while (i < n - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    for (let c = 0; c < 4; c++) out.push(pts[(i - 1) * 4 + c] + (pts[i * 4 + c] - pts[(i - 1) * 4 + c]) * t);
  };
  interp(a);
  for (let i = 0; i < n; i++) if (cum[i] > a && cum[i] < b) for (let c = 0; c < 4; c++) out.push(pts[i * 4 + c]);
  interp(b);
  return out;
}

export function pieceItem(src: StrokeItem, pts: number[]): StrokeItem {
  const it: StrokeItem = { ...src, id: uid('i'), pts };
  delete it.shape;
  return it;
}

/** Arc-length positions on `a` where it crosses `b`. */
export function crossings(a: StrokeItem, b: { pts: number[] }, stride = 4): number[] {
  const out: number[] = [];
  const pa = a.pts, pb = b.pts;
  const na = pa.length / 4, nb = pb.length / stride;
  const cum = cumLengths(pa);
  for (let i = 0; i < na - 1; i++) {
    const ax = pa[i * 4], ay = pa[i * 4 + 1], bx = pa[i * 4 + 4], by = pa[i * 4 + 5];
    const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), miny = Math.min(ay, by), maxy = Math.max(ay, by);
    for (let j = 0; j < nb - 1; j++) {
      const cx = pb[j * stride], cy = pb[j * stride + 1], dx = pb[(j + 1) * stride], dy = pb[(j + 1) * stride + 1];
      if (Math.max(cx, dx) < minx || Math.min(cx, dx) > maxx || Math.max(cy, dy) < miny || Math.min(cy, dy) > maxy) continue;
      const r = segIntersect(ax, ay, bx, by, cx, cy, dx, dy);
      if (r) out.push(cum[i] + r.t * (cum[i + 1] - cum[i]));
    }
  }
  return out.sort((x, y) => x - y);
}

/** Self-intersection positions along a stroke (both crossing positions are returned). */
export function selfCrossings(a: StrokeItem): number[] {
  const pa = a.pts;
  const n = pa.length / 4;
  const cum = cumLengths(pa);
  const out: number[] = [];
  if (n > 1500) return out;
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 2; j < n - 1; j++) {
      const r = segIntersect(pa[i * 4], pa[i * 4 + 1], pa[i * 4 + 4], pa[i * 4 + 5], pa[j * 4], pa[j * 4 + 1], pa[j * 4 + 4], pa[j * 4 + 5]);
      if (r) out.push(cum[i] + r.t * (cum[i + 1] - cum[i]), cum[j] + r.u * (cum[j + 1] - cum[j]));
    }
  return out.sort((x, y) => x - y);
}

/** Split a stroke at the given arc-length positions. */
export function splitAt(item: StrokeItem, positions: number[]): StrokeItem[] {
  const cum = cumLengths(item.pts);
  const L = cum[cum.length - 1];
  const cuts = [0, ...positions.filter((s) => s > 1e-6 && s < L - 1e-6), L];
  const out: StrokeItem[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    if (cuts[i + 1] - cuts[i] < 1e-6) continue;
    out.push(pieceItem(item, strokeRange(item.pts, cum, cuts[i], cuts[i + 1])));
  }
  return out;
}

/** Erase the parts of a stroke within `r` of the polyline path (world). Returns null if untouched. */
export function eraseAlong(item: StrokeItem, path: number[], r: number): StrokeItem[] | null {
  const b = itemBounds(item);
  let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
  for (let i = 0; i < path.length; i += 2) {
    px0 = Math.min(px0, path[i]); px1 = Math.max(px1, path[i]);
    py0 = Math.min(py0, path[i + 1]); py1 = Math.max(py1, path[i + 1]);
  }
  if (!rectsOverlap(b, { x0: px0 - r, y0: py0 - r, x1: px1 + r, y1: py1 + r })) return null;
  const pts = densify(item.pts, Math.max(r * 0.35, 0.05));
  const n = pts.length / 4;
  const rr = r + item.size * 0.25;
  const r2 = rr * rr;
  const inside = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 4], y = pts[i * 4 + 1];
    if (x < px0 - rr || x > px1 + rr || y < py0 - rr || y > py1 + rr) continue;
    if (path.length === 2) {
      if ((x - path[0]) ** 2 + (y - path[1]) ** 2 <= r2) { inside[i] = 1; any = true; }
      continue;
    }
    for (let j = 0; j + 3 < path.length; j += 2) {
      if (segDist2(x, y, path[j], path[j + 1], path[j + 2], path[j + 3]).d2 <= r2) { inside[i] = 1; any = true; break; }
    }
  }
  if (!any) return null;
  const pieces: StrokeItem[] = [];
  let cur: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inside[i]) {
      if (cur.length >= 8) pieces.push(pieceItem(item, cur));
      cur = [];
    } else for (let c = 0; c < 4; c++) cur.push(pts[i * 4 + c]);
  }
  if (cur.length >= 8) pieces.push(pieceItem(item, cur));
  return pieces;
}

/** Nearest arc-length position on a stroke to a point, with distance. */
export function nearestOnStroke(item: StrokeItem, x: number, y: number): { s: number; d: number } {
  const p = item.pts;
  const cum = cumLengths(p);
  let best = { s: 0, d: Infinity };
  const n = p.length / 4;
  if (n === 1) return { s: 0, d: Math.hypot(p[0] - x, p[1] - y) };
  for (let i = 0; i < n - 1; i++) {
    const r = segDist2(x, y, p[i * 4], p[i * 4 + 1], p[i * 4 + 4], p[i * 4 + 5]);
    if (r.d2 < best.d) best = { s: cum[i] + r.t * (cum[i + 1] - cum[i]), d: r.d2 };
  }
  best.d = Math.sqrt(best.d);
  return best;
}
