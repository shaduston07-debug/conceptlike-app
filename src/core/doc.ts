import type { DrawingDoc, Layer, Artboard } from './types';
import { uid } from './geom';

export const DOC_VERSION = 1;

export function newLayer(name: string): Layer {
  return { id: uid('L'), name, visible: true, locked: false, opacity: 1, blend: 'normal', items: [] };
}

export interface NewDocOptions {
  name?: string;
  artboard?: { w: number; h: number; name: string } | null;
  paper?: DrawingDoc['background']['paper'];
  bg?: string;
  project?: string;
}

export function createDoc(opts: NewDocOptions = {}): DrawingDoc {
  const l1 = newLayer('Layer 1');
  const now = Date.now();
  const artboard: Artboard | null = opts.artboard
    ? { x: 0, y: 0, w: opts.artboard.w, h: opts.artboard.h, name: opts.artboard.name }
    : null;
  return {
    id: uid('D'),
    version: DOC_VERSION,
    name: opts.name || 'Untitled',
    project: opts.project || '',
    created: now,
    modified: now,
    layers: [l1],
    activeLayer: l1.id,
    background: {
      color: opts.bg || '#ffffff',
      paper: opts.paper || 'dots',
      gridSize: 40,
      gridColor: '#7a8699',
      gridOpacity: 0.45,
      exportGrid: false,
    },
    perspective: { mode: 'none', vps: [], horizon: 0, density: 36, visible: true },
    measure: { unit: 'mm', perWorld: 0.2645833, precision: 1 },
    artboard,
    view: { m: [1, 0, 0, 1, 0, 0] },
    guide: null,
  };
}

/** Upgrade/repair a document loaded from storage. */
export function normalizeDoc(d: any): DrawingDoc {
  const base = createDoc();
  const doc: DrawingDoc = { ...base, ...d };
  doc.background = { ...base.background, ...(d.background || {}) };
  doc.perspective = { ...base.perspective, ...(d.perspective || {}) };
  doc.measure = { ...base.measure, ...(d.measure || {}) };
  doc.view = d.view && Array.isArray(d.view.m) ? d.view : base.view;
  if (!Array.isArray(doc.layers) || !doc.layers.length) doc.layers = base.layers;
  doc.layers = doc.layers.map((l: any) => ({ ...newLayer(l.name || 'Layer'), ...l, items: Array.isArray(l.items) ? l.items : [] }));
  if (!doc.layers.find((l) => l.id === doc.activeLayer)) doc.activeLayer = doc.layers[doc.layers.length - 1].id;
  doc.version = DOC_VERSION;
  return doc;
}

export const ARTBOARD_PRESETS: { name: string; w: number; h: number }[] = [
  { name: 'Square', w: 2048, h: 2048 },
  { name: 'Screen 16:9', w: 1920, h: 1080 },
  { name: '4K 16:9', w: 3840, h: 2160 },
  { name: 'iPad', w: 2732, h: 2048 },
  { name: 'Phone', w: 1170, h: 2532 },
  { name: 'A4 Portrait', w: 2480, h: 3508 },
  { name: 'A4 Landscape', w: 3508, h: 2480 },
  { name: 'A3 Landscape', w: 4961, h: 3508 },
  { name: 'Letter', w: 2550, h: 3300 },
  { name: 'Tabloid', w: 3300, h: 5100 },
  { name: 'Instagram', w: 1080, h: 1350 },
  { name: 'Storyboard 2.39', w: 2390, h: 1000 },
];
