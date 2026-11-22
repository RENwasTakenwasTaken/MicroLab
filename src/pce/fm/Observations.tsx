// Observation sheet of Expt 2: the readings of the journal, with the deviation, modulation index
// and bandwidth worked out from them.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.fm.obs.v1';
interface Sheet { x: string; f1: string; f2: string; em: string; fc: string; fm: string[] }
const blank = (): Sheet => ({ x: '', f1: '', f2: '', em: '1', fc: '50', fm: ['1', '2', '3'] });
function load(): Sheet {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (v && Array.isArray(v.fm)) return { ...blank(), ...v };
  } catch { /* storage unavailable or damaged: start empty */ }
  return blank();
}
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));

export function FmObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const field = (key: 'x' | 'f1' | 'f2' | 'em' | 'fc', label: string, unit: string) => (
    <tr>
      <td><MathText text={label} /></td>
      <td><input type="text" inputMode="decimal" value={sheet[key]} onChange={(e) => update({ ...sheet, [key]: e.target.value })} aria-label={key} /> {unit}</td>
    </tr>
  );
  const f1 = num(sheet.f1), f2 = num(sheet.f2), em = num(sheet.em);
  // F1 and F2 are for 0.5 V either side of X: the deviation a 1 V peak-to-peak signal gives
  const perVolt = f1 !== null && f2 !== null ? Math.abs(f1 - f2) : null;
  const dev = perVolt !== null && em !== null ? (perVolt * em) / 2 : null;
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            {field('fc', 'Carrier frequency $f_c$', 'kHz')}
            {field('em', 'Modulating signal amplitude $E_m$', 'V pp')}
            {field('x', 'DC bias at 50 kHz, X', 'V')}
            {field('f1', 'Frequency at X + 0.5 V, $F_1$', 'kHz')}
            {field('f2', 'Frequency at X - 0.5 V, $F_2$', 'kHz')}
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text={`Frequency deviation $Δf = (F_1 - F_2) / 2$ for a 1 V pp signal, times $E_m$: `} /><b>{show(dev)} kHz</b>
          {perVolt !== null && <span className="dim"> ({show(perVolt)} kHz per volt)</span>}</p>
        <table className="grid obs res">
          <thead><tr><th><MathText text="$f_m$ (kHz)" /></th><th><MathText text="$β = Δf / f_m$" /></th><th><MathText text="$BW = 2 (Δf + f_m)$ (kHz)" /></th></tr></thead>
          <tbody>
            {sheet.fm.map((f, i) => {
              const fm = num(f);
              return (
                <tr key={i}>
                  <td><input type="text" inputMode="decimal" value={f} onChange={(e) => update({ ...sheet, fm: sheet.fm.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`fm ${i + 1}`} /></td>
                  <td>{show(dev !== null && fm ? dev / fm : null)}</td>
                  <td>{show(dev !== null && fm !== null ? 2 * (dev + fm) : null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim obs-note">Compare each spectrum with the Bessel-function table for its β: the number of sidebands that matter grows with β, and the carrier nearly vanishes near β = 2.4.</p>
      </div>
    </>
  );
}
