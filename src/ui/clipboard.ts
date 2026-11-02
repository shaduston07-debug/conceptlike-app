import type { Editor } from '../core/editor';
import type { Item } from '../core/types';
import { cloneItem, itemsBounds, transformItem } from '../core/items';
import { translate, apply, inv } from '../core/geom';

const KEY = 'draftwell.clipboard';
let mem: Item[] = [];

export function copySelection(ed: Editor) {
  const sel = ed.selectedItems;
  if (!sel.length) return false;
  mem = sel.map((i) => ({ ...i }));
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {}
  return true;
}

export function cutSelection(ed: Editor) {
  if (!copySelection(ed)) return false;
  ed.deleteItems([...ed.selection], 'Cut');
  return true;
}

export function hasClipboard() {
  if (mem.length) return true;
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function paste(ed: Editor, viewW: number, viewH: number) {
  let items = mem;
  if (!items.length) {
    try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { items = []; }
  }
  if (!items.length) return false;
  const layer = ed.activeLayer;
  if (layer.locked || !layer.visible) return false;
  const b = itemsBounds(items);
  const c = apply(inv(ed.doc.view.m), viewW / 2, viewH / 2);
  const vb = { x0: apply(inv(ed.doc.view.m), 0, 0), x1: apply(inv(ed.doc.view.m), viewW, viewH) };
  // paste in place if visible, otherwise centre in view
  const visible = b.x0 < Math.max(vb.x0.x, vb.x1.x) && b.x1 > Math.min(vb.x0.x, vb.x1.x) && b.y0 < Math.max(vb.x0.y, vb.x1.y) && b.y1 > Math.min(vb.x0.y, vb.x1.y);
  const t = visible ? translate(20, 20) : translate(c.x - (b.x0 + b.x1) / 2, c.y - (b.y0 + b.y1) / 2);
  const placed = items.map((i) => transformItem(cloneItem(i), t));
  ed.addItems(placed, layer.id, 'Paste');
  ed.setTool('select');
  ed.setSelection(placed.map((i) => i.id));
  return true;
}
