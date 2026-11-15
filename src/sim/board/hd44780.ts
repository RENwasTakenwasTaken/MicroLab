// HD44780-compatible character LCD controller (JHD162A 16x2 module).
// Driven purely by bus transactions latched on the falling edge of E.
//
// Timing faults (HD44780U datasheet, VCC = 5 V): a write is ignored when it arrives while the
// controller is still busy with the previous one, during the ~10 ms internal reset after power-up,
// or when the EN pulse is shorter than PWEH. Each fault is logged once per run with its fix and
// counted in the snapshot (the 3D LCD shows an overlay).

/** Why the LCD ignored a write. */
export type LcdFault = 'busy' | 'powerOn' | 'pulse';

export const LCD_TIMING = {
  /** minimum EN high time, PWEH */
  pulseMin: 230e-9,
  /**
   * internal reset after the supply comes up: "the busy state lasts for 10 ms after VCC rises to
   * 4.5 V". The datasheet's init flowchart asks for more than 15 ms of margin; the lab's Expt 6
   * program sends its first command ~12.8 ms after start-up and works on the real kit.
   */
  powerOn: 10e-3,
  cmd: 37e-6,
  /** data write: 37 µs + tADD */
  data: 41e-6,
  /** clear display / return home */
  home: 1.52e-3,
};

export interface LcdSnapshot {
  rows: number[][]; // character codes visible on each row (16 columns)
  displayOn: boolean;
  cursor: boolean;
  blink: boolean;
  cursorRow: number;
  cursorCol: number;
  twoLine: boolean;
  cgram: number[];
  initialized: boolean;
  dl8: boolean;
  /** writes ignored since power-on or the last MCU reset, by cause */
  faults: Record<LcdFault, number>;
}

const COMMANDS: [number, number, string][] = [
  [0xff, 0x01, 'Clear display'], [0xfe, 0x02, 'Return home'], [0xfc, 0x04, 'Entry mode set'],
  [0xf8, 0x08, 'Display on/off control'], [0xf0, 0x10, 'Cursor/display shift'], [0xe0, 0x20, 'Function set'],
  [0xc0, 0x40, 'Set CGRAM address'], [0x80, 0x80, 'Set DDRAM address'],
];
const hex2 = (v: number) => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;
const cmdName = (v: number) => COMMANDS.find(([m, c]) => (v & m) === c)?.[2] ?? 'command';
const describe = (rs: number, v: number) =>
  rs ? (v >= 0x20 && v < 0x7f ? `character '${String.fromCharCode(v)}'` : `data ${hex2(v)}`) : `command ${hex2(v)} (${cmdName(v)})`;
const fmtTime = (s: number) => (s >= 1e-3 ? `${(s * 1e3).toFixed(2)} ms` : s >= 1e-6 ? `${(s * 1e6).toFixed(0)} µs` : `${(s * 1e9).toFixed(0)} ns`);
/** counts of the lab's delay() routine (165 inner passes ≈ 125 µs at 48 MHz) covering `s` with margin */
const delayCounts = (s: number) => Math.max(1, Math.ceil((s * 1.3) / 125e-6));

export class Hd44780 {
  readonly cols: number;
  readonly rowsN: number;
  ddram = new Uint8Array(80).fill(0x20);
  cgram = new Uint8Array(64);
  ac = 0;
  cgMode = false;
  increment = true;
  shiftOnWrite = false;
  displayOn = false;
  cursor = false;
  blink = false;
  dl8 = true;
  twoLine = false;
  shift = 0;
  busyUntil = 0;
  pendingNibble = -1;
  everWritten = false;
  warn: (msg: string) => void;
  /** end of the internal reset after power-up */
  powerOnUntil = 0;
  private poweredAt = 0;
  faults: Record<LcdFault, number> = { busy: 0, powerOn: 0, pulse: 0 };
  private logged = new Set<LcdFault>();
  /** the operation keeping the controller busy: its description and duration */
  private lastOp = { what: '', dur: 0 };

  constructor(warn: (msg: string) => void, cols = 16, rows = 2) {
    this.warn = warn;
    this.cols = cols;
    this.rowsN = rows;
  }

  reset() {
    this.ddram.fill(0x20);
    this.cgram.fill(0);
    this.ac = 0; this.cgMode = false; this.increment = true; this.shiftOnWrite = false;
    this.displayOn = false; this.cursor = false; this.blink = false;
    this.dl8 = true; this.twoLine = false; this.shift = 0; this.busyUntil = 0;
    this.pendingNibble = -1; this.everWritten = false;
    this.powerOnUntil = 0;
    this.clearFaults();
  }

  /** The supply has just come up at time t: the controller runs its internal reset first. */
  powerUp(t: number) {
    this.reset();
    this.poweredAt = t;
    this.powerOnUntil = this.busyUntil = t + LCD_TIMING.powerOn;
  }

  /**
   * The MCU restarts (RESET button, bootloader handing over) while the LCD stays powered. Simulated
   * time stands still while RESET is held or the bootloader waits, but real time passes, so any
   * internal operation has finished. The LCD keeps its contents and mode (a 4-bit nibble pairing too).
   */
  settle() {
    this.busyUntil = 0;
    this.powerOnUntil = 0;
    this.clearFaults();
  }

  private clearFaults() {
    this.faults = { busy: 0, powerOn: 0, pulse: 0 };
    this.logged.clear();
  }

  /** Bus cycle completed on the falling edge of E. `bus` holds D7..D0 as driven by the MCU; `pulse` is how long E was high. */
  strobe(rs: number, rw: number, bus: number, t: number, pulse = Infinity) {
    if (rw) {
      // read cycle: address counter auto-increments after a data read
      if (rs && (this.dl8 || this.pendingNibble < 0)) this.advance();
      if (!this.dl8) this.pendingNibble = this.pendingNibble < 0 ? 1 : -1;
      return;
    }
    // a write the controller does not latch leaves its state (and a 4-bit nibble pairing) untouched
    const what = this.dl8 ? describe(rs, bus & 0xff) : `${rs ? 'data' : 'command'} nibble 0x${((bus >> 4) & 0x0f).toString(16).toUpperCase()}`;
    if (pulse < LCD_TIMING.pulseMin) return this.fault('pulse', what, t, pulse);
    if (t < this.powerOnUntil) return this.fault('powerOn', what, t, pulse);
    if (t < this.busyUntil) return this.fault('busy', what, t, pulse);
    let value: number;
    if (this.dl8) value = bus & 0xff;
    else {
      const nib = (bus >> 4) & 0x0f;
      if (this.pendingNibble < 0) { this.pendingNibble = nib; return; }
      value = (this.pendingNibble << 4) | nib;
      this.pendingNibble = -1;
    }
    this.everWritten = true;
    if (rs) this.writeData(value, t); else this.command(value, t);
    this.lastOp.what = describe(rs, value);
  }

  private fault(kind: LcdFault, what: string, t: number, pulse: number) {
    this.faults[kind]++;
    if (this.logged.has(kind)) return;
    this.logged.add(kind);
    if (kind === 'pulse') {
      this.warn(`LCD ignored ${what}: EN was high for only ${fmtTime(pulse)}, and the LCD latches a write only after an enable pulse of at least 230 ns (HD44780 datasheet, PWEH). At 48 MHz one instruction takes 83 ns, so EN = 1; EN = 0; back to back is too short. How to fix: wait between EN = 1 and EN = 0, e.g. delay(1).`);
    } else if (kind === 'powerOn') {
      this.warn(`LCD ignored ${what}: it was sent ${fmtTime(t - this.poweredAt)} after power-on. For about 10 ms after the supply comes up the LCD controller resets itself and ignores every write (the datasheet asks you to wait more than 15 ms). How to fix: wait before the first LCD command, e.g. delay(160) (~20 ms) at the start of lcd_init(). Pressing RESET hides this bug, because the LCD stays powered through an MCU reset; it shows only after switching the board on.`);
    } else {
      const { what: prev, dur } = this.lastOp;
      this.warn(`LCD ignored ${what}: it arrived ${fmtTime(this.busyUntil - t)} before the LCD had finished the previous ${prev || 'write'}, which takes ${fmtTime(dur)}. How to fix: wait at least ${fmtTime(dur)} after it before the next write, e.g. delay(${delayCounts(dur)}) with the lab's delay() routine (1 count ≈ 125 µs at 48 MHz).`);
    }
  }

  /** Value the LCD drives on D7..D0 during a read (RW=1, E=1). */
  readBus(rs: number, t: number): number {
    if (!rs) return (t < this.busyUntil ? 0x80 : 0) | (this.ac & 0x7f);
    return this.cgMode ? this.cgram[this.ac & 0x3f] : this.ddram[this.ddIndex(this.ac)];
  }

  private command(v: number, t: number) {
    let busy = LCD_TIMING.cmd;
    if (v === 0x01) {
      this.ddram.fill(0x20); this.ac = 0; this.cgMode = false; this.increment = true; this.shift = 0;
      busy = LCD_TIMING.home;
    } else if ((v & 0xfe) === 0x02) {
      this.ac = 0; this.cgMode = false; this.shift = 0;
      busy = LCD_TIMING.home;
    } else if ((v & 0xfc) === 0x04) {
      this.increment = !!(v & 0x02); this.shiftOnWrite = !!(v & 0x01);
    } else if ((v & 0xf8) === 0x08) {
      this.displayOn = !!(v & 0x04); this.cursor = !!(v & 0x02); this.blink = !!(v & 0x01);
    } else if ((v & 0xf0) === 0x10) {
      const right = !!(v & 0x04);
      if (v & 0x08) this.shift = (this.shift + (right ? -1 : 1) + 40) % 40;
      else this.moveAc(right ? 1 : -1);
    } else if ((v & 0xe0) === 0x20) {
      this.dl8 = !!(v & 0x10); this.twoLine = !!(v & 0x08);
      this.pendingNibble = -1;
    } else if ((v & 0xc0) === 0x40) {
      this.ac = v & 0x3f; this.cgMode = true;
    } else if (v & 0x80) {
      this.ac = v & 0x7f; this.cgMode = false;
    }
    this.busyUntil = t + busy;
    this.lastOp.dur = busy;
  }

  private writeData(v: number, t: number) {
    if (this.cgMode) this.cgram[this.ac & 0x3f] = v & 0x1f;
    else this.ddram[this.ddIndex(this.ac)] = v;
    this.advance();
    if (!this.cgMode && this.shiftOnWrite) this.shift = (this.shift + (this.increment ? 1 : -1) + 40) % 40;
    this.busyUntil = t + LCD_TIMING.data;
    this.lastOp.dur = LCD_TIMING.data;
  }

  private advance() { this.moveAc(this.increment ? 1 : -1); }

  private moveAc(d: number) {
    if (this.cgMode) { this.ac = (this.ac + d) & 0x3f; return; }
    if (!this.twoLine) { this.ac = (this.ac + d + 80) % 80; return; }
    let line = this.ac >= 0x40 ? 1 : 0;
    let col = (this.ac & 0x3f) + d;
    if (col > 0x27) { col = 0; line ^= 1; }
    else if (col < 0) { col = 0x27; line ^= 1; }
    this.ac = line * 0x40 + col;
  }

  private ddIndex(ac: number) {
    if (!this.twoLine) return ac % 80;
    return (ac >= 0x40 ? 40 : 0) + (Math.min(ac & 0x3f, 0x27));
  }

  snapshot(): LcdSnapshot {
    const rows: number[][] = [];
    for (let r = 0; r < this.rowsN; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.cols; c++) {
        if (!this.twoLine) {
          // 1-line mode: only the first row is driven on a 16x2 glass
          row.push(r === 0 ? this.ddram[(c + this.shift) % 80] : -1);
        } else row.push(this.ddram[r * 40 + ((c + this.shift) % 40)]);
      }
      rows.push(row);
    }
    let cursorRow = 0, cursorCol = -1;
    if (!this.cgMode) {
      if (this.twoLine) {
        cursorRow = this.ac >= 0x40 ? 1 : 0;
        cursorCol = ((this.ac & 0x3f) - this.shift + 40) % 40;
      } else cursorCol = (this.ac - this.shift + 80) % 80;
      if (cursorCol >= this.cols) cursorCol = -1;
    }
    return {
      rows, displayOn: this.displayOn, cursor: this.cursor, blink: this.blink,
      cursorRow, cursorCol, twoLine: this.twoLine, cgram: Array.from(this.cgram),
      initialized: this.everWritten, dl8: this.dl8, faults: { ...this.faults },
    };
  }
}
