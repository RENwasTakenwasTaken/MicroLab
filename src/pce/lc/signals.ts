// Electrical model of the line-code trainer.
//
// The generator shifts the eight switch bits out, D8 (MSB) first, one bit per cycle of the bit
// clock BK, over and over. CK runs at twice the bit rate. Each line-code output is that same bit
// stream in another format; all of them are worked out a quarter of a bit at a time, over two
// words, because NRZ-M, biphase mark and AMI remember what they sent before.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { BITS, CODES, TERM, TERMS, type CodeId } from './layout.ts';

/** Bit rate (Hz): set on the kit by the 1K preset of its clock oscillator. */
export const FB = 26330;
/** Logic high of the unipolar outputs, and the two levels of the bipolar ones (V). */
const VH = 5, VB = 2.5;
/** Overshoot on every edge, as the probe shows it: fraction of the step, decay time and ringing period (s). */
const RING = { a: 0.09, tau: 0.45e-6, period: 0.9e-6 };
/** Quarter-bits in two words. */
const Q = 64;

/** The data word on the switches, D8 first. */
export const word = (k: Knobs): number[] => BITS.map((n) => (k[`s${n}`] > 0.5 ? 1 : 0));
export function kitValues(k: Knobs) {
  const w = word(k), ones = w.reduce((a, b) => a + b, 0);
  return { word: w, text: w.join(''), ones, /** all bits alike: nothing to code */ flat: ones === 0 || ones === 8, fb: FB };
}

type Wave = 'CK' | 'BK' | 'NRZ' | CodeId;
const WAVES: Wave[] = ['CK', 'BK', 'NRZ', ...CODES];
const table = Object.fromEntries(WAVES.map((w) => [w, new Float32Array(Q)])) as Record<Wave, Float32Array>;
const mean = Object.fromEntries(WAVES.map((w) => [w, 0])) as Record<Wave, number>;
/** Quickest and slowest periodic part of each wave, in bit rates (0 = steady). */
const rate = Object.fromEntries(WAVES.map((w) => [w, [0, 0]])) as Record<Wave, [number, number]>;
let built = '';

/** Levels of every output for each quarter of a bit, over two words. */
function build(w: number[]) {
  const key = w.join('');
  if (key === built) return;
  built = key;
  let mark = false, phase = false, pol = -1;
  for (let n = 0; n < 16; n++) {
    const b = w[n % 8] === 1, q = n * 4;
    /** first half, second half (or all four quarters) */
    const put = (id: Wave, a: number, c: number, d = a, e = c) => { const t = table[id]; t[q] = a; t[q + 1] = d; t[q + 2] = c; t[q + 3] = e; };
    put('CK', VH, VH, 0, 0);
    put('BK', VH, 0);
    put('NRZ', b ? VH : 0, b ? VH : 0);
    put('UNRZ', b ? VH : 0, b ? VH : 0);
    if (b) mark = !mark;
    put('NRZM', mark ? VH : 0, mark ? VH : 0);
    put('BNRZ', b ? VB : -VB, b ? VB : -VB);
    put('URZ', b ? VH : 0, 0);
    put('BRZ', b ? VB : -VB, 0);
    put('MAN', b ? VH : 0, b ? 0 : VH);
    phase = !phase;
    const first = phase;
    if (b) phase = !phase;
    put('BPM', first ? VH : 0, phase ? VH : 0);
    if (b) pol = -pol;
    put('AMI', b ? pol * VB : 0, b ? pol * VB : 0);
  }
  for (const id of WAVES) {
    const t = table[id];
    let sum = 0;
    for (let i = 0; i < Q; i++) sum += t[i];
    mean[id] = sum / Q;
    // shortest run of one level (going round the table from an edge), and the repeat period
    let start = -1;
    for (let i = 0; i < Q && start < 0; i++) if (t[i] !== t[(i + Q - 1) % Q]) start = i;
    if (start < 0) { rate[id] = [0, 0]; continue; }
    let run = 0, minRun = Q;
    for (let i = 0; i < Q; i++) {
      const j = (start + i) % Q;
      if (i > 0 && t[j] !== t[(j + Q - 1) % Q]) { minRun = Math.min(minRun, run); run = 0; }
      run++;
    }
    minRun = Math.min(minRun, run);
    let period = Q;
    for (const p of [1, 2, 4, 8, 16, 32]) {
      let same = true;
      for (let i = 0; i < Q && same; i++) same = t[i] === t[(i + p) % Q];
      if (same) { period = p; break; }
    }
    rate[id] = [4 / (2 * minRun), 4 / period];
  }
}

const bk = new Osc(2e-4, 19);
const live = { on: false };
const TWO_PI = 2 * Math.PI;

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs);
  bk.set(FB, t);
  build(v.word);
  live.on = kitPowered(s);
  return { ...v, on: live.on, fbNow: bk.at(t) };
}

// ------------------------------------------------------------------ node voltages
const RES: Record<string, number> = { GND: 0.01, P12: 1, M12: 1, P5: 1, M5: 1, CK: 100, BK: 100, NRZ: 100, ...Object.fromEntries(CODES.map((c) => [c, 100])) };
const DC: Record<string, number> = { P12: 12, M12: -12, P5: 5, M5: -5 };
const NODES = TERMS.map((t) => t.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => TERM[s]?.node, RES, cache));
let dcOnly = false;

function emf(node: string, t: number): number {
  if (!live.on) return 0;
  if (node in DC) return DC[node];
  const tab = table[node as Wave];
  if (!tab) return 0;
  if (dcOnly) return mean[node as Wave];
  const q = (bk.phase(t) / TWO_PI) * 4, qi = Math.floor(q), i = ((qi % Q) + Q) % Q;
  const v = tab[i], before = tab[(i + Q - 1) % Q];
  if (v === before) return v;
  const dt = (q - qi) / (4 * FB);
  return dt > 8 * RING.tau ? v : v + RING.a * (v - before) * Math.exp(-dt / RING.tau) * Math.cos((TWO_PI * dt) / RING.period);
}

function vGroup(w: Wiring, g: number, t: number): number | null {
  const src = w.sources[g];
  if (!src.length) return null;
  if (src.length === 1) return emf(src[0], t);
  let num = 0, den = 0;
  for (const n of src) { num += emf(n, t) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
function dcOf(w: Wiring, g: number): number {
  dcOnly = true;
  const v = vGroup(w, g, 0) ?? 0;
  dcOnly = false;
  return v;
}

const nodeOf = (plugs: Record<string, PcePlug>, plug: string) => { const at = plugs[plug]?.attachedTo; return at && TERM[at] ? TERM[at].node : null; };

/** Signal at a probe tip, measured against the scope's ground. null: the tip is not on the kit. */
export function tipSource(ch: 0 | 1): Source | null {
  const plugs = usePce.getState().plugs;
  const node = nodeOf(plugs, ch ? 'ch2' : 'ch1');
  if (!node) return null;
  const w = wiring(plugs), g = w.group.get(node)!, ref = w.group.get(SG)!;
  const grounded = w.sources[ref].length > 0;
  if (!grounded) {
    // no ground lead on the kit: mains hum and only a trace of the signal
    const ph = ch * 1.3;
    return { v: (t) => 0.07 * (vGroup(w, g, t) ?? 0) + 0.11 * Math.sin(TWO_PI * 50 * t + ph) + 0.03 * Math.sin(TWO_PI * 150 * t + 2 * ph), fFast: 50, fSlow: 50, dc: 0, grounded };
  }
  if (g === ref) return { v: () => 0, fFast: 0, fSlow: 0, dc: 0, grounded };
  let fast = 0, slow = 0;
  if (live.on) for (const n of [...w.sources[g], ...w.sources[ref]]) {
    const r = rate[n as Wave];
    if (!r) continue;
    fast = Math.max(fast, r[0] * FB);
    if (r[1] > 0) slow = slow ? Math.min(slow, r[1] * FB) : r[1] * FB;
  }
  return { v: (t) => (vGroup(w, g, t) ?? 0) - (vGroup(w, ref, t) ?? 0), fFast: fast, fSlow: slow, dc: dcOf(w, g) - dcOf(w, ref), grounded };
}

/** How the bench is wired, for the setup guide and its hints. */
export function circuit(plugs: Record<string, PcePlug> = usePce.getState().plugs) {
  const w = wiring(plugs);
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  return {
    scopeGnd: same(SG, 'GND'),
    /** a ground clip sits somewhere, but not on ground */
    clipOffGnd: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? TERM[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}
