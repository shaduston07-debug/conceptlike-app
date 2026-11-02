import type { Item, StrokeItem, FillItem, ImageItem, TextItem, Mat } from '../core/types';
import { strokeOutline, type OutlineGroup } from '../core/stroke';
import { BRUSHES } from '../core/brushes';
import { textMetrics, textFont } from '../core/items';
import { hexToRgb, rgba } from './color';
import { inv, applyVec, matScale } from '../core/geom';

const pathCache = new WeakMap<OutlineGroup, Path2D>();
const fillCache = new WeakMap<FillItem, Path2D>();

export function groupPath(g: OutlineGroup): Path2D {
  let p = pathCache.get(g);
  if (p) return p;
  p = new Path2D();
  const c = g.circles;
  for (let i = 0; i < c.length; i += 3) {
    p.moveTo(c[i] + c[i + 2], c[i + 1]);
    p.arc(c[i], c[i + 1], c[i + 2], 0, Math.PI * 2, false);
    p.closePath();
  }
  const q = g.quads;
  for (let i = 0; i < q.length; i += 8) {
    p.moveTo(q[i], q[i + 1]);
    p.lineTo(q[i + 2], q[i + 3]);
    p.lineTo(q[i + 4], q[i + 5]);
    p.lineTo(q[i + 6], q[i + 7]);
    p.closePath();
  }
  for (const poly of g.polys) {
    p.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) p.lineTo(poly[i], poly[i + 1]);
    p.closePath();
  }
  pathCache.set(g, p);
  return p;
}

export function fillPath(f: FillItem): Path2D {
  let p = fillCache.get(f);
  if (p) return p;
  p = new Path2D();
  for (const poly of f.polys) {
    if (poly.length < 6) continue;
    p.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) p.lineTo(poly[i], poly[i + 1]);
    p.closePath();
  }
  fillCache.set(f, p);
  return p;
}

// ---------- grain textures ----------
const grainTiles = new Map<string, HTMLCanvasElement>();
let noiseBase: Float32Array | null = null;
const GRAIN = 96;
function noise(): Float32Array {
  if (noiseBase) return noiseBase;
  // value noise blended at two octaves for a paper-tooth look
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const raw = new Float32Array(GRAIN * GRAIN).map(rnd);
  const coarse = new Float32Array(GRAIN * GRAIN);
  const cs = 4;
  const grid = new Float32Array((GRAIN / cs) * (GRAIN / cs)).map(rnd);
  const gw = GRAIN / cs;
  for (let y = 0; y < GRAIN; y++)
    for (let x = 0; x < GRAIN; x++) {
      const gx = x / cs, gy = y / cs;
      const x0 = Math.floor(gx) % gw, y0 = Math.floor(gy) % gw, x1 = (x0 + 1) % gw, y1 = (y0 + 1) % gw;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      const a = grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x1] * fx;
      const b = grid[y1 * gw + x0] * (1 - fx) + grid[y1 * gw + x1] * fx;
      coarse[y * GRAIN + x] = a * (1 - fy) + b * fy;
    }
  noiseBase = raw.map((v, i) => Math.min(1, Math.max(0, v * 0.45 + coarse[i] * 0.75 - 0.1)));
  return noiseBase;
}
function grainTile(color: string, strength: number): HTMLCanvasElement {
  const key = color + strength;
  let c = grainTiles.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = GRAIN;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(GRAIN, GRAIN);
  const [r, g, b] = hexToRgb(color);
  const n = noise();
  for (let i = 0; i < n.length; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    const v = n[i];
    img.data[i * 4 + 3] = Math.round(255 * (1 - strength + strength * Math.pow(v, 0.8)));
  }
  ctx.putImageData(img, 0, 0);
  if (grainTiles.size > 64) grainTiles.clear();
  grainTiles.set(key, c);
  return c;
}
function grainPattern(ctx: CanvasRenderingContext2D, color: string, strength: number, scaleWorld: number): CanvasPattern | string {
  const pat = ctx.createPattern(grainTile(color, strength), 'repeat');
  if (!pat) return color;
  try {
    pat.setTransform(new DOMMatrix([scaleWorld, 0, 0, scaleWorld, 0, 0]));
  } catch {}
  return pat;
}

// ---------- images ----------
const imageCache = new Map<string, HTMLImageElement>();
let onImageLoad: (() => void) | null = null;
export function setImageLoadCallback(cb: () => void) { onImageLoad = cb; }
export function getImage(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => onImageLoad?.();
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  /** Full device transform world->device pixels. */
  m: Mat;
}

/** Draw a soft (blurred) path using the shadow trick, which works everywhere canvas does. */
function softFill(dc: DrawCtx, path: Path2D, color: string, alpha: number, blurWorld: number, comp: GlobalCompositeOperation) {
  const { ctx, m } = dc;
  const k = matScale(m);
  const blurDev = Math.max(0.5, blurWorld * k);
  if (blurDev > 300) {
    // extremely zoomed in: blur is huge; fall back to a plain translucent fill
    ctx.save();
    ctx.globalCompositeOperation = comp;
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.restore();
    return;
  }
  const OFF = 40000;
  const d = applyVec(inv(m), -OFF, 0);
  ctx.save();
  ctx.globalCompositeOperation = comp;
  ctx.shadowColor = rgba(color, alpha);
  ctx.shadowBlur = blurDev;
  ctx.shadowOffsetX = OFF;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  ctx.transform(1, 0, 0, 1, d.x, d.y);
  ctx.fill(path);
  ctx.restore();
}

export function drawStroke(dc: DrawCtx, it: StrokeItem, overrideColor?: string, alphaMul = 1) {
  const { ctx } = dc;
  const def = BRUSHES[it.brush];
  const ol = strokeOutline(it);
  const color = overrideColor || it.color;
  const op = it.opacity * alphaMul;
  switch (def.style) {
    case 'solid':
    case 'nib':
    case 'marker': {
      const mult = def.multiply || def.style === 'marker';
      if (mult) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; }
      ctx.fillStyle = color;
      for (const g of ol.groups) {
        ctx.globalAlpha = op * g.alpha;
        ctx.fill(groupPath(g));
      }
      if (mult) ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }
    case 'pencil': {
      const grain = def.grain ?? 0.75;
      const pat = grainPattern(ctx, color, grain, Math.max(0.02, it.size / (grain > 0.9 ? 6 : 10)));
      ctx.fillStyle = pat;
      for (const g of ol.groups) {
        ctx.globalAlpha = op * g.alpha;
        ctx.fill(groupPath(g));
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'air': {
      for (const g of ol.groups) softFill(dc, groupPath(g), color, op, it.size * 0.42, 'source-over');
      break;
    }
    case 'softErase': {
      for (const g of ol.groups) softFill(dc, groupPath(g), '#000000', op, it.size * 0.42, 'destination-out');
      break;
    }
    case 'water': {
      for (const g of ol.groups) {
        const p = groupPath(g);
        softFill(dc, p, color, op * 0.75, it.size * 0.12, 'multiply');
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = op * 0.45;
        ctx.fillStyle = grainPattern(ctx, color, 0.6, Math.max(0.05, it.size / 18));
        ctx.fill(p);
        ctx.restore();
      }
      break;
    }
  }
}

export function drawFill(dc: DrawCtx, f: FillItem, overrideColor?: string, alphaMul = 1) {
  const { ctx } = dc;
  ctx.globalAlpha = f.opacity * alphaMul;
  ctx.fillStyle = overrideColor || f.color;
  ctx.fill(fillPath(f), 'evenodd');
  ctx.globalAlpha = 1;
}

export function drawImageItem(dc: DrawCtx, it: ImageItem, alphaMul = 1) {
  const img = getImage(it.src);
  const { ctx } = dc;
  ctx.save();
  ctx.transform(it.m[0], it.m[1], it.m[2], it.m[3], it.m[4], it.m[5]);
  if (img) {
    ctx.globalAlpha = it.opacity * alphaMul;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, it.w, it.h);
  } else {
    ctx.fillStyle = 'rgba(128,128,128,0.15)';
    ctx.fillRect(0, 0, it.w, it.h);
  }
  ctx.restore();
}

export function drawText(dc: DrawCtx, t: TextItem, overrideColor?: string, alphaMul = 1) {
  const { ctx } = dc;
  const tm = textMetrics(t);
  ctx.save();
  ctx.transform(t.m[0], t.m[1], t.m[2], t.m[3], t.m[4], t.m[5]);
  ctx.globalAlpha = t.opacity * alphaMul;
  ctx.fillStyle = overrideColor || t.color;
  ctx.font = textFont(t);
  ctx.textBaseline = 'alphabetic';
  tm.lines.forEach((line, i) => {
    let x = 0;
    if (t.align === 'center') x = (tm.w - tm.widths[i]) / 2;
    else if (t.align === 'right') x = tm.w - tm.widths[i];
    ctx.fillText(line, x, i * tm.lineH + t.size * 0.98);
  });
  ctx.restore();
}

export function drawItem(dc: DrawCtx, it: Item, overrideColor?: string, alphaMul = 1) {
  switch (it.kind) {
    case 'stroke': return drawStroke(dc, it, overrideColor, alphaMul);
    case 'fill': return drawFill(dc, it, overrideColor, alphaMul);
    case 'image': return drawImageItem(dc, it, alphaMul);
    case 'text': return drawText(dc, it, overrideColor, alphaMul);
  }
}
