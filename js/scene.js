// 3D diorama: a floating forest island, a Claude-Code-style terminal monolith, and paper standees that replay a fight.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { HeroSprite, SheetSprite, sheetSpriteFor, sheetAnimLen, drawMob, drawPet, EL, mobArtSlug, mobPalette, petArtSlug, petPalette } from './sprites.js';
import { sheet, sheetImg, designOf } from './sheets.js';
import { buildModel, animate as animToon, setMood, flash as flashToon, stateLen as toonLen, toonSpec, toonIdForMob, toonMat, OUTLINE } from './toon.js';

/* class effects from the SD sheets (index into each sheet's 4 effect pictures) by how a skill is used */
const FXU = {
  warrior: { melee: 0, aoe: 2, dash: 1, finish: 3 },                         // 검격 · 돌진 · 타격 · 피니시
  duelist: { melee: 1, aoe: 1, dash: 0, trail: 2, finish: 3 },               // 질주 베기 · 쌍검 연속 베기 · 가속 궤적 · 피니시 임팩트
  knight: { melee: 3, aoe: 3, dash: 2, guard: 0, buff: 1, finish: 3 },       // 방패 가드 · 신성 장벽 · 방패 돌진 · 빛의 참격
  mage: { proj: 0, circle: 1, chant: 2, aoe: 3, finish: 3 },                 // 마법 화살 · 마법진 · 별빛 시전 · 마법 폭발
  sorcerer: { melee: 0, circle: 1, proj: 2, aoe: 3, finish: 3 },             // 화염 · 마법진 · 투사체 · 폭발
  sage: { heal: 0, circle: 1, bless: 2, aoe: 3, melee: 3, finish: 3 },       // 치유의 빛 · 지원 진형 · 축복 · 회복의 파동
};
import { MOB, PET } from './engine.js';
import { hasGlb, buildGlbModel } from './glbmodel.js';
import { ST_SHORT, stOrder } from './status.js';

/* battlefield grounds: board tiles, island top, foliage tint, sky, fog and light */
const GROUNDS = {
  forest: { ko: '숲 섬', tile: [0xa7d77a, 0x9bcf6f], grass: 0x86c45c, leaf: null, sky: [0x3f8fe0, 0xa9dbf3, 0xffedcc], fog: 0xd5ecf2, hemi: [0xe6f6ff, 0x6f9050, 1.15], sun: [0xfff1d6, 2.3], exp: 1.08 },
  moon: { ko: '달밤 숲', tile: [0x5d7f6a, 0x557662], grass: 0x40604f, leaf: [0x2e5a4a, 0.55], sky: [0x0a1430, 0x2b3c6b, 0x5a4a7a], fog: 0x26345a, hemi: [0x9fb4ff, 0x1d2a2a, 0.8], sun: [0xc8d6ff, 1.25], exp: 1.05 },
  duel: { ko: '결투장 (게임풍)', tile: [0xdc9f63, 0xcb8c53], grass: 0xb98452, leaf: [0xa6a457, 0.35], sky: [0x6aa6e0, 0xf2dcb4, 0xffe8c4], fog: 0xf0dcbc, hemi: [0xfff3e0, 0x9a7048, 1.12], sun: [0xfff2d8, 2.35], exp: 1.03, sand: 1 },
  desert: { ko: '사막 투기장', tile: [0xe4b47c, 0xd9a66e], grass: 0xd8b07a, leaf: [0x9aa04a, 0.45], sky: [0x4f95d6, 0xf3d7a8, 0xffe4b8], fog: 0xf1dcb8, hemi: [0xfff1d8, 0xa07a50, 1.1], sun: [0xfff0cc, 2.6], exp: 1.05 },
  snow: { ko: '설원', tile: [0xf1f6fc, 0xe3ecf6], grass: 0xf3f7fc, leaf: [0xdfe9f2, 0.55], sky: [0x7aa6d8, 0xdbe8f5, 0xf4f8ff], fog: 0xe6eef7, hemi: [0xf4f8ff, 0x9fb2c8, 1.15], sun: [0xffffff, 1.9], exp: 0.98 },
  lava: { ko: '용암 지대', tile: [0x5a463f, 0x4d3c36], grass: 0x3e2e29, leaf: [0x3a2a24, 0.7], sky: [0x2a0e0a, 0x8a3a1c, 0xff8a3c], fog: 0x5a2a1a, hemi: [0xffb08a, 0x401a10, 0.95], sun: [0xffb070, 2.0], exp: 1.1 },
  stone: { ko: '석조 정원', tile: [0xc4c2b8, 0xb7b5ab], grass: 0x8fae74, leaf: [0x6f9a62, 0.25], sky: [0x6f9fd0, 0xc9dde8, 0xf0e6d6], fog: 0xd9e3e6, hemi: [0xeef4f8, 0x7c8a70, 1.1], sun: [0xfff4e0, 2.1], exp: 1.05 },
};
export const GROUND_LIST = Object.entries(GROUNDS).map(([k, g]) => [k, g.ko]);

const T = 1.2;                       // world size of one grid cell
const wx = (gy) => (gy - 10) * T;    // grid row  → world x (team A on the left)
const wz = (gx) => (gx - 10) * T;    // grid col  → world z
// a unit's world position: 2×2 monsters are anchored on their low corner, so their centre is half a cell over
// a body's centre sits half a cell off its anchor for even sizes (2×2 covers 0..1, 4×4 covers -1..2)
const bodyOff = (u) => ((u.m.sz || 1) % 2 ? 0 : 0.5);
const ux = (u, gy) => wx(gy + bodyOff(u));
const uz = (u, gx) => wz(gx + bodyOff(u));
const TEAM = [0x4d8dff, 0xff5d5d];
// summoned creatures: stone spirit, little treant, flame wolf, swamp newt, totem, mirror clone
const SUM_HUE = { golem: 32, plant: 104, wolf: 14, frog: 188, relic: 44, doll: 268 };
const MONO = '"JetBrains Mono","D2Coding",Consolas,"Malgun Gothic",monospace';
const SANS = '"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

/* ───────── terminal screen ───────── */
class Terminal {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = 1024; this.canvas.height = 640;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.lines = []; this.status = null; this.big = null; this.dirty = true; this.spin = 0;
  }
  clear() { this.lines = []; this.dirty = true; }
  line(text, color = '#d8d4c8') { this.lines.push({ text, color }); if (this.lines.length > 60) this.lines.shift(); this.dirty = true; }
  setStatus(s) { this.status = s; this.dirty = true; }
  setBig(b) { this.big = b; this.dirty = true; }
  draw(t) {
    const sp = Math.floor(t * 8);
    if (!this.dirty && !(this.status && sp !== this.spin)) return;
    this.spin = sp; this.dirty = false;
    const c = this.canvas.getContext('2d'), W = 1024, H = 640;
    c.fillStyle = '#191817'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#242321'; c.fillRect(0, 0, W, 46);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(28 + i * 26, 23, 8, 0, 7); c.fill(); });
    c.font = `20px ${MONO}`; c.fillStyle = '#8f8b80'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText('claude — sxs-battle-sim', W / 2, 24); c.textAlign = 'left';
    // welcome box
    c.strokeStyle = '#d97757'; c.lineWidth = 2; c.beginPath(); c.roundRect(24, 62, this.big ? 600 : 976, 74, 10); c.stroke();
    c.font = `bold 26px ${MONO}`; c.fillStyle = '#d97757'; c.fillText('✻', 44, 100);
    c.fillStyle = '#f0eee6'; c.fillText('Claude Code', 80, 88);
    c.font = `19px ${MONO}`; c.fillStyle = '#9b978b'; c.fillText('소드 x 스태프 전투 시뮬레이터 · /simulate', 80, 116);
    // log
    const lh = 31, max = Math.floor((H - 168 - (this.status ? 40 : 0)) / lh);
    const show = this.lines.slice(-max);
    c.font = `22px ${MONO}`;
    show.forEach((l, i) => { c.fillStyle = l.color; c.fillText(l.text.length > (this.big ? 44 : 74) ? l.text.slice(0, this.big ? 43 : 73) + '…' : l.text, 30, 168 + i * lh); });
    if (this.status) {
      const g = ['·', '✢', '✳', '✶', '✻', '✽'][sp % 6];
      c.fillStyle = '#d97757'; c.font = `bold 24px ${MONO}`; c.fillText(g, 30, H - 30);
      c.font = `22px ${MONO}`; c.fillText(this.status, 62, H - 30);
    }
    if (this.big) {
      const x = 648, y = 62, w = 352, h = 300;
      c.fillStyle = '#22211f'; c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill();
      c.strokeStyle = '#3a3835'; c.lineWidth = 2; c.stroke();
      c.textAlign = 'center';
      c.font = `22px ${MONO}`; c.fillStyle = '#9b978b'; c.fillText(this.big.label || '승리 확률', x + w / 2, y + 40);
      c.font = `bold 104px ${MONO}`; c.fillStyle = this.big.color || '#d97757'; c.fillText(this.big.text, x + w / 2, y + 128);
      c.fillStyle = '#34322f'; c.beginPath(); c.roundRect(x + 30, y + 196, w - 60, 16, 8); c.fill();
      c.fillStyle = this.big.color || '#d97757'; c.beginPath(); c.roundRect(x + 30, y + 196, Math.max(16, (w - 60) * (this.big.frac || 0)), 16, 8); c.fill();
      c.font = `20px ${MONO}`; c.fillStyle = '#d8d4c8'; c.fillText(this.big.sub || '', x + w / 2, y + 248);
      c.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
  }
}

/* ───────── small canvas-texture helpers ───────── */
function textTexture(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return { cv, tex, ctx: cv.getContext('2d') }; }
function softDot(col = '#fff') { const { cv, tex, ctx } = textTexture(64, 64); const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return tex; }

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd5ecf2, 46, 130);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  camera.position.set(0, 12.5, 20.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 3.0, -3.0); controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 10; controls.maxDistance = 46; controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.46;
  controls.enableZoom = false; // the page scrolls over the stage; zoom uses the ＋/－ buttons
  let userMoved = false; controls.addEventListener('start', () => { userMoved = true; });
  const R = rng(20261114);

  /* sky */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f8fe0) }, mid: { value: new THREE.Color(0xa9dbf3) }, bot: { value: new THREE.Color(0xffedcc) } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(p).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(min(1.0, -h * 3.0), 0.7)); gl_FragColor = vec4(c, 1.0); }',
  }));
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xe6f6ff, 0x6f9050, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
  sun.position.set(14, 24, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('#fff6d8'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunDisc.scale.set(46, 46, 1); sunDisc.position.set(70, 78, -120); scene.add(sunDisc);

  /* island */
  const world = new THREE.Group(); scene.add(world);
  const std = (color, o = {}) => toonMat(color, { flatShading: !!o.flatShading }); // cel shading for the whole diorama
  const ink = (mesh) => { mesh.add(new THREE.Mesh(mesh.geometry, OUTLINE)); return mesh; }
  const wob = (a) => 1 + 0.05 * Math.sin(a * 3 + 0.6) + 0.035 * Math.sin(a * 7 + 1.9) + 0.02 * Math.sin(a * 13);
  const top = new THREE.CylinderGeometry(20, 20.4, 1.2, 72, 1);
  { const p = top.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const k = wob(Math.atan2(z, x)); p.setX(i, x * k); p.setZ(i, z * k); } top.computeVertexNormals(); }
  const grass = new THREE.Mesh(top, std(0x86c45c)); grass.position.y = -0.6; grass.receiveShadow = true; world.add(grass);
  const under = new THREE.CylinderGeometry(20.2, 2.4, 17, 44, 7);
  { const p = under.attributes.position, col = []; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x), k = wob(a) * (1 + (R() - 0.5) * 0.16 * (y < 8 ? 1 : 0)); p.setX(i, x * k); p.setZ(i, z * k); const tt = (y + 8.5) / 17; const c = new THREE.Color().setHSL(0.07 + 0.02 * R(), 0.32, 0.16 + 0.22 * tt + 0.05 * R()); col.push(c.r, c.g, c.b); } under.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); under.computeVertexNormals(); }
  const rock = new THREE.Mesh(under, toonMat(0xffffff, { vertexColors: true, flatShading: true })); rock.position.y = -9.7; world.add(rock);

  /* arena tiles */
  const cells = [];
  for (let gx = 4; gx <= 16; gx++) for (let gy = 3; gy <= 17; gy++) cells.push([gx, gy]);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.94, 0.1, T * 0.94), std(0xffffff, { roughness: 0.85 }), cells.length);
  const m4 = new THREE.Matrix4(), tc = new THREE.Color();
  const zoneA = new THREE.Color(0x7fb2ff), zoneB = new THREE.Color(0xff9a8a);
  function paintTiles(tile) {
    cells.forEach(([gx, gy], i) => {
      tc.set(tile[(gx + gy) & 1 ? 0 : 1]);
      if (gy >= 6 && gy <= 9 && gx >= 8 && gx <= 12) tc.lerp(zoneA, 0.3);
      if (gy >= 11 && gy <= 14 && gx >= 8 && gx <= 12) tc.lerp(zoneB, 0.3);
      tiles.setColorAt(i, tc);
    });
    tiles.instanceColor.needsUpdate = true;
  }
  cells.forEach(([gx, gy], i) => { m4.makeTranslation(wx(gy), 0.03, wz(gx)); tiles.setMatrixAt(i, m4); });
  tiles.setColorAt(0, tc); paintTiles(GROUNDS.forest.tile);
  tiles.receiveShadow = true; world.add(tiles);
  /* the game-style board: sand grain on every tile and cracked earth on a few (drawn here, no game art) */
  const sandTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const v = 200 + Math.floor(R() * 55); c.fillStyle = `rgba(${v},${v - 8},${v - 20},${0.25 + R() * 0.35})`; c.fillRect(R() * 128, R() * 128, 1 + R() * 2.2, 1 + R() * 2.2); }
    c.strokeStyle = 'rgba(120,80,45,0.18)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, 125, 125);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const crackTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.strokeStyle = 'rgba(92,52,24,0.75)'; c.lineCap = 'round';
    const branch = (x, y, a, len, w) => { if (len < 6 || w < 0.6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); branch(x2, y2, a + (R() - 0.5) * 1.1, len * 0.72, w * 0.75); if (R() < 0.55) branch(x2, y2, a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6), len * 0.55, w * 0.6); };
    for (let k = 0; k < 4; k++) branch(64, 64, k * 1.57 + R() * 0.8, 20 + R() * 10, 3.2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const cracks = new THREE.Group(); cracks.visible = false; world.add(cracks);
  { const geo = new THREE.PlaneGeometry(T * 0.9, T * 0.9), mat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, toneMapped: false });
    for (const [gx, gy] of [[5, 4], [14, 5], [7, 8], [12, 7], [9, 12], [15, 13], [6, 15], [11, 16], [16, 9], [4, 11]]) { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = (gx * 7 + gy) % 4 * 1.57; m.position.set(wx(gy), 0.085, wz(gx)); cracks.add(m); } }
  const inArena = (x, z, pad = 0.6) => Math.abs(x) < 8.4 + pad + 0.6 && Math.abs(z) < 7.2 + pad + 0.6;

  /* trees, rocks, flowers, grass */
  const trunkMat = std(0x7a5536), pineMat = [std(0x3f8a4d, { flatShading: true }), std(0x4c9c57, { flatShading: true })];
  const leafMats = [0x5fae4a, 0x74bf52, 0x4e9a45, 0x8fcf5a, 0xf2a7c3, 0xf0b54a].map((c) => std(c, { flatShading: true }));
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1, 6), coneGeo = new THREE.ConeGeometry(1, 1.25, 7), blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const sways = [];
  function tree(x, z, s = 1, kind) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    const h = 1.5 + R() * 1.4;
    const tr = ink(new THREE.Mesh(trunkGeo, trunkMat)); tr.scale.y = h; tr.position.y = h / 2; tr.castShadow = true; g.add(tr);
    const crown = new THREE.Group(); crown.position.y = h; g.add(crown);
    if (kind === 'pine' || (kind == null && R() < 0.45)) {
      for (let i = 0; i < 3; i++) { const c = ink(new THREE.Mesh(coneGeo, pineMat[i & 1])); const k = 1.05 - i * 0.24; c.scale.set(k, 1, k); c.position.y = -0.25 + i * 0.72; c.castShadow = true; crown.add(c); }
    } else {
      const mat = leafMats[R() < 0.8 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 2)];
      for (let i = 0; i < 3; i++) { const b = ink(new THREE.Mesh(blobGeo, mat)); const k = 0.95 - i * 0.16; b.scale.set(k * (0.9 + R() * 0.3), k * 0.85, k * (0.9 + R() * 0.3)); b.position.set((R() - 0.5) * 0.9, 0.35 + i * 0.5, (R() - 0.5) * 0.9); b.rotation.set(R() * 3, R() * 3, R() * 3); b.castShadow = true; crown.add(b); }
    }
    g.rotation.y = R() * 6.28; sways.push([crown, R() * 6.28, 0.5 + R() * 0.5]);
    world.add(g); return g;
  }
  const spots = [];
  for (let i = 0; i < 400 && spots.length < 34; i++) {
    const a = R() * 6.283, r = 10.5 + R() * 8, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.96;
    if (inArena(x, z, 1.4)) continue;
    if (z > 8.5 && Math.abs(x) < 9) continue;             // keep the camera side open
    if (z < -7 && Math.abs(x) < 5.2) continue;             // terminal clearing
    if (Math.hypot(x + 13.5, z - 6.5) < 3.8) continue;     // pond
    if (spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.1)) continue;
    spots.push([x, z]); tree(x, z, 0.95 + R() * 0.75);
  }
  const rockGeo = new THREE.IcosahedronGeometry(1, 0), rockMat = [std(0x9a9a92, { flatShading: true }), std(0x7f837c, { flatShading: true }), std(0xb3ad9c, { flatShading: true })];
  function boulder(x, z, s) { const m = ink(new THREE.Mesh(rockGeo, rockMat[Math.floor(R() * 3)])); m.position.set(x, s * 0.35, z); m.scale.set(s * (0.8 + R() * 0.5), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.5)); m.rotation.set(R() * 3, R() * 3, R() * 3); m.castShadow = m.receiveShadow = true; world.add(m); return m; }
  for (let i = 0; i < 26; i++) { const a = R() * 6.283, r = 9.8 + R() * 9, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!inArena(x, z, 0.8) && !(z < -7 && Math.abs(x) < 4.6)) boulder(x, z, 0.35 + R() * 0.7); }
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.42, 4), std(0x5fa648), 900);
  const flowerHead = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), std(0xffffff), 260);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let nt = 0, nf = 0; const fcols = [0xffffff, 0xffe066, 0xff9ec4, 0xb9a6ff, 0xff7a5c];
  for (let i = 0; i < 6000 && (nt < 900 || nf < 260); i++) {
    const a = R() * 6.283, r = Math.sqrt(R()) * 19, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inArena(x, z, 0) || Math.hypot(x + 13.5, z - 6.5) < 3.1) continue;
    if (nt < 900 && R() < 0.8) { e.set((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5); q.setFromEuler(e); const k = 0.7 + R() * 1.1; m4.compose(ps.set(x, 0.2 * k, z), q, sc.set(k, k, k)); tuft.setMatrixAt(nt, m4); tuft.setColorAt(nt, tc.setHSL(0.27 + R() * 0.06, 0.5, 0.36 + R() * 0.12)); nt++; }
    else if (nf < 260) { m4.compose(ps.set(x, 0.16 + R() * 0.1, z), q.identity(), sc.setScalar(0.7 + R() * 0.8)); flowerHead.setMatrixAt(nf, m4); flowerHead.setColorAt(nf, tc.set(fcols[Math.floor(R() * fcols.length)])); nf++; }
  }
  tuft.count = nt; flowerHead.count = nf; world.add(tuft, flowerHead);
  // mushrooms
  const capGeo = new THREE.SphereGeometry(0.2, 10, 6, 0, 6.3, 0, 1.6), stemGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.22, 6), capMat = std(0xe2483c), stemMat = std(0xfff3dc);
  for (let i = 0; i < 14; i++) { const [tx, tz] = spots[Math.floor(R() * spots.length)]; const x = tx + (R() - 0.5) * 1.8, z = tz + (R() - 0.5) * 1.8; if (inArena(x, z, 0.3)) continue; const s = 0.8 + R() * 0.9; const st = new THREE.Mesh(stemGeo, stemMat); st.position.set(x, 0.11 * s, z); st.scale.setScalar(s); const cp = ink(new THREE.Mesh(capGeo, capMat)); cp.position.set(x, 0.2 * s, z); cp.scale.setScalar(s); cp.castShadow = true; world.add(st, cp); }

  /* pond + waterfall */
  const water = new THREE.Mesh(new THREE.CircleGeometry(3, 28), new THREE.MeshStandardMaterial({ color: 0x4bb8e8, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-13.5, 0.04, 6.5); water.scale.set(1, 0.82, 1); world.add(water);
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + R() * 0.3; boulder(-13.5 + Math.cos(a) * 3.1, 6.5 + Math.sin(a) * 2.6, 0.28 + R() * 0.3); }
  const fall = textTexture(64, 256); { const c = fall.ctx; c.fillStyle = '#58bdea'; c.fillRect(0, 0, 64, 256); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.5})`; c.fillRect(R() * 64, R() * 256, 2 + R() * 4, 14 + R() * 46); } }
  fall.tex.wrapS = fall.tex.wrapT = THREE.RepeatWrapping; fall.tex.repeat.set(1, 1.6);
  const fallMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 15), new THREE.MeshBasicMaterial({ map: fall.tex, transparent: true, opacity: 0.86, side: THREE.DoubleSide }));
  { const dir = new THREE.Vector3(-13.5, 0, 6.5).normalize(); const edge = 20.9 * wob(Math.atan2(dir.z, dir.x)); fallMesh.position.set(dir.x * edge, -7.6, dir.z * edge); fallMesh.rotation.y = Math.atan2(dir.x, dir.z); world.add(fallMesh);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(1.7, edge - Math.hypot(13.5, 6.5) - 2.2), new THREE.MeshStandardMaterial({ color: 0x4bb8e8, roughness: 0.15, transparent: true, opacity: 0.88 })); stream.rotation.x = -Math.PI / 2; stream.rotation.z = -Math.atan2(dir.x, dir.z); const mid = (edge + Math.hypot(13.5, 6.5) + 2.2) / 2; stream.position.set(dir.x * mid, 0.035, dir.z * mid); world.add(stream); }

  /* clouds + islets + fireflies */
  const cloudMat = toonMat(0xffffff, { flatShading: true, fog: false });
  const clouds = [];
  for (let i = 0; i < 9; i++) { const g = new THREE.Group(); const n = 3 + Math.floor(R() * 3); for (let j = 0; j < n; j++) { const b = new THREE.Mesh(blobGeo, cloudMat); b.scale.set(2.2 + R() * 2, 1.2 + R() * 0.8, 1.8 + R() * 1.4); b.position.set(j * 2.4 - n * 1.2, R() * 0.8, R() * 1.5); g.add(b); } const a = R() * 6.283, r = 36 + R() * 34; g.position.set(Math.cos(a) * r, 4 + R() * 18 - 6, Math.sin(a) * r); g.userData = { a, r, sp: 0.006 + R() * 0.01 }; clouds.push(g); scene.add(g); }
  const islets = [];
  [[-27, -3, -12, 2.6], [28, 2, -16, 3.2], [22, -5, 14, 2.0]].forEach(([x, y, z, r]) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.03, 0.5, 14), std(0x86c45c)); const bt = new THREE.Mesh(new THREE.ConeGeometry(r * 1.02, r * 2.2, 9), std(0x6a4a34, { flatShading: true })); bt.rotation.x = Math.PI; bt.position.y = -r * 1.1 - 0.25;
    g.add(tp, bt); scene.add(g); islets.push([g, y, R() * 6]);
    const t1 = tree(0, 0, 0.9, 'pine'); world.remove(t1); t1.position.set(r * 0.2, 0.25, 0); g.add(t1);
    const b1 = boulder(0, 0, 0.5); world.remove(b1); b1.position.set(-r * 0.4, 0.4, r * 0.3); g.add(b1);
  });
  const flyN = 70, flyPos = new Float32Array(flyN * 3), flySeed = [];
  for (let i = 0; i < flyN; i++) flySeed.push([(R() - 0.5) * 34, 0.6 + R() * 4.5, (R() - 0.5) * 30, R() * 6.28, 0.3 + R() * 0.7]);
  const flyGeo = new THREE.BufferGeometry(); flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ map: softDot('#fff7b0'), size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  scene.add(flies);

  /* team banners */
  const banners = [];
  [[-9.6, 0], [9.6, 1]].forEach(([x, t]) => [-6.4, 6.4].forEach((z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), std(0x5b4636)); pole.position.set(x, 1.7, z); pole.castShadow = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5, 6, 1), toonMat(TEAM[t], { side: THREE.DoubleSide })); cloth.position.set(x + (t ? -0.6 : 0.6), 2.55, z); cloth.castShadow = true;
    world.add(pole, cloth); banners.push([cloth, R() * 6]);
  }));

  /* Claude-Code-style terminal monolith */
  const term = new Terminal();
  const tg = new THREE.Group(); tg.position.set(0, 0, -10.6); tg.scale.setScalar(1.04); world.add(tg);
  const plinth = ink(new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.0, 2.6), std(0x8d9087, { flatShading: true }))); plinth.position.y = 0.5; plinth.castShadow = plinth.receiveShadow = true; tg.add(plinth);
  const moss = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.14, 2.7), std(0x6fae4f)); moss.position.y = 1.03; tg.add(moss);
  const body = new THREE.Mesh(new THREE.BoxGeometry(8.0, 5.3, 0.7), std(0x262422, { roughness: 0.55 })); body.position.set(0, 3.9, 0); body.castShadow = true; tg.add(body);
  const bezel = ink(new THREE.Mesh(new THREE.BoxGeometry(8.3, 5.6, 0.5), std(0x3a3733, { roughness: 0.6 }))); bezel.position.set(0, 3.9, -0.14); bezel.castShadow = true; tg.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 4.69), new THREE.MeshBasicMaterial({ map: term.tex, toneMapped: false })); screen.position.set(0, 3.95, 0.36); tg.add(screen);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd97757 })); led.position.set(3.7, 1.42, 0.37); tg.add(led);
  const keys = textTexture(512, 160); { const c = keys.ctx; c.fillStyle = '#2b2927'; c.fillRect(0, 0, 512, 160); for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) { c.fillStyle = r === 3 && k > 3 && k < 10 ? '#55514b' : (k + r) % 9 === 0 ? '#d97757' : '#4a4641'; c.beginPath(); c.roundRect(10 + k * 35.3, 10 + r * 37, 29, 30, 5); c.fill(); } }
  const kb = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.05), [std(0x2b2927), std(0x2b2927), new THREE.MeshStandardMaterial({ map: keys.tex, roughness: 0.7 }), std(0x2b2927), std(0x2b2927), std(0x2b2927)]); kb.position.set(0, 1.17, 0.72); kb.rotation.x = 0.1; kb.castShadow = true; tg.add(kb);
  const glowL = new THREE.PointLight(0xffc7a3, 14, 13, 1.6); glowL.position.set(0, 3.6, 2.2); tg.add(glowL);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(blobGeo, leafMats[i % 4]); const side = i % 2 ? 1 : -1; b.scale.setScalar(0.35 + R() * 0.4); b.position.set(side * (3.6 + R() * 0.9), 1.2 + R() * (i < 4 ? 4.6 : 1.2), 0.2 + R() * 0.5); tg.add(b); }
  tree(-6.3, -11.6, 1.7, 'pine'); tree(6.5, -11.9, 1.9, 'pine'); tree(-8.6, -9.2, 1.3); tree(8.9, -9.0, 1.4);

  /* units */
  const unitsG = new THREE.Group(); scene.add(unitsG);
  const mobTex = new Map();
  const shadowTex = softDot('rgba(0,0,0,0.55)');
  const baseGeo = new THREE.CylinderGeometry(0.44, 0.48, 0.09, 24), shadowGeo = new THREE.CircleGeometry(0.62, 20);
  let units = [];
  function makeUnit(m, i) {
    const g = new THREE.Group();
    const u = { m, g, hp: m.hpMax, sh: 0, alive: true, atk: -1, hit: 0, fall: 0, tw: null, seed: i * 1.7, lunge: null, frame: i, sts: new Map(), tn: 0, gx: m.x, gy: m.y };
    const pet = m.kind === 'pet' ? PET.get(m.petId) : null;
    const sumM = m.kind === 'summon' ? { ty: 0, en: m.name, art: m.art, hue: SUM_HUE[m.art] != null ? SUM_HUE[m.art] : 200 } : null;
    const mob = m.kind === 'mob' ? MOB.get(m.key) : pet ? { ty: 0 } : sumM;
    const h = mob ? (mob.ty === 2 ? 2.5 : mob.ty === 1 ? 1.75 : pet ? 1.3 : sumM ? 1.15 : 1.38) : 2.05, w = mob ? h : h / 1.2;
    let tex;
    // cel-shaded 3D model (GPT-designed spec) when one exists for this hero design / monster kind
    let spec = null, tscale = 1, recolor = null;
    // a rigged glTF model (Higgsfield, from the user's SD turnaround) replaces the code-built one when it loaded
    let glbM = null;
    if (m.kind === 'hero') { u.design = designOf(m.cls); spec = u.design && toonSpec(u.design); glbM = u.design && hasGlb(u.design) ? buildGlbModel(u.design) : null; }
    else if (mob) {
      const md = pet || sumM || MOB.get(m.key), id = toonIdForMob(md.en, pet ? petArtSlug(pet) : mobArtSlug(md));
      spec = id && toonSpec(id);
      if (spec) {
        const uniq = id.startsWith('boss_');
        if (!uniq) { const p = pet ? petPalette(pet) : mobPalette(md); recolor = { MAIN: p[0], LIGHT: p[1], DARK: p[2] }; }
        // Hieromon fill their 4×4 / 5×5 bodies
        tscale = pet ? 0.62 : sumM ? 0.7 : uniq ? (m.sz >= 5 ? 2.9 : m.sz === 4 ? 2.5 : 2.0) : mob.ty === 2 ? 1.6 : mob.ty === 1 ? 1.12 : 0.88;
      }
    }
    if (spec || glbM) {
      u.toon = glbM || buildModel(spec, { recolor }); u.style = spec ? spec.style || 'sword' : 'shield';
      u.toon.root.scale.setScalar(tscale); u.yaw = m.team ? -1.0 : 1.0; u.yawT = u.yaw;
      u.mat = new THREE.MeshBasicMaterial(); u.card = new THREE.Mesh(new THREE.BufferGeometry(), u.mat); u.tex = null; u.h = Math.max(1, u.toon.h * tscale);
      u.an = { st: 'idle', t0: 0 }; u.lastHit = -9;
      const big = m.sz > 1 ? m.sz + 0.2 : 1; // the team disc covers the footprint
      const base = new THREE.Mesh(baseGeo, toonMat(TEAM[m.team])); base.position.y = 0.06; base.scale.set(big, 0.6, big); base.receiveShadow = true; base.add(new THREE.Mesh(baseGeo, OUTLINE));
      u.barS = null; u.bar = textTexture(256, 76);
      u.barS = new THREE.Sprite(new THREE.SpriteMaterial({ map: u.bar.tex, transparent: true, depthTest: false, toneMapped: false })); u.barS.scale.set(2.1, 0.62, 1); u.barS.position.y = u.h + 0.4; u.barS.renderOrder = 5;
      // soft contact shadow so the figure sits on the board
      const blob = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.13; blob.scale.setScalar(0.9 * big + 0.2);
      g.add(blob, base, u.toon.root, u.barS); g.position.set(ux(u, m.y), 0, uz(u, m.x));
      if (m.out) { g.visible = false; u.alive = false; u.hidden = true; }
      drawBar(u); unitsG.add(g); return u;
    }
    if (mob) {
      const tk = pet ? 'pet' + m.petId : sumM ? 'sum' + m.art + m.team : m.key;
      let e = mobTex.get(tk);
      if (!e) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; e = { cv, tex: new THREE.CanvasTexture(cv), draw: () => { if (pet) drawPet(cv.getContext('2d'), 256, 256, pet); else drawMob(cv.getContext('2d'), 256, 256, mob); e.tex.needsUpdate = true; } }; e.tex.colorSpace = THREE.SRGBColorSpace; e.draw(); mobTex.set(tk, e); }
      tex = e.tex;
    }
    else {
      // heroes: frame animation from the SD class sheet when it is loaded, else the paper-doll rig
      u.sprite = sheetSpriteFor(m.cls, 300) || new HeroSprite(m.cls, m.name, 256); u.sheet = u.sprite instanceof SheetSprite;
      u.sprite.draw(0, { flip: flipOf(u) }); tex = new THREE.CanvasTexture(u.sprite.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    }
    u.an = { st: 'idle', t0: 0 }; u.lastHit = -9;
    // sheet sprites use a wide card (trails and circles fit); the character itself stays the same size
    const ph = u.sheet ? 2.65 : h, pw = u.sheet ? ph * 1.5 : w;
    const geo = new THREE.PlaneGeometry(pw, ph); geo.translate(0, u.sheet ? ph * 0.4 : h / 2, 0);
    u.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
    u.card = new THREE.Mesh(geo, u.mat); u.card.rotation.order = 'YXZ'; u.card.position.y = 0.1; u.tex = tex; u.h = h;
    const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: TEAM[m.team], roughness: 0.5 })); base.position.y = 0.11; base.castShadow = true; base.scale.setScalar(mob && mob.ty === 2 ? 1.5 : 1);
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.09; sh.scale.setScalar(mob && mob.ty === 2 ? 1.6 : 1.1);
    u.bar = textTexture(256, 76); // status chips (top) + HP/shield bar (bottom)
    u.barS = new THREE.Sprite(new THREE.SpriteMaterial({ map: u.bar.tex, transparent: true, depthTest: false, toneMapped: false })); u.barS.scale.set(2.1, 0.62, 1); u.barS.position.y = h + 0.55; u.barS.renderOrder = 5;
    g.add(sh, base, u.card, u.barS); g.position.set(ux(u, m.y), 0, uz(u, m.x));
    if (m.out) { g.visible = false; u.alive = false; u.hidden = true; }
    drawBar(u); unitsG.add(g); return u;
  }
  window.addEventListener('sxs-art', () => { for (const e of mobTex.values()) e.draw(); fxTex.clear(); for (const u of units) if (u.sheet) { u.sprite.key = ''; } });
  /** sheet frames face left: our team (left side) is mirrored to face the enemy */
  function flipOf(u) { return u.sprite && u.sprite.facesLeft ? u.m.team === 0 : u.m.team === 1; }
  function setAnim(u, st) { if (u.an) u.an = { st, t0: animT }; }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  /** the SD design whose effect pictures a hero uses (3D toon or sheet sprite) */
  const fxDesign = (u) => (u && u.design && sheet(u.design) ? u.design : null);
  /** battle mood for the expression icons */
  const CTRL = ['stun', 'freeze', 'immob', 'frenzy', 'taunt'];
  function moodOf(u) {
    if (!u.alive) return 'down';
    if (CTRL.some((k) => u.sts.has(k))) return 'panic';
    if (animT - (u.lastHit || -9) < 0.6) return u.bigHit ? 'panic' : 'hit';
    if (u.an && u.an.st === 'skill') return 'cast';
    if (u.an && u.an.st === 'attack') return 'focus';
    if (u.hp / u.m.hpMax < 0.3) return 'angry';
    return 'base';
  }
  function drawBar(u) {
    const c = u.bar.ctx, f = Math.max(0, u.hp / u.m.hpMax), s = Math.min(1, u.sh / u.m.hpMax);
    c.clearRect(0, 0, 256, 76);
    // HP bar (centre 128 px wide, like before) with the shield as a pale strip on top
    const bx = 64, by = 50;
    c.fillStyle = 'rgba(20,16,14,.85)'; c.beginPath(); c.roundRect(bx, by, 128, 20, 8); c.fill();
    c.fillStyle = u.m.team ? '#ff6b5e' : '#5aa2ff'; c.beginPath(); c.roundRect(bx + 3, by + 3, Math.max(4, 122 * f), 14, 6); c.fill();
    if (s > 0) { c.fillStyle = 'rgba(240,248,255,.92)'; c.beginPath(); c.roundRect(bx + 3, by + 3, Math.max(4, 122 * s), 5, 3); c.fill(); }
    // status chips: control → debuffs → buffs, at most 2 + a count
    if (u.sts.size && u.alive) {
      const list = [...u.sts].sort((a, b) => stOrder(a) - stOrder(b));
      c.font = `800 19px ${SANS}`; c.textBaseline = 'middle';
      const chips = list.slice(0, 2).map(([k, e]) => ({ t: (ST_SHORT[k] || k) + (e.n > 1 ? '×' + e.n : ''), bg: stOrder([k, e]) === 0 ? '#c2410c' : stOrder([k, e]) === 1 ? '#9b2c2c' : k === 'shield' ? '#35608c' : '#2f7a46' }));
      if (list.length > 2) chips.push({ t: '+' + (list.length - 2), bg: '#4a4640' });
      const ws = chips.map((ch) => c.measureText(ch.t).width + 14), tot = ws.reduce((a, b) => a + b, 0) + 4 * (chips.length - 1);
      let x = 128 - tot / 2;
      chips.forEach((ch, i) => { c.fillStyle = ch.bg; c.beginPath(); c.roundRect(x, 14, ws[i], 28, 9); c.fill(); c.fillStyle = '#fff'; c.fillText(ch.t, x + 7, 29); x += ws[i] + 4; });
    }
    u.bar.tex.needsUpdate = true;
  }
  /** status bookkeeping from 'st' events: count of instances, stacks, own turns left at the time of the event */
  function applySt(u, ev) {
    const m = u.sts, e = m.get(ev.k);
    if (ev.on) { if (e) { if (!ev.u) e.c++; e.n = ev.n || 0; e.d = ev.d || 0; e.at = u.tn; e.b = ev.b; } else m.set(ev.k, { c: 1, n: ev.n || 0, d: ev.d || 0, at: u.tn, b: ev.b }); }
    else if (e && --e.c <= 0) m.delete(ev.k);
  }
  function disposeUnits() { for (const u of units) { unitsG.remove(u.g); u.card.geometry.dispose(); u.mat.dispose(); u.bar.tex.dispose(); if (u.sprite) u.tex.dispose(); if (u.toon) { u.toon.mats.forEach((m) => m.dispose()); if (u.toon.face) u.toon.face.tex.dispose(); } } units = []; }
  function setRoster(meta) { disposeUnits(); clearTraps(); units = meta.map(makeUnit); ring.visible = false; }
  /* Blast Spirit charges (grid items: they stand on a cell without blocking it) */
  const trapG = new THREE.Group(); scene.add(trapG);
  const trapM = new Map(), trapGeo = new THREE.IcosahedronGeometry(0.24, 1), trapMat = toonMat(0xff8a3c, { emissive: 0xff5a1a, emissiveIntensity: 0.55 });
  const burnGeo = new THREE.PlaneGeometry(T * 0.92, T * 0.92), burnMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: 0xff6a1a, transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false });
  function trapEv(ev) {
    if (!ev.on) { const g = trapM.get(ev.id); if (g) { trapG.remove(g); trapM.delete(ev.id); } return; }
    if (ev.burn) {
      // Meteoric Flames' burning ground: a glowing tile on the cell
      const g = new THREE.Group(), tile = new THREE.Mesh(burnGeo, burnMat); tile.rotation.x = -Math.PI / 2; g.add(tile);
      g.position.set(wx(ev.y), 0.13, wz(ev.x)); g.userData.flat = 1; g.userData.ph = ev.id; trapG.add(g); trapM.set(ev.id, g); return;
    }
    const g = new THREE.Group(), core = new THREE.Mesh(trapGeo, trapMat); core.add(new THREE.Mesh(trapGeo, OUTLINE)); g.add(core);
    const glow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, color: 0xff7a2a, transparent: true, depthWrite: false, opacity: 0.55 })); glow.rotation.x = -Math.PI / 2; glow.position.y = -0.3; glow.scale.setScalar(0.7); g.add(glow);
    g.position.set(wx(ev.y), 0.45, wz(ev.x)); g.userData.ph = ev.id * 1.3; trapG.add(g); trapM.set(ev.id, g);
  }
  function clearTraps() { for (const g of trapM.values()) trapG.remove(g); trapM.clear(); }

  /* fx pools */
  const fxG = new THREE.Group(); scene.add(fxG);
  const nums = Array.from({ length: 44 }, () => { const t = textTexture(256, 96); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, toneMapped: false })); s.visible = false; s.renderOrder = 9; fxG.add(s); return { t, s, life: 0 }; });
  let numI = 0;
  function popNum(text, color, pos, big) {
    const n = nums[numI++ % nums.length], c = n.t.ctx;
    c.clearRect(0, 0, 256, 96); c.font = `900 ${big ? 60 : 46}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 10; c.strokeStyle = 'rgba(25,18,14,.95)'; c.strokeText(text, 128, 50); c.fillStyle = color; c.fillText(text, 128, 50);
    n.t.tex.needsUpdate = true; n.s.visible = true; n.life = 1; n.s.position.copy(pos); n.s.position.x += (Math.random() - 0.5) * 0.7; n.s.position.y += Math.random() * 0.35; n.sc = big ? 2.5 : 1.9;
  }
  const labels = Array.from({ length: 5 }, () => { const t = textTexture(512, 96); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, toneMapped: false })); s.visible = false; s.renderOrder = 8; s.scale.set(3.4, 0.64, 1); fxG.add(s); return { t, s, life: 0 }; });
  let labI = 0;
  function popLabel(text, color, pos) {
    const n = labels[labI++ % labels.length], c = n.t.ctx; c.clearRect(0, 0, 512, 96); c.font = `800 40px ${SANS}`; const w = Math.min(490, c.measureText(text).width + 44);
    c.fillStyle = 'rgba(25,22,20,.86)'; c.beginPath(); c.roundRect(256 - w / 2, 14, w, 68, 18); c.fill(); c.strokeStyle = color; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 50, 470); n.t.tex.needsUpdate = true; n.s.visible = true; n.life = 1; n.s.position.copy(pos);
  }
  const ringGeo = new THREE.RingGeometry(0.72, 1, 40);
  const rings = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; fxG.add(m); return { m, life: 0, r: 1 }; });
  let ringI = 0;
  function popRing(x, z, r, color) { const n = rings[ringI++ % rings.length]; n.m.visible = true; n.life = 1; n.r = Math.max(0.8, r); n.m.position.set(x, 0.16, z); n.m.material.color.set(color); }
  const boltGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const bolts = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('#ffffff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(1, 1, 1); m.add(halo); m.visible = false; fxG.add(m); return { m, halo, life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() }; });
  let boltI = 0;
  function popBolt(a, b, color) { const n = bolts[boltI++ % bolts.length]; n.m.visible = true; n.life = 1; n.a.copy(a); n.b.copy(b); n.m.material.color.set(color); n.halo.material.color.set(color); }
  /* SD-sheet effects: billboards (slashes, projectiles, bursts) and flat ground circles (마법진 / 지원 진형) */
  const fxTex = new Map();
  function fxOf(d, i) {
    if (i == null) return null;
    let L = fxTex.get(d);
    if (!L) {
      const m = sheet(d); if (!m) return null;
      L = m.fx.map((f) => { const im = sheetImg(d, f.f); if (!im) return null; const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; const tf = t.clone(); tf.repeat.x = -1; tf.offset.x = 1; tf.needsUpdate = true; return { t, tf, ar: f.w / f.h }; });
      if (L.some((x) => !x)) return null; // images not loaded yet
      fxTex.set(d, L);
    }
    return L[i] || null;
  }
  const fxs = Array.from({ length: 14 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); s.visible = false; s.renderOrder = 7; fxG.add(s); return { s, life: 0 }; });
  const flats = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; fxG.add(m); return { m, life: 0 }; });
  let fxI = 0, flatI = 0;
  /** size = world height; o: { flip, from (projectile start), dur, flat, onEnd } */
  function spawnFx(d, i, pos, size, o = {}) {
    const F = fxOf(d, i); if (!F) return;
    if (o.flat) {
      const n = flats[flatI++ % flats.length]; n.m.material.map = F.t; n.m.material.needsUpdate = true;
      Object.assign(n, { life: 1, dur: o.dur || 1, size, ar: F.ar }); n.m.position.set(pos.x, 0.2, pos.z); n.m.visible = true; return;
    }
    const n = fxs[fxI++ % fxs.length];
    n.s.material.map = o.flip ? F.tf : F.t; n.s.material.needsUpdate = true;
    Object.assign(n, { life: 1, dur: o.dur || 0.55, size, ar: F.ar, proj: !!o.from, from: o.from ? o.from.clone() : null, to: pos.clone(), onEnd: o.onEnd || null });
    n.s.position.copy(o.from || pos); n.s.scale.set(size * F.ar * 0.7, size * 0.7, 1); n.s.material.opacity = 1; n.s.visible = true;
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; ring.visible = false; scene.add(ring);

  /* replay */
  let play = null, speed = 1, paused = false, topView = false, animT = 0; // animT: replay-time clock for sprite states
  const head = (u) => new THREE.Vector3(u.g.position.x, u.h * 0.72, u.g.position.z);
  const uname = (m) => (m.kind === 'mob' ? `${m.name}${m.nth != null && m.dup ? '#' + (m.nth + 1) : ''}` : m.name);
  function flushCast() {
    const p = play; if (!p || !p.cur) return;
    const c = p.cur; p.cur = null;
    if (!c.sup && !c.n) { term.line(`  ⎿ 빗나감`, '#8f8b80'); return; }
    if (c.sup) return;
    const bits = []; if (c.crit) bits.push(`치명타 ${c.crit}`); if (c.block) bits.push(`막기 ${c.block}`); if (c.miss) bits.push(`빗나감 ${c.miss}`);
    term.line(`  ⎿ −${fmt(c.dmg)}${c.n > 1 ? ` (${c.n}타)` : ''}${bits.length ? ' · ' + bits.join(' · ') : ''}`, c.team ? '#ff9c8f' : '#9cc4ff');
  }
  function doEvent(ev) {
    const p = play;
    switch (ev.e) {
      case 'turn': { flushCast(); const u = units[ev.u]; u.tn++; ring.visible = true; ring.position.x = u.g.position.x; ring.position.z = u.g.position.z; ring.material.color.set(u.m.team ? 0xffb3a8 : 0xa8ccff); if (ev.r !== p.round) { p.round = ev.r; p.hooks.onRound && p.hooks.onRound(ev.r); } return 0.07; }
      case 'move': {
        const u = units[ev.u]; u.gx = ev.x; u.gy = ev.y; u.tw = { x0: u.g.position.x, z0: u.g.position.z, x1: ux(u, ev.y), z1: uz(u, ev.x), k: 0, d: ev.dash ? 0.17 : ev.kb ? 0.15 : ev.pull ? 0.2 : ev.retreat ? 0.22 : 0.26, hop: ev.leap ? 1.5 : ev.dash || ev.kb ? 0.08 : ev.pull ? 0.15 : ev.retreat ? 0.3 : 0.45 };
        if (!ev.pull) {
          setAnim(u, 'move');
          if (u.toon) u.yawT = Math.atan2(u.tw.x1 - u.tw.x0, u.tw.z1 - u.tw.z0);
          // leaping skills: the class dash effect along the path (돌진 / 질주 베기 / 방패 돌진)
          const fd = fxDesign(u), U = FXU[fd] || {};
          if (fd && (ev.leap || ev.dash) && U.dash != null) spawnFx(fd, U.dash, new THREE.Vector3((u.tw.x0 + u.tw.x1) / 2, 0.9, (u.tw.z0 + u.tw.z1) / 2), 1.3, { flip: u.tw.x1 < u.tw.x0, dur: 0.4 });
        }
        return ev.pull ? 0.08 : 0.24;
      }
      case 'cast': {
        flushCast(); const u = units[ev.u]; u.atk = 0;
        const col = (EL[ev.el] || EL.none).c;
        popLabel(ev.n, col, new THREE.Vector3(u.g.position.x, u.h + 0.95, u.g.position.z));
        p.cur = { dmg: 0, n: 0, crit: 0, block: 0, miss: 0, team: u.m.team, sup: ev.sup, el: ev.el, src: ev.u };
        const first = ev.tg.length ? units[ev.tg[0]] : null;
        term.line(`R${p.round} ${uname(u.m)} ▸ ${ev.n}${first ? ' → ' + uname(first.m) + (ev.tg.length > 1 ? ` 외 ${ev.tg.length - 1}` : '') : ''}`, '#e8e4d8');
        const aoe = ev.sh !== 'S' || ev.tg.length > 1;
        const cen = () => (ev.sh === 'T' || ev.sh === 'TQ' ? new THREE.Vector3(wx(ev.ay), 0, wz(ev.ax)) : new THREE.Vector3(ev.tg.reduce((s, i) => s + units[i].g.position.x, 0) / ev.tg.length, 0, ev.tg.reduce((s, i) => s + units[i].g.position.z, 0) / ev.tg.length));
        if (!ev.pet) {
          setAnim(u, ev.sup || aoe ? 'skill' : 'attack');
          if (u.toon && first && !ev.sup) u.yawT = Math.atan2(first.g.position.x - u.g.position.x, first.g.position.z - u.g.position.z);
        }
        if (fxDesign(u) && !ev.pet) {
          // SD design hero: attack motion for single strikes, skill motion for area / support skills, plus the class effects
          const d = fxDesign(u), U = FXU[d] || {};
          if (ev.sup) {
            if (U.heal != null) for (const i of ev.tg.slice(0, 4)) spawnFx(d, U.heal, head(units[i]), 1.25, { dur: 0.7 });
            if (U.circle != null) spawnFx(d, U.circle, u.g.position, 2.6, { flat: true, dur: 1.1 });
            else if (U.buff != null) spawnFx(d, U.buff, new THREE.Vector3(u.g.position.x, 1.1, u.g.position.z), 2.1, { dur: 0.8 });
            else if (U.guard != null) spawnFx(d, U.guard, head(u), 1.5, { dur: 0.7 });
            if (U.bless != null) spawnFx(d, U.bless, new THREE.Vector3(u.g.position.x, u.h + 0.4, u.g.position.z), 1.5, { dur: 0.8 });
            if (U.heal == null && U.circle == null && U.buff == null) popRing(u.g.position.x, u.g.position.z, 1.6, '#9dffb0');
          } else if (first) {
            const dx = first.g.position.x - u.g.position.x, dz = first.g.position.z - u.g.position.z, dist2 = Math.hypot(dx, dz) || 1, flip = dx < 0;
            u.lunge = { x: dx / dist2, z: dz / dist2 };
            if (!aoe && dist2 > T * 1.6 && U.proj != null) {
              const tgt = head(first); spawnFx(d, U.proj, tgt, 0.95, { from: head(u), flip, dur: 0.3, onEnd: () => spawnFx(d, U.finish != null ? U.finish : U.aoe, tgt, 1.0, { dur: 0.35 }) });
            } else if (!aoe) spawnFx(d, U.melee != null ? U.melee : U.aoe, head(first), 1.2, { flip, dur: 0.45 });
            else {
              const c = cen(), r = (ev.ar || 1) * T;
              if (U.circle != null) spawnFx(d, U.circle, c, r * 2 + 1.2, { flat: true, dur: 1.0 });
              if (U.chant != null) spawnFx(d, U.chant, head(u), 1.3, { flip, dur: 0.6 });
              spawnFx(d, U.aoe, new THREE.Vector3(c.x, 1.0, c.z), Math.min(3.0, r * 1.0 + 1.2), { flip, dur: 0.6 });
            }
          }
          return aoe || ev.sup ? 0.42 : 0.32;
        }
        if (first && !ev.sup) {
          const dx = first.g.position.x - u.g.position.x, dz = first.g.position.z - u.g.position.z, d = Math.hypot(dx, dz) || 1;
          u.lunge = { x: dx / d, z: dz / d };
          if (ev.sh !== 'S') { const c = cen(); popRing(c.x, c.z, (ev.ar || 1) * T + 0.6, col); }
          if (d > T * 1.6) for (const i of ev.tg.slice(0, 6)) popBolt(head(u), head(units[i]), col);
        } else if (ev.sup) popRing(u.g.position.x, u.g.position.z, 1.6, '#9dffb0');
        return 0.3;
      }
      case 'hit': {
        const t = units[ev.t], c = p.cur;
        t.hp = ev.hp; t.sh = ev.sh; drawBar(t);
        if (ev.k === 3) { popNum('빗나감', '#cfd3d8', head(t)); if (c) c.miss++; }
        else if (ev.k === 5) { popNum('면역', '#9fe7ff', head(t)); if (c) c.miss++; }
        else {
          t.hit = 1; t.lastHit = animT; t.bigHit = ev.d > t.m.hpMax * 0.12;
          if ((t.sheet || t.toon) && t.an.st !== 'attack' && t.an.st !== 'skill' && ev.d > 0) setAnim(t, 'hit');
          const col = ev.k === 1 ? '#ffd23f' : ev.k === 2 ? '#b9c4cf' : ev.k === 4 ? '#c59bff' : '#ffffff';
          popNum((ev.k === 2 ? '🛡' : '') + fmt(ev.d) + (ev.k === 1 ? '!' : ''), col, head(t), ev.k === 1);
          if (c) { c.dmg += ev.d; c.n++; if (ev.k === 1) c.crit++; if (ev.k === 2) c.block++; }
        }
        p.hooks.onHp && p.hooks.onHp();
        return p.burst > 10 ? 0.022 : 0.06;
      }
      case 'heal': { const t = units[ev.t]; t.hp = ev.hp; drawBar(t); popNum('+' + fmt(ev.v), '#7dff9a', head(t)); p.hooks.onHp && p.hooks.onHp(); return 0.06; }
      case 'shield': { const t = units[ev.t]; t.sh = ev.sh; drawBar(t); popNum('실드 +' + fmt(ev.v), '#bfe6ff', head(t)); return 0.06; }
      case 'st': { const t = units[ev.t]; applySt(t, ev); drawBar(t); return 0; }
      case 'spawn': { const u = units[ev.u]; if (ev.hp) u.m.hpMax = ev.hp; u.g.position.set(ux(u, ev.y), 0, uz(u, ev.x)); u.gx = ev.x; u.gy = ev.y; u.g.visible = true; u.alive = true; u.hidden = false; u.hp = u.m.hpMax; u.sh = 0; u.sts.clear(); u.fall = 0; u.card.rotation.x = 0; u.mat.opacity = 1; if (!u.sprite) u.mat.color.setScalar(1); u.barS.visible = true; drawBar(u); const word = ev.sum ? '소환' : '실체화'; popRing(u.g.position.x, u.g.position.z, 1.6, ev.sum ? '#c9b8ff' : '#ffe9a8'); popLabel(`${u.m.name} ${word}!`, ev.sum ? '#d9ccff' : '#ffe9a8', new THREE.Vector3(u.g.position.x, u.h + 0.9, u.g.position.z)); term.line(`  ✦ ${u.m.name} ${word}`, '#ffd24a'); return ev.sum ? 0.22 : 0.3; }
      case 'trap': { trapEv(ev); if (ev.on && !ev.burn) popRing(wx(ev.y), wz(ev.x), 0.9, '#ff9a4a'); return ev.on && !ev.burn ? 0.08 : 0; }
      case 'die': {
        const u = units[ev.u];
        // a summon leaves the board (it fades at the end of its life or when it falls)
        if (u.m.sum) { u.alive = false; u.barS.visible = false; u.g.visible = false; u.hidden = true; popRing(u.g.position.x, u.g.position.z, 1.1, '#cfc6ff'); term.line(`  ○ ${u.m.name} ${ev.fade ? '소멸' : '쓰러짐'}`, '#8f8b80'); return 0.12; }
        u.alive = false; u.fall = 0.001; u.barS.visible = false; term.line(`  ✝ ${uname(u.m)} 쓰러짐`, '#8f8b80');
        // finishing blow by an SD-sheet hero: its finisher effect on the fallen unit
        const src = p.cur && units[p.cur.src];
        if (fxDesign(src) && src.m.team !== u.m.team) { const U = FXU[fxDesign(src)] || {}; if (U.finish != null) spawnFx(fxDesign(src), U.finish, head(u), 1.7, { dur: 0.6, flip: u.g.position.x < src.g.position.x }); }
        return 0.18;
      }
      case 'skip': { const u = units[ev.u]; popNum('행동 불가', '#9fd2ff', head(u)); return 0.2; }
      case 'end': { flushCast(); ring.visible = false; return 0.3; }
      default: return 0;
    }
  }
  function startReplay(events, meta, hooks = {}) {
    const names = {}; meta.forEach((m) => { if (m.kind === 'mob') names[m.name] = (names[m.name] || 0) + 1; });
    meta.forEach((m) => { m.dup = m.kind === 'mob' && names[m.name] > 1; });
    setRoster(meta);
    // action starts (each unit turn) for stepping and the timeline
    const starts = []; events.forEach((e, i) => { if (e.e === 'turn') starts.push(i); });
    play = { ev: events, i: 0, wait: 0.5, round: 0, cur: null, hooks, burst: 0, done: false, starts, stopAt: null };
    paused = false;
  }
  function stepReplay(dt) {
    const p = play; if (!p || p.done || paused) return;
    p.wait -= dt * speed;
    let guard = 0;
    while (p.wait <= 0 && p.i < p.ev.length && guard++ < 40) {
      if (p.stopAt != null && p.i >= p.stopAt) { p.stopAt = null; paused = true; p.hooks.onPause && p.hooks.onPause(); break; }
      const ev = p.ev[p.i++];
      if (ev.e === 'cast') { let n = 0; for (let j = p.i; j < p.ev.length && (p.ev[j].e === 'hit' || p.ev[j].e === 'st' || p.ev[j].e === 'die' || p.ev[j].e === 'move'); j++) if (p.ev[j].e === 'hit') n++; p.burst = n; }
      p.wait += doEvent(ev);
      p.hooks.onEvent && p.hooks.onEvent(p.i);
      if (ev.e === 'end') { p.done = true; p.hooks.onEnd && p.hooks.onEnd(ev); break; }
    }
  }
  /* ── seeking: rebuild the board state at event index i without effects ── */
  function resetUnits() {
    for (const u of units) {
      const m = u.m;
      u.g.position.set(ux(u, m.y), 0, uz(u, m.x)); u.gx = m.x; u.gy = m.y;
      u.hp = m.hpMax; u.sh = 0; u.alive = !m.out; u.hidden = !!m.out; u.g.visible = !m.out;
      u.fall = 0; u.atk = -1; u.hit = 0; u.tw = null; u.lunge = null; u.card.rotation.x = 0; u.mat.opacity = 1; if (!u.sprite) u.mat.color.setScalar(1);
      u.barS.visible = true; u.sts.clear(); u.tn = 0;
      if (u.toon) { u.yawT = u.m.team ? -1.0 : 1.0; u.yaw = u.yawT; }
    }
  }
  function applySilent(ev, p) {
    switch (ev.e) {
      case 'turn': { const u = units[ev.u]; u.tn++; p.round = ev.r; ring.visible = true; ring.position.x = u.g.position.x; ring.position.z = u.g.position.z; ring.material.color.set(u.m.team ? 0xffb3a8 : 0xa8ccff); break; }
      case 'move': { const u = units[ev.u]; u.gx = ev.x; u.gy = ev.y; u.g.position.set(ux(u, ev.y), 0, uz(u, ev.x)); break; }
      case 'hit': { const t = units[ev.t]; t.hp = ev.hp; t.sh = ev.sh; break; }
      case 'heal': units[ev.t].hp = ev.hp; break;
      case 'shield': units[ev.t].sh = ev.sh; break;
      case 'st': applySt(units[ev.t], ev); break;
      case 'spawn': { const u = units[ev.u]; if (ev.hp) u.m.hpMax = ev.hp; u.g.position.set(ux(u, ev.y), 0, uz(u, ev.x)); u.gx = ev.x; u.gy = ev.y; u.g.visible = true; u.alive = true; u.hidden = false; u.hp = u.m.hpMax; u.sh = 0; u.sts.clear(); u.fall = 0; u.barS.visible = true; break; }
      case 'trap': trapEv(ev); break;
      case 'die': { const u = units[ev.u]; u.alive = false; u.barS.visible = false; if (u.m.sum) { u.g.visible = false; u.hidden = true; } else u.fall = 1; break; }
      case 'end': ring.visible = false; break;
    }
  }
  function clearFx() { for (const n of fxs) { n.life = 0; n.onEnd = null; n.s.visible = false; } for (const n of flats) { n.life = 0; n.m.visible = false; } for (const u of units) u.an = { st: 'idle', t0: animT }; for (const n of nums) { n.life = 0; n.s.visible = false; } for (const n of labels) { n.life = 0; n.s.visible = false; } for (const n of rings) { n.life = 0; n.m.visible = false; } for (const n of bolts) { n.life = 0; n.m.visible = false; } }
  function seek(i) {
    const p = play; if (!p) return;
    i = Math.max(0, Math.min(p.ev.length, i | 0));
    resetUnits(); clearFx(); clearTraps(); p.round = 0; p.cur = null; p.stopAt = null; ring.visible = false;
    for (let j = 0; j < i; j++) applySilent(p.ev[j], p);
    for (const u of units) { if (u.fall >= 1) u.card.rotation.x = -1.42; drawBar(u); }
    const wasDone = p.done;
    p.i = i; p.wait = 0.12; p.done = i >= p.ev.length;
    p.hooks.onRound && p.round && p.hooks.onRound(p.round);
    p.hooks.onSeek && p.hooks.onSeek(i);
    p.hooks.onEvent && p.hooks.onEvent(i);
    if (p.done && !wasDone) { const last = p.ev[p.ev.length - 1]; if (last && last.e === 'end') p.hooks.onEnd && p.hooks.onEnd(last); }
  }
  /** previous / next action: back jumps to the start of the action just played, forward plays one action then pauses */
  function stepAction(dir) {
    const p = play; if (!p) return;
    if (dir < 0) { let s = 0; for (const x of p.starts) { if (x < p.i) s = x; else break; } paused = true; seek(s); p.hooks.onPause && p.hooks.onPause(); return; }
    if (p.done) return;
    const next = p.starts.find((x) => x > p.i);
    p.stopAt = next != null ? next : null; paused = false; p.hooks.onResume && p.hooks.onResume();
  }

  /* frame loop */
  const clock = new THREE.Clock();
  let tAll = 0, frame = 0, running = true;
  let camR = 17.5;
  function resize() { const w = canvas.clientWidth || 800, h = canvas.clientHeight || 500; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.25 ? 48 : 36; camR = w / h < 1.25 ? 22 : 18.4; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  new ResizeObserver(resize).observe(canvas); resize();
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.25, clock.getDelta()); tAll += dt; frame++;
    stepReplay(dt);
    const a = paused ? 0 : dt * speed;
    animT += a;
    for (const g of trapM.values()) { if (g.userData.flat) { g.children[0].material.opacity = 0.7 + Math.sin(animT * 6 + g.userData.ph) * 0.15; continue; } g.position.y = 0.45 + Math.sin(animT * 4 + g.userData.ph) * 0.07; g.children[0].rotation.y += a * 2.2; }
    for (const u of units) {
      const g = u.g;
      if (u.tw) { const w = u.tw; w.k = Math.min(1, w.k + a / w.d); const k = w.k * w.k * (3 - 2 * w.k); g.position.x = w.x0 + (w.x1 - w.x0) * k; g.position.z = w.z0 + (w.z1 - w.z0) * k; g.position.y = Math.sin(Math.PI * w.k) * w.hop * (u.toon ? 0.5 : 1); if (w.k >= 1) { u.tw = null; g.position.y = 0; } }
      if (u.toon) {
        // cel-shaded 3D unit: face the action (blended a little toward the camera so faces stay readable), bone animation by state
        if (u.an.st === 'idle' && !u.tw) { const toward = topView ? u.yawT : u.yawT * 0.72; u.yaw += angDiff(toward, u.yaw) * Math.min(1, dt * 5); }
        else u.yaw += angDiff(u.yawT, u.yaw) * Math.min(1, dt * 12);
        u.toon.root.rotation.y = u.yaw;
        let st = u.an.st, el = animT - u.an.t0;
        if ((st === 'attack' || st === 'skill' || st === 'hit') && el >= toonLen(st)) { u.an = { st: 'idle', t0: animT }; st = 'idle'; el = 0; }
        if (st === 'move' && !u.tw && el > 0.25) { u.an = { st: 'idle', t0: animT }; st = 'idle'; el = 0; }
        if (u.fall > 0) u.fall = Math.min(1, u.fall + a / 0.5);
        animToon(u.toon, st, el, tAll, { style: u.style, dead: u.fall });
        flashToon(u.toon, u.hit > 0 ? u.hit : 0); if (u.hit > 0) u.hit = Math.max(0, u.hit - a / 0.3);
        const md = moodOf(u); setMood(u.toon, md === 'focus' || md === 'cast' ? md : md);
        u.barS.position.set(0, u.h + 0.4, 0);
        continue;
      }
      let lx = 0, lz = 0, tilt = 0;
      if (u.atk >= 0) { u.atk += a / 0.5; const k = Math.sin(Math.PI * Math.min(1, Math.max(0, (u.atk - 0.2) / 0.6))); if (u.lunge && !u.sprite) { lx = u.lunge.x * k * 0.55; lz = u.lunge.z * k * 0.55; tilt = k * 0.28 * (u.lunge.x >= 0 ? -1 : 1); } else if (u.lunge) { lx = u.lunge.x * k * 0.25; lz = u.lunge.z * k * 0.25; } if (u.atk >= 1) { u.atk = -1; u.lunge = null; } }
      if (u.hit > 0) { u.hit = Math.max(0, u.hit - a / 0.3); lx += Math.sin(u.hit * 40) * 0.07 * u.hit; if (!u.sprite) u.mat.color.setRGB(1, 1 - 0.6 * u.hit, 1 - 0.6 * u.hit); }
      const bob = u.alive ? Math.sin(tAll * 2.4 + u.seed) * 0.035 : 0;
      u.card.position.set(lx, 0.1 + bob, lz);
      const cdx = camera.position.x - g.position.x, cdz = camera.position.z - g.position.z;
      u.card.rotation.y = Math.atan2(cdx, cdz);
      // seen from above, lean the paper standee back so it faces the camera instead of showing its edge
      const lean = topView ? -Math.atan2(camera.position.y - u.h * 0.4, Math.hypot(cdx, cdz)) * 0.9 : 0;
      if (u.fall > 0) { u.fall = Math.min(1, u.fall + a / 0.45); u.card.rotation.x = Math.min(lean, -1.42 * u.fall * u.fall); u.mat.opacity = 1 - 0.35 * u.fall; if (!u.sprite) u.mat.color.setScalar(1 - 0.45 * u.fall); } else u.card.rotation.x = lean;
      { const hd = Math.hypot(cdx, cdz) || 1, off = topView ? Math.sin(-lean) * u.h * 0.95 : 0; u.barS.position.set(-cdx / hd * off, topView ? Math.cos(-lean) * u.h + 0.4 : u.h + 0.55, -cdz / hd * off); }
      u.card.rotation.z = tilt + (u.alive && !u.sprite ? Math.sin(tAll * 1.9 + u.seed) * 0.03 : 0);
      if (!u.sprite && u.alive) { const s = 1 + Math.sin(tAll * 2.4 + u.seed) * 0.025; u.card.scale.set(2 - s, s, 1); }
      if (u.sheet) {
        // state machine: one-shot attack / skill / hit return to idle; move lasts while the unit walks
        let st = u.an.st, el = animT - u.an.t0;
        if ((st === 'attack' || st === 'skill' || st === 'hit') && el >= sheetAnimLen(u.sprite.d, st)) { u.an = { st: 'idle', t0: animT }; st = 'idle'; el = 0; }
        if (st === 'move' && !u.tw && el > 0.2) { u.an = { st: 'idle', t0: animT }; st = 'idle'; el = 0; }
        if (u.sprite.draw(tAll, { st, el, hit: u.hit, flip: flipOf(u), dead: !u.alive })) u.tex.needsUpdate = true;
      } else if (u.sprite && (u.atk >= 0 || u.hit > 0 || (frame + u.frame) % 3 === 0 || u.fall > 0)) { u.sprite.draw(tAll, { atk: u.atk, hit: u.hit, flip: u.m.team === 1, dead: !u.alive }); u.tex.needsUpdate = true; }
    }
    for (const n of nums) if (n.life > 0) { n.life -= dt * 1.25 * Math.max(1, speed * 0.7); n.s.position.y += dt * 1.5; const k = 1 - n.life, pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15)); n.s.scale.set(n.sc * pop, n.sc * pop * 0.375, 1); n.s.material.opacity = Math.min(1, n.life * 2.2); if (n.life <= 0) n.s.visible = false; }
    for (const n of labels) if (n.life > 0) { n.life -= dt * 1.15 * Math.max(1, speed * 0.6); n.s.material.opacity = Math.min(1, n.life * 3); n.s.position.y += dt * 0.25; if (n.life <= 0) n.s.visible = false; }
    for (const n of fxs) if (n.life > 0) {
      n.life -= a / n.dur; const k = 1 - Math.max(0, n.life);
      if (n.proj) { n.s.position.lerpVectors(n.from, n.to, Math.min(1, k)); n.s.position.y += Math.sin(Math.PI * Math.min(1, k)) * 0.4; n.s.scale.set(n.size * n.ar, n.size, 1); }
      else { const sc = n.size * (0.72 + 0.38 * Math.min(1, k * 3)); n.s.scale.set(sc * n.ar, sc, 1); n.s.material.opacity = k < 0.55 ? 1 : Math.max(0, (1 - k) / 0.45); }
      if (n.life <= 0) { n.s.visible = false; if (n.onEnd) { const f = n.onEnd; n.onEnd = null; f(); } }
    }
    for (const n of flats) if (n.life > 0) {
      n.life -= a / n.dur; const k = 1 - Math.max(0, n.life), sc = n.size * (0.55 + 0.45 * Math.min(1, k * 3));
      n.m.scale.set(sc * n.ar, sc, 1); n.m.rotation.z += a * 0.8; n.m.material.opacity = k < 0.6 ? Math.min(1, k * 5) : Math.max(0, (1 - k) / 0.4);
      if (n.life <= 0) n.m.visible = false;
    }
    for (const n of rings) if (n.life > 0) { n.life -= dt * 2.4; const k = 1 - Math.max(0, n.life); n.m.scale.setScalar(n.r * (0.25 + 0.75 * k)); n.m.material.opacity = Math.max(0, n.life) * 0.85; if (n.life <= 0) n.m.visible = false; }
    for (const n of bolts) if (n.life > 0) { n.life -= dt * 5.2 * Math.max(1, speed * 0.6); const k = 1 - Math.max(0, n.life); n.m.position.lerpVectors(n.a, n.b, k); n.m.position.y += Math.sin(Math.PI * k) * 0.9; n.m.material.opacity = 0.95; if (n.life <= 0) n.m.visible = false; }
    // ambience
    for (const [c, ph, amp] of sways) { c.rotation.z = Math.sin(tAll * 0.9 + ph) * 0.035 * amp; c.rotation.x = Math.cos(tAll * 0.7 + ph) * 0.025 * amp; }
    for (const g of clouds) { g.userData.a += dt * g.userData.sp; g.position.x = Math.cos(g.userData.a) * g.userData.r; g.position.z = Math.sin(g.userData.a) * g.userData.r; }
    for (const [g, y0, ph] of islets) g.position.y = y0 + Math.sin(tAll * 0.5 + ph) * 0.5;
    world.position.y = Math.sin(tAll * 0.35) * 0.12; unitsG.position.y = fxG.position.y = world.position.y; ring.position.y = 0.2 + world.position.y;
    for (let i = 0; i < flyN; i++) { const s = flySeed[i]; flyPos[i * 3] = s[0] + Math.sin(tAll * 0.3 * s[4] + s[3]) * 2.2; flyPos[i * 3 + 1] = s[1] + Math.sin(tAll * 0.5 * s[4] + s[3] * 2) * 0.7; flyPos[i * 3 + 2] = s[2] + Math.cos(tAll * 0.27 * s[4] + s[3]) * 2.2; }
    flyGeo.attributes.position.needsUpdate = true;
    for (const [cl, ph] of banners) { const p = cl.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3 + tAll * 3 + ph) * 0.09 * (p.getX(i) + 0.55)); p.needsUpdate = true; }
    fall.tex.offset.y = (tAll * 0.9) % 1; water.material.opacity = 0.84 + Math.sin(tAll * 1.3) * 0.04;
    glowL.intensity = 13 + Math.sin(tAll * 9) * 0.6 + (term.status ? 4 : 0); led.material.color.setHex(term.status && Math.floor(tAll * 6) % 2 ? 0xffd9c8 : 0xd97757);
    term.draw(tAll);
    if (!userMoved) {
      if (topView) camera.position.set(0, camR * 1.32, 2.2); // duel-field style: straight over the board
      else { const az = Math.sin(tAll * 0.12) * 0.15; camera.position.set(Math.sin(az) * camR, camR * 0.49, Math.cos(az) * camR - 2.4); }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  tick();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; } else if (!running) { running = true; clock.getDelta(); tick(); } });

  /* ground theme + camera presets */
  const leafAll = [...leafMats, ...pineMat], leafOrig = leafAll.map((m) => m.color.clone()), tmpC = new THREE.Color();
  function setGround(key) {
    const g = GROUNDS[key] || GROUNDS.forest;
    paintTiles(g.tile);
    tiles.material.map = g.sand ? sandTex : null; tiles.material.needsUpdate = true; cracks.visible = !!g.sand;
    grass.material.color.set(g.grass);
    leafAll.forEach((m, i) => { m.color.copy(leafOrig[i]); if (g.leaf) m.color.lerp(tmpC.set(g.leaf[0]), g.leaf[1]); });
    sky.material.uniforms.top.value.set(g.sky[0]); sky.material.uniforms.mid.value.set(g.sky[1]); sky.material.uniforms.bot.value.set(g.sky[2]);
    scene.fog.color.set(g.fog); hemi.color.set(g.hemi[0]); hemi.groundColor.set(g.hemi[1]); hemi.intensity = g.hemi[2];
    sun.color.set(g.sun[0]); sun.intensity = g.sun[1]; renderer.toneMappingExposure = g.exp;
  }
  function setTopView(on) { topView = !!on; userMoved = false; controls.minPolarAngle = topView ? 0 : 0.45; controls.target.set(0, topView ? 0 : 3.0, topView ? 0 : -3.0); }

  return {
    term, setRoster, setGround, setTopView, isTopView: () => topView,
    /** rebuild the unit models in place (the glTF heroes arrived) and return to the same replay moment */
    refreshModels() { if (!units.length) return; const meta = units.map((u) => u.m), at = play ? play.i : null, was = paused; setRoster(meta); if (play && at != null) { seek(at); paused = was; } },
    play: startReplay,
    stop() { play = null; ring.visible = false; },
    setSpeed(v) { speed = v; }, setPaused(v) { paused = v; }, isPaused: () => paused, isPlaying: () => !!(play && !play.done),
    skip() { if (!play || play.done) return; seek(play.ev.length); },
    seek, stepAction,
    pos: () => (play ? { i: play.i, n: play.ev.length, round: play.round, done: play.done } : null),
    /** live board state for the side panels: HP, shield, alive, cell, statuses with own turns left */
    live: () => units.map((u) => ({ m: u.m, d: u.sheet ? u.sprite.d : null, mood: moodOf(u), hp: u.hp, sh: u.sh, alive: u.alive, hidden: !!u.hidden, x: u.gx, y: u.gy, sts: [...u.sts].sort((a, b) => stOrder(a) - stOrder(b)).map(([k, e]) => ({ k, n: e.n, b: e.b, left: e.d ? Math.max(1, e.at + e.d - u.tn) : 0 })) })),
    teamHp() { const o = [[0, 0], [0, 0]]; for (const u of units) { if (u.m.pet) continue; o[u.m.team][0] += Math.max(0, u.hp); o[u.m.team][1] += u.m.hpMax; } return o; },
    resetView() { setTopView(false); },
    zoom(f) { userMoved = true; const v = camera.position.clone().sub(controls.target); v.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, v.length() * f))); camera.position.copy(controls.target).add(v); },
  };
}
