// Electrical model of the FSK trainer (Sigma COM115M).
//
// Generator: the eight switch bits go out D8 first at 80 kHz, as NRZ and as its complement NRZ̅;
// CK runs at twice the bit rate. Carrier generator: two free-running LC oscillators, 640 kHz (f1)
// and 320 kHz (f2), 2 V peak-to-peak, wired inside the kit to balanced modulator-1 and -2. Each
// modulator multiplies its data input (0 V / 5 V) by its carrier: ASK1 and ASK2, with a little
// carrier leaking through. Adder (356, inverting summer, inside the kit): FSK = -(ASK1 + ASK2).
// Demodulator: a 4046 PLL; its filtered control voltage (RAW Data) moves towards a level set by
// the frequency it is locked to (low for 320 kHz, high for 640 kHz) with the loop filter's time
// constant, and rests at its free-running level when nothing it can lock to comes in. Data squarer
// (311): 5 V while the raw data is below its threshold.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { BITS, TERM, TERMS, type KitNode } from './layout.ts';

/** Bit rate (Hz): Tb = 12.5 µs on the instructor's answer sheet. */
export const FB = 80e3;
/** Carriers (Hz) and their amplitude (V peak). */
export const F1 = 640e3, F2 = 320e3, CARRIER = 1;
/** Logic high of the generator (V). */
const VH = 5;
/** Overshoot on every generator edge: fraction of the step, decay time and ringing period (s). */
const RING = { a: 0.08, tau: 0.15e-6, period: 0.4e-6 };
/** Quarter-bits in two words. */
const Q = 64;
/** Balanced modulator: gain (per volt of data input, on the carrier), carrier leak (as volts of input), output limit (V). */
const BM = { gain: 1, leak: 0.25, lim: 6.5 };
const ADD_LIM = 10.5;
/**
 * PLL: control voltage at 320 kHz and at 640 kHz, its free-running level, the lock range (Hz), the
 * smallest input it locks to (V peak), the loop filter's time constant (s), and the ripple left at
 * twice the input frequency (V).
 */
const PLL = { lo: 1, hi: 4, free: 2.6, fMin: 150e3, fMax: 900e3, minAmp: 0.4, tau: 0.35 / FB, ripple: 0.06 };
/** Data squarer: threshold (V, set by its preset), delay (s), output levels (V). */
const SQ = { vth: 2.5, delay: 0.2e-6, hi: 5, lo: 0.1 };

export const word = (k: Knobs): number[] => BITS.map((n) => (k[`s${n}`] > 0.5 ? 1 : 0));
export function kitValues(k: Knobs) {
  const w = word(k), ones = w.reduce((a, b) => a + b, 0);
  return { word: w, text: w.join(''), ones, flat: ones === 0 || ones === 8, fb: FB };
}

// ------------------------------------------------------------------ generator tables
type Wave = 'CK' | 'BK' | 'NRZ' | 'NRZB';
const WAVES: Wave[] = ['CK', 'BK', 'NRZ', 'NRZB'];
const isWave = (n: string): n is Wave => (WAVES as string[]).includes(n);
const table = Object.fromEntries(WAVES.map((w) => [w, new Float32Array(Q)])) as Record<Wave, Float32Array>;
const mean = Object.fromEntries(WAVES.map((w) => [w, 0])) as Record<Wave, number>;
const rate = Object.fromEntries(WAVES.map((w) => [w, [0, 0]])) as Record<Wave, [number, number]>;
let built = '';

function build(w: number[]) {
  const key = w.join('');
  if (key === built) return;
  built = key;
  for (let n = 0; n < 16; n++) {
    const b = w[n % 8] === 1, q = n * 4;
    const put = (id: Wave, a: number, c: number, d = a, e = c) => { const t = table[id]; t[q] = a; t[q + 1] = d; t[q + 2] = c; t[q + 3] = e; };
    put('CK', VH, VH, 0, 0);
    put('BK', VH, 0);
    put('NRZ', b ? VH : 0, b ? VH : 0);
    put('NRZB', b ? 0 : VH, b ? 0 : VH);
  }
  for (const id of WAVES) {
    const t = table[id];
    let sum = 0;
    for (let i = 0; i < Q; i++) sum += t[i];
    mean[id] = sum / Q;
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

// ------------------------------------------------------------------ live state
const bk = new Osc(2e-4, 19);
/** the LC carriers wander a little more than the generator's clock */
const osc1 = new Osc(8e-4, 23), osc2 = new Osc(8e-4, 17), free = new Osc(2e-3, 13);
const live = { on: false };
const TWO_PI = 2 * Math.PI;

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs);
  bk.set(FB, t); osc1.set(F1, t); osc2.set(F2, t); free.set(480e3, t);
  build(v.word);
  live.on = kitPowered(s);
  return { ...v, on: live.on, fbNow: bk.at(t), f1Now: osc1.at(t), f2Now: osc2.at(t) };
}
const bitsAt = (t: number) => bk.phase(t) / TWO_PI;

// ------------------------------------------------------------------ wiring
const RES: Record<string, number> = { GND: 0.01, P15: 1, M15: 1, P5: 1, CK: 100, BK: 100, NRZ: 100, NRZB: 100, F1: 1000, F2: 1000, ASK1: 50, ASK2: 50, FSK: 50, VCO: 100, RAW: 1500, REC: 470 };
const DC: Record<string, number> = { P15: 15, M15: -15, P5: 5 };
const NODES = TERMS.map((t) => t.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => TERM[s]?.node, RES, cache));
let W = null as unknown as Wiring;
const clip = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);
const grp = (n: KitNode) => W.group.get(n)!;
const DEEP = 4;

function gv(g: number, t: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  if (src.length === 1) return emf(src[0], t, d);
  let num = 0, den = 0;
  for (const n of src) { num += emf(n, t, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}

// ------------------------------------------------------------------ the PLL, quarter bit by quarter bit
/** Level of a data input during quarter q of the two-word table: what the generator puts on it (carriers count as 0). */
function dataQ(input: KitNode, q: number): number {
  const src = W.sources[grp(input)];
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const n of src) { num += (isWave(n) ? table[n][q] : DC[n] ?? 0) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
/** Strongest sine at a node during quarter q: frequency (0: not a sine) and amplitude. */
function toneQ(node: string, q: number, d = 0): [number, number] {
  if (d > DEEP) return [0, 0];
  switch (node) {
    case 'F1': return [F1, CARRIER];
    case 'F2': return [F2, CARRIER];
    case 'ASK1': return [F1, Math.min(BM.lim, Math.abs(dataQ('BM1_IN', q) + BM.leak) * BM.gain * CARRIER)];
    case 'ASK2': return [F2, Math.min(BM.lim, Math.abs(dataQ('BM2_IN', q) + BM.leak) * BM.gain * CARRIER)];
    case 'FSK': { const a = toneQ('ASK1', q, d + 1), b = toneQ('ASK2', q, d + 1); return a[1] >= b[1] ? a : b; }
    default: return [0, isWave(node) ? table[node][q] : Math.abs(DC[node] ?? 0)];
  }
}
/** What the loop locks to in each quarter (0: nothing), its control-voltage target, and the voltage at the start of each quarter. */
const lock = new Float64Array(Q), target = new Float64Array(Q), startV = new Float64Array(Q);
let pllKey = '';
function buildPll() {
  const key = `${W.key}|${built}|${live.on}`;
  if (key === pllKey) return;
  pllKey = key;
  const src = W.sources[grp('FSK_IN')];
  for (let q = 0; q < Q; q++) {
    let best: [number, number] = [0, 0];
    for (const n of src) { const t = toneQ(n, q); if (t[1] > best[1]) best = t; }
    const ok = live.on && best[0] >= PLL.fMin && best[0] <= PLL.fMax && best[1] >= PLL.minAmp;
    lock[q] = ok ? best[0] : 0;
    target[q] = ok ? clip(PLL.lo + ((PLL.hi - PLL.lo) * (best[0] - F2)) / (F1 - F2), 4.8) : PLL.free;
  }
  // the loop filter's exponential settling, run round the table until it repeats
  const k = Math.exp(-1 / (4 * FB) / PLL.tau);
  let v = PLL.free;
  for (let pass = 0; pass < 4; pass++) for (let q = 0; q < Q; q++) { if (pass === 3) startV[q] = v; v = target[q] + (v - target[q]) * k; }
}
function pllAt(t: number): { v: number; q: number } {
  buildPll();
  const x = bitsAt(t) * 4, qi = Math.floor(x), q = ((qi % Q) + Q) % Q, dt = (x - qi) / (4 * FB);
  let v = target[q] + (startV[q] - target[q]) * Math.exp(-dt / PLL.tau);
  if (lock[q]) v += PLL.ripple * Math.sin(TWO_PI * 2 * lock[q] * t);
  return { v, q };
}

// ------------------------------------------------------------------ node voltages
function tableAt(id: Wave, t: number): number {
  const x = bitsAt(t) * 4, qi = Math.floor(x), i = ((qi % Q) + Q) % Q, tab = table[id];
  const v = tab[i], before = tab[(i + Q - 1) % Q];
  if (v === before) return v;
  const dt = (x - qi) / (4 * FB);
  return dt > 8 * RING.tau ? v : v + RING.a * (v - before) * Math.exp(-dt / RING.tau) * Math.cos((TWO_PI * dt) / RING.period);
}

function emf(node: string, t: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  if (node in DC) return DC[node];
  if (isWave(node)) return tableAt(node, t);
  switch (node) {
    case 'GND': return 0;
    case 'F1': return CARRIER * Math.sin(osc1.phase(t));
    case 'F2': return CARRIER * Math.sin(osc2.phase(t));
    case 'ASK1': return clip((gv(grp('BM1_IN'), t, d + 1) + BM.leak) * BM.gain * CARRIER * Math.sin(osc1.phase(t)), BM.lim);
    case 'ASK2': return clip((gv(grp('BM2_IN'), t, d + 1) + BM.leak) * BM.gain * CARRIER * Math.sin(osc2.phase(t)), BM.lim);
    case 'FSK': return clip(-(emf('ASK1', t, d + 1) + emf('ASK2', t, d + 1)), ADD_LIM);
    case 'RAW': return pllAt(t).v;
    case 'REC': return pllAt(t - SQ.delay).v < SQ.vth ? SQ.hi : SQ.lo;
    case 'VCO': {
      // the VCO runs in step with the carrier it is locked to, or free near 480 kHz
      const { q } = pllAt(t), f = lock[q];
      return Math.sin(f === F1 ? osc1.phase(t) : f === F2 ? osc2.phase(t) : free.phase(t)) > 0 ? 5 : 0;
    }
    default: return 0;
  }
}

function dcOf(node: string): number {
  if (!live.on) return 0;
  if (node in DC) return DC[node];
  if (isWave(node)) return mean[node];
  if (node === 'VCO') return 2.5;
  if (node === 'RAW' || node === 'REC') {
    const t0 = now(), n = 128;
    let s = 0;
    for (let i = 0; i < n; i++) s += emf(node, t0 - ((i + 0.5) / n) * (16 / FB));
    return s / n;
  }
  return 0;
}
function gdc(g: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const n of src) { num += dcOf(n) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}

/** Does real data (a word with both 1s and 0s) reach this input? */
const dataAt = (input: KitNode) => W.sources[grp(input)].some((n) => isWave(n) && n !== 'CK' && n !== 'BK' && rate[n][1] > 0);
/** Quickest and slowest periodic part at a node (Hz; slow 0 = nothing to trigger on). */
function rateOf(node: string): [number, number] {
  if (!live.on) return [0, 0];
  if (isWave(node)) return [rate[node][0] * FB, rate[node][1] * FB];
  const word = FB / 8;
  switch (node) {
    case 'F1': return [F1, F1];
    case 'F2': return [F2, F2];
    case 'ASK1': return [F1, dataAt('BM1_IN') ? word : F1];
    case 'ASK2': return [F2, dataAt('BM2_IN') ? word : F2];
    case 'FSK': return [F1, dataAt('BM1_IN') || dataAt('BM2_IN') ? word : F2];
    case 'RAW': case 'REC': case 'VCO': {
      buildPll();
      let changes = false;
      for (let q = 0; q < Q && !changes; q++) changes = target[q] !== target[(q + 1) % Q];
      if (node === 'VCO') return [F1, changes ? word : lock[0] || 480e3];
      return changes ? [FB, word] : [0, 0];
    }
    default: return [0, 0];
  }
}

const nodeOf = (plugs: Record<string, PcePlug>, plug: string) => { const at = plugs[plug]?.attachedTo; return at && TERM[at] ? TERM[at].node : null; };

/** Signal at a probe tip, measured against the scope's ground. null: the tip is not on the kit. */
export function tipSource(ch: 0 | 1): Source | null {
  const plugs = usePce.getState().plugs;
  const node = nodeOf(plugs, ch ? 'ch2' : 'ch1');
  if (!node) return null;
  const w = wiring(plugs), g = w.group.get(node)!, ref = w.group.get(SG)!;
  const grounded = w.sources[ref].length > 0;
  const at = (gg: number, t: number) => { W = w; return gv(gg, t, 0); };
  if (!grounded) {
    const ph = ch * 1.3;
    return { v: (t) => 0.07 * at(g, t) + 0.11 * Math.sin(TWO_PI * 50 * t + ph) + 0.03 * Math.sin(TWO_PI * 150 * t + 2 * ph), fFast: 50, fSlow: 50, dc: 0, grounded };
  }
  if (g === ref) return { v: () => 0, fFast: 0, fSlow: 0, dc: 0, grounded };
  W = w;
  let fast = 0, slow = 0;
  for (const n of [...w.sources[g], ...w.sources[ref]]) {
    const [f, s] = rateOf(n);
    fast = Math.max(fast, f);
    if (s > 0) slow = slow ? Math.min(slow, s) : s;
  }
  return { v: (t) => at(g, t) - at(ref, t), fFast: fast, fSlow: slow, dc: gdc(g) - gdc(ref), grounded };
}

/** How the bench is wired, for the setup guide and its hints. */
export function circuit(plugs: Record<string, PcePlug> = usePce.getState().plugs) {
  const w = wiring(plugs);
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  const dataOf = (input: string) => (same('NRZ', input) ? 'NRZ' : same('NRZB', input) ? 'NRZB' : null);
  return {
    scopeGnd: same(SG, 'GND'),
    clipOffGnd: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'),
    /** which data each modulator gets */
    bm1: dataOf('BM1_IN'), bm2: dataOf('BM2_IN'),
    demod: same('FSK', 'FSK_IN'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? TERM[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}

/** Test hook: the voltage of a node right now, wiring as on the bench. */
export function probe(node: KitNode, t: number) { W = wiring(); return emf(node, t); }
