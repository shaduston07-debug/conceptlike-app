import type { Editor } from '../core/editor';
import type { ToolId, ToolPreset } from '../core/types';
import { BRUSHES, BRUSH_ORDER } from '../core/brushes';
import { useEditor, VSlider, logTo, toLog, Seg, SliderRow, ToggleRow, PanelTitle } from './common';
import { BrushGlyph, Icon } from './icons';
import { uid } from '../core/geom';
import { defaultPresets } from '../core/settings';
import { useRef } from 'preact/hooks';

export type PanelId = null | 'color' | 'toolopts' | 'layers' | 'precision' | 'settings' | 'export' | 'library' | 'history' | 'import' | 'transform' | 'zoom';

const UTIL_TOOLS: { id: ToolId; icon: string; label: string }[] = [
  { id: 'select', icon: 'select', label: 'Select' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser' },
  { id: 'nudge', icon: 'nudge', label: 'Nudge' },
  { id: 'slice', icon: 'slice', label: 'Slice' },
  { id: 'fill', icon: 'fill', label: 'Fill' },
  { id: 'text', icon: 'text', label: 'Text' },
  { id: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper' },
];

export function currentColor(ed: Editor): string {
  if (ed.tool === 'fill') return ed.fillColor;
  if (ed.tool === 'text') return ed.preset.color;
  return (ed.tool === 'draw' ? ed.preset : ed.presets[ed.lastDrawPreset] || ed.preset).color;
}

export function Rail({ ed, panel, setPanel }: { ed: Editor; panel: PanelId; setPanel: (p: PanelId) => void }) {
  useEditor(ed, ['ui', 'settings']);
  const right = ed.settings.leftHanded;
  const pressTimer = useRef(0);
  const onPreset = (i: number) => {
    if (ed.tool === 'draw' && ed.activePreset === i) setPanel(panel === 'toolopts' ? null : 'toolopts');
    else {
      ed.selectPreset(i);
      if (panel === 'toolopts') setPanel('toolopts');
    }
  };
  return (
    <div class={'rail' + (right ? ' right' : '')}>
      <div class="rail-inner">
        {ed.presets.map((p, i) => (
          <button
            key={p.id}
            class={'preset' + (ed.tool === 'draw' && ed.activePreset === i ? ' on' : '')}
            onClick={() => onPreset(i)}
            onPointerDown={() => { pressTimer.current = window.setTimeout(() => { ed.selectPreset(i); setPanel('toolopts'); }, 450); }}
            onPointerUp={() => clearTimeout(pressTimer.current)}
            onPointerLeave={() => clearTimeout(pressTimer.current)}
            title={p.name || BRUSHES[p.brush].label}
          >
            <span class="size-label">{fmtSize(p.size)}</span>
            <BrushGlyph brush={p.brush} color={p.color} size={30} />
          </button>
        ))}
        <button class="ibtn sm" title="Add tool" onClick={() => {
          const base = ed.preset;
          const np: ToolPreset = { ...base, id: uid('T') };
          ed.setPresets([...ed.presets, np]);
          ed.selectPreset(ed.presets.length - 1);
          setPanel('toolopts');
        }}><Icon name="plus" size={18} /></button>
        <div class="rail-sep" />
        {UTIL_TOOLS.map((t) => (
          <button key={t.id} class={'ibtn' + (ed.tool === t.id ? ' on' : '')} title={t.label}
            onClick={() => {
              if (ed.tool === t.id && t.id !== 'eyedropper') setPanel(panel === 'toolopts' ? null : 'toolopts');
              else { ed.setTool(t.id); if (panel === 'toolopts') setPanel(null); }
            }}>
            <Icon name={t.icon} />
          </button>
        ))}
        <div class="rail-sep" />
        <button class="color-swatch" style={{ background: currentColor(ed) }} onClick={() => setPanel(panel === 'color' ? null : 'color')} title="Color" />
      </div>
    </div>
  );
}

export function fmtSize(s: number) {
  return s >= 10 ? Math.round(s).toString() : s.toFixed(1);
}

export function QuickSliders({ ed }: { ed: Editor }) {
  useEditor(ed, ['ui', 'settings']);
  const right = ed.settings.leftHanded;
  if (ed.tool === 'eraser') {
    return (
      <div class={'quick' + (right ? ' right' : '')}>
        <VSlider label="size" value={toLog(ed.eraserSize, 2, 300)} display={String(Math.round(ed.eraserSize))}
          onChange={(t) => { ed.eraserSize = logTo(t, 2, 300); ed.emit('ui', 'overlay'); }} />
      </div>
    );
  }
  if (ed.tool === 'nudge') {
    return (
      <div class={'quick' + (right ? ' right' : '')}>
        <VSlider label="size" value={toLog(ed.nudgeSize, 10, 400)} display={String(Math.round(ed.nudgeSize))}
          onChange={(t) => { ed.nudgeSize = logTo(t, 10, 400); ed.emit('ui', 'overlay'); }} />
      </div>
    );
  }
  if (ed.tool === 'fill') {
    return (
      <div class={'quick' + (right ? ' right' : '')}>
        <VSlider label="opac" value={ed.fillOpacity} display={Math.round(ed.fillOpacity * 100) + '%'}
          onChange={(t) => { ed.fillOpacity = Math.max(0.02, t); ed.emit('ui'); }} />
      </div>
    );
  }
  if (ed.tool !== 'draw') return null;
  const p = ed.preset;
  const def = BRUSHES[p.brush];
  return (
    <div class={'quick' + (right ? ' right' : '')}>
      <VSlider label="size" value={toLog(Math.max(def.minSize, p.size), def.minSize, def.maxSize)} display={fmtSize(p.size)}
        onChange={(t) => ed.updatePreset({ size: logTo(t, def.minSize, def.maxSize) })} />
      <VSlider label="opac" value={p.opacity} display={Math.round(p.opacity * 100) + '%'}
        onChange={(t) => ed.updatePreset({ opacity: Math.max(0.02, t) })} />
    </div>
  );
}

/** Popover with per-tool options. */
export function ToolOptions({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  useEditor(ed, ['ui', 'settings']);
  const cls = 'popover panel-left' + (ed.settings.leftHanded ? ' flip' : '');
  if (ed.tool !== 'draw') {
    return (
      <div class={cls} onPointerDown={(e) => e.stopPropagation()}>
        <PanelTitle title={UTIL_TOOLS.find((t) => t.id === ed.tool)?.label || 'Tool'} onClose={onClose} />
        <div class="sec"><UtilOptions ed={ed} vertical /></div>
      </div>
    );
  }
  const p = ed.preset;
  const def = BRUSHES[p.brush];
  const set = (x: Partial<ToolPreset>) => ed.updatePreset(x);
  return (
    <div class={cls} onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title={p.name || def.label} onClose={onClose} />
      <div class="sec">
        <h4>Brush</h4>
        <div class="grid-btns" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {BRUSH_ORDER.map((b) => (
            <button key={b} class={'tile' + (p.brush === b ? ' on' : '')} style={{ height: '78px', overflow: 'hidden', justifyContent: 'flex-end' }}
              onClick={() => {
                const d = BRUSHES[b];
                set({ brush: b, size: Math.min(d.maxSize, Math.max(d.minSize, p.brush === b ? p.size : d.defSize)), opacity: p.brush === b ? p.opacity : d.defOpacity, smoothing: d.defSmoothing });
              }}>
              <div style={{ height: '40px', overflow: 'hidden' }}><BrushGlyph brush={b} color={p.color} size={22} /></div>
              {BRUSHES[b].label}
            </button>
          ))}
        </div>
      </div>
      <div class="sec">
        <h4>Properties</h4>
        <SliderRow label="Size" value={toLog(Math.max(def.minSize, p.size), def.minSize, def.maxSize)} min={0} max={1} onChange={(t) => set({ size: logTo(t, def.minSize, def.maxSize) })} fmt={() => fmtSize(p.size)} />
        <SliderRow label="Opacity" value={p.opacity} min={0.02} max={1} onChange={(v) => set({ opacity: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <SliderRow label="Smoothing" value={p.smoothing} min={0} max={1} onChange={(v) => set({ smoothing: v })} fmt={(v) => Math.round(v * 100) + '%'} />
        <ToggleRow label="Pressure affects size" on={p.pressureSize} onChange={(v) => set({ pressureSize: v })} />
        <div class="row">
          <label>Name</label>
          <input class="tinput" style={{ width: '160px' }} value={p.name || ''} placeholder={def.label} onChange={(e) => set({ name: (e.target as HTMLInputElement).value || undefined })} />
        </div>
      </div>
      <div class="sec">
        <div class="row" style={{ gap: '6px' }}>
          <button class="btn" style={{ flex: 1 }} onClick={() => {
            ed.setPresets([...ed.presets.slice(0, ed.activePreset + 1), { ...p, id: uid('T') }, ...ed.presets.slice(ed.activePreset + 1)]);
            ed.selectPreset(ed.activePreset + 1);
          }}><Icon name="duplicate" size={16} />Duplicate</button>
          <button class="btn" style={{ flex: 1 }} disabled={ed.activePreset === 0} onClick={() => {
            const i = ed.activePreset;
            if (i === 0) return;
            const l = ed.presets.slice();
            [l[i - 1], l[i]] = [l[i], l[i - 1]];
            ed.setPresets(l);
            ed.selectPreset(i - 1);
          }}>Move up</button>
          <button class="btn danger" disabled={ed.presets.length <= 1} onClick={() => {
            if (ed.presets.length <= 1) return;
            const l = ed.presets.filter((_, k) => k !== ed.activePreset);
            ed.setPresets(l);
            ed.selectPreset(Math.max(0, ed.activePreset - 1));
          }}><Icon name="trash" size={16} /></button>
        </div>
        <button class="btn wide" style={{ marginTop: '8px' }} onClick={() => { if (confirm('Reset all tools to defaults?')) { ed.setPresets(defaultPresets()); ed.selectPreset(0); } }}>Reset tools</button>
      </div>
    </div>
  );
}

/** Options for utility tools (shown in strip and popover). */
export function UtilOptions({ ed, vertical }: { ed: Editor; vertical?: boolean }) {
  useEditor(ed, ['ui']);
  const sep = vertical ? null : <div class="sep" />;
  const wrap = (children: any) => (vertical ? <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{children}</div> : <>{children}</>);
  switch (ed.tool) {
    case 'eraser':
      return wrap(<>
        <Seg value={ed.eraserMode} onChange={(v) => { ed.eraserMode = v; ed.emit('ui'); }} options={[{ v: 'partial', l: 'Partial' }, { v: 'stroke', l: 'Whole stroke' }]} />
        {sep}
        <span class="lbl">Size</span>
        <input type="range" min={0} max={1} step="any" value={toLog(ed.eraserSize, 2, 300)} onInput={(e) => { ed.eraserSize = logTo(+(e.target as HTMLInputElement).value, 2, 300); ed.emit('ui', 'overlay'); }} />
        <span class="lbl">{Math.round(ed.eraserSize)}</span>
      </>);
    case 'select':
      return wrap(<>
        <Seg value={ed.selectMode} onChange={(v) => { ed.selectMode = v; ed.emit('ui'); }} options={[{ v: 'lasso', l: 'Lasso' }, { v: 'rect', l: 'Box' }, { v: 'tap', l: 'Tap' }]} />
        {sep}
        <Seg value={ed.selectAllLayers ? 1 : 0} onChange={(v) => { ed.selectAllLayers = !!v; ed.emit('ui'); }} options={[{ v: 1, l: 'All layers' }, { v: 0, l: 'Current layer' }]} />
        {sep}
        <button class="btn" onClick={() => ed.selectAll(!ed.selectAllLayers)}>Select all</button>
      </>);
    case 'slice':
      return wrap(<>
        <Seg value={ed.sliceMode} onChange={(v) => { ed.sliceMode = v; ed.emit('ui'); }} options={[{ v: 'trim', l: 'Trim' }, { v: 'cut', l: 'Cut' }]} />
        <span class="lbl">{ed.sliceMode === 'trim' ? 'Swipe over segments to erase them up to the nearest intersections' : 'Draw across strokes to split them'}</span>
      </>);
    case 'nudge':
      return wrap(<>
        <span class="lbl">Radius</span>
        <input type="range" min={0} max={1} step="any" value={toLog(ed.nudgeSize, 10, 400)} onInput={(e) => { ed.nudgeSize = logTo(+(e.target as HTMLInputElement).value, 10, 400); ed.emit('ui', 'overlay'); }} />
        <span class="lbl">{Math.round(ed.nudgeSize)}</span>
      </>);
    case 'fill':
      return wrap(<>
        <Seg value={ed.fillAllLayers ? 1 : 0} onChange={(v) => { ed.fillAllLayers = !!v; ed.emit('ui'); }} options={[{ v: 1, l: 'All layers' }, { v: 0, l: 'Current layer' }]} />
        {sep}
        <span class="lbl">Gap closing</span>
        <input type="range" min={0} max={12} step={1} value={ed.fillGap} onInput={(e) => { ed.fillGap = +(e.target as HTMLInputElement).value; ed.emit('ui'); }} />
        <span class="lbl">{ed.fillGap}px</span>
        {sep}
        <span class="lbl">Tap to fill · drag to lasso-fill</span>
      </>);
    case 'text': {
      const t = ed.textDefaults;
      const upd = (p: Partial<typeof t>) => { Object.assign(ed.textDefaults, p); ed.emit('ui'); window.dispatchEvent(new CustomEvent('text-style')); };
      return wrap(<>
        <select class="tinput" style={{ width: '150px' }} value={t.font} onChange={(e) => upd({ font: (e.target as HTMLSelectElement).value })}>
          <option value="-apple-system, system-ui, sans-serif">System</option>
          <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">Helvetica</option>
          <option value="Georgia, 'Times New Roman', serif">Serif</option>
          <option value="'Avenir Next', Avenir, sans-serif">Avenir</option>
          <option value="'Chalkboard SE', 'Comic Sans MS', cursive">Hand</option>
          <option value="'Marker Felt', fantasy">Marker</option>
          <option value="ui-monospace, Menlo, monospace">Mono</option>
          <option value="'American Typewriter', 'Courier New', monospace">Typewriter</option>
        </select>
        <span class="lbl">Size</span>
        <input type="range" min={8} max={160} step={1} value={t.size} onInput={(e) => upd({ size: +(e.target as HTMLInputElement).value })} />
        <span class="lbl">{t.size}</span>
        {sep}
        <button class={'ibtn sm' + (t.weight >= 600 ? ' on' : '')} onClick={() => upd({ weight: t.weight >= 600 ? 400 : 700 })}><b>B</b></button>
        <button class={'ibtn sm' + (t.italic ? ' on' : '')} onClick={() => upd({ italic: !t.italic })}><i>I</i></button>
        <Seg value={t.align as string} onChange={(v) => upd({ align: v as any })} options={[{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]} />
      </>);
    }
    case 'eyedropper':
      return <span class="lbl">Tap the canvas to pick a color</span>;
    default:
      return null;
  }
}

export function ToolStrip({ ed }: { ed: Editor }) {
  useEditor(ed, ['ui']);
  if (ed.tool === 'draw' || ed.selection.size) return null;
  return <div class="strip" onPointerDown={(e) => e.stopPropagation()}><UtilOptions ed={ed} /></div>;
}
