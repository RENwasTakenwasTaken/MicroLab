// PCE lab, Expt 2 (FM MODEM kit): drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core. Usage: node tests/ui-pce-fm.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/fm-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/fm');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'fm', null, { timeout: 60000 });
await sleep(2500);
ok('FM bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
for (const v of ['kit', 'top', 'dmm']) {
  await page.evaluate((view) => window.__pce.store.getState().setView(view), v);
  await sleep(1600);
  await shot(v);
}
// ---- perform the experiment through the bench state
const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const knob = (id, v) => st((s, k, x) => s.getState().setKnob(k, x), id, v);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const acq = () => page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi, pp: hi - lo }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
});
const meter = async () => { await sleep(700); return page.evaluate(() => window.__pce.dmm.volts); };
const near = (v, want, tol) => v !== null && v !== undefined && Math.abs(v - want) <= tol;
const guide = () => page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('banana plugs do not fit the wall socket; they do fit a socket', (await attach('ch1', 'wall')) === false && (await attach('ch1', 'sg.out')) === true);
await attach('ch1g', 'gnd');
await knob('sgFreq', 0.14); await knob('sgAmp', 0.25);
await scope({ sdiv: 250e-6 });
await sleep(500);
let a = await acq();
ok('signal generator: 1 kHz, 1 V pp', !!a && a.triggered && near(a.ch1.pp, 1.0, 0.1) && near(a.f, 1000, 15), JSON.stringify(a?.ch1));
ok('meter with one lead reads nothing', (await attach('dmm:v', 'dc.bias')) && (await meter()) === null);
await attach('dmm:com', 'gnd');
await knob('modFreq', 25 / 60);
await attach('ch1', 'buf.out');
await scope({ sdiv: 10e-6 });
await sleep(500);
a = await acq();
const x = await meter();
ok('carrier 50 kHz, 1.8 V pp, DC bias 8.05 V', !!a && near(a.f, 50e3, 300) && near(a.ch1.pp, 1.8, 0.15) && near(x, 8.05, 0.02), `${a?.f} ${a?.ch1.pp} ${x}`);
await knob('modFreq', 30 / 60); await sleep(400); a = await acq();
ok('bias + 0.5 V gives 55 kHz', near(await meter(), 8.55, 0.02) && near(a.f, 55e3, 300), `${a.f}`);
await knob('modFreq', 20 / 60); await sleep(400); a = await acq();
ok('bias - 0.5 V gives 45 kHz', near(await meter(), 7.55, 0.02) && near(a.f, 45e3, 300), `${a.f}`);
await knob('modFreq', 25 / 60);
await st((s) => s.getState().setDmm({ ac: true })); await sleep(700);
ok('meter on AC volts: no DC reading, and the guide says to press SELECT', (await page.evaluate(() => window.__pce.dmm.volts)) === null && await page.$$eval('.pce-warn', (els) => els.some((e) => /SELECT for DC/.test(e.textContent))));
await st((s) => s.getState().setDmm({ ac: false }));
ok('three plugs stack in GND, a fourth does not', (await attach('ch2g', 'gnd')) === true && (await attach('p3:a', 'gnd')) === false);
await attach('p1:a', 'sg.out'); await attach('p1:b', 'mod.in');
const k = await page.evaluate(() => window.__pce.fm.syncKit());
ok('1 V pp at 1 kHz: deviation 5 kHz, modulation index 5', near(k.deviation, 5000, 20) && near(k.beta, 5, 0.05), JSON.stringify([k.deviation, k.beta]));
await attach('ch2', 'sg.out');
await scope({ sdiv: 250e-6, trig: { source: 1, slope: 'rise', level: 0, mode: 'auto' } });
await page.evaluate(() => window.__pce.store.getState().setView('scope'));
await sleep(1600); await shot('fm-wave');
await st((s) => { const g = s.getState(); g.setScope({ sdiv: 1e-3, menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 0, window: 'hanning', zoom: 5, center: 0.4 } }); });
await sleep(700); await shot('fm-fft');
await st((s) => { const g = s.getState(); g.setScope({ menu: 'none', math: { ...g.scope.math, on: false } }); });
// demodulator
await attach('ch2', 'pll.vco');
await scope({ sdiv: 10e-6 }); await sleep(500); a = await acq();
ok('PLL VCO free-runs where its pot is (38.2 kHz)', near(a.f, 38.2e3, 300), `${a.f}`);
await knob('pllFreq', 25 / 60);
await attach('p2:a', 'buf.out'); await attach('p2:b', 'pll.in'); await attach('p3:a', 'pll.out'); await attach('p3:b', 'flt.in');
await attach('ch2', 'flt.out');
await scope({ sdiv: 250e-6, trig: { source: 1, slope: 'rise', level: 0, mode: 'auto' } });
await sleep(700); a = await acq();
ok('recovered message on FILTER O/P: 1 kHz, about 1 V pp', !!a && a.triggered && near(a.f, 1000, 15) && near(a.ch2.pp, 1.0, 0.15), JSON.stringify(a?.ch2));
await shot('recovered');
const g = await guide();
ok('setup guide: every step done', g.every(Boolean), g.join());
await knob('pllFreq', 0.95); await sleep(600);
ok('PLL far from the carrier: guide warns it is not locked', await page.$$eval('.pce-warn', (els) => els.some((e) => /not locked/.test(e.textContent))));
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- real mouse clicks: carry a patch cord end to a socket (fresh bench)
page.once('dialog', (d) => d.accept());
await page.click('.topbar .btn:has-text("Reset bench")');
await sleep(1800);
const at = (p) => page.evaluate((q) => window.__pce3d.project(q), p);
const rest = await st((s) => s.getState().plugs['p1:a'].rest);
const far = await st((s) => s.getState().plugs['p1:b'].rest);
// a little way along the plug's body, which points at the cord's other end
const len = Math.hypot(far[0] - rest[0], far[2] - rest[2]);
let r = await at([rest[0] + ((far[0] - rest[0]) / len) * 12, rest[1] + 2, rest[2] + ((far[2] - rest[2]) / len) * 12]);
await page.mouse.click(r.x, r.y); await sleep(350);
ok('click picks a patch cord plug up', (await st((s) => s.getState().carrying)) === 'p1:a');
r = await at(await page.evaluate(() => window.__pce3d.fmPanel(85.4, 49, 13)));
await page.mouse.move(r.x, r.y, { steps: 6 }); await sleep(300);
await page.mouse.click(r.x, r.y); await sleep(350);
ok('click on a yellow socket plugs it in', (await st((s) => s.getState().plugs['p1:a'].attachedTo)) === 'sg.out');
await shot('mouse');
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll FM checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
