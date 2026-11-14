// Electrical view of the board for the bench instruments. Every value is
// derived from the latest simulation frame / transition log — instruments
// therefore only show what the running firmware actually produces.

import { analyzer } from '../app/analyzer.ts';
import { useBench, type GenSettings, type ScopeCoupling } from '../app/bench.ts';
import { useLab } from '../app/store.ts';
import type { PicBoardConfig } from '../sim/board/types.ts';
import type { FrameData } from '../sim/protocol.ts';
import { SOCKET, type TestNode } from './world.ts';

const VDD = 5;
const AN_PINS: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 5], [4, 0], [4, 1], [4, 2], [1, 2], [1, 3], [1, 1], [1, 4], [1, 0]];

export function nodeOf(socketId: string | null): TestNode | null {
  return socketId ? SOCKET[socketId]?.node ?? null : null;
}

/** Analog source driving an input pin (pot / LM35 through the ANALOG INP DIP), if any. */
function analogSource(f: FrameData, port: number, bit: number): number | null {
  if (f.board.kind !== 'pic') return null;
  const cfg = useLab.getState().boardCfg as PicBoardConfig;
  const ch = AN_PINS.findIndex(([p, b]) => p === port && b === bit);
  if (ch < 0) return null;
  if (cfg.dips.analog[0] && ch === cfg.assumptions.potChannel) return f.board.potVolts;
  if (cfg.dips.analog[1] && ch === cfg.assumptions.lm35Channel) return f.board.lm35Volts;
  return null;
}

/** Average (DC) voltage of a node — what a DMM on DC volts shows. */
export function nodeDc(node: TestNode | null, f: FrameData | null, gen: GenSettings): number | null {
  if (!node) return null;
  if (node.kind === 'gen') return gen.on && gen.wave === 'square' ? 0 : 0; // generator output is AC-coupled, 0 V mean
  if (!f || !f.board.power) return 0;
  if (node.kind === 'gnd') return 0;
  if (node.kind === 'vcc') return VDD;
  const p = f.ports[node.port];
  if (!p) return 0;
  const isOut = !((p.tris >> node.bit) & 1);
  if (isOut) return p.duty[node.bit] * VDD;
  const an = analogSource(f, node.port, node.bit);
  if (an !== null) return an;
  return ((p.level >> node.bit) & 1) * VDD;
}

export function nodeFreq(node: TestNode | null, f: FrameData | null, gen: GenSettings): number {
  if (!node) return 0;
  if (node.kind === 'gen') return gen.on ? gen.freq : 0;
  if (node.kind !== 'pin' || !f || !f.board.power) return 0;
  return f.ports[node.port]?.freq[node.bit] ?? 0;
}

export function genValue(g: GenSettings, t: number): number {
  if (!g.on) return 0;
  const ph = (((t * g.freq) % 1) + 1) % 1; // also for t < 0 (left half of a triggered screen)
  const a = g.amp / 2;
  if (g.wave === 'square') return ph < 0.5 ? a : -a;
  if (g.wave === 'triangle') return a * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
  return a * Math.sin(2 * Math.PI * ph);
}

export interface Trace { pts: { t: number; v: number }[]; kind: 'digital' | 'analog' | 'none' }

/** Waveform of a node over [t0, t1] (seconds, simulation time for board nodes). */
export function nodeTrace(node: TestNode | null, f: FrameData | null, g: GenSettings, t0: number, t1: number, genT0: number): Trace {
  if (!node) return { pts: [], kind: 'none' };
  if (node.kind === 'gen') {
    const pts = [];
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      pts.push({ t, v: genValue(g, t - genT0) });
    }
    return { pts, kind: 'analog' };
  }
  const dc = nodeDc(node, f, g) ?? 0;
  if (node.kind !== 'pin' || !f?.board.power) return { pts: [{ t: t0, v: dc }, { t: t1, v: dc }], kind: 'analog' };
  const p = f.ports[node.port];
  const isOut = p && !((p.tris >> node.bit) & 1);
  if (!isOut || p.freq[node.bit] === 0 && p.rate[node.bit] === 0) {
    const level = isOut ? ((p.level >> node.bit) & 1) * VDD : dc;
    return { pts: [{ t: t0, v: level }, { t: t1, v: level }], kind: 'analog' };
  }
  const { initial, edges } = analyzer.edges(node.port, node.bit, t0, t1);
  const pts = [{ t: t0, v: initial * VDD }];
  for (const e of edges) { pts.push({ t: e.t, v: pts[pts.length - 1].v }, { t: e.t, v: e.level * VDD }); }
  pts.push({ t: t1, v: pts[pts.length - 1].v });
  return { pts, kind: 'digital' };
}

// ------------------------------------------------------------- scope coupling
/**
 * TDS1000-series AC coupling: a series capacitor in the input, i.e. a high-pass filter whose
 * corner is about 10 Hz, so tau = 1 / (2 pi 10 Hz) = 15.9 ms. A 10 Hz square wave then shows as
 * spikes decaying back to 0 V; at 1 kHz it looks square but centred on 0 V.
 */
export const AC_TAU = 1 / (2 * Math.PI * 10);
/** History filtered before the visible window so the capacitor has settled (6 tau: 0.25 % left). */
const AC_PREROLL = 6 * AC_TAU;

type Pt = { t: number; v: number };

/**
 * High-pass (series capacitor) response to a piecewise-linear input, exact between points:
 * dy/dt = dx/dt - y / tau. Starts settled (capacitor charged to the first level, y = 0) and
 * returns the part from tStart on, with extra points along long exponential decays.
 */
function highPass(pts: Pt[], tau: number, tStart: number): Pt[] {
  if (!pts.length) return [];
  const all: Pt[] = [{ t: pts[0].t, v: 0 }];
  let y = 0;
  const maxStep = tau / 8;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t, dx = pts[i].v - pts[i - 1].v;
    if (dt <= 0) { y += dx; all.push({ t: pts[i].t, v: y }); continue; } // a step passes straight through
    const s = dx / dt;
    const n = dt > maxStep ? Math.min(48, Math.ceil(dt / maxStep)) : 1;
    const h = dt / n;
    for (let k = 1; k <= n; k++) {
      y = s * tau + (y - s * tau) * Math.exp(-h / tau);
      all.push({ t: pts[i - 1].t + k * h, v: y });
    }
  }
  const first = all.findIndex((p) => p.t >= tStart);
  if (first < 0) return [{ t: tStart, v: y }];
  const out = all.slice(first);
  if (first > 0 && out[0].t > tStart) {
    const a = all[first - 1], b = all[first];
    out.unshift({ t: tStart, v: a.v + ((b.v - a.v) * (tStart - a.t)) / (b.t - a.t || 1) });
  }
  return out;
}

/** Waveform of a node as shown by a scope channel with the given input coupling. */
export function coupledTrace(node: TestNode | null, f: FrameData | null, g: GenSettings, t0: number, t1: number, genT0: number, coupling: ScopeCoupling): Trace {
  if (coupling === 'GND') return { pts: [{ t: t0, v: 0 }, { t: t1, v: 0 }], kind: 'analog' }; // input grounded: 0 V reference
  if (coupling === 'DC' || !node) return nodeTrace(node, f, g, t0, t1, genT0);
  const flat0: Trace = { pts: [{ t: t0, v: 0 }, { t: t1, v: 0 }], kind: 'analog' };
  if (node.kind === 'gen') {
    if (!g.on) return flat0;
    // the generator output already has no DC; above ~200 Hz the 10 Hz high-pass changes it by < 0.2 %
    if (g.freq >= 200) return nodeTrace(node, f, g, t0, t1, genT0);
    const a = t0 - AC_PREROLL;
    const pts: Pt[] = [];
    if (g.wave === 'square') {
      // exact vertical edges every half period, so each step passes through the capacitor in full
      const half = 1 / g.freq / 2;
      let v = genValue(g, a - genT0);
      pts.push({ t: a, v });
      for (let k = Math.floor((a - genT0) / half) + 1; genT0 + k * half <= t1; k++) {
        const tb = genT0 + k * half, nv = genValue(g, tb - genT0 + half / 2);
        pts.push({ t: tb, v }, { t: tb, v: nv });
        v = nv;
      }
      pts.push({ t: t1, v });
    } else {
      const step = Math.max(Math.min(1 / g.freq / 64, (t1 - t0) / 400), (t1 - a) / 4000);
      for (let t = a; t <= t1 + step / 2; t += step) pts.push({ t, v: genValue(g, t - genT0) });
    }
    return { pts: highPass(pts, AC_TAU, t0), kind: 'analog' };
  }
  const tr = nodeTrace(node, f, g, t0 - AC_PREROLL, t1, genT0);
  // a steady level (DC, a pin that is not switching, the pot / LM35) is blocked by the capacitor
  if (tr.kind !== 'digital') return flat0;
  return { pts: highPass(tr.pts, AC_TAU, t0), kind: 'analog' };
}

/** Peak-to-peak and RMS of a displayed trace (what MEASURE reads off the screen). */
export function traceStats(pts: Pt[]): { pkpk: number; rms: number } {
  if (pts.length < 2) return { pkpk: 0, rms: Math.abs(pts[0]?.v ?? 0) };
  let lo = Infinity, hi = -Infinity, sq = 0;
  for (let i = 0; i < pts.length; i++) {
    lo = Math.min(lo, pts[i].v); hi = Math.max(hi, pts[i].v);
    if (i) sq += ((pts[i].v ** 2 + pts[i - 1].v ** 2) / 2) * (pts[i].t - pts[i - 1].t);
  }
  const span = pts[pts.length - 1].t - pts[0].t;
  return { pkpk: hi - lo, rms: span > 0 ? Math.sqrt(sq / span) : 0 };
}

/** Rising-edge trigger point for a digital node: latest edge leaving half a screen of history after it. */
export function triggerTime(node: TestNode | null, now: number, span: number): number | null {
  if (!node || node.kind !== 'pin') return null;
  const { edges } = analyzer.edges(node.port, node.bit, now - span * 3, now - span / 2);
  for (let i = edges.length - 1; i >= 0; i--) if (edges[i].level === 1) return edges[i].t;
  return null;
}

export const plugNode = (plugId: string) => nodeOf(useBench.getState().plugs[plugId]?.attachedTo ?? null);
