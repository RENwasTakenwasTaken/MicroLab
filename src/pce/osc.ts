// Free-running sine oscillator shared by the kits' signal models.

/** Sine oscillator that keeps its phase when its frequency is changed, with the slow wander of a free-running circuit. */
export class Osc {
  f = 1000;
  private tRef = 0;
  private phRef = 0;
  private wob: number;
  private period: number;
  constructor(wob: number, period: number) { this.wob = wob; this.period = period; }
  private warp(t: number) { return t - ((this.wob * this.period) / (2 * Math.PI)) * Math.cos((2 * Math.PI * t) / this.period); }
  phase(t: number) { return this.phRef + 2 * Math.PI * this.f * (this.warp(t) - this.warp(this.tRef)); }
  /** frequency at time t, wander included */
  at(t: number) { return this.f * (1 + this.wob * Math.sin((2 * Math.PI * t) / this.period)); }
  set(f: number, t: number) {
    if (f === this.f) return;
    this.phRef = this.phase(t) % (2 * Math.PI);
    this.tRef = t;
    this.f = f;
  }
}
