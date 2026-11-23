// The Analog Sampling and Reconstruction Board in 3D: the printed panel in its open wooden box,
// red / yellow / black 4 mm sockets, four pots, and the DC adapter that powers it.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useHover } from '../../three/interactive.tsx';
import { StaticBatch } from '../../three/perf.tsx';
import { BananaJack, PanelPot } from '../parts3d.tsx';
import { kitPowered } from '../store.ts';
import { KIT_POS } from '../world.ts';
import { ADAPTER } from './bench.ts';
import { BOX, JACKS, KNOBS, LEVEL, SHEET, SWEEP, mm } from './layout.ts';
import { pamPanelTexture } from './panelTexture.ts';

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#c9924f', roughness: 0.75 }),
  dark: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6 }),
};
/** Photo pixels -> the kit's own frame (origin: centre of the box on the desk). */
const at = (px: number, py: number, h = 0): [number, number, number] => { const [x, y] = mm(px, py); return [x - SHEET.w / 2, LEVEL.panel + h, y - SHEET.h / 2]; };

/** DC adapter on the desk, its cord going into the left side of the box. */
function Adapter() {
  const hover = useHover({ name: 'DC adapter of the board', info: 'The board has no power switch: it is on while this adapter is plugged into the wall socket.', live: () => (kitPowered() ? 'plugged in: board powered' : 'not plugged in') });
  const cord = useMemo(() => {
    const a = new THREE.Vector3(ADAPTER[0] - KIT_POS[0], 14, ADAPTER[2] - KIT_POS[2] + 42), b = new THREE.Vector3(-BOX.w / 2, 40, 10);
    const mid = a.clone().add(b).multiplyScalar(0.5).setY(4);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(0, 0, 20)), mid, b.clone().add(new THREE.Vector3(-18, 0, 0)), b], false, 'centripetal'), 40, 1.6, 7, false);
  }, []);
  return (
    <>
      <group position={[ADAPTER[0] - KIT_POS[0], 0, ADAPTER[2] - KIT_POS[2]]} {...hover}>
        <mesh position={[0, 15, 0]} castShadow receiveShadow material={M.dark}><boxGeometry args={[50, 30, 84]} /></mesh>
      </group>
      <mesh geometry={cord} material={M.dark} castShadow />
    </>
  );
}

export function PamKit() {
  const panel = useMemo(() => pamPanelTexture(), []);
  useEffect(() => () => panel.dispose(), [panel]);
  const { w, d, h, wall } = BOX, rim = h - LEVEL.panel;
  const body = useHover({ name: 'Analog Sampling and Reconstruction Board', info: 'Audio generator (message), gating pulse generator (sampling signal), modulator with natural, sample-and-hold and flat-top outputs, and a demodulator (low-pass filter). Powered by its DC adapter.' });
  return (
    <group position={KIT_POS}>
      <StaticBatch>
        <group {...body}>
          <mesh position={[0, (LEVEL.panel - 2) / 2, 0]} castShadow receiveShadow material={M.wood}><boxGeometry args={[w, LEVEL.panel - 2, d]} /></mesh>
          <mesh position={[0, LEVEL.panel + rim / 2, -(d - wall) / 2]} castShadow material={M.wood}><boxGeometry args={[w, rim, wall]} /></mesh>
          <mesh position={[0, LEVEL.panel + rim / 2, (d - wall) / 2]} castShadow material={M.wood}><boxGeometry args={[w, rim, wall]} /></mesh>
          <mesh position={[-(w - wall) / 2, LEVEL.panel + rim / 2, 0]} castShadow material={M.wood}><boxGeometry args={[wall, rim, d - 2 * wall]} /></mesh>
          <mesh position={[(w - wall) / 2, LEVEL.panel + rim / 2, 0]} castShadow material={M.wood}><boxGeometry args={[wall, rim, d - 2 * wall]} /></mesh>
          <mesh position={[0, LEVEL.panel - 1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.dark}><planeGeometry args={[w - 4, d - 4]} /></mesh>
        </group>
        <Adapter />
      </StaticBatch>
      <mesh position={[0, LEVEL.panel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[SHEET.w, SHEET.h]} /><meshStandardMaterial map={panel} roughness={0.6} /></mesh>
      {JACKS.map((j) => <BananaJack key={j.id} id={j.id} pos={at(j.x, j.y)} color={j.color} height={LEVEL.jack - LEVEL.panel} name={j.label} info={j.info} />)}
      {KNOBS.map((k) => <PanelPot key={k.id} id={k.id} pos={at(k.x, k.y)} name={k.name} info={k.info} sweep={SWEEP} r={9.5} />)}
    </group>
  );
}
