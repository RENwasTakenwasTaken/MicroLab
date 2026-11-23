// Setup guide of Expt 3 (sampling board): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { kitPowered, usePce } from '../store.ts';
import { circuit, kitValues } from './signals.ts';

const SHORT_NAME: Record<string, string> = { MSG: 'the Message Signal', GATE: 'the Gating Pulse Signal', NAT: 'the natural sampled output', SH: 'the sample and hold output', FLAT: 'the flat top output', DEMOUT: 'the recovered signal output' };
const SAMPLED = ['NAT', 'SH', 'FLAT'];

export function usePamSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const power = usePce((s) => kitPowered(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const onScope = (node: string) => c.scopeGnd && (c.ch1 === node || c.ch2 === node);
  const sampling = power && c.msgIn && c.gateIn && v.em > 0.2;
  const under = v.fs < 2 * v.fm;
  // steps count once reached: each output is looked at in turn, and the sampling frequency is lowered on purpose at the end
  const now = {
    msg: power && onScope('MSG') && v.fm >= 950 && v.fm <= 3050 && v.em >= 0.5,
    gate: power && onScope('GATE') && Math.abs(v.fs - 16e3) <= 500 && Math.abs(v.duty - 0.5) <= 0.04,
    nat: sampling && onScope('NAT'), sh: sampling && onScope('SH'), flat: sampling && onScope('FLAT'),
    fft: sampling && fftOn(scope) && SAMPLED.some(onScope),
    dem: sampling && !!c.demFrom && onScope('DEMOUT') && !under,
    alias: sampling && !!c.demFrom && onScope('DEMOUT') && under,
  };
  type Key = keyof typeof now;
  const [seen, setSeen] = useState<Record<Key, boolean>>({ msg: false, gate: false, nat: false, sh: false, flat: false, fft: false, dem: false, alias: false });
  useEffect(() => {
    const keys = Object.keys(now) as Key[];
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])) as Record<Key, boolean>);
  });
  const did = (k: Key) => seen[k] || now[k];
  const warn: string[] = [];
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.groundOff ? 'A black oscilloscope lead is in a socket that is not GND: it ties that point to the ground of the oscilloscope. Move it to a black socket.' : 'The oscilloscope has no ground on the board: the trace is mostly mains hum. Put a black lead in one of the black GND sockets.');
  if (c.shorts.length) warn.push(`A cord shorts ${c.shorts.map((n) => SHORT_NAME[n]).join(' and ')} to ground.`);
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const probing = SAMPLED.some((n) => c.ch1 === n || c.ch2 === n) || c.ch1 === 'DEMOUT' || c.ch2 === 'DEMOUT';
  if (power && probing && !c.msgIn) warn.push('Nothing reaches the message input of the modulator: patch the Message Signal to the upper yellow socket.');
  if (power && probing && !c.gateIn) warn.push('Nothing reaches the gating input of the modulator: patch the Gating Pulse Signal to the lower yellow socket.');
  const go = () => usePce.getState().setView('scope');
  return {
    title: 'Expt 3 · Sampling and reconstruction',
    doneNote: 'All steps done: sketch the three sampled signals, their spectra and the recovered signal.',
    warn,
    foot: <>
      Board: <b className={power ? '' : 'c-err'}>{power ? 'powered' : 'adapter not plugged in'}</b>
      {sampling && <> · sampling at <b className={under ? 'c-err' : ''}>{under ? 'less' : 'more'} than twice</b> the message frequency</>}
    </>,
    steps: [
      { key: 'power', done: power, body: <>Plug the board&apos;s adapter into the wall socket <span className="dim">(behind the bench, on the left; the board has no switch)</span></> },
      { key: 'msg', done: did('msg'), body: <>Scope CH1 on <b>Message Signal</b>, black plug in a GND socket: set a sine between <b>1 and 3 kHz</b> <span className="dim">(P1, P2; read it on the <a onClick={go}>oscilloscope</a>)</span></> },
      { key: 'gate', done: did('gate'), body: <>Scope on <b>Gating Pulse Signal</b>: set <b>16 kHz, 50 % duty cycle</b> <span className="dim">(P3, P4)</span></> },
      { key: 'patch', done: c.msgIn && c.gateIn, body: <>
        Patch the two signals to the modulator
        <ul className="wf-sub">
          <li className={c.msgIn ? 'ok' : ''}>Message Signal → upper yellow socket</li>
          <li className={c.gateIn ? 'ok' : ''}>Gating Pulse Signal → lower yellow socket</li>
        </ul>
      </> },
      { key: 'out', done: did('nat') && did('sh') && did('flat'), body: <>
        Observe each output beside the message
        <ul className="wf-sub">
          <li className={did('nat') ? 'ok' : ''}>Natural Sampled Signal</li>
          <li className={did('sh') ? 'ok' : ''}>Sample &amp; Hold Signal</li>
          <li className={did('flat') ? 'ok' : ''}>Flat top sampled Signal</li>
        </ul>
      </> },
      { key: 'fft', done: did('fft'), body: <>Spectrum of a sampled signal: MATH MENU, Operation <b>FFT</b> <span className="dim">(SEC/DIV 2.5 ms gives a 0 to 50 kHz span)</span></> },
      { key: 'dem', done: did('dem'), body: <>Patch <b>Natural Sampled Signal</b> → demodulator input; scope on <b>Recovered message signal</b></> },
      { key: 'alias', done: did('alias'), body: <>Aliasing: turn P3 down until the sampling frequency is <b>below twice</b> the message frequency and watch the recovered signal</> },
    ],
  };
}
