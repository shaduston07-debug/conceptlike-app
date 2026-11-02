/** Raster flood fill + boundary tracing used by the fill tool. */

export interface FillResult {
  mask: Uint8Array;
  touchesEdge: boolean;
  count: number;
}

/** Dilate a binary mask with a square kernel of radius r (separable running max). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    const row = y * w;
    // forward pass: distance since last set
    for (let x = 0; x < w; x++) {
      if (src[row + x]) run = x;
      if (x - run <= r) tmp[row + x] = 1;
    }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (src[row + x]) run = x;
      if (run - x <= r) tmp[row + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      if (y - run <= r) out[y * w + x] = 1;
    }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

export function floodFill(barrier: Uint8Array, w: number, h: number, sx: number, sy: number): FillResult {
  const mask = new Uint8Array(w * h);
  let touchesEdge = false;
  let count = 0;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || barrier[sy * w + sx]) return { mask, touchesEdge, count };
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x0 = stack.pop()!;
    let x = x0;
    const row = y * w;
    while (x >= 0 && !barrier[row + x] && !mask[row + x]) x--;
    x++;
    let up = false, down = false;
    for (; x < w && !barrier[row + x] && !mask[row + x]; x++) {
      mask[row + x] = 1;
      count++;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) touchesEdge = true;
      if (y > 0) {
        const f = !barrier[row - w + x] && !mask[row - w + x];
        if (f && !up) { stack.push(x, y - 1); up = true; } else if (!f) up = false;
      }
      if (y < h - 1) {
        const f = !barrier[row + w + x] && !mask[row + w + x];
        if (f && !down) { stack.push(x, y + 1); down = true; } else if (!f) down = false;
      }
    }
  }
  return { mask, touchesEdge, count };
}

/**
 * Trace the boundaries of a binary mask into closed polygons (pixel-corner coordinates).
 * Each boundary edge is directed with the filled pixel on its right, then edges are chained.
 */
export function traceContours(mask: Uint8Array, w: number, h: number): number[][] {
  const W = w + 1;
  const next = new Map<number, number[]>(); // vertex -> outgoing target vertices
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const a = ay * W + ax, b = by * W + bx;
    const l = next.get(a);
    if (l) l.push(b); else next.set(a, [b]);
  };
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y); // top edge, going right
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1); // right edge, going down
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); // bottom edge, going left
      if (!at(x - 1, y)) add(x, y + 1, x, y); // left edge, going up
    }
  const polys: number[][] = [];
  for (const [startV] of next) {
    let list = next.get(startV);
    while (list && list.length) {
      const poly: number[] = [];
      let v = startV;
      let guard = 0;
      while (guard++ < 4e6) {
        const outs = next.get(v);
        if (!outs || !outs.length) break;
        const t = outs.pop()!;
        poly.push(v % W, Math.floor(v / W));
        v = t;
        if (v === startV) break;
      }
      if (poly.length >= 6) polys.push(removeCollinear(poly));
      list = next.get(startV);
    }
  }
  return polys;
}

function removeCollinear(p: number[]): number[] {
  const out: number[] = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const cross = (p[i * 2] - p[a * 2]) * (p[b * 2 + 1] - p[i * 2 + 1]) - (p[i * 2 + 1] - p[a * 2 + 1]) * (p[b * 2] - p[i * 2]);
    if (cross !== 0) out.push(p[i * 2], p[i * 2 + 1]);
  }
  return out;
}

/** Chaikin smoothing for closed polygons to soften pixel stair-steps. */
export function chaikin(p: number[], iterations = 2): number[] {
  let pts = p;
  for (let k = 0; k < iterations; k++) {
    const n = pts.length / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    pts = out;
  }
  return pts;
}
