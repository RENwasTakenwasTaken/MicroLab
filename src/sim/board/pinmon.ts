// Tracks every port pin over time: per-frame high-time (for LED brightness,
// PWM averaging), toggle counts, and a transition log for the logic analyzer.

export const MAX_PORTS = 5;

export interface PinStats {
  /** fraction of the last frame each pin spent high (outputs only), per port, 8 entries */
  duty: number[][];
  /** transitions per second during the last frame */
  rate: number[][];
  /** frequency (Hz) from the last rising-edge timestamps; exact for slow and fast signals */
  freq: number[][];
}

const EDGES = 16;

export class PinMonitor {
  level = new Uint8Array(MAX_PORTS);
  driven = new Uint8Array(MAX_PORTS);
  private since = new Float64Array(MAX_PORTS * 8); // timestamp of last change
  private high = new Float64Array(MAX_PORTS * 8); // accumulated high time this frame
  private toggles = new Uint32Array(MAX_PORTS * 8);
  private frameStart = 0;
  // transition log for the logic analyzer
  readonly capacity = 1 << 16;
  logT = new Float64Array(this.capacity);
  logV = new Uint16Array(this.capacity); // port << 8 | level
  logHead = 0;
  logCount = 0;
  private sentHead = 0;
  lastStats: PinStats = { duty: [], rate: [], freq: [] };
  private rise = new Float64Array(MAX_PORTS * 8 * EDGES);
  private riseN = new Uint32Array(MAX_PORTS * 8);

  reset(t = 0) {
    this.level.fill(0); this.driven.fill(0);
    this.since.fill(t); this.high.fill(0); this.toggles.fill(0);
    this.frameStart = t; this.logHead = 0; this.logCount = 0; this.sentHead = 0;
    this.riseN.fill(0);
  }

  update(port: number, level: number, driven: number, t: number) {
    const prevL = this.level[port], prevD = this.driven[port];
    const eff = level & driven;
    const prevEff = prevL & prevD;
    const changed = eff ^ prevEff;
    if (changed) {
      for (let b = 0; b < 8; b++) {
        if (!(changed & (1 << b))) continue;
        const i = port * 8 + b;
        const from = Math.max(this.since[i], this.frameStart);
        if (prevEff & (1 << b)) this.high[i] += Math.max(0, t - from);
        this.since[i] = t;
        this.toggles[i]++;
        if (eff & (1 << b)) this.rise[i * EDGES + (this.riseN[i]++ % EDGES)] = t;
      }
    }
    this.level[port] = level;
    this.driven[port] = driven;
    if (changed || driven !== prevD) {
      this.logT[this.logHead] = t;
      this.logV[this.logHead] = (port << 8) | eff;
      this.logHead = (this.logHead + 1) & (this.capacity - 1);
      if (this.logCount < this.capacity) this.logCount++;
    }
  }

  /** Close the current frame at time t and return statistics. */
  frame(t: number, ports: number): PinStats {
    const dt = Math.max(1e-9, t - this.frameStart);
    const duty: number[][] = [], rate: number[][] = [], freq: number[][] = [];
    for (let p = 0; p < ports; p++) {
      const eff = this.level[p] & this.driven[p];
      const d: number[] = [], r: number[] = [], fq: number[] = [];
      for (let b = 0; b < 8; b++) {
        const i = p * 8 + b;
        let h = this.high[i];
        if (eff & (1 << b)) h += t - Math.max(this.since[i], this.frameStart);
        d.push(Math.min(1, Math.max(0, h / dt)));
        r.push(this.toggles[i] / dt);
        const n = Math.min(this.riseN[i], EDGES);
        let f = 0;
        if (n >= 2) {
          const last = this.rise[i * EDGES + ((this.riseN[i] - 1) % EDGES)];
          const first = this.rise[i * EDGES + ((this.riseN[i] - n) % EDGES)];
          const period = (last - first) / (n - 1);
          if (period > 0 && t - last < period * 2.5) f = 1 / period;
        }
        fq.push(f);
        this.high[i] = 0;
        this.toggles[i] = 0;
      }
      duty.push(d); rate.push(r); freq.push(fq);
    }
    this.frameStart = t;
    this.lastStats = { duty, rate, freq };
    return this.lastStats;
  }

  /** Transitions recorded since the previous call (bounded). */
  drainLog(max = 20000): { t: number[]; v: number[]; dropped: number } {
    let n = (this.logHead - this.sentHead + this.capacity) & (this.capacity - 1);
    let dropped = 0;
    if (n > max) { dropped = n - max; this.sentHead = (this.sentHead + dropped) & (this.capacity - 1); n = max; }
    const t: number[] = new Array(n), v: number[] = new Array(n);
    for (let k = 0; k < n; k++) {
      const i = (this.sentHead + k) & (this.capacity - 1);
      t[k] = this.logT[i]; v[k] = this.logV[i];
    }
    this.sentHead = this.logHead;
    return { t, v, dropped };
  }
}
