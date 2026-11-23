// Observation sheet of Expt 8: clock frequencies, bit and chip widths, the carrier, and the nulls of
// the DSSS spectrum, with the processing gain and the bandwidths worked out.

import { useState } from 'react';
import { MathText } from '../../ui/MathText.tsx';

const LS = 'vlab.pce.dsss.obs.v1';
const FIELDS = [
  ['word', 'Data word D8 … D1', ''], ['fb', 'Bit clock BK, $f_b$', 'kHz'], ['tb', 'Bit width $T_b$ (cursors)', 'µs'],
  ['fpn', 'PN clock PNCK', 'kHz'], ['tc', 'Chip width $T_c$ (cursors)', 'µs'], ['frf', 'RF carrier $f_c$', 'kHz'],
  ['lo', 'DSSS spectrum: lower null', 'kHz'], ['hi', 'DSSS spectrum: upper null', 'kHz'],
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

export function DsssObservations() {
  const [sheet, setSheet] = useState(load);
  const update = (next: Sheet) => { setSheet(next); try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const tb = num(sheet.tb), tc = num(sheet.tc), fb = num(sheet.fb), fpn = num(sheet.fpn), lo = num(sheet.lo), hi = num(sheet.hi);
  const gp = tb && tc ? tb / tc : null;
  return (
    <>
      <div className="section">
        <h4>Observations</h4>
        <table className="grid obs fm-obs">
          <tbody>
            {FIELDS.map(([k, label, unit]) => (
              <tr key={k}><td><MathText text={label} /></td><td><input type="text" inputMode={k === 'word' ? 'numeric' : 'decimal'} value={sheet[k]} onChange={(e) => update({ ...sheet, [k]: e.target.value })} aria-label={k} /> {unit}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="dim obs-note">Your readings stay in this browser.</p>
      </div>
      <div className="section">
        <h4>Result</h4>
        <p><MathText text="Processing gain $G_p = T_b / T_c$: " /><b>{show(gp, 1)}</b> = <b>{show(gp ? 10 * Math.log10(gp) : null, 1)} dB</b>
          <span className="dim"> · from the clocks, PNCK / BK: {show(fb && fpn ? fpn / fb : null, 1)}</span></p>
        <table className="grid obs res">
          <thead><tr><th>Bandwidth (null to null)</th><th>Measured (kHz)</th><th>Theory (kHz)</th></tr></thead>
          <tbody>
            <tr><td style={{ fontFamily: 'var(--sans)' }}>DSSS-BPSK</td><td>{show(lo !== null && hi !== null ? hi - lo : null, 1)}</td><td><MathText text={`$2 / T_c$ = ${show(tc ? 2000 / tc : null, 1)}`} /></td></tr>
            <tr><td style={{ fontFamily: 'var(--sans)' }}>BPSK of the message alone</td><td>—</td><td><MathText text={`$2 / T_b$ = ${show(tb ? 2000 / tb : null, 1)}`} /></td></tr>
          </tbody>
        </table>
        <p className="dim obs-note"><MathText text="The spectrum is centred on $f_c$; its first nulls lie $1 / T_c$ either side (SEC/DIV 100 µs, MATH FFT, CURSOR Source MATH). The ratio of the two bandwidths is the processing gain." /></p>
      </div>
    </>
  );
}
