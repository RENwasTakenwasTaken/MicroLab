// Experiment 4 bench set-up (needs `npm run dev`): every DIP starts OFF, the motor's jumper wires,
// the workflow order, upload, a spinning motor and the blue LED, then the logic analyzer's 'add a port'.
// Usage: node tests/ui-exp4-setup.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
// VLAB_PERF=1: run the same checks with the 3D performance mode on
if (process.env.VLAB_PERF) await page.addInitScript(() => { try { localStorage.setItem('vlab.perfMode.v1', 'true'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `${out}/exp4-${n}.png` });
const attach = (plug, sock) => ev(([p, s]) => { const b = window.__vlab.bench.getState(); b.pick(p); return window.__vlab.bench.getState().attach(p, s); }, [plug, sock]);
const input = (e) => ev((x) => window.__vlab.sim.input(x), e);

await page.goto('http://localhost:5173/#/exp/exp4');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await ev(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch {} });
const cfg = () => ev(() => window.__vlab.lab.getState().boardCfg);
const c0 = await cfg();
ok('all DIP switches start OFF', Object.values(c0.dips).every((b) => b.every((v) => !v)), JSON.stringify(c0.dips));
ok('motor wires start unplugged', c0.motorLink === 0);
ok('setup guide open by default', await page.isVisible('.wf') && /Setup guide/.test(await page.textContent('.wf-head')));
const steps = await page.$$eval('.wf ol > li', (els) => els.map((e) => e.textContent.slice(0, 40)));
console.log('steps:', steps);
ok('workflow: motor, DIP, USB, bootloader before code', /motor/i.test(steps[0]) && /DIP/.test(steps[1]) && /USB/.test(steps[2]) && /bootloader/i.test(steps[3]) && /build/i.test(steps[4]));
await ev(() => window.__vlab.bench.getState().setView('board'));
await page.waitForTimeout(2500);
await shot('1-board-start');

console.log('red wire -> DCM1 pin 2 (swapped):', await attach('mot:1', 'dcm:1:2'), await attach('mot:2', 'dcm:1:1'));
ok('swapped wires -> reversed link', (await cfg()).motorLink === -1);
await ev(() => { const b = window.__vlab.bench.getState(); b.pick('mot:2'); window.__vlab.bench.getState().drop([150, -2, 0]); });
await attach('mot:1', 'dcm:1:1'); await attach('mot:2', 'dcm:1:2');
ok('red on pin 1, black on pin 2 -> link +1', (await cfg()).motorLink === 1);
for (const [bank, i] of [['pb', 0], ['pb', 1], ['dcm', 0], ['dcm', 1], ['dcm', 2], ['periph', 2]]) {
  await ev(([b, k]) => { const lab = window.__vlab.lab.getState(); const c = structuredClone(lab.boardCfg); c.dips[b][k] = true; lab.set({ boardCfg: c }); window.__vlab.sim.input({ kind: 'dip', bank: b, index: k, on: true }); }, [bank, i]);
}
await attach('usb:b', 'usb:board');
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'boot', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await input({ kind: 'button', id: 'boot', pressed: false });
await page.waitForTimeout(800);
await ev(() => window.__vlab.bench.getState().setView('computer'));
await page.waitForTimeout(1800);
await page.click('.pc-upload');
await page.waitForFunction(() => ['done', 'error', 'compile-error', 'nodevice', 'blocked'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 60000 });
ok('upload done', (await ev(() => window.__vlab.bench.getState().upload.phase)) === 'done');
await shot('2-computer-workflow');
await page.click('.pc-close');
await page.waitForTimeout(1000);
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await page.waitForTimeout(2500);
const f = await ev(() => window.__vlab.frame.getState().frame.board);
ok('motor turns forward', f.motor.rpm > 50, `${f.motor.rpm.toFixed(0)} rpm`);
ok('blue LED lit by the PWM', f.rgb[2] > 0.3 && f.rgb[0] === 0, JSON.stringify(f.rgb));
ok('workflow complete', await page.isVisible('.wf-done'));
await ev(() => window.__vlab.bench.getState().setView('board'));
await page.waitForTimeout(2500);
await shot('3-board-running');
await page.mouse.move(1000, 500);
// logic analyzer: add every bit of PORTD at once
await ev(() => window.__vlab.lab.getState().set({ bottomTab: 'analyzer', bottomOpen: true }));
await page.waitForTimeout(800);
await page.selectOption('.la select[title="Add every bit of a port"]', '3');
await page.waitForTimeout(500);
const rows = await page.$$eval('.la tbody tr td:first-child', (els) => els.map((e) => e.textContent));
ok('"add a port" adds RD7..RD0', ['RD7', 'RD6', 'RD5', 'RD4', 'RD3', 'RD2', 'RD1', 'RD0'].every((n) => rows.includes(n)), rows.join(' '));
await shot('4-analyzer-port');
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fails ? 1 : 0);
