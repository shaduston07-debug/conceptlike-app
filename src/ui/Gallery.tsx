import { useEffect, useState } from 'preact/hooks';
import type { DocMeta, PaperKind } from '../core/types';
import { listDocs, deleteDoc, updateMeta, loadDoc, saveDoc, listProjects, saveProjects, serializeDoc } from '../storage/docs';
import { createDoc, normalizeDoc, ARTBOARD_PRESETS } from '../core/doc';
import { uid } from '../core/geom';
import { Icon } from './icons';
import { fmtDate, Seg, PanelTitle } from './common';
import { thumbnail } from '../export/raster';
import { shareFile } from '../storage/kv';
import type { DrawingDoc } from '../core/types';

export function Gallery({ onOpen }: { onOpen: (doc: DrawingDoc) => void }) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [proj, setProj] = useState<string>(() => localStorage.getItem('draftwell.project') || '');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [moveFor, setMoveFor] = useState<string | null>(null);

  const refresh = async () => {
    setDocs(await listDocs());
    setProjects(await listProjects());
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { try { localStorage.setItem('draftwell.project', proj); } catch {} }, [proj]);

  const open = async (id: string) => {
    const d = await loadDoc(id);
    if (d) onOpen(d);
  };
  const shown = (docs || []).filter((d) => !proj || d.project === proj);

  const importFile = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        const d = normalizeDoc(JSON.parse(await f.text()));
        d.id = uid('D');
        d.project = proj;
        d.modified = Date.now();
        await saveDoc(d, thumbnail(d));
      } catch { alert('Could not import ' + f.name); }
    }
    refresh();
  };

  return (
    <div class="gallery">
      <div class="g-head">
        <h1><img class="g-logo" src="./icon.png" alt="" />Inkfinity</h1>
        <label class="btn" style={{ cursor: 'pointer' }}>
          <Icon name="import" size={18} />Import
          <input type="file" accept=".inkfinity,.draftwell,application/json" multiple style={{ display: 'none' }} onChange={(e) => { importFile((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ''; }} />
        </label>
        <button class="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />New</button>
      </div>
      <div class="chips">
        <button class={'chip' + (proj === '' ? ' on' : '')} onClick={() => setProj('')}>All drawings</button>
        {projects.map((p) => (
          <button class={'chip' + (proj === p ? ' on' : '')} onClick={() => setProj(p)}
            onDblClick={async () => {
              if (!confirm(`Delete project “${p}”? Drawings are kept.`)) return;
              const np = projects.filter((x) => x !== p);
              await saveProjects(np);
              for (const d of docs || []) if (d.project === p) await updateMeta(d.id, { project: '' });
              if (proj === p) setProj('');
              refresh();
            }}>
            <Icon name="folder" size={15} />{p}
          </button>
        ))}
        <button class="chip" onClick={async () => {
          const name = prompt('Project name');
          if (!name || projects.includes(name)) return;
          await saveProjects([...projects, name]);
          setProj(name);
          refresh();
        }}><Icon name="plus" size={15} />Project</button>
      </div>
      <div class="g-grid" onClick={() => setMenu(null)}>
        <button class="card new" onClick={() => setCreating(true)}>
          <div class="thumb"><Icon name="plus" size={36} /></div>
          <div class="meta"><div class="t"><div class="name">New drawing</div><div class="date">Infinite canvas or artboard</div></div></div>
        </button>
        {shown.map((d) => (
          <div class="card" key={d.id}>
            <button class="thumb" onClick={() => open(d.id)}>{d.thumb ? <img src={d.thumb} /> : null}</button>
            <div class="meta">
              <div class="t">
                <div class="name">{d.name}</div>
                <div class="date">{fmtDate(d.modified)}{d.artboard ? ` · ${d.artboard.w}×${d.artboard.h}` : ' · Infinite'}</div>
              </div>
              <button class="ibtn sm" onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ id: d.id, x: Math.min(r.right - 200, window.innerWidth - 220), y: r.bottom + 4 }); }}><Icon name="more" size={18} /></button>
            </div>
          </div>
        ))}
        {docs && !shown.length && <div class="empty">{proj ? 'No drawings in this project yet.' : 'Your drawings will appear here.'}</div>}
      </div>
      {menu && (
        <div class="menu" style={{ left: menu.x + 'px', top: Math.min(menu.y, window.innerHeight - 300) + 'px' }}>
          <button onClick={() => { open(menu.id); setMenu(null); }}><Icon name="file" size={18} />Open</button>
          <button onClick={async () => {
            const cur = docs!.find((x) => x.id === menu.id)!;
            const n = prompt('Rename', cur.name);
            setMenu(null);
            if (n) { await updateMeta(menu.id, { name: n }); refresh(); }
          }}><Icon name="text" size={18} />Rename</button>
          <button onClick={async () => {
            const d = await loadDoc(menu.id);
            setMenu(null);
            if (!d) return;
            d.id = uid('D'); d.name = d.name + ' copy'; d.created = d.modified = Date.now();
            await saveDoc(d, thumbnail(d));
            refresh();
          }}><Icon name="duplicate" size={18} />Duplicate</button>
          <button onClick={() => { setMoveFor(menu.id); setMenu(null); }}><Icon name="folder" size={18} />Move to project…</button>
          <button onClick={async () => {
            const d = await loadDoc(menu.id);
            setMenu(null);
            if (d) await shareFile(d.name + '.inkfinity', 'application/json', new Blob([serializeDoc(d)], { type: 'application/json' }));
          }}><Icon name="share" size={18} />Share drawing file</button>
          <button class="danger" onClick={async () => {
            const cur = docs!.find((x) => x.id === menu.id)!;
            setMenu(null);
            if (confirm(`Delete “${cur.name}”? This can’t be undone.`)) { await deleteDoc(menu.id); refresh(); }
          }}><Icon name="trash" size={18} />Delete</button>
        </div>
      )}
      {moveFor && (
        <div class="sheet-wrap" onClick={() => setMoveFor(null)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <PanelTitle title="Move to project" onClose={() => setMoveFor(null)} />
            <div class="sec">
              {['', ...projects].map((p) => (
                <button class="btn wide" style={{ marginBottom: '6px', justifyContent: 'flex-start' }} onClick={async () => { await updateMeta(moveFor, { project: p }); setMoveFor(null); refresh(); }}>
                  <Icon name="folder" size={18} />{p || 'No project'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {creating && <NewSheet project={proj} onCancel={() => setCreating(false)} onCreate={async (d) => { setCreating(false); await saveDoc(d, ''); onOpen(d); }} />}
    </div>
  );
}

function NewSheet({ project, onCancel, onCreate }: { project: string; onCancel: () => void; onCreate: (d: DrawingDoc) => void }) {
  const [kind, setKind] = useState<'infinite' | 'artboard'>('infinite');
  const [preset, setPreset] = useState(ARTBOARD_PRESETS[0].name);
  const [paper, setPaper] = useState<PaperKind>('dots');
  const [bg, setBg] = useState('#ffffff');
  const [name, setName] = useState('');
  const [cw, setCw] = useState(2000);
  const [chh, setChh] = useState(1500);
  const create = () => {
    let artboard = null as null | { w: number; h: number; name: string };
    if (kind === 'artboard') {
      const p = ARTBOARD_PRESETS.find((x) => x.name === preset);
      artboard = p ? { ...p } : { w: cw, h: chh, name: 'Custom' };
    }
    const d = createDoc({ name: name.trim() || `Drawing ${new Date().toLocaleDateString()}`, artboard, paper, bg, project });
    onCreate(d);
  };
  return (
    <div class="sheet-wrap" onClick={onCancel}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <PanelTitle title="New drawing" onClose={onCancel} />
        <div class="sec">
          <input class="tinput" placeholder="Name (optional)" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </div>
        <div class="sec">
          <Seg value={kind} onChange={setKind} options={[{ v: 'infinite', l: 'Infinite canvas' }, { v: 'artboard', l: 'Artboard' }]} />
          {kind === 'artboard' && (
            <div class="preset-grid" style={{ marginTop: '12px' }}>
              {ARTBOARD_PRESETS.map((p) => {
                const k = 46 / Math.max(p.w, p.h);
                return (
                  <button class={'preset-card' + (preset === p.name ? ' on' : '')} onClick={() => setPreset(p.name)}>
                    <div class="shape" style={{ width: p.w * k + 'px', height: p.h * k + 'px' }} />
                    <div>{p.name}</div>
                    <div class="dim">{p.w}×{p.h}</div>
                  </button>
                );
              })}
              <button class={'preset-card' + (preset === 'Custom' ? ' on' : '')} onClick={() => setPreset('Custom')}>
                <div class="shape" style={{ width: '40px', height: '30px', border: '1px dashed var(--text-3)', background: 'transparent' }} />
                <div>Custom</div>
                <div class="dim">any size</div>
              </button>
            </div>
          )}
          {kind === 'artboard' && preset === 'Custom' && (
            <div class="row" style={{ marginTop: '10px' }}>
              <input class="tinput" type="number" value={cw} onInput={(e) => setCw(Math.max(16, +(e.target as HTMLInputElement).value))} />
              <span>×</span>
              <input class="tinput" type="number" value={chh} onInput={(e) => setChh(Math.max(16, +(e.target as HTMLInputElement).value))} />
              <span style={{ color: 'var(--text-3)' }}>px</span>
            </div>
          )}
        </div>
        <div class="sec">
          <h4>Paper</h4>
          <Seg value={paper} onChange={setPaper} options={[{ v: 'blank', l: 'Blank' }, { v: 'dots', l: 'Dots' }, { v: 'grid', l: 'Grid' }, { v: 'graph', l: 'Graph' }, { v: 'lines', l: 'Lines' }, { v: 'iso', l: 'Iso' }]} />
          <div class="row" style={{ marginTop: '8px' }}>
            <label>Paper color</label>
            {['#ffffff', '#f7f3ea', '#eef1f4', '#2a2d33', '#141518'].map((c) => (
              <button class={'sw' + (bg === c ? ' on' : '')} style={{ width: '28px', background: c }} onClick={() => setBg(c)} />
            ))}
          </div>
        </div>
        <div class="sec">
          <button class="btn primary wide" onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}
