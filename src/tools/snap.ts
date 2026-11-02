import type { Editor } from '../core/editor';
import type { P } from '../core/geom';
import type { DrawingDoc } from '../core/types';

export function angleStep(doc: DrawingDoc): number {
  return doc.background.paper === 'iso' ? Math.PI / 6 : Math.PI / 12;
}

export function gridSnapper(editor: Editor): ((x: number, y: number) => P) | undefined {
  const doc = editor.doc;
  if (!editor.settings.gridSnap) return undefined;
  const g = doc.background.gridSize;
  if (doc.background.paper === 'iso') {
    // iso lattice: vertical lines every g, rows offset
    const dy = g * Math.tan(Math.PI / 6);
    return (x, y) => {
      const ix = Math.round(x / g);
      const off = (ix & 1) ? dy : 0;
      const iy = Math.round((y - off) / (2 * dy));
      return { x: ix * g, y: iy * 2 * dy + off };
    };
  }
  return (x, y) => ({ x: Math.round(x / g) * g, y: Math.round(y / g) * g });
}

/** Directions (unit vectors) a stroke starting at `s` can follow in the current perspective setup. */
export function perspectiveDirections(doc: DrawingDoc, sx: number, sy: number): { x: number; y: number; vp: number }[] {
  const p = doc.perspective;
  const out: { x: number; y: number; vp: number }[] = [];
  p.vps.forEach((vp, i) => {
    const dx = vp.x - sx, dy = vp.y - sy;
    const L = Math.hypot(dx, dy);
    if (L > 1e-6) out.push({ x: dx / L, y: dy / L, vp: i });
  });
  // horizon direction
  let hx = 1, hy = 0;
  if (p.vps.length >= 2) {
    const a = p.vps[0], b = p.vps[1];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    hx = (b.x - a.x) / L; hy = (b.y - a.y) / L;
  }
  if (p.mode === '1pt') {
    out.push({ x: hx, y: hy, vp: -1 }, { x: -hy, y: hx, vp: -2 });
  } else if (p.mode === '2pt') {
    out.push({ x: -hy, y: hx, vp: -2 });
  }
  return out;
}
