// DSO input coupling (needs `npm run dev`): DC / AC / Ground on CH1 with Expt 3's 1 kHz square
// wave and with the signal generator at 10 Hz, the CH 1 MENU + option button clicks, and the
// readout. AC coupling = series capacitor, ~10 Hz high-pass (tau ~ 16 ms).
// Usage: node tests/ui-scope-coupling.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const ev = (f, a) => page.evaluate(f, a);
const attach = (p, s) => ev(([a, b]) => { const x = window.__vlab.bench.getState(); x.pick(a); return window.__vlab.bench.getState().attach(a, b); }, [p, s]);
const input = (e) => ev((x) => window.__vlab.sim.input(x), e);
const setScope = (p) => ev((x) => window.__vlab.bench.setState({ scope: { ...window.__vlab.bench.getState().scope, ...x } }), p);
const view = async () => { await page.waitForTimeout(700); return ev(() => { const v = window.__vlabScope; const pts = v.traces[0]?.pts ?? []; const vs = pts.map((p) => p.v); return { min: Math.min(...vs), max: Math.max(...vs), meas: v.meas, coupling: v.coupling, menu: v.menu, pts }; }); };
const r2 = (x) => x.toFixed(2);
const warning = () => ev(() => [...document.querySelectorAll('.wf-warn')].map((e) => e.textContent).join(' | '));

await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch {} });
await page.goto('http://localhost:5173/#/exp/exp3');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await ev(() => document.querySelectorAll('.wf, .wf-toggle, .board-hint').forEach((e) => (e.style.display = 'none')));

// Expt 3 running: 1 kHz square wave on RD0, CH1 on RD0, probe ground on GND
await attach('ac:plug', 'ac:wall'); await ev(() => window.__vlab.bench.getState().setPowerSwitch(true));
await attach('ch1', 'tp:1:RD0'); await attach('scope:gnd', 'tp:uart:GND'); await attach('usb:b', 'usb:board');
for (const [id, p] of [['reset', true], ['boot', true], ['reset', false], ['boot', false]]) await input({ kind: 'button', id, pressed: p });
await page.waitForTimeout(800);
await ev(() => window.__vlab.bench.getState().setView('computer')); await page.waitForTimeout(1500);
await page.click('.pc-upload');
await page.waitForFunction(() => ['done', 'error', 'compile-error', 'nodevice', 'blocked'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 120000 });
await page.click('.pc-close'); await page.waitForTimeout(800);
await input({ kind: 'button', id: 'reset', pressed: true }); await input({ kind: 'button', id: 'reset', pressed: false });
await setScope({ sdiv: 250e-6, vdiv: [2, 2], coupling: ['DC', 'DC'], menu: 0 });
await ev(() => window.__vlab.bench.getState().setView('scope')); await page.waitForTimeout(1500);

let v = await view();
ok('DC: 1 kHz square wave from 0 V to 5 V', Math.abs(v.min) < 0.05 && Math.abs(v.max - 5) < 0.05, `${r2(v.min)} .. ${r2(v.max)} V, Pk-Pk ${r2(v.meas.pkpk)} V`);
await page.screenshot({ path: `${out}/coupling-1-dc-1khz.png` });

// open the CH1 menu and switch to AC with the real buttons (mouse clicks on the scope front panel)
const click = async (local) => {
  const pt = await ev((l) => {
    const s = { pos: [470, -7, -330], rotY: -0.32, h: 151, d: 124 };
    const [x, y, z] = [l[0], l[1] + s.h / 2 + 4, l[2] + s.d / 2 + 0.3 + 2];
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    return window.__vlab3d.project([s.pos[0] + x * c + z * sn, s.pos[1] + y, s.pos[2] - x * sn + z * c]);
  }, local);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
};
await click([25, 6, 0]);                                    // CH 1 MENU
v = await view();
ok('CH 1 MENU opens the CH1 menu', v.menu === 1);
await click([3, 40, 0]);                                    // top option button: Coupling
v = await view();
ok('top option button: Coupling DC -> AC', v.coupling[0] === 'AC', v.coupling.join(' / '));
ok('AC at 1 kHz: same square wave, centred on 0 V', Math.abs(v.max - 2.5) < 0.2 && Math.abs(v.min + 2.5) < 0.2, `${r2(v.min)} .. ${r2(v.max)} V`);
ok('AC at 1 kHz: Pk-Pk still ~5 V, Cyc RMS ~2.5 V, Freq 1 kHz', Math.abs(v.meas.pkpk - 5) < 0.2 && Math.abs(v.meas.rms - 2.5) < 0.2 && Math.abs(v.meas.freq - 1000) < 5, `Pk-Pk ${r2(v.meas.pkpk)} V, RMS ${r2(v.meas.rms)} V, Freq ${r2(v.meas.freq)} Hz`);
await page.screenshot({ path: `${out}/coupling-2-ac-1khz-menu.png` });
let w = await warning();
ok('setup guide warns: CH1 on AC coupling', /CH1 is on AC coupling/.test(w) && /CH 1 MENU/.test(w), w);
await ev(() => { const e = document.querySelector('.wf'); if (e) e.style.display = ''; });
await page.screenshot({ path: `${out}/coupling-2b-guide-warning.png` });
await ev(() => { const e = document.querySelector('.wf'); if (e) e.style.display = 'none'; });
await click([3, 40, 0]);                                    // AC -> Ground
v = await view();
ok('Ground: flat 0 V line, measurements 0', v.coupling[0] === 'GND' && v.min === 0 && v.max === 0 && v.meas.pkpk === 0);
w = await warning();
ok('setup guide warns: CH1 on Ground coupling', /CH1 is on Ground coupling/.test(w), w);
await click([3, 40, 0]);                                    // Ground -> DC
await click([25, 6, 0]);                                    // close the menu
v = await view();
ok('back to DC, menu closed', v.coupling[0] === 'DC' && v.menu === 0);
ok('warning gone on DC', (await warning()) === '');

// 10 Hz square wave from the signal generator, as in the lab photo: AC turns it into spikes
await attach('ch1', 'tp:gen');
await ev(() => window.__vlab.bench.setState({ gen: { ...window.__vlab.bench.getState().gen, on: true, wave: 'square', freq: 10, amp: 4 } }));
await setScope({ sdiv: 50e-3, vdiv: [1, 2], coupling: ['DC', 'DC'] });
v = await view();
ok('generator 10 Hz on DC: flat-topped square, +-2 V', Math.abs(v.max - 2) < 0.05 && Math.abs(v.min + 2) < 0.05, `${r2(v.min)} .. ${r2(v.max)} V`);
await page.screenshot({ path: `${out}/coupling-3-dc-10hz.png` });
await setScope({ coupling: ['AC', 'DC'] });
v = await view();
// right after a rising edge the trace is near its peak; 45 ms later (~3 tau) it has decayed close to 0
const rise = v.pts.findIndex((p, i) => i > 0 && p.v - v.pts[i - 1].v > 3);
const tEdge = v.pts[rise].t;
const after = (dt) => { const p = v.pts.find((q) => q.t >= tEdge + dt); return p ? p.v : NaN; };
ok('AC at 10 Hz: each edge jumps by the full 4 V', v.pts[rise].v - v.pts[rise - 1].v > 3.9, `${r2(v.pts[rise - 1].v)} -> ${r2(v.pts[rise].v)} V`);
ok('AC at 10 Hz: then decays towards 0 V (tau ~ 16 ms)', after(0.001) > 3 && Math.abs(after(0.045)) < 0.4, `1 ms after the edge ${r2(after(0.001))} V, 16 ms ${r2(after(0.016))} V, 45 ms ${r2(after(0.045))} V`);
await page.screenshot({ path: `${out}/coupling-4-ac-10hz.png` });

console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
process.exit(fails ? 1 : 0);
