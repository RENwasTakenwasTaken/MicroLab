// Laboratory room: bench desk, wall, cabinet (from the reference photos).

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { DESK_Y } from './world.ts';

const laminate = new THREE.MeshStandardMaterial({ color: '#e7dcc6', roughness: 0.72 });
const edge = new THREE.MeshStandardMaterial({ color: '#cdbfa3', roughness: 0.7 });
const wall = new THREE.MeshStandardMaterial({ color: '#ead5c2', roughness: 0.95 });
const steel = new THREE.MeshStandardMaterial({ color: '#5d6168', roughness: 0.6, metalness: 0.3 });
const cabinet = new THREE.MeshStandardMaterial({ color: '#4a4e55', roughness: 0.6 });
const floor = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.9 });
const partition = new THREE.MeshStandardMaterial({ color: '#3d82c4', roughness: 0.85 });

export function Room({ onDeskClick }: { onDeskClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const files = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ y: i * 7, c: ['#f3e3a0', '#9fd0e8', '#f2a6a6', '#c9e7b4', '#fff2c8'][i % 5], dx: (i % 3) * 6 })), []);
  return (
    <group>
      {/* desk top: clicking it while carrying a plug drops the plug there */}
      <mesh position={[0, DESK_Y - 15, -60]} receiveShadow onClick={onDeskClick}>
        <boxGeometry args={[2000, 30, 900]} />
        <primitive object={laminate} attach="material" />
      </mesh>
      <mesh position={[0, DESK_Y - 15, 391]}>
        <boxGeometry args={[2000, 30, 4]} />
        <primitive object={edge} attach="material" />
      </mesh>
      {[-960, 960].map((x) => [-480, 360].map((z) => (
        <mesh key={`${x}${z}`} position={[x, DESK_Y - 400, z]}>
          <boxGeometry args={[40, 740, 40]} />
          <primitive object={steel} attach="material" />
        </mesh>
      )))}
      <mesh position={[0, DESK_Y - 770, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6000, 6000]} />
        <primitive object={floor} attach="material" />
      </mesh>
      {/* wall + blue partition (as in the lab photos) */}
      <mesh position={[0, 500, -520]} receiveShadow>
        <planeGeometry args={[6000, 2600]} />
        <primitive object={wall} attach="material" />
      </mesh>
      <mesh position={[1150, 200, -300]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[500, 420, 20]} />
        <primitive object={partition} attach="material" />
      </mesh>
      {/* side cabinet with lab files */}
      <group position={[-1350, DESK_Y - 770, -330]}>
        <mesh position={[0, 380, 0]} castShadow receiveShadow>
          <boxGeometry args={[500, 760, 380]} />
          <primitive object={cabinet} attach="material" />
        </mesh>
        <mesh position={[0, 765, 0]}>
          <boxGeometry args={[520, 12, 400]} />
          <primitive object={laminate} attach="material" />
        </mesh>
        {files.map((f, i) => (
          <mesh key={i} position={[f.dx - 40, 776 + f.y, 0]} castShadow>
            <boxGeometry args={[300, 6, 220]} />
            <meshStandardMaterial color={f.c} roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
