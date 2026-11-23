// The wooden case the Sigma trainers come in (AM kit COM101, line-code kit COM122N): a box with a
// black frame around the acrylic cover, and the lid standing open behind it.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useHover } from '../three/interactive.tsx';

export interface CaseDims {
  /** outside of the box */
  box: { w: number; d: number; h: number };
  /** height of the printed panel above the desk */
  panel: number;
  /** acrylic cover: the frame fills the rest of the top */
  acrylic: { w: number; d: number };
  lid: { h: number; open: number };
}

/** Wood with a darker grain. */
export function woodTexture(base = '#d6b27c', grain = '120, 82, 40') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 128;
    g.strokeStyle = `rgba(${grain}, ${0.05 + Math.random() * 0.14})`;
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

const FRAME = new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6 });
const DARK = new THREE.MeshStandardMaterial({ color: '#0f1011', roughness: 0.9 });

/**
 * Box, top frame and open lid. Static: put it inside a StaticBatch. `tone` is the wood colour and
 * `inside` the colour of the lid's inner face (defaults to the same wood).
 */
export function KitCase({ dims, name, info, tone = '#d2ac74', base, inside }: { dims: CaseDims; name: string; info: string; tone?: string; base?: string; inside?: string }) {
  const { box: { w, d, h }, panel, acrylic, lid } = dims;
  const [wood, woodIn, tex] = useMemo(() => {
    const t = woodTexture(base);
    return [new THREE.MeshStandardMaterial({ color: tone, roughness: 0.7, map: t }), new THREE.MeshStandardMaterial({ color: inside ?? tone, roughness: 0.8, map: t }), t] as const;
  }, [tone, base, inside]);
  useEffect(() => () => { tex.dispose(); wood.dispose(); woodIn.dispose(); }, [tex, wood, woodIn]);
  const fw = (w - acrylic.w) / 2, fd = (d - acrylic.d) / 2, fh = h - panel;
  const hover = useHover({ name, info });
  return (
    <group {...hover}>
      <mesh position={[0, (panel - 2) / 2, 0]} castShadow receiveShadow material={wood}><boxGeometry args={[w, panel - 2, d]} /></mesh>
      {/* black top frame around the cover */}
      <mesh position={[0, panel + fh / 2, -(d - fd) / 2]} castShadow material={FRAME}><boxGeometry args={[w, fh, fd]} /></mesh>
      <mesh position={[0, panel + fh / 2, (d - fd) / 2]} castShadow material={FRAME}><boxGeometry args={[w, fh, fd]} /></mesh>
      <mesh position={[-(w - fw) / 2, panel + fh / 2, 0]} castShadow material={FRAME}><boxGeometry args={[fw, fh, acrylic.d]} /></mesh>
      <mesh position={[(w - fw) / 2, panel + fh / 2, 0]} castShadow material={FRAME}><boxGeometry args={[fw, fh, acrylic.d]} /></mesh>
      <mesh position={[0, panel - 1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={DARK}><planeGeometry args={[w - 2, d - 2]} /></mesh>
      {/* lid, hinged along the back edge and leaning back */}
      <group position={[0, h, -d / 2]} rotation={[-lid.open, 0, 0]}>
        <mesh position={[0, lid.h - 3, d / 2]} castShadow material={wood}><boxGeometry args={[w, 6, d]} /></mesh>
        <mesh position={[0, lid.h / 2, 3]} castShadow material={wood}><boxGeometry args={[w, lid.h, 6]} /></mesh>
        <mesh position={[0, lid.h / 2, d - 3]} castShadow material={wood}><boxGeometry args={[w, lid.h, 6]} /></mesh>
        <mesh position={[-w / 2 + 3, lid.h / 2, d / 2]} castShadow material={wood}><boxGeometry args={[6, lid.h, d - 12]} /></mesh>
        <mesh position={[w / 2 - 3, lid.h / 2, d / 2]} castShadow material={wood}><boxGeometry args={[6, lid.h, d - 12]} /></mesh>
        <mesh position={[0, lid.h - 6.2, d / 2]} rotation={[Math.PI / 2, 0, 0]} material={woodIn}><planeGeometry args={[w - 12, d - 12]} /></mesh>
      </group>
    </group>
  );
}
