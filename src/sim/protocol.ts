// Messages between the UI thread and the simulation worker.

import type { Arch, LogLevel } from './core/types.ts';
import type { BoardInput, BoardSnapshot, Mcs51BoardConfig, PicBoardConfig } from './board/types.ts';

export interface LineEntry { addr: number; line: number; file: string }
export interface SymbolEntry { name: string; addr: number; size: number; type?: string; space: 'data' | 'code' | 'sfr' | 'bit' | 'xdata' }

export interface DebugInfo {
  mainFile: string;
  lines: LineEntry[];
  symbols: SymbolEntry[];
}

export type StepMode = 'instr' | 'line' | 'over' | 'out';

export type ToWorker =
  | { type: 'init'; arch: Arch; board: PicBoardConfig | Mcs51BoardConfig }
  | { type: 'load'; hex: string; debug?: DebugInfo }
  /** PIC USB bootloader commands (only accepted while the device is in bootloader mode). */
  | { type: 'erase' }
  | { type: 'flash'; hex: string; debug?: DebugInfo }
  | { type: 'leaveBootloader' }
  /** 8051 SST EasyIAP: the PC is (not) sending the IAP detect handshake; a RESET then enters IAP mode. */
  | { type: 'iapSync'; on: boolean }
  | { type: 'unload' }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'step'; mode: StepMode }
  | { type: 'reset' }
  | { type: 'speed'; value: number } // 1 = real time, 0 = as fast as possible
  | { type: 'input'; ev: BoardInput }
  | { type: 'breakpoints'; lines: number[] }
  | { type: 'serialRx'; bytes: number[] }
  | { type: 'disasm'; addr: number; count: number }
  | { type: 'analyzer'; enabled: boolean };

export interface CpuRegsPic {
  arch: 'pic18';
  pc: number; w: number; status: number; bsr: number; sp: number; stack: number[];
  fsr: number[]; prod: number; tblptr: number; tablat: number;
}

export interface CpuRegs51 {
  arch: 'mcs51';
  pc: number; a: number; b: number; psw: number; sp: number; dptr: number; r: number[];
}

export interface PortView { name: string; lat: number; tris: number; level: number; analog: number; duty: number[]; rate: number[]; freq: number[] }

export type BootSeq = 'idle' | 'reset' | 'reset+boot' | 'boot' | 'ready';
export type DeviceMode = 'off' | 'reset' | 'bootloader' | 'running' | 'blank' | 'halted' | 'idle';

export interface DeviceState {
  mode: DeviceMode;
  /** valid application present in flash */
  flashed: boolean;
  bootSeq: BootSeq;
}

export interface FrameData {
  device: DeviceState;
  running: boolean;
  loaded: boolean;
  cycles: number;
  simTime: number;
  speedRatio: number; // simulated seconds per wall second over the last frame
  mips: number;
  clock: { fosc: number; cycleHz: number; mode: string };
  cpu: CpuRegsPic | CpuRegs51;
  /** PIC: 4096-byte data space (GPR + SFR with live values). 8051: 256 IRAM + 128 SFR (0x80..0xFF). */
  mem: Uint8Array;
  ports: PortView[];
  periph: Record<string, unknown>;
  board: BoardSnapshot;
  line: number | null;
  logs: { level: LogLevel; msg: string; t: number }[];
  serial: number[];
  analyzer?: { t: number[]; v: number[]; dropped: number };
}

export type FromWorker =
  | { type: 'ready' }
  | { type: 'loaded'; bytes: number; warnings: string[]; clock: FrameData['clock'] }
  | { type: 'frame'; data: FrameData }
  | { type: 'stopped'; reason: 'breakpoint' | 'step' | 'pause' | 'limit'; pc: number; line: number | null }
  | { type: 'bootloader'; op: 'erase' | 'flash'; ok: boolean; error?: string; bytes?: number; warnings?: string[] }
  | { type: 'disasm'; lines: { addr: number; text: string; raw: number[]; line: number | null }[] };
