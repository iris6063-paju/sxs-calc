// 3D diorama: a floating forest island, a Claude-Code-style terminal monolith, and paper standees that replay a fight.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { HeroSprite, drawMob, drawPet, EL } from './sprites.js';
import { MOB, PET } from './engine.js';

const T = 1.2;                       // world size of one grid cell
const wx = (gy) => (gy - 10) * T;    // grid row  → world x (team A on the left)
const wz = (gx) => (gx - 10) * T;    // grid col  → world z
const TEAM = [0x4d8dff, 0xff5d5d];
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
  scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x6f9050, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
  sun.position.set(14, 24, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('#fff6d8'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunDisc.scale.set(46, 46, 1); sunDisc.position.set(70, 78, -120); scene.add(sunDisc);

  /* island */
  const world = new THREE.Group(); scene.add(world);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...o });
  const wob = (a) => 1 + 0.05 * Math.sin(a * 3 + 0.6) + 0.035 * Math.sin(a * 7 + 1.9) + 0.02 * Math.sin(a * 13);
  const top = new THREE.CylinderGeometry(20, 20.4, 1.2, 72, 1);
  { const p = top.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const k = wob(Math.atan2(z, x)); p.setX(i, x * k); p.setZ(i, z * k); } top.computeVertexNormals(); }
  const grass = new THREE.Mesh(top, std(0x86c45c)); grass.position.y = -0.6; grass.receiveShadow = true; world.add(grass);
  const under = new THREE.CylinderGeometry(20.2, 2.4, 17, 44, 7);
  { const p = under.attributes.position, col = []; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x), k = wob(a) * (1 + (R() - 0.5) * 0.16 * (y < 8 ? 1 : 0)); p.setX(i, x * k); p.setZ(i, z * k); const tt = (y + 8.5) / 17; const c = new THREE.Color().setHSL(0.07 + 0.02 * R(), 0.32, 0.16 + 0.22 * tt + 0.05 * R()); col.push(c.r, c.g, c.b); } under.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); under.computeVertexNormals(); }
  const rock = new THREE.Mesh(under, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); rock.position.y = -9.7; world.add(rock);

  /* arena tiles */
  const cells = [];
  for (let gx = 4; gx <= 16; gx++) for (let gy = 3; gy <= 17; gy++) cells.push([gx, gy]);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.94, 0.1, T * 0.94), std(0xffffff, { roughness: 0.85 }), cells.length);
  const m4 = new THREE.Matrix4(), tc = new THREE.Color();
  cells.forEach(([gx, gy], i) => {
    m4.makeTranslation(wx(gy), 0.03, wz(gx)); tiles.setMatrixAt(i, m4);
    const odd = (gx + gy) & 1;
    tc.set(odd ? 0xa7d77a : 0x9bcf6f);
    if (gy >= 6 && gy <= 9 && gx >= 8 && gx <= 12) tc.lerp(new THREE.Color(0x7fb2ff), 0.3);
    if (gy >= 11 && gy <= 14 && gx >= 8 && gx <= 12) tc.lerp(new THREE.Color(0xff9a8a), 0.3);
    tiles.setColorAt(i, tc);
  });
  tiles.receiveShadow = true; world.add(tiles);
  const inArena = (x, z, pad = 0.6) => Math.abs(x) < 8.4 + pad + 0.6 && Math.abs(z) < 7.2 + pad + 0.6;

  /* trees, rocks, flowers, grass */
  const trunkMat = std(0x7a5536), pineMat = [std(0x3f8a4d, { flatShading: true }), std(0x4c9c57, { flatShading: true })];
  const leafMats = [0x5fae4a, 0x74bf52, 0x4e9a45, 0x8fcf5a, 0xf2a7c3, 0xf0b54a].map((c) => std(c, { flatShading: true }));
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1, 6), coneGeo = new THREE.ConeGeometry(1, 1.25, 7), blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const sways = [];
  function tree(x, z, s = 1, kind) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    const h = 1.5 + R() * 1.4;
    const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.scale.y = h; tr.position.y = h / 2; tr.castShadow = true; g.add(tr);
    const crown = new THREE.Group(); crown.position.y = h; g.add(crown);
    if (kind === 'pine' || (kind == null && R() < 0.45)) {
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(coneGeo, pineMat[i & 1]); const k = 1.05 - i * 0.24; c.scale.set(k, 1, k); c.position.y = -0.25 + i * 0.72; c.castShadow = true; crown.add(c); }
    } else {
      const mat = leafMats[R() < 0.8 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 2)];
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(blobGeo, mat); const k = 0.95 - i * 0.16; b.scale.set(k * (0.9 + R() * 0.3), k * 0.85, k * (0.9 + R() * 0.3)); b.position.set((R() - 0.5) * 0.9, 0.35 + i * 0.5, (R() - 0.5) * 0.9); b.rotation.set(R() * 3, R() * 3, R() * 3); b.castShadow = true; crown.add(b); }
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
  function boulder(x, z, s) { const m = new THREE.Mesh(rockGeo, rockMat[Math.floor(R() * 3)]); m.position.set(x, s * 0.35, z); m.scale.set(s * (0.8 + R() * 0.5), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.5)); m.rotation.set(R() * 3, R() * 3, R() * 3); m.castShadow = m.receiveShadow = true; world.add(m); return m; }
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
  for (let i = 0; i < 14; i++) { const [tx, tz] = spots[Math.floor(R() * spots.length)]; const x = tx + (R() - 0.5) * 1.8, z = tz + (R() - 0.5) * 1.8; if (inArena(x, z, 0.3)) continue; const s = 0.8 + R() * 0.9; const st = new THREE.Mesh(stemGeo, stemMat); st.position.set(x, 0.11 * s, z); st.scale.setScalar(s); const cp = new THREE.Mesh(capGeo, capMat); cp.position.set(x, 0.2 * s, z); cp.scale.setScalar(s); cp.castShadow = true; world.add(st, cp); }

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
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false });
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
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5, 6, 1), new THREE.MeshStandardMaterial({ color: TEAM[t], side: THREE.DoubleSide, roughness: 0.8 })); cloth.position.set(x + (t ? -0.6 : 0.6), 2.55, z); cloth.castShadow = true;
    world.add(pole, cloth); banners.push([cloth, R() * 6]);
  }));

  /* Claude-Code-style terminal monolith */
  const term = new Terminal();
  const tg = new THREE.Group(); tg.position.set(0, 0, -10.6); tg.scale.setScalar(1.04); world.add(tg);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.0, 2.6), std(0x8d9087, { flatShading: true })); plinth.position.y = 0.5; plinth.castShadow = plinth.receiveShadow = true; tg.add(plinth);
  const moss = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.14, 2.7), std(0x6fae4f)); moss.position.y = 1.03; tg.add(moss);
  const body = new THREE.Mesh(new THREE.BoxGeometry(8.0, 5.3, 0.7), std(0x262422, { roughness: 0.55 })); body.position.set(0, 3.9, 0); body.castShadow = true; tg.add(body);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(8.3, 5.6, 0.5), std(0x3a3733, { roughness: 0.6 })); bezel.position.set(0, 3.9, -0.14); bezel.castShadow = true; tg.add(bezel);
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
    const u = { m, g, hp: m.hpMax, sh: 0, alive: true, atk: -1, hit: 0, fall: 0, tw: null, seed: i * 1.7, lunge: null, frame: i };
    const pet = m.kind === 'pet' ? PET.get(m.petId) : null;
    const mob = m.kind === 'mob' ? MOB.get(m.key) : pet ? { ty: 0 } : null;
    const h = mob ? (mob.ty === 2 ? 2.5 : mob.ty === 1 ? 1.75 : pet ? 1.3 : 1.38) : 2.05, w = mob ? h : h / 1.2;
    let tex;
    if (mob) {
      const tk = pet ? 'pet' + m.petId : m.key;
      let e = mobTex.get(tk);
      if (!e) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; e = { cv, tex: new THREE.CanvasTexture(cv), draw: () => { if (pet) drawPet(cv.getContext('2d'), 256, 256, pet); else drawMob(cv.getContext('2d'), 256, 256, mob); e.tex.needsUpdate = true; } }; e.tex.colorSpace = THREE.SRGBColorSpace; e.draw(); mobTex.set(tk, e); }
      tex = e.tex;
    }
    else { u.sprite = new HeroSprite(m.cls, m.name, 256); u.sprite.draw(0, { flip: m.team === 1 }); tex = new THREE.CanvasTexture(u.sprite.canvas); tex.colorSpace = THREE.SRGBColorSpace; }
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    u.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
    u.card = new THREE.Mesh(geo, u.mat); u.card.rotation.order = 'YXZ'; u.card.position.y = 0.1; u.tex = tex; u.h = h;
    const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: TEAM[m.team], roughness: 0.5 })); base.position.y = 0.11; base.castShadow = true; base.scale.setScalar(mob && mob.ty === 2 ? 1.5 : 1);
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.09; sh.scale.setScalar(mob && mob.ty === 2 ? 1.6 : 1.1);
    u.bar = textTexture(128, 20);
    u.barS = new THREE.Sprite(new THREE.SpriteMaterial({ map: u.bar.tex, transparent: true, depthTest: false, toneMapped: false })); u.barS.scale.set(1.05, 0.165, 1); u.barS.position.y = h + 0.34; u.barS.renderOrder = 5;
    g.add(sh, base, u.card, u.barS); g.position.set(wx(m.y), 0, wz(m.x));
    if (m.out) { g.visible = false; u.alive = false; u.hidden = true; }
    drawBar(u); unitsG.add(g); return u;
  }
  window.addEventListener('sxs-art', () => { for (const e of mobTex.values()) e.draw(); });
  function drawBar(u) {
    const c = u.bar.ctx, f = Math.max(0, u.hp / u.m.hpMax), s = Math.min(1, u.sh / u.m.hpMax);
    c.clearRect(0, 0, 128, 20); c.fillStyle = 'rgba(20,16,14,.85)'; c.beginPath(); c.roundRect(0, 0, 128, 20, 8); c.fill();
    c.fillStyle = u.m.team ? '#ff6b5e' : '#5aa2ff'; c.beginPath(); c.roundRect(3, 3, Math.max(4, 122 * f), 14, 6); c.fill();
    if (s > 0) { c.fillStyle = 'rgba(240,248,255,.92)'; c.beginPath(); c.roundRect(3, 3, Math.max(4, 122 * s), 5, 3); c.fill(); }
    u.bar.tex.needsUpdate = true;
  }
  function disposeUnits() { for (const u of units) { unitsG.remove(u.g); u.card.geometry.dispose(); u.mat.dispose(); u.bar.tex.dispose(); if (u.sprite) u.tex.dispose(); } units = []; }
  function setRoster(meta) { disposeUnits(); units = meta.map(makeUnit); ring.visible = false; }

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
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; ring.visible = false; scene.add(ring);

  /* replay */
  let play = null, speed = 1, paused = false;
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
      case 'turn': { flushCast(); const u = units[ev.u]; ring.visible = true; ring.position.x = u.g.position.x; ring.position.z = u.g.position.z; ring.material.color.set(u.m.team ? 0xffb3a8 : 0xa8ccff); if (ev.r !== p.round) { p.round = ev.r; p.hooks.onRound && p.hooks.onRound(ev.r); } return 0.07; }
      case 'move': { const u = units[ev.u]; u.tw = { x0: u.g.position.x, z0: u.g.position.z, x1: wx(ev.y), z1: wz(ev.x), k: 0, d: ev.pull ? 0.2 : 0.26, hop: ev.leap ? 1.5 : ev.pull ? 0.15 : 0.45 }; return ev.pull ? 0.08 : 0.24; }
      case 'cast': {
        flushCast(); const u = units[ev.u]; u.atk = 0;
        const col = (EL[ev.el] || EL.none).c;
        popLabel(ev.n, col, new THREE.Vector3(u.g.position.x, u.h + 0.95, u.g.position.z));
        p.cur = { dmg: 0, n: 0, crit: 0, block: 0, miss: 0, team: u.m.team, sup: ev.sup, el: ev.el, src: ev.u };
        const first = ev.tg.length ? units[ev.tg[0]] : null;
        term.line(`R${p.round} ${uname(u.m)} ▸ ${ev.n}${first ? ' → ' + uname(first.m) + (ev.tg.length > 1 ? ` 외 ${ev.tg.length - 1}` : '') : ''}`, '#e8e4d8');
        if (first && !ev.sup) {
          const dx = first.g.position.x - u.g.position.x, dz = first.g.position.z - u.g.position.z, d = Math.hypot(dx, dz) || 1;
          u.lunge = { x: dx / d, z: dz / d };
          if (ev.sh !== 'S') popRing(ev.sh === 'T' || ev.sh === 'TQ' ? wx(ev.ay) : (ev.tg.reduce((s, i) => s + units[i].g.position.x, 0) / ev.tg.length), ev.sh === 'T' || ev.sh === 'TQ' ? wz(ev.ax) : (ev.tg.reduce((s, i) => s + units[i].g.position.z, 0) / ev.tg.length), (ev.ar || 1) * T + 0.6, col);
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
          t.hit = 1;
          const col = ev.k === 1 ? '#ffd23f' : ev.k === 2 ? '#b9c4cf' : ev.k === 4 ? '#c59bff' : '#ffffff';
          popNum((ev.k === 2 ? '🛡' : '') + fmt(ev.d) + (ev.k === 1 ? '!' : ''), col, head(t), ev.k === 1);
          if (c) { c.dmg += ev.d; c.n++; if (ev.k === 1) c.crit++; if (ev.k === 2) c.block++; }
        }
        p.hooks.onHp && p.hooks.onHp();
        return p.burst > 10 ? 0.022 : 0.06;
      }
      case 'heal': { const t = units[ev.t]; t.hp = ev.hp; drawBar(t); popNum('+' + fmt(ev.v), '#7dff9a', head(t)); p.hooks.onHp && p.hooks.onHp(); return 0.06; }
      case 'shield': { const t = units[ev.t]; t.sh = ev.sh; drawBar(t); popNum('실드 +' + fmt(ev.v), '#bfe6ff', head(t)); return 0.06; }
      case 'spawn': { const u = units[ev.u]; u.g.position.set(wx(ev.y), 0, wz(ev.x)); u.g.visible = true; u.alive = true; u.hidden = false; u.hp = u.m.hpMax; drawBar(u); popRing(u.g.position.x, u.g.position.z, 1.6, '#ffe9a8'); popLabel(`${u.m.name} 실체화!`, '#ffe9a8', new THREE.Vector3(u.g.position.x, u.h + 0.9, u.g.position.z)); term.line(`  ✦ ${u.m.name} 실체화`, '#ffd24a'); return 0.3; }
      case 'die': { const u = units[ev.u]; u.alive = false; u.fall = 0.001; u.barS.visible = false; term.line(`  ✝ ${uname(u.m)} 쓰러짐`, '#8f8b80'); return 0.18; }
      case 'skip': { const u = units[ev.u]; popNum('행동 불가', '#9fd2ff', head(u)); return 0.2; }
      case 'end': { flushCast(); ring.visible = false; return 0.3; }
      default: return 0;
    }
  }
  function startReplay(events, meta, hooks = {}) {
    const names = {}; meta.forEach((m) => { if (m.kind === 'mob') names[m.name] = (names[m.name] || 0) + 1; });
    meta.forEach((m) => { m.dup = m.kind === 'mob' && names[m.name] > 1; });
    setRoster(meta);
    play = { ev: events, i: 0, wait: 0.5, round: 0, cur: null, hooks, burst: 0, done: false };
    paused = false;
  }
  function stepReplay(dt) {
    const p = play; if (!p || p.done || paused) return;
    p.wait -= dt * speed;
    let guard = 0;
    while (p.wait <= 0 && p.i < p.ev.length && guard++ < 40) {
      const ev = p.ev[p.i++];
      if (ev.e === 'cast') { let n = 0; for (let j = p.i; j < p.ev.length && (p.ev[j].e === 'hit' || p.ev[j].e === 'st' || p.ev[j].e === 'die' || p.ev[j].e === 'move'); j++) if (p.ev[j].e === 'hit') n++; p.burst = n; }
      p.wait += doEvent(ev);
      if (ev.e === 'end') { p.done = true; p.hooks.onEnd && p.hooks.onEnd(ev); break; }
    }
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
    for (const u of units) {
      const g = u.g;
      if (u.tw) { const w = u.tw; w.k = Math.min(1, w.k + a / w.d); const k = w.k * w.k * (3 - 2 * w.k); g.position.x = w.x0 + (w.x1 - w.x0) * k; g.position.z = w.z0 + (w.z1 - w.z0) * k; g.position.y = Math.sin(Math.PI * w.k) * w.hop; if (w.k >= 1) { u.tw = null; g.position.y = 0; } }
      let lx = 0, lz = 0, tilt = 0;
      if (u.atk >= 0) { u.atk += a / 0.5; const k = Math.sin(Math.PI * Math.min(1, Math.max(0, (u.atk - 0.2) / 0.6))); if (u.lunge && !u.sprite) { lx = u.lunge.x * k * 0.55; lz = u.lunge.z * k * 0.55; tilt = k * 0.28 * (u.lunge.x >= 0 ? -1 : 1); } else if (u.lunge) { lx = u.lunge.x * k * 0.25; lz = u.lunge.z * k * 0.25; } if (u.atk >= 1) { u.atk = -1; u.lunge = null; } }
      if (u.hit > 0) { u.hit = Math.max(0, u.hit - a / 0.3); lx += Math.sin(u.hit * 40) * 0.07 * u.hit; if (!u.sprite) u.mat.color.setRGB(1, 1 - 0.6 * u.hit, 1 - 0.6 * u.hit); }
      const bob = u.alive ? Math.sin(tAll * 2.4 + u.seed) * 0.035 : 0;
      u.card.position.set(lx, 0.1 + bob, lz);
      u.card.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      if (u.fall > 0) { u.fall = Math.min(1, u.fall + a / 0.45); u.card.rotation.x = -1.42 * u.fall * u.fall; u.mat.opacity = 1 - 0.35 * u.fall; if (!u.sprite) u.mat.color.setScalar(1 - 0.45 * u.fall); } else u.card.rotation.x = 0;
      u.card.rotation.z = tilt + (u.alive && !u.sprite ? Math.sin(tAll * 1.9 + u.seed) * 0.03 : 0);
      if (!u.sprite && u.alive) { const s = 1 + Math.sin(tAll * 2.4 + u.seed) * 0.025; u.card.scale.set(2 - s, s, 1); }
      if (u.sprite && (u.atk >= 0 || u.hit > 0 || (frame + u.frame) % 3 === 0 || u.fall > 0)) { u.sprite.draw(tAll, { atk: u.atk, hit: u.hit, flip: u.m.team === 1, dead: !u.alive }); u.tex.needsUpdate = true; }
    }
    for (const n of nums) if (n.life > 0) { n.life -= dt * 1.25 * Math.max(1, speed * 0.7); n.s.position.y += dt * 1.5; const k = 1 - n.life, pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15)); n.s.scale.set(n.sc * pop, n.sc * pop * 0.375, 1); n.s.material.opacity = Math.min(1, n.life * 2.2); if (n.life <= 0) n.s.visible = false; }
    for (const n of labels) if (n.life > 0) { n.life -= dt * 1.15 * Math.max(1, speed * 0.6); n.s.material.opacity = Math.min(1, n.life * 3); n.s.position.y += dt * 0.25; if (n.life <= 0) n.s.visible = false; }
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
    if (!userMoved) { const az = Math.sin(tAll * 0.12) * 0.15; camera.position.set(Math.sin(az) * camR, camR * 0.49, Math.cos(az) * camR - 2.4); }
    controls.update();
    renderer.render(scene, camera);
  }
  tick();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { running = false; } else if (!running) { running = true; clock.getDelta(); tick(); } });

  return {
    term, setRoster,
    play: startReplay,
    stop() { play = null; ring.visible = false; },
    setSpeed(v) { speed = v; }, setPaused(v) { paused = v; }, isPlaying: () => !!(play && !play.done),
    skip() { if (!play || play.done) return; const p = play; const keep = speed; while (!p.done && p.i < p.ev.length) { const ev = p.ev[p.i++]; doEvent(ev); if (ev.e === 'end') { p.done = true; p.hooks.onEnd && p.hooks.onEnd(ev); } } for (const u of units) { if (u.tw) { u.g.position.set(u.tw.x1, 0, u.tw.z1); u.tw = null; } } speed = keep; },
    teamHp() { const o = [[0, 0], [0, 0]]; for (const u of units) { if (u.m.pet) continue; o[u.m.team][0] += Math.max(0, u.hp); o[u.m.team][1] += u.m.hpMax; } return o; },
    resetView() { userMoved = false; controls.target.set(0, 3.0, -3.0); },
    zoom(f) { userMoved = true; const v = camera.position.clone().sub(controls.target); v.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, v.length() * f))); camera.position.copy(controls.target).add(v); },
  };
}
