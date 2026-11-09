// The 3D laboratory: bench, computer, trainer, instruments and cables, with
// camera views, coding mode, the bootloader workflow guide and tooltips.

import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame as useR3fFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BoardScene } from '../three/BoardScene.tsx';
import { BoardCtx, type HoverInfo } from '../three/interactive.tsx';
import { PerfRenderer, StaticBatch } from '../three/perf.tsx';
import { useBench, type ViewMode } from '../app/bench.ts';
import { useFrame, useLab } from '../app/store.ts';
import { audio } from '../app/audio.ts';
import { Icon } from '../ui/icons.tsx';
import { Room } from './Room.tsx';
import { Mains } from './Mains.tsx';
import { Computer, screenFrame } from './Computer.tsx';
import { Instruments } from './Instruments.tsx';
import { BenchCables, CarryController, SocketTargets, carryPos } from './Cables.tsx';
import { CodingOverlay, useScreenRect } from './CodingOverlay.tsx';
import { DESK_Y, DMM, SCOPE, SOCKET, rotateY } from './world.ts';
import { getExperiment } from '../experiments/experiments.ts';
import { FRC_LABEL } from '../three/layout.ts';
import type { FrcTarget, PicBoardConfig } from '../sim/board/types.ts';
import '../three/board.css';
import './lab.css';

/**
 * Which renderer WebGL will use. Without browser hardware acceleration it falls back
 * to a CPU emulation (SwiftShader, llvmpipe, Microsoft Basic Render): the scene then
 * drops shadows, antialiasing and high-DPI rendering to stay usable.
 */
let gpuCache: { renderer: string; software: boolean } | null = null;
function gpuInfo() {
  if (gpuCache) return gpuCache;
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2', { powerPreference: 'high-performance' }) ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* no WebGL at all: the canvas will report it */ }
  gpuCache = { renderer, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer) };
  return gpuCache;
}

const GPU_NOTICE_KEY = 'vlab.gpuNotice.dismissed';
const softwareName = (r: string) =>
  /swiftshader/i.test(r) ? 'SwiftShader' : /llvmpipe/i.test(r) ? 'llvmpipe' : /basic render/i.test(r) ? 'Microsoft Basic Render Driver' : /softpipe/i.test(r) ? 'softpipe' : '';

function GpuNotice({ renderer }: { renderer: string }) {
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(GPU_NOTICE_KEY) === '1'; } catch { return false; } });
  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { sessionStorage.setItem(GPU_NOTICE_KEY, '1'); } catch { /* storage unavailable */ } };
  return (
    <div className="gpu-notice" role="status">
      <Icon name="warn" size={14} />
      <span>
        <b>3D is running without graphics acceleration</b>{softwareName(renderer) ? ` (software renderer: ${softwareName(renderer)})` : ''}, so movement will be slow and quality is reduced.
        Turn on <i>Use graphics acceleration when available</i> in your browser settings and restart the browser.
      </span>
      <button className="btn ghost icon" onClick={dismiss} title="Dismiss"><Icon name="x" /></button>
    </div>
  );
}

type Pose = { pos: THREE.Vector3; target: THREE.Vector3 };

function poseFor(view: ViewMode, aspect: number): Pose {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (view) {
    case 'board': return { pos: v(15, 300, 285), target: v(0, 0, 10) };
    case 'top': return { pos: v(0, 420, 1), target: v(0, 0, 0) };
    case 'pins': return { pos: v(-4, 205, 38), target: v(-4, 12, -26) };
    case 'lcd': return { pos: v(-20, 95, 125), target: v(-48, 6, 52) };
    case 'scope': {
      const c = rotateY([-40, 90, SCOPE.d / 2], SCOPE.rotY, SCOPE.pos);
      const n = [Math.sin(SCOPE.rotY), 0, Math.cos(SCOPE.rotY)];
      return { pos: v(c[0] + n[0] * 520, c[1] + 70, c[2] + n[2] * 520), target: v(c[0], c[1], c[2]) };
    }
    case 'dmm': return { pos: v(DMM.pos[0] + 40, DMM.pos[1] + 330, DMM.pos[2] + 170), target: v(DMM.pos[0], DMM.pos[1], DMM.pos[2] + 10) };
    case 'computer': {
      const s = screenFrame();
      const tan = Math.tan((32 / 2) * (Math.PI / 180));
      const dh = (s.h / 0.84) / 2 / tan;
      const dw = (s.w / 0.94) / 2 / (tan * aspect);
      const d = Math.max(dh, dw);
      return { pos: v(s.center[0] + s.normal[0] * d, s.center[1], s.center[2] + s.normal[2] * d), target: v(...s.center) };
    }
    default: return { pos: v(10, 980, 1420), target: v(10, 30, -170) };
  }
}

type Controls = { target: THREE.Vector3; update(): void; enabled: boolean } | null;

/** Last time a movement key was pressed; a view transition in progress gives way to it. */
const navInterrupt = { at: 0 };
/** Current keyboard motion (world units/s, rad/s); eased so movement fades in and out. */
const navMotion = { vel: new THREE.Vector3(), yaw: 0, pitch: 0 };
const NAV_EASE = 0.18; // s: time constant of the fade in / fade out

const NAV_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('.monaco-editor'));

/**
 * Arrow keys move like W/A/S/D. Keyboard orbiting (arrows turning the view around the focus
 * point) is set aside, not deleted: set ARROWS_ORBIT to bring it back.
 */
const ARROWS_ORBIT = false;
const ARROW_MOVE: Record<string, string> = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
const navKey = (code: string) => (!ARROWS_ORBIT && ARROW_MOVE[code]) || code;

/**
 * Keyboard walk-around: W/S (↑/↓) forward/back and A/D (←/→) sideways along the desk,
 * Q/E down/up, Shift moves faster. Camera and orbit target move together, so mouse
 * orbit/zoom carry on from wherever the keys left the view.
 */
function KeyboardNav() {
  const { camera, controls } = useThree();
  const keys = useRef(new Set<string>());
  const fast = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      fast.current = e.shiftKey;
      if (!NAV_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (useBench.getState().view === 'computer') return;
      e.preventDefault();
      keys.current.add(e.code);
      navInterrupt.at = performance.now();
    };
    const up = (e: KeyboardEvent) => { fast.current = e.shiftKey; keys.current.delete(e.code); };
    // (keys are stored by physical code; navKey() maps arrows to WASD when they are read)
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  useR3fFrame((_, delta) => {
    const k = new Set([...keys.current].map(navKey));
    const m = navMotion;
    const ctl = controls as unknown as Controls;
    if (!ctl?.enabled) { m.vel.set(0, 0, 0); m.yaw = m.pitch = 0; return; }
    if (!k.size && m.vel.lengthSq() === 0 && m.yaw === 0 && m.pitch === 0) return;
    const dt = Math.min(delta, 0.05);
    // speed follows the zoom level: slow and precise close to the board, quick across the room
    const dist = camera.position.distanceTo(ctl.target);
    const speed = THREE.MathUtils.clamp(dist * 0.9, 80, 1200) * (fast.current ? 2.5 : 1);
    const fwd = ctl.target.clone().sub(camera.position).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0); // looking straight down
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const wish = new THREE.Vector3();
    if (k.has('KeyW')) wish.add(fwd);
    if (k.has('KeyS')) wish.sub(fwd);
    if (k.has('KeyD')) wish.add(right);
    if (k.has('KeyA')) wish.sub(right);
    if (k.has('KeyE')) wish.y += 1;
    if (k.has('KeyQ')) wish.y -= 1;
    if (wish.lengthSq()) wish.normalize().multiplyScalar(speed);
    const yawWish = ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) * 1.5;
    const pitchWish = ((k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)) * 1.1;

    // ease towards the wished-for motion: pressing fades in, releasing glides to a stop
    const ease = 1 - Math.exp(-dt / NAV_EASE);
    m.vel.lerp(wish, ease);
    m.yaw += (yawWish - m.yaw) * ease;
    m.pitch += (pitchWish - m.pitch) * ease;
    if (!k.size && m.vel.lengthSq() < 0.25 && Math.abs(m.yaw) < 1e-3 && Math.abs(m.pitch) < 1e-3) {
      m.vel.set(0, 0, 0); m.yaw = m.pitch = 0;
    }

    // move camera and target together, keeping the target inside the room
    const target = ctl.target.clone().addScaledVector(m.vel, dt);
    target.set(THREE.MathUtils.clamp(target.x, -1800, 1800), THREE.MathUtils.clamp(target.y, DESK_Y, 700), THREE.MathUtils.clamp(target.z, -900, 1400));
    camera.position.add(target.clone().sub(ctl.target));
    ctl.target.copy(target);
    if (m.yaw || m.pitch) {
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(ctl.target));
      s.theta += m.yaw * dt;
      s.phi = THREE.MathUtils.clamp(s.phi - m.pitch * dt, 0.05, Math.PI * 0.47);
      camera.position.copy(ctl.target).add(new THREE.Vector3().setFromSpherical(s));
    }
    camera.position.y = Math.max(camera.position.y, DESK_Y + 12);
    ctl.update();
  });
  return null;
}

/** Animates the camera between views; in coding mode it also tracks the monitor's screen rectangle. */
function CameraRig() {
  const { camera, controls, size } = useThree();
  const view = useBench((s) => s.view);
  const nonce = useBench((s) => s.viewNonce);
  const settled = useRef(false);
  useEffect(() => {
    const ctl = controls as unknown as Controls;
    const to = poseFor(view, size.width / size.height);
    const from = camera.position.clone();
    const fromT = ctl?.target.clone() ?? new THREE.Vector3();
    settled.current = false;
    navMotion.vel.set(0, 0, 0); navMotion.yaw = navMotion.pitch = 0; // a gliding stop must not drift into the new view
    useScreenRect.getState().set(null);
    if (ctl) ctl.enabled = view !== 'computer';
    let raf = 0;
    const t0 = performance.now();
    const anim = () => {
      if (navInterrupt.at > t0 && view !== 'computer') { settled.current = true; return; } // keys took over
      const k = Math.min(1, (performance.now() - t0) / 900);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(from, to.pos, e);
      if (ctl) { ctl.target.lerpVectors(fromT, to.target, e); ctl.update(); } else camera.lookAt(to.target);
      if (k < 1) raf = requestAnimationFrame(anim);
      else settled.current = true;
    };
    anim();
    return () => cancelAnimationFrame(raf);
  }, [view, nonce, camera, controls, size.width, size.height]);

  useR3fFrame(() => {
    if (view !== 'computer' || !settled.current) return;
    const s = screenFrame();
    const pts = s.corners.map((c) => new THREE.Vector3(...c).project(camera));
    const xs = pts.map((p) => ((p.x + 1) / 2) * size.width), ys = pts.map((p) => ((1 - p.y) / 2) * size.height);
    const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const cur = useScreenRect.getState().rect;
    if (!cur || Math.abs(cur.x - r.x) + Math.abs(cur.y - r.y) + Math.abs(cur.w - r.w) + Math.abs(cur.h - r.h) > 1) useScreenRect.getState().set(r);
  });
  return null;
}

/** Dev-only: lets tests/ui-lab-mouse.mjs click real 3D objects by projecting world points. */
function DevProbe() {
  const { camera, size, gl, controls, scene } = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __vlab3d: unknown }).__vlab3d = {
      /** renderer + scene, for performance probes */
      gl, scene,
      project(p: [number, number, number]) {
        const v = new THREE.Vector3(...p).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * size.width, y: r.top + ((1 - v.y) / 2) * size.height };
      },
      /** close-up screenshots: put the camera at pos looking at target */
      look(pos: [number, number, number], target: [number, number, number]) {
        const ctl = controls as unknown as Controls;
        camera.position.set(...pos);
        if (ctl) { ctl.target.set(...target); ctl.update(); } else camera.lookAt(...target);
      },
    };
  }, [camera, size, gl, controls, scene]);
  return null;
}

// ------------------------------------------------------------ workflow guide
const PORT_NAMES = ['PORT-A', 'PORT-B', 'PORT-C', 'PORT-D', 'PORT-E'];

/** Does a probe jumper sit on the header pin named like the requirement ('RD0', 'GND')? */
function probeOn(socketId: string | null | undefined, pin: string) {
  const n = socketId ? SOCKET[socketId]?.node : undefined;
  if (!n) return false;
  if (pin === 'GND') return n.kind === 'gnd';
  return n.kind === 'pin' && `R${'ABCDE'[n.port]}${n.bit}` === pin;
}

/** The experiment's workflow, each step read from the real bench, build and device state. */
function useWorkflow(expId: string) {
  const exp = getExperiment(expId);
  const cfg = useLab((s) => s.boardCfg) as PicBoardConfig;
  const build = useLab((s) => s.build);
  const stale = useLab((s) => s.buildStale);
  const plugs = useBench((s) => s.plugs);
  const usb = plugs['usb:b']?.attachedTo === 'usb:board';
  const mains = plugs['ac:plug']?.attachedTo === 'ac:wall';
  const powerSw = useBench((s) => s.powerSwitch);
  const tempAdjusted = useBench((s) => s.tempAdjusted);
  const up = useBench((s) => s.upload);
  const device = useFrame((s) => s.frame?.device);
  const need = exp?.board ?? {};
  // the ribbons the reference program expects ("preconfigured" wiring of the experiment)
  const wiring = (Object.entries(need.cables ?? {}) as [FrcTarget, number | null][])
    .filter((e): e is [FrcTarget, number] => e[1] !== null)
    .map(([target, port]) => ({ target, port, ok: cfg.cables?.[target] === port }));
  const motorOk = cfg.motorLink === 1;
  const switches = (need.switches ?? []).map((d) => ({ ...d, ok: !!cfg.dips?.[d.bank]?.[d.index] === d.on }));
  const probes = (need.probes ?? []).map((p) => ({ ...p, ok: probeOn(plugs[p.plug]?.attachedTo, p.pin) }));
  const inBoot = device?.mode === 'bootloader';
  const flashed = up.phase === 'done' || !!device?.flashed;
  const running = device?.mode === 'running' && !!device.flashed;
  const steps = [
    { key: 'power', text: 'Power on the board', done: mains && powerSw },
    ...(wiring.length ? [{ key: 'wires', text: 'Connect the ribbon cables', done: wiring.every((w) => w.ok) }] : []),
    ...(need.motor ? [{ key: 'motor', text: 'Connect the motor wires to DCM1', done: motorOk }] : []),
    ...(switches.length ? [{ key: 'dips', text: 'Set the DIP switches', done: switches.every((d) => d.ok) }] : []),
    ...(probes.length ? [{ key: 'scope', text: 'Connect the oscilloscope probe', done: probes.every((p) => p.ok) }] : []),
    { key: 'usb', text: 'Plug the USB cable into the board', done: usb },
    { key: 'boot', text: 'Enter bootloader mode', done: inBoot || flashed },
    { key: 'code', text: 'Write & build the code on the lab computer', done: !!build?.ok && !stale },
    { key: 'upload', text: 'UPLOAD from the computer', done: flashed },
    { key: 'run', text: 'Press RESET to run', done: running },
    ...(need.tempTask ? [{ key: 'temp', text: 'Change the LM35 temperature in the Hardware tab', done: tempAdjusted }] : []),
  ];
  return { exp, wiring, motorOk, switches, probes, steps, build, up, device, usb, mains, powerSw, tempAdjusted, inBoot, flashed, running, allDone: steps.every((st) => st.done) };
}

/**
 * Always mounted: soft chime per completed step,
 * a congratulation when every step is done, and alerts for bootloader entry.
 */
function WorkflowWatcher({ expId }: { expId: string }) {
  const { steps, allDone, device, usb } = useWorkflow(expId);
  const prev = useRef<{ id: string; done: Record<string, boolean>; all: boolean; mode?: string } | null>(null);
  useEffect(() => {
    const done = Object.fromEntries(steps.map((st) => [st.key, st.done]));
    const p = prev.current;
    prev.current = { id: expId, done, all: allDone, mode: device?.mode };
    if (!p || p.id !== expId) return; // first look at an experiment: no fanfare for its starting state
    const bench = useBench.getState();
    if (device?.mode === 'bootloader' && p.mode && p.mode !== 'bootloader') {
      bench.notify(usb ? 'Bootloader mode entered successfully: the computer detects the HID bootloader' : 'Bootloader mode entered successfully: connect the USB cable to upload', 'ok', 5000);
    }
    if (allDone && !p.all) {
      audio.chime('done');
      bench.notify('🎉 Congratulations! All steps are complete: the experiment can be performed now.', 'ok', 7000);
    } else if (steps.some((st) => st.done && p.done[st.key] === false)) {
      audio.chime('step');
    }
  });
  return null;
}

function Step({ done, active, children }: { done: boolean; active?: boolean; children: React.ReactNode }) {
  return <li className={done ? 'done' : active ? 'active' : ''}><span className="dot">{done ? '✓' : ''}</span>{children}</li>;
}

const DIP_NAME: Record<string, string> = { pb: 'Push-button DIP', periph: 'PERI_SW', dcm: 'DCM_SW', analog: 'ANALOG INP' };

function WorkflowGuide({ expId, onPc }: { expId: string; onPc: boolean }) {
  const [open, setOpen] = useState(true);
  const { exp, wiring, motorOk, switches, probes, steps, build, up, device, usb, mains, powerSw, tempAdjusted, inBoot, flashed, running, allDone } = useWorkflow(expId);
  const power = useFrame((s) => s.frame?.board.power ?? true);
  const seq = device?.bootSeq ?? 'idle';
  const seqN = { idle: 0, reset: 1, 'reset+boot': 2, boot: 3, ready: 4 }[seq];
  const next = steps.findIndex((st) => !st.done);
  const is = (key: string) => steps[next]?.key === key;
  const done = (key: string) => !!steps.find((st) => st.key === key)?.done;
  const title = exp ? `Expt ${exp.no} · ${exp.title}` : 'Experiment';
  const pc = onPc ? ' on-pc' : '';
  if (!open) return (
    <button className={`wf-toggle${pc} ${allDone ? 'complete' : ''}`} onClick={() => setOpen(true)} title={`Show the setup guide for ${title}`}>
      <Icon name={allDone ? 'check' : 'list'} /> {allDone ? 'Setup guide · all steps complete' : `Setup guide · step ${next + 1}/${steps.length} · ${steps[next].text}`}
    </button>
  );
  return (
    <div className={`wf${pc}`}>
      <div className="wf-head">
        <div className="wf-title"><b>Setup guide</b><span title={title}>{title}</span></div>
        <button className="btn ghost icon" onClick={() => setOpen(false)} title="Hide the setup guide"><Icon name="x" /></button>
      </div>
      <ol>
        <Step done={done('power')} active={is('power')}>
          Power on the board <span className="dim">(the switchboard is on the wall in front)</span>
          <ul className="wf-sub">
            <li className={mains ? 'ok' : ''}>Adapter&apos;s 2-pin plug → wall socket</li>
            <li className={powerSw ? 'ok' : ''}>Board POWER switch → ON (the POWER LED lights)</li>
          </ul>
        </Step>
        {wiring.length > 0 && (
          <Step done={done('wires')} active={is('wires')}>
            Connect the FRC ribbon cables for this program <span className="dim">(click a ribbon plug on the desk, then a connector)</span>
            <ul className="wf-sub">
              {wiring.map((w) => <li key={w.target} className={w.ok ? 'ok' : ''}>{PORT_NAMES[w.port]} → {FRC_LABEL[w.target] ?? w.target}</li>)}
            </ul>
          </Step>
        )}
        {exp?.board?.motor && (
          <Step done={motorOk} active={is('motor')}>
            Connect the gear motor&apos;s jumper wires to DCM1 <span className="dim">(red → pin 1, black → pin 2; swapping them reverses the motor)</span>
          </Step>
        )}
        {switches.length > 0 && (
          <Step done={done('dips')} active={is('dips')}>
            Set the DIP switches <span className="dim">(all start OFF · click a lever)</span>
            <ul className="wf-sub">
              {switches.map((d) => <li key={`${d.bank}${d.index}`} className={d.ok ? 'ok' : ''} title={`${DIP_NAME[d.bank]} switch ${d.index + 1}`}>{d.label}</li>)}
            </ul>
          </Step>
        )}
        {probes.length > 0 && (
          <Step done={done('scope')} active={is('scope')}>
            Connect the oscilloscope <span className="dim">(female end of each jumper onto the header pin)</span>
            <ul className="wf-sub">
              {probes.map((p) => <li key={p.plug} className={p.ok ? 'ok' : ''}>{p.label}</li>)}
            </ul>
          </Step>
        )}
        <Step done={usb} active={is('usb')}>Plug the USB Type-B cable into the board <span className="dim">(click the plug on the desk, then the socket)</span></Step>
        <Step done={inBoot || flashed} active={is('boot')}>
          Enter bootloader mode <span className="dim">(Shift-click = hold a button, click again to release)</span>
          <ul className="wf-sub">
            <li className={seqN >= 1 ? 'ok' : ''}>Press &amp; hold RESET</li>
            <li className={seqN >= 2 ? 'ok' : ''}>Press &amp; hold BOOT</li>
            <li className={seqN >= 3 ? 'ok' : ''}>Release RESET (keep BOOT)</li>
            <li className={seqN >= 4 ? 'ok' : ''}>Release BOOT</li>
          </ul>
          {inBoot && <span className="wf-ok"> LP3/LP4 blinking: bootloader active</span>}
        </Step>
        <Step done={done('code')} active={is('code')}>
          Write &amp; build the code on the {onPc ? 'lab computer' : <a onClick={() => useBench.getState().setView('computer')}>lab computer</a>}
          {build && !build.ok && <span className="wf-err"> — build errors</span>}
        </Step>
        <Step done={flashed} active={is('upload')}>
          UPLOAD from the computer {up.phase !== 'idle' && up.phase !== 'built' && <span className={`wf-phase ${up.phase}`}>{up.phase === 'nodevice' ? 'no device' : up.phase}{up.phase === 'programming' ? ` ${Math.round(up.progress * 100)}%` : ''}</span>}
        </Step>
        <Step done={running} active={is('run')}>Press RESET (without BOOT) to run the program</Step>
        {exp?.board?.tempTask && (
          <Step done={tempAdjusted} active={is('temp')}>
            With your program running, change the LM35 temperature in the{' '}
            <a onClick={() => useLab.getState().set({ leftTab: 'hardware', leftOpen: true })}>Hardware tab</a>{' '}
            <span className="dim">(the LCD reading should follow it)</span>
          </Step>
        )}
      </ol>
      {allDone && <div className="wf-done">🎉 All steps complete — the experiment can be performed now.</div>}
      <div className="wf-foot">
        Board: <b className={power ? '' : 'c-err'}>{!power ? (mains ? 'power off' : 'no power (adapter unplugged)') : device?.mode === 'running' ? (device.flashed ? 'running your program' : 'running (flash blank)') : device?.mode ?? '—'}</b>
      </div>
    </div>
  );
}

function CarryHint() {
  const carrying = useBench((s) => s.carrying);
  const label = useBench((s) => (s.carrying ? s.plugs[s.carrying]?.label : ''));
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && useBench.getState().carrying) useBench.getState().drop([carryPos.x, DESK_Y + 2, carryPos.z]); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  if (!carrying) return null;
  return <div className="carry-hint">Carrying <b>{label}</b> — click a green connector to attach it · click anywhere else to put it down · Esc</div>;
}

function Toast() {
  const toast = useBench((s) => s.toast);
  const [, force] = useState(0);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => force((n) => n + 1), toast.ms + 100); return () => clearTimeout(t); }, [toast]);
  if (!toast || Date.now() - toast.at > toast.ms) return null;
  return <div className={`lab-toast ${toast.kind}`}>{toast.text}</div>;
}

const VIEWS: [ViewMode, string][] = [['lab', 'Lab'], ['board', 'Board'], ['pins', 'Pins'], ['lcd', 'LCD'], ['scope', 'Scope'], ['dmm', 'DMM'], ['computer', 'Computer']];

function onSceneClick(e: ThreeEvent<MouseEvent>) {
  const b = useBench.getState();
  if (!b.carrying || e.delta > 6) return;
  e.stopPropagation();
  if (b.snap) b.attach(b.carrying, b.snap);
  else b.drop([e.point.x, Math.max(DESK_Y + 2, e.point.y + 1), e.point.z]);
}

/** Last pointer position inside the lab view (kept out of React state: see HoverTip). */
const pointer = { x: 0, y: 0 };

/**
 * Tooltip that follows the pointer. It moves its own element directly instead of storing the
 * position in LabView's state: a LabView re-render on every pointer move used to re-render the
 * whole 3D scene and stall the page.
 */
function HoverTip({ hover, wrap }: { hover: HoverInfo; wrap: React.RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState('');
  useEffect(() => {
    if (!hover.live) { setLive(''); return; }
    setLive(hover.live());
    const id = setInterval(() => setLive(hover.live!()), 150);
    return () => clearInterval(id);
  }, [hover]);
  useLayoutEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const place = () => {
      if (!el.current) return;
      el.current.style.left = `${Math.min(pointer.x + 14, w.clientWidth - 290)}px`;
      el.current.style.top = `${pointer.y + 14}px`;
    };
    place();
    w.addEventListener('pointermove', place);
    return () => w.removeEventListener('pointermove', place);
  }, [wrap]);
  return (
    <div className="board-tip" ref={el}>
      <div className="tip-name">{hover.name}</div>
      {hover.info && <div className="tip-info">{hover.info}</div>}
      {live && <pre className="tip-live">{live}</pre>}
    </div>
  );
}

const CAMERA = { position: [10, 980, 1420] as [number, number, number], fov: 32, near: 2, far: 9000 };

/**
 * Everything inside the Canvas. Memoised and prop-less so that LabView re-renders (hover
 * changes, toolbar, workflow) never re-render the hundreds of 3D components.
 */
const Scene3D = memo(function Scene3D() {
  return (
    <>
          <color attach="background" args={['#cdbfb1']} />
          <hemisphereLight args={['#fff6ec', '#6b5a4a', 0.9]} />
          <directionalLight position={[300, 1400, 700]} intensity={1.7} castShadow
            shadow-mapSize={[2048, 2048]} shadow-camera-left={-1100} shadow-camera-right={1100} shadow-camera-top={700} shadow-camera-bottom={-700} shadow-camera-far={4000} shadow-bias={-0.0003} />
          <directionalLight position={[-900, 600, 400]} intensity={0.45} />
          <pointLight position={[0, 900, 300]} intensity={2.4e5} distance={3000} decay={2} color="#fff4e6" />
          <Suspense fallback={null}>
            <group onClick={onSceneClick}>
              <StaticBatch><Room /></StaticBatch>
              <BoardScene />
              <StaticBatch><Computer /></StaticBatch>
              <Mains />
              <Instruments />
              <BenchCables />
              <SocketTargets />
            </group>
          </Suspense>
          <CarryController />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={30} maxDistance={2600} maxPolarAngle={Math.PI * 0.47} target={[10, 30, -170]} />
          <CameraRig />
          <KeyboardNav />
          <PerfRenderer />
          <DevProbe />
    </>
  );
});

export function LabView({ expId }: { expId: string }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const view = useBench((s) => s.view);
  const [viewsOpen, setViewsOpen] = useState(false);
  const perf = useLab((s) => s.perfMode);
  const wrap = useRef<HTMLDivElement>(null);
  const gpu = gpuInfo();
  // a new context value would re-render every hoverable 3D part
  const hoverCtx = useMemo(() => ({ hover: setHover }), []);
  const gl = useMemo(() => ({ antialias: !gpu.software, powerPreference: 'high-performance' as const, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }), [gpu.software]);
  const dpr = useMemo<number | [number, number]>(() => (gpu.software || perf ? 1 : [1, 2]), [gpu.software, perf]);

  return (
    <div className="board-view lab-view" ref={wrap}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => { const r = wrap.current!.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }}
      onPointerDown={() => {
        audio.unlock();
        // the canvas takes no focus itself: release any text field so WASD reaches the 3D view
        if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
      }}>
      <BoardCtx.Provider value={hoverCtx}>
        <Canvas shadows={!gpu.software && !perf} dpr={dpr} camera={CAMERA} gl={gl}>
          <Scene3D />
        </Canvas>
      </BoardCtx.Provider>

      <div className="board-toolbar">
        <div className={`seg view-seg ${viewsOpen ? 'open' : ''}`}>
          <button className="seg-btn view-toggle" onClick={() => setViewsOpen(!viewsOpen)} aria-expanded={viewsOpen} title={viewsOpen ? 'Hide views' : 'Show all views'}>
            <Icon name="eye" size={13} /> View{!viewsOpen && <b>{VIEWS.find(([v]) => v === view)?.[1]}</b>}
            <Icon name={viewsOpen ? 'chevronLeft' : 'chevronRight'} size={12} />
          </button>
          {viewsOpen && VIEWS.map(([v, l]) => <button key={v} className={`seg-btn ${view === v ? 'on' : ''}`} onClick={() => { useBench.getState().setView(v); setViewsOpen(false); }}>{l}</button>)}
        </div>
        <div className="seg">
          <button className={`seg-btn perf-toggle ${perf ? 'on' : ''}`} aria-pressed={perf} onClick={() => useLab.getState().setPerfMode(!perf)}
            title={perf
              ? 'Performance mode is ON: board parts merged, resistors / capacitors / diodes hidden, no shadows, 1x resolution. Click for full quality.'
              : 'Performance mode: merge the board parts into fewer draw calls, hide resistors / capacitors / diodes, turn shadows off and render at 1x resolution. For slow computers.'}>
            <Icon name="gauge" size={13} /> Performance{perf && <b>ON</b>}
          </button>
        </div>
      </div>
      <WorkflowWatcher expId={expId} />
      <WorkflowGuide expId={expId} onPc={view === 'computer'} />
      {gpu.software && <GpuNotice renderer={gpu.renderer} />}
      <CarryHint />
      <Toast />
      <CodingOverlay expId={expId} />
      {view !== 'computer' && <div className="board-hint">WASD / arrows: move · Q/E: down/up · Shift: faster · drag: orbit · right-drag: pan · scroll: zoom · click the monitor to code · click plugs, probes and wires to move them · Shift-click a board button to hold it</div>}
      {hover && view !== 'computer' && <HoverTip hover={hover} wrap={wrap} />}
    </div>
  );
}
