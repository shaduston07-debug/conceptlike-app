import type { Editor } from '../core/editor';
import type { Renderer } from '../render/renderer';
import type { Mat } from '../core/types';
import type { P } from '../core/geom';

export interface Ptr {
  x: number; // screen css px (relative to canvas host)
  y: number;
  wx: number; // world
  wy: number;
  p: number; // pressure 0..1 (curve applied)
  tilt: number; // 0 upright .. 1 flat
  az: number | null; // pencil azimuth in screen space (radians), null if unknown
  type: 'pen' | 'touch' | 'mouse';
  t: number;
  shift?: boolean;
  alt?: boolean;
}

export interface AppCtx {
  editor: Editor;
  renderer: Renderer;
  toWorld(x: number, y: number): P;
  toScreen(x: number, y: number): P;
  toast(msg: string): void;
  zoom(): number;
}

export interface Tool {
  down(p: Ptr): void;
  move(p: Ptr, batch: Ptr[], predicted?: Ptr[]): void;
  up(p: Ptr): void;
  cancel(): void;
  hover?(p: Ptr | null): void;
  overlay?(ctx: CanvasRenderingContext2D, view: Mat): void;
  /** Two-finger gesture support (e.g. transforming a selection). */
  wantsGesture?(pts: P[]): boolean;
  gesture?(screenM: Mat): void;
  gestureEnd?(): void;
  deactivate?(): void;
  /** True while an interaction is in progress. */
  busy?(): boolean;
}

export interface Handle {
  x: number; // screen
  y: number;
  r?: number;
  drag(p: Ptr, start: Ptr): void;
  end(): void;
}

export interface HandleProvider {
  handles(): Handle[];
}
