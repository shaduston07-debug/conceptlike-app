import type {
  DrawingDoc, Item, Layer, ToolId, ToolPreset, EraserMode, SelectMode, SliceMode, Mat, Guide, Background,
  Perspective, Measure, Artboard, PageFrame,
} from './types';
import { newLayer } from './doc';
import { loadSettings, saveSettings, loadPresets, savePresets, type Settings } from './settings';
import { itemsBounds, transformItem, cloneItem } from './items';
import { uid, translate, type Rect } from './geom';

export interface Snapshot {
  layers: Layer[];
  activeLayer: string;
  background: Background;
  perspective: Perspective;
  measure: Measure;
  artboard: Artboard | null;
  label: string;
  time: number;
}

export type EditorEvent =
  | 'doc' // layer contents changed (re-render layers)
  | 'view' // viewport changed
  | 'overlay' // overlay (selection, guides, live stroke) changed
  | 'ui' // UI state changed (tools, panels)
  | 'history'
  | 'settings';

type Listener = () => void;

export interface TextEditState {
  id: string | null; // existing item id, or null for new text
  x: number;
  y: number;
}

export class Editor {
  doc: DrawingDoc;
  history: Snapshot[] = [];
  hIndex = 0;
  selection = new Set<string>();
  settings: Settings = loadSettings();
  presets: ToolPreset[] = loadPresets();
  activePreset = 0;
  lastDrawPreset = 0;
  tool: ToolId = 'draw';
  prevTool: ToolId = 'draw';
  eraserMode: EraserMode = 'partial';
  eraserSize = 24;
  selectMode: SelectMode = 'lasso';
  selectAllLayers = true;
  sliceMode: SliceMode = 'trim';
  nudgeSize = 60;
  fillGap = 2;
  fillAllLayers = true;
  fillColor = '#4f7cff';
  fillOpacity = 1;
  textDefaults = { font: '-apple-system, system-ui, sans-serif', size: 32, weight: 400, italic: false, align: 'left' as const };
  textEdit: TextEditState | null = null;
  pencilDetected = false;
  liveShapeId: string | null = null;
  hidden = new Set<string>(); // items temporarily hidden from layer rendering (being transformed)
  dirty = false;
  private listeners = new Map<EditorEvent, Set<Listener>>();
  private batchDepth = 0;
  private pending = new Set<EditorEvent>();

  constructor(doc: DrawingDoc) {
    this.doc = doc;
    this.history = [this.snapshot('Open')];
    this.hIndex = 0;
  }

  // ---------- events ----------
  on(ev: EditorEvent | EditorEvent[], fn: Listener): () => void {
    const evs = Array.isArray(ev) ? ev : [ev];
    for (const e of evs) {
      if (!this.listeners.has(e)) this.listeners.set(e, new Set());
      this.listeners.get(e)!.add(fn);
    }
    return () => evs.forEach((e) => this.listeners.get(e)?.delete(fn));
  }
  emit(...evs: EditorEvent[]) {
    if (this.batchDepth > 0) {
      evs.forEach((e) => this.pending.add(e));
      return;
    }
    const called = new Set<Listener>();
    for (const e of evs) this.listeners.get(e)?.forEach((fn) => {
      if (!called.has(fn)) { called.add(fn); fn(); }
    });
  }
  batch(fn: () => void) {
    this.batchDepth++;
    try { fn(); } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.pending.size) {
        const evs = [...this.pending];
        this.pending.clear();
        this.emit(...evs);
      }
    }
  }

  // ---------- history ----------
  private snapshot(label: string): Snapshot {
    const d = this.doc;
    return {
      layers: d.layers, activeLayer: d.activeLayer, background: d.background, perspective: d.perspective,
      measure: d.measure, artboard: d.artboard, label, time: Date.now(),
    };
  }
  private restore(s: Snapshot) {
    const d = this.doc;
    d.layers = s.layers;
    d.activeLayer = s.layers.find((l) => l.id === s.activeLayer) ? s.activeLayer : s.layers[s.layers.length - 1].id;
    d.background = s.background;
    d.perspective = s.perspective;
    d.measure = s.measure;
    d.artboard = s.artboard;
    // prune selection to items that still exist
    const ids = new Set<string>();
    for (const l of d.layers) for (const it of l.items) ids.add(it.id);
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }
  commit(label: string) {
    this.history.length = this.hIndex + 1;
    this.history.push(this.snapshot(label));
    this.hIndex = this.history.length - 1;
    this.doc.modified = Date.now();
    this.dirty = true;
    this.emit('doc', 'history', 'ui', 'overlay');
  }
  get canUndo() { return this.hIndex > 0; }
  get canRedo() { return this.hIndex < this.history.length - 1; }
  undo() { if (this.canUndo) this.gotoHistory(this.hIndex - 1); }
  redo() { if (this.canRedo) this.gotoHistory(this.hIndex + 1); }
  gotoHistory(i: number) {
    i = Math.max(0, Math.min(this.history.length - 1, i));
    if (i === this.hIndex) return;
    this.hIndex = i;
    this.restore(this.history[i]);
    this.doc.modified = Date.now();
    this.dirty = true;
    this.emit('doc', 'history', 'ui', 'overlay');
  }

  // ---------- settings / presets ----------
  setSettings(p: Partial<Settings>) {
    this.settings = { ...this.settings, ...p };
    saveSettings(this.settings);
    this.emit('settings', 'ui', 'overlay', 'view');
  }
  get preset(): ToolPreset { return this.presets[this.activePreset] || this.presets[0]; }
  updatePreset(p: Partial<ToolPreset>, idx = this.activePreset) {
    this.presets = this.presets.map((t, i) => (i === idx ? { ...t, ...p } : t));
    savePresets(this.presets);
    this.emit('ui', 'overlay');
  }
  setPresets(list: ToolPreset[]) {
    this.presets = list;
    if (this.activePreset >= list.length) this.activePreset = list.length - 1;
    savePresets(list);
    this.emit('ui');
  }
  addRecentColor(c: string) {
    const r = [c, ...this.settings.recentColors.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 16);
    this.setSettings({ recentColors: r });
  }
  get usePencilOnly(): boolean {
    const p = this.settings.pencilOnly;
    return p === 'on' || (p === 'auto' && this.pencilDetected);
  }

  setTool(t: ToolId) {
    if (t !== this.tool) this.prevTool = this.tool;
    if (this.tool === 'text' && t !== 'text') this.textEdit = null;
    this.tool = t;
    this.emit('ui', 'overlay');
  }
  selectPreset(i: number) {
    this.activePreset = i;
    this.lastDrawPreset = i;
    if (this.settings.autoLayerByTool) this.autoLayerFor(this.presets[i]);
    this.setTool('draw');
  }
  private autoLayerFor(p: ToolPreset) {
    const name = (p.name || p.brush).replace(/^./, (c) => c.toUpperCase());
    const l = this.doc.layers.find((x) => x.name === name);
    if (l) this.setActiveLayer(l.id);
    else this.addLayer(name);
  }

  // ---------- layers ----------
  get activeLayer(): Layer {
    return this.doc.layers.find((l) => l.id === this.doc.activeLayer) || this.doc.layers[this.doc.layers.length - 1];
  }
  layerOf(itemId: string): Layer | undefined {
    return this.doc.layers.find((l) => l.items.some((i) => i.id === itemId));
  }
  findItem(itemId: string): Item | undefined {
    for (const l of this.doc.layers) for (const i of l.items) if (i.id === itemId) return i;
  }
  setActiveLayer(id: string) {
    this.doc.activeLayer = id;
    this.emit('doc', 'ui');
  }
  private setLayers(layers: Layer[]) {
    this.doc.layers = layers;
  }
  addLayer(name?: string, above = true) {
    const l = newLayer(name || `Layer ${this.doc.layers.length + 1}`);
    const idx = this.doc.layers.findIndex((x) => x.id === this.doc.activeLayer);
    const layers = this.doc.layers.slice();
    layers.splice(above ? idx + 1 : Math.max(0, idx), 0, l);
    this.setLayers(layers);
    this.doc.activeLayer = l.id;
    this.commit('Add layer');
    return l;
  }
  updateLayer(id: string, p: Partial<Layer>, record = true) {
    this.setLayers(this.doc.layers.map((l) => (l.id === id ? { ...l, ...p } : l)));
    if (record) this.commit('Layer change');
    else this.emit('doc', 'ui');
  }
  deleteLayer(id: string) {
    if (this.doc.layers.length <= 1) {
      // keep one layer: just clear it
      this.updateLayer(id, { items: [] });
      return;
    }
    const idx = this.doc.layers.findIndex((l) => l.id === id);
    const layers = this.doc.layers.filter((l) => l.id !== id);
    this.setLayers(layers);
    if (this.doc.activeLayer === id) this.doc.activeLayer = layers[Math.max(0, idx - 1)].id;
    this.commit('Delete layer');
  }
  duplicateLayer(id: string) {
    const idx = this.doc.layers.findIndex((l) => l.id === id);
    const src = this.doc.layers[idx];
    const copy: Layer = { ...src, id: uid('L'), name: src.name + ' copy', items: src.items.map(cloneItem) };
    const layers = this.doc.layers.slice();
    layers.splice(idx + 1, 0, copy);
    this.setLayers(layers);
    this.doc.activeLayer = copy.id;
    this.commit('Duplicate layer');
  }
  mergeDown(id: string) {
    const idx = this.doc.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const top = this.doc.layers[idx], below = this.doc.layers[idx - 1];
    const items = top.items.map((it) => (top.opacity < 1 && 'opacity' in it ? { ...it, opacity: (it as any).opacity * top.opacity } : it)) as Item[];
    const merged: Layer = { ...below, items: [...below.items, ...items] };
    const layers = this.doc.layers.slice();
    layers.splice(idx - 1, 2, merged);
    this.setLayers(layers);
    this.doc.activeLayer = merged.id;
    this.commit('Merge layers');
  }
  moveLayer(id: string, toIndex: number) {
    const layers = this.doc.layers.slice();
    const from = layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [l] = layers.splice(from, 1);
    layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, l);
    this.setLayers(layers);
    this.commit('Reorder layers');
  }

  // ---------- items ----------
  /** Add items to a layer (default active). Does not commit when record=false. */
  addItems(items: Item[], layerId = this.doc.activeLayer, label = 'Draw', atBottom = false) {
    if (!items.length) return;
    const layer = this.doc.layers.find((l) => l.id === layerId) || this.activeLayer;
    this.setLayers(this.doc.layers.map((l) => (l.id === layer.id ? { ...l, items: atBottom ? [...items, ...l.items] : [...l.items, ...items] } : l)));
    this.commit(label);
  }
  /** Replace/remove items by id. map value null = delete. Additional new items can be inserted after a given id. */
  editItems(changes: Map<string, Item | Item[] | null>, label: string, record = true) {
    if (!changes.size) return;
    this.setLayers(
      this.doc.layers.map((l) => {
        let touched = false;
        const out: Item[] = [];
        for (const it of l.items) {
          if (changes.has(it.id)) {
            touched = true;
            const c = changes.get(it.id);
            if (c === null || c === undefined) continue;
            if (Array.isArray(c)) out.push(...c);
            else out.push(c);
          } else out.push(it);
        }
        return touched ? { ...l, items: out } : l;
      }),
    );
    if (record) this.commit(label);
    else this.emit('doc', 'overlay');
  }
  deleteItems(ids: Iterable<string>, label = 'Delete') {
    const m = new Map<string, null>();
    for (const id of ids) m.set(id, null);
    for (const id of m.keys()) this.selection.delete(id);
    this.editItems(m, label);
  }

  // ---------- selection ----------
  get selectedItems(): Item[] {
    const out: Item[] = [];
    if (!this.selection.size) return out;
    for (const l of this.doc.layers) for (const it of l.items) if (this.selection.has(it.id)) out.push(it);
    return out;
  }
  selectionBounds(): Rect | null {
    const it = this.selectedItems;
    return it.length ? itemsBounds(it) : null;
  }
  setSelection(ids: Iterable<string>) {
    this.selection = new Set(ids);
    this.emit('overlay', 'ui');
  }
  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.emit('overlay', 'ui');
  }
  selectAll(layerOnly = false) {
    const ids: string[] = [];
    for (const l of this.doc.layers) {
      if (!l.visible || l.locked) continue;
      if (layerOnly && l.id !== this.doc.activeLayer) continue;
      for (const it of l.items) ids.push(it.id);
    }
    this.setSelection(ids);
  }
  transformSelection(m: Mat, label = 'Transform') {
    const changes = new Map<string, Item>();
    for (const it of this.selectedItems) changes.set(it.id, transformItem(it, m));
    this.editItems(changes, label);
  }
  duplicateSelection(offset = 24) {
    const sel = this.selectedItems;
    if (!sel.length) return;
    const newIds: string[] = [];
    const t = translate(offset, offset);
    const byLayer = new Map<string, Item[]>();
    for (const it of sel) {
      const l = this.layerOf(it.id)!;
      const c = transformItem(cloneItem(it), t, true);
      newIds.push(c.id);
      if (!byLayer.has(l.id)) byLayer.set(l.id, []);
      byLayer.get(l.id)!.push(c);
    }
    this.setLayers(this.doc.layers.map((l) => (byLayer.has(l.id) ? { ...l, items: [...l.items, ...byLayer.get(l.id)!] } : l)));
    this.selection = new Set(newIds);
    this.commit('Duplicate');
  }
  orderSelection(where: 'front' | 'back' | 'forward' | 'backward') {
    const sel = this.selection;
    this.setLayers(
      this.doc.layers.map((l) => {
        if (!l.items.some((i) => sel.has(i.id))) return l;
        let items = l.items.slice();
        if (where === 'front') items = [...items.filter((i) => !sel.has(i.id)), ...items.filter((i) => sel.has(i.id))];
        else if (where === 'back') items = [...items.filter((i) => sel.has(i.id)), ...items.filter((i) => !sel.has(i.id))];
        else if (where === 'forward') {
          for (let i = items.length - 2; i >= 0; i--) if (sel.has(items[i].id) && !sel.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
        } else {
          for (let i = 1; i < items.length; i++) if (sel.has(items[i].id) && !sel.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
        }
        return { ...l, items };
      }),
    );
    this.commit('Arrange');
  }
  moveSelectionToLayer(layerId: string) {
    const sel = this.selectedItems;
    if (!sel.length) return;
    const ids = this.selection;
    this.setLayers(
      this.doc.layers.map((l) => {
        let items = l.items.filter((i) => !ids.has(i.id));
        if (l.id === layerId) items = [...items, ...sel];
        return items.length === l.items.length && l.id !== layerId ? l : { ...l, items };
      }),
    );
    this.commit('Move to layer');
  }

  // ---------- view ----------
  setView(m: Mat) {
    this.doc.view = { m };
    this.emit('view');
  }

  // ---------- doc-level props ----------
  setBackground(p: Partial<Background>, record = true) {
    this.doc.background = { ...this.doc.background, ...p };
    if (record) this.commit('Paper');
    else this.emit('doc', 'ui');
  }
  setPerspective(p: Partial<Perspective>, record = true) {
    this.doc.perspective = { ...this.doc.perspective, ...p };
    if (record) this.commit('Perspective');
    else this.emit('doc', 'ui', 'overlay');
  }
  setMeasure(p: Partial<Measure>) {
    this.doc.measure = { ...this.doc.measure, ...p };
    this.commit('Measurement');
  }
  setArtboard(a: Artboard | null) {
    this.doc.artboard = a;
    this.commit('Artboard');
  }
  setPage(pg: PageFrame | null) {
    this.doc.page = pg;
    this.dirty = true;
    this.emit('overlay', 'ui');
  }
  setGuide(g: Guide | null) {
    this.doc.guide = g;
    this.dirty = true;
    this.emit('overlay', 'ui');
  }
}
