// Simulation engine: owns the MCU core and the board model, paces execution
// against wall-clock time, handles breakpoints / stepping and builds frames.
// Runs inside a Web Worker (see worker.ts) but has no DOM/worker dependency.

import type { Arch, McuCore } from './core/types.ts';
import { Pic18, SFR } from './pic18/pic18.ts';
import { Mcs51 } from './mcs51/mcs51.ts';
import { disasmPic18 } from './pic18/disasm.ts';
import { disasm51 } from './mcs51/disasm.ts';
import { applicationBlank, eraseApplication, flashApplication, installBootloader } from './pic18/bootloader.ts';
import { PicBoard } from './board/picboard.ts';
import { Mcs51Board } from './board/mcs51board.ts';
import type { BoardInput, Mcs51BoardConfig, PicBoardConfig, SimBoard } from './board/types.ts';
import { PIC_PORTS } from './board/types.ts';
import type { BootSeq, DebugInfo, DeviceState, FrameData, FromWorker, PortView, StepMode } from './protocol.ts';

interface StepGoal {
  mode: StepMode;
  startPc: number;
  startLine: number | null;
  startDepth: number;
}

export class Engine {
  arch: Arch = 'pic18';
  mcu!: McuCore;
  board!: SimBoard;
  loaded = false;
  running = false;
  speed = 1;
  analyzer = false;
  /**
   * PIC: device is inside the USB HID bootloader. 8051 (SST89E516RD2): inside its serial IAP
   * boot firmware (entered when RESET is released while SST EasyIAP is calling it). In both
   * cases the user code is not executing.
   */
  bootloader = false;
  /** 8051: SST EasyIAP is sending its detect handshake over the USB-UART (Detect MCU waiting for RESET). */
  iapSync = false;
  bootSeq: BootSeq = 'idle';
  private breakpoints = new Set<number>();
  private bpLines: number[] = [];
  private debug: DebugInfo | null = null;
  private lineAddrs: { addr: number; line: number }[] = [];
  private goal: StepGoal | null = null;
  private lastWall = 0;
  private lastFrameSim = 0;
  private lastFrameWall = 0;
  private instrCount = 0;
  private lastMips = 0;
  private lastRatio = 0;
  private post: (m: FromWorker) => void;

  constructor(post: (m: FromWorker) => void) {
    this.post = post;
  }

  init(arch: Arch, cfg: PicBoardConfig | Mcs51BoardConfig) {
    this.arch = arch;
    this.running = false;
    this.loaded = false;
    this.goal = null;
    if (arch === 'pic18') {
      const board = new PicBoard(cfg as PicBoardConfig);
      this.board = board;
      const mcu = new Pic18(board);
      board.attach(mcu);
      mcu.prog.fill(0xff);
      installBootloader(mcu);
      mcu.reset();
      this.mcu = mcu;
      this.bootloader = false;
      this.bootSeq = 'idle';
      // a powered PIC always executes; with a blank application it runs through erased flash
      this.running = true;
      this.lastWall = performance.now();
    } else {
      const c = cfg as Mcs51BoardConfig;
      const board = new Mcs51Board(c);
      this.board = board;
      const mcu = new Mcs51(board, c.variant);
      mcu.clockHz = c.clockHz;
      board.attach(mcu);
      this.mcu = mcu;
      this.bootloader = false;
      this.bootSeq = 'idle';
      this.iapSync = false;
    }
    this.post({ type: 'ready' });
  }

  load(hex: string, debug?: DebugInfo) {
    this.running = false;
    this.goal = null;
    const res = this.mcu.loadHex(hex);
    this.board.attach(this.mcu);
    this.mcu.reset();
    this.debug = debug ?? null;
    this.lineAddrs = [];
    if (debug) {
      const best = new Map<number, number>();
      for (const e of debug.lines) {
        if (e.file !== debug.mainFile) continue;
        this.lineAddrs.push({ addr: e.addr, line: e.line });
        const prev = best.get(e.line);
        if (prev === undefined || e.addr < prev) best.set(e.line, e.addr);
      }
      this.lineAddrs.sort((a, b) => a.addr - b.addr);
    }
    this.setBreakpoints(this.bpLines);
    this.loaded = true;
    this.post({ type: 'loaded', bytes: res.bytes, warnings: res.warnings, clock: this.clock() });
    this.sendFrame();
  }

  unload() {
    this.running = false;
    this.loaded = false;
    if (this.mcu instanceof Pic18) this.mcu.prog.fill(0xff);
    else (this.mcu as Mcs51).code.fill(0xff);
    this.mcu.reset();
    this.sendFrame();
  }

  get isPic() { return this.mcu instanceof Pic18; }

  private setDebug(debug?: DebugInfo) {
    this.debug = debug ?? null;
    this.lineAddrs = [];
    if (debug) {
      for (const e of debug.lines) if (e.file === debug.mainFile) this.lineAddrs.push({ addr: e.addr, line: e.line });
      this.lineAddrs.sort((a, b) => a.addr - b.addr);
    }
    this.setBreakpoints(this.bpLines);
  }

  // ------------------------- USB bootloader (PIC) / serial IAP boot firmware (SST 8051)
  erase() {
    if (!this.bootloader || !this.board.power) {
      this.post({ type: 'bootloader', op: 'erase', ok: false, error: 'Device is not in bootloader mode' });
      return;
    }
    if (this.isPic) eraseApplication(this.mcu as Pic18);
    else (this.mcu as Mcs51).code.fill(0xff);
    this.loaded = false;
    this.setDebug(undefined);
    this.post({ type: 'bootloader', op: 'erase', ok: true });
    this.sendFrame();
  }

  flash(hex: string, debug?: DebugInfo) {
    if (!this.bootloader || !this.board.power) {
      this.post({ type: 'bootloader', op: 'flash', ok: false, error: 'Device is not in bootloader mode' });
      return;
    }
    if (!this.isPic) {
      try {
        const m = this.mcu as Mcs51;
        const c = m.cycles;
        const res = m.loadHex(hex);
        m.cycles = c; // keep the time base: the scope and the pin monitor need monotonic time
        this.loaded = res.bytes > 0;
        this.setDebug(debug);
        this.post({ type: 'bootloader', op: 'flash', ok: true, bytes: res.bytes, warnings: res.warnings });
      } catch (e) {
        this.post({ type: 'bootloader', op: 'flash', ok: false, error: (e as Error).message });
      }
      this.sendFrame();
      return;
    }
    try {
      const res = flashApplication(this.mcu as Pic18, hex);
      this.loaded = !applicationBlank(this.mcu as Pic18);
      this.setDebug(debug);
      this.post({ type: 'bootloader', op: 'flash', ok: true, bytes: res.bytes, warnings: res.warnings });
    } catch (e) {
      this.post({ type: 'bootloader', op: 'flash', ok: false, error: (e as Error).message });
    }
    this.sendFrame();
  }

  /** Bootloader "Reset Device" command from the PC tool: leave the bootloader and start the application. */
  leaveBootloader() {
    if (!this.bootloader || !this.isPic) return;
    this.bootloader = false;
    this.bootSeq = 'idle';
    (this.mcu as Pic18).softReset();
    this.running = this.board.power;
    this.lastWall = performance.now();
    this.sendFrame();
  }

  deviceState(): DeviceState {
    const flashed = this.loaded;
    let mode: DeviceState['mode'];
    if (!this.board.power) mode = 'off';
    else if (this.board.resetHeld) mode = 'reset';
    else if (this.bootloader) mode = 'bootloader';
    else if (this.running) mode = !this.isPic || flashed ? 'running' : 'blank';
    else mode = this.loaded ? 'halted' : 'idle';
    return { mode, flashed, bootSeq: this.bootSeq };
  }

  clock() {
    if (this.mcu instanceof Pic18) {
      const c = this.mcu.clockInfo();
      return { fosc: c.fosc, cycleHz: c.fcy, mode: c.mode };
    }
    const m = this.mcu as Mcs51;
    return { fosc: m.clockHz, cycleHz: m.cycleHz(), mode: `${m.name} crystal` };
  }

  setBreakpoints(lines: number[]) {
    this.bpLines = lines;
    this.breakpoints.clear();
    if (!this.debug) return;
    for (const line of lines) {
      let addr = Infinity;
      for (const e of this.lineAddrs) if (e.line === line && e.addr < addr) addr = e.addr;
      if (addr !== Infinity) this.breakpoints.add(addr);
    }
  }

  /** Source line whose code contains `pc` (main file only). */
  lineOf(pc: number): number | null {
    const a = this.lineAddrs;
    if (!a.length) return null;
    let lo = 0, hi = a.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid].addr <= pc) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best >= 0 ? a[best].line : null;
  }

  private isLineStart(pc: number): number | null {
    const a = this.lineAddrs;
    let lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid].addr === pc) return a[mid].line;
      if (a[mid].addr < pc) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  private depth(): number {
    if (this.mcu instanceof Pic18) return this.mcu.sp;
    return (this.mcu as Mcs51).sfr[0x81];
  }

  run() {
    if (!this.board.power || this.bootloader || this.board.resetHeld) return;
    if (!this.loaded && !this.isPic) return;
    this.running = true; this.goal = null; this.lastWall = performance.now();
  }
  pause() {
    if (!this.running) return;
    this.running = false;
    this.goal = null;
    this.post({ type: 'stopped', reason: 'pause', pc: this.mcu.pc, line: this.lineOf(this.mcu.pc) });
    this.sendFrame();
  }

  reset() {
    this.mcu.reset();
    this.board.attach(this.mcu);
    this.goal = null;
    this.sendFrame();
  }

  step(mode: StepMode) {
    if (!this.loaded || !this.board.power) return;
    if (mode === 'instr' || !this.lineAddrs.length) {
      this.mcu.step();
      this.post({ type: 'stopped', reason: 'step', pc: this.mcu.pc, line: this.lineOf(this.mcu.pc) });
      this.sendFrame();
      return;
    }
    this.goal = { mode, startPc: this.mcu.pc, startLine: this.lineOf(this.mcu.pc), startDepth: this.depth() };
    this.running = true;
    this.lastWall = performance.now();
  }

  input(ev: BoardInput) {
    if (!this.board) return;
    const pic = this.isPic;
    const bootHeld = () => !!(this.board as PicBoard).pressed?.has('boot');
    const wasReset = this.board.resetHeld;
    this.board.input(ev);
    if (pic && ev.kind === 'button' && (ev.id === 'reset' || ev.id === 'boot')) {
      if (ev.id === 'reset' && ev.pressed) {
        this.goal = null;
        this.bootSeq = bootHeld() ? 'idle' : 'reset';
      } else if (ev.id === 'boot' && ev.pressed) {
        if (this.board.resetHeld && this.bootSeq === 'reset') this.bootSeq = 'reset+boot';
      } else if (ev.id === 'reset' && !ev.pressed && wasReset) {
        // the bootloader samples BOOT when MCLR is released
        if (bootHeld() && this.board.power) {
          this.bootloader = true;
          this.running = false;
          this.bootSeq = 'boot';
        } else {
          this.bootloader = false;
          this.bootSeq = 'idle';
          this.running = this.board.power;
          this.lastWall = performance.now();
        }
      } else if (ev.id === 'boot' && !ev.pressed) {
        if (this.bootloader && this.bootSeq === 'boot') this.bootSeq = 'ready';
      }
    }
    if (!pic && ev.kind === 'button' && ev.id === 'reset') {
      if (ev.pressed) { this.goal = null; this.bootSeq = 'reset'; }
      else if (wasReset) {
        // SST89E516RD2: after reset the boot firmware listens on the UART; if SST EasyIAP is
        // calling it (Detect MCU), it stays in IAP mode, otherwise it starts the application
        if (this.iapSync && this.board.power) {
          this.bootloader = true;
          this.running = false;
          this.bootSeq = 'ready';
        } else {
          this.bootloader = false;
          this.bootSeq = 'idle';
          this.running = this.board.power && this.loaded;
          this.lastWall = performance.now();
        }
      }
    }
    if (ev.kind === 'power') {
      this.goal = null;
      if (!ev.on) { this.running = false; this.bootloader = false; this.bootSeq = 'idle'; }
      else if (pic) {
        if (bootHeld()) { this.bootloader = true; this.running = false; }
        else { this.running = true; this.lastWall = performance.now(); }
      } else {
        // a power-on reset starts the application in flash (EasyIAP's handshake needs a RESET press)
        this.running = this.loaded;
        this.lastWall = performance.now();
      }
    }
    if (!this.running) this.sendFrame();
  }

  /** 8051: SST EasyIAP starts / stops calling the boot firmware over the UART (Detect MCU). */
  setIapSync(on: boolean) {
    this.iapSync = on;
  }

  /** Called periodically (~60 Hz). Executes instructions to keep pace with real time. */
  tick() {
    if (!this.mcu) return; // not initialised yet
    const now = performance.now();
    if (!this.running || this.board.resetHeld) {
      this.lastWall = now;
      if (now - this.lastFrameWall > 100) this.sendFrame();
      return;
    }
    const wallDt = Math.min(0.1, (now - this.lastWall) / 1000);
    this.lastWall = now;
    const hz = this.mcu.cycleHz();
    const budgetMs = 14;
    const target = this.speed > 0 && !this.goal ? this.mcu.cycles + wallDt * hz * this.speed : Infinity;
    const mcu = this.mcu;
    const bps = this.breakpoints;
    const checkBp = bps.size > 0;
    const goal = this.goal;
    const deadline = now + budgetMs;
    let n = 0;
    let stop: 'breakpoint' | 'step' | null = null;
    let first = true;
    outer: while (mcu.cycles < target) {
      for (let k = 0; k < 2000; k++) {
        if (checkBp && !first && bps.has(mcu.pc)) { stop = 'breakpoint'; break outer; }
        if (goal && !first) {
          const ln = this.isLineStart(mcu.pc);
          const d = this.depth();
          if (goal.mode === 'out' ? d < goal.startDepth && ln !== null
            : ln !== null && (ln !== goal.startLine || mcu.pc === goal.startPc) && (goal.mode === 'line' || d <= goal.startDepth)) {
            stop = 'step'; break outer;
          }
        }
        first = false;
        mcu.step();
        n++;
        if (mcu.cycles >= target) break;
      }
      if (performance.now() > deadline) break;
    }
    this.instrCount += n;
    if (stop) {
      this.running = false;
      this.goal = null;
      this.post({ type: 'stopped', reason: stop, pc: mcu.pc, line: this.lineOf(mcu.pc) });
      this.sendFrame();
      return;
    }
    if (now - this.lastFrameWall >= 33) this.sendFrame();
  }

  private portViews(stats: { duty: number[][]; rate: number[][]; freq: number[][] }): PortView[] {
    const views: PortView[] = [];
    for (let p = 0; p < this.board.portCount; p++) {
      const s = this.mcu.portState(p);
      views.push({
        name: this.arch === 'pic18' ? `PORT${PIC_PORTS[p]}` : `P${p}`,
        ...s,
        duty: stats.duty[p], rate: stats.rate[p], freq: stats.freq[p],
      });
    }
    return views;
  }

  sendFrame() {
    const wall = performance.now();
    const t = this.mcu.cycles / this.mcu.cycleHz();
    const wallDt = Math.max(1e-3, (wall - this.lastFrameWall) / 1000);
    const simDt = Math.max(0, t - this.lastFrameSim);
    if (this.running) {
      this.lastRatio = simDt / wallDt;
      this.lastMips = this.instrCount / wallDt / 1e6;
    } else { this.lastRatio = 0; this.lastMips = 0; }
    this.instrCount = 0;
    this.lastFrameWall = wall;
    this.lastFrameSim = t;
    const board = this.board.frame(t, Math.min(simDt, 0.2));
    const stats = this.board.pinMonitor.lastStats;
    let cpu: FrameData['cpu'];
    let mem: Uint8Array;
    let periph: Record<string, unknown>;
    if (this.mcu instanceof Pic18) {
      const m = this.mcu;
      const r = m.ram;
      mem = r.slice();
      mem[SFR.WREG] = m.w; mem[SFR.STATUS] = m.st; mem[SFR.BSR] = m.bsr;
      for (let p = 0; p < 5; p++) mem[SFR.PORTA + p] = m.portState(p).level & ~(m.analogMask(p) & r[SFR.TRISA + p]);
      mem[SFR.TMR0L] = m.tmr0 & 0xff; if (!(r[SFR.T0CON] & 0x40)) mem[SFR.TMR0H] = m.tmr0 >> 8;
      mem[SFR.TMR1L] = m.tmr1 & 0xff; mem[SFR.TMR1H] = m.tmr1 >> 8;
      mem[SFR.TMR3L] = m.tmr3 & 0xff; mem[SFR.TMR3H] = m.tmr3 >> 8;
      mem[SFR.TMR2] = m.tmr2;
      mem[SFR.PCL] = m.pc & 0xff;
      mem[SFR.STKPTR] = (m.stkful << 7) | (m.stkunf << 6) | m.sp;
      const fsr = (lo: number) => r[lo] | ((r[lo + 1] & 0x0f) << 8);
      cpu = {
        arch: 'pic18', pc: m.pc, w: m.w, status: m.st, bsr: m.bsr, sp: m.sp, stack: Array.from(m.stack.slice(1, m.sp + 1)),
        fsr: [fsr(SFR.FSR0L), fsr(SFR.FSR1L), fsr(SFR.FSR2L)], prod: (r[SFR.PRODH] << 8) | r[SFR.PRODL],
        tblptr: r[SFR.TBLPTRL] | (r[SFR.TBLPTRH] << 8) | (r[SFR.TBLPTRU] << 16), tablat: r[SFR.TABLAT],
      };
      periph = m.peripheralState();
    } else {
      const m = this.mcu as Mcs51;
      mem = new Uint8Array(384);
      mem.set(m.iram, 0);
      mem.set(m.sfr.subarray(0x80), 256);
      for (let p = 0; p < 4; p++) mem[256 + p * 0x10] = m.sfr[0x80 + p * 0x10];
      const psw = m.rdDirect(0xd0);
      mem[256 + 0x50] = psw;
      const bank = psw & 0x18;
      cpu = {
        arch: 'mcs51', pc: m.pc, a: m.sfr[0xe0], b: m.sfr[0xf0], psw, sp: m.sfr[0x81],
        dptr: (m.sfr[0x83] << 8) | m.sfr[0x82], r: Array.from(m.iram.slice(bank, bank + 8)),
      };
      periph = m.peripheralState();
    }
    const data: FrameData = {
      device: this.deviceState(),
      running: this.running,
      loaded: this.loaded,
      cycles: this.mcu.cycles,
      simTime: t,
      speedRatio: this.lastRatio,
      mips: this.lastMips,
      clock: this.clock(),
      cpu,
      mem,
      ports: this.portViews(stats),
      periph,
      board,
      line: this.loaded ? this.lineOf(this.mcu.pc) : null,
      logs: this.board.drainLogs(),
      serial: this.board.drainSerial(),
      analyzer: this.analyzer ? this.board.pinMonitor.drainLog() : undefined,
    };
    this.post({ type: 'frame', data });
  }

  disasm(addr: number, count: number) {
    const lines: { addr: number; text: string; raw: number[]; line: number | null }[] = [];
    let a = addr;
    for (let i = 0; i < count; i++) {
      if (this.mcu instanceof Pic18) {
        const d = disasmPic18(this.mcu.prog, a);
        lines.push({ addr: a, text: d.text, raw: d.raw, line: this.isLineStart(a) });
        a += d.words * 2;
      } else {
        const d = disasm51((this.mcu as Mcs51).code, a);
        lines.push({ addr: a, text: d.text, raw: d.raw, line: this.isLineStart(a) });
        a = (a + d.len) & 0xffff;
      }
    }
    this.post({ type: 'disasm', lines });
  }
}
