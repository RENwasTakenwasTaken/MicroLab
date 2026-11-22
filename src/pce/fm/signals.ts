// Electrical model of the FM MODEM kit.
//
// Modulator (ICL8038): the carrier frequency follows the DC bias, 10 kHz per volt around
// 50 kHz at 8.05 V (the lab's readings: 0.5 V either way gives 55 kHz and 45 kHz). A signal on
// the modulator input rides on that bias through a capacitor, so the frequency deviation is
// 10 kHz x Em(peak) and the modulation index is that over fm.
// Demodulator (LM565): locks when the carrier is near its free-running frequency; its output is
// then a DC level plus the recovered signal and some ripple at twice the carrier. The filter is a
// second-order low-pass at 4 kHz, AC coupled.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { JACK, JACKS } from './layout.ts';

/** Modulator sensitivity (Hz per volt) and the bias that gives 50 kHz. */
export const KF = 10e3;
const F_CENTRE = 50e3, BIAS_CENTRE = 8.05;
/** PLL output: volts per hertz away from its free-running frequency, and its resting DC level. */
const KD = 5e-5, PLL_DC = 9.2;
/** Low-pass filter: corner frequency and pass-band gain. */
const FC = 4000, GAIN = 2;
const CARRIER_PK = 0.9;

/** What the controls really give. None of the pots has a scale: every value is set with the instruments. */
export function kitValues(k: Knobs) {
  const f0 = 25e3 + 60e3 * k.modFreq;
  return {
    /** unmodulated carrier frequency, Hz */ f0,
    /** DC bias of the modulator, V */ bias: BIAS_CENTRE + (f0 - F_CENTRE) / KF,
    /** modulating signal, V peak to peak and Hz */ em: 4 * k.sgAmp, fm: 300 + 5000 * k.sgFreq,
    /** free-running frequency of the PLL, Hz */ fo: 25e3 + 60e3 * k.pllFreq,
  };
}

const sig = new Osc(3e-4, 23), car = new Osc(2e-4, 29), vco = new Osc(2.5e-4, 37);
const RES: Record<string, number> = { GND: 0.01, FM: 50, FLTOUT: 100, VCO: 500, SIG: 600, PLLOUT: 3600, BIAS: 5000 };
const NODES = JACKS.map((j) => j.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => JACK[s]?.node, RES, cache));

/** State of the kit for the present knobs and wiring. */
const live = { on: false, emPk: 0, fm: 1000, f0: F_CENTRE, fo: F_CENTRE, bias: BIAS_CENTRE, /** share of the generator's signal reaching the modulator */ w: 0, beta: 0, fed: false, locked: false };

/** How much of a node's own voltage survives in its group (1 alone, about 0 when shorted to ground). */
function share(w: Wiring, node: string, of: string): number {
  const src = w.sources[w.group.get(node)!];
  if (!src.includes(of)) return 0;
  return 1 / RES[of] / src.reduce((a, n) => a + 1 / RES[n], 0);
}

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs), w = wiring(s.plugs);
  sig.set(v.fm, t); car.set(v.f0, t); vco.set(v.fo, t);
  live.on = kitPowered(s);
  live.emPk = v.em / 2; live.fm = v.fm; live.f0 = v.f0; live.fo = v.fo; live.bias = v.bias;
  live.w = share(w, 'MODIN', 'SIG');
  live.beta = (KF * live.w * live.emPk) / v.fm;
  live.fed = live.on && share(w, 'PLLIN', 'FM') > 0.05;
  // the loop holds while the swing of the carrier stays within about a quarter of its own frequency
  live.locked = live.fed && Math.abs(v.f0 - v.fo) + KF * live.w * live.emPk <= 0.25 * v.fo;
  return { ...v, on: live.on, locked: live.locked, beta: live.beta, deviation: KF * live.w * live.emPk };
}

// ------------------------------------------------------------------ node voltages
let dcOnly = false;
const H = (f: number) => 1 / Math.sqrt(1 + (f / FC) ** 4);
const lag = (f: number) => Math.atan2(Math.SQRT2 * (f / FC), 1 - (f / FC) ** 2);
/** Phase of the modulated carrier: the integral of 2 pi (f0 + deviation sin). */
const fmPhase = (t: number) => car.phase(t) - live.beta * Math.cos(sig.phase(t));
const LOOP_LAG = 0.15;

function emf(node: string, t: number): number {
  if (!live.on) return 0;
  switch (node) {
    case 'SIG': return dcOnly ? 0 : live.emPk * Math.sin(sig.phase(t));
    case 'BIAS': return live.bias + (dcOnly ? 0 : live.w * live.emPk * Math.sin(sig.phase(t)));
    case 'FM': { if (dcOnly) return 0; const p = fmPhase(t); return CARRIER_PK * (Math.sin(p) + 0.012 * Math.sin(3 * p)); }
    case 'VCO': return dcOnly ? 2.3 : Math.sin(live.locked ? fmPhase(t) - Math.PI / 2 : vco.phase(t)) >= 0 ? 5 : -0.4;
    case 'PLLOUT': {
      if (live.locked) {
        const dc = PLL_DC + KD * (live.f0 - live.fo);
        return dcOnly ? dc : dc + KD * KF * live.w * live.emPk * Math.sin(sig.phase(t) - LOOP_LAG) + 0.04 * Math.sin(2 * fmPhase(t));
      }
      if (dcOnly) return PLL_DC;
      return PLL_DC + (live.fed ? 0.22 * Math.sin(car.phase(t) - vco.phase(t)) : 0) + 0.04 * Math.sin(2 * vco.phase(t));
    }
    default: return 0;
  }
}

/** Filter output for whatever is patched to its input: each part passes with the low-pass's gain and lag at its own frequency. */
function filterOut(w: Wiring, t: number): number {
  if (dcOnly || !live.on) return 0;
  const src = w.sources[w.group.get('FLTIN')!].filter((n) => n !== 'FLTOUT');
  if (!src.length) return 0;
  const total = src.reduce((a, n) => a + 1 / RES[n], 0);
  const ps = sig.phase(t), fm = live.fm;
  let sum = 0;
  for (const n of src) {
    let v = 0;
    if (n === 'SIG') v = live.emPk * H(fm) * Math.sin(ps - lag(fm));
    else if (n === 'BIAS') v = live.w * live.emPk * H(fm) * Math.sin(ps - lag(fm));
    else if (n === 'FM') v = CARRIER_PK * H(live.f0) * Math.sin(fmPhase(t) - lag(live.f0));
    else if (n === 'VCO') { const f = live.locked ? live.f0 : live.fo; v = 3.44 * H(f) * Math.sin((live.locked ? fmPhase(t) - Math.PI / 2 : vco.phase(t)) - lag(f)); }
    else if (n === 'PLLOUT') {
      const fb = Math.abs(live.f0 - live.fo);
      if (live.locked) v = KD * KF * live.w * live.emPk * H(fm) * Math.sin(ps - LOOP_LAG - lag(fm));
      else if (live.fed) v = 0.22 * H(fb) * Math.sin(car.phase(t) - vco.phase(t) - lag(fb));
    }
    sum += v / RES[n] / total;
  }
  return GAIN * sum;
}

/** Voltage of a group of joined nodes: its sources weighted by their conductance; null if nothing drives it. */
function vGroup(w: Wiring, g: number, t: number): number | null {
  const src = w.sources[g];
  if (!src.length) return null;
  let num = 0, den = 0;
  for (const n of src) { num += (n === 'FLTOUT' ? filterOut(w, t) : emf(n, t)) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
function dcOf(w: Wiring, g: number): number | null {
  dcOnly = true;
  const v = vGroup(w, g, 0);
  dcOnly = false;
  return v;
}

/** Quickest and slowest periodic parts a node carries (Hz, 0 = steady). */
function rates(w: Wiring, node: string): [number, number] {
  if (!live.on) return [0, 0];
  // read through the oscillators, so the scope's frequency readout wanders a little as on the bench
  const t = now(), fm = sig.at(t), f0 = car.at(t), fo = vco.at(t);
  const mod = live.beta > 0 && live.emPk > 0, fb = Math.abs(f0 - fo);
  switch (node) {
    case 'SIG': return live.emPk > 0 ? [fm, fm] : [0, 0];
    case 'BIAS': return mod ? [fm, fm] : [0, 0];
    case 'FM': return [f0, mod ? fm : f0];
    case 'VCO': return live.locked ? [f0, mod ? fm : f0] : [fo, fo];
    case 'PLLOUT': return live.locked ? [2 * f0, mod ? fm : 2 * f0] : live.fed && fb > 20 ? [2 * fo, fb] : [2 * fo, 2 * fo];
    case 'FLTOUT': {
      const src = w.sources[w.group.get('FLTIN')!];
      if (src.includes('PLLOUT')) return live.locked ? (mod ? [fm, fm] : [0, 0]) : live.fed && fb > 20 ? [fb, fb] : [0, 0];
      return src.includes('SIG') || src.includes('BIAS') ? [fm, fm] : src.includes('FM') ? [f0, f0] : [0, 0];
    }
    default: return [0, 0];
  }
}

const nodeOf = (plugs: Record<string, PcePlug>, plug: string) => { const at = plugs[plug]?.attachedTo; return at && JACK[at] ? JACK[at].node : null; };

/** Signal at a scope channel's red plug, measured against the scope's ground. null: the plug is not in a socket. */
export function tipSource(ch: 0 | 1): Source | null {
  const plugs = usePce.getState().plugs;
  const node = nodeOf(plugs, ch ? 'ch2' : 'ch1');
  if (!node) return null;
  const w = wiring(plugs), g = w.group.get(node)!, ref = w.group.get(SG)!;
  const grounded = w.sources[ref].length > 0;
  let fast = 0, slow = 0;
  for (const n of [...w.sources[g], ...(grounded ? w.sources[ref] : [])]) {
    const [a, b] = rates(w, n);
    fast = Math.max(fast, a);
    if (b > 0) slow = slow ? Math.min(slow, b) : b;
  }
  if (!grounded) {
    const ph = ch * 1.3;
    return { v: (t) => 0.07 * (vGroup(w, g, t) ?? 0) + 0.11 * Math.sin(2 * Math.PI * 50 * t + ph) + 0.03 * Math.sin(2 * Math.PI * 150 * t + 2 * ph), fFast: 50, fSlow: 50, dc: 0, grounded };
  }
  if (g === ref) return { v: () => 0, fFast: 0, fSlow: 0, dc: 0, grounded };
  return { v: (t) => (vGroup(w, g, t) ?? 0) - (vGroup(w, ref, t) ?? 0), fFast: fast, fSlow: slow, dc: (dcOf(w, g) ?? 0) - (dcOf(w, ref) ?? 0), grounded };
}

/** DC voltage between the multimeter's leads; null while a lead is off the kit or on a point nothing drives. */
export function dmmVolts(): number | null {
  const plugs = usePce.getState().plugs;
  const a = nodeOf(plugs, 'dmm:v'), b = nodeOf(plugs, 'dmm:com');
  if (!a || !b) return null;
  const w = wiring(plugs);
  const va = dcOf(w, w.group.get(a)!), vb = dcOf(w, w.group.get(b)!);
  return va === null || vb === null ? null : va - vb;
}

/** How the bench is wired, for the setup guide and its hints. */
export function circuit(plugs: Record<string, PcePlug> = usePce.getState().plugs) {
  const w = wiring(plugs);
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  return {
    /** signal generator patched to the modulator input */ mod: same('MODIN', 'SIG'),
    /** BUFFER O/P patched to the PLL input */ pllFed: same('PLLIN', 'FM'),
    /** PLL O/P patched to the filter input */ fltFed: same('FLTIN', 'PLLOUT'),
    shorts: ['SIG', 'FM', 'BIAS', 'PLLOUT', 'VCO', 'FLTOUT'].filter((n) => same(n, 'GND')),
    scopeGnd: same(SG, 'GND'),
    groundOff: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'), dmmV: nodeOf(plugs, 'dmm:v'), dmmCom: nodeOf(plugs, 'dmm:com'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? JACK[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.groundOff ? 'off' : 'none' } as const;
}
