import { readFileSync } from 'node:fs';
import { Mcs51 } from '../src/sim/mcs51/mcs51.ts';
const ev = [];
const bus = {
  readInputs: () => 0xff,
  outputsChanged: (p, l, d, c) => ev.push([p, l, c]),
  analogVoltage: () => 0, serialTx: (b) => console.log('UART TX:', String.fromCharCode(b)),
  log: (lv, m) => console.log(`[${lv}]`, m),
};
const mcu = new Mcs51(bus, 'AT89S52');
console.log(mcu.loadHex(readFileSync(process.argv[2], 'utf8')));
const t0 = performance.now(); let n = 0;
while (mcu.cycles < mcu.cycleHz() * 2.2) { mcu.step(); n++; }
console.log(`${n} instr in ${(performance.now() - t0).toFixed(0)} ms`);
const hz = mcu.cycleHz();
const show = (p) => ev.filter(e => e[0] === p).slice(1, 6).map(e => `${e[1].toString(16)}@${(e[2] / hz * 1000).toFixed(1)}ms`).join('  ');
console.log('P1:', show(1)); console.log('P2:', show(2));
