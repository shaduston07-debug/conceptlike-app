import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import type { TextItem, Item } from '../core/types';
import { useEditor } from './common';
import { apply, matScale, matRot, mul, translate, rotate, uid } from '../core/geom';

/** HTML textarea positioned over the canvas for creating/editing text items. */
export function TextEditor({ ed }: { ed: Editor }) {
  useEditor(ed, ['ui', 'view']);
  const te = ed.textEdit;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [val, setVal] = useState('');
  const existing = te?.id ? (ed.findItem(te.id) as TextItem | undefined) : undefined;
  useEffect(() => {
    if (!te) return;
    setVal(existing ? existing.text : '');
    if (existing) {
      ed.hidden = new Set([existing.id]);
      ed.emit('doc');
    }
    setTimeout(() => ref.current?.focus(), 30);
    return () => {
      if (ed.hidden.size) { ed.hidden = new Set(); ed.emit('doc'); }
    };
  }, [te?.id, te?.x, te?.y]);
  useEffect(() => {
    const onStyle = () => {
      if (!existing) return;
      const t = ed.textDefaults;
      ed.editItems(new Map<string, Item>([[existing.id, { ...existing, font: t.font, weight: t.weight, italic: t.italic, align: t.align, size: t.size / matScale(ed.doc.view.m) }]]), 'Text style');
    };
    window.addEventListener('text-style', onStyle);
    return () => window.removeEventListener('text-style', onStyle);
  });
  if (!te) return null;
  const view = ed.doc.view.m;
  const zoom = matScale(view);
  const t = ed.textDefaults;
  const color = existing ? existing.color : ed.preset.color;
  const font = existing ? existing.font : t.font;
  const sizeWorld = existing ? existing.size : t.size / zoom;
  const weight = existing ? existing.weight : t.weight;
  const italic = existing ? existing.italic : t.italic;
  const align = existing ? existing.align : t.align;
  const origin = existing ? apply(view, existing.m[4], existing.m[5]) : apply(view, te.x, te.y);
  const rotDeg = existing ? ((matRot(mul(view, existing.m))) * 180) / Math.PI : 0;
  const commit = () => {
    const text = val.replace(/\s+$/, '');
    const cur = ed.textEdit;
    ed.textEdit = null;
    ed.hidden = new Set();
    if (existing) {
      if (!text) ed.deleteItems([existing.id], 'Delete text');
      else if (text !== existing.text) ed.editItems(new Map<string, Item>([[existing.id, { ...existing, text }]]), 'Edit text');
      else ed.emit('doc', 'ui');
    } else if (text && cur) {
      const r = matRot(view);
      const item: TextItem = {
        kind: 'text', id: uid('i'), text, font, size: sizeWorld, weight, italic, align, color, opacity: 1,
        m: mul(translate(cur.x, cur.y - sizeWorld * 0.6), rotate(-r)),
      };
      ed.addItems([item], ed.doc.activeLayer, 'Text');
    } else ed.emit('ui');
  };
  const lines = Math.max(1, val.split('\n').length);
  const longest = Math.max(4, ...val.split('\n').map((l) => l.length));
  return (
    <textarea
      ref={ref}
      class="text-edit"
      value={val}
      spellcheck={false}
      onInput={(e) => setVal((e.target as HTMLTextAreaElement).value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Escape') { (e.target as HTMLTextAreaElement).blur(); } e.stopPropagation(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: origin.x + 'px',
        top: (existing ? origin.y : origin.y - sizeWorld * zoom * 0.6) + 'px',
        transform: `rotate(${rotDeg}deg)`,
        transformOrigin: '0 0',
        font: `${italic ? 'italic ' : ''}${weight} ${sizeWorld * zoom}px ${font}`,
        color,
        textAlign: align,
        width: `${Math.max(60, longest * sizeWorld * zoom * 0.62 + 20)}px`,
        height: `${lines * sizeWorld * zoom * 1.25 + 6}px`,
      }}
    />
  );
}
