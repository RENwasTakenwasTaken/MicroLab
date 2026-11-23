// DSSS trainer on the bench: its pins and sockets, the two oscilloscope probes (needle tip + ground
// clip) and the stackable 2 mm patch cords that link the blocks into a transmitter and a receiver.
// The clocks (PN clock, bit clock, 200 kHz, the RF generator's 500 kHz) and the detector's carrier
// are wired inside the kit.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, CORD_ENTRY, LEVEL, SWITCHES, TERMS, panelToWorld } from './layout.ts';

const C = { red: '#c8302b', green: '#2f9e57', blue: '#2f67c9', yellow: '#e0b52e', black: '#232427' };
const cord = (n: number, color: keyof typeof C): CordDef => ({ id: `c${n}`, name: `Cord ${n} (${color})`, reach: 420, wire: C[color], ends: [C[color], C[color]] });
const CORDS: CordDef[] = [cord(1, 'red'), cord(2, 'red'), cord(3, 'green'), cord(4, 'green'), cord(5, 'yellow'), cord(6, 'red'), cord(7, 'green'), cord(8, 'blue'), cord(9, 'blue'), cord(10, 'black')];

const Y = DESK_Y + 3;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3) => { out[id] = { id, kind, label, cable, attachedTo: null, rest }; };
  add('mains', 'ac', 'Kit mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'tip', 'CH1 probe tip', 'ch1', [140, Y, 250]);
  add('ch1g', 'clip', 'CH1 probe ground clip', 'ch1', [112, Y, 296]);
  add('ch2', 'tip', 'CH2 probe tip', 'ch2', [212, Y, 268]);
  add('ch2g', 'clip', 'CH2 probe ground clip', 'ch2', [186, Y, 312]);
  // cord ends in two rows along the front of the box
  CORDS.forEach((c, i) => {
    const x = -300 + i * 38, z = 262 + (i % 2) * 30;
    add(`${c.id}:a`, 'sleeve', `${c.name}, end A`, c.id, [x, Y, z]);
    add(`${c.id}:b`, 'sleeve', `${c.name}, end B`, c.id, [x + 16, Y, z + 12]);
  });
  return out;
}

const top = (k: string) => (k === 'pin' ? LEVEL.pin : LEVEL.sock) - LEVEL.panel;
const sockets: SocketDef[] = [
  ...TERMS.map((t): SocketDef => ({ id: t.id, kind: 'pin', pos: panelToWorld(t.x, t.y, top(t.kind)), label: t.label, noClip: t.kind === 'sock' })),
  WALL_SOCKET,
];

const left = KIT_POS[0] - BOX.w / 2, entry = panelToWorld(CORD_ENTRY.x, CORD_ENTRY.y);
export const DSSS_BENCH: KitBench = {
  sockets, cords: CORDS, plugs, probes: true, stack: true,
  // data switches all down; the PN register empty (pn = 1 once PRBS has been pressed)
  knobs: { ...Object.fromEntries(SWITCHES.map((s) => [s.id, 0])), pn: 0 },
  cordFoot: [left - 22, DESK_Y + 3.4, entry[2] + 4],
  cordPath: [
    [entry[0], KIT_POS[1] + LEVEL.acrylic + 3, entry[2]], [entry[0] - 9, KIT_POS[1] + BOX.h + 7, entry[2]], [left + 4, KIT_POS[1] + BOX.h + 8, entry[2] + 1],
    [left - 9, KIT_POS[1] + BOX.h - 4, entry[2] + 2], [left - 12, DESK_Y + 30, entry[2] + 3], [left - 22, DESK_Y + 3.4, entry[2] + 4],
  ],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.pin },
};
