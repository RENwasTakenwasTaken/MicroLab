// Board sounds: active buzzer tone and relay contact click (Web Audio).

import type { BoardSnapshot } from '../sim/board/types.ts';

class BoardAudio {
  muted = false;
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private lastRelay = -1;

  private ensure() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'square';
      this.osc.frequency.value = 2400; // typical active buzzer resonance
      this.osc.connect(this.gain);
      this.osc.start();
    } catch { this.ctx = null; }
    return this.ctx;
  }

  /** Must be called from a user gesture once so browsers allow audio. */
  unlock() { this.ensure()?.resume().catch(() => {}); }

  update(b: BoardSnapshot) {
    if (b.kind !== 'pic') return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const level = this.muted ? 0 : Math.min(1, b.buzzer) * 0.05;
    this.gain!.gain.setTargetAtTime(level, ctx.currentTime, 0.01);
    if (this.lastRelay >= 0 && b.relaySwitches !== this.lastRelay && !this.muted) this.click();
    this.lastRelay = b.relaySwitches;
  }

  /** Soft sine tones: a two-note "tick" when a workflow task completes, a rising arpeggio when all are done. */
  chime(kind: 'step' | 'done' = 'step') {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    ctx.resume().catch(() => {});
    const notes = kind === 'step' ? [880, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
    const gap = kind === 'step' ? 0.09 : 0.12;
    const tail = kind === 'step' ? 0.35 : 0.7;
    notes.forEach((f, i) => {
      const t = ctx.currentTime + 0.02 + i * gap;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.06, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t + tail);
      osc.connect(env).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + tail + 0.05);
    });
  }

  private click() {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 6)) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }
}

export const audio = new BoardAudio();
