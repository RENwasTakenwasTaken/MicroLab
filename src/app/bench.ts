// Lab-bench state: cables & plugs (what is physically connected where), the
// instruments' front-panel settings, the view mode and the USB upload process.
// The electrical consequences (FRC ribbons -> port mapping, mains plug + POWER
// switch -> board power) are pushed to the simulator so that the 3D scene, the
// instruments and the MCU always agree.

import { create } from 'zustand';
import type { FrcTarget, Mcs51BoardConfig, PicBoardConfig } from '../sim/board/types.ts';
import type { DebugInfo } from '../sim/protocol.ts';
import { DESK_Y, SOCKET, boardToWorld, type V3 } from '../lab3d/world.ts';
import { sim } from './sim.ts';
import { useLab } from './store.ts';

export type PlugKind = 'frc' | 'usb' | 'probe' | 'dcm' | 'ac';

export interface Plug {
  id: string;
  kind: PlugKind;
  cable: string;
  label: string;
  attachedTo: string | null;
  /** where the plug lies when not attached */
  rest: V3;
}

export type ViewMode = 'lab' | 'computer' | 'board' | 'scope' | 'dmm' | 'pins' | 'lcd' | 'top';

/** Input coupling of a scope channel: DC, AC (series capacitor, ~10 Hz high-pass) or Ground (0 V reference). */
export type ScopeCoupling = 'DC' | 'AC' | 'GND';
export interface ScopeSettings {
  vdiv: [number, number]; sdiv: number; running: boolean; on: boolean;
  coupling: [ScopeCoupling, ScopeCoupling];
  /** side menu on the screen: 0 = AUTOSET, 1 = CH1 MENU, 2 = CH2 MENU */
  menu: 0 | 1 | 2;
}
export interface DmmSettings { on: boolean; mode: 'V' | 'OHM' | 'HZ' | 'UA' | 'MA' | 'A' | 'TEMP' }
export interface GenSettings { on: boolean; freq: number; wave: 'sine' | 'triangle' | 'square'; amp: number }

export type UploadPhase = 'idle' | 'compiling' | 'compile-error' | 'built' | 'blocked' | 'nodevice' | 'erasing' | 'programming' | 'verifying' | 'done' | 'error';
export interface UploadState { phase: UploadPhase; progress: number; log: string[]; error?: string }

/**
 * Lab computer for the 8051 kit: Keil µVision 5 (project "lab", target SST89E516RD2) builds
 * .\Objects\lab.hex, SST EasyIAP downloads it over the USB-UART (COM3, CP2102).
 */
export interface KeilState {
  /** which program is in front on the lab computer */
  app: 'keil' | 'iap';
  phase: 'idle' | 'building' | 'ok' | 'failed';
  /** Build Output window */
  log: string[];
  /** Options for Target → Output → Create HEX File (off in a new µVision project) */
  createHex: boolean;
  optionsOpen: boolean;
  /** .\Objects\lab.hex on disk: what EasyIAP can download */
  hexFile: { at: number; bytes: number; source: string; hex: string; debug?: DebugInfo } | null;
}
export interface IapState {
  /** EasyIAP has talked to the boot firmware (Detect MCU succeeded) */
  detected: boolean;
  /** Detect MCU is waiting for a RESET press: deadline (ms since epoch) */
  waitUntil: number | null;
  log: string[];
}
export const initialKeil = (): KeilState => ({ app: 'keil', phase: 'idle', log: [], createHex: false, optionsOpen: false, hexFile: null });
export const initialIap = (): IapState => ({ detected: false, waitUntil: null, log: [] });

export const DMM_MODES: DmmSettings['mode'][] = ['V', 'OHM', 'HZ', 'UA', 'MA', 'A', 'TEMP'];
export const SDIV_STEPS = [5e-6, 10e-6, 25e-6, 50e-6, 100e-6, 250e-6, 500e-6, 1e-3, 2.5e-3, 5e-3, 10e-3, 25e-3, 50e-3, 100e-3, 250e-3, 500e-3, 1];
export const VDIV_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];

const PORT_SOCKETS = ['frc:PORT-A', 'frc:PORT-B', 'frc:PORT-C', 'frc:PORT-D', 'frc:PORT-E'];
/** EXCEL-51 module: PORT-0..PORT-3 FRC headers (port index 0..3). */
const PORT_SOCKETS_51 = ['frc:P0', 'frc:P1', 'frc:P2', 'frc:P3'];
const is51 = () => useLab.getState().arch === 'mcs51';
/** Where the USB Type-B cable has to go: the PIC module's own USB port, or the base board's USB2UART port (8051 kit). */
export const usbSocketId = () => (is51() ? 'usb:uart' : 'usb:board');
const TARGETS: Record<string, keyof PicBoardConfig['cables']> = { 'frc:LBANK': 'LBANK', 'frc:KEY': 'KEY', 'frc:LCD_DATA': 'LCD_DATA', 'frc:LCD_CTRL': 'LCD_CTRL' };

interface BenchState {
  plugs: Record<string, Plug>;
  carrying: string | null;
  /** compatible connector nearest to the cursor while carrying (snap target) */
  snap: string | null;
  view: ViewMode;
  viewNonce: number;
  latched: Record<string, boolean>;
  scope: ScopeSettings;
  dmm: DmmSettings;
  gen: GenSettings;
  dmmAc: boolean;
  upload: UploadState;
  toast: { text: string; kind: 'ok' | 'err' | 'info'; at: number; ms: number } | null;
  /** the trainer's POWER slide switch (the board is powered only with the mains plug in too) */
  powerSwitch: boolean;
  /** Expt 6: the LM35 temperature was changed in the Hardware tab while the program ran */
  tempAdjusted: boolean;
  /** 8051 kit: Keil µVision and SST EasyIAP on the lab computer */
  keil: KeilState;
  iap: IapState;
  setView(v: ViewMode): void;
  setPowerSwitch(on: boolean): void;
  set(p: Partial<BenchState>): void;
  pick(plugId: string): void;
  attach(plugId: string, socketId: string): boolean;
  drop(at: V3): void;
  notify(text: string, kind?: 'ok' | 'err' | 'info', ms?: number): void;
}

/** Desk spots where loose ribbon ends rest (world mm). */
const restSpots: V3[] = [[-150, -2, 140], [-120, -2, 150], [-90, -2, 160], [-60, -2, 170], [-30, -2, 180], [0, -2, 190], [30, -2, 200], [60, -2, 205]];

/** Every cable starts loose on the desk: connecting them is part of the experiment. */
function initialPlugs(): Record<string, Plug> {
  const plugs: Record<string, Plug> = {};
  const add = (p: Plug) => { plugs[p.id] = p; };
  for (let i = 0; i < 4; i++) {
    add({ id: `rib${i}:a`, kind: 'frc', cable: `rib${i}`, label: `Ribbon ${i + 1} (end A)`, attachedTo: null, rest: restSpots[i * 2] });
    add({ id: `rib${i}:b`, kind: 'frc', cable: `rib${i}`, label: `Ribbon ${i + 1} (end B)`, attachedTo: null, rest: restSpots[i * 2 + 1] });
  }
  add({ id: 'usb:b', kind: 'usb', cable: 'usb', label: 'USB Type-B plug', attachedTo: null, rest: [-175, -1, -45] });
  // the 12 V adapter: brick on the desk, barrel plug fixed in the board's DC jack, 2-pin mains plug loose beside the brick
  add({ id: 'ac:plug', kind: 'ac', cable: 'ac', label: 'Adapter mains plug (2-pin)', attachedTo: null, rest: [165, DESK_Y + 9, -455] });
  // oscilloscope: each crocodile clip holds a male-to-female jumper whose female end goes on a header pin
  add({ id: 'ch1', kind: 'probe', cable: 'ch1', label: 'Scope CH1 probe (clip + jumper)', attachedTo: null, rest: [250, 2, -170] });
  add({ id: 'ch2', kind: 'probe', cable: 'ch2', label: 'Scope CH2 probe (clip + jumper)', attachedTo: null, rest: [300, 2, -150] });
  add({ id: 'scope:gnd', kind: 'probe', cable: 'scopeGnd', label: 'Scope probe ground (clip + jumper)', attachedTo: null, rest: [215, 2, -185] });
  // the gear motor's female jumper wires (fixed to the motor's relimate at their other end)
  add({ id: 'mot:1', kind: 'dcm', cable: 'mot1', label: 'Motor wire (red, motor pin 1)', attachedTo: null, rest: boardToWorld(62, -6, -1.5) });
  add({ id: 'mot:2', kind: 'dcm', cable: 'mot2', label: 'Motor wire (black, motor pin 2)', attachedTo: null, rest: boardToWorld(66, -6, -1.5) });
  add({ id: 'dmm:v', kind: 'probe', cable: 'dmmV', label: 'DMM red lead (VΩHz)', attachedTo: null, rest: [215, 2, 90] });
  add({ id: 'dmm:com', kind: 'probe', cable: 'dmmCom', label: 'DMM black lead (COM)', attachedTo: null, rest: [200, 2, 105] });
  return plugs;
}

/** FRC ribbons -> electrical port mapping. A ribbon only conducts with one end on a module port and the other on a peripheral. */
export function ribbonMapping(plugs: Record<string, Plug>, ports = PORT_SOCKETS): PicBoardConfig['cables'] {
  const cables: PicBoardConfig['cables'] = { LBANK: null, KEY: null, LCD_DATA: null, LCD_CTRL: null };
  for (let i = 0; i < 4; i++) {
    const a = plugs[`rib${i}:a`]?.attachedTo, b = plugs[`rib${i}:b`]?.attachedTo;
    if (!a || !b) continue;
    const port = ports.indexOf(ports.includes(a) ? a : b);
    const target = TARGETS[TARGETS[a] ? a : b];
    if (port >= 0 && target) cables[target] = port;
  }
  return cables;
}

/** Motor jumper wires -> PicBoardConfig.motorLink: ±connector number (sign = polarity), 0 = not connected. */
export function motorLink(plugs: Record<string, Plug>): number {
  const a = plugs['mot:1']?.attachedTo, b = plugs['mot:2']?.attachedTo;
  const da = a ? SOCKET[a]?.dcm : undefined, db = b ? SOCKET[b]?.dcm : undefined;
  if (!da || !db || da.conn !== db.conn || da.pin === db.pin) return 0;
  return da.conn * (da.pin === 1 ? 1 : -1);
}

/** Adapter's mains plug in the wall socket. */
export const mainsConnected = (plugs = useBench.getState().plugs) => plugs['ac:plug']?.attachedTo === 'ac:wall';
/** The trainer has power: mains plug in and the POWER switch ON. */
export const boardPowered = () => mainsConnected() && useBench.getState().powerSwitch;

let sentPower: boolean | null = null;
/** Push the board's power state to the simulator when it changes (force: always send). */
export function syncPower(force = false) {
  const on = boardPowered();
  if (!force && on === sentPower) return;
  sentPower = on;
  sim.input({ kind: 'power', on });
}

function syncElectrical(plugs: Record<string, Plug>) {
  const lab = useLab.getState();
  if (lab.arch === 'mcs51') {
    // EXCEL-51: ribbons from PORT-0..3 (the 8051 model drives the base board's LED bank only)
    const old = lab.boardCfg as Mcs51BoardConfig;
    const cables = ribbonMapping(plugs, PORT_SOCKETS_51);
    if (JSON.stringify(cables) === JSON.stringify(old.cables)) return;
    lab.set({ boardCfg: { ...old, cables } });
    for (const t of Object.keys(cables) as FrcTarget[]) sim.input({ kind: 'cable', target: t, port: cables[t] });
    return;
  }
  if (lab.arch !== 'pic18') return;
  const old = lab.boardCfg as PicBoardConfig;
  const cfg = structuredClone(old);
  cfg.cables = ribbonMapping(plugs);
  cfg.motorLink = motorLink(plugs);
  if (JSON.stringify(cfg.cables) === JSON.stringify(old.cables) && cfg.motorLink === (old.motorLink ?? 1)) return;
  lab.set({ boardCfg: cfg });
  sim.input({ kind: 'config', cfg: structuredClone(cfg) });
}

export const useBench = create<BenchState>((set, get) => ({
  plugs: initialPlugs(),
  carrying: null,
  snap: null,
  view: 'lab',
  viewNonce: 0,
  latched: {},
  scope: { vdiv: [2, 2], sdiv: 1e-3, running: true, on: true, coupling: ['DC', 'DC'], menu: 0 },
  dmm: { on: true, mode: 'V' },
  gen: { on: true, freq: 504.3, wave: 'sine', amp: 4 },
  dmmAc: false,
  upload: { phase: 'idle', progress: 0, log: [] },
  toast: null,
  powerSwitch: false,
  tempAdjusted: false,
  keil: initialKeil(),
  iap: initialIap(),

  setView: (view) => set({ view, viewNonce: get().viewNonce + 1 }),
  setPowerSwitch(on) {
    set({ powerSwitch: on });
    syncPower();
    if (on && !mainsConnected()) get().notify('POWER is ON, but the adapter is not plugged into the wall socket', 'info', 4000);
    else get().notify(on ? 'Board power ON' : 'Board power OFF', on ? 'ok' : 'info');
  },
  set: (p) => set(p),
  notify: (text, kind = 'info', ms = 2500) => set({ toast: { text, kind, at: Date.now(), ms } }),

  pick(plugId) {
    const plugs = { ...get().plugs };
    const p = plugs[plugId];
    if (!p) return;
    plugs[plugId] = { ...p, attachedTo: null };
    set({ plugs, carrying: plugId });
    syncElectrical(plugs);
    syncPower();
    if (p.kind === 'usb' && p.attachedTo) get().notify(is51() ? 'USB cable unplugged: the COM port is gone from the lab computer' : 'USB cable unplugged from the board', 'info');
    if (p.kind === 'ac' && p.attachedTo) get().notify('Adapter unplugged from the mains: the board has no power', 'info');
  },

  attach(plugId, socketId) {
    const plugs = { ...get().plugs };
    const p = plugs[plugId];
    const s = SOCKET[socketId];
    if (!p || !s) return false;
    if (s.variant && s.variant !== useLab.getState().arch) return false; // that connector is on the other module
    if (s.kind !== p.kind) { get().notify(`${p.label} does not fit ${s.label}`, 'err'); return false; }
    const occupant = Object.values(plugs).find((q) => q.attachedTo === socketId && q.id !== plugId);
    if (occupant && p.kind !== 'probe') { get().notify(`${s.label} is already in use`, 'err'); return false; }
    if (p.kind === 'frc') {
      const otherEnd = plugs[`${p.cable}:${p.id.endsWith(':a') ? 'b' : 'a'}`];
      const otherSock = otherEnd?.attachedTo ? SOCKET[otherEnd.attachedTo] : null;
      if (otherSock && otherSock.frcRole === s.frcRole) {
        const mcu = is51() ? '8051' : 'PIC';
        get().notify(s.frcRole === 'port' ? `Both ends on ${mcu} port headers: connect the other end to a peripheral connector` : `Both ends on peripheral connectors: one end must go to a ${mcu} port header`, 'err');
        return false;
      }
    }
    plugs[plugId] = { ...p, attachedTo: socketId };
    set({ plugs, carrying: null, snap: null });
    syncElectrical(plugs);
    syncPower();
    if (p.kind === 'usb') {
      if (!is51()) get().notify('USB cable connected successfully', 'ok', 4000);
      else if (socketId === 'usb:uart') get().notify('USB cable connected: the lab computer finds COM3 (Silicon Labs CP210x USB to UART Bridge)', 'ok', 5000);
      else get().notify('USB cable connected, but the 8051 kit is programmed through the USB2UART port (top-left of the base board)', 'info', 6000);
    }
    else if (p.kind === 'ac') get().notify(get().powerSwitch ? 'Adapter plugged in: board power ON' : 'Adapter plugged into the wall socket: now switch the board\'s POWER switch ON', 'ok', 4000);
    else get().notify(`${p.label} → ${s.label}`, 'ok');
    return true;
  },

  drop(at) {
    const id = get().carrying;
    if (!id) return;
    const plugs = { ...get().plugs };
    plugs[id] = { ...plugs[id], attachedTo: null, rest: at };
    set({ plugs, carrying: null, snap: null });
  },
}));

/** Put every cable back on the desk for a fresh experiment: unplugged and switched OFF. */
export function resetBench() {
  useBench.setState({
    plugs: initialPlugs(), carrying: null, view: 'lab', viewNonce: useBench.getState().viewNonce + 1, latched: {},
    upload: { phase: 'idle', progress: 0, log: [] }, powerSwitch: false, tempAdjusted: false,
    keil: initialKeil(), iap: initialIap(),
  });
  syncPower(true);
}

export const usbConnected = () => useBench.getState().plugs['usb:b']?.attachedTo === usbSocketId();
