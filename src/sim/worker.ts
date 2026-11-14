/// <reference lib="webworker" />
// Web Worker entry: hosts the simulation engine off the UI thread.
import { Engine } from './engine.ts';
import type { FromWorker, ToWorker } from './protocol.ts';

const post = (m: FromWorker) => {
  if (m.type === 'frame') (self as DedicatedWorkerGlobalScope).postMessage(m, [m.data.mem.buffer]);
  else (self as DedicatedWorkerGlobalScope).postMessage(m);
};
const engine = new Engine(post);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init': engine.init(m.arch, m.board); break;
    case 'load': engine.load(m.hex, m.debug); break;
    case 'unload': engine.unload(); break;
    case 'erase': engine.erase(); break;
    case 'flash': engine.flash(m.hex, m.debug); break;
    case 'leaveBootloader': engine.leaveBootloader(); break;
    case 'iapSync': engine.setIapSync(m.on); break;
    case 'run': engine.run(); break;
    case 'pause': engine.pause(); break;
    case 'step': engine.step(m.mode); break;
    case 'reset': engine.reset(); break;
    case 'speed': engine.speed = m.value; break;
    case 'input': engine.input(m.ev); break;
    case 'breakpoints': engine.setBreakpoints(m.lines); break;
    case 'serialRx': for (const b of m.bytes) engine.mcu.serialRx(b); break;
    case 'disasm': engine.disasm(m.addr, m.count); break;
    case 'analyzer': engine.analyzer = m.enabled; break;
  }
};

setInterval(() => engine.tick(), 8);
