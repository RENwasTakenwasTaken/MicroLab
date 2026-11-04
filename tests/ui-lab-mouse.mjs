// Real mouse interaction in the 3D lab (needs `npm run dev`): click the monitor,
// carry the USB plug to the board, hold RESET/BOOT with right-clicks, drag a probe.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };

const proj = (p) => page.evaluate((pt) => window.__vlab3d.project(pt), p);
const bench = (fn) => page.evaluate(fn);
const setView = async (v) => { await page.evaluate((x) => window.__vlab.bench.getState().setView(x), v); await page.waitForTimeout(1300); };
const clickAt = async (p, button = 'left') => { const s = await proj(p); await page.mouse.click(s.x, s.y, { button }); await page.waitForTimeout(250); };
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

// 2. carry the USB plug from the desk into the board's Type-B socket
await setView('lab');
const rest = await bench(() => window.__vlab.bench.getState().plugs['usb:b'].rest);
const s0 = await proj([rest[0], rest[1] + 2, rest[2] - 18]);
await page.mouse.move(s0.x, s0.y);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(300);
ok('click on the USB plug picks it up', await bench(() => window.__vlab.bench.getState().carrying === 'usb:b'));
await setView('board');
const sock = W(-3, 142, 6);
const s1 = await proj(sock);
await page.mouse.move(s1.x, s1.y, { steps: 12 });
await page.waitForTimeout(400);
await page.mouse.click(s1.x, s1.y);
await page.waitForTimeout(400);
ok('clicking the highlighted socket plugs it in', await bench(() => window.__vlab.bench.getState().plugs['usb:b'].attachedTo === 'usb:board'));

// 3. bootloader sequence with real right-clicks on the module buttons
const RESET = W(75.3, 74, 22), BOOT = W(75.3, 61.3, 22);
await setView('pins');
await clickAt(RESET, 'right');
const seq = () => page.evaluate(() => window.__vlab.frame.getState().frame?.device);
await page.waitForTimeout(300);
ok('right-click holds RESET', (await seq()).bootSeq === 'reset', JSON.stringify(await seq()));
await clickAt(BOOT, 'right');
await page.waitForTimeout(300);
await clickAt(RESET, 'right');
await page.waitForTimeout(300);
await clickAt(BOOT, 'right');
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
await clickAt(RESET, 'right'); await clickAt(BOOT, 'right'); await clickAt(RESET, 'right'); await clickAt(BOOT, 'right');
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
