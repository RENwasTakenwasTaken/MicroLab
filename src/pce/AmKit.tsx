// The AM trainer in 3D: wooden box with its lid open, the printed panel (the lab's own photograph,
// flattened), the acrylic cover, terminal pins, the four panel pots, mains toggle and pilot lamp.
// Fixed components are simple solids standing on their images in the photograph.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Dip } from '../three/parts.tsx';
import { useHover } from '../three/interactive.tsx';
import { StaticBatch } from '../three/perf.tsx';
import panelUrl from './am/panel.jpg';
import { BLOCK_NAME, BOX, CORD_ENTRY, KIT_POS, KNOBS, LEVEL, NEON, PANEL, PARTS, PINS, PIN, POWER_SW, SCREWS, SWEEP, type BlockId, type KnobDef, type PartDef } from './am/layout.ts';
import { busy, useOrbitLock, useZoomLock } from './parts3d.tsx';
import { kitPowered, usePce } from './store.ts';

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#d2ac74', roughness: 0.7 }),
  woodIn: new THREE.MeshStandardMaterial({ color: '#c9a36b', roughness: 0.8 }),
  frame: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: '#0f1011', roughness: 0.9 }),
  acrylic: new THREE.MeshStandardMaterial({ color: '#e6f4ff', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.1, depthWrite: false }),
  steel: new THREE.MeshStandardMaterial({ color: '#c5c9ce', metalness: 0.6, roughness: 0.32 }),
  pinTop: new THREE.MeshBasicMaterial({ color: '#2a2b2e' }),
  black: new THREE.MeshStandardMaterial({ color: '#161719', roughness: 0.45 }),
  blackGloss: new THREE.MeshStandardMaterial({ color: '#101113', roughness: 0.25 }),
  white: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.5 }),
  silver: new THREE.MeshStandardMaterial({ color: '#d7dade', metalness: 0.55, roughness: 0.25 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2f6fd0', roughness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ color: '#e4792b', roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: '#d2362b', roughness: 0.45 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#e0a41f', roughness: 0.5 }),
  alu: new THREE.MeshStandardMaterial({ color: '#e7e8e6', metalness: 0.4, roughness: 0.35 }),
  preset: new THREE.MeshStandardMaterial({ color: '#b3ad9c', metalness: 0.3, roughness: 0.45 }),
};

/** Panel mm -> the kit's own frame (origin: centre of the box on the desk). */
const at = (x: number, y: number, h = 0): [number, number, number] => [x - PANEL.w / 2, LEVEL.panel + h, y - PANEL.h / 2];

/** Light wood with a darker grain, for the box and lid. */
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6b27c'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 128;
    g.strokeStyle = `rgba(120, 82, 40, ${0.05 + Math.random() * 0.14})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 2.5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** One fixed component as a simple solid. */
function Part({ p }: { p: PartDef }) {
  const rot = ((p.r ?? 0) * Math.PI) / 180;
  const pos = at(p.x, p.y);
  switch (p.k) {
    case 'dip14': case 'dip8':
      return <group position={pos} rotation={[0, rot, 0]}><Dip pins={p.k === 'dip14' ? 14 : 8} /></group>;
    case 'elcoL': case 'elcoS': case 'elcoM': {
      const [r, h] = p.k === 'elcoL' ? [6.5, 9.5] : p.k === 'elcoM' ? [5, 9.5] : [2.7, 7];
      return (
        <group position={pos}>
          <mesh position={[0, h / 2, 0]} castShadow material={M.orange}><cylinderGeometry args={[r, r, h, 24]} /></mesh>
          <mesh position={[0, h + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.alu}><circleGeometry args={[r * 0.78, 24]} /></mesh>
        </group>
      );
    }
    case 'film': case 'filmRed': {
      const l = p.l ?? 14;
      return <mesh position={[pos[0], pos[1] + 3.2, pos[2]]} rotation={[Math.PI / 2, 0, rot]} scale={[1, 1, 0.7]} castShadow material={p.k === 'film' ? M.orange : M.red}><capsuleGeometry args={[2.9, l - 5.8, 4, 12]} /></mesh>;
    }
    case 'boxcap': return <mesh position={[pos[0], pos[1] + 3.5, pos[2]]} castShadow material={M.yellow}><boxGeometry args={[7.5, 7, 7.5]} /></mesh>;
    case 'preset':
      return (
        <group position={pos}>
          <mesh position={[0, 2.2, 0]} castShadow material={M.preset}><cylinderGeometry args={[3.5, 3.7, 4.4, 20]} /></mesh>
          <mesh position={[0, 4.45, 0]} material={M.dark}><boxGeometry args={[4.6, 0.12, 0.8]} /></mesh>
        </group>
      );
    case 'to92':
      return <mesh position={[pos[0], pos[1] + 3.6, pos[2]]} castShadow material={M.black}><cylinderGeometry args={[2.3, 2.3, 4.6, 14, 1, false, 0, Math.PI * 1.25]} /></mesh>;
    case 'toggle':
      return (
        <group position={[pos[0], LEVEL.acrylic, pos[2]]}>
          <mesh position={[0, 2, 0]} material={M.steel}><cylinderGeometry args={[4.4, 4.4, 4, 6]} /></mesh>
          <mesh position={[0, 8, 1.6]} rotation={[0.32, 0, 0]} castShadow material={M.steel}><cylinderGeometry args={[1.1, 1.6, 10, 10]} /></mesh>
        </group>
      );
    case 'ddpot':
      return (
        <group position={[pos[0], LEVEL.acrylic, pos[2]]}>
          <mesh position={[0, 1.5, 0]} material={M.steel}><cylinderGeometry args={[5, 5, 3, 6]} /></mesh>
          <mesh position={[0, 10, 0]} castShadow material={M.black}><cylinderGeometry args={[6, 7.5, 14, 24]} /></mesh>
          <mesh position={[0, 19, 0]} castShadow material={M.orange}><cylinderGeometry args={[4.4, 4.6, 5, 20]} /></mesh>
        </group>
      );
  }
}

// ------------------------------------------------------------ panel pots
/** What the pointer shows on the printed scale, rounded as one would read it off the dial. */
function dialText(k: KnobDef, v: number): string {
  const x = k.lo + (k.hi - k.lo) * v;
  if (k.unit === 'Hz') return x >= 1000 ? `${(x / 1000).toFixed(1)} kHz` : `${Math.round(x / 50) * 50} Hz`;
  if (k.unit === 'kHz') return `${Math.round(x / 10) * 10} kHz`;
  return `${x.toFixed(1)} V`;
}

function PanelKnob({ k }: { k: KnobDef }) {
  const rotor = useRef<THREE.Group>(null);
  const lock = useOrbitLock(), zoom = useZoomLock();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const hover = useHover({
    name: k.name,
    info: `${k.info}\nDrag sideways to turn · scroll for fine steps (Shift: coarse). The printed scale is only approximate: set the value with the oscilloscope.`,
    live: () => `pointer at about ${dialText(k, usePce.getState().knobs[k.id])}`,
  });
  useFrame(() => { if (rotor.current) rotor.current.rotation.y = -(usePce.getState().knobs[k.id] - 0.5) * 2 * SWEEP; });
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) usePce.getState().setKnob(k.id, drag.current.v + (e.clientX - drag.current.x) / 320); };
    const up = () => { if (drag.current) { drag.current = null; lock(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  const [x, , z] = at(k.x, k.y);
  const big = k.style === 'big';
  // pointer line on top of the knob, towards the back of the panel at mid travel
  const line = (y: number, len: number, mat: THREE.Material) => <mesh position={[0, y, -len / 2 - 0.8]} material={mat}><boxGeometry args={[1, 0.3, len]} /></mesh>;
  return (
    <group position={[x, LEVEL.acrylic, z]}
      onPointerOver={(e) => { hover.onPointerOver(e); zoom(true); }}
      onPointerOut={() => { hover.onPointerOut(); zoom(false); }}
      onPointerDown={(e) => { if (busy() || e.button !== 0) return; e.stopPropagation(); lock(true); drag.current = { x: e.clientX, v: usePce.getState().knobs[k.id] }; }}
      onWheel={(e) => { e.stopPropagation(); const s = usePce.getState(); s.setKnob(k.id, s.knobs[k.id] - Math.sign(e.deltaY) * (e.shiftKey ? 0.02 : 0.002)); }}>
      <mesh position={[0, 1.2, 0]} material={M.steel}><cylinderGeometry args={[big ? 6 : 5.2, big ? 6 : 5.2, 2.4, 6]} /></mesh>
      <group ref={rotor}>
        {k.style === 'big' && <>
          <mesh position={[0, 4, 0]} castShadow material={M.black}><cylinderGeometry args={[11.6, 11.6, 3, 40]} /></mesh>
          <mesh position={[0, 12, 0]} castShadow material={M.blackGloss}><cylinderGeometry args={[9.4, 10.4, 13, 40]} /></mesh>
          {line(18.6, 8, M.white)}
          <mesh position={[0, 4.2, -10.9]} material={M.white}><boxGeometry args={[1, 3.2, 1.6]} /></mesh>
        </>}
        {k.style === 'silver' && <>
          <mesh position={[0, 8, 0]} castShadow material={M.black}><cylinderGeometry args={[5.4, 5.8, 11, 28]} /></mesh>
          <mesh position={[0, 13.7, 0]} material={M.silver}><cylinderGeometry args={[4.2, 4.2, 0.6, 28]} /></mesh>
          {line(14.1, 3.6, M.dark)}
        </>}
        {k.style === 'blue' && <>
          <mesh position={[0, 4, 0]} material={M.black}><cylinderGeometry args={[4.6, 5, 3.4, 20]} /></mesh>
          <mesh position={[0, 9.5, 0]} castShadow material={M.blue}><cylinderGeometry args={[3.2, 3.2, 14, 20]} /></mesh>
          {line(16.6, 2.2, M.white)}
        </>}
        {k.style === 'black' && <>
          <mesh position={[0, 8.5, 0]} castShadow material={M.black}><cylinderGeometry args={[4.2, 4.8, 12, 24]} /></mesh>
          {line(14.6, 3, M.white)}
        </>}
      </group>
      <mesh visible={false} position={[0, 10, 0]}><cylinderGeometry args={[big ? 13 : 8, big ? 13 : 8, 22, 12]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ power
function PowerSwitch() {
  const on = usePce((s) => s.powerSw);
  const hover = useHover({ name: 'Mains toggle switch', info: 'Switches the kit on. The pilot lamp beside it lights when the kit has power: mains plug in the wall socket and this switch ON.\nClick to toggle.' });
  const [x, , z] = at(POWER_SW.x, POWER_SW.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover} onClick={(e) => { if (busy() || e.delta > 6) return; e.stopPropagation(); usePce.getState().setPowerSw(!on); }}>
      <mesh position={[0, 2, 0]} material={M.steel}><cylinderGeometry args={[4.6, 4.6, 4, 6]} /></mesh>
      <group position={[0, 4, 0]} rotation={[on ? 0.36 : -0.36, 0, 0]}>
        <mesh position={[0, 5.5, 0]} castShadow material={M.silver}><cylinderGeometry args={[1.2, 1.7, 11, 12]} /></mesh>
      </group>
      <mesh visible={false} position={[0, 7, 0]}><cylinderGeometry args={[7, 7, 16, 8]} /></mesh>
    </group>
  );
}

function PilotLamp() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a1a14', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.3 }), []);
  const hover = useHover({ name: 'Pilot lamp', info: 'Lights when the kit has mains power.', live: () => (kitPowered() ? 'ON' : 'off') });
  useFrame(() => { const on = kitPowered(); mat.emissiveIntensity = on ? 2.4 : 0; mat.color.set(on ? '#ff5a48' : '#7a1a14'); });
  const [x, , z] = at(NEON.x, NEON.y);
  return (
    <group position={[x, LEVEL.acrylic, z]} {...hover}>
      <mesh position={[0, 1, 0]} material={M.steel}><cylinderGeometry args={[5, 5, 2, 24]} /></mesh>
      <mesh position={[0, 2.6, 0]} material={mat}><sphereGeometry args={[3.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------ terminal pins
const PIN_H = LEVEL.pin - LEVEL.panel;

function PinHover({ id }: { id: string }) {
  const p = PIN[id];
  const hover = useHover({
    name: `${p.label} · ${BLOCK_NAME[p.block]}`, info: p.info,
    live: () => {
      const on = Object.values(usePce.getState().plugs).filter((q) => q.attachedTo === id).map((q) => q.label);
      return on.length ? `on this pin: ${on.join(', ')}` : 'nothing connected';
    },
  });
  return <mesh position={at(p.x, p.y, PIN_H - 6)} visible={false} {...hover}><cylinderGeometry args={[3.2, 3.2, 14, 8]} /></mesh>;
}

/** Hollow 2 mm rods standing through the acrylic: probe tips go into them, patch-cord sleeves over them. */
function Pins() {
  const [rods, tops] = useMemo(() => {
    const rod = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, PIN_H, 12), M.steel, PINS.length);
    const top = new THREE.InstancedMesh(new THREE.CircleGeometry(0.62, 10), M.pinTop, PINS.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    PINS.forEach((p, i) => {
      rod.setMatrixAt(i, m.makeTranslation(...at(p.x, p.y, PIN_H / 2)));
      top.setMatrixAt(i, m.compose(new THREE.Vector3(...at(p.x, p.y, PIN_H + 0.05)), q, new THREE.Vector3(1, 1, 1)));
    });
    rod.castShadow = true;
    return [rod, top];
  }, []);
  return (
    <>
      <primitive object={rods} />
      <primitive object={tops} />
      {PINS.map((p) => <PinHover key={p.id} id={p.id} />)}
    </>
  );
}

// ------------------------------------------------------------ blocks (tooltips over the panel)
const BLOCKS: [BlockId | 'title', number, number, number, number, string][] = [
  ['bm', 0, 0, 127.6, 93.5, 'MC1496 balanced modulator. MOD I/P takes the modulating signal; the carrier comes from the RF oscillator inside the kit. With RF LINK joined to the -1 V pin the output is AM with full carrier.'],
  ['pd', 127.6, 0, 231, 92, 'Product (synchronous) detector. Receiver side: not used in this experiment.'],
  ['bp', 231, 0, 258, 93, '455 kHz band-pass filter, for SSB. Not used in this experiment.'],
  ['lp', 258, 0, 297, 93, 'Low-pass filter after the detectors. Not used in this experiment.'],
  ['ag', 0, 93.5, 127.6, 173.8, 'ICL8038 sine generator with an LF356 output stage: the modulating signal, 300 Hz to 3.4 kHz, 0 to 5 V.'],
  ['ps', 0, 173.8, 127.6, 232.3, 'Mains transformer, bridge rectifier and 7815 / 7915 regulators: +15 V and -15 V for the whole kit.'],
  ['rf', 127.6, 92, 228.6, 232.3, 'Carrier oscillator, 400 kHz to 1000 kHz, 0 to 10 V pp. Set 455 kHz, 2 V pp for this experiment.'],
  ['dd', 228.6, 93, 297, 172.5, 'Diode (envelope) detector. Receiver side: not used in this experiment.'],
  ['title', 228.6, 172.5, 297, 232.3, 'Sigma AM/DSB/SSB Modulation & Demodulation System Trainer, model COM101.'],
];

function BlockArea({ b }: { b: (typeof BLOCKS)[number] }) {
  const [id, x0, y0, x1, y1, info] = b;
  const hover = useHover({ name: id === 'title' ? 'AM trainer kit' : `${BLOCK_NAME[id]} block`, info });
  return (
    <mesh position={at((x0 + x1) / 2, (y0 + y1) / 2, LEVEL.acrylic - LEVEL.panel + 0.2)} rotation={[-Math.PI / 2, 0, 0]} visible={false} {...hover}>
      <planeGeometry args={[x1 - x0, y1 - y0]} />
    </mesh>
  );
}

// ------------------------------------------------------------ the kit
const ACRYLIC = { w: 313, d: 249, t: 3 };
const LID = { h: 44, open: (102 * Math.PI) / 180 };

export function AmKit() {
  const panel = useLoader(THREE.TextureLoader, panelUrl);
  useMemo(() => { panel.colorSpace = THREE.SRGBColorSpace; panel.anisotropy = 8; }, [panel]);
  const wood = useMemo(() => { const t = woodTexture(); M.wood.map = t; M.woodIn.map = t; M.wood.needsUpdate = M.woodIn.needsUpdate = true; return t; }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  const { w, d, h } = BOX;
  const fw = (w - ACRYLIC.w) / 2, fd = (d - ACRYLIC.d) / 2, fh = h - LEVEL.panel;
  const body = useHover({ name: 'AM trainer kit (Sigma COM101)', info: 'Wooden box with the lid open behind it. The panel is a circuit diagram with the parts mounted on it, under an acrylic cover: only the pins, pots and the mains toggle come through.' });
  return (
    <group position={KIT_POS}>
      <StaticBatch>
        <group {...body}>
          <mesh position={[0, (LEVEL.panel - 2) / 2, 0]} castShadow receiveShadow material={M.wood}><boxGeometry args={[w, LEVEL.panel - 2, d]} /></mesh>
          {/* black top frame around the cover */}
          <mesh position={[0, LEVEL.panel + fh / 2, -(d - fd) / 2]} castShadow material={M.frame}><boxGeometry args={[w, fh, fd]} /></mesh>
          <mesh position={[0, LEVEL.panel + fh / 2, (d - fd) / 2]} castShadow material={M.frame}><boxGeometry args={[w, fh, fd]} /></mesh>
          <mesh position={[-(w - fw) / 2, LEVEL.panel + fh / 2, 0]} castShadow material={M.frame}><boxGeometry args={[fw, fh, ACRYLIC.d]} /></mesh>
          <mesh position={[(w - fw) / 2, LEVEL.panel + fh / 2, 0]} castShadow material={M.frame}><boxGeometry args={[fw, fh, ACRYLIC.d]} /></mesh>
          <mesh position={[0, LEVEL.panel - 1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.dark}><planeGeometry args={[w - 2, d - 2]} /></mesh>
          {/* lid, hinged along the back edge and leaning back */}
          <group position={[0, h, -d / 2]} rotation={[-LID.open, 0, 0]}>
            <mesh position={[0, LID.h - 3, d / 2]} castShadow material={M.wood}><boxGeometry args={[w, 6, d]} /></mesh>
            <mesh position={[0, LID.h / 2, 3]} castShadow material={M.wood}><boxGeometry args={[w, LID.h, 6]} /></mesh>
            <mesh position={[0, LID.h / 2, d - 3]} castShadow material={M.wood}><boxGeometry args={[w, LID.h, 6]} /></mesh>
            <mesh position={[-w / 2 + 3, LID.h / 2, d / 2]} castShadow material={M.wood}><boxGeometry args={[6, LID.h, d - 12]} /></mesh>
            <mesh position={[w / 2 - 3, LID.h / 2, d / 2]} castShadow material={M.wood}><boxGeometry args={[6, LID.h, d - 12]} /></mesh>
            <mesh position={[0, LID.h - 6.2, d / 2]} rotation={[Math.PI / 2, 0, 0]} material={M.woodIn}><planeGeometry args={[w - 12, d - 12]} /></mesh>
          </group>
        </group>
        {PARTS.map((p, i) => <Part key={i} p={p} />)}
        {SCREWS.map(([x, y], i) => <mesh key={i} position={at(x, y, LEVEL.acrylic - LEVEL.panel + 0.7)} material={M.steel}><cylinderGeometry args={[2.6, 2.6, 1.4, 14]} /></mesh>)}
        {/* mains cord: out through the cover near the front-left corner and over the frame */}
        <mesh position={at(CORD_ENTRY.x, CORD_ENTRY.y, LEVEL.acrylic - LEVEL.panel + 2)} material={M.black}><cylinderGeometry args={[4.4, 5, 4, 14]} /></mesh>
      </StaticBatch>
      <mesh position={[0, LEVEL.panel, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[PANEL.w, PANEL.h]} /><meshStandardMaterial map={panel} color="#d9d9d9" roughness={0.85} /></mesh>
      <mesh position={[0, LEVEL.acrylic - ACRYLIC.t / 2, 0]} material={M.acrylic} renderOrder={2}><boxGeometry args={[ACRYLIC.w, ACRYLIC.t, ACRYLIC.d]} /></mesh>
      {BLOCKS.map((b) => <BlockArea key={b[0]} b={b} />)}
      <Pins />
      {KNOBS.map((k) => <PanelKnob key={k.id} k={k} />)}
      <PowerSwitch />
      <PilotLamp />
    </group>
  );
}
