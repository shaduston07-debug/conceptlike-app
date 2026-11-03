import type { ShapeMeta } from './types';
import { simplify, segDist2, dist, normAngle } from './geom';

/** Generate stroke points (x, y, p, tilt) along a shape. */
export function shapePoints(s: ShapeMeta, pressure: number, spacing: number): number[] {
  const out: number[] = [];
  const push = (x: number, y: number) => out.push(x, y, pressure, 0);
  const seg = (x0: number, y0: number, x1: number, y1: number, first: boolean) => {
    const n = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) / spacing));
    for (let i = first ? 0 : 1; i <= n; i++) push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
  };
  switch (s.type) {
    case 'line':
      seg(s.pts[0], s.pts[1], s.pts[2], s.pts[3], true);
      break;
    case 'polyline': {
      const p = s.pts;
      for (let i = 0; i + 3 < p.length; i += 2) seg(p[i], p[i + 1], p[i + 2], p[i + 3], i === 0);
      if (s.closed && p.length >= 6) seg(p[p.length - 2], p[p.length - 1], p[0], p[1], false);
      break;
    }
    case 'ellipse': {
      const per = Math.PI * (3 * (s.rx + s.ry) - Math.sqrt((3 * s.rx + s.ry) * (s.rx + 3 * s.ry)));
      const n = Math.max(32, Math.min(1440, Math.ceil(per / spacing)));
      const c = Math.cos(s.rot), sn = Math.sin(s.rot);
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * s.rx, y = Math.sin(a) * s.ry;
        push(s.cx + x * c - y * sn, s.cy + x * sn + y * c);
      }
      break;
    }
    case 'arc': {
      const sweep = s.a1 - s.a0;
      const n = Math.max(8, Math.min(1440, Math.ceil((Math.abs(sweep) * s.r) / spacing)));
      for (let i = 0; i <= n; i++) {
        const a = s.a0 + (sweep * i) / n;
        push(s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r);
      }
      break;
    }
    case 'bezier': {
      const p = s.pts;
      let len = 0;
      for (let i = 0; i < 6; i += 2) len += dist(p[i], p[i + 1], p[i + 2], p[i + 3]);
      const n = Math.max(8, Math.min(1440, Math.ceil(len / spacing)));
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        push(a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]);
      }
      break;
    }
  }
  return out;
}

export interface SnapOpts {
  angleSnap: boolean;
  angleStep: number; // radians
  snapPoint?: (x: number, y: number) => { x: number; y: number };
  /** Minimum stroke length in world units to consider. */
  minLen: number;
}

function pathLen(xy: number[]) {
  let L = 0;
  for (let i = 2; i < xy.length; i += 2) L += dist(xy[i - 2], xy[i - 1], xy[i], xy[i + 1]);
  return L;
}

function snapAngle(x0: number, y0: number, x1: number, y1: number, step: number, tol = (4 * Math.PI) / 180) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const sa = Math.round(a / step) * step;
  if (Math.abs(normAngle(a - sa)) > tol) return { x: x1, y: y1 };
  const L = dist(x0, y0, x1, y1);
  return { x: x0 + Math.cos(sa) * L, y: y0 + Math.sin(sa) * L };
}

export function snapLine(pts: number[], o: SnapOpts): number[] {
  let [x0, y0, x1, y1] = pts;
  if (o.snapPoint) {
    const a = o.snapPoint(x0, y0), b = o.snapPoint(x1, y1);
    x0 = a.x; y0 = a.y; x1 = b.x; y1 = b.y;
  }
  if (o.angleSnap) {
    const b = snapAngle(x0, y0, x1, y1, o.angleStep);
    x1 = b.x; y1 = b.y;
  }
  return [x0, y0, x1, y1];
}

/** Try to recognise a hand-drawn stroke (flat x,y array, world units) as a clean shape. */
export function recognize(xy: number[], o: SnapOpts): ShapeMeta | null {
  const n = xy.length / 2;
  if (n < 3) return null;
  const L = pathLen(xy);
  if (L < o.minLen) return null;
  const x0 = xy[0], y0 = xy[1], xe = xy[xy.length - 2], ye = xy[xy.length - 1];
  const chord = dist(x0, y0, xe, ye);

  // --- straight line ---
  let maxDev = 0;
  for (let i = 0; i < xy.length; i += 2) maxDev = Math.max(maxDev, Math.sqrt(segDist2(xy[i], xy[i + 1], x0, y0, xe, ye).d2));
  if (chord / L > 0.9 && maxDev < Math.max(chord * 0.07, o.minLen * 0.15)) {
    return { type: 'line', pts: snapLine([x0, y0, xe, ye], o) };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    minX = Math.min(minX, xy[i]); maxX = Math.max(maxX, xy[i]);
    minY = Math.min(minY, xy[i + 1]); maxY = Math.max(maxY, xy[i + 1]);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const closed = chord < Math.max(0.2 * L / Math.PI, diag * 0.22);

  // --- polygon fit ---
  const tol = Math.max(L * 0.035, o.minLen * 0.1);
  let poly = simplify(xy, tol);
  if (closed) {
    // drop last vertex if it coincides with first
    if (poly.length >= 4 && dist(poly[0], poly[1], poly[poly.length - 2], poly[poly.length - 1]) < tol * 2.5) poly = poly.slice(0, -2);
  }
  // merge nearly collinear vertices
  poly = mergeCollinear(poly, closed, 0.35);
  const polyErr = polyError(xy, poly, closed) / L;

  // --- ellipse fit ---
  const ell = fitEllipse(xy);
  const ellErr = ell ? ellipseError(xy, ell) / L : Infinity;

  if (closed) {
    const k = poly.length / 2;
    if (k >= 3 && k <= 6 && polyErr < 0.012 && polyErr <= ellErr * 1.15) {
      if (k === 4) {
        const r = asRectangle(poly);
        if (r) poly = r;
      }
      if (o.snapPoint) for (let i = 0; i < poly.length; i += 2) {
        const p = o.snapPoint(poly[i], poly[i + 1]);
        poly[i] = p.x; poly[i + 1] = p.y;
      }
      return { type: 'polyline', pts: poly, closed: true };
    }
    if (ell && ellErr < 0.02) {
      let { rx, ry, rot } = ell;
      let { cx, cy } = ell;
      if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.14) {
        rx = ry = (rx + ry) / 2;
        rot = 0;
      } else if (o.angleSnap) {
        const sr = Math.round(rot / o.angleStep) * o.angleStep;
        if (Math.abs(normAngle(rot - sr)) < 0.12) rot = sr;
      }
      if (o.snapPoint) ({ x: cx, y: cy } = o.snapPoint(cx, cy));
      return { type: 'ellipse', cx, cy, rx, ry, rot };
    }
    return null;
  }

  // --- open shapes: arc ---
  const mi = Math.floor(n / 2);
  const c = circleFrom3(x0, y0, xy[mi * 2], xy[mi * 2 + 1], xe, ye);
  if (c && c.r < diag * 4) {
    let err = 0;
    for (let i = 0; i < xy.length; i += 2) err += Math.abs(dist(xy[i], xy[i + 1], c.x, c.y) - c.r);
    err /= n;
    if (err < c.r * 0.06 && err < L * 0.02) {
      const a0 = Math.atan2(y0 - c.y, x0 - c.x);
      const am = Math.atan2(xy[mi * 2 + 1] - c.y, xy[mi * 2] - c.x);
      const ae = Math.atan2(ye - c.y, xe - c.x);
      // choose sweep direction passing through the midpoint
      let s1 = normAngle(am - a0), s2 = normAngle(ae - am);
      let sweep = s1 + s2;
      if (Math.sign(s1) !== Math.sign(s2)) {
        s1 = s1 < 0 ? s1 + Math.PI * 2 : s1 - Math.PI * 2;
        sweep = s1 + s2;
      }
      return { type: 'arc', cx: c.x, cy: c.y, r: c.r, a0, a1: a0 + sweep };
    }
  }
  // --- open polyline ---
  const k = poly.length / 2;
  if (k >= 3 && k <= 7 && polyErr < 0.01) {
    if (o.snapPoint) for (let i = 0; i < poly.length; i += 2) {
      const p = o.snapPoint(poly[i], poly[i + 1]);
      poly[i] = p.x; poly[i + 1] = p.y;
    }
    if (o.angleSnap) for (let i = 2; i < poly.length; i += 2) {
      const p = snapAngle(poly[i - 2], poly[i - 1], poly[i], poly[i + 1], o.angleStep);
      poly[i] = p.x; poly[i + 1] = p.y;
    }
    return { type: 'polyline', pts: poly, closed: false };
  }
  return null;
}

function mergeCollinear(p: number[], closed: boolean, angTol: number): number[] {
  let pts = p.slice();
  let changed = true;
  while (changed && pts.length > 6) {
    changed = false;
    const k = pts.length / 2;
    for (let i = closed ? 0 : 1; i < (closed ? k : k - 1); i++) {
      const a = (i - 1 + k) % k, b = (i + 1) % k;
      const a1 = Math.atan2(pts[i * 2 + 1] - pts[a * 2 + 1], pts[i * 2] - pts[a * 2]);
      const a2 = Math.atan2(pts[b * 2 + 1] - pts[i * 2 + 1], pts[b * 2] - pts[i * 2]);
      if (Math.abs(normAngle(a2 - a1)) < angTol) {
        pts.splice(i * 2, 2);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function polyError(xy: number[], poly: number[], closed: boolean): number {
  const k = poly.length / 2;
  if (k < 2) return Infinity;
  let err = 0;
  for (let i = 0; i < xy.length; i += 2) {
    let best = Infinity;
    const segs = closed ? k : k - 1;
    for (let j = 0; j < segs; j++) {
      const a = j, b = (j + 1) % k;
      best = Math.min(best, segDist2(xy[i], xy[i + 1], poly[a * 2], poly[a * 2 + 1], poly[b * 2], poly[b * 2 + 1]).d2);
    }
    err += Math.sqrt(best);
  }
  return err / (xy.length / 2);
}

interface Ell { cx: number; cy: number; rx: number; ry: number; rot: number }
function fitEllipse(xy: number[]): Ell | null {
  // arc-length weighted moments
  let W = 0, mx = 0, my = 0;
  const n = xy.length / 2;
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const wi = dist(xy[a * 2], xy[a * 2 + 1], xy[b * 2], xy[b * 2 + 1]) / 2;
    w.push(wi);
    W += wi; mx += xy[i * 2] * wi; my += xy[i * 2 + 1] * wi;
  }
  if (W <= 0) return null;
  mx /= W; my /= W;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xy[i * 2] - mx, dy = xy[i * 2 + 1] - my;
    sxx += dx * dx * w[i]; syy += dy * dy * w[i]; sxy += dx * dy * w[i];
  }
  sxx /= W; syy /= W; sxy /= W;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const rot = Math.atan2(l1 - sxx, sxy || 1e-9);
  const rx0 = Math.sqrt(2 * l1), ry0 = Math.sqrt(2 * Math.max(0, l2));
  if (!(rx0 > 0) || !(ry0 > 0)) return null;
  // refine radii using projections so the fitted ellipse passes through the drawn points on average
  const c = Math.cos(rot), s = Math.sin(rot);
  let sumx = 0, sumy = 0, cntx = 0, cnty = 0;
  for (let i = 0; i < n; i++) {
    const dx = xy[i * 2] - mx, dy = xy[i * 2 + 1] - my;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const ang = Math.atan2(v / ry0, u / rx0);
    if (Math.abs(Math.cos(ang)) > 0.7) { sumx += Math.abs(u / Math.cos(ang)); cntx++; }
    if (Math.abs(Math.sin(ang)) > 0.7) { sumy += Math.abs(v / Math.sin(ang)); cnty++; }
  }
  const rx = cntx ? sumx / cntx : rx0, ry = cnty ? sumy / cnty : ry0;
  return { cx: mx, cy: my, rx, ry, rot };
}

function ellipseError(xy: number[], e: Ell): number {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  let err = 0;
  const n = xy.length / 2;
  for (let i = 0; i < n; i++) {
    const dx = xy[i * 2] - e.cx, dy = xy[i * 2 + 1] - e.cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const ang = Math.atan2(v / e.ry, u / e.rx);
    const ex = Math.cos(ang) * e.rx, ey = Math.sin(ang) * e.ry;
    err += Math.hypot(u - ex, v - ey);
  }
  return err / n;
}

function asRectangle(p: number[]): number[] | null {
  // check angles near 90 degrees
  for (let i = 0; i < 4; i++) {
    const a = (i + 3) % 4, b = (i + 1) % 4;
    const v1x = p[a * 2] - p[i * 2], v1y = p[a * 2 + 1] - p[i * 2 + 1];
    const v2x = p[b * 2] - p[i * 2], v2y = p[b * 2 + 1] - p[i * 2 + 1];
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
    if (Math.abs(cos) > 0.26) return null;
  }
  // orientation from the average of edge angles (mod 90)
  let sx = 0, sy = 0;
  for (let i = 0; i < 4; i++) {
    const b = (i + 1) % 4;
    const a = Math.atan2(p[b * 2 + 1] - p[i * 2 + 1], p[b * 2] - p[i * 2]) * 4;
    sx += Math.cos(a); sy += Math.sin(a);
  }
  let rot = Math.atan2(sy, sx) / 4;
  if (Math.abs(rot) < (6 * Math.PI) / 180) rot = 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  let mx = 0, my = 0;
  for (let i = 0; i < 4; i++) { mx += p[i * 2] / 4; my += p[i * 2 + 1] / 4; }
  const us: number[] = [], vs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const dx = p[i * 2] - mx, dy = p[i * 2 + 1] - my;
    us.push(dx * c + dy * s); vs.push(-dx * s + dy * c);
  }
  // average the two extreme sides for each axis
  const su = us.slice().sort((a, b) => a - b), sv = vs.slice().sort((a, b) => a - b);
  u0 = (su[0] + su[1]) / 2; u1 = (su[2] + su[3]) / 2;
  v0 = (sv[0] + sv[1]) / 2; v1 = (sv[2] + sv[3]) / 2;
  const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  // keep the drawing direction of the original
  const out: number[] = [];
  for (const [u, v] of corners) out.push(mx + u * c - v * s, my + u * s + v * c);
  return out;
}

export function circleFrom3(ax0: number, ay0: number, bx0: number, by0: number, cx0: number, cy0: number) {
  // work relative to the first point so precision holds at any zoom / position
  const ax = 0, ay = 0, bx = bx0 - ax0, by = by0 - ay0, cx = cx0 - ax0, cy = cy0 - ay0;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const span2 = bx * bx + by * by + cx * cx + cy * cy;
  if (Math.abs(d) <= 1e-9 * span2) return null;
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const x = (b2 * (cy - ay) + c2 * (ay - by)) / d;
  const y = (b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x: x + ax0, y: y + ay0, r: Math.hypot(x, y) };
}
