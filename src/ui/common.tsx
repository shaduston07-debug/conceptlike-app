import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Editor, EditorEvent } from '../core/editor';

export function useEditor(ed: Editor, events: EditorEvent[] = ['ui']) {
  const [, force] = useReducer((x: number, _a: number) => x + 1, 0);
  useEffect(() => ed.on(events, () => force(0)), [ed]);
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button class={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: ComponentChildren }[]; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button key={String(o.v)} class={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function SliderRow({ label, value, min, max, step, onChange, fmt, onEnd }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; onEnd?: () => void;
}) {
  return (
    <div class="row">
      <span style={{ minWidth: '76px', color: 'var(--text-2)' }}>{label}</span>
      <input type="range" min={min} max={max} step={step ?? 'any'} value={value}
        onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
        onChange={() => onEnd?.()} />
      <span class="v">{fmt ? fmt(value) : Math.round(value)}</span>
    </div>
  );
}

export function ToggleRow({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <div class="row"><label>{label}</label><Switch on={on} onChange={onChange} /></div>
      {hint && <div class="hint" style={{ marginTop: '-2px', marginBottom: '6px' }}>{hint}</div>}
    </div>
  );
}

/** Logarithmic mapping helpers for size sliders. */
export const logTo = (t: number, min: number, max: number) => Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * t);
export const toLog = (v: number, min: number, max: number) => (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));

/** A tall pill slider operated by dragging anywhere on it (relative drag, like a jog control). */
export function VSlider({ value, onChange, label, display, onStart, onEnd }: {
  value: number; onChange: (t: number) => void; label: string; display: string; onStart?: () => void; onEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
    onStart?.();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const h = ref.current.clientHeight;
    const t = Math.max(0, Math.min(1, drag.current.v - (e.clientY - drag.current.y) / (h * 1.15)));
    onChange(t);
  };
  const onUp = () => {
    if (drag.current) onEnd?.();
    drag.current = null;
  };
  return (
    <div class="vslider" ref={ref} onPointerDown={onDown as any} onPointerMove={onMove as any} onPointerUp={onUp} onPointerCancel={onUp}>
      <div class="fill" style={{ height: `${value * 100}%` }} />
      <div class="knob" style={{ bottom: `calc(${value * 100}% - 2px)` }} />
      <div class="val">{display}</div>
      <div class="cap">{label}</div>
    </div>
  );
}

export function PanelTitle({ title, onClose, children }: { title: string; onClose?: () => void; children?: ComponentChildren }) {
  return (
    <div class="panel-title">
      <span>{title}</span>
      <span class="spacer" />
      {children}
      {onClose && (
        <button class="ibtn sm" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      )}
    </div>
  );
}

let toastFn: ((m: string) => void) | null = null;
export function setToastFn(f: (m: string) => void) { toastFn = f; }
export function toast(m: string) { toastFn?.(m); }

export function fmtDate(t: number) {
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today, ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
