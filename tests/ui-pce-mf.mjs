// PCE lab, Expt 6 (matched-filter trainer): drives the running dev server (npm run dev) with the
// system Edge/Chrome via playwright-core. Usage: node tests/ui-pce-mf.mjs [outDir] [shots]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${out}/mf-${name}.png` }); };
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5173/#/pce/exp/mf');
await page.waitForSelector('.pce-lab canvas', { timeout: 60000 });
await page.waitForFunction(() => !!window.__pce && !!window.__pceScope && window.__pce.store.getState().kit === 'mf', null, { timeout: 60000 });
await sleep(2500);
ok('matched-filter bench loads without page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await shot('lab');
const view = async (v, name) => { await page.evaluate((x) => window.__pce.store.getState().setView(x), v); await sleep(1500); if (name) await shot(name); };
await view('kit', 'kit'); await view('top', 'top');

const st = (fn, ...a) => page.evaluate(([f, args]) => new Function('s', 'a', `return (${f})(s, ...a)`)(window.__pce.store, args), [fn.toString(), a]);
const attach = (plug, socket) => st((s, p, k) => { s.getState().pick(p); return s.getState().attach(p, k); }, plug, socket);
const unplug = (plug) => st((s, p) => { s.getState().pick(p); s.getState().drop([0, 760, 300]); }, plug);
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
const FB = 26330;

await attach('mains', 'wall');
await st((s) => s.getState().setPowerSw(true));
ok('mains plug and MAINS ON power the kit', (await page.$eval('.tb-status .tag', (e) => e.textContent)) === 'kit powered');
await attach('ch1', 'gen.ck');
ok('a ground clip does not hold on the black GND socket', (await attach('ch1g', 'mf.gnds')) === false && /crocodile/.test(await toast()), await toast());
ok('ground clip fits the GND pin below NRZ', (await attach('ch1g', 'gen.gnd')) === true);
await scope({ sdiv: 25e-6, ch: await chans(2, 0, 2, -3), trig: { source: 0, slope: 'rise', level: 2.5, mode: 'auto' } });
let a = await acq();
ok('CK: twice the bit rate, 0 to 5 V', !!a && a.triggered && near(a.f, 2 * FB, 120) && near(a.ch1.lo, 0, 0.85) && near(a.ch1.hi, 5, 0.85), JSON.stringify(a));
await attach('ch1', 'gen.bk');
a = await acq();
ok('BK: the bit rate', !!a && near(a.f, FB, 60), String(a?.f));
const WORD = [1, 0, 1, 1, 0, 0, 1, 0];
for (let i = 0; i < 8; i++) await knob(`s${8 - i}`, WORD[i]);
await attach('ch1', 'gen.nrz');
await scope({ sdiv: 50e-6 });
a = await acq();
ok('NRZ data 0 to 5 V', !!a && near(a.ch1.lo, 0, 0.85) && near(a.ch1.hi, 5, 0.85), JSON.stringify(a?.ch1));
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 't' } }); });
await sleep(300);
await st((s) => { const g = s.getState(); g.setScope({ cursor: { ...g.scope.cursor, type: 'off' } }); });

// ---- Gaussian noise
await attach('ch1', 'gn.out');
await knob('amp', 1);
await scope({ ch: await chans(2, 0, 2, -3) });
await sleep(300);
a = await acq();
ok('noise at full AMPLITUDE: about ±5 V, nothing to trigger on', !!a && !a.triggered && a.ch1.hi > 3.5 && a.ch1.lo < -3.5, JSON.stringify(a));
ok('the guide explains that noise runs free', (await warns()).some((w) => /runs free/.test(w)), (await warns()).join(' | '));
await view('scope', 'noise');
await knob('amp', 0);
a = await acq();
ok('noise at minimum: a flat line', !!a && a.ch1.hi - a.ch1.lo < 0.25, JSON.stringify(a?.ch1));

// ---- noise adder
ok('short cord: Gaussian Noise socket to the adder noise input', (await attach('c2:a', 'gn.outs')) && (await attach('c2:b', 'add.gn')));
ok('short cord will not reach across the panel', (await attach('c2:b', 'mf.in')) === false && /short/.test(await toast()), await toast());
await attach('c2:b', 'add.gn');
ok('long cord: NRZ socket to adder I/P', (await attach('c1:a', 'gen.nrzs')) && (await attach('c1:b', 'add.in')));
await attach('ch1', 'add.out'); await attach('ch1g', 'add.gnd');
await attach('ch2', 'gen.nrz'); await attach('ch2g', 'gen.gnd');
await scope({ ch: await chans(2, 2, 2, -2), trig: { source: 1, slope: 'rise', level: 2.5, mode: 'auto' } });
a = await acq();
ok('noisy signal at low noise: the data inverted (0 to -5 V)', !!a && near(a.ch1.lo, -5, 0.85) && near(a.ch1.hi, 0, 0.85) && a.triggered, JSON.stringify(a));
await knob('amp', 0.8);
a = await acq();
ok('noisy signal at high noise: spread well beyond the data levels', !!a && a.ch1.hi > 2 && a.ch1.lo < -7, JSON.stringify(a?.ch1));
await scope({ run: false }); await sleep(300); await shot('noisy'); await scope({ run: true });
await knob('amp', 0);

// ---- integrate and dump
ok('Noisy signal socket to Noise Data, BK to the filter BK', (await attach('c3:a', 'add.outs')) && (await attach('c3:b', 'mf.in')) && (await attach('c4:a', 'gen.bk')) && (await attach('c4:b', 'mf.bk')));
await attach('ch1', 'mf.raw'); await attach('ch1g', 'mf.gnd');
await scope({ ch: await chans(2, 0, 2, -3) });
a = await acq();
ok('raw data: ramps reaching about ±3.6 V', !!a && near(a.ch1.hi, 3.6, 0.5) && near(a.ch1.lo, -3.6, 0.5), JSON.stringify(a?.ch1));
await scope({ run: false }); await sleep(300); await shot('raw'); await scope({ run: true });

/** Bits over many words: the data sent (NRZ at mid-bit), the integrator's sign at the end of each bit, and the comparator's output at 3/4 of each bit. */
const decide = (n) => page.evaluate(([n, FB]) => {
  const mf = window.__pce.mf; mf.syncKit();
  let t = performance.now() / 1000, sent = 0, endErr = 0, lateErr = 0, chatter = 0;
  for (let k = 0; k < n; k += 16) {
    const ends = mf.endOfBits(t);
    // locate the next bit edge from the bit clock
    let te = t; const bk = (x) => mf.probe('BK', x) > 2.5;
    for (let i = 1; i < 400; i++) { const x = t + (i / 400) * (2 / FB); if (bk(x) && !bk(x - 2 / (400 * FB))) { te = x; break; } }
    for (let b = 0; b < 16; b++) {
      const mid = te + (b + 0.5) / FB, bit = mf.probe('NRZ', mid) > 2.5;
      sent++;
      if ((ends[b] > 0) !== bit) endErr++;
      if ((mf.probe('REC', te + (b + 0.75) / FB) > 2.5) !== bit) lateErr++;
      let flips = 0, last = mf.probe('REC', te + (b + 0.05) / FB) > 2.5;
      for (let j = 1; j <= 40; j++) { const v = mf.probe('REC', te + (b + 0.05 + j * 0.0225) / FB) > 2.5; if (v !== last) flips++; last = v; }
      chatter += flips;
    }
    t += 0.0137;
  }
  return { sent, endErr, lateErr, chatter };
}, [n, FB]);
let d = await decide(640);
ok('low noise: integrator sign at the end of every bit matches the data, received data clean', d.endErr === 0 && d.lateErr === 0 && d.chatter === 0, JSON.stringify(d));
await attach('ch1', 'cmp.out'); await attach('ch1g', 'cmp.gnd');
await scope({ ch: await chans(2, 2, 2, -2), trig: { source: 1, slope: 'rise', level: 2.5, mode: 'auto' } });
a = await acq();
ok('received data on CH1, NRZ on CH2: both 0 to 5 V', !!a && near(a.ch1.lo, 0, 0.85) && near(a.ch1.hi, 5, 0.85), JSON.stringify(a));
await scope({ run: false }); await sleep(300); await shot('received'); await scope({ run: true });
await knob('amp', 1);
d = await decide(1600);
ok('full noise: the comparator chatters and a few bits (about 1 %) come out wrong', d.chatter > 20 && d.endErr > 0 && d.endErr / d.sent < 0.03, JSON.stringify(d));
await knob('amp', 0.5);
d = await decide(1600);
ok('half noise: chatter at bit starts, but every bit right', d.chatter > 0 && d.endErr === 0 && d.lateErr === 0, JSON.stringify(d));
await knob('amp', 1);
await sleep(300);
await scope({ run: false }); await sleep(300); await shot('received-noisy'); await scope({ run: true });
await attach('ch1', 'add.out'); await attach('ch1g', 'add.gnd'); await sleep(300);
await knob('amp', 0.1); await sleep(300);
const g = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.classList.contains('done')));
ok('setup guide: every step done', g.every(Boolean), g.join());

// ---- mistakes the guide should explain
await unplug('c4:b');
await attach('ch1', 'mf.raw'); await attach('ch1g', 'mf.gnd');
a = await acq();
ok('BK not patched to the filter: raw data stuck at a rail, and the guide says why', !!a && a.ch1.hi - a.ch1.lo < 0.3 && Math.abs(a.ch1.hi) > 3 && (await warns()).some((w) => /never dumped/.test(w)), JSON.stringify(a?.ch1));
await attach('c4:b', 'mf.bk');

// ---- a real mouse drag turns the AMPLITUDE pot
await view('top');
const p = await page.evaluate(() => window.__pce3d.project(window.__pce3d.mfPanel(191.1, 97.8, 22)));
await knob('amp', 0.2);
await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250);
await page.mouse.down(); await page.mouse.move(p.x + 96, p.y, { steps: 6 }); await page.mouse.up(); await sleep(300);
const amp = await st((s) => s.getState().knobs.amp);
ok('dragging the AMPLITUDE knob turns it up', amp > 0.4, String(amp));
const q = await page.evaluate(() => window.__pce3d.project(window.__pce3d.mfPanel(104.4, 93, 18)));
await page.mouse.move(q.x, q.y, { steps: 4 }); await sleep(250);
await page.mouse.click(q.x, q.y); await sleep(400);
ok('clicking switch S1 flips bit D1', (await st((s) => s.getState().knobs.s1)) === 1);
await shot('panel');
ok('no page errors during the experiment', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll matched-filter checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
