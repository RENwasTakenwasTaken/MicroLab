// PCE lab, Expt 7 (FSK trainer): drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core. Usage: node tests/ui-pce-fsk.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/fsk-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/fsk');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'fsk', null, { timeout: 60000 });
await sleep(2500);
ok('FSK bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
const view = async (v, name) => { await page.evaluate((x) => window.__pce.store.getState().setView(x), v); await sleep(1500); if (name) await shot(name); };
await view('kit', 'kit'); await view('top', 'top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const unplug = (plug) => st((s, p) => { s.getState().pick(p); s.getState().drop([0, 760, 300]); }, plug);
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const chans = (v1, p1, v2, p2) => st((s, a) => s.getState().scope.ch.map((c, i) => ({ ...c, vdiv: a[i * 2], pos: a[i * 2 + 1] })), [v1, p1, v2, p2]);
const trig = (source, level) => scope({ trig: { source, slope: 'rise', level, mode: 'auto' } });
const acq = async () => { await sleep(500); return page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
}); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;
const warns = () => page.$$eval('.wf-warn', (els) => els.map((e) => e.textContent));
const FB = 80e3;

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('mains plug and MAINS ON power the kit', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
const WORD = [1, 0, 0, 1, 0, 1, 1, 0];
for (let i = 0; i < 8; i++) await knob(`s${8 - i}`, WORD[i]);
await attach('ch1', 'gen.nrz');
ok('ground clip reaches the GND pin of modulator-1 from the NRZ pin', (await attach('ch1g', 'bm1.gnd')) === true);
await scope({ sdiv: 25e-6, ch: await chans(2, 0, 2, -3) }); await trig(0, 2.5);
let a = await acq();
ok('NRZ data 0 to 5 V', !!a && a.triggered && near(a.ch1.lo, 0, 0.8) && near(a.ch1.hi, 5, 0.8), JSON.stringify(a));
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 't' } }); });
await sleep(300);
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 'off' } }); });
await attach('ch2', 'gen.bk'); await trig(1, 2.5);
a = await acq();
ok('BK: the bit rate, 80 kHz', !!a && near(a.f, FB, 100), String(a?.f));
await attach('ch2', 'gen.nrzb');
a = await acq();
ok('NRZ̅: 0 to 5 V as well', !!a && near(a.ch2.lo, 0, 0.8) && near(a.ch2.hi, 5, 0.8), JSON.stringify(a?.ch2));
await scope({ sdiv: 1e-6, ch: await chans(2, 0, 0.5, -2) });
await attach('ch2', 'car.f1'); await trig(1, 0);
a = await acq();
ok('f1: 640 kHz, 2 V peak-to-peak', !!a && a.triggered && near(a.f, 640e3, 2e3) && near(a.ch2.hi, 1, 0.15) && near(a.ch2.lo, -1, 0.15), JSON.stringify(a));
await attach('ch2', 'car.f2');
a = await acq();
ok('f2: 320 kHz', !!a && near(a.f, 320e3, 1e3), String(a?.f));
await shot('carrier');

// ---- the two modulators
ok('short cord: NRZ̅ to modulator-1', (await attach('c1:a', 'gen.nrzb')) && (await attach('c1:b', 'bm1.in')));
ok('a cord will not go onto a pin a probe tip is in', (await attach('c2:a', 'gen.nrz')) === false);
await unplug('ch1');
ok('long cord: NRZ to modulator-2', (await attach('c2:a', 'gen.nrz')) && (await attach('c2:b', 'bm2.in')));
ok('the probe tip goes into the back of the stacked cord plug on NRZ', (await attach('ch1', 'gen.nrz')) === true);
await attach('ch1g', 'bm1.gnd');
await attach('ch2', 'bm1.out');
await scope({ sdiv: 25e-6, ch: await chans(5, 2, 5, -1.6) }); await trig(0, 2.5);
a = await acq();
ok('ASK1: bursts of about ±5 V', !!a && near(a.ch2.hi, 5.25, 0.7) && near(a.ch2.lo, -5.25, 0.7), JSON.stringify(a?.ch2));
await scope({ run: false }); await sleep(300); await shot('ask1'); await scope({ run: true });

/** Per bit over many words: the sent bit, zero crossings and peak of a node over the bit's middle 80 %. */
const bits = (node) => page.evaluate(([node, FB]) => {
  const f = window.__pce.fsk; f.syncKit();
  const t0 = performance.now() / 1000 + 0.01, bk = (x) => f.probe('BK', x) > 2.5;
  let te = t0;
  for (let i = 1; i < 800; i++) { const x = t0 + (i / 800) * (2 / FB); if (bk(x) && !bk(x - 2 / (800 * FB))) { te = x; break; } }
  const res = [];
  for (let b = 0; b < 32; b++) {
    const s = te + b / FB, bit = f.probe('NRZ', s + 0.5 / FB) > 2.5;
    let zc = 0, pk = 0, last = f.probe(node, s + 0.1 / FB);
    for (let j = 1; j <= 400; j++) { const v = f.probe(node, s + (0.1 + (j * 0.8) / 400) / FB); if ((v > 0) !== (last > 0)) zc++; pk = Math.max(pk, Math.abs(v)); last = v; }
    res.push({ bit, zc, pk, end: f.probe(node, s + 0.97 / FB), late: f.probe(node, s + 0.75 / FB) });
  }
  return res;
}, [node, FB]);
const dft = (node, freqs) => page.evaluate(([node, freqs]) => {
  const f = window.__pce.fsk; f.syncKit();
  const t0 = performance.now() / 1000 + 0.01, N = 16000, dt = 0.25e-6, xs = new Float64Array(N);
  for (let n = 0; n < N; n++) xs[n] = f.probe(node, t0 + n * dt);
  // the carriers wander by up to about 0.5 kHz: take the strongest bin within 3 kHz of each frequency
  const at = (fr) => { let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N), ph = 2 * Math.PI * fr * n * dt; re += w * xs[n] * Math.cos(ph); im -= w * xs[n] * Math.sin(ph); } return (4 * Math.hypot(re, im)) / N; };
  return freqs.map((fr) => { let m = 0; for (let k = -12; k <= 12; k++) m = Math.max(m, at(fr + k * 250)); return m; });
}, [node, freqs]);
const fmt = (xs) => xs.map((x) => x.toFixed(3)).join(' ');

let b = await bits('ASK1');
ok('ASK1 is on for every 0 bit (from NRZ̅) and off for every 1', b.every((x) => (x.bit ? x.pk < 0.5 : x.pk > 4.5)), b.slice(0, 8).map((x) => `${+x.bit}:${x.pk.toFixed(1)}`).join(' '));
let s = await dft('ASK1', [640e3, 560e3, 720e3, 630e3, 320e3]);
ok('ASK1 spectrum: lobe at 640 kHz, nulls 80 kHz either side (bandwidth 160 kHz)', s[0] > 8 * s[1] && s[0] > 8 * s[2] && s[3] > 3 * s[1] && s[4] < s[0] / 10, fmt(s));
await attach('ch2', 'bm2.out');
b = await bits('ASK2');
ok('ASK2: 320 kHz bursts (4 cycles a bit) for every 1', b.every((x) => (x.bit ? x.pk > 4.5 && Math.abs(x.zc - 6.4) <= 1.5 : x.pk < 0.5)), b.slice(0, 8).map((x) => `${+x.bit}:${x.zc}`).join(' '));
s = await dft('ASK2', [320e3, 240e3, 400e3]);
ok('ASK2 spectrum: lobe at 320 kHz, nulls at 240 and 400 kHz', s[0] > 8 * s[1] && s[0] > 8 * s[2], fmt(s));

// ---- adder
await attach('ch2', 'add.out');
b = await bits('FSK');
ok('FSK: 4 cycles a bit for a 1, 8 for a 0, always about 5 V', b.every((x) => x.pk > 4.5 && Math.abs(x.zc - (x.bit ? 6.4 : 12.8)) <= 1.6), b.slice(0, 8).map((x) => `${+x.bit}:${x.zc}`).join(' '));
s = await dft('FSK', [320e3, 640e3, 240e3, 720e3, 480e3]);
ok('FSK spectrum: lobes at 320 and 640 kHz, outer nulls at 240 and 720 kHz (bandwidth 480 kHz = 6 fb)', s[0] > 8 * s[2] && s[1] > 8 * s[3] && s[4] < s[0] / 3, fmt(s));
await scope({ run: false }); await sleep(300); await shot('fsk'); await scope({ run: true });
await view('scope');
for (const node of ['bm1.out', 'bm2.out', 'add.out']) {
  await attach('ch2', node);
  await st((s) => { const g = s.getState(); g.setScope({ sdiv: 100e-6, menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 1, window: 'hanning', zoom: 1, center: 0.5 } }); });
  await sleep(900);
}
await shot('fsk-fft');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 25e-6, menu: 'none', math: { ...g.scope.math, on: false } }); });

// ---- demodulator
await attach('ch2', 'dem.raw');
a = await acq();
ok('FSK I/P not patched: the loop runs free, raw data flat, and the guide says why', !!a && a.ch2.hi - a.ch2.lo < 0.4 && (await warns()).some((w) => /runs free/.test(w)), JSON.stringify(a?.ch2));
ok('short green cord: FSK O/P socket to FSK I/P', (await attach('c3:a', 'add.outs')) && (await attach('c3:b', 'dem.in')));
await scope({ ch: await chans(5, 2, 2, -3) });
b = await bits('RAW');
ok('raw data: about 1 V at the end of a 1, about 4 V at the end of a 0', b.every((x) => (x.bit ? x.end < 1.6 : x.end > 3.4)), b.slice(0, 8).map((x) => `${+x.bit}:${x.end.toFixed(2)}`).join(' '));
a = await acq();
ok('raw data on the scope swings between about 1 V and 4 V', !!a && near(a.ch2.lo, 1, 0.5) && near(a.ch2.hi, 4, 0.5), JSON.stringify(a?.ch2));
await scope({ run: false }); await sleep(300); await shot('raw'); await scope({ run: true });
await attach('ch2', 'sq.out');
b = await bits('REC');
ok('received data matches the sent data at 3/4 of every bit', b.every((x) => (x.late > 2.5) === x.bit), b.slice(0, 8).map((x) => `${+x.bit}:${x.late.toFixed(1)}`).join(' '));
const delay = await page.evaluate((FB) => {
  const f = window.__pce.fsk; f.syncKit();
  const t0 = performance.now() / 1000 + 0.01, step = 1 / (FB * 400);
  let tn = null, tr = null;
  for (let i = 1; i < 4000 && tn === null; i++) { const x = t0 + i * step; if (f.probe('NRZ', x) > 2.5 && f.probe('NRZ', x - step) <= 2.5) tn = x; }
  for (let i = 1; i < 800 && tr === null; i++) { const x = tn + i * step; if (f.probe('REC', x) > 2.5 && f.probe('REC', x - step) <= 2.5) tr = x; }
  return tr !== null ? (tr - tn) * FB : null;
}, FB);
ok('received data lags the sent data by about a quarter of a bit', delay !== null && delay > 0.1 && delay < 0.5, String(delay));
await scope({ ch: await chans(5, 2, 5, -2) });
await scope({ run: false }); await sleep(300); await shot('received'); await scope({ run: true });
const g = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
ok('setup guide: every step done', g.every(Boolean), g.join());

// ---- mistakes the guide should explain
await unplug('c1:b');
await attach('ch2', 'bm1.out');
await sleep(300);
ok('modulator-1 with nothing patched: only a little carrier leaks, and the guide says so', (await warns()).some((w) => /modulator-1/.test(w)), (await warns()).join(' | '));
await attach('c1:b', 'bm1.in');

// ---- a real mouse click flips a data switch
await view('top');
const p = await page.evaluate(() => window.__pce3d.project(window.__pce3d.fskPanel(104, 92.4, 18)));
await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250);
await page.mouse.click(p.x, p.y); await sleep(400);
ok('clicking switch S1 flips bit D1', (await st((s) => s.getState().knobs.s1)) === 1);
await shot('panel');
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll FSK checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
