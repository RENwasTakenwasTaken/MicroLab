// AM trainer on the bench: its connectors, the two oscilloscope probes (needle tip + ground clip),
// the 2 mm patch cords and where everything lies at the start of a lab turn.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, CORD_ENTRY, LEVEL, PANEL, PINS, panelToWorld } from './layout.ts';

/** Patch cords: one short link and two long cords (2 mm sleeves at both ends). */
const CORDS: CordDef[] = [
  { id: 'c1', name: 'Short link', reach: 60, wire: '#c8302b', ends: ['#c8302b', '#2f67c9'] },
  { id: 'c2', name: 'Long cord (red)', reach: 420, wire: '#c8302b', ends: ['#2f9e57', '#c8302b'] },
  { id: 'c3', name: 'Long cord (yellow)', reach: 420, wire: '#e0b52e', ends: ['#e0b52e', '#e0b52e'] },
];

const Y = DESK_Y + 3;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (p: PcePlug) => { out[p.id] = p; };
  add({ id: 'mains', kind: 'ac', label: 'Kit mains plug', cable: 'mains', attachedTo: null, rest: [-470, DESK_Y + 9, -300] });
  add({ id: 'ch1', kind: 'tip', label: 'CH1 probe tip', cable: 'ch1', attachedTo: null, rest: [140, Y, 215] });
  add({ id: 'ch1g', kind: 'clip', label: 'CH1 probe ground clip', cable: 'ch1', attachedTo: null, rest: [112, Y, 262] });
  add({ id: 'ch2', kind: 'tip', label: 'CH2 probe tip', cable: 'ch2', attachedTo: null, rest: [212, Y, 240] });
  add({ id: 'ch2g', kind: 'clip', label: 'CH2 probe ground clip', cable: 'ch2', attachedTo: null, rest: [186, Y, 286] });
  const rests: V3[] = [[-262, Y, 262], [-222, Y, 268], [-176, Y, 268], [-72, Y, 286], [-26, Y, 266], [62, Y, 282]];
  CORDS.forEach((c, i) => {
    add({ id: `${c.id}:a`, kind: 'sleeve', label: `${c.name}, end A`, cable: c.id, attachedTo: null, rest: rests[i * 2] });
    add({ id: `${c.id}:b`, kind: 'sleeve', label: `${c.name}, end B`, cable: c.id, attachedTo: null, rest: rests[i * 2 + 1] });
  });
  return out;
}

const sockets: SocketDef[] = [
  ...PINS.map((p): SocketDef => ({ id: p.id, kind: 'pin', pos: panelToWorld(p.x, p.y, LEVEL.pin - LEVEL.panel), label: p.label })),
  WALL_SOCKET,
];

export const AM_BENCH: KitBench = {
  sockets, cords: CORDS, plugs,
  // pots wherever the last batch left them
  knobs: { agAmp: 0.16, agFreq: 0.58, rfFreq: 0.34, rfAmp: 0.47 },
  cordFoot: [KIT_POS[0] - BOX.w / 2 - 22, DESK_Y + 3.4, KIT_POS[2] + CORD_ENTRY.y - PANEL.h / 2 + 4],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.pin },
};
