// UI smoke test: drives the running dev server (npm run dev) with the system
// Edge/Chrome via playwright-core, builds + programs an experiment and saves screenshots.
// Usage: node tests/ui-smoke.mjs [expId] [outDir]
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const exp = process.argv[2] ?? 'exp5';
const out = process.argv[3] ?? 'tests/screenshots';
mkdirSync(out, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 960 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173/#/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/home.png` });

await page.goto(`http://localhost:5173/#/exp/${exp}`);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/${exp}-idle.png` });

const isPic = exp !== 'exp1';
await page.click(isPic ? 'button[title^="Program Device"]' : 'button[title^="Start Debug"]');
await page.waitForTimeout(isPic ? 14000 : 6000);
if (!isPic) { await page.click('button[title^="Run"]'); await page.waitForTimeout(2500); }
await page.screenshot({ path: `${out}/${exp}-running.png` });
if (isPic) {
  await page.click('.seg-btn:has-text("Top")');
  await page.waitForTimeout(1500);
  await page.locator('.board-view').screenshot({ path: `${out}/${exp}-top.png` });
  await page.click('.seg-btn:has-text("Overview")');
  await page.click('.tab:has-text("Logic Analyzer")');
  await page.click('.tab:has-text("Peripherals")');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${exp}-analyzer.png` });
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
