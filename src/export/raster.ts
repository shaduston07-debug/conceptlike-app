import type { DrawingDoc, Mat, Layer } from '../core/types';
import type { Rect } from '../core/geom';
import { renderLayerItems } from '../render/renderer';
import { drawBackground } from '../render/background';
import { itemsBounds, itemBounds } from '../core/items';
import { emptyRect, rectAdd, rectValid } from '../core/geom';
import { getImage } from '../render/draw';
import { pageRect } from '../core/page';

export type ExportArea = 'drawing' | 'artboard' | 'view' | 'selection' | 'page';

export const MAX_PIXELS = 16_000_000;
export const MAX_SIDE = 8192;

export function contentBounds(doc: DrawingDoc): Rect | null {
  const r = emptyRect();
  for (const l of doc.layers) {
    if (!l.visible) continue;
    for (const it of l.items) {
      if (it.kind === 'stroke' && it.brush === 'softEraser') continue;
      const b = itemBounds(it);
      rectAdd(r, b.x0, b.y0);
      rectAdd(r, b.x1, b.y1);
    }
  }
  return rectValid(r) ? r : null;
}

export function exportRect(doc: DrawingDoc, area: ExportArea, viewRect: Rect, selection: Rect | null): Rect {
  if (area === 'artboard' && doc.artboard) {
    const a = doc.artboard;
    return { x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h };
  }
  if (area === 'page' && doc.page) return pageRect(doc.page);
  if (area === 'view') return viewRect;
  if (area === 'selection' && selection) {
    const pad = 16;
    return { x0: selection.x0 - pad, y0: selection.y0 - pad, x1: selection.x1 + pad, y1: selection.y1 + pad };
  }
  const b = contentBounds(doc);
  if (!b) return doc.artboard ? { x0: 0, y0: 0, x1: doc.artboard.w, y1: doc.artboard.h } : viewRect;
  const pad = Math.max(24, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.04);
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}

/** Clamp the export scale so the bitmap stays within device canvas limits. */
export function clampScale(r: Rect, scale: number): number {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  let s = scale;
  if (w * s > MAX_SIDE) s = MAX_SIDE / w;
  if (h * s > MAX_SIDE) s = Math.min(s, MAX_SIDE / h);
  if (w * h * s * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));
  return s;
}

export interface RasterOpts {
  scale: number;
  transparent: boolean;
  grid: boolean;
  onlyIds?: Set<string>;
}

export function regionMatrix(r: Rect, s: number): Mat {
  return [s, 0, 0, s, -r.x0 * s, -r.y0 * s];
}

/** Ensure all embedded images are decoded before rasterising. */
export async function preloadImages(doc: DrawingDoc) {
  const srcs = new Set<string>();
  for (const l of doc.layers) for (const it of l.items) if (it.kind === 'image') srcs.add(it.src);
  await Promise.all([...srcs].map((src) => new Promise<void>((res) => {
    const img = getImage(src);
    if (img) return res();
    const i2 = new Image();
    i2.onload = () => res();
    i2.onerror = () => res();
    i2.src = src;
  })));
  for (const s of srcs) getImage(s);
}

function filterLayer(l: Layer, only?: Set<string>): Layer {
  return only ? { ...l, items: l.items.filter((i) => only.has(i.id)) } : l;
}

export function renderLayerToCanvas(doc: DrawingDoc, l: Layer, r: Rect, s: number, only?: Set<string>): HTMLCanvasElement {
  const W = Math.max(1, Math.round((r.x1 - r.x0) * s)), H = Math.max(1, Math.round((r.y1 - r.y0) * s));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  renderLayerItems(c.getContext('2d')!, filterLayer(l, only), regionMatrix(r, s), r);
  void doc;
  return c;
}

export function renderRegion(doc: DrawingDoc, r: Rect, o: RasterOpts): HTMLCanvasElement {
  const s = o.scale;
  const W = Math.max(1, Math.round((r.x1 - r.x0) * s)), H = Math.max(1, Math.round((r.y1 - r.y0) * s));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const m = regionMatrix(r, s);
  if (!o.transparent || o.grid) {
    const docForBg = { ...doc, artboard: null } as DrawingDoc;
    drawBackground(ctx, docForBg, m, W, H, 1, { transparent: o.transparent, grid: o.grid });
  }
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d')!;
  for (const l of doc.layers) {
    if (!l.visible) continue;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, W, H);
    renderLayerItems(tctx, filterLayer(l, o.onlyIds), m, r);
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : (l.blend as GlobalCompositeOperation);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, quality));
}

export function thumbnail(doc: DrawingDoc, size = 360): string {
  let r: Rect | null = doc.artboard ? { x0: doc.artboard.x, y0: doc.artboard.y, x1: doc.artboard.x + doc.artboard.w, y1: doc.artboard.y + doc.artboard.h } : contentBounds(doc);
  if (!r) r = { x0: 0, y0: 0, x1: 400, y1: 300 };
  if (!doc.artboard) {
    const pad = Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.08 + 8;
    r = { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad };
  }
  const s = size / Math.max(r.x1 - r.x0, r.y1 - r.y0);
  const c = renderRegion(doc, r, { scale: s, transparent: false, grid: false });
  return c.toDataURL('image/jpeg', 0.8);
}

export { itemsBounds };
