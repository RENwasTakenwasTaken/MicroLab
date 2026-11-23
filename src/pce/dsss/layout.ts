// Sigma DSSS100 "Generation & detection of direct sequence spectrum & analysis": panel geometry
// measured on the lab's photograph after flattening it. This panel is larger than the other Sigma
// plates: its ICs give about 350 x 268 mm inside the printed border, so the plate is taken as
// 360 x 278 mm. Millimetres on the plate; x to the right and y towards the front edge, origin at the
// plate's top-left corner, lid hinge at the back.

import type { V3 } from '../kit.ts';
import { KIT_POS } from '../world.ts';

export const PANEL = { w: 360, h: 278 };
/** Wooden box (outside) and the acrylic cover in its black frame. */
export const BOX = { w: 408, d: 326, h: 92 };
export const ACRYLIC = { w: 376, d: 294, t: 3 };
/** Heights above the desk: panel surface, top of the acrylic, top of a socket, tip of a terminal pin. */
export const LEVEL = { panel: 76, acrylic: 88, sock: 94, pin: 97 };

/** Panel coordinates (mm) + height above the panel -> world coordinates. */
export function panelToWorld(x: number, y: number, h = 0): V3 {
  return [KIT_POS[0] + x - PANEL.w / 2, KIT_POS[1] + LEVEL.panel + h, KIT_POS[2] + y - PANEL.h / 2];
}

export type BlockId = 'clk' | 'pn' | 'gen' | 'mix' | 'bip' | 'mod' | 'det' | 'lpf' | 'desp' | 'rf' | 'ps';
export const BLOCK_NAME: Record<BlockId, string> = {
  clk: 'Clock generator', pn: 'PN code generator', gen: 'Binary data generator', mix: 'Spreading code mixer', bip: 'Uni to bipolar converter',
  mod: 'DSSS modulator', det: 'DSSS demodulator (coherent detector)', lpf: 'Low pass filter comparator', desp: 'Code despreading section', rf: 'RF carrier generator', ps: 'Power supply',
};

/**
 * Electrical nodes. Outputs: CC (1 MHz master clock), PNCK, BK, C200 / C200B (200 kHz and its
 * complement), PN, NRZ, SP (mixer), BIP (bipolar spreading code), DSSS, RF500 (square clock into the
 * RF generator), RF (carrier), DETRF (detector's carrier), DET (noisy SP code), FIL, SPO, REC; rails.
 * Inputs that take a patch cord: MIX_PN, MIX_NRZ, BIP_IN, MOD_SP, MOD_RF, DET_IN, LPF_IN, DESP_SP, DESP_PN.
 */
export type KitNode = 'CC' | 'PNCK' | 'BK' | 'C200' | 'C200B' | 'PN' | 'NRZ' | 'SP' | 'BIP' | 'DSSS' | 'RF500' | 'RF' | 'DETRF' | 'DET' | 'FIL' | 'SPO' | 'REC'
  | 'MIX_PN' | 'MIX_NRZ' | 'BIP_IN' | 'MOD_SP' | 'MOD_RF' | 'DET_IN' | 'LPF_IN' | 'DESP_SP' | 'DESP_PN' | 'P15' | 'M15' | 'P5' | 'M5' | 'GND';
export type TermKind = 'pin' | 'sock';
export interface TermDef { id: string; x: number; y: number; kind: TermKind; color?: string; label: string; block: BlockId; node: KitNode; info: string }

const RED = '#d2362b', GREEN = '#2f9e57', BLUE = '#2f6fd0', BLACK = '#1a1b1d';
const term = (id: string, x: number, y: number, kind: TermKind, label: string, node: KitNode, info: string, color?: string): TermDef =>
  ({ id, x, y, kind, color, label, block: id.split('.')[0] as BlockId, node, info });
const GROUND = 'Ground pin. A probe ground clip goes here.';

export const TERMS: TermDef[] = [
  term('clk.cc', 131.4, 17.8, 'pin', '1 MHz (CC)', 'CC', 'Master clock ("carrier clock" CC on the lab sheet), nominally 1 MHz. Every other clock on the kit is divided from it.'),
  term('clk.pnck', 131.4, 37.2, 'pin', '100 KHz PNCK', 'PNCK', 'PN clock: one cycle per chip, the master clock divided by 10 (nominally 100 kHz). It drives the PN code generator inside the kit.'),
  term('clk.bk', 130.3, 55.6, 'pin', '6.67 KHz BK', 'BK', 'Bit clock: the PN clock divided by 15, so one bit lasts exactly 15 chips. It drives the binary data generator inside the kit.'),
  term('clk.c200', 20.8, 56.2, 'pin', '200 KHz', 'C200', 'The master clock divided by 5 (nominally 200 kHz): two cycles per chip. It clocks the flip-flops of the despreading section inside the kit.'),
  term('clk.c200b', 110.4, 55.8, 'pin', '200 KHz (complement)', 'C200B', 'The complement of the 200 kHz clock.'),
  term('pn.out', 131.8, 79.5, 'pin', 'PN Signal', 'PN', 'PN code: a 4-stage shift register with XOR feedback gives a maximal sequence of 15 chips, 1 0 1 0 0 1 1 0 1 1 1 0 0 0 0, which repeats every bit. It runs only after PRBS has been pressed. Plugs stack: one cord to the mixer, one to the despreading section.'),
  term('pn.gnd', 131.8, 96, 'pin', 'GND (PN)', 'GND', GROUND),
  term('gen.nrz', 131, 115.5, 'pin', 'NRZ DATA', 'NRZ', 'NRZ data, 0 V / 5 V: the eight switch bits one after the other, D8 (MSB) first, one per bit clock, over and over.'),
  term('gen.gnd', 131, 137, 'pin', 'GND (data)', 'GND', GROUND),
  term('mix.pn', 151.8, 17, 'sock', 'PN Code (mixer input)', 'MIX_PN', 'PN input of the spreading code mixer (74266 XNOR).', GREEN),
  term('mix.nrz', 151.8, 29.4, 'sock', 'NRZ Data (mixer input)', 'MIX_NRZ', 'Data input of the spreading code mixer.', GREEN),
  term('mix.outs', 230.3, 11.8, 'sock', 'Spreading Code (socket)', 'SP', 'Spreading code SP = XNOR(data, PN): the PN code during a 1 and its complement during a 0. 0 V / 5 V.', GREEN),
  term('mix.out', 230.3, 21.5, 'pin', 'Spreading Code', 'SP', 'The spreading code on a pin: the same signal as the green socket above it.'),
  term('mix.gnd', 230.3, 32, 'pin', 'GND (mixer)', 'GND', GROUND),
  term('bip.in', 152.5, 53.5, 'pin', 'Uni to bipolar input', 'BIP_IN', 'Input of the uni-to-bipolar converter (4052 analogue switch).'),
  term('bip.gnds', 152.5, 67.4, 'sock', 'GND (socket)', 'GND', 'Ground socket. A crocodile clip cannot hold on a socket.', BLACK),
  term('bip.out', 230.3, 54.9, 'pin', 'Bipolar Sp Code', 'BIP', 'Bipolar (polar) spreading code, about ±4 V. It comes out inverted: -4 V for a 1 and +4 V for a 0.'),
  term('bip.gnd', 230.3, 69.4, 'pin', 'GND (converter)', 'GND', GROUND),
  term('mod.rf', 152.5, 88.9, 'pin', 'RF Carrier (modulator input)', 'MOD_RF', 'Carrier input of the DSSS modulator (MC1496 balanced modulator).'),
  term('mod.sp', 182.8, 161.1, 'pin', 'Sp Code (modulator input)', 'MOD_SP', 'Modulating input of the DSSS modulator: the bipolar spreading code goes here, so the carrier\'s phase flips by 180° with every change of chip (BPSK).'),
  term('mod.out', 231.7, 88.2, 'sock', 'DSSS O/P', 'DSSS', 'The DSSS-BPSK signal: the carrier multiplied by the spreading code.', RED),
  term('mod.gnd', 233, 160.1, 'pin', 'GND (modulator)', 'GND', GROUND),
  term('det.in', 257.8, 17, 'sock', 'DSSS I/P', 'DET_IN', 'Input of the coherent detector (MC1496): it multiplies the DSSS signal by the carrier again.', RED),
  term('det.outp', 344, 11.5, 'pin', 'Noisy SP Code', 'DET', 'Output of the coherent detector: the spreading code back again, still rough (each chip a charging curve, with carrier ripple on it).'),
  term('det.out', 343.9, 18, 'sock', 'Noisy SP Code (socket)', 'DET', 'The detector output in a socket: patch it to SP Code I/P of the low pass filter comparator.', GREEN),
  term('det.gnds', 258.5, 86.8, 'sock', 'GND (socket)', 'GND', 'Ground socket. A crocodile clip cannot hold on a socket.', BLACK),
  term('det.rf', 287, 88.9, 'pin', 'RF Carrier 500KHz (detector)', 'DETRF', 'Test point of the carrier the detector uses. It arrives inside the kit from the RF carrier generator, through the phase shifter set by PHASE.'),
  term('lpf.in', 252.9, 110.8, 'sock', 'SP Code I/P', 'LPF_IN', 'Input of the low pass filter (741).', GREEN),
  term('lpf.gnd', 252.9, 142.5, 'pin', 'GND (filter)', 'GND', GROUND),
  term('lpf.fil', 306.4, 150, 'pin', 'Fil. O/P', 'FIL', 'Output of the low pass filter: the spreading code smoothed, the carrier ripple gone. It goes on to the comparator inside the kit.'),
  term('lpf.out', 345.3, 110.8, 'pin', 'SP Code O/P', 'SPO', 'Output of the comparator (311): the recovered spreading code, clean 0 V / 5 V.'),
  term('lpf.gnd2', 345.3, 142, 'pin', 'GND (comparator)', 'GND', GROUND),
  term('desp.sp', 252.2, 186.3, 'pin', 'SP Code (despreading input)', 'DESP_SP', 'Spreading code input of the despreading section.'),
  term('desp.pn', 252.9, 200.8, 'pin', 'PN Signal (despreading input)', 'DESP_PN', 'PN input of the despreading section.'),
  term('desp.gnd', 252.9, 223.8, 'pin', 'GND (despreading)', 'GND', GROUND),
  term('desp.out', 344.6, 184.2, 'pin', 'Recvd. Data', 'REC', 'Received data: XNOR of the recovered spreading code and the PN code (74266), timed by two 4013 flip-flops on the 200 kHz clock.'),
  term('desp.gnd2', 344.6, 215.8, 'pin', 'GND (despreading)', 'GND', GROUND),
  term('rf.clk', 148.3, 214, 'pin', '500 KHz (clock in)', 'RF500', 'The master clock divided by 2: a 0 V / 5 V square wave that arrives inside the kit and is tuned into a sine by the LC circuit (100 µH).'),
  term('rf.gnd', 148.3, 255, 'pin', 'GND (RF)', 'GND', GROUND),
  term('rf.out', 229.6, 241.8, 'pin', '500 KHz RF CARRIER', 'RF', 'The RF carrier: a sine at half the master clock (488 kHz on this kit, five cycles per chip), about 3.8 V peak-to-peak, set by GAIN.'),
  term('ps.p15', 125, 172.5, 'sock', '+15 V', 'P15', 'Regulated +15 V (7815).', RED),
  term('ps.gnd1', 125, 192.5, 'sock', 'GND (supply)', 'GND', 'Ground socket of the supply.', BLACK),
  term('ps.m15', 127.5, 212, 'sock', '-15 V', 'M15', 'Regulated -15 V (7915).', BLUE),
  term('ps.p5', 127, 222, 'sock', '+5 V', 'P5', 'Regulated +5 V (7805).', RED),
  term('ps.gnd2', 125, 240.5, 'sock', 'GND (supply)', 'GND', 'Ground socket of the supply.', BLACK),
  term('ps.m5', 127, 260, 'sock', '-5 V', 'M5', 'Regulated -5 V (7905).', BLUE),
];
export const TERM = Object.fromEntries(TERMS.map((t) => [t.id, t])) as Record<string, TermDef>;

/** Data switches S8 (MSB, left) to S1 and the LED above each. A lit LED is a 1. */
export const BITS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const SW_X = [13.9, 28.5, 43, 57.6, 72.2, 86.1, 100, 114.6];
export const SWITCHES = BITS.map((n, i) => ({ id: `s${n}`, n, x: SW_X[i], y: 153.9 }));
export const LEDS = BITS.map((n, i) => ({ n, x: SW_X[i], y: 143.5 }));
/** Push buttons of the binary data generator: PRBS starts the PN register, Reset clears it. */
export const BUTTONS = { prbs: { x: 116.3, y: 126.3 }, reset: { x: 130, y: 153.8 } };

/** Mains toggle and pilot lamp; the cord leaves over the left edge. */
export const POWER_SW = { x: 18.8, y: 213.8 };
export const NEON = { x: 18.8, y: 192.5 };
export const CORD_ENTRY = { x: 10, y: 257.5 };
export const SCREWS: [number, number][] = [[3, 3], [180, 3], [357, 3], [3, 275], [180, 275], [357, 275], [3, 139], [357, 139]];

export interface ChipDef { x: number; y: number; pins: 8 | 14 | 16; name: string }
const chip = (x: number, y: number, pins: 8 | 14 | 16, name: string): ChipDef => ({ x, y, pins, name });
/** The coherent detector repeats the modulator's layout this far away (mm). */
export const DET_D = { x: 106.3, y: -72.5 };
export const CHIPS: ChipDef[] = [
  chip(40, 26, 14, '74HC04'), chip(72.5, 26, 14, '7490'), chip(102.5, 26, 14, '7490'), chip(48.8, 53.8, 14, '7490'), chip(85, 53.8, 14, '7492'),
  chip(26.3, 86.3, 14, '4013'), chip(62.5, 86.3, 14, '74266'), chip(98.8, 86.3, 14, '4013'),
  chip(30, 123.8, 16, '74163'), chip(80, 123.8, 16, '74166'),
  chip(186.3, 22.5, 14, '74266'), chip(187.5, 58, 16, '4052'), chip(185, 112.5, 14, '1496'), chip(185 + DET_D.x, 112.5 + DET_D.y, 14, '1496'),
  chip(285, 126.3, 8, '741'), chip(327.5, 126.3, 8, '311'), chip(308.8, 183.8, 14, '74266'), chip(281.3, 215.5, 14, '4013'), chip(323.8, 215.5, 14, '4013'),
];
const MOD_TR: [number, number, string][] = [[165, 113.8, '548'], [205, 113.8, '558'], [219.5, 113.8, '558'], [205, 131.3, '548'], [219.5, 131.3, '548'], [165, 148.8, '548']];
export const TRANSISTORS: { x: number; y: number; name: string }[] = [
  ...MOD_TR.map(([x, y, name]) => ({ x, y, name })), ...MOD_TR.map(([x, y, name]) => ({ x: x + DET_D.x, y: y + DET_D.y, name })),
  { x: 166.3, y: 232.5, name: '548' }, { x: 186.3, y: 213.8, name: '548' },
];

export type PartKind = 'elcoL' | 'elcoS' | 'preset' | 'res' | 'cap' | 'pcap' | 'film' | 'coil' | 'xfmr';
export interface PartDef { k: PartKind; x: number; y: number; r?: number }
const at = (k: PartKind, pts: [number, number][], r?: number): PartDef[] => pts.map(([x, y]) => ({ k, x, y, r }));
const twin = (pts: [number, number][]): [number, number][] => [...pts, ...pts.map(([x, y]): [number, number] => [x + DET_D.x, y + DET_D.y])];
export const PARTS: PartDef[] = [
  ...at('elcoL', [[76.3, 183.8], [76.3, 200], [76.3, 233.8], [76.3, 250]]),
  ...at('elcoS', [[113.8, 186.3], [113.8, 198.8], [113.8, 233.8], [113.8, 248.8]]),
  ...at('preset', [[15, 15], ...twin([[162, 94.5], [233, 112.5], [186.3, 148.8], [212.5, 147.5]]), [322.5, 152.5], [220, 192.5], [220, 223.8]]),
  ...at('res', SW_X.map((x): [number, number] => [x + 7.6, 153.9]), 90),
  ...at('res', [...twin([[170, 95], [178, 95], [184.5, 95], [206, 95], [212, 95], [218, 95], [156, 132.5], [163.8, 132.5], [171.3, 132.5], [178, 132.5], [184.5, 132.5], [192, 132.5], [236.3, 132.5],
    [152.5, 150], [172.5, 150], [180.5, 150], [202, 150], [206.5, 150], [213.8, 150], [220, 150], [228, 150], [152, 121.3]]),
    [261.8, 122], [261.3, 136.3], [298.8, 130], [327.5, 190.5], [157, 223.3], [156.3, 241.3], [176.3, 248.8], [213.8, 27]], 90),
  ...at('res', [[16.3, 41.3], [71.3, 99.3], [288.8, 155.5], [332.5, 105], [180, 242], [195, 207]]),
  ...at('cap', [...twin([[193, 95]]), [12.5, 32.5], [260.8, 151.3], [276.3, 107.5], [185.5, 250], [203.8, 250], [198.8, 180.5]]),
  ...at('pcap', [[148.8, 100], [196.3, 152.5], [256.3, 35], [303.8, 81.3]]),
  ...at('film', [[172.5, 198.8]]),
  ...at('coil', [[197.5, 242]]),
  ...at('xfmr', [[178.8, 186.3]]),
];
