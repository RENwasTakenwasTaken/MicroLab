// Experiment sheet: objective, problem statement, connections, expected vs actual output.

import { useRef } from 'react';
import { useFrame, useLab } from '../app/store.ts';
import { getExperiment, type Measurement } from '../experiments/experiments.ts';
import { pinName } from '../sim/board/types.ts';
import type { FrameData } from '../sim/protocol.ts';
import { Icon } from '../ui/icons.tsx';
import { MathText } from '../ui/MathText.tsx';

function useSmoothed() {
  const store = useRef(new Map<string, number>());
  return (key: string, v: number) => {
    const prev = store.current.get(key);
    const next = prev === undefined || Math.abs(prev - v) > Math.max(1, Math.abs(v) * 0.2) ? v : prev * 0.8 + v * 0.2;
    store.current.set(key, next);
    return next;
  };
}

const lcdLine = (row: number[]) => row.map((c) => (c < 0 ? ' ' : c === 0xdf ? '°' : c >= 32 && c < 127 ? String.fromCharCode(c) : '▯')).join('');

function Actual({ m, f, smooth }: { m: Measurement; f: FrameData | null; smooth: (k: string, v: number) => number }) {
  if (!f) return <span className="dim">—</span>;
  const b = f.board;
  switch (m.kind) {
    case 'pinFreq': {
      const port = f.ports[m.pin.port];
      const hz = smooth(m.label, port?.freq[m.pin.bit] ?? 0);
      const ok = m.expectHz ? Math.abs(hz - m.expectHz) / m.expectHz <= (m.tolerance ?? 0.02) : null;
      return (
        <span className="mono">
          {f.running ? (hz >= 1000 ? `${(hz / 1000).toFixed(3)} kHz` : `${hz.toFixed(2)} Hz`) : '—'}
          {m.expectHz && f.running && hz > 0 && <span className={`tag ${ok ? 'ok' : 'warn'}`} style={{ marginLeft: 6 }}>{ok ? 'within tolerance' : `expected ${m.expectHz} Hz`}</span>}
        </span>
      );
    }
    case 'pinState': {
      const lv = (f.ports[m.pin.port]?.level >> m.pin.bit) & 1;
      return <span className="mono">{pinName(f.cpu.arch, m.pin)} = {lv} {lv ? '(released)' : '(pressed)'}</span>;
    }
    case 'leds':
      if (b.kind !== 'pic') return null;
      return (
        <span className="led-strip">
          {[...b.leds].reverse().map((v, i) => <span key={i} className="mini-led" style={{ opacity: 0.15 + v * 0.85, boxShadow: v > 0.3 ? `0 0 ${4 + v * 6}px #ff3b3b` : 'none' }} title={`L${7 - i}`} />)}
          <span className="mono dim" style={{ marginLeft: 8 }}>0x{b.leds.reduce((a, v, i) => a | ((v > 0.5 ? 1 : 0) << i), 0).toString(16).toUpperCase().padStart(2, '0')}</span>
        </span>
      );
    case 'ledbar51':
      if (b.kind !== 'mcs51') return null;
      return (
        <span className="led-strip">
          {[...b.leds].reverse().map((v, i) => <span key={i} className="mini-led" style={{ opacity: 0.15 + v * 0.85, boxShadow: v > 0.3 ? `0 0 ${4 + v * 6}px #ff3b3b` : 'none' }} title={`L${7 - i} (P${b.ledPort}.${7 - i})`} />)}
        </span>
      );
    case 'relay': return b.kind === 'pic' ? <span className={`tag ${b.relay ? 'ok' : ''}`}>{b.relay ? 'ENERGISED (lamp ON)' : 'released'}</span> : null;
    case 'buzzer': return b.kind === 'pic' ? <span className={`tag ${b.buzzer > 0.02 ? 'warn' : ''}`}>{b.buzzer > 0.02 ? `sounding (${(b.buzzer * 100).toFixed(0)} % drive)` : 'silent'}</span> : null;
    case 'motor':
      return b.kind === 'pic' ? <span className="mono">{smooth('rpm', b.motor.rpm).toFixed(0)} rpm · drive {(b.motor.drive * 100).toFixed(0)} %</span> : null;
    case 'pwm': {
      const p = (f.periph.pwm as { mode: number; enabled: boolean; freq: number; duty: number }[] | undefined)?.[m.channel];
      if (!p || (p.mode & 0x0c) !== 0x0c) return <span className="dim">PWM not configured</span>;
      return <span className="mono">{(p.freq / 1000).toFixed(3)} kHz · duty {(p.duty * 100).toFixed(1)} %{!p.enabled && <span className="tag warn" style={{ marginLeft: 6 }}>Timer2 off</span>}</span>;
    }
    case 'temperature':
      return b.kind === 'pic' ? <span className="mono">{b.temperature.toFixed(1)} °C → {(b.lm35Volts * 1000).toFixed(0)} mV on AN0</span> : null;
    case 'lcd':
      if (b.kind !== 'pic') return null;
      return (
        <div className="lcd-mini">
          {b.lcd.rows.map((r, i) => <div key={i}>{b.power && b.lcd.displayOn ? lcdLine(r) : ' '.repeat(16)}</div>)}
        </div>
      );
  }
}

export function ExperimentPanel({ expId }: { expId: string }) {
  const exp = getExperiment(expId)!;
  const f = useFrame((s) => s.frame);
  const smooth = useSmoothed();
  const modified = useLab((s) => s.sources[expId] !== undefined);
  return (
    <div className="exp-sheet">
      <div className="section">
        <div className="exp-head">
          <span className="tag blue">Experiment {exp.no}</span>
          <span className="tag">{exp.co}</span>
          <span className="tag">{exp.mcu}</span>
        </div>
        <h3 className="exp-title">{exp.title}</h3>
      </div>
      <div className="section">
        <h4>Objective</h4>
        <p><MathText text={exp.objective} /></p>
        <h4 style={{ marginTop: 12 }}>Problem statement</h4>
        <p><MathText text={exp.problem} /></p>
      </div>
      <div className="section">
        <h4><Icon name="check" size={13} /> Expected vs actual output</h4>
        <ul className="expect">{exp.expected.map((e) => <li key={e}><MathText text={e} /></li>)}</ul>
        <div className="actual">
          {exp.measurements.map((m) => (
            <div key={m.label} className="actual-row">
              <span className="muted">{m.label}</span>
              <Actual m={m} f={f} smooth={smooth} />
            </div>
          ))}
        </div>
        {!f?.loaded && <p className="dim" style={{ marginTop: 8, fontSize: 11.5 }}>{exp.arch === 'mcs51' ? 'Build in Keil (with Create HEX File), download it with SST EasyIAP and press RESET to see the actual output.' : 'Upload your program through the USB bootloader and press RESET to see the actual output.'}</p>}
      </div>
      <div className="section">
        <h4>Connections</h4>
        <table className="grid conn">
          <thead><tr><th>Signal</th><th>MCU pin</th><th>Board</th></tr></thead>
          <tbody>
            {exp.connections.map((c) => (
              <tr key={c.signal}>
                <td style={{ fontFamily: 'var(--sans)' }}>{c.signal}</td>
                <td>{c.mcuPin}</td>
                <td style={{ whiteSpace: 'normal', fontFamily: 'var(--sans)' }}>
                  {c.board} {!c.verified && <span className="tag warn" title="Inferred from the photograph / typical lab programs — not verified against a schematic">unverified</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section">
        <h4>Theory notes</h4>
        <ul className="notes">{exp.theory.map((t) => <li key={t}><MathText text={t} /></li>)}</ul>
      </div>
      <div className="section">
        <h4>Procedure</h4>
        {exp.video && <p className="exp-video"><Icon name="play" size={12} /> <a href={exp.video} target="_blank" rel="noopener noreferrer">Watch the setup video</a></p>}
        <ol className="notes">{exp.procedure.map((t) => <li key={t}><MathText text={t} /></li>)}</ol>
      </div>
      <div className="section">
        <h4>Hardware</h4>
        <ul className="notes">{exp.hardware.map((t) => <li key={t}>{t}</li>)}</ul>
        {modified && (
          <button className="btn" style={{ marginTop: 8 }} onClick={() => { if (confirm('Discard your changes and restore the reference program?')) { useLab.getState().resetSource(expId); window.dispatchEvent(new Event('vlab:source-reset')); } }}>
            <Icon name="undo" /> Restore reference program
          </button>
        )}
      </div>
    </div>
  );
}
