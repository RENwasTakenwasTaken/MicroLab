// What every PCE trainer kit gives the shared bench: its connectors, the leads and cords that go
// with it, and where its controls start. Each kit folder (am/, fm/) fills one of these in.

export type V3 = [number, number, number];
export type KitId = 'am' | 'fm' | 'pam' | 'pcm' | 'lc' | 'mf' | 'fsk' | 'dsss';

/** pin: 2 mm hollow rod (AM kit) · jack: 4 mm banana socket · ac: wall socket */
export type SocketKind = 'pin' | 'jack' | 'ac';
export interface SocketDef { id: string; kind: SocketKind; pos: V3; label: string; /** a flush 2 mm socket: a probe tip goes in, a crocodile clip has nothing to hold */ noClip?: boolean }

/**
 * tip: probe needle (goes into a hollow pin) · clip: probe ground crocodile clip · sleeve: 2 mm patch
 * cord end · banana: 4 mm stackable plug (patch cord, scope lead or meter lead) · ac: mains plug
 */
export type PlugKind = 'tip' | 'clip' | 'sleeve' | 'banana' | 'ac';
export interface PcePlug {
  id: string; kind: PlugKind; label: string;
  /** the cable, probe or instrument lead this end belongs to */
  cable: string;
  attachedTo: string | null;
  /** where it lies when not attached */
  rest: V3;
  /** body colour of a banana plug */
  color?: string;
  /** order of plugging in: stacked banana plugs sit in that order */
  seq?: number;
}
export interface CordDef { id: string; name: string; reach: number; wire: string; ends: readonly [string, string] }

export interface KitBench {
  sockets: SocketDef[];
  cords: readonly CordDef[];
  plugs(): Record<string, PcePlug>;
  /** pot positions the kit is found with, 0 (fully anticlockwise) to 1 */
  knobs: Record<string, number>;
  /** the oscilloscope is used with probes (needle tip + ground clip) instead of BNC-to-banana leads */
  probes?: boolean;
  /** fixed part of the mains cord, from the panel to cordFoot (world points) */
  cordPath?: V3[];
  /** where the kit's fixed mains cord reaches the desk */
  cordFoot: V3;
  /** footprint of the box on the desk and the height of its tallest connector, for carrying plugs over it */
  box: { w: number; d: number; top: number };
  /** the kit has no power switch of its own: it is on whenever its mains plug is in */
  noSwitch?: boolean;
  /** the 2 mm patch cords are stackable: a second cord's plug, or a probe needle, goes into the back of a cord's plug */
  stack?: boolean;
}

export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
