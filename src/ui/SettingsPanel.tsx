import type { Editor } from '../core/editor';
import { useEditor, PanelTitle, Seg, ToggleRow, SliderRow } from './common';
import { DEFAULT_SETTINGS } from '../core/settings';

export function SettingsPanel({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  useEditor(ed, ['settings', 'ui']);
  const s = ed.settings;
  const set = ed.setSettings.bind(ed);
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Settings" onClose={onClose} />
      <div class="sec">
        <h4>Apple Pencil</h4>
        <div class="row"><label>Draw with</label></div>
        <Seg value={s.pencilOnly} onChange={(v) => set({ pencilOnly: v })} options={[{ v: 'auto', l: 'Auto' }, { v: 'on', l: 'Pencil only' }, { v: 'off', l: 'Pencil & finger' }]} />
        <div class="hint">Auto switches to pencil-only as soon as an Apple Pencil touches the screen. In pencil-only mode one finger pans and long-press picks a color.</div>
        <div class="row" style={{ marginTop: '8px' }}><label>Pressure</label></div>
        <Seg value={s.pressureCurve} onChange={(v) => set({ pressureCurve: v })} options={[{ v: 0.6, l: 'Soft' }, { v: 1, l: 'Normal' }, { v: 1.6, l: 'Firm' }]} />
        <div class="row" style={{ marginTop: '8px' }}><label>Double-tap</label></div>
        <Seg value={s.pencilDoubleTap} onChange={(v) => set({ pencilDoubleTap: v })} options={[{ v: 'eraser', l: 'Eraser' }, { v: 'last', l: 'Last tool' }, { v: 'color', l: 'Color' }, { v: 'none', l: 'Off' }]} />
        <ToggleRow label="Hover preview" on={s.hoverPreview} onChange={(v) => set({ hoverPreview: v })} hint="Shows the brush outline when the pencil hovers over the screen (supported iPads)." />
        <ToggleRow label="Latency prediction" on={s.prediction} onChange={(v) => set({ prediction: v })} />
      </div>
      <div class="sec">
        <h4>Gestures</h4>
        <ToggleRow label="Two-finger tap to undo" on={s.twoFingerUndo} onChange={(v) => set({ twoFingerUndo: v })} />
        <ToggleRow label="Three-finger tap to redo" on={s.threeFingerRedo} onChange={(v) => set({ threeFingerRedo: v })} />
        <ToggleRow label="Touch & hold for color picker" on={s.longPressEyedropper} onChange={(v) => set({ longPressEyedropper: v })} />
        <ToggleRow label="Rotate canvas" on={s.rotateCanvas} onChange={(v) => set({ rotateCanvas: v })} />
      </div>
      <div class="sec">
        <h4>Drawing</h4>
        <ToggleRow label="Brush size relative to screen" on={s.scaleBrushWithZoom} onChange={(v) => set({ scaleBrushWithZoom: v })} hint="When on, a brush looks the same size at every zoom level, so zooming in lets you add finer detail." />
        <SliderRow label="Shape hold" value={s.shapeHoldMs} min={200} max={1200} step={10} onChange={(v) => set({ shapeHoldMs: v })} fmt={(v) => (v / 1000).toFixed(2) + 's'} />
        <ToggleRow label="Auto layer per tool" on={s.autoLayerByTool} onChange={(v) => set({ autoLayerByTool: v })} hint="Each tool draws on its own layer, created on demand." />
      </div>
      <div class="sec">
        <h4>Interface</h4>
        <div class="row"><label>Appearance</label></div>
        <Seg value={s.theme} onChange={(v) => set({ theme: v })} options={[{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }]} />
        <div class="row" style={{ marginTop: '8px' }}><label>Tools</label></div>
        <Seg value={s.toolLayout} onChange={(v) => set({ toolLayout: v })} options={[{ v: 'bar', l: 'Tool bar' }, { v: 'wheel', l: 'Tool wheel' }]} />
        <ToggleRow label="Left-handed layout" on={s.leftHanded} onChange={(v) => set({ leftHanded: v })} />
        <ToggleRow label="Show zoom indicator" on={s.showZoomHud} onChange={(v) => set({ showZoomHud: v })} />
      </div>
      <div class="sec">
        <button class="btn wide" onClick={() => { if (confirm('Restore default settings?')) set({ ...DEFAULT_SETTINGS, palettes: s.palettes, recentColors: s.recentColors }); }}>Restore defaults</button>
        <div class="hint" style={{ textAlign: 'center' }}>Draftwell 1.0 · Shortcuts: ⌘Z undo, ⇧⌘Z redo, V select, E eraser, B brush, [ ] size, Space+drag pan</div>
      </div>
    </div>
  );
}
