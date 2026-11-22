// UI smoke test: drives the running dev server (npm run dev) with the system Edge/Chrome via
// playwright-core. Home page: Expt 1 has two cards (Keil-style simulator, 3D simulation
// environment). Expt 1's first card runs the original Keil µVision-style simulator (editor + virtual
// target: Build, Start Debug, Run, P1.0 LED blinking); every other experiment opens the 3D bench with
// the right kit (EXCEL-51 for exp1_3d, EXCEL PIC for the PIC experiments). Saves screenshots.
// The 3D upload flows are covered by ui-lab-mouse, ui-exp*-setup and ui-exp1-8051.
// Usage: node tests/ui-smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); localStorage.removeItem('vlab.sources.v1'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };
const open = async (exp) => {
  await page.goto('about:blank'); // fresh load per experiment (switching by hash is not what this checks)
  await page.goto(`http://localhost:5173/#/exp/${exp}`);
  await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 60000 });
};

// home: two Expt 1 cards
await page.goto('http://localhost:5173/#/ep');
await page.waitForSelector('.exp-card');
const cards = await page.$$eval('.exp-card', (els) => els.map((e) => ({ href: e.getAttribute('href'), text: e.querySelector('.exp-card-title')?.textContent, no: e.querySelector('.exp-no')?.textContent })));
const c1 = cards.find((c) => c.href === '#/ep/exp/exp1'), c3d = cards.find((c) => c.href === '#/ep/exp/exp1_3d');
ok('home: Expt 1 card (Keil simulator) and a second Expt 1 card for the 3D environment', !!c1 && !!c3d && c1.no === '01' && c3d.no === '01' && cards.indexOf(c3d) === cards.indexOf(c1) + 1, `${c1?.text} | ${c3d?.text}`);
ok('second card reads "3D simulation environment"', c3d?.text === '3D simulation environment');
await page.screenshot({ path: `${out}/home.png` });

// Expt 1, first card: the Keil-style simulator
await open('exp1');
await page.waitForTimeout(2500);
const k = await page.evaluate(() => ({ arch: window.__vlab.lab.getState().arch, canvas: !!document.querySelector('.lab-view canvas'), editor: !!document.querySelector('.monaco-editor'), target: !!document.querySelector('.t51'), power: window.__vlab.frame.getState().frame.board.power }));
ok('exp1: editor + virtual 8051 target, no 3D bench, board powered', k.arch === 'mcs51' && !k.canvas && k.editor && k.target && k.power, JSON.stringify(k));
ok('exp1: \u00b5Vision buttons (Build, Start Debug, Run, Reset)', !!(await page.$('button[title^="Build (F7)"]')) && !!(await page.$('button[title^="Start Debug"]')) && !!(await page.$('button[title^="Run"]')) && !!(await page.$('button[title="Reset"]')));
await page.click('button[title^="Start Debug"]'); // builds first, then loads the program
await page.waitForFunction(() => window.__vlab.lab.getState().debugSession, null, { timeout: 120000 });
await page.click('button[title^="Run"]');
const leds = [];
for (let i = 0; i < 14; i++) { leds.push(await page.evaluate(() => (window.__vlab.sim.latest?.board.leds[0] ?? 0) > 0.5 ? 1 : 0)); await page.waitForTimeout(150); }
ok('exp1: Start Debug + Run: P1.0 LED blinks in the virtual LED bar', leds.includes(0) && leds.includes(1), leds.join(''));
await page.screenshot({ path: `${out}/exp1-keil-sim.png` });

// every 3D experiment
for (const exp of ['exp1_3d', 'exp2', 'exp3', 'exp4', 'exp5', 'exp6']) {
  await open(exp);
  await page.waitForFunction(() => document.querySelector('.lab-view canvas'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ arch: window.__vlab.lab.getState().arch, steps: document.querySelectorAll('.wf ol > li').length, power: window.__vlab.frame.getState().frame.board.power }));
  ok(`${exp}: 3D bench with the ${s.arch === 'mcs51' ? 'EXCEL-51' : 'EXCEL PIC'} kit, setup guide, board off`, s.steps >= 6 && s.power === false && (s.arch === 'mcs51') === (exp === 'exp1_3d'), JSON.stringify(s));
  await page.screenshot({ path: `${out}/${exp}-idle.png` });
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
