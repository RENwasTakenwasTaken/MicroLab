// Experiment 1 on the EXCEL-51 kit (needs `npm run dev`): the 8051 module on the base board,
// power, the Type-B cable in the base board's USB2UART port, Keil µVision (Create HEX File +
// Build), SST EasyIAP (Detect MCU + a mouse click on the module's RESET, Download), RESET to run,
// module LED L0 blinking on P1.0. Usage: node tests/ui-exp1-8051.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
if (process.env.VLAB_PERF) await page.addInitScript(() => { try { localStorage.setItem('vlab.perfMode.v1', 'true'); } catch { /* storage unavailable */ } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); localStorage.removeItem('vlab.sources.v1'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `${out}/exp1-${n}.png` });
const attach = (plug, sock) => ev(([p, s]) => { const b = window.__vlab.bench.getState(); b.pick(p); return window.__vlab.bench.getState().attach(p, s); }, [plug, sock]);
const stepTexts = () => page.$$eval('.wf ol > li', (els) => els.map((e) => e.textContent));
const stepDone = async (re) => ev((src) => { const r = new RegExp(src, 'i'); return [...document.querySelectorAll('.wf ol > li')].some((li) => r.test(li.textContent) && li.classList.contains('done')); }, re);
const mode = () => ev(() => window.__vlab.frame.getState().frame?.device.mode);
const keilLog = () => ev(() => window.__vlab.bench.getState().keil.log.join('\n'));
const iapLog = () => ev(() => window.__vlab.bench.getState().iap.log.join('\n'));
// photo coordinates of the trainer -> world (as world.ts boardToWorld), module top = 12.6 mm
const project = (px, py, h) => ev(([x, y, z]) => window.__vlab3d.project([94 - y, z, x - 69.5]), [px, py, h]);

await page.goto('http://localhost:5173/#/exp/exp1');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame && window.__vlab3d, null, { timeout: 60000 });
await page.waitForTimeout(4000);

ok('Expt 1 opens the 3D lab with the 8051 kit', (await ev(() => window.__vlab.lab.getState().arch)) === 'mcs51' && !!(await page.$('.lab-view canvas')));
ok('board starts without power', (await ev(() => window.__vlab.frame.getState().frame.board.power)) === false);
const steps = await stepTexts();
console.log('steps:', steps.map((s) => s.slice(0, 50)));
ok('8051 steps: power, USB2UART, Keil build, Detect, Download, RESET', steps.length === 6 && /Power on/.test(steps[0]) && /USB2UART/.test(steps[1]) && /Keil/.test(steps[2]) && /Detect MCU/.test(steps[3]) && /Download/.test(steps[4]) && /RESET to run/.test(steps[5]));
await shot('1-lab');

// close-up of the EXCEL-51 module
await ev(() => window.__vlab.bench.getState().setView('board'));
await page.waitForTimeout(1500);
await ev(() => window.__vlab3d.look([-1.5, 175, 100], [-1.5, 12, -28]));
await page.waitForTimeout(800);
await shot('2-module');

// power + USB: the PIC module's USB socket is not on this kit
await attach('ac:plug', 'ac:wall');
await ev(() => window.__vlab.bench.getState().setPowerSwitch(true));
await page.waitForTimeout(400);
ok('power step done, board powered', (await stepDone('Power on')) && (await ev(() => window.__vlab.frame.getState().frame.board.power)) === true);
ok('PIC module USB socket refused on the 8051 kit', (await attach('usb:b', 'usb:board')) === false);
ok('USB cable into the USB2UART port', await attach('usb:b', 'usb:uart'));
await page.waitForTimeout(300);
ok('USB step done', await stepDone('USB2UART'));
await ev(() => window.__vlab3d.look([-160, 120, 30], [-79, 6, -55]));
await page.waitForTimeout(800);
await shot('3-usb2uart');

// Keil: build without the HEX option -> no HEX file
await ev(() => window.__vlab.bench.getState().setView('computer'));
await page.waitForSelector('.pc51', { timeout: 15000 });
await page.waitForTimeout(1500);
ok('lab computer shows Keil \u00b5Vision', !!(await page.$('.pc51 .k51-app.on')) && /\u00b5Vision/.test(await page.textContent('.pc51 .k51-app.on')));
await page.click('.pc51 .pc-build');
await page.waitForFunction(() => ['ok', 'failed'].includes(window.__vlab.bench.getState().keil.phase), null, { timeout: 120000 });
let kl = await keilLog();
ok('Build without Create HEX File: 0 errors, no HEX file', /0 Error\(s\)/.test(kl) && !/creating hex file/.test(kl) && /no HEX file/.test(kl), kl.split('\n').slice(-3).join(' | '));
ok('code step not done without a HEX file', !(await stepDone('Keil')));
// Options for Target -> Output -> Create HEX File
await page.click('.k51-options');
await page.click('.k51-check input');
await page.click('.k51-dlg-foot .pc-btn');
ok('Create HEX File ticked', await ev(() => window.__vlab.bench.getState().keil.createHex));
await page.click('.pc51 .pc-build');
await page.waitForFunction(() => window.__vlab.bench.getState().keil.phase === 'ok' && !!window.__vlab.bench.getState().keil.hexFile, null, { timeout: 120000 });
kl = await keilLog();
ok('Build: creating hex file, 0 Error(s)', /creating hex file/.test(kl) && /0 Error\(s\)/.test(kl), kl.split('\n').slice(-4).join(' | '));
ok('code step done', await stepDone('Keil'));
await shot('4-keil');

// EasyIAP: download before detecting -> refused
await page.click('.k51-app:nth-child(2)');
await page.waitForSelector('.iap');
await page.click('.iap-download');
await page.waitForTimeout(300);
ok('Download before Detect MCU: refused', /not detected/.test(await iapLog()));
// Detect MCU, then press the module's RESET with the mouse (in the lab view)
await page.click('.iap-detect');
await page.waitForTimeout(300);
ok('Detect MCU waits for RESET', !!(await page.$('.iap-wait')) && (await ev(() => !!window.__vlab.bench.getState().iap.waitUntil)));
await shot('5-iap-waiting');
await ev(() => window.__vlab.bench.getState().setView('board'));
await page.waitForTimeout(1400);
const r = await project(76.2, 72.2, 12.6 + 5);
await page.mouse.move(r.x, r.y);
await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
await page.waitForTimeout(600);
ok('RESET clicked during Detect: chip in IAP mode, detected', (await mode()) === 'bootloader' && (await ev(() => window.__vlab.bench.getState().iap.detected)), `mode ${await mode()}`);
ok('detect step done', await stepDone('Detect MCU'));

// Download
await ev(() => window.__vlab.bench.getState().setView('computer'));
await page.waitForSelector('.iap', { timeout: 15000 });
await page.waitForTimeout(1200);
await page.click('.iap-download');
await page.waitForTimeout(700);
await shot('6-iap-downloading');
await page.waitForFunction(() => ['done', 'error'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 30000 });
const il = await iapLog();
ok('Download complete', /Download complete/.test(il), il.split('\n').slice(-2).join(' | '));
ok('download step done, chip still in IAP mode', (await stepDone('Download')) && (await mode()) === 'bootloader');
await shot('7-iap-done');

// RESET runs the program: module LED L0 blinks at ~1 Hz
await page.click('.pc-close');
await page.waitForTimeout(800);
await ev(() => { window.__vlab.sim.input({ kind: 'button', id: 'reset', pressed: true }); window.__vlab.sim.input({ kind: 'button', id: 'reset', pressed: false }); });
await page.waitForTimeout(500);
ok('RESET: program running', (await mode()) === 'running');
const samples = [];
for (let i = 0; i < 16; i++) { samples.push(await ev(() => window.__vlab.sim.latest.board.leds[0] > 0.5 ? 1 : 0)); await page.waitForTimeout(150); }
ok('module LED L0 blinks', samples.includes(0) && samples.includes(1), samples.join(''));
await page.waitForTimeout(2500);
const hz = await ev(() => window.__vlab.frame.getState().frame.ports[1].freq[0]);
ok('P1.0 toggles at ~1 Hz', hz > 0.85 && hz < 1.15, `${hz.toFixed(2)} Hz`);
ok('IAP connection dropped after the reset', !(await ev(() => window.__vlab.bench.getState().iap.detected)));
ok('all steps complete', !!(await page.$('.wf-done')));
await ev(() => window.__vlab3d.look([-2, 95, 115], [-2, 14, 6]));
await page.waitForTimeout(700);
await shot('8-running-leds');

console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
