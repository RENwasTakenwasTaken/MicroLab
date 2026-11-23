// Observation sheet of Expt 5: clock readings and, for each line code, the first null read off the
// FFT, compared with the bit rate.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.lc.obs.v1';
/** Codes of the syllabus title, with the first null theory gives (in bit rates). */
const ROWS: [string, number][] = [['Unipolar NRZ', 1], ['Bipolar NRZ', 1], ['Unipolar RZ', 2], ['Bipolar RZ', 2], ['AMI', 1], ['Manchester', 2]];
interface Sheet { word: string; ck: string; bk: string; tb: string; nulls: string[] }
const blank = (): Sheet => ({ word: '', ck: '', bk: '', tb: '', nulls: ROWS.map(() => '') });
function load(): Sheet {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (v && Array.isArray(v.nulls) && v.nulls.length === ROWS.length) return { ...blank(), ...v };
  } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));

export function LcObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const field = (k: 'word' | 'ck' | 'bk' | 'tb', unit: string, mode: 'decimal' | 'numeric' = 'decimal') =>
    <><input type="text" inputMode={mode} value={sheet[k]} onChange={(e) => update({ ...sheet, [k]: e.target.value })} aria-label={k} /> {unit}</>;
  const bk = num(sheet.bk), tb = num(sheet.tb);
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            <tr><td>Data word D8 … D1</td><td>{field('word', '', 'numeric')}</td></tr>
            <tr><td>Clock CK</td><td>{field('ck', 'kHz')}</td></tr>
            <tr><td><MathText text="Bit clock BK, $f_b$" /></td><td>{field('bk', 'kHz')}</td></tr>
            <tr><td><MathText text="Bit width $T_b$ (cursors)" /></td><td>{field('tb', 'µs')}</td></tr>
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="$1 / T_b$: " /><b>{show(tb ? 1000 / tb : null)} kHz</b> <span className="dim">(should agree with the bit clock)</span></p>
        <table className="grid obs res">
          <thead><tr><th>Line code</th><th>First null (kHz)</th><th><MathText text="null / $f_b$" /></th><th>Theory</th></tr></thead>
          <tbody>
            {ROWS.map(([name, k], i) => {
              const f = num(sheet.nulls[i]);
              return (
                <tr key={name}>
                  <td style={{ fontFamily: 'var(--sans)' }}>{name}</td>
                  <td><input type="text" inputMode="decimal" value={sheet.nulls[i]} onChange={(e) => update({ ...sheet, nulls: sheet.nulls.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`first null of ${name}`} /></td>
                  <td>{show(f !== null && bk ? f / bk : null)}</td>
                  <td><MathText text={k === 1 ? '$f_b$' : '$2 f_b$'} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim obs-note"><MathText text="The first null is the first frequency above 0 where the envelope of the spectral lines falls to the noise floor. A word that repeats every 8 bits gives lines $f_b / 8$ apart; what matters is their envelope." /></p>
      </div>
    </>
  );
}
