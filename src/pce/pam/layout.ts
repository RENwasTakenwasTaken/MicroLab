// "Analog Sampling and Reconstruction Board" (PICT, Department of E&TC): audio generator, gating
// pulse generator, modulator (natural, sample-and-hold and flat-top outputs) and demodulator.
// Positions were read off the lab's top-view photograph, in its pixels (1319 x 989 for the panel).

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

/** The photograph the positions come from, the panel in millimetres, and the wooden box around it. */
export const PHOTO = { w: 1319, h: 989 };
export const SHEET = { w: 216, h: 162 };
export const BOX = { w: 252, d: 198, h: 78, wall: 14 };
/** Heights above the desk: panel surface, and the top of a banana socket. */
export const LEVEL = { panel: 70, jack: 83 };

/** Photo pixels -> millimetres on the panel. */
export const mm = (px: number, py: number): [number, number] => [(px / PHOTO.w) * SHEET.w, (py / PHOTO.h) * SHEET.h];
/** Photo pixels + height above the panel -> world coordinates. */
export function panelToWorld(px: number, py: number, h = 0): V3 {
  const [x, y] = mm(px, py);
  return [KIT_POS[0] + x - SHEET.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - SHEET.h / 2];
}

export type PamNode = 'MSG' | 'GATE' | 'MODMSG' | 'MODGATE' | 'NAT' | 'SH' | 'FLAT' | 'DEMIN' | 'DEMOUT' | 'GND';
export interface JackDef { id: string; x: number; y: number; label: string; node: PamNode; color: 'red' | 'yellow' | 'black'; info: string }
const GND = 'Ground. The black leads of the oscilloscope go to any of the black sockets.';
export const JACKS: JackDef[] = [
  { id: 'msg.out', x: 540, y: 150, color: 'red', node: 'MSG', label: 'Message Signal', info: 'Sine wave of the audio generator: the message. Set it with P1 (amplitude) and P2 (frequency).' },
  { id: 'ag.gnd', x: 580, y: 432, color: 'black', node: 'GND', label: 'GND (audio generator)', info: GND },
  { id: 'gate.out', x: 557, y: 597, color: 'red', node: 'GATE', label: 'Gating Pulse Signal', info: 'Rectangular pulses of the gating pulse generator: the sampling signal. P3 sets its frequency, P4 its pulse width.' },
  { id: 'gp.gnd', x: 588, y: 862, color: 'black', node: 'GND', label: 'GND (gating pulse generator)', info: GND },
  { id: 'mod.msg', x: 742, y: 152, color: 'yellow', node: 'MODMSG', label: 'Modulator: message input', info: 'Message input of the modulator. Patch the Message Signal to it.' },
  { id: 'mod.gate', x: 742, y: 308, color: 'yellow', node: 'MODGATE', label: 'Modulator: gating input', info: 'Sampling input of the modulator. Patch the Gating Pulse Signal to it.' },
  { id: 'mod.nat', x: 1130, y: 133, color: 'red', node: 'NAT', label: 'Natural Sampled Signal', info: 'The message, let through only while the gating pulse is high: the top of each pulse follows the message.' },
  { id: 'mod.sh', x: 1165, y: 222, color: 'red', node: 'SH', label: 'Sample & Hold Signal', info: 'The message sampled at the start of each pulse and held until the next: a staircase.' },
  { id: 'mod.flat', x: 1130, y: 297, color: 'red', node: 'FLAT', label: 'Flat top sampled Signal', info: 'Pulses whose flat tops stand at the value sampled at the start of each pulse.' },
  { id: 'mod.gnd', x: 1185, y: 408, color: 'black', node: 'GND', label: 'GND (modulator)', info: GND },
  { id: 'dem.in', x: 753, y: 603, color: 'yellow', node: 'DEMIN', label: 'Demodulator: Modulated Signal input', info: 'Input of the demodulator (a low-pass filter). Patch one of the sampled signals to it.' },
  { id: 'dem.out', x: 1115, y: 600, color: 'red', node: 'DEMOUT', label: 'Recovered message signal', info: 'Output of the reconstruction filter. It is the message again as long as the sampling frequency is more than twice the message frequency.' },
  { id: 'dem.gnd', x: 1180, y: 840, color: 'black', node: 'GND', label: 'GND (demodulator)', info: GND },
];
export const JACK = Object.fromEntries(JACKS.map((j) => [j.id, j])) as Record<string, JackDef>;

export interface PamKnob { id: string; x: number; y: number; tag: string; name: string; info: string }
export const KNOBS: PamKnob[] = [
  { id: 'p1', x: 205, y: 338, tag: 'P1', name: 'P1 Amplitude Adjust (0-5V)', info: 'Amplitude of the message signal.' },
  { id: 'p2', x: 432, y: 334, tag: 'P2', name: 'P2 Frequency Adjust (300Hz-3.4KHz)', info: 'Frequency of the message signal.' },
  { id: 'p3', x: 234, y: 788, tag: 'P3', name: 'P3 Frequency Adjust (2KHz-32KHz)', info: 'Frequency of the gating pulses: the sampling frequency.' },
  { id: 'p4', x: 440, y: 792, tag: 'P4', name: 'P4 Pulse Width Adjust', info: 'Width of the gating pulses. Set a 50 % duty cycle.' },
];
/** The pots turn 270 degrees. */
export const SWEEP = (135 * Math.PI) / 180;
