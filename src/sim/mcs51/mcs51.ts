// 8051 / 8052 (AT89C51 / AT89S52) instruction-level emulator.
// Full MCS-51 instruction set, quasi-bidirectional ports with latch/pin
// distinction for read-modify-write instructions, Timer 0/1 (modes 0-3),
// Timer 2 (auto-reload / capture / baud generator), UART, external interrupts
// and two-level interrupt priority. Timing is in machine cycles (12 clocks).

import { parseIntelHex } from '../core/hex.ts';
import type { McuCore, PinBus } from '../core/types.ts';

export const SFR51: Record<string, number> = {
  P0: 0x80, SP: 0x81, DPL: 0x82, DPH: 0x83, PCON: 0x87, TCON: 0x88, TMOD: 0x89,
  TL0: 0x8a, TL1: 0x8b, TH0: 0x8c, TH1: 0x8d, P1: 0x90, SCON: 0x98, SBUF: 0x99,
  P2: 0xa0, IE: 0xa8, P3: 0xb0, IP: 0xb8, T2CON: 0xc8, RCAP2L: 0xca, RCAP2H: 0xcb,
  TL2: 0xcc, TH2: 0xcd, PSW: 0xd0, ACC: 0xe0, B: 0xf0,
};

const PSW = 0xd0, ACC = 0xe0, B = 0xf0, SP = 0x81, DPL = 0x82, DPH = 0x83;
const TCON = 0x88, TMOD = 0x89, TL0 = 0x8a, TL1 = 0x8b, TH0 = 0x8c, TH1 = 0x8d;
const SCON = 0x98, SBUF = 0x99, IE = 0xa8, IP = 0xb8, PCON = 0x87;
const T2CON = 0xc8, RCAP2L = 0xca, RCAP2H = 0xcb, TL2 = 0xcc, TH2 = 0xcd;
const CY = 0x80, AC = 0x40, OVF = 0x04;
const PORT_ADDR = [0x80, 0x90, 0xa0, 0xb0];

/** Machine cycles per opcode. */
const CYCLES = new Uint8Array(256).fill(1);
(() => {
  const two = [0x02, 0x10, 0x12, 0x20, 0x22, 0x30, 0x32, 0x40, 0x43, 0x50, 0x53, 0x60, 0x63, 0x70, 0x72, 0x73, 0x75, 0x80,
    0x82, 0x83, 0x85, 0x86, 0x87, 0x90, 0x92, 0x93, 0xa0, 0xa3, 0xa6, 0xa7, 0xb0, 0xb4, 0xb5, 0xb6, 0xb7, 0xc0, 0xd0,
    0xd5, 0xe0, 0xe2, 0xe3, 0xf0, 0xf2, 0xf3];
  for (const o of two) CYCLES[o] = 2;
  for (let i = 0; i < 8; i++) {
    CYCLES[0x01 + i * 0x20] = 2; CYCLES[0x11 + i * 0x20] = 2; // AJMP / ACALL
    CYCLES[0x88 + i] = 2; CYCLES[0xa8 + i] = 2; CYCLES[0xb8 + i] = 2; CYCLES[0xd8 + i] = 2;
  }
  CYCLES[0x84] = 4; CYCLES[0xa4] = 4;
})();

/** Byte length per opcode (for the disassembler / skip logic). */
export const LEN51 = new Uint8Array(256).fill(1);
(() => {
  const two = [0x05, 0x15, 0x24, 0x25, 0x34, 0x35, 0x40, 0x42, 0x44, 0x45, 0x50, 0x52, 0x54, 0x55, 0x60, 0x62, 0x64, 0x65,
    0x70, 0x72, 0x74, 0x80, 0x82, 0x86, 0x87, 0x92, 0x94, 0x95, 0xa0, 0xa2, 0xa6, 0xa7, 0xb0, 0xb2, 0xc0, 0xc2, 0xc5,
    0xd0, 0xd2, 0xe5, 0xf5, 0x76, 0x77];
  const three = [0x02, 0x10, 0x12, 0x20, 0x30, 0x43, 0x53, 0x63, 0x75, 0x85, 0x90, 0xb4, 0xb5, 0xb6, 0xb7, 0xd5];
  for (const o of two) LEN51[o] = 2;
  for (const o of three) LEN51[o] = 3;
  for (let i = 0; i < 8; i++) {
    LEN51[0x01 + i * 0x20] = 2; LEN51[0x11 + i * 0x20] = 2;
    LEN51[0x78 + i] = 2; LEN51[0x88 + i] = 2; LEN51[0xa8 + i] = 2; LEN51[0xd8 + i] = 2;
    LEN51[0xb8 + i] = 3;
  }
})();

export class Mcs51 implements McuCore {
  readonly arch = 'mcs51' as const;
  readonly name: string;
  code = new Uint8Array(0x10000);
  iram = new Uint8Array(256);
  sfr = new Uint8Array(256); // index 0x80..0xff used
  xram = new Uint8Array(0x10000);
  pc = 0;
  cycles = 0;
  clockHz = 11_059_200;
  is8052: boolean;
  bus: PinBus;
  /** External pin levels (1 = released / pulled up). */
  pins = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
  // interrupt state
  inService = [false, false]; // [low priority active, high priority active]
  irqBlock = 0;
  // serial
  sbufRx = 0;
  txDoneAt = -1;
  txByte = 0;
  rxQueue: number[] = [];
  rxNextAt = -1;
  lastPins = new Uint8Array(4);
  idle = false;
  powerDown = false;
  lastTrap = '';

  /** on-chip flash size (bytes) */
  flashSize: number;

  constructor(bus: PinBus, variant: 'AT89C51' | 'AT89S52' | 'SST89E516RD2' = 'AT89C51') {
    this.bus = bus;
    this.name = variant;
    // SST89E516RD2: 8052 core (256 B IRAM, Timer 2) with 64 KB flash
    this.is8052 = variant !== 'AT89C51';
    this.flashSize = variant === 'SST89E516RD2' ? 0x10000 : this.is8052 ? 0x2000 : 0x1000;
    this.reset();
  }

  cycleHz() { return this.clockHz / 12; }

  loadHex(text: string) {
    this.code.fill(0xff);
    let bytes = 0;
    for (const seg of parseIntelHex(text)) {
      for (let i = 0; i < seg.data.length; i++) {
        const a = seg.address + i;
        if (a < 0x10000) { this.code[a] = seg.data[i]; bytes++; }
      }
    }
    const warnings: string[] = [];
    const limit = this.flashSize;
    let top = 0;
    for (const seg of parseIntelHex(text)) top = Math.max(top, seg.address + seg.data.length);
    if (top > limit) warnings.push(`Program size (${top} bytes) exceeds the ${limit / 1024} KB on-chip flash of the ${this.name}.`);
    this.reset();
    return { bytes, warnings };
  }

  reset() {
    this.iram.fill(0);
    this.sfr.fill(0);
    this.sfr[SP] = 0x07;
    for (const p of PORT_ADDR) this.sfr[p] = 0xff;
    this.pc = 0;
    this.cycles = 0;
    this.inService = [false, false];
    this.irqBlock = 0;
    this.txDoneAt = -1;
    this.rxNextAt = -1;
    this.rxQueue = [];
    this.idle = false;
    this.powerDown = false;
    for (let p = 0; p < 4; p++) this.bus.outputsChanged(p, 0xff, 0x00, 0);
    this.inputsChanged();
  }

  // ---------------------------------------------------------- ports
  /** Pin level = latch AND external drive (quasi-bidirectional with pull-ups). */
  private pinValue(p: number): number {
    const latch = this.sfr[PORT_ADDR[p]];
    const ext = this.bus.readInputs(p, latch);
    return latch & (ext | ~latch) & 0xff;
  }

  portState(p: number) {
    const latch = this.sfr[PORT_ADDR[p]];
    return { lat: latch, tris: latch, level: this.pinValue(p), analog: 0 };
  }

  private portWritten(p: number) {
    const latch = this.sfr[PORT_ADDR[p]];
    // A '0' in the latch actively drives the pin low; '1' is a weak pull-up.
    this.bus.outputsChanged(p, latch, ~latch & 0xff, this.cycles);
    this.refreshPort(p);
  }

  inputsChanged() {
    for (let p = 0; p < 4; p++) this.refreshPort(p);
  }

  private refreshPort(p: number) {
    const now = this.pinValue(p);
    const prev = this.lastPins[p];
    this.lastPins[p] = now;
    if (p !== 3) return;
    const fell = prev & ~now;
    const s = this.sfr;
    // INT0 (P3.2) / INT1 (P3.3): edge-triggered when ITx = 1
    if (fell & 0x04 && s[TCON] & 0x01) s[TCON] |= 0x02;
    if (fell & 0x08 && s[TCON] & 0x04) s[TCON] |= 0x08;
    // counter mode: T0 (P3.4), T1 (P3.5) count falling edges
    const tmod = s[TMOD];
    if (fell & 0x10 && tmod & 0x04 && this.timerRuns(0)) this.timerInc(0, 1);
    if (fell & 0x20 && tmod & 0x40 && this.timerRuns(1)) this.timerInc(1, 1);
  }

  // ------------------------------------------------------ memory access
  /** Direct address read. `latch` = read-modify-write semantics for ports. */
  rdDirect(a: number, latch = false): number {
    if (a < 0x80) return this.iram[a];
    switch (a) {
      case 0x80: case 0x90: case 0xa0: case 0xb0:
        return latch ? this.sfr[a] : this.pinValue((a - 0x80) >> 4);
      case PSW: return this.psw();
      case SBUF: return this.sbufRx;
      default: return this.sfr[a];
    }
  }

  wrDirect(a: number, v: number) {
    v &= 0xff;
    if (a < 0x80) { this.iram[a] = v; return; }
    switch (a) {
      case 0x80: case 0x90: case 0xa0: case 0xb0:
        this.sfr[a] = v; this.portWritten((a - 0x80) >> 4); return;
      case SBUF: this.txStart(v); return;
      case IE: case IP: this.sfr[a] = v; this.irqBlock = 1; return;
      case PCON:
        this.sfr[a] = v;
        if (v & 0x02) { this.powerDown = true; this.bus.log('info', 'Power-down mode entered (PCON.PD).'); }
        else if (v & 0x01) this.idle = true;
        return;
      default: this.sfr[a] = v;
    }
  }

  private psw() {
    let a = this.sfr[ACC];
    a ^= a >> 4; a ^= a >> 2; a ^= a >> 1;
    return (this.sfr[PSW] & 0xfe) | (a & 1);
  }

  private bitAddr(b: number): [number, number] {
    return b < 0x80 ? [0x20 + (b >> 3), b & 7] : [b & 0xf8, b & 7];
  }

  rdBit(b: number, latch = false): number {
    const [a, n] = this.bitAddr(b);
    return (this.rdDirect(a, latch) >> n) & 1;
  }

  wrBit(b: number, v: number) {
    const [a, n] = this.bitAddr(b);
    const cur = this.rdDirect(a, true);
    this.wrDirect(a, v ? cur | (1 << n) : cur & ~(1 << n));
  }

  private get A() { return this.sfr[ACC]; }
  private set A(v: number) { this.sfr[ACC] = v & 0xff; }
  private get cy() { return this.sfr[PSW] >> 7; }
  private setCy(c: number) { this.sfr[PSW] = c ? this.sfr[PSW] | CY : this.sfr[PSW] & ~CY; }
  private rn(n: number) { return (this.sfr[PSW] & 0x18) + n; }
  private get dptr() { return (this.sfr[DPH] << 8) | this.sfr[DPL]; }
  private set dptr(v: number) { this.sfr[DPH] = (v >> 8) & 0xff; this.sfr[DPL] = v & 0xff; }

  private fetch() { const b = this.code[this.pc]; this.pc = (this.pc + 1) & 0xffff; return b; }
  private rel(off: number) { this.pc = (this.pc + ((off << 24) >> 24)) & 0xffff; }

  private push(v: number) {
    const sp = (this.sfr[SP] + 1) & 0xff;
    this.sfr[SP] = sp;
    this.iram[sp] = v & 0xff;
  }

  private pop() {
    const sp = this.sfr[SP];
    this.sfr[SP] = (sp - 1) & 0xff;
    return this.iram[sp];
  }

  private add(v: number, c: number) {
    const a = this.A;
    const r = a + v + c;
    let psw = this.sfr[PSW] & ~(CY | AC | OVF);
    if (r > 0xff) psw |= CY;
    if ((a & 0xf) + (v & 0xf) + c > 0xf) psw |= AC;
    if (~(a ^ v) & (a ^ r) & 0x80) psw |= OVF;
    this.sfr[PSW] = psw;
    this.A = r;
  }

  private subb(v: number) {
    const a = this.A, c = this.cy;
    const r = a - v - c;
    let psw = this.sfr[PSW] & ~(CY | AC | OVF);
    if (r < 0) psw |= CY;
    if ((a & 0xf) - (v & 0xf) - c < 0) psw |= AC;
    if ((a ^ v) & (a ^ r) & 0x80) psw |= OVF;
    this.sfr[PSW] = psw;
    this.A = r;
  }

  // ---------------------------------------------------------- timers
  private timerRuns(t: number): boolean {
    const s = this.sfr;
    const mode = (s[TMOD] >> (t * 4)) & 0x0f;
    const tr = t === 0 ? s[TCON] & 0x10 : s[TCON] & 0x40;
    if (!tr) return false;
    if (mode & 0x08) return !!(this.lastPins[3] & (t === 0 ? 0x04 : 0x08)); // GATE
    return true;
  }

  private timerInc(t: number, n: number) {
    const s = this.sfr;
    const mode = (s[TMOD] >> (t * 4)) & 3;
    const TL = t === 0 ? TL0 : TL1, TH = t === 0 ? TH0 : TH1;
    const tf = t === 0 ? 0x20 : 0x80;
    switch (mode) {
      case 0: { // 13-bit
        let v = ((s[TH] << 5) | (s[TL] & 0x1f)) + n;
        if (v > 0x1fff) { s[TCON] |= tf; v &= 0x1fff; }
        s[TH] = v >> 5; s[TL] = (s[TL] & 0xe0) | (v & 0x1f);
        break;
      }
      case 1: { // 16-bit
        let v = ((s[TH] << 8) | s[TL]) + n;
        if (v > 0xffff) { s[TCON] |= tf; v &= 0xffff; }
        s[TH] = v >> 8; s[TL] = v & 0xff;
        break;
      }
      case 2: { // 8-bit auto reload
        let v = s[TL] + n;
        while (v > 0xff) { s[TCON] |= tf; v = v - 0x100 + s[TH]; }
        s[TL] = v;
        break;
      }
      case 3: // timer 0 split: TL0 uses T0 controls; timer 1 halts in mode 3
        if (t === 0) {
          const v = s[TL0] + n;
          if (v > 0xff) s[TCON] |= 0x20;
          s[TL0] = v & 0xff;
        }
        break;
    }
  }

  private tick(n: number) {
    this.cycles += n;
    const s = this.sfr;
    const tmod = s[TMOD];
    if (!(tmod & 0x04) && this.timerRuns(0)) this.timerInc(0, n);
    if ((tmod & 0x03) === 0x03 && s[TCON] & 0x40) { // TH0 as 8-bit timer controlled by TR1
      const v = s[TH0] + n;
      if (v > 0xff) s[TCON] |= 0x80;
      s[TH0] = v & 0xff;
    } else if (!(tmod & 0x40) && (tmod & 0x30) !== 0x30 && this.timerRuns(1)) this.timerInc(1, n);
    if (this.is8052 && s[T2CON] & 0x04) this.timer2(n);
    if (this.txDoneAt >= 0 && this.cycles >= this.txDoneAt) {
      this.txDoneAt = -1;
      s[SCON] |= 0x02; // TI
      this.bus.serialTx(this.txByte);
    }
    if (this.rxNextAt >= 0 && this.cycles >= this.rxNextAt) {
      const b = this.rxQueue.shift()!;
      if (s[SCON] & 0x10) { // REN
        this.sbufRx = b;
        s[SCON] |= 0x01; // RI
      }
      this.rxNextAt = this.rxQueue.length ? this.cycles + this.charCycles() : -1;
    }
  }

  private timer2(n: number) {
    const s = this.sfr;
    if (s[T2CON] & 0x02) return; // counter mode on T2 pin: not modelled
    let v = ((s[TH2] << 8) | s[TL2]) + n;
    const baud = s[T2CON] & 0x30;
    const capture = s[T2CON] & 0x01 && !baud;
    while (v > 0xffff) {
      if (!baud) s[T2CON] |= 0x80; // TF2
      v = capture ? v - 0x10000 : v - 0x10000 + ((s[RCAP2H] << 8) | s[RCAP2L]);
    }
    s[TH2] = (v >> 8) & 0xff; s[TL2] = v & 0xff;
  }

  // ---------------------------------------------------------- serial
  baudRate(): number {
    const s = this.sfr;
    const mode = s[SCON] >> 6;
    const f = this.clockHz;
    if (mode === 0) return f / 12;
    if (mode === 2) return f / (s[PCON] & 0x80 ? 32 : 64);
    if (this.is8052 && s[T2CON] & 0x30) {
      const rcap = (s[RCAP2H] << 8) | s[RCAP2L];
      return f / (32 * (65536 - rcap));
    }
    const tm1 = (s[TMOD] >> 4) & 3;
    let ovfRate: number;
    if (tm1 === 2) ovfRate = f / 12 / (256 - s[TH1]);
    else if (tm1 === 1) ovfRate = f / 12 / 65536;
    else ovfRate = f / 12 / 8192;
    return (ovfRate * (s[PCON] & 0x80 ? 2 : 1)) / 32;
  }

  private charCycles() {
    const mode = this.sfr[SCON] >> 6;
    const bits = mode === 0 ? 8 : mode === 1 ? 10 : 11;
    return Math.max(1, Math.round((bits / this.baudRate()) * this.cycleHz()));
  }

  private txStart(v: number) {
    this.txByte = v;
    this.txDoneAt = this.cycles + this.charCycles();
  }

  serialRx(byte: number) {
    this.rxQueue.push(byte & 0xff);
    if (this.rxNextAt < 0) this.rxNextAt = this.cycles + this.charCycles();
  }

  // ------------------------------------------------------- interrupts
  private checkIrq(): number {
    const s = this.sfr;
    const ie = s[IE];
    if (!(ie & 0x80)) return -1;
    const tcon = s[TCON];
    // level-triggered external interrupts follow the pin
    if (!(tcon & 0x01)) { if (!(this.lastPins[3] & 0x04)) s[TCON] |= 0x02; else s[TCON] &= ~0x02; }
    if (!(tcon & 0x04)) { if (!(this.lastPins[3] & 0x08)) s[TCON] |= 0x08; else s[TCON] &= ~0x08; }
    const t = s[TCON];
    const req = [
      ie & 0x01 && t & 0x02,
      ie & 0x02 && t & 0x20,
      ie & 0x04 && t & 0x08,
      ie & 0x08 && t & 0x80,
      ie & 0x10 && s[SCON] & 0x03,
      this.is8052 && ie & 0x20 && s[T2CON] & 0xc0,
    ];
    const ip = s[IP];
    for (const level of [1, 0]) {
      if (this.inService[1] || (level === 0 && this.inService[0])) continue;
      for (let i = 0; i < req.length; i++) {
        if (req[i] && ((ip >> i) & 1) === level) return i;
      }
    }
    return -1;
  }

  // ------------------------------------------------------------- step
  step(): number {
    if (this.powerDown) { this.tick(1); return 1; }
    if (this.irqBlock) this.irqBlock--;
    else {
      const irq = this.checkIrq();
      if (irq >= 0) {
        this.idle = false;
        const s = this.sfr;
        const level = (s[IP] >> irq) & 1;
        this.inService[level] = true;
        if (irq === 0 && s[TCON] & 0x01) s[TCON] &= ~0x02;
        if (irq === 1) s[TCON] &= ~0x20;
        if (irq === 2 && s[TCON] & 0x04) s[TCON] &= ~0x08;
        if (irq === 3) s[TCON] &= ~0x80;
        this.push(this.pc & 0xff);
        this.push(this.pc >> 8);
        this.pc = 0x03 + irq * 8;
        this.tick(2);
        return 2;
      }
    }
    if (this.idle) { this.tick(1); return 1; }
    const op = this.fetch();
    const cyc = CYCLES[op];
    this.exec(op);
    this.tick(cyc);
    return cyc;
  }

  private exec(op: number) {
    const s = this.sfr;
    const lo = op & 0x0f;
    // Common ALU column decode for A,operand forms (x4..xF)
    const operand = (): number => {
      if (lo === 4) return this.fetch();
      if (lo === 5) return this.rdDirect(this.fetch());
      if (lo === 6 || lo === 7) return this.iram[this.iram[this.rn(lo - 6)]];
      return this.iram[this.rn(lo - 8)];
    };
    if ((op & 0x1f) === 0x01) { // AJMP
      const lo8 = this.fetch();
      this.pc = (this.pc & 0xf800) | ((op & 0xe0) << 3) | lo8;
      return;
    }
    if ((op & 0x1f) === 0x11) { // ACALL
      const lo8 = this.fetch();
      this.push(this.pc & 0xff); this.push(this.pc >> 8);
      this.pc = (this.pc & 0xf800) | ((op & 0xe0) << 3) | lo8;
      return;
    }
    switch (op) {
      case 0x00: return; // NOP
      case 0x02: { const h = this.fetch(); this.pc = (h << 8) | this.fetch(); return; } // LJMP
      case 0x03: this.A = (this.A >> 1) | (this.A << 7); return; // RR A
      case 0x04: this.A = this.A + 1; return; // INC A
      case 0x05: { const d = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) + 1); return; }
      case 0x06: case 0x07: { const a = this.iram[this.rn(op - 6)]; this.iram[a] = this.iram[a] + 1; return; }
      case 0x10: { // JBC
        const b = this.fetch(), r = this.fetch();
        if (this.rdBit(b, true)) { this.wrBit(b, 0); this.rel(r); }
        return;
      }
      case 0x12: { // LCALL
        const h = this.fetch(), l = this.fetch();
        this.push(this.pc & 0xff); this.push(this.pc >> 8);
        this.pc = (h << 8) | l;
        return;
      }
      case 0x13: { const c = this.cy; this.setCy(this.A & 1); this.A = (this.A >> 1) | (c << 7); return; } // RRC
      case 0x14: this.A = this.A - 1; return; // DEC A
      case 0x15: { const d = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) - 1); return; }
      case 0x16: case 0x17: { const a = this.iram[this.rn(op - 0x16)]; this.iram[a] = this.iram[a] - 1; return; }
      case 0x20: { const b = this.fetch(), r = this.fetch(); if (this.rdBit(b)) this.rel(r); return; } // JB
      case 0x22: { const h = this.pop(); this.pc = (h << 8) | this.pop(); return; } // RET
      case 0x23: this.A = (this.A << 1) | (this.A >> 7); return; // RL A
      case 0x30: { const b = this.fetch(), r = this.fetch(); if (!this.rdBit(b)) this.rel(r); return; } // JNB
      case 0x32: { // RETI
        const h = this.pop(); this.pc = (h << 8) | this.pop();
        if (this.inService[1]) this.inService[1] = false; else this.inService[0] = false;
        this.irqBlock = 1;
        return;
      }
      case 0x33: { const c = this.cy; this.setCy(this.A >> 7); this.A = (this.A << 1) | c; return; } // RLC
      case 0x40: { const r = this.fetch(); if (this.cy) this.rel(r); return; } // JC
      case 0x42: { const d = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) | this.A); return; }
      case 0x43: { const d = this.fetch(), k = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) | k); return; }
      case 0x50: { const r = this.fetch(); if (!this.cy) this.rel(r); return; } // JNC
      case 0x52: { const d = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) & this.A); return; }
      case 0x53: { const d = this.fetch(), k = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) & k); return; }
      case 0x60: { const r = this.fetch(); if (!this.A) this.rel(r); return; } // JZ
      case 0x62: { const d = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) ^ this.A); return; }
      case 0x63: { const d = this.fetch(), k = this.fetch(); this.wrDirect(d, this.rdDirect(d, true) ^ k); return; }
      case 0x70: { const r = this.fetch(); if (this.A) this.rel(r); return; } // JNZ
      case 0x72: { const b = this.fetch(); this.setCy(this.cy | this.rdBit(b)); return; } // ORL C,bit
      case 0x73: this.pc = (this.A + this.dptr) & 0xffff; return; // JMP @A+DPTR
      case 0x74: this.A = this.fetch(); return;
      case 0x75: { const d = this.fetch(); this.wrDirect(d, this.fetch()); return; }
      case 0x76: case 0x77: this.iram[this.iram[this.rn(op - 0x76)]] = this.fetch(); return;
      case 0x80: this.rel(this.fetch()); return; // SJMP
      case 0x82: { const b = this.fetch(); this.setCy(this.cy & this.rdBit(b)); return; } // ANL C,bit
      case 0x83: this.A = this.code[(this.A + this.pc) & 0xffff]; return; // MOVC A,@A+PC
      case 0x84: { // DIV AB
        const a = this.A, b = s[B];
        s[PSW] &= ~(CY | OVF);
        if (b === 0) { s[PSW] |= OVF; return; }
        this.A = Math.floor(a / b); s[B] = a % b;
        return;
      }
      case 0x85: { const src = this.fetch(), dst = this.fetch(); this.wrDirect(dst, this.rdDirect(src)); return; }
      case 0x86: case 0x87: { const d = this.fetch(); this.wrDirect(d, this.iram[this.iram[this.rn(op - 0x86)]]); return; }
      case 0x90: { const h = this.fetch(); this.dptr = (h << 8) | this.fetch(); return; }
      case 0x92: this.wrBit(this.fetch(), this.cy); return; // MOV bit,C
      case 0x93: this.A = this.code[(this.A + this.dptr) & 0xffff]; return; // MOVC A,@A+DPTR
      case 0xa0: { const b = this.fetch(); this.setCy(this.cy | (this.rdBit(b) ^ 1)); return; }
      case 0xa2: this.setCy(this.rdBit(this.fetch())); return; // MOV C,bit
      case 0xa3: this.dptr = (this.dptr + 1) & 0xffff; return;
      case 0xa4: { // MUL AB
        const p = this.A * s[B];
        this.A = p & 0xff; s[B] = p >> 8;
        s[PSW] = (s[PSW] & ~(CY | OVF)) | (p > 0xff ? OVF : 0);
        return;
      }
      case 0xa5: this.lastTrap = `Reserved opcode 0xA5 at 0x${((this.pc - 1) & 0xffff).toString(16)}`; this.bus.log('warn', this.lastTrap); return;
      case 0xa6: case 0xa7: this.iram[this.iram[this.rn(op - 0xa6)]] = this.rdDirect(this.fetch()); return;
      case 0xb0: { const b = this.fetch(); this.setCy(this.cy & (this.rdBit(b) ^ 1)); return; }
      case 0xb2: { const b = this.fetch(); this.wrBit(b, this.rdBit(b, true) ^ 1); return; } // CPL bit
      case 0xb3: this.setCy(this.cy ^ 1); return;
      case 0xb4: case 0xb5: case 0xb6: case 0xb7: { // CJNE
        let x: number, y: number;
        if (op === 0xb4) { x = this.A; y = this.fetch(); }
        else if (op === 0xb5) { x = this.A; y = this.rdDirect(this.fetch()); }
        else { x = this.iram[this.iram[this.rn(op - 0xb6)]]; y = this.fetch(); }
        const r = this.fetch();
        this.setCy(x < y ? 1 : 0);
        if (x !== y) this.rel(r);
        return;
      }
      case 0xc0: this.push(this.rdDirect(this.fetch())); return; // PUSH
      case 0xc2: this.wrBit(this.fetch(), 0); return; // CLR bit
      case 0xc3: this.setCy(0); return;
      case 0xc4: this.A = (this.A << 4) | (this.A >> 4); return; // SWAP
      case 0xc5: { const d = this.fetch(); const t = this.rdDirect(d); this.wrDirect(d, this.A); this.A = t; return; }
      case 0xc6: case 0xc7: { const a = this.iram[this.rn(op - 0xc6)]; const t = this.iram[a]; this.iram[a] = this.A; this.A = t; return; }
      case 0xd0: { const d = this.fetch(); this.wrDirect(d, this.pop()); return; } // POP
      case 0xd2: this.wrBit(this.fetch(), 1); return; // SETB bit
      case 0xd3: this.setCy(1); return;
      case 0xd4: { // DA A
        let a = this.A;
        let c = this.cy;
        if ((a & 0x0f) > 9 || s[PSW] & AC) { a += 6; if (a > 0xff) c = 1; }
        if ((a & 0x1f0) > 0x90 || c) { a += 0x60; c = 1; }
        this.A = a; this.setCy(c);
        return;
      }
      case 0xd5: { // DJNZ direct
        const d = this.fetch(), r = this.fetch();
        const v = (this.rdDirect(d, true) - 1) & 0xff;
        this.wrDirect(d, v);
        if (v) this.rel(r);
        return;
      }
      case 0xd6: case 0xd7: { // XCHD
        const a = this.iram[this.rn(op - 0xd6)];
        const t = this.iram[a];
        this.iram[a] = (t & 0xf0) | (this.A & 0x0f);
        this.A = (this.A & 0xf0) | (t & 0x0f);
        return;
      }
      case 0xe0: this.A = this.xram[this.dptr]; return; // MOVX A,@DPTR
      case 0xe2: case 0xe3: this.A = this.xram[(s[0xa0] << 8) | this.iram[this.rn(op - 0xe2)]]; return;
      case 0xe4: this.A = 0; return;
      case 0xe5: this.A = this.rdDirect(this.fetch()); return;
      case 0xf0: this.xram[this.dptr] = this.A; return;
      case 0xf2: case 0xf3: this.xram[(s[0xa0] << 8) | this.iram[this.rn(op - 0xf2)]] = this.A; return;
      case 0xf4: this.A = ~this.A; return;
      case 0xf5: this.wrDirect(this.fetch(), this.A); return;
      case 0xf6: case 0xf7: this.iram[this.iram[this.rn(op - 0xf6)]] = this.A; return;
    }
    const hi = op >> 4;
    if (lo >= 8) { // Rn forms
      const r = this.rn(lo - 8);
      switch (hi) {
        case 0x0: this.iram[r] = this.iram[r] + 1; return;
        case 0x1: this.iram[r] = this.iram[r] - 1; return;
        case 0x7: this.iram[r] = this.fetch(); return;
        case 0x8: this.wrDirect(this.fetch(), this.iram[r]); return;
        case 0xa: this.iram[r] = this.rdDirect(this.fetch()); return;
        case 0xb: { const k = this.fetch(), rel = this.fetch(); const x = this.iram[r]; this.setCy(x < k ? 1 : 0); if (x !== k) this.rel(rel); return; }
        case 0xc: { const t = this.iram[r]; this.iram[r] = this.A; this.A = t; return; }
        case 0xd: { const rel = this.fetch(); this.iram[r] = this.iram[r] - 1; if (this.iram[r]) this.rel(rel); return; }
        case 0xe: this.A = this.iram[r]; return;
        case 0xf: this.iram[r] = this.A; return;
      }
    }
    if (lo >= 4) { // A, operand ALU forms
      switch (hi) {
        case 0x2: this.add(operand(), 0); return;
        case 0x3: this.add(operand(), this.cy); return;
        case 0x4: this.A = this.A | operand(); return;
        case 0x5: this.A = this.A & operand(); return;
        case 0x6: this.A = this.A ^ operand(); return;
        case 0x9: this.subb(operand()); return;
        case 0xe: this.A = operand(); return;
      }
    }
    this.lastTrap = `Unhandled opcode 0x${op.toString(16)} at 0x${((this.pc - 1) & 0xffff).toString(16)}`;
    this.bus.log('warn', this.lastTrap);
  }

  peripheralState() {
    const s = this.sfr;
    return {
      t0mode: s[TMOD] & 3, t1mode: (s[TMOD] >> 4) & 3,
      t0: (s[TH0] << 8) | s[TL0], t1: (s[TH1] << 8) | s[TL1],
      baud: this.baudRate(), inService: [...this.inService],
    };
  }
}
