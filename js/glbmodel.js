// glTF models drawn like the code-built toon models (the character cel ramp + rim light and an ink outline).
// - Heroes (Higgsfield · Meshy multi-view → 3D from the user's own SD sheet turnarounds) are rigged: the SAME pose code
//   (toon.js heroPose) drives the glTF skeleton. heroPose writes rotations for a rig whose rest pose is identity in the
//   model frame; each rotation D (model frame) becomes parentRest⁻¹ · D · parentRest · restLocal on the real bone, so
//   composition down the chain matches the code-built rig, and the A-pose arms are first turned toward hanging down.
// - Monsters and bosses (original concept images → Tripo image-to-3D, decimated and Draco-compressed in Blender) are static
//   meshes moved by toon.js creaturePose through a root / body pair.
// Models load on demand: only the ones a fight shows are fetched (assets/models/index.json lists what exists).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { DRACOLoader } from '../vendor/DRACOLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';
import { charMat } from './toon.js';

/** rig bone → glTF bone name (Mixamo-style skeleton from the Meshy rig) */
const MAP = { hips: 'Hips', chest: 'Spine', head: 'Head', armL: 'LeftArm', armR: 'RightArm', handL: 'LeftHand', handR: 'RightHand', legL: 'LeftUpLeg', legR: 'RightUpLeg' };
/** per-model tuning: how far the A-pose arms are lowered (0 keeps the A-pose, 1 hangs them straight down) and how much of
 *  the rig's arm motion they take. Generated meshes fuse long hair with the arms (the knight's braid, the casters' long
 *  hair), so big arm turns drag the hair along: by default the arms stay near the A-pose and swing at half strength.
 *  The short-haired warrior moves its arms more freely. The sorcerer's and the sage's rigs put one arm chain out along the
 *  book / staff (shoulder line ~42° off the hips), so their arms keep the rest pose and only sway a little. */
const TUNE_DEFAULT = { armCorr: 0.3, armGain: 0.5 };
// after the Blender pass (tools/blender_heroes.py: the far part of the knight's braid and the warrior's hair moved off the arm
// bones; the knight's braid is still fused with its upper arm, so its arms only swing a little more; the
// duelist's arm weights were clean already) those three move their arms almost fully
const TUNE = { knight: { armCorr: 0.3, armGain: 0.6 }, warrior: { armCorr: 0.85, armGain: 0.9 }, duelist: { armCorr: 0.8, armGain: 0.9 }, sorcerer: { armCorr: 0, armGain: 0.3 }, sage: { armCorr: 0, armGain: 0.3 } };
const DOWN = new THREE.Vector3(0, -1, 0), ID = new THREE.Quaternion();
const H_TARGET = 1.78; // the code-built knight stands 1.76 tall (incl. hair)
const CREATURE_SIZE = 1.3; // a monster's largest extent before the scene's per-kind scale (normal 0.88, elite 1.12, boss 1.6+)

const base = new URL('../assets/models/', import.meta.url);
let loader = null, index = null;
const GLB = new Map(), pending = new Map();
function getLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader(); draco.setDecoderPath(new URL('../vendor/draco/', import.meta.url).href); draco.setDecoderConfig({ type: 'wasm' });
  loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  return loader;
}
/** the list of models that exist (heroes by design name, monsters as mob_<art>, bosses as boss_<name>) */
export async function loadGlb() {
  if (index) return index;
  try { index = new Set(await (await fetch(new URL('index.json', base))).json()); } catch (e) { index = new Set(); }
  return index;
}
export const hasGlb = (id) => GLB.has(id);
/** fetch the models a fight needs; resolves true when something new arrived (the scene then rebuilds its units) */
export async function needGlb(ids) {
  const idx = await loadGlb();
  const want = [...new Set(ids)].filter((id) => id && idx.has(id) && !GLB.has(id));
  if (!want.length) return false;
  await Promise.all(want.map((id) => {
    if (!pending.has(id)) pending.set(id, getLoader().loadAsync(new URL(id + '.glb', base).href).then((g) => { GLB.set(id, g); }).catch(() => {}));
    return pending.get(id);
  }));
  return want.some((id) => GLB.has(id));
}

/** ink outline for glTF meshes: back faces pushed out along the normal in view space, about the pixel width of toon.js OUTLINE */
export const OUTLINE_G = new THREE.MeshBasicMaterial({ color: 0x2a1b14, side: THREE.BackSide });
OUTLINE_G.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_SKINNING
  vec3 olN = objectNormal;
  #else
  vec3 olN = normal;
  #endif
  { vec3 dn = normalize( normalMatrix * olN ); mvPosition.xyz += dn * 0.0024 * clamp( -mvPosition.z, 3.0, 80.0 ); gl_Position = projectionMatrix * mvPosition; }`);
};
OUTLINE_G.customProgramCacheKey = () => 'sxsGlbOutline';

/** toon materials + outline on every mesh; returns the materials (for the hit flash) */
function toonify(scene, tint) {
  const mats = [], meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const m = charMat(tint || 0xffffff, { map: o.material.map || null, side: THREE.DoubleSide });
    o.material = m; mats.push(m); o.castShadow = true; o.frustumCulled = false;
    const ol = o.clone(); ol.material = OUTLINE_G; ol.castShadow = false; o.parent.add(ol);
  }
  return mats;
}

/** a rigged hero → a model with the toon.js interface: { root, bones, mats, face, kind, spec, h, t0, apply } */
export function buildGlbModel(design, opt = {}) {
  const gltf = GLB.get(design); if (!gltf) return null;
  const root = new THREE.Group(), pose = new THREE.Group(), holder = new THREE.Group();
  root.add(pose); pose.add(holder); pose.userData.rest = new THREE.Vector3();
  const scene = cloneSkinned(gltf.scene); holder.add(scene);
  const skinned = []; scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const mats = toonify(scene);
  // bones by name; the model faces +Z with its LEFT on +X like the code-built rig (turned half a circle if not)
  const byName = {}; scene.traverse((o) => { if (o.isBone) byName[o.name] = o; });
  pose.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  if (byName.LeftArm && byName.RightArm && wp(byName.LeftArm).x < wp(byName.RightArm).x) { holder.rotation.y = Math.PI; pose.updateMatrixWorld(true); }
  // scale to the heroes' height, feet on the ground
  const box = new THREE.Box3(); for (const o of skinned) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  const s = H_TARGET / Math.max(0.1, box.max.y - box.min.y);
  holder.scale.setScalar(s); holder.position.y = -box.min.y * s; pose.updateMatrixWorld(true);
  // rest data in the rig frame (the pose group at identity)
  const bones = { root: pose }, links = [], T = { ...TUNE_DEFAULT, ...(TUNE[design] || {}) };
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

/** a static monster / boss → the toon.js interface with a root / body pair for creaturePose (bob, hop, lunge, recoil, fall);
 *  tint: a light colour multiplied in so monsters of one art kind differ a little */
export function buildGlbCreature(id, opt = {}) {
  const gltf = GLB.get(id); if (!gltf) return null;
  const root = new THREE.Group(), pose = new THREE.Group(), body = new THREE.Group(), holder = new THREE.Group();
  root.add(pose); pose.add(body); body.add(holder);
  pose.userData.rest = new THREE.Vector3(); body.userData.rest = new THREE.Vector3();
  const scene = gltf.scene.clone(true); holder.add(scene);
  const mats = toonify(scene, opt.tint);
  pose.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), sz = box.getSize(new THREE.Vector3());
  // a boss fills its 4×4 / 5×5 body (opt.size = the extent wanted before the scene's scale), others share one size
  const s = (opt.size || CREATURE_SIZE) / Math.max(0.1, opt.size ? Math.max(sz.x, sz.z) : Math.max(sz.y, sz.x * 0.9, sz.z * 0.9));
  holder.scale.setScalar(s); holder.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  return { root, bones: { root: pose, body }, mats, face: null, kind: 'creature', spec: { kind: 'creature', anim: {}, glb: id }, h: sz.y * s, t0: Math.random() * 10 };
}

/** a scenery model (assets/models/<name>.glb, not in the unit index): the stone colosseum */
export async function loadEnv(name) {
  try { return await getLoader().loadAsync(new URL(name + '.glb', base).href); } catch (e) { return null; }
}
