// Interactive / live components of the 3D board. Live visuals read the latest
// simulation frame inside useFrame (no React re-render per frame).

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '../app/sim.ts';
import { useLab } from '../app/store.ts';
import type { PicBoardConfig } from '../sim/board/types.ts';
import { Box, Cyl, MAT, To92 } from './parts.tsx';
import { glowTexture, LcdRenderer } from './textures.ts';
import { useBench } from '../app/bench.ts';
import { Html } from '@react-three/drei';

import { BASE } from './layout.ts';

/** While a plug is being carried, board controls ignore clicks (the click drops the plug instead). */
const busy = () => !!useBench.getState().carrying;

export interface HoverInfo { name: string; info?: string; live?: () => string }
export const BoardCtx = createContext<{ hover(h: HoverInfo | null): void }>({ hover: () => {} });

type Controls = { enabled: boolean } | null;
function useOrbitLock() {
  const controls = useThree((s) => s.controls) as unknown as Controls;
  return (locked: boolean) => { if (controls) controls.enabled = !locked; };
}

/** Pointer handlers that show a tooltip for the wrapped component. */
export function useHover(h: HoverInfo) {
  const ctx = useContext(BoardCtx);
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); ctx.hover(h); document.body.style.cursor = h.live || h.info ? 'help' : ''; },
    onPointerOut: () => { ctx.hover(null); document.body.style.cursor = ''; },
  };
}

const picBoard = () => (sim.latest?.board.kind === 'pic' ? sim.latest.board : null);

// ------------------------------------------------------------ push button
export function TactSwitch({ input, size = 6, cap, name, info }: { input?: string; size?: number; cap: 'white' | 'black'; name?: string; info?: string }) {
  const [down, setDown] = useState(false);
  const lock = useOrbitLock();
  const latched = useBench((s) => (input ? !!s.latched[input] : false));
  const hover = useHover({ name: name ?? 'Push button', info: `${info ?? ''}${input ? '\nLeft-click: press · Right-click / Shift-click: hold (latch) or release' : ''}` });
  useEffect(() => {
    if (!down) return;
    const up = () => { setDown(false); lock(false); if (input) sim.input({ kind: 'button', id: input, pressed: false }); };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [down, input, lock]);
  const press = (e: ThreeEvent<PointerEvent>) => {
    if (busy()) return;
    e.stopPropagation();
    if (input && (e.button === 2 || (e.button === 0 && e.shiftKey))) {
      // hold / release the button (lets the user keep RESET pressed while pressing BOOT)
      const held = !useBench.getState().latched[input];
      useBench.setState({ latched: { ...useBench.getState().latched, [input]: held } });
      sim.input({ kind: 'button', id: input, pressed: held });
      return;
    }
    if (e.button !== 0 || latched) return;
    lock(true);
    setDown(true);
    if (input) sim.input({ kind: 'button', id: input, pressed: true });
  };
  const capR = size * 0.3;
  return (
    <group {...hover} onPointerDown={press}>
      <Box p={[0, 1.75, 0]} s={[size, 3.5, size]} m={MAT.black} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => (
        <Box key={i} p={[a * size * 0.42, 0.3, b * size * 0.36]} s={[0.8, 0.6, 1.2]} m={MAT.pin} />
      ))}
      <Cyl p={[0, down || latched ? 4.1 : 4.9, 0]} r={capR} h={2.8} m={cap === 'white' ? MAT.white : MAT.blackGloss} />
      {input && <mesh position={[0, 7, 0]} visible={false}><boxGeometry args={[size + 1, 8, size + 1]} /></mesh>}
      {(input === 'reset' || input === 'boot') && (
        <Html center position={[0, 13, 0]} zIndexRange={[16, 0]} style={{ pointerEvents: 'none', display: latched ? 'block' : 'none' }}><div className="held-badge">HELD</div></Html>
      )}
    </group>
  );
}

// -------------------------------------------------------------- DIP switch
export function DipSwitch({ n, bank, name, info }: { n: number; bank?: keyof PicBoardConfig['dips']; name?: string; info?: string }) {
  const cfg = useLab((s) => s.boardCfg) as PicBoardConfig;
  const [local, setLocal] = useState<boolean[]>(() => Array(n).fill(false));
  const states = bank && cfg.dips ? cfg.dips[bank] : local;
  const hover = useHover({ name: name ?? 'DIP switch', info: `${info ?? ''}${info ? '\n' : ''}Click a lever to toggle.` });
  const L = n * 2.54 + 1.6;
  const toggle = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (busy()) return;
    e.stopPropagation();
    if (bank) {
      const next = structuredClone(cfg);
      next.dips[bank][i] = !next.dips[bank][i];
      useLab.getState().set({ boardCfg: next });
      sim.input({ kind: 'dip', bank, index: i, on: next.dips[bank][i] });
    } else setLocal((s) => s.map((v, k) => (k === i ? !v : v)));
  };
  return (
    <group {...hover}>
      <Box p={[0, 1.8, 0]} s={[L, 3.6, 7]} m={MAT.red} />
      {Array.from({ length: n }, (_, i) => {
        const x = -L / 2 + 0.8 + 1.27 + i * 2.54;
        return (
          <group key={i} onClick={toggle(i)}>
            <Box p={[x, 3.62, 0]} s={[1.4, 0.05, 4.4]} m={MAT.cavity} castShadow={false} />
            <Box p={[x, 4.1, states?.[i] ? -1.1 : 1.1]} s={[1.2, 1, 2]} m={MAT.white} />
          </group>
        );
      })}
    </group>
  );
}

// -------------------------------------------------------------------- LED
const LED_COLORS = { red: '#ff2a2a', green: '#3dff6a', yellow: '#ffd23d' } as const;
export function Led({ color, d = 3, signal, name, info }: { color: keyof typeof LED_COLORS; d?: number; signal?: string; name?: string; info?: string }) {
  const lens = useRef<THREE.MeshStandardMaterial>(null);
  const sprite = useRef<THREE.SpriteMaterial>(null);
  const c = LED_COLORS[color];
  const flash = useRef(0);
  const hover = useHover({
    name: name ?? 'LED', info,
    live: signal?.startsWith('L') && signal.length === 2 ? () => `brightness ${(level() * 100).toFixed(0)} %` : undefined,
  });
  const level = () => {
    const b = picBoard();
    if (!b) return signal === 'POWER' && sim.latest?.board.power ? 1 : 0;
    if (!b.power) return 0;
    if (signal === 'POWER') return 1;
    if (signal && /^L\d$/.test(signal)) return b.leds[+signal[1]];
    if (signal === 'LP3' || signal === 'LP4') {
      // USB HID bootloader blinks the module LEDs alternately (assumed indication)
      if (sim.latest?.device.mode !== 'bootloader') return 0;
      return Math.floor(performance.now() / 280) % 2 === (signal === 'LP3' ? 0 : 1) ? 1 : 0;
    }
    if (signal === 'TXLED' || signal === 'RXLED') {
      if (sim.latest?.serial.length) flash.current = 6;
      return flash.current-- > 0 ? 0.9 : 0;
    }
    return 0;
  };
  useFrame(() => {
    const v = level();
    if (lens.current) lens.current.emissiveIntensity = 0.05 + v * 2.4;
    if (sprite.current) sprite.current.opacity = Math.min(1, v * 0.9);
  });
  const r = d / 2;
  return (
    <group {...hover}>
      <mesh position={[0, 2.6, 0]} castShadow>
        <cylinderGeometry args={[r, r * 1.08, 3.6, 18]} />
        <meshStandardMaterial ref={lens} color={c} emissive={c} emissiveIntensity={0.05} transparent opacity={0.88} roughness={0.15} />
      </mesh>
      <mesh position={[0, 4.4, 0]}>
        <sphereGeometry args={[r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.3} transparent opacity={0.8} roughness={0.1} />
      </mesh>
      <sprite position={[0, 4.3, 0]} scale={[d * 4.2, d * 4.2, 1]}>
        <spriteMaterial ref={sprite} map={glowTexture()} color={c} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

// -------------------------------------------------------------------- LCD
export function LcdModule({ name, info }: { name?: string; info?: string }) {
  const renderer = useMemo(() => new LcdRenderer(), []);
  const backlight = useRef<THREE.MeshStandardMaterial>(null);
  const hover = useHover({
    name: name ?? 'LCD', info,
    live: () => {
      const b = picBoard();
      if (!b) return '';
      return b.lcd.rows.map((r) => r.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : c === 0xdf ? '°' : ' ')).join('')).join('\n');
    },
  });
  useFrame(() => {
    const b = picBoard();
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    renderer.draw(b?.lcd ?? null, !!b?.power, b?.lcdContrast ?? 0.6, blink);
    if (backlight.current) backlight.current.emissiveIntensity = b?.power ? 0.55 : 0.0;
  });
  return (
    <group {...hover}>
      {/* standoffs + module PCB */}
      {[[-37, -15], [37, -15], [-37, 15], [37, 15]].map(([x, z], i) => <Cyl key={i} p={[x, 3.5, z]} r={1.8} h={7} m={MAT.brass} seg8 />)}
      <Box p={[0, 7.8, 0]} s={[80, 1.6, 36]} m={MAT.lcdPcb} />
      {[[-37, -15], [37, -15], [-37, 15], [37, 15]].map(([x, z], i) => <Cyl key={`s${i}`} p={[x, 8.9, z]} r={2.6} h={0.8} m={MAT.silver} />)}
      {/* header pins along the top edge */}
      <Box p={[-18, 9.4, -16.4]} s={[40.6, 1.6, 2.4]} m={MAT.black} />
      {/* bezel */}
      <Box p={[0, 11.6, 0]} s={[71.2, 6, 25.2]} m={MAT.blackGloss} />
      <mesh position={[0, 14.62, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[66, 17]} />
        <meshStandardMaterial ref={backlight} map={renderer.texture} emissiveMap={renderer.texture} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.25} metalness={0} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- trimpot
export function Trimpot({ input, name, info }: { input?: 'pot' | 'contrast'; name?: string; info?: string }) {
  const rotor = useRef<THREE.Group>(null);
  const lock = useOrbitLock();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const valueRef = useRef(input === 'contrast' ? 0.62 : 0.5);
  const hover = useHover({
    name: name ?? 'Trimmer', info,
    live: () => input === 'pot' ? `${(valueRef.current * 5).toFixed(2)} V` : `contrast ${(valueRef.current * 100).toFixed(0)} %`,
  });
  const setValue = (v: number) => {
    v = Math.min(1, Math.max(0, v));
    valueRef.current = v;
    if (input === 'pot') sim.input({ kind: 'pot', value: v });
    if (input === 'contrast') sim.input({ kind: 'contrast', value: v });
  };
  useFrame(() => {
    const b = picBoard();
    if (b && !drag.current) valueRef.current = input === 'pot' ? b.pot : b.lcdContrast;
    if (rotor.current) rotor.current.rotation.y = -(valueRef.current - 0.5) * Math.PI * 1.5;
  });
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current) setValue(drag.current.v + (e.clientX - drag.current.x) / 200); };
    const up = () => { if (drag.current) { drag.current = null; lock(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  });
  return (
    <group {...hover}
      onPointerDown={(e) => { if (busy()) return; e.stopPropagation(); lock(true); drag.current = { x: e.clientX, v: valueRef.current }; }}
      onWheel={(e) => { e.stopPropagation(); setValue(valueRef.current - Math.sign(e.deltaY) * 0.03); }}>
      <Box p={[0, 2.4, 0]} s={[7, 4.8, 7]} m={MAT.blue} />
      <group ref={rotor} position={[0, 4.8, 0]}>
        <Cyl p={[0, 0.5, 0]} r={2.6} h={1} m={MAT.white} />
        <Box p={[0, 1.05, 0]} s={[4, 0.15, 0.8]} m={MAT.cavity} castShadow={false} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ power switch
export function SlideSwitch({ name, info }: { name?: string; info?: string }) {
  const knob = useRef<THREE.Mesh>(null);
  const hover = useHover({ name: name ?? 'Switch', info });
  useFrame(() => {
    const on = sim.latest?.board.power ?? true;
    if (knob.current) knob.current.position.x = on ? -2.2 : 2.2;
  });
  return (
    <group {...hover} onClick={(e) => { if (busy()) return; e.stopPropagation(); sim.input({ kind: 'power', on: !(sim.latest?.board.power ?? true) }); }}>
      <Box p={[0, 3, 0]} s={[12, 6, 6.5]} m={MAT.black} />
      <mesh ref={knob} position={[-2.2, 7, 0]} castShadow>
        <boxGeometry args={[3.5, 2.5, 3]} />
        <primitive object={MAT.blackGloss} attach="material" />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ buzzer
export function Buzzer({ d, name, info }: { d: number; name?: string; info?: string }) {
  const rings = useRef<THREE.Group>(null);
  const hover = useHover({ name: name ?? 'Buzzer', info, live: () => `drive ${((picBoard()?.buzzer ?? 0) * 100).toFixed(0)} %` });
  useFrame((_, dt) => {
    const v = picBoard()?.buzzer ?? 0;
    const g = rings.current;
    if (!g) return;
    g.visible = v > 0.02;
    g.children.forEach((c, i) => {
      const t = ((performance.now() / 600 + i / 3) % 1);
      c.scale.setScalar(4 + t * 12);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5 * Math.min(1, v);
    });
    void dt;
  });
  return (
    <group {...hover}>
      <Cyl p={[0, 4.75, 0]} r={d / 2} h={9.5} m={MAT.blackGloss} />
      <Cyl p={[0, 9.52, 0]} r={1.1} h={0.05} m={MAT.cavity} />
      <group ref={rings} position={[0, 10.5, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1, 40]} />
            <meshBasicMaterial color="#9ad7ff" transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// -------------------------------------------------------------------- LM35
export function Lm35({ name, info }: { name?: string; info?: string }) {
  const hover = useHover({ name: name ?? 'LM35', info, live: () => { const b = picBoard(); return b ? `${b.temperature.toFixed(1)} °C → ${(b.lm35Volts * 1000).toFixed(0)} mV` : ''; } });
  return (
    <group {...hover} onClick={(e) => { if (busy()) return; e.stopPropagation(); useLab.getState().set({ leftTab: 'hardware', leftOpen: true }); }}>
      <To92 />
    </group>
  );
}

// ---------------------------------------------------------- off-board items
/** Wire as a tube through the given points (photo-mm local coordinates). */
export function Wire({ points, color, r = 0.7 }: { points: [number, number, number][]; color: string; r?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 48, r, 6, false);
  }, [points, r]);
  return <mesh geometry={geo} castShadow><meshStandardMaterial color={color} roughness={0.5} /></mesh>;
}

export function DcMotor() {
  const rotor = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const hover = useHover({
    name: 'DC motor (external, on DCM1)', info: '12 V brushed DC motor driven by the L293D. Speed follows the average PWM drive.',
    live: () => { const b = picBoard(); return b ? `${b.motor.rpm.toFixed(0)} rpm  (drive ${(b.motor.drive * 100).toFixed(0)} %)` : ''; },
  });
  useFrame((_, dt) => {
    const rpm = picBoard()?.motor.rpm ?? 0;
    // visual speed is scaled down so rotation stays readable at 60 fps
    angle.current += (rpm / 60) * Math.PI * 2 * dt * 0.08;
    if (rotor.current) rotor.current.rotation.z = angle.current;
  });
  return (
    <group position={[92, 7, -32]} {...hover}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <Cyl p={[0, 0, 0]} r={12} h={30} m={MAT.silver} />
        <Cyl p={[0, 15.5, 0]} r={9} h={2} m={MAT.blackGloss} />
        <Cyl p={[0, 0, 0]} r={12.05} h={6} m={MAT.blue} />
      </group>
      <group position={[0, 0, -18]} ref={rotor}>
        <Cyl p={[0, 0, 0]} r={1} h={10} m={MAT.pin} rot={[Math.PI / 2, 0, 0]} />
        <Cyl p={[0, 0, -4]} r={3.5} h={3} m={MAT.red} rot={[Math.PI / 2, 0, 0]} />
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0, -4]} rotation={[0, 0, (i * Math.PI * 2) / 3]} castShadow>
            <boxGeometry args={[3.5, 34, 0.8]} />
            <meshStandardMaterial color="#e2e2e2" roughness={0.5} transparent opacity={0.92} />
          </mesh>
        ))}
      </group>
      <Box p={[-4, 0, 16.5]} s={[1.5, 3, 1]} m={MAT.brass} />
      <Box p={[4, 0, 16.5]} s={[1.5, 3, 1]} m={MAT.brass} />
    </group>
  );
}

export function TestLamp() {
  const glass = useRef<THREE.MeshStandardMaterial>(null);
  const sprite = useRef<THREE.SpriteMaterial>(null);
  const hover = useHover({ name: 'Test lamp (relay load)', info: 'Wired between relay COM and NO: it lights when the relay is energised.', live: () => (picBoard()?.relay ? 'relay ENERGISED' : 'relay released') });
  useFrame(() => {
    const on = !!picBoard()?.relay;
    if (glass.current) glass.current.emissiveIntensity = on ? 2.2 : 0.02;
    if (sprite.current) sprite.current.opacity = on ? 0.85 : 0;
  });
  return (
    <group position={[160, -5, 78]} {...hover}>
      <Cyl p={[0, 2, 0]} r={9} h={4} m={MAT.black} />
      <Cyl p={[0, 7, 0]} r={5} h={6} m={MAT.silver} />
      <mesh position={[0, 16, 0]} castShadow>
        <sphereGeometry args={[8, 24, 16]} />
        <meshStandardMaterial ref={glass} color="#fff6d8" emissive="#ffcf5a" emissiveIntensity={0.02} transparent opacity={0.75} roughness={0.1} />
      </mesh>
      <sprite position={[0, 16, 0]} scale={[46, 46, 1]}>
        <spriteMaterial ref={sprite} map={glowTexture()} color="#ffcf5a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

// ------------------------------------------------------------- FRC cables

export function ribbonGeometry(curve: THREE.Curve<THREE.Vector3>, a0: THREE.Vector3, a1: THREE.Vector3, width: number, offset = 0, lift = 0) {
  const N = 72;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = a0.clone().lerp(a1, t);
    side.sub(tan.clone().multiplyScalar(side.dot(tan))).normalize();
    const normal = new THREE.Vector3().crossVectors(tan, side).normalize();
    const c = p.clone().add(side.clone().multiplyScalar(offset)).add(normal.multiplyScalar(lift));
    const l = c.clone().add(side.clone().multiplyScalar(-width / 2));
    const r = c.clone().add(side.clone().multiplyScalar(width / 2));
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const BOARD_CENTER: [number, number, number] = [-BASE.w / 2, 0, -BASE.h / 2];
