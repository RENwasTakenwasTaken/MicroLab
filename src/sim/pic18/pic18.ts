// PIC18F4550 instruction-level emulator.
// Implements the standard (non-extended) PIC18 instruction set, data memory with
// access bank / BSR banking, FSR indirect addressing, 31-level hardware stack,
// two-level interrupt priority, Timer0/1/2/3, CCP1/CCP2 (capture/compare/PWM),
// 10-bit ADC, EUSART, data EEPROM, watchdog and oscillator configuration.
// Reference: PIC18F2455/2550/4455/4550 datasheet (DS39632).

import { parseIntelHex } from '../core/hex.ts';
import type { McuCore, PinBus } from '../core/types.ts';

// ---- SFR addresses -------------------------------------------------------
export const SFR = {
  PORTA: 0xf80, PORTB: 0xf81, PORTC: 0xf82, PORTD: 0xf83, PORTE: 0xf84,
  LATA: 0xf89, LATB: 0xf8a, LATC: 0xf8b, LATD: 0xf8c, LATE: 0xf8d,
  TRISA: 0xf92, TRISB: 0xf93, TRISC: 0xf94, TRISD: 0xf95, TRISE: 0xf96,
  OSCTUNE: 0xf9b, PIE1: 0xf9d, PIR1: 0xf9e, IPR1: 0xf9f, PIE2: 0xfa0, PIR2: 0xfa1, IPR2: 0xfa2,
  EECON1: 0xfa6, EECON2: 0xfa7, EEDATA: 0xfa8, EEADR: 0xfa9,
  RCSTA: 0xfab, TXSTA: 0xfac, TXREG: 0xfad, RCREG: 0xfae, SPBRG: 0xfaf, SPBRGH: 0xfb0,
  T3CON: 0xfb1, TMR3L: 0xfb2, TMR3H: 0xfb3, CMCON: 0xfb4, CVRCON: 0xfb5,
  ECCP1AS: 0xfb6, ECCP1DEL: 0xfb7, BAUDCON: 0xfb8,
  CCP2CON: 0xfba, CCPR2L: 0xfbb, CCPR2H: 0xfbc, CCP1CON: 0xfbd, CCPR1L: 0xfbe, CCPR1H: 0xfbf,
  ADCON2: 0xfc0, ADCON1: 0xfc1, ADCON0: 0xfc2, ADRESL: 0xfc3, ADRESH: 0xfc4,
  SSPCON2: 0xfc5, SSPCON1: 0xfc6, SSPSTAT: 0xfc7, SSPADD: 0xfc8, SSPBUF: 0xfc9,
  T2CON: 0xfca, PR2: 0xfcb, TMR2: 0xfcc, T1CON: 0xfcd, TMR1L: 0xfce, TMR1H: 0xfcf,
  RCON: 0xfd0, WDTCON: 0xfd1, HLVDCON: 0xfd2, OSCCON: 0xfd3, T0CON: 0xfd5, TMR0L: 0xfd6, TMR0H: 0xfd7,
  STATUS: 0xfd8, FSR2L: 0xfd9, FSR2H: 0xfda, BSR: 0xfe0, FSR1L: 0xfe1, FSR1H: 0xfe2,
  WREG: 0xfe8, FSR0L: 0xfe9, FSR0H: 0xfea,
  INTCON3: 0xff0, INTCON2: 0xff1, INTCON: 0xff2, PRODL: 0xff3, PRODH: 0xff4,
  TABLAT: 0xff5, TBLPTRL: 0xff6, TBLPTRH: 0xff7, TBLPTRU: 0xff8,
  PCL: 0xff9, PCLATH: 0xffa, PCLATU: 0xffb, STKPTR: 0xffc, TOSL: 0xffd, TOSH: 0xffe, TOSU: 0xfff,
} as const;

const S = SFR;
const C = 1, DC = 2, Z = 4, OV = 8, N = 16;

/** Implemented GPIO bits per port (A..E). RC3 does not exist on the 4550; RC4/RC5 are input only. */
const PORT_MASK = [0x7f, 0xff, 0xf7, 0xff, 0x0f];
/** Analog channel -> [port, bit] */
const AN_PINS: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 5], [4, 0], [4, 1], [4, 2], [1, 2], [1, 3], [1, 1], [1, 4], [1, 0],
];
/** Unprogrammed configuration byte values (CONFIG1L..CONFIG7H). */
const isIndirect = (a: number) => (a >= 0xfdb && a <= 0xfdf) || (a >= 0xfe3 && a <= 0xfe7) || (a >= 0xfeb && a <= 0xfef);
const CONFIG_DEFAULTS = [0x00, 0x05, 0x1f, 0x1f, 0x00, 0x83, 0x85, 0x00, 0x0f, 0xc0, 0x0f, 0xe0, 0x0f, 0x40];

interface CcpState {
  out: number; // current output level of the CCP pin (before polarity)
  fallAt: number; // PWM: cycle at which the duty phase ends (-1 = none)
  captureCount: number;
}

export class Pic18 implements McuCore {
  readonly arch = 'pic18' as const;
  readonly name = 'PIC18F4550';
  prog = new Uint8Array(0x8000);
  config = new Uint8Array(14);
  eeprom = new Uint8Array(256).fill(0xff);
  ram = new Uint8Array(0x1000);
  w = 0;
  st = 0;
  bsr = 0;
  pc = 0;
  stack = new Int32Array(32);
  sp = 0;
  stkful = 0;
  stkunf = 0;
  shadow = [0, 0, 0];
  cycles = 0;
  sleeping = false;
  halted: string | null = null;
  crystalHz = 20_000_000;
  fosc = 1_000_000;
  /** set when the core executes an instruction that is not supported */
  lastTrap = '';

  // timers
  tmr0 = 0; t0pre = 0; t0inhibit = 0;
  tmr1 = 0; t1pre = 0;
  tmr3 = 0; t3pre = 0;
  tmr2 = 0; t2pre = 0; t2post = 0;
  ccp: CcpState[] = [
    { out: 0, fallAt: -1, captureCount: 0 },
    { out: 0, fallAt: -1, captureCount: 0 },
  ];
  // ADC / EUSART / EEPROM scheduling
  adcDoneAt = -1;
  txBusyUntil = -1;
  txShift = -1;
  txBuffer = -1;
  rxFifo: number[] = [];
  rxQueue: number[] = [];
  rxNextAt = -1;
  nextEvent = Infinity;
  wdtSeconds = 0;

  // pins
  driven = new Uint8Array(5);
  level = new Uint8Array(5);
  pinLevel = new Uint8Array(5); // last full pin levels for edge detection
  rbLatch = 0;
  irqBlock = 0;
  extraCycles = 0;

  bus: PinBus;

  constructor(bus: PinBus) {
    this.bus = bus;
    this.config.set(CONFIG_DEFAULTS);
    this.reset();
  }

  // ------------------------------------------------------------------ setup
  loadHex(text: string) {
    const warnings: string[] = [];
    this.prog.fill(0xff);
    this.config.set(CONFIG_DEFAULTS);
    let bytes = 0;
    for (const seg of parseIntelHex(text)) {
      for (let i = 0; i < seg.data.length; i++) {
        const a = seg.address + i;
        if (a < 0x8000) { this.prog[a] = seg.data[i]; bytes++; }
        else if (a >= 0x300000 && a < 0x30000e) this.config[a - 0x300000] = seg.data[i];
        else if (a >= 0xf00000 && a < 0xf00100) this.eeprom[a - 0xf00000] = seg.data[i];
      }
    }
    if (this.config[6] & 0x40) warnings.push('XINST (extended instruction set) is enabled in config bits; the extended set is not emulated. Use XINST = OFF.');
    const fosc = this.config[1] & 0x0f;
    if (fosc === 4 || fosc === 5 || fosc === 6 || fosc === 7)
      warnings.push('FOSC is set to an external-clock (EC) mode but the board has a crystal. On real hardware use FOSC = HS (or HSPLL_HS).');
    if (this.config[3] & 1) warnings.push('Watchdog timer is ENABLED (WDT = ON). The program will reset when the WDT times out unless it executes CLRWDT.');
    this.reset();
    return { bytes, warnings };
  }

  /** Device reset that keeps the simulation clock running (WDT, RESET instruction, stack errors, MCLR). */
  softReset(reason?: string) {
    if (reason) this.bus.log('warn', reason);
    const c = this.cycles;
    this.reset();
    this.cycles = c;
  }

  /** Power-on reset. */
  reset() {
    const r = this.ram;
    r.fill(0);
    this.w = 0; this.st = 0; this.bsr = 0; this.pc = 0; this.sp = 0;
    this.stkful = 0; this.stkunf = 0; this.cycles = 0; this.sleeping = false; this.halted = null;
    this.stack.fill(0);
    r[S.INTCON2] = 0xf5; r[S.INTCON3] = 0xc0;
    r[S.T0CON] = 0xff; r[S.OSCCON] = 0x40; r[S.HLVDCON] = 0x05; r[S.RCON] = 0x1c;
    r[S.PR2] = 0xff; r[S.ADCON1] = this.config[5] & 0x02 ? 0x00 : 0x07;
    r[S.BAUDCON] = 0x40; r[S.CMCON] = 0x07; r[S.TXSTA] = 0x02;
    r[S.IPR1] = 0xff; r[S.IPR2] = 0xff;
    r[S.TRISA] = 0x7f; r[S.TRISB] = 0xff; r[S.TRISC] = 0xff; r[S.TRISD] = 0xff; r[S.TRISE] = 0x07;
    this.tmr0 = 0; this.t0pre = 0; this.t0inhibit = 0;
    this.tmr1 = 0; this.t1pre = 0; this.tmr3 = 0; this.t3pre = 0;
    this.tmr2 = 0; this.t2pre = 0; this.t2post = 0;
    for (const c of this.ccp) { c.out = 0; c.fallAt = -1; c.captureCount = 0; }
    this.adcDoneAt = -1; this.txBusyUntil = -1; this.txShift = -1; this.txBuffer = -1;
    this.rxFifo = []; this.rxNextAt = -1; this.nextEvent = Infinity; this.wdtSeconds = 0;
    this.irqBlock = 0;
    this.recalcClock();
    for (let p = 0; p < 5; p++) { this.driven[p] = 0; this.level[p] = 0; this.updatePort(p, 0, true); }
    this.inputsChanged();
  }

  recalcClock() {
    const fosc = this.config[1] & 0x0f;
    const cpudiv = (this.config[0] >> 3) & 3;
    const osccon = this.ram[S.OSCCON];
    const scs = osccon & 3;
    const intosc = [31_250, 125_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000][(osccon >> 4) & 7];
    let f: number;
    if (scs & 2) f = intosc;
    else if (scs === 1) f = 32_768;
    else if (fosc >= 8 && fosc <= 11) f = intosc;
    else if (fosc >= 0x0e || fosc === 2 || fosc === 3 || fosc === 6 || fosc === 7) f = 96_000_000 / [2, 3, 4, 6][cpudiv];
    else f = this.crystalHz / [1, 2, 3, 4][cpudiv];
    this.fosc = f;
  }

  cycleHz() { return this.fosc / 4; }

  /** Describes the active oscillator configuration for the UI. */
  clockInfo() {
    const fosc = this.config[1] & 0x0f;
    const names: Record<number, string> = {
      0: 'XT', 1: 'XT', 2: 'XTPLL', 3: 'XTPLL', 4: 'ECIO', 5: 'EC', 6: 'ECPLLIO', 7: 'ECPLL',
      8: 'INTOSC (RA6 I/O)', 9: 'INTOSC (CLKO)', 10: 'INTOSC + XT USB', 11: 'INTOSC + HS USB',
      12: 'HS', 13: 'HS', 14: 'HSPLL', 15: 'HSPLL',
    };
    return { mode: names[fosc], fosc: this.fosc, fcy: this.fosc / 4 };
  }

  // ------------------------------------------------------------ data memory
  private resolve(a: number): number {
    let fl: number;
    if (a >= 0xfeb && a <= 0xfef) fl = S.FSR0L;
    else if (a >= 0xfe3 && a <= 0xfe7) fl = S.FSR1L;
    else if (a >= 0xfdb && a <= 0xfdf) fl = S.FSR2L;
    else return a;
    const r = this.ram;
    let fsr = r[fl] | ((r[fl + 1] & 0x0f) << 8);
    let ea: number;
    switch (a & 7) {
      case 7: ea = fsr; break;
      case 6: ea = fsr; fsr = (fsr + 1) & 0xfff; break;
      case 5: ea = fsr; fsr = (fsr - 1) & 0xfff; break;
      case 4: fsr = (fsr + 1) & 0xfff; ea = fsr; break;
      default: ea = (fsr + ((this.w << 24) >> 24)) & 0xfff; break;
    }
    r[fl] = fsr & 0xff;
    r[fl + 1] = fsr >> 8;
    if (isIndirect(ea)) return -1;
    return ea;
  }

  /** Effective address of a file-register operand (access bank / BSR, with indirect resolution). */
  private ea(op: number): number {
    const f = op & 0xff;
    const a = op & 0x100 ? (this.bsr << 8) | f : f < 0x60 ? f : 0xf00 | f;
    return a >= 0xfdb ? this.resolve(a) : a;
  }

  rd(a: number): number {
    if (a < 0xf60) return a >= 0 && a < 0x800 ? this.ram[a] : 0;
    const r = this.ram;
    switch (a) {
      case S.PORTA: case S.PORTB: case S.PORTC: case S.PORTD: case S.PORTE:
        return this.readPort(a - S.PORTA);
      case S.WREG: return this.w;
      case S.STATUS: return this.st;
      case S.BSR: return this.bsr;
      case S.PCL:
        r[S.PCLATH] = (this.pc >> 8) & 0xff;
        r[S.PCLATU] = (this.pc >> 16) & 0x1f;
        return this.pc & 0xff;
      case S.TOSL: return this.stack[this.sp] & 0xff;
      case S.TOSH: return (this.stack[this.sp] >> 8) & 0xff;
      case S.TOSU: return (this.stack[this.sp] >> 16) & 0x1f;
      case S.STKPTR: return (this.stkful << 7) | (this.stkunf << 6) | this.sp;
      case S.TMR0L:
        if (!(r[S.T0CON] & 0x40)) r[S.TMR0H] = this.tmr0 >> 8;
        return this.tmr0 & 0xff;
      case S.TMR1L:
        if (r[S.T1CON] & 0x80) r[S.TMR1H] = this.tmr1 >> 8;
        return this.tmr1 & 0xff;
      case S.TMR1H: return r[S.T1CON] & 0x80 ? r[S.TMR1H] : this.tmr1 >> 8;
      case S.TMR3L:
        if (r[S.T3CON] & 0x80) r[S.TMR3H] = this.tmr3 >> 8;
        return this.tmr3 & 0xff;
      case S.TMR3H: return r[S.T3CON] & 0x80 ? r[S.TMR3H] : this.tmr3 >> 8;
      case S.TMR2: return this.tmr2;
      case S.RCREG: {
        const v = this.rxFifo.length ? this.rxFifo.shift()! : r[S.RCREG];
        r[S.RCREG] = v;
        if (!this.rxFifo.length) r[S.PIR1] &= ~0x20;
        return v;
      }
      default:
        return isIndirect(a) ? 0 : r[a];
    }
  }

  wr(a: number, v: number) {
    v &= 0xff;
    if (a < 0xf60) { if (a >= 0 && a < 0x800) this.ram[a] = v; return; }
    const r = this.ram;
    switch (a) {
      case S.PORTA: case S.PORTB: case S.PORTC: case S.PORTD: case S.PORTE:
        r[a + 9] = v; this.updatePort(a - S.PORTA); return;
      case S.LATA: case S.LATB: case S.LATC: case S.LATD: case S.LATE:
        r[a] = v; this.updatePort(a - S.LATA); return;
      case S.TRISA: case S.TRISB: case S.TRISC: case S.TRISD: case S.TRISE:
        r[a] = v;
        this.updatePort(a - S.TRISA); return;
      case S.WREG: this.w = v; return;
      case S.STATUS: this.st = v & 0x1f; return;
      case S.BSR: this.bsr = v & 0x0f; return;
      case S.FSR0H: case S.FSR1H: case S.FSR2H: r[a] = v & 0x0f; return;
      case S.PCL:
        this.pc = ((r[S.PCLATU] & 0x1f) << 16) | (r[S.PCLATH] << 8) | (v & 0xfe);
        this.extraCycles++;
        return;
      case S.PCLATU: r[a] = v & 0x1f; return;
      case S.TOSL: this.stack[this.sp] = (this.stack[this.sp] & ~0xff) | v; return;
      case S.TOSH: this.stack[this.sp] = (this.stack[this.sp] & ~0xff00) | (v << 8); return;
      case S.TOSU: this.stack[this.sp] = (this.stack[this.sp] & 0xffff) | ((v & 0x1f) << 16); return;
      case S.STKPTR:
        this.sp = v & 0x1f;
        if (!(v & 0x80)) this.stkful = 0;
        if (!(v & 0x40)) this.stkunf = 0;
        return;
      case S.TMR0L:
        this.tmr0 = r[S.T0CON] & 0x40 ? (this.tmr0 & 0xff00) | v : (r[S.TMR0H] << 8) | v;
        this.t0pre = 0; this.t0inhibit = 2; return;
      case S.TMR1L:
        this.tmr1 = r[S.T1CON] & 0x80 ? (r[S.TMR1H] << 8) | v : (this.tmr1 & 0xff00) | v;
        this.t1pre = 0; return;
      case S.TMR1H:
        if (r[S.T1CON] & 0x80) r[S.TMR1H] = v; else this.tmr1 = (v << 8) | (this.tmr1 & 0xff);
        this.t1pre = 0; return;
      case S.TMR3L:
        this.tmr3 = r[S.T3CON] & 0x80 ? (r[S.TMR3H] << 8) | v : (this.tmr3 & 0xff00) | v;
        this.t3pre = 0; return;
      case S.TMR3H:
        if (r[S.T3CON] & 0x80) r[S.TMR3H] = v; else this.tmr3 = (v << 8) | (this.tmr3 & 0xff);
        this.t3pre = 0; return;
      case S.TMR2: this.tmr2 = v; this.t2pre = 0; this.t2post = 0; return;
      case S.T2CON: r[a] = v & 0x7f; this.t2pre = 0; this.t2post = 0; return;
      case S.CCP1CON: case S.CCP2CON: {
        const n = a === S.CCP1CON ? 0 : 1;
        const old = r[a] & 0x0f;
        r[a] = v;
        const mode = v & 0x0f;
        if (mode !== old) {
          const c = this.ccp[n];
          c.fallAt = -1; c.captureCount = 0;
          if (mode === 0x08) c.out = 0;
          else if (mode === 0x09) c.out = 1;
          else if ((mode & 0x0c) === 0x0c) c.out = 0;
          this.updatePort(this.ccpPin(n)[0]);
        }
        return;
      }
      case S.ADCON0:
        r[a] = v & 0x3f;
        if ((v & 0x03) === 0x03 && this.adcDoneAt < 0) this.startAdc();
        else if (!(v & 0x02)) this.adcDoneAt = -1;
        return;
      case S.ADCON1: r[a] = v & 0x3f; this.inputsChanged(); return;
      case S.TXREG: r[a] = v; this.txWrite(v); return;
      case S.TXSTA: r[a] = (v & ~0x02) | (r[a] & 0x02); this.updateTxif(); return;
      case S.RCSTA: r[a] = (v & ~0x06) | (r[a] & 0x06); this.updateTxif(); this.updatePort(2); return;
      case S.PIR1: r[a] = (v & ~0x30) | (r[a] & 0x30); return;
      case S.EECON1: this.eeWrite(v); return;
      case S.OSCCON: r[a] = (r[a] & 0x0c) | (v & 0xf3) | 0x04; this.recalcClock(); return;
      case S.INTCON2: r[a] = v; this.inputsChanged(); return;
      default:
        if (!isIndirect(a)) r[a] = v;
    }
  }

  // --------------------------------------------------------------- GPIO
  /** Analog-configured pin mask for a port (from ADCON1 PCFG). */
  analogMask(p: number): number {
    const pcfg = this.ram[S.ADCON1] & 0x0f;
    const n = pcfg <= 2 ? 13 : 15 - pcfg;
    let m = 0;
    for (let ch = 0; ch < n; ch++) if (AN_PINS[ch][0] === p) m |= 1 << AN_PINS[ch][1];
    return m;
  }

  /** Pins with PORTB weak pull-ups enabled. */
  pullups(p: number): number {
    if (p !== 1 || this.ram[S.INTCON2] & 0x80) return 0;
    return this.ram[S.TRISB];
  }

  private ccpPin(n: number): [number, number] {
    if (n === 0) return [2, 2];
    return this.config[5] & 0x01 ? [2, 1] : [1, 3];
  }

  /** Driven mask and levels for a port, including peripheral overrides. */
  private computeOutputs(p: number): [number, number] {
    const r = this.ram;
    let mask = PORT_MASK[p];
    if (p === 0) {
      const fosc = this.config[1] & 0x0f;
      if (!(fosc === 4 || fosc === 6 || fosc === 8)) mask &= 0x3f; // RA6 is OSC2/CLKO
    }
    if (p === 4) mask &= 0x07; // RE3 is input only
    if (p === 2) mask &= ~0x30; // RC4/RC5 are input only (USB)
    let driven = ~r[S.TRISA + p] & mask;
    let level = r[S.LATA + p] & driven;
    for (let n = 0; n < 2; n++) {
      const [cp, cb] = this.ccpPin(n);
      if (cp !== p) continue;
      const mode = r[n === 0 ? S.CCP1CON : S.CCP2CON] & 0x0f;
      const outMode = mode === 2 || mode === 8 || mode === 9 || (mode & 0x0c) === 0x0c;
      if (outMode && driven & (1 << cb)) {
        let o = this.ccp[n].out;
        if (n === 0 && (mode & 0x0c) === 0x0c && mode & 0x02) o ^= 1; // ECCP active-low P1A
        level = (level & ~(1 << cb)) | (o << cb);
      }
    }
    if (p === 2 && r[S.RCSTA] & 0x80 && r[S.TXSTA] & 0x20) {
      driven |= 0x40;
      level |= 0x40; // TX idles high
      driven &= ~0x80;
    }
    return [driven & 0xff, level & 0xff];
  }

  private updatePort(p: number, ts = this.cycles, force = false) {
    const [d, l] = this.computeOutputs(p);
    if (force || d !== this.driven[p] || l !== this.level[p]) {
      this.driven[p] = d;
      this.level[p] = l;
      this.bus.outputsChanged(p, l, d, ts);
      this.refreshPort(p);
    }
  }

  /** Full pin levels (driven outputs + external inputs). */
  private pinLevels(p: number): number {
    const d = this.driven[p];
    const inMask = ~d & PORT_MASK[p] & 0xff;
    const ext = inMask ? this.bus.readInputs(p, inMask) : 0;
    return ((this.level[p] & d) | (ext & inMask)) & 0xff;
  }

  private readPort(p: number): number {
    const lv = this.pinLevels(p) & ~(this.analogMask(p) & ~this.driven[p]) & PORT_MASK[p];
    if (p === 1) this.rbLatch = lv & 0xf0;
    return p === 4 ? lv & 0x0f : lv & 0xff;
  }

  /** Re-evaluates input levels on every port and raises edge-triggered events. */
  inputsChanged() {
    for (let p = 0; p < 5; p++) this.refreshPort(p);
  }

  private refreshPort(p: number) {
    const now = this.pinLevels(p);
    const prev = this.pinLevel[p];
    this.pinLevel[p] = now;
    const changed = now ^ prev;
    const r = this.ram;
    if (p === 1) {
      const intcon2 = r[S.INTCON2];
      if (changed & 0x01 && !!(now & 1) === !!(intcon2 & 0x40)) r[S.INTCON] |= 0x02;
      if (changed & 0x02 && !!(now & 2) === !!(intcon2 & 0x20)) r[S.INTCON3] |= 0x01;
      if (changed & 0x04 && !!(now & 4) === !!(intcon2 & 0x10)) r[S.INTCON3] |= 0x02;
      const inputs = r[S.TRISB] & 0xf0;
      if ((now & inputs) !== (this.rbLatch & inputs) && changed & inputs) r[S.INTCON] |= 0x01;
    }
    if (!changed) return;
    if (p === 0 && changed & 0x10) {
      // T0CKI
      const t0 = r[S.T0CON];
      const rising = !!(now & 0x10);
      if (t0 & 0x80 && t0 & 0x20 && rising === !(t0 & 0x10)) this.timer0Count(1);
    }
    for (let n = 0; n < 2; n++) {
      const [cp, cb] = this.ccpPin(n);
      if (cp === p && changed & (1 << cb)) this.captureEdge(n, !!(now & (1 << cb)));
    }
  }

  // ----------------------------------------------------------- timers
  private timer0Count(incs: number) {
    const r = this.ram;
    const t0 = r[S.T0CON];
    if (!(t0 & 0x08)) {
      const psc = 2 << (t0 & 7);
      this.t0pre += incs;
      incs = Math.floor(this.t0pre / psc);
      this.t0pre -= incs * psc;
      if (!incs) return;
    }
    if (t0 & 0x40) {
      const lo = (this.tmr0 & 0xff) + incs;
      if (lo > 0xff) r[S.INTCON] |= 0x04;
      this.tmr0 = (this.tmr0 & 0xff00) | (lo & 0xff);
    } else {
      const v = this.tmr0 + incs;
      if (v > 0xffff) r[S.INTCON] |= 0x04;
      this.tmr0 = v & 0xffff;
    }
  }

  private timer13(n: number, which: 1 | 3) {
    const r = this.ram;
    const con = r[which === 1 ? S.T1CON : S.T3CON];
    if (con & 0x02) return; // external clock source: counted on pin edges (not modelled)
    const psc = 1 << ((con >> 4) & 3);
    let pre = (which === 1 ? this.t1pre : this.t3pre) + n;
    const incs = Math.floor(pre / psc);
    pre -= incs * psc;
    if (which === 1) this.t1pre = pre; else this.t3pre = pre;
    if (!incs) return;
    // CCP compare channels using this timer
    const t3ccp = ((r[S.T3CON] >> 5) & 2) | ((r[S.T3CON] >> 3) & 1);
    const useT3 = [t3ccp >= 2, t3ccp >= 1];
    let cmp = 0;
    for (let k = 0; k < 2; k++) {
      const mode = r[k === 0 ? S.CCP1CON : S.CCP2CON] & 0x0f;
      if ((mode === 2 || (mode >= 8 && mode <= 11)) && useT3[k] === (which === 3)) cmp |= 1 << k;
    }
    let t = which === 1 ? this.tmr1 : this.tmr3;
    if (!cmp) {
      t += incs;
      if (t > 0xffff) { t &= 0xffff; if (which === 1) r[S.PIR1] |= 0x01; else r[S.PIR2] |= 0x02; }
    } else {
      for (let i = 0; i < incs; i++) {
        t = (t + 1) & 0xffff;
        if (t === 0) { if (which === 1) r[S.PIR1] |= 0x01; else r[S.PIR2] |= 0x02; }
        for (let k = 0; k < 2; k++) {
          if (!(cmp & (1 << k))) continue;
          const ccpr = k === 0 ? r[S.CCPR1L] | (r[S.CCPR1H] << 8) : r[S.CCPR2L] | (r[S.CCPR2H] << 8);
          if (t !== ccpr) continue;
          const mode = r[k === 0 ? S.CCP1CON : S.CCP2CON] & 0x0f;
          if (k === 0) r[S.PIR1] |= 0x04; else r[S.PIR2] |= 0x01;
          const c = this.ccp[k];
          if (mode === 2) c.out ^= 1;
          else if (mode === 8) c.out = 1;
          else if (mode === 9) c.out = 0;
          else if (mode === 11) {
            t = 0;
            if (k === 1 && r[S.ADCON0] & 1 && this.adcDoneAt < 0) { r[S.ADCON0] |= 2; this.startAdc(); }
          }
          if (mode === 2 || mode === 8 || mode === 9) this.updatePort(this.ccpPin(k)[0]);
        }
      }
    }
    if (which === 1) this.tmr1 = t; else this.tmr3 = t;
  }

  private timer2(n: number) {
    const r = this.ram;
    const t2 = r[S.T2CON];
    const ckps = t2 & 3;
    const psc = ckps === 0 ? 1 : ckps === 1 ? 4 : 16;
    let c = this.cycles - n;
    for (let i = 0; i < n; i++) {
      c++;
      if (++this.t2pre < psc) continue;
      this.t2pre = 0;
      if (this.tmr2 === r[S.PR2]) {
        this.tmr2 = 0;
        if (++this.t2post > ((t2 >> 3) & 0x0f)) { this.t2post = 0; r[S.PIR1] |= 0x02; }
        this.pwmPeriodStart(c, psc);
      } else this.tmr2 = (this.tmr2 + 1) & 0xff;
    }
  }

  private pwmPeriodStart(cycle: number, psc: number) {
    const r = this.ram;
    for (let k = 0; k < 2; k++) {
      const con = r[k === 0 ? S.CCP1CON : S.CCP2CON];
      if ((con & 0x0c) !== 0x0c) continue;
      const ccprl = r[k === 0 ? S.CCPR1L : S.CCPR2L];
      r[k === 0 ? S.CCPR1H : S.CCPR2H] = ccprl;
      const duty = (ccprl << 2) | ((con >> 4) & 3);
      const period = (r[S.PR2] + 1) * 4;
      const c = this.ccp[k];
      const prevOut = c.out;
      if (duty === 0) { c.out = 0; c.fallAt = -1; }
      else {
        c.out = 1;
        c.fallAt = duty >= period ? -1 : cycle + (duty * psc) / 4;
        if (c.fallAt >= 0 && c.fallAt < this.nextEvent) this.nextEvent = c.fallAt;
      }
      if (c.out !== prevOut) this.updatePort(this.ccpPin(k)[0], cycle);
    }
  }

  private captureEdge(n: number, rising: boolean) {
    const r = this.ram;
    const con = n === 0 ? S.CCP1CON : S.CCP2CON;
    const mode = r[con] & 0x0f;
    if (mode < 4 || mode > 7) return;
    const c = this.ccp[n];
    if (mode === 4 ? rising : !rising) return;
    if (mode === 6 && ++c.captureCount % 4) return;
    if (mode === 7 && ++c.captureCount % 16) return;
    const t3ccp = ((r[S.T3CON] >> 5) & 2) | ((r[S.T3CON] >> 3) & 1);
    const useT3 = n === 0 ? t3ccp >= 2 : t3ccp >= 1;
    const t = useT3 ? this.tmr3 : this.tmr1;
    r[n === 0 ? S.CCPR1L : S.CCPR2L] = t & 0xff;
    r[n === 0 ? S.CCPR1H : S.CCPR2H] = t >> 8;
    if (n === 0) r[S.PIR1] |= 0x04; else r[S.PIR2] |= 0x01;
  }

  // ------------------------------------------------------------- ADC
  private startAdc() {
    const r = this.ram;
    const adcs = r[S.ADCON2] & 7;
    const acqt = [0, 2, 4, 6, 8, 12, 16, 20][(r[S.ADCON2] >> 3) & 7];
    const div = [2, 8, 32, 0, 4, 16, 64, 0][adcs];
    const tad = div ? div / this.fosc : 1.6e-6;
    const tadCycles = Math.max(1, Math.round(tad * this.cycleHz()));
    this.adcDoneAt = this.cycles + (acqt + 11) * tadCycles + 1;
    if (this.adcDoneAt < this.nextEvent) this.nextEvent = this.adcDoneAt;
  }

  private finishAdc() {
    const r = this.ram;
    this.adcDoneAt = -1;
    if (!(r[S.ADCON0] & 0x02)) return;
    const ch = (r[S.ADCON0] >> 2) & 0x0f;
    let v = 0;
    if (ch < AN_PINS.length) {
      const [p, b] = AN_PINS[ch];
      v = this.bus.analogVoltage(p, b);
      if (!(this.analogMask(p) & (1 << b)))
        this.bus.log('warn', `ADC channel AN${ch} is not configured as analog in ADCON1 (PCFG). Reading may be wrong on real hardware.`);
    }
    const vcfg = (r[S.ADCON1] >> 4) & 3;
    const vrefN = vcfg & 2 ? this.bus.analogVoltage(0, 2) : 0;
    const vrefP = vcfg & 1 ? this.bus.analogVoltage(0, 3) : 5.0;
    let code = Math.floor(((v - vrefN) / Math.max(1e-3, vrefP - vrefN)) * 1024);
    code = Math.max(0, Math.min(1023, code));
    if (r[S.ADCON2] & 0x80) { r[S.ADRESH] = code >> 8; r[S.ADRESL] = code & 0xff; }
    else { r[S.ADRESH] = code >> 2; r[S.ADRESL] = (code & 3) << 6; }
    r[S.ADCON0] &= ~0x02;
    r[S.PIR1] |= 0x40;
  }

  // ---------------------------------------------------------- EUSART
  baudRate(): number {
    const r = this.ram;
    const brg16 = r[S.BAUDCON] & 0x08;
    const brgh = r[S.TXSTA] & 0x04;
    const n = brg16 ? (r[S.SPBRGH] << 8) | r[S.SPBRG] : r[S.SPBRG];
    const div = brg16 ? (brgh ? 4 : 16) : brgh ? 16 : 64;
    return this.fosc / (div * (n + 1));
  }

  private charCycles() {
    const bits = this.ram[S.TXSTA] & 0x40 ? 11 : 10;
    return Math.max(1, Math.round((bits / this.baudRate()) * this.cycleHz()));
  }

  private updateTxif() {
    const r = this.ram;
    if (r[S.TXSTA] & 0x20 && this.txBuffer < 0) r[S.PIR1] |= 0x10;
    else r[S.PIR1] &= ~0x10;
    if (this.txShift < 0) r[S.TXSTA] |= 0x02; else r[S.TXSTA] &= ~0x02;
  }

  private txWrite(v: number) {
    const r = this.ram;
    if (!(r[S.TXSTA] & 0x20) || !(r[S.RCSTA] & 0x80)) {
      this.bus.log('warn', 'TXREG written while the EUSART transmitter is disabled (TXEN/SPEN = 0).');
      return;
    }
    if (this.txShift < 0) {
      this.txShift = v;
      this.txBusyUntil = this.cycles + this.charCycles();
      if (this.txBusyUntil < this.nextEvent) this.nextEvent = this.txBusyUntil;
    } else this.txBuffer = v;
    this.updateTxif();
  }

  serialRx(byte: number) {
    this.rxQueue.push(byte & 0xff);
    if (this.rxNextAt < 0) {
      this.rxNextAt = this.cycles + this.charCycles();
      if (this.rxNextAt < this.nextEvent) this.nextEvent = this.rxNextAt;
    }
  }

  // ---------------------------------------------------------- EEPROM
  private eeWrite(v: number) {
    const r = this.ram;
    r[S.EECON1] = (r[S.EECON1] & 0x03) | (v & 0xfc);
    if (v & 0x01 && !(v & 0xc0)) r[S.EEDATA] = this.eeprom[r[S.EEADR]];
    if (v & 0x02 && r[S.EECON1] & 0x04 && !(v & 0xc0)) {
      this.eeprom[r[S.EEADR]] = r[S.EEDATA];
      r[S.PIR2] |= 0x10;
    }
  }

  // ---------------------------------------------------------- timing
  private events() {
    const now = this.cycles;
    let next = Infinity;
    const r = this.ram;
    for (let k = 0; k < 2; k++) {
      const c = this.ccp[k];
      if (c.fallAt >= 0) {
        if (now >= c.fallAt) {
          const ts = Math.floor(c.fallAt);
          c.fallAt = -1;
          if ((r[k === 0 ? S.CCP1CON : S.CCP2CON] & 0x0c) === 0x0c) { c.out = 0; this.updatePort(this.ccpPin(k)[0], ts); }
        } else next = Math.min(next, c.fallAt);
      }
    }
    if (this.adcDoneAt >= 0) {
      if (now >= this.adcDoneAt) this.finishAdc(); else next = Math.min(next, this.adcDoneAt);
    }
    if (this.txShift >= 0) {
      if (now >= this.txBusyUntil) {
        this.bus.serialTx(this.txShift);
        this.txShift = -1;
        if (this.txBuffer >= 0) {
          this.txShift = this.txBuffer; this.txBuffer = -1;
          this.txBusyUntil = now + this.charCycles();
          next = Math.min(next, this.txBusyUntil);
        }
        this.updateTxif();
      } else next = Math.min(next, this.txBusyUntil);
    }
    if (this.rxNextAt >= 0) {
      if (now >= this.rxNextAt) {
        const b = this.rxQueue.shift()!;
        if ((r[S.RCSTA] & 0x90) === 0x90) {
          if (this.rxFifo.length >= 2) r[S.RCSTA] |= 0x02; // OERR
          else { this.rxFifo.push(b); r[S.PIR1] |= 0x20; }
        }
        this.rxNextAt = this.rxQueue.length ? now + this.charCycles() : -1;
        if (this.rxNextAt >= 0) next = Math.min(next, this.rxNextAt);
      } else next = Math.min(next, this.rxNextAt);
    }
    this.nextEvent = next;
  }

  private tick(n: number) {
    this.cycles += n;
    const r = this.ram;
    if (!this.sleeping) {
      const t0 = r[S.T0CON];
      if (t0 & 0x80 && !(t0 & 0x20)) {
        let k = n;
        if (this.t0inhibit) { const d = Math.min(this.t0inhibit, k); this.t0inhibit -= d; k -= d; }
        if (k) this.timer0Count(k);
      }
      if (r[S.T1CON] & 1) this.timer13(n, 1);
      if (r[S.T3CON] & 1) this.timer13(n, 3);
      if (r[S.T2CON] & 4) this.timer2(n);
    }
    if (this.cycles >= this.nextEvent) this.events();
    if (this.config[3] & 1 || r[S.WDTCON] & 1) {
      this.wdtSeconds += n / this.cycleHz();
      const period = 0.004 * (1 << ((this.config[3] >> 1) & 0x0f));
      if (this.wdtSeconds >= period) {
        this.wdtSeconds = 0;
        if (this.sleeping) { this.sleeping = false; r[S.RCON] &= ~0x08; }
        else {
          this.softReset(`Watchdog timer timeout after ${period.toFixed(3)} s: device reset. (Add CLRWDT() or set WDT = OFF)`);
          r[S.RCON] &= ~0x08;
        }
      }
    }
  }

  // --------------------------------------------------------- interrupts
  private irqPending(): number {
    const r = this.ram;
    const intcon = r[S.INTCON];
    if (!(intcon & 0x80)) return 0;
    const intcon2 = r[S.INTCON2], intcon3 = r[S.INTCON3];
    const tmr0 = intcon & 0x20 && intcon & 0x04;
    const int0 = intcon & 0x10 && intcon & 0x02;
    const rb = intcon & 0x08 && intcon & 0x01;
    const int1 = intcon3 & 0x08 && intcon3 & 0x01;
    const int2 = intcon3 & 0x10 && intcon3 & 0x02;
    const p1 = r[S.PIR1] & r[S.PIE1], p2 = r[S.PIR2] & r[S.PIE2];
    if (!(r[S.RCON] & 0x80)) {
      if (tmr0 || int0 || rb || int1 || int2) return 1;
      if (intcon & 0x40 && (p1 || p2)) return 1;
      return 0;
    }
    const ipr1 = r[S.IPR1], ipr2 = r[S.IPR2];
    const hi = int0 || (tmr0 && intcon2 & 4) || (rb && intcon2 & 1) || (int1 && intcon3 & 0x40) ||
      (int2 && intcon3 & 0x80) || p1 & ipr1 || p2 & ipr2;
    if (hi) return 1;
    if (intcon & 0x40) {
      const lo = (tmr0 && !(intcon2 & 4)) || (rb && !(intcon2 & 1)) || (int1 && !(intcon3 & 0x40)) ||
        (int2 && !(intcon3 & 0x80)) || p1 & ~ipr1 || p2 & ~ipr2;
      if (lo) return 2;
    }
    return 0;
  }

  private wakeSource(): boolean {
    const r = this.ram;
    const intcon = r[S.INTCON], intcon3 = r[S.INTCON3];
    return !!((intcon & 0x20 && intcon & 0x04) || (intcon & 0x10 && intcon & 0x02) || (intcon & 0x08 && intcon & 0x01) ||
      (intcon3 & 0x08 && intcon3 & 0x01) || (intcon3 & 0x10 && intcon3 & 0x02) ||
      r[S.PIR1] & r[S.PIE1] || r[S.PIR2] & r[S.PIE2]);
  }

  private push(addr: number) {
    if (this.sp >= 31) {
      this.stkful = 1;
      if (this.config[6] & 1) {
        this.softReset('Stack overflow (31 levels exceeded): device reset (STVREN).');
        return;
      }
      return;
    }
    this.stack[++this.sp] = addr;
  }

  private pop(): number {
    if (this.sp === 0) {
      this.stkunf = 1;
      if (this.config[6] & 1) this.softReset('Stack underflow (RETURN with empty stack): device reset (STVREN).');
      else this.bus.log('error', 'Stack underflow (RETURN with empty stack).');
      return 0;
    }
    return this.stack[this.sp--];
  }

  // ------------------------------------------------------------ flags
  private add(a: number, b: number, cin: number): number {
    const r = a + b + cin;
    let st = this.st & ~(C | DC | Z | OV | N);
    if (r > 0xff) st |= C;
    if ((a & 0xf) + (b & 0xf) + cin > 0xf) st |= DC;
    if (~(a ^ b) & (a ^ r) & 0x80) st |= OV;
    const v = r & 0xff;
    if (!v) st |= Z;
    if (v & 0x80) st |= N;
    this.st = st;
    return v;
  }

  private sub(a: number, b: number, bin: number): number {
    const r = a - b - bin;
    let st = this.st & ~(C | DC | Z | OV | N);
    if (r >= 0) st |= C;
    if ((a & 0xf) - (b & 0xf) - bin >= 0) st |= DC;
    if ((a ^ b) & (a ^ r) & 0x80) st |= OV;
    const v = r & 0xff;
    if (!v) st |= Z;
    if (v & 0x80) st |= N;
    this.st = st;
    return v;
  }

  private zn(v: number) {
    this.st = (this.st & ~(Z | N)) | (v ? 0 : Z) | (v & 0x80 ? N : 0);
    return v;
  }

  private skip() {
    this.pc = (this.pc + 2) & 0x1ffffe;
    return 2;
  }

  private progByte(a: number): number {
    if (a < 0x8000) return this.prog[a];
    if (a >= 0x300000 && a < 0x30000e) return this.config[a - 0x300000];
    if (a === 0x3ffffe) return 0x00;
    if (a === 0x3fffff) return 0x12;
    return 0;
  }

  // -------------------------------------------------------------- step
  step(): number {
    if (this.sleeping) {
      if (this.wakeSource()) {
        this.sleeping = false;
      } else {
        this.tick(1);
        return 1;
      }
    }
    if (this.irqBlock) this.irqBlock--;
    else {
      const irq = this.irqPending();
      if (irq) {
        const r = this.ram;
        this.push(this.pc);
        this.shadow[0] = this.w; this.shadow[1] = this.st; this.shadow[2] = this.bsr;
        if (irq === 1) { r[S.INTCON] &= ~0x80; this.pc = 0x08; }
        else { r[S.INTCON] &= ~0x40; this.pc = 0x18; }
        this.tick(2);
        return 2;
      }
    }
    this.extraCycles = 0;
    const cyc = this.exec() + this.extraCycles;
    this.tick(cyc);
    return cyc;
  }

  private exec(): number {
    const pc = this.pc;
    const op = pc < 0x8000 ? this.prog[pc] | (this.prog[pc + 1] << 8) : 0;
    this.pc = (pc + 2) & 0x1ffffe;
    const d = op & 0x200; // destination bit: 1 = file, 0 = W
    let a: number, f: number, v: number;

    switch (op >> 12) {
      case 0x0: {
        const hi = op >> 8;
        if (hi === 0x00) return this.misc(op);
        if (hi === 0x01) { this.bsr = op & 0x0f; return 1; }
        if (hi === 0x02 || hi === 0x03) { // MULWF
          a = this.ea(op);
          const p = this.w * this.rd(a);
          this.ram[S.PRODL] = p & 0xff; this.ram[S.PRODH] = p >> 8;
          return 1;
        }
        if (hi >= 0x04 && hi <= 0x07) { // DECF
          a = this.ea(op);
          v = this.sub(this.rd(a), 1, 0);
          if (d) this.wr(a, v); else this.w = v;
          return 1;
        }
        const k = op & 0xff;
        switch (hi) {
          case 0x08: this.w = this.sub(k, this.w, 0); return 1; // SUBLW
          case 0x09: this.w = this.zn(this.w | k); return 1; // IORLW
          case 0x0a: this.w = this.zn(this.w ^ k); return 1; // XORLW
          case 0x0b: this.w = this.zn(this.w & k); return 1; // ANDLW
          case 0x0c: this.w = k; this.pc = this.pop(); return 2; // RETLW
          case 0x0d: { const p = this.w * k; this.ram[S.PRODL] = p & 0xff; this.ram[S.PRODH] = p >> 8; return 1; } // MULLW
          case 0x0e: this.w = k; return 1; // MOVLW
          case 0x0f: this.w = this.add(this.w, k, 0); return 1; // ADDLW
        }
        return 1;
      }
      case 0x1: {
        a = this.ea(op); f = this.rd(a);
        switch ((op >> 10) & 3) {
          case 0: v = this.zn(f | this.w); break; // IORWF
          case 1: v = this.zn(f & this.w); break; // ANDWF
          case 2: v = this.zn(f ^ this.w); break; // XORWF
          default: v = this.zn(~f & 0xff); break; // COMF
        }
        if (d) this.wr(a, v); else this.w = v;
        return 1;
      }
      case 0x2: {
        a = this.ea(op); f = this.rd(a);
        switch ((op >> 10) & 3) {
          case 0: v = this.add(f, this.w, this.st & C); break; // ADDWFC
          case 1: v = this.add(f, this.w, 0); break; // ADDWF
          case 2: v = this.add(f, 1, 0); break; // INCF
          default: // DECFSZ
            v = (f - 1) & 0xff;
            if (d) this.wr(a, v); else this.w = v;
            return v === 0 ? this.skip() : 1;
        }
        if (d) this.wr(a, v); else this.w = v;
        return 1;
      }
      case 0x3: {
        a = this.ea(op); f = this.rd(a);
        switch ((op >> 10) & 3) {
          case 0: v = this.zn(((f >> 1) | ((this.st & C) << 7)) & 0xff); this.st = (this.st & ~C) | (f & 1); break; // RRCF
          case 1: v = this.zn(((f << 1) | (this.st & C)) & 0xff); this.st = (this.st & ~C) | (f >> 7); break; // RLCF
          case 2: v = ((f << 4) | (f >> 4)) & 0xff; break; // SWAPF
          default: // INCFSZ
            v = (f + 1) & 0xff;
            if (d) this.wr(a, v); else this.w = v;
            return v === 0 ? this.skip() : 1;
        }
        if (d) this.wr(a, v); else this.w = v;
        return 1;
      }
      case 0x4: {
        a = this.ea(op); f = this.rd(a);
        switch ((op >> 10) & 3) {
          case 0: v = this.zn(((f >> 1) | (f << 7)) & 0xff); break; // RRNCF
          case 1: v = this.zn(((f << 1) | (f >> 7)) & 0xff); break; // RLNCF
          case 2: // INFSNZ
            v = (f + 1) & 0xff;
            if (d) this.wr(a, v); else this.w = v;
            return v !== 0 ? this.skip() : 1;
          default: // DCFSNZ
            v = (f - 1) & 0xff;
            if (d) this.wr(a, v); else this.w = v;
            return v !== 0 ? this.skip() : 1;
        }
        if (d) this.wr(a, v); else this.w = v;
        return 1;
      }
      case 0x5: {
        a = this.ea(op); f = this.rd(a);
        switch ((op >> 10) & 3) {
          case 0: v = this.zn(f); break; // MOVF
          case 1: v = this.sub(this.w, f, (this.st & C) ^ 1); break; // SUBFWB
          case 2: v = this.sub(f, this.w, (this.st & C) ^ 1); break; // SUBWFB
          default: v = this.sub(f, this.w, 0); break; // SUBWF
        }
        if (d) this.wr(a, v); else this.w = v;
        return 1;
      }
      case 0x6: {
        a = this.ea(op);
        switch ((op >> 9) & 7) {
          case 0: return this.rd(a) < this.w ? this.skip() : 1; // CPFSLT
          case 1: return this.rd(a) === this.w ? this.skip() : 1; // CPFSEQ
          case 2: return this.rd(a) > this.w ? this.skip() : 1; // CPFSGT
          case 3: return this.rd(a) === 0 ? this.skip() : 1; // TSTFSZ
          case 4: this.wr(a, 0xff); return 1; // SETF
          case 5: this.wr(a, 0); this.st |= Z; return 1; // CLRF
          case 6: this.wr(a, this.sub(0, this.rd(a), 0)); return 1; // NEGF
          default: this.wr(a, this.w); return 1; // MOVWF
        }
      }
      case 0x7: a = this.ea(op); this.wr(a, this.rd(a) ^ (1 << ((op >> 9) & 7))); return 1; // BTG
      case 0x8: a = this.ea(op); this.wr(a, this.rd(a) | (1 << ((op >> 9) & 7))); return 1; // BSF
      case 0x9: a = this.ea(op); this.wr(a, this.rd(a) & ~(1 << ((op >> 9) & 7))); return 1; // BCF
      case 0xa: a = this.ea(op); return this.rd(a) & (1 << ((op >> 9) & 7)) ? this.skip() : 1; // BTFSS
      case 0xb: a = this.ea(op); return this.rd(a) & (1 << ((op >> 9) & 7)) ? 1 : this.skip(); // BTFSC
      case 0xc: { // MOVFF
        const op2 = this.prog[this.pc & 0x7fff] | (this.prog[(this.pc + 1) & 0x7fff] << 8);
        this.pc = (this.pc + 2) & 0x1ffffe;
        const src = op & 0xfff, dst = op2 & 0xfff;
        const sa = src >= 0xfdb ? this.resolve(src) : src;
        const val = this.rd(sa);
        const da = dst >= 0xfdb ? this.resolve(dst) : dst;
        this.wr(da, val);
        return 2;
      }
      case 0xd: {
        const n = ((op & 0x7ff) << 21) >> 21;
        if (op & 0x800) this.push(this.pc); // RCALL
        this.pc = (this.pc + 2 * n) & 0x1ffffe;
        return 2;
      }
      case 0xe: {
        const hi = (op >> 8) & 0x0f;
        if (hi < 8) {
          const st = this.st;
          let take: boolean;
          switch (hi) {
            case 0: take = !!(st & Z); break; // BZ
            case 1: take = !(st & Z); break; // BNZ
            case 2: take = !!(st & C); break; // BC
            case 3: take = !(st & C); break; // BNC
            case 4: take = !!(st & OV); break; // BOV
            case 5: take = !(st & OV); break; // BNOV
            case 6: take = !!(st & N); break; // BN
            default: take = !(st & N); break; // BNN
          }
          if (!take) return 1;
          this.pc = (this.pc + 2 * ((op << 24) >> 24)) & 0x1ffffe;
          return 2;
        }
        const op2 = this.prog[this.pc & 0x7fff] | (this.prog[(this.pc + 1) & 0x7fff] << 8);
        if (hi === 0xc || hi === 0xd || hi === 0xf) {
          this.pc = (this.pc + 2) & 0x1ffffe;
          const target = (((op2 & 0xfff) << 8) | (op & 0xff)) << 1;
          if (hi !== 0xf) { // CALL
            if (op & 0x100) { this.shadow[0] = this.w; this.shadow[1] = this.st; this.shadow[2] = this.bsr; }
            this.push(this.pc);
          }
          this.pc = target;
          return 2;
        }
        if (hi === 0xe && (op & 0xc0) === 0) { // LFSR
          this.pc = (this.pc + 2) & 0x1ffffe;
          const fn = (op >> 4) & 3;
          const k = ((op & 0x0f) << 8) | (op2 & 0xff);
          const fl = [S.FSR0L, S.FSR1L, S.FSR2L][fn];
          if (fl !== undefined) { this.ram[fl] = k & 0xff; this.ram[fl + 1] = k >> 8; }
          return 2;
        }
        this.trap(op, pc);
        return 1;
      }
      default:
        return 1; // 0xFxxx: NOP (second word of a two-word instruction)
    }
  }

  private misc(op: number): number {
    const r = this.ram;
    switch (op) {
      case 0x0000: return 1; // NOP
      case 0x0003: // SLEEP
        this.sleeping = true; this.wdtSeconds = 0; r[S.RCON] &= ~0x04; r[S.RCON] |= 0x08;
        return 1;
      case 0x0004: this.wdtSeconds = 0; r[S.RCON] |= 0x0c; return 1; // CLRWDT
      case 0x0005: this.push(this.pc); return 1; // PUSH
      case 0x0006: this.pop(); return 1; // POP
      case 0x0007: { // DAW
        let v = this.w;
        let c = this.st & C;
        if ((v & 0x0f) > 9 || this.st & DC) v += 0x06;
        if (v > 0x9f || c) { v += 0x60; c = 1; }
        if (v > 0xff) c = 1;
        this.w = v & 0xff;
        this.st = (this.st & ~C) | c;
        return 1;
      }
      case 0x0008: case 0x0009: case 0x000a: case 0x000b: { // TBLRD
        let p = r[S.TBLPTRL] | (r[S.TBLPTRH] << 8) | ((r[S.TBLPTRU] & 0x3f) << 16);
        if (op === 0x000b) p = (p + 1) & 0x3fffff;
        r[S.TABLAT] = this.progByte(p);
        if (op === 0x0009) p = (p + 1) & 0x3fffff;
        else if (op === 0x000a) p = (p - 1) & 0x3fffff;
        r[S.TBLPTRL] = p & 0xff; r[S.TBLPTRH] = (p >> 8) & 0xff; r[S.TBLPTRU] = p >> 16;
        return 2;
      }
      case 0x000c: case 0x000d: case 0x000e: case 0x000f: { // TBLWT (holding registers only)
        let p = r[S.TBLPTRL] | (r[S.TBLPTRH] << 8) | ((r[S.TBLPTRU] & 0x3f) << 16);
        if (op === 0x000f) p = (p + 1) & 0x3fffff;
        else if (op === 0x000d) p = (p + 1) & 0x3fffff;
        else if (op === 0x000e) p = (p - 1) & 0x3fffff;
        r[S.TBLPTRL] = p & 0xff; r[S.TBLPTRH] = (p >> 8) & 0xff; r[S.TBLPTRU] = p >> 16;
        return 2;
      }
      case 0x0010: case 0x0011: { // RETFIE
        this.pc = this.pop();
        if (r[S.RCON] & 0x80) {
          if (!(r[S.INTCON] & 0x80)) r[S.INTCON] |= 0x80; else r[S.INTCON] |= 0x40;
        } else r[S.INTCON] |= 0x80;
        if (op & 1) { this.w = this.shadow[0]; this.st = this.shadow[1]; this.bsr = this.shadow[2]; }
        this.irqBlock = 1;
        return 2;
      }
      case 0x0012: case 0x0013: // RETURN
        this.pc = this.pop();
        if (op & 1) { this.w = this.shadow[0]; this.st = this.shadow[1]; this.bsr = this.shadow[2]; }
        return 2;
      case 0x00ff: // RESET
        this.softReset('RESET instruction executed.');
        return 1;
      default:
        this.trap(op, this.pc - 2);
        return 1;
    }
  }

  private trap(op: number, at: number) {
    this.lastTrap = `Unsupported/invalid opcode 0x${op.toString(16).padStart(4, '0')} at 0x${at.toString(16)}`;
    this.bus.log('warn', this.lastTrap + ' (executed as NOP)');
  }

  // ---------------------------------------------------------- debugger
  portState(p: number) {
    return {
      lat: this.ram[S.LATA + p],
      tris: this.ram[S.TRISA + p],
      level: this.pinLevels(p) & PORT_MASK[p],
      analog: this.analogMask(p),
    };
  }

  /** Snapshot of timer/peripheral internals that are not visible in SFRs directly. */
  peripheralState() {
    const r = this.ram;
    const t2ps = [1, 4, 16, 16][r[S.T2CON] & 3];
    const pwm = [0, 1].map((k) => {
      const con = r[k === 0 ? S.CCP1CON : S.CCP2CON];
      const duty = (r[k === 0 ? S.CCPR1L : S.CCPR2L] << 2) | ((con >> 4) & 3);
      const period = (r[S.PR2] + 1) * 4;
      return {
        mode: con & 0x0f,
        enabled: (con & 0x0c) === 0x0c && !!(r[S.T2CON] & 4),
        freq: this.fosc / (period * t2ps),
        duty: Math.min(1, duty / period),
      };
    });
    return {
      tmr0: this.tmr0, tmr1: this.tmr1, tmr2: this.tmr2, tmr3: this.tmr3,
      pwm, baud: this.baudRate(), adcBusy: this.adcDoneAt >= 0, sleeping: this.sleeping,
      stack: Array.from(this.stack.slice(1, this.sp + 1)),
    };
  }
}
