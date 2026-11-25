// Film mode (development only), for capturing the promotional video: open any experiment with
// ?film before the hash (/?film#/pce/exp/am, /?film#/ep/exp/exp4) and the bench is shown on a black
// stage, with shadows and anti-aliasing forced on and the interface hidden. Press ` (backquote) to
// show or hide the interface without reloading: set the bench up with it, hide it, then shoot. The
// stage, the camera and the bench stay as they are. Students never see any of this.

import { useEffect, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DESK_Y } from '../lab3d/world.ts';

export const FILM = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('film');

let shown = false;
const subs = new Set<() => void>();
const typing = (el: Element | null) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
if (FILM && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
    e.preventDefault();
    shown = !shown;
    subs.forEach((f) => f());
  });
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** True while film mode hides the interface (toggled with the backquote key). */
export function useFilmBare(): boolean {
  return useSyncExternalStore(subscribe, () => FILM && !shown, () => false);
}

/**
 * The black stage: a dark floor with a faint sheen at desk height instead of the room, a rim light from
 * behind and a soft studio reflection for the metal parts. backdrop: z of a black wall behind the bench,
 * for a lab that has something mounted on its wall.
 */
export function FilmStage({ backdrop }: { backdrop?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl), env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return (
    <>
      <mesh position={[0, DESK_Y - 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9000, 9000]} />
        <meshStandardMaterial color="#0a0a0b" roughness={0.72} metalness={0} />
      </mesh>
      {backdrop !== undefined && (
        <mesh position={[0, 1500, backdrop]}>
          <planeGeometry args={[9000, 3200]} />
          <meshStandardMaterial color="#050506" roughness={0.95} metalness={0} />
        </mesh>
      )}
      <directionalLight position={[-200, 500, -1400]} intensity={1.6} color="#dfe8ff" />
    </>
  );
}
