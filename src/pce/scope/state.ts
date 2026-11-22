// Front-panel state of the Tektronix TDS1002 as used in the PCE lab: two channels, edge trigger,
// cursors, automatic measurements, XY display and the FFT math function.

export type Coupling = 'DC' | 'AC' | 'GND';
export interface Channel {
  /** waveform displayed */
  on: boolean;
  /** volts per division as displayed (includes the Probe setting) */
  vdiv: number;
  /** ground level, divisions above the centre line */
  pos: number;
  coupling: Coupling;
  /** Probe attenuation set in the channel menu. The lab probes are 1X. */
  probe: 1 | 10 | 100;
  invert: boolean;
  fine: boolean;
  bwLimit: boolean;
}
export type Menu = 'none' | 'ch1' | 'ch2' | 'math' | 'cursor' | 'measure' | 'display' | 'trigger' | 'acquire' | 'horiz' | 'utility' | 'save' | 'autoset';
export type MeasType = 'none' | 'freq' | 'period' | 'mean' | 'pkpk' | 'rms' | 'min' | 'max';
export const MEAS_TYPES: MeasType[] = ['freq', 'period', 'mean', 'pkpk', 'rms', 'min', 'max', 'none'];
export const MEAS_NAME: Record<MeasType, string> = { none: 'None', freq: 'Freq', period: 'Period', mean: 'Mean', pkpk: 'Pk-Pk', rms: 'Cyc RMS', min: 'Min', max: 'Max' };
export type FftWindow = 'hanning' | 'flattop' | 'rect';

export interface ScopeState {
  ch: [Channel, Channel];
  /** seconds per division */
  sdiv: number;
  /** horizontal position: time of the screen centre relative to the trigger (s) */
  hpos: number;
  trig: { source: 0 | 1; slope: 'rise' | 'fall'; level: number; mode: 'auto' | 'normal' };
  run: boolean;
  /** SINGLE SEQ armed: stop after the next triggered acquisition */
  single: boolean;
  menu: Menu;
  math: {
    on: boolean; op: 'fft' | 'add' | 'sub'; source: 0 | 1; window: FftWindow; zoom: 1 | 2 | 5 | 10;
    /** frequency at the centre graticule line, as a fraction of the Nyquist frequency */
    center: number;
    /** 0 dB level, divisions above the centre line */
    vpos: number;
  };
  cursor: { type: 'off' | 'v' | 't'; source: 'ch1' | 'ch2' | 'math'; a: number; b: number };
  meas: { source: 0 | 1; type: MeasType }[];
  /** MEASURE: which of the five slots is being edited (its own submenu), or null */
  measEdit: number | null;
  xy: boolean;
  dots: boolean;
  /** LCD contrast, 0..1 */
  contrast: number;
  acq: 'sample' | 'peak' | 'average';
  /** message line at the bottom of the screen, e.g. while a POSITION knob turns */
  note: { text: string; until: number } | null;
}

const channel = (vdiv: number, pos: number): Channel => ({ on: true, vdiv, pos, coupling: 'DC', probe: 1, invert: false, fine: false, bwLimit: false });

/** As the bench scope is found at the start of a lab turn: both channels on, 1X probes, YT display. */
export function initialScope(): ScopeState {
  return {
    ch: [channel(1, 2), channel(1, -2)], sdiv: 500e-6, hpos: 0,
    trig: { source: 0, slope: 'rise', level: 0, mode: 'auto' },
    run: true, single: false, menu: 'none',
    math: { on: false, op: 'fft', source: 1, window: 'hanning', zoom: 1, center: 0.5, vpos: 3 },
    cursor: { type: 'off', source: 'ch1', a: 1, b: -1 },
    meas: [{ source: 0, type: 'freq' }, { source: 0, type: 'pkpk' }, { source: 1, type: 'none' }, { source: 1, type: 'none' }, { source: 1, type: 'none' }],
    measEdit: null, xy: false, dots: false, contrast: 0.6, acq: 'sample', note: null,
  };
}

/** DEFAULT SETUP button: factory settings. Note the 10X probe attenuation, a classic trap with 1X probes. */
export function defaultSetup(): ScopeState {
  const s = initialScope();
  s.ch = [{ ...channel(1, 0), probe: 10 }, { ...channel(1, 0), probe: 10, on: false }];
  s.meas = s.meas.map(() => ({ source: 0, type: 'none' }));
  return s;
}

export const SDIV_STEPS = [100e-9, 250e-9, 500e-9, 1e-6, 2.5e-6, 5e-6, 10e-6, 25e-6, 50e-6, 100e-6, 250e-6, 500e-6, 1e-3, 2.5e-3, 5e-3, 10e-3, 25e-3, 50e-3, 100e-3, 250e-3, 500e-3, 1];
/** Volts/div at the BNC (1X): 2 mV to 5 V in a 1-2-5 sequence. */
export const VDIV_STEPS = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
/** Samples in one acquisition record, spread over the 10 horizontal divisions. */
export const RECORD = 2500;
