// Board-level configuration, user inputs and per-frame snapshots exchanged
// between the simulation worker and the UI.

import type { LogLevel, McuCore } from '../core/types.ts';
import type { LcdSnapshot } from './hd44780.ts';
import type { PinMonitor } from './pinmon.ts';

export interface PinRef {
  port: number;
  bit: number;
}

export const PIC_PORTS = ['A', 'B', 'C', 'D', 'E'] as const;
export const MCS51_PORTS = ['P0', 'P1', 'P2', 'P3'] as const;

export const pinName = (arch: 'pic18' | 'mcs51', p: PinRef) =>
  arch === 'pic18' ? `R${PIC_PORTS[p.port]}${p.bit}` : `P${p.port}.${p.bit}`;

/** FRC (10-pin ribbon) connectors on the base board that can be patched to a PIC module port. */
export type FrcTarget = 'LBANK' | 'KEY' | 'LCD_DATA' | 'LCD_CTRL';

/**
 * Electrical assumptions for the Smart Logic Technologies "EXCEL PIC V1.0" trainer.
 * None of these come from a schematic: they are inferred from silkscreen labels and
 * common SPPU lab programs, and are flagged as UNVERIFIED in the UI.
 */
export interface PicAssumptions {
  sw0: PinRef;
  sw1: PinRef;
  relay: PinRef;
  buzzer: PinRef;
  /** L293D enable: null = tied to VCC through DCM_SW-1 */
  motorEn: PinRef | null;
  motorIn1: PinRef;
  motorIn2: PinRef;
  potChannel: number;
  lm35Channel: number;
  /** line (0-7) of the LCD CNTRL ribbon used for RS, RW, E */
  lcdRs: number;
  lcdRw: number;
  lcdEn: number;
  ledActiveHigh: boolean;
  motorRatedRpm: number;
  motorSupplyV: number;
}

export interface PicBoardConfig {
  crystalHz: number;
  cables: Record<FrcTarget, number | null>;
  assumptions: PicAssumptions;
  dips: {
    pb: boolean[]; // PUSH BUTTON INTERFACE 2-way: SW0, SW1 -> port pins
    periph: boolean[]; // relay/buzzer 6-way: 1 = relay, 2 = buzzer
    dcm: boolean[]; // DCM_SW 6-way: 1 = EN, 2 = IN1, 3 = IN2
    analog: boolean[]; // ANALOG INP 2-way: 1 = POT, 2 = LM35
  };
}

export interface Mcs51BoardConfig {
  clockHz: number;
  variant: 'AT89C51' | 'AT89S52';
  ledPort: number;
  ledActiveLow: boolean;
}

export type BoardInput =
  | { kind: 'button'; id: string; pressed: boolean } // sw0, sw1, reset, key0..key15
  | { kind: 'dip'; bank: keyof PicBoardConfig['dips']; index: number; on: boolean }
  | { kind: 'pot'; value: number } // 0..1
  | { kind: 'temperature'; celsius: number }
  | { kind: 'contrast'; value: number }
  | { kind: 'power'; on: boolean }
  | { kind: 'pinDrive'; port: number; bit: number; low: boolean } // 8051 port dialog / external
  | { kind: 'cable'; target: FrcTarget; port: number | null }
  | { kind: 'config'; cfg: PicBoardConfig };

export interface PicBoardSnapshot {
  kind: 'pic';
  power: boolean;
  resetHeld: boolean;
  leds: number[]; // L0..L7 brightness 0..1
  lcd: LcdSnapshot;
  lcdContrast: number;
  relay: boolean;
  relaySwitches: number;
  buzzer: number; // drive duty 0..1
  motor: { rpm: number; drive: number; dutyIn1: number; dutyIn2: number };
  pot: number;
  potVolts: number;
  temperature: number;
  lm35Volts: number;
  inputs: Record<string, boolean>;
  dips: PicBoardConfig['dips'];
  cables: PicBoardConfig['cables'];
}

export interface Mcs51BoardSnapshot {
  kind: 'mcs51';
  power: boolean;
  leds: number[];
  extLow: number[];
  ledPort: number;
  ledActiveLow: boolean;
}

export type BoardSnapshot = PicBoardSnapshot | Mcs51BoardSnapshot;

export interface SimBoard {
  attach(mcu: McuCore): void;
  input(ev: BoardInput): void;
  /** Called once per UI frame with the current simulated time (s). */
  frame(t: number, dt: number): BoardSnapshot;
  drainLogs(): { level: LogLevel; msg: string; t: number }[];
  drainSerial(): number[];
  power: boolean;
  resetHeld: boolean;
  pinMonitor: PinMonitor;
  portCount: number;
}
