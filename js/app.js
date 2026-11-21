// UI: team builder (skills, charms, Fantomon), encounter presets, Monte Carlo runner and results.
import { CLASSES, SKILLS, MAPS, RANKS, MAXLV } from './gamedata.js';
import { SK, MOB, MAP, CLS, heroBase, mobStats, stFrom, skillNumbers, roster, replay, monteCarlo, HERO_DEFAULTS, ALL_MOBS, CHARM, CHARMS, PET, PETS, ENC, MOB_PV, CELL_BOX, W as GW, H as GH, rankGap, rankGroup, statBases, SUBRANKS, prepare, pvpGovernor } from './engine.js';
import { createStage, GROUND_LIST } from './scene.js';
import { ST_KO } from './status.js';
import { loadSheets, designOf, sheet, sheetURL, faceIndex } from './sheets.js';
import { loadToon } from './toon.js';
import { loadGlb } from './glbmodel.js';
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
// advanced stats laid out like the game's Character Stats screen: "%" with the number after its "+" sign beside it,
// plain percents, flat numbers, then affinity and aegis per element
const ADV_PAIRS = [['critRate', '치명타율'], ['critDmg', '치명타 대미지'], ['critRes', '치명타 저항'], ['blockRate', '막기율'], ['blockEff', '막기 대미지 저항'], ['acc', '명중']];
const ADV_PCT = [['dmgBoost', '대미지 보너스'], ['dmgRes', '대미지 저항'], ['healBoost', '치유 보너스'], ['pvpAdd', 'PvP 대미지 보너스'], ['pvpRes', 'PvP 대미지 저항'], ['pveAdd', 'PvE 대미지 보너스'], ['pveRes', 'PvE 대미지 저항']];
const ADV_RAW = [['effHitV', '효과 적중'], ['effResV', '효과 저항'], ['mastery', '원소 마스터리'], ['res', '원소 저항'], ['phyMastery', '물리 마스터리'], ['phyRes', '물리 저항']];
const ADV_EL = [['wind', '바람'], ['water', '물'], ['fire', '불'], ['light', '빛'], ['dark', '어둠']];
const ADV_KEYS = new Set([...ADV_PAIRS.flatMap(([k]) => [k, k + 'V']), ...ADV_PCT.map(([k]) => k), ...ADV_RAW.map(([k]) => k), ...ADV_EL.flatMap(([e]) => ['aff_' + e, 'aeg_' + e]), 'dodge']);
// sub-ranks as the game names them (Korean client)
const SUBRANK_KO = (k) => {
  const g = { Norank: '랭크 없음', Blackiron: '견습', Bronze: '정예', Silver: '숙련', Gold: '챔피언', Saint: '마스터', Legend: '패러곤', Angel: '세인트' }, R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  let m; if (k === 'Norank') return g.Norank;
  if ((m = /^(Godtouched|Demigod)(\d)_(\d)$/.exec(k))) return `${m[1] === 'Godtouched' ? '에테리얼' : '어센던트'} ${R[(+m[2] - 1) * 3 + +m[3] - 1]}`;
  m = /^([A-Za-z]+)(\d)$/.exec(k); return m ? `${g[m[1]] || m[1]} ${R[+m[2] - 1]}` : k;
};
const SUBRANK_OPTS = `<option value="">미지정 (몹과 같은 랭크로 계산)</option>` + SUBRANKS.map((k) => `<option value="${k}">${SUBRANK_KO(k)}</option>`).join('');
const EFF_KO = { abreak: '방어력 감소', weak: '약화', slow: '감속', stun: '스턴', freeze: '빙결', immob: '속박', taunt: '도발', frenzy: '광란', blind: '실명', cold: '냉기', wet: '습윤', dot: '침식', riven: '막기율 감소', sigil: '낙인', vuln: '취약', randDebuff: '랜덤 디버프', kb: '넉백' };
const effName = (e) => (e.k === 'kb' ? `넉백 ${e.n || 1}칸${e.side ? '(옆으로)' : ''}` : (e.k === 'dot' && e.el && e.el !== 'dark' ? (e.el === 'fire' ? '작열' : '지속 대미지') : EFF_KO[e.k] || e.k) + (e.v && ['abreak', 'weak', 'slow'].includes(e.k) ? ` ${e.v >= 0.3 ? 2 : 1}` : ''));
const MODE_KO = { fantasia: '환상계단', dungeon: '일일 던전', conquest: '길드 토벌 (길드 보스 460층)', crucible: '신수 시련', raid: '혼돈 침공 (혼돈의 폭군 레이드)' };

/* ───────── official skill icons (optional, user-supplied): assets/skills/skill_<id>.webp|png ───────── */
// assets/skills/icons.json → { "ext": "webp" | "png" | "" }  (empty = no icon files supplied, built-in tiles are used)
let ICON_EXT = null;
fetch('assets/skills/icons.json').then((r) => (r.ok ? r.json() : {})).then((j) => { ICON_EXT = j && j.ext ? String(j.ext).replace(/[^a-z0-9]/gi, '') : null; if (ICON_EXT) { renderTeam(0); renderTeam(1); } }).catch(() => {});
function glyphOf(s) { if (!s) return '＋'; if (s.kind === 'none') return '⚠'; if (s.kind === 'summon') return '✦'; if (s.kind === 'rune') return '◈'; if (s.kind === 'heal') return '✚'; if (s.kind === 'shield') return '⛨'; if (s.kind === 'buff') return '▲'; const t = s.tg && s.tg.t; return t === 'S' ? '⚔' : t === 'F' ? '➤' : t === 'T' || t === 'TQ' ? '◎' : '✸'; }
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
const mobHome = (mob) => (mob.map ? `환상계단 · ${MAP.get(mob.map).ko}` : { 1: '일일 던전', 2: '길드 토벌', 3: '신수 시련', 5: '혼돈 침공 레이드' }[mob.k.split('|')[1]] || '기타');

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
  return { v: 2, mode: 'pve', runs: 1000, roundCap: { pve: 15, pvp: 100 }, mobCoef: 100, pvpBalance: true, serverDays: 150, pvEst: true, preset: { mode: 'fantasia', group: 'fa1', n: 71 }, teams: [[newHero('Huwei', 40, '나')], floorUnits('fa1', 71)] };
}
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
// setups saved before the monsters' elemental stats were added carry 14-number stat blocks: swap in the current
// block of the same floor / tier (same key and the same HP, ATK, DEF, SPD) so the saved fight gets them too
function upgradeFix(key, fix) {
  const same = (a) => Array.isArray(a) && a.length > 14 && a[0] === fix[0] && a[1] === fix[1] && a[2] === fix[2] && a[3] === fix[3];
  const m = MOB.get(key); if (m && same(m.st)) return m.st;
  for (const md of ENC) for (const g of md.groups) if (g.st) for (let i = 0; i < g.fights.length; i++) { const f = g.fights[i]; for (let j = 1, ui = 0; j < f.length; j += 4, ui++) if (f[j] === key && same(g.st[i] && g.st[i][ui])) return g.st[i][ui]; }
  return fix;
}
// advanced stats saved before they followed the stats screen: one affinity / aegis for every element, Effect Hit /
// RES as a percent (now the screen's flat number)
function migrateAdv(adv, level, rank) {
  const a = {};
  for (const [k, v] of Object.entries(adv)) if (typeof v === 'number' && isFinite(v)) a[k] = v;
  if (a.aff != null) { for (const [e] of ADV_EL) if (a['aff_' + e] == null) a['aff_' + e] = a.aff; delete a.aff; }
  if (a.aegis != null) { for (const [e] of ADV_EL) if (a['aeg_' + e] == null) a['aeg_' + e] = a.aegis; delete a.aegis; }
  const eb = statBases(level, rank).eff;
  if (a.effHit != null) { if (a.effHitV == null) a.effHitV = Math.round((a.effHit / 100) * eb); delete a.effHit; }
  if (a.effRes != null) { if (a.effResV == null) a.effResV = Math.round((a.effRes / 100) * eb); delete a.effRes; }
  for (const k of Object.keys(a)) if (!ADV_KEYS.has(k)) delete a[k];
  return a;
}
function sanitize(s) {
  if (!s || !Array.isArray(s.teams) || s.teams.length !== 2) return null;
  const d = demo();
  const out = { ...d, ...s, v: 2, roundCap: { ...d.roundCap, ...(s.roundCap || {}) }, preset: { ...d.preset, ...(s.preset && s.preset.mode ? s.preset : {}) } };
  out.mode = out.mode === 'pvp' ? 'pvp' : 'pve';
  out.serverDays = Number.isFinite(+s.serverDays) && s.serverDays !== '' && s.serverDays != null ? Math.max(0, Math.min(400, Math.round(+s.serverDays))) : 150;
  delete out.prank; // the old party rank became each character's own rank (moved onto the heroes below)
  // the stone colosseum is the default ground since 2026-11-21; setups saved on the old default forest move to it once
  out.ground = GROUND_LIST.some(([k]) => k === s.ground) && !(s.ground === 'forest' && !s.gv) ? s.ground : 'colosseum'; out.gv = 1;
  const cellOf = (c) => (Array.isArray(c) && c.length === 2 && c.every((v) => Number.isInteger(v)) ? [c[0], c[1]] : undefined);
  const four =(arr, ok) => { const a = (Array.isArray(arr) ? arr : []).slice(0, 4).map((x) => (x && ok(x) ? x : null)); while (a.length < 4) a.push(null); return a; };
  out.teams = s.teams.map((t) => (Array.isArray(t) ? t : []).filter((u) => u && (u.kind === 'mob' ? MOB.has(u.key) : CLS.has(u.cls))).map((u) => {
    if (u.kind === 'mob') {
      const m = { uid: u.uid || uid(), kind: 'mob', key: u.key, level: +u.level || 1, count: Math.max(1, Math.min(20, +u.count || 1)), sr: u.sr || MOB.get(u.key).sr };
      // 22 / 30 numbers carry the monster's skill-DMG reduction pair; older blocks take the current one of the same floor
      if (Array.isArray(u.fix) && [14, 20, 22, 28, 30].includes(u.fix.length) && u.fix.every((x) => typeof x === 'number' && isFinite(x))) m.fix = [22, 30].includes(u.fix.length) ? u.fix : upgradeFix(u.key, u.fix);
      if (u.uws) m.uws = 1;
      if (cellOf(u.cell)) m.cell = cellOf(u.cell);
      return m;
    }
    const pet = u.pet && PET.has(+u.pet.id) ? { id: +u.pet.id, rank: +u.pet.rank || 3, adult: !!u.pet.adult, atk: +u.pet.atk || 1, def: +u.pet.def || 0, hp: +u.pet.hp || 1, spd: +u.pet.spd || 1 } : null;
    const prank = typeof s.prank === 'string' && s.prank ? (/^(Godtouched|Demigod)\d$/.test(s.prank) ? s.prank + '_1' : s.prank === 'Norank' ? 'Norank' : s.prank + '1') : '';
    const rank = SUBRANKS.includes(u.rank) ? u.rank : SUBRANKS.includes(prank) ? prank : '';
    return { uid: u.uid || uid(), kind: 'hero', name: String(u.name || '캐릭터').slice(0, 20), cls: u.cls, level: +u.level || 1, rank, atk: +u.atk || 1, def: +u.def || 0, hp: +u.hp || 1, spd: +u.spd || 1, adv: migrateAdv(u.adv && typeof u.adv === 'object' ? u.adv : {}, +u.level || 1, rank),
      skills: four(u.skills, (x) => x.custom || SK.has(x.id)), charms: four(u.charms, (x) => CHARM.has(x.id)), pet, cell: cellOf(u.cell) };
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
    mode: state.mode, roundCap: state.roundCap[state.mode], pvpBalance: state.pvpBalance, serverDays: state.serverDays, mobCoef: state.mobCoef / 100, pvEst: state.pvEst !== false,
    teams: state.teams.map((t) => t.map((u) => (u.kind === 'mob' ? { kind: 'mob', uid: u.uid, key: u.key, level: u.level, count: u.count, sr: u.sr, fix: u.fix, uws: u.uws, cell: u.cell }
      : { kind: 'hero', uid: u.uid, name: u.name, cls: u.cls, level: u.level, rank: u.rank || '', atk: u.atk, def: u.def, hp: u.hp, spd: u.spd, ...u.adv, skills: u.skills, charms: u.charms, pet: u.pet, cell: u.cell }))),
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
  clearBattle();
}
function hud() { const h = stage.teamHp(); $('#hpA').style.width = (h[0][1] ? (h[0][0] / h[0][1]) * 100 : 0) + '%'; $('#hpB').style.width = (h[1][1] ? (h[1][0] / h[1][1]) * 100 : 0) + '%'; }

/* ───────── skill / charm text ───────── */
function shapeKo(tg) {
  if (!tg) return '';
  switch (tg.t) {
    case 'S': return tg.min ? `${tg.min}~${tg.r}칸 · 적 1명` : `${tg.r}칸 · 적 1명`;
    case 'A': return tg.r >= 99 ? '전장의 모든 적' : `${tg.r}칸 범위 · 모든 적`;
    case 'Q': return `주변 ${tg.r}칸 정사각형`;
    case 'F': return `전방 ${tg.w}x${tg.h}칸`;
    case 'T': return `${tg.r}칸 내 위치 선택 · 주변 ${tg.ar}칸`;
    case 'TQ': return `${tg.r}칸 내 위치 선택 · 주변 ${tg.ar}칸 정사각형`;
    case 'allies': return `${tg.r}칸 범위 · 모든 아군`;
    case 'allyLow': return `${tg.r}칸 · 생명 비율 낮은 아군`;
    case 'owner': return `${tg.r}칸 내 주인`;
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
    if (s.dash) t.push(tag(`직선 ${s.dash}칸 돌진`));
    if (s.retreat) t.push(tag(`${s.retreat.within ? s.retreat.within + '칸 안이면 ' : ''}${s.retreat.n}칸 후퇴`));
    if (s.multi) t.push(tag('대형 대상 칸마다 다단 히트'));
    if (s.bigFirst) t.push(tag('대형 대상 우선'));
    if (s.rep) t.push(tag(`같은 대상 ${s.rep.from > 1 ? s.rep.from + 1 + '번째 타격부터' : '반복 타격'} −${Math.round(s.rep.d * 100)}%`));
    for (const e of s.eff || []) t.push(tag(`${effName(e)} · ${Math.round((e.p == null ? 1 : e.p) * 100)}%`));
    if (s.sp && s.sp.k === 'chain') t.push(tag(`최대 ${s.sp.n}회 연쇄`));
    if (s.sp && s.sp.k === 'bounce') t.push(tag(`최대 ${s.sp.n}회 튕김`));
    if (s.sp && s.sp.k === 'recast') t.push(tag(`${Math.round(s.sp.p * 100)}% 확률 재사용`));
    if (s.sp && s.sp.k === 'killRecast') t.push(tag('처치 시 재사용'));
    if (s.sp && s.sp.k === 'execute') t.push(tag('잃은 생명 비례 최대 +50%'));
  } else if (s.kind === 'summon') {
    // summons from the game data: what appears, for how long, and the share of the caster's stats it inherits
    const sm = s.sum, c = sm.cr, pct = (v) => (n && n.coef != null ? `${(n.coef * 100).toFixed(1)}%${n.flat ? ' + ' + fmt(n.flat) : ''}` : '');
    if (sm.kind === 'trap') t.push(tag(`불꽃요정 ${sm.cells.length}개 설치 · 최대 ${sm.life}턴`), tag(`턴 끝 ${sm.r}칸 내 적에게 폭발 ${pct()}`));
    else if (sm.kind === 'clone') t.push(tag(`${sm.r}칸 내 적 1명과 연결된 분신`), tag(`시전자 턴 ${sm.life}번`), tag('분신이 잃은 생명 → 연결된 적 고정 대미지'));
    else {
      t.push(tag(`${c.ko}${sm.cells.length > 1 ? ' ' + sm.cells.length + '마리' : ''} 소환 · 자기 턴 ${sm.life}번`));
      if (sm.imm) t.push(tag('즉시 행동'));
      if (sm.stealth) t.push(tag('잠행'));
      t.push(tag(`계승 · 생명 ${Math.round(c.add.hp * 100)}% · 공격 ${Math.round(c.add.atk * 100)}% · 방어 ${Math.round(c.add.def * 100)}% · 속도 ${Math.round(c.add.spd * 100)}%`));
      if (c.aura) t.push(tag(`${c.aura.ko} · ${c.aura.r}칸 아군 공격력 +${Math.round(c.aura.atk * 100)}%`));
      for (const k of c.sk || []) t.push(tag(k.kind === 'heal' ? `${k.ko} · 치유 ${(k.hv * 100).toFixed(1)}%` : k.kind === 'advance' ? `${k.ko} · 행동 +${Math.round(k.v * 100)}%` : `${k.ko} · ${+(k.c * 100).toFixed(2)}%`));
    }
    t.push(tag('게임 자료로 반영', 'ok'));
  } else if (s.kind === 'rune') {
    t.push(tag('자신 · 룬 2턴'), tag(`5칸 내 적이 전투 스킬 시전 시 ${n && n.coef != null ? (n.coef * 100).toFixed(1) + '%' + (n.flat ? ' + ' + fmt(n.flat) : '') : ''}`), tag('침식 즉시 1회 발동'));
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
      // 2026-11-21: modelled from the game hooks
      case 'repel': t.push(tag(`적이 ${f[3]}칸 안에 들어오면 ${Math.round(f[1] * 100)}% ${EL[f[2]].ko} 대미지 ${c.c ? c.c[q] + '%' : ''} · ${f[4]}칸 넉백`)); break;
      case 'frostGuard': t.push(tag(`전투 스킬 없이 턴 종료 시 빙봉: 받는 대미지 −${pc(f[1])}, 다음 턴 시작에 치유`)); break;
      case 'burnAura': t.push(tag(`턴 시작 · 이동 시 ${Math.round(f[1] * 100)}% 주변 1칸 작열 바닥`)); break;
      case 'ripple': t.push(tag(`실드가 모두 깨지면 ${f[1]}칸 물 원소 대미지 ${c.c ? c.c[q] + '%' : ''} · 냉기 3중첩`)); break;
      case 'becure': t.push(tag(`잃은 생명 15%당 받는 치유 +${pc(f[1])} (최대 5)`)); break;
      case 'windEcho': t.push(tag(`바람 전투 스킬 3타마다 ${Math.round(f[1] * 100)}% 추가 바람 대미지 · 행동 지연`)); break;
      case 'wildfire': t.push(tag(`불 전투 스킬 시 ${Math.round(f[1] * 100)}% 범위에 작열 바닥`)); break;
      case 'soulImpact': t.push(tag(`소환수가 사라지면 ${f[1]}칸 어둠 원소 대미지 ${c.c ? c.c[q] + '%' : ''}`)); break;
      case 'resurrect': t.push(tag('아군 모험가 사망 시 1회 부활 + 치유')); break;
      case 'sumAtk': t.push(tag(`소환수 공격력 +${pc(f[1])}${f[2] ? ` · 존재 ${f[2]}턴 감소` : ''}`)); break;
      case 'overheal': t.push(tag(`치유 시 ${Math.round(f[1] * 100)}% 대상 주변 1칸 아군 추가 치유`)); break;
      case 'erodeTwice': t.push(tag(`침식 부여 시 ${Math.round(f[1] * 100)}% 침식 1개 추가`)); break;
      case 'shadowVeng': t.push(tag(`첫 치명 대미지에 생명 1로 생존 · 섀도우 형태(면역, 대미지 +${pc(f[1])})`)); break;
      case 'vigil': t.push(tag(`턴 시작 시 생명 비율 낮은 아군의 대미지 50% 대신 받음 (−${pc(f[1])}, 방어력 우위만큼 추가 감소)`)); break;
      case 'ownTurnRed': t.push(tag(`자신의 턴 동안 받는 대미지 −${pc(f[1])}`)); break;
      case 'shatter': t.push(tag(`내가 건 빙결이 풀리면 물 원소 대미지 ${c.c ? c.c[q] + '%' : ''}`)); break;
      case 'overload': t.push(tag(`한 턴에 최대 생명 15% 잃을 때마다 실드 (최대 생명의 ${pc(f[1])})`)); break;
      case 'fieryRejuv': t.push(tag('턴 종료 시 2칸 안 작열 바닥이 있으면 치유 (칸당 +10%, 최대 5)')); break;
      case 'sumPresence': t.push(tag(`소환수가 있으면 공격력 +${pc(f[1])}`)); break;
      case 'soulbond': t.push(tag('소환수가 사라지면 자신 치유')); break;
      case 'mantra': t.push(tag(`턴 시작 시 공격력 가장 높은 아군 대미지 +${pc(f[1])}`)); break;
      case 'darkStar': t.push(tag(`턴 시작 시 무작위 버프 (공격력 · 최대 생명 · 속도 +${pc(f[1])})`)); break;
      case 'counterUp': t.push(tag(`반격 대미지 +${pc(f[1])}`)); break;
      case 'healShift': t.push(tag(`받는 치유 +${pc(f[1])} · 치유를 2턴 실드로 전환 (남으면 생명으로)`)); break;
      case 'holyRestore': t.push(tag(`빛 전투 스킬 ${f[1]}회마다 자신 치유`)); break;
      case 'holyRecup': t.push(tag(`전투 스킬 없이 턴 종료 시 치유 · 다음 턴 대미지 +${Math.round(f[1] * 100)}%`)); break;
      case 'shadowstep': t.push(tag(`한 턴에 생명 10% 잃을 때마다 받는 대미지 −${pc(f[2])} · 속도 +${pc(f[1])} (최대 5)`)); break;
      case 'flamingHeel': t.push(tag(`이동 후 ${f[1]}칸 불 원소 대미지 ${c.c ? c.c[q] + '%' : ''}`)); break;
      case 'zeal': t.push(tag(`전투 스킬마다 투지(공격력) · 6중첩에 홍련의 투지 +${pc(f[1])} 2턴`)); break;
      case 'sumPact': t.push(tag(`소환 시 최대 생명 2% 소모 · 소환수 생명 +${pc(f[1])}`)); break;
      case 'elixir': t.push(tag(`물약 ${f[1]}병(${f[3]}턴마다 +1, 최대 ${f[2]}) · 아군 생명 50% 미만 시 치유`)); break;
    }
  }
  return t.join('');
}
const SUP_KO = { proc: '대미지 전투 스킬 사용 시 추가 공격', shieldLoss: '생명 15% 잃을 때마다 실드(최대 5회)', shield3: '턴마다 방어력 증가 중첩 · 3중첩에 실드', healLow: '턴 시작 시 생명 80% 미만이면 치유', endTurn: '턴 종료 시 가장 가까운 적 공격', atkSpd: '공격력·속도 증가', inkBurst: '전투 시작 전 쿨다운 1턴 감소 · 대미지 보너스', cloud: '시작 3턴 받는 대미지 감소 · 막기율 증가', allyHeal: '아군 대상 전투 스킬 사용 시 아군 1명 치유', ga: '3턴 뒤 잃은 생명 50% 회복 · 봉인 해제(치명타율·명중)', nap: '7턴 뒤 파바(공격력·방어력 증가)', purity: '순수(받는 대미지 감소)', none: '⚠ 지원 스킬 시뮬 미반영' };
/* Fantomon effect tags: value, stacks, chance, duration */
const PET_EFF_KO = { ...EFF_KO, weak: '공격력 감소', delay: '행동 지연', vuln: '취약', dot: '지속 대미지' };
const petEffTag = (e) => tag(`${e.k === 'dot' && e.el === 'fire' ? '작열' : PET_EFF_KO[e.k] || e.k}${e.v && e.k !== 'vuln' ? ' ' + Math.round(e.v * 100) + '%' : ''}${e.max ? ` (최대 ${e.max}중첩)` : ''} · ${Math.round((e.p == null ? 1 : e.p) * 100)}%${e.t ? ' · ' + e.t + '턴' : ''}`);
const petExtraTags = (s) => [
  s.big ? tag(`대형 대상 대미지 +${Math.round(s.big * 100)}%`) : '',
  s.sp && s.sp.k === 'lucky' ? tag(`${Math.round(s.sp.p * 100)}% 확률 ${s.sp.m}배 대미지`) : '',
  s.sp && s.sp.k === 'healChain' ? tag(`최대 ${s.sp.n}회 연쇄 치유`) : '',
  s.rbuff ? tag(`무작위 버프 +${Math.round(s.rbuff * 100)}% · 1턴`) : '',
  s.purity ? tag('순수 부여 (추정)', 'est') : '',
  s.cleanse ? tag(`${Math.round(s.cleanse * 100)}% 디버프 1개 해제`) : '',
  s.zi ? tag('실체화 시 바로 사용') : '',
  s.est ? tag('추정 수치로 반영', 'est') : '',
  ...(s.no || []).map((x) => tag(`⚠ 미반영 · ${x}`, 'warn')),
].join('');
const PET_PV_KO = { killSplash: '처치 시 주변 광역 대미지', dmgRedTaunt: '도발된 적에게서 받는 대미지 감소', healUp: '치유 효과 증가', regenAllies: '턴 시작 시 주변 아군 치유', phantom: '3턴 뒤 소멸 · 쓰러지거나 사라질 때 폭발' };

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
      <div class="petsk"><div class="pnm"><b>지원 · ${esc(sp.ko || sp.en)}</b> <small class="en">${esc(sp.en)}</small></div>
        <div class="sum" style="margin-left:0"><span class="tag el" style="background:${(EL[sp.el] || EL.none).c}">${(EL[sp.el] || EL.none).ko}</span>${tag(SUP_KO[sp.k] || sp.k, sp.k === 'none' ? 'warn' : '')}${sp.c ? tag(`${sp.c[q]}%${sp.ar ? ' · 주변 ' + sp.ar + '칸' : ''}`) : ''}${sp.lim ? tag('턴당 1회') : ''}${((pt.adult && p.mat && sp.effAdult) || sp.eff || []).map(petEffTag).join('')}${sp.dispelBuff ? tag('버프 1개 해제') : ''}${petExtraTags(sp)}</div>
        ${sp.d ? `<div class="desc">${esc(sp.d)}</div>` : ''}</div>
      ${pt.adult && p.mat ? `<div class="note" style="margin-left:0">실체화: 에너지 ${p.mat.init}/${p.mat.cap}에서 시작, 턴당 +50 · 피격당 +6 → 가득 차면 실체화해 아래 스킬을 순서대로 사용 (사라지면 에너지가 다시 찹니다)</div>` + p.skills.map((s, i) => {
        const n = s.kind === 'heal' ? { healPct: s.hv[q] / 100, healFlat: 0 } : s.kind === 'dmg' ? { coef: s.c[q] / 100, flat: 0 } : { bv: s.bv ? s.bv[q] / 100 : 0 };
        const shield = s.kind === 'shield' ? tag(`${s.tg && s.tg.t === 'owner' ? s.tg.r + '칸 내 주인' : '아군'} · 실드 (판타몬 방어력 ${(n.bv * 100).toFixed(1)}%) · ${s.shT || 2}턴`) + tag(s.cd ? `${i + 1}번째 · ${s.cd + 1}턴마다` : `${i + 1}번째 · 매 턴`, 'time') : '';
        const tags = s.kind === 'shield' ? `<span class="tag el" style="background:${EL.none.c}">${EL.none.ko}</span>${shield}` : skillTags({ ...s, eff: undefined, cd: s.cd || 0 }, n, i + 1);
        return `<div class="petsk"><div class="pnm"><b>${i + 1}. ${esc(s.ko || s.en)}</b> <small class="en">${esc(s.en)}</small></div><div class="sum" style="margin-left:0">${tags}${(s.eff || []).map(petEffTag).join('')}${petExtraTags(s)}</div>${s.d ? `<div class="desc">${esc(s.d)}</div>` : ''}</div>`;
      }).join('') + (p.pv || []).map((v) => `<div class="petsk"><div class="pnm"><b>비전 · ${esc(v.ko || v.en)}</b> <small class="en">${esc(v.en)}</small></div><div class="sum" style="margin-left:0">${v.k === 'none' ? tag('⚠ 미반영', 'warn') : tag(PET_PV_KO[v.k] || v.k) + tag('반영', 'ok')}${v.c ? tag(`${v.c[q]}%`) : ''}${(v.eff || []).map(petEffTag).join('')}</div>${v.d ? `<div class="desc">${esc(v.d)}</div>` : ''}</div>`).join('')
      : p.mat ? `<div class="note" style="margin-left:0">성년을 켜면 실체화 스킬 ${p.skills.length}개${p.pv && p.pv.length ? ` · 비전 ${p.pv.length}개` : ''}도 전투에 반영합니다.</div>` : ''}`;
  }
  return `<div class="petbox"><div class="pet-row">${p ? `<canvas class="ava mob" width="96" height="96" data-pet="${p.id}"></canvas>` : ''}<label class="f" style="flex:1"><span>판타몬</span><select data-pf="id" data-val="${pt ? pt.id : ''}">${PET_OPTS}</select></label>${p ? '<button class="btn" data-act="petBase" title="캐릭터 능력치 × 판타몬 기본 비율로 채웁니다">비율로 채우기</button>' : ''}</div>${body}</div>`;
}
/* SD class sheet: turnaround strip in the hero card, expression icon in the battle panel */
const DESIGN_KO = { warrior: '전사', mage: '마법사', knight: '기사', duelist: '투사', sorcerer: '주술사', sage: '현자' };
// direction order as printed on each sheet (only 투사 puts 후측면 before 후면)
const TURN_KO = (d) => (d === 'duelist' ? ['정면', '3/4', '측면', '후측면', '후면'] : ['정면', '3/4', '측면', '후면', '후측면']);
function turnStrip(cls) {
  const d = designOf(cls), m = d && sheet(d); if (!m) return '';
  return `<div class="turn" title="SD 방향 시트 (${DESIGN_KO[d]} 계열)">${m.turn.map((t, i) => `<figure><img src="${sheetURL(d, t.f)}" alt="" loading="lazy"><figcaption>${TURN_KO(d)[i] || ''}</figcaption></figure>`).join('')}</div>`;
}
function faceHtml(d, mood, px = 34) {
  const m = d && sheet(d); if (!m) return '';
  const f = m.faces, i = faceIndex(d, mood), h = Math.round((px * f.ch) / f.cw);
  return `<span class="face" title="${esc(f.labels[i] || '')}" style="width:${px}px;height:${h}px;background-image:url(${sheetURL(d, f.f)});background-size:${px * f.n}px ${h}px;background-position:-${i * px}px 0"></span>`;
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
      ${turnStrip(u.cls)}
      <div class="lvrow" style="margin-top:8px">${fld('레벨', 'level', u.level, `min="1" max="${MAXLV}"`)}<label class="f"><span>랭크</span><select data-f="rank" data-val="${u.rank || ''}" title="능력치 화면의 랭크. 랭크 기준값(치명타율 + 수치 등의 환산)과 몹과의 랭크 차이 보정에 씁니다">${SUBRANK_OPTS}</select></label><button class="btn" data-act="base" title="해당 레벨의 장비 제외 기본 능력치로 채웁니다">레벨 기본값 채우기</button></div>
      <div class="grid4">${fld('공격', 'atk', u.atk, 'min="1"', 'big atk')}${fld('방어', 'def', u.def, 'min="0"', 'big def')}${fld('생명', 'hp', u.hp, 'min="1"', 'big hp')}${fld('속도', 'spd', u.spd, 'min="1"', 'big spd')}</div>
      <div class="sec"><span>전투 스킬 · 위에서부터 순서대로 사용</span><span class="hint">품질</span></div>
      ${[0, 1, 2, 3].map((i) => skillBlock(u, i)).join('')}
      <div class="sec"><span>비법 (패시브 4칸)</span><span class="hint">품질</span></div>
      ${[0, 1, 2, 3].map((i) => charmBlock(u, i)).join('')}
      <div class="sec"><span>판타몬</span></div>
      ${petBlock(u)}
      <details class="adv" ${Object.keys(u.adv).length ? 'open' : ''}><summary>고급 스탯 · 게임 능력치 화면 그대로 (비우면 기본값)</summary>
        <div class="note" style="margin:6px 0">「%」 옆 칸은 능력치 화면에서 + 뒤에 붙는 수치입니다(예: 치명타율 30.5% + 12,000 → 30.5와 12000). 수치는 랭크 기준값으로 %로 바꿔 더합니다.</div>
        <div class="advpairs">${ADV_PAIRS.map(([k, label]) => `<label class="f"><span>${label} %</span><span class="pair"><input type="number" data-adv="${k}" value="${u.adv[k] ?? ''}" placeholder="${HERO_DEFAULTS[k]}"><b>+</b><input type="number" data-adv="${k}V" value="${u.adv[k + 'V'] ?? ''}" placeholder="0"></span></label>`).join('')}</div>
        <div class="grid3">${ADV_PCT.map(([k, label]) => `<label class="f"><span>${label} %</span><input type="number" data-adv="${k}" value="${u.adv[k] ?? ''}" placeholder="0"></label>`).join('')}${ADV_RAW.map(([k, label]) => `<label class="f"><span>${label}</span><input type="number" data-adv="${k}" value="${u.adv[k] ?? ''}" placeholder="0"></label>`).join('')}</div>
        <div class="advel"><span></span>${ADV_EL.map(([, ko]) => `<b>${ko}</b>`).join('')}<span>친화력</span>${ADV_EL.map(([e]) => `<input type="number" data-adv="aff_${e}" value="${u.adv['aff_' + e] ?? ''}" placeholder="0">`).join('')}<span>가호</span>${ADV_EL.map(([e]) => `<input type="number" data-adv="aeg_${e}" value="${u.adv['aeg_' + e] ?? ''}" placeholder="0">`).join('')}</div>
        ${u.adv.dodge ? `<div class="grid3"><label class="f"><span>회피 % (능력치 화면에 없음)</span><input type="number" data-adv="dodge" value="${u.adv.dodge}"></label></div>` : ''}
      </details>
    </div></article>`;
}
const mobFixed = (u) => !!u.fix || !!MOB.get(u.key).fixed;
const mobSt = (u) => (u.fix ? stFrom(u.fix, u.level) : mobStats(u.key, u.level, u.sr)) || { hp: 0, atk: 0, def: 0, spd: 0, critDmg: 0, blockEff: 0 };
function mobHtml(u) {
  const mob = MOB.get(u.key), st = mobSt(u), open = openSet.has(u.uid), fixed = mobFixed(u);
  // raid boss skills carry the game's coefficient (per hit) and cooldown; ordinary mob skills use the assumed coefficient
  // boss kits (game data): coefficient per hit, hit count, knockback / pull / leap, statuses, timing and state
  const kitTags = (s) => {
    const el = EL[s.el] || EL.none, t = [`<span class="tag el" style="background:${el.c}">${el.ko}</span>`];
    if (s.sum) return t.concat(tag('⚠ 소환 · 미반영', 'warn')).join('');
    const dmgH = s.h.filter((h) => h.r == null && h.d !== 0).length + (s.rnd || []).reduce((a, g) => a + g.n, 0);
    if (s.c > 0 && dmgH) t.push(tag(`${dmgH}타`), tag(`타당 ${+(s.c * 100).toFixed(2)}%`)); else t.push(tag('대미지 없음'));
    if (s.rnd) t.push(tag(`무작위 ${s.rnd.map((g) => g.n).join('+')}회${s.rnd.some((g) => g.min) ? ` (최소 ${s.rnd.map((g) => g.min).join('+')})` : ''}`));
    const kb = s.h.filter((h) => h.kb); if (kb.length) t.push(tag(`넉백 ${kb[0].kb}칸${kb.length > 1 ? ` ×${kb.length}` : ''}`));
    if (s.h.some((h) => h.pull)) t.push(tag('끌어당김'));
    if (s.leap) t.push(tag('도약'));
    for (const h of s.h) for (const [k2, p] of h.st || []) t.push(tag(`${EFF_KO[k2] || k2} ${Math.round(p * 100)}%`));
    if (s.ex) t.push(tag('잃은 생명 비례 대미지 +최대 50%'));
    t.push(tag(s.cd ? `${s.cd + 1}행동마다 · 첫 사용 ${s.cd + 1}번째` : '매 행동'));
    if (s.gate) t.push(tag(s.gate.turn != null ? `${s.gate.turn}번째 행동부터` : `생명 ${Math.round(s.gate.hp * 100)}% ${s.gate.le ? '이하' : '이상'}`));
    if (s.state) t.push(tag({ pre: '각성 전', awake: '각성 후(생명 50% 이하)', frost: '서리 상태', blaze: '작열 상태' }[s.state]));
    return t.join('');
  };
  const sk = mob.sk.map((s) => `<div class="skill"><div class="mobsk">${MOBSKILL_ICON(s)}<div><b>${esc(s.ko || s.en)}</b>${s.ko ? ` <small class="en">${esc(s.en)}</small>` : ''}${s.h && s.d ? `<div class="desc" style="margin-top:2px">${esc(s.d)}</div>` : ''}<div class="sum" style="margin:3px 0 0">${s.h ? kitTags(s) : skillTags({ ...s, kind: 'dmg', cd: 0 }, null) + (s.sp && s.sp.k === 'scatter' ? tag(`무작위 ${s.sp.n}회${s.sp.min ? ` (최소 ${s.sp.min})` : ''}`) : '') + (s.rage ? tag('격노 상태 전용') : '')}</div></div></div></div>`).join('');
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
      ${(() => { // PvE rank gap for this monster against the party rank picked in the settings
        const me = state.teams[0].find((h) => h.kind === 'hero' && h.rank);
        if (!me || state.mode === 'pvp') return '';
        const mr = rankGroup(mob.map ? MAP.get(mob.map).sr : u.sr || mob.sr), g = rankGap(rankGroup(me.rank), mr, !!mob.map);
        const f = (x) => (x >= 1 ? '×' : '÷') + (Math.round((x >= 1 ? x : 1 / x) * 100) / 100).toLocaleString('ko-KR');
        return `<div class="note" style="margin:4px 0 0">랭크 차이 보정 (${esc(me.name)} ${SUBRANK_KO(me.rank)}): ${g === 1 ? '같은 랭크 — 보정 없음' : `내 대미지 ${f(g)}, 몹 대미지 ${f(1 / g)}`}</div>`;
      })()}
      <div class="mobstats"><span>치명타 대미지 ${st.critDmg}%</span><span>막기 대미지 저항 ${st.blockEff}%</span>${st.critRate ? `<span>치명타율 ${st.critRate}%</span>` : ''}${st.blockRate ? `<span>막기율 ${st.blockRate}%</span>` : ''}${st.dmgRes ? `<span>대미지 저항 ${st.dmgRes}%</span>` : ''}${er ? `<span>${er}</span>` : ''}${st.ele ? (() => { const e = st.ele, a = Object.values(e.aff), g = Object.values(e.aeg), one = (v) => (v.every((x) => x === v[0]) ? fmt(v[0]) : `${fmt(Math.min(...v))}~${fmt(Math.max(...v))}`); return `${a.some(Boolean) ? `<span>원소 친화력 ${one(a)}</span><span>원소 가호 ${one(g)}</span>` : ''}${e.mast ? `<span>원소·물리 마스터리 ${fmt(e.mast)}</span><span>원소·물리 저항 ${fmt(e.eres)}</span>` : ''}`; })() : ''}</div>
      ${mob.raid ? `<div class="note" style="margin:4px 0 0">레이드 보스 · 몸체 5×5 · 이동력 ${mob.raid.move}칸 · ${mob.raid.rounds}라운드. 섬멸의 발톱(9×3)은 게임 자료에 대미지 계수가 없어 뺐습니다.</div>` : mob.kit ? `<div class="note" style="margin:4px 0 0">몸체 ${mob.sz}×${mob.sz} · 스킬은 게임 자료의 타격 구역을 한 타씩 처리합니다(넉백으로 밀린 대상이 다음 타격 범위에 다시 들어가면 또 맞음). 계수 조정(「몹 스킬 계수」)은 적용되지 않습니다.</div>` : ''}
      <div class="sec"><span>${mob.kit ? '스킬 (게임 자료 · 준비된 스킬을 순서대로 모두 사용)' : `스킬 (턴당 1개 · 계수 ${state.mobCoef}% 가정)`}</span></div>${sk}${pvHtml}
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
    if (mode.id === 'raid' && state.roundCap.pve !== 25) { state.roundCap.pve = 25; toast('혼돈의 폭군 레이드는 25라운드라 라운드 제한을 25로 맞췄습니다. 보스 랭크는 내 랭크와 같은 것을 고르세요'); }
    if (mode.id === 'conquest' || mode.id === 'crucible' || mode.id === 'raid') setTimeout(() => toast('대미지 경쟁 전투입니다 — 결과의 「아군 평균 총 대미지」를 보세요'), 2300);
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
    else if (k === 'rank') { u.rank = SUBRANKS.includes(t.value) ? t.value : ''; if (commit) { rerenderUnit(card, u); renderTeam(1 - f.ti); } }
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
  $('#daysInp').value = state.serverDays; $('#daysLabel').hidden = state.mode !== 'pvp' || !state.pvpBalance;
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
$('#balChk').addEventListener('change', (e) => { state.pvpBalance = e.target.checked; syncSettings(); touch(true); });
$('#daysInp').addEventListener('change', (e) => { const v = Math.round(+e.target.value); state.serverDays = Number.isFinite(v) ? Math.max(0, Math.min(400, v)) : 150; e.target.value = state.serverDays; touch(true); });
$('#pvChk').addEventListener('change', (e) => { state.pvEst = e.target.checked; renderTeam(0); renderTeam(1); touch(true); });
$('#resetBtn').addEventListener('click', () => { state = demo(); openSet.clear(); lastRes = null; $('#results').innerHTML = ''; $('#winTag').hidden = true; renderAll(); touch(); toast('예시 구성으로 되돌렸습니다'); });
$('#shareBtn').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '#s=' + b64e(JSON.stringify(state));
  try { await navigator.clipboard.writeText(url); toast('구성 링크를 복사했습니다'); } catch (e) { prompt('아래 링크를 복사하세요', url); }
});
/* ───────── presets: named setups saved in this browser (export / import as a JSON file) ───────── */
const PKEY = 'sxs-calc-presets';
function loadPresets() { try { const a = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(a) ? a.filter((p) => p && typeof p.name === 'string' && p.state && typeof p.state === 'object') : []; } catch (e) { return []; } }
function storePresets(a) { try { localStorage.setItem(PKEY, JSON.stringify(a)); return true; } catch (e) { toast('브라우저 저장 공간이 부족해 저장하지 못했습니다'); return false; } }
function presetSummary(s) {
  const t = Array.isArray(s.teams) ? s.teams : [[], []];
  const who = (list) => (list || []).map((u) => (u.kind === 'hero' ? (CLS.get(u.cls) || {}).ko || u.cls : `${(MOB.get(u.key) || {}).ko || '몹'}${u.count > 1 ? '×' + u.count : ''}`));
  const a = who(t[0]), b = who(t[1]), cut = (l) => (l.length > 3 ? `${l.slice(0, 3).join(', ')} 외 ${l.length - 3}` : l.join(', '));
  return `${s.mode === 'pvp' ? '대전' : '몹 전투'} · ${cut(a) || '아군 없음'} vs ${cut(b) || '상대 없음'}`;
}
function renderPresets() {
  const list = loadPresets();
  $('#psList').innerHTML = list.length ? list.map((p, i) => `<div class="ps-row"><div class="ps-info"><b>${esc(p.name)}</b><small>${esc(presetSummary(p.state))} · ${new Date(p.at || 0).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</small></div><button class="ghost" data-ps="load" data-i="${i}">불러오기</button><button class="ghost" data-ps="over" data-i="${i}" title="현재 구성으로 덮어쓰기">덮어쓰기</button><button class="ghost" data-ps="del" data-i="${i}">삭제</button></div>`).join('')
    : '<div class="ps-empty">저장된 프리셋이 없습니다. 이름을 적고 「현재 구성 저장」을 누르세요.</div>';
}
const snapshot = () => JSON.parse(JSON.stringify(state));
function applyPreset(p) {
  const s = sanitize(JSON.parse(JSON.stringify(p.state)));
  if (!s) { toast('이 프리셋은 불러올 수 없습니다'); return; }
  state = s; openSet.clear(); lastRes = null; $('#results').innerHTML = ''; $('#winTag').hidden = true;
  renderAll(); touch(); $('#presets').hidden = true; toast(`「${p.name}」을(를) 불러왔습니다`);
}
$('#presetBtn').addEventListener('click', () => { renderPresets(); $('#presets').hidden = false; $('#psName').focus({ preventScroll: true }); });
$('#psClose').addEventListener('click', () => { $('#presets').hidden = true; });
$('#presets').addEventListener('click', (e) => { if (e.target.id === 'presets') $('#presets').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#presets').hidden = true; });
$('#psSave').addEventListener('click', () => {
  const list = loadPresets(), name = ($('#psName').value.trim() || `구성 ${new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}`).slice(0, 40);
  const i = list.findIndex((p) => p.name === name);
  if (i >= 0 && !confirm(`「${name}」 프리셋이 이미 있습니다. 현재 구성으로 덮어쓸까요?`)) return;
  const p = { name, at: Date.now(), state: snapshot() };
  if (i >= 0) list[i] = p; else list.unshift(p);
  if (storePresets(list)) { $('#psName').value = ''; renderPresets(); toast(`「${name}」 저장됨`); }
});
$('#psName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#psSave').click(); });
$('#psList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ps]'); if (!b) return;
  const list = loadPresets(), i = +b.dataset.i, p = list[i]; if (!p) return;
  if (b.dataset.ps === 'load') applyPreset(p);
  else if (b.dataset.ps === 'over') { if (!confirm(`「${p.name}」을(를) 현재 구성으로 덮어쓸까요?`)) return; list[i] = { ...p, at: Date.now(), state: snapshot() }; if (storePresets(list)) { renderPresets(); toast('덮어썼습니다'); } }
  else if (b.dataset.ps === 'del') { if (!confirm(`「${p.name}」 프리셋을 삭제할까요? 되돌릴 수 없습니다.`)) return; list.splice(i, 1); if (storePresets(list)) { renderPresets(); toast('삭제했습니다'); } }
});
$('#psExport').addEventListener('click', () => {
  const list = loadPresets(); if (!list.length) { toast('내보낼 프리셋이 없습니다'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'sxs-calc', v: 1, presets: list }, null, 1)], { type: 'application/json' }));
  a.download = `sxs-calc-presets-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#psImport').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), inc = (Array.isArray(j) ? j : j.presets || []).filter((p) => p && typeof p.name === 'string' && p.state && sanitize(JSON.parse(JSON.stringify(p.state))));
    if (!inc.length) { toast('불러올 프리셋이 없는 파일입니다'); return; }
    const list = loadPresets(), names = new Set(list.map((p) => p.name));
    for (const p of inc) { let n = p.name.slice(0, 40), k = 2; while (names.has(n)) n = `${p.name.slice(0, 34)} (${k++})`; names.add(n); list.push({ name: n, at: +p.at || Date.now(), state: p.state }); }
    if (storePresets(list)) { renderPresets(); toast(`프리셋 ${inc.length}개를 불러왔습니다`); }
  } catch (err) { toast('파일을 읽지 못했습니다'); }
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
  hud(); clearBattle();
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
    startSamples(res, setup);
  } catch (e) {
    console.error(e); term.setStatus(null); term.line('✗ 오류: ' + e.message, '#ff6b5e'); toast('시뮬레이션 오류: ' + e.message);
  } finally { running = false; $('#runBtn').disabled = false; }
}
$('#runBtn').addEventListener('click', run);

function showResults(res) {
  const p = res.wins[0] / res.n, ci = 1.96 * Math.sqrt((p * (1 - p)) / res.n) * 100, col = pctColor(p), N = res.n;
  const len = Math.PI * 80, tA = res.meta.filter((m) => m.team === 0 && !m.pet).length, tB = res.meta.filter((m) => m.team === 1 && !m.pet).length;
  const rows = [], by = new Map(); let dmgA = 0;
  res.meta.forEach((m, i) => { const key = m.team + '|' + (m.kind === 'mob' ? m.ref : m.sum ? `s${m.owner}:${m.name}` : m.id); let r = by.get(key); if (!r) { r = { team: m.team, name: (m.sum ? '✦ ' : m.pet ? '🐾 ' : '') + m.name, n: 0, dmg: 0, taken: 0, kills: 0, alive: 0 }; by.set(key, r); rows.push(r); } const a = res.units[i]; r.n++; r.dmg += a.dmg / N; r.taken += a.taken / N; r.kills += a.kills / N; r.alive += a.alive / N; if (m.team === 0) dmgA += a.dmg / N; });
  const maxD = Math.max(1, ...rows.map((r) => r.dmg));
  const winTag = $('#winTag'); winTag.hidden = false; winTag.textContent = (p * 100).toFixed(1) + '%'; winTag.style.color = col; winTag.style.borderColor = col;
  $('#results').classList.remove('stale');
  $('#results').innerHTML = `
    <div class="card dial">
      <svg viewBox="0 0 200 116"><path d="M20 106 A80 80 0 0 1 180 106" fill="none" stroke="#34322f" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 106 A80 80 0 0 1 180 106" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(len * p).toFixed(1)} ${len.toFixed(1)}"/></svg>
      <div class="pct" style="color:${col}">${(p * 100).toFixed(1)}<small style="font-size:22px">%</small></div>
      <div class="cap">아군 승리 확률 · 95% 신뢰구간 ±${ci.toFixed(1)}%p</div>
      <div class="verdict" style="color:${col}">${verdict(p)}</div>
    </div>
    <div class="card samples-card">
      <div class="smp-head"><b>다시 볼 전투</b><span>결과 비율대로 고른 ${Math.min(10, res.samples.length)}판 · 같은 결과 안에서는 길이·첫 쓰러짐이 다르게</span></div>
      <div class="samples" id="samples"></div>
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
/* ───────── battle screen: sample fights · timeline · combat log · live status · minimap ───────── */
let cur = null; // the replay on screen: { r, setup, seed, acts, evToAct, nm }
/** up to 10 fights to watch: each result in proportion (at least 2 of any result seen), spread over fight length */
function pickSamples(res) {
  const S = res.samples, groups = new Map();
  for (const s of S) { if (!groups.has(s[1])) groups.set(s[1], []); groups.get(s[1]).push(s); }
  const want = Math.min(10, S.length);
  const alloc = [...groups].map(([w, list]) => ({ w, list, n: Math.min(list.length, Math.max(2, Math.round((want * list.length) / S.length))) }));
  let guard = 0; while (alloc.reduce((a, x) => a + x.n, 0) > want && guard++ < 50) { const big = alloc.slice().sort((a, b) => b.n - a.n)[0]; if (big.n <= 1) break; big.n--; }
  const maj = res.wins[0] >= res.wins[1] ? 0 : 1, out = [];
  for (const g of alloc.sort((a, b) => (a.w === maj ? -1 : b.w === maj ? 1 : a.w - b.w))) {
    const sorted = g.list.slice().sort((a, b) => a[2] - b[2]), seen = new Set();
    for (let j = 0; j < g.n; j++) { const s = sorted[Math.round((j * (sorted.length - 1)) / Math.max(1, g.n - 1))]; if (!seen.has(s[0])) { seen.add(s[0]); out.push(s); } }
  }
  return out;
}
const resKo = (w, to) => (w === 0 ? '승리' : w === 1 ? (to ? '시간 초과 패배' : '패배') : '무승부');
function startSamples(res, setup) {
  const list = pickSamples(res), avg = res.rounds / res.n, maj = res.wins[0] >= res.wins[1] ? 0 : 1;
  const pool = list.filter((s) => s[1] === maj), rep = (pool.length ? pool : list).slice().sort((a, b) => Math.abs(a[2] - avg) - Math.abs(b[2] - avg))[0];
  const box = $('#samples'); if (!box) return;
  box.innerHTML = list.map((s) => `<button class="smp ${s[1] === 0 ? 'win' : s[1] === 1 ? 'lose' : 'draw'}" data-seed="${s[0]}"><b>${resKo(s[1])}${s === rep ? ' · 대표' : ''}</b><span>${s[2]}라운드</span><small>…</small></button>`).join('');
  // fill in action counts and who fell first, one replay per idle slice
  let k = 0;
  const fill = () => {
    if (lastSetup !== setup || k >= list.length) return;
    const s = list[k++], el = box.querySelector(`[data-seed="${s[0]}"]`);
    try {
      const r = replay(setup, s[0]), acts = r.events.filter((e) => e.e === 'turn' && !r.meta[e.u].pet).length;
      const fd = r.events.find((e) => e.e === 'die' && !r.meta[e.u].pet), end = r.events[r.events.length - 1];
      if (el) { el.querySelector('span').textContent = `${acts}행동 · ${s[2]}라운드${end && end.timeout ? ' · 시간 초과' : ''}`; el.querySelector('small').textContent = fd ? `첫 쓰러짐: ${r.meta[fd.u].name}` : '쓰러진 유닛 없음'; }
    } catch (e) { console.error(e); }
    setTimeout(fill, 0);
  };
  setTimeout(fill, 60);
  if (rep) playSeed(setup, rep[0]);
}
$('#results').addEventListener('click', (e) => { const b = e.target.closest('.smp'); if (b && !running && lastSetup) playSeed(lastSetup, +b.dataset.seed); });

function unitNames(meta) {
  const cnt = {}; meta.forEach((m) => { if (m.kind === 'mob') cnt[m.name] = (cnt[m.name] || 0) + 1; });
  return meta.map((m) => (m.kind === 'mob' && cnt[m.name] > 1 ? `${m.name}#${(m.nth || 0) + 1}` : m.name));
}
/** one entry per unit turn: casts, damage (by the acting side), heals, misses, moves, falls, statuses gained */
function buildActs(r) {
  const acts = [], evToAct = new Int32Array(r.events.length + 1).fill(-1), M = r.meta;
  let a = null;
  r.events.forEach((e, i) => {
    if (e.e === 'turn') { a = { i, u: e.u, r: e.r, casts: [], dmg: 0, taken: 0, heal: 0, crit: 0, block: 0, miss: 0, falls: [], move: 0, gains: [], spawn: -1, skip: 0, kbs: [], dash: 0, retreat: 0, pulls: 0, mh: 0 }; acts.push(a); }
    else if (a) {
      switch (e.e) {
        case 'cast': a.casts.push(e); a.mh += e.mh || 0; break;
        case 'hit': if (e.k === 3 || e.k === 5) a.miss++; else if (M[e.a].team === M[a.u].team) { a.dmg += e.d; if (e.k === 1) a.crit++; if (e.k === 2) a.block++; } else a.taken += e.d; break;
        case 'heal': a.heal += e.v; break;
        case 'move': if (e.kb && e.u !== a.u) a.kbs.push(e.u); else if (e.pull && e.u !== a.u) a.pulls++; else if (e.u === a.u) { if (e.dash) a.dash = 1; else if (e.retreat) a.retreat = 1; else a.move++; } break;
        case 'die': a.falls.push(e.u); break;
        case 'spawn': a.spawn = e.u; break;
        case 'skip': a.skip = 1; break;
        case 'st': if (e.on && !e.u && a.gains.length < 5) a.gains.push(e); break;
      }
    }
    evToAct[i] = acts.length - 1;
  });
  evToAct[r.events.length] = acts.length - 1;
  return { acts, evToAct };
}
function actLine(a, nm, M) {
  const who = M[a.u], tg = new Map();
  for (const c of a.casts) if (!c.sup) for (const t of c.tg) tg.set(t, 1);
  const tgs = [...tg.keys()], names = a.casts.map((c) => esc(c.n));
  const what = names.length ? names.join(' · ') : a.skip ? '행동 불가' : a.spawn >= 0 ? '' : '사용 가능한 전투 스킬 없음';
  const sub = [];
  if (a.move) sub.push(`이동`);
  if (a.dash) sub.push(`돌진`);
  if (a.retreat) sub.push(`후퇴`);
  if (a.kbs.length) sub.push(`넉백: ${[...new Set(a.kbs)].map((k) => esc(nm[k])).join(', ')}`);
  if (a.pulls) sub.push(`끌어당김 ${a.pulls}`);
  if (a.mh) sub.push(`대형 다단 +${a.mh}회`);
  if (a.crit || a.block || a.miss) sub.push([a.crit && `치명타 ${a.crit}`, a.block && `막기 ${a.block}`, a.miss && `빗나감 ${a.miss}`].filter(Boolean).join(' · '));
  if (a.heal) sub.push(`<span class="hl">치유 +${fmt(a.heal)}</span>`);
  if (a.taken) sub.push(`반격·반사 −${fmt(a.taken)}`);
  for (const g of a.gains) sub.push(`${esc(nm[g.t])}: ${ST_KO[g.k] || g.k}${g.n > 1 ? ' ×' + g.n : ''}`);
  if (a.spawn >= 0) sub.push(`✦ ${esc(nm[a.spawn])} ${M[a.spawn].sum ? '소환' : '실체화'}`);
  for (const f of a.falls) sub.push(`<span class="fl">✝ ${esc(nm[f])} 쓰러짐</span>`);
  return `<div class="lg t${who.team}" data-a="${a.i}"><span class="lr">R${a.r}</span><b>${esc(nm[a.u])}</b> ${what}${tgs.length ? ` → ${esc(nm[tgs[0]])}${tgs.length > 1 ? ` 외 ${tgs.length - 1}` : ''}` : ''}${a.dmg ? ` <span class="dm">−${fmt(a.dmg)}</span>` : ''}${sub.length ? `<div class="sub">${sub.join(' · ')}</div>` : ''}</div>`;
}
function fieldChips(setup) {
  const c = [];
  if (setup.mode === 'pvp' && setup.pvpBalance !== false) {
    c.push(['균형의 미 I · 캐릭터 대상 대미지 ×0.2 · 소환수 ×0.6 · 제어 확률 ×⅓', 'PvP 전장 효과 (Beauty of Balance I)']);
    // Beauty of Balance II: the match's governor from the fighters on the field
    let g = null; try { g = pvpGovernor(prepare(setup).units, setup.serverDays); } catch (e) { g = null; }
    if (g) c.push([`균형의 미 II · 스킬 대미지·치유·실드 ×${g.scale.toFixed(3)}`, `PvP 전장 효과 (Beauty of Balance II): 생존 비율 ×${g.survival.toFixed(3)} (출력/생존 ${g.ratio.toFixed(3)}, 0.1 초과분 감소) · 스킬 랭크 ×${g.rankScale.toFixed(3)} (전투 ${g.fightRank} / 서버 ${g.serverRank}) · 랭크 균형 ×${g.balance.toFixed(3)}`]);
    c.push(['12라운드부터 라운드마다 대미지 +10%p · 치유·실드 −20%', 'PvP 전장 효과 (Swift Resolution I · II)']);
  }
  if (setup.teams.some((t) => t.some((u) => u.uws))) c.push(['United We Stand · 보스가 첫 3턴 받는 대미지 −99%', '길드 토벌 층 효과']);
  c.push([`라운드 제한 ${setup.roundCap}R`, '한 라운드 = 생존한 전원이 한 번씩 행동']);
  if (setup.teams.some((t) => t.some((u) => u.kind === 'mob'))) { if (setup.mobCoef !== 1) c.push([`몹 스킬 계수 ${Math.round(setup.mobCoef * 100)}%`, '']); if (setup.pvEst === false) c.push(['몹 비전 추정값 꺼짐', '']); const rk = [...new Set(setup.teams[0].filter((u) => u.kind === 'hero' && u.rank).map((u) => SUBRANK_KO(u.rank)))]; if (rk.length && setup.mode !== 'pvp') c.push([`랭크 ${rk.join(' · ')} · 랭크 차이 보정`, '']); }
  return c.map(([t, title]) => `<span class="fchip" title="${esc(title)}">${t}</span>`).join('');
}
function playSeed(setup, seed) {
  let r; try { r = replay(setup, seed); } catch (e) { console.error(e); return; }
  const { acts, evToAct } = buildActs(r), nm = unitNames(r.meta);
  cur = { r, setup, seed, acts, evToAct, nm, k: -2 };
  $$('#samples .smp').forEach((b) => b.classList.toggle('on', +b.dataset.seed === seed));
  $('#banner').hidden = true; $('#roundTag').textContent = '전투 재생';
  term.line(`  ⎿ 전투 재생 (seed ${seed})`, '#d97757');
  $('#logList').innerHTML = acts.map((a) => actLine(a, nm, r.meta)).join('') || '<div class="lg-empty">기록 없음</div>';
  cur.lines = [...$('#logList').children];
  $('#fieldChips').innerHTML = fieldChips(setup);
  $('#tlRange').max = acts.length; $('#tlRange').value = 0; $('#tl').classList.remove('idle');
  drawStrip();
  stage.play(r.events, r.meta, {
    onRound: (n) => { $('#roundTag').textContent = `라운드 ${n} / ${setup.roundCap}`; },
    onHp: hud,
    onEvent: scheduleBattle,
    onSeek: (i) => { if (i < r.events.length) $('#banner').hidden = true; hud(); scheduleBattle(); },
    onPause: syncPause, onResume: syncPause,
    onEnd: (ev) => {
      const b = $('#banner'); b.hidden = false; b.className = 'banner' + (ev.w === 0 ? '' : ' lose');
      b.textContent = ev.w === 0 ? '승리!' : ev.w === 1 ? (ev.timeout ? '시간 초과 패배' : '패배…') : '무승부';
      term.line(`✔ 전투 종료 — ${ev.w === 0 ? '아군 승리' : ev.w === 1 ? '상대 승리' : '무승부'} (${ev.r}R${ev.timeout ? ', 시간 초과' : ''})`, ev.w === 0 ? '#7bc96f' : '#ff6b5e'); hud();
      setTimeout(() => { if (!stage.isPlaying() && stage.pos() && stage.pos().done) b.hidden = true; }, 2600);
      scheduleBattle();
    },
  });
  syncPause(); hud(); scheduleBattle();
}
function clearBattle() {
  cur = null;
  $('#logList').innerHTML = '<div class="lg-empty">「승률 계산」을 누르면 대표 전투의 행동이 여기에 기록됩니다.</div>';
  $('#tlRange').max = 0; $('#tlRange').value = 0; $('#tl').classList.add('idle');
  $('#tlCap').textContent = '전투를 재생하면 타임라인을 끌어 원하는 장면으로 이동할 수 있습니다.';
  $('#fieldChips').innerHTML = fieldChips(toSetup());
  drawStrip(); scheduleBattle();
}
/* timeline strip: one column per action, height = damage dealt, red tick = a unit fell */
function drawStrip() {
  const cv = $('#tlStrip'), w = cv.clientWidth || 600, h = 22, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
  c.fillStyle = '#26241f'; c.fillRect(0, 0, w, h);
  if (!cur || !cur.acts.length) return;
  const A = cur.acts, n = A.length, cw = w / n, max = Math.max(1, ...A.map((a) => a.dmg));
  A.forEach((a, j) => {
    const team = cur.r.meta[a.u].team, f = a.dmg ? 0.25 + 0.75 * Math.log1p(a.dmg) / Math.log1p(max) : 0.12;
    c.fillStyle = team ? 'rgba(255,107,94,.85)' : 'rgba(90,162,255,.85)'; c.fillRect(j * cw, h - f * (h - 4), Math.max(1, cw - (cw > 3 ? 1 : 0)), f * (h - 4));
    if (a.falls.length) { c.fillStyle = '#ffd24a'; c.fillRect(j * cw, 0, Math.max(1.5, cw - 1), 3); }
  });
}
let battleRaf = 0, liveT = 0;
function scheduleBattle() { if (!battleRaf) battleRaf = requestAnimationFrame(refreshBattle); }
function refreshBattle() {
  battleRaf = 0;
  const pos = stage.pos();
  if (cur && pos) {
    const A = cur.acts, k = pos.done ? A.length : pos.i === 0 ? -1 : Math.max(-1, cur.evToAct[pos.i - 1]);
    if (document.activeElement !== $('#tlRange')) $('#tlRange').value = pos.done ? A.length : k + 1; // = actions completed
    const a = A[Math.min(A.length - 1, Math.max(0, k))];
    if (pos.done) { const end = cur.r.events[cur.r.events.length - 1]; $('#tlCap').textContent = `전투 종료 · ${resKo(end.w, end.timeout)} · ${end.r}라운드 · 행동 ${A.length}개`; }
    else if (k < 0 || !a) $('#tlCap').textContent = `전투 시작 전 · 막대를 끌거나 ▶▶로 한 행동씩 보세요 · 행동 ${A.length}개`;
    else $('#tlCap').textContent = `라운드 ${a.r} · 행동 ${k + 1}/${A.length} · ${cur.nm[a.u]}: ${a.casts.length ? a.casts.map((c) => c.n).join(' · ') : a.skip ? '행동 불가' : a.move ? '이동' : '스킬 대기'}${a.dmg ? ' · −' + fmt(a.dmg) : ''}`;
    if (k !== cur.k) {
      const L = cur.lines, old = cur.k; cur.k = k;
      const lo = Math.max(0, Math.min(old, k) + 1), hi = Math.min(L.length - 1, Math.max(old, k));
      if (old === -2) L.forEach((el, j) => el.classList.toggle('future', j > k));
      else for (let j = lo; j <= hi; j++) L[j].classList.toggle('future', j > k);
      if (L[old]) L[old].classList.remove('now');
      if (L[k] && !pos.done) { L[k].classList.add('now'); const box = $('#logList'); const top = L[k].offsetTop - box.offsetTop; if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = Math.max(0, top - box.clientHeight / 3); }
    }
  }
  const now = performance.now();
  if (now - liveT > 120) { liveT = now; drawLive(); drawMini(); } else scheduleBattleLate();
}
let lateT = 0; function scheduleBattleLate() { clearTimeout(lateT); lateT = setTimeout(() => { liveT = 0; scheduleBattle(); }, 140); }
/* live unit list: HP + shield bar, statuses with stacks and own turns left */
function drawLive() {
  const L = stage.live(); if (!L.length) { $('#liveList').innerHTML = ''; return; }
  const nm = cur ? cur.nm : unitNames(L.map((u) => u.m));
  const pos = stage.pos(), end = cur && pos && pos.done ? cur.r.events[cur.r.events.length - 1] : null;
  $('#liveList').innerHTML = L.map((u, i) => {
    const mood = end && u.alive ? (end.w === u.m.team ? 'joy' : 'sad') : u.mood;
    const face = u.d ? faceHtml(u.d, mood) : '';
    if (u.hidden && !u.alive) return u.m.pet && !u.m.sum ? `<div class="lv pet off"><span class="nm">🐾 ${esc(nm[i])}</span><small>실체화 대기</small></div>` : '';
    const f = Math.max(0, u.hp / u.m.hpMax), s = Math.min(1 - f, u.sh / u.m.hpMax);
    const chips = !u.alive ? '' : u.sts.map((x) => `<i class="st ${x.k === 'shield' ? 'sh' : ST_CTRL.has(x.k) ? 'cc' : x.b ? 'bf' : 'db'}">${ST_KO[x.k] || x.k}${x.n > 1 ? ' ×' + x.n : ''}${x.left ? ` · ${x.left}턴` : ''}</i>`).join('');
    return `<div class="lv t${u.m.team}${u.alive ? '' : ' dead'}${face ? ' hasface' : ''}">${face}<span class="nm">${u.m.sum ? '✦ ' : u.m.pet ? '🐾 ' : ''}${esc(nm[i])}</span><div class="hpb"><s style="width:${(f * 100).toFixed(1)}%"></s><u style="left:${(f * 100).toFixed(1)}%;width:${(s * 100).toFixed(1)}%"></u><em>${u.alive ? `${fmtK(u.hp)} / ${fmtK(u.m.hpMax)}${u.sh > 0 ? ' +' + fmtK(u.sh) : ''}` : '쓰러짐'}</em></div>${chips ? `<div class="sts">${chips}</div>` : ''}</div>`;
  }).join('');
}
const ST_CTRL = new Set(['stun', 'freeze', 'immob', 'taunt', 'frenzy']);
const fmtK = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : fmt(n));
/* minimap: the drawn board seen from above (our team on the left); drag a fighter inside its box to choose its starting cell */
const MM = { x0: CELL_BOX.x[0], x1: CELL_BOX.x[1], y0: CELL_BOX.y[0][0], y1: CELL_BOX.y[1][1], c: 18 };
let drag = null;
function mmGeo() { const cv = $('#miniMap'), cols = MM.y1 - MM.y0 + 1, rows = MM.x1 - MM.x0 + 1; return { cv, cols, rows, c: MM.c, w: cols * MM.c, h: rows * MM.c }; }
const toPx = (gx, gy) => [(gy - MM.y0 + 0.5) * MM.c, (gx - MM.x0 + 0.5) * MM.c];
function drawMini() {
  const g = mmGeo(), dpr = Math.min(2, window.devicePixelRatio || 1), cv = g.cv;
  if (cv.width !== g.w * dpr) { cv.width = g.w * dpr; cv.height = g.h * dpr; cv.style.width = g.w + 'px'; cv.style.height = g.h + 'px'; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, g.w, g.h);
  const editing = !cur;
  for (let gy = MM.y0; gy <= MM.y1; gy++) for (let gx = MM.x0; gx <= MM.x1; gx++) {
    const [px, py] = toPx(gx, gy), boxA = gy >= CELL_BOX.y[0][0] && gy <= CELL_BOX.y[0][1], boxB = gy >= CELL_BOX.y[1][0] && gy <= CELL_BOX.y[1][1];
    c.fillStyle = (gx + gy) & 1 ? '#2b2925' : '#26241f'; if (editing && boxA) c.fillStyle = (gx + gy) & 1 ? '#25324a' : '#212d43'; if (editing && boxB) c.fillStyle = (gx + gy) & 1 ? '#45282a' : '#3e2426';
    c.fillRect(px - MM.c / 2 + 0.5, py - MM.c / 2 + 0.5, MM.c - 1, MM.c - 1);
  }
  const L = stage.live();
  L.forEach((u, i) => {
    if (u.hidden || u.x == null || u.x < 0) return;
    const sz = u.m.sz || 1, off = sz % 2 ? 0 : 0.5; // even bodies (2×2, 4×4) centre half a cell off the anchor
    const [px, py] = drag && drag.i === i ? [drag.px, drag.py] : toPx(u.x + off, u.y + off), r = sz > 1 ? sz * 7 : 6.5;
    if (sz > 1) { c.globalAlpha = u.alive ? 0.35 : 0.15; c.fillStyle = u.m.team ? '#ff6b5e' : '#5aa2ff'; c.fillRect(px - (sz * MM.c) / 2 + 1, py - (sz * MM.c) / 2 + 1, sz * MM.c - 2, sz * MM.c - 2); }
    c.globalAlpha = u.alive ? 1 : 0.35;
    c.fillStyle = u.m.team ? '#ff6b5e' : '#5aa2ff'; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
    if (u.alive) { c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.arc(px, py, r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, u.hp / u.m.hpMax)); c.stroke(); }
    if (u.m.pet) { c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(px, py, 2.5, 0, 7); c.fill(); }
    if (editing && fixedCellOf(u.m)) { c.strokeStyle = '#ffd24a'; c.lineWidth = 1.5; c.strokeRect(px - MM.c / 2 + 1.5, py - MM.c / 2 + 1.5, MM.c - 3, MM.c - 3); }
    c.globalAlpha = 1;
  });
  $('#mmCap').textContent = editing ? '시작 위치 · 파란 칸(아군)·빨간 칸(상대) 안에서 끌어 옮기기' : '실시간 위치 · 원 둘레 = 남은 생명';
}
const defOf = (m) => { for (const t of state.teams) for (const d of t) if (d.uid === m.ref) return d; return null; };
const fixedCellOf = (m) => { const d = defOf(m); return d && d.cell && (m.kind !== 'mob' || !m.nth) ? d.cell : null; };
function mmPick(e) {
  const g = mmGeo(), rect = g.cv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
  return { px, py, gy: Math.round(px / MM.c - 0.5) + MM.y0, gx: Math.round(py / MM.c - 0.5) + MM.x0 };
}
$('#miniMap').addEventListener('pointerdown', (e) => {
  if (running) return;
  const p = mmPick(e), L = stage.live();
  let best = -1, bd = 12;
  L.forEach((u, i) => { if (u.hidden || u.m.pet || (u.m.kind === 'mob' && u.m.nth)) return; const [x, y] = toPx(u.x, u.y), d = Math.hypot(x - p.px, y - p.py); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return;
  if (cur) { showRoster(); } // leave the replay: edit the starting setup
  drag = { i: best, m: L[best].m, px: p.px, py: p.py }; $('#miniMap').setPointerCapture(e.pointerId); drawMini();
});
$('#miniMap').addEventListener('pointermove', (e) => { if (!drag) return; const p = mmPick(e); drag.px = p.px; drag.py = p.py; drawMini(); });
$('#miniMap').addEventListener('pointerup', (e) => {
  if (!drag) return;
  const p = mmPick(e), t = drag.m.team, d = defOf(drag.m); drag = null;
  if (d && p.gx >= CELL_BOX.x[0] && p.gx <= CELL_BOX.x[1] && p.gy >= CELL_BOX.y[t][0] && p.gy <= CELL_BOX.y[t][1]) { d.cell = [p.gx, p.gy]; touch(true); showRoster(); }
  else { toast(t ? '상대는 빨간 칸 안에만 놓을 수 있습니다' : '아군은 파란 칸 안에만 놓을 수 있습니다'); drawMini(); }
});
$('#mmReset').addEventListener('click', () => { for (const t of state.teams) for (const d of t) delete d.cell; touch(true); showRoster(); });

/* transport */
function syncPause() { const p = stage.isPaused(); $('#pauseBtn').textContent = p ? '▶ 재생' : '❚❚ 일시정지'; }
$('#speedSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stage.setSpeed(+b.dataset.speed); $$('#speedSeg button').forEach((x) => x.classList.toggle('on', x === b)); });
$('#pauseBtn').addEventListener('click', () => { const p = stage.pos(); if (cur && p && p.done) { stage.seek(0); stage.setPaused(false); } else stage.setPaused(!stage.isPaused()); syncPause(); });
$('#skipBtn').addEventListener('click', () => { stage.skip(); hud(); scheduleBattle(); });
$('#stepBack').addEventListener('click', () => { if (cur) stage.stepAction(-1); syncPause(); });
$('#stepFwd').addEventListener('click', () => { if (cur) stage.stepAction(1); syncPause(); });
$('#tlRange').addEventListener('input', (e) => { if (!cur) return; const k = +e.target.value; stage.setPaused(true); stage.seek(k >= cur.acts.length ? cur.r.events.length : cur.acts[k].i); syncPause(); });
$('#logList').addEventListener('click', (e) => { const l = e.target.closest('.lg[data-a]'); if (!l || !cur) return; stage.setPaused(true); stage.seek(+l.dataset.a); stage.stepAction(1); syncPause(); });
$('#groundSel').innerHTML = GROUND_LIST.map(([k, ko]) => `<option value="${k}">${ko}</option>`).join('');
$('#groundSel').value = state.ground || 'colosseum'; stage.setGround(state.ground || 'colosseum');
$('#groundSel').addEventListener('change', (e) => { state.ground = e.target.value; stage.setGround(state.ground); touch(true); });
$('#topBtn').addEventListener('click', () => { stage.setTopView(!stage.isTopView()); $('#topBtn').classList.toggle('on', stage.isTopView()); });
window.addEventListener('resize', () => { drawStrip(); });
$('#viewBtn').addEventListener('click', () => { stage.resetView(); $('#topBtn').classList.remove('on'); });
$('#zoomIn').addEventListener('click', () => stage.zoom(0.82));
$('#zoomOut').addEventListener('click', () => stage.zoom(1.22));

/* ───────── boot ───────── */
function renderAll() { renderTeam(0); renderTeam(1); syncSettings(); showRoster(); }
$$('#speedSeg button')[0].classList.add('on');
renderAll();
term.line('> 팀을 구성하고 「승률 계산」을 누르세요', '#9b978b');
loadArt().then(() => { drawAvatars(); if (!running && !stage.isPlaying()) showRoster(); });
// SD class sheets (sprites, faces, effects): the first auto-run waits for them (at most 4 s)
const sheetsP = Promise.all([loadSheets(), loadToon()]).then(() => { if (!running && !stage.isPlaying()) renderAll(); else drawAvatars(); });
// the glTF hero models (~8 MB) load in the background: the board redraws with them when they arrive (not mid-replay)
Promise.all([sheetsP, loadGlb()]).then(() => { if (!running && !stage.isPlaying()) showRoster(); else stage.refreshModels(); });
if (state.teams[0].length && state.teams[1].length) Promise.race([sheetsP, new Promise((r) => setTimeout(r, 4000))]).then(() => setTimeout(run, 300));
