// Rigged glTF heroes (Higgsfield · Meshy multi-view → 3D, made from the user's own SD sheet turnaround) drawn like the
// code-built toon models: the character cel ramp + rim light, an ink outline that follows the skin, and the SAME pose code
// (toon.js heroPose) driving the glTF skeleton. heroPose writes rotations for a rig whose rest pose is identity in the
// model frame; here each rotation D (model frame) becomes parentRest⁻¹ · D · parentRest · restLocal on the real bone,
// so composition down the chain matches the code-built rig, and the A-pose arms are first turned to hang down.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';
import { charMat } from './toon.js';

/** hero design → model file in assets/models (one so far: the knight pilot) */
const FILES = { knight: 'knight.glb' };
/** rig bone → glTF bone name (Mixamo-style skeleton from the Meshy rig) */
const MAP = { hips: 'Hips', chest: 'Spine', head: 'Head', armL: 'LeftArm', armR: 'RightArm', handL: 'LeftHand', handR: 'RightHand', legL: 'LeftUpLeg', legR: 'RightUpLeg' };
/** per-model tuning: how far the A-pose arms are lowered (0 keeps the A-pose, 1 hangs them straight down) and how much of
 *  the rig's arm motion they take. The knight's braid is fused with its right arm in the generated mesh, so big arm turns
 *  drag the braid along; its arms stay near the A-pose and swing at half strength. */
const TUNE = { knight: { armCorr: 0.3, armGain: 0.5 } };
const DOWN = new THREE.Vector3(0, -1, 0), ID = new THREE.Quaternion();
const H_TARGET = 1.78; // the code-built knight stands 1.76 tall (incl. hair)
const GLB = new Map();

export async function loadGlb() {
  const base = new URL('../assets/models/', import.meta.url), loader = new GLTFLoader();
  await Promise.all(Object.entries(FILES).map(async ([d, f]) => {
    try { GLB.set(d, await loader.loadAsync(new URL(f, base).href)); } catch (e) { /* keep the code-built model */ }
  }));
}
export const hasGlb = (design) => GLB.has(design);

/** ink outline for skinned meshes: back faces pushed out in view space, about the same pixel width as toon.js OUTLINE */
const OUTLINE_SK = new THREE.MeshBasicMaterial({ color: 0x2a1b14, side: THREE.BackSide });
OUTLINE_SK.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_SKINNING
  { vec3 dn = normalize( normalMatrix * objectNormal ); mvPosition.xyz += dn * 0.0024 * clamp( -mvPosition.z, 3.0, 80.0 ); gl_Position = projectionMatrix * mvPosition; }
  #endif`);
};
OUTLINE_SK.customProgramCacheKey = () => 'sxsSkinOutline';

/** → a model with the toon.js interface: { root, bones, mats, face, kind, spec, h, t0, apply } */
export function buildGlbModel(design, opt = {}) {
  const gltf = GLB.get(design); if (!gltf) return null;
  const root = new THREE.Group(), pose = new THREE.Group(), holder = new THREE.Group();
  root.add(pose); pose.add(holder); pose.userData.rest = new THREE.Vector3();
  const scene = cloneSkinned(gltf.scene); holder.add(scene);
  const mats = [];
  const skinned = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = charMat(0xffffff, { map: o.material.map || null, side: THREE.DoubleSide });
    o.material = m; mats.push(m); o.castShadow = true; o.frustumCulled = false;
    if (o.isSkinnedMesh) skinned.push(o);
  });
  for (const o of skinned) { const ol = o.clone(); ol.material = OUTLINE_SK; ol.castShadow = false; o.parent.add(ol); }
  // bones by name; the model faces +Z with its LEFT on +X like the code-built rig (turned half a circle if not)
  const byName = {}; scene.traverse((o) => { if (o.isBone) byName[o.name] = o; });
  pose.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  if (byName.LeftArm && byName.RightArm && wp(byName.LeftArm).x < wp(byName.RightArm).x) { holder.rotation.y = Math.PI; pose.updateMatrixWorld(true); }
  // scale to the heroes' height, feet on the ground
  let box = new THREE.Box3(); for (const o of skinned) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  const s = H_TARGET / Math.max(0.1, box.max.y - box.min.y);
  holder.scale.setScalar(s); holder.position.y = -box.min.y * s; pose.updateMatrixWorld(true);
  // rest data in the rig frame (the pose group at identity)
  const bones = { root: pose }, links = [], T = { armCorr: 1, armGain: 1, ...(TUNE[design] || {}) };
  for (const [k, name] of Object.entries(MAP)) {
    const b = byName[name]; const proxy = new THREE.Object3D(); proxy.userData.rest = new THREE.Vector3(); bones[k] = proxy;
    if (!b) continue;
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()), ps = b.parent.getWorldScale(new THREE.Vector3()).x;
    const arm = /^(arm|hand)[LR]$/.test(k);
    const link = { k, b, proxy, pw, pwInv: pw.clone().invert(), ps, rq: b.quaternion.clone(), rp: b.position.clone(), corr: null, gain: arm ? T.armGain : 1 };
    // A-pose arms → toward hanging down (the code-built rig's arms rest straight down)
    if (k === 'armL' || k === 'armR') {
      const child = b.children.find((c) => c.isBone);
      if (child && !opt.raw && T.armCorr > 0) { const dir = wp(child).sub(wp(b)).normalize(); link.corr = new THREE.Quaternion().slerpQuaternions(ID, new THREE.Quaternion().setFromUnitVectors(dir, DOWN), T.armCorr); }
    }
    links.push(link);
  }
  bones.back = bones.back || Object.assign(new THREE.Object3D(), { userData: { rest: new THREE.Vector3() } }); // no cape bone: pose code writes here harmlessly
  const q = new THREE.Quaternion(), qe = new THREE.Quaternion(), v = new THREE.Vector3();
  /** after toon.js animate() has posed the proxies: write them onto the glTF bones */
  const apply = () => {
    for (const L of links) {
      qe.setFromEuler(L.proxy.rotation);
      if (L.gain !== 1) qe.slerpQuaternions(ID, qe.clone(), L.gain);
      if (L.corr) qe.multiply(L.corr);
      q.copy(L.pwInv).multiply(qe).multiply(L.pw);
      L.b.quaternion.copy(q).multiply(L.rq);
      v.copy(L.proxy.position).applyQuaternion(L.pwInv).divideScalar(L.ps || 1);
      L.b.position.copy(L.rp).add(v);
    }
  };
  if (!opt.raw) apply();
  return { root, bones, mats, face: null, kind: 'hero', spec: { kind: 'hero', glb: design }, h: H_TARGET, t0: Math.random() * 10, apply };
}
