// The matched-filter trainer in 3D: Sigma's wooden case with the lid open, the yellow printed panel
// under its acrylic cover, the ICs, transistors and other parts on it, and what comes through the
// cover: terminal pins, 2 mm sockets, the eight data switches, the AMPLITUDE pot and the mains toggle.

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Dip } from '../../three/parts.tsx';
import { useHover } from '../../three/interactive.tsx';
import { StaticBatch } from '../../three/perf.tsx';
import { PanelPot, busy } from '../parts3d.tsx';
import { KitCase, type CaseDims } from '../sigma3d.tsx';
import { kitPowered, usePce } from '../store.ts';
import { KIT_POS } from '../world.ts';
import { ACRYLIC, AMP_KNOB, BLOCK_NAME, BOX, CHIPS, CORD_ENTRY, LEDS, LEVEL, NEON, PANEL, PARTS, POWER_SW, SCREWS, SWITCHES, TERMS, TRANSISTORS, type BlockId, type PartDef, type TermDef } from './layout.ts';
import { mfPanelTexture } from './panelTexture.ts';
import { NOISE } from './signals.ts';

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const M = {
  acrylic: std('#e6f4ff', { transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.1, depthWrite: false }),
  steel: std('#c5c9ce', { metalness: 0.6, roughness: 0.32 }),
  brass: std('#c9a64e', { metalness: 0.7, roughness: 0.3 }),
  hole: new THREE.MeshBasicMaterial({ color: '#2a2b2e' }),
  black: std('#161719', { roughness: 0.45 }),
  white: std('#ecebe6'),
  orange: std('#e4792b'),
  alu: std('#e7e8e6', { metalness: 0.4, roughness: 0.35 }),
  blue: std('#3f78d6', { roughness: 0.4 }),
  beige: std('#cdb58a', { roughness: 0.6 }),
  green: std('#3d7f5a', { roughness: 0.5 }),
  brown: std('#b9653a', { roughness: 0.5 }),
  grey: std('#9a9c9e', { roughness: 0.6 }),
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
      const [r, h] = p.k === 'elcoL' ? [5.4, 9] : [3, 7];
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
    case 'film': return <mesh position={[pos[0], pos[1] + 2.5, pos[2]]} castShadow material={M.grey}><boxGeometry args={[6.4, 5, 3.4]} /></mesh>;
    case 'box': return <mesh position={[pos[0], pos[1] + 4, pos[2]]} castShadow material={M.blue}><boxGeometry args={[5.6, 8, 7.4]} /></mesh>;
  }
}

/** TO-92 transistor: a black half-round body standing on three legs. */
function Transistor({ x, y }: { x: number; y: number }) {
  const pos = at(x, y);
  return (
    <group position={pos}>
      <mesh position={[0, 4.4, 0]} castShadow material={M.black}><cylinderGeometry args={[2.3, 2.3, 4.6, 16, 1, false, 0, Math.PI]} /></mesh>
      <mesh position={[0, 4.4, 0]} rotation={[0, Math.PI / 2, 0]} material={M.black}><planeGeometry args={[4.6, 4.6]} /></mesh>
      {[-1.27, 0, 1.27].map((dx) => <mesh key={dx} position={[dx, 1.05, 0.2]} material={M.steel}><boxGeometry args={[0.4, 2.1, 0.4]} /></mesh>)}
    </group>
  );
}

// ------------------------------------------------------------ data word
function DataSwitch({ s }: { s: (typeof SWITCHES)[number] }) {
  const on = usePce((st) => st.knobs[s.id] > 0.5);
  const hover = useHover({
    name: `Data switch S${s.n}${s.n === 8 ? ' (MSB, sent first)' : s.n === 1 ? ' (LSB)' : ''}`,
    info: `Sets bit D${s.n} of the 8-bit word the generator sends over and over. Lever towards the LED: 1.\nClick to flip.`,
    live: () => `D${s.n} = ${usePce.getState().knobs[s.id] > 0.5 ? 1 : 0}`,
  });
  const [x, , z] = at(s.x, s.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover} onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); usePce.getState().setKnob(s.id, on ? 0 : 1); }}>
      <mesh position={[0, 1.6, 0]} material={M.steel}><cylinderGeometry args={[3.9, 3.9, 3.2, 6]} /></mesh>
      <group position={[0, 3.2, 0]} rotation={[on ? -0.38 : 0.38, 0, 0]}>
        <mesh position={[0, 4.6, 0]} castShadow material={M.steel}><cylinderGeometry args={[1, 1.5, 9.2, 12]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 6, 0]}><cylinderGeometry args={[5.6, 5.6, 14, 8]} /></mesh>
    </group>
  );
}

function BitLed({ l }: { l: (typeof LEDS)[number] }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8f1d16', emissive: '#ff2314', emissiveIntensity: 0, roughness: 0.3 }), []);
  const lit = () => { const s = usePce.getState(); return kitPowered(s) && s.knobs[`s${l.n}`] > 0.5; };
  const hover = useHover({ name: `LED D${l.n}`, info: 'Shows the bit its switch sets: lit for a 1. Dark while the kit has no power.', live: () => (lit() ? 'lit: 1' : kitPowered() ? 'dark: 0' : 'kit off') });
  useFrame(() => { const on = lit(); mat.emissiveIntensity = on ? 2.6 : 0; mat.color.set(on ? '#ff5142' : '#8f1d16'); });
  return (
    <group position={at(l.x, l.y)} {...hover}>
      <mesh position={[0, 3, 0]} material={mat}><cylinderGeometry args={[2.4, 2.5, 6, 16]} /></mesh>
      <mesh position={[0, 6, 0]} material={mat}><sphereGeometry args={[2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ power
function PowerSwitch() {
  const on = usePce((s) => s.powerSw);
  const hover = useHover({ name: 'MAINS ON toggle switch', info: 'Switches the kit on. The neon lamp beside it lights when the kit has power: mains plug in the wall socket and this switch ON.\nClick to toggle.' });
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

function Neon() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a1a14', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.3 }), []);
  const hover = useHover({ name: 'Neon lamp', info: 'Lights when the kit has mains power.', live: () => (kitPowered() ? 'ON' : 'off') });
  useFrame(() => { const on = kitPowered(); mat.emissiveIntensity = on ? 2.4 : 0; mat.color.set(on ? '#ff5a48' : '#7a1a14'); });
  const [x, , z] = at(NEON.x, NEON.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover}>
      <mesh position={[0, 1, 0]} material={M.steel}><cylinderGeometry args={[5, 5, 2, 24]} /></mesh>
      <mesh position={[0, 2.6, 0]} material={mat}><sphereGeometry args={[3.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ terminals
function Terminal({ t }: { t: TermDef }) {
  const color = useMemo(() => (t.color ? std(t.color, { roughness: 0.4, metalness: t.color === '#b8923a' ? 0.7 : 0 }) : M.steel), [t.color]);
  const what = t.kind === 'pin' ? 'Hollow pin: a probe tip or a patch cord goes on it.' : '2 mm socket: a probe tip or a patch cord goes in; a crocodile clip cannot hold on it.';
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
const BLOCKS: [BlockId, number, number, number, number, string][] = [
  ['gen', 5, 14.5, 119, 102, 'Clock oscillator, counters and a shift register: sends the eight switch bits one after the other, D8 first, and gives the clocks CK and BK.'],
  ['gn', 119, 14.5, 216, 115, 'Transistor noise source and amplifier: broadband Gaussian noise, its level set by the AMPLITUDE pot.'],
  ['add', 216, 14.5, 265, 115, 'Summing amplifier (356): adds the noise to the data. It is an inverting summer, so its output is the negative of the sum.'],
  ['mf', 119, 115, 197, 193, 'Matched filter for rectangular bits: an integrator (351) that adds up the input over each bit, dumped (reset) by an analogue switch (4052) at the start of every bit. The dump pulse comes from the 4528 one-shot, fired by the bit clock at its BK input.'],
  ['cmp', 197, 115, 265, 193, 'Decision device: a comparator (311) that turns the raw data back into clean 0 V / 5 V data.'],
  ['ps', 5, 102, 119, 193, 'Two transformers, bridge rectifiers and regulators: +12 V / -12 V and +5 V / -5 V for the whole kit.'],
];
function BlockArea({ b }: { b: (typeof BLOCKS)[number] }) {
  const [id, x0, y0, x1, y1, info] = b;
  const hover = useHover({ name: `${BLOCK_NAME[id]} block`, info });
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
  ['MATCHED FILTER', 'TRAINER', 'MODEL - COM120L'].forEach((t, i) => g.fillText(t, 256, 118 + i * 38));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function MfKit() {
  const panel = useMemo(() => mfPanelTexture(), []);
  const sticker = useMemo(() => stickerTexture(), []);
  useEffect(() => () => { panel.dispose(); sticker.dispose(); }, [panel, sticker]);
  const { w, d, h } = BOX;
  return (
    <group position={KIT_POS}>
      <StaticBatch>
        <KitCase dims={CASE} tone="#f6dc8c" base="#e8c56a" inside="#f0c58a" name="Matched-filter trainer (Sigma COM120L)" info="Wooden box with the lid open behind it. The panel is a circuit diagram with the parts mounted on it, under an acrylic cover: only the pins, sockets, switches and the AMPLITUDE pot come through." />
        <group position={[0, h, -d / 2]} rotation={[-CASE.lid.open, 0, 0]}>
          <mesh position={[0, CASE.lid.h - 6.6, d / 2 - 14]} rotation={[Math.PI / 2, 0, 0]} material={M.paper}><planeGeometry args={[120, 88]} /></mesh>
        </group>
        {CHIPS.map((c, i) => <group key={i} position={at(c.x, c.y)}><Dip pins={c.pins} /></group>)}
        {TRANSISTORS.map((t, i) => <Transistor key={i} x={t.x} y={t.y} />)}
        {PARTS.map((p, i) => <Part key={i} p={p} />)}
        {SCREWS.map(([x, y], i) => <mesh key={i} position={at(x, y, 0.7)} material={M.steel}><cylinderGeometry args={[2.2, 2.2, 1.4, 12]} /></mesh>)}
        <mesh position={at(CORD_ENTRY.x, CORD_ENTRY.y, COVER + 2)} material={M.black}><cylinderGeometry args={[4.4, 5, 4, 14]} /></mesh>
        {/* the AMPLITUDE pot's bush and nut on the cover */}
        <mesh position={at(AMP_KNOB.x, AMP_KNOB.y, COVER + 0.8)} material={M.black}><cylinderGeometry args={[10.4, 10.4, 1.6, 28]} /></mesh>
      </StaticBatch>
      <mesh position={[0, LEVEL.panel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[PANEL.w, PANEL.h]} /><meshStandardMaterial map={panel} roughness={0.8} /></mesh>
      <mesh position={[w * 0.2, 36, d / 2 + 0.4]}><planeGeometry args={[92, 43]} /><meshStandardMaterial map={sticker} roughness={0.7} /></mesh>
      <mesh position={[0, LEVEL.acrylic - ACRYLIC.t / 2, 0]} material={M.acrylic} renderOrder={2}><boxGeometry args={[ACRYLIC.w, ACRYLIC.t, ACRYLIC.d]} /></mesh>
      {BLOCKS.map((b) => <BlockArea key={b[0]} b={b} />)}
      {TERMS.map((t) => <Terminal key={t.id} t={t} />)}
      {SWITCHES.map((s) => <DataSwitch key={s.id} s={s} />)}
      {LEDS.map((l) => <BitLed key={l.n} l={l} />)}
      <PanelPot id={AMP_KNOB.id} pos={at(AMP_KNOB.x, AMP_KNOB.y, COVER + 1.6)} r={9} sweep={2.4} name="AMPLITUDE pot (noise level)"
        info={`Sets the level of the Gaussian noise (10 kΩ pot at the noise amplifier's output). Fully anticlockwise there is almost no noise; fully clockwise it fills the ±${NOISE.clip} V swing of the amplifier.`} />
      <PowerSwitch />
      <Neon />
    </group>
  );
}
