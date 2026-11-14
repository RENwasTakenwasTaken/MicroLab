// Bench instruments modelled on the lab photographs: Tektronix TDS1002
// oscilloscope, MECO 801 Auto multimeter and Aplab MSG1M signal generator.
// Readings come from the simulation (frames + pin transition log) only.

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { analyzer } from '../app/analyzer.ts';
import { DMM_MODES, SDIV_STEPS, VDIV_STEPS, useBench, type ScopeCoupling } from '../app/bench.ts';
import { sim } from '../app/sim.ts';
import { useHover } from '../three/interactive.tsx';
import { CanvasScreen, drawDmm, drawGen, drawScope, type ScopeView } from './screens.ts';
import { coupledTrace, genValue, nodeDc, nodeFreq, plugNode, traceStats, triggerTime } from './signals.ts';
import { DMM, SCOPE, SIGGEN, SOCKET } from './world.ts';

const carrying = () => !!useBench.getState().carrying;

// ------------------------------------------------------------ controls
function Knob({ pos, r = 9, color = '#efede6', name, info, onStep, rotX = Math.PI / 2 }: {
  pos: [number, number, number]; r?: number; color?: string; name: string; info?: string; onStep?: (dir: 1 | -1) => void; rotX?: number;
}) {
  const hover = useHover({ name, info: info ?? (onStep ? 'Click: + · Right-click: − · Scroll to turn' : undefined) });
  const ref = useRef<THREE.Group>(null);
  const turn = (dir: 1 | -1) => { onStep?.(dir); if (ref.current) ref.current.rotation.y += dir * 0.35; };
  return (
    <group position={pos} rotation={[rotX, 0, 0]} {...hover}
      onClick={(e) => { if (carrying() || !onStep) return; e.stopPropagation(); turn(1); }}
      onContextMenu={(e) => { if (carrying() || !onStep) return; e.stopPropagation(); e.nativeEvent.preventDefault(); turn(-1); }}
      onWheel={(e) => { if (!onStep) return; e.stopPropagation(); turn(e.deltaY < 0 ? 1 : -1); }}>
      <group ref={ref}>
        <mesh position={[0, r * 0.45, 0]} castShadow><cylinderGeometry args={[r, r * 1.05, r * 0.9, 24]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
        <mesh position={[0, r * 0.92, -r * 0.55]}><boxGeometry args={[r * 0.18, 0.4, r * 0.7]} /><meshBasicMaterial color="#555" /></mesh>
      </group>
    </group>
  );
}

function Button({ pos, size, color = '#dcdad2', name, info, onPress, rotX = Math.PI / 2 }: {
  pos: [number, number, number]; size: [number, number]; color?: string; name: string; info?: string; onPress?: () => void; rotX?: number;
}) {
  const hover = useHover({ name, info });
  const ref = useRef<THREE.Mesh>(null);
  return (
    <mesh ref={ref} position={pos} rotation={[rotX, 0, 0]} castShadow {...hover}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { if (carrying() || !onPress || e.button !== 0) return; e.stopPropagation(); ref.current!.scale.y = 0.4; onPress(); }}
      onPointerUp={() => { if (ref.current) ref.current.scale.y = 1; }}
      onPointerOut={() => { hover.onPointerOut(); if (ref.current) ref.current.scale.y = 1; }}>
      <boxGeometry args={[size[0], 4, size[1]]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

function panelTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, s: number) => void, bg: string) {
  const s = 4;
  const c = document.createElement('canvas');
  c.width = w * s; c.height = h * s;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'middle';
  draw(g, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Face({ w, h, tex, z, y = 0 }: { w: number; h: number; tex: THREE.Texture; z: number; y?: number }) {
  return <mesh position={[0, y, z]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} roughness={0.7} /></mesh>;
}

// ------------------------------------------------------------ oscilloscope
const nearest = (arr: number[], v: number) => arr.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a));

export function Oscilloscope() {
  const screen = useMemo(() => new CanvasScreen(640, 480), []);
  const last = useRef(0);
  const frozen = useRef<ScopeView | null>(null);
  const { w, h, d } = SCOPE;
  const face = useMemo(() => panelTexture(w, h, (g, s) => {
    const t = (x: number, y: number, text: string, size = 3, bold = false, color = '#2c2c2c') => {
      g.fillStyle = color; g.font = `${bold ? 700 : 500} ${size * s}px Arial`; g.textAlign = 'center'; g.fillText(text, (x + w / 2) * s, (h / 2 - y) * s);
    };
    g.fillStyle = '#d9d7cf'; g.fillRect(0, 0, (w / 2) * s, h * s);
    t(-125, 66, 'Tektronix', 6.5, true, '#1f3d7a');
    t(-60, 66, 'TDS 1002', 6, false, '#555');
    t(-12, 68, 'TWO CHANNEL', 2.2, false, '#555'); t(-12, 64, 'DIGITAL STORAGE OSCILLOSCOPE', 2.2, false, '#555');
    t(26, 66, '60 MHz  1 GS/s', 2.4, false, '#555');
    t(42, 52, 'VERTICAL', 2.6, true); t(120, 52, 'HORIZ', 2.6, true); t(148, 52, 'TRIG', 2.6, true);
    t(25, 33, 'VOLTS/DIV', 2.4, true); t(60, 33, 'VOLTS/DIV', 2.4, true); t(100, 33, 'SEC/DIV', 2.4, true);
    t(25, 12.6, 'CH 1 MENU', 2, true); t(60, 12.6, 'CH 2 MENU', 2, true);
    t(66, 6, 'CH 1', 2.4, true); t(102, 6, 'CH 2', 2.4, true); t(138, 6, 'EXT TRIG', 2.2, true);
    t(118, 64, 'AUTOSET', 2.2, true); t(148, 64, 'RUN/STOP', 2.2, true);
    t(30, 64, 'SAVE/RECALL  MEASURE  ACQUIRE', 2, false);
  }, '#ece9e0'), [w, h]);

  const hover = useHover({
    name: 'Tektronix TDS1002 oscilloscope',
    info: 'Each probe\'s crocodile clip holds a male-to-female jumper: put its female end on a header pin, and the ground jumper on GND (UART header). Knobs: click +, right-click −. AUTOSET fits the CH1 signal. CH 1 / CH 2 MENU, then the top option button: Coupling DC / AC / Ground.',
    live: () => {
      const g = plugNode('scope:gnd')?.kind === 'gnd';
      const sc = useBench.getState().scope;
      const ch = (id: string) => { const s = useBench.getState().plugs[id]?.attachedTo; return s ? SOCKET[s]?.label ?? s : '—'; };
      return `CH1: ${ch('ch1')} (${sc.coupling[0]})  ·  CH2: ${ch('ch2')} (${sc.coupling[1]})\nground: ${g ? 'connected' : 'NOT connected (no trace from the board)'}`;
    },
  });

  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 66) return;
    last.current = now;
    const sc = useBench.getState().scope;
    const gen = useBench.getState().gen;
    const f = sim.latest;
    // board pins only read against the board's ground: the probe ground jumper must sit on a GND pin
    const grounded = plugNode('scope:gnd')?.kind === 'gnd';
    const viaGnd = (n: ReturnType<typeof plugNode>) => (n && (n.kind === 'gen' || grounded) ? n : null);
    const n1 = viaGnd(plugNode('ch1')), n2 = viaGnd(plugNode('ch2'));
    const span = sc.sdiv * 10;
    let view: ScopeView;
    if (!sc.running && frozen.current) view = { ...frozen.current, vdiv: sc.vdiv, running: false };
    else {
      const tNow = analyzer.now;
      let t0 = tNow - span, t1 = tNow, triggered = false, genT0 = t0;
      if (n1?.kind === 'gen') { t0 = -span / 2; t1 = span / 2; genT0 = 0; triggered = true; }
      else {
        const trig = triggerTime(n1, tNow, span);
        if (trig !== null) { t0 = trig - span / 2; t1 = trig + span / 2; triggered = true; }
        genT0 = t0;
      }
      const traces = [n1, n2].map((n, ch) => (n ? coupledTrace(n, f, gen, t0, t1, genT0, sc.coupling[ch]) : null));
      let meas: ScopeView['meas'] = null;
      if (n1 && sc.coupling[0] === 'GND') meas = { pkpk: 0, freq: 0, period: 0, rms: 0 };
      else if (n1) {
        if (n1.kind === 'gen') {
          const a = gen.on ? gen.amp : 0;
          meas = { pkpk: a, freq: gen.on ? gen.freq : 0, period: gen.on ? 1 / gen.freq : 0, rms: gen.wave === 'square' ? a / 2 : gen.wave === 'sine' ? a / 2 / Math.SQRT2 : a / 2 / Math.sqrt(3) };
        } else if (n1.kind === 'pin' && (traces[0]?.kind === 'digital' || sc.coupling[0] === 'AC')) {
          // frequency and period come from the pin's edges whatever the coupling
          const m = analyzer.measure(n1.port, n1.bit, Math.max(span, 0.05));
          meas = m ? { pkpk: 5, freq: m.freq, period: m.period, rms: 5 * Math.sqrt(m.duty) } : { pkpk: 5, freq: 0, period: 0, rms: 0 };
        } else {
          const dc = nodeDc(n1, f, gen) ?? 0;
          meas = { pkpk: 0, freq: 0, period: 0, rms: dc };
        }
        // AC coupling: amplitude and RMS are read off the displayed (capacitor-coupled) trace
        if (meas && sc.coupling[0] === 'AC' && traces[0]) meas = { ...meas, ...traceStats(traces[0].pts) };
      }
      view = { traces, t0, t1, vdiv: sc.vdiv, sdiv: sc.sdiv, running: true, triggered, meas, coupling: sc.coupling, menu: sc.menu };
      frozen.current = view;
    }
    view = { ...view, coupling: sc.coupling, menu: sc.menu };
    if (import.meta.env.DEV) (window as unknown as { __vlabScope: ScopeView }).__vlabScope = view;
    const key = sc.running || !frozen.current ? `${now}` : JSON.stringify([sc.vdiv, sc.sdiv, sc.coupling, sc.menu, 'stop']);
    drawScope(screen, view, key);
  });

  const setScope = (p: Partial<ReturnType<typeof useBench.getState>['scope']>) => useBench.setState({ scope: { ...useBench.getState().scope, ...p } });
  const stepIn = (arr: number[], v: number, dir: 1 | -1) => arr[Math.max(0, Math.min(arr.length - 1, arr.indexOf(nearest(arr, v)) + dir))];
  const autoset = () => {
    const raw = plugNode('ch1');
    const n1 = raw && (raw.kind === 'gen' || plugNode('scope:gnd')?.kind === 'gnd') ? raw : null;
    const fq = nodeFreq(n1, sim.latest, useBench.getState().gen);
    const sc = useBench.getState().scope;
    const sdiv = fq > 0 ? nearest(SDIV_STEPS, 3 / fq / 10) : sc.sdiv;
    const vd = n1?.kind === 'gen' ? nearest(VDIV_STEPS, useBench.getState().gen.amp / 6) : 2;
    setScope({ sdiv, vdiv: [vd, sc.vdiv[1]], running: true });
  };
  const openMenu = (ch: 1 | 2) => setScope({ menu: useBench.getState().scope.menu === ch ? 0 : ch });
  const cycleCoupling = () => {
    const sc = useBench.getState().scope;
    if (sc.menu === 0) return;
    const next: Record<ScopeCoupling, ScopeCoupling> = { DC: 'AC', AC: 'GND', GND: 'DC' };
    const coupling = [...sc.coupling] as [ScopeCoupling, ScopeCoupling];
    coupling[sc.menu - 1] = next[coupling[sc.menu - 1]];
    setScope({ coupling });
  };
  const fz = d / 2 + 0.3;
  return (
    <group position={SCOPE.pos} rotation={[0, SCOPE.rotY, 0]}>
      <group {...hover}>
        <mesh position={[0, h / 2 + 4, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#e3e0d6" roughness={0.6} /></mesh>
        <mesh position={[0, h / 2 + 4, -d / 2 - 30]} castShadow><boxGeometry args={[w * 0.82, h * 0.82, 60]} /><meshStandardMaterial color="#d8d4c9" roughness={0.6} /></mesh>
        {[-1, 1].map((sx) => <mesh key={sx} position={[sx * (w / 2 - 20), 2, d / 2 - 15]}><boxGeometry args={[20, 4, 12]} /><meshStandardMaterial color="#222" /></mesh>)}
      </group>
      <group position={[0, h / 2 + 4, 0]}>
        <Face w={w} h={h} tex={face} z={fz} />
        {/* screen */}
        <mesh position={[-82, 6, fz + 0.4]}><boxGeometry args={[150, 112, 1]} /><meshStandardMaterial color="#c9c6bd" /></mesh>
        <mesh position={[-82, 6, fz + 1.1]}><planeGeometry args={[140, 105]} /><meshBasicMaterial map={screen.texture} toneMapped={false} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <Button key={i} pos={[3, 40 - i * 20, fz + 2]} size={[9, 8]} name="Option button"
            info={i === 0 ? 'With CH 1 / CH 2 MENU open: Coupling DC → AC → Ground' : 'Option button (this setting is not simulated)'}
            onPress={i === 0 ? cycleCoupling : undefined} />
        ))}
        {/* channel menus: the side menu then sets that channel's input coupling */}
        <Button pos={[25, 6, fz + 2]} size={[13, 6]} color="#e8e6dd" name="CH 1 MENU" info="Opens the CH1 menu (press again to close). The top option button then sets Coupling: DC / AC / Ground." onPress={() => openMenu(1)} />
        <Button pos={[60, 6, fz + 2]} size={[13, 6]} color="#e8e6dd" name="CH 2 MENU" info="Opens the CH2 menu (press again to close). The top option button then sets Coupling: DC / AC / Ground." onPress={() => openMenu(2)} />
        <Button pos={[118, 58, fz + 2]} size={[16, 7]} name="AUTOSET" info="Automatically sets SEC/DIV and VOLTS/DIV for CH1" onPress={autoset} />
        <Button pos={[148, 58, fz + 2]} size={[14, 7]} color="#e8e6dd" name="RUN/STOP" info="Freeze / resume acquisition" onPress={() => setScope({ running: !useBench.getState().scope.running })} />
        {[25, 60, 100].map((x) => <Knob key={`p${x}`} pos={[x, 22, fz]} r={6} name="POSITION" />)}
        <Knob pos={[148, 22, fz]} r={6} name="Trigger LEVEL" />
        <Knob pos={[25, -12, fz]} r={9} name="CH1 VOLTS/DIV" onStep={(dir) => { const sc = useBench.getState().scope; setScope({ vdiv: [stepIn(VDIV_STEPS, sc.vdiv[0], -dir as 1 | -1), sc.vdiv[1]] }); }} />
        <Knob pos={[60, -12, fz]} r={9} name="CH2 VOLTS/DIV" onStep={(dir) => { const sc = useBench.getState().scope; setScope({ vdiv: [sc.vdiv[0], stepIn(VDIV_STEPS, sc.vdiv[1], -dir as 1 | -1)] }); }} />
        <Knob pos={[100, -12, fz]} r={10} name="SEC/DIV" onStep={(dir) => { const sc = useBench.getState().scope; setScope({ sdiv: stepIn(SDIV_STEPS, sc.sdiv, -dir as 1 | -1) }); }} />
        {[66, 102, 138].map((x) => (
          <group key={x} position={[x, -h / 2 + 18, fz]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh position={[0, 4, 0]}><cylinderGeometry args={[5.5, 5.5, 8, 18]} /><meshStandardMaterial color="#c9ccd0" metalness={0.8} roughness={0.3} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- DMM
const DIAL_ANGLE: Record<string, number> = { V: -2.1, OHM: -1.45, HZ: -0.75, UA: 0, MA: 0.75, A: 1.45, TEMP: 2.1 };

function fmtAuto(v: number, unitBase: string): [string, string] {
  const a = Math.abs(v);
  if (a < 0.4 && unitBase === 'V') return [(v * 1000).toFixed(1), 'mV'];
  if (unitBase === 'Hz') {
    if (a >= 1e6) return [(v / 1e6).toFixed(3), 'MHz'];
    if (a >= 1e3) return [(v / 1e3).toFixed(a >= 1e5 ? 1 : a >= 1e4 ? 2 : 3), 'kHz'];
    return [v.toFixed(a >= 100 ? 1 : a >= 10 ? 2 : 3), 'Hz'];
  }
  return [v.toFixed(a >= 10 ? 2 : 3), unitBase];
}

export function Multimeter() {
  const lcd = useMemo(() => new CanvasScreen(400, 220), []);
  const dial = useRef<THREE.Group>(null);
  const last = useRef(0);
  const face = useMemo(() => panelTexture(92, 192, (g, s) => {
    const t = (x: number, y: number, text: string, size = 4, bold = true, color = '#2a2a2a') => { g.fillStyle = color; g.font = `${bold ? 700 : 500} ${size * s}px Arial`; g.textAlign = 'center'; g.fillText(text, (x + 46) * s, (y + 96) * s); };
    g.fillStyle = '#e9a51d'; g.fillRect(4 * s, 12 * s, 84 * s, 120 * s);
    t(-28, -18, 'MECO', 5); t(26, -18, '801 AUTO', 4.2);
    g.fillStyle = '#c0392b'; g.fillRect(-12 * s + 46 * s, -19 * s + 96 * s, 22 * s, 0.8 * s);
    t(-31, -11, 'POWER', 2.8); t(-11, -11, 'SELECT', 2.8); t(10, -11, 'RANGE', 2.8); t(31, -11, 'REL/▲', 2.8);
    t(-30, 52, 'V≂', 4.5); t(-31, 30, 'Ω/·))', 3.6); t(-16, 13, 'Hz', 4); t(0, 7, 'µA≂', 4); t(17, 13, 'mA≂', 4); t(30, 30, 'A≂', 4.5); t(30, 52, 'TEMP', 4);
    t(-30, 72, '20A', 3); t(-11, 72, 'µA mA', 2.8); t(8, 72, 'COM', 3); t(29, 72, 'VΩHz', 3);
    t(-29, 64, 'CAT II', 3, true, '#c0392b');
  }, '#f2b52a'), []);
  const hover = useHover({ name: 'MECO 801 Auto multimeter', info: 'Put the red lead on a header pin (black lead on GND). Dial: click / right-click to change function.' });

  useFrame(() => {
    const now = performance.now();
    const st = useBench.getState().dmm;
    if (dial.current) dial.current.rotation.y = -(DIAL_ANGLE[st.mode] ?? 0);
    if (now - last.current < 200) return;
    last.current = now;
    const f = sim.latest, gen = useBench.getState().gen;
    const red = plugNode('dmm:v'), blk = plugNode('dmm:com');
    let value = '0.000', unit = '', flags = ['AUTO'];
    const ac = useBench.getState().dmmAc;
    switch (st.mode) {
      case 'V': {
        unit = 'V'; flags = ['AUTO', ac ? 'AC' : 'DC'];
        if (red && blk) {
          let v: number;
          if (ac) v = red.kind === 'gen' && gen.on ? (gen.wave === 'sine' ? gen.amp / 2 / Math.SQRT2 : gen.wave === 'square' ? gen.amp / 2 : gen.amp / 2 / Math.sqrt(3)) : acOfPin(red, f);
          else v = (nodeDc(red, f, gen) ?? 0) - (nodeDc(blk, f, gen) ?? 0);
          [value, unit] = fmtAuto(v, 'V');
        } else value = '0.000';
        break;
      }
      case 'HZ': { const fq = red ? nodeFreq(red, f, gen) : 0; [value, unit] = fmtAuto(fq, 'Hz'); break; }
      case 'OHM': value = red && blk && red.kind === blk.kind && red.kind !== 'pin' ? '0.000' : ' OL'; unit = red && blk && red.kind === blk.kind && red.kind !== 'pin' ? 'Ω' : 'MΩ'; break;
      case 'UA': unit = 'µA'; value = '0.0'; break;
      case 'MA': unit = 'mA'; value = '0.00'; break;
      case 'A': unit = 'A'; value = '0.000'; break;
      case 'TEMP': unit = '°C'; value = ' OL'; break;
    }
    drawDmm(lcd, st.on, value, unit, flags);
  });

  const setDmm = (p: Partial<ReturnType<typeof useBench.getState>['dmm']>) => useBench.setState({ dmm: { ...useBench.getState().dmm, ...p } });
  const turn = (dir: 1 | -1) => {
    const i = DMM_MODES.indexOf(useBench.getState().dmm.mode);
    setDmm({ mode: DMM_MODES[(i + dir + DMM_MODES.length) % DMM_MODES.length] });
  };
  const dialHover = useHover({ name: 'Rotary function switch', info: 'Click: next function · Right-click: previous' });
  return (
    <group position={DMM.pos} rotation={[0, DMM.rotY, 0]}>
      <group rotation={[-0.06, 0, 0]}>
        <group {...hover}>
          <mesh position={[0, 10, 0]} castShadow receiveShadow><boxGeometry args={[94, 20, 194]} /><meshStandardMaterial color="#f2b52a" roughness={0.6} /></mesh>
        </group>
        <mesh position={[0, 20.1, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[92, 192]} /><meshStandardMaterial map={face} roughness={0.65} /></mesh>
        <mesh position={[0, 20.3, -55]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[64, 36]} /><meshBasicMaterial map={lcd.texture} toneMapped={false} /></mesh>
        <Button pos={[-31, 21.5, -26]} size={[11, 6]} color="#d6342a" name="POWER" rotX={0} onPress={() => setDmm({ on: !useBench.getState().dmm.on })} />
        <Button pos={[-11, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="SELECT" info="AC / DC in volts mode" rotX={0} onPress={() => useBench.setState({ dmmAc: !useBench.getState().dmmAc })} />
        <Button pos={[10, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="RANGE" rotX={0} />
        <Button pos={[31, 21.5, -26]} size={[11, 6]} color="#2a2a2a" name="REL/▲" rotX={0} />
        <group position={[0, 21, 34]} {...dialHover}
          onClick={(e) => { if (carrying()) return; e.stopPropagation(); turn(1); }}
          onContextMenu={(e) => { if (carrying()) return; e.stopPropagation(); e.nativeEvent.preventDefault(); turn(-1); }}>
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

function acOfPin(n: ReturnType<typeof plugNode>, f: typeof sim.latest): number {
  if (!n || n.kind !== 'pin' || !f) return 0;
  const p = f.ports[n.port];
  if (!p || !p.freq[n.bit]) return 0;
  const d = p.duty[n.bit];
  return 5 * Math.sqrt(d * (1 - d)); // AC rms of a 0/5 V square wave
}

// ---------------------------------------------------------- signal gen
const RANGES = [1, 10, 100, 1e3, 1e4, 1e5, 1e6];

export function SignalGenerator() {
  const disp = useMemo(() => new CanvasScreen(300, 112), []);
  const leds = useRef<THREE.MeshBasicMaterial[]>([]);
  const last = useRef(0);
  const { w, h, d } = SIGGEN;
  const face = useMemo(() => panelTexture(w, h, (g, s) => {
    const t = (x: number, y: number, text: string, size = 3, bold = true, color = '#2c2c2c') => { g.fillStyle = color; g.font = `${bold ? 700 : 500} ${size * s}px Arial`; g.textAlign = 'center'; g.fillText(text, (x + w / 2) * s, (h / 2 - y) * s); };
    t(-125, 36, 'Aplab', 5, true, '#2a5aa8');
    t(-38, 36, '1MHz MULTI-WAVEFORM SIGNAL GENERATOR', 3.4);
    t(70, 36, 'Model MSG1M', 3.4);
    t(-38, -40, 'FREQUENCY RANGE (Hz)', 3);
    RANGES.forEach((r, i) => t(-90 + i * 15, -30, r >= 1e6 ? '1M' : r >= 1e3 ? `${r / 1e3}k` : `${r}`, 2.4, false));
    t(80, -40, 'FUNCTION', 3); t(68, -30, '∿', 4, false); t(83, -30, '⋀', 3.5, false); t(98, -30, '⊓', 3.5, false);
    t(-2, 10, 'COARSE', 2.4); t(30, 10, 'FINE', 2.4); t(118, 10, 'LEVEL', 2.4);
    t(128, -12, 'OUTPUT', 2.6);
    t(-58, 22, 'Hz', 2.4, false); t(-58, 16, 'kHz', 2.4, false); t(-58, 10, 'MHz', 2.4, false);
  }, '#ece8df'), [w, h]);
  const hover = useHover({ name: 'Aplab MSG1M signal generator', info: 'Output clip on the desk can be probed by the scope or DMM. Range buttons + COARSE knob set the frequency.' });

  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 120) return;
    last.current = now;
    const g = useBench.getState().gen;
    const unit = drawGen(disp, g.on, g.freq) ?? (g.freq >= 1e6 ? 2 : g.freq >= 1e3 ? 1 : 0);
    leds.current.forEach((m, i) => m && m.color.set(g.on && i === unit ? '#ff3020' : '#3a0d0a'));
  });

  const setGen = (p: Partial<ReturnType<typeof useBench.getState>['gen']>) => useBench.setState({ gen: { ...useBench.getState().gen, ...p } });
  const range = () => { const fq = useBench.getState().gen.freq; return RANGES.find((r) => fq < r * 10) ?? 1e6; };
  const coarse = (dir: 1 | -1, k = 0.05) => {
    const g = useBench.getState().gen, r = range();
    setGen({ freq: Math.min(r * 10, Math.max(r * 0.1, +(g.freq * (1 + dir * k)).toPrecision(4))) });
  };
  const fz = d / 2 + 0.3;
  return (
    <group position={SIGGEN.pos} rotation={[0, SIGGEN.rotY, 0]}>
      <group {...hover}>
        <mesh position={[0, h / 2 + 8, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#e7e3d8" roughness={0.6} /></mesh>
        <mesh position={[0, h + 8.5, -6]} castShadow><boxGeometry args={[w + 2, 2, d - 10]} /><meshStandardMaterial color="#4a6f9e" roughness={0.5} /></mesh>
        {[-1, 1].map((sx) => <mesh key={sx} position={[sx * (w / 2 - 25), 3, d / 2 - 20]}><boxGeometry args={[14, 8, 14]} /><meshStandardMaterial color="#222" /></mesh>)}
      </group>
      <group position={[0, h / 2 + 8, 0]}>
        <Face w={w} h={h} tex={face} z={fz} />
        <mesh position={[-90, 14, fz + 0.4]}><planeGeometry args={[58, 22]} /><meshBasicMaterial map={disp.texture} toneMapped={false} /></mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-53, 22 - i * 6, fz + 0.6]}>
            <circleGeometry args={[1.6, 12]} />
            <meshBasicMaterial ref={(m) => { if (m) leds.current[i] = m; }} color="#3a0d0a" />
          </mesh>
        ))}
        {RANGES.map((r, i) => (
          <Button key={r} pos={[-90 + i * 15, -24, fz + 2]} size={[10, 9]} name={`Range ×${r}`} info="Frequency range"
            onPress={() => { const g = useBench.getState().gen; const m = g.freq / range(); setGen({ freq: +(Math.min(10, Math.max(0.1, m)) * r).toPrecision(4) }); }} />
        ))}
        {(['sine', 'triangle', 'square'] as const).map((wv, i) => (
          <Button key={wv} pos={[68 + i * 15, -24, fz + 2]} size={[10, 9]} name={`Function: ${wv}`} onPress={() => setGen({ wave: wv })} />
        ))}
        <Knob pos={[-2, 22, fz]} r={9} name="FREQUENCY coarse" onStep={(dir) => coarse(dir, 0.08)} />
        <Knob pos={[30, 22, fz]} r={9} name="FREQUENCY fine" onStep={(dir) => coarse(dir, 0.01)} />
        <Knob pos={[62, 22, fz]} r={8} name="SYMMETRY" />
        <Knob pos={[90, 22, fz]} r={8} name="DC OFFSET" />
        <Knob pos={[118, 22, fz]} r={9} name="LEVEL (amplitude)" onStep={(dir) => { const g = useBench.getState().gen; setGen({ amp: Math.min(20, Math.max(0.2, +(g.amp + dir * 0.5).toFixed(1))) }); }} />
        <group position={[128, -h / 2 + 22, fz]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh position={[0, 4, 0]}><cylinderGeometry args={[5.5, 5.5, 8, 18]} /><meshStandardMaterial color="#c9ccd0" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      </group>
    </group>
  );
}

export function Instruments({ children }: { children?: ReactNode }) {
  return (
    <group>
      <Oscilloscope />
      <Multimeter />
      <SignalGenerator />
      {children}
    </group>
  );
}

export { genValue };
