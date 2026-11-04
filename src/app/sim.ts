// UI-side client for the simulation worker plus the build/program workflow.

import type { BoardInput, Mcs51BoardConfig, PicBoardConfig } from '../sim/board/types.ts';
import { resetBench } from './bench.ts';
import type { Arch } from '../sim/core/types.ts';
import type { FrameData, FromWorker, StepMode, ToWorker } from '../sim/protocol.ts';
import { boardConfigFor, sourceFor, useFrame, useLab, type BuildResult } from './store.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { analyzer } from './analyzer.ts';
import { audio } from './audio.ts';

type Listener = (m: FromWorker) => void;

class SimClient {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  /** Latest frame, readable from render loops without React re-renders. */
  latest: FrameData | null = null;
  private lastUiPush = 0;

  private ensure() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    return this.worker;
  }

  send(m: ToWorker) { this.ensure().postMessage(m); }
  on(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }

  private onMessage(m: FromWorker) {
    const lab = useLab.getState();
    if (m.type === 'frame') {
      const f = m.data;
      this.latest = f;
      if (f.cpu.arch === 'pic18' && f.device.flashed !== lab.programmed) lab.set({ programmed: f.device.flashed });
      if (f.logs.length) lab.pushLog(f.logs.map((l) => ({ ...l, wall: Date.now() })));
      if (f.serial.length) lab.appendUart(String.fromCharCode(...f.serial));
      if (f.analyzer) analyzer.ingest(f.analyzer, f.simTime);
      audio.update(f.board);
      const now = performance.now();
      // UI panels refresh at ~20 Hz; the 3D scene reads `latest` every animation frame
      if (!f.running || now - this.lastUiPush > 50) {
        this.lastUiPush = now;
        useFrame.getState().set(f);
      }
    } else if (m.type === 'stopped') {
      lab.set({ stoppedLine: m.line });
    } else if (m.type === 'loaded') {
      for (const w of m.warnings) lab.pushLog([{ level: 'warn', msg: w, t: 0, wall: Date.now() }]);
    }
    for (const l of this.listeners) l(m);
  }

  init(arch: Arch, board: PicBoardConfig | Mcs51BoardConfig) {
    this.latest = null;
    useFrame.getState().set(null);
    this.send({ type: 'init', arch, board: structuredClone(board) });
  }

  input(ev: BoardInput) { this.send({ type: 'input', ev }); }
}

export const sim = new SimClient();

// ------------------------------------------------------------- workflow
export function openExperiment(id: string) {
  const exp = getExperiment(id);
  if (!exp || exp.status !== 'ready') return;
  const arch = exp.arch as Arch;
  const cfg = boardConfigFor(id);
  useLab.setState({
    route: { page: 'exp', id }, arch, boardCfg: cfg, build: null, buildStale: false, programmed: false,
    programmerLog: [], debugSession: false, simLog: [], uart: '', stoppedLine: null, bottomTab: 'build',
  });
  analyzer.clear();
  sim.init(arch, cfg);
  if (arch === 'pic18') {
    resetBench((cfg as PicBoardConfig).cables);
    sim.send({ type: 'analyzer', enabled: true }); // the bench oscilloscope needs pin transitions
  }
  sim.send({ type: 'speed', value: useLab.getState().speed });
  sim.send({ type: 'breakpoints', lines: useLab.getState().breakpoints[id] ?? [] });
}

export async function build(id: string): Promise<BuildResult | null> {
  const lab = useLab.getState();
  if (lab.building) return null;
  const exp = getExperiment(id)!;
  const source = sourceFor(id);
  lab.set({ building: true, bottomTab: 'build' });
  let result: BuildResult;
  try {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: exp.arch === 'mcs51' ? '8051' : 'pic18f4550', source, options: { optimization: lab.optimization } }),
    });
    if (!res.ok) throw new Error(`build server returned HTTP ${res.status}`);
    result = { ...(await res.json()), source, at: Date.now() };
  } catch (e) {
    result = {
      ok: false, at: Date.now(), diagnostics: [],
      log: `Cannot reach the build server (${(e as Error).message}).\nStart it with:  npm run dev   (or npm run server)`,
    };
  }
  const errs = result.diagnostics.filter((d) => d.severity === 'error').length;
  useLab.getState().set({ build: result, building: false, buildStale: false, bottomTab: result.ok ? 'build' : errs ? 'problems' : 'build' });
  return result;
}

/** Keil µVision: Start / Stop Debug Session. */
export async function toggleDebugSession(id: string) {
  const lab = useLab.getState();
  if (lab.debugSession) {
    sim.send({ type: 'pause' });
    sim.send({ type: 'unload' });
    lab.set({ debugSession: false, programmed: false, stoppedLine: null });
    return;
  }
  let b = lab.build;
  if (!b || !b.ok || lab.buildStale) {
    b = await build(id);
    if (!b?.ok) return;
  }
  sim.send({ type: 'load', hex: b.hex!, debug: b.debug });
  useLab.getState().set({ debugSession: true, programmed: true, stoppedLine: null, bottomTab: 'simlog' });
  useLab.getState().pushLog([{ level: 'info', msg: `Load "lab" — ${b.stats?.program ?? '?'} bytes of code. Simulator started (AT89C51 @ 11.0592 MHz).`, t: 0, wall: Date.now() }]);
}

export const run = () => { useLab.getState().set({ stoppedLine: null }); sim.send({ type: 'run' }); };
export const pause = () => sim.send({ type: 'pause' });
export const reset = () => { useLab.getState().set({ stoppedLine: null }); sim.send({ type: 'reset' }); };
export const step = (mode: StepMode) => sim.send({ type: 'step', mode });
