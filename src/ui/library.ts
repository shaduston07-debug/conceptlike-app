import type { Item, StrokeItem, ShapeMeta } from '../core/types';
import { shapePoints } from '../core/shapes';
import { uid, translate, scale, mul } from '../core/geom';
import { itemsBounds, transformItem, cloneItem } from '../core/items';
import { renderLayerItems } from '../render/renderer';
import type { LibraryEntry } from '../storage/docs';

const INK = '#1d1f24';

function shapeStroke(sh: ShapeMeta, size = 3, color = INK): StrokeItem {
  return { kind: 'stroke', id: uid('i'), brush: 'pen', color, opacity: 1, size, pts: shapePoints(sh, 0.8, 1.5), seed: 1, shape: sh };
}
const line = (x0: number, y0: number, x1: number, y1: number, s = 3) => shapeStroke({ type: 'line', pts: [x0, y0, x1, y1] }, s);
const poly = (pts: number[], closed = true, s = 3) => shapeStroke({ type: 'polyline', pts, closed }, s);
const ell = (cx: number, cy: number, rx: number, ry: number, s = 3) => shapeStroke({ type: 'ellipse', cx, cy, rx, ry, rot: 0 }, s);
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, s = 3) => shapeStroke({ type: 'arc', cx, cy, r, a0, a1 }, s);
const bez = (pts: number[], s = 3) => shapeStroke({ type: 'bezier', pts }, s);

function star(n: number, R: number, r: number) {
  const p: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    p.push(100 + Math.cos(a) * rr, 100 + Math.sin(a) * rr);
  }
  return p;
}

export function builtinLibrary(): { name: string; items: Item[] }[] {
  const t = Math.tan(Math.PI / 6);
  return [
    { name: 'Arrow', items: [line(10, 100, 190, 100), poly([150, 70, 190, 100, 150, 130], false)] },
    { name: 'Double arrow', items: [line(10, 100, 190, 100), poly([40, 75, 10, 100, 40, 125], false), poly([160, 75, 190, 100, 160, 125], false)] },
    { name: 'Star', items: [poly(star(5, 90, 38))] },
    { name: 'Heart', items: [bez([100, 180, 30, 130, 0, 60, 50, 30]), bez([50, 30, 80, 12, 100, 40, 100, 60]), bez([100, 60, 100, 40, 120, 12, 150, 30]), bez([150, 30, 200, 60, 170, 130, 100, 180])] },
    {
      name: 'Cube', items: (() => {
        const s = 70, h = s * t;
        const c = { x: 100, y: 100 };
        const top = [c.x, c.y - s, c.x + s, c.y - s + h, c.x, c.y - s + 2 * h, c.x - s, c.y - s + h];
        return [poly(top), line(c.x - s, c.y - s + h, c.x - s, c.y + h), line(c.x + s, c.y - s + h, c.x + s, c.y + h), line(c.x, c.y - s + 2 * h, c.x, c.y + 2 * h), line(c.x - s, c.y + h, c.x, c.y + 2 * h), line(c.x + s, c.y + h, c.x, c.y + 2 * h)];
      })(),
    },
    { name: 'Cylinder', items: [ell(100, 40, 60, 20), line(40, 40, 40, 160), line(160, 40, 160, 160), arc(100, 160, 60, 0, Math.PI), ell(100, 160, 60, 20, 1.2)] },
    { name: 'Cone', items: [ell(100, 160, 60, 18), line(40, 160, 100, 20), line(160, 160, 100, 20)] },
    { name: 'Sphere', items: [ell(100, 100, 80, 80), ell(100, 100, 80, 26, 1.5)] },
    { name: 'Speech', items: [bez([30, 50, 30, 10, 170, 10, 170, 50]), bez([170, 50, 170, 100, 120, 110, 80, 105]), poly([80, 105, 45, 140, 55, 100], false), bez([55, 100, 35, 92, 30, 75, 30, 50])] },
    { name: 'Cloud', items: [arc(60, 110, 30, Math.PI / 2, Math.PI * 1.6), arc(95, 80, 38, Math.PI * 1.05, Math.PI * 1.95), arc(140, 95, 30, Math.PI * 1.35, Math.PI * 2.4), line(60, 140, 140, 125)] },
    { name: 'Figure', items: [ell(100, 32, 18, 18), line(100, 50, 100, 120), line(100, 70, 65, 100), line(100, 70, 135, 100), line(100, 120, 75, 180), line(100, 120, 125, 180)] },
    { name: 'Tree', items: [line(92, 190, 95, 120), line(108, 190, 105, 120), arc(100, 80, 55, Math.PI * 0.75, Math.PI * 2.25), line(61, 119, 139, 119)] },
    { name: 'Door swing', items: [line(20, 180, 180, 180, 4), line(20, 180, 20, 20, 2), arc(20, 180, 160, -Math.PI / 2, 0, 1)] },
    { name: 'Window', items: [poly([20, 70, 180, 70, 180, 130, 20, 130]), line(20, 100, 180, 100, 1.5)] },
    { name: 'North', items: [ell(100, 100, 70, 70, 2), poly([100, 30, 120, 110, 100, 95, 80, 110]), line(100, 170, 100, 110, 1.5)] },
    { name: 'Scale bar', items: [line(10, 100, 190, 100), line(10, 85, 10, 115), line(55, 92, 55, 108), line(100, 88, 100, 112), line(145, 92, 145, 108), line(190, 85, 190, 115)] },
  ];
}

export function normalizeItems(items: Item[]): { items: Item[]; w: number; h: number } {
  const b = itemsBounds(items);
  const t = translate(-b.x0, -b.y0);
  return { items: items.map((i) => transformItem(cloneItem(i), t)), w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

export function libraryThumb(items: Item[], size = 160): string {
  const b = itemsBounds(items);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const w = b.x1 - b.x0 || 1, h = b.y1 - b.y0 || 1;
  const s = (size * 0.84) / Math.max(w, h);
  const ox = (size - w * s) / 2 - b.x0 * s, oy = (size - h * s) / 2 - b.y0 * s;
  renderLayerItems(ctx, { id: '', name: '', visible: true, locked: false, opacity: 1, blend: 'normal', items }, [s, 0, 0, s, ox, oy], null);
  return c.toDataURL('image/png');
}

export function makeEntry(name: string, items: Item[]): LibraryEntry {
  const n = normalizeItems(items);
  return { id: uid('lib'), name, items: n.items, w: n.w, h: n.h, thumb: libraryThumb(n.items) };
}

/** Place library items centred at a world point with the given target size (world units). */
export function placeItems(items: Item[], cx: number, cy: number, target: number, keepSize: boolean): Item[] {
  const n = normalizeItems(items);
  const k = keepSize ? 1 : target / Math.max(n.w, n.h, 1);
  const m = mul(translate(cx - (n.w * k) / 2, cy - (n.h * k) / 2), scale(k));
  return n.items.map((i) => transformItem(i, m));
}
