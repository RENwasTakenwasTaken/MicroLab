// The PCM trainer in 3D: Sigma's wooden case with the lid open, the yellow printed panel under its
// acrylic cover, the ICs and parts on it, and what comes through the cover: terminal pins, sockets,
// the AMPLITUDE and FREQUENCY knobs, the DC source pot, the FREQ and GAIN presets, the BIT SELECT and
// SLOW / FAST toggles, the word LEDs D1 to D4, the mains toggle and its green pilot lamp.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Dip } from '../../three/parts.tsx';
import { useHover } from '../../three/interactive.tsx';
import { StaticBatch } from '../../three/perf.tsx';
import { PanelPot, busy, useOrbitLock, useZoomLock } from '../parts3d.tsx';
import { KitCase, type CaseDims } from '../sigma3d.tsx';
import { kitPowered, usePce } from '../store.ts';
import { KIT_POS } from '../world.ts';
import { ACRYLIC, BLOCKS, BLOCK_NAME, BOX, CHIPS, CORD_ENTRY, KNOBS, LEDS, LEVEL, NEON, PANEL, PARTS, POWER_SW, Q1, SCREWS, TERMS, TOGGLES, type BlockId, type KnobDef, type PartDef, type TermDef } from './layout.ts';
import { pcmPanelTexture } from './panelTexture.ts';
import { kitValues, ledLevels } from './signals.ts';

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const M = {
  acrylic: std('#e6f4ff', { transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.1, depthWrite: false }),
  steel: std('#c5c9ce', { metalness: 0.6, roughness: 0.32 }),
  brass: std('#c9a64e', { metalness: 0.7, roughness: 0.3 }),
  hole: new THREE.MeshBasicMaterial({ color: '#2a2b2e' }),
  black: std('#161719', { roughness: 0.45 }),
  white: std('#ecebe6'),
  orange: std('#d98a3a'),
  alu: std('#e7e8e6', { metalness: 0.4, roughness: 0.35 }),
  blue: std('#3f78d6', { roughness: 0.4 }),
  sky: std('#4b9fe0', { roughness: 0.35 }),
  beige: std('#9cc6c4', { roughness: 0.6 }),
  brown: std('#b9653a', { roughness: 0.5 }),
  red: std('#c8462a', { roughness: 0.45 }),
  green: std('#2f8a52', { roughness: 0.45 }),
  paper: std('#f1efe8', { roughness: 0.9 }),
};
const CASE: CaseDims = { box: BOX, panel: LEVEL.panel, acrylic: ACRYLIC, lid: { h: 44, open: (102 * Math.PI) / 180 } };
const COVER = LEVEL.acrylic - LEVEL.panel;

/** Panel mm -> the kit's own frame (origin: centre of the box on the desk). */
const at = (x: number, y: number, h = 0): [number, number, number] => [x - PANEL.w / 2, LEVEL.panel + h, y - PANEL.h / 2];

/** One fixed component as a simple solid. */
function Part({ p }: { p: PartDef }) {
  const rot = ((p.r ?? 0) * Math.PI) / 180, pos = at(p.x, p.y);
  switch (p.k) {
    case 'elcoL': case 'elcoS': {
      const [r, h] = p.k === 'elcoL' ? [5.4, 10] : [3, 7];
      return (
        <group position={pos}>
          <mesh position={[0, h / 2, 0]} castShadow material={M.orange}><cylinderGeometry args={[r, r, h, 24]} /></mesh>
          <mesh position={[0, h + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.alu}><circleGeometry args={[r * 0.78, 24]} /></mesh>
        </group>
      );
    }
    case 'preset':
      return (
        <group position={pos}>
          <mesh position={[0, 2.4, 0]} castShadow material={M.blue}><cylinderGeometry args={[3.4, 3.6, 4.8, 20]} /></mesh>
          <mesh position={[0, 4.9, 0]} material={M.white}><boxGeometry args={[4.4, 0.14, 0.8]} /></mesh>
        </group>
      );
    case 'res': return <mesh position={[pos[0], pos[1] + 1.6, pos[2]]} rotation={[Math.PI / 2, 0, Math.PI / 2 - rot]} castShadow material={M.beige}><capsuleGeometry args={[1.15, 4.2, 4, 10]} /></mesh>;
    case 'cap': return <mesh position={[pos[0], pos[1] + 2.6, pos[2]]} rotation={[0, rot, 0]} scale={[1, 1, 0.45]} castShadow material={M.brown}><sphereGeometry args={[2.2, 14, 10]} /></mesh>;
    case 'filmRed': return <mesh position={[pos[0], pos[1] + 2.6, pos[2]]} castShadow material={M.red}><boxGeometry args={[7.5, 5.2, 3.6]} /></mesh>;
    case 'filmGreen': return <mesh position={[pos[0], pos[1] + 2.6, pos[2]]} castShadow material={M.green}><boxGeometry args={[7, 5.2, 4]} /></mesh>;
    case 'blueCap': return <mesh position={[pos[0], pos[1] + 3, pos[2]]} rotation={[Math.PI / 2, 0, 0]} castShadow material={M.sky}><capsuleGeometry args={[3, 9, 4, 14]} /></mesh>;
    case 'film': return null;
    case 'diode': return <mesh position={[pos[0], pos[1] + 1.4, pos[2]]} rotation={[0, -rot, Math.PI / 2]} castShadow material={M.black}><capsuleGeometry args={[1.2, 4, 4, 10]} /></mesh>;
  }
}

/** Q1, a 2N2907 in a TO-18 metal can. */
function MetalCan() {
  return (
    <group position={at(Q1.x, Q1.y)}>
      <mesh position={[0, 0.4, 0]} material={M.steel}><cylinderGeometry args={[3, 3, 0.8, 20]} /></mesh>
      <mesh position={[0, 3, 0]} castShadow material={M.steel}><cylinderGeometry args={[2.4, 2.6, 4.6, 20]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ toggles, LEDs, power
function Toggle({ id }: { id: 'bit3' | 'slow' }) {
  const up = usePce((s) => (s.knobs[id] ?? 0) > 0.5);
  const hover = useHover(id === 'bit3'
    ? { name: 'BIT SELECT switch (S4)', info: 'Lever up: 3 BIT (8 levels). Lever down: 4 BIT (16 levels). It sets both the modulator and the demodulator.\nClick to flip.', live: () => `${kitValues(usePce.getState().knobs).bits} bit PCM` }
    : { name: 'SLOW / FAST switch', info: 'Timing capacitor of the sampling pulse generator. FAST: the 10 pF capacitor, about 1.3 MHz (20 kHz sampling). SLOW: the blue film capacitor, a few hundred hertz, so the word LEDs can be watched changing.\nClick to flip.', live: () => (usePce.getState().knobs.slow > 0.5 ? 'SLOW' : 'FAST') });
  const p = TOGGLES[id], [x, , z] = at(p.x, p.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover} onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); usePce.getState().setKnob(id, up ? 0 : 1); }}>
      <mesh position={[0, 1.6, 0]} material={M.steel}><cylinderGeometry args={[3.9, 3.9, 3.2, 6]} /></mesh>
      <group position={[0, 3.2, 0]} rotation={[up ? -0.38 : 0.38, 0, 0]}>
        <mesh position={[0, 4.6, 0]} castShadow material={M.steel}><cylinderGeometry args={[1, 1.5, 9.2, 12]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 6, 0]}><cylinderGeometry args={[5.6, 5.6, 14, 8]} /></mesh>
    </group>
  );
}

function WordLed({ n, x, y }: { n: number; x: number; y: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8f1d16', emissive: '#ff2314', emissiveIntensity: 0, roughness: 0.3 }), []);
  const level = useRef(0);
  const hover = useHover({
    name: `LED D${n}${n === 1 ? ' (MSB)' : ''}`,
    info: 'Shows one bit of the word the modulator has just converted: lit for a 1. D1 is the most significant bit; in 3 bit PCM D4 stays dark. With a changing message on FAST the LEDs flicker too fast to follow: switch to SLOW, or use the DC source.',
    live: () => (kitPowered() ? `lit ${Math.round(level.current * 100)} % of the time` : 'kit off'),
  });
  useFrame(() => {
    const v = ledLevels()[n - 1];
    level.current = v;
    mat.emissiveIntensity = 2.6 * v; mat.color.set(v > 0.05 ? '#ff5142' : '#8f1d16');
  });
  return (
    <group position={at(x, y)} {...hover}>
      <mesh position={[0, 3, 0]} material={mat}><cylinderGeometry args={[2.4, 2.5, 6, 16]} /></mesh>
      <mesh position={[0, 6, 0]} material={mat}><sphereGeometry args={[2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

function PowerSwitch() {
  const on = usePce((s) => s.powerSw);
  const hover = useHover({ name: 'Mains ON toggle switch', info: 'Switches the kit on. The green pilot lamp beside it lights when the kit has power: mains plug in the wall socket and this switch ON.\nClick to toggle.' });
  const [x, , z] = at(POWER_SW.x, POWER_SW.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover} onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); usePce.getState().setPowerSw(!on); }}>
      <mesh position={[0, 2, 0]} material={M.steel}><cylinderGeometry args={[4.6, 4.6, 4, 6]} /></mesh>
      <group position={[0, 4, 0]} rotation={[on ? 0.36 : -0.36, 0, 0]}>
        <mesh position={[0, 5.5, 0]} castShadow material={M.steel}><cylinderGeometry args={[1.2, 1.7, 11, 12]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 7, 0]}><cylinderGeometry args={[7, 7, 16, 8]} /></mesh>
    </group>
  );
}

function PilotLamp() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1d5a2c', emissive: '#2bff62', emissiveIntensity: 0, roughness: 0.3 }), []);
  const hover = useHover({ name: 'Pilot lamp', info: 'Lights green when the kit has mains power.', live: () => (kitPowered() ? 'ON' : 'off') });
  useFrame(() => { const on = kitPowered(); mat.emissiveIntensity = on ? 1.8 : 0; mat.color.set(on ? '#5cf08a' : '#1d5a2c'); });
  const [x, , z] = at(NEON.x, NEON.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover}>
      <mesh position={[0, 1, 0]} material={M.steel}><cylinderGeometry args={[6, 6, 2, 24]} /></mesh>
      <mesh position={[0, 2.6, 0]} material={mat}><sphereGeometry args={[5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ presets the student trims
/** A blue trimmer on the panel, reached through a hole in the cover: drag sideways or scroll to turn. */
function Trimmer({ k }: { k: KnobDef }) {
  const rotor = useRef<THREE.Group>(null);
  const lock = useOrbitLock(), zoom = useZoomLock();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const hover = useHover({ name: k.name, info: `${k.info}\nDrag sideways to turn · scroll for fine steps (Shift: coarse).`, live: () => `turned ${Math.round(usePce.getState().knobs[k.id] * 100)} % of the way` });
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) usePce.getState().setKnob(k.id, drag.current.v + (e.clientX - drag.current.x) / 320); };
    const up = () => { if (drag.current) { drag.current = null; lock(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  const onFrame = () => { if (rotor.current) rotor.current.rotation.y = -(usePce.getState().knobs[k.id] - 0.5) * 4.4; };
  return (
    <group position={at(k.x, k.y, COVER - 3)}
      onPointerOver={(e) => { hover.onPointerOver(e); zoom(true); }}
      onPointerOut={() => { hover.onPointerOut(); zoom(false); }}
      onPointerDown={(e) => { if (busy() || e.button !== 0) return; e.stopPropagation(); lock(true); drag.current = { x: e.clientX, v: usePce.getState().knobs[k.id] }; }}
      onWheel={(e) => { e.stopPropagation(); const s = usePce.getState(); s.setKnob(k.id, s.knobs[k.id] - Math.sign(e.deltaY) * (e.shiftKey ? 0.03 : 0.005)); }}>
      <mesh position={[0, 3, 0]} castShadow material={M.blue}><cylinderGeometry args={[4, 4.2, 6, 20]} /></mesh>
      <group ref={rotor} position={[0, 6.1, 0]}>
        <mesh material={M.white} onBeforeRender={onFrame}><cylinderGeometry args={[2.6, 2.6, 0.3, 16]} /></mesh>
        <mesh position={[0, 0.2, 0]} material={M.black}><boxGeometry args={[4.4, 0.2, 0.7]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 6, 0]}><cylinderGeometry args={[6.5, 6.5, 14, 10]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ terminals
function Terminal({ t }: { t: TermDef }) {
  const color = useMemo(() => (t.color ? std(t.color, { roughness: 0.4 }) : M.steel), [t.color]);
  const what = t.kind === 'pin' ? 'Hollow pin: a probe tip or a patch cord goes on it.' : 'Socket: a probe tip or a patch cord goes in; a crocodile clip cannot hold on it.';
  const hover = useHover({
    name: `${t.label} · ${BLOCK_NAME[t.block]}`, info: `${t.info}\n${what}`,
    live: () => {
      const on = Object.values(usePce.getState().plugs).filter((q) => q.attachedTo === t.id).map((q) => q.label);
      return on.length ? `on it: ${on.join(', ')}` : 'nothing connected';
    },
  });
  const top = (t.kind === 'pin' ? LEVEL.pin : LEVEL.sock) - LEVEL.panel, r = t.kind === 'pin' ? 1 : 3;
  return (
    <group position={at(t.x, t.y)}>
      {t.kind === 'pin'
        ? <mesh position={[0, top / 2, 0]} castShadow material={M.brass}><cylinderGeometry args={[r, r, top, 12]} /></mesh>
        : <mesh position={[0, (COVER + top) / 2, 0]} castShadow material={color}><cylinderGeometry args={[r, r + 0.4, top - COVER, 20]} /></mesh>}
      <mesh position={[0, top + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.hole}><circleGeometry args={[t.kind === 'pin' ? 0.62 : 1.1, 12]} /></mesh>
      <mesh position={[0, top - 5, 0]} visible={false} {...hover}><cylinderGeometry args={[r + 2.2, r + 2.2, 13, 8]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ blocks (tooltips over the panel)
const BLOCK_INFO: Record<BlockId, string> = {
  ag: 'XR2206 function generator with an output amplifier: the message, a sine of 300 Hz to 3.4 kHz and 0 to 5 V peak-to-peak.',
  mod: 'Sample-and-hold (4066, 741 buffer), staircase ramp (4040 counter and resistor ladder), comparator (527), word latch (4042) on the LEDs D1 to D4, and a shift register (4021) that sends each word in a frame: sync, start, data, stop.',
  dem: 'Sync detector (2N2907, 560 pF, 3140), shift register (4015), counter (4040) and word latch (4042), then a resistor ladder: the raw data staircase.',
  flt: 'A 741 buffer, two RC low-pass stages (6K8 with 1n5, about 15.6 kHz; 6K8 with 10n, about 2.3 kHz) and a gain stage set by GAIN: the message back again.',
  ps: 'Mains transformer (15-0-15 V), bridge rectifier (1N4002 x 4) and regulators 7812, 7912, 7805, 7905: ±12 V and ±5 V.',
  samp: 'A 4011 gate oscillator: the clock of the whole PCM system. FREQ trims it; SLOW / FAST changes its timing capacitor.',
  dc: 'A 100K pot between two 100K presets across ±12 V: a variable DC to code in place of the message.',
};
function BlockArea({ b }: { b: (typeof BLOCKS)[number] }) {
  const [id, x0, y0, x1, y1] = b;
  const hover = useHover({ name: `${BLOCK_NAME[id]} block`, info: BLOCK_INFO[id] });
  return <mesh position={at((x0 + x1) / 2, (y0 + y1) / 2, COVER + 0.2)} rotation={[-Math.PI / 2, 0, 0]} visible={false} {...hover}><planeGeometry args={[x1 - x0, y1 - y0]} /></mesh>;
}

/** The maker's sticker on the front of the box. */
function stickerTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 240;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2d21c'; g.fillRect(0, 0, 512, 240);
  g.strokeStyle = g.fillStyle = '#1d1a10'; g.lineWidth = 5; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.beginPath(); g.ellipse(256, 52, 76, 26, 0, 0, 7); g.stroke();
  g.font = '800 30px Arial, sans-serif'; g.fillText('SIGMA', 256, 54);
  g.font = '700 25px Georgia, serif';
  ['PULSE CODE MODULATION', 'DEMODULATION TRAINER', 'MODEL - COM110M'].forEach((t, i) => g.fillText(t, 256, 118 + i * 38));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function PcmKit() {
  const panel = useMemo(() => pcmPanelTexture(), []);
  const sticker = useMemo(() => stickerTexture(), []);
  useEffect(() => () => { panel.dispose(); sticker.dispose(); }, [panel, sticker]);
  const { w, d, h } = BOX;
  const { agAmp, agFreq, dc } = KNOBS;
  return (
    <group position={KIT_POS}>
      <StaticBatch>
        <KitCase dims={CASE} tone="#f6dc8c" base="#e8c56a" inside="#f0c58a" name="PCM trainer (Sigma COM110M)" info="Wooden box with the lid open behind it. The panel is a circuit diagram with the parts mounted on it, under an acrylic cover: only the pins, sockets, knobs, presets and switches come through." />
        <group position={[0, h, -d / 2]} rotation={[-CASE.lid.open, 0, 0]}>
          <mesh position={[0, CASE.lid.h - 6.6, d / 2 - 14]} rotation={[Math.PI / 2, 0, 0]} material={M.paper}><planeGeometry args={[120, 88]} /></mesh>
        </group>
        {CHIPS.map((c, i) => <group key={i} position={at(c.x, c.y)}><Dip pins={c.pins} /></group>)}
        <MetalCan />
        {PARTS.map((p, i) => <Part key={i} p={p} />)}
        {SCREWS.map(([x, y], i) => <mesh key={i} position={at(x, y, 0.7)} material={M.steel}><cylinderGeometry args={[2.2, 2.2, 1.4, 12]} /></mesh>)}
        <mesh position={at(CORD_ENTRY.x, CORD_ENTRY.y, COVER + 2)} material={M.black}><cylinderGeometry args={[4.4, 5, 4, 14]} /></mesh>
        {/* bushes and nuts of the three pots on the cover */}
        {[agAmp, agFreq, dc].map((k) => <mesh key={k.id} position={at(k.x, k.y, COVER + 0.8)} material={M.steel}><cylinderGeometry args={[k.id === 'dc' ? 6.5 : 7.5, k.id === 'dc' ? 6.5 : 7.5, 1.6, 6]} /></mesh>)}
      </StaticBatch>
      <mesh position={[0, LEVEL.panel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[PANEL.w, PANEL.h]} /><meshStandardMaterial map={panel} roughness={0.8} /></mesh>
      <mesh position={[w * 0.2, 36, d / 2 + 0.4]}><planeGeometry args={[92, 43]} /><meshStandardMaterial map={sticker} roughness={0.7} /></mesh>
      <mesh position={[0, LEVEL.acrylic - ACRYLIC.t / 2, 0]} material={M.acrylic} renderOrder={2}><boxGeometry args={[ACRYLIC.w, ACRYLIC.t, ACRYLIC.d]} /></mesh>
      {BLOCKS.map((b) => <BlockArea key={b[0]} b={b} />)}
      {TERMS.map((t) => <Terminal key={t.id} t={t} />)}
      <PanelPot id="agAmp" pos={at(agAmp.x, agAmp.y, COVER + 1.6)} r={8} sweep={2.36} name={agAmp.name} info={agAmp.info} />
      <PanelPot id="agFreq" pos={at(agFreq.x, agFreq.y, COVER + 1.6)} r={8} sweep={2.36} name={agFreq.name} info={agFreq.info} />
      <PanelPot id="dc" pos={at(dc.x, dc.y, COVER + 1.6)} r={5.6} sweep={2.4} name={dc.name} info={dc.info} />
      <Trimmer k={KNOBS.sampF} />
      <Trimmer k={KNOBS.gain} />
      <Toggle id="bit3" />
      <Toggle id="slow" />
      {LEDS.map((l) => <WordLed key={l.n} n={l.n} x={l.x} y={l.y} />)}
      <PowerSwitch />
      <PilotLamp />
    </group>
  );
}
