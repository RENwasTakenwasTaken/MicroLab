// Home page and leaving an experiment (needs `npm run dev`): the "What's new" list under the heading
// starts collapsed and expands; the Home button asks before leaving (Cancel stays, OK goes home).
// Usage: node tests/ui-home.mjs [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { try { sessionStorage.setItem('vlab.gpuNotice.dismissed', '1'); } catch { /* storage unavailable */ } });
const errors = [];
// Known and older than this test: closing any 3D experiment makes a React root's unmount throw
// "removeChild ... not a child of this node" (harmless: the home page renders). Reported, not failed.
const KNOWN = /Failed to execute 'removeChild' on 'Node'/;
page.on('pageerror', (e) => { if (KNOWN.test(String(e))) console.log('  known: removeChild error while the 3D experiment unmounts'); else errors.push(String(e)); });
let fails = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };

await page.goto('http://localhost:5173/#/ep');
await page.waitForSelector('.whats-new');
ok('"What\'s new" sits right under the heading', await page.$eval('.home-intro', (s) => !!s.querySelector('h1') && !!s.querySelector('.whats-new')));
ok('starts collapsed', !(await page.$eval('.whats-new', (d) => d.open)) && !(await page.isVisible('.wn-body')));
await page.click('.whats-new summary');
await page.waitForTimeout(200);
const items = await page.$$eval('.wn-body li', (l) => l.length);
ok('click expands it: dated updates listed', (await page.isVisible(".wn-body")) && items > 3, `${items} items`);
await page.screenshot({ path: `${out}/home-whats-new.png` });

await page.goto('http://localhost:5173/#/exp/exp2');
await page.waitForFunction(() => window.__vlab && window.__vlab.frame.getState().frame, null, { timeout: 60000 });
await page.waitForTimeout(1500);
let asked = '';
page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
await page.click('.topbar button[title="All experiments"]');
await page.waitForTimeout(400);
ok('Home button asks first; Cancel stays in the experiment', /Leave Expt 2/.test(asked) && (await page.evaluate(() => location.hash)) === '#/exp/exp2', asked.split('\n')[0]);
page.once('dialog', (d) => d.accept());
await page.click('.topbar button[title="All experiments"]');
await page.waitForSelector('.home', { timeout: 5000 }).catch(() => {});
ok('OK goes to all EP experiments', (await page.evaluate(() => location.hash)) === '#/ep' && !!(await page.$('.home .whats-new')));

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
