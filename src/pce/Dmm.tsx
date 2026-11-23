// MECO 801 Auto multimeter on the PCE bench: the same meter as in the EP lab. POWER, the rotary
// function switch and SELECT (AC / DC) work; it reads what its two leads are plugged into on the kit.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CanvasScreen, drawDmm } from '../lab3d/screens.ts';
import { useHover } from '../three/interactive.tsx';
import { dmmAc, dmmVolts, syncKit } from './fm/signals.ts';
import { PushButton, busy } from './parts3d.tsx';
import { DMM_MODES, usePce, type DmmMode } from './store.ts';
import { DMM } from './world.ts';

const DIAL_ANGLE: Record<DmmMode, number> = { V: -2.1, OHM: -1.45, HZ: -0.75, UA: 0, MA: 0.75, A: 1.45, TEMP: 2.1 };
export const DMM_MODE_NAME: Record<DmmMode, string> = { V: 'V', OHM: 'Ω', HZ: 'Hz', UA: 'µA', MA: 'mA', A: 'A', TEMP: 'TEMP' };

/** Latest DC-volts reading, for tooltips and tests (null: not on DC volts, or a lead is not connected). */
export const dmmLive: { volts: number | null; text: string } = { volts: null, text: '' };

function fmtAuto(v: number, unit: 'V' | 'Hz'): [string, string] {
  const a = Math.abs(v);
  if (unit === 'V') return a < 0.4 ? [(v * 1000).toFixed(1), 'mV'] : [v.toFixed(a >= 10 ? 2 : 3), 'V'];
  if (a >= 1e6) return [(v / 1e6).toFixed(3), 'MHz'];
  if (a >= 1e3) return [(v / 1e3).toFixed(a >= 1e5 ? 1 : a >= 1e4 ? 2 : 3), 'kHz'];
  return [v.toFixed(a >= 100 ? 1 : a >= 10 ? 2 : 3), 'Hz'];
}

function faceTexture() {
  const s = 4, c = document.createElement('canvas');
  c.width = 92 * s; c.height = 192 * s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2b52a'; g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'middle';
  const t = (x: number, y: number, text: string, size = 4, color = '#2a2a2a') => { g.fillStyle = color; g.font = `700 ${size * s}px Arial`; g.textAlign = 'center'; g.fillText(text, (x + 46) * s, (y + 96) * s); };
  g.fillStyle = '#e9a51d'; g.fillRect(4 * s, 12 * s, 84 * s, 120 * s);
  t(-28, -18, 'MECO', 5); t(26, -18, '801 AUTO', 4.2);
  g.fillStyle = '#c0392b'; g.fillRect(34 * s, 77 * s, 22 * s, 0.8 * s);
  t(-31, -11, 'POWER', 2.8); t(-11, -11, 'SELECT', 2.8); t(10, -11, 'RANGE', 2.8); t(31, -11, 'REL/▲', 2.8);
  t(-30, 52, 'V≂', 4.5); t(-31, 30, 'Ω/·))', 3.6); t(-16, 13, 'Hz', 4); t(0, 7, 'µA≂', 4); t(17, 13, 'mA≂', 4); t(30, 30, 'A≂', 4.5); t(30, 52, 'TEMP', 4);
  t(-30, 72, '20A', 3); t(-11, 72, 'µA mA', 2.8); t(8, 72, 'COM', 3); t(29, 72, 'VΩHz', 3);
  t(-29, 64, 'CAT II', 3, '#c0392b');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Works the reading out for the present dial position, draws the LCD and keeps dmmLive up to date. */
function refresh(lcd: CanvasScreen) {
  const st = usePce.getState().dmm;
  syncKit();
  let value = '0.000', unit = '', flags = ['AUTO'];
  dmmLive.volts = null;
  if (st.mode === 'V') {
    unit = 'V'; flags = ['AUTO', st.ac ? 'AC' : 'DC'];
    const v = st.ac ? dmmAc().volts : dmmVolts();
    if (v !== null) { [value, unit] = fmtAuto(v, 'V'); if (!st.ac && st.on) dmmLive.volts = v; }
  } else if (st.mode === 'HZ') [value, unit] = fmtAuto(dmmAc().hz, 'Hz');
  else if (st.mode === 'OHM') { value = ' OL'; unit = 'MΩ'; }
  else if (st.mode === 'TEMP') { value = ' OL'; unit = '°C'; }
  else { unit = DMM_MODE_NAME[st.mode]; value = st.mode === 'UA' ? '0.0' : st.mode === 'MA' ? '0.00' : '0.000'; }
  dmmLive.text = st.on ? `${value.trim()} ${unit}${st.mode === 'V' ? (st.ac ? ' AC' : ' DC') : ''}` : 'switched off';
  drawDmm(lcd, st.on, value, unit, flags);
}
const turn = (dir: 1 | -1) => { const s = usePce.getState(), i = DMM_MODES.indexOf(s.dmm.mode); s.setDmm({ mode: DMM_MODES[(i + dir + DMM_MODES.length) % DMM_MODES.length] }); };

export function Dmm() {
  const lcd = useMemo(() => new CanvasScreen(400, 220), []);
  const face = useMemo(() => faceTexture(), []);
  const dial = useRef<THREE.Group>(null);
  const last = useRef(0);
  const hover = useHover({
    name: 'MECO 801 Auto multimeter',
    info: 'Red lead (VΩHz) to the point to measure, black lead (COM) to GND. Dial: click for the next function, right-click for the previous. SELECT switches AC / DC volts.',
    live: () => dmmLive.text,
  });
  const dialHover = useHover({ name: 'Rotary function switch', info: 'Click: next function · Right-click: previous' });
  useFrame(() => {
    const t = performance.now();
    if (dial.current) dial.current.rotation.y = -DIAL_ANGLE[usePce.getState().dmm.mode];
    if (t - last.current < 250) return;
    last.current = t;
    refresh(lcd);
  });
  const set = (p: 'on' | 'ac') => () => { const s = usePce.getState(); s.setDmm({ [p]: !s.dmm[p] }); };
  return (
    <group position={DMM.pos} rotation={[0, DMM.rotY, 0]}>
      <group rotation={[-0.06, 0, 0]}>
        <group {...hover}>
          <mesh position={[0, 10, 0]} castShadow receiveShadow><boxGeometry args={[94, 20, 194]} /><meshStandardMaterial color="#f2b52a" roughness={0.6} /></mesh>
        </group>
        <mesh position={[0, 20.1, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[92, 192]} /><meshStandardMaterial map={face} roughness={0.65} /></mesh>
        <mesh position={[0, 20.3, -55]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[64, 36]} /><meshBasicMaterial map={lcd.texture} toneMapped={false} /></mesh>
        <PushButton flat pos={[-31, 21.5, -26]} size={[11, 6]} color="#d6342a" name="POWER" info="Switches the meter on and off." onPress={set('on')} />
        <PushButton flat pos={[-11, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="SELECT" info="AC / DC on the volts position. A DC voltage reads about 0 on AC." onPress={set('ac')} />
        <PushButton flat pos={[10, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="RANGE" />
        <PushButton flat pos={[31, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="REL/▲" />
        <group position={[0, 21, 34]} {...dialHover}
          onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); turn(1); }}
          onContextMenu={(e) => { if (busy()) return; e.stopPropagation(); e.nativeEvent.preventDefault(); turn(-1); }}>
          <mesh castShadow><cylinderGeometry args={[23, 24, 5, 32]} /><meshStandardMaterial color="#f2b52a" roughness={0.5} /></mesh>
          <group ref={dial}>
            <mesh position={[0, 4, 0]}><boxGeometry args={[9, 5, 40]} /><meshStandardMaterial color="#e4a51e" roughness={0.5} /></mesh>
            <mesh position={[0, 6.6, -17]}><coneGeometry args={[2.5, 1, 3]} /><meshBasicMaterial color="#7a1a1a" /></mesh>
          </group>
        </group>
        {[-30, -11, 8, 29].map((x, i) => (
          <group key={x} position={[x, 20.2, 78]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.2, 5.2, 20]} /><meshBasicMaterial color={i === 2 ? '#1a1a1a' : '#c0392b'} /></mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><circleGeometry args={[3.2, 16]} /><meshBasicMaterial color="#0a0a0a" /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
