// Performance mode for the 3D lab (toggled from the lab toolbar, persisted in the lab store).
//
// Every mesh costs one draw call per frame (two with shadows), and the board alone has ~700
// of them. With performance mode on:
//  - <StaticBatch> merges the board's static parts into one mesh per material, so the GPU gets
//    a few dozen draw calls instead of hundreds. The original meshes stay in the scene, hidden:
//    three.js still ray-casts hidden objects, so their hover tooltips keep working.
//  - <PerfRenderer> draws the shadow map once and refreshes it only when something on the
//    bench changes.
//  - BoardScene leaves out resistors, capacitors and diodes; LabView renders at 1x density.

import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useBench } from '../app/bench.ts';
import { useLab } from '../app/store.ts';

const shadowHook: { fn: (() => void) | null } = { fn: null };
/** Ask for one shadow-map redraw (performance mode draws shadows only on request). */
export const refreshShadows = () => shadowHook.fn?.();

// ------------------------------------------------------------- batching
function matKey(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial;
  return [
    m.type, s.color?.getHexString() ?? '', s.roughness ?? '', s.metalness ?? '', s.map?.uuid ?? '',
    s.emissive?.getHexString() ?? '', s.emissiveIntensity ?? '', s.flatShading ?? '',
    m.transparent, m.opacity, m.side, m.toneMapped, m.depthWrite, m.alphaTest,
  ].join('|');
}

/** Copy of `geo` reduced to position / normal / uv and transformed by `m`. */
function prepared(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  g.setAttribute('position', pos.clone());
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (nrm) g.setAttribute('normal', nrm.clone());
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  g.setAttribute('uv', uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (geo.index) g.setIndex(geo.index.clone());
  if (!nrm) g.computeVertexNormals();
  g.applyMatrix4(m);
  return g;
}

/** Ancestors up to `root` all visible (the mesh is actually drawn today). */
function shown(o: THREE.Object3D, root: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

const noRaycast = () => {};

/**
 * Merges every visible mesh under `root` into one mesh per material (and shadow flags),
 * hides the originals and returns a function that undoes it.
 */
function batchStatic(root: THREE.Object3D, tagged: boolean): () => void {
  root.updateWorldMatrix(true, true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const hidden: THREE.Mesh[] = [];
  const inst = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.batched || (tagged && !mesh.userData.batch) || !shown(mesh, root)) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const mats: THREE.Matrix4[] = [];
    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, inst); mats.push(new THREE.Matrix4().multiplyMatrices(rel, inst)); }
    else mats.push(rel);
    if (mats.some((x) => x.determinant() <= 0)) return; // mirrored / degenerate: leave it as it is
    const mat = mesh.material as THREE.Material;
    const key = `${matKey(mat)}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: mesh.castShadow, receive: mesh.receiveShadow, geos: [] }));
    for (const x of mats) b.geos.push(prepared(mesh.geometry, x));
    hidden.push(mesh);
  });

  const added: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const allIndexed = b.geos.every((g) => g.index);
    const geos = allIndexed ? b.geos : b.geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.raycast = noRaycast; // the hidden originals keep handling hover and clicks
    m.matrixAutoUpdate = false;
    m.userData.batched = true;
    m.name = 'static-batch';
    root.add(m);
    added.push(m);
  }
  for (const h of hidden) h.visible = false;
  return () => {
    for (const m of added) { root.remove(m); m.geometry.dispose(); }
    for (const h of hidden) h.visible = true;
  };
}

/**
 * Children are merged into a few draw calls while performance mode is on; they must not move.
 * `tagged`: only meshes marked with userData.batch (the fixed bodies of interactive parts) are merged.
 */
export function StaticBatch({ children, tagged = false }: { children: ReactNode; tagged?: boolean }) {
  const perf = useLab((s) => s.perfMode);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const root = ref.current;
    if (!perf || !root) return;
    const undo = batchStatic(root, tagged);
    refreshShadows();
    return () => { undo(); refreshShadows(); };
  }, [perf, tagged]);
  return <group ref={ref}>{children}</group>;
}

// ------------------------------------------------------------- rendering
/**
 * Static shadows while performance mode is on: the shadow map is drawn once and redrawn only
 * when something on the bench changes. (Frames are still rendered continuously: rendering only
 * on change made the frame rate uneven.)
 */
export function PerfRenderer() {
  const perf = useLab((s) => s.perfMode);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const sm = gl.shadowMap;
    if (!perf) { sm.autoUpdate = true; return; }
    sm.autoUpdate = false;
    sm.needsUpdate = true;
    shadowHook.fn = () => { sm.needsUpdate = true; };
    const offBench = useBench.subscribe(() => { sm.needsUpdate = true; }); // plugs, cables, held buttons
    const offLab = useLab.subscribe((s, prev) => { if (s.boardCfg !== prev.boardCfg) sm.needsUpdate = true; }); // DIP levers
    // textures and late-mounting parts: redraw the shadows once things have settled
    const timers = [300, 1500].map((ms) => setTimeout(() => { sm.needsUpdate = true; }, ms));
    return () => {
      offBench(); offLab();
      timers.forEach(clearTimeout);
      shadowHook.fn = null;
      sm.autoUpdate = true;
    };
  }, [perf, gl]);

  useFrame(() => {
    // the carried plug and its cable move every frame
    if (perf && useBench.getState().carrying) gl.shadowMap.needsUpdate = true;
  });
  return null;
}
