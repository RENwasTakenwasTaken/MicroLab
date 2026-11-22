// Tektronix TDS1002 on the PCE bench: the full front panel (menu buttons, option buttons, POSITION /
// VOLTS/DIV / SEC/DIV / LEVEL knobs) driving the acquisition model, with the screen drawn on a canvas.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CanvasScreen } from '../../lab3d/screens.ts';
import { useHover } from '../../three/interactive.tsx';
import { PushButton, StepKnob } from '../parts3d.tsx';
import { now, scopeInfo, syncKit, tipSource } from '../signals.ts';
import { usePce } from '../store.ts';
import { BNC, SCOPE } from '../world.ts';
import { fmtV } from './format.ts';
import { fftOn, knobsMoveCursors, menuView, scopeLive, scopeNote } from './menus.ts';
import { acquire, autoset, clampFftCentre, halfLevel } from './model.ts';
import { drawScreen } from './screen.ts';
import { SDIV_STEPS, VDIV_STEPS, defaultSetup, type Channel, type Menu, type ScopeState } from './state.ts';

const get = () => usePce.getState().scope;
const set = (p: Partial<ScopeState>) => usePce.getState().setScope(p);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function setChannel(i: 0 | 1, p: Partial<Channel>) {
  const ch = [...get().ch] as [Channel, Channel];
  ch[i] = { ...ch[i], ...p };
  set({ ch });
}

// ------------------------------------------------------------ front-panel actions
/** CH 1 / CH 2 MENU: shows the channel's menu; pressed again, switches the channel's trace off and on. */
function channelButton(i: 0 | 1) {
  const sc = get(), m = (i ? 'ch2' : 'ch1') as Menu;
  if (sc.menu !== m) { set({ menu: m, measEdit: null }); if (!sc.ch[i].on) setChannel(i, { on: true }); }
  else setChannel(i, { on: !sc.ch[i].on });
}
function mathButton() {
  const sc = get();
  if (sc.menu !== 'math') set({ menu: 'math', measEdit: null, math: { ...sc.math, on: true } });
  else set({ math: { ...sc.math, on: !sc.math.on } });
}
const openMenu = (menu: Menu) => set({ menu, measEdit: null });

/** VERTICAL POSITION knobs: the trace, or a cursor while the CURSOR menu is up, or the FFT's 0 dB level. */
function positionKnob(i: 0 | 1, dir: 1 | -1, coarse: boolean) {
  const sc = get();
  if (knobsMoveCursors(sc)) {
    const key = i ? 'b' : 'a', lim = sc.cursor.type === 'v' ? 4 : 5;
    set({ cursor: { ...sc.cursor, [key]: clamp(r2(sc.cursor[key] + dir * (coarse ? 0.2 : 0.04)), -lim, lim) } });
    return;
  }
  if (fftOn(sc)) {
    if (i === 0) { const vpos = clamp(r2(sc.math.vpos + dir * 0.2), -4, 8); set({ math: { ...sc.math, vpos } }); scopeNote(`MATH vertical position ${vpos.toFixed(2)} divs`); }
    return;
  }
  const c = sc.ch[i], pos = clamp(r2(c.pos + dir * (coarse ? 0.5 : 0.1)), -5, 5);
  setChannel(i, { pos });
  scopeNote(`CH${i + 1} vertical position ${pos.toFixed(2)} divs (${fmtV(pos * c.vdiv)})`);
}

function voltsKnob(i: 0 | 1, dir: 1 | -1) {
  const c = get().ch[i];
  const steps = VDIV_STEPS.map((v) => v * c.probe);
  let vdiv: number;
  if (c.fine) vdiv = clamp(c.vdiv * (dir > 0 ? 1 / 1.04 : 1.04), steps[0], steps[steps.length - 1]);
  else {
    // clockwise = more sensitive
    const at = steps.findIndex((v) => v >= c.vdiv * 0.999);
    vdiv = steps[clamp((at < 0 ? steps.length - 1 : at) - dir, 0, steps.length - 1)];
  }
  setChannel(i, { vdiv });
}

function secKnob(dir: 1 | -1) {
  const sc = get();
  const at = SDIV_STEPS.findIndex((v) => v >= sc.sdiv * 0.999);
  const sdiv = SDIV_STEPS[clamp((at < 0 ? SDIV_STEPS.length - 1 : at) - dir, 0, SDIV_STEPS.length - 1)];
  set({ sdiv, hpos: (sc.hpos / sc.sdiv) * sdiv });
}

/** HORIZONTAL POSITION: moves the trigger point across the screen; on the FFT it pans the frequency axis. */
function horizKnob(dir: 1 | -1, coarse: boolean) {
  const sc = get();
  if (fftOn(sc)) { set({ math: { ...sc.math, center: clampFftCentre(sc.math.center - (dir * (coarse ? 0.1 : 0.02)) / sc.math.zoom, sc.math.zoom) } }); return; }
  set({ hpos: clamp(sc.hpos - dir * (coarse ? 1 : 0.2) * sc.sdiv, -50 * sc.sdiv, 50 * sc.sdiv) });
}

function levelKnob(dir: 1 | -1, coarse: boolean) {
  const sc = get(), c = sc.ch[sc.trig.source];
  const level = clamp(sc.trig.level + dir * (coarse ? 0.4 : 0.08) * c.vdiv, (-5 - c.pos) * c.vdiv, (5 - c.pos) * c.vdiv);
  set({ trig: { ...sc.trig, level: Math.abs(level) < 1e-9 ? 0 : level } });
  scopeNote(`Trigger level ${fmtV(level)}`, 2000);
}

function runAutoset() {
  const sc = get();
  syncKit();
  scopeLive.undo = sc;
  set(autoset(sc, [tipSource(0), tipSource(1)], now()));
}
function setTo50() {
  const sc = get();
  const level = halfLevel(sc, scopeLive.src, now());
  if (level !== null) set({ trig: { ...sc.trig, level } });
}

// ------------------------------------------------------------ front panel artwork
const ROW1 = 62, ROW2 = 49;
/** Menu buttons of the two top rows: [x, y, label, menu]. */
const MENU_BTNS: [number, number, string, Menu, string][] = [
  [26, ROW1, 'SAVE/RECALL', 'save', 'Saved setups and waveforms (not simulated).'],
  [46, ROW1, 'MEASURE', 'measure', 'Automatic measurements: five readouts. Press an option button to choose a readout\'s Source and Type (Freq, Period, Mean, Pk-Pk, Cyc RMS, Min, Max).'],
  [66, ROW1, 'ACQUIRE', 'acquire', 'Acquisition mode. Sample is used here.'],
  [26, ROW2, 'UTILITY', 'utility', 'System utilities (not simulated).'],
  [46, ROW2, 'CURSOR', 'cursor', 'Cursors. Type: Voltage or Time (Magnitude or Frequency on the FFT); Source: the trace they read. While this menu is up, the two VERTICAL POSITION knobs move cursor 1 and cursor 2.'],
  [66, ROW2, 'DISPLAY', 'display', 'Display settings. Format YT (voltage against time) or XY (CH1 across, CH2 up): XY gives the trapezoid pattern.'],
];
const LABELS: [number, number, string, number?, boolean?][] = [
  [42, 39, 'VERTICAL', 2.5, true], [108, 39, 'HORIZONTAL', 2.5, true], [146, 39, 'TRIGGER', 2.5, true],
  [28, 16.5, 'POSITION', 1.9], [68, 16.5, 'POSITION', 1.9], [108, 16.5, 'POSITION', 1.9], [146, 16.5, 'LEVEL', 1.9],
  [28, 12.6, 'CURSOR 1', 1.6], [68, 12.6, 'CURSOR 2', 1.6],
  [28, -32, 'VOLTS/DIV', 2.1, true], [68, -32, 'VOLTS/DIV', 2.1, true], [108, -36, 'SEC/DIV', 2.1, true],
  [28, -64, 'CH 1', 2.4, true], [68, -64, 'CH 2', 2.4, true], [108, -64, 'EXT TRIG', 2.2, true], [146, -61, 'PROBE COMP', 1.7],
  [28, -68.5, '300 V CAT II', 1.4], [68, -68.5, '300 V CAT II', 1.4],
];

function faceTexture(w: number, h: number) {
  const s = 4, c = document.createElement('canvas');
  c.width = w * s; c.height = h * s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ece9e0'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#dedbd1'; g.fillRect(0, 0, (w / 2 + 12) * s, c.height);
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const t = (x: number, y: number, text: string, size = 2, bold = false, color = '#2b2b2b') => {
    g.fillStyle = color; g.font = `${bold ? 700 : 500} ${size * s}px Arial`; g.fillText(text, (x + w / 2) * s, (h / 2 - y) * s);
  };
  t(-128, 67.5, 'Tektronix', 6, true, '#1f3d7a'); t(-76, 67.5, 'TDS 1002', 5.4, false, '#555');
  t(-28, 69.3, 'TWO CHANNEL', 2, false, '#555'); t(-28, 65.6, 'DIGITAL STORAGE OSCILLOSCOPE', 2, false, '#555');
  t(-118, -66, '60 MHz', 3, true, '#555'); t(-96, -66, '1 GS/s', 3, true, '#555');
  // section frames
  g.strokeStyle = '#8f8d86'; g.lineWidth = 0.35 * s;
  for (const [x0, x1] of [[15, 81], [93, 123], [133, 159]]) g.strokeRect((x0 + w / 2) * s, (h / 2 - 43) * s, (x1 - x0) * s, 84 * s);
  for (const [x, y, text, , info] of MENU_BTNS) { void info; t(x, y + 5.2, text, 1.75, true); }
  t(90, ROW1 + 5.2, 'HELP', 1.75, true); t(90, ROW2 + 5.2, 'DEFAULT SETUP', 1.6, true);
  t(116, ROW1 + 5.2, 'PRINT', 1.75, true); t(116, ROW2 + 5.2, 'SINGLE SEQ', 1.6, true);
  t(142, ROW1 + 5.2, 'AUTO SET', 1.75, true); t(142, ROW2 + 5.2, 'RUN/STOP', 1.75, true);
  for (const [x, y, text, size, bold] of LABELS) t(x, y, text, size, bold);
  for (const [x, y, text] of [[28, 0.6, 'CH 1 MENU'], [48, 0.6, 'MATH MENU'], [68, 0.6, 'CH 2 MENU'], [108, 2.6, 'HORIZ MENU'], [108, -7.4, 'SET TO ZERO'], [146, 2.6, 'TRIG MENU'], [146, -7.4, 'SET TO 50%'], [146, -17.4, 'FORCE TRIG'], [146, -27.4, 'TRIG VIEW']] as [number, number, string][]) t(x, y, text, 1.6, true);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The two LEDs under the VERTICAL POSITION knobs: lit while the knobs move the cursors. */
function CursorLeds({ z }: { z: number }) {
  const on = usePce((s) => knobsMoveCursors(s.scope));
  return <>{[28, 68].map((x) => <mesh key={x} position={[x - 10, 12.6, z]}><circleGeometry args={[1.1, 12]} /><meshBasicMaterial color={on ? '#57e36b' : '#8a9a86'} toneMapped={false} /></mesh>)}</>;
}

export function Tds1002() {
  const screen = useMemo(() => new CanvasScreen(640, 480), []);
  const { w, h, d } = SCOPE;
  const face = useMemo(() => faceTexture(w, h), [w, h]);
  const last = useRef(0);
  const hover = useHover({
    name: 'Tektronix TDS1002 oscilloscope',
    info: 'Connect each channel to the kit, with its ground lead on a GND point. CURSOR, MEASURE, DISPLAY (XY) and MATH MENU (FFT) work as on the instrument.',
    live: () => {
      const c = scopeInfo();
      return `CH1: ${c.ch1 ?? 'not connected'}  ·  CH2: ${c.ch2 ?? 'not connected'}\nground: ${c.ground === 'ok' ? 'connected' : c.ground === 'off' ? 'ground lead is NOT on a GND point' : 'NOT connected (hum, no proper trace)'}`;
    },
  });

  useFrame(() => {
    const t = performance.now();
    if (t - last.current < 60) return;
    last.current = t;
    const sc = get(), tn = now();
    syncKit(tn);
    scopeLive.src = [tipSource(0), tipSource(1)];
    if (sc.run) {
      const a = acquire(sc, scopeLive.src, tn, scopeLive.acq);
      scopeLive.acq = a;
      if (sc.single && a.triggered) set({ run: false, single: false });
    }
    if (import.meta.env.DEV) (window as unknown as { __pceScope: unknown }).__pceScope = scopeLive;
    const noteOn = !!sc.note && sc.note.until > t;
    drawScreen(screen, sc, scopeLive.acq, sc.run ? `${t}` : JSON.stringify([sc, scopeLive.acq?.seq, noteOn]));
  });

  const fz = d / 2 + 0.3, bz = fz + 1.7;
  const option = (i: number) => () => menuView(get()).items[i]?.press?.();
  return (
    <group position={SCOPE.pos} rotation={[0, SCOPE.rotY, 0]}>
      <group {...hover}>
        <mesh position={[0, h / 2 + 4, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#e3e0d6" roughness={0.6} /></mesh>
        <mesh position={[0, h / 2 + 4, -d / 2 - 30]} castShadow><boxGeometry args={[w * 0.82, h * 0.82, 60]} /><meshStandardMaterial color="#d8d4c9" roughness={0.6} /></mesh>
        {[-1, 1].map((sx) => <mesh key={sx} position={[sx * (w / 2 - 20), 2, d / 2 - 15]}><boxGeometry args={[20, 4, 12]} /><meshStandardMaterial color="#222" /></mesh>)}
      </group>
      <group position={[0, h / 2 + 4, 0]}>
        <mesh position={[0, 0, fz]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={face} roughness={0.7} /></mesh>
        <mesh position={[-84, 8, fz + 0.4]}><boxGeometry args={[144, 111, 1]} /><meshStandardMaterial color="#c9c6bd" /></mesh>
        <mesh position={[-84, 8, fz + 1.1]}><planeGeometry args={[132, 99]} /><meshBasicMaterial map={screen.texture} toneMapped={false} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <PushButton key={i} pos={[-8, 40.6 - 16.5 * i, bz]} size={[8, 9]} name={`Option button ${i + 1}`} info="Selects the menu item shown beside it on the screen." onPress={option(i)} />
        ))}
        {MENU_BTNS.map(([x, y, label, menu, info]) => <PushButton key={label} pos={[x, y, bz]} size={[13, 6]} name={label} info={info} onPress={() => openMenu(menu)} />)}
        <PushButton pos={[90, ROW1, bz]} size={[13, 6]} name="HELP" />
        <PushButton pos={[90, ROW2, bz]} size={[13, 6]} name="DEFAULT SETUP" info="Recalls the factory settings. Careful: they set Probe to 10X, and the lab probes are 1X." onPress={() => usePce.setState({ scope: defaultSetup() })} />
        <PushButton pos={[116, ROW1, bz]} size={[13, 6]} name="PRINT" />
        <PushButton pos={[116, ROW2, bz]} size={[13, 6]} name="SINGLE SEQ" info="Takes one triggered acquisition, then stops." onPress={() => set({ run: true, single: true })} />
        <PushButton pos={[142, ROW1, bz]} size={[15, 7]} name="AUTO SET" info="Sets VOLTS/DIV, SEC/DIV and the trigger for the connected signals. On an AM wave it shows carrier cycles: turn SEC/DIV anticlockwise to see the envelope." onPress={runAutoset} />
        <PushButton pos={[142, ROW2, bz]} size={[15, 7]} color="#cfccc3" name="RUN/STOP" info="Freezes the display, or starts acquiring again." onPress={() => set({ run: !get().run, single: false })} />
        <PushButton pos={[28, 6, bz]} size={[13, 6]} color="#cfccc3" name="CH 1 MENU" info="Shows the CH1 menu (Coupling, Probe, Invert...). Pressed again, it switches the CH1 trace off or on." onPress={() => channelButton(0)} />
        <PushButton pos={[48, 6, bz]} size={[13, 6]} color="#cfccc3" name="MATH MENU" info="Math waveform. Operation FFT shows the spectrum of the Source channel: Window and FFT Zoom are in the same menu; HORIZONTAL POSITION moves along the frequency axis." onPress={mathButton} />
        <PushButton pos={[68, 6, bz]} size={[13, 6]} color="#cfccc3" name="CH 2 MENU" info="Shows the CH2 menu. Pressed again, it switches the CH2 trace off or on." onPress={() => channelButton(1)} />
        <PushButton pos={[108, 8, bz]} size={[13, 6]} name="HORIZ MENU" onPress={() => openMenu('horiz')} />
        <PushButton pos={[108, -2, bz]} size={[13, 6]} name="SET TO ZERO" info="Puts the trigger point back at the centre of the screen." onPress={() => set({ hpos: 0 })} />
        <PushButton pos={[146, 8, bz]} size={[13, 6]} name="TRIG MENU" info="Trigger Source (CH1 / CH2), Slope and Mode. Trigger on the modulating signal (CH1) for a steady AM envelope." onPress={() => openMenu('trigger')} />
        <PushButton pos={[146, -2, bz]} size={[13, 6]} name="SET TO 50%" info="Puts the trigger level in the middle of the trigger signal." onPress={setTo50} />
        <PushButton pos={[146, -12, bz]} size={[13, 6]} name="FORCE TRIG" />
        <PushButton pos={[146, -22, bz]} size={[13, 6]} name="TRIG VIEW" />
        <StepKnob pos={[28, 26, fz]} r={5.5} name="CH1 VERTICAL POSITION" info="Moves the CH1 trace. With the CURSOR menu up it moves cursor 1; on the FFT it moves the spectrum up and down." onStep={(dir, coarse) => positionKnob(0, dir, coarse)} />
        <StepKnob pos={[68, 26, fz]} r={5.5} name="CH2 VERTICAL POSITION" info="Moves the CH2 trace. With the CURSOR menu up it moves cursor 2." onStep={(dir, coarse) => positionKnob(1, dir, coarse)} />
        <StepKnob pos={[108, 26, fz]} r={5.5} name="HORIZONTAL POSITION" info="Moves the traces sideways. On the FFT it moves along the frequency axis: bring a peak to the centre line before using FFT Zoom." onStep={horizKnob} />
        <StepKnob pos={[146, 26, fz]} r={5.5} name="TRIGGER LEVEL" info="The trace is steady only while the level is inside the trigger signal's swing." onStep={levelKnob} />
        <StepKnob pos={[28, -18, fz]} r={9} name="CH1 VOLTS/DIV" onStep={(dir) => voltsKnob(0, dir)} />
        <StepKnob pos={[68, -18, fz]} r={9} name="CH2 VOLTS/DIV" onStep={(dir) => voltsKnob(1, dir)} />
        <StepKnob pos={[108, -22, fz]} r={9} name="SEC/DIV" info="Time per division. It also sets the sample rate (2500 points across the screen), and so the frequency span of the FFT." onStep={(dir) => secKnob(dir)} />
        <CursorLeds z={fz + 0.2} />
        {Object.values(BNC).map(([x, y]) => (
          <group key={x} position={[x, y, fz]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh position={[0, 5, 0]}><cylinderGeometry args={[5.5, 5.5, 10, 18]} /><meshStandardMaterial color="#c9ccd0" metalness={0.35} roughness={0.3} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
