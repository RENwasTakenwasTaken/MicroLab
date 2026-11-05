// Physical connections on the bench: FRC ribbons, the USB Type-B cable,
// oscilloscope probes (crocodile clips on male-to-female jumpers), multimeter
// leads and the gear motor's jumper wires. Plugs are picked up with a click,
// carried with the mouse and dropped onto compatible connectors (or the desk).

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';

import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useBench, type Plug } from '../app/bench.ts';
import { usbCableState } from '../app/upload.ts';
import { ribbonGeometry, useHover } from '../three/interactive.tsx';
import { ANCHORS, DESK_Y, MOTOR_PINS, SOCKET, SOCKETS, type SocketDef, type V3 } from './world.ts';

/** Live position of the carried plug (updated every frame, read by cables). */
export const carryPos = new THREE.Vector3(0, 40, 0);
const CARRY_PLANE_Y = 45;

export function plugPosition(p: Plug, carrying: string | null): THREE.Vector3 {
  if (p.id === carrying) return carryPos.clone();
  if (p.attachedTo) return new THREE.Vector3(...SOCKET[p.attachedTo].pos);
  return new THREE.Vector3(...p.rest);
}

const PROBE_LEN = 64; // tip -> back of the probe / lead handle, along local +Y
const JUMPER_LEN = 14; // female jumper housing: pin -> wire, along local +Y
const USB_LEN = 40; // metal front -> back of the USB-B moulding, along local -Z
const PROBE_TILT = Math.PI / 2.3;

/**
 * Plug orientation. FRC and USB plugs turn to their socket; probes stand upright
 * in a test point and otherwise lie tip-forward with the back towards the instrument.
 */
function plugEuler(p: Plug, carrying: string | null): THREE.Euler {
  const s = p.attachedTo && p.id !== carrying ? SOCKET[p.attachedTo] : null;
  if (p.kind === 'frc') return new THREE.Euler(0, s ? s.yaw : 0.3, 0);
  if (p.kind === 'usb') return new THREE.Euler(0, s ? s.yaw : 0, 0);
  if (p.kind === 'dcm') return new THREE.Euler(s ? 0 : -Math.PI / 2, 0, 0);
  return new THREE.Euler(s ? 0 : -PROBE_TILT, 0, 0);
}

/** Where the cable leaves the back of a round-cable plug, and the direction it leaves in. */
function cableExit(p: Plug, carrying: string | null) {
  const e = plugEuler(p, carrying);
  const back = p.kind === 'usb' ? new THREE.Vector3(0, 0, -USB_LEN) : new THREE.Vector3(0, p.kind === 'dcm' ? JUMPER_LEN : PROBE_LEN, 0);
  const dir = back.clone().normalize().applyEuler(e);
  dir.y += 0.35;
  return { at: plugPosition(p, carrying).add(back.applyEuler(e)), dir: dir.normalize() };
}

// ---------------------------------------------------------- carry control
export function CarryController() {
  const { camera, pointer, raycaster, size } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_PLANE_Y), []);
  useFrame(() => {
    const st = useBench.getState();
    if (!st.carrying) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) carryPos.lerp(hit, 0.6);
    // snap: nearest compatible connector within ~30 px of the cursor
    const kind = st.plugs[st.carrying]?.kind;
    let best: string | null = null, bestD = 30;
    for (const s of SOCKETS) {
      if (s.kind !== kind) continue;
      const v = new THREE.Vector3(...s.pos).project(camera);
      if (v.z > 1) continue;
      const d = Math.hypot(((v.x - pointer.x) / 2) * size.width, ((v.y - pointer.y) / 2) * size.height);
      if (d < bestD) { bestD = d; best = s.id; }
    }
    if (best !== st.snap) useBench.setState({ snap: best });
    if (best) carryPos.lerp(new THREE.Vector3(...SOCKET[best].pos).add(new THREE.Vector3(0, 14, 0)), 0.5);
  });
  return null;
}

// ------------------------------------------------------------- sockets
function SocketTarget({ s, kind }: { s: SocketDef; kind: string }) {
  const [hover, setHot] = useState(false);
  const snapped = useBench((st) => st.snap === s.id);
  const hot = hover || snapped;
  const occupied = useBench((st) => Object.values(st.plugs).some((p) => p.attachedTo === s.id));
  const tip = useHover({ name: s.label, info: occupied && kind !== 'probe' ? 'Occupied' : 'Click to connect here' });
  const r = kind === 'probe' || kind === 'dcm' ? 2.2 : kind === 'usb' ? 9 : 11;
  const color = occupied && kind !== 'probe' ? '#ef5b5b' : hot ? '#7dffb5' : '#3fb68b';
  return (
    <group position={s.pos}>
      <mesh
        onPointerOver={(e) => { tip.onPointerOver(e); setHot(true); }}
        onPointerOut={() => { tip.onPointerOut(); setHot(false); }}
        onClick={(e) => { e.stopPropagation(); const id = useBench.getState().carrying; if (id) useBench.getState().attach(id, s.id); }}>
        <sphereGeometry args={[r, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={hot ? 0.75 : 0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function SocketTargets() {
  const carrying = useBench((s) => s.carrying);
  const plugs = useBench((s) => s.plugs);
  if (!carrying) return null;
  const kind = plugs[carrying]?.kind;
  return <>{SOCKETS.filter((s) => s.kind === kind).map((s) => <SocketTarget key={s.id} s={s} kind={kind!} />)}</>;
}

// ---------------------------------------------------------------- plugs
const plugMat = {
  frc: new THREE.MeshStandardMaterial({ color: '#1e1f22', roughness: 0.5 }),
  usb: new THREE.MeshStandardMaterial({ color: '#2a2b2f', roughness: 0.45 }),
  usbMetal: new THREE.MeshStandardMaterial({ color: '#c7cbd0', metalness: 0.85, roughness: 0.3 }),
  probe: new THREE.MeshStandardMaterial({ color: '#2c3036', roughness: 0.45 }),
  red: new THREE.MeshStandardMaterial({ color: '#c62a2a', roughness: 0.45 }),
  blk: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.45 }),
  tip: new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.9, roughness: 0.25 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#e8c33a', roughness: 0.4 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2f67c9', roughness: 0.4 }),
  jumperBlk: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.5 }),
  green: new THREE.MeshStandardMaterial({ color: '#2f9e57', roughness: 0.45 }),
};

/** Scope probe jumper colours: CH1 yellow, CH2 blue, ground black (matches the probe bands). */
const PROBE_COLOR: Record<string, THREE.Material> = { ch1: plugMat.yellow, ch2: plugMat.blue, 'scope:gnd': plugMat.blk };

/** Female jumper housing standing on a header pin (local +Y up from the pin top). */
function FemaleHousing({ wire }: { wire: THREE.Material }) {
  return (
    <group>
      <mesh position={[0, JUMPER_LEN / 2 - 1, 0]} castShadow material={plugMat.jumperBlk}><boxGeometry args={[2.5, JUMPER_LEN, 2.5]} /></mesh>
      <mesh position={[0, JUMPER_LEN + 1, 0]} material={wire}><cylinderGeometry args={[0.75, 0.9, 3, 8]} /></mesh>
    </group>
  );
}

const isShown = (o: THREE.Object3D | null): boolean => !o || (o.visible && isShown(o.parent));
/** Hit on the plug itself or on its own cable (cables carry userData.cable / userData.plug). */
const ownsHit = (o: THREE.Object3D | null, root: THREE.Object3D, p: Plug): boolean =>
  !!o && (o === root || o.userData.cable === p.cable || o.userData.plug === p.id || ownsHit(o.parent, root, p));

function PlugMesh({ p }: { p: Plug }) {
  const group = useRef<THREE.Group>(null);
  const carrying = useBench((s) => s.carrying);
  const isCarried = carrying === p.id;
  const hover = useHover({ name: p.label, info: p.attachedTo ? `Connected to ${SOCKET[p.attachedTo]?.label}. Click to unplug and move it.` : 'Click to pick up, then click a highlighted connector (or the desk to put it down).' });
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const pos = plugPosition(p, carrying);
    g.position.copy(pos);
    g.rotation.copy(plugEuler(p, carrying));
  });
  // the carried plug must not intercept the clicks aimed at the connector below it
  useEffect(() => {
    const noop = () => {};
    group.current?.traverse((o) => {
      const m = o as THREE.Mesh & { __raycast?: THREE.Mesh['raycast'] };
      if (!(m as THREE.Mesh).isMesh) return;
      if (isCarried) { m.__raycast ??= m.raycast; m.raycast = noop; }
      else if (m.__raycast) m.raycast = m.__raycast;
    });
  }, [isCarried]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0 || e.delta > 6) return;
    // the invisible grab area may overlap a nearby control: only take the click when this
    // plug is the first visible thing under the cursor (e.g. not the BOOT button behind it)
    const first = e.intersections.find((i) => isShown(i.object));
    if (first && group.current && !ownsHit(first.object, group.current, p) && useBench.getState().carrying !== p.id) return;
    e.stopPropagation();
    const b = useBench.getState();
    if (b.carrying === p.id) { b.drop([carryPos.x, Math.max(-4, carryPos.y - 40), carryPos.z]); return; }
    if (b.carrying) return;
    b.pick(p.id);
  };
  let body: ReactElement;
  if (p.kind === 'frc') {
    body = (
      <group>
        <mesh position={[0, 0, 0]} castShadow material={plugMat.frc}><boxGeometry args={[21, 9, 8.6]} /></mesh>
        <mesh position={[0, 4.6, 0]} material={plugMat.usbMetal}><boxGeometry args={[18, 0.6, 5]} /></mesh>
      </group>
    );
  } else if (p.kind === 'usb') {
    body = (
      <group rotation={[0, 0, 0]}>
        <mesh position={[0, 0, -8]} castShadow material={plugMat.usbMetal}><boxGeometry args={[12, 10.5, 9]} /></mesh>
        <mesh position={[0, 0, -26]} castShadow material={plugMat.usb}><boxGeometry args={[16, 13, 28]} /></mesh>
      </group>
    );
  } else if (p.kind === 'dcm') {
    body = <FemaleHousing wire={p.id === 'mot:1' ? plugMat.red : plugMat.blk} />;
  } else if (!p.id.startsWith('dmm')) {
    // oscilloscope probe: its crocodile clip holds the male end of a jumper whose female end sits on the pin
    const c = PROBE_COLOR[p.id] ?? plugMat.probe;
    body = (
      <group>
        <FemaleHousing wire={c} />
        <mesh position={[0, 22, 0]} material={c}><cylinderGeometry args={[0.75, 0.75, 14, 8]} /></mesh>
        <mesh position={[0, 30, 0]} material={plugMat.tip}><boxGeometry args={[0.9, 4, 0.9]} /></mesh>
        {/* crocodile clip: steel jaws, coloured boot */}
        <mesh position={[0, 34, 0.7]} rotation={[0.12, 0, 0]} material={plugMat.tip}><boxGeometry args={[4.2, 9, 1]} /></mesh>
        <mesh position={[0, 34, -0.7]} rotation={[-0.12, 0, 0]} material={plugMat.tip}><boxGeometry args={[4.2, 9, 1]} /></mesh>
        <mesh position={[0, 46, 0]} castShadow material={c}><boxGeometry args={[6, 16, 5]} /></mesh>
        <mesh position={[0, 57, 0]} material={p.id === 'scope:gnd' ? plugMat.blk : plugMat.probe}><cylinderGeometry args={[2, 3, 10, 10]} /></mesh>
      </group>
    );
  } else {
    // multimeter test lead
    const m = p.id === 'dmm:v' ? plugMat.red : plugMat.blk;
    body = (
      <group>
        <mesh position={[0, 3, 0]} material={plugMat.tip}><cylinderGeometry args={[0.5, 0.25, 6, 8]} /></mesh>
        <mesh position={[0, 12, 0]} material={m}><cylinderGeometry args={[2.2, 1.2, 12, 12]} /></mesh>
        <mesh position={[0, 40, 0]} castShadow material={m}><cylinderGeometry args={[4, 3.2, 48, 14]} /></mesh>
      </group>
    );
  }
  return (
    <group ref={group} {...hover} onClick={onClick}>
      {body}
      {/* generous invisible grab area */}
      <mesh visible={false} position={p.kind === 'probe' ? [0, 30, 0] : p.kind === 'dcm' ? [0, 7, 0] : p.kind === 'usb' ? [0, 0, -18] : [0, 0, 0]}>
        {p.kind === 'probe' ? <cylinderGeometry args={[9, 9, 70, 8]} />
          : p.kind === 'dcm' ? <cylinderGeometry args={[4.5, 4.5, 18, 8]} />
          : p.kind === 'usb' ? <sphereGeometry args={[24, 10, 8]} />
          : <boxGeometry args={[21 * 1.5, 9 * 1.5, 8.6 * 1.5]} /> /* 1.5x the FRC plug body */}
      </mesh>
      {isCarried && <mesh><sphereGeometry args={[p.kind === 'probe' || p.kind === 'dcm' ? 6 : 16, 16, 10]} /><meshBasicMaterial color="#4c9df3" transparent opacity={0.18} depthWrite={false} /></mesh>}
    </group>
  );
}

// --------------------------------------------------------------- cables
function sagCurve(a: THREE.Vector3, da: THREE.Vector3, b: THREE.Vector3, db: THREE.Vector3, slack = 0.35) {
  const len = a.distanceTo(b);
  const lift = Math.min(60, 15 + len * 0.12);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(DESK_Y + 3, Math.min(a.y, b.y) - len * slack * 0.25);
  return new THREE.CatmullRomCurve3([
    a, a.clone().addScaledVector(da, lift), mid, b.clone().addScaledVector(db, lift), b,
  ], false, 'centripetal');
}

function RoundCable({ from, plugId, color, radius = 2.2, fixedDir = new THREE.Vector3(0, 0.3, 1).normalize(), slack }: {
  from: V3; plugId: string; color: string; radius?: number; fixedDir?: THREE.Vector3; slack?: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), [color]);
  const key = useRef('');
  const empty = useMemo(() => new THREE.BufferGeometry(), []);
  useFrame(() => {
    const st = useBench.getState();
    const p = st.plugs[plugId];
    if (!p || !mesh.current) return;
    const exit = cableExit(p, st.carrying);
    const k = `${exit.at.toArray().map((v) => v.toFixed(1))}|${exit.dir.toArray().map((v) => v.toFixed(2))}`;
    if (k !== key.current) {
      key.current = k;
      const a = new THREE.Vector3(...from);
      const curve = sagCurve(a, fixedDir, exit.at, exit.dir, slack);
      mesh.current.geometry.dispose();
      mesh.current.geometry = new THREE.TubeGeometry(curve, 64, radius, 8, false);
    }
  });
  return <mesh ref={mesh} material={mat} castShadow geometry={empty} userData={{ plug: plugId }} />;
}

function Ribbon({ idx }: { idx: number }) {
  const body = useRef<THREE.Mesh>(null);
  const stripe = useRef<THREE.Mesh>(null);
  const key = useRef('');
  const empty1 = useMemo(() => new THREE.BufferGeometry(), []);
  const empty2 = useMemo(() => new THREE.BufferGeometry(), []);
  const hover = useHover({ name: `FRC ribbon cable ${idx + 1}`, info: '10-way ribbon: lines 1–8 = bits 0–7, 9 = GND, 10 = VCC. Click either plug to move it.' });
  useFrame(() => {
    const st = useBench.getState();
    const a = st.plugs[`rib${idx}:a`], b = st.plugs[`rib${idx}:b`];
    if (!a || !b || !body.current || !stripe.current) return;
    const pa = plugPosition(a, st.carrying), pb = plugPosition(b, st.carrying);
    const ya = a.attachedTo && st.carrying !== a.id ? SOCKET[a.attachedTo].yaw : 0.3;
    const yb = b.attachedTo && st.carrying !== b.id ? SOCKET[b.attachedTo].yaw : 0.3;
    const k = `${pa.toArray().map((v) => v.toFixed(1))}|${pb.toArray().map((v) => v.toFixed(1))}|${ya}|${yb}`;
    if (k === key.current) return;
    key.current = k;
    const p0 = pa.clone().add(new THREE.Vector3(0, 4.5, 0)), p3 = pb.clone().add(new THREE.Vector3(0, 4.5, 0));
    const lift = Math.min(70, 10 + p0.distanceTo(p3) * 0.12);
    const curve = new THREE.CubicBezierCurve3(p0, p0.clone().add(new THREE.Vector3(0, lift, 0)), p3.clone().add(new THREE.Vector3(0, lift, 0)), p3);
    const ax = (yaw: number) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    body.current.geometry.dispose();
    stripe.current.geometry.dispose();
    body.current.geometry = ribbonGeometry(curve, ax(ya), ax(yb), 12.7);
    stripe.current.geometry = ribbonGeometry(curve, ax(ya), ax(yb), 1.1, -5.6, 0.06);
  });
  return (
    <group {...hover} userData={{ cable: `rib${idx}` }}>
      <mesh ref={body} castShadow geometry={empty1}><meshStandardMaterial color="#a2a7ac" roughness={0.65} side={THREE.DoubleSide} /></mesh>
      <mesh ref={stripe} geometry={empty2}><meshStandardMaterial color="#c0392b" roughness={0.6} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function UsbBadge() {
  const connected = useBench((s) => s.plugs['usb:b']?.attachedTo === 'usb:board');
  const phase = useBench((s) => s.upload.phase);
  const progress = useBench((s) => s.upload.progress);
  const st = usbCableState(phase, connected);
  const text = { disconnected: 'USB disconnected', connected: 'USB connected', uploading: `Uploading ${Math.round(progress * 100)}%`, completed: 'Upload complete', error: 'USB communication error' }[st];
  const pos = SOCKET['usb:board'].pos;
  return (
    <Html position={[pos[0], pos[1] + 26, pos[2] - 20]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`usb-badge ${st}`}>{text}</div>
    </Html>
  );
}

export function BenchCables() {
  const plugs = useBench((s) => s.plugs);
  const motorDir = new THREE.Vector3(0, 0.25, -1).normalize(); // out of the motor's relimate, along photo -x
  const genClip = SOCKET['tp:gen'].pos;
  return (
    <group>
      {[0, 1, 2, 3].map((i) => <Ribbon key={i} idx={i} />)}
      <RoundCable from={ANCHORS.pcUsb} plugId="usb:b" color="#2b2c30" radius={2.6} />
      <RoundCable from={ANCHORS.scopeCh1} plugId="ch1" color="#2e3238" radius={1.8} />
      <RoundCable from={ANCHORS.scopeCh2} plugId="ch2" color="#2e3238" radius={1.8} />
      <RoundCable from={ANCHORS.scopeGnd} plugId="scope:gnd" color="#151515" radius={1.2} />
      <RoundCable from={MOTOR_PINS[0]} plugId="mot:1" color="#d63b2e" radius={0.8} fixedDir={motorDir} slack={0.15} />
      <RoundCable from={MOTOR_PINS[1]} plugId="mot:2" color="#1d1d1f" radius={0.8} fixedDir={motorDir} slack={0.15} />
      <RoundCable from={ANCHORS.dmmV} plugId="dmm:v" color="#c62a2a" radius={1.6} fixedDir={new THREE.Vector3(0, 0.4, 1).normalize()} />
      <RoundCable from={ANCHORS.dmmCom} plugId="dmm:com" color="#151515" radius={1.6} fixedDir={new THREE.Vector3(0, 0.4, 1).normalize()} />
      <StaticCable a={ANCHORS.genOut} b={[genClip[0], genClip[1] + 2, genClip[2]]} color="#202226" />
      <group position={genClip}>
        <mesh position={[0, 0, 0]} castShadow material={plugMat.red}><boxGeometry args={[8, 6, 26]} /></mesh>
        <mesh position={[0, 3.5, -12]} material={plugMat.tip}><boxGeometry args={[6, 1, 8]} /></mesh>
      </group>
      {Object.values(plugs).map((p) => <PlugMesh key={p.id} p={p} />)}
      <UsbBadge />
    </group>
  );
}

function StaticCable({ a, b, color }: { a: V3; b: V3; color: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(sagCurve(new THREE.Vector3(...a), new THREE.Vector3(0, 0.2, 1).normalize(), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0)), 48, 2, 8, false), [a, b]);
  return <mesh geometry={geo} castShadow><meshStandardMaterial color={color} roughness={0.55} /></mesh>;
}
