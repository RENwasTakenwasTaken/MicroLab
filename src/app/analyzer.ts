// Logic analyzer capture buffer (UI side). Stores port transitions streamed
// from the worker and provides per-pin waveform queries and measurements.

const CAP = 1 << 18;

class PortTrace {
  t = new Float64Array(CAP);
  v = new Uint8Array(CAP);
  head = 0;
  count = 0;
  push(t: number, v: number) {
    this.t[this.head] = t;
    this.v[this.head] = v;
    this.head = (this.head + 1) % CAP;
    if (this.count < CAP) this.count++;
  }
  at(i: number) { const k = (this.head - this.count + i + CAP) % CAP; return [this.t[k], this.v[k]] as const; }
}

export interface Edge { t: number; level: number }

class Analyzer {
  ports: PortTrace[] = [];
  now = 0;
  version = 0;
  dropped = 0;

  clear() { this.ports = []; this.now = 0; this.version++; this.dropped = 0; }

  ingest(a: { t: number[]; v: number[]; dropped: number }, simTime: number) {
    for (let i = 0; i < a.t.length; i++) {
      const port = a.v[i] >> 8;
      (this.ports[port] ??= new PortTrace()).push(a.t[i], a.v[i] & 0xff);
    }
    this.dropped += a.dropped;
    if (simTime < this.now) this.clear();
    this.now = simTime;
    this.version++;
  }

  /** Level changes of one pin inside [t0, t1], plus the level at t0. */
  edges(port: number, bit: number, t0: number, t1: number): { initial: number; edges: Edge[] } {
    const tr = this.ports[port];
    if (!tr || !tr.count) return { initial: 0, edges: [] };
    let lo = 0, hi = tr.count - 1, first = tr.count;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tr.at(mid)[0] >= t0) { first = mid; hi = mid - 1; } else lo = mid + 1;
    }
    let level = first > 0 ? (tr.at(first - 1)[1] >> bit) & 1 : 0;
    const initial = level;
    const edges: Edge[] = [];
    for (let i = first; i < tr.count; i++) {
      const [t, v] = tr.at(i);
      if (t > t1) break;
      const b = (v >> bit) & 1;
      if (b !== level) { edges.push({ t, level: b }); level = b; }
    }
    return { initial, edges };
  }

  /** Frequency / duty measured over the most recent `window` seconds. */
  measure(port: number, bit: number, window = 0.5) {
    const { edges } = this.edges(port, bit, this.now - window, this.now);
    const rising = edges.filter((e) => e.level === 1).map((e) => e.t);
    if (rising.length < 2) return null;
    const period = (rising[rising.length - 1] - rising[0]) / (rising.length - 1);
    let high = 0, total = 0;
    for (let i = 0; i + 1 < edges.length; i++) {
      const d = edges[i + 1].t - edges[i].t;
      total += d;
      if (edges[i].level === 1) high += d;
    }
    return { freq: 1 / period, period, duty: total ? high / total : 0 };
  }
}

export const analyzer = new Analyzer();
