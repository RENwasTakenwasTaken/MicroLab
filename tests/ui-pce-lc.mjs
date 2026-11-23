// PCE lab, Expt 5 (line-code trainer): drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core. Usage: node tests/ui-pce-lc.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/lc-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/lc');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'lc', null, { timeout: 60000 });
await sleep(2500);
ok('line-code bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
const view = async (v, name) => { await page.evaluate((x) => window.__pce.store.getState().setView(x), v); await sleep(1500); if (name) await shot(name); };
await view('kit', 'kit'); await view('top', 'top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const chans = (v1, p1, v2, p2) => st((s, a) => s.getState().scope.ch.map((c, i) => ({ ...c, vdiv: a[i * 2], pos: a[i * 2 + 1] })), [v1, p1, v2, p2]);
const acq = async () => { await sleep(500); return page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
}); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;
const warns = () => page.$$eval('.wf-warn', (els) => els.map((e) => e.textContent));
const toast = () => page.$eval('.lab-toast', (e) => e.textContent).catch(() => '');

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('mains plug and MAINS ON power the kit', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
await attach('ch1', 'cmp.in1');
ok('a ground clip does not hold on a 2 mm socket', (await attach('ch1g', 'cmp.gnd')) === false && /crocodile/.test(await toast()), await toast());
await attach('ch1', 'gen.bk');
ok('ground clip fits the GND post', (await attach('ch1g', 'gen.gnd')) === true);
await scope({ sdiv: 25e-6, ch: await chans(2, 0, 2, -3) });
await sleep(400);
ok('trigger level at 0 V on a 0 to 5 V clock: the guide says SET TO 50%', (await warns()).some((w) => /SET TO 50%/.test(w)), (await warns()).join(' | '));
await scope({ trig: { source: 0, slope: 'rise', level: 2.5, mode: 'auto' } });
let a = await acq();
ok('bit clock BK: 26.33 kHz, 0 to 5 V', !!a && a.triggered && near(a.f, 26330, 60) && near(a.ch1.lo, 0, 0.85) && near(a.ch1.hi, 5, 0.85), JSON.stringify(a));
await attach('ch1', 'gen.ck');
a = await acq();
ok('clock CK: twice the bit clock', !!a && near(a.f, 52660, 120), String(a?.f));
await attach('ch1', 'gen.nrz');
ok('all switches down: the guide says the data is a flat line', (await warns()).some((w) => /flat line/.test(w)));
const WORD = [1, 0, 1, 1, 0, 0, 1, 0];
for (let i = 0; i < 8; i++) await knob(`s${8 - i}`, WORD[i]);
await scope({ sdiv: 50e-6 });
await view('scope');
a = await acq();
ok('NRZ data: 0 to 5 V, and the guide suggests RUN/STOP', !!a && near(a.ch1.lo, 0, 0.85) && near(a.ch1.hi, 5, 0.85) && (await warns()).some((w) => /RUN\/STOP/.test(w)), JSON.stringify(a?.ch1));
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 't' } }); });
await sleep(300);
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 'off' } }); });

// ---- every code, read from the model at the middle of each half bit and compared with a reference encoder
function ref(code, w, init) {
  const o = []; let mark = init, ph = init, pol = init ? 1 : -1;
  for (let n = 0; n < 16; n++) {
    const b = w[n % 8];
    if (code === 'unrz') o.push(b * 5, b * 5);
    else if (code === 'nrzm') { if (b) mark = !mark; o.push(mark ? 5 : 0, mark ? 5 : 0); }
    else if (code === 'bnrz') o.push(b ? 2.5 : -2.5, b ? 2.5 : -2.5);
    else if (code === 'urz') o.push(b * 5, 0);
    else if (code === 'brz') o.push(b ? 2.5 : -2.5, 0);
    else if (code === 'man') o.push(b ? 5 : 0, b ? 0 : 5);
    else if (code === 'bpm') { ph = !ph; const f = ph; if (b) ph = !ph; o.push(f ? 5 : 0, ph ? 5 : 0); }
    else { if (b) pol = -pol; o.push(b ? pol * 2.5 : 0, b ? pol * 2.5 : 0); }
  }
  return o;
}
const sample = () => page.evaluate((word) => {
  const lc = window.__pce.lc; lc.syncKit();
  const s1 = lc.tipSource(0), s2 = lc.tipSource(1), Tb = 1 / 26330, t = performance.now() / 1000 + 0.01, step = Tb / 50;
  const hi = (x) => s1.v(x) > 2.5;
  let te = null;
  for (let i = 1; i < 1000 && te === null; i++) if (hi(t + i * step) !== hi(t + (i - 1) * step)) {
    let lo = t + (i - 1) * step, up = t + i * step; const was = hi(lo);
    for (let j = 0; j < 30; j++) { const m = (lo + up) / 2; if (hi(m) === was) lo = m; else up = m; }
    te = up;
  }
  const bits = []; for (let k = 0; k < 8; k++) bits.push(hi(te + (k + 0.5) * Tb) ? 1 : 0);
  let r = -1; for (let x = 0; x < 8 && r < 0; x++) if (bits.every((b, k) => b === word[(k + x) % 8])) r = x;
  const start = te + ((8 - r) % 8) * Tb, got = [];
  for (let h = 0; h < 32; h++) got.push(Math.round(s2.v(start + ((h + 0.5) * Tb) / 2) * 2) / 2);
  // strength of the spectral lines at the bit rate and at twice the bit rate, over two words
  const N = 4096, line = (f) => { let re = 0, im = 0; for (let n = 0; n < N; n++) { const x = start + ((n + 0.5) / N) * 16 * Tb, v = s2.v(x); re += v * Math.cos(2 * Math.PI * f * x); im -= v * Math.sin(2 * Math.PI * f * x); } return (2 * Math.hypot(re, im)) / N; };
  return { r, got, f1: line(26330), f2: line(52660), near: line(26330 * 0.875) };
}, WORD);
const LEVELS = { unrz: [0, 5], nrzm: [0, 5], bnrz: [-2.5, 2.5], urz: [0, 5], brz: [-2.5, 2.5], man: [0, 5], bpm: [0, 5], ami: [-2.5, 2.5] };
const spec = {};
await scope({ ch: await chans(5, 1, 5, -2), trig: { source: 0, slope: 'rise', level: 2.5, mode: 'auto' } });
for (const code of Object.keys(LEVELS)) {
  await attach('ch2', `lc.${code}`);
  const s = await sample();
  spec[code] = s;
  const same = (init) => ref(code, WORD, init).every((v, i) => v === s.got[i]);
  a = await acq();
  const [lo, hi] = LEVELS[code];
  ok(`${code}: the word 10110010 coded correctly, levels ${lo} to ${hi} V`, s.r >= 0 && (same(false) || same(true)) && !!a && near(a.ch2.lo, lo, 0.85) && near(a.ch2.hi, hi, 0.85), `${s.got.slice(0, 16).join(' ')} · ${JSON.stringify(a?.ch2)}`);
  if (code === 'man' || code === 'ami' || code === 'brz') { await scope({ run: false }); await sleep(300); await shot(code); await scope({ run: true }); }
}
const n2 = (x) => x.toFixed(2);
ok('spectrum: NRZ has its null at fb; RZ and Manchester have theirs at 2 fb', spec.unrz.f1 < 0.08 && spec.bnrz.f1 < 0.08 && spec.ami.f1 < 0.08 && spec.urz.f2 < 0.08 && spec.man.f2 < 0.08 && spec.urz.f1 > 0.5 && spec.unrz.near > 0.05,
  `unrz ${n2(spec.unrz.f1)} · urz fb ${n2(spec.urz.f1)} 2fb ${n2(spec.urz.f2)} · man 2fb ${n2(spec.man.f2)}`);
await attach('ch2', 'lc.unrz');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 500e-6, menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 1, window: 'hanning', zoom: 1, center: 0.5 } }); });
await sleep(900); await shot('fft');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 50e-6, menu: 'none', math: { ...g.scope.math, on: false } }); });
const g = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
ok('setup guide: every step done', g.every(Boolean), g.join());

// ---- a real mouse click flips a data switch and its LED
await view('top');
const p = await page.evaluate(() => window.__pce3d.project(window.__pce3d.lcPanel(102, 122, 18)));
await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250);
await page.mouse.click(p.x, p.y); await sleep(400);
ok('clicking switch S1 sets bit D1', (await st((s) => s.getState().knobs.s1)) === 1);
await shot('word');
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll line-code checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
