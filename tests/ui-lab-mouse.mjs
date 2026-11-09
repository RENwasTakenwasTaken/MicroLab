// Real mouse interaction in the 3D lab (needs `npm run dev`): click the monitor,
// plug the adapter into the wall socket and switch POWER on, carry the USB plug
// to the board, hold RESET/BOOT with Shift-clicks, upload.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };

const proj = (p) => page.evaluate((pt) => window.__vlab3d.project(pt), p);
const bench = (fn) => page.evaluate(fn);
const setView = async (v) => { await page.evaluate((x) => window.__vlab.bench.getState().setView(x), v); await page.waitForTimeout(1300); };
const clickAt = async (p, button = 'left') => { const s = await proj(p); await page.mouse.click(s.x, s.y, { button }); await page.waitForTimeout(250); };
const shiftClickAt = async (p) => { await page.keyboard.down('Shift'); await clickAt(p); await page.keyboard.up('Shift'); };
const W = (px, py, h) => [94 - py, h, px - 69.5]; // board photo mm -> world

await page.goto('http://localhost:5173/#/exp/exp2');
await page.waitForFunction(() => window.__vlab && window.__vlab3d && window.__vlab.frame.getState().frame, null, { timeout: 30000 });
await page.waitForTimeout(4000);

// 1. click the monitor -> coding mode
await clickAt([-470 + Math.sin(0.32) * 12, 300 - 7 + 5, -330 + Math.cos(0.32) * 12]);
await page.waitForTimeout(1500);
ok('clicking the monitor opens coding mode', await bench(() => window.__vlab.bench.getState().view === 'computer') && await page.isVisible('.pc-overlay'));
await page.click('.monaco-editor .view-lines');
await page.keyboard.press('Control+End');
await page.keyboard.type('\n/* edited on the lab computer */');
ok('typing in the on-screen editor changes the program', await page.evaluate(() => /edited on the lab computer/.test(Object.values(JSON.parse(localStorage.getItem('vlab.sources.v1') ?? '{}')).join(''))));
await page.click('.pc-close');
await page.waitForTimeout(1300);
ok('X closes coding mode', await bench(() => window.__vlab.bench.getState().view === 'lab'));

// 1b. UPLOAD without a device fails at once (no waiting), with the bootloader tip
await setView('computer');
await page.click('.pc-upload');
await page.waitForFunction(() => window.__vlab.bench.getState().upload.phase === 'nodevice', null, { timeout: 10000 });
ok('UPLOAD without a device reports "Device not detected" at once', await page.isVisible('.pc-log .c-err:has-text("Device not detected")'));
ok('tip toast to enter the bootloader', await page.isVisible('.lab-toast:has-text("Tip: Enter PIC")'));
ok('lab computer shows "Device detached"', await page.isVisible('.pc-chip:has-text("Device detached")'));
ok('Reset Device disabled outside bootloader mode', await page.isDisabled('.pc-title button:has-text("Reset Device")'));
await page.click('.pc-close');
await page.waitForTimeout(1300);

// 1c. power: the board starts unplugged and OFF; plug the adapter in, then the POWER switch
await setView('lab');
const power = () => page.evaluate(() => window.__vlab.frame.getState().frame?.board.power);
ok('board starts without power', (await power()) === false);
const acRest = await bench(() => window.__vlab.bench.getState().plugs['ac:plug'].rest);
await clickAt(acRest);
ok('click on the mains plug picks it up', await bench(() => window.__vlab.bench.getState().carrying === 'ac:plug'));
const acSock = [184, 228, -510.6]; // wall socket (world.ts WALLBOARD)
const sa = await proj(acSock);
await page.mouse.move(sa.x, sa.y, { steps: 10 });
await page.waitForTimeout(400);
await page.mouse.click(sa.x, sa.y);
await page.waitForTimeout(400);
ok('mains plug goes into the wall socket', await bench(() => window.__vlab.bench.getState().plugs['ac:plug'].attachedTo === 'ac:wall'));
ok('plugged in but switched OFF: still no power', (await power()) === false);
await setView('board');
await clickAt(W(18.5, 11, 7));
await page.waitForTimeout(800);
ok('clicking the POWER switch powers the board', (await power()) === true && await bench(() => window.__vlab.bench.getState().powerSwitch));

// 2. carry the USB plug from the desk into the board's Type-B socket
await setView('lab');
const rest = await bench(() => window.__vlab.bench.getState().plugs['usb:b'].rest);
const s0 = await proj([rest[0], rest[1] + 2, rest[2] - 18]);
await page.mouse.move(s0.x, s0.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(300);
ok('click on the USB plug picks it up', await bench(() => window.__vlab.bench.getState().carrying === 'usb:b'));
await setView('board');
const sock = W(7, 130.5, 12.6 + 6);
const s1 = await proj(sock);
await page.mouse.move(s1.x, s1.y, { steps: 12 });
await page.waitForTimeout(400);
await page.mouse.click(s1.x, s1.y);
await page.waitForTimeout(400);
ok('clicking the highlighted socket plugs it in', await bench(() => window.__vlab.bench.getState().plugs['usb:b'].attachedTo === 'usb:board'));

// 3. bootloader sequence: Shift-click holds a button, a click on a held button releases it
const RESET = W(75.3, 74, 22), BOOT = W(75.3, 61.3, 22);
await setView('pins');
const seq = () => page.evaluate(() => window.__vlab.frame.getState().frame?.device);
await clickAt(RESET, 'right');
await page.waitForTimeout(300);
ok('right-click no longer holds a button', (await seq()).bootSeq !== 'reset', JSON.stringify(await seq()));
await shiftClickAt(RESET);
await page.waitForTimeout(300);
ok('Shift-click holds RESET', (await seq()).bootSeq === 'reset', JSON.stringify(await seq()));
await shiftClickAt(BOOT);
await page.waitForTimeout(300);
await clickAt(RESET);
await page.waitForTimeout(300);
await clickAt(BOOT);
await page.waitForTimeout(400);
const d = await seq();
ok('RESET+BOOT sequence enters the bootloader', d.mode === 'bootloader' && d.bootSeq === 'ready', JSON.stringify(d));
await page.screenshot({ path: `${out}/mouse-bootloader.png` });

// 4. upload from the computer now completes
await setView('computer');
await page.click('.pc-upload');
await page.waitForFunction(() => ['done', 'error', 'compile-error'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 60000 });
ok('upload completes', await bench(() => window.__vlab.bench.getState().upload.phase === 'done'));
await page.screenshot({ path: `${out}/mouse-upload-done.png` });
await page.click('.pc-close');
await page.waitForTimeout(1200);

// 5. momentary RESET click runs the program
await setView('pins');
await clickAt(RESET);
await page.waitForTimeout(800);
ok('RESET click runs the program', (await seq()).mode === 'running');

// 6. pull the USB cable mid-way through a second upload -> communication error
await setView('pins');
await shiftClickAt(RESET); await shiftClickAt(BOOT); await clickAt(RESET); await clickAt(BOOT);
await page.evaluate(() => { window.__vlabUp = true; });
await setView('computer');
await page.click('.pc-upload');
await page.waitForFunction(() => window.__vlab.bench.getState().upload.phase === 'programming', null, { timeout: 60000 });
await page.evaluate(() => window.__vlab.bench.getState().pick('usb:b'));
await page.waitForFunction(() => ['error', 'done'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 20000 });
ok('unplugging during programming reports a communication error', await bench(() => window.__vlab.bench.getState().upload.phase === 'error'));
await page.screenshot({ path: `${out}/mouse-upload-error.png` });

console.log('page errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
process.exit(fails ? 1 : 0);
