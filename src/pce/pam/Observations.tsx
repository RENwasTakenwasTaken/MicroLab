// Observation sheet of Expt 3: message and sampling frequencies as read on the oscilloscope, with
// the Nyquist rate and the spectral lines to expect worked out from them.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.pam.obs.v1';
interface Sheet { fm: string; em: string; fs: string[] }
const blank = (): Sheet => ({ fm: '', em: '', fs: ['16', '', ''] });
function load(): Sheet {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (v && Array.isArray(v.fs)) return { ...blank(), ...v };
  } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));

export function PamObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const fm = num(sheet.fm);
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            <tr><td><MathText text="Message frequency $f_m$" /></td><td><input type="text" inputMode="decimal" value={sheet.fm} onChange={(e) => update({ ...sheet, fm: e.target.value })} aria-label="fm" /> kHz</td></tr>
            <tr><td><MathText text="Message amplitude $E_m$" /></td><td><input type="text" inputMode="decimal" value={sheet.em} onChange={(e) => update({ ...sheet, em: e.target.value })} aria-label="em" /> V pp</td></tr>
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="Nyquist rate $2 f_m$: " /><b>{show(fm !== null ? 2 * fm : null)} kHz</b></p>
        <table className="grid obs res">
          <thead><tr><th><MathText text="$f_s$ (kHz)" /></th><th><MathText text="$f_s / f_m$" /></th><th><MathText text="$f_s - f_m$ (kHz)" /></th><th>Sampling</th></tr></thead>
          <tbody>
            {sheet.fs.map((f, i) => {
              const fs = num(f), ok = fs !== null && fm !== null;
              return (
                <tr key={i}>
                  <td><input type="text" inputMode="decimal" value={f} onChange={(e) => update({ ...sheet, fs: sheet.fs.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`fs ${i + 1}`} /></td>
                  <td>{show(ok && fm ? fs / fm : null)}</td>
                  <td>{show(ok ? fs - fm : null)}</td>
                  <td style={{ fontFamily: 'var(--sans)' }}>{!ok ? '—' : fs > 2 * fm ? 'above Nyquist' : fs === 2 * fm ? 'at Nyquist' : 'below: aliasing'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim obs-note"><MathText text="The spectrum shows lines at $f_m$, $f_s - f_m$ and $f_s + f_m$. When $f_s - f_m$ comes below $f_m$ the copies have crossed: the recovered signal is no longer the message." /></p>
      </div>
    </>
  );
}
