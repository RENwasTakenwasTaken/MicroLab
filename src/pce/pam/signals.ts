// Electrical model of the Analog Sampling and Reconstruction Board.
//
// The modulator samples whatever is on its message input with the gating pulses:
//   natural sampled   message while the pulse is high, 0 V between pulses
//   sample and hold   the value at the start of each pulse, held until the next
//   flat top          that same value, but only for the width of the pulse
// The demodulator is a low-pass filter (4th order, 3.4 kHz). Its output is worked out from the
// spectrum of the sampled signal, the message repeated around every multiple of the sampling
// frequency, so too low a sampling frequency lets an alias through, as on the board.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { JACK, JACKS } from './layout.ts';

const GATE_V = 5;
/** Reconstruction filter: corner frequency, and the gain of the stage after it. */
const FC = 3400, GAIN = 2;

/** What the controls really give (the printed ranges are approximate). Set values with the oscilloscope. */
export function kitValues(k: Knobs) {
  return {
    /** message: V peak to peak and Hz */ em: 5 * k.p1, fm: 300 + 3100 * k.p2,
    /** gating pulses: Hz and duty cycle (0..1) */ fs: 2000 + 30000 * k.p3, duty: 0.1 + 0.8 * k.p4,
  };
}

const msg = new Osc(3e-4, 23), gate = new Osc(2e-4, 31);
const RES: Record<string, number> = { GND: 0.01, GATE: 100, NAT: 100, SH: 100, FLAT: 100, DEMOUT: 100, MSG: 600 };
const NODES = JACKS.map((j) => j.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => JACK[s]?.node, RES, cache));

const live = { on: false, a: 0, fm: 1000, fs: 8000, d: 0.5, /** share of the message reaching the modulator */ wm: 0, /** gating pulses reach the modulator */ gated: false };

function share(w: Wiring, node: string, of: string): number {
  const src = w.sources[w.group.get(node)!];
  if (!src.includes(of)) return 0;
  return 1 / RES[of] / src.reduce((s, n) => s + 1 / RES[n], 0);
}

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs), w = wiring(s.plugs);
  msg.set(v.fm, t); gate.set(v.fs, t);
  live.on = kitPowered(s);
  live.a = v.em / 2; live.fm = v.fm; live.fs = v.fs; live.d = v.duty;
  live.wm = share(w, 'MODMSG', 'MSG');
  live.gated = share(w, 'MODGATE', 'GATE') > 0.3;
  return { ...v, on: live.on, sampling: live.on && live.gated && live.wm > 0.05, aliasing: v.fs < 2 * v.fm };
}

// ------------------------------------------------------------------ node voltages
let dcOnly = false;
const TWO_PI = 2 * Math.PI;
const frac = (x: number) => x - Math.floor(x);
const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const H = (f: number) => 1 / Math.sqrt(1 + (f / FC) ** 8);
/** Phase lag of the 4th-order Butterworth filter: its two second-order sections. */
const lag = (f: number) => { const x = f / FC; return Math.atan2(0.7654 * x, 1 - x * x) + Math.atan2(1.8478 * x, 1 - x * x); };

/** Message as it was at the start of the present gating pulse. */
function sampled(t: number): number {
  const ph = frac(gate.phase(t) / TWO_PI);
  return live.wm * live.a * Math.sin(msg.phase(t - ph / gate.f));
}

/**
 * Low-pass filtered version of a sampled output. The sampled signal is the message repeated at
 * fm + n fs for every integer n; each copy is weighted by the pulse shape (how long the value is
 * held) and then by the filter at its own frequency.
 */
function reconstruct(kind: string, t: number): number {
  const { fm, fs, d } = live;
  const pm = msg.phase(t), th = gate.phase(t);
  const N = Math.min(14, Math.ceil((4.2 * FC + fm) / fs));
  let sum = 0;
  for (let n = -N; n <= N; n++) {
    const fn = fm + n * fs, f = Math.abs(fn);
    if (f > 4.2 * FC) continue;
    let amp: number, psi = pm + n * th;
    if (kind === 'NAT') { amp = d * sinc(n * d); psi -= Math.PI * n * d; }
    else if (kind === 'SH') { amp = sinc(fn / fs); psi -= (Math.PI * fn) / fs; }
    else { amp = d * sinc((fn * d) / fs); psi -= (Math.PI * fn * d) / fs; }
    const sg = fn >= 0 ? 1 : -1;
    sum += sg * amp * H(f) * Math.sin(sg * psi - lag(f));
  }
  return live.wm * live.a * sum;
}

/** Demodulator output for whatever is patched to its input. */
function demodOut(w: Wiring, t: number): number {
  if (dcOnly || !live.on) return 0;
  const src = w.sources[w.group.get('DEMIN')!].filter((n) => n !== 'DEMOUT');
  if (!src.length) return 0;
  const total = src.reduce((a, n) => a + 1 / RES[n], 0);
  let sum = 0;
  for (const n of src) {
    let v = 0;
    if (n === 'MSG') v = live.a * H(live.fm) * Math.sin(msg.phase(t) - lag(live.fm));
    else if (n === 'GATE') {
      // the pulses alone: their harmonics, each through the filter (the DC part is blocked)
      const th = gate.phase(t);
      for (let k = 1; k * live.fs < 4.2 * FC; k++) v += GATE_V * 2 * live.d * sinc(k * live.d) * H(k * live.fs) * Math.cos(k * th - Math.PI * k * live.d - lag(k * live.fs));
    } else if (live.gated) v = reconstruct(n, t);
    sum += v / RES[n] / total;
  }
  return GAIN * sum;
}

function emf(w: Wiring, node: string, t: number): number {
  if (!live.on) return 0;
  const high = () => frac(gate.phase(t) / TWO_PI) < live.d;
  switch (node) {
    case 'MSG': return dcOnly ? 0 : live.a * Math.sin(msg.phase(t));
    case 'GATE': return dcOnly ? GATE_V * live.d : high() ? GATE_V : 0;
    case 'NAT': return dcOnly || !live.gated || !high() ? 0 : live.wm * live.a * Math.sin(msg.phase(t));
    case 'SH': return dcOnly || !live.gated ? 0 : sampled(t);
    case 'FLAT': return dcOnly || !live.gated || !high() ? 0 : sampled(t);
    case 'DEMOUT': return demodOut(w, t);
    default: return 0;
  }
}

function vGroup(w: Wiring, g: number, t: number): number | null {
  const src = w.sources[g];
  if (!src.length) return null;
  if (src.length === 1) return emf(w, src[0], t);
  let num = 0, den = 0;
  for (const n of src) { num += emf(w, n, t) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
function dcOf(w: Wiring, g: number): number {
  dcOnly = true;
  const v = vGroup(w, g, 0) ?? 0;
  dcOnly = false;
  return v;
}

/** Quickest and slowest periodic parts a node carries (Hz, 0 = steady). */
function rates(w: Wiring, node: string): [number, number] {
  if (!live.on) return [0, 0];
  const t = now(), fm = msg.at(t), fs = gate.at(t), sig = live.wm > 0.05 && live.a > 0;
  switch (node) {
    case 'MSG': return live.a > 0 ? [fm, fm] : [0, 0];
    case 'GATE': return [fs, fs];
    case 'NAT': case 'SH': case 'FLAT': return live.gated && sig ? [fs, fm] : [0, 0];
    case 'DEMOUT': {
      const src = w.sources[w.group.get('DEMIN')!];
      if (src.includes('GATE')) return [fs, fs];
      if (src.includes('MSG')) return [fm, fm];
      if (!src.some((n) => n === 'NAT' || n === 'SH' || n === 'FLAT') || !live.gated || !sig) return [0, 0];
      const alias = Math.abs(fs - fm);
      return alias < 1.5 * FC && alias > 30 ? [Math.max(fm, alias), Math.min(fm, alias)] : [fm, fm];
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
  if (!grounded) {
    const ph = ch * 1.3;
    return { v: (t) => 0.07 * (vGroup(w, g, t) ?? 0) + 0.11 * Math.sin(TWO_PI * 50 * t + ph) + 0.03 * Math.sin(TWO_PI * 150 * t + 2 * ph), fFast: 50, fSlow: 50, dc: 0, grounded };
  }
  if (g === ref) return { v: () => 0, fFast: 0, fSlow: 0, dc: 0, grounded };
  let fast = 0, slow = 0;
  for (const n of [...w.sources[g], ...w.sources[ref]]) {
    const [a, b] = rates(w, n);
    fast = Math.max(fast, a);
    if (b > 0) slow = slow ? Math.min(slow, b) : b;
  }
  return { v: (t) => (vGroup(w, g, t) ?? 0) - (vGroup(w, ref, t) ?? 0), fFast: fast, fSlow: slow, dc: dcOf(w, g) - dcOf(w, ref), grounded };
}

/** How the bench is wired, for the setup guide and its hints. */
export function circuit(plugs: Record<string, PcePlug> = usePce.getState().plugs) {
  const w = wiring(plugs);
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  return {
    /** Message Signal patched to the modulator's message input */ msgIn: same('MODMSG', 'MSG'),
    /** Gating Pulse Signal patched to the modulator's gating input */ gateIn: same('MODGATE', 'GATE'),
    /** which modulator output feeds the demodulator, if any */ demFrom: (['NAT', 'SH', 'FLAT'] as const).find((n) => same('DEMIN', n)) ?? null,
    shorts: ['MSG', 'GATE', 'NAT', 'SH', 'FLAT', 'DEMOUT'].filter((n) => same(n, 'GND')),
    scopeGnd: same(SG, 'GND'),
    groundOff: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? JACK[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.groundOff ? 'off' : 'none' } as const;
}
