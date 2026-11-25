// Sigma COM110M "Pulse Code Modulation/Demodulation Trainer": panel geometry measured on the lab's
// top-view photograph (pce-reference/expt4_pcm/photos/kit_top_COM110M.png, 1375 x 1025). The photo is
// close to square-on: the yellow plate spans x 79 to 1322 and y 35 to 976 px, and its DIP-14 bodies
// (19.3 mm) are about 85 px long, so the plate is taken as 285 x 216 mm. Positions below are kept in
// photo pixels (px(x, y)) so they can be checked against the photo; px() turns them into millimetres
// on the plate, x to the right and y towards the front edge, origin at the plate's top-left corner.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export const PANEL = { w: 285, h: 216 };
/** Wooden box (outside) and the acrylic cover in its black frame. */
export const BOX = { w: 333, d: 264, h: 92 };
export const ACRYLIC = { w: 301, d: 232, t: 3 };
/** Heights above the desk: panel surface, top of the acrylic, top of a socket, tip of a terminal pin. */
export const LEVEL = { panel: 76, acrylic: 88, sock: 94, pin: 97 };

const SX = (1322 - 79) / PANEL.w, SY = (976 - 35) / PANEL.h;
/** Photo pixel -> plate millimetres. */
export const px = (x: number, y: number): [number, number] => [(x - 79) / SX, (y - 35) / SY];
const X = (x: number) => (x - 79) / SX, Y = (y: number) => (y - 35) / SY;

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

export type BlockId = 'ag' | 'mod' | 'dem' | 'flt' | 'ps' | 'samp' | 'dc';
export const BLOCK_NAME: Record<BlockId, string> = {
  ag: 'Audio generator', mod: 'PCM modulator', dem: 'PCM demodulator', flt: 'Filter', ps: 'Power supply', samp: 'Sampling pulse generator', dc: 'DC source',
};
/** Printed block borders, mm: [block, x0, y0, x1, y1]. */
export const BLOCKS: [BlockId, number, number, number, number][] = [
  ['ag', X(85), Y(75), X(380), Y(740)], ['mod', X(380), Y(75), X(832), Y(740)], ['dem', X(832), Y(75), X(1295), Y(590)],
  ['flt', X(832), Y(590), X(1295), Y(738)], ['ps', X(85), Y(742), X(690), Y(950)], ['samp', X(690), Y(742), X(1030), Y(950)], ['dc', X(1030), Y(742), X(1295), Y(950)],
];

/**
 * Electrical nodes. Outputs: SINE (audio generator), SCLK (sampling clock), RAMP (the modulator's
 * staircase ramp), PCM, RAW (demodulator's raw data), FOUT (filter output), VDC (DC source), rails.
 * Inputs: MODIN (modulator input), PCMIN (demodulator input), RXIN (filter's Recvd I/P).
 */
export type KitNode = 'SINE' | 'SCLK' | 'RAMP' | 'PCM' | 'RAW' | 'FOUT' | 'VDC' | 'MODIN' | 'PCMIN' | 'RXIN' | 'P12' | 'M12' | 'P5' | 'M5' | 'GND';
export type TermKind = 'pin' | 'sock';
export interface TermDef { id: string; x: number; y: number; kind: TermKind; color?: string; label: string; block: BlockId; node: KitNode; info: string }

const YELLOW = '#e9c31d', RED = '#e0472e', BLACK = '#1a1b1d';
const term = (id: string, p: [number, number], kind: TermKind, label: string, node: KitNode, info: string, color?: string): TermDef =>
  ({ id, x: X(p[0]), y: Y(p[1]), kind, color, label, block: id.split('.')[0] as BlockId, node, info });
const GROUND = 'Ground pin. A probe ground clip goes here.';
const SOCK_GND = 'Ground socket of the supply. A crocodile clip cannot hold on a socket.';

export const TERMS: TermDef[] = [
  term('ag.out', [350, 300], 'pin', 'Sine O/P', 'SINE', 'Output of the audio generator (XR2206): a sine, 300 Hz to 3.4 kHz, 0 to 5 V peak-to-peak, with no DC. Joined to the yellow socket below it.'),
  term('ag.outs', [345, 350], 'sock', 'Sine O/P (socket)', 'SINE', 'The sine in a socket: patch it to MOD. I/P of the PCM modulator.', YELLOW),
  term('ag.gnd', [350, 550], 'pin', 'GND (audio)', 'GND', GROUND),
  term('mod.gnd', [407, 97], 'pin', 'GND (modulator)', 'GND', GROUND),
  term('mod.in', [410, 177], 'pin', 'MOD. I/P', 'MODIN', 'Input of the PCM modulator (741 buffer): the message to be sampled and coded. DC coupled, so the DC source works here too. Joined to the yellow socket below it.'),
  term('mod.ins', [405, 227], 'sock', 'MOD. I/P (socket)', 'MODIN', 'Modulator input in a socket: patch Sine O/P (or VAR DC) here.', YELLOW),
  term('mod.ramp', [517, 447], 'pin', 'RAMP', 'RAMP', 'Test point of the staircase ramp the comparator (527) compares the held sample with: a counter driving a resistor ladder (4040, resistors S, a to f). It climbs 8 steps (3 bit) or 16 steps (4 bit) once every sample.'),
  term('mod.out', [765, 110], 'pin', 'PCM O/P', 'PCM', 'PCM output (0 V / 5 V): one frame per sample, a long sync pulse, a start bit, the data bits (MSB first) and a stop bit. Joined to the yellow socket beside it.'),
  term('mod.outs', [807, 110], 'sock', 'PCM O/P (socket)', 'PCM', 'The PCM output in a socket: patch it to PCM I/P of the demodulator.', YELLOW),
  term('mod.gnd2', [810, 305], 'pin', 'GND (modulator)', 'GND', GROUND),
  term('dem.in', [890, 107], 'sock', 'PCM I/P', 'PCMIN', 'Input of the PCM demodulator. It finds the long sync pulse (2N2907, 560 pF), shifts the data bits in (4015) and latches each word (4042).', YELLOW),
  term('dem.raw', [1220, 520], 'pin', 'RAW DATA', 'RAW', 'Raw data: the received words through a resistor ladder (DAC), a staircase that holds each level for one sample. Patch it to Recvd I/P of the filter.'),
  term('dem.fout', [1220, 557], 'pin', 'Filter O/P', 'FOUT', 'The second pin beside RAW DATA, wired down to the GAIN stage of the filter: the filtered output, the message back again.'),
  term('flt.in', [870, 607], 'pin', 'Recvd I/P', 'RXIN', 'Input of the filter: a 741 buffer, two RC low-pass stages (6K8 with 1n5, 6K8 with 10n) and a gain stage set by GAIN.'),
  term('flt.gnd', [870, 705], 'pin', 'GND (filter input)', 'GND', GROUND),
  term('flt.gnd2', [1270, 700], 'pin', 'GND (filter)', 'GND', GROUND),
  term('samp.clk', [722, 760], 'pin', 'SAMP CLOCK', 'SCLK', 'Sampling pulse generator output (4011 oscillator), 0 V / 5 V. It clocks the modulator inside the kit; dividing it by 64 gives the sampling rate. FREQ and the SLOW/FAST switch set it.'),
  term('dc.out', [1080, 762], 'sock', 'VAR DC', 'VDC', 'Variable DC from the 100K pot, between the limits the two 100K presets set (about -2.5 V to +2.5 V here). Patch it to MOD. I/P in place of the sine.', RED),
  term('dc.gnd', [1080, 907], 'sock', 'GND (DC source)', 'GND', SOCK_GND, BLACK),
  term('ps.p12', [515, 767], 'sock', '+12 V', 'P12', 'Regulated +12 V (7812).', RED),
  term('ps.gnd1', [517, 852], 'sock', 'GND (supply)', 'GND', SOCK_GND, BLACK),
  term('ps.m12', [515, 935], 'sock', '-12 V', 'M12', 'Regulated -12 V (7912).', RED),
  term('ps.p5', [665, 767], 'sock', '+5 V', 'P5', 'Regulated +5 V (7805).', RED),
  term('ps.gnd2', [665, 850], 'sock', 'GND (supply)', 'GND', SOCK_GND, BLACK),
  term('ps.m5', [665, 935], 'sock', '-5 V', 'M5', 'Regulated -5 V (7905).', RED),
];
export const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t])) as Record<string, TermDef>;

/** Pots and presets the student turns (0 to 1). The two audio knobs have printed 270° scales. */
export interface KnobDef { id: string; x: number; y: number; name: string; info: string }
const kn = (id: string, p: [number, number], name: string, info: string): KnobDef => ({ id, x: X(p[0]), y: Y(p[1]), name, info });
export const KNOBS = {
  agAmp: kn('agAmp', [150, 658], 'AMPLITUDE (22KP)', 'Sets the sine amplitude. Printed scale 0 V to 5 V peak-to-peak.'),
  agFreq: kn('agFreq', [302, 658], 'FREQUENCY (100KP)', 'Sets the sine frequency. Printed scale 300 Hz to 3.4 kHz.'),
  dc: kn('dc', [1162, 880], '100K Pot (DC source)', 'Sets VAR DC, from about -2.5 V fully anticlockwise to +2.5 V fully clockwise.'),
  sampF: kn('sampF', [807, 770], 'FREQ preset (10K Pr.)', 'Trims the sampling pulse generator: about 0.8 MHz to 1.6 MHz on FAST (1.32 MHz on the lab\'s kit).'),
  gain: kn('gain', [1240, 645], 'GAIN preset (47K Pr.)', 'Sets the gain of the filter\'s last stage, about 1 to 3.'),
};
/** Toggle switches: BIT SELECT (S4: up 3 BIT, down 4 BIT) and SLOW / FAST of the sampling pulse generator. */
export const TOGGLES = {
  bit3: { x: X(440), y: Y(645) },
  slow: { x: X(990), y: Y(815) },
};
/** The word LEDs D1 (MSB) to D4 under the 4049 buffers. */
export const LEDS = [712, 737, 762, 787].map((x, i) => ({ n: i + 1, x: X(x), y: Y(680) }));

/** Mains toggle, green pilot lamp; the cord leaves over the left edge. */
export const POWER_SW = { x: X(162), y: Y(917) };
export const NEON = { x: X(272), y: Y(917) };
export const CORD_ENTRY = { x: X(110), y: Y(917) };
export const SCREWS: [number, number][] = ([[88, 44], [685, 44], [1282, 44], [88, 505], [1310, 502], [88, 965], [685, 965], [1307, 962]] as [number, number][]).map(([x, y]) => px(x, y));

export interface ChipDef { x: number; y: number; pins: 8 | 14 | 16; name: string }
const chip = (x: number, y: number, pins: 8 | 14 | 16, name: string): ChipDef => ({ x: X(x), y: Y(y), pins, name });
export const CHIPS: ChipDef[] = [
  chip(237, 225, 16, 'XR2206'), chip(220, 470, 8, '356'),
  chip(477, 192, 8, '741'), chip(590, 190, 14, '4066'), chip(742, 187, 14, '4011'),
  chip(467, 375, 14, '527'), chip(590, 372, 16, '4042'), chip(742, 372, 16, '4021'),
  chip(462, 540, 14, '4081'), chip(740, 540, 16, '4049'), chip(590, 630, 16, '4040'),
  chip(1072, 145, 14, '4013'), chip(1202, 142, 14, '4081'), chip(922, 305, 8, '3140'),
  chip(1070, 302, 16, '4015'), chip(1222, 302, 16, '4040'), chip(1080, 427, 16, '4042'), chip(1215, 427, 14, '4011'), chip(927, 482, 14, '4011'),
  chip(932, 655, 8, '741'), chip(1055, 655, 8, '741'), chip(1172, 655, 8, '741'),
  chip(835, 855, 14, '4011'),
];
/** Q1 of the demodulator's sync detector: a 2N2907 in a metal can. */
export const Q1 = { x: X(937), y: Y(172) };

export type PartKind = 'elcoL' | 'elcoS' | 'preset' | 'res' | 'cap' | 'film' | 'filmRed' | 'filmGreen' | 'blueCap' | 'diode';
export interface PartDef { k: PartKind; x: number; y: number; r?: number }
const at = (k: PartKind, pts: [number, number][], r?: number): PartDef[] => pts.map(([x, y]) => ({ k, x: X(x), y: Y(y), r }));
export const PARTS: PartDef[] = [
  ...at('preset', [[107, 119], [200, 117], [347, 220], [172, 345], [305, 460], [1012, 520], [1080, 837], [1245, 840]]),
  ...at('elcoS', [[275, 155], [305, 380], [482, 812], [477, 887], [627, 810], [625, 887]]),
  ...at('elcoL', [[357, 820], [357, 895]]),
  ...at('blueCap', [[240, 365], [712, 905]]),
  ...at('res', [[117, 375], [440, 250], [472, 250], [532, 290], [457, 440], [610, 457], [582, 522], [607, 522], [630, 522], [650, 522], [670, 592],
    [712, 615], [737, 615], [762, 615], [787, 615], [875, 150], [982, 150], [1007, 125], [880, 300], [970, 300], [867, 380], [952, 395],
    [1040, 500], [1065, 500], [1115, 500], [1170, 500], [1135, 555], [1005, 625], [1115, 630], [850, 905], [935, 880]], 90),
  ...at('res', [[200, 160], [150, 565], [737, 277], [1185, 700], [905, 770], [895, 555], [925, 575]]),
  ...at('cap', [[490, 117], [515, 655], [625, 460], [945, 532], [955, 225], [1210, 742]]),
  ...at('filmRed', [[1025, 687]]), ...at('filmGreen', [[1135, 692]]),
  { k: 'diode', x: X(230), y: Y(780), r: -45 }, { k: 'diode', x: X(290), y: Y(780), r: 45 }, { k: 'diode', x: X(230), y: Y(837), r: 45 }, { k: 'diode', x: X(290), y: Y(837), r: -45 },
];
