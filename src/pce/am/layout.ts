// Sigma COM101 "AM/DSB/SSB Modulation & Demodulation System Trainer": panel geometry measured on the
// lab's top-view photograph after flattening it (tools/pce-am-panel). Millimetres; x to the right and
// y towards the front edge, origin at the top-left corner of the printed sheet, read with the lid
// hinge at the back.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export type { V3 } from '../kit.ts';
export { KIT_POS } from '../world.ts';

export const PANEL = { w: 297, h: 232.3 };
/** Wooden box (outside), its top frame, and heights above the desk. */
export const BOX = { w: 345, d: 281, h: 92, frame: 24 };
/** Printed panel surface, top of the acrylic cover and tip of the terminal pins (above the desk). */
export const LEVEL = { panel: 76, acrylic: 88, pin: 97 };

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

/** Electrical node a terminal belongs to inside the kit. Terminals with the same node are joined internally. */
export type KitNode = 'AUDIO' | 'RF' | 'AM' | 'GND' | 'MODIN' | 'LINK' | 'M1V' | 'P15' | 'M15' | `NC:${string}`;
export type BlockId = 'bm' | 'ag' | 'ps' | 'rf' | 'pd' | 'bp' | 'lp' | 'dd';
export interface PinDef { id: string; x: number; y: number; label: string; block: BlockId; node: KitNode; info: string }

export const BLOCK_NAME: Record<BlockId, string> = {
  bm: 'Balanced modulator', ag: 'Audio generator', ps: 'Power supply', rf: 'RF oscillator',
  pd: 'Product detector', bp: 'Band pass filter', lp: 'Low pass filter', dd: 'Diode detector',
};

const NOT_USED = 'Receiver side of the trainer: not used in this experiment, and not simulated.';
const TWO = 'Two pins, joined: one for the probe, one for a patch cord.';
const pin = (id: string, x: number, y: number, label: string, node: KitNode, info: string): PinDef =>
  ({ id, x, y, label, block: id.slice(0, 2) as BlockId, node, info });

export const PINS: PinDef[] = [
  pin('bm.modin', 40.0, 21.2, 'MOD I/P', 'MODIN', 'Modulating signal input of the balanced modulator. Patch SINE O/P to it.'),
  pin('bm.out1', 115.4, 22.6, 'AM MOD O/P', 'AM', `Modulator output. ${TWO}`),
  pin('bm.out2', 123.8, 22.6, 'AM MOD O/P', 'AM', `Modulator output. ${TWO}`),
  pin('bm.link', 33.4, 56.0, 'RF LINK', 'LINK', 'Carrier-insertion input. Linked to the -1 V pin below it, the output keeps its carrier (DSB-FC). Left open, the carrier is suppressed (DSB-SC).'),
  pin('bm.m1v', 33.4, 67.8, '-1 V', 'M1V', '-1 V DC from the 4K7 preset. Link it to RF LINK for AM with full carrier.'),
  pin('bm.gnd', 27.1, 81.0, 'GND', 'GND', 'Ground of the balanced modulator.'),
  pin('bm.rfin', 69.2, 88.0, 'RF CARRIER I/P', 'RF', 'Carrier input. It is wired to the RF oscillator inside the kit (the printed line), so no cord is needed.'),
  pin('ag.out1', 110.6, 101.8, 'SINE O/P', 'AUDIO', `Audio generator output. ${TWO}`),
  pin('ag.out2', 119.5, 101.5, 'SINE O/P', 'AUDIO', `Audio generator output. ${TWO}`),
  pin('ag.gnd', 119.7, 125.5, 'GND', 'GND', 'Ground of the audio generator. A probe ground clip goes here.'),
  pin('ps.p15', 122.5, 179.4, '+15 V', 'P15', 'Regulated +15 V rail (7815).'),
  pin('ps.gnd', 122.3, 199.8, 'GND', 'GND', 'Power supply ground.'),
  pin('ps.m15', 122.9, 219.9, '-15 V', 'M15', 'Regulated -15 V rail (7915).'),
  pin('rf.out', 224.8, 204.8, 'RF O/P', 'RF', 'RF oscillator output: the carrier. Measure its frequency and amplitude here.'),
  pin('rf.gnd', 179.5, 217.7, 'GND (0 V)', 'GND', 'Ground of the RF oscillator.'),
  pin('pd.amin', 136.4, 14.8, 'AM MOD I/P', 'NC:pd.amin', NOT_USED),
  pin('pd.gnd1', 132.7, 58.6, 'GND', 'GND', 'Ground of the product detector.'),
  pin('pd.out1', 213.0, 16.2, 'DEMD O/P', 'NC:pd.out', NOT_USED),
  pin('pd.out2', 223.2, 16.2, 'DEMD O/P', 'NC:pd.out', NOT_USED),
  pin('pd.rfin', 168.2, 86.8, 'RF CARRIER I/P', 'RF', 'Carrier input of the product detector, wired to the RF oscillator inside the kit.'),
  pin('pd.gnd2', 220.9, 82.2, 'GND', 'GND', 'Ground of the product detector.'),
  pin('bp.in', 235.2, 24.5, 'INPUT', 'NC:bp.in', NOT_USED),
  pin('bp.out1', 234.3, 84.5, 'OUTPUT', 'NC:bp.out', NOT_USED),
  pin('bp.out2', 234.9, 92.4, 'OUTPUT', 'NC:bp.out', NOT_USED),
  pin('lp.in', 262.9, 21.7, 'I/P', 'NC:lp.in', NOT_USED),
  pin('lp.out', 282.3, 86.3, 'O/P', 'NC:lp.out', NOT_USED),
  pin('dd.in', 239.2, 107.1, 'AM MOD I/P', 'NC:dd.in', NOT_USED),
  pin('dd.gnd', 239.2, 118.1, 'GND', 'GND', 'Ground of the diode detector.'),
  pin('dd.out1', 275.8, 105.3, 'DET O/P', 'NC:dd.out', NOT_USED),
  pin('dd.out2', 282.5, 107.1, 'DET O/P', 'NC:dd.out', NOT_USED),
  pin('dd.x', 282.2, 130.2, 'Detector load', 'NC:dd.x', NOT_USED),
];
export const PIN = Object.fromEntries(PINS.map((p) => [p.id, p])) as Record<string, PinDef>;

/** Panel pots. The printed scales span 243 degrees: 33 ticks, 121.5 degrees either side of the top. */
export const SWEEP = (121.5 * Math.PI) / 180;
export type KnobId = 'agAmp' | 'agFreq' | 'rfFreq' | 'rfAmp';
export interface KnobDef { id: KnobId; x: number; y: number; name: string; style: 'silver' | 'blue' | 'big' | 'black'; lo: number; hi: number; unit: string; info: string }
export const KNOBS: KnobDef[] = [
  { id: 'agAmp', x: 72.1, y: 162.0, name: 'Audio AMPLITUDE (22KP)', style: 'silver', lo: 0, hi: 5, unit: 'V', info: 'Sets the modulating signal amplitude Em. Printed scale 0 V to 5 V (peak to peak).' },
  { id: 'agFreq', x: 107.4, y: 162.3, name: 'Audio FREQUENCY (10KP)', style: 'blue', lo: 300, hi: 3400, unit: 'Hz', info: 'Sets the modulating frequency fm. Printed scale 300 Hz to 3.4 kHz.' },
  { id: 'rfFreq', x: 155.5, y: 204.9, name: 'RF FREQUENCY (15KDP)', style: 'big', lo: 400, hi: 1000, unit: 'kHz', info: 'Sets the carrier frequency fc. Printed scale 400 kHz to 1000 kHz.' },
  { id: 'rfAmp', x: 202.0, y: 204.9, name: 'RF AMPLITUDE (10KP)', style: 'black', lo: 0, hi: 10, unit: 'V', info: 'Sets the carrier amplitude Ec. Printed scale 0 V to 10 V pp.' },
];

/** Mains toggle and pilot lamp of the power supply block; the cord leaves over the left edge. */
export const POWER_SW = { x: 31.6, y: 215.2 };
export const NEON = { x: 45.5, y: 216.2 };
export const CORD_ENTRY = { x: 17, y: 216.4 };
/** Screws holding the acrylic cover. */
export const SCREWS: [number, number][] = [[4.6, 4.3], [147.7, 2.2], [292.5, 4.5], [3.2, 116.6], [293.4, 116.4], [3.8, 227.6], [147.7, 228.3], [292.5, 227.3]];

/** Fixed components modelled as solids (the rest are part of the panel photograph). r: degrees about the vertical; l: length. */
export type PartKind = 'dip14' | 'dip8' | 'elcoL' | 'elcoS' | 'elcoM' | 'film' | 'filmRed' | 'boxcap' | 'preset' | 'to92' | 'toggle' | 'ddpot';
export interface PartDef { k: PartKind; x: number; y: number; r?: number; l?: number }
const at = (k: PartKind, pts: [number, number][]): PartDef[] => pts.map(([x, y]) => ({ k, x, y }));
export const PARTS: PartDef[] = [
  { k: 'dip14', x: 69.7, y: 36.5 }, { k: 'dip14', x: 43.6, y: 124.9 }, { k: 'dip8', x: 84.8, y: 123.4 }, { k: 'dip14', x: 168.9, y: 38.3 }, { k: 'dip8', x: 277, y: 59.8, r: 90 },
  ...at('elcoL', [[79.6, 188.2], [79.6, 210.4]]),
  ...at('elcoS', [[110.6, 189.5], [110.9, 211.7], [182.1, 124.7]]),
  { k: 'elcoM', x: 265.2, y: 82.6 },
  { k: 'film', x: 78.9, y: 71.6, l: 15 }, { k: 'film', x: 46.2, y: 105, l: 14 }, { k: 'film', x: 138.9, y: 25.9, l: 18 }, { k: 'film', x: 177, y: 73.9, l: 16 }, { k: 'film', x: 270.7, y: 35.1, l: 11, r: 75 },
  { k: 'filmRed', x: 245.4, y: 124.5, l: 17 }, { k: 'boxcap', x: 232.9, y: 64.2 },
  ...at('preset', [[49.7, 15], [20.2, 51.5], [116, 31.6], [68.5, 72.7], [92.8, 72.7], [33.4, 108.4], [23.3, 140.8], [55.6, 140.4], [70.6, 134.5], [105.7, 120.9], [224.4, 165.4], [141, 162.2], [149.3, 16.2], [216.3, 34.2], [169.6, 75.3], [193.2, 73.9]]),
  ...at('to92', [[50.2, 33.4], [88.7, 33.4], [103.3, 33.4], [89, 52.2], [104.3, 52.2], [48, 72.3], [153.3, 118.3], [198.8, 114.7], [212.8, 119.1], [212, 155.8], [198.4, 164.2], [151.6, 36.5], [189, 35.5], [204.3, 36.5], [190, 54.5], [205.6, 54.5], [147.2, 73.4]]),
  ...at('toggle', [[243.1, 146.2], [259.4, 146.2]]),
  { k: 'ddpot', x: 275.1, y: 146.2 },
];
