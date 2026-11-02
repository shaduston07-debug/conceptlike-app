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
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18 * dpr;
      ctx.shadowOffsetY = 3 * dpr;
      ctx.fillStyle = bg.color;
      ctx.fillRect(a.x, a.y, a.w, a.h);
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

function drawGrid(ctx: CanvasRenderingContext2D, doc: DrawingDoc, m: Mat, w: number, h: number, dpr: number) {
  const bg = doc.background;
  const zoom = matScale(m) / dpr; // CSS px per world unit
  let step = bg.gridSize;
  // keep screen spacing between ~10 and ~120 css px
  while (step * zoom < 10) step *= bg.paper === 'iso' ? 2 : 5;
  while (step * zoom > 120 && step > 1e-6) step /= bg.paper === 'iso' ? 2 : 5;
  const vw = visibleWorld(m, w, h);
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const px = 1 / matScale(m); // one device pixel in world units
  const color = bg.gridColor;
  const alpha = bg.gridOpacity;
  if (doc.artboard) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(doc.artboard.x, doc.artboard.y, doc.artboard.w, doc.artboard.h);
    ctx.clip();
  }
  const x0 = Math.floor(vw.x0 / step) * step, x1 = vw.x1;
  const y0 = Math.floor(vw.y0 / step) * step, y1 = vw.y1;
  const count = ((x1 - x0) / step) * ((y1 - y0) / step);
  switch (bg.paper) {
    case 'dots': {
      if (count > 40000) break;
      ctx.fillStyle = rgba(color, alpha);
      const r = Math.max(1.1 * dpr, 1.6 * dpr) * px;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step)
        for (let y = y0; y <= y1; y += step) {
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      ctx.fill();
      break;
    }
    case 'grid':
    case 'graph': {
      const major = step * 5;
      ctx.lineWidth = px * dpr * 0.8;
      ctx.strokeStyle = rgba(color, alpha * (bg.paper === 'graph' ? 0.55 : 0.8));
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step) { ctx.moveTo(x, vw.y0); ctx.lineTo(x, vw.y1); }
      for (let y = y0; y <= y1; y += step) { ctx.moveTo(vw.x0, y); ctx.lineTo(vw.x1, y); }
      ctx.stroke();
      if (bg.paper === 'graph') {
        ctx.lineWidth = px * dpr * 1.4;
        ctx.strokeStyle = rgba(color, alpha);
        ctx.beginPath();
        const mx0 = Math.floor(vw.x0 / major) * major, my0 = Math.floor(vw.y0 / major) * major;
        for (let x = mx0; x <= x1; x += major) { ctx.moveTo(x, vw.y0); ctx.lineTo(x, vw.y1); }
        for (let y = my0; y <= y1; y += major) { ctx.moveTo(vw.x0, y); ctx.lineTo(vw.x1, y); }
        ctx.stroke();
      }
      break;
    }
    case 'lines': {
      ctx.lineWidth = px * dpr * 0.9;
      ctx.strokeStyle = rgba(color, alpha);
      ctx.beginPath();
      for (let y = y0; y <= y1; y += step) { ctx.moveTo(vw.x0, y); ctx.lineTo(vw.x1, y); }
      ctx.stroke();
      break;
    }
    case 'iso': {
      ctx.lineWidth = px * dpr * 0.8;
      ctx.strokeStyle = rgba(color, alpha * 0.85);
      const t = Math.tan(Math.PI / 6);
      const hs = step; // horizontal spacing of vertical lines
      ctx.beginPath();
      for (let x = Math.floor(vw.x0 / hs) * hs; x <= x1; x += hs) { ctx.moveTo(x, vw.y0); ctx.lineTo(x, vw.y1); }
      // lines y = ±t x + c; spacing along y is hs / cos... use c step = hs * t * 2 / 2
      const cstep = hs * t * 2;
      const span = (vw.x1 - vw.x0) * t;
      for (const sgn of [1, -1]) {
        const cmin = vw.y0 - span - Math.abs(t * vw.x1) - Math.abs(t * vw.x0);
        const cmax = vw.y1 + span + Math.abs(t * vw.x1) + Math.abs(t * vw.x0);
        for (let c = Math.floor(cmin / cstep) * cstep; c <= cmax; c += cstep) {
          ctx.moveTo(vw.x0, sgn * t * vw.x0 + c);
          ctx.lineTo(vw.x1, sgn * t * vw.x1 + c);
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
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const far = Math.max(vw.x1 - vw.x0, vw.y1 - vw.y0) * 4 + 1e5 * px;
  // horizon
  if (p.mode !== '3pt' || p.vps.length >= 2) {
    const a = p.vps[0], b = p.vps[1] || { x: a.x + 1, y: a.y };
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.strokeStyle = 'rgba(80,90,110,0.65)';
    ctx.lineWidth = 1.5 * dpr * px;
    ctx.beginPath();
    ctx.moveTo(a.x - Math.cos(ang) * far, a.y - Math.sin(ang) * far);
    ctx.lineTo(a.x + Math.cos(ang) * far, a.y + Math.sin(ang) * far);
    ctx.stroke();
  }
  p.vps.forEach((vp, i) => {
    ctx.strokeStyle = rgba(VP_COLORS[i % 3], 0.32);
    ctx.lineWidth = 1 * dpr * px;
    ctx.beginPath();
    const n = Math.max(8, p.density);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      ctx.moveTo(vp.x, vp.y);
      ctx.lineTo(vp.x + Math.cos(a) * far, vp.y + Math.sin(a) * far);
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
    for (let x = Math.floor(vw.x0 / step) * step; x <= vw.x1; x += step) { ctx.moveTo(x, vw.y0); ctx.lineTo(x, vw.y1); }
    if (p.mode === '1pt') for (let y = Math.floor(vw.y0 / step) * step; y <= vw.y1; y += step) { ctx.moveTo(vw.x0, y); ctx.lineTo(vw.x1, y); }
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

}
