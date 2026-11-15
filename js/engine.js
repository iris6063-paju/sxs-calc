// Sword x Staff battle simulator (unofficial, community-formula based).
// Pure module: runs in the page, in a Web Worker and in Node.
import { LV, FLAT, RANK_Q, RANK_R, SKILLS, MOBS, CURVES, MAPS, MAXLV, CLASSES } from './gamedata.js';

import { KO_SKILL, KO_CLASS, KO_DESC, FLAT2, CHARMS, PETS, MOBS2, CURVES2, RPG, ENC } from './gamedata2.js';

// official Korean client names / descriptions + extra tables
for (const s of SKILLS) { if (KO_SKILL[s.id]) s.ko = KO_SKILL[s.id]; if (KO_DESC[s.id]) s.desc = KO_DESC[s.id]; }
for (const c of CHARMS) { if (KO_SKILL[c.id]) c.ko = KO_SKILL[c.id]; if (KO_DESC[c.id]) c.desc = KO_DESC[c.id]; }
const ROLE_KO = { WT: '방어형 · 막기/실드/도발', WD: '공격형 · 근접 대미지', MD: '공격형 · 광역 원소 대미지', MS: '지원형 · 치유/소환/디버프' };
for (const c of CLASSES) { if (KO_CLASS[c.key]) c.ko = KO_CLASS[c.key]; c.role = c.tier === 1 ? (c.line === 'W' ? '근접 물리 · 기본 직업' : '원거리 원소 · 기본 직업') : `${ROLE_KO[c.line]} · ${c.tier}차 전직`; }
Object.assign(FLAT, FLAT2); Object.assign(CURVES, CURVES2);
export const ALL_MOBS = [...MOBS, ...MOBS2];
export const CHARM = new Map(CHARMS.map((c) => [c.id, c]));
export const PET = new Map(PETS.map((p) => [p.id, p]));
export { ENC, CHARMS, PETS };

export const W = 21, H = 20;
export const SK = new Map(SKILLS.map((s) => [s.id, s]));
export const MOB = new Map(ALL_MOBS.map((m) => [m.k, m]));
export const MAP = new Map(MAPS.map((m) => [m.id, m]));
export const CLS = new Map(CLASSES.map((c) => [c.key, c]));

const CURE_BASE = 16.667;   // SkillFixedCure / SkillFixedShield base ≈ 16.67 × SkillFixedAttack base
const STAT_BASE = 0.8333;   // StatusFixedAdd base ≈ 0.833 × SkillFixedAttack base
const DOT_COEF = 0.25;      // assumed: damage-over-time tick = 25% ATK (not published)
const CONTROL = { stun: 1, freeze: 1, immob: 1, frenzy: 1 };
const EL_KO = { phy: '물리', wind: '바람', water: '물', fire: '불', light: '빛', dark: '어둠' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lvi = (l) => clamp(Math.floor(l), 1, MAXLV);

export function rngFrom(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ───────── data helpers ───────── */
export function mobStats(key, level, sr) {
  const mob = MOB.get(key);
  const cv = CURVES[mob.map ? MAP.get(mob.map).cls[mob.pg] : (RPG[mob.pg] || {})[sr || mob.sr] ?? (RPG[mob.pg] || {})[mob.sr]];
  const lv = clamp(level, cv.lo, cv.hi), i0 = Math.floor(lv) - cv.lo, fr = lv - Math.floor(lv), i1 = Math.min(i0 + 1, cv.hi - cv.lo);
  const get = (k) => (cv.v[k] ? Math.trunc(cv.v[k][i0] + (cv.v[k][i1] - cv.v[k][i0]) * fr) : cv.c[k] || 0);
  const main = (k, i) => Math.max(1, Math.trunc(get(k) * (mob.f[i] / 10000)));
  const x = mob.x || {};
  return {
    hp: main('MaxHp', 0), atk: main('Attack', 1), def: main('Defence', 2), spd: main('Speed', 3),
    critRate: get('CritRatePercent') / 100, critDmg: get('CritPowerPercent') / 100, critRes: get('CritAvoidPercent') / 100,
    blockRate: get('BlockPercent') / 100, blockEff: (get('BlockValuePercent') + (x.BlockValuePercent || 0)) / 100, acc: get('BlockAvoidPercent') / 100,
    dmgBoost: get('DmgAddPercent') / 100, dmgRes: get('DmgReducePercent') / 100, effHit: get('EffectRate') / 100, effRes: get('EffectDodge') / 100,
  };
}
export function heroBase(level) {
  const l = lvi(level);
  return { atk: LV.atk[l], def: LV.def[l], hp: LV.hp[l], spd: LV.spd[l] };
}
export const flatBase = (g, level) => (FLAT[g || 1] || FLAT[1])[lvi(level)] || 0;
export function skillNumbers(id, rank, level) {
  const s = SK.get(id); if (!s) return null;
  const r = clamp(rank || 1, 1, 34), q = RANK_Q[r - 1], R = RANK_R[r - 1], A = flatBase(s.g, level);
  const o = { q };
  if (s.c) { o.coef = s.c[q] / 100; o.flat = (s.fm || 0) * R * A; }
  if (s.c2) { o.coef2 = s.c2[q] / 100; o.flat2 = (s.fm2 || 0) * R * A; }
  if (s.hv) { o.healPct = s.hv[q] / 100; o.healFlat = (s.hfm || 0) * R * A * CURE_BASE; }
  if (s.bv) { o.bv = s.bv[q] / 100; o.bflat = s.bfm ? s.bfm[q] * A : 0; }
  return o;
}
function rankScale(level) { return level > 220 ? 1500 : level > 190 ? 150 : level > 160 ? 10 : 1; }
const skillReach = (s) => { const t = s.tg; if (!t) return 0; return (s.leap || 0) + (t.t === 'S' ? t.r : t.t === 'T' || t.t === 'TQ' ? t.r + t.ar : t.t === 'F' ? t.h : t.r || 0); };

/* ───────── setup → prepared template ───────── */
const PCT = ['critRate', 'critDmg', 'critRes', 'blockRate', 'blockEff', 'acc', 'dmgBoost', 'dmgRes', 'effHit', 'effRes', 'dodge'];
const RAW = ['mastery', 'phyMastery', 'aff', 'res', 'phyRes', 'aegis'];
export const HERO_DEFAULTS = { critRate: 5, critDmg: 50, critRes: 0, blockRate: 5, blockEff: 100, acc: 0, dmgBoost: 0, dmgRes: 0, effHit: 0, effRes: 0, dodge: 0, mastery: 0, phyMastery: 0, aff: 0, res: 0, phyRes: 0, aegis: 0 };

function buildHero(d, opts) {
  const u = { kind: 'hero', name: d.name || '캐릭터', cls: d.cls, level: Math.max(1, +d.level || 1), move: 4, ref: d.uid };
  u.atk = Math.max(1, +d.atk || 1); u.def = Math.max(0, +d.def || 0); u.hpMax = Math.max(1, +d.hp || 1); u.spd = Math.max(1, +d.spd || 1);
  for (const k of PCT) u[k] = (d[k] != null && d[k] !== '' ? +d[k] : HERO_DEFAULTS[k]) / 100;
  for (const k of RAW) u[k] = +d[k] || 0;
  u.skills = [];
  for (const sl of d.skills || []) {
    if (!sl) continue;
    let s, n;
    if (sl.custom) {
      const c = sl.custom;
      s = { id: 0, ko: c.name || '직접 입력 스킬', el: c.el || 'phy', kind: 'dmg', hits: Math.max(1, +c.hits || 1), cd: Math.max(0, +c.cd || 0), zi: 1,
        tg: +c.targets > 1 ? { t: 'T', r: Math.max(1, +c.range || 1), ar: +c.targets > 4 ? 2 : 1 } : { t: 'S', r: Math.max(1, +c.range || 1) } };
      n = { coef: (+c.coef || 0) / 100, flat: +c.flat || 0 };
    } else { s = SK.get(sl.id); if (!s) continue; n = skillNumbers(sl.id, sl.rank, u.level); }
    if (s.kind === 'none') continue;
    u.skills.push({ s, n, cd: s.cd || 0, init: s.cd && !s.zi ? s.cd + 1 : 0 });
  }
  u.affEl = {}; u.healUp = 0; u.lsAll = 0;
  u.ch = compileCharms(d.charms, u);
  return u;
}
/** Charms (비법) → stat changes applied to the template + immutable hook lists used during the fight */
function compileCharms(list, u) {
  const ch = { procs: [], inflicts: [], hurt: [], block: [], dmgUp: [], dmgRed: [], shields: [] };
  let any = false;
  const l = lvi(u.level);
  for (const sl of list || []) {
    const c = sl && CHARM.get(sl.id); if (!c || !c.fx) continue;
    any = true;
    const r = clamp(sl.rank || 1, 1, 34), q = RANK_Q[r - 1], R = RANK_R[r - 1], A = flatBase(c.g, u.level);
    const coef = c.c ? c.c[q] / 100 : 0, flat = (c.fm || 0) * R * A, healPct = c.hv ? c.hv[q] / 100 : 0, healFlat = (c.hfm || 0) * R * A * CURE_BASE;
    const pct = (a) => (Array.isArray(a) ? a[q] / 100 : 0);
    for (const f of c.fx) {
      switch (f[0]) {
        case 'stat': if (f[1] === 'healUp') u.healUp += pct(f[2]); else u[f[1]] += pct(f[2]); break;
        case 'flat': { const v = f[2][0] * R * f[2][1] * LV[f[2][2]][l]; if (f[1] === 'hp') u.hpMax += Math.round(v); else if (f[1] === 'effHit') u.effHit += v / LV.eres[l]; else u[f[1]] += Math.round(v); break; }
        case 'aff': u.affEl[f[1]] = (u.affEl[f[1]] || 0) + f[2][0] * R * f[2][1] * LV[f[2][2]][l]; break;
        case 'harmony': { const els = new Set(u.skills.filter((k) => k.s.kind === 'dmg' && k.s.el !== 'phy').map((k) => k.s.el)); u.mastery += Math.round(f[1][0] * R * f[1][1] * LV[f[1][2]][l] * Math.min(4, els.size)); break; }
        case 'proc': ch.procs.push({ on: f[1], p: f[2], el: f[3], ar: f[4], opt: f[5] || {}, coef, flat }); break;
        case 'inflict': ch.inflicts.push({ p: f[1], e: f[2], cond: f[3] }); break;
        case 'react': ch[f[1]].push({ p: f[2], el: f[3], by: f[4], range: f[5], coef, flat }); break;
        case 'reactInflict': ch[f[1]].push({ p: f[2].p == null ? 1 : f[2].p, range: 99, inflict: { ...f[2], p: 1, v: f[3] ? pct(f[3]) : f[2].v } }); break;
        case 'ls': u.lsAll += pct(f[1]); break;
        case 'dmgUp': ch.dmgUp.push([f[1], pct(f[2])]); break;
        case 'dmgRed': ch.dmgRed.push([f[1], pct(f[2])]); break;
        case 'shield': ch.shields.push({ when: f[1], by: f[2], v: pct(f[3]), t: f[4], opt: f[5] || {} }); break;
        case 'soulProt': ch.soulProt = 1; break;
        case 'soulfire': ch.soulfire = pct(f[1]); break;
        case 'undying': ch.undying = { indom: f[1], healPct, healFlat }; break;
        case 'regen': ch.regen = { healPct, healFlat }; break;
        case 'critHeal': ch.critHeal = { healPct, healFlat }; break;
        case 'atkUpShielded': ch.atkSh = pct(f[1]); break;
        case 'spdKill': ch.spdKill = pct(f[1]); break;
        case 'critStack': ch.critStack = { el: f[1], v: pct(f[2]) }; break;
        case 'defIgnore': ch.defIgnore = pct(f[1]); break;
        case 'rapidCast': ch.rapid = 1; break;
        case 'ironFort': ch.ironFort = pct(f[1]); break;
        case 'aura': ch.aura = { coef, flat }; break;
        case 'killSplash': ch.killSplash = { el: f[1], ar: f[2], coef, flat }; break;
        case 'omen': ch.omen = 1; break;
        case 'thunder': ch.thunder = { p: f[1], coef, flat }; break;
        case 'mark10': ch.mark = { coef, flat }; break;
        case 'reflect': ch.reflect = pct(f[1]); break;
      }
    }
  }
  return any ? ch : null;
}
/** Fantomon: a dormant companion unit (support skill, and materialization for adults) */
function buildPet(d, owner) {
  const p = PET.get(d.id); if (!p) return null;
  const r = clamp(d.rank || 1, 1, 34), q = RANK_Q[r - 1], R = RANK_R[r - 1];
  const u = { kind: 'pet', name: p.ko, petId: p.id, level: owner.level, move: 4, pet: true, affEl: {}, healUp: 0, lsAll: 0, ch: null };
  u.atk = Math.max(1, +d.atk || 1); u.def = Math.max(0, +d.def || 0); u.hpMax = Math.max(1, +d.hp || 1); u.spd = Math.max(1, +d.spd || 1);
  for (const k of PCT) u[k] = HERO_DEFAULTS[k] / 100;
  for (const k of RAW) u[k] = 0;
  u.skills = d.adult && p.mat ? p.skills.map((s, i) => ({ s: { ...s, ko: s.en }, n: s.kind === 'heal' ? { healPct: s.hv[q] / 100, healFlat: 0 } : { coef: s.c[q] / 100 / Math.max(1, s.hits || 1), flat: 0 }, cd: s.cd || 0, init: s.cd && s.cd < 90 ? s.cd + 1 : 0 })) : [];
  const sp = p.sup, A = flatBase(sp.g, owner.level), v = {};
  for (const [k, a] of Object.entries(sp.v || {})) v[k] = a[q] / 100;
  u.sup = { k: sp.k, el: sp.el, ar: sp.ar || 0, lim: sp.lim || 0, eff: sp.eff, dispelBuff: sp.dispelBuff, healOwner: sp.healOwner, name: sp.en, coef: sp.c ? sp.c[q] / 100 : 0, flat: (sp.fm || 0) * R * A, healPct: sp.hv ? sp.hv[q] / 100 : 0, healFlat: (sp.hfm || 0) * R * A * CURE_BASE, v };
  u.mat = d.adult && p.mat ? p.mat : null;
  return u;
}
function buildMob(key, level, opts, sr) {
  const mob = MOB.get(key), st = mobStats(key, level, sr);
  const u = { kind: 'mob', name: mob.ko, key, level, move: 4, big: mob.ty === 2, ty: mob.ty, er: mob.er || null, affEl: {}, healUp: 0, lsAll: 0, ch: null };
  u.atk = st.atk; u.def = st.def; u.hpMax = st.hp; u.spd = st.spd;
  for (const k of PCT) u[k] = (st[k] || 0) / 100;
  for (const k of RAW) u[k] = 0;
  const mc = opts.mobCoef != null ? opts.mobCoef : 1;
  u.skills = mob.sk.map((s, i) => ({ s: { ...s, kind: 'dmg', ko: `${EL_KO[s.el] || ''} ${s.tg.t === 'S' ? '공격' : '광역 공격'}`.trim() }, n: { coef: mc / Math.max(1, s.hits || 1), flat: 0 }, cd: i ? 2 : 0, init: i ? i + 1 : 0 }));
  return u;
}
/** setup: { mode:'pve'|'pvp', teams:[[def...],[def...]], roundCap, pvpBalance, mobCoef } */
export function prepare(setup) {
  const opts = { mobCoef: setup.mobCoef };
  const teams = [[], []];
  setup.teams.forEach((defs, ti) => {
    for (const d of defs) {
      if (d.kind === 'mob') { const n = clamp(+d.count || 1, 1, 20); for (let i = 0; i < n; i++) { const u = buildMob(d.key, +d.level || 1, opts, d.sr); u.ref = d.uid; u.nth = i; teams[ti].push(u); } }
      else { const h = buildHero(d, opts); teams[ti].push(h); if (d.pet && d.pet.id) { const p = buildPet(d.pet, h); if (p) { p.ref = d.uid + ':pet'; h.petU = p; } } }
    }
  });
  const units = [];
  teams.forEach((list, ti) => {
    // melee units to the front row, ranged behind; rows fill centre-out
    const withReach = list.map((u) => ({ u, reach: Math.max(0, ...u.skills.filter((k) => k.s.kind === 'dmg').map((k) => skillReach(k.s))) || 1 }));
    withReach.sort((a, b) => a.reach - b.reach);
    const cols = [10, 9, 11, 8, 12, 7, 13, 6, 14];
    const perRow = list.length > 20 ? 9 : list.length > 15 ? 7 : 5;
    withReach.forEach(({ u, reach }, i) => {
      const row = Math.floor(i / perRow), col = cols[i % perRow];
      u.team = ti; u.x = col; u.y = ti === 0 ? 9 - row : 11 + row; u.reach = reach;
      units.push(u);
    });
  });
  // dormant Fantomon units go after the fighters
  for (const h of units.slice()) if (h.petU) { const p = h.petU; delete h.petU; p.team = h.team; p.x = -1; p.y = -1; p.out = true; p.ownerRef = h; h.petRef = p; units.push(p); }
  units.forEach((u, i) => { u.id = i; });
  for (const u of units) { if (u.ownerRef) { u.owner = u.ownerRef.id; delete u.ownerRef; } if (u.petRef) { u.petI = u.petRef.id; delete u.petRef; } }
  const pvp = setup.mode === 'pvp';
  return { units, pvp, balance: pvp && setup.pvpBalance !== false, roundCap: Math.max(1, +setup.roundCap || (pvp ? 100 : 15)) };
}

/* ───────── battle ───────── */
const DIAMOND = (() => { const o = []; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const d = Math.abs(dx) + Math.abs(dy); if (d <= 10) o.push([dx, dy, d]); } return o.sort((a, b) => a[2] - b[2]); })();
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

export function simulate(P, seed, log) {
  const rnd = rngFrom(seed);
  const occ = new Int16Array(W * H).fill(-1);
  const ev = log ? [] : null;
  const U = P.units.map((t) => ({
    ...t, hp: t.hpMax, alive: !t.out, st: [], turnNo: 0, next: 0, pool: 0,
    cds: t.skills.map((k) => k.init), shield: 0,
    mAtk: 1, aAtk: 0, mDef: 1, aDef: 0, mSpd: 1, aSpd: 0, bBlock: 0, bCrit: 0, bDmg: 0, red: 1, vuln: 0, cold: 0, riven: 0, sigil: 0, wet: 0, blind: 0, moveAdd: 0, dodgeB: 0,
    dmg: 0, taken: 0, healed: 0, kills: 0, lastAil: -9, ailStreak: 0,
    casts: 0, eye: 0, stone: 0, marks: 0, lossAcc: 0, supTurn: -1, supN: 0, petStk: 0, undyingUsed: false, above50: true, voidUsed: false, energy: 0, reactCast: -1,
  }));
  const B = { U, pvp: P.pvp, round: 1, pvpScale: 1, healScale: 1, castId: 0, over: false, winner: -1, now: 0 };
  for (const u of U) if (!u.out) occ[u.y * W + u.x] = u.id;
  const aliveCount = [0, 0];
  for (const u of U) if (!u.pet) aliveCount[u.team]++;
  const eAtk = (u) => Math.max(1, (u.atk * u.mAtk + u.aAtk) * (u.ch && u.ch.atkSh && u.shield > 0 ? 1 + u.ch.atkSh : 1));
  const eDef = (u) => Math.max(0, u.def * u.mDef + u.aDef);
  const eSpd = (u) => Math.max(1, u.spd * u.mSpd + u.aSpd);
  const interval = (u) => 100000 / Math.sqrt(eSpd(u) * rankScale(u.level));
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && occ[y * W + x] < 0;
  const setBalance = () => {
    if (!P.balance) return;
    B.pvpScale = B.round < 12 ? 0.2 : 0.2 + 0.1 * Math.min(99, B.round - 11);
    B.healScale = B.round < 12 ? 1 : Math.max(0.2, 1 - 0.2 * (B.round - 11));
  };
  setBalance();

  function recalc(u) {
    let mAtk = 1, mDef = 1, mSpd = 1, aAtk = 0, aSpd = 0, bBlock = 0, bCrit = 0, bDmg = 0, red = 1, vuln = 0, cold = 0, riven = 0, sigil = 0, wet = 0, blind = 0, sh = 0, mv = 0, aDef = 0, dodgeB = 0;
    for (const s of u.st) {
      switch (s.k) {
        case 'defUp': aDef += s.v; break;
        case 'dodgeUp': dodgeB = Math.max(dodgeB, s.v); break;
        case 'critStk': bCrit += s.v * s.n; break;
        case 'spdStk': aSpd += s.v * s.n; break;
        case 'weak': mAtk = Math.min(mAtk, 1 - s.v); break;
        case 'abreak': mDef = Math.min(mDef, 1 - s.v); break;
        case 'slow': mSpd = Math.min(mSpd, 1 - s.v); break;
        case 'atkUp': aAtk += s.v; break;
        case 'spdUp': aSpd += s.v; mv += s.move || 0; break;
        case 'blockUp': bBlock += s.v; break;
        case 'critUp': bCrit += s.v; break;
        case 'dmgUp': bDmg += s.v; break;
        case 'dmgRed': red *= 1 - s.v; break;
        case 'vuln': vuln += s.v; break;
        case 'sigil': sigil = Math.max(sigil, s.v); break;
        case 'cold': cold = s.n; break;
        case 'riven': riven = s.n; break;
        case 'wet': wet = 1; break;
        case 'blind': blind = 1; break;
        case 'shield': sh += s.v; break;
      }
    }
    Object.assign(u, { mAtk, mDef, mSpd, aAtk, aSpd, bBlock, bCrit, bDmg, red, vuln, cold, riven, sigil, wet, blind, shield: sh, moveAdd: mv, aDef, dodgeB });
  }
  const has = (u, k) => { for (const s of u.st) if (s.k === k) return s; return null; };
  function addStatus(t, s) {
    if (s.uniq) { const i = t.st.findIndex((x) => x.k === s.k && x.uniq); if (i >= 0) { if (s.k === 'hpUp') dropHpUp(t, t.st[i]); t.st.splice(i, 1); } }
    t.st.push(s); recalc(t);
    if (ev) ev.push({ e: 'st', t: t.id, k: s.k, on: 1 });
  }
  function dropHpUp(u, s) { const pct = u.hp / u.hpMax; u.hpMax = Math.max(1, u.hpMax - s.v); u.hp = Math.max(1, Math.round(u.hpMax * pct)); }
  function removeStatus(u, i) {
    const s = u.st[i]; u.st.splice(i, 1);
    if (s.k === 'hpUp') dropHpUp(u, s);
    if (ev) ev.push({ e: 'st', t: u.id, k: s.k, on: 0 });
  }
  function kill(t, by) {
    t.alive = false; t.hp = 0; occ[t.y * W + t.x] = -1;
    if (by) by.kills++;
    if (ev) ev.push({ e: 'die', u: t.id });
    if (t.pet) return;
    aliveCount[t.team]--;
    if (aliveCount[t.team] <= 0) { B.over = true; B.winner = 1 - t.team; return; }
    if (by && by.alive && by.ch) {
      const c = by.ch;
      if (c.spdKill) { const s = has(by, 'spdStk'); if (s) { s.n = Math.min(4, s.n + 1); recalc(by); } else addStatus(by, { k: 'spdStk', v: by.spd * c.spdKill, n: 1, exp: 1e9, buff: true }); }
      if (c.killSplash) { const k = c.killSplash, cx = t.x, cy = t.y; for (const f of U) if (f.alive && f.team !== by.team && dist(f.x, f.y, cx, cy) <= k.ar) hit(by, f, k.coef, k.flat, k.el, { noProc: 1, noReact: 1 }); }
    }
  }
  function heal(a, t, v) {
    if (!t.alive || v <= 0) return 0;
    v = Math.floor(v * B.healScale * (1 + (a.healUp || 0)));
    const real = Math.min(v, t.hpMax - t.hp);
    if (real <= 0) return 0;
    t.hp += real; a.healed += real;
    if (t.hp / t.hpMax >= 0.5) t.above50 = true;
    if (ev) ev.push({ e: 'heal', a: a.id, t: t.id, v: real, hp: t.hp });
    return real;
  }
  function addShield(a, t, v, turns) {
    v = Math.floor(v * B.healScale); if (v <= 0) return;
    addStatus(t, { k: 'shield', v, exp: t.turnNo + turns, buff: true, src: a.id });
    if (ev) ev.push({ e: 'shield', t: t.id, v, sh: t.shield });
  }
  function elemMult(a, t, el) {
    const la = lvi(a.level), lt = lvi(t.level);
    const phy = el === 'phy';
    const off = 1 + (a.aff + (a.affEl[el] || 0)) / LV.aff[lt] + (phy ? a.phyMastery : a.mastery) / LV.mas[lt];
    const de = 1 + t.aegis / LV.aff[la] + (phy ? t.phyRes : t.res) / LV.mas[la];
    let m = off / de;
    if (t.er && t.er[el]) m *= 1 + t.er[el];
    if (el === 'water' && t.cold) m *= 1 + 0.05 * t.cold;
    return m;
  }
  function levelOffset(a, t) { const g = Math.floor(a.level) - Math.floor(t.level); const f = 1 + 0.04 * Math.min(4, Math.abs(g)); return g > 0 ? f : g < 0 ? 1 / f : 1; }

  /** raw damage application incl. shields; returns HP damage dealt */
  function applyDamage(a, t, d, o) {
    let hpDmg = d;
    if (t.shield > 0) {
      const mul = o.doom ? 2 : 1;
      let left = d * mul;
      for (let i = 0; i < t.st.length && left > 0; i++) {
        const s = t.st[i]; if (s.k !== 'shield') continue;
        const use = Math.min(s.v, left); s.v -= use; left -= use;
        if (s.v <= 0) { t.st.splice(i, 1); i--; }
      }
      recalc(t);
      hpDmg = Math.floor(left / mul);
    }
    hpDmg = Math.min(hpDmg, t.hp);
    let saved = false;
    if (hpDmg >= t.hp && t.ch && t.ch.undying && !t.undyingUsed) { t.undyingUsed = true; saved = true; hpDmg = t.hp - 1; }
    t.hp -= hpDmg; a.dmg += hpDmg; t.taken += hpDmg;
    if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d, k: o.kind || 0, hp: t.hp, sh: t.shield, el: o.el });
    if (o.ls && hpDmg > 0) heal(a, a, hpDmg * o.ls);
    if (t.hp <= 0) { kill(t, a); return hpDmg; }
    if (saved) { const c = t.ch.undying; heal(t, t, t.hpMax * c.healPct + c.healFlat); if (c.indom) addStatus(t, { k: 'dmgRed', v: 0.9, exp: t.turnNo + 2, buff: true }); }
    // HP-threshold charms
    const below = t.hp / t.hpMax < 0.5;
    if (t.ch && below && t.above50) for (const s of t.ch.shields) {
      if (s.when === 'below50' || (s.when === 'below50once' && !t.voidUsed)) {
        if (s.when === 'below50once') t.voidUsed = true;
        addShield(t, t, (s.by === 'hp' ? t.hpMax : eDef(t)) * s.v, s.t);
        if (s.opt.dodge) addStatus(t, { k: 'dodgeUp', v: 0.5, exp: t.turnNo + s.opt.dodge, buff: true, uniq: 1 });
      }
    }
    t.above50 = !below;
    // Fantomon energy / Boaro-style shield
    if (t.petI != null) {
      const p = U[t.petI];
      if (p.mat && p.out) t.energy += 6;
      if (p.sup.k === 'shieldLoss' && t.supN < 5) { t.lossAcc += hpDmg; if (t.lossAcc >= t.hpMax * 0.15) { t.lossAcc -= t.hpMax * 0.15; t.supN++; addShield(t, t, eDef(t) * (p.sup.v.ShieldByDefence || 0), 3); } }
    }
    return hpDmg;
  }
  const lost15 = (u) => Math.min(5, Math.floor((1 - u.hp / u.hpMax) / 0.15 + 1e-9));
  const debuffKinds = (u) => { const k = new Set(); for (const s of u.st) if (!s.buff && s.k !== 'shield') k.add(s.k); return k.size; };
  const foesNear = (u, r) => { let n = 0; for (const f of U) if (f.alive && f.team !== u.team && dist(f.x, f.y, u.x, u.y) <= r) n++; return n; };
  function upMode(m, a, t, o) {
    switch (m) {
      case 'perDebuff3': return Math.min(3, debuffKinds(t)); case 'vsDebuffed': return debuffKinds(t) ? 1 : 0; case 'perLost15': return lost15(a); case 'tgtLost15': return lost15(t);
      case 'tgtAbove70': return t.hp / t.hpMax > 0.7 ? 1 : 0; case 'singleHit': return o.single ? 1 : 0; case 'fewFoes': return foesNear(a, 2) <= 3 ? 1 : 0;
      case 'turn3': return clamp(a.turnNo - 2, 0, 3); case 'perCast4': return Math.min(3, Math.floor(a.casts / 4)); case 'eye': return a.eye; default: return 0;
    }
  }
  function redMode(m, a, t) {
    switch (m) {
      case 'perLost15': return lost15(t); case 'manyFoes': return foesNear(t, 2) > 3 ? 1 : 0; case 'always': return 1; case 'attackerDebuffed': return debuffKinds(a) ? 1 : 0;
      case 'stone': return Math.min(9, t.stone); case 'vsTaunted': { const tn = has(a, 'taunt'); return tn && tn.src === t.id ? 1 : 0; } default: return 0;
    }
  }
  /** attacker-side charm procs after a technique hit */
  function onDealt(a, t, kind, el) {
    const c = a.ch; if (!c || B.over) return;
    for (const p of c.procs) {
      if ((p.on === 'crit' && kind !== 1) || (p.opt.cond && p.opt.cond !== el) || rnd() >= p.p) continue;
      const tx = t.x, ty = t.y;
      const list = p.ar ? U.filter((f) => f.alive && f.team !== a.team && dist(f.x, f.y, tx, ty) <= p.ar) : t.alive ? [t] : [];
      for (const f of list) { hit(a, f, p.coef, p.flat, p.el, { noProc: 1, noReact: 1 }); if (p.opt.eff && f.alive) for (const e of p.opt.eff) tryStatus(a, f, e); }
    }
    if (t.alive) for (const i of c.inflicts) if ((!i.cond || i.cond === el) && rnd() < i.p) tryStatus(a, t, { ...i.e, p: 1 });
    if (c.critHeal && kind === 1) heal(a, a, a.hpMax * c.critHeal.healPct + c.critHeal.healFlat);
    if (c.mark && t.alive) { t.marks++; if (t.marks >= 10) { t.marks = 0; hit(a, t, c.mark.coef, c.mark.flat, 'phy', { noProc: 1, noReact: 1 }); } }
  }
  /** defender-side charm reactions (at most one round of counters per incoming cast) */
  function onHurt(a, t, kind, d) {
    const c = t.ch; if (!c || B.over) return;
    t.stone++; t.eye = Math.min(10, t.eye + 1);
    if (t.reactCast === B.castId) return;
    let fired = false;
    for (const r of kind === 2 ? c.block.concat(c.hurt) : c.hurt) {
      if (!a.alive || !t.alive || dist(a.x, a.y, t.x, t.y) > r.range || rnd() >= r.p) continue;
      fired = true;
      if (r.inflict) tryStatus(t, a, r.inflict);
      else hit(t, a, r.coef, r.flat, r.el, { base: (r.by === 'def' ? eDef(t) : eAtk(t)) * r.coef + r.flat, noProc: 1, noReact: 1 });
    }
    if (c.reflect && t.shield > 0 && a.alive) { fired = true; applyDamage(t, a, Math.max(1, Math.floor(d * c.reflect)), { el: 'light', kind: 4 }); }
    if (fired) t.reactCast = B.castId;
  }
  /** one technique hit with all rolls */
  function hit(a, t, coef, flat, el, o) {
    if (!t.alive || B.over) return 0;
    if (o.blind && rnd() < 0.5) { if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d: 0, k: 3, hp: t.hp, sh: t.shield, el }); return 0; }
    const dg = t.dodge + t.dodgeB;
    if (dg > 0 && rnd() < dg) { if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d: 0, k: 3, hp: t.hp, sh: t.shield, el }); return 0; }
    const atk = eAtk(a); let def = eDef(t), boost = o.boost || 0, redX = 1;
    if (a.ch) {
      const c = a.ch;
      if (c.defIgnore) { let nb = 0; for (const s of a.st) if (s.buff) nb++; def *= 1 - Math.min(0.95, c.defIgnore + 0.1 * Math.min(3, nb)); }
      for (const [m, v] of c.dmgUp) boost += v * upMode(m, a, t, o);
    }
    if (t.ch) for (const [m, v] of t.ch.dmgRed) redX *= 1 - Math.min(0.9, v * redMode(m, a, t));
    let d = (o.base != null ? o.base : atk * coef + flat) * (atk / (atk + def));
    d *= elemMult(a, t, el);
    d *= (1 + a.dmgBoost + a.bDmg + boost) / (1 + t.dmgRes);
    d *= (1 + t.vuln + t.sigil) * t.red * redX;
    const acc = a.acc + (o.acc || 0);
    let kind = 0;
    const bc = t.blockRate + t.bBlock - 0.1 * t.riven - acc;
    if (bc > 0 && rnd() < bc) { d /= Math.max(1.5, 1 + t.blockEff - acc); kind = 2; }
    else { const cc = 0.05 + a.critRate + a.bCrit - t.critRes; if (cc > 0 && rnd() < cc) { d *= Math.max(1.3, 1 + a.critDmg - t.critRes); kind = 1; } }
    d *= levelOffset(a, t);
    if (P.balance && t.kind === 'hero') d *= B.pvpScale;
    d *= o.mult || 1;
    d = Math.max(1, Math.floor(d));
    const dealt = applyDamage(a, t, d, { doom: o.doom, kind, el, ls: (o.ls || 0) + (o.noProc ? 0 : a.lsAll || 0) });
    if (!o.noProc) onDealt(a, t, kind, el);
    if (!o.noReact && t.alive && a.alive) onHurt(a, t, kind, d);
    // Light Sword Array: one counter per incoming cast
    if (!o.noReact && t.alive && a.alive) {
      const sw = has(t, 'swords');
      if (sw && sw.cast !== B.castId) {
        sw.cast = B.castId; sw.n--;
        const cx = a.x, cy = a.y;
        for (const f of U) if (f.alive && f.team !== t.team && dist(f.x, f.y, cx, cy) <= 1) hit(t, f, sw.coef, sw.flat, 'light', { noReact: 1 });
        if (sw.n <= 0) { const i = t.st.indexOf(sw); if (i >= 0) removeStatus(t, i); recalc(t); }
      }
    }
    return dealt;
  }
  function tryStatus(a, t, e, sk) {
    if (!t.alive) return;
    let k = e.k, v = e.v;
    if (k === 'randDebuff') { const pick = [['weak', 0.3], ['abreak', 0.3], ['slow', 0.3]][Math.floor(rnd() * 3)]; k = pick[0]; v = pick[1]; }
    let p = e.p == null ? 1 : e.p;
    if (k === 'taunt' && e.mob && t.kind !== 'hero') p = 1;
    else if (p < 1 || CONTROL[k]) p *= (1 + a.effHit) / (1 + t.effRes);
    if (CONTROL[k]) {
      if (k === 'freeze' && t.wet) p *= 1.3;
      if (P.balance && t.kind === 'hero') p /= 3;
      if (t.turnNo - t.lastAil <= 1) p *= Math.pow(0.5, t.ailStreak);
      if (k === 'freeze' && has(t, 'freeze')) return;
    }
    if (rnd() >= p) return;
    const turns = e.t || 1;
    if (CONTROL[k]) { t.ailStreak = t.turnNo - t.lastAil <= 1 ? t.ailStreak + 1 : 1; t.lastAil = t.turnNo; }
    if (k === 'cold' || k === 'riven') {
      const ex = has(t, k), max = k === 'cold' ? 10 : 3;
      if (ex) { ex.n = Math.min(max, ex.n + 1); ex.exp = t.turnNo + turns; recalc(t); return; }
      addStatus(t, { k, n: 1, exp: t.turnNo + turns }); return;
    }
    if (k === 'abreak' || k === 'weak' || k === 'slow') {
      const ex = has(t, k);
      if (ex) { ex.v = Math.max(ex.v, v); ex.exp = Math.max(ex.exp, t.turnNo + turns); recalc(t); return; }
      addStatus(t, { k, v, exp: t.turnNo + turns }); return;
    }
    if (k === 'dot') { addStatus(t, { k, el: e.el || 'dark', src: a.id, exp: t.turnNo + (e.t || 3) }); return; }
    if (k === 'taunt') { addStatus(t, { k, src: a.id, exp: t.turnNo + turns, uniq: 1 }); return; }
    addStatus(t, { k, v, exp: t.turnNo + turns, uniq: 1, cast: B.castId });
  }
  function dotTick(t, s) {
    const a = U[s.src]; if (!a || !t.alive) return;
    const atk = eAtk(a), def = eDef(t);
    let d = atk * DOT_COEF * (atk / (atk + def)) * elemMult(a, t, s.el) * ((1 + a.dmgBoost + a.bDmg) / (1 + t.dmgRes)) * (1 + t.vuln) * t.red * levelOffset(a, t);
    if (P.balance && t.kind === 'hero') d *= B.pvpScale;
    applyDamage(a, t, Math.max(1, Math.floor(d)), { el: s.el, kind: 4 });
  }

  /* ── targeting ── */
  const foesOf = (u) => { const tn = has(u, 'taunt'); if (tn && U[tn.src] && U[tn.src].alive) return [U[tn.src]]; const o = []; for (const f of U) if (f.alive && f.team !== u.team) o.push(f); return o; };
  const alliesOf = (u) => { const o = []; for (const f of U) if (f.alive && f.team === u.team) o.push(f); return o; };
  function inShape(tg, cx, cy, aim, f) {
    const dx = f.x - cx, dy = f.y - cy;
    switch (tg.t) {
      case 'A': return Math.abs(dx) + Math.abs(dy) <= tg.r && (dx || dy);
      case 'Q': return Math.max(Math.abs(dx), Math.abs(dy)) <= tg.r && (dx || dy);
      case 'F': { const d = DIRS[aim]; const fw = dx * d[0] + dy * d[1]; if (fw < 1 || fw > tg.h) return false; const lat = dx * -d[1] + dy * d[0]; return tg.w % 2 ? Math.abs(lat) <= (tg.w - 1) / 2 : lat >= 0 && lat < tg.w; }
      default: return false;
    }
  }
  const inAim = (tg, ax, ay, f) => (tg.t === 'TQ' ? Math.max(Math.abs(f.x - ax), Math.abs(f.y - ay)) <= tg.ar : dist(f.x, f.y, ax, ay) <= tg.ar);
  function standCell(u, reach, pred) {
    for (const [dx, dy, d] of DIAMOND) {
      if (d > reach) break;
      const x = u.x + dx, y = u.y + dy;
      if (d === 0 ? pred(x, y) : free(x, y) && pred(x, y)) return [x, y, d];
    }
    return null;
  }
  /** → { x, y, walk, targets, ax, ay, dir } | null */
  function plan(u, s, pool, foes) {
    const tg = s.tg, leap = s.leap || 0, reach = pool + leap;
    if (!foes.length) return null;
    if (tg.t === 'S') {
      const min = tg.min || 1;
      const c = [];
      for (const f of foes) { const d = dist(u.x, u.y, f.x, f.y); const need = d > tg.r ? d - tg.r : d < min ? min - d : 0; if (need <= reach) c.push([need, f.hp / f.hpMax, f]); }
      c.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [, , f] of c) {
        const cell = standCell(u, reach, (x, y) => { const d = dist(x, y, f.x, f.y); return d >= min && d <= tg.r; });
        if (cell) return { x: cell[0], y: cell[1], walk: Math.max(0, cell[2] - leap), targets: [f], ax: f.x, ay: f.y };
      }
      return null;
    }
    if (tg.t === 'T' || tg.t === 'TQ') {
      const aims = [];
      const seen = new Set();
      for (const f of foes) {
        const cand = tg.ar > 0 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
        for (const [ox, oy] of cand) {
          const ax = f.x + ox, ay = f.y + oy; if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
          const key = ay * W + ax; if (seen.has(key)) continue; seen.add(key);
          const need = Math.max(0, dist(u.x, u.y, ax, ay) - tg.r); if (need > reach) continue;
          let n = 0; for (const g of foes) if (inAim(tg, ax, ay, g)) n++;
          if (n) aims.push([n, need, ax, ay]);
        }
      }
      aims.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      for (let i = 0; i < aims.length && i < 6; i++) {
        const [, , ax, ay] = aims[i];
        const cell = standCell(u, reach, (x, y) => dist(x, y, ax, ay) <= tg.r);
        if (cell) return { x: cell[0], y: cell[1], walk: Math.max(0, cell[2] - leap), targets: foes.filter((g) => inAim(tg, ax, ay, g)), ax, ay };
      }
      return null;
    }
    // shapes anchored on the caster: A / Q / F
    let best = null, bestN = 0;
    const dirs = tg.t === 'F' ? 4 : 1;
    for (const [dx, dy, d] of DIAMOND) {
      if (d > reach) break;
      const x = u.x + dx, y = u.y + dy;
      if (d && !free(x, y)) continue;
      for (let k = 0; k < dirs; k++) {
        let n = 0;
        for (const f of foes) if (inShape(tg, x, y, k, f)) n++;
        if (n > bestN) { bestN = n; best = [x, y, d, k]; }
      }
      if (bestN >= foes.length) break;
    }
    if (!best) return null;
    const [x, y, d, k] = best;
    return { x, y, walk: Math.max(0, d - leap), targets: foes.filter((f) => inShape(tg, x, y, k, f)), ax: x, ay: y, dir: k };
  }
  function moveTo(u, x, y, leap) {
    if (x === u.x && y === u.y) return;
    occ[u.y * W + u.x] = -1; u.x = x; u.y = y; occ[y * W + x] = u.id;
    if (ev) ev.push({ e: 'move', u: u.id, x, y, leap: leap ? 1 : 0 });
  }
  function pullTo(t, px, py) {
    if (!t.alive || has(t, 'freeze') || has(t, 'immob')) return;
    for (const [dx, dy, d] of DIAMOND) {
      if (d > 3) break;
      const x = px + dx, y = py + dy;
      if (dist(x, y, t.x, t.y) >= dist(px, py, t.x, t.y) && d > 0) continue;
      if (free(x, y)) { occ[t.y * W + t.x] = -1; t.x = x; t.y = y; occ[y * W + x] = t.id; if (ev) ev.push({ e: 'move', u: t.id, x, y, pull: 1 }); return; }
    }
  }

  /* ── casting ── */
  function castDamage(u, k, pl, pre) {
    const s = k.s, n = k.n;
    B.castId++; u.casts++;
    if (pl.x !== u.x || pl.y !== u.y) moveTo(u, pl.x, pl.y, s.leap);
    if (ev) ev.push({ e: 'cast', u: u.id, n: s.ko || s.en, el: s.el, tg: pl.targets.map((t) => t.id), ax: pl.ax, ay: pl.ay, sh: s.tg.t, ar: s.tg.ar || s.tg.r || 0 });
    let targets = pl.targets;
    if (s.pull) { const px = s.pull === 'c' ? u.x : pl.ax, py = s.pull === 'c' ? u.y : pl.ay; for (const t of targets) pullTo(t, px, py); }
    const o = { doom: s.doom, ls: s.ls || 0, blind: u.blind, acc: 0, boost: 0, single: (s.hits || 1) + (s.h2 || 0) === 1 && !s.sp };
    const na = has(u, 'nextAcc'), nd = has(u, 'nextDoom');
    if (na) { o.acc += na.v; o.boost += na.dmg || 0; }
    if (nd) { o.doom = 1; o.boost += nd.v; }
    const sp = s.sp || {};
    let dealt = 0;
    const one = (t, coef, flat, mult) => { o.mult = mult || 1; if (sp.k === 'execute') o.mult *= 1 + Math.min(sp.max, Math.floor((1 - t.hp / t.hpMax) / 0.05) * sp.step); const d = hit(u, t, coef, flat, s.el, o); dealt += d; return d; };
    const afterHit = (t) => { if (s.eff && t.alive) for (const e of s.eff) tryStatus(u, t, e, s); if (s.dispelBuff && t.alive) { const bi = t.st.map((x, i) => (x.buff ? i : -1)).filter((i) => i >= 0); if (bi.length) { removeStatus(t, bi[Math.floor(rnd() * bi.length)]); recalc(t); } } };
    if (sp.k === 'shieldBurst') {
      let sh = 0; for (let i = u.st.length - 1; i >= 0; i--) if (u.st[i].k === 'shield') { sh += u.st[i].v; u.st.splice(i, 1); } recalc(u);
      o.base = sh * n.coef + n.flat;
    }
    if (sp.k === 'waves') {
      const seen = new Map();
      for (let w = 0; w < sp.n && !B.over; w++) {
        const pool = targets.filter((t) => t.alive); if (!pool.length) break;
        const c = pool[Math.floor(rnd() * pool.length)];
        for (const f of foesOf(u)) if (dist(f.x, f.y, c.x, c.y) <= 1) { const h = seen.get(f.id) || 0; one(f, n.coef, n.flat, Math.pow(1 - sp.decay, h)); seen.set(f.id, h + 1); }
      }
      for (const id of seen.keys()) afterHit(U[id]);
    } else if (sp.k === 'rand') {
      const main = targets[0], cells = 2 * sp.r * sp.r + 2 * sp.r + 1, seen = new Map();
      const near = foesOf(u).filter((f) => dist(f.x, f.y, main.x, main.y) <= sp.r);
      let landed = 0;
      const strike = (f) => { const h = seen.get(f.id) || 0; one(f, n.coef, n.flat, Math.pow(1 - sp.decay, h)); seen.set(f.id, h + 1); landed++; };
      for (let i = 0; i < sp.n && !B.over; i++) { const r = Math.floor(rnd() * cells); if (r < near.length && near[r].alive) strike(near[r]); }
      while (landed < sp.min && !B.over) { const pool = near.filter((f) => f.alive); if (!pool.length) break; strike(main.alive ? main : pool[0]); }
      for (const id of seen.keys()) afterHit(U[id]);
    } else {
      const total = (s.hits || 1) + (s.h2 || 0);
      for (let h = 0; h < total && !B.over; h++) {
        const second = h >= (s.hits || 1);
        for (const t of targets) if (t.alive) one(t, second ? n.coef2 : n.coef, second ? n.flat2 : n.flat);
      }
      for (const t of targets) afterHit(t);
      if (sp.k === 'chain' || sp.k === 'bounce') {
        const seen = new Set([targets[0].id]); let last = targets[0];
        for (let i = 0; i < sp.n && !B.over; i++) {
          let c = foesOf(u).filter((f) => !seen.has(f.id) && dist(f.x, f.y, last.x, last.y) <= sp.r);
          if (!c.length && sp.k === 'bounce') c = foesOf(u).filter((f) => f !== last && dist(f.x, f.y, last.x, last.y) <= sp.r);
          if (!c.length) break;
          last = c[Math.floor(rnd() * c.length)]; seen.add(last.id);
          one(last, n.coef, n.flat); afterHit(last);
        }
      } else if (sp.k === 'recast') {
        const t = targets[0];
        for (let i = 0; i < sp.max && t.alive && !B.over && rnd() < sp.p; i++) { one(t, n.coef, n.flat); afterHit(t); }
      } else if (sp.k === 'killRecast') {
        let t = targets[0];
        for (let i = 0; i < sp.max && !t.alive && !B.over; i++) {
          const p2 = plan(u, s, 0, foesOf(u)); if (!p2) break;
          moveTo(u, p2.x, p2.y, 1); t = p2.targets[0]; one(t, n.coef, n.flat); afterHit(t);
        }
      } else if (sp.k === 'perDebuff') {
        for (const t of targets) { if (!t.alive) continue; const kinds = new Set(t.st.filter((x) => !x.buff).map((x) => x.k)); const extra = Math.min(sp.max, kinds.size); for (let i = 0; i < extra; i++) one(t, n.coef, n.flat); }
      } else if (sp.k === 'erode') {
        for (const t of targets) for (const st of t.st.filter((x) => x.k === 'dot')) for (let i = 0; i < sp.n && t.alive; i++) dotTick(t, st);
      } else if (sp.k === 'then') {
        const t2 = foesOf(u).filter((f) => inShape(sp.tg, u.x, u.y, 0, f));
        for (let h = 0; h < sp.hits; h++) for (const t of t2) if (t.alive) one(t, n.coef, n.flat);
      } else if (sp.k === 'dmgShield' && dealt > 0 && u.alive) addShield(u, u, Math.min(dealt * sp.v, u.hpMax * sp.cap) / (B.healScale || 1), sp.t);
    }
    // consume single-use modifiers
    for (const key of ['nextAcc', 'nextDoom', 'blind']) { const i = u.st.findIndex((x) => x.k === key); if (i >= 0) removeStatus(u, i); }
    for (const t of targets) { const i = t.st.findIndex((x) => x.k === 'sigil' && x.cast !== B.castId); if (i >= 0 && t.alive) { removeStatus(t, i); recalc(t); } }
    recalc(u);
    u.eye = 0;
    if (u.ch && u.ch.critStack && s.el === u.ch.critStack.el) { const st = has(u, 'critStk'); if (st) { st.n = Math.min(8, st.n + 1); st.exp = u.turnNo + 2; recalc(u); } else addStatus(u, { k: 'critStk', v: u.ch.critStack.v, n: 1, exp: u.turnNo + 2, buff: true }); }
    // enemy Thunder Judgment reacts to this cast
    for (const f of U) if (f.alive && u.alive && !B.over && f.team !== u.team && f.ch && f.ch.thunder && dist(f.x, f.y, u.x, u.y) <= 5 && rnd() < f.ch.thunder.p) hit(f, u, f.ch.thunder.coef, f.ch.thunder.flat, 'light', { noProc: 1, noReact: 1 });
    petProc(u, targets);
  }
  /** Fantomon support skill that follows the owner's damaging technique */
  function petProc(u, targets) {
    if (u.petI == null || B.over || !u.alive) return;
    const p = U[u.petI], sp = p.sup;
    if (sp.k !== 'proc' || (sp.lim && u.supTurn === u.turnNo)) return;
    const live = targets.filter((t) => t.alive && t.team !== u.team); if (!live.length) return;
    u.supTurn = u.turnNo;
    const t = live[Math.floor(rnd() * live.length)], tx = t.x, ty = t.y;
    const list = sp.ar ? U.filter((f) => f.alive && f.team !== u.team && dist(f.x, f.y, tx, ty) <= sp.ar) : [t];
    if (ev) ev.push({ e: 'cast', u: u.id, n: `${p.name} 지원`, el: sp.el, tg: list.map((f) => f.id), ax: tx, ay: ty, sh: 'T', ar: sp.ar, pet: 1 });
    for (const f of list) {
      hit(p, f, sp.coef, sp.flat, sp.el, { noProc: 1, noReact: 1 });
      if (f.alive && sp.eff) for (const e of sp.eff) tryStatus(p, f, e);
      if (f.alive && sp.dispelBuff) { const bi = f.st.map((x, i) => (x.buff ? i : -1)).filter((i) => i >= 0); if (bi.length) { removeStatus(f, bi[Math.floor(rnd() * bi.length)]); recalc(f); } }
    }
    if (sp.healOwner) heal(p, u, u.hpMax * sp.healPct + sp.healFlat);
  }
  function spawnPet(o, p) {
    const dy = (o.team === 0 ? 1 : -1) * (p.mat.front ? 1 : -1);
    let cell = free(o.x, o.y + dy) ? [o.x, o.y + dy] : null;
    if (!cell) for (const [dx, dyy, d] of DIAMOND) { if (!d) continue; if (d > 4) break; if (free(o.x + dx, o.y + dyy)) { cell = [o.x + dx, o.y + dyy]; break; } }
    if (!cell) return;
    p.out = false; p.alive = true; p.hp = p.hpMax; p.x = cell[0]; p.y = cell[1]; occ[p.y * W + p.x] = p.id; p.next = B.now + interval(p) * 0.5;
    if (ev) ev.push({ e: 'spawn', u: p.id, x: p.x, y: p.y });
  }
  function cleanse(t, n) { for (let i = 0; i < n; i++) { const di = t.st.map((x, j) => (!x.buff && x.k !== 'shield' ? j : -1)).filter((j) => j >= 0); if (!di.length) break; removeStatus(t, di[Math.floor(rnd() * di.length)]); } recalc(t); }
  function castSupport(u, k) {
    const s = k.s, n = k.n, allies = alliesOf(u);
    const within = (r) => allies.filter((a) => dist(a.x, a.y, u.x, u.y) <= r);
    const lowest = (list) => list.reduce((b, a) => (a.hp / a.hpMax < b.hp / b.hpMax ? a : b), list[0]);
    let targets;
    const tg = s.buff ? { t: s.buff.to, r: s.buff.r } : s.tg || { t: 'self' };
    if (tg.t === 'self') targets = [u];
    else if (tg.t === 'allies') targets = within(tg.r);
    else targets = [lowest(within(tg.r))];
    if (s.kind === 'heal') { targets = targets.filter((t) => t.hp < t.hpMax); if (!targets.length) return false; }
    if (s.buff && s.buff.max && targets.length > s.buff.max) { const rest = targets.filter((t) => t !== u).sort(() => rnd() - 0.5).slice(0, s.buff.max - 1); targets = [u, ...rest]; }
    B.castId++;
    if (ev) ev.push({ e: 'cast', u: u.id, n: s.ko || s.en, el: s.el, tg: targets.map((t) => t.id), ax: u.x, ay: u.y, sh: 'B', sup: 1 });
    if (s.kind === 'heal') {
      const amt = (t, m) => { let v = (u.hpMax * n.healPct + n.healFlat) * m; if (s.sp && s.sp.k === 'lowBonus' && t.hp / t.hpMax < s.sp.th) v *= 1 + s.sp.v; return v; };
      for (const t of targets) { heal(u, t, amt(t, 1)); if (s.dispel) cleanse(t, s.dispel); }
      if (s.sp && s.sp.k === 'healChain') {
        const cnt = new Map([[targets[0].id, 1]]); let last = targets[0];
        for (let i = 0; i < s.sp.n; i++) { const c = allies.filter((a) => a.alive && a !== last && a.hp < a.hpMax && dist(a.x, a.y, last.x, last.y) <= tg.r); if (!c.length) break; last = c[Math.floor(rnd() * c.length)]; const h = cnt.get(last.id) || 0; heal(u, last, amt(last, Math.pow(1 - s.sp.decay, h))); cnt.set(last.id, h + 1); }
      }
      return true;
    }
    if (s.kind === 'shield') { for (const t of targets) addShield(u, t, u.def * n.bv + (n.bflat || 0) * CURE_BASE, s.shT || 2); return true; }
    const b = s.buff, T = b.t;
    for (const t of targets) {
      const base = { exp: t.turnNo + T, buff: true, uniq: 1, src: u.id };
      switch (b.st) {
        case 'blockUp': case 'critUp': case 'dmgUp': case 'dmgRed': addStatus(t, { ...base, k: b.st, v: n.bv }); break;
        case 'atkUp': addStatus(t, { ...base, k: 'atkUp', v: u.atk * n.bv + (n.bflat || 0) * STAT_BASE }); if (b.adv && t !== u && rnd() < b.adv) t.next -= 0.2 * interval(t); break;
        case 'spdUp': addStatus(t, { ...base, k: 'spdUp', v: u.spd * n.bv + (n.bflat || 0) * STAT_BASE, move: b.move || 0 }); break;
        case 'hpUp': { const add = Math.floor(u.hpMax * n.bv + (n.bflat || 0) * STAT_BASE); const pct = t.hp / t.hpMax; addStatus(t, { ...base, k: 'hpUp', v: add }); t.hpMax += add; t.hp = Math.round(t.hpMax * pct); if (pct < 0.3) heal(u, t, t.hpMax * 0.05); break; }
        case 'nextAcc': addStatus(t, { ...base, k: 'nextAcc', v: n.bv, dmg: b.dmg }); break;
        case 'nextDoom': addStatus(t, { ...base, k: 'nextDoom', v: n.bv }); break;
        case 'hot': addStatus(t, { ...base, k: 'hot', v: u.hpMax * n.healPct + n.healFlat }); break;
        case 'swords': addStatus(t, { ...base, k: 'swords', n: b.n, coef: n.coef, flat: n.flat, exp: 1e9 }); break;
        case 'flame': addStatus(t, { ...base, k: 'flame', coef: n.coef, flat: n.flat }); flameBurst(t); break;
      }
      if (s.dispel) cleanse(t, s.dispel);
    }
    return true;
  }
  function flameBurst(t) {
    const s = has(t, 'flame'); if (!s) return; const a = U[s.src] || t;
    B.castId++;
    for (const f of U) if (f.alive && f.team !== t.team && Math.max(Math.abs(f.x - t.x), Math.abs(f.y - t.y)) <= 1) hit(a, f, s.coef, s.flat, 'fire', {});
  }
  function tryCast(u, i, pre) {
    const k = u.skills[i], s = k.s;
    if (s.kind === 'dmg') {
      const pl = plan(u, s, pre ? 0 : u.pool, foesOf(u));
      if (!pl || !pl.targets.length) return 0;
      if (!pre) u.pool -= pl.walk;
      castDamage(u, k, pl, pre);
    } else {
      if (has(u, 'taunt')) return 0;
      if (!castSupport(u, k)) return 0;
    }
    u.cds[i] = k.cd + 1;
    return 1;
  }
  function approach(u) {
    const foes = foesOf(u); if (!foes.length || u.pool <= 0) return;
    const near = (x, y) => { let m = 1e9; for (const f of foes) { const d = dist(x, y, f.x, f.y); if (d < m) m = d; } return m; };
    const want = Math.max(1, Math.min(...u.skills.filter((k) => k.s.kind === 'dmg').map((k) => (k.s.tg.t === 'S' ? k.s.tg.r : 1)), 99));
    let best = null, bd = near(u.x, u.y);
    if (bd <= want) return;
    for (const [dx, dy, d] of DIAMOND) { if (d > u.pool) break; if (!d) continue; const x = u.x + dx, y = u.y + dy; if (!free(x, y)) continue; const nd = near(x, y); if (nd < bd && nd >= 1) { bd = nd; best = [x, y]; } }
    if (best) moveTo(u, best[0], best[1]);
  }
  function takeTurn(u) {
    u.turnNo++;
    if (ev) ev.push({ e: 'turn', u: u.id, r: B.round });
    // start-of-turn effects
    for (const s of u.st.slice()) {
      if (!u.alive || B.over) break;
      if (s.k === 'dot') dotTick(u, s);
      else if (s.k === 'hot') heal(u, u, s.v);
    }
    if (u.alive && !B.over && has(u, 'flame')) flameBurst(u);
    u.stone = 0;
    if (u.alive && !B.over && u.ch) {
      if (u.ch.regen) heal(u, u, u.hpMax * u.ch.regen.healPct + u.ch.regen.healFlat);
      if (u.ch.omen) for (const f of U) if (f.alive && f.team !== u.team && dist(f.x, f.y, u.x, u.y) <= 5) tryStatus(u, f, { k: 'vuln', v: 0.25, p: 0.5, t: 1 });
    }
    if (u.alive && !B.over && u.petI != null) {
      const p = U[u.petI];
      if (p.sup.k === 'healLow' && u.hp / u.hpMax < 0.8) heal(p, u, u.hpMax * p.sup.healPct + p.sup.healFlat);
      if (p.mat && p.out) { u.energy += 50; if (u.energy >= p.mat.cap) spawnPet(u, p); }
    }
    if (u.alive && !B.over) {
      const stunned = has(u, 'stun'), locked = stunned || has(u, 'freeze') || has(u, 'frenzy');
      if (!stunned) for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--;
      if (!locked) {
        u.pool = has(u, 'immob') ? 0 : u.move + u.moveAdd;
        let cast = 0, waiting = 0;
        if (u.kind === 'mob') {
          // monsters: one skill a turn, specials first (assumption)
          for (let i = u.skills.length - 1; i >= 0 && !cast && !B.over; i--) if (u.cds[i] <= 0) { if (tryCast(u, i)) cast = 1; else waiting = 1; }
        } else {
          for (let i = 0; i < u.skills.length && u.alive && !B.over; i++) if (u.cds[i] <= 0) { if (tryCast(u, i)) cast++; else if (u.skills[i].s.kind === 'dmg') waiting = 1; }
        }
        if (u.alive && !B.over && (waiting || !cast)) approach(u);
      } else if (ev) ev.push({ e: 'skip', u: u.id });
    }
    // end of turn: enemy auras, Fantomon end-of-turn support
    if (u.alive && !B.over) {
      for (const f of U) if (f.alive && f.team !== u.team && f.ch && f.ch.aura && dist(f.x, f.y, u.x, u.y) <= 2) { hit(f, u, f.ch.aura.coef, f.ch.aura.flat, 'water', { noProc: 1, noReact: 1 }); if (!u.alive || B.over) break; tryStatus(f, u, { k: 'cold', p: 0.5, t: 2 }); }
      if (u.alive && !B.over && u.petI != null) {
        const p = U[u.petI], sp = p.sup;
        if (sp.k === 'endTurn') {
          let best = null, bd = 9; for (const f of U) if (f.alive && f.team !== u.team) { const d = dist(f.x, f.y, u.x, u.y); if (d < bd) { bd = d; best = f; } }
          if (best) { if (ev) ev.push({ e: 'cast', u: u.id, n: `${p.name} 지원`, el: sp.el, tg: [best.id], ax: best.x, ay: best.y, sh: 'S', ar: 0, pet: 1 }); hit(p, best, sp.coef, sp.flat, sp.el, { noProc: 1, noReact: 1 }); }
          u.petStk++; if (u.petStk === 4 && sp.v.StatusDmgAddPer) addStatus(u, { k: 'dmgUp', v: sp.v.StatusDmgAddPer, exp: 1e9, buff: true });
        } else if (sp.k === 'shield3') { u.petStk++; if (u.petStk % 3 === 0) addShield(u, u, eDef(u) * (sp.v.ShieldByDefence || 0), 3); }
      }
    }
    // end of turn: expire statuses
    if (u.alive) { let ch = 0; for (let i = u.st.length - 1; i >= 0; i--) if (u.turnNo >= u.st[i].exp) { removeStatus(u, i); ch = 1; } if (ch) recalc(u); }
  }

  /* ── pre-battle: charms, Fantomon passives, then "casts before battle" skills ── */
  for (const u of U) {
    if (u.pet || !u.alive) continue;
    const c = u.ch, perm = { exp: 1e9, buff: true };
    if (c) {
      for (const s of c.shields) if (s.when === 'pre') addShield(u, u, (s.by === 'hp' ? u.hpMax : u.def) * s.v, s.t);
      if (c.soulProt) { const h = Math.floor(u.hp * 0.5); u.hp -= h; addStatus(u, { ...perm, k: 'shield', v: h, src: u.id }); }
      if (c.soulfire) { u.hp = Math.max(1, Math.ceil(u.hp * 0.5)); addStatus(u, { ...perm, k: 'dmgRed', v: c.soulfire }); }
      if (c.rapid) for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--;
      if (c.ironFort) for (const f of U) if (f.alive && f.team === u.team && f.kind === 'hero' && Math.max(Math.abs(f.x - u.x), Math.abs(f.y - u.y)) <= 3) addStatus(f, { ...perm, k: 'defUp', v: u.def * c.ironFort });
    }
    if (u.petI != null) {
      const p = U[u.petI], sp = p.sup, v = sp.v;
      if (p.mat) u.energy = p.mat.init;
      if (sp.k === 'inkBurst') { for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--; if (v.StatusDmgAddPer) addStatus(u, { ...perm, k: 'dmgUp', v: v.StatusDmgAddPer }); }
      else if (sp.k === 'cloud') { if (v.StatusDmgReducePer) addStatus(u, { k: 'dmgRed', v: v.StatusDmgReducePer, exp: 3, buff: true }); if (v.BlockPercent) addStatus(u, { ...perm, k: 'blockUp', v: v.BlockPercent }); }
      else if (sp.k === 'atkSpd') { if (v.AttackScale) addStatus(u, { ...perm, k: 'atkUp', v: u.atk * v.AttackScale }); if (v.SpeedScale) addStatus(u, { ...perm, k: 'spdUp', v: u.spd * v.SpeedScale }); }
    }
    u.above50 = u.hp / u.hpMax >= 0.5;
  }
  for (const u of U.slice().sort((a, b) => b.spd - a.spd)) {
    if (B.over) break;
    for (let i = 0; i < u.skills.length; i++) if (u.skills[i].s.pre && u.alive) tryCast(u, i, true);
  }
  /* ── main loop ── */
  for (const u of U) u.next = interval(u) * (1 + rnd() * 1e-6);
  let acted = 0, roundSize = aliveCount[0] + aliveCount[1], guard = 0;
  let timeout = false;
  while (!B.over) {
    let u = null;
    for (const c of U) if (c.alive && (!u || c.next < u.next)) u = c;
    if (!u) break;
    B.now = u.next;
    takeTurn(u);
    if (u.alive) u.next += interval(u);
    if (B.over) break;
    if (!u.pet && ++acted >= roundSize) { acted = 0; B.round++; roundSize = aliveCount[0] + aliveCount[1]; setBalance(); if (B.round > P.roundCap) { timeout = true; break; } }
    if (++guard > 200000) { timeout = true; break; }
  }
  if (timeout) {
    if (!P.pvp) B.winner = 1; // PvE: running out of rounds is a loss for the challenger
    else {
      if (aliveCount[0] !== aliveCount[1]) B.winner = aliveCount[0] > aliveCount[1] ? 0 : 1;
      else {
        const avg = [0, 1].map((t) => { let s = 0, n = 0; for (const u of U) if (u.team === t && u.alive && !u.pet) { s += u.hp / u.hpMax; n++; } return n ? s / n : 0; });
        B.winner = Math.abs(avg[0] - avg[1]) < 1e-9 ? -1 : avg[0] > avg[1] ? 0 : 1;
      }
    }
  }
  if (ev) ev.push({ e: 'end', w: B.winner, r: Math.min(B.round, P.roundCap), timeout });
  return { winner: B.winner, rounds: Math.min(B.round, P.roundCap), timeout, units: U.map((u) => ({ dmg: u.dmg, taken: u.taken, healed: u.healed, kills: u.kills, alive: u.alive, hp: u.hp / u.hpMax })), events: ev };
}

/** Monte Carlo over n seeded fights. */
export function monteCarlo(setup, n, seed0 = 12345, onProgress) {
  const P = prepare(setup);
  const N = P.units.length;
  const agg = { n: 0, wins: [0, 0], draws: 0, timeouts: 0, rounds: 0, hpLeft: [0, 0], alive: [0, 0], units: P.units.map((u) => ({ dmg: 0, taken: 0, healed: 0, kills: 0, alive: 0 })), samples: [] };
  const empty = [P.units.every((u) => u.team !== 0 || u.pet), P.units.every((u) => u.team !== 1 || u.pet)];
  if (empty[0] || empty[1] || !N) return { ...agg, invalid: true, meta: metaOf(P) };
  for (let i = 0; i < n; i++) {
    const seed = (seed0 + i * 7919) >>> 0;
    const r = simulate(P, seed, false);
    agg.n++;
    if (r.winner < 0) agg.draws++; else agg.wins[r.winner]++;
    if (r.timeout) agg.timeouts++;
    agg.rounds += r.rounds;
    const cnt = [0, 0], hp = [0, 0], tot = [0, 0];
    r.units.forEach((x, j) => { const a = agg.units[j], t = P.units[j].team; a.dmg += x.dmg; a.taken += x.taken; a.healed += x.healed; a.kills += x.kills; if (x.alive) a.alive++; if (P.units[j].pet) return; if (x.alive) cnt[t]++; hp[t] += x.hp; tot[t]++; });
    for (const t of [0, 1]) { agg.alive[t] += cnt[t]; agg.hpLeft[t] += tot[t] ? hp[t] / tot[t] : 0; }
    if (agg.samples.length < 60) agg.samples.push([seed, r.winner, r.rounds]);
    if (onProgress && (i & 31) === 31) onProgress(agg);
  }
  return { ...agg, meta: metaOf(P) };
}
function metaOf(P) { return P.units.map((u) => ({ id: u.id, team: u.team, name: u.name, kind: u.kind, ref: u.ref, nth: u.nth || 0, key: u.key, cls: u.cls, level: u.level, x: u.x, y: u.y, hpMax: u.hpMax, big: !!u.big, pet: !!u.pet, out: !!u.out, petId: u.petId, owner: u.owner })); }
/** deployment preview (names, cells, max HP) without running a fight */
export function roster(setup) { return metaOf(prepare(setup)); }
/** one logged fight for the replay */
export function replay(setup, seed) { const P = prepare(setup); const r = simulate(P, seed, true); return { ...r, meta: metaOf(P) }; }
