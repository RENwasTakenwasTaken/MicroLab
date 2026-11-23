// Observation sheet of Expt 7: bit width and carrier frequencies, and for ASK1, ASK2 and FSK the
// nulls read off the FFT, with the bandwidths compared with theory.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.fsk.obs.v1';
const ROWS = ['ASK1 (640 kHz)', 'ASK2 (320 kHz)', 'BFSK'] as const;
interface Sheet { word: string; tb: string; f1: string; f2: string; lo: string[]; hi: string[] }
const blank = (): Sheet => ({ word: '', tb: '', f1: '', f2: '', lo: ROWS.map(() => ''), hi: ROWS.map(() => '') });
function load(): Sheet {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (v && Array.isArray(v.lo) && v.lo.length === ROWS.length && Array.isArray(v.hi)) return { ...blank(), ...v };
  } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

export function FskObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const field = (k: 'word' | 'tb' | 'f1' | 'f2', unit: string, mode: 'decimal' | 'numeric' = 'decimal') =>
    <><input type="text" inputMode={mode} value={sheet[k]} onChange={(e) => update({ ...sheet, [k]: e.target.value })} aria-label={k} /> {unit}</>;
  const edge = (k: 'lo' | 'hi', i: number) =>
    <input type="text" inputMode="decimal" value={sheet[k][i]} onChange={(e) => update({ ...sheet, [k]: sheet[k].map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`${k === 'lo' ? 'lower' : 'upper'} null of ${ROWS[i]}`} />;
  const tb = num(sheet.tb), f1 = num(sheet.f1), f2 = num(sheet.f2), fb = tb ? 1000 / tb : null;
  const theory = [fb ? 2 * fb : null, fb ? 2 * fb : null, fb && f1 !== null && f2 !== null ? Math.abs(f1 - f2) + 2 * fb : null];
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            <tr><td>Data word D8 … D1</td><td>{field('word', '', 'numeric')}</td></tr>
            <tr><td><MathText text="Bit width $T_b$ (cursors)" /></td><td>{field('tb', 'µs')}</td></tr>
            <tr><td><MathText text="Carrier f1 ($f_H$)" /></td><td>{field('f1', 'kHz')}</td></tr>
            <tr><td><MathText text="Carrier f2 ($f_L$)" /></td><td>{field('f2', 'kHz')}</td></tr>
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="Bit rate $f_b = 1 / T_b$: " /><b>{show(fb)} kHz</b></p>
        <table className="grid obs res">
          <thead><tr><th>Signal</th><th>Lower null (kHz)</th><th>Upper null (kHz)</th><th>Bandwidth (kHz)</th><th>Theory (kHz)</th></tr></thead>
          <tbody>
            {ROWS.map((name, i) => {
              const lo = num(sheet.lo[i]), hi = num(sheet.hi[i]);
              return (
                <tr key={name}>
                  <td style={{ fontFamily: 'var(--sans)' }}>{name}</td>
                  <td>{edge('lo', i)}</td><td>{edge('hi', i)}</td>
                  <td>{show(lo !== null && hi !== null ? hi - lo : null)}</td>
                  <td>{show(theory[i])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim obs-note"><MathText text="Theory: $2 f_b$ for each ASK signal and $(f_H - f_L) + 2 f_b$ for BFSK. Read the nulls on the FFT (SEC/DIV 100 µs, CURSOR Source MATH): the first places either side of the outer lobes where the envelope of the 10 kHz-spaced lines falls to the floor." /></p>
      </div>
    </>
  );
}
