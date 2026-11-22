// Acquisition engine of the TDS1002 model: edge trigger, a 2500-point record sampled at the rate the
// time base gives (so aliasing happens as on the instrument), 8-bit conversion, automatic
// measurements read off the record, and the FFT of its centre 2048 points.

import type { Source } from '../signals.ts';
import { RECORD, SDIV_STEPS, VDIV_STEPS, type Channel, type FftWindow, type MeasType, type ScopeState } from './state.ts';

export interface Spectrum { /** dB re 1 V RMS per bin, DC to just below Nyquist */ db: Float32Array; /** sample rate, Hz */ fs: number }
export interface Acq {
  /** time of the first sample and the sample interval (s) */
  t0: number; dt: number;
  /** displayed volts per sample; null: nothing connected to that input */
  ch: [Float32Array | null, Float32Array | null];
  triggered: boolean;
  /** frequency of the trigger source (Hz), 0 if it is steady */
  trigFreq: number;
  seq: number;
  spec: Partial<Record<string, Spectrum>>;
}

/** Signal as the channel shows it: coupling, the Probe setting (the lab probes are 1X) and Invert applied. */
export function conditioned(c: Channel, src: Source | null): ((t: number) => number) | null {
  if (!src) return null;
  if (c.coupling === 'GND') return () => 0;
  const k = c.probe * (c.invert ? -1 : 1);
  const dc = c.coupling === 'AC' ? src.dc : 0;
  return (t) => (src.v(t) - dc) * k;
}

/** Latest crossing of the level before tEnd, or null when the signal never crosses it. */
function findTrigger(sig: (t: number) => number, src: Source, level: number, rising: boolean, tEnd: number): number | null {
  if (!src.fFast || !src.fSlow) return null;
  const span = Math.min(1.6 / src.fSlow, 0.4);
  let step = 1 / (src.fFast * 20);
  let n = Math.ceil(span / step);
  if (n > 40000) { n = 40000; step = span / n; }
  let tb = tEnd, vb = sig(tb) - level;
  for (let i = 1; i <= n; i++) {
    const ta = tEnd - i * step, va = sig(ta) - level;
    if (rising ? va < 0 && vb >= 0 : va > 0 && vb <= 0) {
      let lo = ta, hi = tb;
      for (let j = 0; j < 20; j++) {
        const m = (lo + hi) / 2, vm = sig(m) - level;
        if (rising ? vm < 0 : vm > 0) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    }
    tb = ta; vb = va;
  }
  return null;
}

let seq = 0;
/** Roughly gaussian, sigma 1. */
const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

/**
 * One acquisition ending at tNow. Auto mode free-runs when nothing triggers (the trace then drifts);
 * Normal mode keeps the previous record and waits.
 */
export function acquire(sc: ScopeState, src: [Source | null, Source | null], tNow: number, prev: Acq | null): Acq {
  const span = sc.sdiv * 10, dt = span / RECORD;
  const sig = [conditioned(sc.ch[0], src[0]), conditioned(sc.ch[1], src[1])];
  const ts = sig[sc.trig.source], tsrc = src[sc.trig.source];
  const last = tNow - span / 2 - Math.max(0, sc.hpos);
  const tTrig = ts && tsrc && sc.ch[sc.trig.source].coupling !== 'GND' ? findTrigger(ts, tsrc, sc.trig.level, sc.trig.slope === 'rise', last) : null;
  if (tTrig === null && sc.trig.mode === 'normal' && prev) return prev;
  const t0 = (tTrig ?? last) + sc.hpos - span / 2;
  const ch = sig.map((f, i) => {
    if (!f) return null;
    const c = sc.ch[i], out = new Float32Array(RECORD);
    for (let n = 0; n < RECORD; n++) {
      // 8-bit converter: 25 levels per division over 10.24 divisions, with about one level of noise
      let d = f(t0 + n * dt) / c.vdiv + c.pos + noise() * 0.014;
      d = Math.round(Math.max(-5.12, Math.min(5.12, d)) * 25) / 25;
      out[n] = (d - c.pos) * c.vdiv;
    }
    return out;
  }) as Acq['ch'];
  return { t0, dt, ch, triggered: tTrig !== null, trigFreq: tTrig !== null && tsrc ? tsrc.fFast : 0, seq: ++seq, spec: {} };
}

// ------------------------------------------------------------------ measurements
export interface Reading { value: number; /** shown with a question mark: clipped, or too few cycles */ unsure: boolean }

/** Rising crossings of the mid level (with hysteresis), as sample positions. */
function crossings(v: Float32Array, lo: number, hi: number): number[] {
  const mid = (lo + hi) / 2, h = (hi - lo) * 0.12, out: number[] = [];
  let below = v[0] < mid - h;
  for (let i = 1; i < v.length; i++) {
    if (below && v[i] > mid + h) {
      // walk back to where it passed the middle
      let j = i;
      while (j > 0 && v[j - 1] > mid) j--;
      const a = v[Math.max(0, j - 1)], b = v[j];
      out.push(j - 1 + (b !== a ? (mid - a) / (b - a) : 0));
      below = false;
    } else if (!below && v[i] < mid - h) below = true;
  }
  return out;
}

export function measure(a: Acq, source: 0 | 1, type: MeasType, c: Channel): Reading | null {
  const v = a.ch[source];
  if (!v || type === 'none') return null;
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (let i = 0; i < v.length; i++) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); sum += v[i]; }
  const top = (5.12 - c.pos) * c.vdiv, bot = (-5.12 - c.pos) * c.vdiv;
  const clipped = hi >= top - c.vdiv / 50 || lo <= bot + c.vdiv / 50;
  switch (type) {
    case 'min': return { value: lo, unsure: clipped };
    case 'max': return { value: hi, unsure: clipped };
    case 'pkpk': return { value: hi - lo, unsure: clipped };
    case 'mean': return { value: sum / v.length, unsure: clipped };
    default: {
      if (hi - lo < c.vdiv * 0.2) return null;
      const x = crossings(v, lo, hi);
      if (x.length < 2) return null;
      const period = ((x[x.length - 1] - x[0]) / (x.length - 1)) * a.dt;
      if (type === 'period') return { value: period, unsure: clipped };
      if (type === 'freq') return { value: 1 / period, unsure: clipped };
      let sq = 0, n = 0;
      for (let i = Math.ceil(x[0]); i < x[1]; i++) { sq += v[i] * v[i]; n++; }
      return n ? { value: Math.sqrt(sq / n), unsure: clipped } : null;
    }
  }
}

// ------------------------------------------------------------------ FFT
const FFT_N = 2048;
const WINDOWS = (() => {
  const make = (f: (x: number) => number) => {
    const w = new Float64Array(FFT_N);
    let sum = 0;
    for (let i = 0; i < FFT_N; i++) { w[i] = f((2 * Math.PI * i) / (FFT_N - 1)); sum += w[i]; }
    return { w, gain: sum / FFT_N };
  };
  return {
    rect: make(() => 1),
    hanning: make((x) => 0.5 - 0.5 * Math.cos(x)),
    flattop: make((x) => 0.21557895 - 0.41663158 * Math.cos(x) + 0.277263158 * Math.cos(2 * x) - 0.083578947 * Math.cos(3 * x) + 0.006947368 * Math.cos(4 * x)),
  } satisfies Record<FftWindow, { w: Float64Array; gain: number }>;
})();

function fftInPlace(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** FFT of the centre 2048 points of a channel's record, in dB relative to 1 V RMS (worked out once per record). */
export function spectrum(a: Acq, source: 0 | 1, win: FftWindow): Spectrum | null {
  const key = `${source}${win}`;
  if (a.spec[key]) return a.spec[key]!;
  const v = a.ch[source];
  if (!v) return null;
  const { w, gain } = WINDOWS[win];
  const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
  const start = (RECORD - FFT_N) >> 1;
  for (let i = 0; i < FFT_N; i++) re[i] = v[start + i] * w[i];
  fftInPlace(re, im);
  const db = new Float32Array(FFT_N / 2);
  const k = Math.SQRT2 / (FFT_N * gain);
  for (let i = 0; i < FFT_N / 2; i++) db[i] = 20 * Math.log10(Math.max(1e-7, Math.hypot(re[i], im[i]) * k));
  return (a.spec[key] = { db, fs: 1 / a.dt });
}

/** FFT display: hertz per division and the frequencies at the centre line and the left edge. */
export function fftAxis(sc: ScopeState, fs: number) {
  const hdiv = fs / 2 / 10 / sc.math.zoom;
  const centre = (sc.math.center * fs) / 2;
  return { hdiv, centre, left: centre - 5 * hdiv };
}
/** Keep the zoomed FFT window inside DC .. Nyquist. */
export const clampFftCentre = (center: number, zoom: number) => Math.min(1 - 0.5 / zoom, Math.max(0.5 / zoom, center));

// ------------------------------------------------------------------ AUTOSET, SET TO 50%
const nearest = (arr: number[], v: number) => arr.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a));

function range(f: (t: number) => number, s: Source, tNow: number) {
  const w = s.fSlow ? Math.min(2 / s.fSlow, 0.2) : 1e-3;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 1500; i++) { const v = f(tNow - w * ((i * 0.6180339887) % 1)); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { lo, hi };
}

/** Middle of the trigger source's swing: where SET TO 50% puts the trigger level. */
export function halfLevel(sc: ScopeState, src: [Source | null, Source | null], tNow: number): number | null {
  const s = src[sc.trig.source], f = conditioned(sc.ch[sc.trig.source], s);
  if (!s || !f) return null;
  const r = range(f, s, tNow);
  return (r.lo + r.hi) / 2;
}

/**
 * AUTOSET: fits the displayed channels vertically (CH1 above CH2 when both are on), triggers on the
 * first one that has a signal and shows two or three cycles of it. On an AM wave that means carrier
 * cycles: turn SEC/DIV afterwards to see the envelope.
 */
export function autoset(sc: ScopeState, src: [Source | null, Source | null], tNow: number): Partial<ScopeState> {
  const live = sc.ch.map((c, i) => c.on && !!src[i]);
  const both = live[0] && live[1];
  const ch = sc.ch.map((c, i): Channel => {
    const s = src[i];
    if (!c.on || !s) return c;
    const dc: Channel = { ...c, coupling: c.coupling === 'GND' ? 'DC' : c.coupling, fine: false };
    const { lo, hi } = range(conditioned(dc, s)!, s, tNow);
    const want = Math.max(hi - lo, 1e-3) / (both ? 2.8 : 5);
    const vdiv = VDIV_STEPS.map((v) => v * c.probe).find((v) => v >= want) ?? 5 * c.probe;
    const target = both ? (i ? -2 : 2) : 0;
    return { ...dc, vdiv, pos: Math.round((target - (lo + hi) / 2 / vdiv) * 25) / 25 };
  }) as [Channel, Channel];
  const t = (live[0] ? 0 : live[1] ? 1 : sc.trig.source) as 0 | 1;
  const s = src[t];
  let level = 0, sdiv = sc.sdiv;
  if (s) {
    const r = range(conditioned(ch[t], s)!, s, tNow);
    level = (r.lo + r.hi) / 2;
    if (s.fFast) sdiv = nearest(SDIV_STEPS, 0.25 / s.fFast);
  }
  return {
    ch, sdiv, hpos: 0, run: true, single: false, xy: false, menu: 'autoset',
    trig: { source: t, slope: 'rise', level, mode: 'auto' }, math: { ...sc.math, on: false },
  };
}
