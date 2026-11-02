import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, normalizeHex } from '../render/color';
import { BUILTIN_PALETTES } from './palettes';
import { Seg, PanelTitle } from './common';
import { Icon } from './icons';

type Tab = 'wheel' | 'sliders' | 'palettes';

export function ColorPicker({ ed, color, opacity, onChange, onOpacity, onClose, onPick, style }: {
  ed: Editor;
  color: string;
  opacity: number;
  onChange: (c: string, final: boolean) => void;
  onOpacity?: (o: number) => void;
  onClose: () => void;
  onPick: () => void;
  style?: any;
}) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('draftwell.cptab') as Tab) || 'wheel');
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(color)));
  const [hexText, setHexText] = useState(color);
  useEffect(() => {
    const cur = rgbToHex(...hsvToRgb(...hsv));
    if (cur.toLowerCase() !== color.toLowerCase()) {
      const n = rgbToHsv(...hexToRgb(color));
      // keep hue when colour is grey
      if (n[1] === 0 || n[2] === 0) n[0] = hsv[0];
      setHsv(n);
    }
    setHexText(color);
  }, [color]);
  const setTabP = (t: Tab) => { setTab(t); try { localStorage.setItem('draftwell.cptab', t); } catch {} };
  const emitHsv = (h: number, s: number, v: number, final = false) => {
    setHsv([h, s, v]);
    const hex = rgbToHex(...hsvToRgb(h, s, v));
    setHexText(hex);
    onChange(hex, final);
  };
  const [r, g, b] = hexToRgb(color);
  const [hh, sl, ll] = rgbToHsl(r, g, b);
  const s = ed.settings;
  const userPalettes = s.palettes;
  const allPalettes = [...userPalettes.map((p) => ({ ...p, user: true })), ...BUILTIN_PALETTES.map((p) => ({ ...p, user: false }))];
  const [palIdx, setPalIdx] = useState(Math.min(s.activePalette, allPalettes.length - 1));
  const pal = allPalettes[palIdx] || allPalettes[0];

  return (
    <div class="popover cp" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Color" onClose={onClose}>
        <button class="ibtn sm" onClick={onPick} title="Pick from canvas"><Icon name="eyedropper" size={18} /></button>
      </PanelTitle>
      <div class="sec">
        <Seg value={tab} onChange={setTabP} options={[{ v: 'wheel', l: 'Wheel' }, { v: 'sliders', l: 'Sliders' }, { v: 'palettes', l: 'Palettes' }]} />
      </div>
      {tab === 'wheel' && (
        <div class="sec">
          <Wheel hsv={hsv} onChange={(h, sat, v, f) => emitHsv(h, sat, v, f)} />
        </div>
      )}
      {tab === 'sliders' && (
        <div class="sec">
          <h4>RGB</h4>
          <GradSlider value={r / 255} grad={`linear-gradient(90deg, ${rgbToHex(0, g, b)}, ${rgbToHex(255, g, b)})`} label={`R ${r}`} onChange={(t, f) => onChange(rgbToHex(t * 255, g, b), f)} />
          <GradSlider value={g / 255} grad={`linear-gradient(90deg, ${rgbToHex(r, 0, b)}, ${rgbToHex(r, 255, b)})`} label={`G ${g}`} onChange={(t, f) => onChange(rgbToHex(r, t * 255, b), f)} />
          <GradSlider value={b / 255} grad={`linear-gradient(90deg, ${rgbToHex(r, g, 0)}, ${rgbToHex(r, g, 255)})`} label={`B ${b}`} onChange={(t, f) => onChange(rgbToHex(r, g, t * 255), f)} />
          <h4 style={{ marginTop: '14px' }}>HSL</h4>
          <GradSlider value={hsv[0] / 360} grad="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" label={`H ${Math.round(hsv[0])}°`} onChange={(t, f) => onChange(rgbToHex(...hslToRgb(t * 359.9, sl, ll)), f)} />
          <GradSlider value={sl} grad={`linear-gradient(90deg, ${rgbToHex(...hslToRgb(hh, 0, ll))}, ${rgbToHex(...hslToRgb(hh, 1, ll))})`} label={`S ${Math.round(sl * 100)}%`} onChange={(t, f) => onChange(rgbToHex(...hslToRgb(hh, t, ll)), f)} />
          <GradSlider value={ll} grad={`linear-gradient(90deg, #000, ${rgbToHex(...hslToRgb(hh, sl, 0.5))}, #fff)`} label={`L ${Math.round(ll * 100)}%`} onChange={(t, f) => onChange(rgbToHex(...hslToRgb(hh, sl, t)), f)} />
        </div>
      )}
      {tab === 'palettes' && (
        <div class="sec">
          <div class="row" style={{ marginBottom: '8px' }}>
            <select class="tinput" value={palIdx} onChange={(e) => { const i = +(e.target as HTMLSelectElement).value; setPalIdx(i); ed.setSettings({ activePalette: i }); }}>
              {allPalettes.map((p, i) => <option value={i}>{p.name}{p.user ? ' (mine)' : ''}</option>)}
            </select>
            <button class="ibtn sm" title="New palette" onClick={() => {
              const name = prompt('Palette name', 'My Palette');
              if (!name) return;
              ed.setSettings({ palettes: [{ name, colors: [color] }, ...userPalettes] });
              setPalIdx(0);
            }}><Icon name="plus" size={18} /></button>
          </div>
          <div class="swatches">
            {pal.colors.map((c, i) => (
              <button class={'sw' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')} style={{ background: c }}
                onClick={() => onChange(c, true)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!pal.user) return;
                  const pi = userPalettes.findIndex((p) => p.name === pal.name);
                  const np = userPalettes.slice();
                  np[pi] = { ...np[pi], colors: np[pi].colors.filter((_, k) => k !== i) };
                  ed.setSettings({ palettes: np });
                }} />
            ))}
            {pal.user && (
              <button class="sw" style={{ display: 'grid', placeItems: 'center', background: 'var(--panel-2)' }} title="Add current color" onClick={() => {
                const pi = userPalettes.findIndex((p) => p.name === pal.name);
                const np = userPalettes.slice();
                np[pi] = { ...np[pi], colors: [...np[pi].colors, color] };
                ed.setSettings({ palettes: np });
              }}><Icon name="plus" size={14} /></button>
            )}
          </div>
          {pal.user && (
            <div class="row" style={{ marginTop: '8px' }}>
              <span class="hint" style={{ flex: 1, margin: 0 }}>Long-press a swatch to remove it.</span>
              <button class="btn danger" onClick={() => {
                ed.setSettings({ palettes: userPalettes.filter((p) => p.name !== pal.name) });
                setPalIdx(0);
              }}>Delete</button>
            </div>
          )}
        </div>
      )}
      <div class="sec">
        <div class="row">
          <div class="cp-preview"><div style={{ background: color, opacity }} /></div>
          <input class="tinput" value={hexText} onInput={(e) => setHexText((e.target as HTMLInputElement).value)}
            onChange={() => { const n = normalizeHex(hexText); if (n) onChange(n, true); else setHexText(color); }}
            style={{ fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase' }} />
        </div>
        {onOpacity && (
          <div class="row" style={{ marginTop: '6px' }}>
            <GradSlider value={opacity} grad={`linear-gradient(90deg, ${color}00, ${color}), linear-gradient(45deg, #ddd 25%, #fff 25%, #fff 75%, #ddd 75%)`} label={`${Math.round(opacity * 100)}%`} onChange={(t) => onOpacity(Math.max(0.01, t))} />
          </div>
        )}
        {s.recentColors.length > 0 && (
          <>
            <h4 style={{ marginTop: '10px' }}>Recent</h4>
            <div class="swatches">
              {s.recentColors.slice(0, 16).map((c) => <button class={'sw' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c, true)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GradSlider({ value, grad, label, onChange }: { value: number; grad: string; label: string; onChange: (t: number, final: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: PointerEvent, final: boolean) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (e.clientX - r.left - 12) / (r.width - 24))), final);
  };
  return (
    <div class="row" style={{ minHeight: '34px' }}>
      <div class="slider-grad" ref={ref} style={{ background: grad }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); set(e as any, false); }}
        onPointerMove={(e) => { if ((e as any).buttons || e.pointerType !== 'mouse') if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) set(e as any, false); }}
        onPointerUp={(e) => set(e as any, true)}>
        <div class="k" style={{ left: `calc(12px + ${value} * (100% - 24px))` }} />
      </div>
      <span class="v" style={{ minWidth: '58px', fontSize: '12px' }}>{label}</span>
    </div>
  );
}

/** Hue ring with saturation/value square. */
function Wheel({ hsv, onChange }: { hsv: [number, number, number]; onChange: (h: number, s: number, v: number, final: boolean) => void }) {
  const ringRef = useRef<HTMLCanvasElement>(null);
  const sqRef = useRef<HTMLCanvasElement>(null);
  const mode = useRef<'ring' | 'sq' | null>(null);
  const SIZE = 260, R0 = 104, R1 = 130, SQ = 138;
  useEffect(() => {
    const c = ringRef.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = SIZE * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    for (let a = 0; a < 360; a += 0.5) {
      ctx.beginPath();
      ctx.strokeStyle = `hsl(${a},100%,50%)`;
      ctx.lineWidth = R1 - R0;
      ctx.arc(SIZE / 2, SIZE / 2, (R0 + R1) / 2, ((a - 90.6) * Math.PI) / 180, ((a - 89.4) * Math.PI) / 180);
      ctx.stroke();
    }
  }, []);
  useEffect(() => {
    const c = sqRef.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = SIZE * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const x0 = (SIZE - SQ) / 2;
    const [hr, hg, hb] = hsvToRgb(hsv[0], 1, 1);
    const gx = ctx.createLinearGradient(x0, 0, x0 + SQ, 0);
    gx.addColorStop(0, '#fff');
    gx.addColorStop(1, `rgb(${hr},${hg},${hb})`);
    ctx.fillStyle = gx;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x0, x0, SQ, SQ, 8) : ctx.rect(x0, x0, SQ, SQ);
    ctx.fill();
    const gy = ctx.createLinearGradient(0, x0, 0, x0 + SQ);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(1, '#000');
    ctx.fillStyle = gy;
    ctx.fill();
  }, [Math.round(hsv[0])]);
  const handle = (e: PointerEvent, final: boolean) => {
    const r = ringRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left - SIZE / 2, y = e.clientY - r.top - SIZE / 2;
    if (!mode.current) {
      const d = Math.hypot(x, y);
      mode.current = d > R0 - 6 ? 'ring' : 'sq';
    }
    if (mode.current === 'ring') {
      let a = (Math.atan2(y, x) * 180) / Math.PI + 90;
      if (a < 0) a += 360;
      onChange(a % 360, hsv[1], hsv[2], final);
    } else {
      const s = Math.max(0, Math.min(1, (x + SQ / 2) / SQ));
      const v = Math.max(0, Math.min(1, 1 - (y + SQ / 2) / SQ));
      onChange(hsv[0], s, v, final);
    }
  };
  const ha = ((hsv[0] - 90) * Math.PI) / 180;
  const rm = (R0 + R1) / 2;
  return (
    <div class="cp-wheel"
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); mode.current = null; handle(e as any, false); }}
      onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) handle(e as any, false); }}
      onPointerUp={(e) => { handle(e as any, true); mode.current = null; }}>
      <canvas ref={ringRef} />
      <canvas ref={sqRef} />
      <div class="cp-dot" style={{ left: `${SIZE / 2 + Math.cos(ha) * rm}px`, top: `${SIZE / 2 + Math.sin(ha) * rm}px`, background: `hsl(${hsv[0]},100%,50%)` }} />
      <div class="cp-dot" style={{ left: `${(SIZE - SQ) / 2 + hsv[1] * SQ}px`, top: `${(SIZE - SQ) / 2 + (1 - hsv[2]) * SQ}px`, background: rgbToHex(...hsvToRgb(...hsv)) }} />
    </div>
  );
}
