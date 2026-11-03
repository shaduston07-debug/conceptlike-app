/**
 * Key/value persistence. Inside the iOS app this talks to the native shell, which stores
 * values as files in the app container. In a browser it falls back to IndexedDB.
 */
interface NativeBridge {
  postMessage(msg: any): Promise<any>;
}

function native(): NativeBridge | null {
  const w = window as any;
  const h = w.webkit?.messageHandlers?.inkfinity;
  return h && typeof h.postMessage === 'function' ? h : null;
}

export const isNative = () => !!native();

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('draftwell', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function kvGet(key: string): Promise<string | null> {
  const n = native();
  if (n) {
    const r = await n.postMessage({ op: 'get', key });
    return typeof r === 'string' ? r : null;
  }
  const v = await idb<any>('readonly', (s) => s.get(key));
  return typeof v === 'string' ? v : null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const n = native();
  if (n) {
    await n.postMessage({ op: 'set', key, value });
    return;
  }
  await idb('readwrite', (s) => s.put(value, key));
}

export async function kvDel(key: string): Promise<void> {
  const n = native();
  if (n) {
    await n.postMessage({ op: 'del', key });
    return;
  }
  await idb('readwrite', (s) => s.delete(key));
}

export async function kvKeys(prefix: string): Promise<string[]> {
  const n = native();
  if (n) {
    const r = await n.postMessage({ op: 'keys', prefix });
    return Array.isArray(r) ? r : [];
  }
  const all = await idb<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  return all.map(String).filter((k) => k.startsWith(prefix));
}

/** Share or save a file. Native: share sheet. Browser: download. */
export async function shareFile(name: string, mime: string, data: Blob): Promise<void> {
  const n = native();
  if (n) {
    const b64 = await blobToBase64(data);
    await n.postMessage({ op: 'share', name, mime, data: b64 });
    return;
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveToPhotos(data: Blob): Promise<boolean> {
  const n = native();
  if (!n) return false;
  const b64 = await blobToBase64(data);
  const r = await n.postMessage({ op: 'photos', data: b64 });
  return r === true;
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/**
 * Haptic feedback. On Apple Pencil Pro this is felt in the pencil (alignment ticks when
 * strokes snap to shapes, guides or perspective); elsewhere it is a no-op.
 */
export function haptic(kind: 'align' | 'path' | 'light' | 'select' = 'light', x = 0, y = 0) {
  const n = native();
  if (n) n.postMessage({ op: 'haptic', kind, x, y }).catch(() => {});
}
