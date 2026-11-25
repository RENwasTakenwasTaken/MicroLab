// Electrical model of the PCM trainer (Sigma COM110M).
//
// The sampling pulse generator (4011 oscillator, 1.32 MHz on FAST on the lab's kit) clocks everything:
// a frame lasts 64 clocks, so the sampling rate is fclk / 64 (20.6 kHz). A frame is 16 slots of 4 clocks.
// The modulator holds the input at the start of each frame (4066), a counter and resistor ladder
// (4040) climb a staircase ramp over the frame (8 steps for 3 bit, 16 for 4 bit), and the comparator
// (527) stops the count where the ramp passes the held sample: the code word, latched (4042) at the end
// of the frame onto the LEDs D1 (MSB) to D4 and shifted out (4021) during the next frame as
//   sync (14 - n slots high) · start (low) · n data bits, MSB first · stop (low).
// The demodulator recognises the long sync pulse, shifts the bits in (4015) and latches each word
// (4042) at the end of its frame; a resistor ladder turns it into RAW DATA, a bipolar staircase. The
// filter (741 buffer, RC stages 6K8 / 1n5 and 6K8 / 10n, gain stage with GAIN) smooths it back into
// the message; it is worked out exactly at any instant from the steps of the staircase.

import type { PcePlug } from '../kit.ts';
import { Osc } from '../osc.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { TERM, TERMS, type KitNode } from './layout.ts';

/** Range of the quantiser (V): the held sample is shifted by half of it, so a message of up to 2.88 V peak-to-peak fits. */
export const FS_V = 2.88;
export const CLK_PER_FRAME = 64, SLOTS = 16, CLK_PER_SLOT = 4;
/** SLOW swaps the 10 pF timing capacitor for the blue film capacitor (47 nF): the clock drops by this factor. */
export const SLOW_DIV = 4700;
/** Logic high of the CMOS outputs (V). */
const HI = { clk: 4.8, pcm: 4.8 };
/** Filter: the two RC stages (s) and the output swing of the 741s on ±5 V. */
const FLT = { t1: 6.8e3 * 1.5e-9, t2: 6.8e3 * 10e-9, lim: 4.1 };
/** Ends of the DC source (V), set by its two presets. */
const DC_END = 2.5;

export function kitValues(k: Knobs) {
  const bits = (k.bit3 ?? 1) > 0.5 ? 3 : 4, L = 2 ** bits, step = FS_V / L;
  const fFast = 0.8e6 + 0.8e6 * (k.sampF ?? 0.65), slow = (k.slow ?? 0) > 0.5, fclk = slow ? fFast / SLOW_DIV : fFast;
  return {
    bits, L, step, fFast, fclk, fs: fclk / CLK_PER_FRAME, slow,
    /** sine amplitude (V peak-to-peak) and frequency (Hz), as the printed scales give them on the lab's kit */
    vpp: 5 * k.agAmp * 0.97, fm: (300 + 3100 * k.agFreq) * 1.02,
    vdc: DC_END * (2 * k.dc - 1), gain: 1 + 2 * k.gain,
  };
}

// ------------------------------------------------------------------ live state
const clk = new Osc(3e-4, 29), tone = new Osc(4e-4, 17);
const live = { on: false, bits: 3, L: 8, step: FS_V / 8, vpp: 0, vdc: 0, gain: 1, key: '' };
const TWO_PI = 2 * Math.PI;

export function syncKit(t = now()) {
  const s = usePce.getState(), v = kitValues(s.knobs);
  clk.set(v.fclk, t); tone.set(v.fm, t);
  live.on = kitPowered(s);
  Object.assign(live, { bits: v.bits, L: v.L, step: v.step, vpp: v.vpp, vdc: v.vdc, gain: v.gain });
  live.key = `${v.bits}|${v.vpp}|${v.vdc}|${v.fm}|${v.fclk}|${live.on}`;
  return { ...v, on: live.on, fclkNow: clk.at(t) };
}
/** Clock cycles of the sampling pulse generator up to time t. */
const cAt = (t: number) => clk.phase(t) / TWO_PI;
/** Time at which the clock count reaches c (searched from a time near it). */
function tOf(c: number, near: number) {
  let t = near + (c - cAt(near)) / clk.at(near);
  t += (c - cAt(t)) / clk.at(t);
  return t;
}
const clip = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);

// ------------------------------------------------------------------ wiring
const RES: Record<string, number> = { GND: 0.01, P12: 1, M12: 1, P5: 1, M5: 1, SINE: 600, SCLK: 100, RAMP: 1000, PCM: 100, RAW: 1500, FOUT: 100, VDC: 2000 };
const DC: Record<string, number> = { P12: 12, M12: -12, P5: 5, M5: -5 };
const NODES = TERMS.map((t) => t.node as string);
let cache: Wiring | null = null;
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => TERM[s]?.node, RES, cache));
let W = null as unknown as Wiring;
const grp = (n: KitNode) => W.group.get(n)!;
const srcOf = (n: KitNode) => W.sources[grp(n)];
const DEEP = 5;

function gv(g: number, t: number, d: number): number {
  const src = W.sources[g];
  if (!src.length) return 0;
  if (src.length === 1) return emf(src[0], t, d);
  let num = 0, den = 0;
  for (const n of src) { num += emf(n, t, d) / RES[n]; den += 1 / RES[n]; }
  return num / den;
}

// ------------------------------------------------------------------ code words
/** Code words by frame number, for the present wiring and settings. */
const codes = new Map<number, number>();
let codeKey = '';
/** The word converted during frame k: the input held at the start of frame k against the ramp. */
function codeOf(k: number, near: number, d: number): number {
  const key = `${W.key}|${live.key}`;
  if (key !== codeKey || codes.size > 20000) { codes.clear(); codeKey = key; }
  const hit = codes.get(k);
  if (hit !== undefined) return hit;
  const v = gv(grp('MODIN'), tOf(k * CLK_PER_FRAME, near), d + 1);
  const code = Math.min(live.L - 1, Math.max(0, Math.floor((v + FS_V / 2) / live.step)));
  if (d <= 1) codes.set(k, code);
  return code;
}
/** Level of a frame slot: sync, start, the data bits (MSB first), stop. */
export function frameBit(slot: number, code: number, bits: number): 0 | 1 {
  const sync = 14 - bits;
  if (slot < sync) return 1;
  if (slot === sync || slot >= 15) return 0;
  return ((code >> (bits - 1 - (slot - sync - 1))) & 1) as 0 | 1;
}
/** Output of the demodulator's ladder for a word: a bipolar staircase, levels ±S/2, ±3S/2 ... */
const dac = (code: number) => (code + 0.5 - live.L / 2) * live.step;
/** The demodulator locks only on the kit's own PCM, alone on its input. */
const rxLocked = () => { const s = srcOf('PCMIN'); return s.length === 1 && s[0] === 'PCM'; };
/** RAW DATA during frame j: the word sent during frame j - 1, converted during frame j - 2. */
const rawOf = (j: number, near: number, d: number) => dac(codeOf(j - 2, near, d));

// ------------------------------------------------------------------ filter
/** Step response of the two RC stages. */
function stepResp(u: number) {
  if (u <= 0) return 0;
  const { t1, t2 } = FLT;
  return 1 - (t1 * Math.exp(-u / t1) - t2 * Math.exp(-u / t2)) / (t1 - t2);
}
function rawFiltered(t: number, d: number): number {
  if (!rxLocked()) return 0;
  const K = Math.floor(cAt(t) / CLK_PER_FRAME), fr = clk.at(t) / CLK_PER_FRAME;
  const back = Math.min(60, Math.ceil(10 * FLT.t2 * fr) + 1);
  let prev = rawOf(K - back, t, d), y = prev;
  for (let j = K - back + 1; j <= K; j++) {
    const r = rawOf(j, t, d);
    if (r !== prev) y += (r - prev) * stepResp(t - tOf(j * CLK_PER_FRAME, t));
    prev = r;
  }
  return y;
}
/** Any other input: the filter's impulse response over its recent past. */
function anyFiltered(t: number, d: number): number {
  const { t1, t2 } = FLT, n = 160, du = (8 * t2) / n, g = grp('RXIN');
  let y = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * du;
    y += ((Math.exp(-u / t2) - Math.exp(-u / t1)) / (t2 - t1)) * gv(g, t - u, d + 1) * du;
  }
  return y;
}
function fout(t: number, d: number): number {
  const src = srcOf('RXIN');
  if (!src.length) return 0;
  return clip(live.gain * (src.length === 1 && src[0] === 'RAW' ? rawFiltered(t, d) : anyFiltered(t, d)), FLT.lim);
}

// ------------------------------------------------------------------ node voltages
function emf(node: string, t: number, d = 0): number {
  if (!live.on || d > DEEP) return 0;
  if (node in DC) return DC[node];
  switch (node) {
    case 'GND': return 0;
    case 'SINE': return (live.vpp / 2) * Math.sin(tone.phase(t));
    case 'VDC': return live.vdc;
    case 'SCLK': { const c = cAt(t); return c - Math.floor(c) < 0.5 ? HI.clk : 0; }
    case 'RAMP': { const c = cAt(t), pos = c - Math.floor(c / CLK_PER_FRAME) * CLK_PER_FRAME; return Math.floor(pos / (CLK_PER_FRAME / live.L)) * live.step; }
    case 'PCM': {
      const c = cAt(t), k = Math.floor(c / CLK_PER_FRAME), slot = Math.floor((c - k * CLK_PER_FRAME) / CLK_PER_SLOT);
      return frameBit(slot, codeOf(k - 1, t, d), live.bits) ? HI.pcm : 0;
    }
    case 'RAW': return rxLocked() ? rawOf(Math.floor(cAt(t) / CLK_PER_FRAME), t, d) : 0;
    case 'FOUT': return fout(t, d);
    default: return 0;
  }
}

/**
 * Periodic parts of a node (Hz): what the scope's counter reads when it triggers on it, and the slowest
 * repetition. The PCM stream reads at its slot rate (edges can come one slot apart); the staircases at
 * the rate they repeat.
 */
function rateOf(node: string): [number, number] {
  if (!live.on) return [0, 0];
  const fclk = clk.f, fs = fclk / CLK_PER_FRAME, msg = srcOf('MODIN').includes('SINE') ? tone.f : fs;
  switch (node) {
    case 'SINE': return [tone.f, tone.f];
    case 'SCLK': return [fclk, fclk];
    case 'RAMP': return [fs, fs];
    case 'PCM': return [fclk / CLK_PER_SLOT, msg];
    case 'RAW': return rxLocked() ? [msg, msg] : [0, 0];
    case 'FOUT': return srcOf('RXIN').length ? [msg, msg] : [0, 0];
    default: return [0, 0];
  }
}
function dcOf(node: string): number {
  if (!live.on) return 0;
  if (node in DC) return DC[node];
  if (node === 'VDC') return live.vdc;
  if (node === 'SINE' || node === 'GND') return 0;
  if (node === 'SCLK') return HI.clk / 2;
  const t0 = now(), n = 240, span = Math.max(2 * CLK_PER_FRAME / clk.f, 2 / tone.f);
  let s = 0;
  for (let i = 0; i < n; i++) s += emf(node, t0 - ((i + 0.5) / n) * span);
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
  W = w;
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  const modSrc = srcOf('MODIN');
  return {
    scopeGnd: same(SG, 'GND'),
    clipOffGnd: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: nodeOf(plugs, 'ch1'), ch2: nodeOf(plugs, 'ch2'),
    sineToMod: modSrc.length === 1 && modSrc[0] === 'SINE', dcToMod: modSrc.length === 1 && modSrc[0] === 'VDC', modSources: modSrc,
    pcmLink: rxLocked(), pcmInOther: srcOf('PCMIN').length > 0 && !rxLocked(),
    rawToFlt: same('RAW', 'RXIN'),
  };
}

export function scopeInfo() {
  const c = circuit(), plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? TERM[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}

/** Brightness of the word LEDs D1 (MSB) to D4, 0 to 1: the latched word, averaged when it changes too fast to see. */
const ledMemo = { t: -1, v: [0, 0, 0, 0] };
export function ledLevels(t = now()): number[] {
  if (Math.abs(t - ledMemo.t) < 0.004) return ledMemo.v;
  ledMemo.t = t;
  return (ledMemo.v = ledNow(t));
}
function ledNow(t: number): number[] {
  syncKit(t);
  if (!live.on) return [0, 0, 0, 0];
  W = wiring();
  const K = Math.floor(cAt(t) / CLK_PER_FRAME), fs = clk.f / CLK_PER_FRAME;
  const n = fs > 40 ? 40 : 1, stride = Math.max(1, Math.round((fs * 0.02) / n));
  const acc = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const code = codeOf(K - 1 - i * stride, t, 0);
    for (let b = 0; b < live.bits; b++) acc[b] += (code >> (live.bits - 1 - b)) & 1;
  }
  return acc.map((a) => a / n);
}

/** Test hooks: a node's voltage now (wiring as on the bench), the clock count at t, and the time a count is reached. */
export function probe(node: KitNode, t: number) { W = wiring(); return emf(node, t); }
export const clocksNow = (t: number) => cAt(t);
export const clockTime = (c: number, near: number) => tOf(c, near);
