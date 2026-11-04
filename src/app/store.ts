// Application state (zustand). High-frequency simulation frames live in a
// separate store so that only the panels that need them re-render.

import { create } from 'zustand';
import type { Arch, LogLevel } from '../sim/core/types.ts';
import type { DebugInfo, FrameData } from '../sim/protocol.ts';
import type { Mcs51BoardConfig, PicBoardConfig } from '../sim/board/types.ts';
import { defaultPicBoardConfig } from '../sim/board/picboard.ts';
import { defaultMcs51Config } from '../sim/board/mcs51board.ts';
import { getExperiment } from '../experiments/experiments.ts';

export interface Diagnostic { line: number; col: number; severity: 'error' | 'warning' | 'info'; message: string }

export interface BuildResult {
  ok: boolean;
  log: string;
  diagnostics: Diagnostic[];
  hex?: string;
  debug?: DebugInfo;
  stats?: { program: number | null; data: number | null; time: number };
  source?: string;
  at: number;
}

export type BottomTab = 'build' | 'programmer' | 'simlog' | 'uart' | 'analyzer' | 'problems';
export type RightTab = 'registers' | 'watch' | 'memory' | 'pins' | 'periph' | 'disasm';
export type LeftTab = 'experiment' | 'hardware';

export interface SimLogEntry { level: LogLevel; msg: string; t: number; wall: number }

const LS_KEY = 'vlab.sources.v1';
const LS_BP = 'vlab.breakpoints.v1';
const LS_FONT = 'vlab.editorFont.v1';
export const EDITOR_FONT = { min: 9, max: 28, default: 13 };
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export function boardConfigFor(expId: string): PicBoardConfig | Mcs51BoardConfig {
  const exp = getExperiment(expId);
  if (exp?.arch === 'mcs51') return defaultMcs51Config();
  const cfg = defaultPicBoardConfig();
  if (exp?.board?.cables) Object.assign(cfg.cables, exp.board.cables);
  if (exp?.board?.dips) for (const [k, v] of Object.entries(exp.board.dips)) (cfg.dips as Record<string, boolean[]>)[k] = [...v!];
  return cfg;
}

interface LabState {
  route: { page: 'home' } | { page: 'exp'; id: string };
  arch: Arch;
  sources: Record<string, string>;
  breakpoints: Record<string, number[]>;
  build: BuildResult | null;
  building: boolean;
  buildStale: boolean;
  programmed: boolean;
  programming: boolean;
  programmerLog: string[];
  debugSession: boolean; // 8051: Keil debug session active
  simLog: SimLogEntry[];
  uart: string;
  stoppedLine: number | null;
  boardCfg: PicBoardConfig | Mcs51BoardConfig;
  optimization: string;
  autoRun: boolean;
  bottomTab: BottomTab;
  rightTab: RightTab;
  leftTab: LeftTab;
  /** floating side panes over the workspace (Experiment on the left, Debug on the right) */
  leftOpen: boolean;
  rightOpen: boolean;
  /** floating output pane along the bottom */
  bottomOpen: boolean;
  showLabels: boolean;
  showCables: boolean;
  speed: number;
  /** code editor font size (px), A+/A- on the lab computer */
  editorFont: number;
  toolchains: { xc8: { version: string } | null; sdcc: { version: string } | null } | null;

  setRoute(r: LabState['route']): void;
  setSource(id: string, src: string): void;
  resetSource(id: string): void;
  toggleBreakpoint(id: string, line: number): void;
  set(p: Partial<LabState>): void;
  pushLog(entries: SimLogEntry[]): void;
  appendUart(text: string): void;
  setEditorFont(px: number): void;
}

export const useLab = create<LabState>((set, get) => ({
  route: { page: 'home' },
  arch: 'pic18',
  sources: load<Record<string, string>>(LS_KEY, {}),
  breakpoints: load<Record<string, number[]>>(LS_BP, {}),
  build: null,
  building: false,
  buildStale: false,
  programmed: false,
  programming: false,
  programmerLog: [],
  debugSession: false,
  simLog: [],
  uart: '',
  stoppedLine: null,
  boardCfg: defaultPicBoardConfig(),
  optimization: '-O1',
  autoRun: true,
  bottomTab: 'build',
  rightTab: 'registers',
  leftTab: 'experiment',
  leftOpen: false,
  rightOpen: false,
  bottomOpen: false,
  showLabels: false,
  showCables: true,
  speed: 1,
  editorFont: load<number>(LS_FONT, EDITOR_FONT.default),
  toolchains: null,

  setRoute: (route) => set({ route }),
  setSource: (id, src) => {
    const sources = { ...get().sources, [id]: src };
    save(LS_KEY, sources);
    set({ sources, buildStale: get().build !== null });
  },
  resetSource: (id) => {
    const sources = { ...get().sources };
    delete sources[id];
    save(LS_KEY, sources);
    set({ sources, buildStale: get().build !== null });
  },
  toggleBreakpoint: (id, line) => {
    const cur = get().breakpoints[id] ?? [];
    const next = cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line].sort((a, b) => a - b);
    const breakpoints = { ...get().breakpoints, [id]: next };
    save(LS_BP, breakpoints);
    set({ breakpoints });
  },
  set: (p) => set(p),
  pushLog: (entries) => {
    if (!entries.length) return;
    const simLog = [...get().simLog, ...entries];
    set({ simLog: simLog.length > 800 ? simLog.slice(-600) : simLog });
  },
  appendUart: (text) => {
    const u = get().uart + text;
    set({ uart: u.length > 20000 ? u.slice(-16000) : u });
  },
  setEditorFont: (px) => {
    const editorFont = Math.max(EDITOR_FONT.min, Math.min(EDITOR_FONT.max, Math.round(px)));
    save(LS_FONT, editorFont);
    set({ editorFont });
  },
}));

export const sourceFor = (id: string) => useLab.getState().sources[id] ?? getExperiment(id)?.starter ?? '';

// ---------------------------------------------------------------- frames
interface FrameState {
  frame: FrameData | null;
  set(f: FrameData | null): void;
}
export const useFrame = create<FrameState>((set) => ({ frame: null, set: (frame) => set({ frame }) }));
