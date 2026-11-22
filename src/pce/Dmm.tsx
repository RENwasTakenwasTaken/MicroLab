// Hand-held digital multimeter of the PCE bench, on DC volts (20 V range): it shows the voltage
// between its red and black leads once both are in sockets of the kit.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CanvasScreen, drawDmm } from '../lab3d/screens.ts';
import { useHover } from '../three/interactive.tsx';
import { dmmVolts, syncKit } from './fm/signals.ts';
import { DMM } from './world.ts';

const M = {
  holster: new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.55 }),
  body: new THREE.MeshStandardMaterial({ color: '#2b2c2f', roughness: 0.5 }),
  dial: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: '#c8302b', roughness: 0.45 }),
  white: new THREE.MeshBasicMaterial({ color: '#f1f1ee' }),
};

/** Latest reading, for tooltips and tests (null: a lead is not connected). */
export const dmmLive: { volts: number | null } = { volts: null };

export function Dmm() {
  const screen = useMemo(() => new CanvasScreen(420, 190), []);
  const last = useRef(0);
  const hover = useHover({
    name: 'Digital multimeter', info: 'Set to DC volts, 20 V range. Red lead to the point to measure, black lead to GND.',
    live: () => (dmmLive.volts === null ? 'leads not connected' : `${dmmLive.volts.toFixed(2)} V DC`),
  });
  useFrame(() => {
    const t = performance.now();
    if (t - last.current < 300) return;
    last.current = t;
    syncKit();
    const v = dmmVolts();
    dmmLive.volts = v;
    // open leads pick up a few millivolts; a 3 1/2 digit meter shows hundredths on this range
    const shown = v === null ? (Math.random() < 0.3 ? 0.01 : 0) : v + (Math.random() - 0.5) * 0.008;
    drawDmm(screen, true, Math.abs(shown) >= 20 ? ' 1   ' : shown.toFixed(2), 'V', ['DC']);
  });
  return (
    <group position={DMM.pos} rotation={[0, DMM.rotY, 0]} {...hover}>
      <mesh position={[0, 14, 0]} castShadow receiveShadow material={M.holster}><boxGeometry args={[82, 28, 150]} /></mesh>
      <mesh position={[0, 28.2, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.body}><planeGeometry args={[70, 138]} /></mesh>
      <mesh position={[0, 28.5, -42]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[56, 25.3]} /><meshBasicMaterial map={screen.texture} toneMapped={false} /></mesh>
      <mesh position={[0, 31, 8]} castShadow material={M.dial}><cylinderGeometry args={[19, 20, 6, 28]} /></mesh>
      <mesh position={[0, 34.2, -3]} material={M.white}><boxGeometry args={[2, 0.4, 12]} /></mesh>
      {[-22, -9, 12].map((x, i) => <mesh key={x} position={[x, 29.5, 56]} material={i === 2 ? M.red : M.dial}><cylinderGeometry args={[4.6, 4.6, 3, 16]} /></mesh>)}
    </group>
  );
}
