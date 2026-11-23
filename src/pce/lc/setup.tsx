// Setup guide of Expt 5 (line-code trainer): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { kitPowered, mainsIn, usePce } from '../store.ts';
import { CODES, CODE_NAME, type CodeId } from './layout.ts';
import { circuit, kitValues } from './signals.ts';

const title = (s: string) => s.split(' ').map((w) => (w.length > 3 && !w.includes('-') ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
const UNIPOLAR = new Set(['CK', 'BK', 'NRZ', 'UNRZ', 'NRZM', 'URZ', 'MAN', 'BPM']);
const CLOCKS = new Set(['CK', 'BK']);
const isData = (n: string | null) => !!n && (n === 'NRZ' || (CODES as readonly string[]).includes(n));

export function useLcSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const powerSw = usePce((s) => s.powerSw);
  const power = usePce((s) => kitPowered(s)), mains = usePce((s) => mainsIn(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const onScope = (node: string) => power && c.scopeGnd && (c.ch1 === node || c.ch2 === node);
  const coding = !v.flat;
  const fft = fftOn(scope);
  // steps count once reached: the probe moves on from one pin to the next
  const now: Record<string, boolean> = {
    bk: onScope('BK'), ck: onScope('CK'), nrz: coding && onScope('NRZ'), cursor: coding && onScope('NRZ') && scope.cursor.type === 't',
    fft: coding && fft && isData(scope.math.source ? c.ch2 : c.ch1) && c.scopeGnd && power,
    ...Object.fromEntries(CODES.map((k) => [k, coding && onScope(k)])),
  };
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const keys = Object.keys(now);
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])));
  });
  const did = (k: string) => !!seen[k] || now[k];

  const warn: string[] = [];
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND post or pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to the GND post beside the NRZ pin.');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const src = scope.trig.source ? c.ch2 : c.ch1, other = scope.trig.source ? c.ch1 : c.ch2;
  const live = power && c.scopeGnd && !scope.xy && !fft;
  if (power && v.flat && (isData(c.ch1) || isData(c.ch2))) warn.push(`All eight data switches are ${v.ones ? 'up' : 'down'}: the word never changes, so the data is a flat line. Set a word with both 1s and 0s.`);
  if (live && src && UNIPOLAR.has(src) && (scope.trig.level < 0.6 || scope.trig.level > 4.4)) warn.push('The trigger level is at the edge of the signal (the outputs swing 0 V to 5 V), so the picture drifts. Press SET TO 50% or turn TRIGGER LEVEL into the middle of the wave.');
  else if (live && coding && src && CLOCKS.has(src) && isData(other)) warn.push(`The trigger source is the clock, and every clock edge looks alike: the data on the other channel cannot stand still. TRIG MENU, Source ${scope.trig.source ? 'CH1' : 'CH2'}.`);
  else if (live && coding && isData(src) && scope.run) warn.push('A data word has several edges that look alike to the trigger, so the picture may jump from one to another. Press RUN/STOP to freeze it and read it, as in the lab.');
  const go = () => usePce.getState().setView('scope');
  const codes = CODES.filter((k) => did(k)).length;
  return {
    title: 'Expt 5 · Line codes',
    doneNote: 'All steps done: sketch each code for your word with Tb marked, and its spectrum with the first null marked.',
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
      { key: 'bk', done: did('bk'), body: <>CH1 probe: tip into the <b>BK</b> pin, ground clip on the <b>GND post</b> beside the NRZ pin. Note the bit clock frequency <span className="dim">(AUTOSET, then MEASURE on the <a onClick={go}>oscilloscope</a>)</span></> },
      { key: 'ck', done: did('ck'), body: <>Probe on <b>CK</b>: note its frequency and compare it with BK</> },
      { key: 'word', done: coding, body: <>Set the data word on switches <b>S8 … S1</b> <span className="dim">(the one your instructor gives, or any word with both 1s and 0s; a lit LED is a 1)</span></> },
      { key: 'nrz', done: did('nrz') && did('cursor'), body: <>
        Probe on the <b>NRZ</b> pin: the word, D8 first
        <ul className="wf-sub">
          <li className={did('nrz') ? 'ok' : ''}>NRZ data on the screen <span className="dim">(SEC/DIV 50 µs shows a little over one word)</span></li>
          <li className={did('cursor') ? 'ok' : ''}>Bit width T<sub>b</sub>: CURSOR, Type <b>Time</b></li>
        </ul>
      </> },
      { key: 'codes', done: codes === CODES.length, body: <>
        NRZ on CH1, CH2 probe on each output of the line coding section in turn <span className="dim">(trigger on CH1; {codes} of {CODES.length} seen)</span>
        <ul className="wf-sub">
          {CODES.map((k: CodeId) => <li key={k} className={did(k) ? 'ok' : ''}>{title(CODE_NAME[k])}</li>)}
        </ul>
      </> },
      { key: 'fft', done: did('fft'), body: <>Spectrum of a code: MATH MENU, Operation <b>FFT</b>, Source CH2. Find the first null <span className="dim">(SEC/DIV 250 µs, FFT Zoom X2, then HORIZONTAL POSITION until 0 Hz is at the left edge: 25 kHz per division. CURSOR, Source MATH reads the frequency)</span></> },
    ],
  };
}
