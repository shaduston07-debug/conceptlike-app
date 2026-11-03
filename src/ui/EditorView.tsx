import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import type { ImageItem, Mat, ToolId } from '../core/types';
import { Renderer } from '../render/renderer';
import { InputController } from '../tools/input';
import type { AppCtx, Tool } from '../tools/context';
import { DrawTool } from '../tools/draw';
import { EraserTool } from '../tools/eraser';
import { SelectTool } from '../tools/select';
import { NudgeTool } from '../tools/nudge';
import { SliceTool } from '../tools/slice';
import { FillTool } from '../tools/fill';
import { TextTool } from '../tools/text';
import { EyedropperTool } from '../tools/eyedropper';
import { drawGuidesOverlay } from '../tools/handles';
import { apply, inv, matScale, matRot, mul, translate, scale, rotate, uid, type Rect } from '../core/geom';
import { useEditor, setToastFn, toast } from './common';
import { Icon } from './icons';
import { Rail, QuickSliders, ToolOptions, ToolStrip, currentColor, type PanelId } from './Toolbar';
import { ColorPicker } from './ColorPicker';
import { LayersPanel } from './LayersPanel';
import { PrecisionPanel, PaperIcon } from './PrecisionPanel';
import { PaperPopover } from './PaperPopover';
import { SettingsPanel } from './SettingsPanel';
import { ExportPanel } from './ExportPanel';
import { LibraryPanel } from './LibraryPanel';
import { HistoryPanel } from './HistoryPanel';
import { SelectionBar, TransformPanel } from './SelectionBar';
import { TextEditor } from './TextEditor';
import { ToolWheel } from './ToolWheel';
import { QuickPalette } from './QuickPalette';
import { copySelection, cutSelection, paste } from './clipboard';
import { contentBounds, thumbnail } from '../export/raster';
import { saveDoc } from '../storage/docs';
import { normalizeDoc } from '../core/doc';
import { GUIDE_LABELS } from '../core/guides';
import type { Item } from '../core/types';

export function EditorView({ ed, onExit }: { ed: Editor; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [panel, setPanelRaw] = useState<PanelId>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [editPerspective, setEditPerspective] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  useEditor(ed, ['ui', 'history', 'settings', 'view', 'doc']);

  const setPanel = (p: PanelId) => setPanelRaw(p);
  const viewSize = () => ({ w: rendererRef.current?.w || window.innerWidth, h: rendererRef.current?.h || window.innerHeight });

  // toasts
  useEffect(() => {
    let n = 0;
    setToastFn((msg) => {
      const id = ++n;
      setToasts((t) => [...t.slice(-2), { id, msg }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1700);
    });
  }, []);

  const app = useMemo<AppCtx>(() => ({
    editor: ed,
    get renderer() { return rendererRef.current!; },
    toWorld: (x, y) => apply(inv(ed.doc.view.m), x, y),
    toScreen: (x, y) => apply(ed.doc.view.m, x, y),
    toast,
    zoom: () => matScale(ed.doc.view.m),
  }), [ed]);

  const tools = useMemo(() => {
    const t: Record<ToolId, Tool> = {
      draw: new DrawTool(app), eraser: new EraserTool(app), select: new SelectTool(app), nudge: new NudgeTool(app),
      slice: new SliceTool(app), fill: new FillTool(app), text: new TextTool(app), eyedropper: new EyedropperTool(app),
    };
    return t;
  }, [app]);

  const editPerspRef = useRef(editPerspective);
  editPerspRef.current = editPerspective;

  // mount renderer + input
  useEffect(() => {
    const host = hostRef.current!;
    const r = new Renderer(ed, host);
    rendererRef.current = r;
    let prevTool: ToolId = ed.tool;
    const offTool = ed.on('ui', () => {
      if (ed.tool !== prevTool) {
        tools[prevTool].deactivate?.();
        tools[prevTool].cancel();
        tools[prevTool].hover?.(null);
        prevTool = ed.tool;
      }
    });
    r.overlayDrawers = [
      (ctx, v) => drawGuidesOverlay(app, ctx, v, editPerspRef.current),
      (ctx, v) => tools[ed.tool].overlay?.(ctx, v),
      (ctx, v) => { if (ed.tool !== 'select' && ed.selection.size) tools.select.overlay?.(ctx, v); },
      (ctx) => inputRef.current?.overlay(ctx),
    ];
    const ic = new InputController(app, r.overlay, () => tools[ed.tool], () => {
      // finger tap on canvas in pencil-only mode closes panels
      setPanelRaw(null);
    }, () => {
      // touching the canvas dismisses transient popovers; docked panels stay open
      setPanelRaw((p) => (p === 'layers' || p === 'precision' || p === 'paper' ? p : null));
    });
    inputRef.current = ic;
    // initial view
    const m = ed.doc.view.m;
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) {
      if (ed.doc.artboard) fitRect(artRect(), 0.86);
      else ed.setView(translate(r.w / 2, r.h / 2));
    }
    setReady(true);
    return () => {
      offTool();
      ic.destroy();
      r.destroy();
    };
  }, []);

  useEffect(() => { rendererRef.current?.requestOverlay(); }, [editPerspective]);

  // autosave
  useEffect(() => {
    let timer = 0;
    const save = async () => {
      if (!ed.dirty) return;
      ed.dirty = false;
      try {
        await saveDoc(ed.doc, thumbnail(ed.doc));
      } catch (e) {
        console.error(e);
        ed.dirty = true;
      }
    };
    const off = ed.on(['history'], () => {
      clearTimeout(timer);
      timer = window.setTimeout(save, 1200);
    });
    const offOverlay = ed.on('overlay', () => { if (ed.dirty) { clearTimeout(timer); timer = window.setTimeout(save, 1500); } });
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    (ed as any).__save = save;
    return () => { off(); offOverlay(); clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
  }, []);

  // save view changes lazily (not part of history)
  useEffect(() => {
    let t = 0;
    return ed.on('view', () => { clearTimeout(t); t = window.setTimeout(() => { ed.dirty = true; }, 800); });
  }, []);

  // global events
  useEffect(() => {
    const onClip = (e: Event) => {
      const a = (e as CustomEvent).detail;
      const v = viewSize();
      if (a === 'copy') { if (copySelection(ed)) toast('Copied'); }
      else if (a === 'cut') cutSelection(ed);
      else if (a === 'paste') paste(ed, v.w, v.h);
    };
    const onFit = () => zoomFit();
    const onColor = () => setPanelRaw('color');
    window.addEventListener('clipboard-action', onClip);
    window.addEventListener('zoom-fit', onFit);
    window.addEventListener('open-color', onColor);
    const onPalette = (e: Event) => {
      const d = (e as CustomEvent).detail as { x: number; y: number } | null;
      const v = viewSize();
      setPalette(d || { x: v.w / 2, y: v.h / 2 });
    };
    window.addEventListener('quick-palette', onPalette);
    return () => {
      window.removeEventListener('quick-palette', onPalette);
      window.removeEventListener('clipboard-action', onClip);
      window.removeEventListener('zoom-fit', onFit);
      window.removeEventListener('open-color', onColor);
    };
  }, []);

  const artRect = (): Rect => {
    const a = ed.doc.artboard!;
    return { x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h };
  };
  function fitRect(b: Rect, frac = 0.84) {
    const { w, h } = viewSize();
    const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
    const z = Math.min((w * frac) / bw, (h * frac) / bh, 64);
    const rot = matRot(ed.doc.view.m);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    ed.setView(mul(translate(w / 2, h / 2), mul(rotate(rot), mul(scale(z), translate(-cx, -cy)))));
  }
  function zoomFit() {
    const b = contentBounds(ed.doc);
    if (ed.doc.artboard) fitRect(artRect(), 0.86);
    else if (b) fitRect(b);
    else { const { w, h } = viewSize(); ed.setView(translate(w / 2, h / 2)); }
  }
  const zoomTo = (z: number) => {
    const { w, h } = viewSize();
    const v = ed.doc.view.m;
    const k = z / matScale(v);
    ed.setView(mul(translate(w / 2, h / 2), mul(scale(k), mul(translate(-w / 2, -h / 2), v))));
  };
  const resetRotation = () => {
    const { w, h } = viewSize();
    const v = ed.doc.view.m;
    ed.setView(mul(translate(w / 2, h / 2), mul(rotate(-matRot(v)), mul(translate(-w / 2, -h / 2), v))));
  };

  // import
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (/\.(inkfinity|draftwell)$|json/i.test(f.name) || f.type === 'application/json') {
        try {
          const d = normalizeDoc(JSON.parse(await f.text()));
          // merge layers into the current drawing
          const layers = d.layers.map((l) => ({ ...l, id: uid('L'), items: l.items.map((i) => ({ ...i, id: uid('i') })) as Item[] }));
          ed.doc.layers = [...ed.doc.layers, ...layers];
          ed.commit('Import drawing');
          toast('Imported ' + d.name);
        } catch { toast('Could not read file'); }
        continue;
      }
      if (!f.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|heic|svg|bmp)$/i.test(f.name)) { toast('Unsupported file'); continue; }
      const src = await downscaleImage(f);
      if (!src) { toast('Could not load image'); continue; }
      const { w: vw, h: vh } = viewSize();
      const v = ed.doc.view.m;
      const z = matScale(v);
      const target = Math.min(vw, vh) * 0.6 / z;
      const k = Math.min(1 / z, target / Math.max(src.w, src.h)) || 1;
      const c = apply(inv(v), vw / 2, vh / 2);
      const w = src.w * k, h = src.h * k;
      const rot = -matRot(v);
      const m: Mat = mul(translate(c.x, c.y), mul(rotate(rot), translate(-w / 2, -h / 2)));
      const item: ImageItem = { kind: 'image', id: uid('i'), src: src.url, w, h, m, opacity: 1 };
      const layer = ed.activeLayer;
      if (layer.locked || !layer.visible) { toast('Layer is locked or hidden'); return; }
      ed.addItems([item], layer.id, 'Import image');
      ed.setTool('select');
      ed.setSelection([item.id]);
    }
  };

  const exit = async () => {
    ed.dirty = true;
    await (ed as any).__save?.();
    onExit();
  };

  const s = ed.settings;
  const zoomPct = Math.round(matScale(ed.doc.view.m) * 100);
  const rotDeg = Math.round(((matRot(ed.doc.view.m) * 180) / Math.PI + 360) % 360);
  const color = currentColor(ed);
  const colorOpacity = ed.tool === 'fill' ? ed.fillOpacity : ed.preset.opacity;
  const onColor = (c: string, final: boolean) => {
    if (ed.tool === 'fill') { ed.fillColor = c; ed.emit('ui'); }
    else ed.updatePreset({ color: c }, ed.tool === 'draw' ? ed.activePreset : ed.lastDrawPreset);
    if (final) ed.addRecentColor(c);
    // live-recolour the selection
    if (ed.selection.size) {
      const ch = new Map<string, Item>();
      for (const it of ed.selectedItems) if (it.kind !== 'image') ch.set(it.id, { ...it, color: c } as Item);
      ed.editItems(ch, 'Color', final);
    }
  };

  return (
    <div class="editor">
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {ready && (
        <>
          <div class="topbar">
            <div class="pill">
              <button class="ibtn" title="Gallery" onClick={exit}><Icon name="gallery" /></button>
              {renaming ? (
                <input class="tinput" style={{ width: '200px' }} value={ed.doc.name} autoFocus
                  onBlur={(e) => { ed.doc.name = (e.target as HTMLInputElement).value.trim() || 'Untitled'; ed.dirty = true; setRenaming(false); ed.emit('ui'); (ed as any).__save?.(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              ) : (
                <button class="doc-title" onClick={() => setRenaming(true)}>{ed.doc.name}</button>
              )}
            </div>
            <div class="pill">
              <button class="ibtn" title="Undo" disabled={!ed.canUndo} onClick={() => ed.undo()}><Icon name="undo" /></button>
              <button class="ibtn" title="Redo" disabled={!ed.canRedo} onClick={() => ed.redo()}><Icon name="redo" /></button>
              <button class={'ibtn' + (panel === 'history' ? ' on' : '')} title="History" onClick={() => setPanel(panel === 'history' ? null : 'history')}><Icon name="history" /></button>
            </div>
            <div class="pill">
              <button class={'ibtn' + (s.liveShapes ? ' on' : '')} title="Live shapes" onClick={() => { ed.setSettings({ liveShapes: !s.liveShapes }); toast(s.liveShapes ? 'Live shapes off' : 'Live shapes on'); }}><Icon name="shape" /></button>
              <button class={'ibtn' + (s.gridSnap ? ' on' : '')} title="Snap to grid" onClick={() => { ed.setSettings({ gridSnap: !s.gridSnap }); toast(s.gridSnap ? 'Grid snap off' : 'Grid snap on'); }}><Icon name="magnet" /></button>
              <button class={'ibtn' + (s.measureOn ? ' on' : '')} title="Measure" onClick={() => ed.setSettings({ measureOn: !s.measureOn })}><Icon name="measure" /></button>
              <button class={'ibtn' + (panel === 'paper' ? ' on' : '')} title="Paper" onClick={() => setPanel(panel === 'paper' ? null : 'paper')}><PaperIcon kind={ed.doc.background.paper} /></button>
            </div>
            <span class="spacer" />
            {ed.pencilDetected && s.pencilOnly !== 'off' && (
              <div class="pill"><span class="badge" title="Pencil-only drawing"><Icon name="pencilOnly" size={16} />Pencil</span></div>
            )}
            <div class="pill">
              <button class={'ibtn' + (panel === 'precision' ? ' on' : '') + (ed.doc.guide || ed.doc.perspective.mode !== 'none' ? ' on' : '')} title="Precision" onClick={() => setPanel(panel === 'precision' ? null : 'precision')}><Icon name="precision" /></button>
              <button class={'layer-chip' + (panel === 'layers' ? ' on' : '')} title="Layers" onClick={() => setPanel(panel === 'layers' ? null : 'layers')}>
                <Icon name="layers" />
                <span>{ed.activeLayer.name}</span>
              </button>
              <button class={'ibtn' + (panel === 'library' ? ' on' : '')} title="Library" onClick={() => setPanel(panel === 'library' ? null : 'library')}><Icon name="library" /></button>
              <button class="ibtn" title="Import image" onClick={() => fileRef.current?.click()}><Icon name="image" /></button>
              <button class={'ibtn' + (panel === 'export' ? ' on' : '')} title="Export" onClick={() => setPanel(panel === 'export' ? null : 'export')}><Icon name="share" /></button>
              <button class={'ibtn' + (panel === 'settings' ? ' on' : '')} title="Settings" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Icon name="settings" /></button>
            </div>
          </div>

          {s.toolLayout === 'bar' ? <Rail ed={ed} panel={panel} setPanel={setPanel} /> : <ToolWheel ed={ed} panel={panel} setPanel={setPanel} />}
          {s.toolLayout === 'bar' && <QuickSliders ed={ed} />}
          <ToolStrip ed={ed} />
          <SelectionBar ed={ed} viewSize={viewSize} setPanel={setPanel} />
          <TextEditor ed={ed} />

          {ed.doc.guide && (
            <div class="guide-chip pill">
              <span class="badge" style={{ fontSize: '12px' }}><Icon name="precision" size={16} />{GUIDE_LABELS[ed.doc.guide.kind]} guide</span>
              <button class={'ibtn sm' + (s.guideSnap ? ' on' : '')} title="Snap to guide" onClick={() => ed.setSettings({ guideSnap: !s.guideSnap })}><Icon name="magnet" size={18} /></button>
              <button class="ibtn sm" title="Remove guide" onClick={() => ed.setGuide(null)}><Icon name="close" size={18} /></button>
            </div>
          )}

          {s.showZoomHud && (
            <button class={'hud' + (s.leftHanded ? ' left' : '')} onClick={() => setPanel(panel === 'zoom' ? null : 'zoom')}>
              <span>{zoomPct}%</span>{rotDeg !== 0 && <span>{rotDeg}°</span>}
            </button>
          )}
          {panel === 'zoom' && (
            <div class="menu" style={{ bottom: '56px', right: s.leftHanded ? 'auto' : '14px', left: s.leftHanded ? '14px' : 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => { zoomFit(); setPanel(null); }}><Icon name="fit" size={18} />Fit {ed.doc.artboard ? 'artboard' : 'drawing'}</button>
              <button onClick={() => { zoomTo(1); setPanel(null); }}><Icon name="zoomIn" size={18} />Actual size (100%)</button>
              <button onClick={() => { resetRotation(); setPanel(null); }}><Icon name="rotate" size={18} />Reset rotation</button>
              <button onClick={() => { const { w, h } = viewSize(); ed.setView(translate(w / 2, h / 2)); setPanel(null); }}><Icon name="hand" size={18} />Go to origin</button>
            </div>
          )}

          {panel === 'color' && (
            <ColorPicker ed={ed} color={color} opacity={colorOpacity}
              style={s.toolLayout === 'bar' ? (s.leftHanded ? { right: '88px', bottom: '16px' } : { left: '88px', bottom: '16px' }) : { left: '50%', top: '70px', transform: 'translateX(-50%)' }}
              onChange={onColor}
              onOpacity={(o) => { if (ed.tool === 'fill') { ed.fillOpacity = o; ed.emit('ui'); } else ed.updatePreset({ opacity: o }, ed.tool === 'draw' ? ed.activePreset : ed.lastDrawPreset); }}
              onClose={() => setPanel(null)}
              onPick={() => { setPanel(null); ed.setTool('eyedropper'); }} />
          )}
          {panel === 'toolopts' && <ToolOptions ed={ed} onClose={() => setPanel(null)} />}
          {panel === 'paper' && <PaperPopover ed={ed} onClose={() => setPanel(null)} onMore={() => setPanel('precision')} />}
          {panel === 'layers' && <LayersPanel ed={ed} onClose={() => setPanel(null)} />}
          {panel === 'precision' && <PrecisionPanel ed={ed} onClose={() => setPanel(null)} editPerspective={editPerspective} setEditPerspective={setEditPerspective} viewSize={viewSize} />}
          {panel === 'settings' && <SettingsPanel ed={ed} onClose={() => setPanel(null)} />}
          {panel === 'export' && <ExportPanel ed={ed} onClose={() => setPanel(null)} viewSize={viewSize} />}
          {panel === 'library' && <LibraryPanel ed={ed} onClose={() => setPanel(null)} viewSize={viewSize} />}
          {panel === 'history' && <HistoryPanel ed={ed} onClose={() => setPanel(null)} />}
          {panel === 'transform' && <TransformPanel ed={ed} onClose={() => setPanel(null)} />}

          {palette && <QuickPalette ed={ed} x={palette.x} y={palette.y} w={viewSize().w} h={viewSize().h} onClose={() => setPalette(null)} />}
          {toasts.map((t) => <div key={t.id} class="toast">{t.msg}</div>)}
          <input ref={fileRef} type="file" accept="image/*,.inkfinity,.draftwell,application/json" multiple style={{ display: 'none' }}
            onChange={(e) => { onFiles((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ''; }} />
        </>
      )}
    </div>
  );
}

/** Load an image file, downscaling very large photos to keep documents responsive. */
async function downscaleImage(f: File): Promise<{ url: string; w: number; h: number } | null> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    const max = 4096;
    const k = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const isJpeg = /jpe?g|heic/i.test(f.type) || /\.(jpe?g|heic)$/i.test(f.name);
    return { url: c.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.9), w, h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
