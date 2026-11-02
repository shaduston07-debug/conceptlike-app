import type { AppCtx, Ptr, Tool } from './context';
import { hitItem } from '../core/items';

export class TextTool implements Tool {
  constructor(private app: AppCtx) {}
  down(_p: Ptr) {}
  move() {}
  up(p: Ptr) {
    const ed = this.app.editor;
    if (ed.textEdit) {
      // tapping elsewhere commits the current edit (handled by the editor overlay on blur)
      ed.textEdit = null;
      ed.emit('ui');
      return;
    }
    const layer = ed.activeLayer;
    if (layer.locked || !layer.visible) {
      this.app.toast(layer.locked ? 'Layer is locked' : 'Layer is hidden');
      return;
    }
    const tol = 6 / this.app.zoom();
    for (const l of [...ed.doc.layers].reverse()) {
      if (!l.visible || l.locked) continue;
      for (let i = l.items.length - 1; i >= 0; i--) {
        const it = l.items[i];
        if (it.kind === 'text' && hitItem(it, p.wx, p.wy, tol)) {
          ed.textEdit = { id: it.id, x: p.wx, y: p.wy };
          ed.emit('ui', 'overlay');
          return;
        }
      }
    }
    ed.textEdit = { id: null, x: p.wx, y: p.wy };
    ed.emit('ui', 'overlay');
  }
  cancel() {}
}
