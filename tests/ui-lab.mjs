// End-to-end walk through the 3D lab workflow (needs `npm run dev`):
// computer -> UPLOAD (waits for device) -> USB cable -> RESET/BOOT sequence ->
// upload completes -> RESET runs the program -> probes on the scope / DMM.
// Usage: node tests/ui-lab.mjs [expId] [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const exp = process.argv[2] ?? 'exp3';
const out = process.argv[3] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `${out}/${exp}-${n}.png` });
const state = () => page.evaluate(() => {
  const v = window.__vlab;
  const f = v.frame.getState().frame;
  return { phase: v.bench.getState().upload.phase, mode: f?.device.mode, seq: f?.device.bootSeq, flashed: f?.device.flashed, log: v.bench.getState().upload.log.slice(-2) };
});
const input = (ev) => page.evaluate((e) => window.__vlab.sim.input(e), ev);
const attach = (plug, sock) => page.evaluate(([p, s]) => { const b = window.__vlab.bench.getState(); b.pick(p); return window.__vlab.bench.getState().attach(p, s); }, [plug, sock]);

await page.goto(`http://localhost:5173/#/exp/${exp}`);
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 30000 });
await page.waitForTimeout(5000);
await shot('1-lab');

await page.click('.view-toggle'); await page.click('.seg-btn:has-text("Computer")');
await page.waitForTimeout(1800);
await shot('2-coding');
await page.click('.pc-upload');
await page.waitForFunction(() => window.__vlab.bench.getState().upload.phase === 'waiting', null, { timeout: 60000 });
console.log('after UPLOAD without device:', await state());
await shot('3-waiting');
await page.click('.pc-close');
await page.waitForTimeout(1200);

console.log('USB plugged:', await attach('usb:b', 'usb:board'));
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'boot', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await page.waitForTimeout(300);
console.log('bootloader entered:', await state());
await input({ kind: 'button', id: 'boot', pressed: false });
await page.waitForTimeout(1500);
await shot('4-uploading');
await page.waitForFunction(() => window.__vlab.bench.getState().upload.phase === 'done', null, { timeout: 30000 });
console.log('upload done:', await state());
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await page.waitForTimeout(1500);
console.log('after RESET:', await state());

console.log('CH1 probe on RD0:', await attach('ch1', 'tp:1:RD0'));
console.log('DMM red on RD0:', await attach('dmm:v', 'tp:1:RD0'));
await page.evaluate(() => window.__vlab.bench.getState().setView('lab'));
await page.waitForTimeout(2500);
await shot('5-lab-running');
await page.evaluate(() => window.__vlab.bench.getState().setView('scope'));
await page.waitForTimeout(2500);
await shot('6-scope');
await page.evaluate(() => window.__vlab.bench.getState().setView('dmm'));
await page.waitForTimeout(2500);
await shot('7-dmm');
await page.evaluate(() => window.__vlab.bench.getState().setView('pins'));
await page.waitForTimeout(2000);
await shot('8-pins');
console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
