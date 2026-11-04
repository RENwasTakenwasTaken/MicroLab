// Keil µVision-style virtual target for the 8051: no physical board exists in
// the lab, so the "hardware" is the set of port pins (driven from the Port
// dialogs), a virtual LED bar on a selectable port and the serial window.

import type { LogLevel, McuCore, PinBus } from '../core/types.ts';
import { PinMonitor } from './pinmon.ts';
import type { BoardInput, Mcs51BoardConfig, Mcs51BoardSnapshot, SimBoard } from './types.ts';

export function defaultMcs51Config(): Mcs51BoardConfig {
  return { clockHz: 11_059_200, variant: 'AT89C51', ledPort: 1, ledActiveLow: false };
}

export class Mcs51Board implements PinBus, SimBoard {
  cfg: Mcs51BoardConfig;
  mcu!: McuCore;
  pinMonitor = new PinMonitor();
  portCount = 4;
  power = true;
  resetHeld = false;
  /** Pins pulled low externally (user clicked the pin in the Port dialog). */
  extLow = [0, 0, 0, 0];
  private logs: { level: LogLevel; msg: string; t: number }[] = [];
  private serial: number[] = [];

  constructor(cfg: Mcs51BoardConfig) {
    this.cfg = cfg;
  }

  attach(mcu: McuCore) {
    this.mcu = mcu;
    this.pinMonitor.reset(0);
  }

  private now(cycle = this.mcu?.cycles ?? 0) { return this.mcu ? cycle / this.mcu.cycleHz() : 0; }

  log(level: LogLevel, msg: string) { if (this.logs.length < 500) this.logs.push({ level, msg, t: this.now() }); }

  readInputs(port: number, mask: number) { return ~this.extLow[port] & mask & 0xff; }

  outputsChanged(port: number, level: number, driven: number, cycle: number) {
    // 8051 ports are quasi-bidirectional: a '1' in the latch is a weak pull-up, so
    // for monitoring purposes every pin is "driven" to its latch value.
    this.pinMonitor.update(port, level, 0xff, this.now(cycle));
    void driven;
  }

  analogVoltage() { return 0; }
  serialTx(byte: number) { if (this.serial.length < 4096) this.serial.push(byte); }

  input(ev: BoardInput) {
    if (ev.kind === 'pinDrive') {
      if (ev.low) this.extLow[ev.port] |= 1 << ev.bit; else this.extLow[ev.port] &= ~(1 << ev.bit);
    } else if (ev.kind === 'button' && ev.id === 'reset') {
      this.resetHeld = ev.pressed;
      if (ev.pressed) { const c = this.mcu.cycles; this.mcu.reset(); this.mcu.cycles = c; }
    } else if (ev.kind === 'power') {
      this.power = ev.on;
      if (ev.on) this.mcu.reset();
    }
    this.mcu.inputsChanged();
  }

  frame(t: number): Mcs51BoardSnapshot {
    const stats = this.pinMonitor.frame(t, 4);
    const d = stats.duty[this.cfg.ledPort];
    // pin level also reflects external pull-downs
    const pins = this.mcu.portState(this.cfg.ledPort).level;
    const leds = d.map((x, i) => {
      const v = (pins >> i) & 1 ? x : 0;
      return this.power ? (this.cfg.ledActiveLow ? 1 - v : v) : 0;
    });
    return { kind: 'mcs51', power: this.power, leds, extLow: [...this.extLow], ledPort: this.cfg.ledPort, ledActiveLow: this.cfg.ledActiveLow };
  }

  drainLogs() { const l = this.logs; this.logs = []; return l; }
  drainSerial() { const s = this.serial; this.serial = []; return s; }
}
