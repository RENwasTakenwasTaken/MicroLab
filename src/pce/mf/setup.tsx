// Setup guide of Expt 6 (matched-filter trainer): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { kitPowered, mainsIn, usePce } from '../store.ts';
import { circuit, kitValues } from './signals.ts';

/** Outputs that swing 0 V to 5 V (the trigger level belongs in the middle). */
const LOGIC = new Set(['CK', 'BK', 'NRZ', 'REC']);
/** Where the noise shows. */
const NOISY = new Set(['GN', 'NOISY']);
const LOW = 0.06, HIGH = 0.7;

export function useMfSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const powerSw = usePce((s) => s.powerSw);
  const power = usePce((s) => kitPowered(s)), mains = usePce((s) => mainsIn(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const both = (a: string, b: string) => (c.ch1 === a && c.ch2 === b) || (c.ch1 === b && c.ch2 === a);
  const onScope = (node: string) => power && c.scopeGnd && (c.ch1 === node || c.ch2 === node);
  const coding = !v.flat, chain = c.dataIn && c.noiseIn, filter = c.toFilter && c.dumpBk;
  // steps count once reached: the probe moves on from one pin to the next
  const now: Record<string, boolean> = {
    ck: onScope('CK'), bk: onScope('BK'), nrz: coding && onScope('NRZ'), cursor: coding && onScope('NRZ') && scope.cursor.type === 't',
    noiseUp: onScope('GN') && v.amp > 0.3, noiseMin: onScope('GN') && v.amp < LOW,
    noisy: coding && c.dataIn && power && c.scopeGnd && both('NOISY', 'NRZ'),
    raw: coding && chain && filter && onScope('RAW'),
    rec: coding && chain && filter && power && c.scopeGnd && both('REC', 'NRZ') && v.amp < 0.25,
    recNoisy: coding && chain && filter && onScope('REC') && v.amp > HIGH,
    rawNoisy: coding && chain && filter && (onScope('RAW') || onScope('NOISY')) && v.amp > HIGH,
  };
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const keys = Object.keys(now);
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])));
  });
  const did = (k: string) => !!seen[k] || now[k];

  const warn: string[] = [];
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to a GND pin (there is one below the NRZ pin of the generator, and one under each output).');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const src = scope.trig.source ? c.ch2 : c.ch1, other = scope.trig.source ? c.ch1 : c.ch2;
  const live = power && c.scopeGnd && !scope.xy;
  const probing = (n: string) => c.ch1 === n || c.ch2 === n;
  if (power && v.flat && (probing('NRZ') || probing('NOISY') || probing('RAW') || probing('REC'))) warn.push(`All eight data switches are ${v.ones ? 'up' : 'down'}: the word never changes, so the data is a flat line. Set a word with both 1s and 0s.`);
  if (live && src && NOISY.has(src) && !(src === 'NOISY' && c.dataIn) && other !== 'NRZ') warn.push('Noise has no edge the trigger can lock on to, so the trace runs free: that is expected. Press RUN/STOP to freeze it and read its peak-to-peak value.');
  else if (live && src && NOISY.has(src) && other === 'NRZ') warn.push(`Trigger on the clean NRZ data, not on the noisy signal: TRIG MENU, Source ${scope.trig.source ? 'CH1' : 'CH2'}.`);
  else if (live && src && LOGIC.has(src) && (scope.trig.level < 0.6 || scope.trig.level > 4.4)) warn.push('The trigger level is at the edge of the signal (it swings 0 V to 5 V), so the picture drifts. Press SET TO 50% or turn TRIGGER LEVEL into the middle of the wave.');
  else if (live && coding && src === 'NRZ' && scope.run && (probing('NOISY') || probing('RAW') || probing('REC'))) warn.push('A data word has several edges that look alike to the trigger, so the picture may jump. Press RUN/STOP to freeze it and compare the two traces.');
  if (power && (probing('RAW') || probing('REC'))) {
    if (!c.toFilter) warn.push(c.nrzToFilter ? 'The NRZ data goes straight into Noise Data. The filter expects the inverted signal from the noise adder, so every bit ramps the same way. Patch NRZ to the adder\'s I/P and the Noisy signal to Noise Data.' : 'Nothing is patched into Noise Data, so the integrator only ramps down. Patch the Noisy signal socket of the adder to Noise Data.');
    else if (!c.dumpBk && !c.dumpCk) warn.push('Raw data sits at a rail: the integrator is never dumped. Patch BK of the generator to the BK input of the integrate and dump filter.');
    else if (c.dumpCk) warn.push('The integrator is dumped by CK, twice in every bit, so each ramp only gets halfway. Its dump input wants the bit clock BK.');
  }
  if (power && probing('NOISY') && !c.dataIn && !c.noiseIn) warn.push('Nothing goes into the noise adder: patch the NRZ socket to its I/P and the Gaussian Noise socket to its noise input.');

  const go = () => usePce.getState().setView('scope');
  const pct = Math.round(v.amp * 100);
  return {
    title: 'Expt 6 · Matched filter',
    doneNote: 'All steps done: sketch the noisy signal, the raw data and the received data with minimum and with maximum noise, with Tb marked.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {' · '}word D8…D1: <b className={v.flat ? 'c-err' : ''}>{v.text.slice(0, 4)} {v.text.slice(4)}</b>
      {' · '}noise: <b>{pct} %</b>
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>MAINS ON toggle (neon lights)</li>
        </ul>
      </> },
      { key: 'ck', done: did('ck'), body: <>CH1 probe: tip into <b>CK</b>, ground clip on the <b>GND pin</b> below the NRZ pin. Note its frequency <span className="dim">(W1; AUTOSET, then MEASURE on the <a onClick={go}>oscilloscope</a>)</span></> },
      { key: 'bk', done: did('bk'), body: <>Probe on <b>BK</b>: the bit rate f<sub>b</sub> <span className="dim">(W2; lab-sheet step 3, the word clock, is not on this kit)</span></> },
      { key: 'word', done: coding, body: <>Set the data word on switches <b>S8 … S1</b> <span className="dim">(any word with both 1s and 0s; a lit LED is a 1)</span></> },
      { key: 'nrz', done: did('nrz') && did('cursor'), body: <>
        Probe on the <b>NRZ</b> pin: the word, D8 first <span className="dim">(W4)</span>
        <ul className="wf-sub">
          <li className={did('nrz') ? 'ok' : ''}>NRZ data on the screen <span className="dim">(SEC/DIV 50 µs)</span></li>
          <li className={did('cursor') ? 'ok' : ''}>Bit width T<sub>b</sub>: CURSOR, Type <b>Time</b></li>
        </ul>
      </> },
      { key: 'noise', done: did('noiseUp') && did('noiseMin'), body: <>
        Probe on the <b>Gaussian Noise</b> pin <span className="dim">(W9)</span>
        <ul className="wf-sub">
          <li className={did('noiseUp') ? 'ok' : ''}>Turn <b>AMPLITUDE</b> up and watch the noise grow <span className="dim">(RUN/STOP freezes it)</span></li>
          <li className={did('noiseMin') ? 'ok' : ''}>Then keep it at minimum <span className="dim">(fully anticlockwise)</span></li>
        </ul>
      </> },
      { key: 'patch1', done: chain, body: <>
        Patch the noise adder
        <ul className="wf-sub">
          <li className={c.dataIn ? 'ok' : ''}>Generator <b>NRZ</b> socket → adder <b>I/P</b> <span className="dim">(long cord)</span></li>
          <li className={c.noiseIn ? 'ok' : ''}><b>Gaussian Noise</b> socket → adder <b>Gaussian Noise</b> input <span className="dim">(short cord)</span></li>
        </ul>
      </> },
      { key: 'noisy', done: did('noisy'), body: <>CH1 on <b>Noisy signal</b>, CH2 on <b>NRZ</b> <span className="dim">(W10; trigger on CH2. The adder inverts the data)</span></> },
      { key: 'patch2', done: filter, body: <>
        Patch the integrate and dump filter
        <ul className="wf-sub">
          <li className={c.toFilter ? 'ok' : ''}><b>Noisy signal</b> socket → <b>Noise Data</b></li>
          <li className={c.dumpBk ? 'ok' : ''}>Generator <b>BK</b> → <b>BK</b> of the filter <span className="dim">(dump clock)</span></li>
        </ul>
      </> },
      { key: 'raw', done: did('raw'), body: <>Probe on <b>Raw Data</b>: a ramp through each bit <span className="dim">(W11)</span></> },
      { key: 'rec', done: did('rec'), body: <><b>Recd O/P Data</b> on one channel and <b>NRZ</b> on the other, noise low <span className="dim">(W12)</span></> },
      { key: 'more', done: did('recNoisy') && did('rawNoisy'), body: <>
        Turn <b>AMPLITUDE</b> up past 70 % and look again
        <ul className="wf-sub">
          <li className={did('rawNoisy') ? 'ok' : ''}>Noisy signal or raw data with high noise</li>
          <li className={did('recNoisy') ? 'ok' : ''}>Received data with high noise</li>
        </ul>
      </> },
    ],
  };
}
