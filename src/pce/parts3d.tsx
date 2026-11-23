// Small interactive 3D controls shared by the PCE kit and its oscilloscope.

import { useEffect, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useHover } from '../three/interactive.tsx';
import { usePce } from './store.ts';

/** While a plug is being carried, a click puts it down: controls must not react to it. */
export const busy = () => !!usePce.getState().carrying;

type Controls = { enabled: boolean; enableZoom: boolean } | null;
/** While the pointer is over a control that turns on the mouse wheel, the wheel must not also zoom the camera. */
export function useZoomLock() {
  const controls = useThree((s) => s.controls) as unknown as Controls;
  useEffect(() => () => { if (controls) controls.enableZoom = true; }, [controls]);
  return (locked: boolean) => { if (controls) controls.enableZoom = !locked; };
}
/** While a pot is dragged, the drag must not orbit the camera. */
export function useOrbitLock() {
  const controls = useThree((s) => s.controls) as unknown as Controls;
  return (locked: boolean) => { if (controls) controls.enabled = !locked; };
}

/** Rotary knob that steps: click or scroll up = clockwise, right-click or scroll down = anticlockwise. Shift = coarse. */
export function StepKnob({ pos, r = 6, h, color = '#e9e7df', name, info, live, onStep }: {
  pos: [number, number, number]; r?: number; h?: number; color?: string; name: string; info?: string; live?: () => string;
  onStep?: (dir: 1 | -1, coarse: boolean) => void;
}) {
  const hover = useHover({ name, info: `${info ? `${info}\n` : ''}${onStep ? 'Click or scroll up: clockwise · right-click or scroll down: anticlockwise · Shift: bigger steps' : 'Not used in this experiment'}`, live });
  const zoom = useZoomLock();
  const ref = useRef<THREE.Group>(null);
  const turn = (dir: 1 | -1, coarse: boolean) => { onStep?.(dir, coarse); if (ref.current) ref.current.rotation.y -= dir * 0.3; };
  const height = h ?? r * 1.1;
  return (
    <group position={pos} rotation={[Math.PI / 2, 0, 0]}
      onPointerOver={(e) => { hover.onPointerOver(e); zoom(!!onStep); }}
      onPointerOut={() => { hover.onPointerOut(); zoom(false); }}
      onClick={(e) => { if (busy() || !onStep || e.delta > 6) return; e.stopPropagation(); turn(1, e.shiftKey); }}
      onContextMenu={(e) => { if (busy() || !onStep) return; e.stopPropagation(); e.nativeEvent.preventDefault(); turn(-1, e.shiftKey); }}
      onWheel={(e) => { if (!onStep) return; e.stopPropagation(); turn(e.deltaY < 0 ? 1 : -1, e.shiftKey); }}>
      <group ref={ref}>
        <mesh position={[0, height / 2, 0]} castShadow><cylinderGeometry args={[r * 0.92, r, height, 28]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
        <mesh position={[0, height + 0.05, -r * 0.5]}><boxGeometry args={[r * 0.16, 0.3, r * 0.7]} /><meshBasicMaterial color="#4b4b4b" /></mesh>
      </group>
    </group>
  );
}

/** Push button on a vertical front panel. */
export function PushButton({ pos, size, color = '#bdbab1', name, info, onPress, flat }: {
  pos: [number, number, number]; size: [number, number]; color?: string; name: string; info?: string; onPress?: () => void;
  /** on a horizontal face (a meter lying on the desk) instead of a vertical front panel */
  flat?: boolean;
}) {
  const hover = useHover({ name, info: info ?? (onPress ? undefined : 'Not simulated') });
  const ref = useRef<THREE.Mesh>(null);
  return (
    <mesh ref={ref} position={pos} rotation={[flat ? 0 : Math.PI / 2, 0, 0]} castShadow {...hover}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { if (busy() || !onPress || e.button !== 0) return; e.stopPropagation(); ref.current!.scale.y = 0.45; onPress(); }}
      onPointerUp={() => { if (ref.current) ref.current.scale.y = 1; }}
      onPointerOut={() => { hover.onPointerOut(); if (ref.current) ref.current.scale.y = 1; }}>
      <boxGeometry args={[size[0], 3.4, size[1]]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

// ------------------------------------------------------------ banana-socket kits
const JACK_MAT: Record<string, THREE.Material> = {
  red: new THREE.MeshStandardMaterial({ color: '#d2281e', roughness: 0.4 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#f0cd1c', roughness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.5, roughness: 0.3 }),
  hole: new THREE.MeshBasicMaterial({ color: '#101010' }),
  knob: new THREE.MeshStandardMaterial({ color: '#232427', roughness: 0.35 }),
  mark: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.5 }),
};

/** 4 mm banana socket standing on a panel; pos is its foot. The tooltip lists what is plugged into it. */
export function BananaJack({ id, pos, color, height, name, info }: { id: string; pos: [number, number, number]; color: 'red' | 'yellow' | 'black'; height: number; name: string; info: string }) {
  const hover = useHover({
    name, info,
    live: () => {
      const on = Object.values(usePce.getState().plugs).filter((q) => q.attachedTo === id).map((q) => q.label);
      return on.length ? `in this socket: ${on.join(', ')}` : 'nothing connected';
    },
  });
  return (
    <group position={pos} {...hover}>
      <mesh position={[0, 1.5, 0]} material={JACK_MAT[color]}><cylinderGeometry args={[6.6, 6.6, 3, 6]} /></mesh>
      <mesh position={[0, height / 2, 0]} castShadow material={JACK_MAT[color]}><cylinderGeometry args={[5.3, 5.8, height, 20]} /></mesh>
      <mesh position={[0, height + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={JACK_MAT.metal}><circleGeometry args={[3.2, 16]} /></mesh>
      <mesh position={[0, height + 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={JACK_MAT.hole}><circleGeometry args={[2, 14]} /></mesh>
    </group>
  );
}

/** Panel pot with a black pointer knob: drag sideways or scroll to turn. sweep: half of its travel, radians. */
export function PanelPot({ id, pos, name, info, sweep, r = 9 }: { id: string; pos: [number, number, number]; name: string; info: string; sweep: number; r?: number }) {
  const rotor = useRef<THREE.Group>(null);
  const lock = useOrbitLock(), zoom = useZoomLock();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const hover = useHover({
    name, info: `${info}\nDrag sideways to turn · scroll for fine steps (Shift: coarse). Set the value with the oscilloscope.`,
    live: () => `turned ${Math.round(usePce.getState().knobs[id] * 100)} % of the way`,
  });
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) usePce.getState().setKnob(id, drag.current.v + (e.clientX - drag.current.x) / 320); };
    const up = () => { if (drag.current) { drag.current = null; lock(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  // read in the render loop of the rotor's own mesh, so no React re-render is needed while turning
  const onFrame = () => { if (rotor.current) rotor.current.rotation.y = -(usePce.getState().knobs[id] - 0.5) * 2 * sweep; };
  return (
    <group position={pos}
      onPointerOver={(e) => { hover.onPointerOver(e); zoom(true); }}
      onPointerOut={() => { hover.onPointerOut(); zoom(false); }}
      onPointerDown={(e) => { if (busy() || e.button !== 0) return; e.stopPropagation(); lock(true); drag.current = { x: e.clientX, v: usePce.getState().knobs[id] }; }}
      onWheel={(e) => { e.stopPropagation(); const s = usePce.getState(); s.setKnob(id, s.knobs[id] - Math.sign(e.deltaY) * (e.shiftKey ? 0.02 : 0.002)); }}>
      <group ref={rotor}>
        <mesh position={[0, 9, 0]} castShadow material={JACK_MAT.knob} onBeforeRender={onFrame}><cylinderGeometry args={[r * 0.88, r, 16, 28]} /></mesh>
        <mesh position={[0, 17.1, -r * 0.5]} material={JACK_MAT.mark}><boxGeometry args={[1.1, 0.3, r * 0.75]} /></mesh>
        <mesh position={[0, 10, -r * 0.97]} material={JACK_MAT.mark}><boxGeometry args={[1.1, 9, 0.5]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 10, 0]}><cylinderGeometry args={[r + 2, r + 2, 22, 12]} /></mesh>
    </group>
  );
}
