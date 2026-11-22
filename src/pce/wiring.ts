// Which kit nodes the cords and leads join together. Shared by the kits' signal models: each one
// says which node a connector belongs to and how stiffly each driven node is held.

import type { PcePlug } from './kit.ts';

/** The oscilloscope's ground: the ground ends of both its leads meet in the instrument. */
export const SG = 'SG';
/** Bench time in seconds. */
export const now = () => performance.now() / 1000;

export interface Wiring {
  key: string;
  /** node -> index of the group of joined nodes it is in */
  group: Map<string, number>;
  /** driven nodes (those with a source resistance) in each group */
  sources: string[][];
}

/** What a scope channel is looking at. fFast / fSlow: the quickest and slowest periodic parts (Hz, 0 = steady). */
export interface Source { v(t: number): number; fFast: number; fSlow: number; /** steady part of the signal, V */ dc: number; grounded: boolean }

const scopeGround = (p: PcePlug) => p.kind === 'clip' || (p.kind === 'banana' && /^ch\dg$/.test(p.id));
const cordEnd = (p: PcePlug) => (p.kind === 'sleeve' || p.kind === 'banana') && p.id.endsWith(':a');

/**
 * Joins the nodes that patch cords connect, and ties the scope's ground to wherever its ground
 * clips / black plugs sit. nodeOf: the node of a connector, or undefined for one that is not on the kit.
 */
export function solveWiring(plugs: Record<string, PcePlug>, nodes: string[], nodeOf: (socket: string) => string | undefined, res: Record<string, number>, cache: Wiring | null): Wiring {
  const key = Object.values(plugs).map((p) => `${p.id}=${p.attachedTo ?? ''}`).join(';');
  if (cache?.key === key) return cache;
  const parent = new Map<string, string>();
  const find = (a: string): string => { const p = parent.get(a)!; if (p === a) return a; const r = find(p); parent.set(a, r); return r; };
  const join = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const n of [SG, ...nodes]) if (!parent.has(n)) parent.set(n, n);
  for (const p of Object.values(plugs)) {
    const here = p.attachedTo ? nodeOf(p.attachedTo) : undefined;
    if (!here) continue;
    if (scopeGround(p)) join(here, SG);
    if (cordEnd(p)) {
      const far = plugs[`${p.cable}:b`]?.attachedTo;
      const there = far ? nodeOf(far) : undefined;
      if (there) join(here, there);
    }
  }
  const index = new Map<string, number>(), group = new Map<string, number>();
  const sources: string[][] = [];
  for (const n of parent.keys()) {
    const r = find(n);
    if (!index.has(r)) { index.set(r, sources.length); sources.push([]); }
    const g = index.get(r)!;
    group.set(n, g);
    if (res[n] !== undefined) sources[g].push(n);
  }
  return { key, group, sources };
}
