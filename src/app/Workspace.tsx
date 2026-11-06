// Experiment workspace: the simulation (3D lab / editor + target) fills the stage;
// the lab sheet (left), debugger (right) and output (bottom) float above it as
// hideable glass panes.

import { lazy, Suspense, useEffect, useState, type ReactNode, type PointerEvent } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLab, type LeftTab } from './store.ts';
import { useBench } from './bench.ts';
import { openExperiment, sim } from './sim.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { TopBar } from '../ide/TopBar.tsx';
import { CodeEditor } from '../ide/Editor.tsx';
import { BottomPanel } from '../ide/BottomPanel.tsx';
import { DebugPanel } from '../debug/DebugPanel.tsx';
import { ExperimentPanel } from '../lab/ExperimentPanel.tsx';
import { HardwarePanel } from '../lab/HardwarePanel.tsx';
import { VirtualTarget51 } from '../lab/VirtualTarget51.tsx';
import { Icon } from '../ui/icons.tsx';

const LabView = lazy(() => import('../lab3d/LabView.tsx').then((m) => ({ default: m.LabView })));

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 980);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 980);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

function Hardware({ expId }: { expId: string }) {
  const exp = getExperiment(expId)!;
  if (exp.arch === 'mcs51') return <VirtualTarget51 />;
  return (
    <Suspense fallback={<div className="empty"><span className="spinner" style={{ display: 'inline-block' }} /> Loading the 3D laboratory…</div>}>
      <LabView expId={expId} />
    </Suspense>
  );
}

function LeftPanel({ expId }: { expId: string }) {
  const tab = useLab((s) => s.leftTab);
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="tabs">
          {([['experiment', 'Experiment', 'flask'], ['hardware', 'Hardware', 'board']] as [LeftTab, string, string][]).map(([id, l, ic]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => useLab.getState().set({ leftTab: id })}><Icon name={ic} size={13} /> {l}</button>
          ))}
        </div>
      </div>
      <div className="panel-body">{tab === 'experiment' ? <ExperimentPanel expId={expId} /> : <HardwarePanel />}</div>
    </div>
  );
}

function PaneHandle({ side, title, icon, open, onToggle }: { side: 'left' | 'right' | 'bottom'; title: string; icon: string; open: boolean; onToggle(): void }) {
  return (
    <button className={`pane-handle ${side} ${open ? 'open' : ''}`} onClick={onToggle} aria-expanded={open} title={open ? `Hide ${title}` : `Show ${title}`}>
      <Icon name={icon} size={14} />
      <span>{title}</span>
    </button>
  );
}

/**
 * A floating glass pane with an edge handle. The pane is unmounted while hidden,
 * so its live views stop re-rendering and the 3D view gets the full frame budget.
 */
function SidePane({ side, title, icon, open, onToggle, children }: {
  side: 'left' | 'right'; title: string; icon: string; open: boolean; onToggle(): void; children: ReactNode;
}) {
  return (
    <>
      <PaneHandle side={side} title={title} icon={icon} open={open} onToggle={onToggle} />
      {open && (
        <aside className={`glass-pane ${side}`} aria-label={title}>
          <div className="pane-title">
            <Icon name={icon} size={14} />
            <b>{title}</b>
            <button className="btn ghost icon" onClick={onToggle} title={`Hide ${title}`}><Icon name="x" /></button>
          </div>
          <div className="pane-body">{children}</div>
        </aside>
      )}
    </>
  );
}

const LS_BOTTOM_H = 'vlab.bottomH.v1';
const loadBottomH = () => { try { return Number(localStorage.getItem(LS_BOTTOM_H)) || 280; } catch { return 280; } };

/** The output pane along the bottom; its top edge drags to resize and its tab strip doubles as the title. */
function BottomPane({ expId, open, onToggle }: { expId: string; open: boolean; onToggle(): void }) {
  const [h, setH] = useState(loadBottomH);
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const stage = e.currentTarget.closest('.ws-stage')!.getBoundingClientRect();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    let last = h;
    const move = (ev: globalThis.PointerEvent) => { last = Math.max(120, Math.min(stage.height - 70, stage.bottom - 10 - ev.clientY)); setH(last); };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      try { localStorage.setItem(LS_BOTTOM_H, String(Math.round(last))); } catch { /* storage unavailable */ }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  };
  return (
    <div className="bottom-dock" style={{ ['--bottom-h' as string]: `${h}px` }}>
      <PaneHandle side="bottom" title="Output" icon="terminal" open={open} onToggle={onToggle} />
      {open && (
        <aside className="glass-pane bottom" aria-label="Output">
          <div className="pane-grip" onPointerDown={drag} title="Drag to resize" />
          <button className="btn ghost icon pane-close" onClick={onToggle} title="Hide Output"><Icon name="x" /></button>
          <div className="pane-body"><BottomPanel expId={expId} /></div>
        </aside>
      )}
    </div>
  );
}

export function Workspace({ expId }: { expId: string }) {
  const narrow = useNarrow();
  const isPic = getExperiment(expId)?.arch === 'pic18';
  const leftOpen = useLab((s) => s.leftOpen);
  const rightOpen = useLab((s) => s.rightOpen);
  const bottomOpen = useLab((s) => s.bottomOpen);
  const [mobileTab, setMobileTab] = useState<'code' | 'board' | 'output' | 'debug' | 'lab'>('board');
  const coding = useBench((s) => s.view === 'computer');
  useEffect(() => { openExperiment(expId); }, [expId]);
  // the bench instruments read the transition log, so it runs even while the output pane is hidden
  useEffect(() => { if (isPic) sim.send({ type: 'analyzer', enabled: true }); }, [expId, isPic]);
  // the monitor's coding view gets the whole stage; the output pane comes back on leaving it
  useEffect(() => {
    if (!coding || !useLab.getState().bottomOpen) return;
    useLab.getState().set({ bottomOpen: false });
    return () => useLab.getState().set({ bottomOpen: true });
  }, [coding]);

  if (narrow) {
    const tabs = ([['lab', 'Lab', 'flask'], ['code', 'Code', 'file'], ['board', isPic ? 'Bench' : 'Board', 'board'], ['output', 'Output', 'terminal'], ['debug', 'Debug', 'bug']] as const).filter((t) => !isPic || t[0] !== 'code');
    return (
      <div className="ws">
        <TopBar expId={expId} />
        <div className="ws-mobile">
          <div className={mobileTab === 'lab' ? 'mshow' : 'mhide'}><LeftPanel expId={expId} /></div>
          {!isPic && <div className={mobileTab === 'code' ? 'mshow' : 'mhide'}><CodeEditor expId={expId} /></div>}
          <div className={mobileTab === 'board' ? 'mshow' : 'mhide'}><div className="panel"><div className="panel-body"><Hardware expId={expId} /></div></div></div>
          <div className={mobileTab === 'output' ? 'mshow' : 'mhide'}><BottomPanel expId={expId} /></div>
          <div className={mobileTab === 'debug' ? 'mshow' : 'mhide'}><DebugPanel /></div>
        </div>
        <div className="mtabs">
          {tabs.map(([id, l, ic]) => <button key={id} className={mobileTab === id ? 'on' : ''} onClick={() => setMobileTab(id)}><Icon name={ic} size={16} />{l}</button>)}
        </div>
      </div>
    );
  }

  const set = useLab.getState().set;
  return (
    <div className="ws">
      <TopBar expId={expId} />
      <div className={`ws-main ws-stage ${leftOpen ? 'l-open' : ''} ${rightOpen ? 'r-open' : ''}`}>
        {isPic ? (
          <div className="panel"><div className="panel-body" style={{ overflow: 'hidden' }}><Hardware expId={expId} /></div></div>
        ) : (
          <PanelGroup direction="horizontal" autoSaveId="vlab-layout-hc">
            <Panel id="editor" order={1} defaultSize={46} minSize={20}><CodeEditor expId={expId} /></Panel>
            <PanelResizeHandle className="resize-h" />
            <Panel id="board" order={2} defaultSize={54} minSize={20}>
              <div className="panel"><div className="panel-body" style={{ overflow: 'hidden' }}><Hardware expId={expId} /></div></div>
            </Panel>
          </PanelGroup>
        )}

        <SidePane side="left" title="Lab sheet" icon="flask" open={leftOpen} onToggle={() => set({ leftOpen: !leftOpen })}>
          <LeftPanel expId={expId} />
        </SidePane>
        <SidePane side="right" title="Debug" icon="bug" open={rightOpen} onToggle={() => set({ rightOpen: !rightOpen })}>
          <DebugPanel />
        </SidePane>
        <BottomPane expId={expId} open={bottomOpen} onToggle={() => set({ bottomOpen: !bottomOpen })} />
      </div>
    </div>
  );
}
