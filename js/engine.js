// Sword x Staff battle simulator (unofficial, community-formula based).
// Pure module: runs in the page, in a Web Worker and in Node.
import { LV, FLAT, RANK_Q, RANK_R, SKILLS, MOBS, CURVES, MAPS, MAXLV, CLASSES } from './gamedata.js';

import { KO_SKILL, KO_CLASS, KO_DESC, FLAT2, CHARMS, PETS, MOBS2, CURVES2, RPG, ENC, MOB_PV, RANK_BASE, SUMMONS, SUMCURVE, TRIG, PVPR, PVP_GOV } from './gamedata2.js';
export { MOB_PV };

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
const EL_KO = { phy: '물리', wind: '바람', water: '물', fire: '불', light: '빛', dark: '어둠', chaos: '혼돈' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lvi = (l) => clamp(Math.floor(l), 1, MAXLV);

export function rngFrom(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ───────── data helpers ───────── */
/** precomputed stat block (guild conquest floors, Hieromon tiers, mobs without a shipped curve) → mobStats() shape */
const ELS = ['wind', 'water', 'fire', 'light', 'dark'];
/** monster elemental stats: mastery / resistance (elemental, physical), affinity / aegis per element */
const eleOf = (mast, pmast, eres, pres, add, red) => ({ mast, pmast, eres, pres, aff: Object.fromEntries(ELS.map((e, i) => [e, add[i] || 0])), aeg: Object.fromEntries(ELS.map((e, i) => [e, red[i] || 0])) });
export function stFrom(a, level) {
  const b = LV.eres[lvi(level)] || 1;
  const st = { hp: a[0], atk: a[1], def: a[2], spd: a[3], critRate: a[4], critDmg: a[5], critRes: a[6], blockRate: a[7], blockEff: a[8], acc: a[9], dmgBoost: a[10], dmgRes: a[11], effHit: (a[12] / b) * 100, effRes: (a[13] / b) * 100 };
  // 28-number blocks carry the elemental stats, 20-number ones one affinity / aegis for all five elements
  // (older 14-number blocks, e.g. saved setups, leave them at 0)
  if (a.length >= 28) st.ele = eleOf(a[14], a[15], a[16], a[17], a.slice(18, 23), a.slice(23, 28));
  else if (a.length >= 20) st.ele = eleOf(a[14], a[15], a[16], a[17], Array(5).fill(a[18]), Array(5).fill(a[19]));
  // 22 / 30 numbers: then the monster's PlayerSkill / ProSkillDmgReduceScale
  if (a.length === 22 || a.length === 30) st.sd = [a[a.length - 2], a[a.length - 1]];
  return st;
}
export function mobStats(key, level, sr) {
  const mob = MOB.get(key);
  const cls = mob.map ? MAP.get(mob.map).cls[mob.pg] : (RPG[mob.pg] || {})[sr || mob.sr] ?? (RPG[mob.pg] || {})[mob.sr];
  const cv = cls != null ? CURVES[cls] : null;
  if (!cv) return mob.st ? stFrom(mob.st, mob.lv) : null;
  const lv = clamp(level, cv.lo, cv.hi), i0 = Math.floor(lv) - cv.lo, fr = lv - Math.floor(lv), i1 = Math.min(i0 + 1, cv.hi - cv.lo);
  const get = (k) => (cv.v[k] ? Math.trunc(cv.v[k][i0] + (cv.v[k][i1] - cv.v[k][i0]) * fr) : cv.c[k] || 0);
  const main = (k, i) => Math.max(1, Math.trunc(get(k) * (mob.f[i] / 10000)));
  const x = mob.x || {};
  return {
    hp: main('MaxHp', 0), atk: main('Attack', 1), def: main('Defence', 2), spd: main('Speed', 3),
    critRate: get('CritRatePercent') / 100, critDmg: get('CritPowerPercent') / 100, critRes: get('CritAvoidPercent') / 100,
    blockRate: get('BlockPercent') / 100, blockEff: (get('BlockValuePercent') + (x.BlockValuePercent || 0)) / 100, acc: get('BlockAvoidPercent') / 100,
    // Effect Hit / Effect RES are flat: percent = value ÷ Base Effect RES of the level
    dmgBoost: get('DmgAddPercent') / 100, dmgRes: get('DmgReducePercent') / 100, effHit: (get('EffectRate') / (LV.eres[lvi(level)] || 1)) * 100, effRes: (get('EffectDodge') / (LV.eres[lvi(level)] || 1)) * 100,
    ele: eleOf(get('ElementMaster'), get('KongFuMaster'), get('ElementResistance'), get('KongFuResistance'),
      ELS.map((e) => get(e[0].toUpperCase() + e.slice(1) + 'DamageAdd') || get('EleAdd')), ELS.map((e) => get(e[0].toUpperCase() + e.slice(1) + 'DamageReduce') || get('EleRed'))),
    // the curve's own skill-DMG reduction pair (rank-like, not scaled by the monster's factors); none → the sub-rank's
    sd: ['PlayerSkillDmgReduceScale', 'ProSkillDmgReduceScale'].some((k) => k in cv.v || k in cv.c) ? [get('PlayerSkillDmgReduceScale'), get('ProSkillDmgReduceScale')] : null,
  };
}
/* PvE rank gap (BattleFormulaHandler.DamageRankOffsetDamage): 1 + |a − b| from this table, the higher rank deals ×,
   the lower ÷; Fantasia Ascent applies a second table on top (both from the game's enemy data) */
export const RANK_ORDER = ['Norank', 'Blackiron', 'Bronze', 'Silver', 'Gold', 'Saint', 'Legend', 'Angel', 'Godtouched1', 'Godtouched2', 'Godtouched3', 'Demigod1', 'Demigod2', 'Demigod3'];
const RANK_DMG = { Norank: 0, Blackiron: 0.7, Bronze: 0.7, Silver: 0.7, Gold: 15, Saint: 95, Legend: 300, Angel: 700, Godtouched1: 900, Godtouched2: 1500, Godtouched3: 2000, Demigod1: 2500, Demigod2: 3000, Demigod3: 3500 };
const DEMON_DMG = { Silver: 0.4, Gold: 1, Saint: 1, Legend: 1, Angel: 1, Godtouched1: 1, Godtouched2: 1, Godtouched3: 1, Demigod1: 1, Demigod2: 1, Demigod3: 1 };
/** sub-rank key → rank group ('Saint1' → 'Saint', 'Godtouched1_3' → 'Godtouched1') */
export const rankGroup = (sr) => (!sr ? null : /^(Godtouched\d|Demigod\d)/.test(sr) ? /^(Godtouched\d|Demigod\d)/.exec(sr)[1] : sr.replace(/\d+$/, ''));
export function rankGap(ra, rb, demon) {
  if (!ra || !rb || ra === rb) return 1;
  const oa = RANK_ORDER.indexOf(ra), ob = RANK_ORDER.indexOf(rb); if (oa < 0 || ob < 0) return 1;
  let n = 1 + Math.abs((RANK_DMG[ra] || 0) - (RANK_DMG[rb] || 0));
  if (demon) n *= 1 + Math.abs((DEMON_DMG[ra] || 0) - (DEMON_DMG[rb] || 0));
  return oa > ob ? n : 1 / n;
}
/** the bases a character's stats-screen numbers are read against: its sub-rank's, or the level's when no rank is set */
export const statBases = (level, rank) => { const r = rank && RANK_BASE && RANK_BASE[rank]; return { val: r ? r[2] : LV.crit[lvi(level)] || 1, eff: r ? r[3] : LV.eres[lvi(level)] || 1 }; };
export const SUBRANKS = RANK_BASE ? Object.keys(RANK_BASE) : [];
/** the lowest sub-rank a character of this level can hold (the first whose level cap reaches it) */
export const subOfLevel = (level) => SUBRANKS.find((k) => RANK_BASE[k][4] >= Math.floor(level)) || SUBRANKS[SUBRANKS.length - 1];
/** a sub-rank's PlayerSkill / ProSkillDmgReduceScale (the defender's divisors in Damage()) */
const sdrOf = (sub) => { const r = sub && RANK_BASE && RANK_BASE[sub]; return r && r.length > 6 ? [r[5], r[6]] : [0, 0]; };
const setSdr = (u, sd) => { u.psdr = 1 + (sd[0] || 0) / 10000; u.prosdr = 1 + (sd[1] || 0) / 10000; };
const copySdr = (u, h) => { u.psdr = h.psdr || 1; u.prosdr = h.prosdr || 1; };
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
  if (s.trig && TRIG && TRIG[s.trig]) { const T = TRIG[s.trig]; o.tc = T.c[r - 1]; o.tf = T.fx[r - 1] * flatBase(T.fg, level); }
  if (s.hv) { o.healPct = s.hv[q] / 100; o.healFlat = (s.hfm || 0) * R * A * CURE_BASE; }
  if (s.bv) { o.bv = s.bv[q] / 100; o.bflat = s.bfm ? s.bfm[q] * A : 0; }
  return o;
}
function rankScale(level) { return level > 220 ? 1500 : level > 190 ? 150 : level > 160 ? 10 : 1; }
const skillReach = (s) => { const t = s.tg; if (!t) return 0; return (s.leap || 0) + (t.t === 'S' ? t.r : t.t === 'T' || t.t === 'TQ' ? t.r + t.ar : t.t === 'F' ? t.h : t.r || 0); };

/* ───────── setup → prepared template ───────── */
const PCT = ['critRate', 'critDmg', 'critRes', 'blockRate', 'blockEff', 'acc', 'dmgBoost', 'dmgRes', 'effHit', 'effRes', 'dodge', 'pveAdd', 'pveRes'];
const RAW = ['mastery', 'phyMastery', 'aff', 'res', 'phyRes', 'aegis'];
export const HERO_DEFAULTS = { critRate: 5, critDmg: 50, critRes: 0, blockRate: 5, blockEff: 100, acc: 0, dmgBoost: 0, dmgRes: 0, effHit: 0, effRes: 0, dodge: 0, pveAdd: 0, pveRes: 0, mastery: 0, phyMastery: 0, aff: 0, res: 0, phyRes: 0, aegis: 0 };

function buildHero(d, opts) {
  const u = { kind: 'hero', name: d.name || '캐릭터', cls: d.cls, level: Math.max(1, +d.level || 1), move: 4, ref: d.uid };
  u.atk = Math.max(1, +d.atk || 1); u.def = Math.max(0, +d.def || 0); u.hpMax = Math.max(1, +d.hp || 1); u.spd = Math.max(1, +d.spd || 1);
  for (const k of PCT) u[k] = (d[k] != null && d[k] !== '' ? +d[k] : HERO_DEFAULTS[k]) / 100;
  for (const k of RAW) u[k] = +d[k] || 0;
  // the game's Character Stats screen: the character's own sub-rank (bases + rank gap), the flat number after the
  // "+" sign of Crit Rate / Crit RES / Block Rate / Accuracy (worth value ÷ the rank's base), flat Crit DMG / Block
  // Efficiency (added on a crit / removed on a block, scaled by the skill coefficient), flat Effect Hit / RES,
  // affinity and aegis per element (physical hits use their mean)
  const l0 = lvi(u.level), sr = d.rank && RANK_BASE && RANK_BASE[d.rank] ? d.rank : null;
  if (sr) { u.sr = sr; u.rk = rankGroup(sr); u.bMas = RANK_BASE[sr][0]; u.bAff = RANK_BASE[sr][1]; }
  // Damage(): the defender's rank divides the skill DMG it takes (no rank set: the lowest sub-rank of the level)
  u.sub = sr || subOfLevel(u.level); setSdr(u, sdrOf(u.sub));
  // the ranks of the equipped Techniques and Charms (Beauty of Balance II compares their average with the server's)
  u.skRanks = [...(d.skills || []), ...(d.charms || [])].filter((x) => x && !x.custom && x.id).map((x) => clamp(x.rank || 1, 1, 34));
  const vb = sr ? RANK_BASE[sr][2] : LV.crit[l0] || 1, eb = sr ? RANK_BASE[sr][3] : LV.eres[l0] || 1, num = (v) => (v != null && v !== '' ? +v || 0 : null);
  u.critRate += (num(d.critRateV) || 0) / vb; u.critRes += (num(d.critResV) || 0) / vb; u.blockRate += (num(d.blockRateV) || 0) / vb; u.acc += (num(d.accV) || 0) / vb;
  u.critPowV = num(d.critDmgV) || 0; u.blockValV = num(d.blockEffV) || 0;
  if (num(d.effHitV) != null) u.effHit = num(d.effHitV) / eb;
  if (num(d.effResV) != null) u.effRes = num(d.effResV) / eb;
  u.healBoost = (num(d.healBoost) || 0) / 100; u.pvpAdd = (num(d.pvpAdd) || 0) / 100; u.pvpRes = (num(d.pvpRes) || 0) / 100;
  u.affEl = {}; u.aegisEl = {};
  for (const e of ELS) { if (num(d['aff_' + e]) != null) u.affEl[e] = num(d['aff_' + e]); if (num(d['aeg_' + e]) != null) u.aegisEl[e] = num(d['aeg_' + e]); }
  if (Object.keys(u.affEl).length) u.affEl.phy = ELS.reduce((s, e) => s + (u.affEl[e] || 0), 0) / 5;
  if (Object.keys(u.aegisEl).length) u.aegisEl.phy = ELS.reduce((s, e) => s + (u.aegisEl[e] || 0), 0) / 5;
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
    u.skills.push({ s, n, cd: s.cd || 0, init: s.cd && !s.zi ? s.cd + 1 : 0, rank: clamp(sl.rank || 1, 1, 34) });
  }
  u.healUp = 0; u.lsAll = 0;
  u.ch = compileCharms(d.charms, u);
  return u;
}
/** Charms (비법) → stat changes applied to the template + immutable hook lists used during the fight */
const newCh = () => ({ procs: [], inflicts: [], hurt: [], block: [], dmgUp: [], dmgRed: [], shields: [] });
function compileCharms(list, u) {
  const ch = newCh();
  let any = false;
  const l = lvi(u.level);
  for (const sl of list || []) {
    const c = sl && CHARM.get(sl.id); if (!c || !c.fx) continue;
    any = true;
    const r = clamp(sl.rank || 1, 1, 34), q = RANK_Q[r - 1], R = RANK_R[r - 1], A = flatBase(c.g, u.level);
    const coef = c.c ? c.c[q] / 100 : 0, flat = (c.fm || 0) * R * A, healPct = c.hv ? c.hv[q] / 100 : 0, healFlat = (c.hfm || 0) * R * A * CURE_BASE;
    const pct = (a) => (Array.isArray(a) ? a[q] / 100 : 0);
    const k0 = new Set(Object.keys(ch)), sh0 = ch.shields.length, ls0 = u.lsAll;
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
        // 2026-11-21: from the game hooks (duel.json passives, their trigger skills and status props)
        case 'repel': ch.repel = { p: f[1], el: f[2], r: f[3], kb: f[4], coef, flat }; break;
        case 'frostGuard': ch.frostGuard = { v: pct(f[1]), healPct, healFlat }; break;
        case 'burnAura': ch.burnAura = { p: f[1], coef, flat }; break;
        case 'ripple': ch.ripple = { r: f[1], coef, flat }; break;
        case 'becure': ch.becure = pct(f[1]); break;
        case 'windEcho': ch.windEcho = { p: f[1], coef, flat }; break;
        case 'wildfire': ch.wildfire = { p: f[1], coef, flat }; break;
        case 'soulImpact': ch.soulImpact = { r: f[1], coef, flat }; break;
        case 'resurrect': ch.resurrect = { healPct, healFlat }; break;
        case 'sumAtk': ch.sumAtk = (ch.sumAtk || 0) + pct(f[1]); if (f[2]) ch.sumLife = (ch.sumLife || 0) + f[2]; break;
        case 'overheal': ch.overheal = { p: f[1], healPct, healFlat }; break;
        case 'erodeTwice': ch.erodeTwice = f[1]; break;
        case 'shadowVeng': ch.shadowVeng = pct(f[1]); break;
        case 'vigil': ch.vigil = pct(f[1]); break;
        case 'ownTurnRed': ch.ownTurnRed = pct(f[1]); break;
        case 'shatter': ch.shatter = { coef, flat }; break;
        case 'overload': ch.overload = pct(f[1]); break;
        case 'fieryRejuv': ch.fieryRejuv = { healPct, healFlat }; break;
        case 'sumPresence': ch.sumPresence = pct(f[1]); break;
        case 'soulbond': ch.soulbond = { healPct, healFlat }; break;
        case 'mantra': ch.mantra = pct(f[1]); break;
        case 'darkStar': ch.darkStar = [pct(f[1]), pct(f[2]), pct(f[3])]; break;
        case 'counterUp': ch.counterUp = pct(f[1]); break;
        case 'healShift': ch.healShift = pct(f[1]); break;
        case 'holyRestore': ch.holyRestore = { n: f[1], healPct, healFlat }; break;
        case 'holyRecup': ch.holyRecup = { dmg: f[1], healPct, healFlat }; break;
        case 'shadowstep': ch.shadowstep = { spd: pct(f[1]), red: pct(f[2]) }; break;
        case 'flamingHeel': ch.flamingHeel = { r: f[1], coef, flat }; break;
        case 'zeal': ch.zeal = pct(f[1]); break;
        case 'sumPact': ch.sumPact = pct(f[1]); break;
        case 'elixir': ch.elixir = { start: f[1], max: f[2], every: f[3], healPct, healFlat }; break;
      }
    }
    // PvP rate of the heals / shields / lifesteal this Charm makes ([rate, governed], duel.json pvp): on the hooks it added
    const pr = PVPR && PVPR[c.id];
    if (pr) {
      for (const k of Object.keys(ch)) if (!k0.has(k)) (ch.pvk = ch.pvk || {})[k] = pr;
      for (let i = sh0; i < ch.shields.length; i++) ch.shields[i].pv = pr;
      if (u.lsAll !== ls0) u.lsPv = Math.min(u.lsPv || 1, pr[0]);
    }
  }
  return any ? ch : null;
}
// summons and Blast Spirit (game data, SUMMONS) and Void Chant's rune are played by their own code; skills without
// public game data (Rock Rex, Thalasson) keep kind 'none' and stay out of the fight
const VOID_CHANT = 10124;
for (const s of SKILLS) if (s.kind === 'none') { if (SUMMONS && SUMMONS[s.id]) { s.kind = 'summon'; s.sum = SUMMONS[s.id]; } else if (s.id === VOID_CHANT) s.kind = 'rune'; }
/** a summoned creature (FightHitSummon, game data): the caster's own sheet × the inherited share × the rank factor of the
 *  summoning skill's rank, plus the fixed part (level curve × factor). Percent and elemental stats are inherited in full. */
function sumStats(u, base, c, ri, level) {
  const at = (v) => (Array.isArray(v) ? v[ri] : v), st = {};
  for (const f of ['hp', 'atk', 'def', 'spd']) st[f] = (base[f] || 0) * (c.add[f] || 0) * (c.rf && c.rf[f] != null ? at(c.rf[f]) : 1);
  for (const x of c.fx || []) st[x.f] += ((SUMCURVE[x.cv] || [])[lvi(level)] || 0) * at(x.m);
  u.hpMax = Math.max(1, Math.round(st.hp)); u.atk = Math.max(1, Math.round(st.atk)); u.def = Math.max(0, Math.round(st.def)); u.spd = Math.max(1, Math.round(st.spd));
}
function buildSummon(h, k) {
  const c = k.s.sum.cr;
  const u = { kind: 'summon', sum: true, pet: true, name: c.ko, art: c.art, cr: c.id, level: h.level, move: c.move || 0, sz: 1, ch: null, healUp: 0, lsAll: 0, rk: h.rk, sr: h.sr, bMas: h.bMas, bAff: h.bAff, affEl: { ...h.affEl }, aegisEl: { ...h.aegisEl } };
  for (const f of PCT) u[f] = h[f];
  for (const f of RAW) u[f] = h[f];
  for (const f of ['critPowV', 'blockValV', 'healBoost', 'pvpAdd', 'pvpRes']) u[f] = h[f] || 0;
  sumStats(u, { hp: h.hpMax, atk: h.atk, def: h.def, spd: h.spd }, c, k.rank - 1, h.level); copySdr(u, h);
  u.skills = (c.sk || []).map((x) => {
    if (x.kind === 'heal') return { s: { id: x.id, en: x.en, ko: x.ko, kind: 'heal', el: 'none', tg: x.tg }, n: { healPct: x.hv, healFlat: 0 }, cd: x.cd || 0, init: 0 };
    if (x.kind === 'advance') return { s: { id: x.id, en: x.en, ko: x.ko, kind: 'advance', el: 'none', r: x.r }, n: { v: x.v }, cd: x.cd || 0, init: 0 };
    return { s: { ...x, kind: 'kit' }, n: { coef: x.c, flat: 0 }, cd: x.cd || 0, init: 0 };
  });
  if (c.aura) u.aura = c.aura;
  return u;
}
/** Decoy Clone: no skills, never walks; its stats come from the enemy it links to when it is cast */
function buildClone(h, k) {
  const c = k.s.sum.cr;
  const u = { kind: 'summon', sum: true, clone: true, pet: true, name: c.ko, art: 'doll', cr: c.id, level: h.level, move: 0, sz: 1, ch: null, healUp: 0, lsAll: 0, affEl: {}, aegisEl: {}, skills: [], hpMax: 1, atk: 1, def: 0, spd: 1, rkLv: k.rank - 1 };
  for (const f of PCT) u[f] = 0;
  for (const f of RAW) u[f] = 0;
  copySdr(u, h);
  return u;
}
/** Fantomon: a dormant companion unit (support skill, and materialization for adults) */
function buildPet(d, owner) {
  const p = PET.get(d.id); if (!p) return null;
  const r = clamp(d.rank || 1, 1, 34), q = RANK_Q[r - 1], R = RANK_R[r - 1];
  const u = { kind: 'pet', name: p.ko, petId: p.id, level: owner.level, move: 4, pet: true, affEl: {}, healUp: 0, lsAll: 0, ch: null, rk: owner.rk, sr: owner.sr, bMas: owner.bMas, bAff: owner.bAff };
  u.atk = Math.max(1, +d.atk || 1); u.def = Math.max(0, +d.def || 0); u.hpMax = Math.max(1, +d.hp || 1); u.spd = Math.max(1, +d.spd || 1); copySdr(u, owner);
  for (const k of PCT) u[k] = HERO_DEFAULTS[k] / 100;
  for (const k of RAW) u[k] = 0;
  const adult = !!(d.adult && p.mat);
  // materialized skills: damage / heal / shield (bv × Fantomon DEF) / buff (bv)
  u.skills = adult ? p.skills.map((s) => ({ s: { ...s, ko: s.ko || s.en }, n: s.kind === 'heal' ? { healPct: s.hv[q] / 100, healFlat: 0 } : s.kind === 'dmg' ? { coef: s.c[q] / 100 / Math.max(1, s.hits || 1), flat: 0 } : { bv: s.bv ? s.bv[q] / 100 : 0 }, cd: s.cd || 0, init: s.zi ? 0 : s.cd && s.cd < 90 ? s.cd + 1 : 0 })) : [];
  const sp = p.sup, A = flatBase(sp.g, owner.level), v = {};
  for (const [k, a] of Object.entries(sp.v || {})) v[k] = a[q] / 100;
  u.sup = { k: sp.k, el: sp.el, ar: sp.ar || 0, lim: sp.lim || 0, eff: adult && sp.effAdult ? sp.effAdult : sp.eff, dispelBuff: sp.dispelBuff, healOwner: sp.healOwner, big: sp.big || 0, cleanse: sp.cleanse || 0, defStk: sp.defStk || 0, name: sp.ko || sp.en, coef: sp.c ? sp.c[q] / 100 : 0, flat: (sp.fm || 0) * R * A, healPct: sp.hv ? sp.hv[q] / 100 : 0, healFlat: (sp.hfm || 0) * R * A * CURE_BASE, v };
  u.mat = adult ? p.mat : null;
  // adult-form passives
  if (adult) for (const pv of p.pv || []) {
    const val = (key) => (pv.v && pv.v[key] ? pv.v[key][q] / 100 : 0);
    switch (pv.k) {
      case 'killSplash': (u.ch = u.ch || newCh()).killSplash = { el: pv.el, ar: pv.ar, coef: pv.c ? pv.c[q] / 100 : 0, flat: 0 }; break;
      case 'dmgRedTaunt': (u.ch = u.ch || newCh()).dmgRed.push(['vsTaunted', val(pv.key)]); break;
      case 'healUp': u.healUp += val(pv.key); break;
      case 'regenAllies': u.regenAllies = { r: pv.r, pct: pv.hv ? pv.hv[q] / 100 : 0, name: pv.ko || pv.en }; break;
      case 'phantom': u.phantom = { life: pv.life, r: pv.r, el: pv.el, coef: pv.c ? pv.c[q] / 100 : 0, eff: pv.eff || [], name: pv.ko || pv.en }; break;
    }
  }
  return u;
}
function buildMob(key, level, opts, sr, fix, uws) {
  const mob = MOB.get(key), st = Array.isArray(fix) && fix.length >= 14 ? stFrom(fix, level) : mobStats(key, level, sr);
  if (!st) throw new Error(`${mob.ko}: 이 레벨·랭크의 능력치 자료가 없습니다`);
  // body size: Hieromon (신수 시련) 4×4 / 5×5 from the game data (mob.sz); other bosses have no public body
  // data and stand on 2×2 (assumption: the game's dash text names bodies "larger than 4 grids", so 4-cell bodies exist)
  const sz = mob.sz || (mob.ty === 2 ? 2 : 1);
  const u = { kind: 'mob', name: mob.ko, key, level, move: mob.raid ? mob.raid.move : 4, sz, big: sz > 1, ty: mob.ty, er: mob.er || null, affEl: {}, healUp: 0, lsAll: 0, ch: null, uws: !!uws, raid: !!mob.raid, kit: !!mob.kit };
  u.atk = st.atk; u.def = st.def; u.hpMax = st.hp; u.spd = st.spd;
  for (const k of PCT) u[k] = (st[k] || 0) / 100;
  for (const k of RAW) u[k] = 0;
  // the monster's own elemental stats (game curves): mastery / resistance, affinity / aegis per element;
  // physical hits use the mean of the five (Damage(): ElementType None / Physical)
  if (st.ele) {
    const e = st.ele, mean = (o) => ELS.reduce((s, k) => s + (o[k] || 0), 0) / 5;
    u.mastery = e.mast || 0; u.phyMastery = e.pmast || 0; u.res = e.eres || 0; u.phyRes = e.pres || 0;
    u.affEl = { ...e.aff, phy: mean(e.aff) }; u.aegisEl = { ...e.aeg, phy: mean(e.aeg) };
  }
  // the elemental formula divides by the side's own rank bases: the monster's sub-rank when it has one
  const sub = mob.map ? MAP.get(mob.map).sr : sr || mob.sr;
  if (sub && RANK_BASE && RANK_BASE[sub]) { u.bMas = RANK_BASE[sub][0]; u.bAff = RANK_BASE[sub][1]; }
  u.rk = rankGroup(sub); u.demon = !!mob.map; // Fantasia Ascent: the second rank table
  setSdr(u, st.sd || sdrOf(sub)); // its curve's skill-DMG reduction pair, or its sub-rank's
  const mc = opts.mobCoef != null ? opts.mobCoef : 1;
  // boss kit (Hieromon, raid boss): the game's own hit configs, coefficients (per hit) and cooldowns; the opening
  // cooldown is CD + 1. Summons are not simulated.
  if (mob.kit) u.skills = mob.sk.filter((s) => !s.sum).map((s) => ({ s: { ...s, kind: 'kit' }, n: { coef: s.c, flat: 0 }, cd: s.cd || 0, init: (s.cd || 0) + 1 }));
  else u.skills = mob.sk.map((s, i) => ({ s: { ...s, kind: 'dmg', ko: `${EL_KO[s.el] || ''} ${s.tg.t === 'S' ? '공격' : '광역 공격'}`.trim() }, n: { coef: mc / Math.max(1, s.hits || 1), flat: 0 }, cd: i ? 2 : 0, init: i ? i + 1 : 0 }));
  compileMobPassives(u, mob, mc, opts.pvEst !== false);
  return u;
}
/** monster passives (비전) → hook lists. Passive damage uses the mob-skill coefficient (mc). Estimated ones only when est is on. */
function compileMobPassives(u, mob, mc, est) {
  if (!mob.pv || !mob.pv.length) return;
  const mp = {}, ch = { procs: [], inflicts: [], hurt: [], block: [], dmgUp: [], dmgRed: [], shields: [] };
  let anyCh = false;
  for (const id of mob.pv) {
    const p = MOB_PV[id];
    if (!p || p.k === 'none' || (p.est && !est)) continue;
    switch (p.k) {
      case 'er': u.er = { ...(u.er || {}), ...p.er }; break;
      case 'counter': ch.hurt.push({ p: p.p, el: p.el, by: 'atk', range: p.r, coef: p.c != null ? p.c : mc, flat: 0, aoe: p.aoe || 0 }); anyCh = true; break;
      case 'venom': ch.procs.push({ on: 'hit', p: 1, el: p.el, ar: 0, opt: { eff: [{ k: 'dot', el: 'dark', p: p.p, t: p.t }] }, coef: mc, flat: 0 }); anyCh = true; break;
      case 'dot': ch.inflicts.push({ p: p.p, e: { k: 'dot', el: p.el, t: p.t } }); anyCh = true; break;
      case 'move': u.move = p.v; break;
      default: (mp[p.k] = mp[p.k] || []).push({ ...p, name: p.ko });
    }
  }
  if (anyCh) u.ch = ch;
  if (Object.keys(mp).length) u.mp = mp;
  u.mc = mc;
}
/** footprint offsets from the anchor cell, n×n square from -floor((n-1)/2): 2×2 0..1, 3×3 -1..1, 4×4 -1..2, 5×5 -2..2
 *  (the game's BodyRangeInfos use the same anchors for the 4×4 and 5×5 Hieromon) */
const fpLo = (n) => -Math.floor((n - 1) / 2);
const FP = {};
for (let n = 1; n <= 5; n++) { FP[n] = []; for (let dy = fpLo(n); dy < fpLo(n) + n; dy++) for (let dx = fpLo(n); dx < fpLo(n) + n; dx++) FP[n].push([dx, dy]); }
export const fpOf = (u) => FP[u.sz] || FP[1];
/* boss-kit geometry (game frame, y up): Pos2d.LookDirection, the client's turn() of a hit cell, and per-skill entries
   (one per aim offset and facing) with an index from a covered offset to the entries that reach it */
const kitKey = (x, y) => (x + 64) * 256 + (y + 64);
const turnC = (c, dir, flip) => { const x = flip ? -c[0] : c[0], y = c[1]; return dir === 'U' ? [x, y] : dir === 'D' ? [-x, -y] : dir === 'L' ? [-y, x] : [y, -x]; };
const lookDir = (dx, dy) => (!dx && !dy ? 'U' : dx > 0 ? (dy > dx ? 'U' : dy < -dx ? 'D' : 'R') : (dy > -dx ? 'U' : dy < dx ? 'D' : 'L'));
const KITGEO = new WeakMap();
// cells cast from the caster turn about the centre of its body: a 4×4 body (−1..2) turns about (½, ½), otherwise
// facing down or left would open a gap between the body and the area (the data's aim rings are centred the same way)
const turnB = (c, dir, flip, co) => { if (!co) return turnC(c, dir, flip); const t = turnC([c[0] - co, c[1] - co], dir, flip); return [t[0] + co, t[1] + co]; };
function kitGeo(s, co = 0) {
  let byCo = KITGEO.get(s.h); if (!byCo) KITGEO.set(s.h, (byCo = {}));
  let G = byCo[co]; if (G) return G;
  const entries = [], byOff = new Map();
  const all = s.h.some((h) => h.r == null && h.c === -1), aimed = s.h.some((h) => !h.s);
  let ar = 1;
  for (const h of s.h) if (!h.s && h.c >= 0) for (const [x, y] of s.sets[h.c]) ar = Math.max(ar, Math.abs(x) + Math.abs(y));
  for (const g of s.rnd || []) if (!g.s) for (const [x, y] of g.pool) ar = Math.max(ar, Math.abs(x) + Math.abs(y));
  for (const r of s.rng) {
    const rx = r[0] - co, dir = lookDir(rx, r[1] - co);
    for (const flip of rx === 0 ? [false, true] : [rx < 0]) {
      // a random strike's own cells sit around its picked pool cell, so only the pool counts for planning
      const cells = s.h.map((h) => (h.c === -1 ? 'ALL' : s.sets[h.c].map((c) => turnB(c, dir, flip, h.s && h.r == null ? co : 0))));
      const pools = (s.rnd || []).map((g) => g.pool.map((c) => turnB(c, dir, flip, g.s ? co : 0)));
      const keys = new Set();
      s.h.forEach((h, i) => { if (h.r == null && cells[i] !== 'ALL') for (const [x, y] of cells[i]) keys.add(kitKey(x + (h.s ? 0 : r[0]), y + (h.s ? 0 : r[1]))); });
      (s.rnd || []).forEach((g, gi) => { for (const [x, y] of pools[gi]) keys.add(kitKey(x + (g.s ? 0 : r[0]), y + (g.s ? 0 : r[1]))); });
      const ei = entries.length; entries.push({ r, dir, flip, dep: rx === 0, cells, pools, keys });
      for (const k of keys) { let l = byOff.get(k); if (!l) byOff.set(k, (l = [])); l.push(ei); }
    }
  }
  G = { entries, byOff, all, aimed, ar, entryHas: (ei, dx, dy) => entries[ei].keys.has(kitKey(dx, dy)) };
  byCo[co] = G;
  return G;
}
/** where a unit may be placed before the fight (inside the drawn board): x columns, y rows per team */
export const CELL_BOX = { x: [4, 16], y: [[3, 9], [11, 17]] };
const okCell = (c, ti) => Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= CELL_BOX.x[0] && c[0] <= CELL_BOX.x[1] && c[1] >= CELL_BOX.y[ti][0] && c[1] <= CELL_BOX.y[ti][1];
/** setup: { mode:'pve'|'pvp', teams:[[def...],[def...]], roundCap, pvpBalance, mobCoef } — a def may carry cell:[x,y] */
export function prepare(setup) {
  const opts = { mobCoef: setup.mobCoef, pvEst: setup.pvEst };
  const teams = [[], []];
  setup.teams.forEach((defs, ti) => {
    for (const d of defs) {
      if (d.kind === 'mob') { const n = clamp(+d.count || 1, 1, 20); for (let i = 0; i < n; i++) { const u = buildMob(d.key, +d.level || 1, opts, d.sr, d.fix, d.uws); u.ref = d.uid; u.nth = i; if (!i) u.cellReq = d.cell; teams[ti].push(u); } }
      else { const h = buildHero(d, opts); h.cellReq = d.cell; teams[ti].push(h); if (d.pet && d.pet.id) { const p = buildPet(d.pet, h); if (p) { p.ref = d.uid + ':pet'; h.petU = p; } } }
    }
  });
  const units = [];
  teams.forEach((list, ti) => {
    // chosen starting cells first (inside the team's box), large monsters next (front, centre-out),
    // then melee units to the front row, ranged behind; rows fill centre-out
    const taken = new Set();
    const cellsAt = (u, x, y) => fpOf(u).map(([dx, dy]) => [x + dx, y + dy]);
    const onSide = (y) => (ti === 0 ? y <= 9 : y >= 11);
    const canPut = (u, x, y) => cellsAt(u, x, y).every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < W && cy < H && onSide(cy) && !taken.has(cy * W + cx));
    const put = (u, x, y) => { u.x = x; u.y = y; for (const [cx, cy] of cellsAt(u, x, y)) taken.add(cy * W + cx); };
    for (const u of list) if (okCell(u.cellReq, ti) && canPut(u, u.cellReq[0], u.cellReq[1])) { u.fixedCell = 1; put(u, u.cellReq[0], u.cellReq[1]); }
    const withReach = list.map((u) => ({ u, reach: Math.max(0, ...u.skills.filter((k) => k.s.kind === 'dmg').map((k) => skillReach(k.s))) || 1 }));
    withReach.sort((a, b) => a.reach - b.reach);
    for (const { u } of withReach) if (!u.fixedCell && u.sz > 1) {
      // the body's front row touches the centre line: team 0 up to row 9, team 1 from row 11
      const lo = fpLo(u.sz), front = ti === 0 ? 9 - (lo + u.sz - 1) : 11 - lo;
      outer: for (let row = 0; row < 7; row++) for (const col of [10, 7, 13, 4, 16]) { const y = ti === 0 ? front - row : front + row; if (canPut(u, col, y)) { put(u, col, y); u.fixedCell = 1; break outer; } }
    }
    const cols = [10, 9, 11, 8, 12, 7, 13, 6, 14];
    const perRow = list.length > 20 ? 9 : list.length > 15 ? 7 : 5;
    let slot = 0;
    withReach.forEach(({ u, reach }) => {
      u.team = ti; u.reach = reach;
      if (!u.fixedCell) { let x, y; do { const row = Math.floor(slot / perRow); x = cols[slot % perRow]; y = ti === 0 ? 9 - row : 11 + row; slot++; } while (taken.has(y * W + x) && slot < 400); put(u, x, y); }
      delete u.cellReq; delete u.fixedCell;
      units.push(u);
    });
  });
  // dormant Fantomon units go after the fighters
  for (const h of units.slice()) if (h.petU) { const p = h.petU; delete h.petU; p.team = h.team; p.x = -1; p.y = -1; p.out = true; p.ownerRef = h; h.petRef = p; units.push(p); }
  // summon slots: dormant creatures per summon skill, two sets so a re-cast can overlap one still standing
  // (a Decoy Clone stands on the side of the enemy it links to)
  for (const h of units.slice()) if (h.kind === 'hero') h.skills.forEach((k, i) => {
    const sm = k.s.sum; if (!sm || sm.kind === 'trap') return;
    for (let j = 0; j < sm.cells.length * 2; j++) {
      const p = sm.kind === 'clone' ? buildClone(h, k) : buildSummon(h, k);
      p.team = sm.kind === 'clone' ? 1 - h.team : h.team; p.x = -1; p.y = -1; p.out = true; p.ownerRef = h; p.sumSk = i; p.slot = j; p.ref = `${h.ref}:s${i}:${j}`;
      units.push(p);
    }
  });
  units.forEach((u, i) => { u.id = i; });
  for (const u of units) { if (u.ownerRef) { u.owner = u.ownerRef.id; delete u.ownerRef; } if (u.petRef) { u.petI = u.petRef.id; delete u.petRef; } }
  const pvp = setup.mode === 'pvp';
  // prank: the party's rank group for the PvE rank gap (null = same rank as each monster, no gap)
  // days: server age, for Beauty of Balance II's expected skill rank (purrwikimania.com's default 150)
  const days = setup.serverDays != null && setup.serverDays !== '' && isFinite(+setup.serverDays) ? Math.max(0, Math.round(+setup.serverDays)) : 150;
  return { units, pvp, balance: pvp && setup.pvpBalance !== false, days, roundCap: Math.max(1, +setup.roundCap || (pvp ? 100 : 15)), prank: !pvp && RANK_ORDER.includes(setup.rank) ? setup.rank : null };
}

/** Beauty of Balance II (PVPSkillPropsScaleOnBattleProcessor, as purrwikimania.com's team simulator reads it): one factor
 *  per match on skill DMG, healing and shields = survival × rankScale × balance, from the characters on the field.
 *  survival: the lowest output-to-survivability ratio (ATK²/(ATK+DEF)/HP × crit × block × elements × DMG bonus) above
 *  0.1 → 0.1 ÷ ratio; rankScale: decay[server's average skill rank] ÷ decay[fight's skill rank], at most 1 (the fight's:
 *  per side the highest of its characters' average Technique + Charm rank, then the mean of the two sides);
 *  balance: the mean of the characters' balance[rank][level] (Legend 46.6–99.5%, Angel 83–99%, else 100%). */
export function pvpGovernor(units, days) {
  const G = PVP_GOV, hs = units.filter((u) => u.kind === 'hero');
  if (!G || !hs.length) return { scale: 1, survival: 1, ratio: 0, rankScale: 1, fightRank: 0, serverRank: 0, balance: 1 };
  const minBA = Math.min(...hs.map((s) => s.acc)), minCA = Math.min(...hs.map((s) => s.critRes));
  const ratio = Math.min(...hs.map((s) => {
    const l = lvi(s.level), bAff = s.bAff || LV.aff[l] || 1, bMas = s.bMas || LV.mas[l] || 1;
    const p = clamp(0.05 + s.critRate - minCA, 0, 1), m = Math.max(s.critDmg - minCA, 1.3);
    const b = clamp(s.blockRate - minBA, 0, 1), bv = Math.max(s.blockEff - minBA, 1.5);
    let r = (s.atk * s.atk) / (s.atk + s.def) / s.hpMax;
    r *= 1 - p + p * m; r /= 1 - b + b * bv;
    const affAvg = ELS.reduce((a, e) => a + (s.aff || 0) + ((s.affEl && s.affEl[e]) || 0), 0) / 5;
    const aegAvg = ELS.reduce((a, e) => a + (s.aegis || 0) + ((s.aegisEl && s.aegisEl[e]) || 0), 0) / 5;
    r *= (1 + affAvg / bAff + (s.phyMastery / bMas + s.mastery / bMas) / 2) / (1 + aegAvg / bAff + (s.phyRes / bMas + s.res / bMas) / 2);
    r *= (1 + s.dmgBoost + (s.pvpAdd || 0)) / (1 + s.dmgRes + (s.pvpRes || 0));
    return r;
  }));
  const survival = ratio > G.minSurvival ? G.minSurvival / ratio : 1;
  const facMax = [0, 0];
  for (const s of hs) { const rs = s.skRanks || []; const avg = rs.length ? Math.floor(rs.reduce((a, b) => a + b, 0) / rs.length) : 0; facMax[s.team] = Math.max(facMax[s.team], avg); }
  const fightRank = Math.floor((facMax[0] + facMax[1]) / 2);
  const serverRank = G.avgSkillRank[Math.min(Math.max(0, days | 0), G.avgSkillRank.length - 1)];
  const dF = G.decay[fightRank] || 0, dS = G.decay[serverRank] || 0;
  const rankScale = dF > 0 ? Math.min(1, dS / dF) : 1;
  const bal = hs.map((s) => {
    const row = G.balance[RANK_ORDER.indexOf(rankGroup(s.sub)) + 1], lv = Math.floor(s.level);
    if (!row || lv < row.lo) return 1;
    if (lv <= row.flatTo) return row.v0 / 10000;
    const v = row.v[lv - row.flatTo - 1]; return v ? v / 10000 : 1;
  });
  const balance = bal.reduce((a, b) => a + b, 0) / bal.length;
  return { scale: survival * rankScale * balance, survival, ratio, rankScale, fightRank, serverRank, balance };
}

/* ───────── battle ───────── */
const DIAMOND = (() => { const o = []; for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) { const d = Math.abs(dx) + Math.abs(dy); if (d <= 10) o.push([dx, dy, d]); } return o.sort((a, b) => a[2] - b[2]); })();
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/* Side-relative search orders. The two sides stand on a mirror image of each other (y → 20 − y), so every "first
   cell / first facing that is as good" tie must be read in the unit's own frame, or one side always takes the
   forward cell and the other the backward one (a 4v4 mirror match went 66% / 34% before this). */
const DIAMOND_1 = DIAMOND.map(([dx, dy, d]) => [dx, -dy, d]);
const diaOf = (u) => (u && u.team === 1 ? DIAMOND_1 : DIAMOND);
const DIR_ORDER = [[0, 1, 2, 3], [2, 1, 0, 3]]; // facings to try: forward, right, back, left in each side's frame
const AIM_OFF = [[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1]]];
const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

export function simulate(P, seed, log) {
  const rnd = rngFrom(seed);
  const occ = new Int16Array(W * H).fill(-1);
  const setOcc = (u, v) => { for (const [dx, dy] of fpOf(u)) { const x = u.x + dx, y = u.y + dy; if (x >= 0 && y >= 0 && x < W && y < H) occ[y * W + x] = v; } };
  const ev = log ? [] : null;
  const U = P.units.map((t) => ({
    ...t, hp: t.hpMax, alive: !t.out, st: [], turnNo: 0, next: 0, pool: 0,
    cds: t.skills.map((k) => k.init), shield: 0, flip: t.team === 1, awoke: 0, elState: null, infN: 0, tideN: 0,
    mAtk: 1, aAtk: 0, mDef: 1, aDef: 0, mSpd: 1, aSpd: 0, bBlock: 0, bCrit: 0, bDmg: 0, red: 1, vuln: 0, cold: 0, riven: 0, sigil: 0, wet: 0, blind: 0, moveAdd: 0, dodgeB: 0, bAcc: 0,
    dmg: 0, taken: 0, healed: 0, kills: 0, lastAil: -9, ailStreak: 0,
    casts: 0, eye: 0, stone: 0, marks: 0, lossAcc: 0, supTurn: -1, supN: 0, petStk: 0, undyingUsed: false, above50: true, voidUsed: false, energy: 0, reactCast: -1,
  }));
  const B = { U, pvp: P.pvp, round: 1, pvpScale: 1, sumScale: 1, healScale: 1, gov: 1, castId: 0, over: false, winner: -1, now: 0, traps: [], trapN: 0, totem: false, cur: null, turnSeq: 0, elixir: [] };
  // Beauty of Balance II: the match's PvP governor on skill DMG / healing / shields (with the PvP stage effects)
  if (P.balance) B.gov = pvpGovernor(P.units, P.days != null ? P.days : 150).scale;
  /** a skill's PvP rate on its heals / shields, times the governor (Techniques are governed) */
  const skR = (s) => (P.pvp ? ((s && PVPR[s.id] && PVPR[s.id][0]) || 1) * B.gov : 1);
  /** a Charm hook's PvP rate ([rate, governed] from compileCharms) */
  const pvOf = (x) => (P.pvp && x ? x[0] * (x[1] ? B.gov : 1) : 1);
  const chR = (u, key) => pvOf(u.ch && u.ch.pvk && u.ch.pvk[key]);
  for (const u of U) if (!u.out) setOcc(u, u.id);
  const aliveCount = [0, 0];
  const proxU = U.filter((u) => u.mp && u.mp.prox); // units with an on-enter proximity passive
  for (const u of U) if (!u.pet) aliveCount[u.team]++;
  // monster passive stat multipliers: Cloud Veil stacks (ATK), Mettle of Trial stacks (ATK & DEF)
  const mettleF = (u) => { const m = u.mp && u.mp.mettle && u.mp.mettle[0]; return m ? 1 + m.v * Math.min(m.max, Math.floor((1 - u.hp / u.hpMax) / m.per + 1e-9)) : 1; };
  const eAtk = (u) => Math.max(1, (u.atk * u.mAtk + u.aAtk) * (u.ch && u.ch.atkSh && u.shield > 0 ? 1 + u.ch.atkSh : 1) * (u.cloudN ? 1 + u.cloudN * u.cloudV : 1) * (u.mp ? mettleF(u) : 1));
  const eDef = (u) => Math.max(0, (u.def * u.mDef + u.aDef) * (u.mp ? mettleF(u) : 1));
  const eSpd = (u) => Math.max(1, (u.spd * u.mSpd + u.aSpd) * (u.mp ? mettleF(u) : 1)); // Mettle of Trial: ATK, DEF and SPD
  const interval = (u) => 100000 / Math.sqrt(eSpd(u) * rankScale(u.level));
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && occ[y * W + x] < 0;
  /* unit footprints: large monsters stand on 2×2 or 3×3 cells */
  const fits = (u, x, y) => { for (const [dx, dy] of fpOf(u)) { const cx = x + dx, cy = y + dy; if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false; const o = occ[cy * W + cx]; if (o >= 0 && o !== u.id) return false; } return true; };
  /** grid steps from a cell to the nearest cell of a unit's footprint */
  const dU = (f, x, y) => { if (!(f.sz > 1)) return Math.abs(f.x - x) + Math.abs(f.y - y); let m = 99; for (const [dx, dy] of fpOf(f)) { const d = Math.abs(f.x + dx - x) + Math.abs(f.y + dy - y); if (d < m) m = d; } return m; };
  const dUU = (a, b) => { if (!(a.sz > 1)) return dU(b, a.x, a.y); if (!(b.sz > 1)) return dU(a, b.x, b.y); let m = 99; for (const [dx, dy] of fpOf(a)) m = Math.min(m, dU(b, a.x + dx, a.y + dy)); return m; };
  const setBalance = () => {
    if (!P.balance) return;
    // Beauty of Balance I: FinalCharacterDamageScale −80%, FinalSummonDamageScale −40%; Swift Resolution I: +10% each
    // from round 12 (both); Swift Resolution II: healing and shields −20% each from round 12 (4 stacks)
    B.pvpScale = B.round < 12 ? 0.2 : 0.2 + 0.1 * Math.min(99, B.round - 11);
    B.sumScale = B.round < 12 ? 0.6 : 0.6 + 0.1 * Math.min(99, B.round - 11);
    B.healScale = B.round < 12 ? 1 : Math.max(0.2, 1 - 0.2 * (B.round - 11));
  };
  setBalance();

  function recalc(u) {
    let mAtk = 1, mDef = 1, mSpd = 1, aAtk = 0, aSpd = 0, bBlock = 0, bCrit = 0, bDmg = 0, red = 1, vuln = 0, cold = 0, riven = 0, sigil = 0, wet = 0, blind = 0, sh = 0, mv = 0, aDef = 0, dodgeB = 0, bAcc = 0;
    let kAtk = 0, kDef = 0, kSpd = 0; // stacking debuffs (e.g. Fantomon DEF Reduction ×3) add on top of the strongest plain one
    for (const s of u.st) {
      switch (s.k) {
        case 'defUp': aDef += s.v; break;
        case 'wither': bDmg -= s.v * s.n; break;
        case 'dodgeUp': dodgeB = Math.max(dodgeB, s.v); break;
        case 'critStk': bCrit += s.v * s.n; break;
        case 'spdStk': aSpd += s.v * s.n; break;
        case 'weak': if (s.max) kAtk += s.v * s.n; else mAtk = Math.min(mAtk, 1 - s.v); break;
        case 'abreak': if (s.max) kDef += s.v * s.n; else mDef = Math.min(mDef, 1 - s.v); break;
        case 'slow': if (s.max) kSpd += s.v * s.n; else mSpd = Math.min(mSpd, 1 - s.v); break;
        case 'accUp': bAcc += s.v; break;
        case 'purity': red *= 1 - s.v; break;
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
    mAtk *= Math.max(0, 1 - kAtk); mDef *= Math.max(0, 1 - kDef); mSpd *= Math.max(0.1, 1 - kSpd);
    Object.assign(u, { mAtk, mDef, mSpd, aAtk, aSpd, bBlock, bCrit, bDmg, red, vuln, cold, riven, sigil, wet, blind, shield: sh, moveAdd: mv, aDef, dodgeB, bAcc });
  }
  const has = (u, k) => { for (const s of u.st) if (s.k === k) return s; return null; };
  /** replay log: status gained/refreshed (d = own turns left, n = stacks, b = buff, u = update of an existing one) */
  const stEv = (t, s, upd) => { if (ev) ev.push({ e: 'st', t: t.id, k: s.k, on: 1, b: s.buff ? 1 : 0, d: s.exp < 1e8 ? s.exp - t.turnNo : 0, n: s.n || 0, u: upd ? 1 : 0 }); };
  function addStatus(t, s) {
    let rep = false;
    if (s.uniq) { const i = t.st.findIndex((x) => x.k === s.k && x.uniq); if (i >= 0) { if (s.k === 'hpUp') dropHpUp(t, t.st[i]); t.st.splice(i, 1); rep = true; } }
    t.st.push(s); recalc(t);
    stEv(t, s, rep);
  }
  function dropHpUp(u, s) { const pct = u.hp / u.hpMax; u.hpMax = Math.max(1, u.hpMax - s.v); u.hp = Math.max(1, Math.round(u.hpMax * pct)); }
  function removeStatus(u, i) {
    const s = u.st[i]; u.st.splice(i, 1);
    if (s.k === 'hpUp') dropHpUp(u, s);
    if (ev) ev.push({ e: 'st', t: u.id, k: s.k, on: 0 });
  }
  function kill(t, by) {
    // Resurrection (an allied adventurer's charm, once per battle): the fallen character is revived and healed
    if (t.kind === 'hero' && !B.over) for (const r of U) if (r !== t && r.alive && r.team === t.team && r.ch && r.ch.resurrect && !r.resUsed) {
      r.resUsed = true; t.hp = 1; pvLabel(r, '리바이벌'); heal(r, t, r.hpMax * r.ch.resurrect.healPct + r.ch.resurrect.healFlat, chR(r, 'resurrect')); return;
    }
    if (t.sum && !t.clone) sumGone(t);
    t.alive = false; t.hp = 0; setOcc(t, -1);
    if (by) by.kills++;
    if (ev) ev.push({ e: 'die', u: t.id });
    // a Decoy Clone goes with the unit it links to (FollowDieId) and with its caster (its life counts the caster's turns)
    for (const c of U) if (c.clone && c.alive && (c.link === t.id || c.owner === t.id)) dismiss(c);
    if (B.traps.length) for (let i = B.traps.length - 1; i >= 0; i--) if (B.traps[i].src === t.id) { if (ev) ev.push({ e: 'trap', id: B.traps[i].id, on: 0 }); B.traps.splice(i, 1); }
    if (t.pet) { petGone(t); return; }
    aliveCount[t.team]--;
    if (aliveCount[t.team] <= 0) { B.over = true; B.winner = 1 - t.team; return; }
    if (by && by.alive && by.ch) {
      const c = by.ch;
      if (c.spdKill) { const s = has(by, 'spdStk'); if (s) { s.n = Math.min(4, s.n + 1); recalc(by); stEv(by, s, true); } else addStatus(by, { k: 'spdStk', v: by.spd * c.spdKill, n: 1, exp: 1e9, buff: true }); }
      if (c.killSplash) { const k = c.killSplash, cx = t.x, cy = t.y; for (const f of U) if (f.alive && f.team !== by.team && dU(f, cx, cy) <= k.ar) hit(by, f, k.coef, k.flat, k.el, { noProc: 1, noReact: 1 }); }
    }
  }
  function heal(a, t, v, r) {
    if (!t.alive || v <= 0) return 0;
    if (t.shadowF) return 0; // Shadow Form: cannot be healed
    if (r != null) v *= r; // PvP: the skill's / Charm's PvP rate and the governor
    v = Math.floor(v * B.healScale * (1 + (a.healUp || 0) + (a.healBoost || 0))); // Healing Boost (stats screen) + healing-up effects
    // Potential Vitality: healing received +x per 15% HP lost (up to 5); Healing Shift: +x and the heal becomes a 2-turn shield
    if (t.ch && t.ch.becure) v = Math.floor(v * (1 + t.ch.becure * lost15(t)));
    if (t.ch && t.ch.healShift && !t.shiftBusy) { v = Math.floor(v * (1 + t.ch.healShift)); t.shiftBusy = 1; addStatus(t, { k: 'shield', v, exp: t.turnNo + 2, buff: true, src: a.id, shift: 1 }); t.shiftBusy = 0; a.healed += v; if (ev) ev.push({ e: 'shield', t: t.id, v, sh: t.shield }); return v; }
    const real = Math.min(v, t.hpMax - t.hp);
    if (real <= 0) return 0;
    t.hp += real; a.healed += real;
    if (t.hp / t.hpMax >= 0.5) t.above50 = true;
    if (ev) ev.push({ e: 'heal', a: a.id, t: t.id, v: real, hp: t.hp });
    return real;
  }
  function addShield(a, t, v, turns, r) {
    if (r != null) v *= r;
    v = Math.floor(v * B.healScale); if (v <= 0) return;
    addStatus(t, { k: 'shield', v, exp: t.turnNo + turns, buff: true, src: a.id });
    if (ev) ev.push({ e: 'shield', t: t.id, v, sh: t.shield });
  }
  function elemMult(a, t, el) {
    const la = lvi(a.level), lt = lvi(t.level);
    const phy = el === 'phy';
    // affinity / mastery over the target's bases, aegis / resistance over the attacker's (a monster uses its sub-rank bases)
    const off = 1 + (a.aff + (a.affEl[el] || 0)) / (t.bAff || LV.aff[lt]) + (phy ? a.phyMastery : a.mastery) / (t.bMas || LV.mas[lt]);
    const de = 1 + (t.aegis + (t.aegisEl ? t.aegisEl[el] || 0 : 0)) / (a.bAff || LV.aff[la]) + (phy ? t.phyRes : t.res) / (a.bMas || LV.mas[la]);
    let m = off / de;
    if (t.er && t.er[el]) m *= 1 + t.er[el];
    if (el === 'water' && t.cold) m *= 1 + 0.05 * t.cold;
    return m;
  }
  // level gap: 4% a level up to 4 levels, 16% for 5–20 levels, 10% beyond 20 (the game's level offset table);
  // PvE also applies the rank gap (party rank set in the setup; a monster's rank comes from its sub-rank)
  function levelOffset(a, t) {
    // Damage() takes the level and rank gaps outside PvP only (purrwikimania team.js: `if (PVE) pct *= pveGap(att, def)`)
    if (P.pvp) return 1;
    const g = Math.floor(a.level) - Math.floor(t.level), ag = Math.abs(g);
    let f = g ? 1 + (ag > 20 ? 0.1 : 0.04 * Math.min(4, ag)) : 1;
    f = g > 0 ? f : g < 0 ? 1 / f : 1;
    // a character's own rank (stats screen) or the party rank picked in the settings; a monster's from its sub-rank
    if (!P.pvp) { const ra = a.kind === 'mob' ? a.rk : a.rk || P.prank, rb = t.kind === 'mob' ? t.rk : t.rk || P.prank; if (ra && rb) f *= rankGap(ra, rb, a.demon || t.demon); }
    return f;
  }

  /** raw damage application incl. shields; returns HP damage dealt */
  function applyDamage(a, t, d, o) {
    if (t.shadowF) { if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d: 0, k: 3, hp: t.hp, sh: t.shield, el: o.el }); return 0; } // Shadow Form: immune
    // Oath of Vigil: the guardian takes half of the DMG, reduced by its own share (+1% per 1% more DEF than the guarded)
    if (t.vigilBy != null && !o.vigil) { const g = U[t.vigilBy]; if (g && g.alive && g !== t) { const half = Math.floor(d * 0.5), red = Math.min(0.95, g.ch.vigil + Math.max(0, eDef(g) / Math.max(1, eDef(t)) - 1)); d -= half; applyDamage(a, g, Math.max(1, Math.floor(half * (1 - red))), { ...o, vigil: 1 }); if (!t.alive || B.over) return 0; } }
    const hadShield = t.shield > 0;
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
    let saved = false, shadow = false;
    if (hpDmg >= t.hp && t.ch && t.ch.undying && !t.undyingUsed) { t.undyingUsed = true; saved = true; hpDmg = t.hp - 1; }
    // Shadow Vengeance: the first lethal DMG leaves 1 HP and Shadow Form until the end of its next turn
    else if (hpDmg >= t.hp && t.ch && t.ch.shadowVeng && !t.svUsed) { t.svUsed = true; shadow = true; hpDmg = t.hp - 1; }
    t.hp -= hpDmg; a.dmg += hpDmg; t.taken += hpDmg;
    if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d, k: o.kind || 0, hp: t.hp, sh: t.shield, el: o.el });
    if (o.ls && hpDmg > 0) heal(a, a, hpDmg * o.ls); // lifesteal: the PvP rate is in o.ls, the governor already in the DMG
    // Decoy Clone: the HP it loses, the linked unit loses too (True DMG; shields still take it)
    if (t.clone && hpDmg > 0 && U[t.link] && U[t.link].alive) applyDamage(a, U[t.link], Math.max(1, Math.floor(hpDmg * (t.linkV || 1))), { el: o.el, kind: 4 });
    if (t.hp <= 0) { kill(t, a); return hpDmg; }
    if (shadow) { t.shadowF = 1; pvLabel(t, '섀도우 형태'); addStatus(t, { k: 'dmgUp', v: t.ch.shadowVeng, exp: t.turnNo + 1, buff: true, nd: 1, shadow: 1 }); }
    if (hadShield && t.shield <= 0 && t.ch && t.ch.ripple && !B.over) chRipple(t);
    if (hpDmg > 0 && t.ch && (t.ch.overload || t.ch.shadowstep)) chLossStacks(t, hpDmg);
    if (hpDmg > 0 && B.elixir.length && t.hp < t.hpMax * 0.5 && t.hp + hpDmg >= t.hpMax * 0.5) chElixir(t);
    if (saved) { const c = t.ch.undying; heal(t, t, t.hpMax * c.healPct + c.healFlat, chR(t, 'undying')); if (c.indom) addStatus(t, { k: 'dmgRed', v: 0.9, exp: t.turnNo + 2, buff: true }); }
    // HP-threshold charms
    const below = t.hp / t.hpMax < 0.5;
    if (t.ch && below && t.above50) for (const s of t.ch.shields) {
      if (s.when === 'below50' || (s.when === 'below50once' && !t.voidUsed)) {
        if (s.when === 'below50once') t.voidUsed = true;
        addShield(t, t, (s.by === 'hp' ? t.hpMax : eDef(t)) * s.v, s.t, pvOf(s.pv));
        if (s.opt.dodge) addStatus(t, { k: 'dodgeUp', v: 0.5, exp: t.turnNo + s.opt.dodge, buff: true, uniq: 1 });
      }
    }
    t.above50 = !below;
    if (t.mp && hpDmg > 0) mobPassiveHurt(t, hpDmg);
    if (!t.alive) return hpDmg;
    // Fantomon energy / Boaro-style shield
    if (t.petI != null) {
      const p = U[t.petI];
      if (p.mat && p.out) t.energy += 6;
      if (p.sup.k === 'shieldLoss' && t.supN < 5) { t.lossAcc += hpDmg; if (t.lossAcc >= t.hpMax * 0.15) { t.lossAcc -= t.hpMax * 0.15; t.supN++; addShield(t, t, eDef(t) * (p.sup.v.ShieldByDefence || 0), 3); } }
    }
    return hpDmg;
  }
  /* ── monster passives (비전) ── */
  const foesOfT = (u, cx, cy, r) => U.filter((f) => f.alive && f.team !== u.team && dU(f, cx, cy) <= r);
  /** passive area damage: c = the trigger skill's coefficient per hit (game data), else the mob coefficient split over the hits;
   *  around the caster the range counts from the edge of its body */
  function pvAoe(u, r, el, hits = 1, cx = u.x, cy = u.y, c) {
    const body = cx === u.x && cy === u.y && u.sz > 1;
    for (let h = 0; h < hits && !B.over && u.alive; h++) for (const f of (body ? U.filter((f) => f.alive && f.team !== u.team && dUU(f, u) <= r) : foesOfT(u, cx, cy, r))) hit(u, f, c != null ? c : (u.mc || 1) / hits, 0, el, { noProc: 1, noReact: 1 });
  }
  function pvLabel(u, name) { if (ev) ev.push({ e: 'cast', u: u.id, n: name, el: 'none', tg: [], ax: u.x, ay: u.y, sh: 'B', sup: 1 }); }
  function mobPassiveHurt(t, hpDmg) {
    const mp = t.mp;
    // rage / awakening (first time under a threshold)
    if (mp.rage) for (let i = 0; i < mp.rage.length; i++) {
      const r = mp.rage[i]; t.rgDone = t.rgDone || [];
      if (t.rgDone[i] || t.hp / t.hpMax >= r.th) continue;
      t.rgDone[i] = 1; t.raged = true; pvLabel(t, r.name);
      const perm = { exp: 1e9, buff: true, nd: 1 };
      if (r.spd) addStatus(t, { ...perm, k: 'spdUp', v: t.spd * r.spd });
      if (r.dmg) addStatus(t, { ...perm, k: 'dmgUp', v: r.dmg });
      if (r.block) addStatus(t, { ...perm, k: 'blockUp', v: r.block });
      if (r.def) addStatus(t, { ...perm, k: 'defUp', v: t.def * r.def });
    }
    // waves / fire rings / whirlwinds every 15% of max HP taken
    if (mp.cum) {
      t.cumAcc = (t.cumAcc || 0) + hpDmg;
      const repl = t.raged && mp.cum.some((c) => c.phase && c.rep);
      while (t.cumAcc >= 0.15 * t.hpMax && t.alive && !B.over) {
        t.cumAcc -= 0.15 * t.hpMax;
        for (const c of mp.cum) { if (c.phase ? !t.raged : repl) continue; pvLabel(t, c.name); pvAoe(t, c.r, c.el, c.hits, t.x, t.y, c.c); }
      }
    }
    if (mp.rejuv) { const r = mp.rejuv[0]; t.rjAcc = (t.rjAcc || 0) + hpDmg; while (t.rjAcc >= r.th * t.hpMax) { t.rjAcc -= r.th * t.hpMax; t.rjLeft = r.t; } }
    if (mp.selfDestruct && !t.sdDone && t.alive && t.hp / t.hpMax < mp.selfDestruct[0].th) {
      const s = mp.selfDestruct[0]; t.sdDone = true; pvLabel(t, s.name); pvAoe(t, s.r, s.el, 1);
      if (t.alive) kill(t, null);
    }
  }
  /** technique damage taken: stacks that wear off per hit */
  function mobPassiveStacks(t) {
    if (t.drN > 0) t.drN--;
    if (t.strataN > 0) t.strataN--;
    if (t.sipN > 0) t.sipN--;
    if (t.cloudN > 0) t.cloudN--;
  }
  function mobPassiveDealt(a, t, kind, el) {
    const mp = a.mp;
    if (mp.wither && t.alive) for (const w of mp.wither) if (rnd() < w.p) {
      const s = has(t, 'wither');
      if (s) { s.n = Math.min(w.max, s.n + 1); s.exp = t.turnNo + w.t; recalc(t); stEv(t, s, true); } else addStatus(t, { k: 'wither', v: w.v, n: 1, exp: t.turnNo + w.t });
    }
    if (mp.mark && t.alive) for (const m of mp.mark) if (rnd() < m.p) {
      t.pvMk = t.pvMk || {}; t.pvMk[m.name] = (t.pvMk[m.name] || 0) + 1;
      if (t.pvMk[m.name] >= m.n) { t.pvMk[m.name] = 0; if (m.r) pvAoe(a, m.r, m.el, 1, t.x, t.y); else hit(a, t, a.mc || 1, 0, m.el, { noProc: 1, noReact: 1 }); }
    }
    if (mp.prey && kind === 2 && t.alive) hit(a, t, a.mc || 1, 0, mp.prey[0].el, { noProc: 1, noReact: 1 });
    if (mp.gather) {
      const g = mp.gather[0]; a.gN = (a.gN || 0) + 1;
      if (a.gN >= g.n) {
        a.gN = 0; const pool = foesOfT(a, a.x, a.y, g.r);
        if (pool.length) { const f = pool[Math.floor(rnd() * pool.length)]; pvLabel(a, g.name); for (let h = 0; h < g.hits && f.alive && !B.over; h++) hit(a, f, (a.mc || 1) / g.hits, 0, g.el, { noProc: 1, noReact: 1 }); }
      }
    }
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
    if (a.mp && !B.over) mobPassiveDealt(a, t, kind, el);
    const c = a.ch; if (!c || B.over) return;
    if (c.windEcho && el === 'wind' && kind !== 3) chWindEcho(a, t);
    for (const p of c.procs) {
      if ((p.on === 'crit' && kind !== 1) || (p.opt.cond && p.opt.cond !== el) || rnd() >= p.p) continue;
      const tx = t.x, ty = t.y;
      const list = p.ar ? U.filter((f) => f.alive && f.team !== a.team && dU(f, tx, ty) <= p.ar) : t.alive ? [t] : [];
      for (const f of list) { hit(a, f, p.coef, p.flat, p.el, { noProc: 1, noReact: 1 }); if (p.opt.eff && f.alive) for (const e of p.opt.eff) tryStatus(a, f, e); }
    }
    if (t.alive) for (const i of c.inflicts) if ((!i.cond || i.cond === el) && rnd() < i.p) tryStatus(a, t, { ...i.e, p: 1 });
    if (c.critHeal && kind === 1) heal(a, a, a.hpMax * c.critHeal.healPct + c.critHeal.healFlat, chR(a, 'critHeal'));
    if (c.mark && t.alive) { t.marks++; if (t.marks >= 10) { t.marks = 0; hit(a, t, c.mark.coef, c.mark.flat, 'phy', { noProc: 1, noReact: 1 }); } }
  }
  /** defender-side charm reactions (at most one round of counters per incoming cast) */
  function onHurt(a, t, kind, d) {
    const c = t.ch; if (!c || B.over) return;
    t.stone++; t.eye = Math.min(10, t.eye + 1);
    if (t.reactCast === B.castId) return;
    let fired = false;
    for (const r of kind === 2 ? c.block.concat(c.hurt) : c.hurt) {
      if (!a.alive || !t.alive || dUU(a, t) > r.range || rnd() >= r.p) continue;
      fired = true;
      if (r.inflict) tryStatus(t, a, r.inflict);
      else if (r.aoe) { for (const f of U.filter((x) => x.alive && x.team !== t.team && dUU(x, t) <= r.aoe)) hit(t, f, r.coef, r.flat, r.el, { noProc: 1, noReact: 1 }); }
      else hit(t, a, r.coef, r.flat, r.el, { base: (r.by === 'def' ? eDef(t) : eAtk(t)) * r.coef, noProc: 1, noReact: 1, mult: 1 + (c.counterUp || 0) });
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
    if (a.pierceUntil != null && a.pierceUntil >= a.turnNo && a.mp && a.mp.pierce) def *= 1 - a.mp.pierce[0].v;
    // stacking DMG reduction (StatusDmgReducePer): the game divides by 1 + the total (Field Guard 50 × 1.5% → ÷1.75)
    if (t.drN > 0) redX /= 1 + t.drN * t.drV;
    if (t.ch && t.ch.ownTurnRed && B.cur === t) redX *= 1 - t.ch.ownTurnRed; // Spirit in Fire
    // Dual Surge (Yoldra): Inferno +4% DMG dealt per Fire cast, Tideform +4% DMG reduction per Water cast
    if (a.infN) boost += a.infN * a.mp.dualSurge[0].v;
    if (t.tideN) redX /= 1 + t.tideN * t.mp.dualSurge[0].v;
    if (t.strataN === 0 && t.strataV) redX *= 1 + t.strataV;
    if (a.ch) {
      const c = a.ch;
      if (c.defIgnore) { let nb = 0; for (const s of a.st) if (s.buff) nb++; def *= 1 - Math.min(0.95, c.defIgnore + 0.1 * Math.min(3, nb)); }
      for (const [m, v] of c.dmgUp) boost += v * upMode(m, a, t, o);
    }
    if (t.ch) for (const [m, v] of t.ch.dmgRed) redX *= 1 - Math.min(0.9, v * redMode(m, a, t));
    const em = elemMult(a, t, el);
    if (em <= 0) { if (ev) ev.push({ e: 'hit', a: a.id, t: t.id, d: 0, k: 5, hp: t.hp, sh: t.shield, el }); return 0; } // element immunity (비전)
    // Damage(): (ATK × coefficient (or a custom value) ÷ (1 + the defender's PlayerSkillDmgReduceScale) + flat) × ATK/(ATK+DEF),
    // the flat Crit DMG / Block Efficiency parts over the same scaler, and all of it ÷ (1 + its ProSkillDmgReduceScale)
    const psdr = t.psdr || 1;
    let d = ((o.base != null ? o.base : atk * coef) / psdr + flat) * (atk / (atk + def));
    d *= em;
    // PvE Bonus DMG (against a monster) / PvE DMG RES (from a monster): the character screen's MonsterDmgAdd/ReduceScale;
    // PvP Bonus DMG / PvP DMG RES between characters
    const pveA = !P.pvp && t.kind === 'mob' ? a.pveAdd || 0 : 0, pveR = !P.pvp && a.kind === 'mob' ? t.pveRes || 0 : 0;
    const pvpA = P.pvp && t.kind === 'hero' ? a.pvpAdd || 0 : 0, pvpR = P.pvp && a.kind !== 'mob' ? t.pvpRes || 0 : 0;
    const mul = em * ((1 + a.dmgBoost + a.bDmg + boost + pveA + pvpA) / (1 + t.dmgRes + pveR + pvpR)) * ((1 + t.vuln + t.sigil) * t.red * redX);
    d = d / em * mul;
    const acc = a.acc + (a.bAcc || 0) + (o.acc || 0);
    let kind = 0;
    const bc = t.blockRate + t.bBlock - 0.1 * t.riven - acc;
    // the flat Block Efficiency / Crit DMG numbers of the stats screen join outside the DEF term, times the coefficient
    if (bc > 0 && rnd() < bc) { if (t.blockValV) d = Math.max(0.1 * d, d - t.blockValV * coef * mul / psdr); d /= Math.max(1.5, 1 + t.blockEff - acc); kind = 2; }
    else { const cc = 0.05 + a.critRate + a.bCrit - t.critRes; if (cc > 0 && rnd() < cc) { if (a.critPowV) d += a.critPowV * coef * mul / psdr; d *= Math.max(1.3, 1 + a.critDmg - t.critRes); kind = 1; } }
    d *= levelOffset(a, t) / (t.prosdr || 1);
    // PvP stage: Beauty of Balance I / Swift Resolution on characters and summons (not on a Fantomon), Beauty of Balance II
    if (P.balance) d *= (t.kind === 'hero' ? B.pvpScale : t.sum ? B.sumScale : 1) * B.gov;
    d *= o.mult || 1;
    d = Math.max(1, Math.floor(d));
    const dealt = applyDamage(a, t, d, { doom: o.doom, kind, el, ls: (o.ls || 0) + (o.noProc ? 0 : (a.lsAll || 0) * (P.pvp && a.lsPv ? a.lsPv : 1) + (a.sipN ? a.sipN * a.sipV : 0)) });
    if (!o.noProc && t.mp) mobPassiveStacks(t);
    // Element Shift (Yoldra): Fire technique DMG flips Frostchill → Blazing, Water technique DMG flips it back
    if (!o.noProc && t.alive && t.mp && t.mp.elShift) {
      const cur = t.elState || 'frost';
      if ((cur === 'frost' && el === 'fire') || (cur === 'blaze' && el === 'water')) { t.elAcc = (t.elAcc || 0) + dealt; if (t.elAcc >= t.hpMax * t.mp.elShift[0].th) { t.elAcc = 0; t.elState = cur === 'frost' ? 'blaze' : 'frost'; pvLabel(t, `${t.mp.elShift[0].name} · ${t.elState === 'blaze' ? '작열' : '서리'}`); } }
    }
    if (!o.noProc) onDealt(a, t, kind, el);
    if (!o.noReact && t.alive && a.alive) onHurt(a, t, kind, d);
    // Light Sword Array: one counter per incoming cast
    if (!o.noReact && t.alive && a.alive) {
      const sw = has(t, 'swords');
      if (sw && sw.cast !== B.castId) {
        sw.cast = B.castId; sw.n--;
        const cx = a.x, cy = a.y;
        for (const f of U) if (f.alive && f.team !== t.team && dU(f, cx, cy) <= 1) hit(t, f, sw.coef, sw.flat, 'light', { noReact: 1 });
        if (sw.n <= 0) { const i = t.st.indexOf(sw); if (i >= 0) removeStatus(t, i); recalc(t); }
      }
    }
    return dealt;
  }
  function tryStatus(a, t, e, sk) {
    if (!t.alive) return;
    if (t.mp && t.mp.immune && t.mp.immune.some((x) => x.st === e.k)) return; // e.g. Chaos Tyrant: immune to Frenzy
    let k = e.k, v = e.v;
    if (k === 'randDebuff') { const pick = [['weak', 0.3], ['abreak', 0.3], ['slow', 0.3]][Math.floor(rnd() * 3)]; k = pick[0]; v = pick[1]; }
    let p = e.p == null ? 1 : e.p;
    if (k === 'taunt' && e.mob && t.kind !== 'hero') p = 1;
    else if (p < 1 || CONTROL[k]) p *= (1 + a.effHit) / (1 + t.effRes);
    if (CONTROL[k]) {
      if (k === 'freeze' && t.wet) p *= 1.3;
      if (P.balance) p /= 3; // Beauty of Balance I: the caster's AbnormalDebuffRateScale −66.66%
      if (t.turnNo - t.lastAil <= 1) p *= Math.pow(0.5, t.ailStreak);
      if (k === 'freeze' && has(t, 'freeze')) return;
    }
    if (rnd() >= p) return;
    if (k === 'delay') { t.next += v * interval(t); return; } // pushes the target's next action back
    if (k === 'kb') { knockback(a, t, e.n || 1, e.side); return; } // forced move, rolled like a status
    const turns = e.t || 1;
    if (CONTROL[k]) { t.ailStreak = t.turnNo - t.lastAil <= 1 ? t.ailStreak + 1 : 1; t.lastAil = t.turnNo; }
    if (k === 'cold' || k === 'riven') {
      const ex = has(t, k), max = k === 'cold' ? 10 : 3;
      if (ex) { ex.n = Math.min(max, ex.n + 1); ex.exp = t.turnNo + turns; recalc(t); stEv(t, ex, true); return; }
      addStatus(t, { k, n: 1, exp: t.turnNo + turns }); return;
    }
    if (k === 'abreak' || k === 'weak' || k === 'slow') {
      if (e.max > 1) { // stacking variant: +1 stack per application, duration refreshed
        const sx = t.st.find((x) => x.k === k && x.max);
        if (sx) { sx.n = Math.min(sx.max, sx.n + 1); sx.exp = t.turnNo + turns; recalc(t); stEv(t, sx, true); return; }
        addStatus(t, { k, v, n: 1, max: e.max, exp: t.turnNo + turns }); return;
      }
      const ex = t.st.find((x) => x.k === k && !x.max);
      if (ex) { ex.v = Math.max(ex.v, v); ex.exp = Math.max(ex.exp, t.turnNo + turns); recalc(t); stEv(t, ex, true); return; }
      addStatus(t, { k, v, exp: t.turnNo + turns }); return;
    }
    if (k === 'dot') {
      addStatus(t, { k, el: e.el || 'dark', src: a.id, exp: t.turnNo + (e.t || 3) });
      if ((e.el || 'dark') === 'dark' && a.ch && a.ch.erodeTwice && rnd() < a.ch.erodeTwice) addStatus(t, { k, el: 'dark', src: a.id, exp: t.turnNo + (e.t || 3) }); // Linked Misfortune
      return;
    }
    if (k === 'freeze' && a.ch && a.ch.shatter) { addStatus(t, { k, v, exp: t.turnNo + turns, uniq: 1, cast: B.castId, src: a.id, shatter: 1 }); return; }
    if (k === 'taunt') { addStatus(t, { k, src: a.id, exp: t.turnNo + turns, uniq: 1 }); return; }
    if (k === 'lacer') { addStatus(t, { k, src: a.id, coef: e.coef || 0, flat: e.flat || 0, exp: t.turnNo + turns, uniq: 1 }); return; }
    addStatus(t, { k, v, exp: t.turnNo + turns, uniq: 1, cast: B.castId });
  }
  function dotTick(t, s) {
    const a = U[s.src]; if (!a || !t.alive) return;
    const atk = eAtk(a), def = eDef(t);
    let d = ((atk * DOT_COEF) / (t.psdr || 1)) * (atk / (atk + def)) * elemMult(a, t, s.el) * ((1 + a.dmgBoost + a.bDmg) / (1 + t.dmgRes)) * (1 + t.vuln) * t.red * levelOffset(a, t) / (t.prosdr || 1);
    if (P.balance) d *= (t.kind === 'hero' ? B.pvpScale : t.sum ? B.sumScale : 1) * B.gov;
    applyDamage(a, t, Math.max(1, Math.floor(d)), { el: s.el, kind: 4 });
  }

  /* ── targeting ── */
  const foesOf = (u) => { const tn = has(u, 'taunt'); if (tn && U[tn.src] && U[tn.src].alive) return [U[tn.src]]; const o = []; for (const f of U) if (f.alive && f.team !== u.team) o.push(f); return o; };
  const alliesOf = (u) => { const o = []; for (const f of U) if (f.alive && f.team === u.team) o.push(f); return o; };
  /** main-target pool: Stealth "cannot be selected as the main target" while another enemy can */
  const aimFoes = (u) => { const fs = foesOf(u); if (!fs.some((f) => f.sum || f.shadowF)) return fs; const vis = fs.filter((f) => !f.shadowF && !has(f, 'stealth')); return vis.length ? vis : fs; };
  /** the AI's VoodooDollCountWeightChange (+1): a Decoy Clone counts as one more target ("prioritized by allies as an attack target") */
  const wt = (f) => (f.clone ? 2 : 1);
  /** does one cell lie in a caster-anchored area (A / Q / F) */
  /** distance from a caster standing at (x, y) to a cell: from the nearest cell of its body */
  const dAt = (c, x, y, ax, ay) => { if (!(c && c.sz > 1)) return dist(x, y, ax, ay); let m = 99; for (const [dx, dy] of fpOf(c)) m = Math.min(m, Math.abs(x + dx - ax) + Math.abs(y + dy - ay)); return m; };
  function cellIn(tg, cx, cy, aim, x, y, c) {
    const dx = x - cx, dy = y - cy;
    switch (tg.t) {
      // "within N grids of the caster": a large caster measures from its body (Terra's Cry rings the Chaos Tyrant's 5×5)
      case 'A': { const d = c && c.sz > 1 ? dAt(c, cx, cy, x, y) : Math.abs(dx) + Math.abs(dy); return d <= tg.r && d > 0; }
      case 'Q': return Math.max(Math.abs(dx), Math.abs(dy)) <= tg.r && (dx || dy);
      case 'F': { const d = DIRS[aim]; const fw = dx * d[0] + dy * d[1]; if (fw < 1 || fw > tg.h) return false; const lat = dx * -d[1] + dy * d[0]; return tg.w % 2 ? Math.abs(lat) <= (tg.w - 1) / 2 : lat >= 0 && lat < tg.w; }
      default: return false;
    }
  }
  /** how many of a skill's hit configs ([sideways, forward] cell lists) touch a unit's body */
  function partHits(parts, tg, cx, cy, aim, f) {
    const d = tg.t === 'F' ? DIRS[aim] : [0, 1], body = new Set(fpOf(f).map(([dx, dy]) => (f.y + dy) * W + f.x + dx));
    let n = 0;
    for (const p of parts) if (p.some(([lat, fw]) => body.has((cy + fw * d[1] + lat * d[0]) * W + cx + fw * d[0] - lat * d[1]))) n++;
    return n;
  }
  /** how many cells of a unit's footprint the area covers (0 = not hit) */
  function inShape(tg, cx, cy, aim, f, c) { let n = 0; for (const [dx, dy] of fpOf(f)) if (cellIn(tg, cx, cy, aim, f.x + dx, f.y + dy, c)) n++; return n; }
  const cellAim = (tg, ax, ay, x, y) => (tg.t === 'TQ' ? Math.max(Math.abs(x - ax), Math.abs(y - ay)) <= tg.ar : dist(x, y, ax, ay) <= tg.ar);
  function inAim(tg, ax, ay, f) { let n = 0; for (const [dx, dy] of fpOf(f)) if (cellAim(tg, ax, ay, f.x + dx, f.y + dy)) n++; return n; }
  function standCell(u, reach, pred) {
    for (const [dx, dy, d] of diaOf(u)) {
      if (d > reach) break;
      const x = u.x + dx, y = u.y + dy;
      if (d === 0 ? pred(x, y) : fits(u, x, y) && pred(x, y)) return [x, y, d];
    }
    return null;
  }
  /** → { x, y, walk, targets, ax, ay, dir } | null */
  /** SaferPos (the game's AI): distance from a cell to the nearest enemy, beyond 6 grids counted back down
   *  (HasEnemyRoundDistanceAfterKeepAway 6: a cell that leaves no enemy within 6 is not a better keep-away cell) */
  function safer(u, x, y) {
    let m = 99;
    for (const f of U) if (f.alive && !f.out && f.team !== u.team) { const d = u.sz > 1 ? Math.min(...fpOf(u).map(([dx, dy]) => dU(f, x + dx, y + dy))) : dU(f, x, y); if (d < m) m = d; }
    return m > 6 ? 6 - (m - 6) : m;
  }
  /** keep: the turn's last cast of a ranged skill that keeps its distance (s.kd) — among the cells that hit the most
   *  targets the caster takes the safest one, so a mage steps to the edge of its range; otherwise the shortest walk */
  function plan(u, s, pool, foes, keep) {
    const tg = s.tg, leap = s.leap || 0, reach = pool + leap;
    if (!foes.length) return null;
    const bigF = s.bigFirst ? 1 : 0; // "Prioritizes large targets" / "...the skill range that contains large targets"
    if (tg.t === 'S' && keep) {
      const min = tg.min || 1;
      let best = null;
      for (const [dx, dy, d] of diaOf(u)) {
        if (d > reach) break;
        const x = u.x + dx, y = u.y + dy;
        if (d && !fits(u, x, y)) continue;
        let inR = foes.filter((f) => { const dd = dU(f, x, y); return dd >= min && dd <= tg.r; });
        if (!inR.length) continue;
        if (bigF && inR.some((f) => f.sz > 1)) inR = inR.filter((f) => f.sz > 1);
        const sc = safer(u, x, y);
        if (!best || sc > best.sc || (sc === best.sc && d < best.d)) best = { sc, d, x, y, inR };
      }
      if (!best) return null;
      const f = best.inR.sort((a, b) => (b.clone ? 1 : 0) - (a.clone ? 1 : 0) || a.hp / a.hpMax - b.hp / b.hpMax)[0]; // then LowerTargetHp
      return { x: best.x, y: best.y, walk: Math.max(0, best.d - leap), targets: [f], cnt: new Map([[f.id, 1]]), ax: f.x, ay: f.y };
    }
    if (tg.t === 'S') {
      const min = tg.min || 1;
      const c = [];
      for (const f of foes) { const d = dU(f, u.x, u.y); const need = d > tg.r ? d - tg.r : d < min ? min - d : 0; if (need <= reach) c.push([need, f.hp / f.hpMax, f]); }
      c.sort((a, b) => bigF * ((b[2].sz || 1) - (a[2].sz || 1)) || (b[2].clone ? 1 : 0) - (a[2].clone ? 1 : 0) || a[0] - b[0] || a[1] - b[1]);
      for (const [, , f] of c) {
        const cell = standCell(u, reach, (x, y) => { const d = dU(f, x, y); return d >= min && d <= tg.r; });
        if (cell) return { x: cell[0], y: cell[1], walk: Math.max(0, cell[2] - leap), targets: [f], cnt: new Map([[f.id, 1]]), ax: f.x, ay: f.y };
      }
      return null;
    }
    if (tg.t === 'T' || tg.t === 'TQ') {
      const aims = [];
      const seen = new Set();
      for (const f of foes) {
        const cand = tg.ar > 0 ? AIM_OFF[u.team === 1 ? 1 : 0] : [[0, 0]];
        for (const [fx, fy] of fpOf(f)) for (const [ox, oy] of cand) {
          const ax = f.x + fx + ox, ay = f.y + fy + oy; if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
          const key = ay * W + ax; if (seen.has(key)) continue; seen.add(key);
          const need = Math.max(0, dAt(u, u.x, u.y, ax, ay) - tg.r); if (need > reach) continue;
          let n = 0, big = 0; for (const g of foes) if (inAim(tg, ax, ay, g)) { n += wt(g); if (g.sz > 1) big = 1; }
          if (n) aims.push([n, need, ax, ay, big]);
        }
      }
      aims.sort((a, b) => bigF * (b[4] - a[4]) || b[0] - a[0] || a[1] - b[1]);
      if (keep && aims.length) {
        // the safest cell among the aims that hit the most targets
        let best = null;
        for (let i = 0; i < aims.length && i < 12; i++) {
          const [n, , ax, ay, big] = aims[i]; if (n < aims[0][0] || big < aims[0][4]) break;
          for (const [dx, dy, d] of diaOf(u)) {
            if (d > reach) break;
            const x = u.x + dx, y = u.y + dy;
            if ((d && !fits(u, x, y)) || dAt(u, x, y, ax, ay) > tg.r) continue;
            const sc = safer(u, x, y);
            if (!best || sc > best.sc || (sc === best.sc && d < best.d)) best = { sc, d, x, y, ax, ay };
          }
        }
        if (best) { const cnt = new Map(); const targets = foes.filter((g) => { const k = inAim(tg, best.ax, best.ay, g); if (k) cnt.set(g.id, k); return k > 0; }); return { x: best.x, y: best.y, walk: Math.max(0, best.d - leap), targets, cnt, ax: best.ax, ay: best.ay }; }
      }
      for (let i = 0; i < aims.length && i < 6; i++) {
        const [, , ax, ay] = aims[i];
        const cell = standCell(u, reach, (x, y) => dAt(u, x, y, ax, ay) <= tg.r);
        if (cell) { const cnt = new Map(); const targets = foes.filter((g) => { const k = inAim(tg, ax, ay, g); if (k) cnt.set(g.id, k); return k > 0; }); return { x: cell[0], y: cell[1], walk: Math.max(0, cell[2] - leap), targets, cnt, ax, ay }; }
      }
      return null;
    }
    // shapes anchored on the caster: A / Q / F
    let best = null, bestN = 0, bestSafe = -99;
    const dirs = tg.t === 'F' ? DIR_ORDER[u.team === 1 ? 1 : 0] : [0];
    for (const [dx, dy, d] of diaOf(u)) {
      if (d > reach) break;
      const x = u.x + dx, y = u.y + dy;
      if (d && !fits(u, x, y)) continue;
      const sc = keep ? safer(u, x, y) : 0;
      for (const k of dirs) {
        let n = 0, big = 0;
        for (const f of foes) if (inShape(tg, x, y, k, f, u)) { n += wt(f); if (f.sz > 1) big = 1; }
        const score = n + (bigF && big ? 100 : 0);
        if (score > bestN || (keep && score && score === bestN && sc > bestSafe)) { bestN = score; bestSafe = sc; best = [x, y, d, k]; }
      }
      if (!keep && bestN >= foes.length && !bigF) break;
    }
    if (!best) return null;
    const [x, y, d, k] = best, cnt = new Map();
    // multi-hit count: one per game hit config touching the body (s.parts), else one per covered cell
    const targets = foes.filter((f) => { const c = inShape(tg, x, y, k, f, u); if (c) cnt.set(f.id, s.parts ? partHits(s.parts, tg, x, y, k, f) || 1 : c); return c > 0; });
    return { x, y, walk: Math.max(0, d - leap), targets, cnt, ax: x, ay: y, dir: k };
  }
  /** kind: 1 leap, 'dash' | 'kb' | 'retreat' for skill movement (shown differently in the replay) */
  function moveTo(u, x, y, leap) {
    if (x === u.x && y === u.y) return;
    // Trial by Fire (Flamoenix): an enemy that comes within range of the body is struck
    const prox = proxU.length ? proxU.filter((f) => f.alive && f.team !== u.team && dUU(u, f) > f.mp.prox[0].r) : null;
    const from = [u.x, u.y];
    setOcc(u, -1); u.x = x; u.y = y; setOcc(u, u.id);
    if (ev) ev.push({ e: 'move', u: u.id, x, y, leap: leap === 1 || leap === true ? 1 : 0, ...(typeof leap === 'string' ? { [leap]: 1 } : {}) });
    moved(u, from, leap);
    if (prox) for (const f of prox) if (u.alive && !B.over && dUU(u, f) <= f.mp.prox[0].r) { const p = f.mp.prox[0]; pvLabel(f, p.name); hit(f, u, p.c, 0, p.el, { noProc: 1, noReact: 1 }); }
  }
  /** DIRS index that points from the unit toward a target */
  const aimDir = (u, t) => { if (!t) return u.team ? 2 : 0; const dx = t.x - u.x, dy = t.y - u.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy >= 0 ? 0 : 2; };
  /** dash: along the aim up to n cells, ending on the farthest free cell; no passing through units bigger than 4 cells */
  function dashMove(u, dir, n) {
    const d = DIRS[dir]; if (!d) return;
    let best = null;
    for (let i = 1; i <= n; i++) {
      const x = u.x + d[0] * i, y = u.y + d[1] * i;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const o = occ[y * W + x]; if (o >= 0 && o !== u.id && (U[o].sz || 1) >= 3) break;
      if (fits(u, x, y)) best = [x, y];
    }
    if (best) moveTo(u, best[0], best[1], 'dash');
  }
  /** knockback: the target slides away from the attacker (or to a side) cell by cell until blocked; large units stand firm */
  function knockback(a, t, n, side) {
    if (!t.alive || (t.sz || 1) > 1 || has(t, 'freeze') || has(t, 'immob')) return;
    let dx = t.x - a.x, dy = t.y - a.y, sx = 0, sy = 0;
    if (Math.abs(dx) >= Math.abs(dy)) { sx = Math.sign(dx) || (t.team ? 1 : -1); } else sy = Math.sign(dy);
    if (side) { const r = rnd() < 0.5 ? 1 : -1; [sx, sy] = [sy * r || 0, sx * r || 0]; if (!sx && !sy) sy = r; }
    let x = t.x, y = t.y;
    for (let i = 0; i < n; i++) { if (!free(x + sx, y + sy)) break; x += sx; y += sy; }
    if (x !== t.x || y !== t.y) moveTo(t, x, y, 'kb');
  }
  /** retreat: step up to n cells to the free cell farthest from the nearest enemy */
  function retreatMove(u, n) {
    const foes = foesOf(u); if (!foes.length) return;
    const far = (x, y) => Math.min(...foes.map((f) => dU(f, x, y)));
    let best = null, bd = far(u.x, u.y);
    for (const [dx, dy, d] of diaOf(u)) { if (d > n) break; if (!d) continue; const x = u.x + dx, y = u.y + dy; if (!fits(u, x, y)) continue; const v = far(x, y); if (v > bd) { bd = v; best = [x, y]; } }
    if (best) moveTo(u, best[0], best[1], 'retreat');
  }
  function pullTo(t, px, py) {
    if (!t.alive || (t.sz || 1) > 1 || has(t, 'freeze') || has(t, 'immob')) return;
    for (const [dx, dy, d] of diaOf(t)) {
      if (d > 3) break;
      const x = px + dx, y = py + dy;
      if (dist(x, y, t.x, t.y) >= dist(px, py, t.x, t.y) && d > 0) continue;
      if (free(x, y)) { occ[t.y * W + t.x] = -1; t.x = x; t.y = y; occ[y * W + x] = t.id; if (ev) ev.push({ e: 'move', u: t.id, x, y, pull: 1 }); moved(t); return; }
    }
  }

  /* ── boss kits from the game data: hit configs played one by one (tools/bosskits.mjs) ──
     cells are [sideways, forward] in the game's frame (y up = our +y); the aim offsets in s.rng are not turned,
     the facing follows the aim (Pos2d.LookDirection) and x flips when the aim is to the left, as the client does */
  function kitUsable(u, s) {
    if (!u.awoke && u.hp <= u.hpMax * 0.5) u.awoke = 1; // Primal Awakening / Rampage Reboot: for good, the first time HP reaches 50%
    const g = s.gate;
    if (g) {
      if (g.turn != null) { if (u.turnNo < g.turn) return false; }
      else { const sh = u.hp / u.hpMax, met = g.le ? sh <= g.hp : sh >= g.hp; if (met !== !!g.on) return false; }
    }
    if (s.state === 'awake' && !u.awoke) return false;
    if (s.state === 'pre' && u.awoke) return false;
    if ((s.state === 'frost' || s.state === 'blaze') && (u.elState || 'frost') !== s.state) return false;
    return true;
  }
  const kitCo = (u) => (u.sz > 1 && u.sz % 2 === 0 ? 0.5 : 0);
  function kitPlan(u, s, pool) {
    const G = kitGeo(s, kitCo(u)), foes = aimFoes(u); if (!foes.length) return null;
    const NE = G.entries.length, cnt = new Int32Array(NE), mark = new Int32Array(NE); let stamp = 0;
    let best = null;
    for (const [dx, dy, d] of DIAMOND) {
      if (d > pool) break;
      if (best && d > best.d && best.n >= foes.length) break;
      const x = u.x + dx, y = u.y + dy;
      if (d && !fits(u, x, y)) continue;
      const touched = [];
      if (G.all) { for (let i = 0; i < NE; i++) { cnt[i] = foes.length; touched.push(i); } }
      else {
        cnt.fill(0);
        for (const f of foes) { stamp++; for (const [fx, fy] of fpOf(f)) { const list = G.byOff.get(kitKey(f.x + fx - x, f.y + fy - y)); if (list) for (const ei of list) if (mark[ei] !== stamp) { mark[ei] = stamp; if (!cnt[ei]) touched.push(ei); cnt[ei]++; } } }
      }
      for (const ei of touched) {
        const e = G.entries[ei], n = cnt[ei];
        if (e.dep && e.flip !== !!u.flip) continue;
        const ax = x + e.r[0], ay = y + e.r[1];
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        const o = occ[ay * W + ax], onFoe = o >= 0 && U[o].alive && U[o].team !== u.team ? 1 : 0;
        if (s.tk === 'e' && !onFoe) continue;
        if (s.tk === 's' && !fits(u, ax, ay)) continue;
        // more targets, then an aim on an enemy (a hit anchored on the aim, e.g. Void Singularity's pull), then less walking
        if (!best || n > best.n || (n === best.n && (onFoe > best.f || (onFoe === best.f && d < best.d)))) best = { n, d, x, y, ei, f: onFoe };
      }
    }
    if (!best) return null;
    return { x: best.x, y: best.y, walk: best.d, ei: best.ei, n: best.n };
  }
  function kitCast(u, k, pl) {
    const s = k.s, G = kitGeo(s, kitCo(u)), e = G.entries[pl.ei];
    B.castId++; u.casts++;
    if (pl.x !== u.x || pl.y !== u.y) moveTo(u, pl.x, pl.y);
    if (!e.dep) u.flip = e.flip;
    const ax = u.x + e.r[0], ay = u.y + e.r[1];
    if (s.leap) { // Phoenix Dive / Starbreak Impact: the caster lands on the aimed cell (or the nearest free one)
      let c = null; for (const [ddx, ddy] of diaOf(u)) { if (fits(u, ax + ddx, ay + ddy)) { c = [ax + ddx, ay + ddy]; break; } }
      if (c) moveTo(u, c[0], c[1], 1);
    }
    const foes0 = foesOf(u);
    const inCells = (cells, bx, by) => { const out = []; for (const [cx, cy] of cells) { const x = bx + cx, y = by + cy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = occ[y * W + x]; if (o >= 0) { const t = U[o]; if (t.alive && t.team !== u.team && !out.includes(t)) out.push(t); } } return out; };
    if (ev) ev.push({ e: 'cast', u: u.id, n: s.ko || s.en, el: s.el, tg: (G.all ? foes0 : foes0.filter((f) => fpOf(f).some(([fx, fy]) => G.entryHas(pl.ei, f.x + fx - pl.x, f.y + fy - pl.y)))).map((t) => t.id), ax, ay, sh: G.aimed ? 'T' : 'A', ar: G.ar });
    if (u.mp && u.mp.dualSurge && s.c > 0) { const m = u.mp.dualSurge[0]; if (s.el === 'fire') u.infN = Math.min(m.max, (u.infN || 0) + 1); else if (s.el === 'water') u.tideN = Math.min(m.max, (u.tideN || 0) + 1); }
    const foN = s.fo ? new Map() : null;
    const strike = (h, t) => {
      if (!t.alive || B.over) return;
      const c = h.cf != null ? h.cf : s.c;
      if (h.d !== 0 && c > 0) {
        let mult = s.ex ? 1 + Math.min(s.ex.max, Math.floor((1 - t.hp / t.hpMax) / 0.05 + 1e-9) * s.ex.step) : 1;
        // damage falloff: each repeat on the same target deals fo less
        if (foN) { const i = foN.get(t.id) || 0; mult *= Math.pow(1 - s.fo, i); foN.set(t.id, i + 1); }
        hit(u, t, c, 0, s.el, { mult, acc: 0, boost: 0 });
      }
      if (!t.alive || B.over) return;
      if (h.st) for (const [k2, p, dur] of h.st) tryStatus(u, t, { k: k2, p, t: dur }, s);
      if (h.kb && (h.mp == null || rnd() < h.mp)) knockback(h.mt ? { x: ax, y: ay } : u, t, h.kb);
      if (h.pull) pullTo(t, h.mt ? ax : u.x, h.mt ? ay : u.y);
    };
    const doneG = new Set();
    for (let hi = 0; hi < s.h.length && !B.over && u.alive; hi++) {
      const h = s.h[hi];
      if (h.r != null) {
        if (doneG.has(h.r)) continue; doneG.add(h.r);
        // random strikes: one pick per hit config from the pool cells (with replacement), the first minHits on occupied cells
        const g = s.rnd[h.r], bx = g.s ? u.x : ax, by = g.s ? u.y : ay;
        const cellsAll = e.pools[h.r].map(([px, py]) => [bx + px, by + py]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
        const subs = []; s.h.forEach((x, i) => { if (x.r === h.r) subs.push(i); });
        for (let p = 0; p < g.n && !B.over; p++) {
          const occNow = cellsAll.filter(([x, y]) => { const o = occ[y * W + x]; return o >= 0 && U[o].alive && U[o].team !== u.team; });
          const need = p < g.min || !g.empty;
          let from = need ? occNow : cellsAll;
          if (!from.length) { if (need && cellsAll.length && g.empty) from = cellsAll; else continue; }
          const c = from[Math.floor(rnd() * from.length)];
          for (const si of subs) if ((s.h[si].pk || 0) === p) for (const t of inCells(e.cells[si], c[0], c[1])) strike(s.h[si], t);
        }
        continue;
      }
      // who a hit covers is decided when it lands: a target knocked back by the previous hit can be caught again
      const ts = e.cells[hi] === 'ALL' ? foesOf(u) : inCells(e.cells[hi], h.s ? u.x : ax, h.s ? u.y : ay);
      for (const t of ts) strike(h, t);
    }
  }

  /* ── casting ── */
  function castDamage(u, k, pl, pre) {
    const s = k.s, n = k.n;
    B.castId++; u.casts++;
    if (u.mp) {
      const mp = u.mp;
      if (mp.overload && !u.overOn && u.casts >= mp.overload[0].n) { const o = mp.overload[0]; u.overOn = 1; pvLabel(u, o.name); addStatus(u, { k: 'dmgUp', v: o.dmg, exp: 1e9, buff: true, nd: 1 }); addStatus(u, { k: 'defUp', v: -u.def * o.def, exp: 1e9, buff: true, nd: 1 }); }
      if (mp.pierce && u.casts % mp.pierce[0].n === 0) u.pierceUntil = u.turnNo + mp.pierce[0].t;
    }
    if (pl.x !== u.x || pl.y !== u.y) moveTo(u, pl.x, pl.y, s.leap);
    const ce = ev ? { e: 'cast', u: u.id, n: s.ko || s.en, el: s.el, tg: pl.targets.map((t) => t.id), ax: pl.ax, ay: pl.ay, sh: s.tg.t, ar: s.tg.ar || s.tg.r || 0 } : null;
    if (ce) ev.push(ce);
    let targets = pl.targets;
    if (s.pull) { const px = s.pull === 'c' ? u.x : pl.ax, py = s.pull === 'c' ? u.y : pl.ay; for (const t of targets) pullTo(t, px, py); }
    const o = { doom: s.doom, ls: (s.ls || 0) * (P.pvp && PVPR[s.id] ? PVPR[s.id][0] : 1), blind: u.blind, acc: 0, boost: 0, single: (s.hits || 1) + (s.h2 || 0) === 1 && !s.sp };
    const na = has(u, 'nextAcc'), nd = has(u, 'nextDoom');
    if (na) { o.acc += na.v; o.boost += na.dmg || 0; }
    if (nd) { o.doom = 1; o.boost += nd.v; }
    const sp = s.sp || {};
    let dealt = 0;
    // large targets: a "may take multiple hits" skill lands once per covered cell; repeats on one target can decay
    const reps = (t) => (s.multi && pl.cnt ? Math.max(1, pl.cnt.get(t.id) || 1) : 1);
    const hitN = new Map();
    const decay = (t) => { const i = hitN.get(t.id) || 0; hitN.set(t.id, i + 1); return s.rep && i >= s.rep.from ? Math.pow(1 - s.rep.d, i - s.rep.from + 1) : 1; };
    const one = (t, coef, flat, mult) => { o.mult = mult || 1; if (s.big && t.big) o.mult *= 1 + s.big; if (sp.k === 'lucky' && rnd() < sp.p) o.mult *= sp.m; if (sp.k === 'execute') o.mult *= 1 + Math.min(sp.max, Math.floor((1 - t.hp / t.hpMax) / 0.05) * sp.step); const d = hit(u, t, coef, flat, s.el, o); dealt += d; return d; };
    const afterHit = (t) => { if (s.eff && t.alive) for (const e of s.eff) tryStatus(u, t, e.k === 'lacer' ? { ...e, coef: n.tc, flat: n.tf } : e, s); if (s.dispelBuff && t.alive) { const bi = t.st.map((x, i) => (x.buff && !x.nd ? i : -1)).filter((i) => i >= 0); if (bi.length) { removeStatus(t, bi[Math.floor(rnd() * bi.length)]); recalc(t); } } };
    if (sp.k === 'shieldBurst') {
      let sh = 0; for (let i = u.st.length - 1; i >= 0; i--) if (u.st[i].k === 'shield') { sh += u.st[i].v; u.st.splice(i, 1); } recalc(u);
      o.base = sh * n.coef;
    }
    if (sp.k === 'waves') {
      const seen = new Map();
      for (let w = 0; w < sp.n && !B.over; w++) {
        const pool = targets.filter((t) => t.alive); if (!pool.length) break;
        const c = pool[Math.floor(rnd() * pool.length)];
        for (const f of foesOf(u)) if (dU(f, c.x, c.y) <= 1) { const h = seen.get(f.id) || 0; one(f, n.coef, n.flat, Math.pow(1 - sp.decay, h)); seen.set(f.id, h + 1); }
      }
      for (const id of seen.keys()) afterHit(U[id]);
    } else if (sp.k === 'scatter') {
      // monster random strikes ("Randomly selects 12 grids within 5 grids ... within 1 grid of each, hitting at least 4 times"):
      // picks with replacement from the cells in reach, the first `min` on cells whose strike reaches an enemy
      const cells = [];
      if (sp.from === 'aim') { for (const [dx, dy, d] of diaOf(u)) { if (d > sp.R) break; const x = pl.ax + dx, y = pl.ay + dy; if (x >= 0 && y >= 0 && x < W && y < H) cells.push([x, y]); } }
      else if (sp.fw) { const dir = pl.dir != null ? pl.dir : aimDir(u, targets[0]), tf = { t: 'F', w: sp.fw, h: sp.fh }; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cellIn(tf, u.x, u.y, dir, x, y)) cells.push([x, y]); }
      else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = dAt(u, u.x, u.y, x, y); if (d >= 1 && d <= sp.R) cells.push([x, y]); }
      const struck = new Set();
      for (let p = 0; p < sp.n && !B.over && cells.length; p++) {
        const foes = foesOf(u);
        let pool = p < (sp.min || 0) ? cells.filter(([x, y]) => foes.some((f) => dU(f, x, y) <= sp.a)) : cells;
        if (!pool.length) pool = cells;
        const [x, y] = pool[Math.floor(rnd() * pool.length)];
        for (const f of foes) if (dU(f, x, y) <= sp.a) { one(f, n.coef, n.flat, decay(f)); struck.add(f); }
      }
      for (const f of struck) afterHit(f);
    } else if (sp.k === 'rand') {
      const main = targets[0], cells = 2 * sp.r * sp.r + 2 * sp.r + 1, seen = new Map();
      // random strikes pick cells: a large unit is listed once per cell it covers in the area
      const near = [];
      for (const f of foesOf(u)) for (const [dx, dy] of fpOf(f)) if (dist(f.x + dx, f.y + dy, main.x, main.y) <= sp.r) near.push(f);
      let landed = 0;
      const strike = (f) => { const h = seen.get(f.id) || 0; one(f, n.coef, n.flat, Math.pow(1 - sp.decay, h)); seen.set(f.id, h + 1); landed++; };
      for (let i = 0; i < sp.n && !B.over; i++) { const r = Math.floor(rnd() * cells); if (r < near.length && near[r].alive) strike(near[r]); }
      while (landed < sp.min && !B.over) { const pool = near.filter((f) => f.alive); if (!pool.length) break; strike(main.alive ? main : pool[0]); }
      for (const id of seen.keys()) afterHit(U[id]);
    } else {
      const total = (s.hits || 1) + (s.h2 || 0);
      for (let h = 0; h < total && !B.over; h++) {
        const second = h >= (s.hits || 1);
        for (const t of targets) for (let r = 0; r < reps(t) && t.alive && !B.over; r++) { if (ce && r) ce.mh = (ce.mh || 0) + 1; one(t, second ? n.coef2 : n.coef, second ? n.flat2 : n.flat, decay(t)); }
      }
      for (const t of targets) afterHit(t);
      if (sp.k === 'chain' || sp.k === 'bounce') {
        const seen = new Set([targets[0].id]); let last = targets[0];
        for (let i = 0; i < sp.n && !B.over; i++) {
          let c = foesOf(u).filter((f) => !seen.has(f.id) && dUU(f, last) <= sp.r);
          // a large target's other cells count as places to bounce to ("Large targets may take multiple hits")
          if (s.multi && last.alive && last.sz > 1) for (let k = 1; k < fpOf(last).length; k++) c.push(last);
          if (!c.length && sp.k === 'bounce') c = foesOf(u).filter((f) => f !== last && dUU(f, last) <= sp.r);
          if (!c.length) break;
          const nx = c[Math.floor(rnd() * c.length)];
          if (ce && s.multi && nx === last) ce.mh = (ce.mh || 0) + 1;
          last = nx; seen.add(last.id);
          one(last, n.coef, n.flat, decay(last)); afterHit(last);
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
    // the caster's own skill movement after the strike: dash through the line, or step back
    if (s.dash && u.alive && !B.over && !has(u, 'immob')) dashMove(u, pl.dir != null ? pl.dir : aimDir(u, targets[0]), s.dash);
    if (s.retreat && u.alive && !B.over && !has(u, 'immob') && (!s.retreat.within || (targets[0] && dUU(u, targets[0]) <= s.retreat.within))) retreatMove(u, s.retreat.n);
    // consume single-use modifiers
    for (const key of ['nextAcc', 'nextDoom', 'blind']) { const i = u.st.findIndex((x) => x.k === key); if (i >= 0) removeStatus(u, i); }
    for (const t of targets) { const i = t.st.findIndex((x) => x.k === 'sigil' && x.cast !== B.castId); if (i >= 0 && t.alive) { removeStatus(t, i); recalc(t); } }
    recalc(u);
    u.eye = 0;
    if (u.ch && u.ch.critStack && s.el === u.ch.critStack.el) { const st = has(u, 'critStk'); if (st) { st.n = Math.min(8, st.n + 1); st.exp = u.turnNo + 2; recalc(u); stEv(u, st, true); } else addStatus(u, { k: 'critStk', v: u.ch.critStack.v, n: 1, exp: u.turnNo + 2, buff: true }); }
    // enemy Thunder Judgment reacts to this cast
    for (const f of U) if (f.alive && u.alive && !B.over && f.team !== u.team && f.ch && f.ch.thunder && dUU(f, u) <= 5 && rnd() < f.ch.thunder.p) hit(f, u, f.ch.thunder.coef, f.ch.thunder.flat, 'light', { noProc: 1, noReact: 1 });
    if (s.burn && u.alive && !B.over) placeBurn(u, s, n, pl);
    if (s.el === 'fire' && u.ch && u.ch.wildfire && u.alive && !B.over && rnd() < u.ch.wildfire.p) burnCells(u, around(pl.ax, pl.ay, 1, true), u.ch.wildfire.coef, u.ch.wildfire.flat, 3);
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
    const list = sp.ar ? U.filter((f) => f.alive && f.team !== u.team && dU(f, tx, ty) <= sp.ar) : [t];
    if (ev) ev.push({ e: 'cast', u: u.id, n: `${p.name} 지원`, el: sp.el, tg: list.map((f) => f.id), ax: tx, ay: ty, sh: 'T', ar: sp.ar, pet: 1 });
    for (const f of list) {
      // "Large targets may take multiple hits": one hit per covered cell of a large unit
      const reps = sp.multi && f.sz > 1 ? fpOf(f).filter(([dx, dy]) => dist(f.x + dx, f.y + dy, tx, ty) <= (sp.ar || 0)).length || 1 : 1;
      for (let r = 0; r < reps && f.alive && !B.over; r++) hit(p, f, sp.coef, sp.flat, sp.el, { noProc: 1, noReact: 1, mult: sp.big && f.big ? 1 + sp.big : 1 });
      if (f.alive && sp.eff) for (const e of sp.eff) tryStatus(p, f, e);
      if (f.alive && sp.dispelBuff) { const bi = f.st.map((x, i) => (x.buff && !x.nd ? i : -1)).filter((i) => i >= 0); if (bi.length) { removeStatus(f, bi[Math.floor(rnd() * bi.length)]); recalc(f); } }
    }
    if (sp.healOwner) heal(p, u, u.hpMax * sp.healPct + sp.healFlat);
  }
  function spawnPet(o, p) {
    const dy = (o.team === 0 ? 1 : -1) * (p.mat.front ? 1 : -1);
    let cell = free(o.x, o.y + dy) ? [o.x, o.y + dy] : null;
    if (!cell) for (const [dx, dyy, d] of diaOf(o)) { if (!d) continue; if (d > 4) break; if (free(o.x + dx, o.y + dyy)) { cell = [o.x + dx, o.y + dyy]; break; } }
    if (!cell) return;
    p.out = false; p.alive = true; p.hp = p.hpMax; p.x = cell[0]; p.y = cell[1]; occ[p.y * W + p.x] = p.id; p.next = B.now + interval(p) * 0.5;
    o.energy = 0; p.spawnT = p.turnNo; p.st = []; recalc(p);
    // "cooldown resets upon materialization" / once-per-materialization skills start ready again
    p.cds = p.skills.map((k) => (k.s.zi ? 0 : k.init));
    if (ev) ev.push({ e: 'spawn', u: p.id, x: p.x, y: p.y });
  }
  /* ── summons (FightHitSummon, game data) ── */
  /** [sideways, forward] from the caster: our team faces +y, the other side faces −y */
  const sumCell = (o, lat, fwd) => (o.team === 0 ? [o.x + lat, o.y + fwd] : [o.x - lat, o.y - fwd]);
  function nearFree(x, y, r = 4, o = null) { if (free(x, y)) return [x, y]; for (const [dx, dy, d] of diaOf(o)) { if (!d) continue; if (d > r) break; if (free(x + dx, y + dy)) return [x + dx, y + dy]; } return null; }
  function dismiss(p) {
    if (!p.alive) return;
    if (!p.clone) sumGone(p);
    p.alive = false; p.hp = 0; setOcc(p, -1); p.out = true; p.st = []; p.shield = 0;
    if (ev) ev.push({ e: 'die', u: p.id, fade: 1 });
  }
  function spawnSummon(o, p, cell, sm) {
    p.out = false; p.alive = true; p.hp = p.hpMax; p.x = cell[0]; p.y = cell[1]; occ[p.y * W + p.x] = p.id;
    p.st = []; p.shield = 0; recalc(p); p.turnNo = 0; p.life = sm.life; p.spawnAt = B.now; p.flip = o.flip;
    p.cds = p.skills.map((k) => k.init);
    // SummonImmediateRound: it acts right after the caster's turn, then on its own SPD clock
    p.next = sm.imm ? B.now + 1e-6 * (1 + p.slot) : B.now + interval(p);
    if (ev) ev.push({ e: 'spawn', u: p.id, x: p.x, y: p.y, sum: 1, hp: p.hpMax, owner: o.id });
    if (sm.stealth) addStatus(p, { k: 'stealth', exp: 1e9, buff: true, nd: 1 });
    const oc = o.ch;
    if (oc && oc.sumAtk) addStatus(p, { k: 'atkUp', v: p.atk * oc.sumAtk, exp: 1e9, buff: true, nd: 1 });
    if (oc && oc.sumLife && !p.clone && p.life > 0) p.life = Math.max(1, p.life - oc.sumLife);
    if (oc && oc.sumPact && !p.clone) { const add = Math.floor(p.hpMax * oc.sumPact); addStatus(p, { k: 'hpUp', v: add, exp: 1e9, buff: true, nd: 1 }); p.hpMax += add; p.hp += add; }
    if (oc && oc.sumPresence) chSumPresence(o);
    if (p.aura) { B.totem = true; for (const a of alliesOf(p)) totemAura(a); }
  }
  /** slots for a cast: free ones first; when every set is standing, the oldest set is replaced */
  function sumSlots(u, i, need) {
    const slots = U.filter((p) => p.sum && p.owner === u.id && p.sumSk === i);
    const pick = slots.filter((p) => !p.alive).slice(0, need);
    const live = slots.filter((p) => p.alive).sort((a, b) => a.spawnAt - b.spawnAt);
    while (pick.length < need && live.length) { const p = live.shift(); dismiss(p); pick.push(p); }
    return pick;
  }
  function castSummon(u, k, i) {
    const s = k.s, sm = s.sum, label = (tg) => { if (ev) ev.push({ e: 'cast', u: u.id, n: s.ko || s.en, el: sm.kind === 'trap' ? 'fire' : 'none', tg, ax: u.x, ay: u.y, sh: 'B', sup: 1 }); };
    if (sm.kind === 'trap') {
      // Blast Spirit: charges placed in front of the caster (grid items: they do not block a cell)
      const cells = sm.cells.map(([a, b]) => sumCell(u, a, b)).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
      if (!cells.length) return false;
      B.castId++; u.casts++; label([]);
      for (const [x, y] of cells) { const t = { id: ++B.trapN, x, y, team: u.team, src: u.id, coef: k.n.coef || 0, flat: k.n.flat || 0, life: sm.life, r: sm.r }; B.traps.push(t); if (ev) ev.push({ e: 'trap', id: t.id, x, y, team: u.team, on: 1 }); }
      return true;
    }
    if (sm.kind === 'clone') {
      // Decoy Clone: links 1 enemy within range (AI: the bigger body first, then the lower HP); one clone per enemy
      const foes = aimFoes(u).filter((f) => !f.sum && dUU(u, f) <= sm.r && !U.some((c) => c.clone && c.alive && c.link === f.id));
      if (!foes.length) return false;
      const t = foes.sort((a, b) => (b.sz || 1) - (a.sz || 1) || a.hp / a.hpMax - b.hp / b.hpMax)[0];
      const [p] = sumSlots(u, i, 1); if (!p) return false;
      const cell = nearFree(...sumCell(u, sm.cells[0][0], sm.cells[0][1]), 4, u); if (!cell) return false;
      // the clone takes the linked unit's side and its stats (summon_monster_add_prop 4600 × rank factor + the fixed HP part)
      const c = sm.cr;
      sumStats(p, { hp: t.hpMax, atk: t.atk, def: t.def, spd: t.spd }, c, p.rkLv, u.level);
      for (const f of PCT) p[f] = t[f];
      for (const f of RAW) p[f] = t[f];
      p.affEl = { ...(t.affEl || {}) }; p.aegisEl = { ...(t.aegisEl || {}) }; p.rk = t.rk; p.bMas = t.bMas; p.bAff = t.bAff; p.level = t.level; p.er = t.er || null;
      p.link = t.id; p.linkV = c.link || 1;
      B.castId++; u.casts++; label([t.id]);
      spawnSummon(u, p, cell, sm);
      return true;
    }
    const pick = sumSlots(u, i, sm.cells.length);
    // Frenzy Totem: an empty cell within N grids of the caster where its aura reaches the most allies
    let cells;
    if (sm.near) {
      let best = null; const r = (sm.cr.aura && sm.cr.aura.r) || 4;
      for (const [dx, dy, d] of diaOf(u)) { if (d > sm.near) break; if (!d) continue; const x = u.x + dx, y = u.y + dy; if (!free(x, y)) continue; const n = alliesOf(u).filter((a) => !a.sum && dist(a.x, a.y, x, y) <= r).length; if (!best || n > best.n) best = { n, x, y }; }
      cells = best ? [[best.x, best.y]] : [];
    } else cells = sm.cells.map(([a, b]) => sumCell(u, a, b));
    const placed = [];
    pick.forEach((p, j) => { const c = cells[j] && nearFree(cells[j][0], cells[j][1], 4, u); if (c) { occ[c[1] * W + c[0]] = p.id; placed.push([p, c]); } });
    for (const [, c] of placed) occ[c[1] * W + c[0]] = -1;
    if (!placed.length) return false;
    B.castId++; u.casts++; label([]);
    if (u.ch && u.ch.sumPact) { const cost = Math.min(u.hp - 1, Math.floor(u.hpMax * 0.02)); if (cost > 0) { u.hp -= cost; if (ev) ev.push({ e: 'hit', a: u.id, t: u.id, d: cost, k: 4, hp: u.hp, sh: u.shield, el: 'none' }); } } // Summoning Pact: 2% max HP
    for (const [p, c] of placed) spawnSummon(u, p, c, sm);
    return true;
  }
  /** Void Chant: a rune on the caster; an enemy within 5 grids that casts a Technique takes Dark DMG once */
  function castRune(u, k) {
    B.castId++; u.casts++;
    if (ev) ev.push({ e: 'cast', u: u.id, n: k.s.ko || k.s.en, el: 'dark', tg: [u.id], ax: u.x, ay: u.y, sh: 'B', sup: 1 });
    addStatus(u, { k: 'voidRune', coef: k.n.coef || 0, flat: k.n.flat || 0, exp: u.turnNo + 2, buff: true, uniq: 1, nd: 1 });
  }
  function runeReact(u) {
    if (B.over || !u.alive) return;
    for (const f of U) {
      if (!f.alive || f.team === u.team || !u.alive || B.over) continue;
      const r = has(f, 'voidRune'); if (!r || dUU(f, u) > 5) continue;
      if (ev) ev.push({ e: 'cast', u: f.id, n: '보이드 커스 · 룬', el: 'dark', tg: [u.id], ax: u.x, ay: u.y, sh: 'S', ar: 0, pet: 1 });
      hit(f, u, r.coef, r.flat, 'dark', { noProc: 1, noReact: 1 });
      // "If the target carries Erosion, triggers the Erosion effect once" (Erosion: the dark damage-over-time)
      if (u.alive) for (const st of u.st.filter((x) => x.k === 'dot' && x.el === 'dark')) if (u.alive) dotTick(u, st);
    }
  }
  /** Frenzy Totem's Inspiration: a random ally within range gets its next turn 20% sooner */
  function castAdvance(u, k) {
    const al = alliesOf(u).filter((a) => a !== u && dist(a.x, a.y, u.x, u.y) <= k.s.r); if (!al.length) return false;
    const t = al[Math.floor(rnd() * al.length)];
    B.castId++; u.casts++;
    if (ev) ev.push({ e: 'cast', u: u.id, n: k.s.ko || k.s.en, el: 'none', tg: [t.id], ax: t.x, ay: t.y, sh: 'B', sup: 1 });
    t.next -= k.n.v * interval(t);
    return true;
  }
  /** Frenzy Totem's Fighting Spirit: other allies (not summons) within its range have +12% ATK */
  function totemAura(u) {
    if (u.sum || !u.alive) return;
    let v = 0;
    for (const t of U) if (t.alive && t.aura && t.team === u.team && t !== u && dist(t.x, t.y, u.x, u.y) <= t.aura.r) v = Math.max(v, t.aura.atk);
    const i = u.st.findIndex((x) => x.totem);
    if (v && i < 0) addStatus(u, { k: 'atkUp', v: u.atk * v, exp: 1e9, buff: true, nd: 1, totem: 1 });
    else if (!v && i >= 0) { removeStatus(u, i); recalc(u); }
  }
  /** Blast Spirit: at the end of its caster's turn it explodes on an enemy within 2 grids (Fire DMG to every enemy in
   *  range, counted as the caster's Technique); it lasts up to 3 of the caster's turns */
  function trapsAfter(u) {
    for (const t of B.traps.slice()) {
      if (t.src !== u.id) continue;
      if (!t.burn && u.alive && !B.over) {
        const near = U.filter((f) => f.alive && f.team !== t.team && dU(f, t.x, t.y) <= t.r);
        if (near.length) {
          B.castId++;
          if (ev) ev.push({ e: 'cast', u: u.id, n: '불꽃요정 폭발', el: 'fire', tg: near.map((f) => f.id), ax: t.x, ay: t.y, sh: 'T', ar: t.r });
          for (const f of near) if (!B.over) hit(u, f, t.coef, t.flat, 'fire', {});
          t.life = 0;
        }
      }
      if (--t.life <= 0) { B.traps.splice(B.traps.indexOf(t), 1); if (ev) ev.push({ e: 'trap', id: t.id, on: 0 }); }
    }
  }
  /** Meteoric Flames: each cell of the struck 3×3 has a 60% chance to burn for 3 of the caster's turns (grid status 11542) */
  function placeBurn(u, s, n, pl) {
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = pl.ax + dx, y = pl.ay + dy; if (x >= 0 && y >= 0 && x < W && y < H && rnd() < s.burn.p) cells.push([x, y]); }
    for (const [x, y] of cells) {
      const t = { id: ++B.trapN, burn: 1, x, y, team: u.team, src: u.id, coef: n.tc || 0, flat: n.tf || 0, life: s.burn.t, seen: new Set() };
      B.traps.push(t); if (ev) ev.push({ e: 'trap', id: t.id, x, y, team: u.team, on: 1, burn: 1 });
      // an enemy already standing there burns at once (onStart)
      const o = occ[y * W + x]; if (o >= 0 && U[o].alive && U[o].team !== u.team) burnHit(t, U[o]);
    }
  }
  /** skill 11600 from the burning cell: once per unit and per its own turn */
  function burnHit(t, f) {
    const key = f.id * 4096 + f.turnNo; if (t.seen.has(key) || B.over) return; t.seen.add(key);
    const a = U[t.src]; if (!a) return;
    if (ev) ev.push({ e: 'cast', u: a.id, n: '작열', el: 'fire', tg: [f.id], ax: t.x, ay: t.y, sh: 'S', ar: 0, pet: 1 });
    hit(a, f, t.coef, t.flat, 'fire', { noProc: 1, noReact: 1 });
  }
  function burnCheck(u) {
    if (!u.alive) return;
    for (const t of B.traps) if (t.burn && t.team !== u.team && fpOf(u).some(([dx, dy]) => u.x + dx === t.x && u.y + dy === t.y)) { burnHit(t, u); if (!u.alive || B.over) return; }
  }
  /** after any move: Laceration strikes the mover, then a burning cell under it */
  function moved(u, from, leap) {
    if (u.alive && !B.over && from && leap !== 'kb') chMoved(u, from);
    const lc = u.alive && u.st.length ? has(u, 'lacer') : null;
    if (lc && U[lc.src] && !B.over) { if (ev) ev.push({ e: 'cast', u: lc.src, n: '열상', el: 'wind', tg: [u.id], ax: u.x, ay: u.y, sh: 'S', ar: 0, pet: 1 }); hit(U[lc.src], u, lc.coef, lc.flat, 'wind', { noProc: 1, noReact: 1 }); }
    if (B.traps.length && u.alive && !B.over) burnCheck(u);
  }
  /* ── charm hooks (2026-11-21) ── */
  /** cells within r (Manhattan, or a square when sq) around a point, on the board */
  const around = (x, y, r, sq) => { const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (!sq && Math.abs(dx) + Math.abs(dy) > r) continue; const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < W && cy < H) o.push([cx, cy]); } return o; };
  /** burning ground on cells (Flaming Path, Raging Wildfire): the same ground as Meteoric Flames, the charm's numbers */
  function burnCells(u, cells, coef, flat, life) {
    for (const [x, y] of cells) {
      if (B.traps.some((t) => t.burn && t.x === x && t.y === y && t.team === u.team)) continue;
      const t = { id: ++B.trapN, burn: 1, x, y, team: u.team, src: u.id, coef, flat, life, seen: new Set() };
      B.traps.push(t); if (ev) ev.push({ e: 'trap', id: t.id, x, y, team: u.team, on: 1, burn: 1 });
      const o = occ[y * W + x]; if (o >= 0 && U[o].alive && U[o].team !== u.team) burnHit(t, U[o]);
    }
  }
  function chRipple(t) {
    const c = t.ch.ripple; pvLabel(t, '웨이브 임팩트');
    for (const f of U) if (f.alive && f.team !== t.team && dUU(f, t) <= c.r) { hit(t, f, c.coef, c.flat, 'water', { noProc: 1, noReact: 1 }); for (let i = 0; i < 3 && f.alive; i++) tryStatus(t, f, { k: 'cold', p: 1, t: 2 }); if (B.over) break; }
  }
  /** Overload Protection (a shield per 15% max HP lost) / Shadowstep (DMG RES + SPD per 10%) between the holder's turns */
  function chLossStacks(t, d) {
    // "within a single turn": counted from the holder's own turn to its next one (the hpAcc hook resets on its turn)
    if (t.lossSeq !== t.turnNo) { t.lossSeq = t.turnNo; t.lossAcc2 = 0; t.lossN15 = 0; t.lossN10 = 0; }
    t.lossAcc2 += d;
    const c = t.ch;
    if (c.overload) while (t.lossAcc2 >= (t.lossN15 + 1) * 0.15 * t.hpMax) { t.lossN15++; addShield(t, t, t.hpMax * c.overload, 2, chR(t, 'overload')); }
    if (c.shadowstep) while (t.lossAcc2 >= (t.lossN10 + 1) * 0.1 * t.hpMax) {
      t.lossN10++;
      const s = t.st.find((x) => x.k === 'shStep');
      if (s) { s.n = Math.min(5, s.n + 1); s.exp = t.turnNo + 2; } else addStatus(t, { k: 'shStep', n: 1, exp: t.turnNo + 2, buff: true });
      const n = t.st.find((x) => x.k === 'shStep').n;
      for (let i = t.st.length - 1; i >= 0; i--) if (t.st[i].shStepPart) t.st.splice(i, 1);
      t.st.push({ k: 'dmgRed', v: c.shadowstep.red * n, exp: t.turnNo + 2, buff: true, shStepPart: 1 }, { k: 'spdUp', v: t.spd * c.shadowstep.spd * n, exp: t.turnNo + 2, buff: true, shStepPart: 1 });
      recalc(t);
    }
  }
  /** Rejuvenating Elixir: an ally falling under 50% HP drinks one of the owner's potions */
  function chElixir(t) {
    if (t.sum || t.pet) return;
    const o = B.elixir.find((x) => x.alive && x.team === t.team && x.potions > 0); if (!o) return;
    o.potions--; pvLabel(o, '재생의 영약'); heal(o, t, o.hpMax * o.ch.elixir.healPct + o.ch.elixir.healFlat, chR(o, 'elixir'));
  }
  /** a summon died or faded: Soul Impact (Dark DMG around it), Soulbond Restoration (the owner heals) */
  function sumGone(p) {
    const o = U[p.owner]; if (!o || !o.alive || !o.ch || B.over) return;
    if (o.ch.soulImpact) { const c = o.ch.soulImpact; pvLabel(o, '소울 임팩트'); for (const f of U) if (f.alive && f.team !== o.team && dU(f, p.x, p.y) <= c.r) { hit(o, f, c.coef, c.flat, 'dark', { noProc: 1, noReact: 1 }); if (B.over) break; } }
    if (o.ch.soulbond && o.alive) heal(o, o, o.hpMax * o.ch.soulbond.healPct + o.ch.soulbond.healFlat, chR(o, 'soulbond'));
    if (o.ch.sumPresence) chSumPresence(o, p);
  }
  /** Soul Pact Resonance: ATK up while one of the caster's summons stands */
  function chSumPresence(o, leaving) {
    const on = U.some((p) => p.sum && !p.clone && p.alive && p !== leaving && p.owner === o.id);
    const i = o.st.findIndex((x) => x.spa);
    if (on && i < 0) addStatus(o, { k: 'atkUp', v: o.atk * o.ch.sumPresence, exp: 1e9, buff: true, nd: 1, spa: 1 });
    else if (!on && i >= 0) { removeStatus(o, i); recalc(o); }
  }
  function chOnCast(u, s) {
    const c = u.ch;
    // Holy Restoration: Renewing Light per Light technique, a heal at 6 stacks
    if (c.holyRestore && s.el === 'light') { u.hrN = (u.hrN || 0) + 1; if (u.hrN >= c.holyRestore.n) { u.hrN = 0; pvLabel(u, '성령의 치유'); heal(u, u, u.hpMax * c.holyRestore.healPct + c.holyRestore.healFlat, chR(u, 'holyRestore')); } }
    // Scarlet Zeal: Battle Zeal stacks (ATK +1/10 of the charm value each), at 6 Scarlet Zeal (the full value) for 2 turns
    if (c.zeal && !has(u, 'zealR')) {
      const z = u.st.find((x) => x.k === 'zeal');
      if (z) { z.n++; z.v = u.atk * c.zeal * 0.1 * z.n; } else addStatus(u, { k: 'zeal', n: 1, v: u.atk * c.zeal * 0.1, exp: 1e9, buff: true, nd: 1 });
      const z2 = u.st.find((x) => x.k === 'zeal');
      if (z2.n >= 6) { u.st.splice(u.st.indexOf(z2), 1); pvLabel(u, '홍련의 투지'); addStatus(u, { k: 'zealR', v: u.atk * c.zeal, exp: u.turnNo + 2, buff: true, nd: 1 }); }
      recalc(u);
    }
  }
  function chTurnStart(u) {
    const c = u.ch;
    // Frost Guard: Icebound ends at the start of the turn with a heal
    const ice = u.st.findIndex((x) => x.ice); if (ice >= 0) { removeStatus(u, ice); recalc(u); heal(u, u, u.hpMax * c.frostGuard.healPct + c.frostGuard.healFlat, chR(u, 'frostGuard')); }
    // Flaming Path: 30% at turn start — burning ground on the cells within 1 grid
    if (c.burnAura && rnd() < c.burnAura.p) burnCells(u, around(u.x, u.y, 1), c.burnAura.coef, c.burnAura.flat, 3);
    // Oath of Vigil: the ally with the lowest HP share is guarded until this unit's next turn
    if (c.vigil) { for (const f of U) if (f.vigilBy === u.id) f.vigilBy = null; const al = U.filter((f) => f.alive && f.team === u.team && f !== u && f.kind === 'hero'); if (al.length) al.reduce((b, f) => (f.hp / f.hpMax < b.hp / b.hpMax ? f : b), al[0]).vigilBy = u.id; }
    // Mantra of Blessings / Falling Dark Star: until this unit's next turn
    for (const f of U) for (let i = f.st.length - 1; i >= 0; i--) if (f.st[i].tillSrc === u.id) { removeStatus(f, i); recalc(f); }
    if (c.mantra) { const al = U.filter((f) => f.alive && f.team === u.team && !f.sum && !f.pet); if (al.length) addStatus(al.reduce((b, f) => (eAtk(f) > eAtk(b) ? f : b), al[0]), { k: 'dmgUp', v: c.mantra, exp: 1e9, buff: true, nd: 1, tillSrc: u.id }); }
    if (c.darkStar) { const r = Math.floor(rnd() * 3), v = c.darkStar[r]; if (r === 0) addStatus(u, { k: 'atkUp', v: u.atk * v, exp: 1e9, buff: true, nd: 1, tillSrc: u.id }); else if (r === 1) { const add = Math.floor(u.hpMax * v); addStatus(u, { k: 'hpUp', v: add, exp: 1e9, buff: true, nd: 1, tillSrc: u.id }); u.hpMax += add; u.hp += add; } else addStatus(u, { k: 'spdUp', v: u.spd * v, exp: 1e9, buff: true, nd: 1, tillSrc: u.id }); }
    if (c.sumPresence) chSumPresence(u);
    // Rejuvenating Elixir: one more potion every 3 turns (up to 5)
    if (c.elixir && u.turnNo % c.elixir.every === 0) u.potions = Math.min(c.elixir.max, (u.potions || 0) + 1);
  }
  function chTurnEnd(u) {
    const c = u.ch, idle = (u.tCasts || 0) === u.tc0;
    // Frost Guard: no technique this turn → Icebound (DMG RES) until the next turn starts
    if (c.frostGuard && idle) addStatus(u, { k: 'dmgRed', v: c.frostGuard.v, exp: 1e9, buff: true, nd: 1, ice: 1 });
    // Holy Recuperation: no technique this turn → a heal, and +50% DMG next turn
    if (c.holyRecup && idle) { heal(u, u, u.hpMax * c.holyRecup.healPct + c.holyRecup.healFlat, chR(u, 'holyRecup')); addStatus(u, { k: 'dmgUp', v: c.holyRecup.dmg, exp: u.turnNo + 1, buff: true }); }
    // Fiery Rejuvenation: burning cells within 2 grids → a heal, +10% for each one beyond the first (up to 5)
    if (c.fieryRejuv) { const n = B.traps.filter((t) => t.burn && dist(t.x, t.y, u.x, u.y) <= 2).length; if (n) heal(u, u, (u.hpMax * c.fieryRejuv.healPct + c.fieryRejuv.healFlat) * (1 + 0.1 * Math.min(4, n - 1)), chR(u, 'fieryRejuv')); }
  }
  /** after an active move: the mover's Flaming Heel / Flaming Path, and enemies' Repelling Wind it stepped into */
  function chMoved(u, from) {
    if (u.ch && u.ch.flamingHeel) { const c = u.ch.flamingHeel; const tg = U.filter((f) => f.alive && f.team !== u.team && dUU(f, u) <= c.r); if (tg.length) { pvLabel(u, '불꽃 발걸음'); for (const f of tg) { hit(u, f, c.coef, c.flat, 'fire', { noProc: 1, noReact: 1 }); if (B.over) return; } } }
    if (u.ch && u.ch.burnAura && u.alive && rnd() < u.ch.burnAura.p) burnCells(u, around(u.x, u.y, 1), u.ch.burnAura.coef, u.ch.burnAura.flat, 3);
    for (const g of U) {
      if (!u.alive || B.over) return;
      if (!g.alive || g.team === u.team || !g.ch || !g.ch.repel) continue;
      const r = g.ch.repel, was = dU(g, from[0], from[1]), now = dUU(g, u);
      if (was > r.r && now <= r.r && rnd() < r.p) { pvLabel(g, '저항의 바람'); hit(g, u, r.coef, r.flat, r.el, { noProc: 1, noReact: 1 }); if (u.alive) knockback(g, u, r.kb); }
    }
  }
  /** Wind's Shadow: every 3rd Wind technique hit has a 30% chance of one more, with a 50% chance of a 20% action delay */
  function chWindEcho(a, t) {
    a.windN = (a.windN || 0) + 1; if (a.windN % 3 || rnd() >= a.ch.windEcho.p || !t.alive) return;
    hit(a, t, a.ch.windEcho.coef, a.ch.windEcho.flat, 'wind', { noProc: 1, noReact: 1 });
    if (t.alive) tryStatus(a, t, { k: 'delay', v: 0.2, p: 0.5 });
  }
  /** a materialized Fantomon fell or faded: Evanescent Phantom bursts, then Fantasmia starts refilling */
  function petGone(p) {
    if (p.phantom && !B.over) {
      const ph = p.phantom; pvLabel(p, ph.name);
      for (const f of U) if (f.alive && f.team !== p.team && dU(f, p.x, p.y) <= ph.r) { hit(p, f, ph.coef, 0, ph.el, { noProc: 1, noReact: 1 }); for (const e of ph.eff) if (f.alive) tryStatus(p, f, e); if (B.over) break; }
    }
    p.out = true;
  }
  function cleanse(t, n) { for (let i = 0; i < n; i++) { const di = t.st.map((x, j) => (!x.buff && x.k !== 'shield' ? j : -1)).filter((j) => j >= 0); if (!di.length) break; removeStatus(t, di[Math.floor(rnd() * di.length)]); } recalc(t); }
  function castSupport(u, k) {
    const ok = castSupport0(u, k);
    // Mandragora "Natural Power": the owner's technique on allies also heals 1 ally
    if (ok && u.petI != null && !B.over) {
      const p = U[u.petI];
      if (p.sup.k === 'allyHeal') { const al = alliesOf(u).filter((a) => a.hp < a.hpMax && dist(a.x, a.y, u.x, u.y) <= 4); if (al.length) heal(p, al.reduce((b, a) => (a.hp / a.hpMax < b.hp / b.hpMax ? a : b), al[0]), u.hpMax * p.sup.healPct + p.sup.healFlat); }
    }
    return ok;
  }
  function castSupport0(u, k) {
    // "Summons cannot receive any stat boosts": buffs skip them (heals and shields still reach them)
    const s = k.s, n = k.n, allies = s.buff ? alliesOf(u).filter((a) => !a.sum || a === u) : alliesOf(u);
    const within = (r) => allies.filter((a) => dist(a.x, a.y, u.x, u.y) <= r);
    const lowest = (list) => list.reduce((b, a) => (a.hp / a.hpMax < b.hp / b.hpMax ? a : b), list[0]);
    let targets;
    const tg = s.buff ? { t: s.buff.to, r: s.buff.r } : s.tg || { t: 'self' };
    if (tg.t === 'self') targets = [u];
    else if (tg.t === 'allies') targets = within(tg.r);
    else if (tg.t === 'owner') { const o = U[u.owner]; targets = o && o.alive && dist(o.x, o.y, u.x, u.y) <= tg.r ? [o] : []; if (!targets.length) return false; }
    else targets = [lowest(within(tg.r))];
    if (s.kind === 'heal') { targets = targets.filter((t) => t.hp < t.hpMax); if (!targets.length) return false; }
    if (s.buff && s.buff.max && targets.length > s.buff.max) { const rest = targets.filter((t) => t !== u).sort(() => rnd() - 0.5).slice(0, s.buff.max - 1); targets = [u, ...rest]; }
    B.castId++;
    if (ev) ev.push({ e: 'cast', u: u.id, n: s.ko || s.en, el: s.el, tg: targets.map((t) => t.id), ax: u.x, ay: u.y, sh: 'B', sup: 1 });
    if (s.kind === 'heal') {
      const amt = (t, m) => { let v = (u.hpMax * n.healPct + n.healFlat) * m; if (s.sp && s.sp.k === 'lowBonus' && t.hp / t.hpMax < s.sp.th) v *= 1 + s.sp.v; return v; };
      for (const t of targets) {
        heal(u, t, amt(t, 1), skR(s)); if (s.dispel) cleanse(t, s.dispel);
        if (u.ch && u.ch.overheal && rnd() < u.ch.overheal.p) for (const b of alliesOf(u)) if (dist(b.x, b.y, t.x, t.y) <= 1) heal(u, b, u.hpMax * u.ch.overheal.healPct + u.ch.overheal.healFlat, chR(u, 'overheal')); // Overhealing
        // Fantomon extras: Cure All random +10% ATK/DEF/SPD for 1 turn, Crystal Energy grants Purity
        if (s.rbuff) { const r = Math.floor(rnd() * 3); addStatus(t, { k: r === 0 ? 'atkUp' : r === 1 ? 'defUp' : 'spdUp', v: (r === 0 ? t.atk : r === 1 ? t.def : t.spd) * s.rbuff, exp: t.turnNo + 1, buff: true }); }
        if (s.purity && u.sup && u.sup.v.StatusDmgReducePer && !has(t, 'purity')) addStatus(t, { k: 'purity', v: u.sup.v.StatusDmgReducePer, exp: 1e9, buff: true });
      }
      if (s.sp && s.sp.k === 'healChain') {
        const cnt = new Map([[targets[0].id, 1]]); let last = targets[0];
        for (let i = 0; i < s.sp.n; i++) { const c = allies.filter((a) => a.alive && a !== last && a.hp < a.hpMax && dist(a.x, a.y, last.x, last.y) <= tg.r); if (!c.length) break; last = c[Math.floor(rnd() * c.length)]; const h = cnt.get(last.id) || 0; heal(u, last, amt(last, Math.pow(1 - s.sp.decay, h)), skR(s)); cnt.set(last.id, h + 1); }
      }
      return true;
    }
    if (s.kind === 'shield') { for (const t of targets) addShield(u, t, u.def * n.bv + (n.bflat || 0) * CURE_BASE, s.shT || 2, skR(s)); return true; }
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
        case 'hot': addStatus(t, { ...base, k: 'hot', v: (u.hpMax * n.healPct + n.healFlat) * skR(s) }); break;
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
  /** is slot i the turn's last cast? — no later ready skill has anyone to act on (the game's rule for the keep-away AI) */
  function lastCast(u, i) {
    for (let j = i + 1; j < u.skills.length; j++) {
      if (u.cds[j] > 0) continue;
      const s = u.skills[j].s;
      if (s.kind === 'dmg') { if (foesOf(u).length) return false; }
      else if (s.kind === 'heal') { if (alliesOf(u).some((a) => a.hp < a.hpMax)) return false; }
      else if (s.kind !== 'none') return false;
    }
    return true;
  }
  function tryCast(u, i, pre, keep) {
    const k = u.skills[i], s = k.s;
    if (s.kind === 'kit') {
      const pl = kitPlan(u, s, pre ? 0 : u.pool);
      if (!pl) return 0;
      if (!pre) u.pool -= pl.walk;
      kitCast(u, k, pl);
    } else if (s.kind === 'dmg') {
      const pl = plan(u, s, pre ? 0 : u.pool, aimFoes(u), !!keep);
      if (!pl || !pl.targets.length) return 0;
      if (!pre) u.pool -= pl.walk;
      castDamage(u, k, pl, pre);
    } else if (s.kind === 'rune') castRune(u, k); // Void Chant can be cast while taunted
    else {
      if (has(u, 'taunt')) return 0;
      if (s.kind === 'summon') { if (!castSummon(u, k, i)) return 0; }
      else if (s.kind === 'advance') { if (!castAdvance(u, k)) return 0; }
      else if (!castSupport(u, k)) return 0;
    }
    u.cds[i] = k.cd + 1;
    u.tCasts = (u.tCasts || 0) + 1;
    if (u.ch && !pre) chOnCast(u, s);
    runeReact(u);
    return 1;
  }
  function approach(u) {
    const foes = aimFoes(u); if (!foes.length || u.pool <= 0) return;
    // a healing summon (Waterling) stays with its side; an attacking one closes in
    if (u.sum && !u.skills.some((k) => k.s.kind === 'kit')) return;
    // a large unit (raid boss) measures from its body and stops once its targeted skills reach
    const big = u.sz > 1;
    const near = (x, y) => { let m = 1e9; for (const f of foes) { const d = big ? Math.min(...fpOf(u).map(([dx, dy]) => dU(f, x + dx, y + dy))) : dU(f, x, y); if (d < m) m = d; } return m; };
    const want = u.sum ? 1 : Math.max(1, Math.min(...u.skills.filter((k) => k.s.kind === 'dmg').map((k) => (k.s.tg.t === 'S' || (big && k.s.tg.t === 'T') ? k.s.tg.r : 1)), 99));
    let best = null, bd = near(u.x, u.y);
    if (bd <= want) return;
    for (const [dx, dy, d] of diaOf(u)) { if (d > u.pool) break; if (!d) continue; const x = u.x + dx, y = u.y + dy; if (!fits(u, x, y)) continue; const nd = near(x, y); if (nd < bd && nd >= 1) { bd = nd; best = [x, y]; } }
    if (best) moveTo(u, best[0], best[1]);
  }
  function takeTurn(u) {
    u.turnNo++;
    if (ev) ev.push({ e: 'turn', u: u.id, r: B.round });
    if (B.totem) totemAura(u);
    B.cur = u; B.turnSeq++; u.tc0 = u.tCasts || 0;
    if (u.ch && u.alive) chTurnStart(u);
    // start-of-turn effects
    for (const s of u.st.slice()) {
      if (!u.alive || B.over) break;
      if (s.k === 'dot') dotTick(u, s);
      else if (s.k === 'hot') heal(u, u, s.v);
    }
    if (u.alive && !B.over && has(u, 'flame')) flameBurst(u);
    if (u.alive && !B.over && B.traps.length) burnCheck(u);
    u.stone = 0;
    if (u.alive && !B.over && u.ch) {
      if (u.ch.regen) heal(u, u, u.hpMax * u.ch.regen.healPct + u.ch.regen.healFlat, chR(u, 'regen'));
      if (u.ch.omen) for (const f of U) if (f.alive && f.team !== u.team && dU(f, u.x, u.y) <= 5) tryStatus(u, f, { k: 'vuln', v: 0.25, p: 0.5, t: 1 });
    }
    // monster passives at the start of the monster's turn
    if (u.alive && !B.over && u.mp) {
      const mp = u.mp;
      if (mp.regen) heal(u, u, u.hpMax * mp.regen[0].v);
      if (mp.rejuv && u.rjLeft > 0) { u.rjLeft--; heal(u, u, u.hpMax * mp.rejuv[0].v); }
      if (mp.startAoe) for (const s of mp.startAoe) pvAoe(u, s.r, s.el, 1);
      // Chaos Tyrant: Chaos Power at the start of its 10th action (SPD and DMG dealt +20%, opens Terra's Cry)
      if (mp.chaosPower) for (const c of mp.chaosPower) if (u.turnNo === c.turn) { pvLabel(u, c.name); addStatus(u, { k: 'spdUp', v: u.spd * c.spd, exp: 1e9, buff: true, nd: 1 }); addStatus(u, { k: 'dmgUp', v: c.dmg, exp: 1e9, buff: true, nd: 1 }); }
      // End to Beginning: at the start of its 20th action every enemy's HP drops to zero (ignores invincibility)
      if (mp.wipe) for (const c of mp.wipe) if (u.turnNo === c.turn) { pvLabel(u, c.name); for (const f of U) if (f.alive && f.team !== u.team && !B.over) { f.hp = 0; kill(f, u); } }
    }
    if (u.alive && !B.over && u.petI != null) {
      const p = U[u.petI];
      if (p.sup.k === 'healLow' && u.hp / u.hpMax < 0.8) { heal(p, u, u.hpMax * p.sup.healPct + p.sup.healFlat); if (p.sup.cleanse && rnd() < p.sup.cleanse) cleanse(u, 1); }
      if (p.mat && p.out) { u.energy += 50; if (u.energy >= p.mat.cap) spawnPet(u, p); }
    }
    // materialized Fantomon passive: Emerald Dew heals allies around it at its turn start
    if (u.alive && !B.over && u.regenAllies) for (const a of alliesOf(u)) if (a !== u && dist(a.x, a.y, u.x, u.y) <= u.regenAllies.r) heal(u, a, u.hpMax * u.regenAllies.pct);
    if (u.alive && !B.over) {
      const stunned = has(u, 'stun'), locked = stunned || has(u, 'freeze') || has(u, 'frenzy');
      if (!stunned) for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--;
      if (!locked) {
        u.pool = has(u, 'immob') ? 0 : u.move + u.moveAdd;
        let cast = 0, waiting = 0;
        if (u.kind === 'mob' && !u.kit) {
          // monsters: one skill a turn, specials first (assumption)
          for (let i = u.skills.length - 1; i >= 0 && !cast && !B.over; i--) if (u.cds[i] <= 0 && !(u.skills[i].s.rage && !u.raged)) { if (tryCast(u, i)) cast = 1; else waiting = 1; } // "Activate [Rage] to enable this skill"
        } else if (u.kit || u.sum) {
          // boss kit / summoned creature: every ready skill in its own order (as the recorded raids show), within its gate / state
          for (let i = 0; i < u.skills.length && u.alive && !B.over; i++) { const s = u.skills[i].s; if (u.cds[i] > 0 || !kitUsable(u, s)) continue; if (tryCast(u, i)) cast++; else waiting = 1; }
        } else {
          // the turn's last cast of a ranged keep-distance skill (heroes) plans from the safest cell in reach
          for (let i = 0; i < u.skills.length && u.alive && !B.over; i++) if (u.cds[i] <= 0) { const keep = u.kind === 'hero' && u.skills[i].s.kd && lastCast(u, i); if (tryCast(u, i, false, keep)) cast++; else if (u.skills[i].s.kind === 'dmg') waiting = 1; }
        }
        if (u.alive && !B.over && (waiting || !cast)) approach(u);
      } else if (ev) ev.push({ e: 'skip', u: u.id });
    }
    // end of turn: enemy auras, Fantomon end-of-turn support
    if (u.alive && !B.over) {
      for (const f of U) if (f.alive && f.team !== u.team && f.ch && f.ch.aura && dUU(f, u) <= 2) { hit(f, u, f.ch.aura.coef, f.ch.aura.flat, 'water', { noProc: 1, noReact: 1 }); if (!u.alive || B.over) break; tryStatus(f, u, { k: 'cold', p: 0.5, t: 2 }); }
      if (u.alive && !B.over && u.petI != null) {
        const p = U[u.petI], sp = p.sup;
        if (sp.k === 'endTurn') {
          let best = null, bd = 9; for (const f of U) if (f.alive && f.team !== u.team) { const d = dU(f, u.x, u.y); if (d < bd) { bd = d; best = f; } }
          if (best) { if (ev) ev.push({ e: 'cast', u: u.id, n: `${p.name} 지원`, el: sp.el, tg: [best.id], ax: best.x, ay: best.y, sh: 'S', ar: 0, pet: 1 }); hit(p, best, sp.coef, sp.flat, sp.el, { noProc: 1, noReact: 1 }); }
          u.petStk++; if (u.petStk === 4 && sp.v.StatusDmgAddPer) addStatus(u, { k: 'dmgUp', v: sp.v.StatusDmgAddPer, exp: 1e9, buff: true });
        } else if (sp.k === 'shield3') {
          // Armor Protection: DEF Up stacks each turn; the 3rd stack is spent on a DEF-based shield
          u.petStk++;
          if (u.petStk % 3 === 0) { for (let i = u.st.length - 1; i >= 0; i--) if (u.st[i].armo) removeStatus(u, i); recalc(u); addShield(u, u, eDef(u) * (sp.v.ShieldByDefence || 0), 3); }
          else if (sp.defStk && sp.v.DefenceScale) addStatus(u, { k: 'defUp', v: u.def * sp.v.DefenceScale, exp: 1e9, buff: true, armo: 1 });
        } else if (sp.k === 'nap' && u.petStk < 7) {
          // Just Nap: 7 Sleep stacks → Pava (estimate: ATK/DEF up for the rest of the battle)
          if (++u.petStk === 7) {
            pvLabel(u, `${p.name} · 파바`);
            if (sp.v.AttackScale) addStatus(u, { k: 'atkUp', v: u.atk * sp.v.AttackScale, exp: 1e9, buff: true, nd: 1 });
            if (sp.v.DefenceScale) addStatus(u, { k: 'defUp', v: u.def * sp.v.DefenceScale, exp: 1e9, buff: true, nd: 1 });
          }
        } else if (sp.k === 'ga' && u.turnNo === 3) {
          // Radiant Sanctuary: Guardian Angel ends → restore 50% of lost HP, Power Unsealed for the battle
          pvLabel(u, `${p.name} · 봉인 해제`);
          heal(p, u, (u.hpMax - u.hp) * 0.5);
          if (sp.v.CritRatePercent) addStatus(u, { k: 'critUp', v: sp.v.CritRatePercent, exp: 1e9, buff: true, nd: 1 });
          if (sp.v.BlockAvoidPercent) addStatus(u, { k: 'accUp', v: sp.v.BlockAvoidPercent, exp: 1e9, buff: true, nd: 1 });
        }
      }
      // Evanescent Phantom: the materialized Fantomon fades after its 3rd turn
      if (u.pet && u.phantom && u.alive && u.turnNo - u.spawnT >= u.phantom.life) { kill(u, null); return; }
      // monster passives at the end of the monster's turn
      if (u.alive && !B.over && u.mp) {
        const mp = u.mp;
        if (mp.endAoe) for (const s of mp.endAoe) {
          const tg = foesOfT(u, u.x, u.y, s.r); if (!tg.length) continue;
          pvLabel(u, s.name);
          for (const f of tg) {
            hit(u, f, u.mc || 1, 0, s.el, { noProc: 1, noReact: 1 });
            if (s.dispel && f.alive && rnd() < s.dispel) { const bi = f.st.map((x, i) => (x.buff && !x.nd ? i : -1)).filter((i) => i >= 0); if (bi.length) { removeStatus(f, bi[Math.floor(rnd() * bi.length)]); recalc(f); } }
          }
        }
        if (mp.luck && u.alive) { const v = mp.luck[0].v, r = Math.floor(rnd() * 3); addStatus(u, { k: r === 0 ? 'atkUp' : r === 1 ? 'defUp' : 'spdUp', v: (r === 0 ? u.atk : r === 1 ? u.def : u.spd) * v, exp: u.turnNo + 1, buff: true }); }
        if (mp.siphon) u.sipN = Math.min(mp.siphon[0].n, (u.sipN || 0) + mp.siphon[0].add);
        if (mp.cloud) u.cloudN = Math.min(mp.cloud[0].n, (u.cloudN || 0) + mp.cloud[0].add);
      }
    }
    // Blast Spirits act at the end of their caster's turn; a Decoy Clone's life counts its caster's turns
    if (B.traps.length) trapsAfter(u);
    if (u.ch && u.alive && !B.over) chTurnEnd(u);
    for (const c of U) if (c.clone && c.alive && c.owner === u.id && --c.life <= 0) dismiss(c);
    // a summon's lifespan counts its own turn ends (StatusEndComponent.RemoveApplyEntity)
    if (u.sum && !u.clone && u.alive && --u.life <= 0) { dismiss(u); return; }
    // end of turn: expire statuses
    if (u.alive) {
      let ch = 0;
      for (let i = u.st.length - 1; i >= 0; i--) if (u.turnNo >= u.st[i].exp) {
        const s = u.st[i];
        removeStatus(u, i); ch = 1;
        if (s.k === 'shield' && s.shift && s.v > 0) { const real = Math.min(s.v, u.hpMax - u.hp); if (real > 0) { u.hp += real; if (ev) ev.push({ e: 'heal', a: u.id, t: u.id, v: real, hp: u.hp }); } } // Healing Shift: what is left of the shield comes back as HP, 1:1
        if (s.shatter && U[s.src] && U[s.src].alive && !B.over && u.alive) { const a = U[s.src]; pvLabel(a, '얼음 파편'); hit(a, u, a.ch.shatter.coef, a.ch.shatter.flat, 'water', { noProc: 1, noReact: 1 }); } // Shattering Ice
        if (s.shadow) u.shadowF = 0;
      }
      if (ch) recalc(u);
    }
  }

  /* ── pre-battle: charms, Fantomon passives, then "casts before battle" skills ── */
  for (const u of U) {
    if (u.pet || !u.alive) continue;
    // guild conquest: "United We Stand" — the boss takes 99% less DMG for its first 3 turns
    if (u.uws) addStatus(u, { k: 'dmgRed', v: 0.99, exp: 3, buff: true });
    if (u.mp) {
      const mp = u.mp;
      if (mp.drStk) { u.drN = mp.drStk[0].n; u.drV = mp.drStk[0].v; }
      if (mp.strata) { u.strataN = mp.strata[0].n; u.strataV = mp.strata[0].vuln; }
      if (mp.siphon) { u.sipN = mp.siphon[0].n; u.sipV = mp.siphon[0].v; }
      if (mp.cloud) { u.cloudN = mp.cloud[0].n; u.cloudV = mp.cloud[0].v; }
    }
    const c = u.ch, perm = { exp: 1e9, buff: true };
    if (c) {
      for (const s of c.shields) if (s.when === 'pre') addShield(u, u, (s.by === 'hp' ? u.hpMax : u.def) * s.v, s.t, pvOf(s.pv));
      if (c.soulProt) { const h = Math.floor(u.hp * 0.5); u.hp -= h; addStatus(u, { ...perm, k: 'shield', v: h, src: u.id }); }
      if (c.soulfire) { u.hp = Math.max(1, Math.ceil(u.hp * 0.5)); addStatus(u, { ...perm, k: 'dmgRed', v: c.soulfire }); }
      if (c.rapid) for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--;
      if (c.elixir) { u.potions = c.elixir.start; B.elixir.push(u); }
      if (c.ironFort) for (const f of U) if (f.alive && f.team === u.team && f.kind === 'hero' && Math.max(Math.abs(f.x - u.x), Math.abs(f.y - u.y)) <= 3) addStatus(f, { ...perm, k: 'defUp', v: u.def * c.ironFort });
    }
    if (u.petI != null) {
      const p = U[u.petI], sp = p.sup, v = sp.v;
      if (p.mat) u.energy = p.mat.init;
      if (sp.k === 'inkBurst') { for (let i = 0; i < u.cds.length; i++) if (u.cds[i] > 0) u.cds[i]--; if (v.StatusDmgAddPer) addStatus(u, { ...perm, k: 'dmgUp', v: v.StatusDmgAddPer }); }
      else if (sp.k === 'cloud') { if (v.StatusDmgReducePer) addStatus(u, { k: 'dmgRed', v: v.StatusDmgReducePer, exp: 3, buff: true }); if (v.BlockPercent) addStatus(u, { ...perm, k: 'blockUp', v: v.BlockPercent }); }
      else if (sp.k === 'atkSpd') { if (v.AttackScale) addStatus(u, { ...perm, k: 'atkUp', v: u.atk * v.AttackScale }); if (v.SpeedScale) addStatus(u, { ...perm, k: 'spdUp', v: u.spd * v.SpeedScale }); }
      else if (sp.k === 'ga') addStatus(u, { k: 'ga', exp: 3, buff: true, nd: 1 });
      else if (sp.k === 'purity' && v.StatusDmgReducePer) addStatus(u, { ...perm, k: 'purity', v: v.StatusDmgReducePer });
    }
    u.above50 = u.hp / u.hpMax >= 0.5;
  }
  // battle-start casts: highest initial SPD first (the game's note); equal SPD in a random order each fight, so a
  // mirrored team does not always open on the same side (a battle-start taunt decides who opens under Taunt)
  const preKey = new Map(U.map((u) => [u, rnd()]));
  for (const u of U.slice().sort((a, b) => b.spd - a.spd || preKey.get(a) - preKey.get(b))) {
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
function metaOf(P) { return P.units.map((u) => ({ id: u.id, team: u.team, name: u.name, kind: u.kind, ref: u.ref, nth: u.nth || 0, key: u.key, cls: u.cls, level: u.level, x: u.x, y: u.y, sz: u.sz || 1, hpMax: u.hpMax, big: !!u.big, pet: !!u.pet, out: !!u.out, petId: u.petId, owner: u.owner, sum: !!u.sum, clone: !!u.clone, art: u.art })); }
/** deployment preview (names, cells, max HP) without running a fight */
export function roster(setup) { return metaOf(prepare(setup)); }
/** one logged fight for the replay */
export function replay(setup, seed) { const P = prepare(setup); const r = simulate(P, seed, true); return { ...r, meta: metaOf(P) }; }
