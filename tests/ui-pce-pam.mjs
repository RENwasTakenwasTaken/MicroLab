// PCE lab, Expt 3 (sampling and reconstruction board): drives the running dev server (npm run dev)
// with the system Edge/Chrome via playwright-core. Usage: node tests/ui-pce-pam.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/pam-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/pam');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'pam', null, { timeout: 60000 });
await sleep(2500);
ok('sampling bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
await page.evaluate(() => window.__pce.store.getState().setView('top'));
await sleep(1600); await shot('top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const acq = async () => { await sleep(500); return page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi, pp: hi - lo }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
}); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;

await attach('mains', 'wall');
ok('the adapter plug alone powers the board (no switch)', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
await knob('p1', 0.4); await knob('p2', 1700 / 3100); await knob('p3', 14 / 30); await knob('p4', 0.5);
await attach('ch1', 'msg.out'); await attach('ch1g', 'ag.gnd');
await scope({ sdiv: 250e-6 });
let a = await acq();
ok('message: 2 kHz sine, 2 V pp', !!a && a.triggered && near(a.ch1.pp, 2.0, 0.15) && near(a.f, 2000, 20), JSON.stringify(a?.ch1));
await attach('ch1', 'gate.out');
await scope({ sdiv: 25e-6, ch: await st((s) => s.getState().scope.ch.map((c, i) => (i ? c : { ...c, vdiv: 2, pos: 0 }))), trig: { source: 0, slope: 'rise', level: 2.5, mode: 'auto' } });
a = await acq();
ok('gating pulses: 16 kHz, 0 to 5 V', !!a && near(a.f, 16000, 150) && near(a.ch1.lo, 0, 0.2) && near(a.ch1.hi, 5, 0.2), JSON.stringify(a?.ch1) + ' ' + a?.f);
await attach('ch1', 'msg.out');
await attach('p1:a', 'msg.out'); await attach('p1:b', 'mod.msg'); await attach('p2:a', 'gate.out'); await attach('p2:b', 'mod.gate');
await attach('ch2g', 'mod.gnd');
await scope({ sdiv: 100e-6, ch: await st((s) => s.getState().scope.ch.map((c, i) => ({ ...c, vdiv: 1, pos: i ? -2 : 2 }))), trig: { source: 0, slope: 'rise', level: 0, mode: 'auto' } });
await page.evaluate(() => window.__pce.store.getState().setView('scope'));
for (const [sock, name] of [['mod.nat', 'natural'], ['mod.sh', 'hold'], ['mod.flat', 'flat']]) {
  await attach('ch2', sock);
  await sleep(1300);
  a = await acq();
  ok(`${name} sampled output follows the message (2 V pp)`, !!a && near(a.ch2.pp, 2.0, 0.25), JSON.stringify(a?.ch2));
  await shot(name);
}
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 2.5e-3, menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 1, window: 'hanning', zoom: 1, center: 0.5 } }); });
await sleep(800); await shot('fft');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 100e-6, menu: 'none', math: { ...g.scope.math, on: false } }); });
await attach('p3:a', 'mod.nat'); await attach('p3:b', 'dem.in'); await attach('ch2', 'dem.out');
a = await acq();
ok('recovered message: 2 kHz, about 2 V pp at 50 % duty', !!a && near(a.ch2.pp, 2.0, 0.25), JSON.stringify(a?.ch2));
await shot('recovered');
await knob('p3', 1 / 30); await sleep(600);
const k = await page.evaluate(() => window.__pce.pam.syncKit());
a = await acq();
ok('sampling at 3 kHz for a 2 kHz message: aliasing, the output is no longer the message', k.aliasing && !!a && Math.abs(a.ch2.pp - 2.0) > 0.4, JSON.stringify(a?.ch2));
await shot('alias');
const g = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
ok('setup guide: every step done', g.every(Boolean), g.join());
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll sampling checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
