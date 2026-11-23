// Observation sheet of Expt 6: clock readings, and for minimum and maximum noise the levels read on
// the noisy signal, the raw data and the received data, with the signal-to-noise ratio worked out.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.mf.obs.v1';
const CASES = ['Minimum noise', 'Maximum noise'];
const COLS = [['noise', 'Noise p-p (V)'], ['raw', 'Raw data peak (V)'], ['ok', 'Received = sent? (Y/N)']] as const;
type Key = (typeof COLS)[number][0];
interface Sheet { word: string; ck: string; bk: string; tb: string; rows: Record<Key, string>[] }
const blankRow = (): Record<Key, string> => ({ noise: '', raw: '', ok: '' });
const blank = (): Sheet => ({ word: '', ck: '', bk: '', tb: '', rows: CASES.map(blankRow) });
function load(): Sheet {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (v && Array.isArray(v.rows) && v.rows.length === CASES.length) return { ...blank(), ...v, rows: v.rows.map((r: object) => ({ ...blankRow(), ...r })) };
  } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));
/** Half the NRZ swing: the distance from the decision level to either data level (V). */
const A = 2.5;

export function MfObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const field = (k: 'word' | 'ck' | 'bk' | 'tb', unit: string, mode: 'decimal' | 'numeric' = 'decimal') =>
    <><input type="text" inputMode={mode} value={sheet[k]} onChange={(e) => update({ ...sheet, [k]: e.target.value })} aria-label={k} /> {unit}</>;
  const edit = (i: number, k: Key, v: string) => update({ ...sheet, rows: sheet.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const tb = num(sheet.tb);
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            <tr><td>Data word D8 … D1</td><td>{field('word', '', 'numeric')}</td></tr>
            <tr><td>Carrier clock CK</td><td>{field('ck', 'kHz')}</td></tr>
            <tr><td><MathText text="Bit clock BK, $f_b$" /></td><td>{field('bk', 'kHz')}</td></tr>
            <tr><td><MathText text="Bit width $T_b$ (cursors)" /></td><td>{field('tb', 'µs')}</td></tr>
          </tbody>
        </table>
        <table className="grid obs">
          <thead><tr><th>Noise setting</th>{COLS.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
          <tbody>
            {CASES.map((c, i) => (
              <tr key={c}>
                <td style={{ fontFamily: 'var(--sans)' }}>{c}</td>
                {COLS.map(([k]) => <td key={k}><input type="text" inputMode={k === 'ok' ? 'text' : 'decimal'} value={sheet.rows[i][k]} onChange={(e) => edit(i, k, e.target.value)} aria-label={`${k} with ${c.toLowerCase()}`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dim obs-note">Noise p-p: on the Gaussian Noise pin, frozen with RUN/STOP. Raw data peak: the top of the ramp at the end of a 1. Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="$1 / T_b$: " /><b>{show(tb ? 1000 / tb : null)} kHz</b> <span className="dim">(should agree with the bit clock)</span></p>
        <table className="grid obs res">
          <thead><tr><th>Noise setting</th><th><MathText text="$σ ≈$ p-p / 6 (V)" /></th><th><MathText text="SNR = $20 log (A / σ)$ (dB)" /></th></tr></thead>
          <tbody>
            {CASES.map((c, i) => {
              const pp = num(sheet.rows[i].noise), s = pp !== null && pp > 0 ? pp / 6 : null;
              return <tr key={c}><td style={{ fontFamily: 'var(--sans)' }}>{c}</td><td>{show(s, 3)}</td><td>{show(s ? 20 * Math.log10(A / s) : null, 1)}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="dim obs-note"><MathText text="A = 2.5 V: half the NRZ swing, the distance from the decision level to either data level at the adder output. The integrator raises this ratio by about $√(2 B T_b)$, B being the noise bandwidth, which is why the received data stays clean long after the noisy signal looks hopeless." /></p>
      </div>
    </>
  );
}
