// Lab desktop computer: Dell monitor (live code on screen), tower with the USB
// port feeding the board, keyboard and mouse. Clicking the screen enters coding mode.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sourceFor, useLab } from '../app/store.ts';
import { useBench, usbConnected } from '../app/bench.ts';
import { sim } from '../app/sim.ts';
import { useHover } from '../three/interactive.tsx';
import { CanvasScreen, drawMonitor } from './screens.ts';
import { COMPUTER, rotateY, type V3 } from './world.ts';

const black = new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.45 });
const black2 = new THREE.MeshStandardMaterial({ color: '#25272b', roughness: 0.6 });
const grey = new THREE.MeshStandardMaterial({ color: '#7d828a', roughness: 0.4, metalness: 0.5 });

const M = COMPUTER.monitor;
const SCREEN_LOCAL: V3 = [0, M.screenY + 5.5, 11.6];

/** World-space geometry of the monitor's screen, used by the camera rig and the coding overlay. */
export function screenFrame() {
  const c = rotateY(SCREEN_LOCAL, M.rotY, M.pos);
  const n: V3 = [Math.sin(M.rotY), 0, Math.cos(M.rotY)];
  const right: V3 = [Math.cos(M.rotY), 0, -Math.sin(M.rotY)];
  const corners: V3[] = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => [
    c[0] + right[0] * (sx * M.screenW) / 2, c[1] + (sy * M.screenH) / 2, c[2] + right[2] * (sx * M.screenW) / 2,
  ]);
  return { center: c, normal: n, corners, w: M.screenW, h: M.screenH };
}

function deviceText() {
  const f = sim.latest;
  if (!f || f.cpu.arch !== 'pic18') return '—';
  if (!usbConnected()) return 'not detected';
  return f.device.mode === 'bootloader' ? 'PIC18F4550 HID Bootloader (attached)' : 'not in bootloader mode';
}

function keyboardTexture() {
  const c = document.createElement('canvas');
  c.width = 880; c.height = 280;
  const g = c.getContext('2d')!;
  g.fillStyle = '#16171a'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2b2d33';
  for (let r = 0; r < 6; r++) for (let k = 0; k < 15; k++) g.fillRect(14 + k * 44, 18 + r * 42, 38, 36);
  g.fillStyle = '#2b2d33'; g.fillRect(160, 18 + 5 * 42, 330, 36);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) g.fillRect(690 + k * 44, 60 + r * 42, 38, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Computer() {
  const screen = useMemo(() => new CanvasScreen(1280, 720), []);
  const kb = useMemo(() => keyboardTexture(), []);
  const route = useLab((s) => s.route);
  const view = useBench((s) => s.view);
  const last = useRef(0);
  const hover = useHover({ name: 'Lab computer (Dell monitor)', info: 'Click the screen to open MPLAB and write / upload your program.' });
  const towerHover = useHover({ name: 'PC tower', info: 'Front USB port: Type-B USB cable to the PIC board (USB HID bootloader).' });

  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 200) return;
    last.current = now;
    const id = route.page === 'exp' ? route.id : '';
    drawMonitor(screen, sourceFor(id), useBench.getState().upload, deviceText(), usbConnected(), true);
  });

  const open = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    if (useBench.getState().carrying) return;
    if (view !== 'computer') useBench.getState().setView('computer');
  };

  const T = COMPUTER.tower;
  return (
    <group>
      {/* monitor */}
      <group position={M.pos} rotation={[0, M.rotY, 0]}>
        <mesh position={[0, 6, 10]} castShadow receiveShadow><boxGeometry args={[210, 12, 175]} /><primitive object={black} attach="material" /></mesh>
        <mesh position={[0, 100, -8]} castShadow><boxGeometry args={[62, 190, 28]} /><primitive object={black} attach="material" /></mesh>
        <group {...hover} onClick={open}>
          <mesh position={[0, M.screenY, 0]} castShadow><boxGeometry args={[M.panelW, M.panelH, 22]} /><primitive object={black} attach="material" /></mesh>
          <mesh position={SCREEN_LOCAL}>
            <planeGeometry args={[M.screenW, M.screenH]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        </group>
        {/* bezel details: DELL logo, buttons, power LED */}
        <mesh position={[0, M.screenY - M.panelH / 2 + 12, 11.2]}><planeGeometry args={[34, 9]} /><meshBasicMaterial color="#9aa0a8" /></mesh>
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[150 + i * 16, M.screenY - M.panelH / 2 + 11, 11.2]}><circleGeometry args={[2.2, 12]} /><meshBasicMaterial color="#3a3d43" /></mesh>)}
        <mesh position={[218, M.screenY - M.panelH / 2 + 11, 11.3]}><circleGeometry args={[3, 16]} /><meshBasicMaterial color="#e8f1ff" /></mesh>
      </group>

      {/* tower */}
      <group position={T.pos} rotation={[0, T.rotY, 0]} {...towerHover}>
        <mesh position={[0, T.h / 2, 0]} castShadow receiveShadow><boxGeometry args={[T.w, T.h, T.d]} /><primitive object={black2} attach="material" /></mesh>
        <mesh position={[0, T.h - 60, T.d / 2 + 0.6]}><boxGeometry args={[150, 14, 1]} /><primitive object={black} attach="material" /></mesh>
        <mesh position={[0, T.h - 120, T.d / 2 + 1]}><cylinderGeometry args={[11, 11, 3, 24]} /><primitive object={grey} attach="material" /></mesh>
        <mesh position={[0, T.h - 120, T.d / 2 + 2.6]}><circleGeometry args={[4, 16]} /><meshBasicMaterial color="#3aa0ff" /></mesh>
        {[-10, 30, 50].map((x, i) => <mesh key={i} position={[x + 10, 330, T.d / 2 + 0.6]}><boxGeometry args={[14, 6, 1.2]} /><meshBasicMaterial color={i === 1 ? '#1a62c9' : '#0a0a0a'} /></mesh>)}
      </group>

      {/* keyboard & mouse */}
      <group position={COMPUTER.keyboard.pos} rotation={[0, COMPUTER.keyboard.rotY, 0]}>
        <mesh position={[0, 12, 0]} rotation={[0.05, 0, 0]} castShadow receiveShadow><boxGeometry args={[440, 22, 140]} /><primitive object={black} attach="material" /></mesh>
        <mesh position={[0, 23.6, 0]} rotation={[-Math.PI / 2 + 0.05, 0, 0]}><planeGeometry args={[430, 132]} /><meshStandardMaterial map={kb} roughness={0.7} /></mesh>
      </group>
      <mesh position={[COMPUTER.mouse.pos[0], COMPUTER.mouse.pos[1] + 14, COMPUTER.mouse.pos[2]]} scale={[32, 18, 56]} castShadow>
        <sphereGeometry args={[1, 20, 12]} />
        <primitive object={black} attach="material" />
      </mesh>
    </group>
  );
}
