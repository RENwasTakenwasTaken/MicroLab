// Sigma COM120L "Detection of digital baseband signal using matched filter": panel geometry measured
// on the lab's photograph after flattening it (the printed border mapped to 5 mm inside a 270 x 198
// plate, the size of the other Sigma panels). Millimetres on the yellow plate; x to the right and
// y towards the front edge, origin at the plate's top-left corner, lid hinge at the back.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export const PANEL = { w: 270, h: 198 };
/** Wooden box (outside) and the acrylic cover in its black frame. */
export const BOX = { w: 318, d: 246, h: 92 };
export const ACRYLIC = { w: 286, d: 214, t: 3 };
/** Heights above the desk: panel surface, top of the acrylic, top of a 2 mm socket, tip of a terminal pin. */
export const LEVEL = { panel: 76, acrylic: 88, sock: 94, pin: 97 };

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

export type BlockId = 'gen' | 'gn' | 'add' | 'mf' | 'cmp' | 'ps';
export const BLOCK_NAME: Record<BlockId, string> = {
  gen: 'Digital data generator', gn: 'Gaussian noise generator', add: 'Noise adder', mf: 'Integrate and dump filter (matched filter)', cmp: 'Comparator (decision device)', ps: 'Power supply',
};

/**
 * Electrical nodes. Outputs: CK, BK, NRZ (generator), GN (noise), NOISY (adder), RAW (integrator),
 * REC (comparator). Inputs that take a patch cord: ADD_IN, ADD_GN (adder), MF_IN, MF_BK (integrator).
 */
export type KitNode = 'CK' | 'BK' | 'NRZ' | 'GN' | 'ADD_IN' | 'ADD_GN' | 'NOISY' | 'MF_IN' | 'MF_BK' | 'RAW' | 'REC' | 'GND';
/** pin: hollow 2 mm rod standing through the cover · sock: coloured 2 mm socket (a probe tip or a cord goes in, a clip cannot hold) */
export type TermKind = 'pin' | 'sock';
export interface TermDef { id: string; x: number; y: number; kind: TermKind; color?: string; label: string; block: BlockId; node: KitNode; info: string }

const RED = '#d2362b', GREEN = '#2f9e57', BLACK = '#1a1b1d', BRASS = '#b8923a';
const term = (id: string, x: number, y: number, kind: TermKind, label: string, node: KitNode, info: string, color?: string): TermDef =>
  ({ id, x, y, kind, color, label, block: id.split('.')[0] as BlockId, node, info });
const GROUND = 'Ground pin. A probe ground clip goes here.';

export const TERMS: TermDef[] = [
  term('gen.ck', 68, 25.3, 'pin', 'CK', 'CK', 'Clock of the generator ("carrier clock" on the lab sheet), twice the bit rate.'),
  term('gen.bk', 81.4, 24.8, 'pin', 'BK', 'BK', 'Bit clock: one cycle for every bit, rising at the start of each bit. Measure its frequency: it is the bit rate. Patch it to BK of the integrate and dump filter.'),
  term('gen.nrzs', 109.5, 24, 'sock', 'NRZ (socket)', 'NRZ', 'The data word in a 2 mm socket: patch it to I/P of the noise adder. The same signal as the NRZ pin below.', RED),
  term('gen.nrz', 110, 56, 'pin', 'NRZ', 'NRZ', 'NRZ data, 0 V / 5 V: the eight switch bits one after the other, D8 (MSB) first, over and over.'),
  term('gen.gnd', 110, 62.5, 'pin', 'GND', 'GND', GROUND),
  term('gn.out', 198.6, 80.7, 'pin', 'Gaussian Noise', 'GN', 'Gaussian noise from the wiper of the AMPLITUDE pot: the same signal as the green socket beside it.'),
  term('gn.outs', 208, 80.5, 'sock', 'Gaussian Noise (socket)', 'GN', 'Gaussian noise output in a 2 mm socket: patch it to the Gaussian Noise input of the noise adder.', GREEN),
  term('gn.gnd', 207.7, 104.5, 'pin', 'GND', 'GND', GROUND),
  term('add.in', 222, 32.7, 'sock', 'I/P (data in)', 'ADD_IN', 'Data input of the noise adder (summing amplifier, 1 kΩ in).', RED),
  term('add.out', 247.7, 33, 'pin', 'Noisy signal', 'NOISY', 'Output of the noise adder: the data plus the noise. The op-amp is wired as an inverting summer, so the data comes out upside down.'),
  term('add.outs', 256, 32.8, 'sock', 'Noisy signal (socket)', 'NOISY', 'The noisy signal in a 2 mm socket: patch it to Noise Data of the integrate and dump filter.', GREEN),
  term('add.gn', 223.2, 80.6, 'sock', 'Gaussian Noise (adder input)', 'ADD_GN', 'Noise input of the noise adder (1 kΩ in).', GREEN),
  term('add.gnd', 255.5, 103.8, 'pin', 'GND', 'GND', GROUND),
  term('mf.in', 125, 141.8, 'sock', 'Noise Data', 'MF_IN', 'Input of the integrate and dump filter: patch the noisy signal here.', GREEN),
  term('mf.gnd', 124, 180.4, 'pin', 'GND', 'GND', GROUND),
  term('mf.bk', 173.5, 146.9, 'sock', 'BK (dump clock in)', 'MF_BK', 'Bit clock input: each rising edge fires the 4528 one-shot, which dumps (resets) the integrator at the start of every bit. Patch BK of the generator here.', BRASS),
  term('mf.raw', 208.6, 142.3, 'pin', 'Raw Data', 'RAW', 'Output of the integrator: a ramp through each bit, up for a 1 and down for a 0, reset at the start of the next bit. It goes on to the comparator inside the kit.'),
  term('mf.gnds', 208.3, 177.4, 'sock', 'GND (socket)', 'GND', 'Ground socket. A crocodile clip cannot hold on a socket: use a ground pin for the probe ground.', BLACK),
  term('cmp.out', 254.9, 142.7, 'pin', 'Recd O/P Data', 'REC', 'Received data: the comparator (311, pulled up to +5 V) gives 5 V while the raw data is above 0 V and 0 V while it is below.'),
  term('cmp.gnd', 254.1, 177.8, 'pin', 'GND', 'GND', GROUND),
];
export const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t])) as Record<string, TermDef>;

/** Data switches S8 (MSB, left) to S1 and the LED above each. A lit LED is a 1. */
export const BITS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const SW_X = [17.4, 29.6, 42, 54.4, 67, 79.4, 92, 104.4];
export const SWITCHES = BITS.map((n, i) => ({ id: `s${n}`, n, x: SW_X[i], y: 93 }));
export const LEDS = BITS.map((n, i) => ({ n, x: SW_X[i] + 5.4, y: 82.5 }));

/** AMPLITUDE pot of the noise generator (10 kΩ, black knob). */
export const AMP_KNOB = { id: 'amp', x: 191.1, y: 97.8 };
/** Mains toggle and pilot lamp; the cord leaves over the left edge. */
export const POWER_SW = { x: 29.3, y: 181 };
export const NEON = { x: 50, y: 181 };
export const CORD_ENTRY = { x: 11, y: 181 };
export const SCREWS: [number, number][] = [[3, 3], [267, 3], [3, 195], [267, 195], [3, 99], [267, 99]];

/** ICs: centre, pin count and the type number printed beside each. */
export interface ChipDef { x: number; y: number; pins: 8 | 14 | 16; name: string }
const chip = (x: number, y: number, pins: 8 | 14 | 16, name: string): ChipDef => ({ x, y, pins, name });
export const CHIPS: ChipDef[] = [
  chip(36, 37, 14, '7404'), chip(76, 37, 14, '7493'), chip(36, 67, 16, '74163'), chip(79, 67, 16, '74166'),
  chip(242, 45, 8, '356'), chip(141, 138, 8, '351'), chip(189, 138, 16, '4528'), chip(143, 174, 16, '4052'), chip(190, 174, 14, '4013'), chip(236, 153, 8, '311'),
];
/** Transistors of the noise generator (TO-92), with their printed type. */
export const TRANSISTORS: { x: number; y: number; name: string }[] = [
  { x: 125, y: 40, name: 'BC 557' }, { x: 170, y: 39, name: 'BC 548B' }, { x: 185, y: 40, name: 'BC 548B' }, { x: 149, y: 89, name: 'BC 5488' }, { x: 174, y: 89, name: 'BC 557' },
];

/** Other fixed parts modelled as solids. r: degrees about the vertical (res: 0 along x, 90 along y). */
export type PartKind = 'elcoL' | 'elcoS' | 'preset' | 'res' | 'cap' | 'film' | 'box';
export interface PartDef { k: PartKind; x: number; y: number; r?: number }
const at = (k: PartKind, pts: [number, number][], r?: number): PartDef[] => pts.map(([x, y]) => ({ k, x, y, r }));
export const PARTS: PartDef[] = [
  ...at('elcoL', [[66, 118], [66, 132], [66, 160], [66, 174]]),
  ...at('elcoS', [[100, 118], [100, 132], [100, 160], [100, 174], [197, 30], [194, 55], [130, 88], [158, 103]]),
  ...at('preset', [[26, 51], [164.5, 153]]),
  ...at('res', SW_X.map((x): [number, number] => [x + 6.4, 93]), 90),
  ...at('res', [[125, 25], [153, 29], [153, 51], [170, 54], [182, 54], [188, 25], [203, 41], [137, 74], [152, 74], [177, 73], [137, 103], [149, 103], [243, 66], [131, 148], [154, 141], [183.5, 148], [226, 183]], 90),
  ...at('res', [[54, 48], [146, 41], [232, 70], [232, 81], [245, 81], [152, 157], [170, 129], [243, 132]]),
  ...at('cap', [[142, 36], [162, 135], [141, 163]]),
  { k: 'film', x: 188, y: 77 }, { k: 'box', x: 206, y: 43 },
];
