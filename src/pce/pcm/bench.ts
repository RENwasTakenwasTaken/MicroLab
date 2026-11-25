// PCM trainer on the bench: its pins and sockets, the two oscilloscope probes (needle tip + ground
// clip) and four stackable 2 mm patch cords: sine (or DC) into the modulator, PCM O/P into the
// demodulator, raw data into the filter. The sampling clock is wired inside the kit.

import { DESK_Y } from '../../lab3d/world.ts';
import type { CordDef, KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, CORD_ENTRY, LEVEL, TERMS, panelToWorld } from './layout.ts';

const C = { red: '#c8302b', yellow: '#e0b52e', green: '#2f9e57', blue: '#2f67c9' };
const cord = (n: number, color: keyof typeof C): CordDef => ({ id: `c${n}`, name: `Cord ${n} (${color})`, reach: 420, wire: C[color], ends: [C[color], C[color]] });
const CORDS: CordDef[] = [cord(1, 'red'), cord(2, 'yellow'), cord(3, 'green'), cord(4, 'blue')];

const Y = DESK_Y + 3;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3) => { out[id] = { id, kind, label, cable, attachedTo: null, rest }; };
  add('mains', 'ac', 'Kit mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'tip', 'CH1 probe tip', 'ch1', [140, Y, 225]);
  add('ch1g', 'clip', 'CH1 probe ground clip', 'ch1', [112, Y, 271]);
  add('ch2', 'tip', 'CH2 probe tip', 'ch2', [212, Y, 243]);
  add('ch2g', 'clip', 'CH2 probe ground clip', 'ch2', [186, Y, 287]);
  // cord ends along the front of the box
  CORDS.forEach((c, i) => {
    const x = -260 + i * 46, z = 240 + (i % 2) * 28;
    add(`${c.id}:a`, 'sleeve', `${c.name}, end A`, c.id, [x, Y, z]);
    add(`${c.id}:b`, 'sleeve', `${c.name}, end B`, c.id, [x + 18, Y, z + 12]);
  });
  return out;
}

const top = (k: string) => (k === 'pin' ? LEVEL.pin : LEVEL.sock) - LEVEL.panel;
const sockets: SocketDef[] = [
  ...TERMS.map((t): SocketDef => ({ id: t.id, kind: 'pin', pos: panelToWorld(t.x, t.y, top(t.kind)), label: t.label, noClip: t.kind === 'sock' })),
  WALL_SOCKET,
];

const left = KIT_POS[0] - BOX.w / 2, entry = panelToWorld(CORD_ENTRY.x, CORD_ENTRY.y);
export const PCM_BENCH: KitBench = {
  sockets, cords: CORDS, plugs, probes: true, stack: true,
  // as the last batch left it: 3 bit, FAST, sine about 1.5 V p-p at 1.7 kHz, DC pot near the middle
  knobs: { agAmp: 0.3, agFreq: 0.45, bit3: 1, slow: 0, sampF: 0.65, gain: 0.06, dc: 0.62 },
  cordFoot: [left - 22, DESK_Y + 3.4, entry[2] + 4],
  cordPath: [
    [entry[0], KIT_POS[1] + LEVEL.acrylic + 3, entry[2]], [entry[0] - 9, KIT_POS[1] + BOX.h + 7, entry[2]], [left + 4, KIT_POS[1] + BOX.h + 8, entry[2] + 1],
    [left - 9, KIT_POS[1] + BOX.h - 4, entry[2] + 2], [left - 12, DESK_Y + 30, entry[2] + 3], [left - 22, DESK_Y + 3.4, entry[2] + 4],
  ],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.pin },
};
