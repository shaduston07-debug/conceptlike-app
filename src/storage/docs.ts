import type { DrawingDoc, DocMeta } from '../core/types';
import { normalizeDoc } from '../core/doc';
import { kvGet, kvSet, kvDel, kvKeys } from './kv';

const DOC = 'doc:';
const META = 'meta:';

export async function listDocs(): Promise<DocMeta[]> {
  const keys = await kvKeys(META);
  const metas: DocMeta[] = [];
  for (const k of keys) {
    try {
      const v = await kvGet(k);
      if (v) metas.push(JSON.parse(v));
    } catch {}
  }
  return metas.sort((a, b) => b.modified - a.modified);
}

export async function loadDoc(id: string): Promise<DrawingDoc | null> {
  const v = await kvGet(DOC + id);
  if (!v) return null;
  try {
    return normalizeDoc(JSON.parse(v));
  } catch {
    return null;
  }
}

/** Round coordinates to keep files compact without visible loss. */
function compact(_k: string, v: any) {
  if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1000) / 1000;
  return v;
}

export function serializeDoc(doc: DrawingDoc): string {
  return JSON.stringify(doc, compact);
}

export async function saveDoc(doc: DrawingDoc, thumb: string): Promise<void> {
  await kvSet(DOC + doc.id, serializeDoc(doc));
  const meta: DocMeta = {
    id: doc.id, name: doc.name, project: doc.project, created: doc.created, modified: doc.modified, thumb,
    artboard: doc.artboard ? { w: doc.artboard.w, h: doc.artboard.h } : null,
  };
  await kvSet(META + doc.id, JSON.stringify(meta));
}

export async function updateMeta(id: string, p: Partial<DocMeta>) {
  const v = await kvGet(META + id);
  if (!v) return;
  const meta = { ...JSON.parse(v), ...p };
  await kvSet(META + id, JSON.stringify(meta));
  if (p.name !== undefined || p.project !== undefined) {
    const d = await loadDoc(id);
    if (d) {
      if (p.name !== undefined) d.name = p.name;
      if (p.project !== undefined) d.project = p.project;
      await kvSet(DOC + id, serializeDoc(d));
    }
  }
}

export async function deleteDoc(id: string) {
  await kvDel(DOC + id);
  await kvDel(META + id);
}

export async function listProjects(): Promise<string[]> {
  const v = await kvGet('projects');
  try { return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function saveProjects(p: string[]) {
  await kvSet('projects', JSON.stringify(p));
}

export interface LibraryEntry {
  id: string;
  name: string;
  thumb: string;
  items: any[]; // Item[] normalised so their bounds start at 0,0
  w: number;
  h: number;
}
export async function loadLibrary(): Promise<LibraryEntry[]> {
  const v = await kvGet('library');
  try { return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function saveLibrary(l: LibraryEntry[]) {
  await kvSet('library', JSON.stringify(l));
}
