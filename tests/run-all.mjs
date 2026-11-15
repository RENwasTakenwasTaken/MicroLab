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
  const now = () => mcu.cycles / mcu.cycleHz();
  const start = now();
  // duty measured on RC2 over 0.2 s around a moment `at` seconds after start; the motor model
  // is stepped every 50 ms so its speed can follow
  let f;
  const dutyAt = (at) => {
    while (now() - start < at - 0.1) { runFor(0.05); f = board.frame(now(), 0.05); }
    frame(); runFor(0.2); f = frame();
    return f.motor.dutyEn1;
  };
  const p = mcu.peripheralState().pwm[0];
  const steps = [20, 40, 60, 80, 100].map((d, i) => [d, dutyAt(0.75 + i * 1.5)]);
  check('PWM 5 kHz', Math.abs(mcu.peripheralState().pwm[0].freq - 5000) < 1, `${mcu.peripheralState().pwm[0].freq.toFixed(0)} Hz`);
  check('duty steps 20/40/60/80/100 % every ~1.5 s', steps.every(([d, m]) => Math.abs(m * 100 - d) < 2), steps.map(([, m]) => `${(m * 100).toFixed(0)} %`).join(' → '));
  const again = dutyAt(0.75 + 5 * 1.5);
  check('then repeats from 20 %', Math.abs(again - 0.2) < 0.02, `${(again * 100).toFixed(0)} %`);
  // motor speed at the end of the 20 % and 80 % windows of the third cycle (starts at 15 s);
  // a 1.5 s step is shorter than the motor needs to settle fully, so check that it follows
  const rpmAt = (at) => { while (now() - start < at) { runFor(0.05); f = board.frame(now(), 0.05); } return f.motor.rpm; };
  const r20 = rpmAt(15 + 1.45), r80 = rpmAt(15 + 4.5 + 1.45);
  check('motor speed follows duty', r80 > r20 + 60 && r80 > 120 && r80 <= 165, `${r20.toFixed(0)} rpm at 20 % → ${r80.toFixed(0)} rpm at 80 %`);
  void p;
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
  check('no LCD faults', Object.values(f.lcd.faults).every((n) => n === 0), JSON.stringify(f.lcd.faults));
  // the reference program also survives a power cycle (its ~20 ms start-up delay covers the LCD's 10 ms reset)
  board.input({ kind: 'power', on: false }); board.input({ kind: 'power', on: true });
  runFor(0.3);
  const f2 = frame();
  check('after a power cycle: same text, no LCD faults', lcdText(f2)[0].startsWith('  PICT  PUNE  ') && Object.values(f2.lcd.faults).every((n) => n === 0), JSON.stringify(f2.lcd.faults));
}

// LCD timing faults: variants of the Expt 5 reference program, each missing one delay
async function lcdVariant(edit) {
  const src = edit(code('exp5_pic_lcd.c'));
  if (src === code('exp5_pic_lcd.c')) throw new Error('LCD variant: edit did not apply');
  const r = await compilePic18(src);
  if (!r.ok) { console.log(r.log); throw new Error('LCD variant failed to compile'); }
  const rig = picRig((c) => { c.cables.LBANK = null; c.cables.LCD_DATA = 3; c.cables.LCD_CTRL = 4; });
  rig.flash(r.hex);
  return rig;
}
const lcdWarn = (board, re) => board.drainLogs().find((l) => l.level === 'warn' && re.test(l.msg));
{
  console.log('Experiment 5 — LCD timing: no delay after a command');
  const { board, runFor, frame } = await lcdVariant((s) => s.replace('delay(16);', ';'));
  runFor(0.3);
  const f = frame(), t = lcdText(f);
  check('writes right after Clear display are ignored (start of line 1 missing)', f.lcd.faults.busy > 0 && !t[0].startsWith('  PICT') && t[1].startsWith('EP Lab - Expt 5'), `${f.lcd.faults.busy} ignored · ${JSON.stringify(t)}`);
  const w = lcdWarn(board, /LCD ignored/);
  check('message names the Clear display command and the fix delay(16)', !!w && /Clear display/.test(w.msg) && /1\.52 ms/.test(w.msg) && /delay\(16\)/.test(w.msg), w?.msg ?? 'no warning');
}
{
  console.log('Experiment 5 — LCD timing: no power-on delay');
  const { board, runFor, frame } = await lcdVariant((s) => s.replace('delay(160);', ';'));
  runFor(0.3);
  check('works when started by a reset (the LCD has been powered for a while)', lcdText(frame())[0].startsWith('  PICT  PUNE  '));
  board.drainLogs();
  board.input({ kind: 'power', on: false }); board.input({ kind: 'power', on: true });
  runFor(0.3);
  let f = frame();
  check('after switching the board on: the LCD ignores the init commands, display stays off', f.lcd.faults.powerOn > 0 && !f.lcd.displayOn, `${f.lcd.faults.powerOn} ignored`);
  const w = lcdWarn(board, /LCD ignored/);
  check('message explains the power-on reset and the fix delay(160)', !!w && /after power-on/.test(w.msg) && /delay\(160\)/.test(w.msg), w?.msg ?? 'no warning');
  board.input({ kind: 'button', id: 'reset', pressed: true }); board.input({ kind: 'button', id: 'reset', pressed: false });
  runFor(0.3);
  f = frame();
  check('pressing RESET hides the bug: text shown, fault count cleared', lcdText(f)[0].startsWith('  PICT  PUNE  ') && f.lcd.faults.powerOn === 0);
}
{
  console.log('Experiment 5 — LCD timing: EN = 1; EN = 0; back to back');
  const { board, runFor, frame } = await lcdVariant((s) => s.replace(/EN = 1;\s*delay\(1\);\s*EN = 0;/g, 'EN = 1;\n\tEN = 0;'));
  runFor(0.3);
  const f = frame();
  check('every write ignored: LCD never initialised', f.lcd.faults.pulse > 0 && !f.lcd.initialized, `${f.lcd.faults.pulse} ignored`);
  const w = lcdWarn(board, /LCD ignored/);
  check('message gives the pulse width and the 230 ns minimum', !!w && /EN was high for only \d+ ns/.test(w.msg) && /230 ns/.test(w.msg), w?.msg ?? 'no warning');
}

// ---------------------------------------------------------------- exp 6
// the lab's program: LCD control on PORT-E (RE0-RE2), LM35 on AN1, line 1 = "Result:" + the 4-digit ADC result
const exp6Rig = () => picRig((c) => {
  c.cables.LBANK = null; c.cables.LCD_DATA = 3; c.cables.LCD_CTRL = 4; c.dips.analog = [false, true];
});
/** ADC result shown on line 1 ("Result:0064"), or NaN */
const exp6Result = (snap) => { const m = /^Result:(\d{4})/.exec(lcdText(snap)[0]); return m ? Number(m[1]) : NaN; };
/** what the 10-bit ADC gives for the LM35 at `c` degrees (10 mV / °C, Vref = 5 V) */
const lm35Code = (c) => Math.floor((c * 0.01 / 5) * 1024);
{
  console.log('Experiment 6 — LM35 on AN1, ADC result on the LCD');
  const r = await build('exp6_pic_temp.c');
  const { board, runFor, frame, flash } = exp6Rig();
  flash(r.hex);
  board.input({ kind: 'temperature', celsius: 31.4 });
  runFor(1.2);
  let f = frame();
  check(`shows "Result:" + the ADC result for 31.4 °C (${lm35Code(31.4)})`, Math.abs(exp6Result(f) - lm35Code(31.4)) <= 1, JSON.stringify(lcdText(f)));
  check('display on, no LCD faults, no warnings', f.lcd.displayOn && Object.values(f.lcd.faults).every((n) => n === 0) && !board.drainLogs().some((l) => l.level === 'warn'), JSON.stringify(f.lcd.faults));
  check('analog pin is an input: no ADC output HUD', f.adcOutput === null);
  board.input({ kind: 'temperature', celsius: 48 });
  runFor(1.2);
  f = frame();
  check(`tracks a change to 48 °C (${lm35Code(48)})`, Math.abs(exp6Result(f) - lm35Code(48)) <= 1, JSON.stringify(lcdText(f)[0]));
  // the lab's program sends its first LCD command ~12.8 ms after start-up: past the LCD's 10 ms reset
  board.input({ kind: 'power', on: false }); board.input({ kind: 'power', on: true });
  runFor(1.2);
  f = frame();
  check('after a power cycle: same reading, no LCD faults', Math.abs(exp6Result(f) - lm35Code(48)) <= 1 && f.lcd.displayOn && Object.values(f.lcd.faults).every((n) => n === 0), `${JSON.stringify(lcdText(f)[0])} ${JSON.stringify(f.lcd.faults)}`);
}
{
  console.log('Experiment 6 — RA1 left as an output (TRISAbits.RA1 = 0)');
  const src = code('exp6_pic_temp.c').replace('TRISAbits.RA1 = 1;', 'TRISAbits.RA1 = 0;');
  if (src === code('exp6_pic_temp.c')) throw new Error('exp6 variant: edit did not apply');
  const r = await compilePic18(src);
  if (!r.ok) { console.log(r.log); throw new Error('exp6 variant failed to compile'); }
  const { board, runFor, frame, flash } = exp6Rig();
  flash(r.hex);
  board.input({ kind: 'temperature', celsius: 31.4 });
  runFor(1.2);
  const f = frame();
  check('ADC reads the driven 0 V, not the LM35', exp6Result(f) === 0, JSON.stringify(lcdText(f)[0]));
  check('frame reports AN1 (RA1) read as an output at 0 V (HUD above PORT-A)', f.adcOutput?.ch === 1 && f.adcOutput.port === 0 && f.adcOutput.bit === 1 && f.adcOutput.volts === 0, JSON.stringify(f.adcOutput));
  const w = board.drainLogs().find((l) => /AN1 \(RA1\) is an output/.test(l.msg));
  check('warns that the analog pin is an output, with the fix', !!w && /How to fix:/.test(w.msg) && /TRISAbits\.RA1 = 1/.test(w.msg), w?.msg ?? 'no warning');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
