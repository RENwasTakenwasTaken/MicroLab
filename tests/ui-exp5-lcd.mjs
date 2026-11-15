// Experiment 5 LCD (needs `npm run dev`): the VLCD contrast preset starts too low and a red HUD over
// it says so until the mouse wheel turns it into range (too high shows a HUD too); LCD timing faults
// in the student's program (no delay after a command, no power-on delay) show an overlay above the
// LCD whose "How to fix this?" link opens the Simulator messages with the fix.
// Usage: node tests/ui-exp5-lcd.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); localStorage.removeItem('vlab.sources.v1'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const ev = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: `${out}/exp5-${n}.png` });
const attach = (plug, sock) => ev(([p, s]) => { const b = window.__vlab.bench.getState(); b.pick(p); return window.__vlab.bench.getState().attach(p, s); }, [plug, sock]);
const input = (e) => ev((x) => window.__vlab.sim.input(x), e);
const board = () => ev(() => window.__vlab.frame.getState().frame.board);
const lcdText = () => ev(() => window.__vlab.frame.getState().frame.board.lcd.rows.map((r) => r.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : ' ')).join('')));
const hud = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
// photo coordinates of the trainer -> world (as world.ts boardToWorld)
const project = (px, py, h) => ev(([x, y, z]) => window.__vlab3d.project([94 - y, z, x - 69.5]), [px, py, h]);
const reference = readFileSync(new URL('../src/experiments/code/exp5_pic_lcd.c', import.meta.url), 'utf8');

async function upload(src) {
  await ev((s) => window.__vlab.lab.getState().setSource('exp5', s), src);
  await input({ kind: 'button', id: 'reset', pressed: true });
  await input({ kind: 'button', id: 'boot', pressed: true });
  await input({ kind: 'button', id: 'reset', pressed: false });
  await input({ kind: 'button', id: 'boot', pressed: false });
  await page.waitForTimeout(600);
  await ev(() => window.__vlab.bench.getState().setView('computer'));
  await page.waitForSelector('.pc-upload', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.click('.pc-upload');
  await page.waitForFunction(() => ['done', 'error', 'compile-error', 'nodevice', 'blocked'].includes(window.__vlab.bench.getState().upload.phase), null, { timeout: 90000 });
  const phase = await ev(() => window.__vlab.bench.getState().upload.phase);
  await page.click('.pc-close');
  await page.waitForTimeout(800);
  await input({ kind: 'button', id: 'reset', pressed: true });
  await input({ kind: 'button', id: 'reset', pressed: false });
  await page.waitForTimeout(1500);
  return phase;
}
const lcdView = async () => { await ev(() => window.__vlab.bench.getState().setView('lcd')); await page.waitForTimeout(1500); };

await page.goto('http://localhost:5173/#/exp/exp5');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame && window.__vlab3d, null, { timeout: 60000 });
await page.waitForTimeout(4000);

// ---- contrast preset
ok('VLCD preset starts too low (6 %)', Math.abs((await board()).lcdContrast - 0.06) < 0.001);
ok('board off: no contrast HUD', !(await page.$('.contrast-hud')));
await attach('rib0:a', 'frc:PORT-D'); await attach('rib0:b', 'frc:LCD_DATA');
await attach('rib1:a', 'frc:PORT-E'); await attach('rib1:b', 'frc:LCD_CTRL');
await attach('ac:plug', 'ac:wall');
await ev(() => window.__vlab.bench.getState().setPowerSwitch(true));
await page.waitForTimeout(600);
await lcdView();
ok('board on, contrast 6 %: red HUD over the preset', /Contrast too low/.test((await hud('.contrast-hud')) ?? ''), await hud('.contrast-hud'));
await shot('1-contrast-low');

await attach('usb:b', 'usb:board');
ok('reference program uploaded', (await upload(reference)) === 'done');
ok('program wrote the text (invisible at this contrast)', (await lcdText())[0].startsWith('  PICT  PUNE'), JSON.stringify(await lcdText()));
ok('correct program: no LCD fault overlay', !(await page.$('.lcd-hud')));
await lcdView();
ok('contrast HUD still shown', !!(await page.$('.contrast-hud')));

// turn the preset with the mouse wheel over it (scroll up = higher contrast)
const pot = await project(90.7, 178.5, 6);
await page.mouse.move(pot.x, pot.y);
for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
await page.waitForTimeout(500);
const c1 = (await board()).lcdContrast;
ok('mouse wheel over the preset raises the contrast into range: HUD gone', c1 > 0.5 && c1 < 0.75 && !(await page.$('.contrast-hud')), `${(c1 * 100).toFixed(0)} %`);
await shot('2-contrast-ok');
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
await page.waitForTimeout(500);
ok('turned too far: "Contrast too high" HUD', /Contrast too high/.test((await hud('.contrast-hud')) ?? ''), `${((await board()).lcdContrast * 100).toFixed(0)} %`);
await shot('3-contrast-high');
await input({ kind: 'contrast', value: 0.62 });
await page.waitForTimeout(400);

// ---- timing fault: no delay after a command (the writes right after Clear display are lost)
ok('program without the command delay uploaded', (await upload(reference.replace('delay(16);', ';'))) === 'done');
await lcdView();
const t1 = await lcdText();
const h1 = (await hud('.lcd-hud')) ?? '';
ok('start of line 1 missing, overlay above the LCD: "Commands sent too quickly"', !t1[0].startsWith('  PICT') && /LCD ignored \d+ writes/.test(h1) && /Commands sent too quickly/.test(h1), `${JSON.stringify(t1[0])} · ${h1}`);
await shot('4-lcd-fault');
await page.click('.lcd-hud a');
await page.waitForTimeout(600);
const st = await ev(() => ({ open: window.__vlab.lab.getState().bottomOpen, tab: window.__vlab.lab.getState().bottomTab }));
const log = await page.$eval('.glass-pane.bottom .console', (e) => e.textContent).catch(() => '');
ok('"How to fix this?" opens the Simulator messages', st.open && st.tab === 'simlog', JSON.stringify(st));
ok('message shows the fix: delay(16) after Clear display', /How to fix:/.test(log) && /Clear display/.test(log) && /delay\(16\)/.test(log), log.slice(-220));
await shot('5-how-to-fix');

// ---- timing fault: no power-on delay (works after RESET, fails after switching the board on)
ok('program without the power-on delay uploaded', (await upload(reference.replace('delay(160);', ';'))) === 'done');
await lcdView();
ok('started with RESET: text shown, no overlay', (await lcdText())[0].startsWith('  PICT  PUNE') && !(await page.$('.lcd-hud')));
await ev(() => window.__vlab.bench.getState().setPowerSwitch(false));
await page.waitForTimeout(500);
await ev(() => window.__vlab.bench.getState().setPowerSwitch(true));
await page.waitForTimeout(1500);
const h2 = (await hud('.lcd-hud')) ?? '';
ok('after switching the board on: display stays off, overlay "Power-on delay not added"', !(await board()).lcd.displayOn && /Power-on delay not added/.test(h2), h2);
await shot('6-power-on-fault');
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await page.waitForTimeout(1200);
ok('RESET: text back, overlay cleared', (await lcdText())[0].startsWith('  PICT  PUNE') && !(await page.$('.lcd-hud')));

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
