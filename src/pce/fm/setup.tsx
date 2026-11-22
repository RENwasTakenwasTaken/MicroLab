// Setup guide of Expt 2 (FM MODEM kit): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { usePce } from '../store.ts';
import { circuit, kitValues, syncKit } from './signals.ts';

const SHORT_NAME: Record<string, string> = { SIG: 'the SIGNAL GEN output', FM: 'BUFFER O/P', BIAS: 'DC BIAS', PLLOUT: 'the PLL output', VCO: 'the PLL VCO output', FLTOUT: 'the FILTER output' };

export function useFmSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const powerSw = usePce((s) => s.powerSw);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const c = circuit(plugs), v = kitValues(knobs);
  const locked = syncKit().locked;
  const mains = plugs.mains.attachedTo === 'wall', power = mains && powerSw;
  const onScope = (node: string) => c.ch1 === node || c.ch2 === node;
  // settings count once reached: the carrier is moved on purpose to find the deviation, and the meter comes off again
  const now = {
    sig: power && Math.abs(v.fm - 1000) <= 40 && Math.abs(v.em - 1) <= 0.08,
    dmm: c.dmmV === 'BIAS' && c.dmmCom === 'GND',
    carrier: power && Math.abs(v.f0 - 50e3) <= 700,
    high: power && v.f0 >= 54.5e3, low: power && v.f0 <= 45.5e3,
    fft: fftOn(scope) && onScope('FM') && c.mod,
    free: power && Math.abs(v.fo - 50e3) <= 1500,
  };
  type Key = keyof typeof now;
  const [seen, setSeen] = useState<Record<Key, boolean>>({ sig: false, dmm: false, carrier: false, high: false, low: false, fft: false, free: false });
  useEffect(() => {
    const keys = Object.keys(now) as Key[];
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])) as Record<Key, boolean>);
  });
  const did = (k: Key) => seen[k] || now[k];
  const warn: string[] = [];
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.groundOff ? 'A black oscilloscope lead is in a socket that is not GND: it ties that point to the ground of the oscilloscope. Move it to the GND socket.' : 'The oscilloscope has no ground on the kit: the trace is mostly mains hum. Put a black lead in the GND socket (the plugs stack).');
  if (c.shorts.length) warn.push(`A cord shorts ${c.shorts.map((n) => SHORT_NAME[n]).join(' and ')} to ground.`);
  if ((c.dmmV || c.dmmCom) && !(c.dmmV && c.dmmCom)) warn.push('The multimeter reads nothing with one lead: red to DC BIAS, black to GND.');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  if (power && c.pllFed && !locked) warn.push('The PLL is not locked: its free-running frequency is too far from the carrier. Bring both to 50 kHz.');
  const go = (view: 'scope' | 'dmm') => () => usePce.getState().setView(view);
  const back = did('high') && did('low') && now.carrier;
  return {
    title: 'Expt 2 · FM modulator and PLL demodulator',
    doneNote: 'All steps done: note the readings, then repeat with other modulating frequencies.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {power && c.pllFed && <> · PLL <b className={locked ? '' : 'c-err'}>{locked ? 'locked' : 'not locked'}</b></>}
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>POWER ON toggle (LED lights)</li>
        </ul>
      </> },
      { key: 'sig', done: did('sig'), body: <>Signal generator: scope CH1 red plug in its output socket, black plug in <b>GND</b>; set <b>1 V pp, 1 kHz</b> <span className="dim">(AMPL. ADJ. and FREQ. ADJ.; read on the <a onClick={go('scope')}>oscilloscope</a>)</span></> },
      { key: 'dmm', done: did('dmm'), body: <>Multimeter: red lead in <b>DC BIAS</b>, black lead in <b>GND</b> <span className="dim">(<a onClick={go('dmm')}>look at the meter</a>)</span></> },
      { key: 'carrier', done: did('carrier'), body: <>Scope on <b>BUFFER O/P</b>: turn the modulator&apos;s FREQ. ADJ. for a <b>50 kHz</b> carrier; note the DC bias, X volts</> },
      { key: 'dev', done: back, body: <>
        Find the deviation per volt, then go back to 50 kHz
        <ul className="wf-sub">
          <li className={did('high') ? 'ok' : ''}>Bias X + 0.5 V: note the frequency F1</li>
          <li className={did('low') ? 'ok' : ''}>Bias X - 0.5 V: note the frequency F2</li>
          <li className={back ? 'ok' : ''}>Back to 50 kHz</li>
        </ul>
      </> },
      { key: 'mod', done: c.mod, body: <>Patch cord: <b>SIGNAL GEN</b> output → modulator input <span className="dim">(top-left socket)</span></> },
      { key: 'fft', done: did('fft'), body: <>FM wave on <b>BUFFER O/P</b>, and its spectrum: MATH MENU, Operation <b>FFT</b> <span className="dim">(SEC/DIV 1 ms gives a 0 to 125 kHz span)</span></> },
      { key: 'free', done: did('free'), body: <>Scope on the PLL&apos;s <b>VCO output</b> (lowest socket), nothing on PLL I/P: PLL FREQ. ADJ. for <b>50 kHz</b> free-running</> },
      { key: 'chain', done: c.pllFed && c.fltFed, body: <>Patch cords: <b>BUFFER O/P</b> → PLL <b>I/P</b>, and PLL <b>O/P</b> → FILTER <b>I/P</b></> },
      { key: 'out', done: onScope('FLTOUT') && locked && c.mod && c.fltFed && c.scopeGnd, body: <>Scope on <b>FILTER O/P</b>: the recovered message signal</> },
    ],
  };
}
