// Lab sheet of a PCE experiment: aim, objectives, apparatus, theory, procedure, and for Expt 1 the
// observation table of the journal with the results worked out from the student's own readings.

import { useState } from 'react';
import { Icon } from '../ui/icons.tsx';
import { MathText } from '../ui/MathText.tsx';
import { getPceExperiment } from './experiments.ts';
import { FmObservations } from './fm/Observations.tsx';
import { PamObservations } from './pam/Observations.tsx';
import { LcObservations } from './lc/Observations.tsx';

const LS = 'vlab.pce.am.obs.v1';
const CASES = ['m < 1', 'm = 1', 'm > 1'];
const COLS = [['em', 'E_m'], ['ec', 'E_c'], ['emax', 'E_{max}'], ['emin', 'E_{min}'], ['l1', 'L_1'], ['l2', 'L_2']] as const;
type Key = (typeof COLS)[number][0];
type Row = Record<Key, string>;
const blank = (): Row => ({ em: '', ec: '', emax: '', emin: '', l1: '', l2: '' });
function load(): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS) ?? 'null');
    if (Array.isArray(v) && v.length === CASES.length) return v.map((r) => ({ ...blank(), ...r }));
  } catch { /* storage unavailable or damaged: start empty */ }
  return CASES.map(blank);
}
const save = (rows: Row[]) => { try { localStorage.setItem(LS, JSON.stringify(rows)); } catch { /* storage unavailable */ } };
const num = (s: string) => { const v = parseFloat(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };
const ratio = (a: number | null, b: number | null) => (a === null || b === null || a + b === 0 ? null : (a - b) / (a + b));
const show = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));
/** Load resistance the lab sheet assumes for the power calculations. */
const R = 50;

function Observations() {
  const [rows, setRows] = useState(load);
  const update = (next: Row[]) => { setRows(next); save(next); };
  const edit = (i: number, k: Key, v: string) => update(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const clear = () => { if (confirm('Clear all your readings?')) update(CASES.map(blank)); };
  const filled = rows.some((r) => COLS.some(([k]) => r[k].trim() !== ''));
  return (
    <>
      <div className="section">
        <h4>Observations <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>(volts, as read on the oscilloscope)</span></h4>
        <table className="grid obs">
          <thead><tr><th>Case</th>{COLS.map(([k, label]) => <th key={k}><MathText text={`$${label}$`} /></th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{CASES[i]}</td>
                {COLS.map(([k]) => <td key={k}><input type="text" inputMode="decimal" value={r[k]} onChange={(e) => edit(i, k, e.target.value)} aria-label={`${k} for ${CASES[i]}`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dim obs-note">
          <MathText text="Read $E_m$ and $E_c$ the same way (both peak-to-peak). For m > 1 enter $E_{min}$ and $L_2$ as negative values. Your readings stay in this browser." />
        </p>
        {filled && <button className="btn" onClick={clear}><Icon name="undo" /> Clear readings</button>}
      </div>
      <div className="section">
        <h4>Result</h4>
        <table className="grid obs res">
          <thead>
            <tr>
              <th>Case</th>
              <th><MathText text="$E_m / E_c$" /></th>
              <th title="(Emax - Emin) / (Emax + Emin)">envelope</th>
              <th title="(L1 - L2) / (L1 + L2)">trapezoid</th>
              <th><MathText text="$P_c$ (W)" /></th>
              <th><MathText text="$P_{SB}$ (W)" /></th>
              <th><MathText text="$P_T$ (W)" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const em = num(r.em), ec = num(r.ec);
              const m = em !== null && ec ? em / ec : null;
              const pc = ec !== null ? (ec * ec) / (2 * R) : null;
              const psb = m !== null && ec !== null ? (m * m * ec * ec) / (4 * R) : null;
              return (
                <tr key={i}>
                  <td>{CASES[i]}</td>
                  <td>{show(m)}</td>
                  <td>{show(ratio(num(r.emax), num(r.emin)))}</td>
                  <td>{show(ratio(num(r.l1), num(r.l2)))}</td>
                  <td>{show(pc, 4)}</td>
                  <td>{show(psb, 4)}</td>
                  <td>{show(pc !== null && psb !== null ? pc + psb : null, 4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim obs-note">
          <MathText text={`The three values of m should agree for each case. Powers use the lab sheet's formulas with R = ${R} Ω and $E_c$ as you entered it: the formulas are for the peak amplitude, so peak-to-peak readings give four times the power. Follow your instructor's convention.`} />
        </p>
      </div>
    </>
  );
}

export function LabSheet({ expId }: { expId: string }) {
  const exp = getPceExperiment(expId)!;
  const list = (title: string, items: string[], ordered = false) => {
    const body = items.map((t) => <li key={t}><MathText text={t} /></li>);
    return <div className="section"><h4>{title}</h4>{ordered ? <ol className="notes">{body}</ol> : <ul className="notes">{body}</ul>}</div>;
  };
  return (
    <div className="exp-sheet pce-sheet">
      <div className="section">
        <div className="exp-head">
          <span className="tag blue">Experiment {exp.no}</span>
          <span className="tag">{exp.co}</span>
          <span className="tag">{exp.kit}</span>
        </div>
        <h3 className="exp-title">{exp.card}</h3>
        <p style={{ marginTop: 8 }}>{exp.title}</p>
      </div>
      {list('Objectives', exp.objectives, true)}
      {list('Apparatus', exp.apparatus)}
      {list('Procedure', exp.procedure, true)}
      {expId === 'am' && <Observations />}
      {expId === 'fm' && <FmObservations />}
      {expId === 'pam' && <PamObservations />}
      {expId === 'lc' && <LcObservations />}
      {list('Theory notes', exp.theory)}
    </div>
  );
}
