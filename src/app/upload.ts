// UPLOAD: check the board is in USB bootloader mode -> compile -> erase ->
// program -> verify (a missing device fails at once: the student retries UPLOAD). Modelled on Microchip's USB HID Bootloader tool. Each step
// checks the real simulator state; nothing is reported as done unless it is.

import { build, sim } from './sim.ts';
import { boardPowered, useBench, usbConnected, type UploadPhase } from './bench.ts';
import { sourceFor, useFrame, useLab } from './store.ts';
import type { FromWorker } from '../sim/protocol.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

function setUpload(phase: UploadPhase, extra: Partial<{ progress: number; error: string }> = {}) {
  const u = useBench.getState().upload;
  useBench.setState({ upload: { ...u, phase, progress: extra.progress ?? u.progress, error: extra.error } });
}
function log(line: string) {
  const u = useBench.getState().upload;
  useBench.setState({ upload: { ...u, log: [...u.log, line] } });
}

export const deviceReady = () => {
  const f = useFrame.getState().frame;
  return usbConnected() && !!f && f.board.power && f.device.mode === 'bootloader';
};

export function bootloaderCommand(msg: { type: 'erase' } | { type: 'flash'; hex: string; debug?: unknown }): Promise<Extract<FromWorker, { type: 'bootloader' }>> {
  return new Promise((resolve) => {
    const op = msg.type;
    const off = sim.on((m) => {
      if (m.type === 'bootloader' && m.op === op) { off(); clearTimeout(t); resolve(m); }
    });
    const t = setTimeout(() => { off(); resolve({ type: 'bootloader', op, ok: false, error: 'No response from device (USB timeout)' }); }, 3000);
    sim.send(msg as never);
  });
}

class LinkLost extends Error {}

/**
 * The application must relocate its vectors above the bootloader: vector_relocate.h in
 * the project (the PICT lab way), or C18 "#pragma code <name> = 0x1000" written out.
 */
export function hasVectorRelocation(source: string) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return /#\s*include\s*[<"]\s*vector_relocate\.h\s*[>"]/i.test(code) || /#\s*pragma\s+code\s+\w+\s*=\s*0x0*1000\b/i.test(code);
}

const BOOT_TIP = "Tip: Enter PIC's bootloader mode to allow computer to upload program to PIC";

/** The HID bootloader tool finds no device: say so in the log (red) and give the tip once. */
function noDevice() {
  setUpload('nodevice');
  log('Device not detected (USB HID Bootloader, VID 0x04D8 / PID 0x003C).');
  const hint = !boardPowered() ? ' (the board has no power: plug the adapter into the wall socket and switch POWER ON)'
    : !usbConnected() ? ' (connect the USB cable first)' : '';
  useBench.getState().notify(BOOT_TIP + hint, 'info', 6000);
}

/** Compiles into the lab computer's log; null when the build failed or was superseded. */
async function compile(expId: string, my: number, then: string) {
  useBench.setState({ upload: { phase: 'compiling', progress: 0, log: [] } });
  log('Compiling main.c (MPLAB C18 conventions, XC8 toolchain)…');
  const b = await build(expId);
  if (my !== token) return null;
  if (!b || !b.ok) {
    const errs = b?.diagnostics.filter((d) => d.severity === 'error') ?? [];
    for (const e of errs.slice(0, 8)) log(`main.c:${e.line}: error: ${e.message}`);
    if (!b) log('A build is already running.');
    else if (!errs.length) for (const l of b.log.trim().split('\n').slice(-3)) log(l);
    log(errs.length ? `Build failed with ${errs.length} error(s).${then}` : `Build failed.${then}`);
    setUpload('compile-error');
    return null;
  }
  const warns = b.diagnostics.filter((d) => d.severity === 'warning');
  for (const w of warns.slice(0, 8)) log(`main.c:${w.line}: warning: ${w.message}`);
  log(`Build successful${warns.length ? ` (${warns.length} warning${warns.length > 1 ? 's' : ''})` : ''}: ${b.stats?.program ?? '?'} bytes of program memory.`);
  return b;
}

/** BUILD on the lab computer: compile only, nothing is sent to the board. */
export async function buildOnly(expId: string) {
  const my = ++token;
  if (!(await compile(expId, my, ''))) return;
  if (!hasVectorRelocation(sourceFor(expId))) log('warning: vector_relocate.h is not included - UPLOAD will refuse this program (it would erase the USB bootloader).');
  setUpload('built');
}

export async function upload(expId: string) {
  const my = ++token;
  // checked before anything else: programming vectors at 0x0000 would wipe the USB bootloader
  if (!hasVectorRelocation(sourceFor(expId))) {
    useBench.setState({ upload: { phase: 'blocked', progress: 0, log: [] } });
    log('WARNING: vector_relocate.h is not part of this program.');
    log('Without it the reset and interrupt vectors stay at 0x0000-0x0018, inside the USB HID bootloader (0x0000-0x0FFF).');
    log('Uploading would ERASE the bootloader, and the computer would no longer detect the PIC over USB.');
    log('→ Add vector_relocate.h to the project and put  #include "vector_relocate.h"  at the top of main.c, then UPLOAD again.');
    log('Upload aborted: nothing was written to the board.');
    return;
  }
  // like the HID bootloader tool: no device in bootloader mode -> nothing to program; retry UPLOAD
  if (!deviceReady()) {
    useBench.setState({ upload: { phase: 'nodevice', progress: 0, log: [] } });
    noDevice();
    return;
  }
  const b = await compile(expId, my, ' Upload aborted.');
  if (!b) return;
  if (!deviceReady()) { noDevice(); return; }
  log('Device attached. Bootloader firmware v2.9 · PIC18F4550');
  try {
    const guard = () => {
      if (my !== token) throw new LinkLost('cancelled');
      if (!deviceReady()) throw new LinkLost(usbConnected() ? 'Device left bootloader mode' : 'USB cable disconnected');
    };
    setUpload('erasing', { progress: 0 });
    log('Erasing application flash (0x1000 – 0x7FFF)…');
    await sleep(500);
    guard();
    const er = await bootloaderCommand({ type: 'erase' });
    if (!er.ok) throw new LinkLost(er.error ?? 'erase failed');
    guard();

    setUpload('programming', { progress: 0 });
    const bytes = Math.max(64, b.stats?.program ?? 512);
    const packets = Math.ceil(bytes / 56);
    log(`Programming ${bytes} bytes in ${packets} USB packets…`);
    const t0 = performance.now();
    const duration = Math.min(4000, 700 + packets * 18);
    while (performance.now() - t0 < duration) {
      await sleep(40);
      guard();
      setUpload('programming', { progress: Math.min(0.99, (performance.now() - t0) / duration) });
    }
    const fl = await bootloaderCommand({ type: 'flash', hex: b.hex!, debug: b.debug });
    if (!fl.ok) throw new LinkLost(fl.error ?? 'write failed');
    for (const w of fl.warnings ?? []) log(`warning: ${w}`);
    setUpload('verifying', { progress: 1 });
    log('Verifying…');
    await sleep(400);
    guard();
    setUpload('done', { progress: 1 });
    log(`Erase/Program/Verify complete (${fl.bytes} bytes written).`);
    log('Press RESET on the board (without BOOT) or click "Reset Device" to run the program.');
    useLab.getState().set({ programmed: true, buildStale: false });
  } catch (e) {
    if (my !== token) return;
    const msg = (e as Error).message;
    log(`Communication error: ${msg}. Programming incomplete — the application area may be erased.`);
    setUpload('error', { error: msg });
  }
}

export function cancelUpload() {
  token++;
  const u = useBench.getState().upload;
  if (u.phase === 'compiling') {
    useBench.setState({ upload: { ...u, phase: 'idle', log: [...u.log, 'Upload cancelled.'] } });
  }
}

/** Bootloader tool "Reset Device": leave the bootloader and start the application. */
export function resetDevice() {
  if (!deviceReady()) return;
  sim.send({ type: 'leaveBootloader' });
  const u = useBench.getState().upload;
  useBench.setState({ upload: { ...u, log: [...u.log, 'Reset Device: application started.'] } });
}

export type CableState = 'disconnected' | 'connected' | 'uploading' | 'completed' | 'error';
export function usbCableState(phase: UploadPhase, connected: boolean): CableState {
  if (!connected) return 'disconnected';
  if (phase === 'erasing' || phase === 'programming' || phase === 'verifying') return 'uploading';
  if (phase === 'done') return 'completed';
  if (phase === 'error') return 'error';
  return 'connected';
}
