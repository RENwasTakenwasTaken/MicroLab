// Observation sheet of Expt 4: the sampling clock and rate, the step sizes for 3 and 4 bits, with the
// maximum quantisation noise, the signalling rate and the bandwidth worked out.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.pcm.obs.v1';
const FIELDS = [
  ['fclk', 'Generated sampling clock (SAMP CLOCK)', 'MHz'], ['ts', 'Frame period $T_s$ on PCM O/P (cursors)', 'µs'],
  ['s3', 'Step size, 3-bit PCM (RAW DATA)', 'mV'], ['s4', 'Step size, 4-bit PCM (RAW DATA)', 'mV'],
  ['fm', 'Message frequency $f_m$', 'Hz'], ['vpp', 'Message amplitude', 'V p-p'],
] as const;
type Key = (typeof FIELDS)[number][0];
type Sheet = Record<Key, string>;
const blank = (): Sheet => Object.fromEntries(FIELDS.map(([k]) => [k, ''])) as Sheet;
function load(): Sheet {
  try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (v && typeof v === 'object') return { ...blank(), ...v }; } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));

export function PcmObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const fclk = num(sheet.fclk), ts = num(sheet.ts), s3 = num(sheet.s3), s4 = num(sheet.s4), fm = num(sheet.fm);
  /** sampling rate in kHz: from the frame period, else from the clock */
  const fs = ts ? 1000 / ts : fclk ? (fclk * 1000) / 64 : null;
  const row = (n: 3 | 4, s: number | null) => (
    <tr key={n}>
      <td style={{ fontFamily: 'var(--sans)' }}>{n}-bit ({2 ** n} levels)</td>
      <td>{show(s, 0)}</td><td>{show(s !== null ? s / 2 : null, 0)}</td>
      <td>{show(fs !== null ? n * fs : null, 1)}</td><td>{show(fs !== null ? (n * fs) / 2 : null, 1)}</td>
    </tr>
  );
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            {FIELDS.map(([k, label, unit]) => (
              <tr key={k}><td><MathText text={label} /></td><td><input type="text" inputMode="decimal" value={sheet[k]} onChange={(e) => update({ ...sheet, [k]: e.target.value })} aria-label={k} /> {unit}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="Sampling frequency $f_s$: " /><b>{show(fs, 2)} kHz</b>
          <span className="dim"> · from the clock, f / 64: {show(fclk ? (fclk * 1000) / 64 : null, 2)} kHz · samples per message cycle: {show(fs && fm ? (fs * 1000) / fm : null, 1)}</span></p>
        <table className="grid obs res">
          <thead><tr><th>PCM</th><th>Step S (mV)</th><th>Max. quantisation noise S/2 (mV)</th><th>Signalling rate n·f<sub>s</sub> (kb/s)</th><th>Bandwidth n·f<sub>s</sub>/2 (kHz)</th></tr></thead>
          <tbody>{row(3, s3)}{row(4, s4)}</tbody>
        </table>
        <p className="dim obs-note"><MathText text="Step size: the height of one stair of RAW DATA (CURSOR, Type Amplitude). Doubling the levels halves $S$ and the quantisation noise, but raises the signalling rate and the bandwidth by a third." /></p>
      </div>
    </>
  );
}
