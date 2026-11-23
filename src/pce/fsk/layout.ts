// Sigma COM115M "Generation & reception of FSK": panel geometry measured on the lab's photograph
// after flattening it (the printed border mapped to 5 mm inside a 270 x 198 plate, the size of the
// other Sigma panels). Millimetres on the yellow plate; x to the right and y towards the front edge,
// origin at the plate's top-left corner, lid hinge at the back.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export const PANEL = { w: 270, h: 198 };
/** Wooden box (outside) and the acrylic cover in its black frame. */
export const BOX = { w: 318, d: 246, h: 92 };
export const ACRYLIC = { w: 286, d: 214, t: 3 };
/** Heights above the desk: panel surface, top of the acrylic, top of a socket, tip of a terminal pin. */
export const LEVEL = { panel: 76, acrylic: 88, sock: 94, pin: 97 };

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

export type BlockId = 'gen' | 'bm1' | 'bm2' | 'car' | 'add' | 'dem' | 'sq' | 'ps';
export const BLOCK_NAME: Record<BlockId, string> = {
  gen: 'Digital data generator', bm1: 'Balanced modulator-1', bm2: 'Balanced modulator-2', car: 'Carrier generator', add: 'Adder', dem: 'FSK demodulator', sq: 'Data squarer', ps: 'Power supply',
};

/**
 * Electrical nodes. Outputs: CK, BK, NRZ, NRZB (complement) of the generator; F1 (640 kHz) and F2
 * (320 kHz) of the carrier generator; ASK1, ASK2; FSK (adder); VCO, RAW (demodulator); REC (squarer);
 * the supply rails. Inputs that take a patch cord: BM1_IN, BM2_IN, FSK_IN.
 */
export type KitNode = 'CK' | 'BK' | 'NRZ' | 'NRZB' | 'BM1_IN' | 'BM2_IN' | 'ASK1' | 'ASK2' | 'F1' | 'F2' | 'FSK' | 'FSK_IN' | 'VCO' | 'RAW' | 'REC' | 'P15' | 'M15' | 'P5' | 'GND';
/** pin: hollow 2 mm rod standing through the cover · sock: round coloured socket (a probe tip or a cord goes in, a clip cannot hold) */
export type TermKind = 'pin' | 'sock';
export interface TermDef { id: string; x: number; y: number; kind: TermKind; color?: string; label: string; block: BlockId; node: KitNode; info: string }

const RED = '#d2362b', GREEN = '#2f9e57', BLUE = '#2f6fd0', BLACK = '#1a1b1d';
const term = (id: string, x: number, y: number, kind: TermKind, label: string, node: KitNode, info: string, color?: string): TermDef =>
  ({ id, x, y, kind, color, label, block: id.split('.')[0] as BlockId, node, info });
const GROUND = 'Ground pin. A probe ground clip goes here.';

export const TERMS: TermDef[] = [
  term('gen.ck', 68, 24.4, 'pin', 'CK', 'CK', 'Clock of the generator, twice the bit rate.'),
  term('gen.bk', 81, 24.4, 'pin', 'BK', 'BK', 'Bit clock: one cycle for every bit. Its frequency is the bit rate.'),
  term('gen.nrzb', 109.6, 35.6, 'pin', 'NRZ̅ (complement)', 'NRZB', 'Complemented data (printed NRZ with a bar): 0 V for a 1 and 5 V for a 0. Patch it to the NRZ input of balanced modulator-1.'),
  term('gen.nrz', 109.6, 59.6, 'pin', 'NRZ', 'NRZ', 'NRZ data, 0 V / 5 V: the eight switch bits one after the other, D8 (MSB) first, over and over. Patch it to the NRZ input of balanced modulator-2.'),
  term('bm1.in', 124.4, 23, 'pin', 'NRZ̅ input (BM-1)', 'BM1_IN', 'Data input of balanced modulator-1 (MC1496 with a bias, so a 0 V / 5 V input switches the carrier off and on).'),
  term('bm1.out', 184.4, 23.6, 'pin', 'ASK1 O/P', 'ASK1', 'Output of balanced modulator-1: bursts of the 640 kHz carrier while its data input is high. It also goes to the adder inside the kit.'),
  term('bm1.gnd', 188, 92.4, 'pin', 'GND (BM-1)', 'GND', `${GROUND} The 640 kHz carrier reaches this modulator inside the kit (label "640KHz RF").`),
  term('bm2.in', 198.6, 23.4, 'pin', 'NRZ input (BM-2)', 'BM2_IN', 'Data input of balanced modulator-2.'),
  term('bm2.out', 258, 30.4, 'pin', 'ASK2 O/P', 'ASK2', 'Output of balanced modulator-2: bursts of the 320 kHz carrier while its data input is high. It also goes to the adder inside the kit.'),
  term('bm2.gnd', 261, 92, 'pin', 'GND (BM-2)', 'GND', `${GROUND} The 320 kHz carrier reaches this modulator inside the kit (label "320KHz RF").`),
  term('car.f1', 164.4, 108, 'pin', 'f1 - 640 KHz', 'F1', 'Test point of the 640 kHz carrier (LC oscillator, 100 µH), about 2 V peak-to-peak. It feeds balanced modulator-1 inside the kit.'),
  term('car.f2', 164.4, 149.6, 'pin', 'f2 - 320 KHz', 'F2', 'Test point of the 320 kHz carrier (LC oscillator, 200 µH), about 2 V peak-to-peak. It feeds balanced modulator-2 inside the kit.'),
  term('add.out', 176, 108, 'pin', 'FSK O/P', 'FSK', 'Output of the adder (356, inverting summer): ASK1 and ASK2 added, which is the FSK signal.'),
  term('add.outs', 187, 108, 'sock', 'FSK O/P (socket)', 'FSK', 'The FSK signal in a socket: patch it to FSK I/P of the demodulator.', GREEN),
  term('add.gnd', 186.6, 125.4, 'pin', 'GND (adder)', 'GND', GROUND),
  term('dem.in', 200.4, 108, 'sock', 'FSK I/P', 'FSK_IN', 'Input of the FSK demodulator (4046 phase-locked loop).', GREEN),
  term('dem.gnd', 200.6, 157, 'pin', 'GND (demodulator)', 'GND', GROUND),
  term('dem.vco', 225, 154, 'pin', 'CK (VCO)', 'VCO', 'VCO output of the 4046: a square wave at the frequency the loop has locked to.'),
  term('dem.raw', 202, 168, 'pin', 'RAW Data', 'RAW', 'Output of the demodulator: the loop\'s control voltage, low for 320 kHz and high for 640 kHz, smoothed by its filter. It goes to the data squarer inside the kit.'),
  term('sq.out', 260.6, 168.4, 'pin', 'NRZ O/P', 'REC', 'Received data from the data squarer (311 comparator): 5 V while the raw data is below its threshold, 0 V above.'),
  term('sq.gnds', 259.6, 183.6, 'sock', 'GND (socket)', 'GND', 'Ground socket. A crocodile clip cannot hold on a socket: use a ground pin for the probe ground.', BLACK),
  term('ps.p15', 106.6, 109.2, 'sock', '+15 V', 'P15', 'Regulated +15 V (7815).', RED),
  term('ps.m15', 106.6, 143.6, 'sock', '-15 V', 'M15', 'Regulated -15 V (7915).', BLUE),
  term('ps.p5', 106.6, 160, 'sock', '+5 V', 'P5', 'Regulated +5 V (7805).', RED),
  term('ps.gnd', 106.6, 177.6, 'sock', 'GND (supply)', 'GND', 'Ground socket of the supply. A crocodile clip cannot hold on it.', BLACK),
];
export const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t])) as Record<string, TermDef>;

/** Data switches S8 (MSB, left) to S1 and the LED above each. A lit LED is a 1. */
export const BITS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const SW_X = [14, 27, 40.6, 53, 66, 78, 91, 104];
export const SWITCHES = BITS.map((n, i) => ({ id: `s${n}`, n, x: SW_X[i], y: 92.4 }));
export const LEDS = BITS.map((n, i) => ({ n, x: SW_X[i] + 5.5, y: 81.5 }));

/** Mains toggle and pilot lamp; the cord leaves over the left edge. */
export const POWER_SW = { x: 39.6, y: 178 };
export const NEON = { x: 68, y: 178.6 };
export const CORD_ENTRY = { x: 11, y: 178.6 };
export const SCREWS: [number, number][] = [[3, 3], [135, 3], [267, 3], [3, 195], [135, 195], [267, 195], [3, 101.6], [267, 101.6]];

/** ICs: centre, pin count and the type number printed beside each. */
export interface ChipDef { x: number; y: number; pins: 8 | 14 | 16; name: string }
const chip = (x: number, y: number, pins: 8 | 14 | 16, name: string): ChipDef => ({ x, y, pins, name });
/** Balanced modulator-2 repeats modulator-1's layout this far to the right (mm). */
export const BM_DX = 75.4;
export const CHIPS: ChipDef[] = [
  chip(33, 35, 14, '7404'), chip(78, 35, 14, '7493'), chip(33, 65, 16, '74163'), chip(78, 65, 16, '74166'),
  chip(144.6, 49, 14, '1496'), chip(144.6 + BM_DX, 49, 14, '1496'), chip(181.6, 144, 8, '356'), chip(230, 139.6, 16, '4046'), chip(241, 177, 8, '311'),
];
/** Transistors (TO-92) with their printed type. */
const BM_TR: [number, number, string][] = [[126, 48, '548'], [162.6, 49.6, '558'], [175, 49.6, '558'], [162.6, 65, '548'], [175, 65, '548'], [125, 82.4, '548']];
export const TRANSISTORS: { x: number; y: number; name: string }[] = [
  ...BM_TR.map(([x, y, name]) => ({ x, y, name })), ...BM_TR.map(([x, y, name]) => ({ x: x + BM_DX, y, name })),
  { x: 129, y: 119, name: '548' }, { x: 129, y: 160, name: '548' },
];

/** Other fixed parts modelled as solids. r: degrees about the vertical (res: 0 along x, 90 along y). */
export type PartKind = 'elcoL' | 'elcoS' | 'preset' | 'trim' | 'res' | 'cap' | 'film' | 'coil';
export interface PartDef { k: PartKind; x: number; y: number; r?: number }
const at = (k: PartKind, pts: [number, number][], r?: number): PartDef[] => pts.map(([x, y]) => ({ k, x, y, r }));
const bm = (pts: [number, number][]): [number, number][] => [...pts, ...pts.map(([x, y]): [number, number] => [x + BM_DX, y])];
export const PARTS: PartDef[] = [
  ...at('elcoL', [[65, 115.6], [65, 135]]),
  ...at('elcoS', [[97, 116.4], [97, 135.2], [97, 167]]),
  ...at('preset', [[24, 53]]),
  ...at('trim', [...bm([[125.4, 34], [186, 47], [146, 82.4], [167.6, 81], [153, 93]]), [221, 117], [215, 176]]),
  ...at('res', SW_X.map((x): [number, number] => [x + 5, 92.4]), 90),
  ...at('res', [...bm([[135, 34], [142, 34], [148, 34], [160, 34], [167, 34], [121, 66], [128, 66], [138, 66], [144, 66], [152, 66], [186, 65], [132, 82], [173, 82], [179, 82], [186, 82], [141, 94]]),
    [120.6, 113], [120.6, 128], [132, 136], [120.6, 154.6], [120.6, 169.6], [132, 177.6], [174, 126], [176, 163], [181, 163], [189, 163], [231, 125], [235, 125], [240, 125], [244.4, 123]], 90),
  ...at('res', [...bm([[126, 56], [127, 97]]), [53, 46.6], [140, 126.4], [140, 168.6], [257, 130], [220, 161]]),
  ...at('cap', [...bm([[154, 34]]), [148, 133.6], [161, 133.6], [148, 176], [161, 176], [205.6, 120], [229, 153], [260, 142], [257, 116]]),
  ...at('film', bm([[157, 80]])),
  ...at('coil', [[154, 126.4], [154, 168]]),
];
