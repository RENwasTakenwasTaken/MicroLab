// Shared contracts between MCU cores, board models and the simulation worker.

export type Arch = 'pic18' | 'mcs51';

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * The electrical connection between an MCU core and the board it is mounted on.
 * Ports are numbered 0..n (PIC: A..E, 8051: P0..P3).
 */
export interface PinBus {
  /** Logic levels seen on the pins in `mask` (pins not driven by the MCU). */
  readInputs(port: number, mask: number): number;
  /** Called whenever the MCU's driven pin state on a port changes. `cycle` is the instruction-cycle timestamp. */
  outputsChanged(port: number, level: number, driven: number, cycle: number): void;
  /** Analog voltage (V) on a pin, for the ADC. */
  analogVoltage(port: number, bit: number): number;
  /** A byte fully shifted out of the UART. */
  serialTx(byte: number): void;
  log(level: LogLevel, msg: string): void;
}

export interface McuCore {
  readonly arch: Arch;
  /** Elapsed instruction cycles since reset (PIC: Tcy = 4/Fosc, 8051: machine cycle = 12/Fosc). */
  cycles: number;
  pc: number;
  /** Instruction cycles per second at the current clock configuration. */
  cycleHz(): number;
  /** Executes one instruction (or interrupt entry). Returns cycles consumed. */
  step(): number;
  reset(): void;
  loadHex(text: string): { bytes: number; warnings: string[] };
  /** Notify the core that external pin levels may have changed (button press, peripheral response). */
  inputsChanged(): void;
  serialRx(byte: number): void;
  /** Port pin state for the debugger. */
  portState(port: number): { lat: number; tris: number; level: number; analog: number };
}
