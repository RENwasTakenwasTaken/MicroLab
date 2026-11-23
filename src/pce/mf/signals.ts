// Electrical model of the matched-filter trainer (Sigma COM120L).
//
// Generator: as on the line-code trainer, the eight switch bits go out D8 first, one per cycle of
// the bit clock BK; CK runs at twice the bit rate. Noise generator: band-limited Gaussian noise,
// its level set by the AMPLITUDE pot. Noise adder: an inverting summer (356, 1 kΩ in, 1 kΩ
// feedback), so noisy = -(I/P + noise). Integrate and dump filter: an inverting integrator (351)
// with a preset that adds half the data level, so the ramp goes up through a 1 and down through a
// 0; the 4528 one-shot dumps it on every rising edge at its BK input. Comparator (311, pulled up
// to +5 V): 5 V while the raw data is above 0 V.
//
// The noise is a fixed table of filtered random numbers read by time, with its running sum kept
// too, so the integrator's output is worked out exactly for any instant without stepping.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { BITS, TERM, TERMS, type KitNode } from './layout.ts';

/** Bit rate (Hz): same clock oscillator (7404, 1K preset, 1n) as the line-code trainer. */
export const FB = 26330;
/** Logic high of the generator (V). */
const VH = 5;
/** Overshoot on every generator edge: fraction of the step, decay time and ringing period (s). */
const RING = { a: 0.09, tau: 0.45e-6, period: 0.9e-6 };
/** Quarter-bits in two words. */
const Q = 64;
/**
 * Noise: RMS at full AMPLITUDE before clipping (V), what is left at zero, the swing limit of its
 * amplifier (V), and its bandwidth (Hz, two RC poles). At full AMPLITUDE the noise fills ±5.5 V and
 * about 1 % of the bits come out wrong; below about 70 % the received data is right, only chattering
 * at the start of each bit.
 */
export const NOISE = { max: 3.2, min: 0.004, clip: 5.5, fc: 150e3 };
/** Adder op-amp on ±12 V: output limit (V). */
const ADD_CLIP = 10.5;
/** Integrator: time constant (a whole bit of ±2.5 V gives about ±3.6 V), output limit on ±5 V, bias the preset adds (V), input offset (V), dump pulse (s). */
const INT = { tau: 1 / (1.45 * FB), sat: 3.8, bias: 2.5, offset: 0.01, dump: 0.5e-6 };
/** Comparator: delay (s), output levels (V). */
const CMP = { delay: 0.2e-6, hi: 5, lo: 0.1 };

/** The data word on the switches, D8 first. */
export const word = (k: Knobs): number[] => BITS.map((n) => (k[`s${n}`] > 0.5 ? 1 : 0));
/** Noise RMS at the AMPLITUDE pot's wiper for a pot position 0..1 (linear pot). */
export const noiseRms = (amp: number) => NOISE.min + NOISE.max * amp;
export function kitValues(k: Knobs) {
  const w = word(k), ones = w.reduce((a, b) => a + b, 0);
  return { word: w, text: w.join(''), ones, flat: ones === 0 || ones === 8, fb: FB, amp: k.amp ?? 0, rms: noiseRms(k.amp ?? 0) };
}

// ------------------------------------------------------------------ generator tables
type Wave = 'CK' | 'BK' | 'NRZ';
const WAVES: Wave[] = ['CK', 'BK', 'NRZ'];
const table = Object.fromEntries(WAVES.map((w) => [w, new Float32Array(Q)])) as Record<Wave, Float32Array>;
/** running sum of each table (V x quarter-bits), cum[i] = sum of entries before i */
const cum = Object.fromEntries(WAVES.map((w) => [w, new Float64Array(Q + 1)])) as Record<Wave, Float64Array>;
const mean = Object.fromEntries(WAVES.map((w) => [w, 0])) as Record<Wave, number>;
/** Quickest and slowest periodic part of each wave, in bit rates (0 = steady). */
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
  }
  for (const id of WAVES) {
    const t = table[id], c = cum[id];
    for (let i = 0; i < Q; i++) c[i + 1] = c[i] + t[i];
    mean[id] = c[Q] / Q;
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

// ------------------------------------------------------------------ noise table
const NT = 1 << 18, NDT = 0.25e-6;
const ntab = new Float32Array(NT), narea = new Float64Array(NT + 1);
(function makeNoise() {
  let s = 0x2f6e2b1;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = 1 - Math.exp(-2 * Math.PI * NOISE.fc * NDT);
  let y1 = 0, y2 = 0;
  const raw = new Float64Array(NT);
  // run the filter twice round the table so it starts settled and joins up at the wrap
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < NT; i++) {
    const g = pass ? raw[i] : Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    if (!pass) raw[i] = g;
    y1 += a * (g - y1); y2 += a * (y1 - y2);
    if (pass) ntab[i] = y2;
  }
  let m = 0, p = 0;
  for (let i = 0; i < NT; i++) m += ntab[i];
  m /= NT;
  for (let i = 0; i < NT; i++) { ntab[i] -= m; p += ntab[i] * ntab[i]; }
  const k = 1 / Math.sqrt(p / NT);
  for (let i = 0; i < NT; i++) { ntab[i] *= k; narea[i + 1] = narea[i] + ntab[i] * NDT; }
})();
/** Unit-RMS noise at time t. */
function noiseAt(t: number) {
  const x = t / NDT, i0 = Math.floor(x), f = x - i0, i = ((i0 % NT) + NT) % NT;
  return ntab[i] + f * (ntab[(i + 1) % NT] - ntab[i]);
}
/** Integral of the unit-RMS noise from the start of the table's cycle to t (V s). */
function noiseCum(t: number) {
  const x = t / NDT, i0 = Math.floor(x), f = x - i0, i = ((i0 % NT) + NT) % NT;
  return Math.floor(i0 / NT) * narea[NT] + narea[i] + f * ntab[i] * NDT;
}

// ------------------------------------------------------------------ live state
const bk = new Osc(2e-4, 19);
const live = { on: false, rms: 0 };
const TWO_PI = 2 * Math.PI;

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs);
  bk.set(FB, t);
  build(v.word);
  live.on = kitPowered(s);
  live.rms = v.rms;
  return { ...v, on: live.on, fbNow: bk.at(t) };
}

/** Bits sent so far at time t (fractional). */
const bitsAt = (t: number) => bk.phase(t) / TWO_PI;

// ------------------------------------------------------------------ node voltages
/** Source resistance of each driven node (Ω); the inputs (ADD_IN, ADD_GN, MF_IN, MF_BK) drive nothing. */
const RES: Record<string, number> = { GND: 0.01, CK: 100, BK: 100, NRZ: 100, GN: 2000, NOISY: 50, RAW: 100, REC: 470 };
const NODES = TERMS.map((t) => t.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => TERM[s]?.node, RES, cache));
/** wiring in use while a scope reading is worked out */
let W = null as unknown as Wiring;
const clip = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);
const DEEP = 4;

/** Voltage of a group of joined nodes: its drivers averaged by conductance; an undriven group (a floating input) is 0. */
function gv(g: number, t: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  if (src.length === 1) return emf(src[0], t, d);
  let num = 0, den = 0;
  for (const n of src) { num += emf(n, t, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
/** Integral of a group's voltage from t0 to t1 (V s). */
function ga(g: number, t0: number, t1: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const n of src) { num += area(n, t0, t1, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
/** Steady part of a group's voltage. */
function gdc(g: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const n of src) { num += dcOf(n, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}
const grp = (n: KitNode) => W.group.get(n)!;
const has = (input: KitNode, out: KitNode) => W.sources[grp(input)].includes(out);

/** Which clock dumps the integrator: once a bit (BK), twice a bit (CK), or never. */
const dumpEvery = (): number => (has('MF_BK', 'CK') ? 0.5 : has('MF_BK', 'BK') ? 1 : 0);

function tableAt(id: Wave, t: number): number {
  const q = bitsAt(t) * 4, qi = Math.floor(q), i = ((qi % Q) + Q) % Q, tab = table[id];
  const v = tab[i], before = tab[(i + Q - 1) % Q];
  if (v === before) return v;
  const dt = (q - qi) / (4 * FB);
  return dt > 8 * RING.tau ? v : v + RING.a * (v - before) * Math.exp(-dt / RING.tau) * Math.cos((TWO_PI * dt) / RING.period);
}
function tableCum(id: Wave, t: number): number {
  const q = bitsAt(t) * 4, qi = Math.floor(q), f = q - qi, i = ((qi % Q) + Q) % Q, c = cum[id];
  return (Math.floor(qi / Q) * c[Q] + c[i] + f * table[id][i]) / (4 * FB);
}

function rawAt(t: number, d: number): number {
  const every = dumpEvery();
  if (!every) {
    // never dumped: the integrator runs into a rail, whichever way its average input pushes it
    const m = gdc(grp('MF_IN'), d) + INT.bias + INT.offset;
    return m > 0 ? -INT.sat : INT.sat;
  }
  const b = bitsAt(t), since = ((b % every) + every) % every / FB;
  if (since < INT.dump) return 0;
  const a = ga(grp('MF_IN'), t - since, t, d) + (INT.bias + INT.offset) * since;
  return clip(-a / INT.tau, INT.sat);
}

function emf(node: string, t: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  switch (node) {
    case 'GND': return 0;
    case 'CK': case 'BK': case 'NRZ': return tableAt(node, t);
    case 'GN': return clip(live.rms * noiseAt(t), NOISE.clip);
    case 'NOISY': return clip(-(gv(grp('ADD_IN'), t, d + 1) + gv(grp('ADD_GN'), t, d + 1)), ADD_CLIP);
    case 'RAW': return rawAt(t, d + 1);
    case 'REC': return rawAt(t - CMP.delay, d + 1) > 0 ? CMP.hi : CMP.lo;
    default: return 0;
  }
}

function area(node: string, t0: number, t1: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  switch (node) {
    case 'GND': return 0;
    case 'CK': case 'BK': case 'NRZ': return tableCum(node, t1) - tableCum(node, t0);
    case 'GN': return live.rms * (noiseCum(t1) - noiseCum(t0));
    case 'NOISY': return -(ga(grp('ADD_IN'), t0, t1, d + 1) + ga(grp('ADD_GN'), t0, t1, d + 1));
    default: {
      // the integrator's or comparator's output patched back in: add it up in small steps
      const n = 24, h = (t1 - t0) / n;
      let s = 0;
      for (let i = 0; i < n; i++) s += emf(node, t0 + (i + 0.5) * h, d + 1);
      return s * h;
    }
  }
}

function dcOf(node: string, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  switch (node) {
    case 'CK': case 'BK': case 'NRZ': return mean[node];
    case 'NOISY': return clip(-(gdc(grp('ADD_IN'), d + 1) + gdc(grp('ADD_GN'), d + 1)), ADD_CLIP);
    case 'RAW': case 'REC': {
      // average over two words
      const t0 = now(), n = 128;
      let s = 0;
      for (let i = 0; i < n; i++) s += emf(node, t0 - ((i + 0.5) / n) * (16 / FB), d);
      return s / n;
    }
    default: return 0;
  }
}

/** Quickest and slowest periodic part at a node (Hz; slow 0 = nothing to trigger on). Noise counts only where nothing periodic is there. */
function rateOf(node: string, d = 0): [number, number] {
  if (!live.on || d > DEEP) return [0, 0];
  const join = (rs: [number, number][]): [number, number] => {
    const per = rs.filter((r) => r[1] > 0);
    const use = per.length ? per : rs;
    let fast = 0, slow = 0;
    for (const [f, s] of use) { fast = Math.max(fast, f); if (s > 0) slow = slow ? Math.min(slow, s) : s; }
    return [fast, slow];
  };
  const ofGroup = (n: KitNode) => join(W.sources[grp(n)].map((x) => rateOf(x, d + 1)));
  switch (node) {
    case 'CK': case 'BK': case 'NRZ': return [rate[node][0] * FB, rate[node][1] * FB];
    case 'GN': return live.rms > 0.02 ? [NOISE.fc, 0] : [0, 0];
    case 'NOISY': return join([ofGroup('ADD_IN'), ofGroup('ADD_GN')]);
    case 'RAW': case 'REC': {
      const every = dumpEvery(), data = ofGroup('MF_IN');
      if (!every) return [0, 0];
      if (node === 'REC') return data[1] > 0 ? data : [0, 0];
      return [FB / every, data[1] > 0 ? Math.min(data[1], FB / every) : FB / every];
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
    // no ground lead on the kit: mains hum and only a trace of the signal
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
  const dc = gdc(g, 0) - gdc(ref, 0);
  return { v: (t) => at(g, t) - at(ref, t), fFast: fast, fSlow: slow, dc, grounded };
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
    dataIn: same('NRZ', 'ADD_IN'), noiseIn: same('GN', 'ADD_GN'), toFilter: same('NOISY', 'MF_IN'),
    dumpBk: same('BK', 'MF_BK'), dumpCk: same('CK', 'MF_BK'),
    /** the generator's data goes straight into the filter, missing out the (inverting) adder */
    nrzToFilter: same('NRZ', 'MF_IN'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? TERM[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}

/** Test hook: the voltage of a node right now (wiring as on the bench), and of the integrator at the end of each bit over two words. */
export function probe(node: KitNode, t: number) { W = wiring(); return emf(node, t); }
export function endOfBits(t: number) {
  W = wiring();
  const b0 = Math.ceil(bitsAt(t)), out: number[] = [];
  // bk.phase is nearly linear: step back from the next bit edge by a hair
  for (let k = 1; k <= 16; k++) out.push(rawAt(t + (b0 - bitsAt(t) + k - 0.02) / FB, 0));
  return out;
}
