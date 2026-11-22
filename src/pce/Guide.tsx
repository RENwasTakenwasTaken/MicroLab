// Setup guide panel shared by the PCE kits. Each kit supplies its steps, read from the real state
// of the bench, with hints for the usual mistakes; this draws them and chimes as steps get done.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audio } from '../app/audio.ts';
import { Icon } from '../ui/icons.tsx';
import { usePce } from './store.ts';

export interface GuideStep { key: string; done: boolean; body: ReactNode }
export interface GuideData {
  title: string;
  steps: GuideStep[];
  /** hints for what is wrong on the bench right now */
  warn: string[];
  /** status line at the bottom */
  foot: ReactNode;
  /** shown once every step is done */
  doneNote: string;
}

/** A soft chime per completed step and a note when the set-up is complete. */
function useChimes({ steps, doneNote }: GuideData) {
  const allDone = steps.every((s) => s.done);
  const prev = useRef<{ done: Record<string, boolean>; all: boolean } | null>(null);
  useEffect(() => {
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    const p = prev.current;
    prev.current = { done, all: allDone };
    if (!p) return;
    if (allDone && !p.all) { audio.chime('done'); usePce.getState().notify(doneNote, 'ok', 6000); }
    else if (steps.some((s) => s.done && p.done[s.key] === false)) audio.chime('step');
  });
}

export function SetupPanel({ data }: { data: GuideData }) {
  const [open, setOpen] = useState(true);
  useChimes(data);
  const { steps, warn } = data;
  const next = steps.findIndex((s) => !s.done), allDone = next < 0;
  if (!open) return (
    <button className={`wf-toggle ${allDone ? 'complete' : ''}`} onClick={() => setOpen(true)} title="Show the setup guide">
      <Icon name={allDone ? 'check' : 'list'} /> {allDone ? 'Setup guide · all steps done' : `Setup guide · step ${next + 1}/${steps.length}`}
    </button>
  );
  return (
    <div className="wf">
      <div className="wf-head">
        <div className="wf-title"><b>Setup guide</b><span title={data.title}>{data.title}</span></div>
        <button className="btn ghost icon" onClick={() => setOpen(false)} title="Hide the setup guide"><Icon name="x" /></button>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : i === next ? 'active' : ''}><span className="dot">{s.done ? '✓' : ''}</span>{s.body}</li>
        ))}
      </ol>
      {warn.map((w) => <div key={w} className="wf-warn pce-warn">{w}</div>)}
      {allDone && <div className="wf-done">{data.doneNote}</div>}
      <div className="wf-foot">{data.foot}</div>
    </div>
  );
}

/** Hints about the oscilloscope's own settings, the same for every kit. connected: is that channel on the kit? */
export function scopeWarnings(connected: [boolean, boolean]): string[] {
  const out: string[] = [];
  usePce.getState().scope.ch.forEach((ch, i) => {
    if (ch.probe !== 1) out.push(`CH${i + 1} Probe is set to ${ch.probe}X but the lab leads are 1X: its readings are ${ch.probe} times too large. CH ${i + 1} MENU, then Probe, back to 1X.`);
    if (ch.coupling === 'GND' && connected[i]) out.push(`CH${i + 1} Coupling is Ground: its input is disconnected and shows a flat line. CH ${i + 1} MENU, then Coupling.`);
  });
  return out;
}
