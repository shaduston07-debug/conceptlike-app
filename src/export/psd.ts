import type { DrawingDoc, BlendMode } from '../core/types';
import type { Rect } from '../core/geom';
import { Bytes } from './bytes';
import { renderLayerToCanvas, renderRegion } from './raster';

const BLEND_KEYS: Record<BlendMode, string> = {
  normal: 'norm', multiply: 'mul ', screen: 'scrn', overlay: 'over', darken: 'dark', lighten: 'lite',
  'color-dodge': 'div ', 'color-burn': 'idiv', 'hard-light': 'hLit', 'soft-light': 'sLit', difference: 'diff',
  exclusion: 'smud', hue: 'hue ', saturation: 'sat ', color: 'colr', luminosity: 'lum ',
};

/** PackBits encode a single row. */
function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const n = row.length;
  while (i < n) {
    // run?
    let run = 1;
    while (i + run < n && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) {
      out.push(257 - run, row[i]);
      i += run;
      continue;
    }
    // literal
    const start = i;
    let lit = 0;
    while (i < n && lit < 128) {
      if (i + 2 < n && row[i] === row[i + 1] && row[i] === row[i + 2]) break;
      i++;
      lit++;
    }
    out.push(lit - 1);
    for (let k = start; k < start + lit; k++) out.push(row[k]);
  }
  return Uint8Array.from(out);
}

/** Encode a channel (w*h bytes) with RLE; returns [byteCounts..., data...] block (without compression marker). */
function rleChannel(ch: Uint8Array, w: number, h: number): { counts: number[]; data: Uint8Array[] } {
  const counts: number[] = [];
  const data: Uint8Array[] = [];
  for (let y = 0; y < h; y++) {
    const p = packBits(ch.subarray(y * w, y * w + w));
    counts.push(p.length);
    data.push(p);
  }
  return { counts, data };
}

function channelsOf(c: HTMLCanvasElement, x0: number, y0: number, w: number, h: number): Uint8Array[] {
  const d = c.getContext('2d')!.getImageData(x0, y0, w, h).data;
  const n = w * h;
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n), A = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3];
    A[i] = a;
    // canvas data is un-premultiplied already
    R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2];
  }
  return [A, R, G, B];
}

function alphaBounds(c: HTMLCanvasElement): { x0: number; y0: number; x1: number; y1: number } | null {
  const w = c.width, h = c.height;
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function exportPSD(doc: DrawingDoc, r: Rect, scale: number, transparent: boolean): Uint8Array {
  const merged = renderRegion(doc, r, { scale, transparent, grid: false });
  const W = merged.width, H = merged.height;
  const b = new Bytes();
  // header
  b.ascii('8BPS');
  b.u16(1);
  for (let i = 0; i < 6; i++) b.u8(0);
  b.u16(3);
  b.u32(H);
  b.u32(W);
  b.u16(8);
  b.u16(3);
  b.u32(0); // color mode data
  b.u32(0); // image resources

  // layers: include a background layer (paper) unless transparent
  interface L { name: string; opacity: number; visible: boolean; blend: BlendMode; canvas: HTMLCanvasElement }
  const layers: L[] = [];
  if (!transparent) {
    const bgc = document.createElement('canvas');
    bgc.width = W; bgc.height = H;
    const ctx = bgc.getContext('2d')!;
    ctx.fillStyle = doc.background.color;
    ctx.fillRect(0, 0, W, H);
    layers.push({ name: 'Paper', opacity: 1, visible: true, blend: 'normal', canvas: bgc });
  }
  for (const l of doc.layers) layers.push({ name: l.name, opacity: l.opacity, visible: l.visible, blend: l.blend, canvas: renderLayerToCanvas(doc, l, r, scale) });

  const lmi = b.lengthSlot(); // layer & mask info
  const lstart = b.len;
  const li = b.lengthSlot(); // layer info
  const listart = b.len;
  b.i16(layers.length);
  const encoded: { bounds: { x0: number; y0: number; x1: number; y1: number }; chans: { counts: number[]; data: Uint8Array[] }[] }[] = [];
  for (const l of layers) {
    const bb = alphaBounds(l.canvas) || { x0: 0, y0: 0, x1: 0, y1: 0 };
    const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
    const chans = w > 0 && h > 0 ? channelsOf(l.canvas, bb.x0, bb.y0, w, h).map((c) => rleChannel(c, w, h)) : [0, 1, 2, 3].map(() => ({ counts: [], data: [] }));
    encoded.push({ bounds: bb, chans });
    b.i32(bb.y0); b.i32(bb.x0); b.i32(bb.y1); b.i32(bb.x1);
    b.u16(4);
    const ids = [-1, 0, 1, 2];
    chans.forEach((c, k) => {
      b.i16(ids[k]);
      const len = 2 + c.counts.length * 2 + c.data.reduce((s, d) => s + d.length, 0);
      b.u32(len);
    });
    b.ascii('8BIM');
    b.ascii(BLEND_KEYS[l.blend] || 'norm');
    b.u8(Math.round(l.opacity * 255));
    b.u8(0);
    b.u8(l.visible ? 0 : 2);
    b.u8(0);
    const extra = b.lengthSlot();
    const es = b.len;
    b.u32(0); // mask
    b.u32(0); // blending ranges
    const ascii = l.name.replace(/[^\x20-\x7e]/g, '_').slice(0, 255);
    b.u8(ascii.length);
    b.ascii(ascii);
    b.pad(4, es + 8);
    // unicode name
    b.ascii('8BIM');
    b.ascii('luni');
    const lu = b.lengthSlot();
    b.u32(l.name.length);
    for (let i = 0; i < l.name.length; i++) b.u16(l.name.charCodeAt(i));
    b.pad(4, es);
    lu();
    extra();
  }
  for (const e of encoded) {
    for (const c of e.chans) {
      b.u16(1);
      for (const n of c.counts) b.u16(n);
      for (const d of c.data) b.bytes(d);
    }
  }
  b.pad(2, listart);
  li();
  b.u32(0); // global layer mask info
  void lstart;
  lmi();

  // merged image (RLE)
  b.u16(1);
  const [, R, G, B] = channelsOf(merged, 0, 0, W, H);
  // flatten onto white where transparent so viewers without layer support look right
  const md = merged.getContext('2d')!.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) {
    const a = md[i * 4 + 3] / 255;
    R[i] = Math.round(R[i] * a + 255 * (1 - a));
    G[i] = Math.round(G[i] * a + 255 * (1 - a));
    B[i] = Math.round(B[i] * a + 255 * (1 - a));
  }
  const enc = [R, G, B].map((c) => rleChannel(c, W, H));
  for (const c of enc) for (const n of c.counts) b.u16(n);
  for (const c of enc) for (const d of c.data) b.bytes(d);
  return b.result();
}
