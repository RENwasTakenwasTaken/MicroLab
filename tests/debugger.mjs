// Engine-level checks (as used by the worker): USB bootloader workflow for the PIC,
// breakpoints and source stepping for both cores.
import { readFileSync } from 'node:fs';
import { compilePic18, compile8051 } from '../server/compilers/toolchains.mjs';
import { Engine } from '../src/sim/engine.ts';
import { defaultPicBoardConfig } from '../src/sim/board/picboard.ts';
import { defaultMcs51Config } from '../src/sim/board/mcs51board.ts';

let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const src = (f) => readFileSync(new URL(`../src/experiments/code/${f}`, import.meta.url), 'utf8');
const btn = (e, id, pressed) => e.input({ kind: 'button', id, pressed });
const ticks = (e, n = 30) => { for (let i = 0; i < n; i++) e.tick(); };

// ------------------------------------------------------- bootloader flow
{
  console.log('USB HID bootloader workflow (PIC18F4550)');
  const r = await compilePic18(src('exp3_pic_timer0.c'));
  ok('C18 program builds with code at 0x1000', r.ok && r.codeOffset === 0x1000 && /reset vector remapped to 0x1000/.test(r.log));
  const msgs = [];
  const e = new Engine((m) => msgs.push(m));
  e.init('pic18', defaultPicBoardConfig());
  const last = (t) => msgs.filter((m) => m.type === t).at(-1);

  e.flash(r.hex, r.debug);
  ok('flash refused while the application runs', last('bootloader')?.ok === false);

  // wrong order: BOOT first, then RESET -> still enters bootloader on real silicon (BOOT held at MCLR release)
  btn(e, 'reset', true); btn(e, 'reset', false);
  ok('RESET alone restarts the (blank) application', e.deviceState().mode === 'blank');

  btn(e, 'reset', true);
  ok('step 1: RESET held', e.deviceState().bootSeq === 'reset' && e.deviceState().mode === 'reset');
  btn(e, 'boot', true);
  ok('step 2: BOOT held with RESET', e.deviceState().bootSeq === 'reset+boot');
  btn(e, 'reset', false);
  ok('step 3: RESET released with BOOT held -> bootloader', e.deviceState().mode === 'bootloader' && e.deviceState().bootSeq === 'boot');
  btn(e, 'boot', false);
  ok('step 4: BOOT released -> bootloader ready', e.deviceState().bootSeq === 'ready');

  e.erase(); e.flash(r.hex, r.debug);
  const fl = last('bootloader');
  ok('flash accepted in bootloader mode', fl?.ok === true && fl.bytes > 0, `${fl?.bytes} bytes, warnings: ${fl?.warnings?.length ?? 0}`);
  ok('device stays in bootloader after programming', e.deviceState().mode === 'bootloader' && e.deviceState().flashed);
  ok('clock owned by the bootloader: 48 MHz', e.clock().fosc === 48e6, `${e.clock().fosc / 1e6} MHz ${e.clock().mode}`);

  btn(e, 'reset', true); btn(e, 'reset', false);
  ok('RESET (no BOOT) runs the uploaded program', e.deviceState().mode === 'running');
  e.speed = 0; ticks(e, 40);
  const f = msgs.filter((m) => m.type === 'frame').at(-1).data;
  ok('square wave present on RD0 after running', f.ports[3].freq[0] > 990 && f.ports[3].freq[0] < 1010, `${f.ports[3].freq[0].toFixed(1)} Hz`);

  // power cycle keeps flash
  e.input({ kind: 'power', on: false }); e.input({ kind: 'power', on: true });
  ok('program survives a power cycle', e.deviceState().mode === 'running' && e.deviceState().flashed);

  // program linked at 0x0000 (no remap, wrong offset) cannot start
  const bad = await compilePic18(src('exp3_pic_timer0.c').replace(/0x1000/g, '0x0800').replace(/0x1008/g, '0x0808'));
  btn(e, 'reset', true); btn(e, 'boot', true); btn(e, 'reset', false); btn(e, 'boot', false);
  e.erase(); e.flash(bad.hex, bad.debug);
  const w = last('bootloader');
  ok('vectors at 0x0800 rejected/warned like the real bootloader', /warning/.test(bad.log) && w.warnings.some((x) => /below 0x1000/.test(x)), w.warnings[0]);
}

// ------------------------------------------- SST EasyIAP flow (8051 kit)
{
  console.log('SST89E516RD2 IAP workflow (EXCEL-51 kit)');
  const r = await compile8051(src('exp1_8051_led.c'));
  ok('Expt 1 program builds for the 8051', r.ok && !!r.hex);
  const msgs = [];
  const e = new Engine((m) => msgs.push(m));
  e.init('mcs51', defaultMcs51Config());
  const last = (t) => msgs.filter((m) => m.type === t).at(-1);
  const frame = () => { e.sendFrame(); return last('frame').data; };
  e.input({ kind: 'power', on: false }); e.input({ kind: 'power', on: true });
  ok('power on with an empty flash: nothing runs', e.deviceState().mode === 'idle' && !e.deviceState().flashed);

  e.flash(r.hex, r.debug);
  ok('download refused outside IAP mode', last('bootloader')?.ok === false);
  btn(e, 'reset', true); btn(e, 'reset', false);
  ok('RESET without EasyIAP calling: no IAP mode', e.deviceState().mode === 'idle');

  // Detect MCU: the PC sends its handshake, the student presses RESET
  e.setIapSync(true);
  btn(e, 'reset', true);
  ok('RESET held: chip in reset', e.deviceState().mode === 'reset');
  btn(e, 'reset', false);
  e.setIapSync(false);
  ok('RESET released while EasyIAP calls: IAP boot firmware', e.deviceState().mode === 'bootloader');

  e.erase(); e.flash(r.hex, r.debug);
  const fl = last('bootloader');
  ok('download accepted in IAP mode', fl?.ok === true && fl.bytes > 0, `${fl?.bytes} bytes`);
  ok('chip stays in IAP mode after the download', e.deviceState().mode === 'bootloader' && e.deviceState().flashed);

  btn(e, 'reset', true); btn(e, 'reset', false);
  ok('RESET runs the downloaded program', e.deviceState().mode === 'running');
  // step ~2.6 s of simulated time and time the P1.0 edges exactly (machine cycles)
  const hz = e.mcu.cycleHz(), end = e.mcu.cycles + 2.6 * hz;
  const edges = [];
  let prev = e.mcu.portState(1).level & 1;
  while (e.mcu.cycles < end) { e.mcu.step(); const l = e.mcu.portState(1).level & 1; if (l !== prev) { edges.push(e.mcu.cycles / hz); prev = l; } }
  // (the first two edges are main()'s LED = 0 followed at once by LED = 1)
  const halves = edges.slice(2).map((t, i) => t - edges[i + 1]);
  ok('P1.0 toggles every ~500 ms (module LED L0 blinks at ~1 Hz)', halves.length >= 3 && halves.every((h) => h > 0.45 && h < 0.55), halves.map((h) => `${(h * 1000).toFixed(0)} ms`).join(', '));
  const f = frame();
  ok('pin monitor reads ~1 Hz on P1.0 (no edges kept from before the reset)', Math.abs(f.ports[1].freq[0] - 0.99) < 0.03, `${f.ports[1].freq[0].toFixed(3)} Hz`);
  ok('module LEDs follow P1 (L1-L7 lit, P1 = 0xFF after reset)', f.board.kind === 'mcs51' && f.board.leds.slice(1).every((v) => v > 0.9), f.board.leds.map((v) => v.toFixed(1)).join(' '));

  e.input({ kind: 'power', on: false });
  ok('power off: module LEDs dark', frame().board.leds.every((v) => v === 0));
  e.input({ kind: 'power', on: true });
  ok('program survives a power cycle and starts at power-on', e.deviceState().mode === 'running' && e.deviceState().flashed);

  // a ribbon from PORT-1 to L_BANK drives the base board's LED bank
  e.input({ kind: 'cable', target: 'LBANK', port: 1 });
  frame();
  for (let i = 0; i < 20000; i++) e.mcu.step();
  const bank = frame().board.bank;
  ok('L_BANK ribbon on PORT-1: base LED bank mirrors P1', bank.slice(1).every((v) => v > 0.9), bank.map((v) => v.toFixed(1)).join(' '));
}

// ------------------------------------------------- breakpoints / stepping
async function session(arch, file, bpLine) {
  const r = arch === 'pic18' ? await compilePic18(src(file)) : await compile8051(src(file));
  const msgs = [];
  const e = new Engine((m) => msgs.push(m));
  e.init(arch, arch === 'pic18' ? defaultPicBoardConfig() : defaultMcs51Config());
  if (arch === 'pic18') {
    btn(e, 'reset', true); btn(e, 'boot', true); btn(e, 'reset', false); btn(e, 'boot', false);
    e.erase(); e.flash(r.hex, r.debug);
    e.setBreakpoints([bpLine]);
    btn(e, 'reset', true); btn(e, 'reset', false);
  } else {
    e.load(r.hex, r.debug);
    e.setBreakpoints([bpLine]);
    e.run();
  }
  e.speed = 0;
  const stopAt = () => msgs.filter((m) => m.type === 'stopped').at(-1);
  for (let i = 0; i < 400 && !stopAt(); i++) e.tick();
  const hit = stopAt();
  ok(`${file}: breakpoint at line ${bpLine}`, hit?.reason === 'breakpoint' && hit.line === bpLine, `stopped ${hit?.reason} line ${hit?.line}`);
  e.setBreakpoints([]);
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const before = msgs.length;
    e.step('over');
    for (let i = 0; i < 400 && !msgs.slice(before).some((m) => m.type === 'stopped'); i++) e.tick();
    lines.push(msgs.slice(before).find((m) => m.type === 'stopped')?.line);
  }
  ok(`${file}: step over advances through source lines`, lines.every((l) => typeof l === 'number') && new Set(lines).size >= 3, lines.join(' → '));
}

console.log('Source-level debugging');
const src5 = src('exp5_pic_lcd.c').split('\n');
await session('pic18', 'exp5_pic_lcd.c', src5.findIndex((l) => l.includes('lcd_init();') && !l.includes('void')) + 1);
const src1 = src('exp1_8051_led.c').split('\n');
await session('mcs51', 'exp1_8051_led.c', src1.findIndex((l) => l.includes('LED = 1;')) + 1);
console.log(fails ? `${fails} FAILED` : 'debugger checks passed');
process.exit(fails ? 1 : 0);
