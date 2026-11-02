import type { AppCtx, Ptr, Tool } from './context';
import type { Mat } from '../core/types';
import { rgbToHex } from '../render/color';

export function sampleColor(app: AppCtx, x: number, y: number): string | null {
  const r = app.renderer;
  const c = r.compositeCanvas(true);
  const ctx = c.getContext('2d')!;
  const px = Math.round(x * r.dpr), py = Math.round(y * r.dpr);
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
  const d = ctx.getImageData(px, py, 1, 1).data;
  return rgbToHex(d[0], d[1], d[2]);
}

/** Applies a picked colour to whatever the current colour target is. */
export function applyPickedColor(app: AppCtx, color: string) {
  const ed = app.editor;
  if (ed.tool === 'fill') ed.fillColor = color;
  else {
    const i = ed.tool === 'draw' ? ed.activePreset : ed.lastDrawPreset;
    ed.updatePreset({ color }, i);
  }
  ed.addRecentColor(color);
  ed.emit('ui');
}

export class EyedropperTool implements Tool {
  private cur: Ptr | null = null;
  private color: string | null = null;
  private snapshot: HTMLCanvasElement | null = null;
  constructor(private app: AppCtx) {}
  busy() { return !!this.cur; }
  private sample(p: Ptr) {
    if (!this.snapshot) this.snapshot = this.app.renderer.compositeCanvas(true);
    const r = this.app.renderer;
    const ctx = this.snapshot.getContext('2d')!;
    const px = Math.round(p.x * r.dpr), py = Math.round(p.y * r.dpr);
    if (px < 0 || py < 0 || px >= this.snapshot.width || py >= this.snapshot.height) return;
    const d = ctx.getImageData(px, py, 1, 1).data;
    this.color = rgbToHex(d[0], d[1], d[2]);
  }
  down(p: Ptr) { this.cur = p; this.snapshot = null; this.sample(p); this.app.renderer.requestOverlay(); }
  move(p: Ptr) { this.cur = p; this.sample(p); this.app.renderer.requestOverlay(); }
  up() {
    if (this.color) applyPickedColor(this.app, this.color);
    this.cur = null;
    this.snapshot = null;
    const ed = this.app.editor;
    // return to previous tool after a pick, like a one-shot picker
    ed.setTool(ed.prevTool === 'eyedropper' ? 'draw' : ed.prevTool);
    this.app.renderer.requestOverlay();
  }
  cancel() { this.cur = null; this.snapshot = null; }
  overlay(ctx: CanvasRenderingContext2D, _v: Mat) {
    if (!this.cur || !this.color) return;
    drawLoupe(ctx, this.cur.x, this.cur.y, this.color);
  }
}

export function drawLoupe(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const cy = y - 70;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, cy, 34, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, cy, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(x, cy, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
  ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
  ctx.stroke();
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeText(color.toUpperCase(), x, cy + 52);
  ctx.fillText(color.toUpperCase(), x, cy + 52);
  ctx.textAlign = 'left';
}
