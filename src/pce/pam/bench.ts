// Sampling board on the bench: 4 mm sockets, banana patch cords, the oscilloscope's BNC-to-banana
// leads, and the board's DC adapter, whose mains plug is the only power switch it has.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, JACKS, LEVEL, panelToWorld } from './layout.ts';

const RED = '#c8302b', BLACK = '#1b1b1d';
const CORDS: CordDef[] = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `Patch cord ${n}`, reach: 600, wire: RED, ends: [RED, RED] }));
/** The adapter brick on the desk, left of the board. */
export const ADAPTER: V3 = [KIT_POS[0] - BOX.w / 2 - 78, DESK_Y, KIT_POS[2] - 30];

const Y = DESK_Y + 5;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3, color?: string) => { out[id] = { id, kind, label, cable, attachedTo: null, rest, color }; };
  add('mains', 'ac', 'Adapter mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'banana', 'CH1 lead, red plug (signal)', 'ch1', [96, Y, 150], RED);
  add('ch1g', 'banana', 'CH1 lead, black plug (ground)', 'ch1', [118, Y, 176], BLACK);
  add('ch2', 'banana', 'CH2 lead, red plug (signal)', 'ch2', [150, Y, 132], RED);
  add('ch2g', 'banana', 'CH2 lead, black plug (ground)', 'ch2', [172, Y, 158], BLACK);
  const rests: V3[] = [[-262, Y, 212], [-210, Y, 230], [-170, Y, 214], [-116, Y, 234], [-74, Y, 212], [-18, Y, 232], [24, Y, 214], [78, Y, 236]];
  CORDS.forEach((c, i) => {
    add(`${c.id}:a`, 'banana', `${c.name}, end A`, c.id, rests[i * 2], RED);
    add(`${c.id}:b`, 'banana', `${c.name}, end B`, c.id, rests[i * 2 + 1], RED);
  });
  return out;
}

const sockets: SocketDef[] = [
  ...JACKS.map((j): SocketDef => ({ id: j.id, kind: 'jack', pos: panelToWorld(j.x, j.y, LEVEL.jack - LEVEL.panel), label: j.label })),
  WALL_SOCKET,
];

export const PAM_BENCH: KitBench = {
  sockets, cords: CORDS, plugs,
  knobs: { p1: 0.3, p2: 0.62, p3: 0.2, p4: 0.3 },
  cordFoot: [ADAPTER[0], DESK_Y + 14, ADAPTER[2] - 42],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.jack },
  noSwitch: true,
};
