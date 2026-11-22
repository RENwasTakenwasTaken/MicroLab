// Kashtronica "FM MODEM" trainer: ICL8038 frequency modulator with buffer, a sine signal generator,
// an LM565 PLL demodulator and a low-pass filter, on a black panel with white printing and yellow
// 4 mm sockets. Positions were read off the lab's top-view photograph after flattening it, as
// percentages of the printed border (x to the right, y towards the front edge).

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

/** Black panel sheet (mm), the printed border inside it, and the wooden box. */
export const SHEET = { w: 270, h: 212, margin: 10 };
export const BOX = { w: 304, d: 246, h: 70, wall: 13 };
/** Heights above the desk: panel surface, and the top of a banana socket. */
export const LEVEL = { panel: 62, jack: 75 };

/** Border percentages -> millimetres on the sheet. */
export const mm = (px: number, py: number): [number, number] => [SHEET.margin + (px / 100) * (SHEET.w - 2 * SHEET.margin), SHEET.margin + (py / 100) * (SHEET.h - 2 * SHEET.margin)];
/** Border percentages + height above the panel -> world coordinates. */
export function panelToWorld(px: number, py: number, h = 0): V3 {
  const [x, y] = mm(px, py);
  return [KIT_POS[0] + x - SHEET.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - SHEET.h / 2];
}

export type FmNode = 'MODIN' | 'BIAS' | 'FM' | 'SIG' | 'PLLIN' | 'PLLOUT' | 'VCO' | 'FLTIN' | 'FLTOUT' | 'GND';
export interface JackDef { id: string; x: number; y: number; label: string; node: FmNode; info: string }
export const JACKS: JackDef[] = [
  { id: 'mod.in', x: 5.2, y: 25.5, label: 'Modulator input', node: 'MODIN', info: 'Modulating signal input of the 8038 modulator, through a capacitor. Patch the SIGNAL GEN output to it.' },
  { id: 'dc.bias', x: 5.5, y: 41, label: 'DC BIAS', node: 'BIAS', info: 'Control voltage that sets the carrier frequency. Measure it with the multimeter: 0.5 V more or less moves the carrier by about 5 kHz.' },
  { id: 'buf.out', x: 76.2, y: 25, label: 'BUFFER O/P', node: 'FM', info: 'Output of the modulator after the buffer: the carrier, frequency modulated once a signal is on the modulator input.' },
  { id: 'sg.out', x: 85.4, y: 49, label: 'SIGNAL GEN output', node: 'SIG', info: 'Sine wave of the signal generator: the modulating signal. Set it with AMPL. ADJ. and FREQ. ADJ.' },
  { id: 'pll.in', x: 7.3, y: 77.2, label: 'PLL I/P', node: 'PLLIN', info: 'Input of the PLL 565 demodulator, through a capacitor. Patch BUFFER O/P to it.' },
  { id: 'pll.out', x: 42.5, y: 78, label: 'PLL O/P', node: 'PLLOUT', info: 'Demodulated output of the PLL: the recovered signal on a DC level, with some carrier ripple. Patch it to the FILTER input.' },
  { id: 'pll.vco', x: 33.8, y: 90.8, label: 'PLL VCO output', node: 'VCO', info: 'Square wave of the PLL\'s own oscillator. With nothing on the PLL input it runs at its free-running frequency: set that to 50 kHz.' },
  { id: 'flt.in', x: 61, y: 68, label: 'FILTER I/P', node: 'FLTIN', info: 'Input of the low-pass filter.' },
  { id: 'flt.out', x: 84.5, y: 68, label: 'FILTER O/P', node: 'FLTOUT', info: 'Output of the low-pass filter: the recovered message signal.' },
  { id: 'gnd', x: 93.3, y: 76.5, label: 'GND', node: 'GND', info: 'Ground of the kit. The black leads of the oscilloscope and the multimeter go here; the plugs stack.' },
];
export const JACK = Object.fromEntries(JACKS.map((j) => [j.id, j])) as Record<string, JackDef>;

export interface FmKnob { id: string; x: number; y: number; name: string; info: string; style: 'cap' | 'shaft' }
export const KNOBS: FmKnob[] = [
  { id: 'modFreq', x: 6.8, y: 8, name: 'Modulator FREQ. ADJ.', style: 'cap', info: 'Sets the carrier frequency of the 8038 by changing its DC bias. Set 50 kHz, reading it on the oscilloscope.' },
  { id: 'sgAmp', x: 63.8, y: 47.5, name: 'Signal generator AMPL. ADJ.', style: 'shaft', info: 'Amplitude of the modulating signal.' },
  { id: 'sgFreq', x: 94.2, y: 49, name: 'Signal generator FREQ. ADJ.', style: 'cap', info: 'Frequency of the modulating signal.' },
  { id: 'pllFreq', x: 10.8, y: 66.5, name: 'PLL FREQ. ADJ.', style: 'cap', info: 'Free-running frequency of the PLL\'s oscillator. Set 50 kHz, reading the PLL VCO output on the oscilloscope with nothing on the PLL input.' },
];
/** The pots turn 270 degrees. */
export const SWEEP = (135 * Math.PI) / 180;
export const POWER_SW = { x: 51.2, y: 88 };
export const LED = { x: 57.3, y: 89 };
