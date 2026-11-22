// The FM MODEM kit in 3D: a wooden box with its lid open, the black printed panel, yellow 4 mm
// sockets, the four pots, the power toggle and its LED.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useHover } from '../../three/interactive.tsx';
import { StaticBatch } from '../../three/perf.tsx';
import { busy, useOrbitLock, useZoomLock } from '../parts3d.tsx';
import { kitPowered, usePce } from '../store.ts';
import { KIT_POS } from '../world.ts';
import { BOX, JACKS, KNOBS, LED, LEVEL, POWER_SW, SHEET, SWEEP, mm, type FmKnob, type JackDef } from './layout.ts';
import { fmPanelTexture } from './panelTexture.ts';

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#d9b77e', roughness: 0.75 }),
  dark: new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.9 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#f0cd1c', roughness: 0.45 }),
  hole: new THREE.MeshBasicMaterial({ color: '#141414' }),
  black: new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.32 }),
  white: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: '#c5c9ce', metalness: 0.5, roughness: 0.32 }),
  paper: new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.9 }),
};
/** Border percentages -> the kit's own frame (origin: centre of the box on the desk). */
const at = (px: number, py: number, h = 0): [number, number, number] => { const [x, y] = mm(px, py); return [x - SHEET.w / 2, LEVEL.panel + h, y - SHEET.h / 2]; };
const JACK_H = LEVEL.jack - LEVEL.panel;

function Jack({ j }: { j: JackDef }) {
  const hover = useHover({
    name: j.label, info: j.info,
    live: () => {
      const on = Object.values(usePce.getState().plugs).filter((q) => q.attachedTo === j.id).map((q) => q.label);
      return on.length ? `in this socket: ${on.join(', ')}` : 'nothing connected';
    },
  });
  return (
    <group position={at(j.x, j.y)} {...hover}>
      <mesh position={[0, 1.5, 0]} material={M.yellow}><cylinderGeometry args={[6.6, 6.6, 3, 6]} /></mesh>
      <mesh position={[0, JACK_H / 2, 0]} castShadow material={M.yellow}><cylinderGeometry args={[5.3, 5.6, JACK_H, 20]} /></mesh>
      <mesh position={[0, JACK_H + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.hole}><circleGeometry args={[2.1, 14]} /></mesh>
    </group>
  );
}

function Pot({ k }: { k: FmKnob }) {
  const rotor = useRef<THREE.Group>(null);
  const lock = useOrbitLock(), zoom = useZoomLock();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const hover = useHover({
    name: k.name,
    info: `${k.info}\nDrag sideways to turn · scroll for fine steps (Shift: coarse). There is no scale: set the value with the oscilloscope or the multimeter.`,
    live: () => `turned ${Math.round(usePce.getState().knobs[k.id] * 100)} % of the way`,
  });
  useFrame(() => { if (rotor.current) rotor.current.rotation.y = -(usePce.getState().knobs[k.id] - 0.5) * 2 * SWEEP; });
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) usePce.getState().setKnob(k.id, drag.current.v + (e.clientX - drag.current.x) / 320); };
    const up = () => { if (drag.current) { drag.current = null; lock(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  const cap = k.style === 'cap';
  return (
    <group position={at(k.x, k.y)}
      onPointerOver={(e) => { hover.onPointerOver(e); zoom(true); }}
      onPointerOut={() => { hover.onPointerOut(); zoom(false); }}
      onPointerDown={(e) => { if (busy() || e.button !== 0) return; e.stopPropagation(); lock(true); drag.current = { x: e.clientX, v: usePce.getState().knobs[k.id] }; }}
      onWheel={(e) => { e.stopPropagation(); const s = usePce.getState(); s.setKnob(k.id, s.knobs[k.id] - Math.sign(e.deltaY) * (e.shiftKey ? 0.02 : 0.002)); }}>
      <mesh position={[0, 1.2, 0]} material={M.steel}><cylinderGeometry args={[5.4, 5.4, 2.4, 6]} /></mesh>
      <group ref={rotor}>
        {cap ? <>
          <mesh position={[0, 10.5, 0]} castShadow material={M.black}><cylinderGeometry args={[8.6, 9.6, 17, 28]} /></mesh>
          <mesh position={[0, 19.1, -5]} material={M.white}><boxGeometry args={[1.1, 0.3, 6.5]} /></mesh>
          <mesh position={[0, 12, -9.3]} material={M.white}><boxGeometry args={[1.1, 9, 0.5]} /></mesh>
        </> : <>
          <mesh position={[0, 9, 0]} castShadow material={M.white}><cylinderGeometry args={[3, 3, 15, 16]} /></mesh>
          <mesh position={[0, 16.6, -1.2]} material={M.dark}><boxGeometry args={[0.9, 0.3, 3.6]} /></mesh>
        </>}
      </group>
      <mesh visible={false} position={[0, 11, 0]}><cylinderGeometry args={[11, 11, 24, 12]} /></mesh>
    </group>
  );
}

function Power() {
  const on = usePce((s) => s.powerSw);
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a1a14', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.3 }), []);
  useFrame(() => { const lit = kitPowered(); led.emissiveIntensity = lit ? 2.6 : 0; led.color.set(lit ? '#ff5a48' : '#7a1a14'); });
  const sw = useHover({ name: 'POWER ON toggle switch', info: 'Switches the kit on; the red LED beside it lights when the kit has power: mains plug in the wall socket and this switch ON.\nClick to toggle.' });
  const lamp = useHover({ name: 'Power LED', info: 'Lights when the kit has mains power.', live: () => (kitPowered() ? 'ON' : 'off') });
  return (
    <>
      <group position={at(POWER_SW.x, POWER_SW.y)} {...sw} onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); usePce.getState().setPowerSw(!on); }}>
        <mesh position={[0, 2, 0]} material={M.steel}><cylinderGeometry args={[4.6, 4.6, 4, 6]} /></mesh>
        <group position={[0, 4, 0]} rotation={[on ? -0.36 : 0.36, 0, 0]}>
          <mesh position={[0, 5.5, 0]} castShadow material={M.steel}><cylinderGeometry args={[1.2, 1.7, 11, 12]} /></mesh>
        </group>
        <mesh visible={false} position={[0, 7, 0]}><cylinderGeometry args={[7, 7, 16, 8]} /></mesh>
      </group>
      <group position={at(LED.x, LED.y)} {...lamp}>
        <mesh position={[0, 1.2, 0]} material={M.black}><cylinderGeometry args={[4.6, 4.6, 2.4, 20]} /></mesh>
        <mesh position={[0, 3, 0]} material={led}><sphereGeometry args={[3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      </group>
    </>
  );
}

const LID = { h: 40, open: (104 * Math.PI) / 180 };

export function FmKit() {
  const panel = useMemo(() => fmPanelTexture(), []);
  useEffect(() => () => panel.dispose(), [panel]);
  const { w, d, h, wall } = BOX;
  const rim = h - LEVEL.panel;
  const body = useHover({ name: 'FM MODEM kit (Kashtronica)', info: 'Frequency modulator (IC 8038) with buffer, a sine signal generator, a PLL 565 demodulator and a low-pass filter. Signals are taken from the yellow 4 mm sockets with banana-plug leads.' });
  const sheet = useHover({ name: 'FM MODEM panel', info: 'Top row: the 8038 modulator and its buffer. Middle right: the signal generator. Bottom: the PLL 565 demodulator and the filter.' });
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
          {/* lid, hinged along the back edge, with the Bessel-function table taped inside */}
          <group position={[0, h, -d / 2]} rotation={[-LID.open, 0, 0]}>
            <mesh position={[0, LID.h - 3, d / 2]} castShadow material={M.wood}><boxGeometry args={[w, 6, d]} /></mesh>
            <mesh position={[0, LID.h / 2, wall / 2]} castShadow material={M.wood}><boxGeometry args={[w, LID.h, wall]} /></mesh>
            <mesh position={[0, LID.h / 2, d - wall / 2]} castShadow material={M.wood}><boxGeometry args={[w, LID.h, wall]} /></mesh>
            <mesh position={[-(w - wall) / 2, LID.h / 2, d / 2]} castShadow material={M.wood}><boxGeometry args={[wall, LID.h, d - 2 * wall]} /></mesh>
            <mesh position={[(w - wall) / 2, LID.h / 2, d / 2]} castShadow material={M.wood}><boxGeometry args={[wall, LID.h, d - 2 * wall]} /></mesh>
            <mesh position={[0, LID.h - 6.3, d / 2]} rotation={[Math.PI / 2, 0, 0]} material={M.paper}><planeGeometry args={[w * 0.6, d * 0.66]} /></mesh>
          </group>
        </group>
      </StaticBatch>
      <mesh position={[0, LEVEL.panel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...sheet}><planeGeometry args={[SHEET.w, SHEET.h]} /><meshStandardMaterial map={panel} roughness={0.35} /></mesh>
      {JACKS.map((j) => <Jack key={j.id} j={j} />)}
      {KNOBS.map((k) => <Pot key={k.id} k={k} />)}
      <Power />
    </group>
  );
}
