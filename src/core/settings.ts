import type { ToolPreset, Unit } from './types';
import { BRUSHES } from './brushes';
import { uid } from './geom';

export type PencilDoubleTap = 'eraser' | 'last' | 'color' | 'palette' | 'none';
export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  pencilOnly: 'auto' | 'on' | 'off';
  pressureCurve: number; // gamma: <1 softer, >1 firmer
  twoFingerUndo: boolean;
  threeFingerRedo: boolean;
  longPressEyedropper: boolean;
  rotateCanvas: boolean;
  pencilDoubleTap: PencilDoubleTap;
  pencilSqueeze: PencilDoubleTap;
  hoverPreview: boolean;
  theme: Theme;
  leftHanded: boolean;
  scaleBrushWithZoom: boolean;
  liveShapes: boolean;
  shapeHoldMs: number;
  angleSnap: boolean;
  gridSnap: boolean;
  perspectiveSnap: boolean;
  guideSnap: boolean;
  measureOn: boolean;
  defaultUnit: Unit;
  showZoomHud: boolean;
  prediction: boolean;
  toolLayout: 'bar' | 'wheel';
  autoLayerByTool: boolean;
  recentColors: string[];
  palettes: { name: string; colors: string[] }[];
  activePalette: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pencilOnly: 'auto',
  pressureCurve: 1,
  twoFingerUndo: true,
  threeFingerRedo: true,
  longPressEyedropper: true,
  rotateCanvas: true,
  pencilDoubleTap: 'eraser',
  pencilSqueeze: 'palette',
  hoverPreview: true,
  theme: 'auto',
  leftHanded: false,
  scaleBrushWithZoom: true,
  liveShapes: true,
  shapeHoldMs: 450,
  angleSnap: true,
  gridSnap: false,
  perspectiveSnap: true,
  guideSnap: true,
  measureOn: false,
  defaultUnit: 'mm',
  showZoomHud: true,
  prediction: true,
  toolLayout: 'bar',
  autoLayerByTool: false,
  recentColors: [],
  palettes: [],
  activePalette: 0,
};

export function defaultPresets(): ToolPreset[] {
  const mk = (brush: keyof typeof BRUSHES, color: string, size?: number, opacity?: number): ToolPreset => ({
    id: uid('T'),
    brush,
    color,
    size: size ?? BRUSHES[brush].defSize,
    opacity: opacity ?? BRUSHES[brush].defOpacity,
    smoothing: BRUSHES[brush].defSmoothing,
    pressureSize: true,
    pressureOpacity: !!BRUSHES[brush].pressureOpacity,
    nibFollow: BRUSHES[brush].nibFollow,
  });
  return [
    mk('pen', '#1d1f24', 3),
    mk('fineliner', '#2b3a55', 1.6),
    mk('pencil', '#3b3b3b', 3),
    mk('marker', '#a7b4c2', 20, 0.5),
    mk('brush', '#14161a', 12),
    mk('calligraphy', '#1d1f24', 12),
    mk('airbrush', '#5b8fd9', 70, 0.3),
    mk('chisel', '#7fb2a8', 26, 0.55),
    mk('watercolor', '#e0745a', 40, 0.4),
    mk('softEraser', '#ffffff', 60, 0.6),
  ];
}

const KEY = 'draftwell.settings.v1';
const PKEY = 'draftwell.presets.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
export function loadPresets(): ToolPreset[] {
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.filter((p) => p && BRUSHES[p.brush as keyof typeof BRUSHES]);
    }
  } catch {}
  return defaultPresets();
}
export function savePresets(p: ToolPreset[]) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {}
}
