// Matched-filter trainer on the bench: its pins and 2 mm sockets, the two oscilloscope probes
// (needle tip + ground clip) and four 2 mm patch cords: data and noise into the adder, the noisy
// signal into the integrate and dump filter, and the bit clock to its dump input.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { AMP_KNOB, BOX, CORD_ENTRY, LEVEL, SWITCHES, TERMS, panelToWorld } from './layout.ts';

const CORDS: CordDef[] = [
  { id: 'c1', name: 'Long cord (red)', reach: 420, wire: '#c8302b', ends: ['#c8302b', '#c8302b'] },
  { id: 'c2', name: 'Short cord (green)', reach: 70, wire: '#2f9e57', ends: ['#2f9e57', '#2f9e57'] },
  { id: 'c3', name: 'Long cord (green)', reach: 420, wire: '#2f9e57', ends: ['#2f9e57', '#2f9e57'] },
  { id: 'c4', name: 'Long cord (blue)', reach: 420, wire: '#2f67c9', ends: ['#2f67c9', '#2f67c9'] },
];

const Y = DESK_Y + 3;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3) => { out[id] = { id, kind, label, cable, attachedTo: null, rest }; };
  add('mains', 'ac', 'Kit mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'tip', 'CH1 probe tip', 'ch1', [120, Y, 215]);
  add('ch1g', 'clip', 'CH1 probe ground clip', 'ch1', [92, Y, 262]);
  add('ch2', 'tip', 'CH2 probe tip', 'ch2', [192, Y, 240]);
  add('ch2g', 'clip', 'CH2 probe ground clip', 'ch2', [166, Y, 286]);
  const rests: V3[] = [[-262, Y, 262], [-212, Y, 270], [-168, Y, 266], [-140, Y, 272], [-96, Y, 286], [-40, Y, 266], [4, Y, 290], [62, Y, 282]];
  CORDS.forEach((c, i) => {
    add(`${c.id}:a`, 'sleeve', `${c.name}, end A`, c.id, rests[i * 2]);
    add(`${c.id}:b`, 'sleeve', `${c.name}, end B`, c.id, rests[i * 2 + 1]);
  });
  return out;
}

const top = (k: string) => (k === 'pin' ? LEVEL.pin : LEVEL.sock) - LEVEL.panel;
const sockets: SocketDef[] = [
  ...TERMS.map((t): SocketDef => ({ id: t.id, kind: 'pin', pos: panelToWorld(t.x, t.y, top(t.kind)), label: t.label, noClip: t.kind === 'sock' })),
  WALL_SOCKET,
];

const left = KIT_POS[0] - BOX.w / 2, entry = panelToWorld(CORD_ENTRY.x, CORD_ENTRY.y);
export const MF_BENCH: KitBench = {
  sockets, cords: CORDS, plugs, probes: true,
  // data switches all down, and the noise pot wherever the last batch left it
  knobs: { ...Object.fromEntries(SWITCHES.map((s) => [s.id, 0])), [AMP_KNOB.id]: 0.45 },
  cordFoot: [left - 22, DESK_Y + 3.4, entry[2] + 4],
  cordPath: [
    [entry[0], KIT_POS[1] + LEVEL.acrylic + 3, entry[2]], [entry[0] - 9, KIT_POS[1] + BOX.h + 7, entry[2]], [left + 4, KIT_POS[1] + BOX.h + 8, entry[2] + 1],
    [left - 9, KIT_POS[1] + BOX.h - 4, entry[2] + 2], [left - 12, DESK_Y + 30, entry[2] + 3], [left - 22, DESK_Y + 3.4, entry[2] + 4],
  ],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.pin },
};
