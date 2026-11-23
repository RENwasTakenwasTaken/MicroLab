// Bench layout of the PCE lab (millimetres, y up; same desk and wall as the EP lab).

import { DESK_Y, rotateY } from '../lab3d/world.ts';
import type { SocketDef, V3 } from './kit.ts';

export { dist } from './kit.ts';
export type { SocketDef, V3 } from './kit.ts';

/** Centre of the kit's box on the desk top. */
export const KIT_POS: V3 = [-110, DESK_Y, 70];
/** Tektronix TDS1002 beside the kit, turned towards the student. */
export const SCOPE = { pos: [330, DESK_Y, -40] as V3, rotY: -0.46, w: 324, h: 151, d: 124 };
/** Front-panel positions (x from the centre, y from the middle of the face) of the BNC inputs. */
export const BNC = { ch1: [28, -52], ch2: [68, -52], ext: [108, -52] } as const;
export const scopePoint = (x: number, y: number, out = 0): V3 =>
  rotateY([x, SCOPE.h / 2 + 4 + y, SCOPE.d / 2 + out], SCOPE.rotY, SCOPE.pos);

/** MECO 801 multimeter lying in front of the oscilloscope (kits that need one). */
export const DMM = { pos: [228, DESK_Y, 196] as V3, rotY: -0.3 };
/** The meter's COM and V jacks, where its leads leave. */
export const dmmJack = (which: 'com' | 'v'): V3 => rotateY([which === 'com' ? 8 : 29, 22, 80], DMM.rotY, DMM.pos);

/** Switchboard on the wall behind the bench, far enough left to be seen past the kit's open lid: the kit's mains plug goes here. */
export const WALL_POS: V3 = [-560, DESK_Y + 235, -520];
export const WALL_SOCKET: SocketDef = { id: 'wall', kind: 'ac', pos: [WALL_POS[0] + 34, WALL_POS[1], WALL_POS[2] + 9.4], label: 'Wall socket (230 V)' };

/** Every place a plug can go on the kit now on the bench (set when an experiment opens). */
export let SOCKETS: SocketDef[] = [];
export let SOCKET: Record<string, SocketDef> = {};
export function useSockets(list: SocketDef[]) {
  SOCKETS = list;
  SOCKET = Object.fromEntries(list.map((s) => [s.id, s]));
}
