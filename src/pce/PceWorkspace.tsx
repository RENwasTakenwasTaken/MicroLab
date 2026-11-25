// Workspace of a PCE experiment: the 3D bench fills the stage, the lab sheet floats on the left.
// There is no program to write here, so no editor, debugger or output pane.

import { Suspense, lazy, useEffect, useState } from 'react';
import { SidePane, useNarrow } from '../app/Workspace.tsx';
import { useLab } from '../app/store.ts';
import { Icon } from '../ui/icons.tsx';
import { LabSheet } from './LabSheet.tsx';
import { getPceExperiment } from './experiments.ts';
import { kitPowered, resetPceBench, usePce } from './store.ts';
import { FILM } from './film.ts';

const PceLab = lazy(() => import('./PceLab.tsx').then((m) => ({ default: m.PceLab })));

function Bench() {
  return (
    <Suspense fallback={<div className="empty"><span className="spinner" style={{ display: 'inline-block' }} /> Loading the 3D laboratory…</div>}>
      <PceLab />
    </Suspense>
  );
}

function PceTopBar({ expId }: { expId: string }) {
  const exp = getPceExperiment(expId)!;
  const powered = usePce((s) => kitPowered(s));
  const leave = () => {
    if (confirm(`Leave Expt ${exp.no} and go back to the PCE experiments?\n\nThe bench starts over when you come back: cords unplugged, kit switched off. Readings typed in the lab sheet are kept.`)) location.hash = '#/pce';
  };
  const reset = () => { if (confirm('Put the bench back as it was at the start? Cords unplugged, kit switched off, oscilloscope settings reset.')) resetPceBench(); };
  return (
    <div className="topbar">
      <div className="tb-group">
        <button className="btn ghost icon" title="All PCE experiments" onClick={leave}><Icon name="home" /></button>
        <div className="tb-title">
          <span className="tb-exp">PCE · Expt {exp.no}</span>
          <span className="tb-name" title={exp.title}>{exp.card}</span>
        </div>
      </div>
      <div className="tb-group">
        <span className="tb-tool">{exp.kit}</span>
        <button className="btn ghost" onClick={reset} title="Start the bench over"><Icon name="reset" /> <span className="tb-label">Reset bench</span></button>
      </div>
      <div className="tb-group tb-status">
        <span className={`run-dot ${powered ? 'on' : ''}`} />
        <span className={`tag ${powered ? 'ok' : ''}`}>{powered ? 'kit powered' : 'kit off'}</span>
      </div>
    </div>
  );
}

export function PceWorkspace({ expId }: { expId: string }) {
  const narrow = useNarrow();
  const leftOpen = useLab((s) => s.leftOpen);
  const [tab, setTab] = useState<'bench' | 'sheet'>('bench');
  // every visit starts with a fresh bench, as at the start of a lab turn
  useEffect(() => { resetPceBench(expId); }, [expId]);
  if (FILM) return <div style={{ position: 'fixed', inset: 0, background: '#000' }}><Bench /></div>;
  if (narrow) {
    return (
      <div className="ws">
        <PceTopBar expId={expId} />
        <div className="ws-mobile">
          <div className={tab === 'sheet' ? 'mshow' : 'mhide'}><div className="panel"><div className="panel-body"><LabSheet expId={expId} /></div></div></div>
          <div className={tab === 'bench' ? 'mshow' : 'mhide'}><div className="panel"><div className="panel-body"><Bench /></div></div></div>
        </div>
        <div className="mtabs">
          {([['sheet', 'Lab sheet', 'flask'], ['bench', 'Bench', 'board']] as const).map(([id, l, ic]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon name={ic} size={16} />{l}</button>)}
        </div>
      </div>
    );
  }
  return (
    <div className="ws">
      <PceTopBar expId={expId} />
      <div className={`ws-main ws-stage ${leftOpen ? 'l-open' : ''}`}>
        <div className="panel"><div className="panel-body" style={{ overflow: 'hidden' }}><Bench /></div></div>
        <SidePane side="left" title="Lab sheet" icon="flask" open={leftOpen} onToggle={() => useLab.getState().set({ leftOpen: !leftOpen })}>
          <div className="panel"><div className="panel-body"><LabSheet expId={expId} /></div></div>
        </SidePane>
      </div>
    </div>
  );
}
