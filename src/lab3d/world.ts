// World layout of the lab bench (millimetres, y up). The trainer sits at the
// origin exactly as in the board view; everything else is placed around it.

import { BASE, FRC_LABEL, FRC_POINTS, MODULE, frcPointsFor, type BoardVariant } from '../three/layout.ts';

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

/**
 * Modular switchboard on the wall in front of the bench (centre of the plate on the wall surface,
 * size in mm): the mains switch on the left, the socket on the right.
 */
export const WALLBOARD = { pos: [150, DESK_Y + 235, -520] as V3, w: 150, h: 90, d: 9, socketX: 34, switchX: -38 };
/** The 12 V adapter brick lying on the desk between the wall and the trainer (centre of its base). */
export const ADAPTER = { pos: [96, DESK_Y, -400] as V3, w: 52, h: 32, d: 90 };
/** Base board 12 V DC jack mouth (the adapter's barrel plug goes in here, pointing towards -z). */
export const DC_JACK: V3 = boardToWorld(9 - 7.05, 9.5, 6);
/** The barrel plug's length and the end of it where the adapter's DC cord leaves. */
export const BARREL_LEN = 22;
export const BARREL_BACK: V3 = [DC_JACK[0], DC_JACK[1], DC_JACK[2] - BARREL_LEN];

// ------------------------------------------------------------- sockets
/** frc: ribbon plug · usb: Type-B · probe: test point for probe jumpers / DMM leads · dcm: motor connector pin · ac: mains socket */
export type SocketKind = 'frc' | 'usb' | 'probe' | 'dcm' | 'ac';

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
  /** dcm pins: which motor connector (1 = DCM1, 2 = DCM2) and pin (1 or 2) */
  dcm?: { conn: 1 | 2; pin: 1 | 2 };
  /** wall-mounted: the plug goes in horizontally, towards -z */
  wall?: boolean;
  /** only present with this module on the base board (omitted: base board / bench, both kits) */
  variant?: BoardVariant;
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

/** EXCEL-51 module port headers (P0/P2 printed like PORT-B/D, P1/P3 like PORT-A/C). */
const P = (n: number) => Array.from({ length: 8 }, (_, b) => `P${n}.${b}`);
const HEADERS_51: { x: number; y: number; labels: string[] }[] = [
  { x: 29.7, y: 75.4, labels: [...P(0).reverse(), 'GND', 'VCC'] },
  { x: 56, y: 75.2, labels: [...P(2).reverse(), 'GND', 'VCC'] },
  { x: 28.2, y: 118.7, labels: ['VCC', 'GND', ...P(1)] },
  { x: 56, y: 118.7, labels: ['VCC', 'GND', ...P(3)] },
];

const UART_HDR = { x: 49.8, y: 150.8 };

function buildSockets(): SocketDef[] {
  const out: SocketDef[] = [];
  const frc = (points: typeof FRC_POINTS, variant?: BoardVariant) => {
    for (const [name, p] of Object.entries(points)) {
      if (variant ? !p.module : out.some((s) => s.id === `frc:${name}`)) continue; // base-board connectors once, for both kits
      const h = (p.module ? MODULE_TOP : 0) + 9;
      out.push({
        id: `frc:${name}`, kind: 'frc', label: FRC_LABEL[name] ?? name, pos: boardToWorld(p.x, p.y, h),
        yaw: -((p.rot * Math.PI) / 180) - Math.PI / 2, frcRole: /^PORT|^P\d$/.test(name) ? 'port' : 'peripheral',
        variant: p.module ? variant : undefined,
      });
    }
  };
  frc(Object.fromEntries(Object.entries(FRC_POINTS).filter(([, p]) => !p.module)));
  frc(FRC_POINTS, 'pic18');
  frc(frcPointsFor('mcs51'), 'mcs51');
  out.push({ id: 'usb:board', kind: 'usb', label: 'USB-B (PIC)', pos: boardToWorld(7, 130.5, MODULE_TOP + 6), yaw: Math.PI / 2, variant: 'pic18' });
  // 8051 kit: the lab PC's Type-B cable goes into the base board's USB2UART port (CP2102), whose mouth faces the board's far edge
  out.push({ id: 'usb:uart', kind: 'usb', label: 'USB2UART (CP2102) — 8051 programming port', pos: boardToWorld(14.7, 173, 6), yaw: 0, variant: 'mcs51' });
  HEADERS.forEach((hd, hi) => {
    const n = hd.labels.length;
    hd.labels.forEach((lab, k) => {
      const px = hd.x + ((n - 1) / 2 - k) * 2.54;
      const node: TestNode = lab === 'GND' ? { kind: 'gnd' } : lab === 'VCC' ? { kind: 'vcc' } : { kind: 'pin', port: PORT_IDX[lab[1]], bit: +lab[2] };
      out.push({ id: `tp:${hi}:${lab}`, kind: 'probe', label: lab, pos: boardToWorld(px, hd.y, MODULE_TOP + 9.8), yaw: 0, node, variant: 'pic18' });
    });
  });
  HEADERS_51.forEach((hd, hi) => {
    const n = hd.labels.length;
    hd.labels.forEach((lab, k) => {
      const px = hd.x + ((n - 1) / 2 - k) * 2.54;
      const node: TestNode = lab === 'GND' ? { kind: 'gnd' } : lab === 'VCC' ? { kind: 'vcc' } : { kind: 'pin', port: +lab[1], bit: +lab[3] };
      out.push({ id: `tp51:${hi}:${lab}`, kind: 'probe', label: lab, pos: boardToWorld(px, hd.y, MODULE_TOP + 9.8), yaw: 0, node, variant: 'mcs51' });
    });
  });
  // UART header (base board, GND · RXD1 · TXD1 · RXD0 · TXD0 · VCC as printed): its GND pin grounds the scope probes
  out.push({ id: 'tp:uart:GND', kind: 'probe', label: 'GND (UART header)', pos: boardToWorld(UART_HDR.x + 2.5 * 2.54, UART_HDR.y, 9.8), yaw: 0, node: { kind: 'gnd' } });
  // DCM1 / DCM2 relimate pins: the gear motor's female jumper wires go here
  ([[1, 90.2], [2, 99.5]] as const).forEach(([conn, x]) => {
    ([1, 2] as const).forEach((pin) => {
      out.push({ id: `dcm:${conn}:${pin}`, kind: 'dcm', label: `DCM${conn} pin ${pin}`, pos: boardToWorld(x + (pin === 1 ? -1.27 : 1.27), 3.5, 9), yaw: 0, dcm: { conn, pin } });
    });
  });
  // wall socket: the adapter's 2-pin plug goes here
  out.push({ id: 'ac:wall', kind: 'ac', label: 'Wall socket (230 V)', pos: [WALLBOARD.pos[0] + WALLBOARD.socketX, WALLBOARD.pos[1], WALLBOARD.pos[2] + WALLBOARD.d + 0.4], yaw: 0, wall: true });
  // signal generator output clip lying on the desk
  out.push({ id: 'tp:gen', kind: 'probe', label: 'SIG GEN OUT', pos: [SIGGEN.pos[0] - 175, DESK_Y + 6, SIGGEN.pos[2] + 150], yaw: 0, node: { kind: 'gen' } });
  return out;
}

/** Every connector of both kits (look-ups by id); socketsFor() gives the ones on the bench. */
export const SOCKETS: SocketDef[] = buildSockets();
export const SOCKET = Object.fromEntries(SOCKETS.map((s) => [s.id, s])) as Record<string, SocketDef>;
const BY_VARIANT: Record<BoardVariant, SocketDef[]> = {
  pic18: SOCKETS.filter((s) => !s.variant || s.variant === 'pic18'),
  mcs51: SOCKETS.filter((s) => !s.variant || s.variant === 'mcs51'),
};
/** Connectors present with the given module on the base board. */
export const socketsFor = (v: BoardVariant) => BY_VARIANT[v];

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
  scopeGnd: rotateY([60, 18, SCOPE.d / 2 + 18], SCOPE.rotY, SCOPE.pos),
};

/**
 * The external gear motor on its fixed metal stand, beside the DCM connectors (trainer photo
 * coordinates, mm; h = height above the base PCB). Its relimate's two male pins carry the
 * permanently attached female jumper wires (red = pin 1, black = pin 2).
 */
export const MOTOR = { x: 74, y: -25, h: 32 };
export const MOTOR_PINS: [V3, V3] = [
  boardToWorld(MOTOR.x - 54, MOTOR.y - 1.27, MOTOR.h),
  boardToWorld(MOTOR.x - 54, MOTOR.y + 1.27, MOTOR.h),
];
