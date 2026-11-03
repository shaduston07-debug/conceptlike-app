import type { PageFrame } from './types';
import type { Rect } from './geom';

export const PAPER_SIZES: { name: string; w: number; h: number }[] = [
  { name: 'A6', w: 105, h: 148 },
  { name: 'A5', w: 148, h: 210 },
  { name: 'A4', w: 210, h: 297 },
  { name: 'A3', w: 297, h: 420 },
  { name: 'A2', w: 420, h: 594 },
  { name: 'A1', w: 594, h: 841 },
  { name: 'A0', w: 841, h: 1189 },
  { name: 'B5', w: 176, h: 250 },
  { name: 'B4', w: 250, h: 353 },
  { name: 'Letter', w: 215.9, h: 279.4 },
  { name: 'Legal', w: 215.9, h: 355.6 },
  { name: 'Tabloid', w: 279.4, h: 431.8 },
  { name: 'Square 20cm', w: 200, h: 200 },
];

/** World units per mm at 100% (world unit = CSS px at 96 dpi). */
export const WORLD_PER_MM = 96 / 25.4;

export function pageDims(p: PageFrame): { wmm: number; hmm: number } {
  return p.landscape ? { wmm: p.hmm, hmm: p.wmm } : { wmm: p.wmm, hmm: p.hmm };
}

/** World-space rectangle the page covers. */
export function pageRect(p: PageFrame): Rect {
  const { wmm, hmm } = pageDims(p);
  const w = wmm * WORLD_PER_MM * p.scale, h = hmm * WORLD_PER_MM * p.scale;
  return { x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 };
}

/** Output pixel size at the page's dpi. */
export function pagePixels(p: PageFrame): { w: number; h: number } {
  const { wmm, hmm } = pageDims(p);
  return { w: Math.round((wmm / 25.4) * p.dpi), h: Math.round((hmm / 25.4) * p.dpi) };
}

export function defaultPage(cx: number, cy: number): PageFrame {
  return { preset: 'A4', wmm: 210, hmm: 297, landscape: false, x: cx, y: cy, scale: 1, dpi: 300, visible: true };
}

/** Scale and centre the page so the given content fits inside it with a margin. */
export function fitPageTo(p: PageFrame, r: Rect, margin = 0.06): PageFrame {
  const { wmm, hmm } = pageDims(p);
  const w0 = wmm * WORLD_PER_MM, h0 = hmm * WORLD_PER_MM;
  const cw = (r.x1 - r.x0) / (1 - margin * 2), ch = (r.y1 - r.y0) / (1 - margin * 2);
  const scale = Math.max(cw / w0, ch / h0, 1e-4);
  return { ...p, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, scale };
}

export function pageLabel(p: PageFrame): string {
  const pct = p.scale * 100;
  const s = pct >= 10 ? Math.round(pct) : +pct.toFixed(1);
  return `${p.preset} ${p.landscape ? 'Landscape' : 'Portrait'} · ${s}%`;
}
