import { BRUSHES, NIB_ANGLE } from './brushes';
import type { StrokeItem } from './types';
import { emptyRect, rectAdd, type Rect } from './geom';

/**
 * A stroke outline is a union of round "dabs" (circles) and convex quads.
 * Every primitive is emitted with the same (clockwise) winding so a single
 * non-zero fill yields the exact union without seams or holes.
 * Pencil strokes are split into alpha groups to vary graphite density.
 */
export interface OutlineGroup {
  alpha: number;
  circles: number[]; // x, y, r
  quads: number[]; // 8 numbers per quad
  polys: number[][]; // closed polygons
}
export interface Outline {
  groups: OutlineGroup[];
  bbox: Rect;
}

/** Interpolated, resampled stroke samples: x, y, r, alpha (stride 4). */
export function sampleStroke(item: StrokeItem, pressureSize = true): number[] {
  const def = BRUSHES[item.brush];
  const src = item.pts;
  const n = src.length / 4;
  const R = item.size / 2;
  const out: number[] = [];
  if (n === 0) return out;
  const radius = (p: number, tilt: number) => {
    let k = pressureSize ? def.pmin + (def.pmax - def.pmin) * p : 1;
    if (def.tilt) k *= 1 + tilt * 2.6;
    return R * k;
  };
  const alphaOf = (p: number, tilt: number) => {
    let a = def.omin + (1 - def.omin) * Math.pow(p, 0.8);
    if (def.tilt) a *= 1 - tilt * 0.55;
    return a;
  };
  if (n === 1) {
    out.push(src[0], src[1], radius(src[2], src[3]), alphaOf(src[2], src[3]));
    return out;
  }
  const linear = !!item.shape;
  const get = (i: number, k: number) => src[Math.max(0, Math.min(n - 1, i)) * 4 + k];
  for (let i = 0; i < n - 1; i++) {
    const x0 = get(i - 1, 0), y0 = get(i - 1, 1);
    const x1 = get(i, 0), y1 = get(i, 1);
    const x2 = get(i + 1, 0), y2 = get(i + 1, 1);
    const x3 = get(i + 2, 0), y3 = get(i + 2, 1);
    const p1 = get(i, 2), p2 = get(i + 1, 2), t1 = get(i, 3), t2 = get(i + 1, 3);
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const r = Math.max(0.05, radius((p1 + p2) / 2, (t1 + t2) / 2));
    const steps = Math.max(1, Math.min(48, Math.ceil(segLen / Math.max(0.15, r * 0.45))));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2_ = t * t, t3 = t2_ * t;
      // centripetal-ish Catmull-Rom (uniform, tension 0.5)
      if (linear) {
        out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius(p1 + (p2 - p1) * t, t1 + (t2 - t1) * t), alphaOf(p1 + (p2 - p1) * t, t1 + (t2 - t1) * t));
        continue;
      }
      const x = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2_ + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const y = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2_ + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      const p = p1 + (p2 - p1) * t, tl = t1 + (t2 - t1) * t;
      out.push(x, y, radius(p, tl), alphaOf(p, tl));
    }
  }
  out.push(src[(n - 1) * 4], src[(n - 1) * 4 + 1], radius(src[(n - 1) * 4 + 2], src[(n - 1) * 4 + 3]), alphaOf(src[(n - 1) * 4 + 2], src[(n - 1) * 4 + 3]));
  // tapering
  if (def.taper > 0 && out.length > 8) {
    const m = out.length / 4;
    const cum = new Float64Array(m);
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(out[i * 4] - out[i * 4 - 4], out[i * 4 + 1] - out[i * 4 - 3]);
    const total = cum[m - 1];
    const tl = Math.min(def.taper * item.size, total * 0.4);
    if (tl > 0) {
      for (let i = 0; i < m; i++) {
        const a = Math.min(1, cum[i] / tl), b = Math.min(1, (total - cum[i]) / tl);
        const k = Math.sqrt(Math.min(a, b));
        out[i * 4 + 2] *= 0.12 + 0.88 * k;
      }
    }
  }
  return out;
}

function pushCircle(g: OutlineGroup, x: number, y: number, r: number) {
  g.circles.push(x, y, r);
}

function pushQuad(g: OutlineGroup, q: number[]) {
  // normalise winding to clockwise in screen space (positive area in y-down coords)
  let a = 0;
  for (let i = 0, j = 3; i < 4; j = i++) a += q[j * 2] * q[i * 2 + 1] - q[i * 2] * q[j * 2 + 1];
  if (a < 0) {
    g.quads.push(q[6], q[7], q[4], q[5], q[2], q[3], q[0], q[1]);
  } else g.quads.push(...q);
}

const outlineCache = new WeakMap<StrokeItem, Outline>();

export function strokeOutline(item: StrokeItem): Outline {
  let o = outlineCache.get(item);
  if (!o) {
    o = buildOutline(item);
    outlineCache.set(item, o);
  }
  return o;
}

function pushPoly(g: OutlineGroup, poly: number[]) {
  let a = 0;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += poly[j * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[j * 2 + 1];
  if (a < 0) {
    const r: number[] = [];
    for (let i = n - 1; i >= 0; i--) r.push(poly[i * 2], poly[i * 2 + 1]);
    g.polys.push(r);
  } else g.polys.push(poly);
}

/**
 * Builds the stroke outline as a set of smooth "runs". Each run is a single closed polygon
 * (left offset forward, right offset back) so there are no internal edges that could show
 * anti-aliasing seams. Runs break at sharp turns, where a round dab joins them.
 */
export function buildOutline(item: StrokeItem): Outline {
  const def = BRUSHES[item.brush];
  const s = sampleStroke(item);
  const m = s.length / 4;
  const bbox = emptyRect();
  for (let i = 0; i < m; i++) rectAdd(bbox, s[i * 4], s[i * 4 + 1], s[i * 4 + 2] + 0.5);
  const nib = def.style === 'nib';
  const graded = def.style === 'pencil';
  const groups = new Map<number, OutlineGroup>();
  const keyOf = (a: number) => (graded ? Math.max(1, Math.min(10, Math.round(a * 10))) / 10 : 1);
  const groupFor = (key: number): OutlineGroup => {
    let g = groups.get(key);
    if (!g) { g = { alpha: key, circles: [], quads: [], polys: [] }; groups.set(key, g); }
    return g;
  };
  const nx = Math.cos(NIB_ANGLE), ny = Math.sin(NIB_ANGLE);

  if (m === 1) {
    const g = groupFor(keyOf(s[3]));
    if (nib) {
      const r = s[2], px = -ny * r * 0.3, py = nx * r * 0.3;
      pushQuad(g, [s[0] + nx * r + px, s[1] + ny * r + py, s[0] - nx * r + px, s[1] - ny * r + py, s[0] - nx * r - px, s[1] - ny * r - py, s[0] + nx * r - px, s[1] + ny * r - py]);
    } else pushCircle(g, s[0], s[1], s[2]);
    return { groups: [...groups.values()], bbox };
  }

  // segment directions
  const dirs: number[] = [];
  for (let i = 0; i < m - 1; i++) {
    const dx = s[i * 4 + 4] - s[i * 4], dy = s[i * 4 + 5] - s[i * 4 + 1];
    const L = Math.hypot(dx, dy) || 1e-9;
    dirs.push(dx / L, dy / L);
  }
  const emitRun = (from: number, to: number, key: number, capStart: boolean, capEnd: boolean) => {
    const g = groupFor(key);
    if (to <= from) {
      if (!nib) pushCircle(g, s[from * 4], s[from * 4 + 1], s[from * 4 + 2]);
      return;
    }
    const left: number[] = [], right: number[] = [];
    for (let i = from; i <= to; i++) {
      const x = s[i * 4], y = s[i * 4 + 1], r = s[i * 4 + 2];
      const sa = Math.max(from, Math.min(to - 1, i - 1)), sb = Math.max(from, Math.min(to - 1, i));
      let tx = dirs[sa * 2] + dirs[sb * 2], ty = dirs[sa * 2 + 1] + dirs[sb * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      let ox: number, oy: number;
      if (nib) {
        ox = nx * r; oy = ny * r;
        const c = tx * oy - ty * ox; // perpendicular component relative to motion
        const sg = c >= 0 ? 1 : -1;
        ox += -ty * sg * r * 0.12; oy += tx * sg * r * 0.12;
      } else {
        // keep the width exact around gentle bends (miter correction)
        const cosHalf = Math.max(0.5, tx * dirs[sb * 2] + ty * dirs[sb * 2 + 1]);
        ox = -ty * r / cosHalf; oy = tx * r / cosHalf;
      }
      left.push(x + ox, y + oy);
      right.push(x - ox, y - oy);
    }
    const poly = left.slice();
    for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
    pushPoly(g, poly);
    if (!nib) {
      if (capStart) pushCircle(g, s[from * 4], s[from * 4 + 1], s[from * 4 + 2]);
      if (capEnd) pushCircle(g, s[to * 4], s[to * 4 + 1], s[to * 4 + 2]);
    }
  };

  let start = 0;
  let key = keyOf((s[3] + s[7]) / 2);
  for (let i = 1; i < m - 1; i++) {
    const segKey = keyOf((s[i * 4 + 3] + s[i * 4 + 7]) / 2);
    let brk = false;
    if (graded && segKey !== key) brk = true;
    const cross = dirs[(i - 1) * 2] * dirs[i * 2 + 1] - dirs[(i - 1) * 2 + 1] * dirs[i * 2];
    const dot = dirs[(i - 1) * 2] * dirs[i * 2] + dirs[(i - 1) * 2 + 1] * dirs[i * 2 + 1];
    const turn = Math.abs(Math.atan2(cross, dot));
    if (turn > 0.35) brk = true;
    if (nib) {
      const c0 = dirs[(i - 1) * 2] * ny - dirs[(i - 1) * 2 + 1] * nx;
      const c1 = dirs[i * 2] * ny - dirs[i * 2 + 1] * nx;
      if (Math.sign(c0) !== Math.sign(c1)) brk = true;
    }
    if (brk) {
      emitRun(start, i, key, !graded || start === 0, !graded);
      start = i;
      key = segKey;
    }
  }
  emitRun(start, m - 1, key, !graded || start === 0, true);
  return { groups: [...groups.values()], bbox };
}

/** Centerline bounding box padded by the maximum radius. */
export function strokeBounds(item: StrokeItem): Rect {
  return strokeOutline(item).bbox;
}
