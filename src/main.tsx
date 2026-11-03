import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles/app.css';
import { Editor } from './core/editor';
import type { DrawingDoc } from './core/types';
import { Gallery } from './ui/Gallery';
import { EditorView } from './ui/EditorView';
import { loadSettings } from './core/settings';

function applyTheme() {
  const t = loadSettings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function App() {
  const [ed, setEd] = useState<Editor | null>(null);
  useEffect(() => {
    applyTheme();
    window.addEventListener('storage', applyTheme);
    // reopen the last drawing after the app was killed in the background
    return () => window.removeEventListener('storage', applyTheme);
  }, []);
  useEffect(() => {
    if (!ed) return;
    try { localStorage.setItem('draftwell.lastDoc', ed.doc.id); } catch {}
    (window as any).__inkfinity = ed; // handy for debugging from Safari Web Inspector
    return ed.on('settings', applyTheme);
  }, [ed]);
  const open = (doc: DrawingDoc) => setEd(new Editor(doc));
  if (ed) return <EditorView key={ed.doc.id} ed={ed} onExit={() => { try { localStorage.removeItem('draftwell.lastDoc'); } catch {} setEd(null); }} />;
  return <Gallery onOpen={open} />;
}

render(<App />, document.getElementById('app')!);

// Prevent pinch-zoom / double-tap zoom of the page itself.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
