import type { BrushKind } from './types';

export type RenderStyle = 'solid' | 'pencil' | 'marker' | 'air' | 'water' | 'nib' | 'softErase';

export interface BrushDef {
  kind: BrushKind;
  label: string;
  style: RenderStyle;
  /** Width multiplier at pressure 0 and pressure 1. */
  pmin: number;
  pmax: number;
  /** Taper length as multiple of size, 0 = none. */
  taper: number;
  /** Opacity range driven by pressure (when pressure-opacity enabled). */
  omin: number;
  minSize: number;
  maxSize: number;
  defSize: number;
  defOpacity: number;
  defSmoothing: number;
  tilt: boolean;
  /** Grain strength for textured styles (0..1). */
  grain?: number;
  /** Composite with multiply (markers, highlighters). */
  multiply?: boolean;
  /** Default flat-nib angle. */
  nibAngle?: number;
  /** Width of the nib's thin side, relative to its broad side. */
  nibThin?: number;
  /** Default for "nib follows pencil". */
  nibFollow?: boolean;
  /** Pressure drives opacity by default. */
  pressureOpacity?: boolean;
}

export const BRUSHES: Record<BrushKind, BrushDef> = {
  pen: { kind: 'pen', label: 'Pen', style: 'solid', pmin: 0.35, pmax: 1, taper: 0, omin: 1, minSize: 0.5, maxSize: 60, defSize: 3, defOpacity: 1, defSmoothing: 0.35, tilt: false },
  fineliner: { kind: 'fineliner', label: 'Fine Liner', style: 'solid', pmin: 1, pmax: 1, taper: 0, omin: 1, minSize: 0.3, maxSize: 40, defSize: 2, defOpacity: 1, defSmoothing: 0.4, tilt: false },
  pencil: { kind: 'pencil', label: 'Pencil', style: 'pencil', pmin: 0.55, pmax: 1, taper: 0.6, omin: 0.18, minSize: 0.5, maxSize: 40, defSize: 3, defOpacity: 0.9, defSmoothing: 0.2, tilt: true, grain: 0.75, pressureOpacity: true },
  marker: { kind: 'marker', label: 'Marker', style: 'marker', pmin: 0.75, pmax: 1, taper: 0, omin: 1, minSize: 2, maxSize: 120, defSize: 18, defOpacity: 0.55, defSmoothing: 0.4, tilt: false, multiply: true },
  brush: { kind: 'brush', label: 'Brush', style: 'solid', pmin: 0.06, pmax: 1, taper: 2.2, omin: 1, minSize: 1, maxSize: 160, defSize: 12, defOpacity: 1, defSmoothing: 0.5, tilt: false },
  calligraphy: { kind: 'calligraphy', label: 'Calligraphy', style: 'nib', pmin: 0.4, pmax: 1, taper: 0, omin: 1, minSize: 2, maxSize: 120, defSize: 14, defOpacity: 1, defSmoothing: 0.45, tilt: false, nibAngle: -Math.PI / 4, nibThin: 0.12 },
  chisel: { kind: 'chisel', label: 'Chisel Marker', style: 'nib', pmin: 0.8, pmax: 1, taper: 0, omin: 1, minSize: 4, maxSize: 160, defSize: 24, defOpacity: 0.6, defSmoothing: 0.4, tilt: false, multiply: true, nibAngle: -Math.PI / 3, nibThin: 0.32, nibFollow: true },
  highlighter: { kind: 'highlighter', label: 'Highlighter', style: 'nib', pmin: 1, pmax: 1, taper: 0, omin: 1, minSize: 6, maxSize: 160, defSize: 28, defOpacity: 0.4, defSmoothing: 0.6, tilt: false, multiply: true, nibAngle: Math.PI / 2, nibThin: 0.3 },
  charcoal: { kind: 'charcoal', label: 'Charcoal', style: 'pencil', pmin: 0.45, pmax: 1, taper: 0.4, omin: 0.25, minSize: 2, maxSize: 120, defSize: 12, defOpacity: 0.9, defSmoothing: 0.25, tilt: true, grain: 0.95, pressureOpacity: true },
  crayon: { kind: 'crayon', label: 'Crayon', style: 'pencil', pmin: 0.7, pmax: 1, taper: 0.2, omin: 0.45, minSize: 2, maxSize: 80, defSize: 9, defOpacity: 1, defSmoothing: 0.3, tilt: true, grain: 0.85, pressureOpacity: true },
  airbrush: { kind: 'airbrush', label: 'Airbrush', style: 'air', pmin: 0.5, pmax: 1, taper: 0, omin: 0.15, minSize: 6, maxSize: 400, defSize: 60, defOpacity: 0.35, defSmoothing: 0.5, tilt: false },
  watercolor: { kind: 'watercolor', label: 'Watercolor', style: 'water', pmin: 0.4, pmax: 1, taper: 0.8, omin: 1, minSize: 4, maxSize: 300, defSize: 36, defOpacity: 0.45, defSmoothing: 0.55, tilt: false },
  softEraser: { kind: 'softEraser', label: 'Soft Eraser', style: 'softErase', pmin: 0.5, pmax: 1, taper: 0, omin: 0.2, minSize: 6, maxSize: 400, defSize: 50, defOpacity: 0.6, defSmoothing: 0.4, tilt: false },
};

export const BRUSH_ORDER: BrushKind[] = ['pen', 'fineliner', 'pencil', 'charcoal', 'crayon', 'marker', 'chisel', 'highlighter', 'brush', 'calligraphy', 'airbrush', 'watercolor', 'softEraser'];

/** Nib angle used by the calligraphy brush (radians). */
export const NIB_ANGLE = -Math.PI / 4;
