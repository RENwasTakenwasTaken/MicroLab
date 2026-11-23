// Bench state of the PCE lab: what is plugged where, the kit's controls and the oscilloscope's
// front panel. The signal model (signals.ts) and the 3D scene both read it; nothing here depends
// on the microcontroller simulator of the EP lab.

import { create } from 'zustand';
import { DESK_Y } from '../lab3d/world.ts';
import { AM_BENCH } from './am/bench.ts';
import { FM_BENCH } from './fm/bench.ts';
import { PAM_BENCH } from './pam/bench.ts';
import { LC_BENCH } from './lc/bench.ts';
import type { KitBench, KitId, PcePlug, V3 } from './kit.ts';
import { SOCKET, dist, useSockets } from './world.ts';
import { initialScope, type ScopeState } from './scope/state.ts';

export type { PcePlug, PlugKind } from './kit.ts';
export type PceView = 'lab' | 'kit' | 'top' | 'scope' | 'dmm';
export type Knobs = Record<string, number>;
/** MECO 801 multimeter: POWER, the rotary function switch and SELECT (AC / DC on the volts and current positions). */
export type DmmMode = 'V' | 'OHM' | 'HZ' | 'UA' | 'MA' | 'A' | 'TEMP';
export const DMM_MODES: DmmMode[] = ['V', 'OHM', 'HZ', 'UA', 'MA', 'A', 'TEMP'];
export interface DmmState { on: boolean; mode: DmmMode; ac: boolean }

export const BENCH: Record<KitId, KitBench> = { am: AM_BENCH, fm: FM_BENCH, pam: PAM_BENCH, lc: LC_BENCH };
/** Which kit each experiment puts on the bench. */
export const KIT_OF: Record<string, KitId> = { am: 'am', fm: 'fm', pam: 'pam', lc: 'lc' };
/** A probe's ground lead reaches this far from its tip. */
export const GND_LEAD = 120;
/** Banana plugs stack: this many fit one socket. */
const STACK = 3;

const Y = DESK_Y + 3;

interface PceState {
  /** the trainer on the bench */
  kit: KitId;
  plugs: Record<string, PcePlug>;
  carrying: string | null;
  snap: string | null;
  view: PceView;
  viewNonce: number;
  /** the kit's mains toggle (the kit is powered only with its plug in the wall socket too) */
  powerSw: boolean;
  /** pot positions, 0 (fully anticlockwise) to 1 */
  knobs: Knobs;
  scope: ScopeState;
  dmm: DmmState;
  toast: { text: string; kind: 'ok' | 'err' | 'info'; at: number; ms: number } | null;
  setView(v: PceView): void;
  setKnob(id: string, v: number): void;
  setPowerSw(on: boolean): void;
  setScope(p: Partial<ScopeState>): void;
  setDmm(p: Partial<DmmState>): void;
  pick(id: string): void;
  attach(id: string, socket: string): boolean;
  drop(at: V3): void;
  notify(text: string, kind?: 'ok' | 'err' | 'info', ms?: number): void;
}

const other = (id: string) => (id.endsWith(':a') ? `${id.slice(0, -1)}b` : `${id.slice(0, -1)}a`);
const where = (p: PcePlug): V3 => (p.attachedTo ? SOCKET[p.attachedTo].pos : p.rest);

const name = (pin: string) => SOCKET[pin]?.label ?? pin;

/** The kit starts as the student finds it: switched off, unplugged, pots wherever the last batch left them. */
const initial = (kit: KitId) => ({
  kit, plugs: BENCH[kit].plugs(), carrying: null, snap: null, powerSw: false,
  knobs: { ...BENCH[kit].knobs }, scope: initialScope(), toast: null,
  dmm: { on: true, mode: 'V', ac: false } as DmmState,
});
useSockets(BENCH.am.sockets);

export const usePce = create<PceState>((set, get) => ({
  ...initial('am'),
  view: 'lab',
  viewNonce: 0,
  setView: (view) => set({ view, viewNonce: get().viewNonce + 1 }),
  setKnob: (id, v) => set({ knobs: { ...get().knobs, [id]: Math.min(1, Math.max(0, v)) } }),
  setScope: (p) => set({ scope: { ...get().scope, ...p } }),
  setDmm: (p) => set({ dmm: { ...get().dmm, ...p } }),
  notify: (text, kind = 'info', ms = 2800) => set({ toast: { text, kind, at: Date.now(), ms } }),
  setPowerSw(on) {
    set({ powerSw: on });
    const mains = get().plugs.mains.attachedTo === 'wall';
    if (on && !mains) get().notify('The kit is switched ON, but its mains plug is not in the wall socket', 'info', 4000);
    else get().notify(on ? 'Kit power ON: the pilot lamp lights' : 'Kit power OFF', on ? 'ok' : 'info');
  },
  pick(id) {
    const plugs = { ...get().plugs };
    const p = plugs[id];
    if (!p) return;
    const was = p.attachedTo;
    plugs[id] = { ...p, attachedTo: null };
    set({ plugs, carrying: id });
    if (p.kind === 'ac' && was) get().notify('Mains plug pulled out: the kit has no power', 'info');
  },
  attach(id, socket) {
    const plugs = { ...get().plugs };
    const p = plugs[id];
    const s = SOCKET[socket];
    if (!p || !s) return false;
    const fail = (msg: string) => { get().notify(msg, 'err', 3600); return false; };
    const wants = p.kind === 'ac' ? 'ac' : p.kind === 'banana' ? 'jack' : 'pin';
    if (wants !== s.kind) return fail(`${p.label} does not fit ${s.label}`);
    const here = Object.values(plugs).filter((q) => q.attachedTo === socket && q.id !== id);
    if (p.kind === 'banana') {
      if (here.length >= STACK) return fail(`${name(socket)} already has ${STACK} plugs stacked in it`);
    } else if (p.kind === 'clip') {
      if (s.noClip) return fail(`A crocodile clip has nothing to hold on the ${name(socket)} socket: use a ground post or a ground pin`);
      if (here.some((q) => q.kind === 'sleeve')) return fail(`A cord's sleeve covers ${name(socket)}: clip the ground lead onto a free pin`);
      if (dist(where(plugs[p.cable]), s.pos) > GND_LEAD) return fail(`The ground lead does not reach ${name(socket)} from where the ${p.cable.toUpperCase()} probe is`);
    } else if (p.kind !== 'ac') {
      if (here.some((q) => q.kind === 'tip' || q.kind === 'sleeve')) return fail(`${name(socket)} already has something on it: use the pin beside it, or a free one`);
      if (p.kind === 'sleeve') {
        const far = plugs[other(id)];
        const reach = BENCH[get().kit].cords.find((c) => c.id === p.cable)!.reach;
        if (far.attachedTo && dist(SOCKET[far.attachedTo].pos, s.pos) > reach) return fail(`The short link only reaches a neighbouring pin: use a long cord from ${name(far.attachedTo)} to ${name(socket)}`);
      }
    }
    const seq = 1 + Math.max(0, ...Object.values(plugs).map((q) => q.seq ?? 0));
    plugs[id] = { ...p, attachedTo: socket, seq };
    let extra = '';
    if (p.kind === 'tip') {
      // the ground lead is short: it comes off when the probe moves out of its reach
      const clip = plugs[`${id}g`];
      if (clip.attachedTo && dist(SOCKET[clip.attachedTo].pos, s.pos) > GND_LEAD) {
        plugs[clip.id] = { ...clip, attachedTo: null, rest: [s.pos[0] + 40, Y, s.pos[2] + 70] };
        extra = ' · its ground clip came off: clip it to a GND pin near the probe';
      }
    }
    set({ plugs, carrying: null, snap: null });
    if (p.kind === 'ac') get().notify(get().powerSw || BENCH[get().kit].noSwitch ? 'Mains plug in: kit power ON' : 'Mains plug in the wall socket: now switch the kit ON with its own toggle', 'ok', 4200);
    else get().notify(`${p.label} → ${name(socket)}${extra}`, extra ? 'info' : 'ok', extra ? 4500 : 2200);
    return true;
  },
  drop(at) {
    const id = get().carrying;
    if (!id) return;
    const plugs = { ...get().plugs };
    plugs[id] = { ...plugs[id], attachedTo: null, rest: at };
    set({ plugs, carrying: null, snap: null });
  },
}));

/** A fresh bench for a new lab turn, with the kit of the given experiment on it. */
export function resetPceBench(expId?: string) {
  const kit = (expId && KIT_OF[expId]) || usePce.getState().kit;
  useSockets(BENCH[kit].sockets);
  usePce.setState({ ...initial(kit), view: 'lab', viewNonce: usePce.getState().viewNonce + 1 });
}

export const mainsIn = (s = usePce.getState()) => s.plugs.mains.attachedTo === 'wall';
/** The kit's supply rails are up: plug in the socket and the toggle ON. */
export const kitPowered = (s = usePce.getState()) => mainsIn(s) && (s.powerSw || !!BENCH[s.kit].noSwitch);
