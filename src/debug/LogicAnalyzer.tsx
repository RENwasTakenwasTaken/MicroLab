// Multi-channel logic analyzer drawn on a canvas from the transition log.

import { useEffect, useRef, useState } from 'react';
import { analyzer } from '../app/analyzer.ts';
import { useLab } from '../app/store.ts';
import { getExperiment } from '../experiments/experiments.ts';
import type { PinRef } from '../sim/board/types.ts';
import { pinName } from '../sim/board/types.ts';

const WINDOWS = [100e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 100e-3, 200e-3, 500e-3, 1, 2, 5];
const COLORS = ['#3fb68b', '#4c9df3', '#e8b04a', '#a77bf3', '#46c6d8', '#ef5b5b', '#f78c6c', '#c3e88d'];
const fmtT = (s: number) => (s >= 1 ? `${s} s` : s >= 1e-3 ? `${+(s * 1e3).toFixed(3)} ms` : `${+(s * 1e6).toFixed(1)} µs`);
const fmtF = (f: number) => (f >= 1e3 ? `${(f / 1e3).toFixed(3)} kHz` : `${f.toFixed(2)} Hz`);
/** Up to two full ports plus a few single pins. */
const MAX_CH = 20;
/** PIC18F4550 PORTE has RE0–RE2 as I/O (RE3 is MCLR); every other port has 8 bits. */
const portBits = (arch: string, p: number) => (arch === 'pic18' && p === 4 ? 3 : 8);
const portName = (arch: string, p: number) => (arch === 'pic18' ? `PORT${'ABCDE'[p]}` : `P${p}`);

function defaultChannels(expId: string, arch: string): PinRef[] {
  const exp = getExperiment(expId);
  const probes = exp?.measurements.filter((m) => m.kind === 'pinFreq' || m.kind === 'pinState').map((m) => (m as { pin: PinRef }).pin) ?? [];
  if (expId === 'exp4') probes.push({ port: 2, bit: 2 }, { port: 2, bit: 1 });
  if (expId === 'exp5' || expId === 'exp6') probes.push({ port: 4, bit: 0 }, { port: 4, bit: 2 }, { port: 3, bit: 0 }, { port: 3, bit: 7 });
  if (!probes.length) probes.push(arch === 'mcs51' ? { port: 1, bit: 0 } : { port: 3, bit: 0 });
  return probes;
}

export function LogicAnalyzer({ expId }: { expId: string }) {
  const arch = useLab((s) => s.arch);
  const [channels, setChannels] = useState<PinRef[]>(() => defaultChannels(expId, arch));
  const [win, setWin] = useState(expId === 'exp3' ? 5e-3 : expId === 'exp4' ? 1e-3 : arch === 'mcs51' ? 2 : 20e-3);
  const [frozen, setFrozen] = useState(false);
  const [measures, setMeasures] = useState<(ReturnType<typeof analyzer.measure>)[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frozenAt = useRef(0);
  const ports = arch === 'pic18' ? 5 : 4;

  useEffect(() => {
    let raf = 0;
    let lastMeasure = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0e1216';
      g.fillRect(0, 0, W, H);
      const t1 = frozen ? frozenAt.current : analyzer.now;
      const t0 = t1 - win;
      const left = 64, right = W - 8;
      const x = (t: number) => left + ((t - t0) / win) * (right - left);
      // grid
      g.strokeStyle = '#1c232c';
      g.lineWidth = 1;
      for (let i = 0; i <= 10; i++) { const gx = left + (i / 10) * (right - left); g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, H - 16); g.stroke(); }
      g.fillStyle = '#5d6878';
      g.font = '10px JetBrains Mono, Consolas, monospace';
      g.fillText(`${fmtT(win / 10)}/div`, left, H - 4);
      g.fillText(`t = ${t1.toFixed(6)} s`, right - 130, H - 4);
      const rowH = Math.min(46, (H - 22) / Math.max(1, channels.length));
      channels.forEach((ch, i) => {
        const y0 = 6 + i * rowH, hi = y0 + 6, lo = y0 + rowH - 10;
        g.fillStyle = COLORS[i % COLORS.length];
        g.font = '600 11px JetBrains Mono, Consolas, monospace';
        g.fillText(pinName(arch, ch), 8, y0 + rowH / 2 + 2);
        const { initial, edges } = analyzer.edges(ch.port, ch.bit, t0, t1);
        g.strokeStyle = COLORS[i % COLORS.length];
        g.lineWidth = 1.6;
        g.beginPath();
        let level = initial;
        g.moveTo(left, level ? hi : lo);
        // decimate dense edge sequences: at most one vertical per pixel column
        let lastPx = -1;
        for (const e of edges) {
          const ex = x(e.t);
          if (Math.floor(ex) === lastPx && edges.length > (right - left) * 2) { level = e.level; continue; }
          lastPx = Math.floor(ex);
          g.lineTo(ex, level ? hi : lo);
          g.lineTo(ex, e.level ? hi : lo);
          level = e.level;
        }
        g.lineTo(right, level ? hi : lo);
        g.stroke();
      });
      const now = performance.now();
      if (!frozen && now - lastMeasure > 250) {
        lastMeasure = now;
        setMeasures(channels.map((ch) => analyzer.measure(ch.port, ch.bit, Math.max(win, 0.05))));
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [channels, win, frozen, arch]);

  const addChannel = (v: string) => {
    if (!v) return;
    const [p, b] = v.split(':').map(Number);
    if (!channels.some((c) => c.port === p && c.bit === b)) setChannels([...channels, { port: p, bit: b }].slice(0, MAX_CH));
  };
  /** Every bit of a port, MSB first (so the rows read like the binary value); bits already shown are kept. */
  const addPort = (v: string) => {
    if (v === '') return;
    const p = +v;
    const bits = Array.from({ length: portBits(arch, p) }, (_, i) => portBits(arch, p) - 1 - i);
    const extra = bits.map((b) => ({ port: p, bit: b })).filter((n) => !channels.some((c) => c.port === n.port && c.bit === n.bit));
    setChannels([...channels, ...extra].slice(0, MAX_CH));
  };

  return (
    <div className="la">
      <div className="la-side">
        <div className="la-ctl">
          <select value={win} onChange={(e) => setWin(+e.target.value)} title="Time window">
            {WINDOWS.map((w) => <option key={w} value={w}>{fmtT(w)} window</option>)}
          </select>
          <button className={`btn ${frozen ? 'active' : ''}`} onClick={() => { frozenAt.current = analyzer.now; setFrozen(!frozen); }}>{frozen ? 'Resume' : 'Freeze'}</button>
          {channels.length > 0 && <button className="btn ghost" onClick={() => setChannels([])} title="Remove every channel">Clear</button>}
        </div>
        <div className="la-add">
          <select value="" onChange={(e) => addChannel(e.target.value)} title="Add one pin">
            <option value="">+ add channel…</option>
            {Array.from({ length: ports }, (_, p) => Array.from({ length: portBits(arch, p) }, (_, b) => (
              <option key={`${p}:${b}`} value={`${p}:${b}`}>{pinName(arch, { port: p, bit: b })}</option>
            )))}
          </select>
          <select value="" onChange={(e) => addPort(e.target.value)} title="Add every bit of a port">
            <option value="">+ add a port…</option>
            {Array.from({ length: ports }, (_, p) => <option key={p} value={p}>{portName(arch, p)} (all {portBits(arch, p)} bits)</option>)}
          </select>
        </div>
        <table className="grid">
          <thead><tr><th>Ch</th><th>Freq</th><th>Duty</th><th /></tr></thead>
          <tbody>
            {channels.map((ch, i) => {
              const m = measures[i];
              return (
                <tr key={`${ch.port}:${ch.bit}`}>
                  <td style={{ color: COLORS[i % COLORS.length] }}>{pinName(arch, ch)}</td>
                  <td>{m ? fmtF(m.freq) : '—'}</td>
                  <td>{m ? `${(m.duty * 100).toFixed(1)}%` : '—'}</td>
                  <td><button className="btn ghost icon" style={{ height: 18, width: 18 }} onClick={() => setChannels(channels.filter((_, k) => k !== i))}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <canvas ref={canvas} className="la-canvas" />
    </div>
  );
}
