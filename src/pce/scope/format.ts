// Readout formats of the TDS1002 screen.

const sig = (v: number, digits: number) => {
  const a = Math.abs(v);
  const whole = a >= 100 ? 3 : a >= 10 ? 2 : 1;
  return v.toFixed(Math.max(0, digits - whole));
};

/** "880mV", "1.04V", "-32.2mV" */
export function fmtV(v: number, digits = 3): string {
  const a = Math.abs(v);
  if (a < 0.0005) return '0.00V';
  return a < 1 ? `${sig(v * 1000, digits)}mV` : `${sig(v, digits)}V`;
}
/** "100µs", "2.50ms", "500ns" */
export function fmtT(s: number, digits = 3): string {
  const a = Math.abs(s);
  if (a === 0) return '0.000s';
  if (a < 1e-6) return `${sig(s * 1e9, digits)}ns`;
  if (a < 1e-3) return `${sig(s * 1e6, digits)}µs`;
  if (a < 1) return `${sig(s * 1e3, digits)}ms`;
  return `${sig(s, digits)}s`;
}
/** "1.000kHz", "455.0kHz", "3.80872kHz" with more digits */
export function fmtF(hz: number, digits = 4): string {
  const a = Math.abs(hz);
  if (a >= 1e6) return `${sig(hz / 1e6, digits)}MHz`;
  if (a >= 1e3) return `${sig(hz / 1e3, digits)}kHz`;
  return `${sig(hz, digits)}Hz`;
}
/** Sample rate: "2.50MS/s" */
export function fmtRate(sps: number): string {
  if (sps >= 1e9) return `${sig(sps / 1e9, 3)}GS/s`;
  if (sps >= 1e6) return `${sig(sps / 1e6, 3)}MS/s`;
  if (sps >= 1e3) return `${sig(sps / 1e3, 3)}kS/s`;
  return `${sig(sps, 3)}S/s`;
}
/** SEC/DIV and VOLTS/DIV steps print without trailing zeros beyond three digits: "100µs", "2.50ms", "1.00V" */
export const fmtDb = (db: number) => `${db.toFixed(Math.abs(db) >= 100 ? 0 : Math.abs(db) >= 10 ? 1 : 2)}dB`;
