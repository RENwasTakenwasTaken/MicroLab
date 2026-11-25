// Setup guide of Expt 4 (PCM trainer): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { kitPowered, mainsIn, usePce } from '../store.ts';
import { FS_V, circuit, kitValues } from './signals.ts';

/** Outputs that change within a sample (need FAST to be seen as waveforms). */
const FASTSIG = new Set(['SCLK', 'RAMP', 'PCM', 'RAW', 'FOUT']);

export function usePcmSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const powerSw = usePce((s) => s.powerSw);
  const power = usePce((s) => kitPowered(s)), mains = usePce((s) => mainsIn(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const live = power && c.scopeGnd;
  const onScope = (node: string) => live && (c.ch1 === node || c.ch2 === node);
  const withSine = (node: string) => live && ((c.ch1 === node && c.ch2 === 'SINE') || (c.ch2 === node && c.ch1 === 'SINE'));
  const fast = !v.slow, sineOk = Math.abs(v.vpp - 2) <= 0.25 && Math.abs(v.fm - 1000) <= 60;
  const b = v.bits, dcCode = Math.min(v.L - 1, Math.max(0, Math.floor((v.vdc + FS_V / 2) / v.step)));
  const now: Record<string, boolean> = {
    clk: fast && onScope('SCLK'), sine: sineOk && onScope('SINE'),
    [`ramp${b}`]: fast && onScope('RAMP'),
    pcm: fast && c.sineToMod && onScope('PCM'),
    [`raw${b}`]: fast && c.sineToMod && c.pcmLink && withSine('RAW'),
    [`fout${b}`]: fast && c.sineToMod && c.pcmLink && c.rawToFlt && withSine('FOUT'),
    [`dc${b}:${dcCode}`]: power && c.dcToMod,
    dcpcm: power && c.dcToMod && onScope('PCM'),
  };
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const keys = Object.keys(now);
    if (keys.some((k) => now[k] && !seen[k])) setSeen({ ...seen, ...Object.fromEntries(keys.filter((k) => now[k]).map((k) => [k, true])) });
  });
  const did = (k: string) => !!seen[k] || !!now[k];
  const dcWords = (n: 3 | 4) => Object.keys(seen).filter((k) => k.startsWith(`dc${n}:`)).length;

  const warn: string[] = [];
  const probing = (n: string) => c.ch1 === n || c.ch2 === n;
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to a GND pin (beside Sine O/P, PCM O/P, Recvd I/P and in the filter).');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const coded = ['PCM', 'RAW', 'FOUT'].some(probing);
  if (power && v.slow && [...FASTSIG].some(probing)) warn.push('SLOW is selected: the whole PCM system runs a few thousand times slower, so these waveforms crawl. Switch the sampling pulse generator to FAST (SLOW is for watching the LEDs).');
  if (power && coded && !c.modSources.length) warn.push('Nothing is patched to MOD. I/P: the modulator codes 0 V, so every word is the same. Patch Sine O/P to MOD. I/P.');
  if (power && c.modSources.length > 1) warn.push('MOD. I/P has more than one output patched to it (the sine and the DC source fight). Remove one cord.');
  if (power && c.sineToMod && coded && v.vpp > FS_V) warn.push(`The sine is ${v.vpp.toFixed(1)} V peak-to-peak, more than the ${FS_V} V the quantiser covers: its tops are clipped to the end levels. Turn AMPLITUDE down to about 2 V peak-to-peak.`);
  if (power && (probing('RAW') || probing('FOUT')) && !c.pcmLink) warn.push(c.pcmInOther ? 'PCM I/P must have the PCM output alone on it: the demodulator only locks on to PCM frames.' : 'Nothing reaches the demodulator: patch PCM O/P to PCM I/P.');
  if (power && probing('FOUT') && !c.rawToFlt) warn.push('Patch RAW DATA to Recvd I/P: the filter has no input.');
  const src = scope.trig.source ? c.ch2 : c.ch1, other = scope.trig.source ? c.ch1 : c.ch2;
  if (live && !scope.xy && !fftOn(scope) && src && (src === 'RAW' || src === 'FOUT') && other === 'SINE') warn.push(`Trigger on the sine so the staircase stands still: TRIG MENU, Source ${scope.trig.source ? 'CH1' : 'CH2'}, then SET TO 50%.`);

  const go = () => usePce.getState().setView('scope');
  return {
    title: 'Expt 4 · PCM',
    doneNote: 'All steps done: plot every waveform with a time axis, and work out the signalling rate n·fs and the bandwidth n·fs/2 for 3 and 4 bits.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {' · '}<b>{b} bit</b>{' · '}clock <b className={v.slow ? 'c-err' : ''}>{v.slow ? 'SLOW' : 'FAST'}</b>
      {' · '}sine: <b className={sineOk ? '' : 'c-err'}>{v.vpp.toFixed(1)} V p-p, {Math.round(v.fm)} Hz</b>
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>Mains ON toggle (green pilot lamp lights)</li>
        </ul>
      </> },
      { key: 'clk', done: did('clk'), body: <><b>SAMP CLOCK</b> on FAST: measure its frequency <span className="dim">(MEASURE on the <a onClick={go}>oscilloscope</a>; f<sub>s</sub> = f / 64)</span></> },
      { key: 'sine', done: did('sine'), body: <><b>Sine O/P</b>: set <b>1 kHz, 2 V p-p</b> with AMPLITUDE and FREQUENCY <span className="dim">(ground clip on the GND pin below it)</span></> },
      { key: 'ramp3', done: did('ramp3'), body: <>BIT SELECT <b>3 BIT</b>, then <b>RAMP</b>: 8 steps once per sample</> },
      { key: 'pcm', done: did('pcm'), body: <>
        <b>Sine O/P</b> → <b>MOD. I/P</b>, then probe <b>PCM O/P</b>
        <ul className="wf-sub">
          <li className={c.sineToMod ? 'ok' : ''}>Sine patched to the modulator</li>
          <li className={did('pcm') ? 'ok' : ''}>Frame: sync, start, data bits, stop; measure T<sub>s</sub></li>
        </ul>
      </> },
      { key: 'raw3', done: did('raw3'), body: <><b>PCM O/P</b> → <b>PCM I/P</b>, then <b>RAW DATA</b> with the sine on the other channel: a staircase, measure the step S <span className="dim">(all 8 levels only when the sine fills the 2.88 V range)</span></> },
      { key: 'fout3', done: did('fout3'), body: <><b>RAW DATA</b> → <b>Recvd I/P</b>, then the filtered output <span className="dim">(pin beside RAW DATA)</span> with the sine; set GAIN</> },
      { key: 'bit4', done: did('ramp4') && did('raw4') && did('fout4'), body: <>
        BIT SELECT <b>4 BIT</b> and repeat
        <ul className="wf-sub">
          <li className={did('ramp4') ? 'ok' : ''}>RAMP: 16 steps</li>
          <li className={did('raw4') ? 'ok' : ''}>RAW DATA: twice the levels, the step halves</li>
          <li className={did('fout4') ? 'ok' : ''}>Filtered output</li>
        </ul>
      </> },
      { key: 'dc', done: dcWords(3) >= 3 && dcWords(4) >= 3 && did('dcpcm'), body: <>
        <b>VAR DC</b> → <b>MOD. I/P</b> in place of the sine; note the word on <b>D1 … D4</b> for three DC settings
        <ul className="wf-sub">
          <li className={dcWords(3) >= 3 ? 'ok' : ''}>3 BIT: {Math.min(3, dcWords(3))} of 3 words</li>
          <li className={dcWords(4) >= 3 ? 'ok' : ''}>4 BIT: {Math.min(3, dcWords(4))} of 3 words</li>
          <li className={did('dcpcm') ? 'ok' : ''}>The steady word in the PCM frame on the scope</li>
        </ul>
      </> },
    ],
  };
}
