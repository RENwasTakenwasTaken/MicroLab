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
export function PushButton({ pos, size, color = '#bdbab1', name, info, onPress }: {
  pos: [number, number, number]; size: [number, number]; color?: string; name: string; info?: string; onPress?: () => void;
}) {
  const hover = useHover({ name, info: info ?? (onPress ? undefined : 'Not simulated') });
  const ref = useRef<THREE.Mesh>(null);
  return (
    <mesh ref={ref} position={pos} rotation={[Math.PI / 2, 0, 0]} castShadow {...hover}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { if (busy() || !onPress || e.button !== 0) return; e.stopPropagation(); ref.current!.scale.y = 0.45; onPress(); }}
      onPointerUp={() => { if (ref.current) ref.current.scale.y = 1; }}
      onPointerOut={() => { hover.onPointerOut(); if (ref.current) ref.current.scale.y = 1; }}>
      <boxGeometry args={[size[0], 3.4, size[1]]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}
