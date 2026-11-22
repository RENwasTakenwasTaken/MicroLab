// Electrical model of the AM trainer. Every terminal voltage is a function of time worked out from
// the kit's controls and from what the patch cords and probe clips connect, so the oscilloscope
// shows what this wiring would really give (a missing link, a shorted output, a probe with no ground).
//
// Balanced modulator (MC1496): output = -(v(MOD I/P) + v(RF LINK)) x carrier / 1 V. With RF LINK on
// the -1 V pin that is (1 - em) x carrier: AM with full carrier, m = Em(peak) / 1 V, and the envelope
// is largest at the negative peak of the modulating signal, as on the real kit. Without the link the
// carrier term goes and DSB-SC is left.

import type { PcePlug } from '../kit.ts';
import { kitPowered, usePce, type Knobs } from '../store.ts';
import { SG, now, solveWiring, type Source, type Wiring } from '../wiring.ts';
import { Osc } from '../osc.ts';
import { PIN, PINS } from './layout.ts';

/**
 * What the controls really give. The printed scales are approximate, as on the trainer: the dials read
 * a few percent off, and the RF output falls as the frequency goes up. Set values with the oscilloscope.
 */
export function kitValues(k: Knobs) {
  const fm = (300 + 3100 * k.agFreq) * 1.03;
  const em = 5 * k.agAmp * 0.96;
  const fc = (400 + 600 * k.rfFreq) * 988;
  const ec = 10 * k.rfAmp * 0.97 * (1 - (0.28 * (fc - 395e3)) / 593e3);
  return { /** modulating frequency, Hz */ fm, /** modulating amplitude, V peak to peak */ em, /** carrier frequency, Hz */ fc, /** carrier amplitude, V peak to peak */ ec };
}

const audio = new Osc(3e-4, 23);
const rf = new Osc(1.5e-4, 31);
/** Second harmonic of the RF oscillator (about -24 dB): the extra peak near 2 fc on the FFT. */
const H2 = 0.06;
/** Carrier that leaks through the modulator when it is balanced (about -38 dB). */
const LEAK = 0.012;
const live = { on: false, em: 0, ec: 0 };

/** Bring the oscillators up to date with the knobs and the power switch. Call before reading signals. */
export function syncKit(t = now()) {
  const s = usePce.getState();
  const v = kitValues(s.knobs);
  audio.set(v.fm, t);
  rf.set(v.fc, t);
  live.on = kitPowered(s);
  live.em = v.em / 2;
  live.ec = v.ec / 2;
  return { ...v, on: live.on, fmNow: audio.at(t), fcNow: rf.at(t) };
}

// ------------------------------------------------------------------ wiring
/** Source resistance of each driven node (ohms): decides who wins when two outputs are patched together. */
const RES: Record<string, number> = { GND: 0.01, P15: 1, M15: 1, RF: 50, AUDIO: 100, AM: 100, M1V: 1000 };
let cache: Wiring | null = null;
const NODES = PINS.map((p) => p.node as string);
const wiring = (plugs: Record<string, PcePlug> = usePce.getState().plugs) => (cache = solveWiring(plugs, NODES, (s) => PIN[s]?.node, RES, cache));

// ------------------------------------------------------------------ node voltages
/** The modulator's signal port is linear over the audio generator's whole range and saturates beyond about 7 V. */
const lim = (x: number) => x / Math.sqrt(Math.sqrt(1 + (x / 7) ** 4));
/** Set while the modulator output is being worked out, so a cord from AM O/P back to an input cannot loop. */
let inAm = false;
/** Set to read only the steady (DC) part of each node: what AC coupling removes. */
let dcOnly = false;

function emf(w: Wiring, node: string, t: number): number {
  if (!live.on) return 0;
  if (dcOnly && (node === 'AUDIO' || node === 'RF' || node === 'AM')) return 0;
  switch (node) {
    case 'AUDIO': return live.em * Math.sin(audio.phase(t));
    case 'RF': { const p = rf.phase(t); return live.ec * (Math.cos(p) + H2 * Math.cos(2 * p + 0.8)); }
    case 'M1V': return -1;
    case 'P15': return 15;
    case 'M15': return -15;
    case 'AM': {
      if (inAm) return 0;
      inAm = true;
      const car = vGroup(w, w.group.get('RF')!, t) ?? 0;
      const sig = (vGroup(w, w.group.get('MODIN')!, t) ?? 0) + (vGroup(w, w.group.get('LINK')!, t) ?? 0);
      inAm = false;
      return (LEAK - lim(sig)) * car;
    }
    default: return 0;
  }
}

/** Voltage of a group of joined nodes: its sources weighted by their conductance; null if nothing drives it. */
function vGroup(w: Wiring, g: number, t: number): number | null {
  const src = w.sources[g];
  if (!src.length) return null;
  if (src.length === 1) return emf(w, src[0], t);
  let num = 0, den = 0;
  for (const n of src) {
    if (n === 'AM' && inAm) continue;
    num += emf(w, n, t) / RES[n];
    den += 1 / RES[n];
  }
  return den ? num / den : null;
}

/** Signal at a probe tip, measured against the scope's ground. null: the tip is not on a pin. */
export function tipSource(ch: 0 | 1): Source | null {
  const plugs = usePce.getState().plugs;
  const at = plugs[ch ? 'ch2' : 'ch1'].attachedTo;
  if (!at || !PIN[at]) return null;
  const w = wiring(plugs);
  const g = w.group.get(PIN[at].node)!;
  const ref = w.group.get(SG)!;
  const grounded = w.sources[ref].length > 0;
  const nodes = [...w.sources[g], ...(grounded ? w.sources[ref] : [])];
  const am = nodes.includes('AM'), car = am || nodes.includes('RF'), aud = am || nodes.includes('AUDIO');
  const t0 = now();
  const fc = rf.at(t0), fm = audio.at(t0);
  if (!grounded) {
    // no ground lead on the kit: the probe picks up mains hum and only a trace of the signal
    const ph = ch * 1.3;
    return {
      v: (t) => 0.07 * (vGroup(w, g, t) ?? 0) + 0.11 * Math.sin(2 * Math.PI * 50 * t + ph) + 0.03 * Math.sin(2 * Math.PI * 150 * t + 2 * ph),
      fFast: live.on && car ? fc : 50, fSlow: 50, dc: 0, grounded,
    };
  }
  const same = g === ref;
  dcOnly = true;
  const dc = same ? 0 : (vGroup(w, g, t0) ?? 0) - (vGroup(w, ref, t0) ?? 0);
  dcOnly = false;
  return {
    v: same ? () => 0 : (t) => (vGroup(w, g, t) ?? 0) - (vGroup(w, ref, t) ?? 0),
    fFast: !live.on || same ? 0 : car ? fc : aud ? fm : 0,
    fSlow: !live.on || same ? 0 : aud ? fm : car ? fc : 0,
    dc, grounded,
  };
}

/** How the bench is wired, for the setup guide and the hints. */
export function circuit(plugs: Record<string, PcePlug> = usePce.getState().plugs) {
  const w = wiring(plugs);
  const same = (a: string, b: string) => w.group.get(a) === w.group.get(b);
  const on = (plug: string) => { const at = plugs[plug]?.attachedTo; return at && PIN[at] ? PIN[at].node : null; };
  return {
    /** RF LINK joined to the -1 V pin: carrier present (DSB-FC) */
    link: same('LINK', 'M1V'),
    /** SINE O/P patched to MOD I/P */
    mod: same('MODIN', 'AUDIO'),
    /** outputs or rails shorted to ground by a cord or a clip */
    shorts: ['AUDIO', 'RF', 'AM', 'M1V', 'P15', 'M15'].filter((n) => same(n, 'GND')),
    /** a probe ground clip sits on a kit ground */
    scopeGnd: same(SG, 'GND'),
    /** a probe ground clip sits somewhere, but not on ground */
    clipOffGnd: w.sources[w.group.get(SG)!].length > 0 && !same(SG, 'GND'),
    ch1: on('ch1'), ch2: on('ch2'),
  };
}

/** Modulation index the present settings give: Em(peak) over the 1 V the link adds. */
export const modIndex = (k: Knobs) => kitValues(k).em / 2;

/** For the oscilloscope's tooltip: what each channel is on, and whether the scope has a ground on the kit. */
export function scopeInfo() {
  const c = circuit();
  const plugs = usePce.getState().plugs;
  const on = (id: string) => { const at = plugs[id].attachedTo; return at ? PIN[at]?.label ?? null : null; };
  return { ch1: on('ch1'), ch2: on('ch2'), ground: c.scopeGnd ? 'ok' : c.clipOffGnd ? 'off' : 'none' } as const;
}
