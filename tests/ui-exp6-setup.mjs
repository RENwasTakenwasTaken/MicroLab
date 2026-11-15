// Experiment 6 bench set-up (needs `npm run dev`): the board starts without power, the power step,
// both ANALOG INP DIPs, upload, the LCD reading ("Result:" + ADC result), and the last step: changing the LM35 temperature
// in the Hardware tab while the program runs (the experiment is not complete until then).
// Usage: node tests/ui-exp6-setup.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
ok('DMM starts on AC volts: warning in the multimeter step', /DMM on AC volts/.test(steps[iDmm]), steps[iDmm]);
ok('no DMM HUD before a lead is on the board', !(await page.$('.dmm-hud')));
await attach('dmm:v', 'tp:2:RA2');
await attach('dmm:com', 'tp:2:GND');
ok('DMM on RA2 + GND: multimeter step done', await stepDone('Connect the multimeter'));
await ev(() => window.__vlab.bench.getState().setView('dmm'));
await page.waitForTimeout(1500);
const dmmHud = (await page.$eval('.dmm-hud', (e) => e.textContent).catch(() => '')) ?? '';
ok('leads on, still AC: red HUD over the meter says press SELECT', /DMM on AC volts/.test(dmmHud) && /SELECT/.test(dmmHud), dmmHud);
await shot('dmm-ac');
await ev(() => window.__vlab.bench.setState({ dmmAc: false }));
await page.waitForTimeout(400);
ok('SELECT (DC): HUD and step warning gone', !(await page.$('.dmm-hud')) && !/DMM on AC volts/.test((await stepTexts())[iDmm]));
await ev(() => window.__vlab.bench.getState().setView('lab'));

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
ok('LCD shows "Result:" and the ADC result', /^Result:\d{4}/.test(lcd[0]), JSON.stringify(lcd));
ok('program running but temperature unchanged: not complete yet', !(await page.isVisible('.wf-done')) && !(await stepDone('LM35 temperature')));

// change the temperature in the Hardware tab (the real slider)
await ev(() => window.__vlab.lab.getState().set({ leftTab: 'hardware', leftOpen: true }));
await page.waitForTimeout(700);
const slider = page.locator('.field:has-text("LM35 temperature") input[type="range"]');
await slider.fill('42');
await page.waitForTimeout(1800);
ok('temperature changed while running: step done, experiment complete', await stepDone('LM35 temperature') && await page.isVisible('.wf-done'));
const lcd2 = await ev(() => window.__vlab.frame.getState().frame.board.lcd.rows.map((r) => r.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : c === 0xdf ? '°' : ' ')).join('')));
const code42 = Math.floor((0.42 / 5) * 1024);
ok(`LCD follows the new temperature: 42 °C -> ${code42}`, Math.abs(Number(lcd2[0].slice(7, 11)) - code42) <= 1, JSON.stringify(lcd2[0]));
ok('analog pin is an input: no ADC HUD', !(await page.$('.adc-hud')));
await shot('complete');

// ---- RA1 left as an output: the ADC quietly reads 0 V; a HUD above PORT-A says so
const reference = readFileSync(new URL('../src/experiments/code/exp6_pic_temp.c', import.meta.url), 'utf8');
await ev((s) => window.__vlab.lab.getState().setSource('exp6', s), reference.replace('TRISAbits.RA1 = 1;', 'TRISAbits.RA1 = 0;'));
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
ok('program with RA1 as an output uploaded', (await ev(() => window.__vlab.bench.getState().upload.phase)) === 'done');
await page.click('.pc-close');
await page.waitForTimeout(800);
await input({ kind: 'button', id: 'reset', pressed: true });
await input({ kind: 'button', id: 'reset', pressed: false });
await ev(() => window.__vlab.bench.getState().setView('board'));
await page.waitForTimeout(2000);
const adcHud = (await page.$eval('.adc-hud', (e) => e.textContent).catch(() => '')) ?? '';
const lcd3 = await ev(() => window.__vlab.frame.getState().frame.board.lcd.rows[0].map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : ' ')).join(''));
ok('LCD reads 0000 and the HUD says AN1 (RA1) is an output', /Result:0000/.test(lcd3) && /AN1 \(RA1\) is an output/.test(adcHud) && /not the LM35/.test(adcHud), `${JSON.stringify(lcd3)} · ${adcHud}`);
await shot('adc-output');
await page.click('.adc-hud a');
await page.waitForTimeout(600);
const log = await page.$eval('.glass-pane.bottom .console', (e) => e.textContent).catch(() => '');
ok('"How to fix this?" opens Simulator messages with the fix', /How to fix:/.test(log) && /TRISAbits\.RA1 = 1/.test(log), log.slice(-200));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fails ? 1 : 0);
