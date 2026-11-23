// Setup guide of Expt 8 (DSSS trainer): the steps of the practical, each read from the bench as it is now.

import { useEffect, useState } from 'react';
import { scopeWarnings, type GuideData } from '../Guide.tsx';
import { fftOn } from '../scope/menus.ts';
import { RECORD } from '../scope/state.ts';
import { kitPowered, mainsIn, usePce } from '../store.ts';
import { circuit, kitValues } from './signals.ts';

/** Outputs that swing about 0 V to 5 V. */
const LOGIC = new Set(['CC', 'PNCK', 'BK', 'C200', 'C200B', 'PN', 'NRZ', 'SP', 'SPO', 'REC', 'RF500']);

export function useDsssSetup(): GuideData {
  const plugs = usePce((s) => s.plugs);
  const knobs = usePce((s) => s.knobs);
  const scope = usePce((s) => s.scope);
  const powerSw = usePce((s) => s.powerSw);
  const power = usePce((s) => kitPowered(s)), mains = usePce((s) => mainsIn(s));
  const c = circuit(plugs), v = kitValues(knobs);
  const live = power && c.scopeGnd;
  const onScope = (node: string) => live && (c.ch1 === node || c.ch2 === node);
  const withNrz = (node: string) => live && ((c.ch1 === node && c.ch2 === 'NRZ') || (c.ch2 === node && c.ch1 === 'NRZ'));
  const coding = !v.flat, pn = v.pnOn && power;
  const mixer = c.mixPn && c.mixNrz, tx = mixer && c.toBip && c.bipToMod && c.rfToMod, det = tx && c.toDet, lpf = det && c.toLpf, rx = lpf && c.despSp && c.despPn;
  const fft = fftOn(scope), fftNode = scope.math.source ? c.ch2 : c.ch1, nyquist = RECORD / (scope.sdiv * 10) / 2;
  const now: Record<string, boolean> = {
    cc: onScope('CC'), bk: onScope('BK'), pnck: onScope('PNCK'), rf: onScope('RF'), nrz: coding && onScope('NRZ'),
    pn: pn && onScope('PN'), cursor: pn && onScope('PN') && scope.cursor.type === 't',
    sp: coding && pn && mixer && withNrz('SP'),
    dsss: coding && pn && tx && (withNrz('DSSS') || (onScope('DSSS') && onScope('SP'))), fft: coding && pn && tx && live && fft && fftNode === 'DSSS' && nyquist > 700e3,
    det: coding && pn && det && onScope('DET'), fil: coding && pn && lpf && onScope('FIL'), spo: coding && pn && lpf && onScope('SPO'),
    rec: coding && pn && rx && withNrz('REC'),
  };
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const keys = Object.keys(now);
    if (keys.some((k) => now[k] && !seen[k])) setSeen(Object.fromEntries(keys.map((k) => [k, seen[k] || now[k]])));
  });
  const did = (k: string) => !!seen[k] || now[k];

  const warn: string[] = [];
  const probing = (n: string) => c.ch1 === n || c.ch2 === n;
  if ((c.ch1 || c.ch2) && !c.scopeGnd) warn.push(c.clipOffGnd ? 'A probe ground clip is on a pin that is not GND: it ties that point to the ground of the oscilloscope. Move it to a GND pin.' : 'No probe ground on the kit: the trace is mostly mains hum. Clip the ground lead of a probe to a GND pin (there is one under most outputs).');
  warn.push(...scopeWarnings([!!c.ch1, !!c.ch2]));
  const chipChain = ['PN', 'SP', 'BIP', 'DSSS', 'DET', 'FIL', 'SPO', 'REC'].some(probing);
  if (power && !v.pnOn && chipChain) warn.push('The PN register is empty, so the PN code is a flat line and nothing is spread. Press PRBS (the PN start switch) in the binary data generator.');
  if (power && v.flat && (probing('NRZ') || probing('REC'))) warn.push(`All eight data switches are ${v.ones ? 'up' : 'down'}: the data never changes. Set a word with both 1s and 0s.`);
  const src = scope.trig.source ? c.ch2 : c.ch1, other = scope.trig.source ? c.ch1 : c.ch2;
  const yt = live && !scope.xy && !fft;
  if (yt && src && src !== 'NRZ' && other === 'NRZ' && !LOGIC.has(src)) warn.push(`Trigger on the NRZ data: TRIG MENU, Source ${scope.trig.source ? 'CH1' : 'CH2'}, then SET TO 50%.`);
  else if (yt && src && LOGIC.has(src) && (scope.trig.level < 0.6 || scope.trig.level > 4.2)) warn.push('The trigger level is at the edge of the signal (it swings 0 V to about 5 V), so the picture drifts. Press SET TO 50%.');
  if (power && probing('SP') && !mixer) warn.push('The mixer needs both inputs: patch PN Signal to PN Code and NRZ DATA to NRZ Data.');
  if (power && probing('DSSS')) {
    if (!c.rfToMod) warn.push('No carrier at the modulator: patch RF CARRIER (RF carrier generator) to RF Carrier of the DSSS modulator.');
    else if (c.spToMod) warn.push('The unipolar spreading code goes straight into the modulator, so the carrier is switched on and off (ASK) instead of flipping phase. Go through the uni-to-bipolar converter.');
    else if (!c.bipToMod) warn.push('Nothing drives Sp Code of the modulator: patch the spreading code to the uni-to-bipolar converter and Bipolar Sp Code to Sp Code.');
  }
  if (power && (probing('DET') || probing('FIL') || probing('SPO')) && !c.toDet) warn.push('Nothing reaches the coherent detector: patch DSSS O/P to DSSS I/P.');
  if (power && (probing('FIL') || probing('SPO')) && c.toDet && !c.toLpf) warn.push('Patch Noisy SP Code to SP Code I/P of the low pass filter comparator.');
  if (power && probing('REC') && !(c.despSp && c.despPn)) warn.push('The despreading section needs both inputs: SP Code O/P to SP Code, and PN Signal to PN Signal (the plug stacks on the one already on PN Signal).');
  if (live && fft && nyquist < 700e3) warn.push(`At this SEC/DIV the FFT only reaches ${Math.round(nyquist / 1000)} kHz, too low for the 488 kHz carrier and its side lobes. Set SEC/DIV to 100 µs (0 to 1.25 MHz).`);

  const go = () => usePce.getState().setView('scope');
  return {
    title: 'Expt 8 · DSSS',
    doneNote: 'All steps done: plot every waveform with a time axis, mark Tb and Tc, and work out the processing gain Tb / Tc.',
    warn,
    foot: <>
      Kit: <b className={power ? '' : 'c-err'}>{power ? 'powered' : mains ? 'switched off' : 'no mains'}</b>
      {' · '}word D8…D1: <b className={v.flat ? 'c-err' : ''}>{v.text.slice(0, 4)} {v.text.slice(4)}</b>
      {' · '}PN: <b className={pn ? '' : 'c-err'}>{pn ? 'running' : 'stopped'}</b>
    </>,
    steps: [
      { key: 'power', done: power, body: <>
        Power the kit <span className="dim">(wall socket behind the bench, on the left)</span>
        <ul className="wf-sub">
          <li className={mains ? 'ok' : ''}>Kit mains plug → wall socket</li>
          <li className={powerSw ? 'ok' : ''}>MAINS ON toggle (neon lights)</li>
        </ul>
      </> },
      { key: 'clocks', done: did('cc') && did('bk') && did('pnck'), body: <>
        Clocks of the clock generator <span className="dim">(ground clip on a GND pin, e.g. below PN Signal; MEASURE on the <a onClick={go}>oscilloscope</a>)</span>
        <ul className="wf-sub">
          <li className={did('cc') ? 'ok' : ''}><b>1 MHz CC</b>: the carrier (master) clock, T1</li>
          <li className={did('bk') ? 'ok' : ''}><b>BK</b>: the bit clock, T2</li>
          <li className={did('pnck') ? 'ok' : ''}><b>PNCK</b>: the PN (chip) clock</li>
        </ul>
      </> },
      { key: 'rf', done: did('rf'), body: <><b>RF CARRIER</b> of the RF carrier generator: measure f<sub>c</sub> <span className="dim">(T3)</span></> },
      { key: 'word', done: coding, body: <>Set the data word on <b>S8 … S1</b> and look at <b>NRZ DATA</b> <span className="dim">(T4)</span>{coding && !did('nrz') && <span className="dim"> · probe NRZ DATA</span>}</> },
      { key: 'pn', done: did('pn') && did('cursor'), body: <>
        Press <b>PRBS</b>, then probe <b>PN Signal</b> <span className="dim">(T5)</span>
        <ul className="wf-sub">
          <li className={did('pn') ? 'ok' : ''}>PN code running <span className="dim">(15 chips per bit)</span></li>
          <li className={did('cursor') ? 'ok' : ''}>Chip width T<sub>c</sub>: CURSOR, Type <b>Time</b></li>
        </ul>
      </> },
      { key: 'mixer', done: did('sp'), body: <>
        Spreading code mixer, then <b>Spreading Code</b> with NRZ on the other channel <span className="dim">(T6)</span>
        <ul className="wf-sub">
          <li className={c.mixPn ? 'ok' : ''}><b>PN Signal</b> → <b>PN Code</b></li>
          <li className={c.mixNrz ? 'ok' : ''}><b>NRZ DATA</b> → <b>NRZ Data</b></li>
        </ul>
      </> },
      { key: 'tx', done: tx, body: <>
        Patch the transmitter
        <ul className="wf-sub">
          <li className={c.toBip ? 'ok' : ''}><b>Spreading Code</b> → input of the <b>uni to bipolar converter</b></li>
          <li className={c.bipToMod ? 'ok' : ''}><b>Bipolar Sp Code</b> → <b>Sp Code</b> of the DSSS modulator</li>
          <li className={c.rfToMod ? 'ok' : ''}><b>RF CARRIER</b> → <b>RF Carrier</b> of the modulator</li>
        </ul>
      </> },
      { key: 'dsss', done: did('dsss') && did('fft'), body: <>
        <b>DSSS O/P</b> with NRZ (or the spreading code) on the other channel <span className="dim">(T7)</span>
        <ul className="wf-sub">
          <li className={did('dsss') ? 'ok' : ''}>The carrier flipping phase at chip changes</li>
          <li className={did('fft') ? 'ok' : ''}>Its spectrum: MATH MENU, FFT <span className="dim">(SEC/DIV 100 µs); nulls at f<sub>c</sub> ± 1/T<sub>c</sub></span></li>
        </ul>
      </> },
      { key: 'det', done: c.toDet && did('det'), body: <><b>DSSS O/P</b> → <b>DSSS I/P</b>, then probe <b>Noisy SP Code</b> <span className="dim">(T8)</span></> },
      { key: 'lpf', done: c.toLpf && did('fil') && did('spo'), body: <>
        <b>Noisy SP Code</b> → <b>SP Code I/P</b> of the low pass filter comparator
        <ul className="wf-sub">
          <li className={did('fil') ? 'ok' : ''}><b>Fil. O/P</b>: filtered spreading code (T9)</li>
          <li className={did('spo') ? 'ok' : ''}><b>SP Code O/P</b>: the clean recovered spreading code</li>
        </ul>
      </> },
      { key: 'rx', done: did('rec'), body: <>
        Despreading, then <b>Recvd. Data</b> with NRZ on the other channel <span className="dim">(T10)</span>
        <ul className="wf-sub">
          <li className={c.despSp ? 'ok' : ''}><b>SP Code O/P</b> → <b>SP Code</b> of the despreading section</li>
          <li className={c.despPn ? 'ok' : ''}><b>PN Signal</b> → <b>PN Signal</b> <span className="dim">(stack the plug on the one already there)</span></li>
        </ul>
      </> },
    ],
  };
}
