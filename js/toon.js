// Cel-shaded ("cartoon rendering") 3D characters built from primitive part lists.
// Specs (assets/toon/*.json) are designed by GPT 6.1 sol from the SD sheets / monster descriptions (tools/gen_toon.mjs)
// and assembled here: toon ramp shading, ink outlines (inverted hull), anime face decals, and bone animation by battle action.
import * as THREE from 'three';

/* ── shared look ── */
const ramp = (v) => { const d = new Uint8Array(v.length * 4); v.forEach((x, i) => d.set([x, x, x, 255], i * 4)); const t = new THREE.DataTexture(d, v.length, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
const RAMP = ramp([88, 170, 255]);           // scenery: classic 3-step cel
const RAMP_CHAR = ramp([118, 186, 232, 255]); // characters: softer, brighter anime shading
export const toonMat = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...o });
/** character material: anime cel ramp + a crisp rim light on the silhouette */
export const charMat = (color, o = {}) => {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP_CHAR, ...o });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
      'float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\n outgoingLight += vec3(1.0, 0.95, 0.88) * smoothstep(0.6, 0.76, rimF) * 0.3;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'sxsToonRim';
  return m;
};
/** ink outline: back faces pushed out along the direction from the part centre (no gaps at box corners), constant-ish pixel width */
export const OUTLINE = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(0x2a1b14) }, width: { value: 0.0024 } },
  vertexShader: 'uniform float width; void main(){ vec3 d = normalize(normalMatrix * normalize(position + vec3(1e-5))); vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xyz += d * width * clamp(-mv.z, 3.0, 80.0); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }',
  side: THREE.BackSide,
});

/* ── spec loading + which model a unit uses ── */
const SPECS = new Map();
export async function loadToon() {
  try {
    const base = new URL('../assets/toon/', import.meta.url);
    const ids = await (await fetch(new URL('index.json', base))).json();
    await Promise.all(ids.map(async (id) => { try { const r = await fetch(new URL(id + '.json', base)); if (r.ok) SPECS.set(id, await r.json()); } catch (e) { /* skip */ } }));
  } catch (e) { return; }
  window.dispatchEvent(new Event('sxs-art'));
}
export const toonSpec = (id) => SPECS.get(id) || null;
const BOSS_RE = [[/Storm Griffin/i, 'boss_griffin'], [/Flamoenix|Phoenix/i, 'boss_phoenix'], [/Yamata no Orochi/i, 'boss_orochi'], [/Primordial Loong/i, 'boss_loong'], [/Galactic Mecha/i, 'boss_mecha'], [/Yoldra/i, 'boss_yoldra'], [/Chaos Tyrant/i, 'boss_tyrant']];
/** unique legendary bosses first, then the shared monster model of the art kind */
export function toonIdForMob(en, slug) {
  const b = BOSS_RE.find(([re]) => re.test(en)); if (b && SPECS.has(b[1])) return b[1];
  return slug && SPECS.has('mob_' + slug) ? 'mob_' + slug : null;
}

/* ── hero skeleton (chibi, ~2 units tall incl. hair, faces +Z, +X = the model's LEFT) ── */
export const HERO_RIG = {
  root: { parent: null, p: [0, 0, 0] },
  hips: { parent: 'root', p: [0, 0.5, 0] },
  legL: { parent: 'hips', p: [0.12, 0, 0] }, legR: { parent: 'hips', p: [-0.12, 0, 0] },
  chest: { parent: 'hips', p: [0, 0.06, 0] },
  head: { parent: 'chest', p: [0, 0.42, 0] },
  armL: { parent: 'chest', p: [0.22, 0.34, 0] }, armR: { parent: 'chest', p: [-0.22, 0.34, 0] },
  handL: { parent: 'armL', p: [0.02, -0.34, 0.02] }, handR: { parent: 'armR', p: [-0.02, -0.34, 0.02] },
  back: { parent: 'chest', p: [0, 0.3, -0.14] },
};

/* ── geometry cache (all shapes centred on the origin) ── */
const GEO = new Map();
const geo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
const r2 = (v) => Math.round(v * 100) / 100;
function shapeGeo(part) {
  const s = part.s || [0.2, 0.2, 0.2];
  switch (part.shape) {
    case 'sphere': return [geo('sph', () => new THREE.SphereGeometry(1, 22, 16)), s];
    case 'half': return [geo('half', () => new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)), s];
    case 'box': return [geo('box', () => new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)), s];
    case 'cone': return [geo('cone', () => new THREE.ConeGeometry(1, 1, 18, 1)), [s[0], s[1], s[2] || s[0]]];
    case 'spike': return [geo('spike', () => new THREE.ConeGeometry(1, 1, 6, 1)), [s[0], s[1], s[2] || s[0]]];
    case 'pyramid': return [geo('pyr', () => new THREE.ConeGeometry(1, 1, 4, 1)), [s[0], s[1], s[2] || s[0]]];
    case 'disc': return [geo('disc', () => new THREE.CylinderGeometry(1, 1, 1, 24)), s];
    case 'cyl': { const k = `cyl${r2(s[0])}|${r2(s[2] == null ? s[0] : s[2])}`; return [geo(k, () => new THREE.CylinderGeometry(Math.max(0.005, s[0]), Math.max(0.005, s[2] == null ? s[0] : s[2]), 1, 16)), [1, s[1], 1]]; }
    case 'capsule': { const k = `cap${r2(s[0])}|${r2(s[1])}`; return [geo(k, () => new THREE.CapsuleGeometry(Math.max(0.01, s[0]), Math.max(0.01, s[1]), 6, 14)), [1, 1, 1]]; }
    case 'torus': { const k = `tor${r2(s[0])}|${r2(s[1])}`; return [geo(k, () => new THREE.TorusGeometry(Math.max(0.01, s[0]), Math.max(0.004, s[1]), 10, 28)), [1, 1, s[2] || 1]]; }
    case 'cape': { const arc = THREE.MathUtils.degToRad(s[2] || 120); const k = `cape${r2(s[0])}|${r2(s[1])}|${r2(arc)}`; return [geo(k, () => new THREE.CylinderGeometry(s[0], s[0] * 1.25, s[1], 16, 3, true, Math.PI - arc / 2, arc)), [1, 1, 1]]; }
    default: return [geo('sph', () => new THREE.SphereGeometry(1, 22, 16)), s];
  }
}

/* ── anime face decal (canvas), redrawn on mood changes ── */
function drawFace(c, eyes, mood, blink) {
  const W = 256, H = 160; c.clearRect(0, 0, W, H);
  const iris = eyes.color || '#4a6fd6', lash = '#2a1b14';
  const ex = [88, 168], ey = 76;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const closedArc = (x, up) => { c.strokeStyle = lash; c.lineWidth = 7; c.beginPath(); if (up) c.arc(x, ey + 10, 20, Math.PI * 1.15, Math.PI * 1.85); else c.arc(x, ey - 12, 20, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); };
  if (mood === 'down' || blink) { ex.forEach((x) => { c.strokeStyle = lash; c.lineWidth = 7; c.beginPath(); c.moveTo(x - 18, ey + 4); c.lineTo(x + 18, ey + 4); c.stroke(); }); }
  else if (mood === 'joy' || mood === 'cast') ex.forEach((x) => closedArc(x, true));
  else if (mood === 'hit' || mood === 'panic') {
    ex.forEach((x, i) => { c.strokeStyle = lash; c.lineWidth = 7; const d = i ? -1 : 1; c.beginPath(); c.moveTo(x - 16, ey - 14); c.lineTo(x + 6 * d, ey); c.lineTo(x - 16, ey + 14); if (i) { c.beginPath(); c.moveTo(x + 16, ey - 14); c.lineTo(x - 6, ey); c.lineTo(x + 16, ey + 14); } c.stroke(); });
  } else {
    // open anime eyes: big tall iris with a dark top, sparkle highlights, thick upper lash with a flick, thin lower lash, brows
    const rx = 19, ry = mood === 'focus' || mood === 'angry' ? 21 : 27;
    ex.forEach((x, i) => {
      const side = i ? 1 : -1; // outer corner direction
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, ey + 3, rx + 3, ry + 1, 0, 0, Math.PI * 2); c.fill();
      const g = c.createLinearGradient(0, ey - ry, 0, ey + ry); g.addColorStop(0, '#140f22'); g.addColorStop(0.35, iris); g.addColorStop(0.85, iris); g.addColorStop(1, '#f4f2ff');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, ey + 5, rx, ry, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(20,15,34,.55)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#16101f'; c.beginPath(); c.ellipse(x, ey + 7, rx * 0.42, ry * 0.46, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x - 7, ey - 7, 7, 9, -0.3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + 8, ey + 14, 3.8, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x + 9, ey - 4, 2.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = lash; c.lineWidth = 8; c.beginPath();
      if (mood === 'angry' || mood === 'focus') { c.moveTo(x + 24 * side, ey - ry - 6); c.lineTo(x - 20 * side, ey - ry + 4); }
      else { c.ellipse(x, ey + 3, rx + 4, ry + 3, 0, Math.PI * 1.06, Math.PI * 1.94); }
      c.stroke();
      if (mood !== 'angry' && mood !== 'focus') { c.lineWidth = 5; c.beginPath(); c.moveTo(x + (rx + 2) * side, ey - ry * 0.55); c.lineTo(x + (rx + 9) * side, ey - ry * 0.85); c.stroke(); }
      c.strokeStyle = 'rgba(42,27,20,.6)'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(x, ey + 4, rx + 1, ry + 2, 0, Math.PI * 0.25, Math.PI * 0.75); c.stroke();
      c.strokeStyle = 'rgba(42,27,20,.75)'; c.lineWidth = 4; c.beginPath();
      if (mood === 'angry' || mood === 'focus') { c.moveTo(x + 18 * side, ey - ry - 18); c.lineTo(x - 14 * side, ey - ry - 8); }
      else c.ellipse(x, ey - ry - 2, 16, 7, 0, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    });
  }
  // blush + mouth
  c.fillStyle = 'rgba(255,120,140,.35)'; c.beginPath(); c.ellipse(60, 112, 18, 8, 0, 0, Math.PI * 2); c.ellipse(196, 112, 18, 8, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#7a3a2a'; c.fillStyle = '#c85a5a'; c.lineWidth = 4;
  c.beginPath();
  if (mood === 'joy' || mood === 'cast') { c.arc(128, 112, 12, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill(); c.stroke(); }
  else if (mood === 'hit' || mood === 'panic' || mood === 'surprise') { c.ellipse(128, 118, 7, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
  else if (mood === 'angry' || mood === 'down') { c.moveTo(118, 122); c.quadraticCurveTo(128, 114, 138, 122); c.stroke(); }
  else { c.moveTo(120, 116); c.quadraticCurveTo(128, 122, 136, 116); c.stroke(); }
}

/* ── build a model from a spec ── */
const MIRROR_BONE = (b) => (b.endsWith('L') ? b.slice(0, -1) + 'R' : b.endsWith('R') ? b.slice(0, -1) + 'L' : b);
/** spec: { kind: 'hero'|'creature', palette: {key: '#hex'}, eyes, bones (creatures), parts, anim }
 *  opts: { recolor: { MAIN, LIGHT, DARK, ACCENT } }  → { root, bones, mats, face, kind, spec, h } */
export function buildModel(spec, opts = {}) {
  // outer root: placed / turned / scaled by the scene; bones.root: the animated pose root inside it
  const root = new THREE.Group(), bones = {}, pose = new THREE.Group();
  root.add(pose); pose.userData.rest = new THREE.Vector3();
  const rig = spec.kind === 'hero' ? HERO_RIG : Object.fromEntries((spec.bones || []).map((b) => [b.name, { parent: b.parent || 'root', p: b.p }]));
  bones.root = pose;
  const order = Object.keys(rig).filter((k) => k !== 'root');
  let guard = 0;
  while (order.length && guard++ < 400) {
    const k = order.shift(), b = rig[k], par = b.parent && b.parent !== k ? b.parent : 'root';
    if (!bones[par] && rig[par]) { order.push(k); continue; }
    const g = new THREE.Group(); g.position.fromArray(b.p || [0, 0, 0]); (bones[par] || pose).add(g); bones[k] = g; g.userData.rest = g.position.clone();
  }
  const pal = { ...(spec.palette || {}), ...(opts.recolor || {}) };
  const mats = new Map(), glowMats = new Map();
  const colorOf = (c) => { const v = pal[c] || pal[String(c || '').toUpperCase()] || c; return typeof v === 'string' && /^(#[0-9a-f]{3,8}$|hsl|rgb)/i.test(v) ? v : '#cccccc'; };
  const matFor = (c, glow, ds) => {
    const col = colorOf(c), key = col + (glow ? 'g' : '') + (ds ? 'd' : '');
    const M = glow ? glowMats : mats; let m = M.get(key);
    if (!m) { m = glow ? new THREE.MeshBasicMaterial({ color: col, toneMapped: false }) : charMat(col, ds ? { side: THREE.DoubleSide } : {}); M.set(key, m); }
    return m;
  };
  let face = null;
  const parts = [];
  for (const p of spec.parts || []) { parts.push(p); if (p.mirror) parts.push({ ...p, mirror: false, bone: MIRROR_BONE(p.bone), p: [-p.p[0], p.p[1], p.p[2]], r: [p.r[0], -p.r[1], -p.r[2]] }); }
  for (const p of parts) {
    const bone = bones[p.bone] || pose;
    const [g, sc] = shapeGeo(p);
    const ds = p.shape === 'cape';
    const mesh = new THREE.Mesh(g, matFor(p.c, p.glow, ds));
    mesh.position.fromArray(p.p || [0, 0, 0]);
    mesh.rotation.set(...(p.r || [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(d)));
    mesh.scale.fromArray(sc);
    mesh.castShadow = !p.glow;
    bone.add(mesh);
    // ink only on parts big enough to read: tiny studs, gems and thin trims would turn into black blots
    if (!g.boundingSphere) g.computeBoundingSphere();
    const size = g.boundingSphere.radius * Math.max(...sc.map(Math.abs));
    const thin = ['cyl', 'capsule', 'torus', 'cape'].includes(p.shape) ? false : Math.min(...sc.map(Math.abs)) < 0.02;
    if (p.outline !== false && !p.glow && !thin && size >= 0.05) { const o = new THREE.Mesh(g, OUTLINE); mesh.add(o); }
    if (p.face && !face) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const fg = new THREE.SphereGeometry(1.015, 24, 16, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.24);
      const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
      fm.renderOrder = 3; mesh.add(fm);
      face = { cv, tex, mood: '', blink: false, eyes: spec.eyes || {} };
      setMood({ face }, 'base');
    }
  }
  // height for HP bars / labels
  const box = new THREE.Box3().setFromObject(root); const h = Math.max(0.6, box.max.y);
  return { root, bones, mats: [...mats.values()], face, kind: spec.kind, spec, h, t0: Math.random() * 10 };
}
export function setMood(model, mood, blink = false) {
  const f = model.face; if (!f || (f.mood === mood && f.blink === blink)) return;
  f.mood = mood; f.blink = blink; drawFace(f.cv.getContext('2d'), f.eyes, mood, blink); f.tex.needsUpdate = true;
}
/** white flash on hit (k 0..1) */
export function flash(model, k) { for (const m of model.mats) m.emissive && m.emissive.setScalar(k * 0.55); }

/* ── animation ── */
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const env = (k, a, b) => ease((k - a) / (b - a));
const STATE_LEN = { attack: 0.55, skill: 0.75, hit: 0.4 };
export const stateLen = (st) => STATE_LEN[st] || 0.5;
function resetBones(m) { for (const k in m.bones) { const b = m.bones[k]; b.rotation.set(0, 0, 0); if (b.userData.rest) b.position.copy(b.userData.rest); } }
/** st: idle|move|attack|skill|hit, el: seconds in state, t: global time, o: { dead 0..1, style } */
export function animate(m, st, el, t, o = {}) {
  resetBones(m);
  const B = m.bones, T = t + m.t0;
  if (m.kind === 'hero') heroPose(B, st, el, T, o.style || 'sword');
  else creaturePose(m, st, el, T);
  // blink every few seconds
  if (m.face && m.face.mood !== 'down') { const bl = (T % 3.7) < 0.12; if (bl !== m.face.blink && (m.face.mood === 'base' || m.face.mood === 'focus')) setMood(m, m.face.mood, bl); }
  if (o.dead > 0) { const k = ease(o.dead); B.root.rotation.x = -1.45 * k; B.root.position.y = -0.05 * k; }
}
function heroPose(B, st, el, T, style) {
  const s = Math.sin, caster = style === 'staff' || style === 'book';
  // base stance: arms a little out, weapon arm forward
  B.armL.rotation.z = 0.22; B.armR.rotation.z = -0.22; B.armR.rotation.x = -0.35; B.armL.rotation.x = style === 'shield' || style === 'dual' ? -0.35 : -0.1;
  const breathe = s(T * 2.4) * 0.018;
  B.chest.position.y += breathe; B.head.rotation.z = s(T * 1.3) * 0.05; B.head.rotation.x = s(T * 2.4 + 1) * 0.03;
  B.armL.rotation.z += s(T * 2.4) * 0.04; B.armR.rotation.z -= s(T * 2.4) * 0.04;
  // secondary motion: weight shift, cape sway
  B.hips.rotation.z = s(T * 1.1) * 0.025; B.chest.rotation.z = -s(T * 1.1) * 0.02;
  B.back.rotation.x = 0.06 + s(T * 1.8) * 0.05; B.back.rotation.z = s(T * 1.3) * 0.04;
  if (st === 'move') {
    const w = s(el * 13);
    B.legL.rotation.x = w * 0.75; B.legR.rotation.x = -w * 0.75; B.armL.rotation.x += -w * 0.55; B.armR.rotation.x += w * 0.45;
    B.hips.position.y += Math.abs(s(el * 13)) * 0.07; B.chest.rotation.x = 0.16; B.head.rotation.x -= 0.08;
    B.back.rotation.x = 0.5 + s(el * 13) * 0.1; // cape flows behind
  } else if (st === 'attack') {
    const k = el / STATE_LEN.attack;
    if (style === 'dual') {
      const a = env(k, 0, 0.25) - env(k, 0.25, 0.45), b = env(k, 0.35, 0.6) - env(k, 0.6, 0.85);
      B.armR.rotation.x += -2.0 * a + 1.4 * env(k, 0.25, 0.45) * (1 - env(k, 0.6, 1));
      B.armL.rotation.x += -2.0 * b + 1.2 * env(k, 0.6, 0.85) * (1 - env(k, 0.85, 1));
      B.chest.rotation.y = 0.5 * a - 0.5 * b; B.root.position.z += 0.25 * s(Math.PI * Math.min(1, k));
    } else if (caster) {
      const up = env(k, 0, 0.35), thrust = env(k, 0.35, 0.55), back = env(k, 0.7, 1);
      B.armR.rotation.x += (-1.6 * up - 0.4 * thrust) * (1 - back); B.chest.rotation.x = (-0.12 * up + 0.2 * thrust) * (1 - back);
      if (style === 'book') B.armL.rotation.x += -1.2 * up * (1 - back);
    } else {
      const wind = env(k, 0, 0.32), strike = env(k, 0.32, 0.55), back = env(k, 0.7, 1);
      B.armR.rotation.x += (-2.5 * wind + 3.1 * strike) * (1 - back);
      B.chest.rotation.y = (0.45 * wind - 0.7 * strike) * (1 - back); B.chest.rotation.x = 0.18 * strike * (1 - back);
      B.root.position.z += 0.32 * strike * (1 - back); B.legR.rotation.x = -0.4 * strike * (1 - back); B.legL.rotation.x = 0.3 * strike * (1 - back);
      if (style === 'shield') B.armL.rotation.x += -0.4 * strike * (1 - back);
    }
  } else if (st === 'skill') {
    const k = el / STATE_LEN.skill, up = env(k, 0, 0.3), back = env(k, 0.75, 1);
    if (caster) {
      B.armR.rotation.x += -2.6 * up * (1 - back); B.armL.rotation.x += -2.2 * up * (1 - back); B.armL.rotation.z += 0.4 * up * (1 - back); B.armR.rotation.z -= 0.4 * up * (1 - back);
      B.chest.rotation.x = -0.22 * up * (1 - back); B.head.rotation.x -= 0.25 * up * (1 - back); B.root.position.y += 0.22 * s(Math.PI * Math.min(1, k));
    } else if (style === 'shield') {
      const bash = env(k, 0.25, 0.45);
      B.armL.rotation.x += (-1.4 * bash) * (1 - back); B.root.position.z += 0.45 * bash * (1 - back); B.chest.rotation.x = 0.2 * bash * (1 - back); B.armR.rotation.x += -1.0 * up * (1 - back);
    } else {
      // spin slash (warrior / duelist): turn once while the blades sweep
      B.root.rotation.y = Math.PI * 2 * ease(env(k, 0.15, 0.7)); B.armR.rotation.z -= 1.2 * up * (1 - back); B.armL.rotation.z += 1.0 * up * (1 - back);
      B.root.position.y += 0.25 * s(Math.PI * env(k, 0.1, 0.75));
    }
  } else if (st === 'hit') {
    const k = el / STATE_LEN.hit, a = s(Math.PI * Math.min(1, k));
    B.chest.rotation.x = -0.35 * a; B.head.rotation.x = -0.3 * a; B.root.position.z -= 0.18 * a; B.armL.rotation.x += 0.5 * a; B.armR.rotation.x += 0.5 * a; B.back.rotation.x += 0.4 * a;
  }
}
function creaturePose(m, st, el, T) {
  const A = (m.spec.anim || {}), B = m.bones, s = Math.sin;
  const osc = (list, tt, gain = 1) => { for (const o of list || []) { const b = B[o.bone]; if (!b || !'xyz'.includes(o.axis)) continue; b.rotation[o.axis] += (o.amp || 0) * gain * s(tt * (o.freq || 1) * Math.PI * 2 + (o.phase || 0)); } };
  const hov = A.hover || 0;
  B.root.position.y += hov + (hov ? s(T * 2) * 0.08 : 0);
  osc(A.idle, T);
  const body = B.body || B.root;
  body.position.y += s(T * 2.2) * 0.02;
  if (st === 'move') { osc(A.move, el, 1); B.root.position.y += Math.abs(s(el * 10)) * (hov ? 0.04 : 0.08); }
  else if (st === 'attack' || st === 'skill') {
    const len = STATE_LEN[st], k = el / len, wind = env(k, 0, 0.35), strike = env(k, 0.35, 0.55), back = env(k, 0.7, 1);
    for (const o of (st === 'skill' ? A.skill || A.attack : A.attack) || []) { const b = B[o.bone]; if (b) b.rotation[o.axis] += (o.amp || 0) * (-0.45 * wind + 1.2 * strike) * (1 - back); }
    B.root.position.z += (st === 'skill' ? 0.15 : 0.35) * strike * (1 - back);
    if (st === 'skill') { body.rotation.x += -0.28 * wind * (1 - back); B.root.position.y += 0.3 * s(Math.PI * Math.min(1, k)); }
  } else if (st === 'hit') {
    const a = s(Math.PI * Math.min(1, el / STATE_LEN.hit)); body.rotation.x += -0.25 * a; B.root.position.z -= 0.18 * a;
  }
}
