// Original stroke icon set (24x24 grid).
const P: Record<string, string> = {
  gallery: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/>',
  redo: '<path d="m15 7 4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H12"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',
  layers: '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
  precision: '<path d="M4 20 20 4"/><path d="m7 17 1.5 1.5M10 14l1.5 1.5M13 11l1.5 1.5M16 8l1.5 1.5"/><path d="M4 20h5M4 20v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  share: '<path d="M12 15V3.5"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 5 21h14a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 19 11h-1"/>',
  library: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1"/><circle cx="16.75" cy="7.25" r="3.75"/><path d="m7.25 13 4 7.5h-8z"/><path d="M14 14h6.5v6.5H14z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 3.5V15"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17.5v1.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>',
  select: '<path d="M6 4.5c6-1.5 13 .5 13 5 0 3.5-5 5-9 4.5-3-.4-5.5-1.5-5.5-4"/><path d="M4.5 10c-.5-2.5 0-4.5 1.5-5.5"/><path d="M10 14c-1 2-.5 4 1 6.5"/>',
  eraser: '<path d="m14.5 4.5 5 5-9 9h-5l-2-2a1.5 1.5 0 0 1 0-2.1z"/><path d="m9.5 9.5 5 5"/><path d="M10.5 18.5h9"/>',
  nudge: '<path d="M4 15c3-6 6.5-9 9-9s5 2 7 5"/><path d="M13 6v6l3-2"/><circle cx="13" cy="6" r="1.4"/>',
  slice: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 20 17M8.6 15.6 20 7"/>',
  fill: '<path d="m5 11 6.5-6.5 7 7L12 18a2 2 0 0 1-2.8 0L5 13.8A2 2 0 0 1 5 11z"/><path d="M5 11.5h13"/><path d="M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
  text: '<path d="M5 6V4.5h14V6"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
  eyedropper: '<path d="m15.5 4.5 4 4-2 2-4-4z"/><path d="M14 9.5 6 17.5 5 20l2.5-1L15.5 11"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 6c.7-.3 1.4-.5 2.1-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.8 3.4M6.6 7.5A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  trash: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.5h5v2"/><path d="M6.5 6.5l1 13.5h9l1-13.5"/><path d="M10 10v6.5M14 10v6.5"/>',
  duplicate: '<rect x="8" y="8" width="12.5" height="12.5" rx="2"/><path d="M16 8V5.5A2 2 0 0 0 14 3.5H5.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  merge: '<path d="M7 3.5v5a4 4 0 0 0 4 4h0a4 4 0 0 1 4 4v4"/><path d="M17 3.5v5a4 4 0 0 1-4 4"/><path d="m12 17.5 3 3 3-3"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  flipH: '<path d="M12 3v18"/><path d="M9 7 3.5 17H9z"/><path d="M15 7l5.5 10H15z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 9 17 3.5V9z"/><path d="M7 15l10 5.5V15z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4h-4"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M4 15.5V5.5A1.5 1.5 0 0 1 5.5 4h10"/>',
  back: '<rect x="4" y="4" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-10"/>',
  copy: '<rect x="8" y="8" width="12.5" height="12.5" rx="2"/><path d="M5.5 16A2 2 0 0 1 3.5 14V5.5a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2"/>',
  cut: '<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M7.7 15.7 17 3.5M16.3 15.7 7 3.5"/>',
  paste: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3.5h6V5"/><path d="M9 11h6M9 15h4"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  line: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
  rect: '<rect x="3.5" y="6" width="17" height="12" rx=".5"/>',
  polygon: '<path d="m12 3.5 8 5.8-3 9.2H7l-3-9.2z"/>',
  arc: '<path d="M4 18a8 8 0 0 1 16 0"/>',
  curve: '<path d="M3.5 18c3-12 8-12 8.5-6s5.5 6 8.5-6"/>',
  protractor: '<path d="M3 17a9 9 0 0 1 18 0z"/><path d="M12 17 7 10.5M12 17l5-6.5M12 17V9"/>',
  perspective: '<path d="M2.5 9h19"/><path d="M12 9 3 20M12 9l9 11M12 9v11M12 9 7.5 20M12 9l4.5 11"/>',
  measure: '<rect x="2.5" y="8" width="19" height="8" rx="1"/><path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5"/>',
  magnet: '<path d="M6 4.5v7a6 6 0 0 0 12 0v-7"/><path d="M6 8.5h3.5M14.5 8.5H18"/><path d="M9.5 4.5v7a2.5 2.5 0 0 0 5 0v-7"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
  shape: '<path d="M4 17.5c3.5-8 9-10 16-10"/><path d="m16 5 4 2.5-2.5 4"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.7-1.4.2-2.8 1.8-2.8h1.8a3.5 3.5 0 0 0 3.5-3.5c0-4.7-3.8-8.5-8.5-8.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  pencilOnly: '<path d="m15.5 4.5 4 4L9 19H5v-4z"/><path d="m13 7 4 4"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7S5 17.5 4 15l-1-2.5a1.5 1.5 0 0 1 2.7-1.3L8 14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  folder: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5 4.5 4"/>',
  file: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/>',
  artboard: '<rect x="6" y="6" width="12" height="12"/><path d="M6 2.5v3M18 2.5v3M6 18.5v3M18 18.5v3M2.5 6h3M2.5 18h3M18.5 6h3M18.5 18h3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>',
  swap: '<path d="M7 4.5 3.5 8 7 11.5"/><path d="M3.5 8h13"/><path d="m17 12.5 3.5 3.5-3.5 3.5"/><path d="M20.5 16h-13"/>',
  restyle: '<path d="M4 20c2-5 5-8 8-8"/><path d="m14.5 4.5 5 5-6 6-5-5z"/>',
  transform: '<rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="2.5 2.5"/><rect x="3" y="3" width="4" height="4" rx=".8"/><rect x="17" y="17" width="4" height="4" rx=".8"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8M8 10.5h5M10.5 8v5"/>',
};

export function Icon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      class={'icon ' + (className || '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      dangerouslySetInnerHTML={{ __html: P[name] || '' }}
    />
  );
}

/** Brush tip glyphs: a vertical tool body with a coloured tip, drawn per brush type. */
export function BrushGlyph({ brush, color, size = 34 }: { brush: string; color: string; size?: number }) {
  const tip: Record<string, string> = {
    pen: 'M12 2 9.6 9h4.8z',
    fineliner: 'M11.2 1.5h1.6V9h-1.6z',
    pencil: 'M12 1.5 9 9h6z',
    marker: 'M9 3.5 15 2v7H9z',
    brush: 'M12 1C9 4 9.5 7 10 9h4c.5-2 1-5-2-8z',
    calligraphy: 'M9 3 15 5.5V9H9z',
    airbrush: 'M10.5 6.5h3V9h-3zM12 1.5a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
    watercolor: 'M12 1.5c-2 2.5-2.6 4.6-2.2 7.5h4.4c.4-2.9-.2-5-2.2-7.5z',
    softEraser: 'M9 3.5a3 3 0 0 1 6 0V9H9z',
  };
  const isEraser = brush === 'softEraser';
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 24 38" class="brush-glyph">
      <path d="M8.5 9h7l1 4v24.5h-9V13z" fill="var(--tool-body)" stroke="var(--tool-edge)" stroke-width="0.8" />
      <path d={tip[brush] || tip.pen} fill={isEraser ? '#f2b8c0' : color} stroke="var(--tool-edge)" stroke-width="0.6" />
      <rect x="7.5" y="16" width="9" height="3" rx="0.6" fill={isEraser ? '#f2b8c0' : color} opacity="0.9" />
    </svg>
  );
}
