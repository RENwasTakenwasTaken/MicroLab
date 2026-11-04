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
