import type { AppCtx, Handle, Ptr, Tool } from './context';
import type { Mat, ToolId } from '../core/types';
import { inv, apply, mul, translate, rotate, scale, matScale, matRot, normAngle } from '../core/geom';
import { collectHandles } from './handles';
import { sampleColor, applyPickedColor, drawLoupe } from './eyedropper';

interface TP { id: number; x: number; y: number; sx: number; sy: number; t: number; type: string }

// 0.05% … 1,000,000% — geometry is double precision and rendered origin-relative, so detail holds.
export const MIN_ZOOM = 0.0005;
export const MAX_ZOOM = 10000;

/**
 * Routes pointer input: pen/finger drawing, multi-touch navigation, taps for undo/redo,
 * long-press colour picking, on-canvas handles and hover.
 */
export class InputController {
  private touches = new Map<number, TP>();
  private toolPtr: number | null = null;
  private toolStarted = 0;
  private gesture: null | {
    ids: number[];
    startView: Mat;
    p0: { x: number; y: number }[];
    selection: boolean;
    maxTouches: number;
    start: number;
    moved: boolean;
  } = null;
  private tapCandidate: { n: number; start: number; moved: boolean } | null = null;
  private panPtr: { id: number; x: number; y: number; startView: Mat; t?: number } | null = null;
  private tapSeq: { n: number; t: number; x: number; y: number } | null = null;
  private tapTimer = 0;
  private handleDrag: { h: Handle; start: Ptr; id: number } | null = null;
  private longPressTimer = 0;
  private picking: { id: number; x: number; y: number; color: string | null } | null = null;
  private spaceDown = false;
  editPerspective = false;
  private lastPenTime = 0;
  /** Last known pencil position (hover or contact), for palettes that open at the tip. */
  lastPen: { x: number; y: number } | null = null;

  constructor(private app: AppCtx, private el: HTMLElement, private getTool: () => Tool, private onViewTap?: () => void, private onCanvasDown?: () => void) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onCancel, { passive: false });
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    // stop Safari's own gestures (pinch zoom, magnifier, callouts)
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    el.addEventListener('gesturestart', stop as any);
    el.addEventListener('gesturechange', stop as any);
    el.addEventListener('contextmenu', stop);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pencil-double-tap', this.onPencilDoubleTap as any);
    window.addEventListener('pencil-squeeze', this.onPencilSqueeze as any);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pencil-double-tap', this.onPencilDoubleTap as any);
    window.removeEventListener('pencil-squeeze', this.onPencilSqueeze as any);
  }

  private get ed() { return this.app.editor; }

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toPtr(e: PointerEvent): Ptr {
    const { x, y } = this.local(e);
    const w = this.app.toWorld(x, y);
    const type = e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse';
    let p = 0.5;
    if (type === 'pen') {
      p = e.pressure;
      const g = this.ed.settings.pressureCurve;
      p = Math.pow(Math.max(0, Math.min(1, p)), g);
    } else if (type === 'touch') p = 0.55;
    let tilt = 0;
    let az: number | null = null;
    if (type === 'pen') {
      const ae = e as any;
      if (typeof ae.azimuthAngle === 'number' && (ae.altitudeAngle ?? 1.57) < 1.45) az = ae.azimuthAngle;
      else if (e.tiltX || e.tiltY) az = Math.atan2(e.tiltY, e.tiltX);
      const anyE = e as any;
      if (typeof anyE.altitudeAngle === 'number' && anyE.altitudeAngle > 0) tilt = 1 - anyE.altitudeAngle / (Math.PI / 2);
      else if (e.tiltX || e.tiltY) {
        const tx = Math.tan((e.tiltX * Math.PI) / 180), ty = Math.tan((e.tiltY * Math.PI) / 180);
        const alt = Math.atan(1 / Math.sqrt(tx * tx + ty * ty));
        tilt = 1 - alt / (Math.PI / 2);
      }
      tilt = Math.max(0, Math.min(1, (tilt - 0.25) / 0.6));
    }
    return { x, y, wx: w.x, wy: w.y, p, tilt, az, type, t: e.timeStamp, shift: e.shiftKey, alt: e.altKey };
  }

  private coalesced(e: PointerEvent): Ptr[] {
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (!list || !list.length) return [this.toPtr(e)];
    return list.map((c) => this.toPtr(c));
  }

  private drawsWith(type: string): boolean {
    if (type === 'pen' || type === 'mouse') return true;
    return !this.ed.usePencilOnly;
  }

  private hitHandle(p: Ptr): Handle | null {
    const hs = collectHandles(this.app, this.editPerspective);
    let best: Handle | null = null, bd = p.type === 'mouse' ? 12 : 26;
    for (const h of hs) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch {}
    const ed = this.ed;
    if (e.pointerType === 'pen') {
      this.lastPenTime = performance.now();
      this.lastPen = this.local(e);
      if (!ed.pencilDetected) {
        ed.pencilDetected = true;
        ed.emit('ui');
      }
    }
    // Ignore touches that arrive while the pencil is drawing (palm rejection).
    if (e.pointerType === 'touch' && this.toolPtr !== null && this.touches.size === 0 && this.isPenTool()) return;
    if (e.pointerType === 'touch' && this.touches.size === 0 && performance.now() - this.lastPenTime < 300) return;
    const p = this.toPtr(e);
    this.onCanvasDown?.();

    if (ed.textEdit && ed.tool !== 'text') { ed.textEdit = null; ed.emit('ui'); }

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), type: 'touch' });
      const n = this.touches.size;
      if (n === 1) this.tapCandidate = null;
      if (n >= 2) {
        // second finger: cancel a just-started finger stroke and begin navigation
        if (this.toolPtr !== null && this.toolIsTouch) {
          const t = this.touches.get(this.toolPtr);
          const young = performance.now() - this.toolStarted < 260;
          const still = t ? Math.hypot(t.x - t.sx, t.y - t.sy) < 40 : true;
          if (young || still) {
            this.getTool().cancel();
            this.toolPtr = null;
          } else return; // keep drawing, ignore extra finger
        }
        this.cancelLongPress();
        if (this.picking) { this.picking = null; this.app.renderer.requestOverlay(); }
        this.panPtr = null;
        if (this.handleDrag) { this.handleDrag.h.end(); this.handleDrag = null; }
        this.startGesture();
        return;
      }
    }

    // mouse: middle/right button or space = pan
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || this.spaceDown)) {
      this.panPtr = { id: e.pointerId, x: p.x, y: p.y, startView: ed.doc.view.m };
      return;
    }

    // on-canvas handles take priority
    const h = this.hitHandle(p);
    if (h) {
      this.handleDrag = { h, start: p, id: e.pointerId };
      return;
    }

    if (!this.drawsWith(p.type)) {
      // pencil-only mode: one finger pans; long-press picks colour
      this.panPtr = { id: e.pointerId, x: p.x, y: p.y, startView: ed.doc.view.m, t: performance.now() };
      this.armLongPress(e.pointerId, p);
      return;
    }

    if (this.toolPtr !== null) return;
    this.toolPtr = e.pointerId;
    this.toolIsTouch = p.type === 'touch';
    this.toolStarted = performance.now();
    if (p.type === 'touch') this.armLongPress(e.pointerId, p);
    this.getTool().down(p);
  };
  private toolIsTouch = false;

  private isPenTool() {
    return !this.toolIsTouch;
  }

  private armLongPress(id: number, p: Ptr) {
    this.cancelLongPress();
    if (!this.ed.settings.longPressEyedropper) return;
    this.longPressTimer = window.setTimeout(() => {
      // cancel whatever the finger was doing and start picking
      if (this.toolPtr === id) {
        this.getTool().cancel();
        this.toolPtr = null;
      }
      if (this.panPtr && this.panPtr.id === id) {
        this.ed.setView(this.panPtr.startView);
        this.panPtr = null;
      }
      const t = this.touches.get(id);
      const x = t ? t.x : p.x, y = t ? t.y : p.y;
      this.picking = { id, x, y, color: sampleColor(this.app, x, y) };
      this.app.renderer.requestOverlay();
    }, 520);
  }
  private cancelLongPress() {
    clearTimeout(this.longPressTimer);
    this.longPressTimer = 0;
  }

  private startGesture() {
    const ids = [...this.touches.keys()].slice(0, 2);
    const pts = ids.map((id) => ({ x: this.touches.get(id)!.x, y: this.touches.get(id)!.y }));
    const tool = this.getTool();
    const selection = !!(tool.wantsGesture && tool.wantsGesture(pts));
    const prev = this.gesture;
    this.gesture = {
      ids,
      startView: this.ed.doc.view.m,
      p0: pts,
      selection,
      maxTouches: Math.max(this.touches.size, prev?.maxTouches || 0),
      start: prev?.start ?? performance.now(),
      moved: prev?.moved ?? false,
    };
    if (!this.tapCandidate) this.tapCandidate = { n: this.touches.size, start: performance.now(), moved: false };
    else this.tapCandidate.n = Math.max(this.tapCandidate.n, this.touches.size);
  }

  private gestureMatrix(): Mat | null {
    const g = this.gesture!;
    const a = this.touches.get(g.ids[0]), b = this.touches.get(g.ids[1]);
    if (!a || !b) return null;
    const [p0, p1] = g.p0;
    const c0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const c1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d0 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const d1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let s = d1 / d0;
    let r = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x);
    if (!g.selection && !this.ed.settings.rotateCanvas) r = 0;
    // translate(c1) * rotate(r) * scale(s) * translate(-c0)
    return mul(translate(c1.x, c1.y), mul(rotate(r), mul(scale(s), translate(-c0.x, -c0.y))));
  }

  private onMove = (e: PointerEvent) => {
    e.preventDefault();
    const ed = this.ed;
    // hover (Apple Pencil hover / mouse without buttons)
    if (e.buttons === 0 && (e.pointerType === 'pen' || e.pointerType === 'mouse') && this.toolPtr === null && !this.handleDrag && !this.panPtr) {
      const t = this.getTool();
      const hp = this.toPtr(e);
      if (e.pointerType === 'pen') this.lastPen = { x: hp.x, y: hp.y };
      if (t.hover) t.hover(hp);
      return;
    }
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (t) {
        const { x, y } = this.local(e);
        t.x = x; t.y = y;
        if (Math.hypot(x - t.sx, y - t.sy) > 10) {
          if (this.tapCandidate) this.tapCandidate.moved = true;
          if (this.longPressTimer && (this.toolPtr === e.pointerId || this.panPtr?.id === e.pointerId)) this.cancelLongPress();
        }
      }
    }
    if (this.picking && this.picking.id === e.pointerId) {
      const { x, y } = this.local(e);
      this.picking = { ...this.picking, x, y, color: sampleColor(this.app, x, y) };
      this.app.renderer.requestOverlay();
      return;
    }
    if (this.gesture && this.touches.has(e.pointerId)) {
      const m = this.gestureMatrix();
      if (!m) return;
      if (this.gesture.selection) {
        this.getTool().gesture?.(m);
      } else {
        let v = mul(m, this.gesture.startView);
        v = this.clampView(v, true);
        ed.setView(v);
      }
      return;
    }
    if (this.handleDrag && this.handleDrag.id === e.pointerId) {
      this.handleDrag.h.drag(this.toPtr(e), this.handleDrag.start);
      return;
    }
    if (this.panPtr && this.panPtr.id === e.pointerId) {
      const { x, y } = this.local(e);
      ed.setView(mul(translate(x - this.panPtr.x, y - this.panPtr.y), this.panPtr.startView));
      return;
    }
    if (this.toolPtr === e.pointerId) {
      const batch = this.coalesced(e);
      let predicted: Ptr[] = [];
      if (this.ed.settings.prediction && e.pointerType === 'pen' && typeof (e as any).getPredictedEvents === 'function') {
        try { predicted = ((e as any).getPredictedEvents() as PointerEvent[]).map((c) => this.toPtr(c)); } catch {}
      }
      this.getTool().move(batch[batch.length - 1], batch, predicted);
    }
  };

  private clampView(v: Mat, snapRotation: boolean): Mat {
    let z = matScale(v);
    const rect = this.el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    if (z < MIN_ZOOM || z > MAX_ZOOM) {
      const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      v = mul(translate(cx, cy), mul(scale(target / z), mul(translate(-cx, -cy), v)));
      z = target;
    }
    if (snapRotation) {
      const r = matRot(v);
      const snapTo = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(normAngle(r - snapTo)) < (4 * Math.PI) / 180 && Math.abs(normAngle(r - snapTo)) > 1e-9) {
        // rotate about screen centre to exact angle
        v = mul(translate(cx, cy), mul(rotate(snapTo - r), mul(translate(-cx, -cy), v)));
      }
    }
    return v;
  }

  private onUp = (e: PointerEvent) => {
    e.preventDefault();
    if (e.pointerType === 'pen') this.lastPenTime = performance.now();
    const ed = this.ed;
    if (this.picking && this.picking.id === e.pointerId) {
      if (this.picking.color) {
        applyPickedColor(this.app, this.picking.color);
        this.app.toast('Picked ' + this.picking.color.toUpperCase());
      }
      this.picking = null;
      this.touches.delete(e.pointerId);
      this.app.renderer.requestOverlay();
      return;
    }
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      if (this.gesture) {
        if (this.gesture.ids.includes(e.pointerId)) {
          if (this.gesture.selection) this.getTool().gestureEnd?.();
          this.gesture = null;
          // continue with remaining two fingers
          if (this.touches.size >= 2) this.startGesture();
        }
        if (this.touches.size === 0) this.finishTap();
        return;
      }
      if (this.touches.size === 0 && this.tapCandidate) this.finishTap();
    }
    if (this.handleDrag && this.handleDrag.id === e.pointerId) {
      this.handleDrag.h.end();
      this.handleDrag = null;
      return;
    }
    if (this.panPtr && this.panPtr.id === e.pointerId) {
      const l = this.local(e);
      const moved = Math.hypot(l.x - this.panPtr.x, l.y - this.panPtr.y) > 8;
      const quick = performance.now() - (this.panPtr.t ?? 0) < 300;
      const isTouch = e.pointerType === 'touch';
      if (moved) this.tapSeq = null;
      this.panPtr = null;
      this.cancelLongPress();
      if (!moved && isTouch && quick) this.registerTap(l.x, l.y);
      else if (!moved) this.onViewTap?.();
      return;
    }
    if (this.toolPtr === e.pointerId) {
      this.cancelLongPress();
      this.toolPtr = null;
      // with finger drawing on, a quick still tap is a gesture (double/triple tap), not a dot
      if (e.pointerType === 'touch' && (ed.tool === 'draw' || ed.tool === 'eraser') && (ed.settings.doubleTapUndo || ed.settings.tripleTapRedo)) {
        const l = this.local(e);
        const t = this.touches.get(e.pointerId);
        const sx = t ? t.sx : l.x, sy = t ? t.sy : l.y;
        if (performance.now() - this.toolStarted < 250 && Math.hypot(l.x - sx, l.y - sy) < 8) {
          this.getTool().cancel();
          this.registerTap(l.x, l.y);
          return;
        }
      }
      this.getTool().up(this.toPtr(e));
    }
    void ed;
  };

  /** One-finger tap sequences: 1 = dismiss panels, 2 = undo, 3 = redo. */
  private registerTap(x: number, y: number) {
    const now = performance.now();
    const s = this.ed.settings;
    const sq = this.tapSeq;
    if (sq && now - sq.t < 350 && Math.hypot(x - sq.x, y - sq.y) < 60) {
      sq.n++;
      sq.t = now;
    } else this.tapSeq = { n: 1, t: now, x, y };
    clearTimeout(this.tapTimer);
    const n = this.tapSeq!.n;
    const resolve = () => {
      const count = this.tapSeq?.n ?? 0;
      this.tapSeq = null;
      if (count === 1) this.onViewTap?.();
      else if (count === 2 && s.doubleTapUndo) { this.ed.undo(); this.app.toast('Undo'); }
      else if (count >= 3) {
        if (s.tripleTapRedo) { this.ed.redo(); this.app.toast('Redo'); }
        else if (s.doubleTapUndo) { this.ed.undo(); this.app.toast('Undo'); }
      }
    };
    if (n >= 3) resolve();
    else if (n === 2 && !s.tripleTapRedo) resolve();
    else this.tapTimer = window.setTimeout(resolve, 320);
  }

  private finishTap() {
    const tc = this.tapCandidate;
    this.tapCandidate = null;
    if (!tc) return;
    const dur = performance.now() - tc.start;
    if (tc.moved || dur > 320) return;
    const s = this.ed.settings;
    if (tc.n === 2 && s.twoFingerUndo) {
      this.ed.undo();
      this.app.toast('Undo');
    } else if (tc.n === 3 && s.threeFingerRedo) {
      this.ed.redo();
      this.app.toast('Redo');
    }
  }

  private onCancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.toolPtr === e.pointerId) {
      this.toolPtr = null;
      this.getTool().cancel();
    }
    if (this.gesture && this.touches.size < 2) {
      if (this.gesture.selection) this.getTool().gestureEnd?.();
      this.gesture = null;
    }
    if (this.handleDrag?.id === e.pointerId) { this.handleDrag.h.end(); this.handleDrag = null; }
    if (this.panPtr?.id === e.pointerId) this.panPtr = null;
    if (this.picking?.id === e.pointerId) this.picking = null;
    this.cancelLongPress();
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      const t = this.getTool();
      if (t.hover && this.toolPtr === null) t.hover(null);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const ed = this.ed;
    const { x, y } = (() => { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; })();
    let v = ed.doc.view.m;
    if (e.ctrlKey || e.metaKey) {
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      v = mul(translate(x, y), mul(scale(k), mul(translate(-x, -y), v)));
    } else if (e.altKey) {
      v = mul(translate(x, y), mul(rotate(e.deltaY * 0.003), mul(translate(-x, -y), v)));
    } else {
      v = mul(translate(-e.deltaX, -e.deltaY), v);
    }
    ed.setView(this.clampView(v, false));
  };

  /** Draw input-related overlay (colour loupe). */
  overlay(ctx: CanvasRenderingContext2D) {
    if (this.picking && this.picking.color) drawLoupe(ctx, this.picking.x, this.picking.y, this.picking.color);
  }

  private onPencilDoubleTap = () => this.pencilAction(this.ed.settings.pencilDoubleTap);
  private onPencilSqueeze = () => this.pencilAction(this.ed.settings.pencilSqueeze);

  private pencilAction(action: string) {
    const ed = this.ed;
    switch (action) {
      case 'palette':
        window.dispatchEvent(new CustomEvent('quick-palette', { detail: this.lastPen }));
        break;
      case 'eraser':
        if (ed.tool === 'eraser') ed.selectPreset(ed.lastDrawPreset);
        else if (ed.tool === 'draw' && ed.preset.brush === 'softEraser') ed.selectPreset(ed.lastDrawPreset);
        else ed.setTool('eraser');
        break;
      case 'last': {
        const prev = ed.prevTool;
        ed.setTool(prev);
        break;
      }
      case 'color':
        window.dispatchEvent(new CustomEvent('open-color'));
        break;
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spaceDown = false;
  };

  private onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    const ed = this.ed;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { this.spaceDown = true; e.preventDefault(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); ed.redo(); return; }
    if (mod && k === 'a') { e.preventDefault(); ed.setTool('select'); ed.selectAll(); return; }
    if (mod && k === 'd') { e.preventDefault(); ed.duplicateSelection(); return; }
    if (mod && (k === 'c' || k === 'x' || k === 'v')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('clipboard-action', { detail: k === 'c' ? 'copy' : k === 'x' ? 'cut' : 'paste' }));
      return;
    }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); this.zoomBy(1.25); return; }
    if (mod && k === '-') { e.preventDefault(); this.zoomBy(0.8); return; }
    if (mod && k === '0') { e.preventDefault(); window.dispatchEvent(new CustomEvent('zoom-fit')); return; }
    if (mod) return;
    if ((k === 'backspace' || k === 'delete') && ed.selection.size) { e.preventDefault(); ed.deleteItems([...ed.selection]); return; }
    if (k === 'escape') { ed.clearSelection(); ed.liveShapeId = null; ed.setGuide(null); return; }
    const map: Record<string, ToolId> = { v: 'select', e: 'eraser', n: 'nudge', k: 'slice', g: 'fill', t: 'text', i: 'eyedropper' };
    if (map[k]) { ed.setTool(map[k]); return; }
    if (k === 'b') { ed.selectPreset(ed.lastDrawPreset); return; }
    if (/^[1-9]$/.test(k)) { const i = +k - 1; if (i < ed.presets.length) ed.selectPreset(i); return; }
    if (k === '[' || k === ']') {
      const f = k === '[' ? 0.85 : 1.18;
      if (ed.tool === 'eraser') { ed.eraserSize = Math.max(2, Math.min(300, ed.eraserSize * f)); ed.emit('ui', 'overlay'); }
      else ed.updatePreset({ size: Math.max(0.3, Math.min(400, ed.preset.size * f)) });
      return;
    }
  };

  zoomBy(f: number, cx?: number, cy?: number) {
    const r = this.el.getBoundingClientRect();
    const x = cx ?? r.width / 2, y = cy ?? r.height / 2;
    const v = mul(translate(x, y), mul(scale(f), mul(translate(-x, -y), this.ed.doc.view.m)));
    this.ed.setView(this.clampView(v, false));
  }

  /** Convenience used by UI. */
  screenToWorld(x: number, y: number) {
    return apply(inv(this.ed.doc.view.m), x, y);
  }

  get penRecently() { return performance.now() - this.lastPenTime < 3000; }
}
