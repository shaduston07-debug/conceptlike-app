import type { DrawingDoc, Item, StrokeItem } from '../core/types';
import type { Rect } from '../core/geom';
import { strokeOutline, type OutlineGroup } from '../core/stroke';
import { BRUSHES } from '../core/brushes';
import { textMetrics } from '../core/items';
import { rectsOverlap } from '../core/geom';
import { itemBounds } from '../core/items';

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function groupD(g: OutlineGroup): string {
  const parts: string[] = [];
  const c = g.circles;
  for (let i = 0; i < c.length; i += 3) {
    const x = c[i], y = c[i + 1], r = c[i + 2];
    parts.push(`M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(y)}Z`);
  }
  const q = g.quads;
  for (let i = 0; i < q.length; i += 8) parts.push(`M${f(q[i])} ${f(q[i + 1])}L${f(q[i + 2])} ${f(q[i + 3])}L${f(q[i + 4])} ${f(q[i + 5])}L${f(q[i + 6])} ${f(q[i + 7])}Z`);
  for (const poly of g.polys) parts.push('M' + poly.map((v, i) => (i && i % 2 === 0 ? 'L' : i ? ' ' : '') + f(v)).join('') + 'Z');
  return parts.join('');
}

function strokeSVG(it: StrokeItem, defs: string[]): string {
  const def = BRUSHES[it.brush];
  const ol = strokeOutline(it);
  if (def.style === 'softErase') return '';
  const out: string[] = [];
  let filter = '';
  if (def.style === 'air' || def.style === 'water') {
    const id = 'b' + it.id;
    defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(it.size * (def.style === 'air' ? 0.21 : 0.06))}"/></filter>`);
    filter = ` filter="url(#${id})"`;
  }
  const blend = def.multiply || def.style === 'marker' || def.style === 'water' ? ' style="mix-blend-mode:multiply"' : '';
  for (const g of ol.groups) {
    const op = it.opacity * g.alpha;
    out.push(`<path d="${groupD(g)}" fill="${it.color}"${op < 1 ? ` fill-opacity="${f(op)}"` : ''}${filter}${blend}/>`);
  }
  return out.join('');
}

function itemSVG(it: Item, defs: string[]): string {
  switch (it.kind) {
    case 'stroke':
      return strokeSVG(it, defs);
    case 'fill': {
      const d = it.polys.map((p) => 'M' + p.reduce((s, v, i) => s + (i % 2 ? ' ' : i ? 'L' : '') + f(v), '') + 'Z').join('');
      return `<path d="${d}" fill="${it.color}" fill-rule="evenodd"${it.opacity < 1 ? ` fill-opacity="${f(it.opacity)}"` : ''}/>`;
    }
    case 'image':
      return `<image href="${it.src}" width="${f(it.w)}" height="${f(it.h)}" transform="matrix(${it.m.map(f).join(' ')})"${it.opacity < 1 ? ` opacity="${f(it.opacity)}"` : ''} preserveAspectRatio="none"/>`;
    case 'text': {
      const tm = textMetrics(it);
      const anchor = it.align === 'center' ? 'middle' : it.align === 'right' ? 'end' : 'start';
      const x = it.align === 'center' ? tm.w / 2 : it.align === 'right' ? tm.w : 0;
      const spans = tm.lines.map((l, i) => `<tspan x="${f(x)}" y="${f(i * tm.lineH + it.size * 0.98)}">${esc(l)}</tspan>`).join('');
      return `<text transform="matrix(${it.m.map(f).join(' ')})" font-family="${esc(it.font)}" font-size="${f(it.size)}" font-weight="${it.weight}"${it.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" fill="${it.color}"${it.opacity < 1 ? ` fill-opacity="${f(it.opacity)}"` : ''} xml:space="preserve">${spans}</text>`;
    }
  }
}

export function exportSVG(doc: DrawingDoc, r: Rect, opts: { transparent: boolean; onlyIds?: Set<string> }): string {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const defs: string[] = [];
  const body: string[] = [];
  if (!opts.transparent) body.push(`<rect x="${f(r.x0)}" y="${f(r.y0)}" width="${f(w)}" height="${f(h)}" fill="${doc.background.color}"/>`);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const items = l.items.filter((it) => (!opts.onlyIds || opts.onlyIds.has(it.id)) && rectsOverlap(itemBounds(it), r));
    if (!items.length) continue;
    const style = l.blend !== 'normal' ? ` style="mix-blend-mode:${l.blend}"` : '';
    body.push(`<g id="${esc(l.name.replace(/\s+/g, '_'))}" inkscape:groupmode="layer" inkscape:label="${esc(l.name)}"${l.opacity < 1 ? ` opacity="${f(l.opacity)}"` : ''}${style}>`);
    for (const it of items) body.push(itemSVG(it, defs));
    body.push('</g>');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(w)}" height="${f(h)}" viewBox="${f(r.x0)} ${f(r.y0)} ${f(w)} ${f(h)}">
<title>${esc(doc.name)}</title>
<defs>${defs.join('')}</defs>
${body.join('\n')}
</svg>`;
}
