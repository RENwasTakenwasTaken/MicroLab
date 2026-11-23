// Sigma COM122N "Line Coding and Decoding Trainer": panel geometry measured on the lab's top-view
// photograph after flattening it. Millimetres on the yellow panel plate (270 x 198); x to the
// right and y towards the front edge, origin at the plate's top-left corner, lid hinge at the back.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export const PANEL = { w: 270, h: 198 };
/** Wooden box (outside) and the acrylic cover in its black frame. */
export const BOX = { w: 318, d: 246, h: 92 };
export const ACRYLIC = { w: 286, d: 214, t: 3 };
/** Heights above the desk: panel surface, top of the acrylic, top of a 2 mm socket or post, tip of a terminal pin. */
export const LEVEL = { panel: 76, acrylic: 88, sock: 94, pin: 97 };

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

export type BlockId = 'gen' | 'lc' | 'cmp' | 'dec' | 'rec' | 'ps';
export const BLOCK_NAME: Record<BlockId, string> = {
  gen: 'Digital data generator', lc: 'Line coding section', cmp: 'Comparators', dec: 'Bit clock decoder', rec: 'Bit clock recovery', ps: 'Power supply',
};

/** The eight line codes, in the order of their output pins (top to bottom). */
export const CODES = ['UNRZ', 'NRZM', 'BNRZ', 'URZ', 'BRZ', 'MAN', 'BPM', 'AMI'] as const;
export type CodeId = (typeof CODES)[number];
export const CODE_NAME: Record<CodeId, string> = {
  UNRZ: 'NRZ UNIPOLAR', NRZM: 'NRZ-M', BNRZ: 'NRZ BIPOLAR', URZ: 'RZ UNIPOLAR', BRZ: 'RZ BIPOLAR', MAN: 'BIPHASE MANCHESTER', BPM: 'BIPHASE MARK', AMI: 'AMI BIPOLAR',
};

export type KitNode = 'CK' | 'BK' | 'NRZ' | 'GND' | CodeId | 'P12' | 'M12' | 'P5' | 'M5' | `NC:${string}`;
/** pin: hollow 2 mm rod standing through the cover · sock: coloured 2 mm socket · post: black ground post */
export type TermKind = 'pin' | 'sock' | 'post';
export interface TermDef { id: string; x: number; y: number; kind: TermKind; color?: string; label: string; block: BlockId; node: KitNode; info: string }

const RED = '#d2362b', BLUE = '#2f6fd0', GREEN = '#2f9e57', BLACK = '#1a1b1d';
const NOT_USED = 'Receiver side of the trainer: not used in this experiment, and not simulated.';
const term = (id: string, x: number, y: number, kind: TermKind, label: string, node: KitNode, info: string, color?: string): TermDef =>
  ({ id, x, y, kind, color, label, block: id.split('.')[0] as BlockId, node, info });
const CODE_INFO: Record<CodeId, string> = {
  UNRZ: 'Unipolar NRZ: +5 V for a 1 and 0 V for a 0, each held for the whole bit.',
  NRZM: 'NRZ-M (mark): the level changes at the start of every 1 and stays where it is for a 0.',
  BNRZ: 'Bipolar (polar) NRZ: a positive level for a 1 and a negative level for a 0, each for the whole bit.',
  URZ: 'Unipolar RZ: a 1 is a pulse in the first half of the bit, then back to 0 V. A 0 is no pulse.',
  BRZ: 'Bipolar (polar) RZ: a positive half-bit pulse for a 1 and a negative one for a 0, returning to 0 V in the second half.',
  MAN: 'Biphase Manchester (split phase): every bit has a transition in its middle, high-to-low for a 1 and low-to-high for a 0.',
  BPM: 'Biphase mark: a transition at the start of every bit, and one more in the middle of a 1.',
  AMI: 'AMI (alternate mark inversion): 0 V for a 0; the 1s are pulses of alternating polarity.',
};
const CODE_Y = [20, 36, 52, 68.5, 85, 101, 117, 133];

export const TERMS: TermDef[] = [
  term('gen.ck', 65, 31, 'pin', 'CK', 'CK', 'Clock of the generator, twice the bit rate. The return-to-zero and biphase codes are cut out of it.'),
  term('gen.bk', 79, 31, 'pin', 'BK', 'BK', 'Bit clock: one cycle for every bit. Measure its frequency: it is the bit rate.'),
  term('gen.nrzs', 107.5, 30, 'sock', 'NRZ (socket)', 'NRZ', 'The data word as it leaves the generator, in a 2 mm socket: the same signal as the NRZ pin below.', BLUE),
  term('gen.nrz', 108.5, 78, 'pin', 'NRZ', 'NRZ', 'NRZ data: the eight switch bits one after the other, D8 (MSB) first, over and over. It also goes to the line coding section inside the kit.'),
  term('gen.gnd', 106.5, 97, 'post', 'GND', 'GND', 'Ground post of the generator. A probe ground clip goes here.', BLACK),
  ...CODES.map((c, i) => term(`lc.${c.toLowerCase()}`, 197.5, CODE_Y[i], 'pin', CODE_NAME[c], c, CODE_INFO[c])),
  term('cmp.in1', 212, 22, 'sock', 'I/P1', 'NC:cmp.in1', NOT_USED, RED),
  term('cmp.in2', 212, 34.5, 'sock', 'I/P2', 'NC:cmp.in2', NOT_USED, BLUE),
  term('cmp.gnd', 212, 47, 'sock', 'GND', 'GND', 'Ground socket of the comparators. A crocodile clip cannot hold on a socket: use a ground pin or post for the probe ground.', BLACK),
  term('cmp.out1', 259, 52, 'sock', 'O/P-1', 'NC:cmp.out1', NOT_USED, RED),
  term('cmp.out2', 259, 65, 'sock', 'O/P-2', 'NC:cmp.out2', NOT_USED, BLUE),
  term('cmp.out3', 259, 78, 'sock', 'O/P-3', 'NC:cmp.out3', NOT_USED, GREEN),
  term('dec.in', 221.5, 124, 'sock', 'I/P', 'NC:dec.in', NOT_USED, RED),
  term('dec.nrz', 258.5, 100, 'pin', 'NRZ O/P', 'NC:dec.nrz', NOT_USED),
  term('dec.gnd', 258.5, 123, 'pin', 'GND', 'GND', 'Ground pin of the bit clock decoder.'),
  term('rec.in', 212.5, 153, 'sock', 'I/P', 'NC:rec.in', NOT_USED, RED),
  term('rec.bk', 258.5, 154, 'pin', 'BK O/P', 'NC:rec.bk', NOT_USED),
  term('rec.gnd', 258.5, 173, 'pin', 'GND', 'GND', 'Ground pin of the bit clock recovery block.'),
  term('ps.p12', 111, 152, 'pin', '+12 V', 'P12', 'Regulated +12 V rail (7812).'),
  term('ps.gnd1', 110.5, 170, 'post', 'GND', 'GND', 'Ground post of the power supply. A probe ground clip can go here.', BLACK),
  term('ps.m12', 111, 187, 'pin', '-12 V', 'M12', 'Regulated -12 V rail (7912).'),
  term('ps.p5', 198.5, 152.5, 'pin', '+5 V', 'P5', 'Regulated +5 V rail (7805): the logic supply.'),
  term('ps.gnd2', 198.5, 169, 'pin', 'GND', 'GND', 'Ground pin of the power supply. A probe ground clip can go here.'),
  term('ps.m5', 198.5, 187.5, 'pin', '-5 V', 'M5', 'Regulated -5 V rail (7905): the negative level of the bipolar codes comes from it.'),
];
export const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t])) as Record<string, TermDef>;

/** Data switches S8 (MSB, left) to S1 and the LED above each. A lit LED is a 1. */
export const BITS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const SW_X = [13.5, 25.5, 39, 51, 64, 77, 89.5, 102];
export const SWITCHES = BITS.map((n, i) => ({ id: `s${n}`, n, x: SW_X[i], y: 122 }));
export const LEDS = BITS.map((n, i) => ({ n, x: SW_X[i] + 4.2, y: 107.5 }));

/** Mains toggle and pilot lamp; the cord leaves over the left edge. */
export const POWER_SW = { x: 26.5, y: 182 };
export const NEON = { x: 48, y: 183 };
export const CORD_ENTRY = { x: 11, y: 182 };
export const SCREWS: [number, number][] = [[3, 3], [267, 3], [3, 195], [267, 195], [3, 99]];

/** ICs: centre, pin count and the type number printed under each. */
export interface ChipDef { x: number; y: number; pins: 8 | 14 | 16; name: string }
const chip = (x: number, y: number, pins: 8 | 14 | 16, name: string): ChipDef => ({ x, y, pins, name });
export const CHIPS: ChipDef[] = [
  chip(30, 46.5, 14, '7404'), chip(75.5, 46, 14, '7493'), chip(31, 82.5, 16, '74161'), chip(76, 82.5, 16, '74165'),
  chip(130, 27, 14, '40106'), chip(155, 27, 14, '7404'), chip(182, 27, 16, '4052'),
  chip(130, 63, 14, '7486'), chip(155.5, 63, 14, '4013'), chip(182, 63, 16, '4052'),
  chip(130, 100, 14, '74266'), chip(155.5, 100, 14, '4013'), chip(182, 100, 14, '4013'),
  chip(143.5, 139, 16, '4027'), chip(169.5, 139, 16, '4052'),
  chip(229, 24, 8, '311'), chip(250, 24, 8, '311'), chip(220, 66, 14, '7486'), chip(243, 66, 14, '7414'),
  chip(245, 101, 14, '7474'), chip(221, 113.5, 16, '74175'), chip(245, 122, 14, '7486'),
  chip(221, 166, 16, '74123'), chip(245, 166, 16, '4046'),
];

/** Other fixed parts modelled as solids. r: degrees about the vertical. */
export type PartKind = 'elcoL' | 'elcoS' | 'preset' | 'res' | 'cap' | 'toggle' | 'knob' | 'shaft';
export interface PartDef { k: PartKind; x: number; y: number; r?: number }
const at = (k: PartKind, pts: [number, number][], r?: number): PartDef[] => pts.map(([x, y]) => ({ k, x, y, r }));
export const PARTS: PartDef[] = [
  ...at('elcoL', [[70, 163], [70, 181], [164, 163], [164, 181]]),
  ...at('elcoS', [[99, 162], [99, 177], [189, 162], [189, 178]]),
  ...at('preset', [[19.5, 60], [241, 143]]),
  ...at('res', SW_X.map((x): [number, number] => [x + 6.4, 122]), 90),
  ...at('res', [[122, 44], [135.5, 44], [174, 83.5], [183, 83.5], [130, 121], [213, 184], [229, 184], [257, 184], [247, 146], [253, 146], [259, 146]], 90),
  ...at('res', [[45, 57.5], [229, 17.5], [247, 17.5], [243, 57]]),
  ...at('cap', [[129, 44], [143.5, 44], [221, 184], [237, 184], [244, 184], [250, 184]], 90),
  { k: 'toggle', x: 220, y: 98 }, { k: 'knob', x: 228, y: 45 }, { k: 'shaft', x: 247.5, y: 46 }, { k: 'shaft', x: 215, y: 143 },
];
