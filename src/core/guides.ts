import type { Guide, GuideKind } from './types';
import { dist, segDist2 } from './geom';
import { circleFrom3 } from './shapes';

/** A guide geometry sampled as a polyline in world space. */
export interface GuidePath {
  pts: number[]; // x,y
  closed: boolean;
  cum: number[]; // cumulative length at each vertex
  length: number;
  infinite: boolean;
}

const FAR = 1e6;

export function guidePath(g: Guide): GuidePath {
  const p = g.pts;
  let pts: number[] = [];
  let closed = false;
  let infinite = false;
  switch (g.kind) {
    case 'line': {
      const dx = p[2] - p[0], dy = p[3] - p[1];
      const L = Math.hypot(dx, dy) || 1;
      if (g.infinite !== false) {
        pts = [p[0] - (dx / L) * FAR, p[1] - (dy / L) * FAR, p[2] + (dx / L) * FAR, p[3] + (dy / L) * FAR];
        infinite = true;
      } else pts = [p[0], p[1], p[2], p[3]];
      break;
    }
    case 'circle': {
      const r = dist(p[0], p[1], p[2], p[3]);
      pts = ellipsePts(p[0], p[1], r, r, 0);
      closed = true;
      break;
    }
    case 'ellipse': {
      const rx = dist(p[0], p[1], p[2], p[3]);
      const rot = Math.atan2(p[3] - p[1], p[2] - p[0]);
      const ry = Math.abs(-(p[4] - p[0]) * Math.sin(rot) + (p[5] - p[1]) * Math.cos(rot));
      pts = ellipsePts(p[0], p[1], rx, Math.max(1, ry), rot);
      closed = true;
      break;
    }
    case 'rect': {
      const x0 = Math.min(p[0], p[2]), x1 = Math.max(p[0], p[2]), y0 = Math.min(p[1], p[3]), y1 = Math.max(p[1], p[3]);
      pts = [x0, y0, x1, y0, x1, y1, x0, y1];
      closed = true;
      break;
    }
    case 'polygon': {
      const n = Math.max(3, g.sides || 6);
      const r = dist(p[0], p[1], p[2], p[3]);
      const a0 = Math.atan2(p[3] - p[1], p[2] - p[0]);
      for (let i = 0; i < n; i++) pts.push(p[0] + Math.cos(a0 + (i / n) * Math.PI * 2) * r, p[1] + Math.sin(a0 + (i / n) * Math.PI * 2) * r);
      closed = true;
      break;
    }
    case 'arc': {
      const c = circleFrom3(p[0], p[1], p[2], p[3], p[4], p[5]);
      if (!c) { pts = [p[0], p[1], p[4], p[5]]; break; }
      const a0 = Math.atan2(p[1] - c.y, p[0] - c.x);
      const am = Math.atan2(p[3] - c.y, p[2] - c.x);
      const a1 = Math.atan2(p[5] - c.y, p[4] - c.x);
      const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let sweep = norm(a1 - a0);
      if (norm(am - a0) > sweep) sweep = sweep - Math.PI * 2;
      const n = Math.max(16, Math.ceil(Math.abs(sweep) * 64));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        pts.push(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r);
      }
      break;
    }
    case 'curve': {
      const n = 160;
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        pts.push(a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]);
      }
      break;
    }
    case 'protractor': {
      const r = dist(p[0], p[1], p[2], p[3]);
      pts = ellipsePts(p[0], p[1], r, r, 0);
      closed = true;
      break;
    }
  }
  if (closed && pts.length >= 4) pts.push(pts[0], pts[1]);
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + dist(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]));
  return { pts, closed, cum, length: cum[cum.length - 1], infinite };
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot: number) {
  const out: number[] = [];
  const n = 256;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** Closest point on the guide path; returns arc-length parameter s. */
export function projectGuide(gp: GuidePath, x: number, y: number): { x: number; y: number; s: number; d: number } {
  let best = { x: 0, y: 0, s: 0, d: Infinity };
  const p = gp.pts;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const r = segDist2(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]);
    if (r.d2 < best.d) {
      const segLen = gp.cum[i / 2 + 1] - gp.cum[i / 2];
      best = { x: r.x, y: r.y, s: gp.cum[i / 2] + r.t * segLen, d: r.d2 };
    }
  }
  best.d = Math.sqrt(best.d);
  return best;
}

export function guideAt(gp: GuidePath, s: number): { x: number; y: number } {
  if (gp.closed) s = ((s % gp.length) + gp.length) % gp.length;
  else s = Math.max(0, Math.min(gp.length, s));
  const c = gp.cum;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] <= s) lo = mid; else hi = mid;
  }
  const seg = c[hi] - c[lo] || 1;
  const t = (s - c[lo]) / seg;
  const p = gp.pts;
  return { x: p[lo * 2] + (p[hi * 2] - p[lo * 2]) * t, y: p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t };
}

/** Sample the guide between two arc-length positions (s1 may be < s0 or wrap for closed guides). */
export function guideBetween(gp: GuidePath, s0: number, s1: number, spacing: number): number[] {
  const out: number[] = [];
  const L = s1 - s0;
  const n = Math.max(1, Math.min(4000, Math.ceil(Math.abs(L) / spacing)));
  for (let i = 0; i <= n; i++) {
    const q = guideAt(gp, s0 + (L * i) / n);
    out.push(q.x, q.y);
  }
  return out;
}

/** Create a reasonable default guide centred on a world point with a given world radius. */
export function defaultGuide(kind: GuideKind, cx: number, cy: number, r: number): Guide {
  switch (kind) {
    case 'line': return { kind, pts: [cx - r, cy, cx + r, cy], infinite: true };
    case 'circle': return { kind, pts: [cx, cy, cx + r * 0.7, cy] };
    case 'ellipse': return { kind, pts: [cx, cy, cx + r, cy, cx, cy + r * 0.5] };
    case 'rect': return { kind, pts: [cx - r, cy - r * 0.6, cx + r, cy + r * 0.6] };
    case 'polygon': return { kind, pts: [cx, cy, cx, cy - r * 0.7], sides: 6 };
    case 'arc': return { kind, pts: [cx - r, cy + r * 0.3, cx, cy - r * 0.4, cx + r, cy + r * 0.3] };
    case 'curve': return { kind, pts: [cx - r, cy + r * 0.3, cx - r * 0.4, cy - r * 0.8, cx + r * 0.4, cy + r * 0.8, cx + r, cy - r * 0.3] };
    case 'protractor': return { kind, pts: [cx, cy, cx + r * 0.7, cy] };
  }
}

export interface GuideHandle {
  idx: number; // point index in guide.pts (pairs), -1 = move whole guide
  x: number;
  y: number;
  role: 'point' | 'move' | 'control';
}

export function guideHandles(g: Guide): GuideHandle[] {
  const p = g.pts;
  const hs: GuideHandle[] = [];
  for (let i = 0; i < p.length; i += 2) hs.push({ idx: i, x: p[i], y: p[i + 1], role: g.kind === 'curve' && (i === 2 || i === 4) ? 'control' : 'point' });
  // centre move handle for kinds whose first point isn't already a centre
  if (g.kind === 'line' || g.kind === 'rect' || g.kind === 'arc' || g.kind === 'curve') {
    let mx = 0, my = 0;
    const k = p.length / 2;
    for (let i = 0; i < p.length; i += 2) { mx += p[i] / k; my += p[i + 1] / k; }
    if (g.kind === 'line') { mx = (p[0] + p[2]) / 2; my = (p[1] + p[3]) / 2; }
    hs.push({ idx: -1, x: mx, y: my, role: 'move' });
  } else {
    hs[0].role = 'move';
  }
  return hs;
}

export function moveGuideHandle(g: Guide, h: GuideHandle, dx: number, dy: number, orig: number[]): Guide {
  const pts = orig.slice();
  const isCenterMove = h.idx === -1 || (h.idx === 0 && (g.kind === 'circle' || g.kind === 'ellipse' || g.kind === 'polygon' || g.kind === 'protractor'));
  if (isCenterMove) {
    for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
  } else if (g.kind === 'ellipse' && h.idx === 2) {
    // rotate/scale major axis, keep minor radius
    const rx0 = dist(orig[0], orig[1], orig[2], orig[3]);
    const rot0 = Math.atan2(orig[3] - orig[1], orig[2] - orig[0]);
    const ry = -(orig[4] - orig[0]) * Math.sin(rot0) + (orig[5] - orig[1]) * Math.cos(rot0);
    pts[2] = orig[2] + dx; pts[3] = orig[3] + dy;
    const rot = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
    void rx0;
    pts[4] = pts[0] - Math.sin(rot) * ry;
    pts[5] = pts[1] + Math.cos(rot) * ry;
  } else if (g.kind === 'ellipse' && h.idx === 4) {
    // minor axis handle constrained to the perpendicular
    const rot = Math.atan2(orig[3] - orig[1], orig[2] - orig[0]);
    const nx = -Math.sin(rot), ny = Math.cos(rot);
    const ry = (orig[4] + dx - orig[0]) * nx + (orig[5] + dy - orig[1]) * ny;
    pts[4] = orig[0] + nx * ry;
    pts[5] = orig[1] + ny * ry;
  } else {
    pts[h.idx] += dx;
    pts[h.idx + 1] += dy;
  }
  return { ...g, pts };
}

export const GUIDE_LABELS: Record<GuideKind, string> = {
  line: 'Line', circle: 'Circle', ellipse: 'Ellipse', rect: 'Rectangle', polygon: 'Polygon', arc: 'Arc', curve: 'Curve', protractor: 'Protractor',
};
