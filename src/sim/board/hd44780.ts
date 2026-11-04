// HD44780-compatible character LCD controller (JHD162A 16x2 module).
// Driven purely by bus transactions latched on the falling edge of E.

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
}

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
  private lastBusyWarn = -1;

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
  }

  /** Bus cycle completed on the falling edge of E. `bus` holds D7..D0 as driven by the MCU. */
  strobe(rs: number, rw: number, bus: number, t: number) {
    if (rw) {
      // read cycle: address counter auto-increments after a data read
      if (rs && (this.dl8 || this.pendingNibble < 0)) this.advance();
      if (!this.dl8) this.pendingNibble = this.pendingNibble < 0 ? 1 : -1;
      return;
    }
    let value: number;
    if (this.dl8) value = bus & 0xff;
    else {
      const nib = (bus >> 4) & 0x0f;
      if (this.pendingNibble < 0) { this.pendingNibble = nib; return; }
      value = (this.pendingNibble << 4) | nib;
      this.pendingNibble = -1;
    }
    if (t < this.busyUntil) {
      if (t - this.lastBusyWarn > 0.5) {
        this.lastBusyWarn = t;
        this.warn(`LCD written while busy (${((this.busyUntil - t) * 1e6).toFixed(0)} µs early). A real HD44780 may ignore this ${rs ? 'data' : 'command'} — increase the delay or poll the busy flag.`);
      }
    }
    this.everWritten = true;
    if (rs) this.writeData(value, t); else this.command(value, t);
  }

  /** Value the LCD drives on D7..D0 during a read (RW=1, E=1). */
  readBus(rs: number, t: number): number {
    if (!rs) return (t < this.busyUntil ? 0x80 : 0) | (this.ac & 0x7f);
    return this.cgMode ? this.cgram[this.ac & 0x3f] : this.ddram[this.ddIndex(this.ac)];
  }

  private command(v: number, t: number) {
    let busy = 37e-6;
    if (v === 0x01) {
      this.ddram.fill(0x20); this.ac = 0; this.cgMode = false; this.increment = true; this.shift = 0;
      busy = 1.52e-3;
    } else if ((v & 0xfe) === 0x02) {
      this.ac = 0; this.cgMode = false; this.shift = 0;
      busy = 1.52e-3;
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
  }

  private writeData(v: number, t: number) {
    if (this.cgMode) this.cgram[this.ac & 0x3f] = v & 0x1f;
    else this.ddram[this.ddIndex(this.ac)] = v;
    this.advance();
    if (!this.cgMode && this.shiftOnWrite) this.shift = (this.shift + (this.increment ? 1 : -1) + 40) % 40;
    this.busyUntil = t + 41e-6;
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
      initialized: this.everWritten, dl8: this.dl8,
    };
  }
}
