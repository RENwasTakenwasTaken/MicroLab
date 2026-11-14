// 8051 target board. In the 3D lab this is the Smart Logic Technologies EXCEL-51 v1.0 module
// (SST89E516RD2, 11.0592 MHz) on the same base board as the PIC kit: eight module LEDs on
// the LED port (P1, active high), the RESET button, and FRC ribbons from the module's
// PORT-0..3 headers (only the base board's LED bank is modelled for the 8051). The port pins
// can also be driven from the Port dialogs (pinDrive).

import type { LogLevel, McuCore, PinBus } from '../core/types.ts';
import { PinMonitor } from './pinmon.ts';
import type { BoardInput, Mcs51BoardConfig, Mcs51BoardSnapshot, SimBoard } from './types.ts';

export function defaultMcs51Config(): Mcs51BoardConfig {
  return {
    clockHz: 11_059_200, variant: 'SST89E516RD2', ledPort: 1, ledActiveLow: false,
    cables: { LBANK: null, KEY: null, LCD_DATA: null, LCD_CTRL: null },
  };
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
  /** latest time handed to the pin monitor (a reset restarts the core's cycle count) */
  private lastT = 0;

  constructor(cfg: Mcs51BoardConfig) {
    this.cfg = cfg;
  }

  attach(mcu: McuCore) {
    this.mcu = mcu;
    this.pinMonitor.reset(0);
    this.lastT = 0;
  }

  private now(cycle = this.mcu?.cycles ?? 0) { return this.mcu ? cycle / this.mcu.cycleHz() : 0; }

  log(level: LogLevel, msg: string) { if (this.logs.length < 500) this.logs.push({ level, msg, t: this.now() }); }

  readInputs(port: number, mask: number) { return ~this.extLow[port] & mask & 0xff; }

  outputsChanged(port: number, level: number, driven: number, cycle: number) {
    // 8051 ports are quasi-bidirectional: a '1' in the latch is a weak pull-up, so
    // for monitoring purposes every pin is "driven" to its latch value.
    this.lastT = Math.max(this.lastT, this.now(cycle));
    this.pinMonitor.update(port, level, 0xff, this.lastT);
    void driven;
  }

  analogVoltage() { return 0; }
  serialTx(byte: number) { if (this.serial.length < 4096) this.serial.push(byte); }

  /** Core reset that keeps the time base running (the pin monitor and the scope need monotonic time). */
  private resetCore() {
    const c = this.mcu.cycles;
    this.mcu.reset();
    this.mcu.cycles = c;
    // the program restarts: a frequency must not be measured across the reset
    this.pinMonitor.clearEdges();
  }

  input(ev: BoardInput) {
    if (ev.kind === 'pinDrive') {
      if (ev.low) this.extLow[ev.port] |= 1 << ev.bit; else this.extLow[ev.port] &= ~(1 << ev.bit);
    } else if (ev.kind === 'button' && ev.id === 'reset') {
      // RST is held high while the button is down: the core stays in reset
      this.resetHeld = ev.pressed;
      if (ev.pressed) this.resetCore();
    } else if (ev.kind === 'power') {
      this.power = ev.on;
      if (!ev.on) this.resetHeld = false;
      if (ev.on) this.resetCore();
    } else if (ev.kind === 'cable') {
      this.cfg.cables ??= { LBANK: null, KEY: null, LCD_DATA: null, LCD_CTRL: null };
      this.cfg.cables[ev.target] = ev.port;
    }
    this.mcu.inputsChanged();
  }

  frame(t: number): Mcs51BoardSnapshot {
    const stats = this.pinMonitor.frame(Math.max(t, this.lastT), 4);
    const portLeds = (port: number, activeLow: boolean) => {
      const d = stats.duty[port];
      // pin level also reflects external pull-downs
      const pins = this.mcu.portState(port).level;
      return d.map((x, i) => {
        const v = (pins >> i) & 1 ? x : 0;
        return this.power ? (activeLow ? 1 - v : v) : 0;
      });
    };
    const leds = portLeds(this.cfg.ledPort, this.cfg.ledActiveLow);
    const bankPort = this.cfg.cables?.LBANK ?? null;
    const bank = bankPort !== null ? portLeds(bankPort, false) : new Array(8).fill(0);
    return {
      kind: 'mcs51', power: this.power, resetHeld: this.resetHeld, leds, bank,
      extLow: [...this.extLow], ledPort: this.cfg.ledPort, ledActiveLow: this.cfg.ledActiveLow,
    };
  }

  drainLogs() { const l = this.logs; this.logs = []; return l; }
  drainSerial() { const s = this.serial; this.serial = []; return s; }
}
