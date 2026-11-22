// Side menus of the TDS1002: what each of the five option buttons shows and does for the menu on
// screen. The screen renderer draws these; the 3D option buttons call their press().

import type { Source } from '../signals.ts';
import { usePce } from '../store.ts';
import { fmtDb, fmtF, fmtT, fmtV } from './format.ts';
import { clampFftCentre, fftAxis, measure, type Acq } from './model.ts';
import { MEAS_NAME, MEAS_TYPES, RECORD, type Channel, type Coupling, type ScopeState } from './state.ts';

/** Latest acquisition and what the probes are on (written by the instrument every refresh). */
export const scopeLive: { acq: Acq | null; src: [Source | null, Source | null]; undo: ScopeState | null } = { acq: null, src: [null, null], undo: null };

export interface MenuItem { title: string; value?: string; /** second line under the value */ more?: string; /** value in inverse video */ sel?: boolean; press?: () => void }
export interface MenuView { title: string; items: (MenuItem | null)[] }

const get = () => usePce.getState().scope;
const set = (p: Partial<ScopeState>) => usePce.getState().setScope(p);
export const scopeNote = (text: string, ms = 3500) => set({ note: { text, until: performance.now() + ms } });
const notSim = () => scopeNote('This function is not simulated');
const inert = (title: string, value?: string): MenuItem => ({ title, value, press: notSim });
const cycle = <T,>(list: readonly T[], cur: T): T => list[(list.indexOf(cur) + 1) % list.length];
export const sampleRate = (sc: ScopeState) => RECORD / (10 * sc.sdiv);
export const fftOn = (sc: ScopeState) => sc.math.on && sc.math.op === 'fft';

function channelMenu(sc: ScopeState, i: 0 | 1): MenuView {
  const c = sc.ch[i];
  const upd = (p: Partial<Channel>) => { const ch = [...get().ch] as [Channel, Channel]; ch[i] = { ...ch[i], ...p }; set({ ch }); };
  const probe = () => {
    const next = cycle([1, 10, 100] as const, c.probe), k = next / c.probe;
    upd({ probe: next, vdiv: c.vdiv * k });
    if (get().trig.source === i) set({ trig: { ...get().trig, level: get().trig.level * k } });
  };
  return {
    title: `CH${i + 1}`,
    items: [
      { title: 'Coupling', value: c.coupling === 'GND' ? 'Ground' : c.coupling, sel: true, press: () => upd({ coupling: cycle<Coupling>(['DC', 'AC', 'GND'], c.coupling) }) },
      { title: 'BW Limit', value: c.bwLimit ? 'On' : 'Off', more: c.bwLimit ? '20MHz' : '60MHz', press: () => upd({ bwLimit: !c.bwLimit }) },
      { title: 'Volts/Div', value: c.fine ? 'Fine' : 'Coarse', press: () => upd({ fine: !c.fine }) },
      { title: 'Probe', value: `${c.probe}X`, more: 'Voltage', press: probe },
      { title: 'Invert', value: c.invert ? 'On' : 'Off', press: () => upd({ invert: !c.invert }) },
    ],
  };
}

function mathMenu(sc: ScopeState): MenuView {
  const m = sc.math;
  const upd = (p: Partial<ScopeState['math']>) => set({ math: { ...get().math, ...p } });
  const op: MenuItem = { title: 'Operation', value: m.op === 'fft' ? 'FFT' : m.op === 'add' ? '+' : '-', sel: true, press: () => upd({ op: cycle(['fft', 'add', 'sub'] as const, m.op) }) };
  if (m.op !== 'fft') return { title: 'MATH', items: [op, { title: 'Sources', value: m.op === 'add' ? 'CH1+CH2' : 'CH1-CH2' }, null, null, null] };
  return {
    title: 'MATH',
    items: [
      op,
      { title: 'Source', value: `CH${m.source + 1}`, press: () => upd({ source: m.source ? 0 : 1 }) },
      { title: 'Window', value: m.window === 'hanning' ? 'Hanning' : m.window === 'flattop' ? 'Flattop' : 'Rectangular', press: () => upd({ window: cycle(['hanning', 'flattop', 'rect'] as const, m.window) }) },
      { title: 'FFT Zoom', value: `X${m.zoom}`, press: () => { const zoom = cycle([1, 2, 5, 10] as const, m.zoom); upd({ zoom, center: clampFftCentre(m.center, zoom) }); } },
      null,
    ],
  };
}

/** Cursor positions as readings of the cursor source (volts / seconds, or dB / hertz on the FFT). */
export function cursorReadout(sc: ScopeState): { c1: string; c2: string; delta: string; inv?: string } | null {
  const cu = sc.cursor;
  if (cu.type === 'off') return null;
  if (cu.source === 'math' && fftOn(sc)) {
    if (cu.type === 'v') {
      const a = (cu.a - sc.math.vpos) * 10, b = (cu.b - sc.math.vpos) * 10;
      return { c1: fmtDb(a), c2: fmtDb(b), delta: fmtDb(Math.abs(a - b)) };
    }
    const ax = fftAxis(sc, sampleRate(sc));
    const a = ax.centre + cu.a * ax.hdiv, b = ax.centre + cu.b * ax.hdiv;
    return { c1: fmtF(a), c2: fmtF(b), delta: fmtF(Math.abs(a - b)) };
  }
  if (cu.type === 'v') {
    const c = sc.ch[cu.source === 'ch2' ? 1 : 0];
    const a = (cu.a - c.pos) * c.vdiv, b = (cu.b - c.pos) * c.vdiv;
    return { c1: fmtV(a), c2: fmtV(b), delta: fmtV(Math.abs(a - b)) };
  }
  const a = sc.hpos + cu.a * sc.sdiv, b = sc.hpos + cu.b * sc.sdiv, d = Math.abs(a - b);
  return { c1: fmtT(a), c2: fmtT(b), delta: fmtT(d), inv: d > 0 ? fmtF(1 / d) : undefined };
}

function cursorMenu(sc: ScopeState): MenuView {
  const cu = sc.cursor;
  const fft = cu.source === 'math' && fftOn(sc);
  const upd = (p: Partial<ScopeState['cursor']>) => set({ cursor: { ...get().cursor, ...p } });
  const r = cursorReadout(sc);
  const sources = (['ch1', 'ch2', ...(fftOn(sc) ? ['math'] : [])]) as ScopeState['cursor']['source'][];
  return {
    title: 'CURSOR',
    items: [
      { title: 'Type', value: cu.type === 'off' ? 'Off' : cu.type === 'v' ? (fft ? 'Magnitude' : 'Voltage') : fft ? 'Frequency' : 'Time', sel: true, press: () => upd({ type: cycle(['off', 'v', 't'] as const, cu.type) }) },
      { title: 'Source', value: cu.source === 'math' ? 'MATH' : cu.source.toUpperCase(), sel: true, press: () => upd({ source: cycle(sources, cu.source) }) },
      r ? { title: 'Delta', value: r.delta, more: r.inv } : null,
      r ? { title: 'Cursor 1', value: r.c1 } : null,
      r ? { title: 'Cursor 2', value: r.c2 } : null,
    ],
  };
}

/** One automatic measurement as the screen prints it ("1.000kHz", "2.04V", "?" when it cannot be taken). */
export function measText(sc: ScopeState, slot: number): string {
  const m = sc.meas[slot], a = scopeLive.acq;
  if (m.type === 'none') return '';
  const r = a && sc.ch[m.source].on ? measure(a, m.source, m.type, sc.ch[m.source]) : null;
  if (!r) return '?';
  const text = m.type === 'freq' ? fmtF(r.value) : m.type === 'period' ? fmtT(r.value) : fmtV(r.value);
  return r.unsure ? `${text}?` : text;
}

function measureMenu(sc: ScopeState): MenuView {
  const edit = sc.measEdit;
  const upd = (i: number, p: Partial<ScopeState['meas'][number]>) => set({ meas: get().meas.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  if (edit !== null) {
    const m = sc.meas[edit];
    return {
      title: `Measure ${edit + 1}`,
      items: [
        { title: 'Source', value: `CH${m.source + 1}`, sel: true, press: () => upd(edit, { source: m.source ? 0 : 1 }) },
        { title: 'Type', value: MEAS_NAME[m.type], sel: true, press: () => upd(edit, { type: cycle(MEAS_TYPES, m.type) }) },
        null,
        m.type === 'none' ? null : { title: 'Value', value: measText(sc, edit) },
        { title: 'Back', press: () => set({ measEdit: null }) },
      ],
    };
  }
  return {
    title: 'MEASURE',
    items: sc.meas.map((m, i): MenuItem => ({ title: `CH${m.source + 1}`, value: MEAS_NAME[m.type], more: measText(sc, i), press: () => set({ measEdit: i }) })),
  };
}

function simpleMenu(sc: ScopeState): MenuView {
  const t = sc.trig;
  const trig = (p: Partial<ScopeState['trig']>) => set({ trig: { ...get().trig, ...p } });
  switch (sc.menu) {
    case 'display': return {
      title: 'DISPLAY',
      items: [
        { title: 'Type', value: sc.dots ? 'Dots' : 'Vectors', press: () => set({ dots: !sc.dots }) },
        inert('Persist', 'Off'),
        { title: 'Format', value: sc.xy ? 'XY' : 'YT', sel: true, press: () => set({ xy: !sc.xy }) },
        { title: 'Contrast', value: 'Increase', press: () => set({ contrast: Math.min(1, sc.contrast + 0.1) }) },
        { title: 'Contrast', value: 'Decrease', press: () => set({ contrast: Math.max(0, sc.contrast - 0.1) }) },
      ],
    };
    case 'trigger': return {
      title: 'TRIGGER',
      items: [
        inert('Type', 'Edge'),
        { title: 'Source', value: `CH${t.source + 1}`, sel: true, press: () => trig({ source: t.source ? 0 : 1 }) },
        { title: 'Slope', value: t.slope === 'rise' ? 'Rising' : 'Falling', press: () => trig({ slope: t.slope === 'rise' ? 'fall' : 'rise' }) },
        { title: 'Mode', value: t.mode === 'auto' ? 'Auto' : 'Normal', press: () => trig({ mode: t.mode === 'auto' ? 'normal' : 'auto' }) },
        inert('Coupling', 'DC'),
      ],
    };
    case 'acquire': return { title: 'ACQUIRE', items: [{ title: 'Sample', sel: true, value: ' ' }, inert('Peak Detect'), inert('Average'), inert('Averages', '16'), null] };
    case 'horiz': return { title: 'HORIZONTAL', items: [{ title: 'Main', sel: true, value: ' ' }, inert('Window Zone'), inert('Window'), inert('Trig Knob', 'Level'), null] };
    case 'utility': return { title: 'UTILITY', items: [inert('System', 'Status'), inert('Options'), inert('Do Self Cal'), inert('Error Log'), inert('Language', 'English')] };
    case 'save': return { title: 'SAVE/REC', items: [inert('Setups'), inert('Waveforms'), inert('Setup', '1'), inert('Save'), inert('Recall')] };
    case 'autoset': return {
      title: 'AUTOSET',
      items: [
        { title: 'Multi-cycle', value: 'sine', sel: true },
        null,
        { title: 'FFT', press: () => set({ math: { ...get().math, on: true, op: 'fft', source: t.source }, menu: 'math' }) },
        null,
        { title: 'Undo', value: 'Autoset', press: () => { if (scopeLive.undo) usePce.setState({ scope: scopeLive.undo }); scopeLive.undo = null; } },
      ],
    };
    default: return { title: '', items: [null, null, null, null, null] };
  }
}

/** The menu now on screen. */
export function menuView(sc: ScopeState): MenuView {
  switch (sc.menu) {
    case 'ch1': return channelMenu(sc, 0);
    case 'ch2': return channelMenu(sc, 1);
    case 'math': return mathMenu(sc);
    case 'cursor': return cursorMenu(sc);
    case 'measure': return measureMenu(sc);
    default: return simpleMenu(sc);
  }
}

/** The POSITION knobs move the cursors while the CURSOR menu is on screen with cursors switched on. */
export const knobsMoveCursors = (sc: ScopeState) => sc.menu === 'cursor' && sc.cursor.type !== 'off';
