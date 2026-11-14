// The 8051 kit's lab-computer workflow, as practised in the PICT lab:
//   Keil µVision 5: write main.c in project "lab" (device SST89E516RD2), tick
//   Options for Target -> Output -> Create HEX File, Build (F7) -> .\Objects\lab.hex
//   SST EasyIAP: with the Type-B cable in the base board's USB2UART port (CP2102 -> COM3),
//   Detect MCU and press RESET on the board when asked (the chip's IAP boot firmware answers
//   the PC's handshake right after reset), then Download the HEX file, then press RESET to run.
// A simplified practice mock-up: every step checks the real simulator and bench state.

import { build, sim } from './sim.ts';
import { boardPowered, useBench, usbConnected, type IapState, type KeilState } from './bench.ts';
import { bootloaderCommand } from './upload.ts';
import { sourceFor, useFrame, useLab } from './store.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const HEX_PATH = '.\\Objects\\lab.hex';
export const COM_PORT = 'COM3';
export const COM_NAME = 'Silicon Labs CP210x USB to UART Bridge (COM3)';
/** Detect MCU waits this long for the RESET press. */
export const DETECT_WINDOW_MS = 10_000;

const keil = () => useBench.getState().keil;
const iap = () => useBench.getState().iap;
const setKeil = (p: Partial<KeilState>) => useBench.setState({ keil: { ...keil(), ...p } });
const setIap = (p: Partial<IapState>) => useBench.setState({ iap: { ...iap(), ...p } });
const keilLog = (...lines: string[]) => setKeil({ log: [...keil().log, ...lines] });
const iapLog = (...lines: string[]) => setIap({ log: [...iap().log, ...lines].slice(-200) });

const time = () => new Date().toLocaleTimeString('en-GB');

/** Data bytes in an Intel HEX file (what the download programs). */
function hexBytes(hex: string) {
  let n = 0;
  for (const line of hex.split(/\r?\n/)) if (line.startsWith(':') && line.slice(7, 9) === '00') n += parseInt(line.slice(1, 3), 16);
  return n;
}

/** The target is in its IAP boot firmware and reachable over COM3. */
export const iapReady = () => {
  const f = useFrame.getState().frame;
  return usbConnected() && !!f && f.board.power && f.device.mode === 'bootloader';
};

// ------------------------------------------------------------------ Keil
let buildToken = 0;

/** µVision Build (F7): compile + link; writes .\Objects\lab.hex only with Create HEX File ticked. */
export async function keilBuild(expId: string) {
  if (keil().phase === 'building') return;
  const my = ++buildToken;
  const t0 = performance.now();
  setKeil({ phase: 'building', log: ['Build started: Project: lab', "Build target 'Target 1'", 'compiling main.c...'] });
  const b = await build(expId);
  if (my !== buildToken) return;
  if (!b) { keilLog('*** Build already in progress.'); setKeil({ phase: 'failed' }); return; }
  const errs = b.diagnostics.filter((d) => d.severity === 'error');
  const warns = b.diagnostics.filter((d) => d.severity === 'warning');
  for (const d of [...errs, ...warns].slice(0, 12)) keilLog(`main.c(${d.line}): ${d.severity}: ${d.message}`);
  const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
  const elapsed = `Build Time Elapsed:  00:00:${String(secs).padStart(2, '0')}`;
  if (!b.ok) {
    if (!errs.length) for (const l of b.log.trim().split('\n').slice(-3)) keilLog(l);
    keilLog('Target not created.', `".\\Objects\\lab" - ${errs.length || 1} Error(s), ${warns.length} Warning(s).`, elapsed);
    setKeil({ phase: 'failed' });
    return;
  }
  keilLog('linking...');
  const size = /Program Size:.*$/m.exec(b.log)?.[0] ?? `Program Size: data=${b.stats?.data ?? '?'}.0 xdata=0 code=${b.stats?.program ?? '?'}`;
  keilLog(size);
  if (keil().createHex) {
    keilLog('creating hex file from ".\\Objects\\lab"...');
    setKeil({ hexFile: { at: Date.now(), bytes: hexBytes(b.hex!), source: sourceFor(expId), hex: b.hex!, debug: b.debug } });
  }
  keilLog(`".\\Objects\\lab" - 0 Error(s), ${warns.length} Warning(s).`, elapsed);
  if (!keil().createHex) keilLog('Note: no HEX file was created. Options for Target → Output → tick "Create HEX File", then build again: SST EasyIAP downloads .\\Objects\\lab.hex.');
  setKeil({ phase: 'ok' });
}

/** The HEX file on disk matches the program in the editor. */
export const hexUpToDate = (expId: string) => {
  const h = keil().hexFile;
  return !!h && h.source === sourceFor(expId);
};

// ------------------------------------------------------------- EasyIAP
let detectToken = 0;

/** "Detect MCU": open COM3, call the boot firmware and wait for the student to press RESET. */
export async function detectMcu() {
  if (iap().waitUntil) return;
  if (busy()) return;
  const my = ++detectToken;
  if (!usbConnected()) {
    iapLog(`[${time()}] Detect MCU: no COM port found.`, '→ Plug the Type-B USB cable into the USB2UART port (top-left of the base board): Windows then shows ' + COM_NAME + '.');
    useBench.getState().notify('SST EasyIAP: no COM port. Connect the USB cable to the USB2UART port of the board.', 'err', 5000);
    return;
  }
  setIap({ detected: false });
  iapLog(`[${time()}] Detect MCU: SST89E516RD2 on ${COM_PORT}, 9600 baud.`, 'Please press RESET on the target board now…');
  if (useFrame.getState().frame?.device.mode === 'bootloader') {
    // already in its boot firmware (detected before, no RESET since): it answers at once
    detected();
    return;
  }
  setIap({ waitUntil: Date.now() + DETECT_WINDOW_MS });
  sim.send({ type: 'iapSync', on: true });
  useBench.getState().notify('SST EasyIAP is waiting: press RESET on the board now', 'info', 5000);
  let ok = false;
  while (Date.now() < (iap().waitUntil ?? 0)) {
    await sleep(100);
    if (my !== detectToken) return;
    if (!usbConnected()) break;
    if (useFrame.getState().frame?.device.mode === 'bootloader') { ok = true; break; }
  }
  sim.send({ type: 'iapSync', on: false });
  setIap({ waitUntil: null });
  if (ok) { detected(); return; }
  if (!usbConnected()) iapLog('Detect MCU failed: the USB cable was unplugged.');
  else if (!boardPowered()) iapLog('Detect MCU failed: no response from the target. The board has no power: plug the adapter into the wall socket and switch POWER ON.');
  else iapLog('Detect MCU failed: no response from the target.', '→ Click Detect MCU again and press RESET on the board while EasyIAP is waiting.');
  useBench.getState().notify('SST EasyIAP: target not detected', 'err', 4000);
}

function detected() {
  setIap({ detected: true, waitUntil: null });
  iapLog('Target detected: SST89E516RD2 (IAP boot firmware). Ready to download.');
  useBench.getState().notify('SST EasyIAP: SST89E516RD2 detected', 'ok', 4000);
}

export function cancelDetect() {
  if (!iap().waitUntil) return;
  detectToken++;
  sim.send({ type: 'iapSync', on: false });
  setIap({ waitUntil: null });
  iapLog('Detect MCU cancelled.');
}

const busy = () => ['erasing', 'programming', 'verifying'].includes(useBench.getState().upload.phase);
const setUpload = (phase: 'idle' | 'erasing' | 'programming' | 'verifying' | 'done' | 'error', progress: number, error?: string) =>
  useBench.setState({ upload: { ...useBench.getState().upload, phase, progress, error } });

/** "Download": erase, program and verify .\Objects\lab.hex through the boot firmware. */
export async function downloadHex(expId: string) {
  if (busy() || iap().waitUntil) return;
  const h = keil().hexFile;
  if (!h) {
    iapLog(`[${time()}] Download: cannot open ${HEX_PATH}: file not found.`, '→ In µVision: Options for Target → Output → tick "Create HEX File", then Build (F7).');
    return;
  }
  if (!iap().detected || !iapReady()) {
    setIap({ detected: false });
    iapLog(`[${time()}] Download: the target is not detected.`, '→ Click Detect MCU first and press RESET on the board when asked.');
    return;
  }
  iapLog(`[${time()}] Download ${HEX_PATH} (built ${new Date(h.at).toLocaleTimeString('en-GB')}, ${h.bytes} bytes)…`);
  if (h.source !== sourceFor(expId)) iapLog('warning: main.c has changed since this HEX file was built: the old program is being downloaded. Build (F7) again to include your changes.');
  const guard = () => { if (!iapReady()) throw new Error(usbConnected() ? 'the target left IAP mode' : 'the USB cable was unplugged'); };
  try {
    setUpload('erasing', 0);
    iapLog('Erasing flash Block 0…');
    await sleep(500);
    guard();
    const er = await bootloaderCommand({ type: 'erase' });
    if (!er.ok) throw new Error(er.error ?? 'erase failed');
    const t0 = performance.now();
    const duration = Math.min(3500, 800 + h.bytes * 2);
    iapLog('Programming…');
    while (performance.now() - t0 < duration) {
      await sleep(50);
      guard();
      setUpload('programming', Math.min(0.99, (performance.now() - t0) / duration));
    }
    const fl = await bootloaderCommand({ type: 'flash', hex: h.hex, debug: h.debug });
    if (!fl.ok) throw new Error(fl.error ?? 'write failed');
    for (const w of fl.warnings ?? []) iapLog(`warning: ${w}`);
    setUpload('verifying', 1);
    iapLog('Verifying…');
    await sleep(400);
    guard();
    setUpload('done', 1);
    iapLog(`Download complete: ${fl.bytes} bytes programmed and verified.`, '→ Press RESET on the board to run your program.');
    useLab.getState().set({ programmed: true });
  } catch (e) {
    const msg = (e as Error).message;
    iapLog(`Download failed: ${msg}. The flash may be partly erased: detect the MCU and download again.`);
    setUpload('error', useBench.getState().upload.progress, msg);
  }
}

/** After a RESET (or power / cable loss) the chip runs the application: EasyIAP must detect it again. */
sim.on((m) => {
  if (m.type !== 'frame') return;
  const mode = m.data.device.mode;
  if (!iap().detected || busy() || mode === 'reset' || (mode === 'bootloader' && usbConnected())) return;
  setIap({ detected: false });
  iapLog(!usbConnected() ? 'USB cable unplugged: COM3 closed.'
    : mode === 'off' ? 'The board was switched off.'
    : mode === 'running' ? 'Target reset: your program is running.'
    : 'Target reset: the chip left its IAP boot firmware.', '(Detect the MCU again before the next download.)');
});
