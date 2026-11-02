import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import { PanelTitle, toast } from './common';
import { Icon } from './icons';
import { builtinLibrary, libraryThumb, makeEntry, placeItems } from './library';
import { loadLibrary, saveLibrary, type LibraryEntry } from '../storage/docs';
import { apply, inv, matScale } from '../core/geom';
import type { Item } from '../core/types';

export function LibraryPanel({ ed, onClose, viewSize }: { ed: Editor; onClose: () => void; viewSize: () => { w: number; h: number } }) {
  const [user, setUser] = useState<LibraryEntry[]>([]);
  const [editing, setEditing] = useState(false);
  useEffect(() => { loadLibrary().then(setUser); }, []);
  const builtins = useMemo(() => builtinLibrary().map((b) => ({ ...b, thumb: libraryThumb(b.items) })), []);
  const insert = (items: Item[], keepSize: boolean) => {
    const layer = ed.activeLayer;
    if (layer.locked || !layer.visible) { toast('Layer is locked or hidden'); return; }
    const { w, h } = viewSize();
    const c = apply(inv(ed.doc.view.m), w / 2, h / 2);
    const target = (Math.min(w, h) * 0.3) / matScale(ed.doc.view.m);
    // match the current tool colour for built-in ink drawings
    const placed = placeItems(items, c.x, c.y, target, keepSize);
    ed.addItems(placed, layer.id, 'Insert');
    ed.setTool('select');
    ed.setSelection(placed.map((i) => i.id));
    onClose();
  };
  const saveSel = async () => {
    const sel = ed.selectedItems;
    if (!sel.length) { toast('Select something first'); return; }
    const name = prompt('Name', 'My object') || 'My object';
    const e = makeEntry(name, sel);
    const next = [e, ...user];
    setUser(next);
    await saveLibrary(next);
    toast('Saved to library');
  };
  return (
    <div class="popover panel-right" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="Library" onClose={onClose}>
        {user.length > 0 && <button class={'ibtn sm' + (editing ? ' on' : '')} onClick={() => setEditing(!editing)}><Icon name="trash" size={17} /></button>}
      </PanelTitle>
      <div class="sec">
        <button class="btn wide" onClick={saveSel} disabled={!ed.selection.size}><Icon name="plus" size={16} />Save selection as object</button>
      </div>
      {user.length > 0 && (
        <div class="sec">
          <h4>My objects</h4>
          <div class="lib-grid">
            {user.map((u) => (
              <button class="lib-item" title={u.name} onClick={() => !editing && insert(u.items as Item[], true)}>
                <img src={u.thumb} />
                {editing && <span class="x" onClick={async (e) => { e.stopPropagation(); const n = user.filter((x) => x.id !== u.id); setUser(n); await saveLibrary(n); }}><Icon name="close" size={12} /></span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="sec">
        <h4>Shapes &amp; symbols</h4>
        <div class="lib-grid">
          {builtins.map((b) => (
            <button class="lib-item" title={b.name} onClick={() => insert(b.items.map((i) => (i.kind === 'stroke' ? { ...i, color: ed.preset.color } : i)), false)}>
              <img src={b.thumb} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
