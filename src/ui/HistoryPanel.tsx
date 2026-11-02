import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '../core/editor';
import { useEditor, PanelTitle } from './common';
import { Icon } from './icons';

export function HistoryPanel({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  useEditor(ed, ['history', 'ui']);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(0);
  const n = ed.history.length;
  useEffect(() => () => clearInterval(timer.current), []);
  const play = () => {
    if (playing) { clearInterval(timer.current); setPlaying(false); return; }
    const end = n - 1;
    let i = ed.hIndex >= end ? 0 : ed.hIndex;
    ed.gotoHistory(i);
    setPlaying(true);
    const step = Math.max(16, Math.min(160, 6000 / Math.max(1, end)));
    timer.current = window.setInterval(() => {
      i++;
      if (i > end) { clearInterval(timer.current); setPlaying(false); return; }
      ed.gotoHistory(i);
    }, step);
  };
  const cur = ed.history[ed.hIndex];
  return (
    <div class="popover panel-center" onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle title="History" onClose={onClose} />
      <div class="sec">
        <div class="row">
          <button class="ibtn" onClick={play}><Icon name={playing ? 'pause' : 'play'} /></button>
          <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={ed.hIndex} onInput={(e) => ed.gotoHistory(+(e.target as HTMLInputElement).value)} />
          <span class="v">{ed.hIndex}/{n - 1}</span>
        </div>
        <div class="hint">{cur?.label} · {cur ? new Date(cur.time).toLocaleTimeString() : ''} — scrub back in time; drawing from an earlier point discards later steps.</div>
      </div>
    </div>
  );
}
