// The 3D laboratory: bench, computer, trainer, instruments and cables, with
// camera views, coding mode, the bootloader workflow guide and tooltips.

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame as useR3fFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BoardScene } from '../three/BoardScene.tsx';
import { BoardCtx, type HoverInfo } from '../three/interactive.tsx';
import { useBench, type ViewMode } from '../app/bench.ts';
import { useFrame, useLab } from '../app/store.ts';
import { audio } from '../app/audio.ts';
import { Icon } from '../ui/icons.tsx';
import { Room } from './Room.tsx';
import { Computer, screenFrame } from './Computer.tsx';
import { Instruments } from './Instruments.tsx';
import { BenchCables, CarryController, SocketTargets, carryPos } from './Cables.tsx';
import { CodingOverlay, useScreenRect } from './CodingOverlay.tsx';
import { DESK_Y, DMM, SCOPE, rotateY } from './world.ts';
import '../three/board.css';
import './lab.css';

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
    useScreenRect.getState().set(null);
    if (ctl) ctl.enabled = view !== 'computer';
    let raf = 0;
    const t0 = performance.now();
    const anim = () => {
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
  const { camera, size, gl } = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __vlab3d: unknown }).__vlab3d = {
      project(p: [number, number, number]) {
        const v = new THREE.Vector3(...p).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * size.width, y: r.top + ((1 - v.y) / 2) * size.height };
      },
    };
  }, [camera, size, gl]);
  return null;
}

// ------------------------------------------------------------ workflow guide
function Step({ done, active, children }: { done: boolean; active?: boolean; children: React.ReactNode }) {
  return <li className={done ? 'done' : active ? 'active' : ''}><span className="dot">{done ? '✓' : ''}</span>{children}</li>;
}

function WorkflowGuide() {
  const [open, setOpen] = useState(false);
  const build = useLab((s) => s.build);
  const stale = useLab((s) => s.buildStale);
  const usb = useBench((s) => s.plugs['usb:b']?.attachedTo === 'usb:board');
  const up = useBench((s) => s.upload);
  const device = useFrame((s) => s.frame?.device);
  const power = useFrame((s) => s.frame?.board.power ?? true);
  const seq = device?.bootSeq ?? 'idle';
  const inBoot = device?.mode === 'bootloader';
  const seqN = { idle: 0, reset: 1, 'reset+boot': 2, boot: 3, ready: 4 }[seq];
  const running = device?.mode === 'running' && device.flashed;
  const steps = [!!build?.ok && !stale, usb, inBoot || up.phase === 'done', up.phase === 'done' || !!device?.flashed, running];
  const next = steps.findIndex((s) => !s);
  const nextText = ['Write & UPLOAD code on the lab computer', 'Plug the USB cable into the board', 'Bootloader: RESET+BOOT sequence', 'UPLOAD from the computer', 'Press RESET to run'][next] ?? 'Program running';
  if (!open) return (
    <button className="wf-toggle" onClick={() => setOpen(true)} title="Show the programming workflow">
      <Icon name="list" /> Step {next < 0 ? 5 : next + 1}/5 · {nextText}
    </button>
  );
  return (
    <div className="wf">
      <div className="wf-head"><b>PIC18F4550 programming workflow</b><button className="btn ghost icon" onClick={() => setOpen(false)}><Icon name="x" /></button></div>
      <ol>
        <Step done={!!build?.ok && !stale} active={!build}>
          Write code on the <a onClick={() => useBench.getState().setView('computer')}>lab computer</a>
          {build && !build.ok && <span className="wf-err"> — build errors</span>}
        </Step>
        <Step done={usb} active={!usb}>Plug the USB Type-B cable into the board <span className="dim">(drag the plug from the desk)</span></Step>
        <Step done={inBoot || (up.phase === 'done')} active={usb && !inBoot}>
          Enter bootloader mode <span className="dim">(right-click / Shift-click = hold a button)</span>
          <ul className="wf-sub">
            <li className={seqN >= 1 ? 'ok' : ''}>Press & hold RESET</li>
            <li className={seqN >= 2 ? 'ok' : ''}>Press & hold BOOT</li>
            <li className={seqN >= 3 ? 'ok' : ''}>Release RESET (keep BOOT)</li>
            <li className={seqN >= 4 ? 'ok' : ''}>Release BOOT</li>
          </ul>
          {inBoot && <span className="wf-ok"> LP3/LP4 blinking: bootloader active</span>}
        </Step>
        <Step done={up.phase === 'done' || !!device?.flashed} active={inBoot && up.phase !== 'done'}>
          UPLOAD from the computer {up.phase !== 'idle' && up.phase !== 'built' && <span className={`wf-phase ${up.phase}`}>{up.phase}{up.phase === 'programming' ? ` ${Math.round(up.progress * 100)}%` : ''}</span>}
        </Step>
        <Step done={running} active={!!device?.flashed && !running}>Press RESET (without BOOT) to run the program</Step>
      </ol>
      <div className="wf-foot">
        Board: <b className={power ? '' : 'c-err'}>{!power ? 'power off' : device?.mode === 'running' ? (device.flashed ? 'running your program' : 'running (flash blank)') : device?.mode ?? '—'}</b>
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
  useEffect(() => { if (!toast) return; const t = setTimeout(() => force((n) => n + 1), 2600); return () => clearTimeout(t); }, [toast]);
  if (!toast || Date.now() - toast.at > 2500) return null;
  return <div className={`lab-toast ${toast.kind}`}>{toast.text}</div>;
}

const VIEWS: [ViewMode, string][] = [['lab', 'Lab'], ['board', 'Board'], ['pins', 'Pins'], ['lcd', 'LCD'], ['scope', 'Scope'], ['dmm', 'DMM'], ['computer', 'Computer']];

export function LabView({ expId }: { expId: string }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [live, setLive] = useState('');
  const view = useBench((s) => s.view);
  const [viewsOpen, setViewsOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hover?.live) { setLive(''); return; }
    setLive(hover.live());
    const id = setInterval(() => setLive(hover.live!()), 150);
    return () => clearInterval(id);
  }, [hover]);

  const onSceneClick = (e: ThreeEvent<MouseEvent>) => {
    const b = useBench.getState();
    if (!b.carrying || e.delta > 6) return;
    e.stopPropagation();
    if (b.snap) b.attach(b.carrying, b.snap);
    else b.drop([e.point.x, Math.max(DESK_Y + 2, e.point.y + 1), e.point.z]);
  };

  return (
    <div className="board-view lab-view" ref={wrap}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => { const r = wrap.current!.getBoundingClientRect(); setMouse({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
      onPointerDown={() => audio.unlock()}>
      <BoardCtx.Provider value={{ hover: setHover }}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [10, 980, 1420], fov: 32, near: 2, far: 9000 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
          <color attach="background" args={['#cdbfb1']} />
          <hemisphereLight args={['#fff6ec', '#6b5a4a', 0.9]} />
          <directionalLight position={[300, 1400, 700]} intensity={1.7} castShadow
            shadow-mapSize={[2048, 2048]} shadow-camera-left={-1100} shadow-camera-right={1100} shadow-camera-top={700} shadow-camera-bottom={-700} shadow-camera-far={4000} shadow-bias={-0.0003} />
          <directionalLight position={[-900, 600, 400]} intensity={0.45} />
          <pointLight position={[0, 900, 300]} intensity={2.4e5} distance={3000} decay={2} color="#fff4e6" />
          <Suspense fallback={null}>
            <group onClick={onSceneClick}>
              <Room />
              <BoardScene />
              <Computer />
              <Instruments />
              <BenchCables />
              <SocketTargets />
            </group>
          </Suspense>
          <CarryController />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={30} maxDistance={2600} maxPolarAngle={Math.PI * 0.47} target={[10, 30, -170]} />
          <CameraRig />
          <DevProbe />
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
      </div>
      {view !== 'computer' && <WorkflowGuide />}
      <CarryHint />
      <Toast />
      <CodingOverlay expId={expId} />
      {view !== 'computer' && <div className="board-hint">Drag: orbit · right-drag: pan · scroll: zoom · click the monitor to code · click plugs/probes to move them · right-click a board button to hold it</div>}
      {hover && view !== 'computer' && (
        <div className="board-tip" style={{ left: Math.min(mouse.x + 14, (wrap.current?.clientWidth ?? 0) - 290), top: mouse.y + 14 }}>
          <div className="tip-name">{hover.name}</div>
          {hover.info && <div className="tip-info">{hover.info}</div>}
          {live && <pre className="tip-live">{live}</pre>}
        </div>
      )}
    </div>
  );
}
