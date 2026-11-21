// Builds js/gamedata.js from locally saved community-wiki pages (see CREDITS.md).
// Usage: node tools/build_data.mjs <dir-with-downloaded-pages> <out-file>
// The downloaded pages are treated purely as data; nothing from them is executed.
import fs from 'node:fs';
import path from 'node:path';
import { moveAndSize, mobExtras } from './skilltext.mjs';
import { PARTS, FWD0 } from './hitparts.mjs';

const [, , DL, OUT] = process.argv;
if (!DL || !OUT) { console.error('usage: node build_data.mjs <dl-dir> <out-file>'); process.exit(1); }
const read = (f) => fs.readFileSync(path.join(DL, f), 'utf8');
const J = (f) => JSON.parse(read(f));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&times;/g, '×').replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—');
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s).replace(/[, ]/g, ''));
const report = [];
const log = (...a) => report.push(a.join(' '));
// the game's skill definitions (purrwikimania simulator data assets/duel.json), when saved next to the pages
const DUELSK = new Map();
if (fs.existsSync(path.join(DL, 'duel.json'))) { const d = J('duel.json'); for (const s of Array.isArray(d.skills) ? d.skills : Object.values(d.skills)) DUELSK.set(s.id, s); }

/* ───────────── level tables ───────────── */
function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) =>
    [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))));
}
const MAXLV = 250;
const LV = { atk: [0], def: [0], hp: [0], spd: [0], mas: [0], aff: [0], crit: [0], eres: [0] };
for (const t of tables(read('base-stats.html'))) {
  const h = t[0] || [];
  if (h[0] !== 'Level' || h[1] !== 'ATK') continue;
  for (const r of t) if (/^\d+$/.test(r[0]) && +r[0] <= MAXLV) { const l = +r[0]; LV.atk[l] = num(r[1]); LV.def[l] = num(r[2]); LV.hp[l] = num(r[3]); LV.spd[l] = num(r[4]); }
}
for (const t of tables(read('stat-conversion.html'))) {
  const h = t[0] || [];
  if (h[0] !== 'Level' || !/Base Crit/.test(h[1] || '')) continue;
  const ci = h.indexOf('Base Crit Rate'), ei = h.indexOf('Base Effect RES'), mi = h.indexOf('Base Elemental Mastery'), ai = h.indexOf('Affinity base');
  for (const r of t) if (/^\d+$/.test(r[0]) && +r[0] <= MAXLV) { const l = +r[0]; LV.crit[l] = num(r[ci]); LV.eres[l] = num(r[ei]); LV.mas[l] = num(r[mi]); LV.aff[l] = num(r[ai]); }
}
for (const k of Object.keys(LV)) {
  for (let l = 1; l <= MAXLV; l++) if (!(LV[k][l] > 0)) { LV[k][l] = LV[k][l - 1] || 1; if (l > 1) log('LV gap filled', k, l); }
}
log('LV sample lv50', JSON.stringify(Object.fromEntries(Object.keys(LV).map((k) => [k, LV[k][50]]))), 'lv100', JSON.stringify(Object.fromEntries(Object.keys(LV).map((k) => [k, LV[k][100]]))));

/* ───────────── skills ───────────── */
const skillsHtml = read('skills.html');
const sd = JSON.parse(/<script[^>]*id="skilldata"[^>]*>([\s\S]*?)<\/script>/.exec(skillsHtml)[1]);
const curves = J('curves.json');
const subrankOf = (lv) => {
  if (lv <= 10) return 'Norank';
  const tiers = ['Blackiron', 'Bronze', 'Silver', 'Gold', 'Saint', 'Legend', 'Angel'];
  const i = Math.min(20, Math.floor((lv - 11) / 10));
  return tiers[Math.floor(i / 3)] + ((i % 3) + 1);
};
const FLAT = {};
for (const g of ['1', '2', '3', '4', '5']) {
  const arr = [0];
  for (let l = 1; l <= MAXLV; l++) {
    const lpid = sd.lpidOf[g][subrankOf(l)];
    const row = curves[lpid] && curves[lpid][l];
    arr[l] = row && row.SkillFixedAttack1 ? row.SkillFixedAttack1 : arr[l - 1] || 0;
  }
  FLAT[g] = arr;
}
const TIER_RANKS = [1, 3, 6, 10, 16, 24];
const RANK_Q = []; // quality index per rank (1..34)
for (let r = 1; r <= 34; r++) RANK_Q[r] = TIER_RANKS.filter((t) => t <= r).length - 1;
const QN = ['희귀', '영웅', '전설', '신화', '신성', '불멸'];
const RANKS = [];
for (let r = 1; r <= 34; r++) RANKS.push(`${QN[RANK_Q[r]]} +${r - TIER_RANKS[RANK_Q[r]]}`);
let RANK_R = null;

const CLASSES = [
  ['Zhanshi', 'Warrior', '전사', 1, 'W', 'knight', '근접 물리 · 기본 직업'],
  ['Fashi', 'Mage', '마법사', 1, 'M', 'sorcerer', '원거리 원소 · 기본 직업'],
  ['Huwei', 'Knight', '기사', 2, 'WT', 'knight', '방어형 · 막기/보호막/도발'],
  ['Doushi', 'Duelist', '투사', 2, 'WD', 'duelist', '공격형 · 단일 화력'],
  ['Shushi', 'Sorcerer', '주술사', 2, 'MD', 'sorcerer', '공격형 · 광역 마법'],
  ['Xianzhe', 'Sage', '현자', 2, 'MS', 'sage', '지원형 · 치유/소환/저주'],
  ['Dunjiashi', 'Paladin', '성기사', 3, 'WT', 'knight', '방어형 3차'],
  ['Kuangzhanshi', 'Berserker', '광전사', 3, 'WD', 'duelist', '공격형 3차'],
  ['Modaoshi', 'Archmage', '대마법사', 3, 'MD', 'sorcerer', '광역 마법 3차'],
  ['Mishushi', 'Arcanist', '비전술사', 3, 'MS', 'sage', '지원형 3차'],
  ['Shouhuzhe', 'Guardian', '수호자', 4, 'WT', 'knight', '방어형 4차'],
  ['Zhengfuzhe', 'Conqueror', '정복자', 4, 'WD', 'duelist', '공격형 4차'],
  ['Huimiezhe', 'Destroyer', '파괴자', 4, 'MD', 'sorcerer', '광역 마법 4차'],
  ['Zhangkongzhe', 'Dominator', '지배자', 4, 'MS', 'sage', '지원형 4차'],
  ['LegendShouhuzhe', 'Templar', '성전사', 5, 'WT', 'knight', '방어형 5차'],
  ['LegendZhengfuzhe', 'Ravager', '약탈자', 5, 'WD', 'duelist', '공격형 5차'],
  ['LegendHuimiezhe', 'Magister', '원소술사', 5, 'MD', 'sorcerer', '광역 마법 5차'],
  ['LegendZhangkongzhe', 'Prophet', '예언자', 5, 'MS', 'sage', '지원형 5차'],
].map(([key, en, ko, tier, line, arche, role]) => ({ key, en, ko, tier, line, arche, role }));
const CLS_KEYS = new Set(CLASSES.map((c) => c.key));

const EL = { Physical: 'phy', Wind: 'wind', Water: 'water', Fire: 'fire', Light: 'light', Dark: 'dark' };
const STATUS = {
  'Armor Break 2': { k: 'abreak', v: 0.3 }, 'Armor Break 1': { k: 'abreak', v: 0.15 },
  'Weakened 1': { k: 'weak', v: 0.15 }, 'Weakened 2': { k: 'weak', v: 0.3 },
  'Slow 1': { k: 'slow', v: 0.15 }, 'Slow 2': { k: 'slow', v: 0.3 }, Slow: { k: 'slow', v: 0.15 },
  Stun: { k: 'stun' }, Frozen: { k: 'freeze' }, Immobilize: { k: 'immob' }, Rimebound: { k: 'immob' },
  Taunt: { k: 'taunt' }, Frenzy: { k: 'frenzy' }, Blind: { k: 'blind' }, Cold: { k: 'cold' }, Wet: { k: 'wet' },
  Erosion: { k: 'dot', el: 'dark', t: 3 }, Poison: { k: 'dot', el: 'dark' }, Bleed: { k: 'dot', el: 'phy' }, Burn: { k: 'dot', el: 'fire' },
  'Riven Heart': { k: 'riven' }, Vulnerability: { k: 'vuln', v: 0.25 }, Sigil: { k: 'sigil', v: 0.6 },
};
const IGNORED_STATUS = new Set(['Fear', 'Laceration', 'Blood Source', 'Airborne']);
const unknownStatus = {};

function parseText(d) {
  const o = { hits: 1, eff: [] };
  let m;
  if ((m = /DMG (once|twice|(\d+) times)/.exec(d))) o.hits = m[1] === 'once' ? 1 : m[1] === 'twice' ? 2 : +m[2];
  // targeting
  if ((m = /[Ss]elects a (?:grid|target) within (\d+) grids? of the caster/.exec(d)) || (m = /at a selected grid within (\d+) grids? of the caster/.exec(d))) {
    const r = +m[1];
    let a;
    if ((a = /within a (\d+)-grid square area (?:of|around) the target(?: grid)?/.exec(d))) o.tg = { t: 'TQ', r, ar: +a[1] };
    else if ((a = /within (\d+) grids? of (?:the target(?: grid)?|each target grid)/.exec(d)) || (a = /all enemies within (\d+) grids/.exec(d))) o.tg = { t: 'T', r, ar: +a[1] };
    else o.tg = { t: 'T', r, ar: 0 };
  } else if ((m = /1 enemy within (\d+) to (\d+) grids? of the caster/.exec(d))) o.tg = { t: 'S', min: +m[1], r: +m[2] };
  else if ((m = /1 enemy within (\d+) grids? of the caster/.exec(d))) o.tg = { t: 'S', r: +m[1] };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)×(\d+) grid area (?:in front of the caster|along the path)/.exec(d))) o.tg = { t: 'F', w: +m[1], h: +m[2] };
  else if ((m = /all enemies within a (\d+)-grid (square|circular) area (?:of|around) the caster/.exec(d))) o.tg = { t: m[2] === 'square' ? 'Q' : 'A', r: +m[1] };
  else if ((m = /all enemies within (\d+) grids? of the caster/.exec(d))) o.tg = { t: 'A', r: +m[1] };
  else if ((m = /lowest HP within (\d+) grids? of the caster[\s\S]*?within a (\d+)-grid square area/.exec(d))) o.tg = { t: 'TQ', r: +m[1], ar: +m[2] };
  else if ((m = /random grids within (\d+) grids? of the caster/.exec(d))) o.tg = { t: 'T', r: +m[1], ar: 1 };
  else if ((m = /(?:missiles|bolts) within a (\d+)[×x](\d+) grid area in front/.exec(d))) o.tg = { t: 'F', w: +m[1], h: +m[2] };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grid(?: area)? (?:in front|in the front|to the caster's|in t)/.exec(d))) o.tg = { t: 'F', w: +m[1], h: +m[2] };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grid(?: area)? (?:around|on both sides)/.exec(d))) o.tg = { t: 'Q', r: 1 };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grid(?: area)? of the caster/.exec(d))) o.tg = { t: 'F', w: Math.min(+m[1], +m[2]), h: Math.max(+m[1], +m[2]) };
  else if ((m = /all enemies within a (\d+)-grid (square|circular) area/.exec(d))) o.tg = { t: m[2] === 'square' ? 'Q' : 'A', r: +m[1] };
  else if ((m = /all enemies (?:within|in) (\d+) grids? (?:of the caster|on either side)/.exec(d))) o.tg = { t: 'A', r: +m[1] };
  else if ((m = /(?:bolts|times) within (\d+) grids? of the caster/.exec(d))) o.tg = /all enemies/.test(d) ? { t: 'A', r: +m[1] } : { t: 'S', r: +m[1] };
  else if (/1 enemy within a certain range/.test(d)) o.tg = { t: 'S', r: 2 };
  else if ((m = /1 enemy within a (\d+)[×x](\d+) grid area of the caster/.exec(d))) o.tg = { t: 'S', r: Math.max(+m[1], +m[2]) };
  else if ((m = /Heals all allies within (\d+) grids?/.exec(d))) o.tg = { t: 'allies', r: +m[1] };
  else if ((m = /(?:Heals|shield)[^.]*ally[^.]*within (\d+) grids?/.exec(d))) o.tg = { t: 'allyLow', r: +m[1] };
  if ((m = /(?:Leaps|Teleports|Moves) to (?:any|an) empty (?:space|grid) within (\d+) grids? of the caster/.exec(d))) o.leap = +m[1];
  if (/pulls? them to the caster's location/.test(d)) o.pull = 'c';
  else if (/pull(?:s|ing) them to (?:the target grid|its center)/.test(d)) o.pull = 'a';
  if (/Doom DMG/.test(d)) o.doom = 1;
  if (/Zero Initial CD/.test(d)) o.zi = 1;
  if (/[Cc]asts (?:once )?before battle starts/.test(d)) o.pre = 1;
  if ((m = /(\d+)% Lifesteal/.exec(d))) o.ls = +m[1] / 100; else if (/Lifesteal effect/.test(d)) o.ls = 0.1;
  if (/dispels 1 (?:random )?buff/.test(d)) o.dispelBuff = 1;
  if ((m = /dispels (\d+) random ailments? or debuffs?/.exec(d))) o.dispel = +m[1];
  const re = /(\d+)% (?:base )?chance to inflict (?:(\d+) stacks? of )?([A-Z][a-z]+(?: [A-Z][a-z]+)?(?: \d)?)(?: for (\d+) turns?)?/g;
  while ((m = re.exec(d))) {
    const name = m[3];
    const def = STATUS[name];
    if (!def) { if (!IGNORED_STATUS.has(name)) unknownStatus[name] = (unknownStatus[name] || 0) + 1; continue; }
    const e = { ...def, p: +m[1] / 100 };
    if (m[4]) e.t = +m[4]; else if (!e.t) e.t = e.k === 'blind' ? 2 : 1;
    if (e.k === 'taunt' && /increasing to 100% against non-character/.test(d)) e.mob = 1;
    o.eff.push(e);
  }
  if ((m = /(\d+)% (?:base )?chance to reduce their DEF for (\d+) turns?/.exec(d))) o.eff.push({ k: 'abreak', v: 0.15, p: +m[1] / 100, t: +m[2] });
  if ((m = /(\d+)% (?:base )?chance to reduce their ATK for (\d+) turns?/.exec(d))) o.eff.push({ k: 'weak', v: 0.15, p: +m[1] / 100, t: +m[2] });
  if ((m = /(\d+)% (?:base )?chance to reduce their SPD for (\d+) turns?/.exec(d))) o.eff.push({ k: 'slow', v: 0.15, p: +m[1] / 100, t: +m[2] });
  moveAndSize(d, o);
  if (!o.eff.length) delete o.eff;
  return o;
}

// Korean names (unofficial translations unless marked in the README) + manual modelling overrides.
const B = (st, t, to, extra = {}) => ({ kind: 'buff', buff: { st, t, to, ...extra } });
const OV = {
  10008: { ko: '칼날 일격' }, 10009: { ko: '강타' }, 10011: { ko: '사자 연격' }, 10012: { ko: '바람칼 베기' },
  10013: { ko: '십자 베기' }, 10014: { ko: '회오리 베기' }, 10015: { ko: '도약 공격' }, 10018: { ko: '중력 끌기' },
  10024: { ko: '빛의 방패', ...B('blockUp', 3, 'self'), bvKey: 'ST:BlockPercent' },
  10043: { ko: '급강하 돌풍' },
  10051: { ko: '끓어오르는 투지', ...B('critUp', 4, 'self'), bvKey: 'ST:CritRatePercent' },
  10052: { ko: '산사태' }, 10054: { ko: '환영 습격' },
  10000: { ko: '물 탄환' }, 10001: { ko: '폭풍 구체' }, 10003: { ko: '물의 습격' }, 10005: { ko: '강철 가시' }, 10006: { ko: '회오리바람' },
  10019: { ko: '바위 족장 소환', kind: 'none', note: '게임 자료로 반영: 전방 2칸에 바위 정령을 소환해 바로 행동시킵니다(자기 턴 5번 뒤 소멸). 능력치는 시전자의 생명 18%·공격 70%·방어 80%·속도 70% × 스킬 랭크 계수 + 레벨 고정치. 스킬: 바위 깨기(인접 1명), 지진(주변 8칸).' },
  10020: { ko: '치유의 손길', kind: 'heal' },
  10028: { ko: '화염구' }, 10031: { ko: '타오르는 불꽃 고리' }, 10035: { ko: '얼음 가시' },
  10036: { ko: '바람의 환희', tg: { t: 'T', r: 6, ar: 1 }, hits: 1, sp: { k: 'waves', n: 7, decay: 0.35 }, note: '7회 파동을 대상 주변 랜덤 적에게 분배(반복 명중 시 대미지 35%씩 감소).' },
  10060: { ko: '공허의 축복', ...B('hpUp', 3, 'allies', { r: 4, src: 'hp' }), bvKey: 'ST:StatusAdd1', note: '범위는 시전자 주변 4칸으로 단순화.' },
  10072: { ko: '화염 분사' },
  10010: { ko: '기절 강타' }, 10044: { ko: '서리꽃' },
  10046: { ko: '수호의 고리', kind: 'shield', tg: { t: 'self' }, shT: 2, bvKey: 'ST:ShieldByDefence' },
  10048: { ko: '튕기는 방패', sp: { k: 'bounce', n: 3, r: 3 } },
  10049: { ko: '도전의 심장' },
  10066: { ko: '용맹의 파도', ...B('dmgUp', 2, 'allies', { r: 5 }), bvKey: 'ST:StatusDmgAddPer', dispel: 1 },
  10016: { ko: '섬광 돌진' }, 10026: { ko: '화염 베기' },
  10042: { ko: '파쇄의 인장', eff: [{ k: 'sigil', v: 0.6, p: 1, t: 2 }], note: '낙인: 다음 전투 스킬 1회에 받는 대미지 +60%.' },
  10053: { ko: '석양검' }, 10055: { ko: '어둠 강림' },
  10061: { ko: '화염 오라', kind: 'buff', buff: { st: 'flame', t: 2, to: 'allies', r: 3, max: 4 }, note: '열화 보유자의 턴 시작마다 주변 1칸 정사각형 안의 적에게 불 원소 대미지. 획득 시 1회 발동.' },
  10004: { ko: '명멸하는 별' },
  10030: { ko: '연쇄 번개', sp: { k: 'chain', n: 8, r: 4 } },
  10034: { ko: '불꽃 유성' }, 10038: { ko: '서리 폭발' },
  10041: { ko: '에너지 분출', ...B('nextAcc', 2, 'self', { dmg: 0.5 }), bvKey: 'ST:BlockAvoidPercent', note: '다음 대미지 전투 스킬: 명중 증가 + 대미지 +50%.' },
  10075: { ko: '여명의 빛' },
  10021: { ko: '광휘의 회복', kind: 'heal' },
  10025: { ko: '꼬마 나무정령 소환', kind: 'none', note: '게임 자료로 반영: 후방 1칸에 꼬마 나무정령(이동 불가·잠행, 자기 턴 5번). 흩날리는 잎(원거리 십자 5칸). 잎사귀 화살은 게임 자료에 대미지 계수가 없어 뺐습니다.' },
  10029: { ko: '약화의 저주' },
  10058: { ko: '화염 늑대 소환', kind: 'none', note: '게임 자료로 반영: 전방 양옆에 화염 늑대 2마리(잠행, 자기 턴 2번). 화염 발톱(앞 1칸 3타), 소각의 늑대(주변 8칸 4타).' },
  10076: { ko: '그림자 충격', sp: { k: 'erode', n: 2 } },
  10081: { ko: '암흑 탄환' },
  10017: { ko: '달물의 실' },
  10032: { ko: '필사의 보호', kind: 'shield', tg: { t: 'allyLow', r: 3 }, shT: 3, bvKey: 'ST:ShieldByDefence' },
  10039: { ko: '별 가르기' }, 10073: { ko: '강력 돌격' }, 10079: { ko: '신성 정화' },
  10063: { ko: '아수라의 손아귀', ...B('nextDoom', 2, 'self'), bvKey: 'ST:StatusDmgAddPer', note: '다음 대미지 전투 스킬: 파멸 대미지 + 대미지 증가.' },
  10065: { ko: '일식 베기' }, 10069: { ko: '파멸의 칼날' },
  10074: { ko: '사냥꾼의 심판', tg: { t: 'TQ', r: 4, ar: 1 }, pull: 'c', hits: 3, useC2: 1, note: '대상을 끌어당긴 뒤 3회 타격으로 단순화.' },
  10086: { ko: '질풍의 춤', ...B('spdUp', 2, 'allies', { r: 3, src: 'spd', move: 2 }), bvKey: 'ST:StatusAdd1' },
  10037: { ko: '신의 분노', tg: { t: 'S', r: 4 }, hits: 1, sp: { k: 'rand', n: 16, r: 3, min: 3, decay: 0.4 } },
  10057: { ko: '울부짖는 허리케인' },
  10062: { ko: '물의 소용돌이', tg: { t: 'T', r: 4, ar: 2 }, pull: 'a' },
  10070: { ko: '유성 화염', eff: [], burn: { p: 0.6, t: 3 }, trig: 11600, note: '게임 자료로 반영: 맞힌 3×3 칸마다 60% 확률로 작열 바닥(시전자 턴 3번). 적이 그 칸에 들어서거나 그 위에서 턴을 시작하면 불 원소 대미지(유닛마다 턴당 1회).' },
  10098: { ko: '화염 폭발' },
  10040: { ko: '심연의 손' }, 10064: { ko: '마나 폭발' },
  10071: { ko: '물방울 정령 소환', kind: 'none', note: '게임 자료로 반영: 후방 2칸에 늪 도룡뇽(잠행, 자기 턴 5번). 이슬방울(5칸 내 아군 1명), 안개 증기(3칸 내 아군 모두) — 치유량은 도룡뇽 최대 생명력 기준.' },
  10078: { ko: '종결의 그림자', sp: { k: 'erode', n: 3 } },
  10080: { ko: '광란의 토템', kind: 'none', note: '게임 자료로 반영: 4칸 안, 아군이 가장 많이 들어오는 칸에 토템(잠행, 자기 턴 5번). 투지: 4칸 내 다른 아군 공격력 +12%. 고무: 4칸 내 아군 1명의 다음 턴을 20% 앞당김.' },
  10047: { ko: '지진 해일' },
  10082: { ko: '소용돌이 칼날', sp: { k: 'dmgShield', v: 0.2, cap: 0.5, t: 2 } },
  10083: { ko: '빛의 검진', kind: 'buff', buff: { st: 'swords', t: 99, to: 'self', n: 4 }, pre: 1, note: '전투 스킬에 맞을 때마다 광검 1개로 반격(공격자 주변 1칸).' },
  10084: { ko: '견제의 일격' }, 10085: { ko: '환영 칼날' }, 10099: { ko: '분노의 대소용돌이' },
  10068: { ko: '지옥불 진혼곡', kind: 'buff', buff: { st: 'hot', t: 2, to: 'self' }, dispel: 2, note: '2턴 동안 턴 시작 시 자신에게 치유.' },
  10088: { ko: '칼날 폭풍' }, 10089: { ko: '영혼 꿰뚫기' },
  10100: { ko: '명멸검', sp: { k: 'recast', p: 0.6, max: 2 } },
  10101: { ko: '섬화', tg: { t: 'S', r: 2 } },
  10104: { ko: '공포의 그림자' },
  10002: { ko: '별빛 폭발' }, 10056: { ko: '흐르는 파멸' },
  10091: { ko: '바람칼 나선', eff: [{ k: 'lacer', p: 0.4, t: 1 }], trig: 11950, note: '게임 자료로 반영: 열상(1턴) — 걷기·돌진·넉백·끌림으로 움직일 때마다 시전자의 바람 원소 대미지.' },
  10092: { ko: '진형 파괴', ...B('atkUp', 2, 'allies', { r: 3, src: 'atk', adv: 0.5 }), bvKey: 'ST:StatusAdd1' },
  10093: { ko: '심판의 천둥' },
  10102: { ko: '보호의 룬', ...B('dmgRed', 3, 'self'), bvKey: 'ST:StatusDmgReducePer' },
  10059: { ko: '혼돈의 룬' },
  10077: { ko: '영혼의 가호', ...B('dmgRed', 99, 'allyLow', { r: 5 }), bvKey: 'ST:StatusDmgReducePer', note: '영능 표식(게임 자료: 지속 시간 없음): 받는 대미지 감소가 전투 내내 유지되고 다시 걸면 덮어씁니다. 표식의 고정 피해 감소분은 반영하지 않습니다.' },
  10095: { ko: '바위 렉스 소환', kind: 'none', note: '소환수의 게임 자료(능력치·스킬)가 공개되지 않아 시뮬레이션에 반영하지 않습니다.' },
  10096: { ko: '회복의 비', kind: 'heal', sp: { k: 'lowBonus', th: 0.5, v: 0.2 } },
  10097: { ko: '미끼 분신', kind: 'none', note: '게임 자료로 반영: 6칸 내 적 1명(큰 몸집 → 낮은 생명 순)과 연결된 분신을 앞에 세웁니다(그 적 편, 시전자 턴 3번). 분신이 잃은 생명만큼 연결된 적도 고정 대미지로 잃고, 아군은 분신을 우선 노립니다.' },
  10103: { ko: '암흑 성폭' },
  10067: { ko: '최후의 저항' },
  10105: { ko: '첫 빛', kind: 'dmg', tg: { t: 'TQ', r: 4, ar: 1 }, sp: { k: 'shieldBurst' }, note: '보유 실드를 모두 소모해 그 양에 비례한 대미지.' },
  10106: { ko: '여명 폭발', note: '2번째 계수(SkillAttack2)는 사용하지 않습니다.' },
  10107: { ko: '신성한 광채' },
  10108: { ko: '성화된 영혼', ...B('dmgRed', 2, 'allies', { r: 4 }), bvKey: 'ST:StatusDmgReducePer' },
  10109: { ko: '강철 연참' },
  10087: { ko: '공중 파쇄' },
  10090: { ko: '밤의 저주', note: '혈원(피격 시 공격자 치유)은 게임 자료에 치유량이 없어 반영하지 않습니다.' },
  10110: { ko: '파쇄의 춤' },
  10111: { ko: '태양 폭풍', sp: { k: 'then', tg: { t: 'A', r: 2 }, hits: 1 } },
  10112: { ko: '빙하의 노래' },
  10113: { ko: '그림자 종말', tg: { t: 'S', r: 1 }, sp: { k: 'killRecast', max: 4 } }, // teleports next to an enemy within 5 (leap 5)
  10094: { ko: '폭발 정령', kind: 'none', note: '전방 2칸 양옆에 불꽃요정 2개(최대 3턴). 시전자 턴이 끝날 때 2칸 안에 적이 있으면 터져 범위 안 모든 적에게 불 원소 대미지(시전자의 전투 스킬 대미지). 거리 기준은 요정 위치로 가정했습니다.' },
  10114: { ko: '서리 가시' }, 10115: { ko: '진홍 소용돌이' }, 10116: { ko: '폭풍 광시곡' },
  10117: { ko: '빛의 폭발', sp: { k: 'chain', n: 6, r: 4 } },
  10118: { ko: '쌍둥이 돌풍' },
  10119: { ko: '탈라손 소환', kind: 'none', note: '소환수의 게임 자료(능력치·스킬)가 공개되지 않아 시뮬레이션에 반영하지 않습니다.' },
  10120: { ko: '영혼 수확', sp: { k: 'execute', step: 0.05, max: 0.5 } },
  10121: { ko: '저주 폭발', sp: { k: 'perDebuff', max: 3 } },
  10122: { ko: '절망의 그림자', eff: [{ k: 'randDebuff', p: 0.7, t: 2 }] },
  10123: { ko: '광휘의 리듬', kind: 'heal', tg: { t: 'allyLow', r: 6 }, sp: { k: 'healChain', n: 5, decay: 0.35 } },
  10124: { ko: '공허의 영창', kind: 'none', note: '룬 2턴: 5칸 안의 적이 전투 스킬을 쓸 때마다 그 적에게 어둠 원소 대미지 1회, 침식(어둠 지속 대미지)을 지녔으면 1회 즉시 발동.' },
};

const secRe = /<section class="panel" id="cls-([^"]+)"[\s\S]*?(?=<section class="panel" id="cls-|<\/body>)/g;
const SKILLS = [];
let sm;
const rChecks = [];
while ((sm = secRe.exec(skillsHtml))) {
  const cls = sm[1];
  if (!CLS_KEYS.has(cls)) continue;
  const artRe = /<article class="skill" id="skill-(\d+)"([^>]*)>([\s\S]*?)<\/article>/g;
  let a;
  while ((a = artRe.exec(sm[0]))) {
    const id = +a[1];
    if (!/sk-kind technique/.test(a[3])) continue;
    const en = strip(/<h4>([\s\S]*?)<\/h4>/.exec(a[3])?.[1] || '');
    const descHtml = /<p class="sk-desc">([\s\S]*?)<\/p>/.exec(a[3])?.[1] || '';
    const desc = strip(descHtml);
    const elm = /color:#[0-9a-f]{6}">(Physical|Wind|Water|Fire|Light|Dark)</i.exec(descHtml);
    const ds = /data-skill="([^"]*)"/.exec(a[2])?.[1];
    let data = null;
    try { data = ds ? JSON.parse(decode(ds)) : null; } catch { data = null; }
    const ov = OV[id] || {};
    if (!OV[id]) log('NO OVERLAY', id, en);
    const p = parseText(desc);
    const s = { id, cls, en, ko: ov.ko || en, el: elm ? EL[elm[1]] : 'none' };
    const tiers = (key) => (data && data.vals['1'] && data.vals['1'][key] != null ? TIER_RANKS.map((r) => data.vals[r][key]) : null);
    const lm = (key) => (data && data.lmult && data.lmult['1'] && data.lmult['1'][key] != null ? data.lmult['1'][key] : 0);
    if (data) {
      // verify the common rank progression of flat multipliers
      for (const key of Object.keys((data.lmult || {})['1'] || {})) {
        const base = data.lmult['1'][key];
        const R = []; for (let r = 1; r <= 34; r++) R.push(data.lmult[r][key] / base);
        if (!RANK_R) RANK_R = R.map((x) => +x.toFixed(4));
        const dev = Math.max(...R.map((x, i) => Math.abs(x / RANK_R[i] - 1)));
        if (dev > 0.01 && !key.startsWith('ST:')) rChecks.push(`${id} ${key} dev ${dev.toFixed(3)}`);
      }
      // verify coefficient only changes by quality
      for (const key of Object.keys(data.vals['1'] || {})) {
        for (let r = 1; r <= 34; r++) if (data.vals[r][key] !== data.vals[TIER_RANKS[RANK_Q[r]]][key]) { rChecks.push(`${id} ${key} varies within quality at rank ${r}`); break; }
      }
      const c1 = tiers('SkillAttack1'), c2 = tiers('SkillAttack2');
      if (c1) { s.c = c1; s.fm = +lm('SkillFixedAttack1').toFixed(5); }
      if (c2) { s.c2 = c2; s.fm2 = +lm('SkillFixedAttack2').toFixed(5); }
      const cd = data.vals['1'].CD; if (cd) s.cd = cd;
      const hv = tiers('SkillCureByHp'); if (hv) { s.hv = hv; s.hfm = +lm('SkillFixedCure').toFixed(5); }
      const g = Object.values(data.lgroup || {})[0]; if (g) s.g = g;
      if (ov.bvKey) {
        s.bv = tiers(ov.bvKey);
        const fk = { 'ST:ShieldByDefence': 'ST:SkillFixedShield', 'ST:StatusAdd1': 'ST:StatusFixedAdd1' }[ov.bvKey];
        // flat part of buff/shield values: its own rank progression, so keep one value per quality tier
        const fkey = fk && lm(fk) ? fk : (ov.bvKey === 'ST:StatusAdd1' && lm('ST:StatusFixedAdd2') ? 'ST:StatusFixedAdd2' : null);
        if (fkey) s.bfm = TIER_RANKS.map((r) => +data.lmult[r][fkey].toFixed(4));
      }
    }
    Object.assign(s, p);
    // hits split between Attack1 / Attack2
    if (s.c2 && s.c && s.hits > 1) { s.h2 = 1; s.hits -= 1; }
    else if (s.c2 && !s.c) { s.c = s.c2; s.fm = s.fm2; delete s.c2; delete s.fm2; }
    else if (s.c2 && s.hits === 1) { delete s.c2; delete s.fm2; }
    for (const [k, v] of Object.entries(ov)) if (!['ko', 'bvKey', 'useC2'].includes(k)) s[k] = v;
    // ranged Technique that keeps its distance (SkillAiCfg: RangeType Far, not DontKeepDistance): on the turn's last
    // cast the AI picks the cell farthest from the nearest enemy among those hitting the most targets
    { const g = DUELSK.get(id); if (g && g.ec && g.ec.rangeType === 'Far' && !g.ec.dontKeepDistance) s.kd = 1; }
    // multi-hit on large targets: the game's hit configs (one hit per config that touches the body)
    if (s.multi && PARTS[id]) { s.parts = PARTS[id].map((p) => p.map(([x, f]) => [x, f + (FWD0[id] || 0)])); }
    if (s.eff && !s.eff.length) delete s.eff;
    if (!s.kind) s.kind = s.c && s.tg ? 'dmg' : s.hv ? 'heal' : 'none';
    if (s.kind === 'heal' && !s.tg) s.tg = { t: 'allyLow', r: 7 };
    if (s.kind === 'dmg' && !s.tg) { log('NO TARGETING', id, en, '::', desc); s.kind = 'none'; }
    if (s.kind === 'none' && !s.note) { s.note = '효과가 시뮬레이션에 반영되지 않습니다.'; log('UNMODELLED', id, en); }
    SKILLS.push(s);
    log(`SK ${id} ${en} [${s.kind}] el=${s.el} hits=${s.hits}${s.h2 ? '+' + s.h2 : ''} cd=${s.cd || 0}${s.zi ? ' zi' : ''}${s.pre ? ' pre' : ''} tg=${JSON.stringify(s.tg || null)}${s.leap ? ' leap' + s.leap : ''}${s.pull ? ' pull:' + s.pull : ''}${s.doom ? ' doom' : ''} eff=${JSON.stringify(s.eff || [])} sp=${JSON.stringify(s.sp || null)} buff=${JSON.stringify(s.buff || null)} g=${s.g} bv=${s.bv ? s.bv[0] : ''}`);
  }
}
log('RANK_R', JSON.stringify(RANK_R));
log('rank checks', rChecks.length, rChecks.slice(0, 20).join(' ; '));

/* ───────────── monsters ───────────── */
const eidx = J('enemies_index.json');
const esk = J('enemy_skills.json');
const KO_MOB = {
  Boar: '멧돼지', 'Stink Bomb': '악취 폭탄', 'Sylvanwolf Bruiser': '숲늑대 싸움꾼', 'Saber Rabbit': '칼날 토끼', 'Sylvanwolf Flinger': '숲늑대 투석꾼',
  'Waterflow Spider': '물거미', Owl: '올빼미', 'Sylvanwolf Shaman': '숲늑대 주술사', 'Sickle Mantis': '낫 사마귀', 'Antlered Phantom': '뿔 달린 환영',
  'Bear Warrior': '곰 전사', 'Sylvanwolf Chieftain': '숲늑대 족장', 'Colossal Stink Bomb': '거대 악취 폭탄', 'Colossal Waterflow Spider': '거대 물거미',
  'Shielded Sylvanwolf Warrior': '방패 숲늑대 전사', Golem: '골렘', 'Spider Queen': '거미 여왕',
  'Steam Lobster': '증기 가재', 'Mech Eagle': '기계 독수리', 'Rockwolf Bruiser': '바위늑대 싸움꾼', 'Rockwolf Flinger': '바위늑대 투석꾼', 'Mech Serpent': '기계 뱀',
  'Rockwolf Rider': '바위늑대 기수', 'Rockwolf Shielder': '바위늑대 방패병', 'Rockwolf Sentinel': '바위늑대 파수꾼', 'Hot Spring Crab': '온천 게',
  'Shielded Rockwolf Warrior': '방패 바위늑대 전사', 'Sand Mantis': '모래 사마귀', 'Mine Meerkat': '광산 미어캣', 'Colossal Cactus': '거대 선인장',
  'Cactus Spiker': '가시 선인장', 'Mineborn Scorpion': '광산 전갈', Mechosaurus: '기계 공룡', 'Regal Cactus': '제왕 선인장', 'Fire Gem Bull': '화염석 황소',
  'Great Fire Slime': '큰 불 슬라임', 'Great Water Slime': '큰 물 슬라임', 'Cyclopean Geocrusher': '외눈 대지파쇄자', 'Coal Ball': '석탄 덩이',
  Frogmon: '개구리몬', 'Chochin Obake': '초롱 요괴', 'Tidewolf Bruiser': '물결늑대 싸움꾼', 'Tidewolf Flinger': '물결늑대 투석꾼', Fishling: '물고기 병사',
  'Tidewolf Shielder': '물결늑대 방패병', 'Tidewolf Sentinel': '물결늑대 파수꾼', 'Blue Boar': '푸른 멧돼지', 'Tidewolf Rider': '물결늑대 기수', Shellsprite: '조개 정령',
  'Fox Spirit': '여우 정령', Umibozu: '우미보즈', Dorotabo: '도로타보', 'Beetle Samurai': '풍뎅이 사무라이', 'Rhinoceros Beetle': '장수풍뎅이', Vinegeist: '덩굴 유령',
  Gangi: '간기 동자', 'Nine-Tailed Fox': '구미호', Nue: '누에', 'Karasu Tengu': '까마귀 텐구', Kamaitachi: '카마이타치', Wanyudo: '와뉴도', 'Aqua Shaman': '물의 주술사',
  Kappa: '캇파', 'Armored General': '갑주 장군', 'Amaterasu Fragment': '아마테라스의 파편',
  Cloudshell: '구름 조개', 'Pit Viper': '살무사', 'Fire Rat': '불쥐', Pyrohound: '화염 사냥개', 'Dusty Puppet': '먼지 인형', 'Dusty Sage': '먼지 현자', Deer: '사슴',
  'Scaled Toad': '비늘 두꺼비', Qinyuan: '흠원', 'Horned Toad': '뿔 두꺼비', Bifang: '필방', Strawman: '허수아비', Clayling: '진흙 인형',
  'Dusty Treasure Hoarder': '먼지 보물지기', 'Dusty Dancing Lion': '먼지 사자춤꾼', Ginsengling: '인삼 정령', Taowu: '도올', 'Bronze Face': '청동 가면',
  'Bronze Burner': '청동 향로', 'Feywolf Bruiser': '요정늑대 싸움꾼', 'Feywolf Flinger': '요정늑대 투석꾼', 'Feywolf Rider': '요정늑대 기수', 'Feywolf Shaman': '요정늑대 주술사',
  'Bronze Cauldron': '청동 솥', 'Feywolf Shielder': '요정늑대 방패병', 'Feywolf Sentinel': '요정늑대 파수꾼', 'Bronze Sword Soul': '청동 검혼', Netherlion: '명계 사자',
  Suanni: '산예', 'Bronze Mirror': '청동 거울', 'Dusty Arbiter': '먼지 심판관', 'White Ape': '흰 원숭이', Thunderling: '번개 정령', Inkape: '먹물 원숭이', 'Xin Huan': '신환',
  'Quadhorn Goat': '네뿔 염소', 'Frost Turtle': '서리 거북', 'Bronze Ox': '청동 황소', Swordlion: '검사자', 'Oathbound Guard': '맹세의 수호병',
};
const ARCHE = [
  [/wolf/i, 'wolf'], [/boar|bull|ox|goat|deer|rhino/i, 'boar'], [/rabbit|meerkat|rat|fox|hound|kamaitachi/i, 'critter'],
  [/spider|mantis|scorpion|beetle|crab|lobster/i, 'bug'], [/owl|eagle|tengu|bifang|nue/i, 'bird'],
  [/bomb|slime|coal|shell|umibozu|doro|clay|wanyudo/i, 'blob'], [/golem|mech|bronze|cauldron|mirror|geocrusher|general|guard|arbiter/i, 'golem'],
  [/shaman|phantom|geist|sage|puppet|spirit|obake|fragment|thunderling|hoarder|qinyuan|xin huan|gangi/i, 'spirit'],
  [/cactus|ginseng|straw|vine/i, 'plant'], [/serpent|viper|toad|frog|turtle|kappa|fish/i, 'reptile'],
  [/bear|ape|lion|taowu|suanni/i, 'brute'],
];
const MAP_DEF = [
  ['fa1', 'fantasia_fa1.json', '달안개 숲', 'Moonveil Woods', 'Blackiron1', '견습 I'],
  ['fa2', 'fantasia_fa2.json', '수수께끼 심연', 'Enigma Abyss', 'Bronze1', '정예 I'],
  ['fa3', 'fantasia_fa3.json', '구름용 소용돌이', 'Kumoryu Vortex', 'Silver1', '숙련 I'],
  ['fa4', 'fantasia_fa4.json', '봉마탑', 'Demonbind Tower', 'Gold1', '챔피언 I'],
];
const curveFiles = { 0: J('curve_0.json'), 1: J('curve_1.json'), 2: J('curve_2.json'), st: J('curve_st.json') };
const CURVES = {};
const MOBS = [];
const MAPS = [];
const mobIndex = new Map();
// monster elemental stats (affinity / aegis per element, mastery / resistance) for the PvE damage formula
const KEEP = ['MaxHp', 'Attack', 'Defence', 'Speed', 'CritRatePercent', 'CritPowerPercent', 'CritAvoidPercent', 'BlockPercent', 'BlockValuePercent', 'BlockAvoidPercent', 'DmgAddPercent', 'DmgReducePercent', 'EffectRate', 'EffectDodge',
  'ElementMaster', 'KongFuMaster', 'ElementResistance', 'KongFuResistance', 'WindDamageAdd', 'WaterDamageAdd', 'FireDamageAdd', 'LightDamageAdd', 'DarkDamageAdd', 'WindDamageReduce', 'WaterDamageReduce', 'FireDamageReduce', 'LightDamageReduce', 'DarkDamageReduce', 'PlayerSkillDmgReduceScale', 'ProSkillDmgReduceScale'];
let droppedSkills = 0, keptSkills = 0;
// the five per-element columns are usually identical: keep one (EleAdd / EleRed) when they are
function foldEle(out) {
  for (const [kind, name] of [['DamageAdd', 'EleAdd'], ['DamageReduce', 'EleRed']]) {
    const ks = ['Wind', 'Water', 'Fire', 'Light', 'Dark'].map((e) => e + kind);
    for (const part of ['c', 'v']) {
      if (!ks.every((k) => k in out[part])) continue;
      const first = JSON.stringify(out[part][ks[0]]);
      if (ks.every((k) => JSON.stringify(out[part][k]) === first)) { out[part][name] = out[part][ks[0]]; for (const k of ks) delete out[part][k]; }
    }
  }
}
const passiveUnparsed = {};
for (const [mid, file, ko, en, sr, rankKo] of MAP_DEF) {
  const d = J(file);
  const clsOf = {};
  for (const [key, def] of Object.entries(d.defs)) {
    const cls = eidx.rpg[def.pg][sr];
    clsOf[def.pg] = cls;
    if (!CURVES[cls]) {
      const cf = curveFiles[eidx.classFile[cls]];
      const cv = cf && cf[cls];
      if (!cv) { log('MISSING CURVE', cls, 'for', mid); continue; }
      const hi = Math.min(cv.hi, 320);
      const rows = cv.r.slice(0, hi - cv.lo + 1);
      const out = { lo: cv.lo, hi, c: {}, v: {} };
      cv.k.forEach((k, i) => {
        if (!KEEP.includes(k)) return;
        const col = rows.map((row) => (row ? row[i] : 0));
        if (col.every((x) => x === col[0])) { if (col[0] !== 0) out.c[k] = col[0]; } else out.v[k] = col;
      });
      foldEle(out);
      CURVES[cls] = out;
      log('curve', cls, `lv ${cv.lo}-${cv.hi}`, 'const', JSON.stringify(out.c), 'varying', Object.keys(out.v).join(','));
    }
    if (mobIndex.has(key)) { continue; }
    const fOdd = def.f.slice(4).filter((x, i) => x !== 10000 && x !== 0 && x != null);
    if (fOdd.length) log('mob', def.n, 'non-default secondary multipliers', JSON.stringify(def.f.slice(4)));
    const mob = { k: key, en: def.n, ko: KO_MOB[def.n] || def.n, ty: def.t === 'Boss' ? 2 : def.t === 'Elite' ? 1 : 0, map: mid, pg: def.pg, f: def.f.slice(0, 4), sk: [] };
    if (!KO_MOB[def.n]) log('NO KO NAME', def.n);
    mob.ar = (ARCHE.find(([re]) => re.test(def.n)) || [0, 'brute'])[1];
    if (Object.keys(def.x || {}).length) mob.x = def.x;
    for (const sid of def.sk) {
      const e = esk[Math.abs(sid)];
      if (!e) continue;
      const desc = strip(e.d);
      if (sid < 0) {
        (mob.pv = mob.pv || []).push(-sid); // passive (비전); modelled from tools/passives.mjs
        const m = /takes (\d+)% less (\w+) DMG and (\d+)% higher (\w+) DMG/.exec(desc);
        if (m && EL[m[2]] && EL[m[4]]) { mob.er = { [EL[m[2]]]: -m[1] / 100, [EL[m[4]]]: +m[3] / 100 }; }
        else passiveUnparsed[e.n] = desc.slice(0, 90);
        continue;
      }
      const p = parseText(desc);
      mobExtras(desc.replace(/(\d)\s*[×x]\s*(\d)/g, '$1×$2'), p);
      const elm = /color:#[0-9a-f]{6}\\?">(Physical|Wind|Water|Fire|Light|Dark)</i.exec(e.d);
      if (!p.tg || !['S', 'A', 'Q', 'F', 'T', 'TQ'].includes(p.tg.t) || !elm) { droppedSkills++; log('mob skill dropped:', def.n, '/', e.n, '::', desc.slice(0, 120)); continue; }
      keptSkills++;
      const s = { en: e.n, el: EL[elm[1]], ic: e.i, ...p };
      delete s.zi; delete s.pre;
      mob.sk.push(s);
    }
    if (!mob.sk.length) { mob.sk.push({ en: 'Attack', el: 'phy', hits: 1, tg: { t: 'S', r: 1 } }); log('mob with fallback skill', def.n); }
    mobIndex.set(key, mob);
    MOBS.push(mob);
  }
  const floors = d.fights.map((f) => {
    const row = [Math.round(f.lv * 10) / 10];
    for (const w of f.w) for (const e of w) row.push(e[0], e[1]);
    return row;
  });
  MAPS.push({ id: mid, ko, en, sr, rankKo, cls: clsOf, lvMin: floors[0][0], lvMax: floors[floors.length - 1][0], floors });
}
log('mobs', MOBS.length, 'skills kept', keptSkills, 'dropped', droppedSkills);
log('unknown statuses', JSON.stringify(unknownStatus));
log('passives unparsed', JSON.stringify(passiveUnparsed).slice(0, 1500));

const out = `// GENERATED by tools/build_data.mjs — do not edit by hand.
// Numbers are community-documented game facts (see CREDITS.md). Unofficial fan data.
export const MAXLV = ${MAXLV};
export const LV = ${JSON.stringify(LV)};
export const FLAT = ${JSON.stringify(FLAT)};
export const RANKS = ${JSON.stringify(RANKS)};
export const RANK_Q = ${JSON.stringify(RANK_Q.slice(1))};
export const RANK_R = ${JSON.stringify(RANK_R)};
export const CLASSES = ${JSON.stringify(CLASSES)};
export const SKILLS = ${JSON.stringify(SKILLS)};
export const MOBS = ${JSON.stringify(MOBS)};
export const CURVES = ${JSON.stringify(CURVES)};
export const MAPS = ${JSON.stringify(MAPS)};
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
fs.writeFileSync(OUT.replace(/\.js$/, '.report.txt'), report.join('\n'));
console.log('wrote', OUT, (out.length / 1024).toFixed(1) + ' KB;', 'skills', SKILLS.length, 'mobs', MOBS.length, 'curves', Object.keys(CURVES).length, 'report lines', report.length);
