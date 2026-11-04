// Static 3D component primitives (all dimensions in millimetres).
// Each component is built from simple shared geometries/materials so the whole
// board stays light enough for integrated GPUs in the lab.

import { useMemo } from 'react';
import * as THREE from 'three';
import { chipTexture } from './textures.ts';

export const MAT = {
  black: new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.55, metalness: 0.05 }),
  blackGloss: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.25, metalness: 0.1 }),
  pin: new THREE.MeshStandardMaterial({ color: '#cfd2d6', roughness: 0.3, metalness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: '#d8b25a', roughness: 0.3, metalness: 0.9 }),
  silver: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.32, metalness: 0.85 }),
  white: new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.6 }),
  grey: new THREE.MeshStandardMaterial({ color: '#c9c8c2', roughness: 0.6 }),
  cavity: new THREE.MeshStandardMaterial({ color: '#25262a', roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: '#e0335f', roughness: 0.45 }),
  terminal: new THREE.MeshStandardMaterial({ color: '#2e9a55', roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2a6fd1', roughness: 0.45 }),
  zif: new THREE.MeshStandardMaterial({ color: '#2f8f7f', roughness: 0.5 }),
  beige: new THREE.MeshStandardMaterial({ color: '#d9c9a3', roughness: 0.6 }),
  orange: new THREE.MeshStandardMaterial({ color: '#d0892c', roughness: 0.45 }),
  brass: new THREE.MeshStandardMaterial({ color: '#c7a24a', roughness: 0.35, metalness: 0.85 }),
  pcbEdge: new THREE.MeshStandardMaterial({ color: '#2a5a35', roughness: 0.8 }),
  lcdPcb: new THREE.MeshStandardMaterial({ color: '#1f6b39', roughness: 0.7 }),
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 24);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 10);

type V3 = [number, number, number];

/** Axis aligned box given centre and size. */
export function Box({ p, s, m, ...rest }: { p: V3; s: V3; m: THREE.Material } & Partial<{ castShadow: boolean }>) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} castShadow={rest.castShadow ?? true} receiveShadow />;
}

export function Cyl({ p, r, h, m, rot, seg8 }: { p: V3; r: number; h: number; m: THREE.Material; rot?: V3; seg8?: boolean }) {
  return <mesh geometry={seg8 ? CYL8 : CYL} material={m} position={p} scale={[r, h, r]} rotation={rot} castShadow receiveShadow />;
}

/** Many identical small boxes (pins) as a single instanced mesh. */
export function Pins({ points, size, m = MAT.pin }: { points: V3[]; size: V3; m?: THREE.Material }) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(BOX, m, points.length);
    const mat4 = new THREE.Matrix4();
    points.forEach((pt, i) => { mat4.compose(new THREE.Vector3(...pt), new THREE.Quaternion(), new THREE.Vector3(...size)); im.setMatrixAt(i, mat4); });
    im.castShadow = true;
    return im;
  }, [points, size, m]);
  return <primitive object={mesh} />;
}

// ----------------------------------------------------------------- ICs
export function Dip({ pins, label, sub, wide, socket }: { pins: number; label?: string; sub?: string; wide?: boolean; socket?: boolean }) {
  const n = pins / 2;
  const L = n * 2.54 + 0.4;
  const rowSpace = wide ? 15.24 : 7.62;
  const W = wide ? 13.8 : 6.4;
  const z0 = socket ? 3 : 0.6;
  const H = 3.2;
  const tex = useMemo(() => (label ? chipTexture(label, sub, L, W) : null), [label, sub, L, W]);
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.2 + 1.27 + i * 2.54;
      out.push([x, z0 + 0.6, rowSpace / 2 - 0.2], [x, z0 + 0.6, -rowSpace / 2 + 0.2]);
    }
    return out;
  }, [n, L, rowSpace, z0]);
  return (
    <group>
      {socket && <Box p={[0, 1.5, 0]} s={[L + 1, 3, rowSpace + 2.4]} m={MAT.black} />}
      <Box p={[0, z0 + H / 2, 0]} s={[L, H, W]} m={MAT.blackGloss} />
      {tex && (
        <mesh position={[0, z0 + H + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[L, W]} />
          <meshStandardMaterial map={tex} roughness={0.5} />
        </mesh>
      )}
      <Pins points={pts} size={[0.5, 1.6, rowSpace - W + 0.4]} />
    </group>
  );
}

export function Socket({ pins }: { pins: number }) {
  const n = pins / 2;
  const L = n * 2.54 + 1.4;
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.7 + 1.27 + i * 2.54;
      out.push([x, 3.05, 3.81], [x, 3.05, -3.81]);
    }
    return out;
  }, [n, L]);
  return (
    <group>
      <Box p={[0, 1.5, 3.81]} s={[L, 3, 1.9]} m={MAT.black} />
      <Box p={[0, 1.5, -3.81]} s={[L, 3, 1.9]} m={MAT.black} />
      <Box p={[-L / 2 + 0.6, 1.5, 0]} s={[1.2, 3, 7.6]} m={MAT.black} />
      <Box p={[L / 2 - 0.6, 1.5, 0]} s={[1.2, 3, 7.6]} m={MAT.black} />
      <Pins points={pts} size={[0.8, 0.12, 0.8]} m={MAT.gold} />
    </group>
  );
}

export function Qfn({ size }: { size: number }) {
  return <Box p={[0, 0.45, 0]} s={[size, 0.9, size]} m={MAT.blackGloss} />;
}

// ------------------------------------------------------------- headers
export function Header({ n, rows = 1, female }: { n: number; rows?: 1 | 2; female?: boolean }) {
  const L = n * 2.54;
  const D = rows * 2.54;
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) out.push([-L / 2 + 1.27 + i * 2.54, female ? 8.52 : 5.5, -D / 2 + 1.27 + r * 2.54]);
    return out;
  }, [n, rows, L, D, female]);
  if (female) {
    return (
      <group>
        <Box p={[0, 4.25, 0]} s={[L, 8.5, D]} m={MAT.black} />
        <Pins points={pts} size={[1, 0.05, 1]} m={MAT.cavity} />
      </group>
    );
  }
  return (
    <group>
      <Box p={[0, 1.25, 0]} s={[L, 2.5, D]} m={MAT.black} />
      <Pins points={pts} size={[0.64, 8.5, 0.64]} m={MAT.gold} />
    </group>
  );
}

/** Shrouded 2x5 IDC box header for FRC ribbon cables. */
export function BoxHeader({ color }: { color: 'black' | 'white' }) {
  const m = color === 'white' ? MAT.grey : MAT.black;
  const L = 20.3, D = 8.9, H = 9, t = 0.9;
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 5; i++) for (let r = 0; r < 2; r++) out.push([-5.08 + i * 2.54, 4.5, -1.27 + r * 2.54]);
    return out;
  }, []);
  return (
    <group>
      <Box p={[0, 0.5, 0]} s={[L, 1, D]} m={m} />
      <Box p={[0, H / 2, D / 2 - t / 2]} s={[L, H, t]} m={m} />
      <Box p={[-3, H / 2, -D / 2 + t / 2]} s={[L / 2 - 2.6, H, t]} m={m} />
      <Box p={[6.6, H / 2, -D / 2 + t / 2]} s={[L / 2 - 3.2 + 0.6, H, t]} m={m} />
      <Box p={[-L / 2 + t / 2, H / 2, 0]} s={[t, H, D]} m={m} />
      <Box p={[L / 2 - t / 2, H / 2, 0]} s={[t, H, D]} m={m} />
      <Box p={[0, 1.05, 0]} s={[L - 2 * t, 0.1, D - 2 * t]} m={MAT.cavity} />
      <Pins points={pts} size={[0.64, 6.5, 0.64]} m={MAT.gold} />
    </group>
  );
}

export function Relimate({ n }: { n: number }) {
  const L = n * 2.54 + 2.4;
  const pts = useMemo(() => Array.from({ length: n }, (_, i): V3 => [-L / 2 + 1.2 + 1.27 + i * 2.54, 4, 0.6]), [n, L]);
  return (
    <group>
      <Box p={[0, 3, -1]} s={[L, 6, 1]} m={MAT.white} />
      <Box p={[0, 0.5, 0]} s={[L, 1, 5]} m={MAT.white} />
      <Box p={[-L / 2 + 0.4, 3, 0]} s={[0.8, 6, 5]} m={MAT.white} />
      <Box p={[L / 2 - 0.4, 3, 0]} s={[0.8, 6, 5]} m={MAT.white} />
      <Pins points={pts} size={[0.64, 6, 0.64]} m={MAT.pin} />
    </group>
  );
}

export function Jumper({ n, cap = 0 }: { n: number; cap?: number }) {
  const L = n * 2.54;
  return (
    <group>
      <Header n={n} />
      {cap >= 0 && cap < n - 1 && <Box p={[-L / 2 + 2.54 + cap * 2.54, 5.5, 0]} s={[5, 6, 2.6]} m={MAT.blackGloss} />}
    </group>
  );
}

export function Icsp() {
  const pts = useMemo(() => Array.from({ length: 6 }, (_, i): V3 => [-6.35 + i * 2.54, 1.6, -6]), []);
  return (
    <group>
      <Box p={[0, 3.3, 0]} s={[16, 6.6, 5.5]} m={MAT.white} />
      <Box p={[0, 3.3, -2.8]} s={[14.6, 5, 0.2]} m={MAT.cavity} />
      <Pins points={pts} size={[0.64, 0.64, 12]} m={MAT.gold} />
    </group>
  );
}

// ------------------------------------------------------------ passives
const BAND_COLORS = ['#7a4a1f', '#111', '#d22', '#c8a53c'];
export function Resistor() {
  return (
    <group>
      <Cyl p={[0, 1.2, 0]} r={0.95} h={6} m={MAT.beige} rot={[0, 0, Math.PI / 2]} />
      {BAND_COLORS.map((c, i) => (
        <mesh key={i} geometry={CYL} position={[-1.8 + i * 1.1 + (i === 3 ? 0.5 : 0), 1.2, 0]} scale={[1.0, 0.45, 1.0]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      <Cyl p={[0, 1.2, 0]} r={0.22} h={10} m={MAT.pin} rot={[0, 0, Math.PI / 2]} />
    </group>
  );
}

export function Diode() {
  return (
    <group>
      <Cyl p={[0, 1.4, 0]} r={1.3} h={5} m={MAT.black} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[1.8, 1.4, 0]} r={1.33} h={0.6} m={MAT.silver} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[0, 1.4, 0]} r={0.25} h={8} m={MAT.pin} rot={[0, 0, Math.PI / 2]} />
    </group>
  );
}

export function CapE({ d, h, color = '#1d3f8f' }: { d: number; h: number; color?: string }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 }), [color]);
  return (
    <group>
      <Cyl p={[0, h / 2 + 0.3, 0]} r={d / 2} h={h} m={m} />
      <Cyl p={[0, h + 0.32, 0]} r={d / 2 - 0.25} h={0.05} m={MAT.silver} />
      <Box p={[d / 2 - 0.3, h / 2 + 0.3, 0]} s={[0.4, h * 0.9, d * 0.35]} m={MAT.grey} castShadow={false} />
    </group>
  );
}

export function CapC({ color = '#d0892c' }: { color?: string }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), [color]);
  return (
    <group>
      <mesh geometry={CYL} material={m} position={[0, 3.2, 0]} scale={[2.1, 1.1, 2.1]} rotation={[Math.PI / 2, 0, 0]} castShadow />
      <Box p={[-0.9, 1, 0]} s={[0.3, 2, 0.3]} m={MAT.pin} />
      <Box p={[0.9, 1, 0]} s={[0.3, 2, 0.3]} m={MAT.pin} />
    </group>
  );
}

export function Crystal({ type }: { type: 'hc49' | 'cyl' }) {
  if (type === 'cyl') return <Cyl p={[0, 1.1, 0]} r={1} h={6} m={MAT.silver} rot={[0, 0, Math.PI / 2]} />;
  return (
    <group>
      <Box p={[0, 1.9, 0]} s={[10, 3.5, 4]} m={MAT.silver} />
      <Cyl p={[-5, 1.9, 0]} r={2} h={3.5} m={MAT.silver} />
      <Cyl p={[5, 1.9, 0]} r={2} h={3.5} m={MAT.silver} />
      <Box p={[0, 0.1, 0]} s={[11, 0.2, 4.6]} m={MAT.black} />
    </group>
  );
}

export function Sip({ n }: { n: number }) {
  return <Box p={[0, 2.8, 0]} s={[n * 2.54, 5.5, 2.2]} m={MAT.black} />;
}

export function To92() {
  return (
    <group>
      <mesh position={[0, 3.2, 0]} castShadow>
        <cylinderGeometry args={[2.3, 2.3, 4.6, 20, 1, false, 0, Math.PI]} />
        <primitive object={MAT.black} attach="material" />
      </mesh>
      <Box p={[0, 3.2, 0]} s={[4.6, 4.6, 0.05]} m={MAT.black} />
      <Box p={[-1.27, 0.5, 0.8]} s={[0.4, 1, 0.4]} m={MAT.pin} />
      <Box p={[0, 0.5, 0.8]} s={[0.4, 1, 0.4]} m={MAT.pin} />
      <Box p={[1.27, 0.5, 0.8]} s={[0.4, 1, 0.4]} m={MAT.pin} />
    </group>
  );
}

// ----------------------------------------------------------- connectors
export function DcJack() {
  return (
    <group>
      <Box p={[0, 5.5, 0]} s={[14, 11, 9]} m={MAT.black} />
      <Cyl p={[-7.05, 6, 0]} r={3.2} h={0.2} m={MAT.cavity} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[-6.9, 6, 0]} r={1} h={0.3} m={MAT.pin} rot={[0, 0, Math.PI / 2]} />
    </group>
  );
}

export function UsbB() {
  return (
    <group>
      <Box p={[0, 5.5, 0]} s={[16, 11, 12]} m={MAT.silver} />
      <Box p={[-8.05, 6, 0]} s={[0.2, 7.5, 8]} m={MAT.cavity} />
      <Box p={[-7.9, 6.2, 0]} s={[0.4, 3, 5]} m={MAT.white} />
    </group>
  );
}

export function Db9() {
  return (
    <group>
      <Box p={[0, 5, -1]} s={[22, 10, 10]} m={MAT.blackGloss} />
      <Box p={[0, 6.2, 4.4]} s={[31, 12.5, 0.8]} m={MAT.silver} />
      <Box p={[0, 6.2, 5.4]} s={[17, 8, 2]} m={MAT.silver} />
      <Box p={[0, 6.2, 6.45]} s={[15, 6.4, 0.1]} m={MAT.cavity} />
      <Cyl p={[-12.5, 6.2, 5.5]} r={2.2} h={3} m={MAT.silver} rot={[Math.PI / 2, 0, 0]} seg8 />
      <Cyl p={[12.5, 6.2, 5.5]} r={2.2} h={3} m={MAT.silver} rot={[Math.PI / 2, 0, 0]} seg8 />
    </group>
  );
}

export function Terminal({ n, color }: { n: number; color?: string }) {
  const m = useMemo(() => (color ? new THREE.MeshStandardMaterial({ color, roughness: 0.5 }) : MAT.terminal), [color]);
  const L = n * 5.08;
  return (
    <group>
      <Box p={[0, 5, 0]} s={[L, 10, 7.5]} m={m} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[-L / 2 + 2.54 + i * 5.08, 10, 0.8]}>
          <Cyl p={[0, 0.05, 0]} r={1.7} h={0.3} m={MAT.silver} />
          <Box p={[0, 0.25, 0]} s={[3, 0.2, 0.5]} m={MAT.cavity} castShadow={false} />
        </group>
      ))}
      {Array.from({ length: n }, (_, i) => <Box key={`h${i}`} p={[-L / 2 + 2.54 + i * 5.08, 5, -3.8]} s={[3.2, 3.4, 0.2]} m={MAT.cavity} castShadow={false} />)}
    </group>
  );
}

export function Regulator() {
  const fins = useMemo(() => Array.from({ length: 7 }, (_, i) => -7.5 + i * 2.5), []);
  return (
    <group>
      <Box p={[0, 9, 3]} s={[16, 18, 2]} m={MAT.black} />
      {fins.map((x) => <Box key={x} p={[x, 9, 0]} s={[0.9, 18, 6]} m={MAT.black} />)}
      <Box p={[0, 9, 4.6]} s={[10, 15, 1.3]} m={MAT.silver} />
      <Box p={[0, 7, 6]} s={[10, 9, 4.4]} m={MAT.blackGloss} />
      <Cyl p={[0, 13, 5.5]} r={1.6} h={2} m={MAT.silver} rot={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

export function Zif() {
  return (
    <group>
      <Box p={[0, 2.5, 0]} s={[60, 5, 17.5]} m={MAT.zif} />
      <Box p={[-31.5, 2.5, 0]} s={[3, 5, 9]} m={MAT.zif} />
      <Cyl p={[-34, 4.5, 2]} r={0.7} h={12} m={MAT.silver} rot={[0, 0, 0]} />
      <Cyl p={[-34, 10.5, 2]} r={1.4} h={3} m={MAT.zif} />
      <Box p={[0, 5.02, 0]} s={[56, 0.05, 17]} m={MAT.cavity} castShadow={false} />
    </group>
  );
}

export function Screw() {
  return (
    <group>
      <Cyl p={[0, 0.8, 0]} r={2.8} h={1.6} m={MAT.silver} />
      <Box p={[0, 1.62, 0]} s={[4, 0.1, 0.6]} m={MAT.cavity} castShadow={false} />
    </group>
  );
}

export function RelayBody() {
  const tex = useMemo(() => chipTexture('VRS4H-S-DC6V-C', '10A 250VAC', 19, 15.5), []);
  return (
    <group>
      <Box p={[0, 7.5, 0]} s={[19, 15, 15.5]} m={MAT.blackGloss} />
      <mesh position={[0, 15.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[19, 15.5]} />
        <meshStandardMaterial map={tex} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Standoff({ h }: { h: number }) {
  return <Cyl p={[0, h / 2, 0]} r={2.2} h={h} m={MAT.brass} seg8 />;
}
