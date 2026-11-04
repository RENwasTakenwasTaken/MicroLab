// IDE toolbar. Mirrors MPLAB X (PIC) or Keil µVision (8051) command sets.

import { useEffect } from 'react';
import { useFrame, useLab } from '../app/store.ts';
import { build, pause, reset, run, sim, step, toggleDebugSession } from '../app/sim.ts';
import { useBench } from '../app/bench.ts';
import { buildOnly } from '../app/upload.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { Icon } from '../ui/icons.tsx';

const fmtTime = (s: number) => (s < 1 ? `${(s * 1000).toFixed(1)} ms` : s < 60 ? `${s.toFixed(3)} s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`);
const fmtHz = (hz: number) => (hz >= 1e6 ? `${(hz / 1e6).toFixed(hz % 1e6 ? 3 : 0)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`);

function TBtn({ icon, label, kbd, onClick, disabled, primary, active }: { icon: string; label: string; kbd?: string; onClick(): void; disabled?: boolean; primary?: boolean; active?: boolean }) {
  return (
    <button className={`btn ${primary ? 'primary' : 'ghost'} ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={kbd ? `${label} (${kbd})` : label}>
      <Icon name={icon} /> <span className="tb-label">{label}</span>
    </button>
  );
}

export function TopBar({ expId }: { expId: string }) {
  const exp = getExperiment(expId)!;
  const is51 = exp.arch === 'mcs51';
  const building = useLab((s) => s.building);
  const programming = useLab((s) => s.programming);
  const programmed = useLab((s) => s.programmed);
  const debugSession = useLab((s) => s.debugSession);
  const buildRes = useLab((s) => s.build);
  const stale = useLab((s) => s.buildStale);
  const speed = useLab((s) => s.speed);
  const running = useFrame((s) => s.frame?.running ?? false);
  const simTime = useFrame((s) => s.frame?.simTime ?? 0);
  const ratio = useFrame((s) => s.frame?.speedRatio ?? 0);
  const clock = useFrame((s) => s.frame?.clock);
  const power = useFrame((s) => s.frame?.board.power ?? true);
  const canRun = programmed && power;

  // keyboard shortcuts (MPLAB X / Keil style)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const lab = useLab.getState();
      const r = useFrame.getState().frame?.running;
      if ((e.ctrlKey && e.key.toLowerCase() === 'b') || (is51 && e.key === 'F7')) { e.preventDefault(); if (is51) build(expId); else buildOnly(expId); }
      else if (!is51 && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); useBench.getState().setView('computer'); }
      else if (is51 && e.ctrlKey && e.key === 'F5') { e.preventDefault(); toggleDebugSession(expId); }
      else if (e.key === 'F5' && !e.ctrlKey) { e.preventDefault(); if (lab.programmed) { if (r) pause(); else run(); } }
      else if (e.key === 'F10') { e.preventDefault(); if (lab.programmed) step('over'); }
      else if (e.key === 'F11' && e.ctrlKey) { e.preventDefault(); if (lab.programmed) step('out'); }
      else if (e.key === 'F11') { e.preventDefault(); if (lab.programmed) step('line'); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [expId, is51]);

  const setSpeed = (v: number) => { useLab.getState().set({ speed: v }); sim.send({ type: 'speed', value: v }); };
  const errors = buildRes?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warnings = buildRes?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;

  return (
    <div className="topbar">
      <div className="tb-group">
        <button className="btn ghost icon" title="All experiments" onClick={() => { location.hash = '#/'; }}><Icon name="home" /></button>
        <div className="tb-title">
          <span className="tb-exp">Expt {exp.no}</span>
          <span className="tb-name">{exp.title}</span>
        </div>
      </div>

      <div className="tb-group">
        <span className="tb-tool">{is51 ? 'µVision' : 'MPLAB X'}</span>
        {is51 && <TBtn icon="hammer" label="Build" kbd="F7" onClick={() => build(expId)} disabled={building} />}
        {is51 ? (
          <TBtn icon="bug" label={debugSession ? 'Stop Debug' : 'Start Debug'} kbd="Ctrl+F5" onClick={() => toggleDebugSession(expId)} active={debugSession} primary={!debugSession && !!buildRes?.ok} />
        ) : (
          <TBtn icon="terminal" label="Lab Computer" kbd="Ctrl+Shift+P" onClick={() => useBench.getState().setView('computer')} primary={!programmed || stale} />
        )}
        <span className="tb-sep" />
        {running
          ? <TBtn icon="pause" label={is51 ? 'Pause' : 'Halt (debug)'} kbd="F5" onClick={pause} />
          : <TBtn icon="play" label={is51 ? 'Run' : 'Resume'} kbd="F5" onClick={run} disabled={!canRun} />}
        {is51 && <TBtn icon="reset" label="Reset" onClick={reset} disabled={!programmed} />}
        <span className="tb-sep" />
        <button className="btn ghost icon" title="Step Into (F11)" disabled={!canRun || running} onClick={() => step('line')}><Icon name="stepInto" /></button>
        <button className="btn ghost icon" title="Step Over (F10)" disabled={!canRun || running} onClick={() => step('over')}><Icon name="stepOver" /></button>
        <button className="btn ghost icon" title="Step Out (Ctrl+F11)" disabled={!canRun || running} onClick={() => step('out')}><Icon name="stepOut" /></button>
        <button className="btn ghost icon" title="Step one machine instruction" disabled={!canRun || running} onClick={() => step('instr')}><Icon name="stepInstr" /></button>
      </div>

      <div className="tb-group tb-status">
        {building && <span className="tag blue"><span className="spinner" /> building</span>}
        {!building && buildRes && (
          <span className={`tag ${buildRes.ok ? (stale ? 'warn' : 'ok') : 'err'}`} title={stale ? 'Source changed since the last build' : ''}>
            {buildRes.ok ? (stale ? 'build stale' : `build ok${warnings ? ` · ${warnings}W` : ''}`) : `${errors || 1} error${errors === 1 ? '' : 's'}`}
          </span>
        )}
        {programming && <span className="tag warn pulse">programming…</span>}
        <span className={`run-dot ${running ? 'on' : programmed ? 'idle' : ''}`} />
        <span className="mono tb-time" title="Simulated time since reset">{fmtTime(simTime)}</span>
        {running && <span className="mono dim" title="Simulation speed relative to real time">{ratio >= 0.995 && ratio <= 1.005 ? '1.00×' : `${ratio.toFixed(2)}×`}</span>}
        {clock && <span className="mono dim" title={`Oscillator: ${clock.mode}`}>{fmtHz(clock.fosc)}</span>}
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} title="Simulation speed">
          <option value={0.01}>0.01×</option>
          <option value={0.1}>0.1×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>Real time</option>
          <option value={4}>4×</option>
          <option value={0}>Max</option>
        </select>
      </div>
    </div>
  );
}
