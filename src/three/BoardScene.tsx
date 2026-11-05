// Assembles the EXCEL PIC V1.0 trainer from the parametric layout.

import { useMemo, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../app/store.ts';
import type { PicBoardConfig } from '../sim/board/types.ts';
import { BASE, FRC_LABEL, FRC_POINTS, MODULE, PARTS, type Part } from './layout.ts';
import {
  Box, BoxHeader, CapC, CapE, Crystal, DcJack, Db9, Diode, Dip, Header, Icsp, Jumper, MAT, Qfn, RelayBody,
  Relimate, Resistor, Regulator, Screw, Sip, Socket, Standoff, Terminal, To92, UsbB, Zif,
} from './parts.tsx';
import {
  Buzzer, DcMotor, DipSwitch, LcdModule, Led, Lm35, RgbLed, SlideSwitch, TactSwitch, TestLamp, Trimpot, Wire, useHover,
} from './interactive.tsx';
import { silkscreenTexture } from './textures.ts';
import { StaticBatch } from './perf.tsx';

/** Parts that never move or change: merged into a few draw calls in performance mode. */
const STATIC_KINDS = new Set<Part['kind']>([
  'dip', 'socket', 'header', 'boxHeader', 'resistor', 'capE', 'capC', 'crystal', 'dcJack', 'usbB', 'db9', 'relay',
  'terminal', 'regulator', 'zif', 'to92', 'jumper', 'relimate', 'icsp', 'screw', 'qfn', 'sip', 'diode',
]);
const isStatic = (p: Part) => STATIC_KINDS.has(p.kind) && !(p.kind === 'to92' && p.sensor);
/** Left out entirely in performance mode. */
const PASSIVES = new Set<Part['kind']>(['resistor', 'capE', 'capC', 'diode']);
const INDEXED = PARTS.map((p, i) => ({ p, key: p.id ?? String(i) }));

function PartView({ p }: { p: Part }) {
  const hover = useHover({ name: p.name ?? p.kind, info: p.info });
  const plain = (node: ReactNode) => (p.name || p.info ? <group {...hover}>{node}</group> : node);
  switch (p.kind) {
    case 'dip': return plain(<Dip pins={p.pins} label={p.label} sub={p.sub} wide={p.wide} socket={p.socket} />);
    case 'socket': return plain(<Socket pins={p.pins} />);
    case 'header': return plain(<Header n={p.n} rows={p.rows} female={p.female} />);
    case 'boxHeader': return plain(<BoxHeader color={p.color} />);
    case 'tact': return <TactSwitch input={p.input} size={p.size} cap={p.cap} name={p.name} info={p.info} />;
    case 'dipSwitch': return <DipSwitch n={p.n} bank={p.bank} name={p.name} info={p.info} />;
    case 'led': return <Led color={p.color} d={p.d} signal={p.signal} name={p.name} info={p.info} />;
    case 'rgbLed': return <RgbLed name={p.name} info={p.info} />;
    case 'resistor': return plain(<Resistor />);
    case 'capE': return plain(<CapE d={p.d} h={p.h} color={p.color} />);
    case 'capC': return plain(<CapC color={p.color} />);
    case 'crystal': return plain(<Crystal type={p.type} />);
    case 'dcJack': return plain(<DcJack />);
    case 'usbB': return plain(<UsbB />);
    case 'db9': return plain(<Db9 />);
    case 'relay': return plain(<RelayBody />);
    case 'buzzer': return <Buzzer d={p.d} name={p.name} info={p.info} />;
    case 'lcd': return <LcdModule name={p.name} info={p.info} />;
    case 'trimpot': return <Trimpot input={p.input} name={p.name} info={p.info} />;
    case 'terminal': return plain(<Terminal n={p.n} color={p.color} />);
    case 'regulator': return plain(<Regulator />);
    case 'zif': return plain(<Zif />);
    case 'to92': return p.sensor ? <Lm35 name={p.name} info={p.info} /> : plain(<To92 />);
    case 'slide': return <SlideSwitch name={p.name} info={p.info} />;
    case 'jumper': return plain(<Jumper n={p.n} cap={p.cap} />);
    case 'relimate': return plain(<Relimate n={p.n} />);
    case 'icsp': return plain(<Icsp />);
    case 'screw': return <Screw />;
    case 'qfn': return plain(<Qfn size={p.size} />);
    case 'sip': return plain(<Sip n={p.n} />);
    case 'diode': return plain(<Diode />);
  }
}

function Pcb({ w, h, t, x, y, elevation, module }: { w: number; h: number; t: number; x: number; y: number; elevation: number; module: boolean }) {
  const tex = useMemo(() => silkscreenTexture(module), [module]);
  return (
    <group position={[x + w / 2, elevation, y + h / 2]}>
      <mesh position={[0, -t / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[w, t, h]} />
        <primitive object={MAT.pcbEdge} attach="material" />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.55} metalness={0.05} />
      </mesh>
    </group>
  );
}

const PORT_LABEL = ['PORT-A', 'PORT-B', 'PORT-C', 'PORT-D', 'PORT-E'];

function Labels() {
  const show = useLab((s) => s.showLabels);
  const cfg = useLab((s) => s.boardCfg) as PicBoardConfig;
  if (!show) return null;
  const used = new Map<string, string>();
  for (const [t, port] of Object.entries(cfg.cables ?? {})) if (port !== null) { used.set(t, PORT_LABEL[port]); used.set(PORT_LABEL[port], FRC_LABEL[t] ?? t); }
  const a = cfg.assumptions;
  const pin = (r: { port: number; bit: number }) => `R${'ABCDE'[r.port]}${r.bit}`;
  const extra: [string, number, number, number][] = [
    [`SW0→${pin(a.sw0)}  SW1→${pin(a.sw1)}`, 33, 4, 12],
    [`RELAY←${pin(a.relay)}`, 113.5, 72, 20],
    [`BUZZER←${pin(a.buzzer)}`, 130.5, 86, 14],
    [`EN1←${a.motorEn1 ? pin(a.motorEn1) : 'VCC'} IN1←${pin(a.motorIn1)} IN2←${pin(a.motorIn2)} EN2←${a.motorEn2 ? pin(a.motorEn2) : 'VCC'}`, 94, 16, 10],
    [`RGB←${pin(a.rgbRed)}/${pin(a.rgbGreen)}/${pin(a.rgbBlue)}`, 107.2, 86, 12],
    [`POT→AN${a.potChannel}  LM35→AN${a.lm35Channel}`, 64.5, 170, 10],
  ];
  return (
    <>
      {Object.entries(FRC_POINTS).map(([k, p]) => (
        <Html key={k} position={[p.x, (p.module ? MODULE.elevation + MODULE.t : 0) + 13, p.y]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`board-label ${used.has(k) ? 'on' : ''}`}>{FRC_LABEL[k] ?? k}{used.has(k) ? <b> ⇄ {used.get(k)}</b> : null}</div>
        </Html>
      ))}
      {extra.map(([t, x, y, h]) => (
        <Html key={t} position={[x, h, y]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="board-label warn">{t}</div>
        </Html>
      ))}
    </>
  );
}

export function BoardScene() {
  const perf = useLab((s) => s.perfMode);
  const modTop = MODULE.elevation;
  const standoffs: [number, number][] = [[3, 52.5], [79, 52.5], [3, 138.5], [79, 138.5]];
  return (
    // photo coordinates -> world: centre the board and rotate so the photo's left edge faces away
    <group rotation={[0, -Math.PI / 2, 0]}>
      <group position={[-BASE.w / 2, 0, -BASE.h / 2]}>
        <StaticBatch>
        {/* wooden tray */}
        <mesh position={[BASE.w / 2 + 6, -5.5, BASE.h / 2 - 4]} receiveShadow>
          <boxGeometry args={[BASE.w + 60, 3, BASE.h + 90]} />
          <meshStandardMaterial color="#8a6a43" roughness={0.85} />
        </mesh>
        {[-1, 1].map((s) => (
          <Box key={s} p={[BASE.w / 2 + 6, 1, BASE.h / 2 - 4 + s * ((BASE.h + 90) / 2 - 3)]} s={[BASE.w + 60, 16, 6]} m={new THREE.MeshStandardMaterial({ color: '#7a5a36', roughness: 0.85 })} />
        ))}
        {[[4, 4], [BASE.w - 4, 4], [4, BASE.h - 4], [BASE.w - 4, BASE.h - 4]].map(([x, y], i) => (
          <Cylinder key={i} x={x} y={y} />
        ))}

        <Pcb w={BASE.w} h={BASE.h} t={BASE.t} x={0} y={0} elevation={0} module={false} />
        <Pcb w={MODULE.w} h={MODULE.h} t={MODULE.t} x={MODULE.x} y={MODULE.y} elevation={modTop + MODULE.t} module />
        {standoffs.map(([x, y], i) => <group key={i} position={[x, 0, y]}><Standoff h={modTop} /></group>)}
        {/* stacking connectors under the module */}
        <Box p={[40, modTop / 2, 51.5]} s={[50, modTop, 2.6]} m={MAT.black} />
        <Box p={[48, modTop / 2, 140]} s={[52, modTop, 2.6]} m={MAT.black} />

        {INDEXED.filter(({ p }) => isStatic(p) && !(perf && PASSIVES.has(p.kind))).map(({ p, key }) => <Placed key={key} p={p} />)}
        </StaticBatch>
        <StaticBatch tagged>
          {INDEXED.filter(({ p }) => !isStatic(p)).map(({ p, key }) => <Placed key={key} p={p} />)}
          {/* the motor's jumper wires are bench cables (Cables.tsx): the student plugs them onto DCM1 */}
          <DcMotor />
          <TestLamp />
          <Wire points={[[134, 10, 78], [146, 14, 72], [156, 2, 76]]} color="#d63b2e" />
          <Wire points={[[134, 10, 73], [148, 12, 84], [162, 2, 80]]} color="#1f4fbf" />
        </StaticBatch>
        <Labels />
      </group>
    </group>
  );
}

function Placed({ p }: { p: Part }) {
  return (
    <group position={[p.x, p.onModule ? MODULE.elevation + MODULE.t : 0, p.y]} rotation={[0, -((p.rot ?? 0) * Math.PI) / 180, 0]}>
      <PartView p={p} />
    </group>
  );
}

function Cylinder({ x, y }: { x: number; y: number }) {
  return (
    <mesh position={[x, -2.8, y]}>
      <cylinderGeometry args={[2.2, 2.2, 2.6, 8]} />
      <primitive object={MAT.brass} attach="material" />
    </mesh>
  );
}
