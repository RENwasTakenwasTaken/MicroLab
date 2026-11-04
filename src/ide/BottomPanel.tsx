// Output area: build log, problems, programmer, simulator log, UART terminal, logic analyzer.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLab, type BottomTab } from '../app/store.ts';
import { useBench } from '../app/bench.ts';
import { sim } from '../app/sim.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { LogicAnalyzer } from '../debug/LogicAnalyzer.tsx';
import { Icon } from '../ui/icons.tsx';

function BuildOutput() {
  const b = useLab((s) => s.build);
  const building = useLab((s) => s.building);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [b]);
  if (building) return <div className="empty"><span className="spinner" style={{ display: 'inline-block' }} /> Compiling with the real toolchain…</div>;
  if (!b) return <div className="empty">Build the project to see compiler output (Ctrl+B).</div>;
  return (
    <pre className="console" ref={ref}>
      {b.log.split('\n').map((l, i) => (
        <div key={i} className={/error|FAILED/i.test(l) ? 'c-err' : /warning/i.test(l) ? 'c-warn' : /SUCCESSFUL|0 Error/.test(l) ? 'c-ok' : ''}>{l || ' '}</div>
      ))}
    </pre>
  );
}

function Problems() {
  const b = useLab((s) => s.build);
  const d = b?.diagnostics ?? [];
  if (!d.length) return <div className="empty">{b ? 'No problems detected.' : 'No build yet.'}</div>;
  return (
    <table className="grid">
      <thead><tr><th style={{ width: 70 }}>Severity</th><th style={{ width: 80 }}>Location</th><th>Message</th></tr></thead>
      <tbody>
        {d.map((x, i) => (
          <tr key={i} style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('vlab:goto-line', { detail: x.line }))}>
            <td><span className={`tag ${x.severity === 'error' ? 'err' : x.severity === 'warning' ? 'warn' : 'blue'}`}>{x.severity}</span></td>
            <td>main.c:{x.line}{x.col > 1 ? `:${x.col}` : ''}</td>
            <td style={{ whiteSpace: 'normal', fontFamily: 'var(--sans)' }}>{x.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Programmer() {
  const up = useBench((s) => s.upload);
  const log = up.log;
  const busy = up.phase === 'erasing' || up.phase === 'programming' || up.phase === 'verifying' || up.phase === 'waiting';
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log]);
  if (!log.length) return <div className="empty">Click the lab computer, then UPLOAD to program the board through the USB HID bootloader.</div>;
  return (
    <pre className="console" ref={ref}>
      <div className="c-dim">*****************************************************</div>
      {log.map((l, i) => <div key={i} className={/complete|successful/i.test(l) ? 'c-ok' : /error|failed|aborted/i.test(l) ? 'c-err' : /warning|→/.test(l) ? 'c-warn' : ''}>{l || ' '}</div>)}
      {busy && <div className="pulse">▍</div>}
    </pre>
  );
}

function SimLog() {
  const log = useLab((s) => s.simLog);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [log]);
  if (!log.length) return <div className="empty">Simulator messages (warnings about timing, configuration and peripherals) appear here.</div>;
  return (
    <div className="console" ref={ref}>
      {log.map((l, i) => (
        <div key={i} className={l.level === 'error' ? 'c-err' : l.level === 'warn' ? 'c-warn' : ''}>
          <span className="c-dim">[{l.t.toFixed(6)} s]</span> {l.msg}
        </div>
      ))}
    </div>
  );
}

function Uart() {
  const text = useLab((s) => s.uart);
  const [input, setInput] = useState('');
  const [crlf, setCrlf] = useState(true);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [text]);
  const send = () => {
    const s = input + (crlf ? '\r\n' : '');
    sim.send({ type: 'serialRx', bytes: [...s].map((c) => c.charCodeAt(0) & 0xff) });
    setInput('');
  };
  return (
    <div className="uart">
      <pre className="console uart-out" ref={ref}>{text || <span className="c-dim">Characters transmitted by the UART (TXREG / SBUF) appear here. Baud rate follows the program's settings.</span>}</pre>
      <div className="uart-in">
        <input type="text" value={input} placeholder="Send to RX…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={crlf} onChange={(e) => setCrlf(e.target.checked)} />CR+LF</label>
        <button className="btn" onClick={send}>Send</button>
        <button className="btn ghost" onClick={() => useLab.getState().set({ uart: '' })}>Clear</button>
      </div>
    </div>
  );
}

export function BottomPanel({ expId }: { expId: string }) {
  const tab = useLab((s) => s.bottomTab);
  const b = useLab((s) => s.build);
  const logN = useLab((s) => s.simLog.filter((l) => l.level !== 'info').length);
  const exp = getExperiment(expId)!;
  const errs = b?.diagnostics.filter((d) => d.severity === 'error').length ?? 0;
  const warns = b?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0;
  useEffect(() => {
    sim.send({ type: 'analyzer', enabled: tab === 'analyzer' || exp.arch === 'pic18' });
    return () => { if (exp.arch !== 'pic18') sim.send({ type: 'analyzer', enabled: false }); };
  }, [tab, exp.arch]);
  const tabs = useMemo(() => {
    const t: [BottomTab, string, string][] = [['build', 'Output', 'terminal'], ['problems', 'Problems', 'warn']];
    if (exp.arch === 'pic18') t.push(['programmer', 'USB Bootloader', 'download']);
    t.push(['simlog', 'Simulator', 'cpu'], ['uart', 'UART', 'terminal'], ['analyzer', 'Logic Analyzer', 'wave']);
    return t;
  }, [exp.arch]);
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="tabs">
          {tabs.map(([id, label, icon]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => useLab.getState().set({ bottomTab: id })}>
              <Icon name={icon} size={13} /> {label}
              {id === 'problems' && (errs + warns > 0) && <span className={`count ${errs ? 'err' : 'warn'}`}>{errs + warns}</span>}
              {id === 'simlog' && logN > 0 && <span className="count warn">{logN}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        {tab === 'build' && <BuildOutput />}
        {tab === 'problems' && <Problems />}
        {tab === 'programmer' && <Programmer />}
        {tab === 'simlog' && <SimLog />}
        {tab === 'uart' && <Uart />}
        {tab === 'analyzer' && <LogicAnalyzer expId={expId} />}
      </div>
    </div>
  );
}
