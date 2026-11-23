// PCE lab, Expt 8 (DSSS trainer): drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core. Usage: node tests/ui-pce-dsss.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/dsss-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/dsss');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'dsss', null, { timeout: 60000 });
await sleep(2500);
ok('DSSS bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
const view = async (v, name) => { await page.evaluate((x) => window.__pce.store.getState().setView(x), v); await sleep(1500); if (name) await shot(name); };
await view('kit', 'kit'); await view('top', 'top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const unplug = (plug) => st((s, p) => { s.getState().pick(p); s.getState().drop([0, 760, 300]); }, plug);
const patch = async (cord, a, b) => (await attach(`${cord}:a`, a)) && (await attach(`${cord}:b`, b));
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const chans = (v1, p1, v2, p2) => st((s, a) => s.getState().scope.ch.map((c, i) => ({ ...c, vdiv: a[i * 2], pos: a[i * 2 + 1] })), [v1, p1, v2, p2]);
const trig = (source, level) => scope({ trig: { source, slope: 'rise', level, mode: 'auto' } });
const acq = async () => { await sleep(600); return page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
}); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;
const warns = () => page.$$eval('.wf-warn', (els) => els.map((e) => e.textContent));
const F0 = 976.2e3, FC = F0 / 10, FB = FC / 15, FRF = F0 / 2;
const PN = [1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0];

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('mains plug and MAINS ON power the kit', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
await attach('ch1', 'clk.cc');
ok('ground clip reaches the GND pin below PN Signal', (await attach('ch1g', 'pn.gnd')) === true);
await scope({ sdiv: 1e-6, ch: await chans(2, 0, 2, -3) }); await trig(0, 2.3);
let a = await acq();
ok('carrier clock CC: about 976 kHz (nominally 1 MHz), 0 to 4.6 V', !!a && a.triggered && near(a.f, F0, 2e3) && near(a.ch1.hi, 4.6, 0.6), JSON.stringify(a));
await attach('ch1', 'clk.pnck'); await scope({ sdiv: 5e-6 });
a = await acq();
ok('PN clock: 97.62 kHz', !!a && near(a.f, 97.62e3, 200), String(a?.f));
await attach('ch1', 'clk.bk'); await scope({ sdiv: 50e-6 });
a = await acq();
ok('bit clock BK: 6.51 kHz, exactly PNCK / 15', !!a && near(a.f, 6508, 15), String(a?.f));
await attach('ch1', 'rf.out'); await attach('ch1g', 'rf.gnd'); await scope({ sdiv: 1e-6 }); await trig(0, 0);
a = await acq();
ok('RF carrier: 488 kHz (5 x PN clock), 3.76 V peak-to-peak', !!a && near(a.f, FRF, 1e3) && near(a.ch1.hi - a.ch1.lo, 3.76, 0.25), JSON.stringify(a));

// ---- PN code: nothing until PRBS
const WORD = [1, 0, 1, 1, 0, 0, 0, 1];
for (let i = 0; i < 8; i++) await knob(`s${8 - i}`, WORD[i]);
await attach('ch1', 'pn.out'); await attach('ch1g', 'pn.gnd'); await scope({ sdiv: 25e-6 }); await trig(0, 2.4);
a = await acq();
ok('PN register empty at power-up: PN Signal flat, and the guide says press PRBS', !!a && a.ch1.hi - a.ch1.lo < 0.3 && (await warns()).some((w) => /PRBS/.test(w)), JSON.stringify(a?.ch1));
await view('top');
const pp = await page.evaluate(() => window.__pce3d.project(window.__pce3d.dsssPanel(116.3, 126.3, 20)));
await page.mouse.move(pp.x, pp.y, { steps: 4 }); await sleep(250);
await page.mouse.click(pp.x, pp.y); await sleep(500);
ok('clicking PRBS starts the PN register', (await st((s) => s.getState().knobs.pn)) === 1);
/** Values of nodes at a chosen point in each chip over two words, from the start of a word. */
const chips = (nodes, at = 0.5, count = 240) => page.evaluate(([nodes, at, count]) => {
  const d = window.__pce.dsss; d.syncKit();
  const t0 = performance.now() / 1000 + 0.01, c0 = Math.ceil(d.chipsNow(t0) / 120) * 120;
  return nodes.map((n) => Array.from({ length: count }, (_, k) => d.probe(n, d.chipTime(t0, c0 + k + at))));
}, [nodes, at, count]);
let [pn] = await chips(['PN'], 0.5, 30);
ok('PN code: 1 0 1 0 0 1 1 0 1 1 1 0 0 0 0, repeating every bit', pn.every((v, k) => (v > 2.4) === !!PN[k % 15]), pn.map((v) => +(v > 2.4)).join(''));
await view('scope');
a = await acq();
ok('PN Signal: 0 to 4.8 V', !!a && near(a.ch1.hi, 4.8, 0.5) && near(a.ch1.lo, 0, 0.5), JSON.stringify(a?.ch1));
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 't' } }); });
await sleep(300);
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 'off' } }); });
await attach('ch1', 'gen.nrz'); await attach('ch1g', 'gen.gnd');
a = await acq();
ok('NRZ data 0 to 4.4 V', !!a && near(a.ch1.hi, 4.4, 0.5), JSON.stringify(a?.ch1));

// ---- transmitter
await unplug('ch1');
ok('cords: PN Signal to PN Code, NRZ DATA to NRZ Data', (await patch('c1', 'pn.out', 'mix.pn')) && (await patch('c2', 'gen.nrz', 'mix.nrz')));
ok('the CH1 probe goes back on NRZ DATA, into the back of the cord plug', await attach('ch1', 'gen.nrz'));
let [nrz, sp] = await chips(['NRZ', 'SP']);
const pnAt = (k) => PN[k % 15];
ok('spreading code = XNOR(data, PN) on every chip', sp.every((v, k) => (v > 2.5) === ((nrz[k] > 2.2) === !!pnAt(k))), sp.slice(0, 30).map((v) => +(v > 2.5)).join(''));
ok('cords: spreading code to the converter, Bipolar Sp Code to the modulator, RF CARRIER to the modulator',
  (await patch('c3', 'mix.out', 'bip.in')) && (await patch('c4', 'bip.out', 'mod.sp')) && (await patch('c5', 'rf.out', 'mod.rf')));
const phase = await page.evaluate(() => {
  const d = window.__pce.dsss; d.syncKit();
  const t0 = performance.now() / 1000 + 0.01, c0 = Math.ceil(d.chipsNow(t0) / 120) * 120, res = [];
  for (let k = 0; k < 120; k++) {
    let s = 0, pk = 0;
    for (let j = 0; j < 50; j++) { const t = d.chipTime(t0, c0 + k + (j + 0.5) / 50), v = d.probe('DSSS', t); s += v * d.probe('RF', t); pk = Math.max(pk, Math.abs(v)); }
    res.push({ sp: d.probe('SP', d.chipTime(t0, c0 + k + 0.5)) > 2.5, s, pk });
  }
  return res;
});
ok('DSSS: carrier phase flips with the spreading code (in anti-phase for SP = 1)', phase.every((x) => (x.s < 0) === x.sp), phase.slice(0, 15).map((x) => (x.s < 0 ? '-' : '+')).join(''));
ok('DSSS: about 8.4 V peak-to-peak', phase.every((x) => x.pk > 3.6 && x.pk < 4.4), phase.slice(0, 6).map((x) => x.pk.toFixed(2)).join(' '));
const spec = await page.evaluate(([FRF, FC]) => {
  const d = window.__pce.dsss; d.syncKit();
  const t0 = performance.now() / 1000 + 0.01, N = 24000, dt = 0.25e-6, xs = new Float64Array(N);
  for (let n = 0; n < N; n++) xs[n] = d.probe('DSSS', t0 + n * dt);
  const at = (f) => { let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N), ph = 2 * Math.PI * f * n * dt; re += w * xs[n] * Math.cos(ph); im -= w * xs[n] * Math.sin(ph); } return (4 * Math.hypot(re, im)) / N; };
  const band = (f, w) => { let m = 0; for (let x = f - w; x <= f + w; x += 125) m = Math.max(m, at(x)); return m; };
  return { main: band(FRF + 20e3, 3000), lo: band(FRF - FC, 600), hi: band(FRF + FC, 600), side: band(FRF + 1.5 * FC, 3000) };
}, [FRF, FC]);
ok('DSSS spectrum: main lobe at 488 kHz, nulls at 488 ± 97.6 kHz, side lobes beyond', spec.main > 6 * spec.lo && spec.main > 6 * spec.hi && spec.side > 2 * spec.hi, JSON.stringify(Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, +v.toFixed(3)]))));
await attach('ch2', 'mod.out'); await attach('ch2g', 'mod.gnd');
await scope({ sdiv: 25e-6, ch: await chans(5, 2, 5, -2) }); await trig(0, 2.2);
await sleep(400);
await scope({ run: false }); await sleep(300); await shot('dsss'); await scope({ run: true });
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 100e-6, menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 1, window: 'hanning', zoom: 1, center: 0.5 } }); });
await sleep(1200); await shot('dsss-fft');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 25e-6, menu: 'none', math: { ...g.scope.math, on: false } }); });

// ---- receiver
await attach('ch2', 'mod.gnd').catch(() => {}); await unplug('ch2');
ok('cord: DSSS O/P to DSSS I/P', await patch('c6', 'mod.out', 'det.in'));
await attach('ch2', 'det.outp');
let [det] = await chips(['DET'], 0.95, 120);
[sp] = await chips(['SP'], 0.5, 120);
ok('Noisy SP Code: about -1 V for SP = 1 and +1 V for SP = 0 at the end of each chip', det.every((v, k) => (sp[k] > 2.5 ? v < -0.6 : v > 0.6)), det.slice(0, 8).map((v) => v.toFixed(2)).join(' '));
ok('cord: Noisy SP Code to SP Code I/P', await patch('c7', 'det.out', 'lpf.in'));
let [fil, spo] = await chips(['FIL', 'SPO'], 0.95, 120);
ok('Fil. O/P about ±2.4 V; SP Code O/P is the spreading code again, 0 / 4.96 V', fil.every((v) => Math.abs(v) > 1.8 && Math.abs(v) < 3) && spo.every((v, k) => (v > 2.5) === (sp[k] > 2.5)), `${fil.slice(0, 4).map((v) => v.toFixed(2)).join(' ')} · ${spo.slice(0, 15).map((v) => +(v > 2.5)).join('')}`);
await attach('ch2', 'lpf.fil'); await attach('ch2g', 'lpf.gnd');
await sleep(300); await scope({ run: false }); await sleep(300); await shot('filter'); await scope({ run: true });
ok('cord: SP Code O/P to the despreading SP Code', await patch('c8', 'lpf.out', 'desp.sp'));
ok('second plug stacks on PN Signal: PN to the despreading section', await patch('c9', 'pn.out', 'desp.pn'));
ok('a third plug will not stack on PN Signal', (await attach('c10:a', 'pn.out')) === false);
const rec = await page.evaluate(() => {
  const d = window.__pce.dsss; d.syncKit();
  const t0 = performance.now() / 1000 + 0.01, c0 = Math.ceil(d.chipsNow(t0) / 120) * 120;
  let bad = 0, n = 0;
  for (let b = 0; b < 16; b++) {
    const want = d.probe('NRZ', d.chipTime(t0, c0 + b * 15 + 7.5)) > 2.2;
    for (let k = 1.2; k < 15; k += 0.37) { n++; if ((d.probe('REC', d.chipTime(t0, c0 + b * 15 + k)) > 2.2) !== want) bad++; }
  }
  return { bad, n };
});
ok('received data equals the sent data (a fraction of a chip late)', rec.bad === 0, JSON.stringify(rec));
await attach('ch2', 'desp.out'); await attach('ch2g', 'desp.gnd2');
a = await acq();
ok('Recvd. Data on the scope: 0 to 4.4 V', !!a && near(a.ch2.hi, 4.4, 0.5) && near(a.ch2.lo, 0, 0.5), JSON.stringify(a?.ch2));
await scope({ run: false }); await sleep(300); await shot('received'); await scope({ run: true });
// the guide's spreading-code step wants SP with NRZ, and the DSSS step SP or NRZ with DSSS
await attach('ch2', 'mix.out'); await sleep(400);
await attach('ch2', 'det.outp'); await sleep(300); await attach('ch2', 'lpf.out'); await sleep(300);
await attach('ch2', 'mod.out'); await sleep(300);
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 100e-6, math: { ...g.scope.math, on: true, op: 'fft', source: 1 } }); });
await sleep(600);
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 25e-6, math: { ...g.scope.math, on: false } }); });
await attach('ch2', 'desp.out'); await sleep(500);
const g = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
ok('setup guide: every step done', g.every(Boolean), g.join());

// ---- mistakes the guide should explain
await unplug('c4:b');
await patch('c10', 'mix.outs', 'mod.sp');
await attach('ch2', 'mod.out'); await sleep(400);
ok('unipolar code straight into the modulator: the guide says it is ASK, not BPSK', (await warns()).some((w) => /ASK/.test(w)), (await warns()).join(' | '));
await unplug('c10:b'); await attach('c4:b', 'mod.sp');
await view('top');
const pr = await page.evaluate(() => window.__pce3d.project(window.__pce3d.dsssPanel(130, 153.8, 20)));
await page.mouse.move(pr.x, pr.y, { steps: 4 }); await sleep(250);
await page.mouse.click(pr.x, pr.y); await sleep(500);
ok('clicking Reset clears the PN register, and the guide asks for PRBS again', (await st((s) => s.getState().knobs.pn)) === 0 && (await warns()).some((w) => /PRBS/.test(w)));
await knob('pn', 1);
await st((s) => s.getState().setPowerSw(false)); await sleep(700);
await page.evaluate(() => window.__pce.dsss.syncKit()); await sleep(200);
ok('switching the kit off empties the PN register', (await st((s) => s.getState().knobs.pn)) === 0);
await st((s) => s.getState().setPowerSw(true));
const q = await page.evaluate(() => window.__pce3d.project(window.__pce3d.dsssPanel(114.6, 153.9, 18)));
await page.mouse.move(q.x, q.y, { steps: 4 }); await sleep(250);
await page.mouse.click(q.x, q.y); await sleep(400);
ok('clicking switch S1 flips bit D1', (await st((s) => s.getState().knobs.s1)) === 0);
await shot('panel');
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll DSSS checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
