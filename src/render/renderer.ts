import type { Editor } from '../core/editor';
import type { Item, Layer, Mat } from '../core/types';
import { mul, scale, rectsOverlap, inv, matScale, emptyRect, rectAdd, rectTransform, type Rect } from '../core/geom';
import { itemBounds } from '../core/items';
import { drawItem, setImageLoadCallback } from './draw';
import { drawBackground, visibleWorld } from './background';

export type OverlayDrawer = (ctx: CanvasRenderingContext2D, view: Mat) => void;

function mkCanvas(cls: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'layer-canvas ' + cls;
  return c;
}

export function renderLayerItems(ctx: CanvasRenderingContext2D, layer: Layer, m: Mat, world: Rect | null, hidden?: Set<string>) {
  const dc = { ctx, m };
  for (const it of layer.items) {
    if (hidden && hidden.has(it.id)) continue;
    if (world && !rectsOverlap(itemBounds(it), world)) continue;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    drawItem(dc, it);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export class Renderer {
  el: HTMLDivElement;
  private stack: HTMLDivElement;
  bg = mkCanvas('bg');
  below = mkCanvas('below');
  active = mkCanvas('active');
  above = mkCanvas('above');
  overlay = mkCanvas('overlay');
  private tmp = document.createElement('canvas');
  private backup = document.createElement('canvas');
  w = 1;
  h = 1;
  dpr = 1;
  overlayDrawers: OverlayDrawer[] = [];
  private fullPending = false;
  private overlayPending = false;
  private raf = 0;
  private lastRenderMs = 0;
  private renderedView: Mat | null = null;
  private deferTimer = 0;
  private liveBox: Rect | null = null;
  private lastLiveBox: Rect | null = null;
  private prev: { layers: Layer[]; active: string; bg: unknown; persp: unknown; art: unknown } | null = null;
  private liveActive = false;
  private singleBuffer = false;
  private ro: ResizeObserver;

  constructor(private editor: Editor, host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'canvas-host';
    this.stack = document.createElement('div');
    this.stack.className = 'canvas-stack';
    this.stack.append(this.bg, this.below, this.active, this.above);
    this.el.append(this.stack, this.overlay);
    host.append(this.el);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();
    editor.on('doc', () => {
      this.markDocChanged();
      if (this.tryAppendFast()) {
        this.renderedDocVersion = this.docVersion;
        this.requestOverlay();
      } else this.requestFull();
    });
    editor.on(['view', 'settings'], () => this.requestFull());
    editor.on(['overlay', 'ui'], () => this.requestOverlay());
    setImageLoadCallback(() => this.requestFull());
  }

  destroy() {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    // keep total buffer memory reasonable on very large displays
    while (w * h * dpr * dpr > 7.5e6 && dpr > 1) dpr -= 0.25;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    for (const c of [this.bg, this.below, this.active, this.above, this.overlay, this.tmp, this.backup]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    this.renderFull();
    this.renderOverlay();
  }

  get view(): Mat { return this.editor.doc.view.m; }
  get deviceM(): Mat { return mul(scale(this.dpr), this.view); }
  get zoom(): number { return matScale(this.view); }

  requestFull() {
    this.fullPending = true;
    this.overlayPending = true;
    this.schedule();
  }
  requestOverlay() {
    this.overlayPending = true;
    this.schedule();
  }
  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.fullPending) {
        this.fullPending = false;
        this.renderFullOrDefer();
      }
      if (this.overlayPending) {
        this.overlayPending = false;
        this.renderOverlay();
      }
    });
  }

  /** If full renders are slow, show a CSS-transformed version of the last render while the view changes. */
  private renderFullOrDefer() {
    const v = this.view;
    const rv = this.renderedView;
    const viewOnly = rv && !this.liveActive && this.lastRenderMs > 14 && this.docVersion === this.renderedDocVersion;
    if (viewOnly && rv) {
      // CSS transform from rendered view to current view: screen' = V * inv(RV) * screen
      const t = mul(v, inv(rv));
      this.stack.style.transform = `matrix(${t[0]},${t[1]},${t[2]},${t[3]},${t[4]},${t[5]})`;
      clearTimeout(this.deferTimer);
      this.deferTimer = window.setTimeout(() => this.renderFull(), 120);
      return;
    }
    this.renderFull();
  }
  private docVersion = 0;
  private renderedDocVersion = -1;
  markDocChanged() { this.docVersion++; }

  renderFull() {
    const t0 = performance.now();
    clearTimeout(this.deferTimer);
    this.stack.style.transform = '';
    const doc = this.editor.doc;
    const m = this.deviceM;
    const W = this.bg.width, H = this.bg.height;
    drawBackground(this.bg.getContext('2d')!, doc, m, W, H, this.dpr);
    const world = visibleWorld(m, W, H);
    const hidden = this.editor.hidden;
    const layers = doc.layers;
    const ai = layers.findIndex((l) => l.id === doc.activeLayer);
    // Exactness fallback: blend modes above the active layer can't be represented by the 3-buffer split.
    this.singleBuffer = layers.slice(ai + 1).some((l) => l.visible && l.blend !== 'normal');
    const belowCtx = this.below.getContext('2d')!;
    const aboveCtx = this.above.getContext('2d')!;
    const activeCtx = this.active.getContext('2d')!;
    for (const c of [belowCtx, aboveCtx, activeCtx]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
    }
    const tctx = this.tmp.getContext('2d')!;
    const compose = (target: CanvasRenderingContext2D, l: Layer) => {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, W, H);
      renderLayerItems(tctx, l, m, world, hidden);
      target.save();
      target.globalAlpha = l.opacity;
      target.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : (l.blend as GlobalCompositeOperation);
      target.drawImage(this.tmp, 0, 0);
      target.restore();
    };
    layers.forEach((l, i) => {
      if (!l.visible) return;
      if (i === ai && !this.singleBuffer) {
        renderLayerItems(activeCtx, l, m, world, hidden);
      } else if (i < ai || this.singleBuffer) compose(i <= ai ? belowCtx : belowCtx, l);
      else compose(aboveCtx, l);
    });
    if (this.singleBuffer) {
      // in single buffer mode the active canvas is only used for the live stroke
      this.active.style.opacity = '1';
      this.active.style.mixBlendMode = 'normal';
    } else {
      const al = layers[ai];
      this.active.style.opacity = al && al.visible ? String(al.opacity) : '0';
      this.active.style.mixBlendMode = al ? al.blend : 'normal';
    }
    this.rememberDoc();
    this.renderedView = this.view.slice() as Mat;
    this.renderedDocVersion = this.docVersion;
    this.lastRenderMs = performance.now() - t0;
    if (this.liveActive) this.snapshotActive();
  }

  renderOverlay() {
    const ctx = this.overlay.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const d of this.overlayDrawers) {
      ctx.save();
      d(ctx, this.view);
      ctx.restore();
    }
  }

  // ---------- live stroke rendering ----------
  private snapshotActive() {
    const b = this.backup.getContext('2d')!;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, this.backup.width, this.backup.height);
    b.drawImage(this.active, 0, 0);
  }
  beginLive() {
    this.liveActive = true;
    if (this.raf) {
      // make sure we snapshot an up to date active layer
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.fullPending) { this.fullPending = false; this.renderFull(); }
      if (this.overlayPending) { this.overlayPending = false; this.renderOverlay(); }
    }
    this.snapshotActive();
    this.liveBox = null;
  }
  /** Draw in-progress items onto the active layer canvas, restoring only the dirty region. */
  updateLive(items: Item[]) {
    if (!this.liveActive) this.beginLive();
    const ctx = this.active.getContext('2d')!;
    const m = this.deviceM;
    const k = matScale(m);
    const box = emptyRect();
    for (const it of items) {
      const b = rectTransform(itemBounds(it), m);
      const pad = ('size' in it ? (it as any).size * k * 0.9 : 0) + 6;
      rectAdd(box, b.x0, b.y0, pad);
      rectAdd(box, b.x1, b.y1, pad);
    }
    let dirty = box;
    if (this.liveBox) dirty = { x0: Math.min(box.x0, this.liveBox.x0), y0: Math.min(box.y0, this.liveBox.y0), x1: Math.max(box.x1, this.liveBox.x1), y1: Math.max(box.y1, this.liveBox.y1) };
    if (!isFinite(dirty.x0)) { this.liveBox = null; return; }
    const W = this.active.width, H = this.active.height;
    const x0 = Math.max(0, Math.floor(dirty.x0)), y0 = Math.max(0, Math.floor(dirty.y0));
    const x1 = Math.min(W, Math.ceil(dirty.x1)), y1 = Math.min(H, Math.ceil(dirty.y1));
    this.liveBox = isFinite(box.x0) ? box : null;
    if (x1 <= x0 || y1 <= y0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    ctx.drawImage(this.backup, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    const dc = { ctx, m };
    for (const it of items) {
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      drawItem(dc, it);
    }
    ctx.restore();
  }
  endLive() {
    this.liveActive = false;
    this.lastLiveBox = this.liveBox;
    this.liveBox = null;
  }

  private rememberDoc() {
    const d = this.editor.doc;
    this.prev = { layers: d.layers, active: d.activeLayer, bg: d.background, persp: d.perspective, art: d.artboard };
  }

  /**
   * Fast path for the most common edit: items appended to the active layer (a finished stroke,
   * a paste, an insert). Only the new items are drawn instead of re-rendering every layer.
   */
  private tryAppendFast(): boolean {
    const d = this.editor.doc;
    const pv = this.prev;
    const liveBox = this.lastLiveBox;
    this.lastLiveBox = null;
    if (!pv || this.fullPending || this.singleBuffer || this.editor.hidden.size) return false;
    if (d.activeLayer !== pv.active || d.background !== pv.bg || d.perspective !== pv.persp || d.artboard !== pv.art) return false;
    if (d.layers.length !== pv.layers.length) return false;
    let added: Item[] | null = null;
    for (let i = 0; i < d.layers.length; i++) {
      const a = d.layers[i], b = pv.layers[i];
      if (a === b) continue;
      if (a.id !== d.activeLayer || a.id !== b.id || added) return false;
      if (a.visible !== b.visible || a.opacity !== b.opacity || a.blend !== b.blend || a.locked !== b.locked) return false;
      const n = b.items.length;
      if (a.items.length <= n) return false;
      if (n && (a.items[0] !== b.items[0] || a.items[n - 1] !== b.items[n - 1] || a.items[n >> 1] !== b.items[n >> 1])) return false;
      added = a.items.slice(n);
    }
    if (!added) return false;
    this.rememberDoc();
    const layer = d.layers.find((l) => l.id === d.activeLayer)!;
    const ctx = this.active.getContext('2d')!;
    const m = this.deviceM;
    if (liveBox) {
      // remove the live preview, then draw the final (simplified) stroke in its place
      const W = this.active.width, H = this.active.height;
      const x0 = Math.max(0, Math.floor(liveBox.x0)), y0 = Math.max(0, Math.floor(liveBox.y0));
      const x1 = Math.min(W, Math.ceil(liveBox.x1)), y1 = Math.min(H, Math.ceil(liveBox.y1));
      if (x1 > x0 && y1 > y0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
        ctx.drawImage(this.backup, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      }
    }
    if (layer.visible) {
      const dc = { ctx, m };
      for (const it of added) {
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        drawItem(dc, it);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    return true;
  }
  cancelLive() {
    if (!this.liveActive) return;
    const ctx = this.active.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.active.width, this.active.height);
    ctx.drawImage(this.backup, 0, 0);
    this.endLive();
  }

  /** Composite of everything visible (for eyedropper / flood fill). Device pixel canvas. */
  compositeCanvas(includeBg = true): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.bg.width;
    c.height = this.bg.height;
    const ctx = c.getContext('2d')!;
    if (includeBg) ctx.drawImage(this.bg, 0, 0);
    ctx.drawImage(this.below, 0, 0);
    ctx.save();
    ctx.globalAlpha = parseFloat(this.active.style.opacity || '1');
    const bm = this.active.style.mixBlendMode;
    if (bm && bm !== 'normal') ctx.globalCompositeOperation = bm as GlobalCompositeOperation;
    ctx.drawImage(this.active, 0, 0);
    ctx.restore();
    ctx.drawImage(this.above, 0, 0);
    return c;
  }
}
