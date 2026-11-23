// Setup guide of Expt 7 (FSK trainer): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { RECORD } from '../scope/state.ts';
import { kitPowered, mainsIn, usePce } from '../store.ts';
import { circuit, kitValues } from './signals.ts';

/** Outputs that swing 0 V to 5 V (the trigger level belongs in the middle). */
const LOGIC = new Set(['CK', 'BK', 'NRZ', 'NRZB', 'REC', 'VCO']);
const BURSTS = new Set(['ASK1', 'ASK2', 'FSK']);

export function useFskSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const powerSw = usePce((s) => s.powerSw);
  const power = usePce((s) => kitPowered(s)), mains = usePce((s) => mainsIn(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const live = power && c.scopeGnd;
  const onScope = (node: string) => live && (c.ch1 === node || c.ch2 === node);
  const withNrz = (node: string) => live && ((c.ch1 === node && c.ch2 === 'NRZ') || (c.ch2 === node && c.ch1 === 'NRZ'));
  const coding = !v.flat, mods = !!c.bm1 && !!c.bm2 && c.bm1 !== c.bm2;
  const fft = fftOn(scope), fftNode = scope.math.source ? c.ch2 : c.ch1;
  const nyquist = RECORD / (scope.sdiv * 10) / 2;
  const spectrum = (node: string) => live && fft && fftNode === node && nyquist > 700e3;
  const now: Record<string, boolean> = {
    nrz: coding && onScope('NRZ'), cursor: coding && onScope('NRZ') && scope.cursor.type === 't', nrzb: coding && onScope('NRZB'),
    f1: onScope('F1'), f2: onScope('F2'),
    ask1: coding && mods && withNrz('ASK1'), ask1f: coding && !!c.bm1 && spectrum('ASK1'),
    ask2: coding && mods && withNrz('ASK2'), ask2f: coding && !!c.bm2 && spectrum('ASK2'),
    fsk: coding && mods && withNrz('FSK'), fskf: coding && mods && spectrum('FSK'),
    raw: coding && mods && c.demod && withNrz('RAW'), rec: coding && mods && c.demod && withNrz('REC'),
  };
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const keys = Object.keys(now);
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])));
  });
  const did = (k: string) => !!seen[k] || now[k];

  const warn: string[] = [];
  const probing = (n: string) => c.ch1 === n || c.ch2 === n;
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to a GND pin (one in each modulator, the adder and the demodulator).');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  if (power && v.flat && (probing('NRZ') || probing('NRZB') || BURSTS.has(c.ch1 ?? '') || BURSTS.has(c.ch2 ?? ''))) warn.push(`All eight data switches are ${v.ones ? 'up' : 'down'}: the word never changes, so there is no keying to see. Set a word with both 1s and 0s.`);
  const src = scope.trig.source ? c.ch2 : c.ch1, other = scope.trig.source ? c.ch1 : c.ch2;
  const yt = live && !scope.xy && !fft;
  if (yt && src && BURSTS.has(src) && other === 'NRZ') warn.push(`Trigger on the NRZ data, not on the bursts: TRIG MENU, Source ${scope.trig.source ? 'CH1' : 'CH2'}, then SET TO 50%.`);
  else if (yt && src && LOGIC.has(src) && (scope.trig.level < 0.6 || scope.trig.level > 4.4)) warn.push('The trigger level is at the edge of the signal (it swings 0 V to 5 V), so the picture drifts. Press SET TO 50% or turn TRIGGER LEVEL into the middle of the wave.');
  if (power && probing('ASK1') && !c.bm1) warn.push('Nothing is patched into the NRZ input of balanced modulator-1, so only a little carrier leaks through. Patch NRZ̅ to it with the short cord.');
  if (power && probing('ASK2') && !c.bm2) warn.push('Nothing is patched into the NRZ input of balanced modulator-2, so only a little carrier leaks through. Patch NRZ to it with the long cord.');
  if (power && c.bm1 && c.bm1 === c.bm2) warn.push('Both modulators get the same data, so both carriers come and go together: that is not FSK. One modulator wants NRZ and the other NRZ̅.');
  if (power && (probing('RAW') || probing('REC')) && !c.demod) warn.push('Nothing reaches FSK I/P, so the loop runs free and the raw data sits still. Patch the FSK O/P socket to FSK I/P with the short green cord.');
  if (live && fft && nyquist < 700e3) warn.push(`At this SEC/DIV the FFT only reaches ${Math.round(nyquist / 1000)} kHz, below the 640 kHz carrier, which then folds back to a wrong place. Set SEC/DIV to 100 µs (0 to 1.25 MHz).`);

  const go = () => usePce.getState().setView('scope');
  return {
    title: 'Expt 7 · BFSK',
    doneNote: 'All steps done: sketch the data, carriers, ASK1, ASK2 and FSK with their spectra, and compare the bandwidths you measured with 2 fb and (fH - fL) + 2 fb.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {' · '}word D8…D1: <b className={v.flat ? 'c-err' : ''}>{v.text.slice(0, 4)} {v.text.slice(4)}</b>
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>MAINS ON toggle (neon lights)</li>
        </ul>
      </> },
      { key: 'word', done: coding, body: <>Set the data word on switches <b>S8 … S1</b> <span className="dim">(any word with both 1s and 0s; a lit LED is a 1)</span></> },
      { key: 'nrz', done: did('nrz') && did('cursor'), body: <>
        CH1 probe: tip on the <b>NRZ</b> pin, ground clip on a <b>GND pin</b> <span className="dim">(AUTOSET and MEASURE on the <a onClick={go}>oscilloscope</a>)</span>
        <ul className="wf-sub">
          <li className={did('nrz') ? 'ok' : ''}>NRZ data on the screen</li>
          <li className={did('cursor') ? 'ok' : ''}>Bit width T<sub>b</sub>: CURSOR, Type <b>Time</b></li>
        </ul>
      </> },
      { key: 'nrzb', done: did('nrzb'), body: <>Probe on <b>NRZ̅</b>, the pin above NRZ: the complemented data</> },
      { key: 'carriers', done: did('f1') && did('f2'), body: <>
        Carriers at the test points of the carrier generator <span className="dim">(measure the frequency)</span>
        <ul className="wf-sub">
          <li className={did('f1') ? 'ok' : ''}><b>f1</b>: 640 kHz</li>
          <li className={did('f2') ? 'ok' : ''}><b>f2</b>: 320 kHz</li>
        </ul>
      </> },
      { key: 'patch', done: mods, body: <>
        Patch the data into the two balanced modulators
        <ul className="wf-sub">
          <li className={c.bm1 === 'NRZB' ? 'ok' : ''}><b>NRZ̅</b> → NRZ input of <b>modulator-1</b> <span className="dim">(short cord)</span></li>
          <li className={c.bm2 === 'NRZ' ? 'ok' : ''}><b>NRZ</b> → NRZ input of <b>modulator-2</b> <span className="dim">(long cord)</span></li>
        </ul>
      </> },
      { key: 'ask1', done: did('ask1') && did('ask1f'), body: <>
        CH1 on NRZ, CH2 on <b>ASK1 O/P</b> <span className="dim">(trigger on CH1)</span>
        <ul className="wf-sub">
          <li className={did('ask1') ? 'ok' : ''}>ASK1: 640 kHz bursts</li>
          <li className={did('ask1f') ? 'ok' : ''}>Its spectrum: MATH MENU, FFT, Source CH2 <span className="dim">(SEC/DIV 100 µs)</span></li>
        </ul>
      </> },
      { key: 'ask2', done: did('ask2') && did('ask2f'), body: <>
        CH2 on <b>ASK2 O/P</b>
        <ul className="wf-sub">
          <li className={did('ask2') ? 'ok' : ''}>ASK2: 320 kHz bursts</li>
          <li className={did('ask2f') ? 'ok' : ''}>Its spectrum</li>
        </ul>
      </> },
      { key: 'fsk', done: did('fsk') && did('fskf'), body: <>
        CH2 on <b>FSK O/P</b> of the adder <span className="dim">(the ASK outputs reach it inside the kit)</span>
        <ul className="wf-sub">
          <li className={did('fsk') ? 'ok' : ''}>FSK: 320 kHz for a 1, 640 kHz for a 0</li>
          <li className={did('fskf') ? 'ok' : ''}>Its spectrum: bandwidth between the outer nulls <span className="dim">(CURSOR, Source MATH)</span></li>
        </ul>
      </> },
      { key: 'demod', done: c.demod, body: <>Patch the <b>FSK O/P</b> socket → <b>FSK I/P</b> <span className="dim">(short green cord; lab-sheet steps 9, 10, 13, the noise, are not on this kit)</span></> },
      { key: 'raw', done: did('raw'), body: <>CH2 on <b>RAW Data</b> with NRZ on CH1: the loop's smoothed control voltage</> },
      { key: 'rec', done: did('rec'), body: <>CH2 on <b>NRZ O/P</b> of the data squarer with NRZ on CH1: the received data, a little delayed</> },
    ],
  };
}
