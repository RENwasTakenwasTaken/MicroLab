// PCE lab, Expt 4 (PCM trainer): drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core. Usage: node tests/ui-pce-pcm.mjs [outDir] [shots]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'tests/screenshots';
const shots = process.argv.includes('shots');
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/pcm-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/pcm');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'pcm', null, { timeout: 60000 });
await sleep(2500);
ok('PCM bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
const view = async (v, name) => { await page.evaluate((x) => window.__pce.store.getState().setView(x), v); await sleep(1500); if (name) await shot(name); };
await view('kit', 'kit'); await view('top', 'top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const patch = async (cord, a, b) => (await attach(`${cord}:a`, a)) && (await attach(`${cord}:b`, b));
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (p) => st((s, q) => s.getState().setScope(q), p);
const chans = (v1, p1, v2, p2) => st((s, a) => s.getState().scope.ch.map((c, i) => ({ ...c, vdiv: a[i * 2], pos: a[i * 2 + 1] })), [v1, p1, v2, p2]);
const trig = (source, level) => scope({ trig: { source, slope: 'rise', level, mode: 'auto' } });
// a record taken while a probe or its ground clip was being moved can be stale: retry until the scope triggers
const acq = async () => { let a = null; for (let i = 0; i < 3 && !a?.triggered; i++) a = await acq1(); return a; };
const acq1 = async () => { await sleep(700); return page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
}); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;
const warns = () => page.$$eval('.wf-warn', (els) => els.map((e) => e.textContent));
const FCLK = 0.8e6 + 0.8e6 * 0.65, FS = FCLK / 64;
/** Levels of a node at the middle of each frame over n frames (deduplicated, sorted). */
const frameLevels = (node, n = 400) => page.evaluate(([node, n]) => {
  const p = window.__pce.pcm; p.syncKit();
  const t0 = performance.now() / 1000 + 0.01, k0 = Math.ceil(p.clocksNow(t0) / 64) + 4, set = new Set();
  for (let k = k0; k < k0 + n; k++) set.add(p.probe(node, p.clockTime(k * 64 + 32, t0)).toFixed(3));
  return [...set].map(Number).sort((a, b) => a - b);
}, [node, n]);
/** The slots of one PCM frame (1 / 0), read at the middle of each slot. */
const frame = () => page.evaluate(() => {
  const p = window.__pce.pcm; p.syncKit();
  const t0 = performance.now() / 1000 + 0.01, k = Math.ceil(p.clocksNow(t0) / 64) + 3, bits = [];
  for (let s = 0; s < 16; s++) bits.push(p.probe('PCM', p.clockTime(k * 64 + s * 4 + 2, t0)) > 2.5 ? 1 : 0);
  const word = p.probe('RAW', p.clockTime((k + 1) * 64 + 32, t0));
  return { bits, word };
});

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('mains plug and Mains ON power the kit', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');

// ---- sampling clock
await attach('ch1', 'samp.clk');
ok('ground clip reaches the filter GND pin from SAMP CLOCK', (await attach('ch1g', 'flt.gnd')) === true);
await scope({ sdiv: 0.5e-6, ch: await chans(2, 0, 1, -3) }); await trig(0, 2.4);
let a = await acq();
ok('SAMP CLOCK on FAST: 1.32 MHz, 0 to 4.8 V', !!a && a.triggered && near(a.f, FCLK, 3e3) && near(a.ch1.hi, 4.8, 0.3), JSON.stringify(a));

// ---- sine: 1 kHz, 2 V p-p
await knob('agAmp', 2 / (5 * 0.97)); await knob('agFreq', (1000 / 1.02 - 300) / 3100);
await attach('ch1', 'ag.out'); await attach('ch1g', 'ag.gnd');
await scope({ sdiv: 250e-6, ch: await chans(0.5, 0, 1, -3) }); await trig(0, 0);
a = await acq();
ok('Sine O/P: 1 kHz, 2 V peak-to-peak, no DC', !!a && near(a.f, 1000, 15) && near(a.ch1.hi - a.ch1.lo, 2, 0.12) && near(a.ch1.hi + a.ch1.lo, 0, 0.1), JSON.stringify(a));

// ---- ramp, 3 bit
await attach('ch1', 'mod.ramp'); await attach('ch1g', 'mod.gnd2');
await scope({ sdiv: 10e-6, ch: await chans(0.5, -3, 1, -3) }); await trig(0, 1.2);
a = await acq();
ok('RAMP (3 bit): staircase 0 to 2.52 V, one per sample (20.6 kHz)', !!a && near(a.f, FS, 200) && near(a.ch1.hi, 7 * 0.36, 0.05) && near(a.ch1.lo, 0, 0.05), JSON.stringify(a));
let lv = await frameLevels('RAMP', 64);
const rampSteps = await page.evaluate(() => {
  const p = window.__pce.pcm; p.syncKit();
  const t0 = performance.now() / 1000 + 0.01, k = Math.ceil(p.clocksNow(t0) / 64) + 2, set = new Set();
  for (let c = 0; c < 64; c++) set.add(p.probe('RAMP', p.clockTime(k * 64 + c + 0.5, t0)).toFixed(3));
  return set.size;
});
ok('RAMP (3 bit): 8 steps in one frame', rampSteps === 8, String(rampSteps));

// ---- PCM output
ok('sine patched to MOD. I/P (cord 1, socket to socket)', await patch('c1', 'ag.outs', 'mod.ins'));
await attach('ch1', 'mod.out');
await scope({ sdiv: 10e-6, ch: await chans(2, 0, 1, -3) }); await trig(0, 2.4);
a = await acq();
ok('PCM O/P: 0 / 4.8 V frames, triggered at the frame rate', !!a && a.triggered && near(a.ch1.hi, 4.8, 0.2) && near(a.ch1.lo, 0, 0.1), JSON.stringify(a));
let fr = await frame();
const SYNC3 = fr.bits.slice(0, 11).every((b) => b === 1), START = fr.bits[11] === 0, STOP = fr.bits[15] === 0;
ok('PCM frame (3 bit): 11 sync slots high, start low, 3 data bits, stop low', SYNC3 && START && STOP, fr.bits.join(''));
await shot('pcm');

// ---- demodulator: raw data
ok('PCM O/P patched to PCM I/P (cord 2)', await patch('c2', 'mod.outs', 'dem.in'));
lv = await frameLevels('RAW');
const diffs = lv.slice(1).map((v, i) => v - lv[i]);
ok('RAW DATA (3 bit, 2 V p-p sine): 6 levels, 360 mV apart, symmetric about 0 V', lv.length === 6 && diffs.every((d) => near(d, 0.36, 0.002)) && near(lv[0] + lv[5], 0, 0.002), lv.join(' '));
await knob('agAmp', 2.8 / (5 * 0.97));
lv = await frameLevels('RAW');
ok('RAW DATA (3 bit, 2.8 V p-p sine): all 8 levels, ±1.26 V at the ends', lv.length === 8 && near(lv[0], -1.26, 0.002) && near(lv[7], 1.26, 0.002), lv.join(' '));
await knob('agAmp', 2 / (5 * 0.97));
const track = await page.evaluate(() => {
  // the staircase follows the sine, 2.5 frames late, within half a step
  const p = window.__pce.pcm; p.syncKit();
  const t0 = performance.now() / 1000 + 0.01, k0 = Math.ceil(p.clocksNow(t0) / 64) + 4;
  let worst = 0;
  for (let k = k0; k < k0 + 200; k++) {
    const raw = p.probe('RAW', p.clockTime(k * 64 + 32, t0)), s = p.probe('SINE', p.clockTime((k - 2) * 64, t0));
    worst = Math.max(worst, Math.abs(raw - s));
  }
  return worst;
});
ok('RAW DATA follows the message within S/2 (quantisation noise ≤ 180 mV)', track <= 0.181, track.toFixed(3));
await attach('ch1', 'dem.raw'); await attach('ch1g', 'flt.gnd2'); await attach('ch2', 'ag.out'); await attach('ch2g', 'ag.gnd');
await scope({ sdiv: 250e-6, ch: await chans(0.5, 0, 0.5, 0) }); await trig(1, 0);
a = await acq();
ok('scope: RAW DATA staircase against the sine, triggered on the sine', !!a && a.triggered && near(a.ch1.hi, 0.9, 0.05) && near(a.f, 1000, 15), JSON.stringify(a));
await shot('raw');

// ---- filter
await attach('ch1', 'dem.fout'); await attach('ch1g', 'flt.gnd2');
ok('RAW DATA patched to Recvd I/P (cord 3)', await patch('c3', 'dem.raw', 'flt.in'));
a = await acq();
const fpp = a ? a.ch1.hi - a.ch1.lo : 0;
ok('Filter O/P: the 1 kHz sine back, about 2 V p-p (GAIN as found)', !!a && fpp > 1.6 && fpp < 2.4 && near(a.ch1.hi + a.ch1.lo, 0, 0.25), JSON.stringify(a));
const smooth = await page.evaluate(() => {
  // no stairs left: the filtered output never jumps between 1 µs neighbours
  const p = window.__pce.pcm; p.syncKit();
  const t0 = performance.now() / 1000 + 0.01;
  let worst = 0, prev = p.probe('FOUT', t0);
  for (let i = 1; i < 2000; i++) { const v = p.probe('FOUT', t0 + i * 1e-6); worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
  return worst;
});
ok('Filter O/P is smooth (largest 1 µs change < 20 mV)', smooth < 0.02, smooth.toFixed(4));
await knob('gain', 0.5);
a = await acq();
ok('GAIN raises the filtered output', !!a && a.ch1.hi - a.ch1.lo > fpp * 1.5, JSON.stringify(a?.ch1));
await knob('gain', 0.06);
await shot('filter');

// ---- 4 bit
await knob('bit3', 0);
lv = await frameLevels('RAW', 600);
ok('RAW DATA (4 bit, 2 V p-p): 12 levels, 180 mV apart', lv.length === 12 && lv.slice(1).every((v, i) => near(v - lv[i], 0.18, 0.002)), lv.join(' '));
await knob('agAmp', 2.85 / (5 * 0.97));
lv = await frameLevels('RAW', 800);
ok('RAW DATA (4 bit, 2.85 V p-p): all 16 levels', lv.length === 16, lv.join(' '));
await knob('agAmp', 2 / (5 * 0.97));
fr = await frame();
ok('PCM frame (4 bit): 10 sync slots, start, 4 data bits, stop', fr.bits.slice(0, 10).every((b) => b === 1) && fr.bits[10] === 0 && fr.bits[15] === 0, fr.bits.join(''));
const word = fr.bits.slice(11, 15).reduce((n, b) => n * 2 + b, 0);
ok('the demodulator decodes the frame it receives', near(fr.word, (word + 0.5 - 8) * 0.18, 0.001), `${fr.bits.join('')} -> ${fr.word}`);

// ---- DC input
await attach('c1:a', 'dc.out');
const words = [];
for (const k of [0.2, 0.5, 0.8]) {
  await knob('dc', k); await sleep(100);
  const leds = await page.evaluate(() => window.__pce.pcm.ledLevels(performance.now() / 1000 + 0.5));
  const vdc = 2.5 * (2 * k - 1), want = Math.min(15, Math.max(0, Math.floor((vdc + 1.44) / 0.18)));
  const got = leds.reduce((n, b) => n * 2 + (b > 0.5 ? 1 : 0), 0);
  words.push(`${vdc.toFixed(2)} V: ${got}/${want}`);
  if (got !== want || leds.some((b) => b > 0.01 && b < 0.99)) { ok('LEDs show the DC word', false, words.join(' · ')); break; }
}
ok('VAR DC → MOD. I/P: the LEDs D1…D4 show a steady word that follows the DC (4 bit)', words.length === 3, words.join(' · '));
await knob('bit3', 1); await knob('dc', 0.5);
const leds3 = await page.evaluate(() => window.__pce.pcm.ledLevels(performance.now() / 1000 + 0.5));
ok('3 bit: D4 stays dark; 0 V codes as 100 (the middle word)', leds3.join('') === '1000', leds3.join(','));
const steps = await page.$$eval('.wf > ol > li', (els) => els.map((e) => e.classList.contains('done')));
await shot('dc');

// ---- SLOW
await knob('slow', 1);
const slowF = await page.evaluate(() => window.__pce.pcm.syncKit().fclk);
ok('SLOW: the clock drops 4700 times (a few hundred hertz)', near(slowF, FCLK / 4700, 1), slowF.toFixed(1));
await attach('ch1', 'mod.out');
ok('guide warns that SLOW makes the waveforms crawl', (await warns()).some((w) => /SLOW is selected/.test(w)));
await knob('slow', 0);

// ---- warnings: clipping, missing links
await attach('c1:a', 'ag.outs'); await knob('agAmp', 1);
ok('guide warns when the sine is larger than the quantiser range', (await warns()).some((w) => /more than the 2.88 V/.test(w)));
await knob('agAmp', 2 / (5 * 0.97));
await st((s) => { s.getState().pick('c2:b'); s.getState().drop([0, 760, 300]); });
await attach('ch1', 'dem.raw');
ok('guide asks for PCM O/P → PCM I/P when RAW DATA has nothing to decode', (await warns()).some((w) => /patch PCM O\/P to PCM I\/P/.test(w)));
ok('RAW DATA is 0 V without the PCM link', (await frameLevels('RAW', 40)).join() === '0');
await attach('c2:b', 'dem.in');

// ---- 3D controls: click BIT SELECT and SLOW / FAST in the top view
await view('top');
const click = async (x, y, h) => { const p = await page.evaluate(([x, y, h]) => window.__pce3d.project(window.__pce3d.pcmPanel(x, y, h)), [x, y, h]); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250); await page.mouse.click(p.x, p.y); await sleep(500); };
const L = await page.evaluate(async () => { const m = await import('/src/pce/pcm/layout.ts'); return { bit3: m.TOGGLES.bit3, slow: m.TOGGLES.slow }; });
await click(L.bit3.x, L.bit3.y, 18);
ok('clicking BIT SELECT flips it to 4 BIT', (await st((s) => s.getState().knobs.bit3)) === 0);
await click(L.slow.x, L.slow.y, 18);
ok('clicking SLOW / FAST flips it to SLOW', (await st((s) => s.getState().knobs.slow)) === 1);
await knob('slow', 0); await knob('bit3', 1);

// ---- the guide and the lab sheet
ok('setup guide: steps done so far', steps.filter(Boolean).length >= 7, `${steps.filter(Boolean).length} of ${steps.length}`);
await page.goto('http://localhost:5173/#/pce');
await page.waitForSelector('a[href="#/pce/exp/pcm"]', { timeout: 30000 });
ok('the PCE list links Expt 4 as ready', true);
ok('no page errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
