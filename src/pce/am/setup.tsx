// Setup guide of Expt 1 (AM kit): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { usePce } from '../store.ts';
import { circuit, kitValues } from './signals.ts';

const SHORT_NAME: Record<string, string> = { AUDIO: 'SINE O/P', RF: 'the RF output', AM: 'AM MOD O/P', M1V: 'the -1 V pin', P15: '+15 V', M15: '-15 V' };

export function useAmSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const powerSw = usePce((s) => s.powerSw);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const fft = fftOn(scope);
  const c = circuit(plugs), v = kitValues(knobs);
  const mains = plugs.mains.attachedTo === 'wall', power = mains && powerSw;
  // settings and displays count once reached: the audio frequency is changed again for the spectrum
  const now = { audio: power && Math.abs(v.fm - 1000) <= 40, carrier: power && Math.abs(v.fc - 455e3) <= 6e3 && Math.abs(v.ec - 2) <= 0.12, xy: scope.xy, fft };
  const [seen, setSeen] = useState({ audio: false, carrier: false, xy: false, fft: false });
  useEffect(() => {
    if ((Object.keys(now) as (keyof typeof now)[]).some((k) => now[k] && !seen[k])) setSeen({ audio: seen.audio || now.audio, carrier: seen.carrier || now.carrier, xy: seen.xy || now.xy, fft: seen.fft || now.fft });
  });
  const warn: string[] = [];
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to a GND pin.');
  if (c.shorts.length) warn.push(`A cord or clip shorts ${c.shorts.map((n) => SHORT_NAME[n]).join(' and ')} to ground.`);
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const wired = power && c.ch2 === 'AM';
  if (wired && !c.mod) warn.push('Nothing reaches MOD I/P: the output is the bare carrier. Patch a SINE O/P pin to MOD I/P.');
  if (wired && c.mod && !c.link) warn.push('RF LINK is open: the carrier is suppressed and this is DSB-SC, not AM with full carrier. Join RF LINK to the -1 V pin.');
  if (wired && c.ch1 === 'AUDIO' && scope.trig.source === 1 && !scope.xy && !fft) warn.push('The trigger source is CH2 (the AM wave), so the envelope will not stand still. TRIG MENU, then Source CH1.');
  // which of the three cases the audio amplitude gives now (the index itself is for the student to work out)
  const m = v.em / 2;
  const mCase = !(power && c.link && c.mod) ? null : m < 0.97 ? 'm < 1' : m <= 1.03 ? 'm = 1' : 'm > 1';
  const go = () => usePce.getState().setView('scope');
  return {
    title: 'Expt 1 · AM (DSB-FC)',
    doneNote: 'All steps done: take the readings for m < 1, m = 1 and m > 1.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {mCase && <> · audio amplitude now gives <b>{mCase}</b></>}
      {power && c.ch2 === 'AM' && !mCase && <> · modulator not fully patched</>}
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>Mains toggle ON (pilot lamp lights)</li>
        </ul>
      </> },
      { key: 'ch1', done: (c.ch1 === 'AUDIO' || c.ch1 === 'RF') && c.scopeGnd, body: <>CH1 probe: tip into a <b>SINE O/P</b> pin, ground clip onto the GND pin below it <span className="dim">(click a probe, then a pin)</span></> },
      { key: 'audio', done: seen.audio || now.audio, body: <>Set the audio generator to <b>1 kHz</b> <span className="dim">(FREQUENCY pot; read it on the <a onClick={go}>oscilloscope</a> with MEASURE)</span></> },
      { key: 'carrier', done: seen.carrier || now.carrier, body: <>Carrier: CH1 probe on <b>RF O/P</b>, set <b>455 kHz, 2 V pp</b> <span className="dim">(RF FREQUENCY and AMPLITUDE; then put the probe back on SINE O/P)</span></> },
      { key: 'link', done: c.link, body: <>Short link: <b>RF LINK</b> → <b>-1 V</b> pin <span className="dim">(balanced modulator, left side)</span></> },
      { key: 'mod', done: c.mod, body: <>Long cord: free <b>SINE O/P</b> pin → <b>MOD I/P</b></> },
      { key: 'ch2', done: c.ch1 === 'AUDIO' && c.ch2 === 'AM' && c.scopeGnd, body: <>CH1 on SINE O/P, CH2 probe on <b>AM MOD O/P</b> <span className="dim">(trigger on CH1; SEC/DIV about 250 µs)</span></> },
      { key: 'xy', done: seen.xy || now.xy, body: <>Trapezoid: DISPLAY, Format <b>XY</b> <span className="dim">(then back to YT)</span></> },
      { key: 'fft', done: seen.fft || now.fft, body: <>Spectrum: MATH MENU, Operation <b>FFT</b>, Source CH2</> },
    ],
  };
}
