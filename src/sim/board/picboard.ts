// Electrical model of the Smart Logic Technologies "EXCEL PIC V1.0" trainer:
// PIC18F4550 module on a base board with LED bank, push buttons, 4x4 keypad,
// relay, buzzer, L293D DC motor driver, 16x2 LCD, trimmer pot and LM35.
// Connections marked as assumptions live in PicBoardConfig.assumptions.

import type { LogLevel, McuCore, PinBus } from '../core/types.ts';
import type { Pic18 } from '../pic18/pic18.ts';
import { Hd44780 } from './hd44780.ts';
import { PinMonitor } from './pinmon.ts';
import type { BoardInput, PicBoardConfig, PicBoardSnapshot, PinRef, SimBoard } from './types.ts';

/** Analog channel -> [port, bit] on the PIC18F4550. */
const AN_PINS: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 5], [4, 0], [4, 1], [4, 2], [1, 2], [1, 3], [1, 1], [1, 4], [1, 0],
];

export function defaultPicBoardConfig(): PicBoardConfig {
  return {
    crystalHz: 20_000_000,
    cables: { LBANK: 3, KEY: null, LCD_DATA: null, LCD_CTRL: null },
    assumptions: {
      sw0: { port: 1, bit: 0 },
      sw1: { port: 1, bit: 1 },
      relay: { port: 0, bit: 4 },
      buzzer: { port: 0, bit: 5 },
      motorEn: null,
      motorIn1: { port: 2, bit: 2 },
      motorIn2: { port: 2, bit: 1 },
      potChannel: 0,
      lm35Channel: 0,
      lcdRs: 0,
      lcdRw: 1,
      lcdEn: 2,
      ledActiveHigh: true,
      motorRatedRpm: 1000,
      motorSupplyV: 12,
    },
    dips: {
      pb: [true, true],
      periph: [true, true, false, false, false, false],
      dcm: [true, true, true, false, false, false],
      analog: [true, false],
    },
  };
}

const same = (a: PinRef | null, port: number, bit: number) => !!a && a.port === port && a.bit === bit;

export class PicBoard implements PinBus, SimBoard {
  cfg: PicBoardConfig;
  mcu!: Pic18;
  pinMonitor = new PinMonitor();
  portCount = 5;
  lcd: Hd44780;
  power = true;
  resetHeld = false;
  pressed = new Set<string>();
  pot = 0.5;
  temperature = 27;
  contrast = 0.62;
  motorRpm = 0;
  relayOn = false;
  relaySwitches = 0;
  private lastE = 0;
  private logs: { level: LogLevel; msg: string; t: number }[] = [];
  private serial: number[] = [];
  private warned = new Set<string>();

  constructor(cfg: PicBoardConfig) {
    this.cfg = cfg;
    this.lcd = new Hd44780((m) => this.log('warn', m));
  }

  attach(mcu: McuCore) {
    this.mcu = mcu as Pic18;
    this.mcu.crystalHz = this.cfg.crystalHz;
    this.mcu.recalcClock();
    this.pinMonitor.reset(0);
    this.lcd.reset();
    this.lastE = 0;
  }

  private now(cycle = this.mcu?.cycles ?? 0) {
    return this.mcu ? cycle / this.mcu.cycleHz() : 0;
  }

  log(level: LogLevel, msg: string) {
    if (this.logs.length < 500) this.logs.push({ level, msg, t: this.now() });
  }

  private warnOnce(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.log('warn', msg);
  }

  // ------------------------------------------------------------ PinBus
  private outLevel(port: number, bit: number): number | null {
    const m = this.pinMonitor;
    if (!(m.driven[port] & (1 << bit))) return null;
    return (m.level[port] >> bit) & 1;
  }

  private lcdReadActive(): boolean {
    const ctrl = this.cfg.cables.LCD_CTRL;
    if (ctrl === null || this.cfg.cables.LCD_DATA === null) return false;
    const a = this.cfg.assumptions;
    return this.outLevel(ctrl, a.lcdRw) === 1 && this.outLevel(ctrl, a.lcdEn) === 1;
  }

  readInputs(port: number, mask: number): number {
    let v = 0;
    for (let b = 0; b < 8; b++) if (mask & (1 << b) && this.inputLevel(port, b)) v |= 1 << b;
    return v;
  }

  private inputLevel(port: number, bit: number): number {
    const { cables, assumptions: a, dips } = this.cfg;
    let pulledUp = false;
    if (dips.pb[0] && same(a.sw0, port, bit)) { if (this.pressed.has('sw0')) return 0; pulledUp = true; }
    if (dips.pb[1] && same(a.sw1, port, bit)) { if (this.pressed.has('sw1')) return 0; pulledUp = true; }
    if (cables.KEY === port) {
      pulledUp = true;
      for (const id of this.pressed) {
        if (!id.startsWith('key')) continue;
        const k = +id.slice(3);
        const row = k & 3, col = 4 + (k >> 2);
        const other = bit === row ? col : bit === col ? row : -1;
        if (other >= 0 && this.outLevel(port, other) === 0) return 0;
      }
    }
    if (cables.LCD_DATA === port) {
      if (this.lcdReadActive()) {
        const rs = this.outLevel(cables.LCD_CTRL!, a.lcdRs) ?? 1;
        return (this.lcd.readBus(rs, this.now()) >> bit) & 1;
      }
      pulledUp = true; // HD44780 data lines have internal pull-ups
    }
    if (pulledUp) return 1;
    if (port === 1 && this.mcu && this.mcu.pullups(1) & (1 << bit)) return 1;
    return 0; // floating input: reads low
  }

  outputsChanged(port: number, level: number, driven: number, cycle: number) {
    const t = this.now(cycle);
    this.pinMonitor.update(port, level, driven, t);
    const { cables, assumptions: a } = this.cfg;
    if (cables.LCD_CTRL === port && cables.LCD_DATA !== null) {
      const e = this.outLevel(port, a.lcdEn) ?? 0;
      if (this.lastE && !e) {
        const rs = this.outLevel(port, a.lcdRs) ?? 0;
        const rw = this.outLevel(port, a.lcdRw) ?? 0;
        const dp = cables.LCD_DATA;
        const m = this.pinMonitor;
        const bus = (m.level[dp] & m.driven[dp]) | (~m.driven[dp] & 0xff);
        const needed = this.lcd.dl8 ? 0xff : 0xf0;
        if (!rw && (m.driven[dp] & needed) !== needed)
          this.warnOnce('lcd-data-tris', `LCD write while some PORT${'ABCDE'[dp]} data pins are inputs (TRIS=1). Set TRIS${'ABCDE'[dp]} = 0x00.`);
        this.lcd.strobe(rs, rw, bus, t);
      }
      this.lastE = e;
    }
    if (port === a.relay.port && this.cfg.dips.periph[0]) {
      const on = this.outLevel(port, a.relay.bit) === 1;
      if (on !== this.relayOn) { this.relayOn = on; this.relaySwitches++; }
    }
  }

  analogVoltage(port: number, bit: number): number {
    const ch = AN_PINS.findIndex(([p, b]) => p === port && b === bit);
    const { assumptions: a, dips } = this.cfg;
    const pot = dips.analog[0] && ch === a.potChannel;
    const lm = dips.analog[1] && ch === a.lm35Channel;
    if (pot && lm) this.warnOnce('analog-both', `Both the trimmer pot and LM35 are switched onto AN${ch} (ANALOG INP DIP). The pot output dominates.`);
    if (pot) return this.pot * 5;
    if (lm) return this.lm35Volts();
    return 0;
  }

  lm35Volts() { return Math.max(0, this.temperature) * 0.01; }

  serialTx(byte: number) { if (this.serial.length < 4096) this.serial.push(byte); }

  // ------------------------------------------------------------- inputs
  input(ev: BoardInput) {
    switch (ev.kind) {
      case 'button':
        if (ev.pressed) this.pressed.add(ev.id); else this.pressed.delete(ev.id);
        if (ev.id === 'reset') {
          this.resetHeld = ev.pressed;
          if (ev.pressed) { this.mcu.softReset(); this.log('info', 'MCLR reset (RESET button).'); }
        }
        break;
      case 'dip': this.cfg.dips[ev.bank][ev.index] = ev.on; break;
      case 'pot': this.pot = Math.min(1, Math.max(0, ev.value)); break;
      case 'temperature': this.temperature = ev.celsius; break;
      case 'contrast': this.contrast = ev.value; break;
      case 'cable': this.cfg.cables[ev.target] = ev.port; break;
      case 'config':
        this.cfg = ev.cfg;
        if (this.mcu.crystalHz !== ev.cfg.crystalHz) { this.mcu.crystalHz = ev.cfg.crystalHz; this.mcu.recalcClock(); }
        break;
      case 'power':
        this.power = ev.on;
        if (ev.on) { this.mcu.reset(); this.lcd.reset(); this.lastE = 0; this.motorRpm = 0; }
        break;
      default: break;
    }
    this.mcu.inputsChanged();
  }

  // ------------------------------------------------------------- frame
  frame(t: number, dt: number): PicBoardSnapshot {
    const stats = this.pinMonitor.frame(t, 5);
    const { cables, assumptions: a, dips } = this.cfg;
    const duty = (p: PinRef | null) => (p ? stats.duty[p.port][p.bit] : 1);
    const leds = new Array(8).fill(0);
    if (cables.LBANK !== null && this.power) {
      for (let i = 0; i < 8; i++) {
        const d = stats.duty[cables.LBANK][i];
        const driven = this.pinMonitor.driven[cables.LBANK] & (1 << i);
        leds[i] = a.ledActiveHigh ? d : driven ? 1 - d : 0;
      }
    }
    const en = dips.dcm[0] ? (a.motorEn ? duty(a.motorEn) : 1) : 0;
    const in1 = dips.dcm[1] ? duty(a.motorIn1) : 0;
    const in2 = dips.dcm[2] ? duty(a.motorIn2) : 0;
    const drive = this.power ? en * (in1 * (1 - in2) - in2 * (1 - in1)) : 0;
    const target = drive * a.motorRatedRpm;
    this.motorRpm += (target - this.motorRpm) * (1 - Math.exp(-dt / 0.25));
    if (Math.abs(this.motorRpm) < 0.05 && target === 0) this.motorRpm = 0;
    const buzzer = this.power && dips.periph[1] ? duty(a.buzzer) : 0;
    const inputs: Record<string, boolean> = {};
    for (const id of this.pressed) inputs[id] = true;
    return {
      kind: 'pic',
      power: this.power,
      resetHeld: this.resetHeld,
      leds,
      lcd: this.lcd.snapshot(),
      lcdContrast: this.contrast,
      relay: this.power && this.relayOn,
      relaySwitches: this.relaySwitches,
      buzzer,
      motor: { rpm: this.motorRpm, drive, dutyIn1: in1, dutyIn2: in2 },
      pot: this.pot,
      potVolts: this.pot * 5,
      temperature: this.temperature,
      lm35Volts: this.lm35Volts(),
      inputs,
      dips: structuredClone(dips),
      cables: { ...cables },
    };
  }

  drainLogs() { const l = this.logs; this.logs = []; return l; }
  drainSerial() { const s = this.serial; this.serial = []; return s; }
}
