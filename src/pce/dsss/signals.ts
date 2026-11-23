// Electrical model of the DSSS trainer (Sigma DSSS100).
//
// One master clock (nominally 1 MHz; 976.2 kHz on the lab's kit) gives everything: the PN clock
// (/10), the bit clock (/150, so a bit is exactly 15 chips), 200 kHz (/5) and the 500 kHz square wave
// (/2) that the RF generator tunes into the carrier, so the carrier makes exactly 5 cycles per chip.
// PN: a 15-chip maximal sequence repeating every bit, running once PRBS is pressed. Mixer (74266):
// SP = XNOR(data, PN). Uni-to-bipolar converter: ±4 V, inverted. Modulator (1496): DSSS = k x Sp x
// carrier. Coherent detector: DSSS x carrier, an RC (rough "noisy" SP code); low pass filter (741,
// gain 2) and comparator (311, inverting) give the SP code back; despreading: XNOR with the PN code,
// timed by flip-flops on the 200 kHz clock.
//
// The chip-rate signals are tables over one word (120 chips); the two filter stages of the receiver
// are worked out exactly at any instant from their states at the chip edges.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { BITS, TERM, TERMS, type KitNode } from './layout.ts';

/** Master clock (Hz): the student's sheet reads PN clock 97.62 kHz, bit clock 6.51 kHz. */
export const F0 = 976.2e3;
export const FC = F0 / 10, FB = FC / 15, FRF = F0 / 2;
/** The PN code over one bit, as on the student's sheet. */
export const PN_SEQ = [1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0];
const CHIPS = 15 * 8;
/** Logic highs as read on the student's sheet (V). */
const HI = { clk: 4.6, nrz: 4.4, pn: 4.8, sp: 5.0, spo: 4.96, rec: 4.4, rf500: 4.6 };
/** Carrier amplitude (V peak, 3.76 V p-p), modulator gain (per volt of each input), carrier leak (V of Sp input), output limit. */
const RF = { amp: 1.88, kmod: 0.56, leak: 0.1, lim: 7 };
const BIP = 4;
/** Detector: gain from input carrier amplitude to output, its RC (in chips), ripple left at 2 x carrier. LPF: time constant (chips), gain. Comparator threshold. */
const DET = { gain: 1.24 / 4.2, tau: 0.12, ripple: 0.3 };
const LPF = { tau: 0.2, gain: 2, lim: 13 };
const CMP = { vth: 0, delay: 0.1e-6 };

export const word = (k: Knobs): number[] => BITS.map((n) => (k[`s${n}`] > 0.5 ? 1 : 0));
export function kitValues(k: Knobs) {
  const w = word(k), ones = w.reduce((a, b) => a + b, 0);
  return { word: w, text: w.join(''), ones, flat: ones === 0 || ones === 8, fb: FB, fc: FC, frf: FRF, pnOn: (k.pn ?? 0) > 0.5 };
}

// ------------------------------------------------------------------ live state
const chipOsc = new Osc(2e-4, 19);
const live = { on: false, pn: false, word: [0, 0, 0, 0, 0, 0, 0, 0] as number[], key: '' };
const TWO_PI = 2 * Math.PI;

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs);
  chipOsc.set(FC, t);
  live.on = kitPowered(s);
  // the PN register is a set of flip-flops: it forgets its state when the kit loses power
  if (!live.on && v.pnOn) queueMicrotask(() => usePce.getState().setKnob('pn', 0));
  live.pn = live.on && v.pnOn;
  live.word = v.word;
  live.key = `${v.text}|${live.pn}|${live.on}`;
  return { ...v, on: live.on, fcNow: chipOsc.at(t) };
}
/** Chips sent so far at time t (fractional). */
const chipsAt = (t: number) => chipOsc.phase(t) / TWO_PI;
const frac = (x: number) => x - Math.floor(x);
const sq = (x: number, hi: number) => (frac(x) < 0.5 ? hi : 0);
const mod = (n: number) => ((n % CHIPS) + CHIPS) % CHIPS;

// ------------------------------------------------------------------ wiring
const RES: Record<string, number> = {
  GND: 0.01, P15: 1, M15: 1, P5: 1, M5: 1, CC: 100, PNCK: 100, BK: 100, C200: 100, C200B: 100, PN: 100, NRZ: 100, SP: 470, BIP: 100, DSSS: 50,
  RF500: 100, RF: 200, DETRF: 1000, DET: 100, FIL: 100, SPO: 470, REC: 100,
};
const DC: Record<string, number> = { P15: 15, M15: -15, P5: 5, M5: -5 };
const NODES = TERMS.map((t) => t.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => TERM[s]?.node, RES, cache));
let W = null as unknown as Wiring;
const grp = (n: KitNode) => W.group.get(n)!;
const srcOf = (n: KitNode) => W.sources[grp(n)];
const clip = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);
const DEEP = 5;

function gv(g: number, t: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  if (src.length === 1) return emf(src[0], t, d);
  let num = 0, den = 0;
  for (const n of src) { num += emf(n, t, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}

// ------------------------------------------------------------------ chip-level tables
const pnBit = (n: number) => (live.pn ? PN_SEQ[mod(n) % 15] : 0);
const nrzBit = (n: number) => live.word[Math.floor(mod(n) / 15)];
/** Level of a chip-rate node during chip n (fast clocks count as their average). */
function nodeQ(node: string, n: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  if (node in DC) return DC[node];
  switch (node) {
    case 'PN': return pnBit(n) * HI.pn;
    case 'NRZ': return nrzBit(n) * HI.nrz;
    case 'SP': return (lvlQ('MIX_PN', n, d + 1) > 2.5) === (lvlQ('MIX_NRZ', n, d + 1) > 2.5) ? HI.sp : 0;
    case 'BIP': return lvlQ('BIP_IN', n, d + 1) > 2.5 ? -BIP : BIP;
    case 'BK': return Math.floor(mod(n) % 15) < 7.5 ? HI.clk : 0;
    case 'CC': case 'PNCK': case 'C200': case 'C200B': return HI.clk / 2;
    case 'RF500': return HI.rf500 / 2;
    default: return 0;
  }
}
function lvlQ(input: KitNode, n: number, d: number): number {
  const src = srcOf(input);
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const s of src) { num += nodeQ(s, n, d) / RES[s]; den += 1 / RES[s]; }
  return num / den;
}
/** Amplitude of the carrier (in phase with the detector's) a node carries. */
const carrierOf = (node: string) => (node === 'RF' || node === 'DETRF' ? RF.amp : node === 'RF500' ? (HI.rf500 * 2) / Math.PI : 0);
function rfAmp(input: KitNode): number {
  const src = srcOf(input);
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const s of src) { num += carrierOf(s) / RES[s]; den += 1 / RES[s]; }
  return num / den;
}
/** Carrier coefficient of the DSSS signal during chip n: DSSS ≈ c(n) x sin(carrier). */
const dsssQ = (n: number) => clip(RF.kmod * (lvlQ('MOD_SP', n, 0) + RF.leak) * rfAmp('MOD_RF'), RF.lim);
function detInQ(n: number): number {
  const src = srcOf('DET_IN');
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const s of src) { num += (s === 'DSSS' ? dsssQ(n) : carrierOf(s)) / RES[s]; den += 1 / RES[s]; }
  return num / den;
}

/** One or two first-order lags driven by a level that steps at each chip edge, periodic over a word; exact in between. */
class Lags {
  T = new Float64Array(CHIPS); s1 = new Float64Array(CHIPS); s2 = new Float64Array(CHIPS);
  constructor(private t1: number, private t2: number) {}
  run() {
    const { T, t1, t2 } = this, e1 = Math.exp(-1 / t1), e2 = t2 ? Math.exp(-1 / t2) : 0;
    let x1 = 0, x2 = 0;
    for (let pass = 0; pass < 4; pass++) for (let n = 0; n < CHIPS; n++) {
      if (pass === 3) { this.s1[n] = x1; this.s2[n] = x2; }
      const a = x1 - T[n];
      if (t2) { const c = (a * t1) / (t1 - t2), b = x2 - T[n] - c; x2 = T[n] + b * e2 + c * e1; }
      x1 = T[n] + a * e1;
    }
  }
  /** first and second stage at chip position x */
  at(x: number): [number, number] {
    const n = Math.floor(x), i = mod(n), u = x - n, T = this.T[i], a = this.s1[i] - T;
    const x1 = T + a * Math.exp(-u / this.t1);
    if (!this.t2) return [x1, x1];
    const c = (a * this.t1) / (this.t1 - this.t2), b = this.s2[i] - T - c;
    return [x1, T + b * Math.exp(-u / this.t2) + c * Math.exp(-u / this.t1)];
  }
}
const detLags = new Lags(DET.tau, LPF.tau), lpfLags = new Lags(LPF.tau, 0);
/** what feeds the low pass filter: the detector (two stages), a chip-rate level (one stage), or nothing */
let lpfMode: 'det' | 'level' | 'none' = 'none';
let lagKey = '';
function buildLags() {
  const key = `${W.key}|${live.key}`;
  if (key === lagKey) return;
  lagKey = key;
  for (let n = 0; n < CHIPS; n++) { detLags.T[n] = DET.gain * detInQ(n); lpfLags.T[n] = lvlQ('LPF_IN', n, 0); }
  detLags.run(); lpfLags.run();
  const src = srcOf('LPF_IN');
  lpfMode = src.includes('DET') ? 'det' : src.length ? 'level' : 'none';
}
function filAt(t: number): number {
  buildLags();
  if (lpfMode === 'none') return 0;
  const x = chipsAt(t);
  return clip(LPF.gain * (lpfMode === 'det' ? detLags.at(x)[1] : lpfLags.at(x)[0]), LPF.lim);
}

// ------------------------------------------------------------------ node voltages
function emf(node: string, t: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  if (node in DC) return DC[node];
  const x = chipsAt(t);
  switch (node) {
    case 'GND': return 0;
    case 'CC': return sq(x * 10, HI.clk);
    case 'PNCK': return sq(x, HI.clk);
    case 'BK': return sq(x / 15, HI.clk);
    case 'C200': return sq(x * 2, HI.clk);
    case 'C200B': return HI.clk - sq(x * 2, HI.clk);
    case 'RF500': return sq(x * 5, HI.rf500);
    case 'RF': case 'DETRF': return RF.amp * Math.sin(TWO_PI * 5 * x);
    case 'PN': case 'NRZ': case 'SP': case 'BIP': return nodeQ(node, Math.floor(x), d);
    case 'DSSS': return clip(RF.kmod * (gv(grp('MOD_SP'), t, d + 1) + RF.leak) * gv(grp('MOD_RF'), t, d + 1), RF.lim);
    case 'DET': {
      buildLags();
      const n = Math.floor(x);
      return detLags.at(x)[0] - DET.ripple * DET.gain * detInQ(n) * Math.cos(TWO_PI * 10 * x);
    }
    case 'FIL': return filAt(t);
    case 'SPO': return filAt(t - CMP.delay) < CMP.vth ? HI.spo : 0;
    case 'REC': {
      // latched on the last edge of the 200 kHz clock: the recovered SP code (which lags its chip by about a third of a chip)
      // against the PN code delayed a quarter of a chip by the first flip-flop, so both belong to the same chip
      const e = Math.floor(x * 2) / 2, te = t - (x - e) / FC - 1e-9;
      const sp = gv(grp('DESP_SP'), te, d + 1) > 2.5, pn = gv(grp('DESP_PN'), te - 0.25 / FC, d + 1) > 2.5;
      return sp === pn ? HI.rec : 0;
    }
    default: return 0;
  }
}

/** Is a periodic data pattern (a word that changes) behind the chip-rate chain? Is the PN code? */
const wordOn = () => live.on && live.word.some((b) => b) && live.word.some((b) => !b);
function rateOf(node: string): [number, number] {
  if (!live.on) return [0, 0];
  const slow = wordOn() ? FB / 8 : live.pn ? FB : 0;
  switch (node) {
    case 'CC': return [F0, F0];
    case 'PNCK': return [FC, FC];
    case 'BK': return [FB, FB];
    case 'C200': case 'C200B': return [2 * FC, 2 * FC];
    case 'RF500': case 'RF': case 'DETRF': return [FRF, FRF];
    case 'PN': return live.pn ? [FC, FB] : [0, 0];
    case 'NRZ': return wordOn() ? [FB, FB / 8] : [0, 0];
    case 'SP': case 'BIP': case 'DET': case 'FIL': case 'SPO': return [FC, slow || FC];
    case 'DSSS': return [FRF, slow || FRF];
    case 'REC': return wordOn() ? [FB, FB / 8] : [FC, FB];
    default: return [0, 0];
  }
}
function dcOf(node: string): number {
  if (!live.on) return 0;
  if (node in DC) return DC[node];
  if (['CC', 'PNCK', 'BK', 'C200', 'C200B', 'RF500'].includes(node)) return node === 'RF500' ? HI.rf500 / 2 : HI.clk / 2;
  if (node === 'RF' || node === 'DETRF' || node === 'DSSS') return 0;
  const t0 = now(), n = 240;
  let s = 0;
  for (let i = 0; i < n; i++) s += emf(node, t0 - ((i + 0.5) / n) * (CHIPS / FC));
  return s / n;
}
function gdc(g: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  let num = 0, den = 0;
  for (const n of src) { num += dcOf(n) / RES[n]; den += 1 / RES[n]; }
  return num / den;
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
  return {
    scopeGnd: same(SG, 'GND'),
    clipOffGnd: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'),
    mixPn: same('PN', 'MIX_PN'), mixNrz: same('NRZ', 'MIX_NRZ'),
    toBip: same('SP', 'BIP_IN'), bipToMod: same('BIP', 'MOD_SP'), spToMod: same('SP', 'MOD_SP'), rfToMod: same('RF', 'MOD_RF'),
    toDet: same('DSSS', 'DET_IN'), toLpf: same('DET', 'LPF_IN'),
    despSp: same('SPO', 'DESP_SP'), despPn: same('PN', 'DESP_PN'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? TERM[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}

/** Test hooks: a node's voltage now (wiring as on the bench), and the time of a chip position near t. */
export function probe(node: KitNode, t: number) { W = wiring(); return emf(node, t); }
export function chipTime(t: number, chips: number) { return t + (chips - chipsAt(t)) / FC; }
export const chipsNow = (t: number) => chipsAt(t);
