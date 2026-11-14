// UI smoke test: drives the running dev server (npm run dev) with the system Edge/Chrome via
// playwright-core. Opens the home page and every experiment, checks the 3D bench loads with the
// right kit (EXCEL-51 for the 8051, EXCEL PIC for the PIC experiments) and saves screenshots.
// The upload flows are covered by ui-lab-mouse, ui-exp*-setup and ui-exp1-8051.
// Usage: node tests/ui-smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch { /* storage unavailable */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };

await page.goto('http://localhost:5173/#/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/home.png` });

for (const exp of ['exp1', 'exp2', 'exp3', 'exp4', 'exp5', 'exp6']) {
  await page.goto('about:blank'); // fresh load per experiment (switching by hash is not what this checks)
  await page.goto(`http://localhost:5173/#/exp/${exp}`);
  await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame && document.querySelector('.lab-view canvas'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ arch: window.__vlab.lab.getState().arch, steps: document.querySelectorAll('.wf ol > li').length, power: window.__vlab.frame.getState().frame.board.power }));
  ok(`${exp}: 3D bench with the ${s.arch === 'mcs51' ? 'EXCEL-51' : 'EXCEL PIC'} kit, setup guide, board off`, s.steps >= 6 && s.power === false && (s.arch === 'mcs51') === (exp === 'exp1'), JSON.stringify(s));
  await page.screenshot({ path: `${out}/${exp}-idle.png` });
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
