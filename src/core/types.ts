// Core data model for Inkfinity documents.
// Items are treated as immutable: any edit produces a new object. This keeps
// undo/redo trivial and lets the renderer cache derived geometry per object.

export type Mat = [number, number, number, number, number, number]; // a b c d e f

export type BrushKind =
  | 'pen'
  | 'fineliner'
  | 'pencil'
  | 'marker'
  | 'brush'
  | 'calligraphy'
  | 'airbrush'
  | 'watercolor'
  | 'chisel'
  | 'highlighter'
  | 'charcoal'
  | 'crayon'
  | 'softEraser';

export type ShapeMeta =
  | { type: 'line'; pts: number[] }
  | { type: 'polyline'; pts: number[]; closed: boolean }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number }
  | { type: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number }
  | { type: 'bezier'; pts: number[] }; // cubic: x0 y0 x1 y1 x2 y2 x3 y3

export interface StrokeItem {
  kind: 'stroke';
  id: string;
  brush: BrushKind;
  color: string; // #rrggbb
  opacity: number; // 0..1
  size: number; // world units diameter at full pressure
  /** Flat array: x, y, pressure, tilt(0..1, 0 = upright) repeated. */
  pts: number[];
  seed: number;
  shape?: ShapeMeta;
  /** Nib angle (radians, world space) for flat-nib brushes. */
  nib?: number;
  /** Pressure drives opacity. */
  po?: boolean;
  /** Taper override (multiple of size). */
  taper?: number;
  /** Pressure does not affect size. */
  nps?: boolean;
}

export interface FillItem {
  kind: 'fill';
  id: string;
  color: string;
  opacity: number;
  /** Polygons as flat x,y arrays; rendered with even-odd rule. */
  polys: number[][];
}

export interface ImageItem {
  kind: 'image';
  id: string;
  src: string; // data URL
  w: number;
  h: number;
  m: Mat; // local (0..w, 0..h) -> world
  opacity: number;
}

export interface TextItem {
  kind: 'text';
  id: string;
  text: string;
  font: string; // css family
  size: number;
  weight: number;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  opacity: number;
  m: Mat; // local -> world; local origin = top-left of the text box
}

export type Item = StrokeItem | FillItem | ImageItem | TextItem;

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  items: Item[];
}

export type PaperKind = 'blank' | 'dots' | 'grid' | 'lines' | 'iso' | 'graph';

export interface Background {
  color: string;
  paper: PaperKind;
  gridSize: number; // world units
  gridColor: string;
  gridOpacity: number;
  exportGrid: boolean;
}

export type PerspectiveMode = 'none' | '1pt' | '2pt' | '3pt';

export interface Perspective {
  mode: PerspectiveMode;
  vps: { x: number; y: number }[]; // world coordinates
  horizon: number; // world y of horizon (1pt/2pt)
  density: number; // number of rays
  visible: boolean;
}

export type Unit = 'px' | 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'pt';

export interface Measure {
  unit: Unit;
  /** How many `unit`s one world unit represents. */
  perWorld: number;
  precision: number;
}

export interface Artboard {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

export interface DocView {
  m: Mat; // world -> screen (CSS px)
}

export type GuideKind = 'line' | 'circle' | 'ellipse' | 'rect' | 'arc' | 'curve' | 'polygon' | 'protractor';

export interface Guide {
  kind: GuideKind;
  /** Control points in world space. Meaning depends on kind. */
  pts: number[];
  sides?: number;
  infinite?: boolean;
}

export interface DrawingDoc {
  id: string;
  version: number;
  name: string;
  project: string; // '' = none
  created: number;
  modified: number;
  layers: Layer[];
  activeLayer: string;
  background: Background;
  perspective: Perspective;
  measure: Measure;
  artboard: Artboard | null;
  view: DocView;
  guide: Guide | null;
  /** Printable page frame placed on the infinite canvas (export to paper sizes). */
  page?: PageFrame | null;
}

export interface PageFrame {
  preset: string; // e.g. 'A4', 'Custom'
  wmm: number; // portrait width in mm
  hmm: number; // portrait height in mm
  landscape: boolean;
  x: number; // world centre
  y: number;
  /** Print scale: 1 = 100% (one world unit = 1/96 inch on paper). */
  scale: number;
  dpi: number;
  visible: boolean;
}

export interface DocMeta {
  id: string;
  name: string;
  project: string;
  created: number;
  modified: number;
  thumb: string; // data URL
  artboard: { w: number; h: number } | null;
}

export interface ToolPreset {
  id: string;
  brush: BrushKind;
  color: string;
  size: number;
  opacity: number;
  smoothing: number; // 0..1
  pressureSize: boolean;
  pressureOpacity: boolean;
  name?: string;
  /** Taper override; undefined = brush default. */
  taper?: number;
  /** Flat nibs follow the Apple Pencil's azimuth. */
  nibFollow?: boolean;
}

export type ToolId =
  | 'draw'
  | 'eraser'
  | 'select'
  | 'nudge'
  | 'slice'
  | 'fill'
  | 'text'
  | 'eyedropper';

export type EraserMode = 'partial' | 'stroke';
export type SelectMode = 'lasso' | 'tap' | 'rect';
export type SliceMode = 'trim' | 'cut';
