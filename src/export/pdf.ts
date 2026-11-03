import type { DrawingDoc, Item } from '../core/types';
import type { Rect } from '../core/geom';
import { strokeOutline } from '../core/stroke';
import { BRUSHES } from '../core/brushes';
import { textMetrics, itemBounds } from '../core/items';
import { hexToRgb } from '../render/color';
import { rectsOverlap } from '../core/geom';
import { renderRegion, canvasToBlob } from './raster';
import { getImage } from '../render/draw';

const enc = new TextEncoder();
const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

interface PdfImage { w: number; h: number; jpeg: Uint8Array; alpha: Uint8Array | null }

class PdfWriter {
  private objs: (Uint8Array | null)[] = [];
  alloc(): number { this.objs.push(null); return this.objs.length; }
  set(id: number, body: string | Uint8Array) {
    this.objs[id - 1] = typeof body === 'string' ? enc.encode(body) : body;
  }
  stream(id: number, dict: string, data: Uint8Array) {
    const head = enc.encode(`<< ${dict} /Length ${data.length} >>\nstream\n`);
    const tail = enc.encode('\nendstream');
    const out = new Uint8Array(head.length + data.length + tail.length);
    out.set(head); out.set(data, head.length); out.set(tail, head.length + data.length);
    this.objs[id - 1] = out;
  }
  build(rootId: number): Uint8Array {
    const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    let off = parts[0].length;
    const offsets: number[] = [];
    this.objs.forEach((o, i) => {
      offsets.push(off);
      const head = enc.encode(`${i + 1} 0 obj\n`);
      const tail = enc.encode('\nendobj\n');
      parts.push(head, o || enc.encode('null'), tail);
      off += head.length + (o ? o.length : 4) + tail.length;
    });
    let xref = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
    xref += `trailer\n<< /Size ${this.objs.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
    parts.push(enc.encode(xref));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let k = 0;
    for (const p of parts) { out.set(p, k); k += p.length; }
    return out;
  }
}

async function imageToPdfImage(src: string): Promise<PdfImage | null> {
  const img = getImage(src) || (await new Promise<HTMLImageElement | null>((res) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
  }));
  if (!img) return null;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
  // colour (composited on white so JPEG has no garbage in transparent areas)
  const cc = document.createElement('canvas');
  cc.width = w; cc.height = h;
  const cctx = cc.getContext('2d')!;
  cctx.fillStyle = '#fff';
  cctx.fillRect(0, 0, w, h);
  cctx.drawImage(img, 0, 0);
  const jpeg = new Uint8Array(await (await canvasToBlob(cc, 'image/jpeg', 0.92)).arrayBuffer());
  let alpha: Uint8Array | null = null;
  if (hasAlpha) {
    const ac = document.createElement('canvas');
    ac.width = w; ac.height = h;
    const actx = ac.getContext('2d')!;
    const ad = actx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      ad.data[i * 4] = ad.data[i * 4 + 1] = ad.data[i * 4 + 2] = d[i * 4 + 3];
      ad.data[i * 4 + 3] = 255;
    }
    actx.putImageData(ad, 0, 0);
    alpha = new Uint8Array(await (await canvasToBlob(ac, 'image/jpeg', 0.95)).arrayBuffer());
  }
  return { w, h, jpeg, alpha };
}

const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/**
 * Vector PDF: strokes, fills and text become PDF paths; images are embedded as JPEG (with soft mask).
 * Airbrush/soft effects are approximated with transparency. When `raster` is true the page is a single
 * high resolution image instead (pixel-identical to the canvas).
 */
export async function exportPDF(doc: DrawingDoc, r: Rect, opts: { transparent: boolean; raster: boolean; scale: number; pageMM?: { w: number; h: number } }): Promise<Uint8Array> {
  const W = r.x1 - r.x0, H = r.y1 - r.y0;
  // 96 dpi -> 72 dpi, or exact paper size when printing to a page frame
  const pt = opts.pageMM ? (opts.pageMM.w * 72) / 25.4 / W : 0.75;
  const pw = W * pt, ph = H * pt;
  const pdf = new PdfWriter();
  const catalog = pdf.alloc(), pages = pdf.alloc(), page = pdf.alloc(), content = pdf.alloc(), font = pdf.alloc();
  const gstates = new Map<string, number>();
  const xobjects: string[] = [];
  const ops: string[] = [];
  // map world -> pdf user space
  ops.push(`${n(pt)} 0 0 ${n(-pt)} ${n(-r.x0 * pt)} ${n(r.y1 * pt)} cm`);
  const gs = (alpha: number, blend = 'Normal') => {
    const key = `${n(alpha)}_${blend}`;
    if (!gstates.has(key)) {
      const id = pdf.alloc();
      pdf.set(id, `<< /Type /ExtGState /ca ${n(alpha)} /CA ${n(alpha)} /BM /${blend} >>`);
      gstates.set(key, id);
    }
    return `/GS${gstates.get(key)} gs`;
  };
  const rgb = (hex: string) => hexToRgb(hex).map((v) => n(v / 255)).join(' ');

  if (opts.raster) {
    const c = renderRegion(doc, r, { scale: opts.scale, transparent: false, grid: doc.background.exportGrid });
    const jpeg = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
    const id = pdf.alloc();
    pdf.stream(id, `/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpeg);
    xobjects.push(`/Im${id} ${id} 0 R`);
    ops.push(`q ${n(W)} 0 0 ${n(-H)} ${n(r.x0)} ${n(r.y1)} cm /Im${id} Do Q`);
  } else {
    if (!opts.transparent) ops.push(`q ${rgb(doc.background.color)} rg ${n(r.x0)} ${n(r.y0)} ${n(W)} ${n(H)} re f Q`);
    for (const l of doc.layers) {
      if (!l.visible) continue;
      for (const it of l.items) {
        if (!rectsOverlap(itemBounds(it), r)) continue;
        await itemOps(it, l.opacity, ops, gs, rgb, pdf, xobjects);
      }
    }
  }
  pdf.stream(content, '', enc.encode(ops.join('\n')));
  pdf.set(font, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const gsDict = [...gstates.values()].map((id) => `/GS${id} ${id} 0 R`).join(' ');
  pdf.set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(pw)} ${n(ph)}] /Contents ${content} 0 R /Resources << /ExtGState << ${gsDict} >> /XObject << ${xobjects.join(' ')} >> /Font << /F1 ${font} 0 R >> >> >>`);
  pdf.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  return pdf.build(catalog);
}

async function itemOps(
  it: Item, layerOpacity: number, ops: string[], gs: (a: number, b?: string) => string, rgb: (h: string) => string,
  pdf: PdfWriter, xobjects: string[],
) {
  switch (it.kind) {
    case 'stroke': {
      const def = BRUSHES[it.brush];
      if (def.style === 'softErase') return;
      const ol = strokeOutline(it);
      const blend = def.multiply || def.style === 'marker' || def.style === 'water' ? 'Multiply' : 'Normal';
      const soft = def.style === 'air' ? 0.55 : def.style === 'water' ? 0.8 : 1;
      for (const g of ol.groups) {
        const a = it.opacity * layerOpacity * soft * g.alpha;
        const path: string[] = [];
        const c = g.circles;
        const K = 0.5522847498;
        for (let i = 0; i < c.length; i += 3) {
          const x = c[i], y = c[i + 1], R = c[i + 2], k = R * K;
          path.push(`${n(x + R)} ${n(y)} m ${n(x + R)} ${n(y + k)} ${n(x + k)} ${n(y + R)} ${n(x)} ${n(y + R)} c ${n(x - k)} ${n(y + R)} ${n(x - R)} ${n(y + k)} ${n(x - R)} ${n(y)} c ${n(x - R)} ${n(y - k)} ${n(x - k)} ${n(y - R)} ${n(x)} ${n(y - R)} c ${n(x + k)} ${n(y - R)} ${n(x + R)} ${n(y - k)} ${n(x + R)} ${n(y)} c h`);
        }
        const q = g.quads;
        for (let i = 0; i < q.length; i += 8) path.push(`${n(q[i])} ${n(q[i + 1])} m ${n(q[i + 2])} ${n(q[i + 3])} l ${n(q[i + 4])} ${n(q[i + 5])} l ${n(q[i + 6])} ${n(q[i + 7])} l h`);
        for (const poly of g.polys) {
          let ps = `${n(poly[0])} ${n(poly[1])} m`;
          for (let i = 2; i < poly.length; i += 2) ps += ` ${n(poly[i])} ${n(poly[i + 1])} l`;
          path.push(ps + ' h');
        }
        ops.push(`q ${gs(a, blend)} ${rgb(it.color)} rg ${path.join(' ')} f Q`);
      }
      return;
    }
    case 'fill': {
      const path = it.polys.map((p) => {
        let s = `${n(p[0])} ${n(p[1])} m`;
        for (let i = 2; i < p.length; i += 2) s += ` ${n(p[i])} ${n(p[i + 1])} l`;
        return s + ' h';
      }).join(' ');
      ops.push(`q ${gs(it.opacity * layerOpacity)} ${rgb(it.color)} rg ${path} f* Q`);
      return;
    }
    case 'image': {
      const im = await imageToPdfImage(it.src);
      if (!im) return;
      const id = pdf.alloc();
      let smask = '';
      if (im.alpha) {
        const sid = pdf.alloc();
        pdf.stream(sid, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode`, im.alpha);
        smask = ` /SMask ${sid} 0 R`;
      }
      pdf.stream(id, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode${smask}`, im.jpeg);
      xobjects.push(`/Im${id} ${id} 0 R`);
      const m = it.m;
      // image space: unit square, flipped (PDF images draw bottom-up)
      ops.push(`q ${gs(it.opacity * layerOpacity)} ${m.map(n).join(' ')} cm ${n(it.w)} 0 0 ${n(-it.h)} 0 ${n(it.h)} cm /Im${id} Do Q`);
      return;
    }
    case 'text': {
      const tm = textMetrics(it);
      const m = it.m;
      const lines = tm.lines.map((l, i) => {
        let x = 0;
        if (it.align === 'center') x = (tm.w - tm.widths[i]) / 2;
        else if (it.align === 'right') x = tm.w - tm.widths[i];
        const y = i * tm.lineH + it.size * 0.98;
        return `BT /F1 ${n(it.size)} Tf 1 0 0 -1 ${n(x)} ${n(y)} Tm (${latin1(l)}) Tj ET`;
      });
      ops.push(`q ${gs(it.opacity * layerOpacity)} ${m.map(n).join(' ')} cm ${rgb(it.color)} rg ${lines.join(' ')} Q`);
      return;
    }
  }
}
