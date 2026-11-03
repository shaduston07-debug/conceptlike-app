import type { DrawingDoc, Mat } from '../core/types';
import { inv, apply, matScale } from '../core/geom';
import { mixHex, rgba, luminance } from './color';

export const VP_COLORS = ['#e8505b', '#2fa36b', '#3f7be0'];

/** World-space rectangle visible on screen (axis aligned bounds). */
export function visibleWorld(view: Mat, w: number, h: number) {
  const iv = inv(view);
  const pts = [apply(iv, 0, 0), apply(iv, w, 0), apply(iv, w, h), apply(iv, 0, h)];
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

export function outsideColor(bg: string) {
  return luminance(bg) > 0.4 ? mixHex(bg, '#8a8f99', 0.22) : mixHex(bg, '#000000', 0.35);
}

/**
 * Draws paper colour, artboard and grid. `m` maps world to device pixels.
 * Width/height are device pixels.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D, doc: DrawingDoc, m: Mat, w: number, h: number, dpr: number,
  opts: { transparent?: boolean; grid?: boolean } = {},
) {
  const bg = doc.background;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!opts.transparent) {
    if (doc.artboard) {
      ctx.fillStyle = outsideColor(bg.color);
      ctx.fillRect(0, 0, w, h);
      const a = doc.artboard;
      setLocal(ctx, m, a.x, a.y);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18 * dpr;
      ctx.shadowOffsetY = 3 * dpr;
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, a.w, a.h);
      ctx.restore();
    } else {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
    }
  }
  if (opts.grid !== false && bg.paper !== 'blank') drawGrid(ctx, doc, m, w, h, dpr);
  if (opts.grid !== false && doc.perspective.mode !== 'none' && doc.perspective.visible) drawPerspective(ctx, doc, m, w, h, dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Use a nearby local origin so coordinates stay small (float precision at deep zoom). */
function setLocal(ctx: CanvasRenderingContext2D, m: Mat, ox: number, oy: number) {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[0] * ox + m[2] * oy + m[4], m[1] * ox + m[3] * oy + m[5]);
}

function drawGrid(ctx: CanvasRenderingContext2D, doc: DrawingDoc, m: Mat, w: number, h: number, dpr: number) {
  const bg = doc.background;
  const zoom = matScale(m) / dpr; // CSS px per world unit
  let step = bg.gridSize;
  // keep screen spacing between ~10 and ~120 css px
  while (step * zoom < 10) step *= bg.paper === 'iso' ? 2 : 5;
  while (step * zoom > 120 && step > 1e-300) step /= bg.paper === 'iso' ? 2 : 5;
  const vw = visibleWorld(m, w, h);
  const px = 1 / matScale(m); // one device pixel in world units
  const color = bg.gridColor;
  const alpha = bg.gridOpacity;
  // grid-aligned local origin; everything below is relative to it
  const ix0 = Math.floor(vw.x0 / step), iy0 = Math.floor(vw.y0 / step);
  const ox = ix0 * step, oy = iy0 * step;
  setLocal(ctx, m, ox, oy);
  const X0 = vw.x0 - ox, X1 = vw.x1 - ox, Y0 = vw.y0 - oy, Y1 = vw.y1 - oy;
  const nx = Math.ceil(X1 / step), ny = Math.ceil(Y1 / step);
  if (doc.artboard) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(doc.artboard.x - ox, doc.artboard.y - oy, doc.artboard.w, doc.artboard.h);
    ctx.clip();
  }
  switch (bg.paper) {
    case 'dots': {
      if ((nx + 1) * (ny + 1) > 40000) break;
      ctx.fillStyle = rgba(color, alpha);
      const r = 1.6 * dpr * px;
      ctx.beginPath();
      for (let i = 0; i <= nx; i++)
        for (let j = 0; j <= ny; j++) {
          const x = i * step, y = j * step;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      ctx.fill();
      break;
    }
    case 'grid':
    case 'graph': {
      ctx.lineWidth = px * dpr * 0.8;
      ctx.strokeStyle = rgba(color, alpha * (bg.paper === 'graph' ? 0.55 : 0.8));
      ctx.beginPath();
      for (let i = 0; i <= nx; i++) { ctx.moveTo(i * step, Y0); ctx.lineTo(i * step, Y1); }
      for (let j = 0; j <= ny; j++) { ctx.moveTo(X0, j * step); ctx.lineTo(X1, j * step); }
      ctx.stroke();
      if (bg.paper === 'graph') {
        ctx.lineWidth = px * dpr * 1.4;
        ctx.strokeStyle = rgba(color, alpha);
        ctx.beginPath();
        // major lines every 5 cells, aligned to absolute multiples of 5 * step
        const offX = ((ix0 % 5) + 5) % 5, offY = ((iy0 % 5) + 5) % 5;
        for (let i = (5 - offX) % 5; i <= nx; i += 5) { ctx.moveTo(i * step, Y0); ctx.lineTo(i * step, Y1); }
        for (let j = (5 - offY) % 5; j <= ny; j += 5) { ctx.moveTo(X0, j * step); ctx.lineTo(X1, j * step); }
        ctx.stroke();
      }
      break;
    }
    case 'lines': {
      ctx.lineWidth = px * dpr * 0.9;
      ctx.strokeStyle = rgba(color, alpha);
      ctx.beginPath();
      for (let j = 0; j <= ny; j++) { ctx.moveTo(X0, j * step); ctx.lineTo(X1, j * step); }
      ctx.stroke();
      break;
    }
    case 'iso': {
      ctx.lineWidth = px * dpr * 0.8;
      ctx.strokeStyle = rgba(color, alpha * 0.85);
      const t = Math.tan(Math.PI / 6);
      ctx.beginPath();
      for (let i = 0; i <= nx; i++) { ctx.moveTo(i * step, Y0); ctx.lineTo(i * step, Y1); }
      // diagonals y = ±t·x + c (absolute), expressed in local coordinates
      const cstep = step * t * 2;
      for (const sgn of [1, -1]) {
        // absolute intercept range covering the view, then convert to local
        const cA = vw.y0 - sgn * t * vw.x0, cB = vw.y0 - sgn * t * vw.x1, cC = vw.y1 - sgn * t * vw.x0, cD = vw.y1 - sgn * t * vw.x1;
        const cmin = Math.min(cA, cB, cC, cD), cmax = Math.max(cA, cB, cC, cD);
        const k0 = Math.floor(cmin / cstep), k1 = Math.ceil(cmax / cstep);
        if (k1 - k0 > 4000) continue;
        for (let k = k0; k <= k1; k++) {
          // local line: (y + oy) = sgn*t*(x + ox) + k*cstep  ->  y = sgn*t*x + (sgn*t*ox + k*cstep - oy)
          const c = sgn * t * ox - oy + k * cstep;
          ctx.moveTo(X0, sgn * t * X0 + c);
          ctx.lineTo(X1, sgn * t * X1 + c);
        }
      }
      ctx.stroke();
      break;
    }
  }
  if (doc.artboard) ctx.restore();
}

function drawPerspective(ctx: CanvasRenderingContext2D, doc: DrawingDoc, m: Mat, w: number, h: number, dpr: number) {
  const p = doc.perspective;
  const vw = visibleWorld(m, w, h);
  const px = 1 / matScale(m);
  const ox = vw.x0, oy = vw.y0;
  setLocal(ctx, m, ox, oy);
  const far = Math.max(vw.x1 - vw.x0, vw.y1 - vw.y0) * 4 + 1e5 * px;
  // clamp each ray to the view neighbourhood so coordinates stay small
  const near = (x: number, y: number) => ({ x: x - ox, y: y - oy });
  // horizon
  if (p.mode !== '3pt' || p.vps.length >= 2) {
    const a = p.vps[0], b = p.vps[1] || { x: a.x + 1, y: a.y };
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.strokeStyle = 'rgba(80,90,110,0.65)';
    ctx.lineWidth = 1.5 * dpr * px;
    ctx.beginPath();
    const cx = (vw.x0 + vw.x1) / 2, cy = (vw.y0 + vw.y1) / 2;
    // project the view centre onto the horizon so the segment always spans the screen
    const t = (cx - a.x) * Math.cos(ang) + (cy - a.y) * Math.sin(ang);
    const hx = a.x + Math.cos(ang) * t, hy = a.y + Math.sin(ang) * t;
    const p0 = near(hx - Math.cos(ang) * far, hy - Math.sin(ang) * far), p1 = near(hx + Math.cos(ang) * far, hy + Math.sin(ang) * far);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  p.vps.forEach((vp, i) => {
    ctx.strokeStyle = rgba(VP_COLORS[i % 3], 0.32);
    ctx.lineWidth = 1 * dpr * px;
    ctx.beginPath();
    const n = Math.max(8, p.density);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const q0 = near(vp.x, vp.y);
      const dist = Math.hypot(vp.x - (vw.x0 + vw.x1) / 2, vp.y - (vw.y0 + vw.y1) / 2);
      const q1 = near(vp.x + Math.cos(a) * (far + dist), vp.y + Math.sin(a) * (far + dist));
      ctx.moveTo(q0.x, q0.y);
      ctx.lineTo(q1.x, q1.y);
    }
    ctx.stroke();
  });
  if (p.mode === '1pt' || p.mode === '2pt') {
    // verticals (and horizontals for 1pt) spaced by grid size
    const step0 = doc.background.gridSize * 2;
    let step = step0;
    const zoom = matScale(m) / dpr;
    while (step * zoom < 24) step *= 2;
    ctx.strokeStyle = 'rgba(120,120,140,0.22)';
    ctx.lineWidth = dpr * px;
    ctx.beginPath();
    while (step * zoom > 240 && step > 1e-300) step /= 2;
    const W = vw.x1 - ox, H = vw.y1 - oy;
    const sx = Math.floor(vw.x0 / step) * step - ox, sy = Math.floor(vw.y0 / step) * step - oy;
    for (let i = 0, x = sx; x <= W; x = sx + ++i * step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    if (p.mode === '1pt') for (let j = 0, y = sy; y <= H; y = sy + ++j * step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

}
