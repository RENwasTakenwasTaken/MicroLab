// Experiment 6 bench set-up (needs `npm run dev`): the board starts without power, the power step,
// both ANALOG INP DIPs, upload, the LCD reading, and the last step: changing the LM35 temperature
// in the Hardware tab while the program runs (the experiment is not complete until then).
// Usage: node tests/ui-exp6-setup.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
if (process.env.VLAB_PERF) await page.addInitScript(() => { try { localStorage.setItem('vlab.perfMode.v1', 'true'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `${out}/exp6-${n}.png` });
const attach = (plug, sock) => ev(([p, s]) => { const b = window.__vlab.bench.getState(); b.pick(p); return window.__vlab.bench.getState().attach(p, s); }, [plug, sock]);
const input = (e) => ev((x) => window.__vlab.sim.input(x), e);
const stepTexts = () => page.$$eval('.wf ol > li', (els) => els.map((e) => e.textContent));
const stepDone = async (re) => ev((src) => { const r = new RegExp(src, 'i'); return [...document.querySelectorAll('.wf ol > li')].some((li) => r.test(li.textContent) && li.classList.contains('done')); }, re);

await page.goto('http://localhost:5173/#/exp/exp6');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await ev(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch {} });

ok('board starts without power', (await ev(() => window.__vlab.frame.getState().frame.board.power)) === false);
const steps = await stepTexts();
console.log('steps:', steps.map((s) => s.slice(0, 44)));
ok('powering on is the first step', /Power on the board/.test(steps[0]));
ok('LM35 temperature step is the last one', /LM35 temperature/.test(steps[steps.length - 1]));
const iDmm = steps.findIndex((s) => /Connect the multimeter/.test(s)), iUsb = steps.findIndex((s) => /USB Type-B/.test(s));
ok('multimeter step right before the USB step', iDmm >= 0 && iDmm === iUsb - 1);
await attach('dmm:v', 'tp:2:RA2');
await attach('dmm:com', 'tp:2:GND');
ok('DMM on RA2 + GND: multimeter step done', await stepDone('Connect the multimeter'));

// ribbons: PORT-D -> LCD_DATA, PORT-E -> LCD_CNTRL; both analog DIPs ON
await attach('rib0:a', 'frc:PORT-D'); await attach('rib0:b', 'frc:LCD_DATA');
await attach('rib1:a', 'frc:PORT-E'); await attach('rib1:b', 'frc:LCD_CTRL');
for (const i of [0, 1]) {
  await ev((k) => { const lab = window.__vlab.lab.getState(); const c = structuredClone(lab.boardCfg); c.dips.analog[k] = true; lab.set({ boardCfg: c }); window.__vlab.sim.input({ kind: 'dip', bank: 'analog', index: k, on: true }); }, i);
}
// power: the plug alone is not enough, the POWER switch alone is not enough
await attach('ac:plug', 'ac:wall');
await page.waitForTimeout(500);
ok('mains plugged, switch OFF: no power', (await ev(() => window.__vlab.frame.getState().frame.board.power)) === false);
await ev(() => window.__vlab.bench.getState().setPowerSwitch(true));
await page.waitForTimeout(600);
ok('mains plugged + switch ON: powered, power step done', (await ev(() => window.__vlab.frame.getState().frame.board.power)) === true && await stepDone('Power on the board'));

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
await page.click('.pc-close');
await page.waitForTimeout(1000);
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await page.waitForTimeout(2500);
const lcd = await ev(() => window.__vlab.frame.getState().frame.board.lcd.rows.map((r) => r.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : c === 0xdf ? '°' : ' ')).join('')));
ok('LCD shows the temperature', /Temperature/.test(lcd[0]) && /°C/.test(lcd[1]), JSON.stringify(lcd));
ok('program running but temperature unchanged: not complete yet', !(await page.isVisible('.wf-done')) && !(await stepDone('LM35 temperature')));

// change the temperature in the Hardware tab (the real slider)
await ev(() => window.__vlab.lab.getState().set({ leftTab: 'hardware', leftOpen: true }));
await page.waitForTimeout(700);
const slider = page.locator('.field:has-text("LM35 temperature") input[type="range"]');
await slider.fill('42');
await page.waitForTimeout(1800);
ok('temperature changed while running: step done, experiment complete', await stepDone('LM35 temperature') && await page.isVisible('.wf-done'));
const lcd2 = await ev(() => window.__vlab.frame.getState().frame.board.lcd.rows.map((r) => r.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : c === 0xdf ? '°' : ' ')).join('')));
ok('LCD follows the new temperature', /04[12]\.\d°C/.test(lcd2[1]), JSON.stringify(lcd2[1]));
await shot('complete');
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fails ? 1 : 0);
