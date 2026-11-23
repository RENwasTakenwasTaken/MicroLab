// Line-code trainer on the bench: its pins, sockets and ground posts, and the two oscilloscope
// probes (needle tip + ground clip). The codes are wired to the data generator inside the kit,
// so this practical needs no patch cords.

import { DESK_Y } from '../../lab3d/world.ts';
import type { KitBench, PcePlug, SocketDef, V3 } from '../kit.ts';
import { KIT_POS, WALL_SOCKET } from '../world.ts';
import { BOX, CORD_ENTRY, LEVEL, SWITCHES, TERMS, panelToWorld } from './layout.ts';

const Y = DESK_Y + 3;
function plugs(): Record<string, PcePlug> {
  const out: Record<string, PcePlug> = {};
  const add = (id: string, kind: PcePlug['kind'], label: string, cable: string, rest: V3) => { out[id] = { id, kind, label, cable, attachedTo: null, rest }; };
  add('mains', 'ac', 'Kit mains plug', 'mains', [-470, DESK_Y + 9, -300]);
  add('ch1', 'tip', 'CH1 probe tip', 'ch1', [120, Y, 215]);
  add('ch1g', 'clip', 'CH1 probe ground clip', 'ch1', [92, Y, 262]);
  add('ch2', 'tip', 'CH2 probe tip', 'ch2', [192, Y, 240]);
  add('ch2g', 'clip', 'CH2 probe ground clip', 'ch2', [166, Y, 286]);
  return out;
}

const top = (k: string) => (k === 'pin' ? LEVEL.pin : LEVEL.sock) - LEVEL.panel;
const sockets: SocketDef[] = [
  ...TERMS.map((t): SocketDef => ({ id: t.id, kind: 'pin', pos: panelToWorld(t.x, t.y, top(t.kind)), label: t.label, noClip: t.kind === 'sock' })),
  WALL_SOCKET,
];

const left = KIT_POS[0] - BOX.w / 2, entry = panelToWorld(CORD_ENTRY.x, CORD_ENTRY.y);
export const LC_BENCH: KitBench = {
  sockets, cords: [], plugs, probes: true,
  // data switches as the last batch left them: all down, so every output is a flat line until a word is set
  knobs: Object.fromEntries(SWITCHES.map((s) => [s.id, 0])),
  cordFoot: [left - 22, DESK_Y + 3.4, entry[2] + 4],
  // the fixed part of the mains cord: out of the cover, over the frame and down the left side
  cordPath: [
    [entry[0], KIT_POS[1] + LEVEL.acrylic + 3, entry[2]], [entry[0] - 9, KIT_POS[1] + BOX.h + 7, entry[2]], [left + 4, KIT_POS[1] + BOX.h + 8, entry[2] + 1],
    [left - 9, KIT_POS[1] + BOX.h - 4, entry[2] + 2], [left - 12, DESK_Y + 30, entry[2] + 3], [left - 22, DESK_Y + 3.4, entry[2] + 4],
  ],
  box: { w: BOX.w, d: BOX.d, top: LEVEL.pin },
};
