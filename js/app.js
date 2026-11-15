// UI: team builder (skills, charms, Fantomon), encounter presets, Monte Carlo runner and results.
import { CLASSES, SKILLS, MAPS, RANKS, MAXLV } from './gamedata.js';
import { SK, MOB, MAP, CLS, heroBase, mobStats, stFrom, skillNumbers, roster, replay, monteCarlo, HERO_DEFAULTS, ALL_MOBS, CHARM, CHARMS, PET, PETS, ENC, MOB_PV } from './engine.js';
import { createStage } from './scene.js';
import { renderAvatar, EL } from './sprites.js';
import { loadArt } from './art.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'u' + Math.random().toString(36).slice(2, 9);
const KEY = 'sxs-calc-v2';
const MAX_UNITS = 24;
const TYPE_KO = ['일반', '정예', '보스'];
// stat / status names follow the Korean client's wording (skill descriptions, KR resources)
const ADV = [['critRate', '치명타율 %'], ['critDmg', '치명타 대미지 %'], ['critRes', '치명타 저항 %'], ['blockRate', '막기율 %'], ['blockEff', '막기 대미지 저항 %'], ['acc', '명중 %'],
  ['dmgBoost', '대미지 보너스 %'], ['dmgRes', '대미지 저항 %'], ['dodge', '회피 %'], ['effHit', '효과 적중 %'], ['effRes', '효과 저항 %'], ['mastery', '원소 마스터리'],
  ['phyMastery', '물리 마스터리'], ['aff', '원소 친화력'], ['res', '원소 저항'], ['phyRes', '물리 저항'], ['aegis', '원소 가호']];
const EFF_KO = { abreak: '방어력 감소', weak: '약화', slow: '감속', stun: '스턴', freeze: '빙결', immob: '속박', taunt: '도발', frenzy: '광란', blind: '실명', cold: '냉기', wet: '습윤', dot: '침식', riven: '막기율 감소', sigil: '낙인', vuln: '취약', randDebuff: '랜덤 디버프' };
const effName = (e) => (e.k === 'dot' && e.el && e.el !== 'dark' ? (e.el === 'fire' ? '작열' : '지속 대미지') : EFF_KO[e.k] || e.k) + (e.v && ['abreak', 'weak', 'slow'].includes(e.k) ? ` ${e.v >= 0.3 ? 2 : 1}` : '');
const MODE_KO = { fantasia: '환상계단', dungeon: '일일 던전', conquest: '길드 토벌 (길드 보스 460층)', crucible: '신수 시련' };

/* ───────── official skill icons (optional, user-supplied): assets/skills/skill_<id>.webp|png ───────── */
// assets/skills/icons.json → { "ext": "webp" | "png" | "" }  (empty = no icon files supplied, built-in tiles are used)
let ICON_EXT = null;
fetch('assets/skills/icons.json').then((r) => (r.ok ? r.json() : {})).then((j) => { ICON_EXT = j && j.ext ? String(j.ext).replace(/[^a-z0-9]/gi, '') : null; if (ICON_EXT) { renderTeam(0); renderTeam(1); } }).catch(() => {});
function glyphOf(s) { if (!s) return '＋'; if (s.kind === 'none') return '⚠'; if (s.kind === 'heal') return '✚'; if (s.kind === 'shield') return '⛨'; if (s.kind === 'buff') return '▲'; const t = s.tg && s.tg.t; return t === 'S' ? '⚔' : t === 'F' ? '➤' : t === 'T' || t === 'TQ' ? '◎' : '✸'; }
function iconHtml(id, el, glyph) {
  const img = ICON_EXT && id ? `<img src="assets/skills/skill_${id}.${ICON_EXT}" alt="" loading="lazy" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : '';
  const dot = img && el && el !== 'none' ? `<b class="eldot" title="${(EL[el] || EL.none).ko}"></b>` : '';
  return `<span class="ico${img ? ' has-img' : ''}" style="--c:${(EL[el] || EL.none).c}"><em>${glyph}</em>${img}${dot}</span>`;
}

/* ───────── encounters ───────── */
function floorUnits(mapId, floor) {
  const m = MAP.get(mapId), f = m.floors[Math.max(0, Math.min(m.floors.length - 1, floor - 1))], out = [];
  for (let i = 1; i < f.length; i += 2) { const ex = out.find((u) => u.key === f[i]); if (ex) ex.count = Math.min(20, ex.count + f[i + 1]); else out.push({ uid: uid(), kind: 'mob', key: f[i], level: f[0], count: f[i + 1] }); }
  return out;
}
// a preset fight → mob units; groups with precomputed stats (guild conquest floors, Hieromon tiers) attach them as `fix`
const fightUnits = (f, g, fi) => {
  const out = [];
  for (let i = 1, ui = 0; i < f.length; i += 4, ui++) {
    const u = { uid: uid(), kind: 'mob', key: f[i], count: Math.min(20, f[i + 1]), level: f[i + 2], sr: f[i + 3] };
    if (g && g.st && g.st[fi] && g.st[fi][ui]) u.fix = g.st[fi][ui];
    if (g && g.uws) u.uws = 1;
    out.push(u);
  }
  return out;
};
const CATALOG = [
  { id: 'fantasia', groups: MAPS.map((m) => ({ id: m.id, ko: m.ko, n: m.floors.length, label: (i) => `${i}층 · Lv.${m.floors[i - 1][0]}`, units: (i) => floorUnits(m.id, i) })) },
  ...ENC.map((m) => ({ id: m.id, groups: m.groups.map((g) => ({ id: g.id, ko: g.ko, n: g.fights.length, label: (i) => `${g.fights[i - 1][0]} · Lv.${g.fights[i - 1][3]}`, units: (i) => fightUnits(g.fights[i - 1], g, i - 1) })) })),
];
const MOBSKILL_ICON = (s) => (s.ic ? `<span class="ico has-img mob" style="--c:${(EL[s.el] || EL.none).c}"><img src="assets/mobskills/${s.ic}.png" alt="" loading="lazy" onerror="this.parentNode.classList.remove('has-img');this.remove()"><b class="eldot"></b></span>` : '');
const encMode = (id) => CATALOG.find((m) => m.id === id) || CATALOG[0];
const encGroup = (mode, id) => mode.groups.find((g) => g.id === id) || mode.groups[0];
const mobHome = (mob) => (mob.map ? `환상계단 · ${MAP.get(mob.map).ko}` : { 1: '일일 던전', 2: '길드 토벌', 3: '신수 시련' }[mob.k.split('|')[1]] || '기타');

/* ───────── state ───────── */
function lineChain(clsKey) { const c = CLS.get(clsKey), baseKey = c.line[0] === 'W' ? 'Zhanshi' : 'Fashi'; return [c, ...CLASSES.filter((x) => x.tier < c.tier && (x.line === c.line || x.key === baseKey)).sort((a, b) => b.tier - a.tier)]; }
function defaultSkills(clsKey) {
  const pool = lineChain(clsKey).flatMap((x) => SKILLS.filter((s) => s.cls === x.key && s.kind !== 'none'));
  const dmg = pool.filter((s) => s.kind === 'dmg'), sup = pool.filter((s) => s.kind !== 'dmg');
  const out = [...dmg.slice(0, sup.length ? 3 : 4), ...sup.slice(0, 1)].map((s) => ({ id: s.id, rank: 3 }));
  while (out.length < 4) out.push(null);
  return out;
}
function newHero(cls = 'Huwei', level = 40, name = '캐릭터', mult = 2.5) {
  const b = heroBase(level);
  return { uid: uid(), kind: 'hero', name, cls, level, atk: Math.round(b.atk * mult), def: Math.round(b.def * mult), hp: Math.round(b.hp * mult), spd: Math.round(b.spd * (1 + (mult - 1) * 0.4)), adv: {}, skills: defaultSkills(cls), charms: [null, null, null, null], pet: null };
}
function petDefaults(h, id) { const p = PET.get(id); return { id, rank: 3, adult: false, hp: Math.round(h.hp * p.base[0] / 100), atk: Math.round(h.atk * p.base[1] / 100), def: Math.round(h.def * p.base[2] / 100), spd: Math.round(h.spd * p.base[3] / 100) }; }
function demo() {
  return { v: 2, mode: 'pve', runs: 1000, roundCap: { pve: 15, pvp: 100 }, mobCoef: 100, pvpBalance: true, pvEst: true, preset: { mode: 'fantasia', group: 'fa1', n: 71 }, teams: [[newHero('Huwei', 40, '나')], floorUnits('fa1', 71)] };
}
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function sanitize(s) {
  if (!s || !Array.isArray(s.teams) || s.teams.length !== 2) return null;
  const d = demo();
  const out = { ...d, ...s, v: 2, roundCap: { ...d.roundCap, ...(s.roundCap || {}) }, preset: { ...d.preset, ...(s.preset && s.preset.mode ? s.preset : {}) } };
  out.mode = out.mode === 'pvp' ? 'pvp' : 'pve';
  const four = (arr, ok) => { const a = (Array.isArray(arr) ? arr : []).slice(0, 4).map((x) => (x && ok(x) ? x : null)); while (a.length < 4) a.push(null); return a; };
  out.teams = s.teams.map((t) => (Array.isArray(t) ? t : []).filter((u) => u && (u.kind === 'mob' ? MOB.has(u.key) : CLS.has(u.cls))).map((u) => {
    if (u.kind === 'mob') {
      const m = { uid: u.uid || uid(), kind: 'mob', key: u.key, level: +u.level || 1, count: Math.max(1, Math.min(20, +u.count || 1)), sr: u.sr || MOB.get(u.key).sr };
      if (Array.isArray(u.fix) && u.fix.length === 14 && u.fix.every((x) => typeof x === 'number' && isFinite(x))) m.fix = u.fix;
      if (u.uws) m.uws = 1;
      return m;
    }
    const pet = u.pet && PET.has(+u.pet.id) ? { id: +u.pet.id, rank: +u.pet.rank || 3, adult: !!u.pet.adult, atk: +u.pet.atk || 1, def: +u.pet.def || 0, hp: +u.pet.hp || 1, spd: +u.pet.spd || 1 } : null;
    return { uid: u.uid || uid(), kind: 'hero', name: String(u.name || '캐릭터').slice(0, 20), cls: u.cls, level: +u.level || 1, atk: +u.atk || 1, def: +u.def || 0, hp: +u.hp || 1, spd: +u.spd || 1, adv: u.adv && typeof u.adv === 'object' ? u.adv : {},
      skills: four(u.skills, (x) => x.custom || SK.has(x.id)), charms: four(u.charms, (x) => CHARM.has(x.id)), pet };
  }));
  return out;
}
function load() {
  try { const h = location.hash.match(/#s=([\w-]+)/); if (h) { const s = sanitize(JSON.parse(b64d(h[1]))); if (s) { history.replaceState(null, '', location.pathname + location.search); return s; } } } catch (e) { /* bad link */ }
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('sxs-calc-v1'))); } catch (e) { return null; }
}
let state = load() || demo();
const openSet = new Set();
let saveT = 0, rosterT = 0, lastRes = null, lastSetup = null, running = false;

function toSetup() {
  return {
    mode: state.mode, roundCap: state.roundCap[state.mode], pvpBalance: state.pvpBalance, mobCoef: state.mobCoef / 100, pvEst: state.pvEst !== false,
    teams: state.teams.map((t) => t.map((u) => (u.kind === 'mob' ? { kind: 'mob', uid: u.uid, key: u.key, level: u.level, count: u.count, sr: u.sr, fix: u.fix, uws: u.uws }
      : { kind: 'hero', uid: u.uid, name: u.name, cls: u.cls, level: u.level, atk: u.atk, def: u.def, hp: u.hp, spd: u.spd, ...u.adv, skills: u.skills, charms: u.charms, pet: u.pet }))),
  };
}
const countUnits = (t) => t.reduce((s, u) => s + (u.kind === 'mob' ? u.count : 1), 0);
function touch(noRoster) {
  clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }, 300);
  if (lastRes) { $('#results').classList.add('stale'); $('#winTag').hidden = true; }
  if (!noRoster) { clearTimeout(rosterT); rosterT = setTimeout(showRoster, 220); }
}

/* ───────── stage ───────── */
const stage = createStage($('#stage'));
const term = stage.term;
function showRoster() {
  if (running) return;
  stage.stop();
  try { stage.setRoster(roster(toSetup())); } catch (e) { console.error(e); }
  $('#banner').hidden = true; $('#roundTag').textContent = '대기 중'; hud();
}
function hud() { const h = stage.teamHp(); $('#hpA').style.width = (h[0][1] ? (h[0][0] / h[0][1]) * 100 : 0) + '%'; $('#hpB').style.width = (h[1][1] ? (h[1][0] / h[1][1]) * 100 : 0) + '%'; }

/* ───────── skill / charm text ───────── */
function shapeKo(tg) {
  if (!tg) return '';
  switch (tg.t) {
    case 'S': return tg.min ? `${tg.min}~${tg.r}칸 · 적 1명` : `${tg.r}칸 · 적 1명`;
    case 'A': return `${tg.r}칸 범위 · 모든 적`;
    case 'Q': return `주변 ${tg.r}칸 정사각형`;
    case 'F': return `전방 ${tg.w}x${tg.h}칸`;
    case 'T': return `${tg.r}칸 내 위치 선택 · 주변 ${tg.ar}칸`;
    case 'TQ': return `${tg.r}칸 내 위치 선택 · 주변 ${tg.ar}칸 정사각형`;
    case 'allies': return `${tg.r}칸 범위 · 모든 아군`;
    case 'allyLow': return `${tg.r}칸 · 생명 비율 낮은 아군`;
    default: return '자신';
  }
}
const BUFF_KO = { blockUp: '막기율', critUp: '치명타율', dmgUp: '대미지 보너스', dmgRed: '받는 대미지 감소', atkUp: '공격력(시전자 공격력 기준)', spdUp: '속도(시전자 속도 기준)', hpUp: '최대 생명력(시전자 기준)', nextAcc: '다음 전투 스킬 명중', nextDoom: '다음 전투 스킬 대미지', hot: '턴 시작 시 치유', swords: '광검 반격', flame: '열화' };
const tag = (t, cls = '') => `<span class="tag ${cls}">${t}</span>`;
function skillTags(s, n, order) {
  const el = EL[s.el] || EL.none, t = [];
  t.push(`<span class="tag el" style="background:${el.c}">${el.ko}</span>`);
  if (s.kind === 'none') { t.push(tag('⚠ 시뮬 미반영', 'warn')); return t.join(''); }
  if (s.kind === 'dmg') {
    t.push(tag(shapeKo(s.tg)));
    const hits = (s.hits || 1) + (s.h2 || 0);
    if (hits > 1 || s.sp) t.push(tag(s.sp && s.sp.k === 'waves' ? s.sp.n + '파동' : s.sp && s.sp.k === 'rand' ? '무작위 ' + s.sp.n + '회' : hits + '타'));
    if (n && n.coef != null) t.push(tag(`${(n.coef * 100).toFixed(1)}%${n.flat ? ' + ' + fmt(n.flat) : ''}${n.coef2 ? ` / 막타 ${(n.coef2 * 100).toFixed(1)}%` : ''}`));
    if (s.leap) t.push(tag(`${s.leap}칸 내 빈 곳으로 이동`));
    if (s.pull) t.push(tag('끌어당김'));
    if (s.doom) t.push(tag('파멸 대미지(실드 2배)'));
    if (s.ls) t.push(tag(`생명 흡수 ${Math.round(s.ls * 100)}%`));
    for (const e of s.eff || []) t.push(tag(`${effName(e)} · ${Math.round((e.p == null ? 1 : e.p) * 100)}%`));
    if (s.sp && s.sp.k === 'chain') t.push(tag(`최대 ${s.sp.n}회 연쇄`));
    if (s.sp && s.sp.k === 'bounce') t.push(tag(`최대 ${s.sp.n}회 튕김`));
    if (s.sp && s.sp.k === 'recast') t.push(tag(`${Math.round(s.sp.p * 100)}% 확률 재사용`));
    if (s.sp && s.sp.k === 'killRecast') t.push(tag('처치 시 재사용'));
    if (s.sp && s.sp.k === 'execute') t.push(tag('잃은 생명 비례 최대 +50%'));
  } else if (s.kind === 'heal') {
    t.push(tag(shapeKo(s.tg)));
    if (n && n.healPct != null) t.push(tag(`치유 · 최대 생명력 ${(n.healPct * 100).toFixed(2)}%${n.healFlat ? ' + ' + fmt(n.healFlat) : ''}`));
  } else if (s.kind === 'shield') {
    t.push(tag(shapeKo(s.tg)));
    if (n) t.push(tag(`실드 · 방어력 ${(n.bv * 100).toFixed(1)}% + ${fmt((n.bflat || 0) * 16.667)} · ${s.shT}턴`));
  } else if (s.buff) {
    const b = s.buff;
    t.push(tag(b.to === 'self' ? '자신' : b.to === 'allies' ? `${b.r}칸 범위 · 아군` : '생명 비율 낮은 아군'));
    t.push(tag(`${BUFF_KO[b.st] || b.st}${n && n.bv ? ' +' + (n.bv * 100).toFixed(1) + '%' : ''}${b.t < 90 ? ' · ' + b.t + '턴' : ''}`));
  }
  // cast timing: slot order + cooldown
  if (order != null) t.push(tag(s.pre ? `전투 시작 전 1회 · 이후 ${s.cd + 1}턴마다` : s.cd ? `${order}번째 · ${s.zi ? '1턴부터' : s.cd + 1 + '턴부터'} ${s.cd + 1}턴마다` : `${order}번째 · 매 턴`, 'time'));
  else if (s.cd) t.push(tag(`쿨다운 ${s.cd}턴`));
  return t.join('');
}
const STAT_KO = { critRate: '치명타율', blockRate: '막기율', critDmg: '치명타 대미지', blockEff: '막기 대미지 저항', healUp: '치유 효과' };
const FLAT_KO = { atk: '공격력', def: '방어력', hp: '생명력', spd: '속도', mastery: '원소 마스터리', phyMastery: '물리 마스터리', res: '원소 저항', effHit: '효과 적중' };
const UP_KO = { perDebuff3: '대상 디버프 1종당(최대 3)', vsDebuffed: '이상 상태·디버프 대상에게', perLost15: '잃은 생명 15%당(최대 5)', tgtLost15: '대상이 잃은 생명 15%당(최대 5)', tgtAbove70: '생명 70% 초과 대상에게', singleHit: '단일 대미지 전투 스킬', fewFoes: '2칸 내 적 3명 이하일 때', turn3: '3번째 턴부터 턴마다(최대 3)', perCast4: '전투 스킬 4회마다(최대 3)', eye: '피격 1회당(최대 10) 다음 공격' };
const RED_KO = { perLost15: '잃은 생명 15%당(최대 5)', manyFoes: '2칸 내 적 4명 이상일 때', always: '항상', attackerDebuffed: '공격자가 이상 상태·디버프면', stone: '피격 1회당(최대 9, 1턴)', vsTaunted: '도발된 적에게서' };
function charmTags(c, rank) {
  if (!c.fx) return tag('⚠ 시뮬 미반영', 'warn');
  const q = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4][Math.min(22, rank - 1)] ?? 5, t = [];
  const pc = (a) => (Array.isArray(a) ? (+a[q]).toFixed(1).replace(/\.0$/, '') + '%' : '');
  for (const f of c.fx) {
    switch (f[0]) {
      case 'stat': t.push(tag(`${STAT_KO[f[1]]} +${pc(f[2])}`)); break;
      case 'flat': t.push(tag(`${FLAT_KO[f[1]]} 증가`)); break;
      case 'aff': t.push(tag(`${EL[f[1]].ko} 원소 친화력 증가`)); break;
      case 'harmony': t.push(tag('장착 전투 스킬 원소 1종당 원소 마스터리')); break;
      case 'proc': t.push(tag(`${f[1] === 'crit' ? '치명타 시' : Math.round(f[2] * 100) + '% 확률'} 추가 ${EL[f[3]].ko} 대미지 ${c.c ? c.c[q] + '%' : ''}${f[4] ? ' · 주변 ' + f[4] + '칸' : ''}`)); break;
      case 'inflict': t.push(tag(`${EL[f[3]] ? EL[f[3]].ko + ' 대미지 시 ' : ''}${Math.round(f[1] * 100)}% ${effName(f[2])}`)); break;
      case 'react': t.push(tag(`${f[1] === 'block' ? '막기 시' : '피격 시 ' + Math.round(f[2] * 100) + '%'} 반격 ${c.c ? c.c[q] + '%' : ''}${f[4] === 'def' ? '(방어력 기반)' : ''}`)); break;
      case 'reactInflict': t.push(tag(`${f[1] === 'block' ? '막기 시' : '피격 시'} 공격자에게 ${effName(f[2])}`)); break;
      case 'ls': t.push(tag(`생명 흡수 ${pc(f[1])}`)); break;
      case 'dmgUp': t.push(tag(`${UP_KO[f[1]]} 대미지 +${pc(f[2])}`)); break;
      case 'dmgRed': t.push(tag(`${RED_KO[f[1]]} 받는 대미지 −${pc(f[2])}`)); break;
      case 'shield': t.push(tag(`${f[1] === 'pre' ? '전투 시작 전' : '생명 50% 미만 시'} 실드 (${f[2] === 'hp' ? '최대 생명력' : '방어력'}의 ${pc(f[3])})`)); break;
      case 'soulProt': t.push(tag('현재 생명력 50%를 실드로 전환')); break;
      case 'soulfire': t.push(tag(`현재 생명력 50% 소모 · 받는 대미지 −${pc(f[1])}`)); break;
      case 'undying': t.push(tag('치명적인 대미지 1회 생명 1로 생존 + 치유')); break;
      case 'regen': t.push(tag(`턴 시작 시 치유 ${c.hv ? c.hv[q] + '%' : ''}`)); break;
      case 'critHeal': t.push(tag('치명타 대미지 시 치유')); break;
      case 'atkUpShielded': t.push(tag(`실드 보유 시 공격력 +${pc(f[1])}`)); break;
      case 'spdKill': t.push(tag(`처치마다 속도 +${pc(f[1])} (최대 4)`)); break;
      case 'critStack': t.push(tag(`${EL[f[1]].ko} 원소 전투 스킬마다 치명타율 +${pc(f[2])} (최대 8)`)); break;
      case 'defIgnore': t.push(tag(`방어력 무시 ${pc(f[1])}`)); break;
      case 'rapidCast': t.push(tag('전투 시작 전 쿨다운 1턴 감소')); break;
      case 'ironFort': t.push(tag(`전투 시작 전 아군 방어력 +${pc(f[1])}(내 방어력 기준)`)); break;
      case 'aura': t.push(tag('2칸 내에서 턴을 마친 적에게 물 원소 대미지')); break;
      case 'killSplash': t.push(tag(`처치 시 주변 ${EL[f[1]].ko} 대미지`)); break;
      case 'omen': t.push(tag('턴 시작 시 5칸 내 적 50% 취약')); break;
      case 'thunder': t.push(tag('적이 전투 스킬 사용 시 50% 낙뢰')); break;
      case 'mark10': t.push(tag('10회 타격마다 추가 물리 대미지')); break;
      case 'reflect': t.push(tag('실드 보유 중 받은 대미지 반사')); break;
    }
  }
  return t.join('');
}
const SUP_KO = { proc: '대미지 전투 스킬 사용 시 추가 공격', shieldLoss: '생명 15% 잃을 때마다 실드(최대 5회)', shield3: '3턴마다 실드', healLow: '턴 시작 시 생명 80% 미만이면 치유', endTurn: '턴 종료 시 가장 가까운 적 공격', atkSpd: '공격력·속도 증가', inkBurst: '전투 시작 전 쿨다운 1턴 감소 · 대미지 보너스', cloud: '시작 3턴 받는 대미지 감소 · 막기율 증가', none: '⚠ 지원 스킬 시뮬 미반영' };

/* ───────── team rendering ───────── */
const RANK_OPTS = RANKS.map((r, i) => `<option value="${i + 1}">${r}</option>`).join('');
const CLS_OPTS = [1, 2, 3, 4, 5].map((t) => `<optgroup label="${t === 1 ? '기본 직업' : t + '차 전직'}">` + CLASSES.filter((c) => c.tier === t).map((c) => `<option value="${c.key}">${c.ko} (${c.en})</option>`).join('') + '</optgroup>').join('');
const mobOpt = (x) => `<option value="${x.k}">${x.ty ? '[' + TYPE_KO[x.ty] + '] ' : ''}${x.ko} · ${x.en}</option>`;
const MOB_OPTS = MAPS.map((m) => `<optgroup label="등반 · ${m.ko}">` + ALL_MOBS.filter((x) => x.map === m.id).map(mobOpt).join('') + '</optgroup>').join('')
  + [['1', '일일 던전'], ['2', '길드 토벌 보스'], ['3', '신수 시련 (히에로몬)']].map(([v, ko]) => `<optgroup label="${ko}">` + ALL_MOBS.filter((x) => !x.map && x.k.endsWith('|' + v)).map(mobOpt).join('') + '</optgroup>').join('');
const PET_OPTS = '<option value="">없음</option>' + PETS.map((p) => `<option value="${p.id}">${p.ok ? `${p.ko} · ${p.en}` : `${p.en} (${p.ko}?)`} · ${p.role}</option>`).join('');
const fld = (label, f, val, extra = '', cls = '') => `<label class="f ${cls}"><span>${label}</span><input type="number" data-f="${f}" value="${val}" ${extra}></label>`;
const heroMini = (u) => `<span>공 ${fmt(u.atk)}</span><span>방 ${fmt(u.def)}</span><span>생 ${fmt(u.hp)}</span><span>속 ${fmt(u.spd)}</span>`;

function skillBlock(u, i) {
  const sl = u.skills[i]; let body = '', btn;
  if (sl && sl.custom) {
    const c = sl.custom;
    btn = `${iconHtml(0, c.el, '✎')}<span class="nm"><b>직접 입력 전투 스킬</b><small>계수·쿨다운을 직접 지정</small></span>`;
    body = `<div class="custom">
      <label class="f"><span>속성</span><select data-cf="el" data-i="${i}">${Object.entries(EL).filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}" ${c.el === k ? 'selected' : ''}>${v.ko}</option>`).join('')}</select></label>
      <label class="f"><span>계수 %</span><input type="number" data-cf="coef" data-i="${i}" value="${c.coef}"></label>
      <label class="f"><span>고정 대미지</span><input type="number" data-cf="flat" data-i="${i}" value="${c.flat}"></label>
      <label class="f"><span>타수</span><input type="number" data-cf="hits" data-i="${i}" value="${c.hits}" min="1"></label>
      <label class="f"><span>쿨다운(턴)</span><input type="number" data-cf="cd" data-i="${i}" value="${c.cd}" min="0"></label>
      <label class="f"><span>범위(칸)</span><input type="number" data-cf="range" data-i="${i}" value="${c.range}" min="1"></label>
      <label class="f"><span>대상</span><select data-cf="targets" data-i="${i}"><option value="1" ${c.targets == 1 ? 'selected' : ''}>적 1명</option><option value="3" ${c.targets == 3 ? 'selected' : ''}>주변 1칸 모든 적</option><option value="6" ${c.targets == 6 ? 'selected' : ''}>주변 2칸 모든 적</option></select></label>
    </div>`;
  } else if (sl) {
    const s = SK.get(sl.id), n = skillNumbers(sl.id, sl.rank, u.level);
    btn = `${iconHtml(s.id, s.el, glyphOf(s))}<span class="nm"><b>${esc(s.ko)}</b><small>${CLS.get(s.cls).ko} · ${esc(s.en)}</small></span>`;
    body = `<div class="sum">${skillTags(s, n, i + 1)}</div>${s.desc ? `<div class="desc">${esc(s.desc)}</div>` : ''}${s.note ? `<div class="note">※ ${esc(s.note)}</div>` : ''}`;
  } else btn = `${iconHtml(0, 'none', '＋')}<span class="nm"><b style="color:var(--muted)">비어 있음</b><small>눌러서 전투 스킬 선택</small></span>`;
  return `<div class="skill"><div class="slot-row">
    <div class="ord"><button class="mv" data-act="up" data-i="${i}" title="위로" ${i === 0 ? 'disabled' : ''}>▲</button><i>${i + 1}</i><button class="mv" data-act="down" data-i="${i}" title="아래로" ${i === 3 ? 'disabled' : ''}>▼</button></div>
    <button class="pick" data-act="pick" data-kind="sk" data-i="${i}">${btn}</button>
    <select data-rk="${i}" data-val="${sl && !sl.custom ? sl.rank : 3}" ${!sl || sl.custom ? 'disabled' : ''} title="스킬 품질">${RANK_OPTS}</select></div>${body}</div>`;
}
function charmBlock(u, i) {
  const sl = u.charms[i], c = sl ? CHARM.get(sl.id) : null;
  const btn = c ? `${iconHtml(c.id, 'none', '◈')}<span class="nm"><b>${esc(c.ko)}</b><small>${CLS.get(c.cls).ko} · ${esc(c.en)}</small></span>` : `${iconHtml(0, 'none', '＋')}<span class="nm"><b style="color:var(--muted)">비어 있음</b><small>눌러서 비법 선택</small></span>`;
  return `<div class="skill"><div class="slot-row charm">
    <button class="pick" data-act="pick" data-kind="ch" data-i="${i}">${btn}</button>
    <select data-crk="${i}" data-val="${sl ? sl.rank : 3}" ${sl ? '' : 'disabled'} title="비법 품질">${RANK_OPTS}</select></div>${c ? `<div class="sum">${charmTags(c, sl.rank)}</div>${c.desc ? `<div class="desc">${esc(c.desc)}</div>` : ''}` : ''}</div>`;
}
function petBlock(u) {
  const pt = u.pet, p = pt ? PET.get(pt.id) : null;
  let body = '';
  if (p) {
    const sp = p.sup, q = Math.min(5, [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4][Math.min(22, pt.rank - 1)] ?? 5);
    body = `<div class="grid2"><label class="f"><span>지원 스킬 품질</span><select data-pf="rank" data-val="${pt.rank}">${RANK_OPTS}</select></label>
        <label class="f chk"><span>성년 (실체화해 함께 전투)</span><input type="checkbox" data-pf="adult" ${pt.adult ? 'checked' : ''} ${p.mat ? '' : 'disabled'}></label></div>
      <div class="grid4"><label class="f atk"><span>판타몬 공격</span><input type="number" data-pf="atk" value="${pt.atk}"></label><label class="f def"><span>방어</span><input type="number" data-pf="def" value="${pt.def}"></label><label class="f hp"><span>생명</span><input type="number" data-pf="hp" value="${pt.hp}"></label><label class="f spd"><span>속도</span><input type="number" data-pf="spd" value="${pt.spd}"></label></div>
      <div class="sum" style="margin-left:0"><b style="margin-right:4px">지원: ${esc(sp.en)}</b><span class="tag el" style="background:${(EL[sp.el] || EL.none).c}">${(EL[sp.el] || EL.none).ko}</span>${tag(SUP_KO[sp.k] || sp.k, sp.k === 'none' ? 'warn' : '')}${sp.c ? tag(`${sp.c[q]}%${sp.ar ? ' · 주변 ' + sp.ar + '칸' : ''}`) : ''}${sp.lim ? tag('턴당 1회') : ''}</div>
      ${pt.adult && p.mat ? `<div class="note" style="margin-left:0">실체화: 에너지 ${p.mat.init}/${p.mat.cap}에서 시작, 턴당 +50 · 피격당 +6 → 가득 차면 실체화해 아래 스킬을 순서대로 사용</div>` + p.skills.map((s, i) => `<div class="sum" style="margin-left:0"><b style="margin-right:4px">${i + 1}. ${esc(s.en)}</b>${skillTags({ ...s, cd: s.cd || 0 }, s.kind === 'heal' ? { healPct: s.hv[q] / 100, healFlat: 0 } : { coef: s.c[q] / 100, flat: 0 }, i + 1)}</div>`).join('') : ''}`;
  }
  return `<div class="petbox"><div class="pet-row">${p ? `<canvas class="ava mob" width="96" height="96" data-pet="${p.id}"></canvas>` : ''}<label class="f" style="flex:1"><span>판타몬</span><select data-pf="id" data-val="${pt ? pt.id : ''}">${PET_OPTS}</select></label>${p ? '<button class="btn" data-act="petBase" title="캐릭터 능력치 × 판타몬 기본 비율로 채웁니다">비율로 채우기</button>' : ''}</div>${body}</div>`;
}
function heroHtml(u) {
  const c = CLS.get(u.cls), open = openSet.has(u.uid), pet = u.pet ? PET.get(u.pet.id) : null;
  return `<article class="unit hero ${open ? 'open' : ''}" data-uid="${u.uid}">
    <div class="unit-head" data-act="toggle">
      <canvas class="ava" width="150" height="180" data-ava="${u.uid}"></canvas>
      <div class="unit-title"><b>${esc(u.name)}</b><div class="sub">${c.ko} · Lv.${u.level}${pet ? ' · 🐾 ' + pet.ko : ''}</div><div class="mini" data-mini>${heroMini(u)}</div></div>
      <div class="unit-btns"><button class="icon" data-act="dup" title="복제">⧉</button><button class="icon" data-act="del" title="삭제">✕</button></div>
    </div>
    <div class="unit-body">
      <div class="grid2">
        <label class="f"><span>이름</span><input type="text" data-f="name" value="${esc(u.name)}" maxlength="20"></label>
        <label class="f"><span>직업</span><select data-f="cls" data-val="${u.cls}">${CLS_OPTS}</select></label>
      </div>
      <div class="lvrow" style="margin-top:8px">${fld('레벨', 'level', u.level, `min="1" max="${MAXLV}"`)}<button class="btn" data-act="base" title="해당 레벨의 장비 제외 기본 능력치로 채웁니다">레벨 기본값 채우기</button></div>
      <div class="grid4">${fld('공격', 'atk', u.atk, 'min="1"', 'big atk')}${fld('방어', 'def', u.def, 'min="0"', 'big def')}${fld('생명', 'hp', u.hp, 'min="1"', 'big hp')}${fld('속도', 'spd', u.spd, 'min="1"', 'big spd')}</div>
      <div class="sec"><span>전투 스킬 · 위에서부터 순서대로 사용</span><span class="hint">품질</span></div>
      ${[0, 1, 2, 3].map((i) => skillBlock(u, i)).join('')}
      <div class="sec"><span>비법 (패시브 4칸)</span><span class="hint">품질</span></div>
      ${[0, 1, 2, 3].map((i) => charmBlock(u, i)).join('')}
      <div class="sec"><span>판타몬</span></div>
      ${petBlock(u)}
      <details class="adv" ${Object.keys(u.adv).length ? 'open' : ''}><summary>고급 스탯 (비우면 기본값)</summary>
        <div class="grid3">${ADV.map(([k, label]) => `<label class="f"><span>${label}</span><input type="number" data-adv="${k}" value="${u.adv[k] ?? ''}" placeholder="${HERO_DEFAULTS[k]}"></label>`).join('')}</div>
      </details>
    </div></article>`;
}
const mobFixed = (u) => !!u.fix || !!MOB.get(u.key).fixed;
const mobSt = (u) => (u.fix ? stFrom(u.fix, u.level) : mobStats(u.key, u.level, u.sr)) || { hp: 0, atk: 0, def: 0, spd: 0, critDmg: 0, blockEff: 0 };
function mobHtml(u) {
  const mob = MOB.get(u.key), st = mobSt(u), open = openSet.has(u.uid), fixed = mobFixed(u);
  const sk = mob.sk.map((s) => `<div class="skill"><div class="mobsk">${MOBSKILL_ICON(s)}<div><b>${esc(s.en)}</b><div class="sum" style="margin:3px 0 0">${skillTags({ ...s, kind: 'dmg', cd: 0 }, null)}</div></div></div></div>`).join('');
  const pvs = (mob.pv || []).map((id) => MOB_PV[id]).filter(Boolean);
  const pvBadge = (p) => (p.k === 'none' ? tag(`⚠ 미반영 · ${p.why || '효과 비공개'}`, 'warn') : p.est ? (state.pvEst !== false ? tag('추정 수치로 반영', 'est') : tag('추정값 꺼짐 · 미반영', 'warn')) : tag('반영', 'ok'));
  const pvHtml = pvs.length ? `<div class="sec"><span>비전 (패시브 ${pvs.length})</span></div>` + pvs.map((p) => `<div class="skill"><div class="mobsk">${p.i ? MOBSKILL_ICON({ ic: p.i, el: p.el || 'none' }) : '<span class="ico mob"><em>✦</em></span>'}<div><b>${esc(p.ko)}</b> <small class="en">${esc(p.en)}</small><div class="desc" style="margin-top:2px">${esc(p.d)}</div><div class="sum" style="margin:4px 0 0">${pvBadge(p)}</div></div></div></div>`).join('') : '';
  const er = mob.er ? Object.entries(mob.er).map(([k, v]) => `받는 ${EL[k].ko} 대미지 ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`).join(' · ') : '';
  return `<article class="unit mob ${open ? 'open' : ''}" data-uid="${u.uid}">
    <div class="unit-head" data-act="toggle">
      <canvas class="ava mob" width="128" height="128" data-ava="${u.uid}"></canvas>
      <div class="unit-title"><b>${esc(mob.ko)} <span style="color:var(--accent)">×${u.count}</span></b><div class="sub">${TYPE_KO[mob.ty]} · Lv.${u.level} · ${mobHome(mob)}</div><div class="mini"><span>공 ${fmt(st.atk)}</span><span>방 ${fmt(st.def)}</span><span>생 ${fmt(st.hp)}</span><span>속 ${fmt(st.spd)}</span></div></div>
      <div class="unit-btns"><button class="icon" data-act="dup" title="복제">⧉</button><button class="icon" data-act="del" title="삭제">✕</button></div>
    </div>
    <div class="unit-body">
      <label class="f" style="margin-top:8px"><span>몹 선택</span><select data-f="key" data-val="${u.key}">${MOB_OPTS}</select></label>
      <div class="grid2">${fld('레벨', 'level', u.level, `min="1" max="2000" step="0.1" ${fixed ? 'readonly title="층·단계에 고정된 능력치입니다. 다른 층은 전투 불러오기에서 고르세요."' : ''}`)}${fld('수량', 'count', u.count, 'min="1" max="20"')}</div>
      ${fixed ? '<div class="note" style="margin:6px 0 0">층·단계 기준 고정 능력치 (게임 자료로 계산)</div>' : ''}
      ${u.uws ? '<div class="note" style="margin:4px 0 0">길드 토벌 보스 효과 United We Stand: 처음 3턴 동안 받는 대미지 99% 감소</div>' : ''}
      <div class="mobstats"><span>치명타 대미지 ${st.critDmg}%</span><span>막기 대미지 저항 ${st.blockEff}%</span>${st.critRate ? `<span>치명타율 ${st.critRate}%</span>` : ''}${st.blockRate ? `<span>막기율 ${st.blockRate}%</span>` : ''}${st.dmgRes ? `<span>대미지 저항 ${st.dmgRes}%</span>` : ''}${er ? `<span>${er}</span>` : ''}</div>
      <div class="sec"><span>스킬 (턴당 1개 · 계수 ${state.mobCoef}% 가정)</span></div>${sk}${pvHtml}
    </div></article>`;
}
function presetHtml() {
  const p = state.preset, mode = encMode(p.mode), grp = encGroup(mode, p.group), n = Math.max(1, Math.min(grp.n, p.n || 1));
  let fights = ''; for (let i = 1; i <= grp.n; i++) fights += `<option value="${i}" ${i === n ? 'selected' : ''}>${esc(grp.label(i))}</option>`;
  return `<div class="preset"><b>전투 불러오기 · 등반 / 일일 던전 / 길드 토벌 / 신수</b>
    <select id="pMode">${CATALOG.map((m) => `<option value="${m.id}" ${m.id === mode.id ? 'selected' : ''}>${MODE_KO[m.id]}</option>`).join('')}</select>
    <select id="pGroup">${mode.groups.map((g) => `<option value="${g.id}" ${g.id === grp.id ? 'selected' : ''}>${esc(g.ko)}</option>`).join('')}</select>
    <select id="pFight">${fights}</select>
    <button class="btn" data-act="loadEnc">불러오기</button></div>`;
}
function renderTeam(ti) {
  const el = ti ? $('#teamB') : $('#teamA'), team = state.teams[ti];
  el.innerHTML = `<div class="team-head"><h2><i></i>${ti ? '상대 팀' : '아군 팀'}</h2><span>${countUnits(team)}명</span></div>
    <div class="addrow"><button class="btn" data-act="addHero">+ 캐릭터</button><button class="btn" data-act="addMob">+ 몹</button><button class="btn" data-act="clear">비우기</button></div>
    ${ti === 1 ? presetHtml() : ''}
    ${team.length ? team.map((u) => (u.kind === 'mob' ? mobHtml(u) : heroHtml(u))).join('') : '<div class="empty">아직 아무도 없습니다.<br>캐릭터나 몹을 추가하세요.</div>'}`;
  hydrate(el);
}
function hydrate(root) { $$('select[data-val]', root).forEach((s) => { s.value = s.dataset.val; }); drawAvatars(root); }
function findUnit(uidv) { for (let ti = 0; ti < 2; ti++) { const i = state.teams[ti].findIndex((u) => u.uid === uidv); if (i >= 0) return { ti, i, u: state.teams[ti][i] }; } return null; }
function rerenderUnit(card, u) { const tmp = document.createElement('div'); tmp.innerHTML = u.kind === 'mob' ? mobHtml(u) : heroHtml(u); const n = tmp.firstElementChild; card.replaceWith(n); hydrate(n); return n; }
function drawAvatars(root = document) {
  const t = performance.now() / 1000;
  $$('canvas[data-ava]', root).forEach((cv) => { const f = findUnit(cv.dataset.ava); if (f) renderAvatar(cv, f.u, f.u.kind === 'mob' ? MOB.get(f.u.key) : null, t); });
  $$('canvas[data-pet]', root).forEach((cv) => renderAvatar(cv, { kind: 'pet' }, PET.get(+cv.dataset.pet)));
}
setInterval(() => { if (document.hidden) return; const t = performance.now() / 1000; $$('.unit.hero canvas[data-ava]').forEach((cv) => { const f = findUnit(cv.dataset.ava); if (f) renderAvatar(cv, f.u, null, t); }); }, 90);
window.addEventListener('sxs-art', () => drawAvatars());

/* ───────── picker (skills & charms, with icons) ───────── */
const picker = { uid: null, kind: 'sk', i: 0, cls: 'line', q: '' };
function openPicker(u, kind, i) {
  Object.assign(picker, { uid: u.uid, kind, i, cls: 'line', q: '' });
  $('#pkTitle').textContent = kind === 'sk' ? `전투 스킬 선택 · ${i + 1}번 칸` : `비법 선택 · ${i + 1}번 칸`;
  $('#pkSearch').value = '';
  const chain = lineChain(u.cls).map((c) => c.key);
  $('#pkCls').innerHTML = `<button data-c="line" class="on">내 계열</button><button data-c="all">전체</button>` + CLASSES.map((c) => `<button data-c="${c.key}" class="${chain.includes(c.key) ? 'mine' : ''}">${c.ko}</button>`).join('');
  renderPicker(); $('#picker').hidden = false; $('#pkSearch').focus({ preventScroll: true });
}
function renderPicker() {
  const f = findUnit(picker.uid); if (!f) return; const u = f.u;
  const chain = lineChain(u.cls).map((c) => c.key), q = picker.q.trim().toLowerCase();
  const pool = (picker.kind === 'sk' ? SKILLS : CHARMS).filter((s) => (picker.cls === 'all' ? true : picker.cls === 'line' ? chain.includes(s.cls) : s.cls === picker.cls) && (!q || s.ko.toLowerCase().includes(q) || s.en.toLowerCase().includes(q)));
  const cur = picker.kind === 'sk' ? u.skills[picker.i] : u.charms[picker.i];
  const tile = (id, icon, name, sub, tags, on, warn, desc) => `<button class="tile ${on ? 'on' : ''} ${warn ? 'dim' : ''}" data-id="${id}"${desc ? ` title="${esc(desc)}"` : ''}>${icon}<span class="nm"><b>${name}</b><small>${sub}</small>${desc ? `<span class="tdesc">${esc(desc)}</span>` : ''}<span class="tl">${tags}</span></span></button>`;
  let h = tile('', iconHtml(0, 'none', '∅'), '비우기', '이 칸을 비웁니다', '', !cur, false);
  if (picker.kind === 'sk') h += tile('custom', iconHtml(0, 'phy', '✎'), '직접 입력', '계수·고정 대미지·쿨다운을 직접 지정', '', cur && cur.custom, false);
  for (const s of pool) {
    const c = CLS.get(s.cls);
    if (picker.kind === 'sk') h += tile(s.id, iconHtml(s.id, s.el, glyphOf(s)), esc(s.ko), `${c.ko} · ${esc(s.en)}`, skillTags(s, skillNumbers(s.id, (cur && cur.rank) || 3, u.level)), cur && cur.id === s.id, s.kind === 'none', s.desc);
    else h += tile(s.id, iconHtml(s.id, 'none', '◈'), esc(s.ko), `${c.ko} · ${esc(s.en)}`, charmTags(s, (cur && cur.rank) || 3), cur && cur.id === s.id, !s.fx, s.desc);
  }
  $('#pkGrid').innerHTML = h + (pool.length ? '' : '<div class="empty" style="grid-column:1/-1">검색 결과가 없습니다.</div>');
}
$('#pkGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.tile'); if (!b) return; const f = findUnit(picker.uid); if (!f) return; const u = f.u, v = b.dataset.id, arr = picker.kind === 'sk' ? u.skills : u.charms, old = arr[picker.i];
  arr[picker.i] = v === '' ? null : v === 'custom' ? { custom: { el: 'phy', coef: 100, flat: 0, hits: 1, cd: 0, range: 1, targets: 1 } } : { id: +v, rank: (old && old.rank) || 3 };
  $('#picker').hidden = true;
  const card = $(`.unit[data-uid="${u.uid}"]`); if (card) rerenderUnit(card, u); touch();
});
$('#pkCls').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; picker.cls = b.dataset.c; $$('#pkCls button').forEach((x) => x.classList.toggle('on', x === b)); renderPicker(); });
$('#pkSearch').addEventListener('input', (e) => { picker.q = e.target.value; if (picker.q && picker.cls === 'line') { picker.cls = 'all'; $$('#pkCls button').forEach((x) => x.classList.toggle('on', x.dataset.c === 'all')); } renderPicker(); });
$('#pkClose').addEventListener('click', () => { $('#picker').hidden = true; });
$('#picker').addEventListener('click', (e) => { if (e.target.id === 'picker') $('#picker').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#picker').hidden = true; });

/* ───────── team events ───────── */
function onTeamClick(ti, e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act, team = state.teams[ti], card = e.target.closest('.unit'), f = card ? findUnit(card.dataset.uid) : null;
  if (act === 'toggle') { if (e.target.closest('.unit-btns')) return; card.classList.toggle('open'); if (card.classList.contains('open')) openSet.add(card.dataset.uid); else openSet.delete(card.dataset.uid); return; }
  if (act === 'pick' && f) { openPicker(f.u, btn.dataset.kind, +btn.dataset.i); return; }
  if ((act === 'up' || act === 'down') && f) { const i = +btn.dataset.i, j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j > 3) return; const s = f.u.skills; [s[i], s[j]] = [s[j], s[i]]; rerenderUnit(card, f.u); touch(); return; }
  if (act === 'base' && f) { Object.assign(f.u, heroBase(f.u.level)); rerenderUnit(card, f.u); touch(); return; }
  if (act === 'petBase' && f && f.u.pet) { const keep = f.u.pet; f.u.pet = { ...petDefaults(f.u, keep.id), rank: keep.rank, adult: keep.adult }; rerenderUnit(card, f.u); touch(); return; }
  if (act === 'addHero') { if (countUnits(team) >= MAX_UNITS) return toast('한 팀은 최대 ' + MAX_UNITS + '명입니다'); const ref = state.teams[0].find((u) => u.kind === 'hero'); const h = newHero(ti ? 'Doushi' : 'Shushi', ref ? ref.level : 40, ti ? '상대 ' + (team.filter((u) => u.kind === 'hero').length + 1) : '동료 ' + team.filter((u) => u.kind === 'hero').length); team.push(h); openSet.add(h.uid); }
  else if (act === 'addMob') { if (countUnits(team) >= MAX_UNITS) return toast('한 팀은 최대 ' + MAX_UNITS + '명입니다'); const last = [...team].reverse().find((u) => u.kind === 'mob'); const m = MAPS[0]; const u = last ? { uid: uid(), kind: 'mob', key: last.key, level: last.level, sr: last.sr, count: 1, ...(last.fix ? { fix: last.fix } : {}), ...(last.uws ? { uws: 1 } : {}) } : { uid: uid(), kind: 'mob', key: m.floors[0][1], level: m.floors[0][0], count: 1 }; team.push(u); openSet.add(u.uid); }
  else if (act === 'clear') team.length = 0;
  else if (act === 'del' && f) { team.splice(f.i, 1); openSet.delete(f.u.uid); }
  else if (act === 'dup' && f) { if (countUnits(team) + (f.u.kind === 'mob' ? f.u.count : 1) > MAX_UNITS) return toast('한 팀은 최대 ' + MAX_UNITS + '명입니다'); const c = JSON.parse(JSON.stringify(f.u)); c.uid = uid(); if (c.kind === 'hero') c.name = (c.name + ' 2').slice(0, 20); team.splice(f.i + 1, 0, c); }
  else if (act === 'loadEnc') {
    const mode = encMode($('#pMode').value), grp = encGroup(mode, $('#pGroup').value), n = Math.max(1, Math.min(grp.n, +$('#pFight').value || 1));
    state.preset = { mode: mode.id, group: grp.id, n }; state.teams[1] = grp.units(n);
    if (state.mode !== 'pve') setMode('pve', true);
    toast(`${grp.ko} · ${grp.label(n)}`);
    if (mode.id === 'crucible' && state.roundCap.pve !== 10) { state.roundCap.pve = 10; toast('신수 시련은 10턴 제한이라 라운드 제한을 10으로 맞췄습니다'); }
    if (mode.id === 'conquest' || mode.id === 'crucible') setTimeout(() => toast('대미지 경쟁 전투입니다 — 결과의 「아군 평균 총 대미지」를 보세요'), 2300);
  } else return;
  renderTeam(ti); syncSettings(); touch();
}
function onTeamInput(ti, e, commit) {
  const t = e.target, card = t.closest('.unit');
  if (t.id === 'pMode' && commit) { const m = encMode(t.value); state.preset = { mode: m.id, group: m.groups[0].id, n: 1 }; renderTeam(1); touch(true); return; }
  if (t.id === 'pGroup' && commit) { state.preset.group = t.value; state.preset.n = 1; renderTeam(1); touch(true); return; }
  if (t.id === 'pFight') { state.preset.n = +t.value || 1; touch(true); return; }
  if (!card) return;
  const f = findUnit(card.dataset.uid); if (!f) return; const u = f.u;
  const num = (v, min = 0) => Math.max(min, +v || 0);
  if (t.dataset.f) {
    const k = t.dataset.f;
    if (k === 'name') { u.name = t.value.slice(0, 20) || '캐릭터'; $('.unit-title b', card).textContent = u.name; }
    else if (k === 'cls') { u.cls = t.value; u.skills = defaultSkills(u.cls); rerenderUnit(card, u); }
    else if (k === 'key') {
      u.key = t.value; const mob = MOB.get(u.key); delete u.fix; delete u.uws;
      if (mob.map) { const m = MAP.get(mob.map); delete u.sr; if (u.level < m.lvMin || u.level > m.lvMax + 5) u.level = m.lvMin; }
      else { u.sr = mob.sr; u.level = mob.lv; if (mob.fixed) u.fix = mob.st; if (u.key.endsWith('|2')) u.uws = 1; }
      rerenderUnit(card, u);
    }
    else if (k === 'level') { if (u.kind === 'mob' && mobFixed(u)) return; u.level = u.kind === 'mob' ? Math.max(1, Math.min(380, +t.value || 1)) : Math.max(1, Math.min(MAXLV, Math.round(+t.value || 1))); if (commit) rerenderUnit(card, u); }
    else if (k === 'count') { const others = countUnits(state.teams[f.ti]) - u.count; u.count = Math.max(1, Math.min(20, MAX_UNITS - others, Math.round(+t.value || 1))); if (commit) { const n = rerenderUnit(card, u); $('.team-head span', n.closest('.team')).textContent = countUnits(state.teams[f.ti]) + '명'; } }
    else { u[k] = num(t.value, k === 'def' ? 0 : 1); const mini = $('[data-mini]', card); if (mini) mini.innerHTML = heroMini(u); }
  } else if (t.dataset.adv) { if (t.value === '') delete u.adv[t.dataset.adv]; else u.adv[t.dataset.adv] = +t.value; }
  else if (t.dataset.rk != null && commit) { const i = +t.dataset.rk; if (u.skills[i]) { u.skills[i].rank = +t.value; rerenderUnit(card, u); } }
  else if (t.dataset.crk != null && commit) { const i = +t.dataset.crk; if (u.charms[i]) { u.charms[i].rank = +t.value; rerenderUnit(card, u); } }
  else if (t.dataset.cf) { const sl = u.skills[+t.dataset.i]; if (sl && sl.custom) sl.custom[t.dataset.cf] = t.dataset.cf === 'el' ? t.value : +t.value || 0; }
  else if (t.dataset.pf) {
    const k = t.dataset.pf;
    if (k === 'id') { if (!commit) return; u.pet = t.value ? petDefaults(u, +t.value) : null; rerenderUnit(card, u); }
    else if (!u.pet) return;
    else if (k === 'adult') { u.pet.adult = t.checked; rerenderUnit(card, u); }
    else if (k === 'rank') { if (!commit) return; u.pet.rank = +t.value; rerenderUnit(card, u); }
    else u.pet[k] = num(t.value, k === 'def' ? 0 : 1);
  } else return;
  touch();
}
[0, 1].forEach((ti) => {
  const el = ti ? $('#teamB') : $('#teamA');
  el.addEventListener('click', (e) => onTeamClick(ti, e));
  el.addEventListener('input', (e) => onTeamInput(ti, e, false));
  el.addEventListener('change', (e) => onTeamInput(ti, e, true));
});

/* ───────── settings ───────── */
function syncSettings() {
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  $('#runsSel').value = String(state.runs); $('#capInp').value = state.roundCap[state.mode]; $('#mobCoefInp').value = state.mobCoef; $('#balChk').checked = state.pvpBalance; $('#pvChk').checked = state.pvEst !== false;
  $('#balLabel').hidden = state.mode !== 'pvp';
  const hasMob = state.teams.some((t) => t.some((u) => u.kind === 'mob'));
  $('#mobCoefLabel').hidden = !hasMob;
  $('#pvLabel').hidden = !hasMob || !state.teams.some((t) => t.some((u) => u.kind === 'mob' && (MOB.get(u.key).pv || []).some((id) => MOB_PV[id] && MOB_PV[id].est)));
}
function setMode(mode, keep) {
  if (state.mode === mode) return;
  state.mode = mode;
  if (!keep) {
    const foe = state.teams[1];
    if (mode === 'pvp' && foe.every((u) => u.kind === 'mob')) { const me = state.teams[0].find((u) => u.kind === 'hero'); const h = me ? JSON.parse(JSON.stringify(me)) : newHero('Doushi', 40); h.uid = uid(); h.name = '상대'; state.teams[1] = [h]; toast('대전 모드: 상대를 캐릭터로 바꿨습니다'); }
    else if (mode === 'pve' && !foe.some((u) => u.kind === 'mob')) { const m = encMode(state.preset.mode), g = encGroup(m, state.preset.group); state.teams[1] = g.units(Math.min(g.n, state.preset.n || 1)); toast('몹 전투 모드: 저장된 전투를 불러왔습니다'); }
    renderTeam(1);
  }
  syncSettings(); touch();
}
$('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#runsSel').addEventListener('change', (e) => { state.runs = +e.target.value; touch(true); });
$('#capInp').addEventListener('change', (e) => { state.roundCap[state.mode] = Math.max(1, Math.min(200, Math.round(+e.target.value || 15))); e.target.value = state.roundCap[state.mode]; touch(true); });
$('#mobCoefInp').addEventListener('change', (e) => { state.mobCoef = Math.max(10, Math.min(500, +e.target.value || 100)); e.target.value = state.mobCoef; renderTeam(0); renderTeam(1); touch(true); });
$('#balChk').addEventListener('change', (e) => { state.pvpBalance = e.target.checked; touch(true); });
$('#pvChk').addEventListener('change', (e) => { state.pvEst = e.target.checked; renderTeam(0); renderTeam(1); touch(true); });
$('#resetBtn').addEventListener('click', () => { state = demo(); openSet.clear(); lastRes = null; $('#results').innerHTML = ''; $('#winTag').hidden = true; renderAll(); touch(); toast('예시 구성으로 되돌렸습니다'); });
$('#shareBtn').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '#s=' + b64e(JSON.stringify(state));
  try { await navigator.clipboard.writeText(url); toast('구성 링크를 복사했습니다'); } catch (e) { prompt('아래 링크를 복사하세요', url); }
});
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }

/* ───────── run + results ───────── */
let worker = null, runSeq = 0;
function runMC(setup, n, seed, onProg) {
  return new Promise((resolve, reject) => {
    const id = ++runSeq;
    const fallback = () => setTimeout(() => { try { resolve(monteCarlo(setup, n, seed)); } catch (e) { reject(e); } }, 30);
    try { if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; }
    if (!worker) return fallback();
    worker.onmessage = (e) => { const d = e.data; if (d.id !== id) return; if (d.error) reject(new Error(d.error)); else if (d.done) resolve(d.res); else onProg(d); };
    worker.onerror = () => { worker = null; fallback(); };
    worker.postMessage({ id, setup, n, seed });
  });
}
const pctColor = (p) => (p >= 0.6 ? '#7bc96f' : p <= 0.4 ? '#ff6b5e' : '#ffd24a');
const verdict = (p) => (p >= 0.9 ? '압도적 우세' : p >= 0.65 ? '우세' : p >= 0.45 ? '백중세' : p >= 0.2 ? '열세' : '매우 불리');
async function run() {
  if (running) return;
  const setup = toSetup();
  if (!state.teams[0].length || !state.teams[1].length) return toast('양쪽 팀에 최소 1명씩 필요합니다');
  clearTimeout(rosterT); // a pending roster refresh must not wipe the replay that follows
  running = true; $('#runBtn').disabled = true; stage.stop(); $('#banner').hidden = true;
  try { stage.setRoster(roster(setup)); } catch (e) { /* shown below */ }
  hud();
  const n = state.runs, seed = (Math.random() * 2 ** 31) | 0, t0 = performance.now();
  term.clear(); term.setBig(null);
  term.line(`> /simulate ${state.mode} --runs ${n} --cap ${setup.roundCap}R`, '#f0eee6');
  term.line(`  ⎿ 아군 ${countUnits(state.teams[0])}명 vs 상대 ${countUnits(state.teams[1])}명`, '#9b978b');
  term.setStatus(`Simulating… (0/${fmt(n)})`);
  $('#roundTag').textContent = '시뮬레이션 중…';
  try {
    const res = await runMC(setup, n, seed, (d) => { term.setStatus(`Simulating… (${fmt(d.progress)}/${fmt(n)})`); const p = d.wins[0] / d.progress; term.setBig({ text: (p * 100).toFixed(0) + '%', frac: p, color: pctColor(p), sub: `${fmt(d.progress)}회 진행 중`, label: '승리 확률' }); });
    if (res.invalid) throw new Error('팀 구성이 올바르지 않습니다');
    lastRes = res; lastSetup = setup;
    const p = res.wins[0] / res.n, ci = 1.96 * Math.sqrt((p * (1 - p)) / res.n) * 100, ms = performance.now() - t0;
    term.setStatus(null);
    term.setBig({ text: (p * 100).toFixed(1) + '%', frac: p, color: pctColor(p), sub: `±${ci.toFixed(1)}%p · ${fmt(res.n)}회`, label: '승리 확률' });
    term.line(`● 승률 ${(p * 100).toFixed(1)}% (±${ci.toFixed(1)}%p) — ${verdict(p)}`, pctColor(p));
    term.line(`  ⎿ ${res.wins[0]}승 ${res.wins[1]}패${res.draws ? ' ' + res.draws + '무' : ''} · 평균 ${(res.rounds / res.n).toFixed(1)}R · ${(ms / 1000).toFixed(1)}s`, '#9b978b');
    showResults(res);
    playSample('rep');
  } catch (e) {
    console.error(e); term.setStatus(null); term.line('✗ 오류: ' + e.message, '#ff6b5e'); toast('시뮬레이션 오류: ' + e.message);
  } finally { running = false; $('#runBtn').disabled = false; }
}
$('#runBtn').addEventListener('click', run);

function showResults(res) {
  const p = res.wins[0] / res.n, ci = 1.96 * Math.sqrt((p * (1 - p)) / res.n) * 100, col = pctColor(p), N = res.n;
  const len = Math.PI * 80, tA = res.meta.filter((m) => m.team === 0 && !m.pet).length, tB = res.meta.filter((m) => m.team === 1 && !m.pet).length;
  const rows = [], by = new Map(); let dmgA = 0;
  res.meta.forEach((m, i) => { const key = m.team + '|' + (m.kind === 'mob' ? m.ref : m.id); let r = by.get(key); if (!r) { r = { team: m.team, name: (m.pet ? '🐾 ' : '') + m.name, n: 0, dmg: 0, taken: 0, kills: 0, alive: 0 }; by.set(key, r); rows.push(r); } const a = res.units[i]; r.n++; r.dmg += a.dmg / N; r.taken += a.taken / N; r.kills += a.kills / N; r.alive += a.alive / N; if (m.team === 0) dmgA += a.dmg / N; });
  const maxD = Math.max(1, ...rows.map((r) => r.dmg));
  const winTag = $('#winTag'); winTag.hidden = false; winTag.textContent = (p * 100).toFixed(1) + '%'; winTag.style.color = col; winTag.style.borderColor = col;
  const has = (w) => res.samples.some((s) => s[1] === w);
  $('#results').classList.remove('stale');
  $('#results').innerHTML = `
    <div class="card dial">
      <svg viewBox="0 0 200 116"><path d="M20 106 A80 80 0 0 1 180 106" fill="none" stroke="#34322f" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 106 A80 80 0 0 1 180 106" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(len * p).toFixed(1)} ${len.toFixed(1)}"/></svg>
      <div class="pct" style="color:${col}">${(p * 100).toFixed(1)}<small style="font-size:22px">%</small></div>
      <div class="cap">아군 승리 확률 · 95% 신뢰구간 ±${ci.toFixed(1)}%p</div>
      <div class="verdict" style="color:${col}">${verdict(p)}</div>
      <div class="replay-row" style="justify-content:center">
        <button class="btn" data-replay="rep">대표 전투 다시 보기</button>
        ${has(0) ? '<button class="btn" data-replay="win">승리 사례</button>' : ''}${has(1) ? '<button class="btn" data-replay="lose">패배 사례</button>' : ''}
      </div>
    </div>
    <div class="card">
      <div class="kv">
        <div><b>${fmt(res.wins[0])} / ${fmt(res.wins[1])}${res.draws ? ' / ' + fmt(res.draws) : ''}</b><span>승 / 패${res.draws ? ' / 무' : ''} (${fmt(N)}회)</span></div>
        <div><b>${(res.rounds / N).toFixed(1)} R</b><span>평균 전투 길이</span></div>
        <div><b>${fmt(dmgA)}</b><span>아군 평균 총 대미지</span></div>
        <div><b>${((res.timeouts / N) * 100).toFixed(1)}%</b><span>라운드 제한 초과</span></div>
        <div><b>${(res.alive[0] / N).toFixed(2)} / ${tA}</b><span>아군 평균 생존</span></div>
        <div><b>${(res.alive[1] / N).toFixed(2)} / ${tB}</b><span>상대 평균 생존</span></div>
        <div><b>${((res.hpLeft[0] / N) * 100).toFixed(0)}%</b><span>아군 평균 잔여 생명</span></div>
      </div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>유닛</th><th>평균 가한 대미지</th><th>받은 대미지</th><th>처치</th><th>생존율</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.team ? 'b' : 'a'}"><td><span class="dot"></span>${esc(r.name)}${r.n > 1 ? ' ×' + r.n : ''}</td><td><span class="bar" style="width:${Math.round((r.dmg / maxD) * 90)}px"></span>${fmt(r.dmg)}</td><td>${fmt(r.taken)}</td><td>${r.kills.toFixed(2)}</td><td>${((r.alive / r.n) * 100).toFixed(0)}%</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}
$('#results').addEventListener('click', (e) => { const b = e.target.closest('[data-replay]'); if (b && !running) playSample(b.dataset.replay); });
function playSample(kind) {
  const res = lastRes, setup = lastSetup; if (!res || !res.samples.length) return;
  const maj = res.wins[0] >= res.wins[1] ? 0 : 1, avg = res.rounds / res.n;
  let pool = res.samples.filter((s) => s[1] === (kind === 'win' ? 0 : kind === 'lose' ? 1 : maj)); if (!pool.length) pool = res.samples;
  const pick = kind === 'rep' ? pool.slice().sort((a, b) => Math.abs(a[2] - avg) - Math.abs(b[2] - avg))[0] : pool[Math.floor(Math.random() * pool.length)];
  let r; try { r = replay(setup, pick[0]); } catch (e) { console.error(e); return; }
  $('#banner').hidden = true; $('#roundTag').textContent = '전투 재생';
  term.line(`  ⎿ ${kind === 'win' ? '승리' : kind === 'lose' ? '패배' : '대표'} 전투 재생 (seed ${pick[0]})`, '#d97757');
  stage.play(r.events, r.meta, {
    onRound: (n) => { $('#roundTag').textContent = `라운드 ${n} / ${setup.roundCap}`; },
    onHp: hud,
    onEnd: (ev) => {
      const b = $('#banner'); b.hidden = false; b.className = 'banner' + (ev.w === 0 ? '' : ' lose');
      b.textContent = ev.w === 0 ? '승리!' : ev.w === 1 ? (ev.timeout ? '시간 초과 패배' : '패배…') : '무승부';
      term.line(`✔ 전투 종료 — ${ev.w === 0 ? '아군 승리' : ev.w === 1 ? '상대 승리' : '무승부'} (${ev.r}R${ev.timeout ? ', 시간 초과' : ''})`, ev.w === 0 ? '#7bc96f' : '#ff6b5e'); hud();
      setTimeout(() => { if (!stage.isPlaying()) b.hidden = true; }, 2600);
    },
  });
  hud();
}
$('#speedSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stage.setSpeed(+b.dataset.speed); $$('#speedSeg button').forEach((x) => x.classList.toggle('on', x === b)); });
let paused = false;
$('#pauseBtn').addEventListener('click', (e) => { paused = !paused; stage.setPaused(paused); e.target.textContent = paused ? '계속' : '일시정지'; });
$('#skipBtn').addEventListener('click', () => { stage.skip(); hud(); });
$('#viewBtn').addEventListener('click', () => stage.resetView());
$('#zoomIn').addEventListener('click', () => stage.zoom(0.82));
$('#zoomOut').addEventListener('click', () => stage.zoom(1.22));

/* ───────── boot ───────── */
function renderAll() { renderTeam(0); renderTeam(1); syncSettings(); showRoster(); }
$$('#speedSeg button')[0].classList.add('on');
renderAll();
term.line('> 팀을 구성하고 「승률 계산」을 누르세요', '#9b978b');
loadArt().then(() => { drawAvatars(); if (!running && !stage.isPlaying()) showRoster(); });
if (state.teams[0].length && state.teams[1].length) setTimeout(run, 900);
