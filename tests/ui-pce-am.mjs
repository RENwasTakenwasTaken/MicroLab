// PCE lab, Expt 1 (AM kit): drives the running dev server (npm run dev) with the system Edge/Chrome
// via playwright-core. Usage: node tests/ui-pce-am.mjs [outDir] [shots]
// "shots" also saves screenshots of every view (slow with software rendering).
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/pce-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

// ---- landing page and the two labs
await page.goto('http://localhost:5173/#/');
await page.waitForSelector('.lab-card');
const labs = await page.$$eval('.lab-card', (els) => els.map((e) => e.getAttribute('href')));
ok('landing page offers the EP lab and the PCE lab', labs.join() === '#/ep,#/pce', labs.join());
await shot('landing');
await page.click('.lab-card[href="#/pce"]');
await page.waitForFunction(() => location.hash === '#/pce' && document.querySelectorAll('.exp-card:not(.lab-card)').length > 0);
const cards = await page.$$eval('.exp-card', (els) => els.map((e) => [e.getAttribute('href'), e.classList.contains('planned')]));
ok('PCE lab lists 8 experiments; Expts 1, 2, 3 and 5 are ready', cards.length === 8 && ['am', 'fm', 'pam', null, 'lc', null, null, null].every((id, i) => (id ? cards[i][0] === '#/pce/exp/' + id && !cards[i][1] : cards[i][1])), JSON.stringify(cards.slice(0, 5)));
await shot('home');
await page.goto('http://localhost:5173/#/ep');
await page.waitForSelector('.whats-new');
ok('EP lab page keeps its experiments under #/ep', (await page.$$eval('.exp-card', (els) => els.map((e) => e.getAttribute('href')))).includes('#/ep/exp/exp2'));

// ---- the AM experiment
await page.goto('http://localhost:5173/#/pce/exp/am');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope, null, { timeout: 60000 });
await sleep(2500);
ok('3D bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
await page.click('.pane-handle.left');
await page.waitForSelector('.pce-sheet table.obs input');
await page.fill('.pce-sheet table.obs tbody tr:nth-child(1) td:nth-child(2) input', '1.2');
await page.fill('.pce-sheet table.obs tbody tr:nth-child(1) td:nth-child(3) input', '2');
const m1 = await page.$eval('.pce-sheet table.res tbody tr:nth-child(1) td:nth-child(2)', (e) => e.textContent);
ok('lab sheet works out m = Em / Ec from the readings', m1 === '0.60', m1);
await shot('sheet');
await page.click('.pane-handle.left');
for (const v of ['kit', 'top', 'scope']) {
  await page.evaluate((view) => window.__pce.store.getState().setView(view), v);
  await sleep(1600);
  await shot(v);
}
// ---- perform the experiment through the bench state (plugs, knobs, scope front panel)
const st = (fn, ...a) => page.evaluate(([f, args]) => { const s = window.__pce.store; return new Function('s', 'a', `return (${f})(s, ...a)`)(s, args); }, [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const scope = (patch) => st((s, p) => s.getState().setScope(p), patch);
const acq = () => page.evaluate(() => {
  const a = window.__pceScope.acq;
  const stat = (v) => { if (!v) return null; let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return { lo, hi, pp: hi - lo }; };
  return a ? { ch1: stat(a.ch[0]), ch2: stat(a.ch[1]), triggered: a.triggered, f: a.trigFreq } : null;
});
const near = (v, want, tol) => Math.abs(v - want) <= tol;

ok('mains plug fits the wall socket only', (await attach('mains', 'ag.gnd')) === false && (await attach('mains', 'wall')) === true);
await st((s) => s.getState().setPowerSw(true));
ok('probe ground lead does not reach across the panel', (await attach('ch1', 'ag.out1')) === true && (await attach('ch1g', 'dd.gnd')) === false);
await sleep(400);
let a = await acq();
ok('probe without a ground clip shows hum, not the signal', !!a?.ch1 && a.ch1.pp < 0.6, JSON.stringify(a?.ch1));
await attach('ch1g', 'ag.gnd');
// 1 kHz, 1.2 V pp audio; 455 kHz, 2 V pp carrier (dial positions worked back from the kit's calibration)
await st((s) => { const g = s.getState(); g.setKnob('agFreq', 0.2164); g.setKnob('agAmp', 0.25); g.setKnob('rfFreq', 0.1009); g.setKnob('rfAmp', 0.2122); });
await scope({ sdiv: 250e-6 });
await sleep(500);
a = await acq();
ok('CH1 on SINE O/P: 1 kHz sine, 1.2 V pp, triggered', !!a && a.triggered && near(a.ch1.pp, 1.2, 0.1) && near(a.f, 1000, 15), JSON.stringify(a));
await attach('ch1', 'rf.out');
ok('the ground clip comes off when the probe moves out of its reach', (await st((s) => s.getState().plugs.ch1g.attachedTo)) === null);
await attach('ch1g', 'rf.gnd');
await scope({ sdiv: 1e-6 });
await sleep(500);
a = await acq();
ok('CH1 on RF O/P: 455 kHz carrier, 2 V pp', !!a && near(a.ch1.pp, 2.0, 0.2) && near(a.f, 455e3, 4e3), JSON.stringify(a));
await attach('ch1', 'ag.out1');
await attach('ch1g', 'ag.gnd');
const far = [await attach('c1:a', 'bm.link'), await attach('c1:b', 'ag.out2'), await attach('c1:b', 'bm.m1v')];
ok('short link joins RF LINK to -1 V but does not reach SINE O/P', far.join() === 'true,false,true', far.join());
const one = [await attach('c2:a', 'ag.out1'), await attach('c2:a', 'ag.out2'), await attach('c2:b', 'bm.modin')];
ok('a pin takes one sleeve or tip', one.join() === 'false,true,true', one.join());
await attach('ch2', 'bm.out1');
await scope({ sdiv: 250e-6, trig: { source: 0, slope: 'rise', level: 0, mode: 'auto' } });
await sleep(600);
a = await acq();
// m = 0.6: envelope from 2 V pp x 1.6 = 3.2 V pp down to 0.8 V pp, so CH2 swings +-1.6 V
ok('AM wave for m = 0.6: peak-to-peak 3.2 V', !!a && near(a.ch2.pp, 3.2, 0.25), JSON.stringify(a?.ch2));
const guide = () => page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
let g = await guide();
ok('setup guide ticks power, probes, settings, link and cord', g.slice(0, 7).every(Boolean) && !g[7] && !g[8], g.join());
await page.evaluate(() => window.__pce.store.getState().setView('scope'));
await sleep(1500);
await shot('am-m06');
await scope({ xy: true }); await sleep(500); await shot('xy-m06');
await scope({ xy: false });
await st((s) => s.getState().setKnob('agAmp', 0.625));   // 3 V pp: m = 1.5
await sleep(500); await shot('am-m15');
a = await acq();
ok('over-modulation m = 1.5: peak-to-peak 5 V', !!a && near(a.ch2.pp, 5.0, 0.4), JSON.stringify(a?.ch2));
await scope({ xy: true }); await sleep(500); await shot('xy-m15'); await scope({ xy: false });
await st((s) => { const g = s.getState(); g.setKnob('agAmp', 0.4167); g.setKnob('agFreq', 0.92); g.setScope({ menu: 'math', math: { ...g.scope.math, on: true, op: 'fft', source: 1, window: 'flattop' } }); });
await sleep(600); await shot('fft-x1');
g = await guide();
ok('setup guide complete after XY and FFT', g.every(Boolean), g.join());
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- the same things with real mouse clicks on the 3D bench (fresh bench)
await page.evaluate(() => { window.__pce.store.getState().setView('lab'); });
page.once('dialog', (d) => d.accept());
await page.click('.topbar .btn:has-text("Reset bench")');
await sleep(1800);
const at = (p) => page.evaluate((q) => window.__pce3d.project(q), p);
const click = async (p, opts) => { const r = await at(p); await page.mouse.click(r.x, r.y, opts); await sleep(350); };
const get = (path) => page.evaluate((k) => k.split('.').reduce((o, key) => o?.[key], window.__pce.store.getState()), path);
await click([-465, 6, -291]);
ok('click picks the mains plug up', (await get('carrying')) === 'mains');
const sock = await at([-526, 228, -510]);
await page.mouse.move(sock.x, sock.y, { steps: 6 });
await sleep(300);
await page.mouse.click(sock.x, sock.y);
await sleep(300);
ok('click on the wall socket plugs it in', (await get('plugs.mains.attachedTo')) === 'wall');
await page.evaluate(() => window.__pce.store.getState().setView('kit'));
await sleep(1500);
await click(await page.evaluate(() => window.__pce3d.panel(31.6, 215.2, 21)));
ok('click on the mains toggle powers the kit', (await get('powerSw')) === true && (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
const before = await get('knobs.agFreq');
const knob = await at(await page.evaluate(() => window.__pce3d.panel(107.4, 162.3, 24)));
await page.mouse.move(knob.x, knob.y, { steps: 3 });
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await sleep(60); }
const after = await get('knobs.agFreq');
ok('scrolling over a pot turns it in fine steps', Math.abs(after - before - 0.01) < 0.004, `${before} -> ${after}`);
await page.evaluate(() => window.__pce.store.getState().setView('scope'));
await sleep(1500);
await click(await page.evaluate(() => window.__pce3d.scope(46, 49, 4)));
ok('CURSOR button opens the cursor menu', (await get('scope.menu')) === 'cursor');
await click(await page.evaluate(() => window.__pce3d.scope(-8, 40.6, 4)));
ok('option button 1 switches the voltage cursors on', (await get('scope.cursor.type')) === 'v');
const c0 = await get('scope.cursor.a');
await click(await page.evaluate(() => window.__pce3d.scope(28, 26, 8)));
ok('CH1 POSITION knob moves cursor 1 while the cursor menu is up', Math.abs((await get('scope.cursor.a')) - c0 - 0.04) < 1e-6);
await click(await page.evaluate(() => window.__pce3d.scope(66, 49, 4)));
await click(await page.evaluate(() => window.__pce3d.scope(-8, 7.6, 4)));
ok('DISPLAY, then option button 3, switches to XY', (await get('scope.xy')) === true);
await shot('mouse');
ok('no page errors with the mouse', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll PCE checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
