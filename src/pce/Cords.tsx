// What the student handles on the PCE bench: two oscilloscope probes (needle tip + ground clip),
// 2 mm patch cords and the kit's mains plug. A click picks a plug up, the next click puts it on a
// highlighted pin (or down on the desk), as in the EP lab.

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { DESK_Y } from '../lab3d/world.ts';
import { useHover } from '../three/interactive.tsx';
import { BOX as AM_BOX, CORD_ENTRY, LEVEL as AM_LEVEL, PANEL } from './am/layout.ts';
import type { PcePlug } from './kit.ts';
import { BENCH, usePce } from './store.ts';
import { FILM } from './film.ts';
import { BNC, KIT_POS, SOCKET, SOCKETS, dmmJack, scopePoint, type SocketDef } from './world.ts';

type Plugs = Record<string, PcePlug>;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** Live position of the carried plug (updated every frame). */
export const carryPos = V(0, 200, 200);
const bench = () => BENCH[usePce.getState().kit];
/** Carried plugs travel a little above the kit's connectors. */
const carryY = () => KIT_POS[1] + bench().box.top + 30;
/** Lengths along a plug's own axis (mm): probe body, ground-lead take-off, sleeve, clip, mains plug. */
/** Height of one stacked 2 mm plug (mm). */
const SLEEVE_STACK = 18;
const LEN = { probe: 114, lead: 36, sleeve: 20, clip: 34, ac: 31, banana: 30 };
/** Each banana plug stacked on another sits this much higher. */
const STACK_STEP = 24;

interface Pose { pos: THREE.Vector3; dir: THREE.Vector3 }
const flat = (v: THREE.Vector3) => { v.y = 0; return v.lengthSq() < 1 ? V(0.3, 0, 1).normalize() : v.normalize(); };

/** Where a plug is and which way its axis points (from its tip to where its cable leaves). */
export function plugPose(p: PcePlug, plugs: Plugs, carrying: string | null): Pose {
  const carried = p.id === carrying;
  const s = !carried && p.attachedTo ? SOCKET[p.attachedTo] : null;
  switch (p.kind) {
    case 'tip':
      if (carried) return { pos: carryPos.clone(), dir: UP.clone() };
      // the needle goes a few millimetres into the hollow pin, and the probe stands by itself
      // on a stackable cord plug, the needle goes into the back of the plug instead
      if (s) {
        const n = Object.values(plugs).filter((q) => q.kind === 'sleeve' && q.attachedTo === s.id && q.id !== carrying).length;
        return { pos: V(s.pos[0], s.pos[1] - 4 + (n ? 13 + (n - 1) * SLEEVE_STACK : 0), s.pos[2]), dir: V(0.05, 1, 0.1).normalize() };
      }
      return { pos: V(p.rest[0], DESK_Y + 4.8, p.rest[2]), dir: V(0.28, 0, 1).normalize() };
    case 'sleeve': {
      if (carried) return { pos: carryPos.clone(), dir: UP.clone() };
      // over a pin the sleeve slides down to the cover; in a flush 2 mm socket the plug sits on its rim
      if (s) {
        // a stacked plug sits in the back of the one below it
        const below = Object.values(plugs).filter((q) => q.kind === 'sleeve' && q.attachedTo === s.id && q.id !== carrying && (q.seq ?? 0) < (p.seq ?? 0)).length;
        return { pos: V(s.pos[0], (s.noClip ? s.pos[1] - 1.5 : s.pos[1] - (AM_LEVEL.pin - AM_LEVEL.acrylic) + 1) + below * SLEEVE_STACK, s.pos[2]), dir: UP.clone() };
      }
      const pos = V(p.rest[0], DESK_Y + 2.6, p.rest[2]);
      const far = plugs[p.id.endsWith(':a') ? `${p.cable}:b` : `${p.cable}:a`];
      return { pos, dir: flat(V(far.rest[0], 0, far.rest[2]).sub(pos)) };
    }
    case 'clip': {
      const probe = plugPose(plugs[p.cable], plugs, carrying).pos;
      if (carried) return { pos: carryPos.clone(), dir: UP.clone() };
      const pos = s ? V(s.pos[0], s.pos[1] - 5, s.pos[2]) : V(p.rest[0], DESK_Y + 2.4, p.rest[2]);
      return { pos, dir: flat(probe.clone().sub(pos)) };
    }
    case 'banana': {
      if (carried) return { pos: carryPos.clone(), dir: UP.clone() };
      if (s) {
        // stackable plugs: later ones sit in the back of the ones already in the socket
        const below = Object.values(plugs).filter((q) => q.attachedTo === s.id && q.id !== carrying && (q.seq ?? 0) < (p.seq ?? 0)).length;
        return { pos: V(s.pos[0], s.pos[1] + below * STACK_STEP, s.pos[2]), dir: UP.clone() };
      }
      const pos = V(p.rest[0], DESK_Y + 4.4, p.rest[2]);
      const mate = plugs[p.id.endsWith(':a') ? `${p.cable}:b` : p.id.endsWith(':b') ? `${p.cable}:a` : ''];
      return { pos, dir: mate ? flat(V(mate.rest[0], 0, mate.rest[2]).sub(pos)) : V(0.35, 0, 1).normalize() };
    }
    default:
      if (carried) return { pos: carryPos.clone(), dir: V(0, 0, 1) };
      // film mode has no wall: the plugged-in mains plug lies far off to the left, so its cable runs out of the picture
      if (s && FILM) return { pos: V(KIT_POS[0] - 2600, DESK_Y + 9, KIT_POS[2] + 60), dir: V(-1, 0, 0) };
      if (s) return { pos: V(...s.pos), dir: V(0, 0, 1) };
      return { pos: V(...p.rest), dir: V(0.5, 0, 0.87).normalize() };
  }
}
const along = (q: Pose, d: number) => q.pos.clone().addScaledVector(q.dir, d);

// ------------------------------------------------------------ carrying
const wants = (kind: PcePlug['kind']) => (kind === 'ac' ? 'ac' : kind === 'banana' ? 'jack' : 'pin');
const fits = (p: PcePlug, s: SocketDef) => wants(p.kind) === s.kind;

export function CarryController() {
  const { camera, pointer, raycaster, size } = useThree();
  const plane = useMemo(() => new THREE.Plane(V(0, 1, 0), 0), []);
  useFrame(() => {
    const st = usePce.getState();
    const p = st.carrying ? st.plugs[st.carrying] : null;
    if (!p) return;
    plane.constant = -carryY();
    raycaster.setFromCamera(pointer, camera);
    const hit = V(0, 0, 0);
    if (raycaster.ray.intersectPlane(plane, hit)) carryPos.lerp(hit, 0.6);
    // snap: nearest connector that takes this plug, within about 30 px of the cursor
    let best: string | null = null, bestD = 30;
    for (const s of SOCKETS) {
      if (!fits(p, s)) continue;
      const v = V(...s.pos).project(camera);
      if (v.z > 1) continue;
      const d = Math.hypot(((v.x - pointer.x) / 2) * size.width, ((v.y - pointer.y) / 2) * size.height);
      if (d < bestD) { bestD = d; best = s.id; }
    }
    if (best !== st.snap) usePce.setState({ snap: best });
    if (best) carryPos.lerp(V(...SOCKET[best].pos).add(p.kind === 'ac' ? V(0, 0, 26) : V(0, 14, 0)), 0.5);
  });
  return null;
}

function SocketTarget({ s }: { s: SocketDef }) {
  const [over, setOver] = useState(false);
  const snapped = usePce((st) => st.snap === s.id);
  const hot = over || snapped;
  const tip = useHover({ name: s.label, info: 'Click to connect here' });
  return (
    <mesh position={s.pos}
      onPointerOver={(e) => { tip.onPointerOver(e); setOver(true); }}
      onPointerOut={() => { tip.onPointerOut(); setOver(false); }}
      onClick={(e) => { e.stopPropagation(); const st = usePce.getState(); if (st.carrying) st.attach(st.carrying, s.id); }}>
      <sphereGeometry args={[s.kind === 'ac' ? 13 : s.kind === 'jack' ? 7 : 3.4, 14, 10]} />
      <meshBasicMaterial color={hot ? '#7dffb5' : '#3fb68b'} transparent opacity={hot ? 0.8 : 0.4} depthWrite={false} />
    </mesh>
  );
}

/** Green markers on every connector the carried plug fits. */
export function SocketTargets() {
  const kind = usePce((s) => (s.carrying ? s.plugs[s.carrying]?.kind : null));
  if (!kind) return null;
  return <>{SOCKETS.filter((s) => wants(kind) === s.kind).map((s) => <SocketTarget key={s.id} s={s} />)}</>;
}

// ------------------------------------------------------------ plugs
const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
const PM = {
  steel: mat('#d5d9de', { metalness: 0.7, roughness: 0.28 }), body: mat('#26292e'), grey: mat('#6f7479'), black: mat('#151516'),
  brass: mat('#c9a64e', { metalness: 0.8, roughness: 0.3 }), yellow: mat('#e8c33a'), blue: mat('#2f67c9'),
};
const sleeveMat: Record<string, THREE.Material> = {};
const colored = (c: string) => (sleeveMat[c] ??= mat(c));

function plugBody(p: PcePlug): ReactElement {
  if (p.kind === 'tip') {
    const band = p.id === 'ch1' ? PM.yellow : PM.blue;
    return (
      <group>
        <mesh position={[0, 3, 0]} material={PM.steel}><cylinderGeometry args={[0.45, 0.3, 9, 8]} /></mesh>
        <mesh position={[0, 21, 0]} castShadow material={PM.grey}><cylinderGeometry args={[2.6, 1.6, 28, 14]} /></mesh>
        <mesh position={[0, 67, 0]} castShadow material={PM.body}><cylinderGeometry args={[4.4, 3.4, 64, 16]} /></mesh>
        <mesh position={[0, 92, 0]} material={band}><cylinderGeometry args={[4.6, 4.6, 5, 16]} /></mesh>
        <mesh position={[0, 106, 0]} material={PM.black}><cylinderGeometry args={[2.2, 3.6, 16, 12]} /></mesh>
      </group>
    );
  }
  if (p.kind === 'sleeve') {
    const c = bench().cords.find((k) => k.id === p.cable)!;
    return (
      <group>
        <mesh position={[0, 10, 0]} castShadow material={colored(c.ends[p.id.endsWith(':a') ? 0 : 1])}><cylinderGeometry args={[2.5, 2.3, 20, 14]} /></mesh>
        <mesh position={[0, 1.2, 0]} material={PM.steel}><cylinderGeometry args={[1.7, 1.7, 2.4, 12]} /></mesh>
      </group>
    );
  }
  if (p.kind === 'banana') {
    return (
      <group>
        <mesh position={[0, -5, 0]} material={PM.steel}><cylinderGeometry args={[2, 2, 10, 10]} /></mesh>
        <mesh position={[0, 12, 0]} castShadow material={colored(p.color ?? '#c8302b')}><cylinderGeometry args={[4.3, 3.6, 24, 16]} /></mesh>
        <mesh position={[0, 25.5, 0]} material={PM.steel}><cylinderGeometry args={[2.6, 2.6, 3, 12]} /></mesh>
      </group>
    );
  }
  if (p.kind === 'clip') {
    return (
      <group>
        <mesh position={[0, 6, 1.2]} rotation={[0.1, 0, 0]} material={PM.steel}><boxGeometry args={[3.6, 13, 0.9]} /></mesh>
        <mesh position={[0, 6, -1.2]} rotation={[-0.1, 0, 0]} material={PM.steel}><boxGeometry args={[3.6, 13, 0.9]} /></mesh>
        <mesh position={[0, 23, 0]} castShadow material={PM.black}><boxGeometry args={[5.4, 22, 5]} /></mesh>
      </group>
    );
  }
  return (
    <group>
      {[-9.5, 9.5].map((x) => <mesh key={x} position={[x, -9, 0]} material={PM.brass}><cylinderGeometry args={[2.4, 2.4, 18, 14]} /></mesh>)}
      <mesh position={[0, 1.2, 0]} castShadow material={PM.black}><boxGeometry args={[36, 2.4, 20]} /></mesh>
      <mesh position={[0, 12, 0]} castShadow material={PM.black}><boxGeometry args={[32, 20, 18]} /></mesh>
      <mesh position={[0, 26, 0]} material={PM.black}><cylinderGeometry args={[3.4, 9, 10, 14]} /></mesh>
    </group>
  );
}

function PlugMesh({ p }: { p: PcePlug }) {
  const group = useRef<THREE.Group>(null);
  const isCarried = usePce((s) => s.carrying === p.id);
  const hover = useHover({
    name: p.label,
    info: p.attachedTo ? `On ${SOCKET[p.attachedTo]?.label}. Click to take it off and move it.` : 'Click to pick up, then click a highlighted pin (or the desk to put it down).',
  });
  useFrame(() => {
    const g = group.current, st = usePce.getState();
    if (!g) return;
    const q = plugPose(st.plugs[p.id], st.plugs, st.carrying);
    g.position.copy(q.pos);
    g.quaternion.setFromUnitVectors(UP, q.dir);
  });
  // the carried plug must not take the click meant for the pin under it
  useEffect(() => {
    const noop = () => {};
    group.current?.traverse((o) => {
      const m = o as THREE.Mesh & { __raycast?: THREE.Mesh['raycast'] };
      if (!m.isMesh) return;
      if (isCarried) { m.__raycast ??= m.raycast; m.raycast = noop; } else if (m.__raycast) m.raycast = m.__raycast;
    });
  }, [isCarried]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const st = usePce.getState();
    if (e.button !== 0 || e.delta > 6 || st.carrying) return;
    e.stopPropagation();
    st.pick(p.id);
  };
  const grab: Record<PcePlug['kind'], ReactElement> = {
    tip: <mesh visible={false} position={[0, 56, 0]}><cylinderGeometry args={[8, 8, 112, 8]} /></mesh>,
    sleeve: <mesh visible={false} position={[0, 10, 0]}><cylinderGeometry args={[5.5, 5.5, 26, 8]} /></mesh>,
    clip: <mesh visible={false} position={[0, 17, 0]}><boxGeometry args={[13, 38, 13]} /></mesh>,
    banana: <mesh visible={false} position={[0, 13, 0]}><cylinderGeometry args={[7.5, 7.5, 34, 8]} /></mesh>,
    ac: <mesh visible={false} position={[0, 10, 0]}><boxGeometry args={[44, 40, 28]} /></mesh>,
  };
  return (
    <group ref={group} {...hover} onClick={onClick}>
      {plugBody(p)}
      {grab[p.kind]}
      {isCarried && <mesh><sphereGeometry args={[p.kind === 'ac' ? 24 : 7, 14, 10]} /><meshBasicMaterial color="#4c9df3" transparent opacity={0.2} depthWrite={false} /></mesh>}
    </group>
  );
}


// ------------------------------------------------------------ cables
interface Run { a: THREE.Vector3; da: THREE.Vector3; b: THREE.Vector3; db: THREE.Vector3; arch?: boolean }
const kitTop = () => KIT_POS[1] + bench().box.top;
const overKit = (v: THREE.Vector3) => { const { w, d } = bench().box; return Math.abs(v.x - KIT_POS[0]) < w / 2 + 8 && Math.abs(v.z - KIT_POS[2]) < d / 2 + 8; };

function runCurve({ a, da, b, db, arch }: Run) {
  const len = a.distanceTo(b), lift = Math.min(55, 10 + len * 0.14);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  if (arch) mid.y = Math.max(a.y, b.y) + Math.min(46, 8 + len * 0.22);
  else {
    mid.y = Math.max(DESK_Y + 2.5, Math.min(a.y, b.y) - len * 0.08);
    if (overKit(mid)) mid.y = Math.max(mid.y, kitTop() + 14);   // drape over the kit, not through it
  }
  return new THREE.CatmullRomCurve3([a, a.clone().addScaledVector(da, lift), mid, b.clone().addScaledVector(db, lift), b], false, 'centripetal');
}

type RunOf = (plugs: Plugs, carrying: string | null) => Run;
function Cable({ run, color, radius }: { run: RunOf; color: string; radius: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const key = useRef('');
  const material = useMemo(() => mat(color, { roughness: 0.55 }), [color]);
  const empty = useMemo(() => new THREE.BufferGeometry(), []);
  useFrame(() => {
    const st = usePce.getState();
    const r = run(st.plugs, st.carrying);
    const k = [r.a, r.b, r.da, r.db].map((v) => v.toArray().map((n) => n.toFixed(1)).join()).join('|') + (r.arch ? 'A' : '');
    if (k === key.current || !mesh.current) return;
    key.current = k;
    mesh.current.geometry.dispose();
    mesh.current.geometry = new THREE.TubeGeometry(runCurve(r), 48, radius, 7, false);
  });
  return <mesh ref={mesh} geometry={empty} material={material} castShadow />;
}

/** AM kit: the mains cord's fixed part, out of the cover near the front-left corner, over the frame and down the side. */
function AmKitCord() {
  const geo = useMemo(() => {
    const x0 = KIT_POS[0] - PANEL.w / 2 + CORD_ENTRY.x, z = KIT_POS[2] + CORD_ENTRY.y - PANEL.h / 2, top = KIT_POS[1] + AM_BOX.h, left = KIT_POS[0] - AM_BOX.w / 2;
    const pts = [V(x0, KIT_POS[1] + AM_LEVEL.acrylic + 3, z), V(x0 - 9, top + 7, z), V(left + 4, top + 8, z + 1), V(left - 9, top - 4, z + 2), V(left - 12, DESK_Y + 30, z + 3), V(...BENCH.am.cordFoot)];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 48, 2.4, 8, false);
  }, []);
  return <mesh geometry={geo} material={PM.black} castShadow />;
}

/** Fixed part of a kit's mains cord, along the points its bench data gives. */
function FixedCord({ pts }: { pts: [number, number, number][] }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, 'centripetal'), 48, 2.4, 8, false), [pts]);
  return <mesh geometry={geo} material={PM.black} castShadow />;
}

const pose = (id: string, ps: Plugs, c: string | null) => plugPose(ps[id], ps, c);
const up = (d: THREE.Vector3, by: number) => d.clone().setY(d.y + by).normalize();
const mainsRun: RunOf = (ps, c) => {
  const q = pose('mains', ps, c);
  return { a: V(...bench().cordFoot), da: V(-0.5, 0.1, -0.85).normalize(), b: along(q, LEN.ac), db: up(q.dir, -0.3) };
};
/** Patch cord between its two ends; it arches when both are up on the kit. */
const cordRun = (id: string, len: number): RunOf => (ps, c) => {
  const a = pose(`${id}:a`, ps, c), b = pose(`${id}:b`, ps, c);
  const pa = along(a, len), pb = along(b, len);
  return { a: pa, da: a.dir, b: pb, db: b.dir, arch: pa.y > kitTop() - 4 && pb.y > kitTop() - 4 };
};

export function BenchCords() {
  const plugs = usePce((s) => s.plugs);
  const kit = usePce((s) => s.kit);
  const probes = !!BENCH[kit].probes, path = BENCH[kit].cordPath;
  const scopeOut = useMemo(() => { const a = scopePoint(0, 0, 0), b = scopePoint(0, 0, 1); return V(b[0] - a[0], 0.25, b[2] - a[2]).normalize(); }, []);
  const bnc = (id: 'ch1' | 'ch2') => V(...scopePoint(BNC[id][0], BNC[id][1], 24));
  // AM kit: probe cable to the back of the probe, and its ground lead from the probe body to the clip
  const probe = (id: 'ch1' | 'ch2'): RunOf => (ps, c) => { const q = pose(id, ps, c); return { a: bnc(id), da: scopeOut, b: along(q, LEN.probe), db: up(q.dir, 0.3) }; };
  const lead = (id: 'ch1' | 'ch2'): RunOf => (ps, c) => {
    const q = pose(id, ps, c), g = pose(`${id}g`, ps, c), side = flat(g.pos.clone().sub(q.pos));
    return { a: along(q, LEN.lead).addScaledVector(side, 3), da: side.clone().setY(-0.2).normalize(), b: along(g, LEN.clip), db: up(g.dir, 0.25) };
  };
  // FM kit: BNC-to-banana leads (both plugs from the same BNC) and the multimeter's leads
  const from = (start: () => THREE.Vector3, dir: THREE.Vector3, plug: string): RunOf => (ps, c) => { const q = pose(plug, ps, c); return { a: start(), da: dir, b: along(q, LEN.banana), db: up(q.dir, 0.2) }; };
  const meterOut = V(0.2, 0.5, 1).normalize();
  return (
    <group>
      <Cable run={mainsRun} color="#1c1c1e" radius={2.4} />
      {kit === 'am' && <AmKitCord />}
      {!!path && <FixedCord pts={path} />}
      {probes && <>
        <Cable run={probe('ch1')} color="#2e3238" radius={1.9} />
        <Cable run={probe('ch2')} color="#2e3238" radius={1.9} />
        <Cable run={lead('ch1')} color="#151515" radius={1.1} />
        <Cable run={lead('ch2')} color="#151515" radius={1.1} />
      </>}
      {!probes && <>
        {(['ch1', 'ch2'] as const).map((id) => [
          <Cable key={id} run={from(() => bnc(id), scopeOut, id)} color="#c8302b" radius={1.5} />,
          <Cable key={`${id}g`} run={from(() => bnc(id), scopeOut, `${id}g`)} color="#1b1b1d" radius={1.5} />,
        ])}
      </>}
      {!!plugs['dmm:v'] && <>
        <Cable run={from(() => V(...dmmJack('v')), meterOut, 'dmm:v')} color="#c8302b" radius={1.5} />
        <Cable run={from(() => V(...dmmJack('com')), meterOut, 'dmm:com')} color="#1b1b1d" radius={1.5} />
      </>}
      {BENCH[kit].cords.map((c) => <Cable key={`${kit}${c.id}`} run={cordRun(c.id, probes ? LEN.sleeve : LEN.banana)} color={c.wire} radius={probes ? 1.25 : 1.5} />)}
      {Object.values(plugs).map((p) => <PlugMesh key={`${kit}${p.id}`} p={p} />)}
    </group>
  );
}
