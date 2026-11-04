// Runs a real XC8-compiled HEX on the emulator and reports LATB/LATC transitions.
import { readFileSync } from 'node:fs';
import { Pic18 } from '../src/sim/pic18/pic18.ts';
const hex = readFileSync(process.argv[2], 'utf8');
const events = [];
const bus = {
  readInputs: () => 0,
  outputsChanged: (p, l, d, c) => events.push([p, l, d, c]),
  analogVoltage: () => 2.5,
  serialTx: (b) => process.stdout.write(String.fromCharCode(b)),
  log: (lv, m) => console.log(`[${lv}]`, m),
};
const mcu = new Pic18(bus);
console.log(mcu.loadHex(hex));
console.log('clock', mcu.clockInfo());
const t0 = performance.now();
const target = mcu.cycleHz() * Number(process.argv[3] ?? 2);
let n = 0;
while (mcu.cycles < target) { mcu.step(); n++; }
const ms = performance.now() - t0;
console.log(`executed ${n} instr, ${mcu.cycles} cycles in ${ms.toFixed(0)} ms (${(n / ms / 1000).toFixed(1)} MIPS)`);
const hz = mcu.cycleHz();
for (const [p, l, d, c] of events.filter(e => e[0] === 1).slice(0, 8)) console.log('PORTB', l.toString(16), 'driven', d.toString(16), 't=', (c / hz * 1000).toFixed(3), 'ms');
const pc = events.filter(e => e[0] === 2);
console.log('PORTC changes', pc.length, pc.slice(1, 5).map(e => (e[3] / hz * 1000).toFixed(4)));
