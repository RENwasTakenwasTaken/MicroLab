// FM MODEM kit on the bench: 4 mm sockets, banana patch cords, the oscilloscope's BNC-to-banana
// leads (red = signal, black = ground) and the multimeter's two leads.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, JACKS, LEVEL, panelToWorld } from './layout.ts';

const RED = '#c8302b', BLACK = '#1b1b1d';
const CORDS: CordDef[] = [1, 2, 3].map((n) => ({ id: `p${n}`, name: `Patch cord ${n}`, reach: 600, wire: RED, ends: [RED, RED] }));

const Y = DESK_Y + 5;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3, color?: string) => { out[id] = { id, kind, label, cable, attachedTo: null, rest, color }; };
  add('mains', 'ac', 'Kit mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'banana', 'CH1 lead, red plug (signal)', 'ch1', [96, Y, 150], RED);
  add('ch1g', 'banana', 'CH1 lead, black plug (ground)', 'ch1', [118, Y, 176], BLACK);
  add('ch2', 'banana', 'CH2 lead, red plug (signal)', 'ch2', [150, Y, 132], RED);
  add('ch2g', 'banana', 'CH2 lead, black plug (ground)', 'ch2', [172, Y, 158], BLACK);
  add('dmm:v', 'banana', 'Multimeter red lead (V)', 'dmm', [150, Y, 268], RED);
  add('dmm:com', 'banana', 'Multimeter black lead (COM)', 'dmm', [118, Y, 284], BLACK);
  const rests: V3[] = [[-250, Y, 232], [-196, Y, 250], [-150, Y, 236], [-92, Y, 256], [-48, Y, 234], [14, Y, 252]];
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

export const FM_BENCH: KitBench = {
  sockets, cords: CORDS, plugs,
  knobs: { modFreq: 0.63, sgAmp: 0.42, sgFreq: 0.5, pllFreq: 0.22 },
  cordFoot: [KIT_POS[0] - BOX.w / 2 - 20, DESK_Y + 3.4, KIT_POS[2] - 70],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.jack },
};
