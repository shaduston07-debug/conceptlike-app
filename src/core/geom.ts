import type { Mat } from './types';

export interface P { x: number; y: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const I: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  // returns m * n (apply n first, then m)
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-300;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function apply(m: Mat, x: number, y: number): P {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function applyVec(m: Mat, x: number, y: number): P {
  return { x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y };
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
export const rotate = (a: number): Mat => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
};
/** Transform about a pivot point. */
export function about(m: Mat, px: number, py: number): Mat {
  return mul(translate(px, py), mul(m, translate(-px, -py)));
}

export const matScale = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
export const matRot = (m: Mat) => Math.atan2(m[1], m[0]);

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function emptyRect(): Rect {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}
export function rectAdd(r: Rect, x: number, y: number, pad = 0) {
  if (x - pad < r.x0) r.x0 = x - pad;
  if (y - pad < r.y0) r.y0 = y - pad;
  if (x + pad > r.x1) r.x1 = x + pad;
  if (y + pad > r.y1) r.y1 = y + pad;
}
export function rectUnion(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
export const rectValid = (r: Rect) => r.x1 >= r.x0 && r.y1 >= r.y0 && isFinite(r.x0);
export const rectsOverlap = (a: Rect, b: Rect) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
export const rectContainsPt = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;
export function rectTransform(r: Rect, m: Mat): Rect {
  const o = emptyRect();
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]) {
    const p = apply(m, x, y);
    rectAdd(o, p.x, p.y);
  }
  return o;
}

/** Squared distance from point to segment, plus parameter t. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + t * dx, qy = ay + t * dy;
  return { d2: (px - qx) ** 2 + (py - qy) ** 2, t, x: qx, y: qy };
}

/** Segment-segment intersection. Returns params (t on AB, u on CD) or null. */
export function segIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { t: number; u: number } | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) <= 1e-12 * (rx * rx + ry * ry + sx * sx + sy * sy)) return null;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Even-odd point in polygon test for a flat [x,y,...] polygon. */
export function pointInPoly(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Ramer-Douglas-Peucker simplification over flat [x,y] arrays with stride. */
export function simplify(pts: number[], tol: number, stride = 2): number[] {
  const n = pts.length / stride;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1, idx = -1;
    const ax = pts[a * stride], ay = pts[a * stride + 1], bx = pts[b * stride], by = pts[b * stride + 1];
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i * stride], pts[i * stride + 1], ax, ay, bx, by).d2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) for (let k = 0; k < stride; k++) out.push(pts[i * stride + k]);
  return out;
}

export function polyArea(poly: number[]): number {
  let a = 0;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += poly[j * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[j * 2 + 1];
  return a / 2;
}

export function normAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

let idCounter = 0;
export function uid(prefix = ''): string {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + idCounter.toString(36);
}
