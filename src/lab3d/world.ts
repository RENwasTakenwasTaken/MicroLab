// World layout of the lab bench (millimetres, y up). The trainer sits at the
// origin exactly as in the board view; everything else is placed around it.

import { BASE, FRC_POINTS, MODULE } from '../three/layout.ts';

export type V3 = [number, number, number];

export const DESK_Y = -7; // top surface of the desk (the trainer's wooden tray rests on it)

/** Trainer photo coordinates (mm) + height above the base PCB -> world coordinates. */
export function boardToWorld(px: number, py: number, h = 0): V3 {
  return [BASE.h / 2 - py, h, px - BASE.w / 2];
}

export const MODULE_TOP = MODULE.elevation + MODULE.t;

export const COMPUTER = {
  monitor: { pos: [-470, DESK_Y, -330] as V3, rotY: 0.32, screenW: 433, screenH: 243, panelW: 466, panelH: 282, screenY: 300 },
  tower: { pos: [-830, DESK_Y, -260] as V3, rotY: 0.18, w: 180, h: 400, d: 400 },
  keyboard: { pos: [-410, DESK_Y, -110] as V3, rotY: 0.3 },
  mouse: { pos: [-215, DESK_Y, -60] as V3 },
};

export const SCOPE = { pos: [470, DESK_Y, -330] as V3, rotY: -0.32, w: 324, h: 151, d: 124 };
export const SIGGEN = { pos: [800, DESK_Y, -210] as V3, rotY: -0.55, w: 290, h: 95, d: 250 };
export const DMM = { pos: [270, DESK_Y, 150] as V3, rotY: -0.35, tilt: 0.38 };

// ------------------------------------------------------------- sockets
export type SocketKind = 'frc' | 'usb' | 'probe';

export interface SocketDef {
  id: string;
  kind: SocketKind;
  label: string;
  pos: V3;
  /** yaw of the connector's long axis (rad), used to orient plugs */
  yaw: number;
  /** FRC only: which side of a ribbon this connector is */
  frcRole?: 'port' | 'peripheral';
  /** probe test points: electrical node */
  node?: TestNode;
}

export type TestNode = { kind: 'pin'; port: number; bit: number } | { kind: 'gnd' } | { kind: 'vcc' } | { kind: 'gen' };

const PORT_IDX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Header pin lists exactly as printed on the module (text is rotated 180°, so word k sits at the right). */
const HEADERS: { x: number; y: number; labels: string[] }[] = [
  { x: 31, y: 74, labels: ['RB7', 'RB6', 'RB5', 'RB4', 'RB3', 'RB2', 'RB1', 'RB0', 'GND', 'VCC'] },
  { x: 57.5, y: 74, labels: ['RD7', 'RD6', 'RD5', 'RD4', 'RD3', 'RD2', 'RD1', 'RD0', 'GND', 'VCC'] },
  { x: 26.8, y: 119.6, labels: ['VCC', 'GND', 'RA0', 'RA1', 'RA2', 'RA3', 'RA4', 'RA5'] },
  { x: 47.3, y: 119.6, labels: ['VCC', 'GND', 'RE0', 'RE1', 'RE2'] },
  { x: 70.5, y: 119.6, labels: ['VCC', 'GND', 'RC0', 'RC1', 'RC2', 'RC3', 'RC4', 'RC5', 'RC6', 'RC7'] },
];

function buildSockets(): SocketDef[] {
  const out: SocketDef[] = [];
  for (const [name, p] of Object.entries(FRC_POINTS)) {
    const h = (p.module ? MODULE_TOP : 0) + 9;
    out.push({
      id: `frc:${name}`, kind: 'frc', label: name.replace('_', ' '), pos: boardToWorld(p.x, p.y, h),
      yaw: -((p.rot * Math.PI) / 180) - Math.PI / 2, frcRole: name.startsWith('PORT') ? 'port' : 'peripheral',
    });
  }
  out.push({ id: 'usb:board', kind: 'usb', label: 'USB-B (PIC)', pos: boardToWorld(-3, 142, 6), yaw: Math.PI / 2 });
  HEADERS.forEach((hd, hi) => {
    const n = hd.labels.length;
    hd.labels.forEach((lab, k) => {
      const px = hd.x + ((n - 1) / 2 - k) * 2.54;
      const node: TestNode = lab === 'GND' ? { kind: 'gnd' } : lab === 'VCC' ? { kind: 'vcc' } : { kind: 'pin', port: PORT_IDX[lab[1]], bit: +lab[2] };
      out.push({ id: `tp:${hi}:${lab}`, kind: 'probe', label: lab, pos: boardToWorld(px, hd.y, MODULE_TOP + 9.8), yaw: 0, node });
    });
  });
  // signal generator output clip lying on the desk
  out.push({ id: 'tp:gen', kind: 'probe', label: 'SIG GEN OUT', pos: [SIGGEN.pos[0] - 175, DESK_Y + 6, SIGGEN.pos[2] + 150], yaw: 0, node: { kind: 'gen' } });
  return out;
}

export const SOCKETS: SocketDef[] = buildSockets();
export const SOCKET = Object.fromEntries(SOCKETS.map((s) => [s.id, s])) as Record<string, SocketDef>;

/** Fixed cable origins (instrument jacks, PC port), world coordinates. */
export function rotateY(p: V3, yaw: number, origin: V3): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [origin[0] + p[0] * c + p[2] * s, origin[1] + p[1], origin[2] - p[0] * s + p[2] * c];
}

export const ANCHORS = {
  pcUsb: rotateY([40, 330, COMPUTER.tower.d / 2 + 2], COMPUTER.tower.rotY, COMPUTER.tower.pos),
  scopeCh1: rotateY([66, 18, SCOPE.d / 2 + 18], SCOPE.rotY, SCOPE.pos),
  scopeCh2: rotateY([102, 18, SCOPE.d / 2 + 18], SCOPE.rotY, SCOPE.pos),
  dmmCom: rotateY([7, 10, 78], DMM.rotY, DMM.pos),
  dmmV: rotateY([30, 10, 78], DMM.rotY, DMM.pos),
  genOut: rotateY([128, 22, SIGGEN.d / 2 + 6], SIGGEN.rotY, SIGGEN.pos),
};
