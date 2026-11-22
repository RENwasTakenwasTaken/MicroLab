// The PCE laboratory in 3D: the trainer kit on the bench with the oscilloscope beside it, probes
// and patch cords, camera views, the setup guide (each step read from the real state of the bench)
// and tooltips. Bench, wall, camera keys and tooltips are shared with the EP lab.

import { Suspense, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { audio } from '../app/audio.ts';
import { useBench } from '../app/bench.ts';
import { useLab } from '../app/store.ts';
import { GpuNotice, HoverTip, KeyboardNav, gpuInfo, isTyping, navInterrupt, navMotion, pointer, type Controls } from '../lab3d/LabView.tsx';
import { WallBoard } from '../lab3d/Mains.tsx';
import { Room } from '../lab3d/Room.tsx';
import { DESK_Y } from '../lab3d/world.ts';
import { BoardCtx, type HoverInfo } from '../three/interactive.tsx';
import { PerfRenderer, StaticBatch } from '../three/perf.tsx';
import { Icon } from '../ui/icons.tsx';
import { AmKit } from './AmKit.tsx';
import { LEVEL, panelToWorld } from './am/layout.ts';
import { useAmSetup } from './am/setup.tsx';
import { Dmm } from './Dmm.tsx';
import { FmKit } from './fm/FmKit.tsx';
import { panelToWorld as fmPanelToWorld } from './fm/layout.ts';
import { useFmSetup } from './fm/setup.tsx';
import { SetupPanel } from './Guide.tsx';
import { BenchCords, CarryController, SocketTargets, carryPos } from './Cords.tsx';
import { scopeLive } from './scope/menus.ts';
import { Tds1002 } from './scope/Tds1002.tsx';
import { usePce, type PceView } from './store.ts';
import { DMM, KIT_POS, SCOPE, WALL_POS, scopePoint } from './world.ts';
import '../three/board.css';
import '../lab3d/lab.css';
import './pce.css';

// ------------------------------------------------------------ camera
function poseFor(view: PceView) {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const [kx, , kz] = KIT_POS;
  switch (view) {
    case 'kit': return { pos: v(kx + 60, 470, kz + 360), target: v(kx + 46, DESK_Y + LEVEL.panel, kz + 4) };
    case 'top': return { pos: v(kx + 48, 640, kz + 1), target: v(kx + 48, DESK_Y + LEVEL.panel, kz) };
    case 'scope': {
      const c = scopePoint(46, 0, 0), n = [Math.sin(SCOPE.rotY), 0, Math.cos(SCOPE.rotY)];
      return { pos: v(c[0] + n[0] * 520, c[1] + 50, c[2] + n[2] * 520), target: v(c[0], c[1], c[2]) };
    }
    case 'dmm': return { pos: v(DMM.pos[0] + 30, 330, DMM.pos[2] + 190), target: v(DMM.pos[0], 20, DMM.pos[2]) };
    default: return { pos: v(170, 640, 1150), target: v(150, 80, -60) };
  }
}

/** Animates the camera to the chosen view; the movement keys take over at once. */
function CameraRig() {
  const { camera, controls } = useThree();
  const view = usePce((s) => s.view);
  const nonce = usePce((s) => s.viewNonce);
  useEffect(() => {
    const ctl = controls as unknown as Controls;
    const to = poseFor(view);
    const from = camera.position.clone(), fromT = ctl?.target.clone() ?? new THREE.Vector3();
    navMotion.vel.set(0, 0, 0); navMotion.yaw = navMotion.pitch = 0;
    let raf = 0;
    const t0 = performance.now();
    const anim = () => {
      if (navInterrupt.at > t0) return;
      const k = Math.min(1, (performance.now() - t0) / 850);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(from, to.pos, e);
      if (ctl) { ctl.target.lerpVectors(fromT, to.target, e); ctl.update(); } else camera.lookAt(to.target);
      if (k < 1) raf = requestAnimationFrame(anim);
    };
    anim();
    return () => cancelAnimationFrame(raf);
  }, [view, nonce, camera, controls]);
  return null;
}

/** Dev-only: lets the UI tests click real 3D objects by projecting world points. */
function DevProbe() {
  const { camera, size, gl, controls } = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __pce3d: unknown }).__pce3d = {
      /** world position of a panel point (mm, height above the panel) and of a point on the scope's face */
      panel: panelToWorld, fmPanel: fmPanelToWorld, scope: scopePoint,
      project(p: [number, number, number]) {
        const v = new THREE.Vector3(...p).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * size.width, y: r.top + ((1 - v.y) / 2) * size.height };
      },
      look(pos: [number, number, number], target: [number, number, number]) {
        const ctl = controls as unknown as Controls;
        camera.position.set(...pos);
        if (ctl) { ctl.target.set(...target); ctl.update(); } else camera.lookAt(...target);
      },
    };
  }, [camera, size, gl, controls]);
  return null;
}

function onSceneClick(e: ThreeEvent<MouseEvent>) {
  const st = usePce.getState();
  if (!st.carrying || e.delta > 6) return;
  e.stopPropagation();
  if (st.snap) st.attach(st.carrying, st.snap);
  else st.drop([e.point.x, Math.max(DESK_Y + 3, e.point.y + 2), e.point.z]);
}

function CarryHint() {
  const label = usePce((s) => (s.carrying ? s.plugs[s.carrying]?.label : ''));
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const st = usePce.getState(); if (e.key === 'Escape' && st.carrying) st.drop([carryPos.x, DESK_Y + 3, carryPos.z]); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  if (!label) return null;
  return <div className="carry-hint">Carrying <b>{label}</b> — click a green pin to connect it · click anywhere else to put it down · Esc</div>;
}

function Toast() {
  const toast = usePce((s) => s.toast);
  const [, force] = useState(0);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => force((n) => n + 1), toast.ms + 100); return () => clearTimeout(t); }, [toast]);
  if (!toast || Date.now() - toast.at > toast.ms) return null;
  return <div className={`lab-toast ${toast.kind}`}>{toast.text}</div>;
}

const VIEWS: [PceView, string][] = [['lab', 'Lab'], ['kit', 'Kit'], ['top', 'Panel'], ['scope', 'Scope'], ['dmm', 'Meter']];

/** Each kit's setup guide is its own hook, so each gets its own component. */
function AmGuide() { return <SetupPanel data={useAmSetup()} />; }
function FmGuide() { return <SetupPanel data={useFmSetup()} />; }

/** The trainer for the experiment, and the instruments that go with it. */
function KitOnBench() {
  const kit = usePce((s) => s.kit);
  return kit === 'fm' ? <><FmKit /><Dmm /></> : <AmKit />;
}
const CAMERA = { position: [170, 640, 1150] as [number, number, number], fov: 32, near: 2, far: 9000 };
const WALL_INFO = 'Switchboard on the wall behind the bench. Put the kit\'s mains plug in the socket, then switch the kit ON with its own toggle.';

/** Everything inside the Canvas: memoised and prop-less, so overlay re-renders never re-render the 3D parts. */
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
          <WallBoard pos={WALL_POS} info={WALL_INFO} />
          <KitOnBench />
          <Tds1002 />
          <BenchCords />
          <SocketTargets />
        </group>
      </Suspense>
      <CarryController />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={30} maxDistance={2600} maxPolarAngle={Math.PI * 0.47} target={[150, 80, -60]} />
      <CameraRig />
      <KeyboardNav />
      <PerfRenderer />
      <DevProbe />
    </>
  );
});

export function PceLab() {
  const kit = usePce((s) => s.kit);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  const view = usePce((s) => s.view);
  const perf = useLab((s) => s.perfMode);
  const wrap = useRef<HTMLDivElement>(null);
  const gpu = gpuInfo();
  const hoverCtx = useMemo(() => ({ hover: setHover }), []);
  const gl = useMemo(() => ({ antialias: !gpu.software, powerPreference: 'high-performance' as const, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }), [gpu.software]);
  const dpr = useMemo<number | [number, number]>(() => (gpu.software || perf ? 1 : [1, 2]), [gpu.software, perf]);
  // the shared movement keys stand aside only for the EP lab's computer view, which this lab does not have
  useEffect(() => { useBench.setState({ view: 'lab' }); scopeLive.acq = null; }, []);
  return (
    <div className="board-view lab-view pce-lab" ref={wrap}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => { const r = wrap.current!.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }}
      onPointerDown={() => { audio.unlock(); if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur(); }}>
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
          {viewsOpen && VIEWS.filter(([v]) => v !== 'dmm' || kit === 'fm').map(([v, l]) => <button key={v} className={`seg-btn ${view === v ? 'on' : ''}`} onClick={() => { usePce.getState().setView(v); setViewsOpen(false); }}>{l}</button>)}
        </div>
        <div className="seg">
          <button className={`seg-btn perf-toggle ${perf ? 'on' : ''}`} aria-pressed={perf} onClick={() => useLab.getState().setPerfMode(!perf)}
            title={perf ? 'Performance mode is ON: fixed parts merged, no shadows, 1x resolution. Click for full quality.' : 'Performance mode: fewer draw calls, no shadows, 1x resolution. For slow computers.'}>
            <Icon name="gauge" size={13} /> Performance{perf && <b>ON</b>}
          </button>
        </div>
      </div>
      {kit === 'fm' ? <FmGuide /> : <AmGuide />}
      {gpu.software && <GpuNotice renderer={gpu.renderer} />}
      <CarryHint />
      <Toast />
      <div className="board-hint">WASD / arrows: move · Q/E: down/up · Shift: faster · drag: orbit · right-drag: pan · scroll: zoom · click probes and cords to move them · drag or scroll a pot to turn it</div>
      {hover && <HoverTip hover={hover} wrap={wrap} />}
    </div>
  );
}
