// End-to-end checks: compile each reference experiment with the real toolchain,
// execute it on the emulator + board model, and verify observable hardware behaviour.
// Usage: node tests/run-all.mjs
import { readFileSync } from 'node:fs';
import { compile8051, compilePic18 } from '../server/compilers/toolchains.mjs';
import { Pic18 } from '../src/sim/pic18/pic18.ts';
import { flashApplication, installBootloader } from '../src/sim/pic18/bootloader.ts';
import { Mcs51 } from '../src/sim/mcs51/mcs51.ts';
import { PicBoard, defaultPicBoardConfig } from '../src/sim/board/picboard.ts';
import { Mcs51Board, defaultMcs51Config } from '../src/sim/board/mcs51board.ts';

const code = (f) => readFileSync(new URL(`../src/experiments/code/${f}`, import.meta.url), 'utf8');
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

function picRig(cfgPatch) {
  const cfg = defaultPicBoardConfig();
  cfgPatch?.(cfg);
  const board = new PicBoard(cfg);
  const mcu = new Pic18(board);
  board.attach(mcu);
  installBootloader(mcu);
  // program the way the board's USB HID bootloader does (application at 0x1000, its own config bits)
  const flash = (hex) => { const r = flashApplication(mcu, hex); mcu.reset(); return r; };
  const runFor = (sec) => { const end = mcu.cycles + sec * mcu.cycleHz(); while (mcu.cycles < end) mcu.step(); };
  const frame = () => board.frame(mcu.cycles / mcu.cycleHz(), 0.05);
  return { board, mcu, runFor, frame, flash };
}

async function build(file, arch = 'pic18') {
  const r = arch === 'pic18' ? await compilePic18(code(file)) : await compile8051(code(file));
  if (!r.ok) { console.log(r.log); throw new Error(`${file} failed to compile`); }
  return r;
}

const lcdText = (snap) => snap.lcd.rows.map((r) => r.map((c) => (c < 0 ? ' ' : c === 0xdf ? '°' : String.fromCharCode(c))).join(''));

// ---------------------------------------------------------------- exp 1
{
  console.log('Experiment 1 — 8051 LED toggle');
  const r = await build('exp1_8051_led.c', '8051');
  const board = new Mcs51Board(defaultMcs51Config());
  const mcu = new Mcs51(board, 'AT89C51');
  board.attach(mcu);
  mcu.loadHex(r.hex);
  const edges = [];
  board.pinMonitor.update = ((orig) => function (p, l, d, t) { if (p === 1) edges.push([t, l & 1]); return orig.call(this, p, l, d, t); })(board.pinMonitor.update);
  const end = mcu.cycleHz() * 2.6;
  while (mcu.cycles < end) mcu.step();
  const toggles = edges.filter((e, i) => i > 0 && e[1] !== edges[i - 1][1]);
  const period = toggles.length > 2 ? (toggles[toggles.length - 1][0] - toggles[1][0]) / (toggles.length - 2) : 0;
  // 0xFC66 is the textbook 1 ms reload; reload/loop overhead adds ~2.4 % exactly as on real silicon
  check('P1.0 toggles every ~500 ms (+loop overhead)', Math.abs(period - 0.5) < 0.015, `half-period ${(period * 1000).toFixed(2)} ms, ${r.stats.program} bytes`);
}

// ---------------------------------------------------------------- exp 2
{
  console.log('Experiment 2 — switches, LEDs, relay, buzzer');
  const r = await build('exp2_pic_io.c');
  const { board, mcu, runFor, frame, flash } = picRig((c) => { c.cables.LBANK = 3; c.dips.periph = [false, false, false, true, true, false]; });
  flash(r.hex);
  runFor(0.1);
  let f = frame();
  const pat = () => f.leds.map((x) => (x > 0.5 ? 1 : 0)).reverse().join('');
  check('idle pattern 0x55/0xAA', ['01010101', '10101010'].includes(pat()), pat());
  check('relay off when idle', !f.relay);
  board.input({ kind: 'button', id: 'sw0', pressed: true });
  runFor(0.7); f = frame();
  check('SW0 -> relay ON', f.relay);
  check('SW0 -> single running LED', f.leds.filter((x) => x > 0.5).length === 1, pat());
  board.input({ kind: 'button', id: 'sw0', pressed: false });
  board.input({ kind: 'button', id: 'sw1', pressed: true });
  runFor(0.6); frame(); runFor(0.05); f = frame();
  check('SW1 -> buzzer ON, relay OFF', f.buzzer > 0.9 && !f.relay, `buzzer duty ${f.buzzer.toFixed(2)}`);
}

// ---------------------------------------------------------------- exp 3
{
  console.log('Experiment 3 — Timer0 interrupt square wave');
  const r = await build('exp3_pic_timer0.c');
  const { mcu, runFor, board, flash } = picRig();
  flash(r.hex);
  runFor(0.02);
  const t0 = mcu.cycles / mcu.cycleHz();
  board.pinMonitor.frame(t0, 5);
  runFor(1.0);
  const stats = board.pinMonitor.frame(mcu.cycles / mcu.cycleHz(), 5);
  const freq = stats.freq[3][0];
  check('RD0 square wave ≈ 1000 Hz', Math.abs(freq - 1000) < 5, `${freq.toFixed(1)} Hz, duty ${(stats.duty[3][0] * 100).toFixed(1)} %`);
}

// ---------------------------------------------------------------- exp 4
{
  console.log('Experiment 4 — CCP1 PWM motor control');
  const r = await build('exp4_pic_pwm.c');
  const { board, mcu, runFor, frame, flash } = picRig();
  flash(r.hex);
  runFor(0.05); frame();
  runFor(0.2);
  let f = frame();
  const p = mcu.peripheralState().pwm[0];
  check('PWM 5 kHz', Math.abs(p.freq - 5000) < 1, `${p.freq.toFixed(0)} Hz`);
  check('initial duty 50 %', Math.abs(f.motor.dutyEn1 - 0.5) < 0.02, `measured on RC2: ${(f.motor.dutyEn1 * 100).toFixed(1)} %`);
  board.input({ kind: 'button', id: 'sw0', pressed: true });
  runFor(0.6);
  board.input({ kind: 'button', id: 'sw0', pressed: false });
  runFor(0.3); frame(); runFor(0.2); f = frame();
  check('SW0 raises duty to 80 %', Math.abs(f.motor.dutyEn1 - 0.8) < 0.02, `${(f.motor.dutyEn1 * 100).toFixed(1)} %`);
  for (let i = 0; i < 40; i++) { runFor(0.05); f = board.frame(mcu.cycles / mcu.cycleHz(), 0.05); }
  check('motor speed follows duty', Math.abs(f.motor.rpm - 160) < 6, `${f.motor.rpm.toFixed(0)} rpm`);
}

// ---------------------------------------------------------------- exp 5
{
  console.log('Experiment 5 — 16x2 LCD');
  const r = await build('exp5_pic_lcd.c');
  const { mcu, runFor, frame, board, flash } = picRig((c) => { c.cables.LBANK = null; c.cables.LCD_DATA = 3; c.cables.LCD_CTRL = 4; });
  flash(r.hex);
  runFor(0.3);
  const f = frame();
  const t = lcdText(f);
  check('line 1 = "  PICT  PUNE  "', t[0].startsWith('  PICT  PUNE  '), JSON.stringify(t[0]));
  check('line 2 = "EP Lab - Expt 5"', t[1].startsWith('EP Lab - Expt 5'), JSON.stringify(t[1]));
  check('display on, cursor off', f.lcd.displayOn && !f.lcd.cursor);
  const warns = board.drainLogs().filter((l) => l.level === 'warn');
  check('no LCD timing warnings', warns.length === 0, warns[0]?.msg ?? '');
}

// ---------------------------------------------------------------- exp 6
{
  console.log('Experiment 6 — LM35 temperature on LCD');
  const r = await build('exp6_pic_temp.c');
  const { board, mcu, runFor, frame, flash } = picRig((c) => {
    c.cables.LBANK = null; c.cables.LCD_DATA = 3; c.cables.LCD_CTRL = 4; c.dips.analog = [false, true];
  });
  flash(r.hex);
  board.input({ kind: 'temperature', celsius: 31.4 });
  runFor(1.2);
  let t = lcdText(frame());
  check('shows ~31.4 °C', /31\.[2-5]°C/.test(t[1]), JSON.stringify(t));
  board.input({ kind: 'temperature', celsius: 48 });
  runFor(1.2);
  t = lcdText(frame());
  check('tracks change to 48 °C', /4[78]\.\d°C/.test(t[1]), JSON.stringify(t[1]));
}
{
  console.log('Experiment 6 — RA1 left as an output (TRISA = 0x00)');
  const src = code('exp6_pic_temp.c').replace('TRISA = 0x02;', 'TRISA = 0x00;');
  const r = await compilePic18(src);
  if (!r.ok) { console.log(r.log); throw new Error('exp6 variant failed to compile'); }
  const { board, runFor, frame, flash } = picRig((c) => {
    c.cables.LBANK = null; c.cables.LCD_DATA = 3; c.cables.LCD_CTRL = 4; c.dips.analog = [false, true];
  });
  flash(r.hex);
  board.input({ kind: 'temperature', celsius: 31.4 });
  runFor(1.2);
  const t = lcdText(frame());
  check('ADC reads the driven 0 V, not the LM35', /000\.0°C/.test(t[1]), JSON.stringify(t[1]));
  const w = board.drainLogs().find((l) => /AN1 \(RA1\) is an output/.test(l.msg));
  check('warns that the analog pin is an output', !!w, w?.msg ?? 'no warning');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
