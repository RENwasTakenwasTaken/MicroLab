// Mains supply for the trainer: a modular switchboard on the wall in front of the bench and the
// 12 V adapter (a black SMPS brick on the desk). The adapter's DC cord is fixed to the board's
// DC jack; its mains cord ends in the 2-pin plug, a bench plug the student carries to the wall
// socket (see Cables.tsx).

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useHover } from '../three/interactive.tsx';
import { ADAPTER, BARREL_BACK, DESK_Y, WALLBOARD } from './world.ts';

const MAT = {
  plate: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.4 }),
  recess: new THREE.MeshStandardMaterial({ color: '#e4e3de', roughness: 0.5 }),
  hole: new THREE.MeshBasicMaterial({ color: '#202023' }),
  rocker: new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.35 }),
  neon: new THREE.MeshStandardMaterial({ color: '#ff5a3c', emissive: '#ff3a1c', emissiveIntensity: 1.6, roughness: 0.3 }),
  brick: new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.55 }),
  cord: new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.55 }),
};

/** Switchboard plate on the wall: the mains switch (ON, red indicator) and a 3-pin socket. */
function WallBoard() {
  const { pos, w, h, d, socketX, switchX } = WALLBOARD;
  const hover = useHover({
    name: 'Wall socket (230 V)',
    info: 'Switchboard on the wall in front of the bench. Plug the 12 V adapter\'s 2-pin plug into the socket, then switch the board\'s POWER switch ON.',
  });
  const face = d + 0.05;
  return (
    <group position={pos} {...hover}>
      <RoundedBox args={[w, h, d]} radius={3} smoothness={3} position={[0, 0, d / 2]} castShadow receiveShadow material={MAT.plate} />
      {/* socket: round recess, two pin holes 19 mm apart, the earth hole above them */}
      <group position={[socketX, 0, face]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.6]} material={MAT.recess}><cylinderGeometry args={[25, 26, 1.2, 40]} /></mesh>
        {[-9.5, 9.5].map((x) => <mesh key={x} position={[x, -5, 1.25]} material={MAT.hole}><circleGeometry args={[2.8, 18]} /></mesh>)}
        <mesh position={[0, 9, 1.25]} material={MAT.hole}><circleGeometry args={[3.8, 18]} /></mesh>
      </group>
      {/* mains switch, ON (rocker pressed at the top) with its red indicator */}
      <group position={[switchX, 0, face]}>
        <mesh position={[0, 0, 0.4]}><boxGeometry args={[24, 42, 0.8]} /><primitive object={MAT.recess} attach="material" /></mesh>
        <mesh position={[0, 2, 2.2]} rotation={[0.18, 0, 0]} castShadow material={MAT.rocker}><boxGeometry args={[18, 30, 3]} /></mesh>
        <mesh position={[0, -16, 1.2]} material={MAT.neon}><sphereGeometry args={[2, 12, 8]} /></mesh>
      </group>
    </group>
  );
}

/** The 12 V adapter: a plain black brick, DC cord out of the front, mains cord out of the back. */
function AdapterBrick() {
  const { pos, w, h, d } = ADAPTER;
  const hover = useHover({
    name: '12 V DC adapter',
    info: 'Power supply for the trainer: 230 V AC in (2-pin plug to the wall socket), 12 V DC out to the board\'s DC jack.',
  });
  return (
    <group position={pos} {...hover}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={MAT.brick}><boxGeometry args={[w, h, d]} /></mesh>
    </group>
  );
}

/** DC cord from the adapter's front grip to the barrel plug in the board's DC jack. */
function DcCord() {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(ADAPTER.pos[0], DESK_Y + 14, ADAPTER.pos[2] + ADAPTER.d / 2);
    const b = new THREE.Vector3(...BARREL_BACK);
    const curve = new THREE.CatmullRomCurve3([
      a, a.clone().add(new THREE.Vector3(0, 2, 30)),
      new THREE.Vector3((a.x + b.x) / 2 + 12, DESK_Y + 2.4, (a.z + b.z) / 2),
      b.clone().add(new THREE.Vector3(0, 6, -26)), b,
    ], false, 'centripetal');
    return new THREE.TubeGeometry(curve, 80, 2.2, 8, false);
  }, []);
  return <mesh geometry={geo} material={MAT.cord} castShadow />;
}

export function Mains() {
  return (
    <group>
      <WallBoard />
      <AdapterBrick />
      <DcCord />
    </group>
  );
}
