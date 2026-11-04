// Electrical view of the board for the bench instruments. Every value is
// derived from the latest simulation frame / transition log — instruments
// therefore only show what the running firmware actually produces.

import { analyzer } from '../app/analyzer.ts';
import { useBench, type GenSettings } from '../app/bench.ts';
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
  const ph = (t * g.freq) % 1;
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

/** Rising-edge trigger point for a digital node: latest edge leaving half a screen of history after it. */
export function triggerTime(node: TestNode | null, now: number, span: number): number | null {
  if (!node || node.kind !== 'pin') return null;
  const { edges } = analyzer.edges(node.port, node.bit, now - span * 3, now - span / 2);
  for (let i = edges.length - 1; i >= 0; i--) if (edges[i].level === 1) return edges[i].t;
  return null;
}

export const plugNode = (plugId: string) => nodeOf(useBench.getState().plugs[plugId]?.attachedTo ?? null);
