// Builds js/gamedata2.js: Korean client names, Charms (비법), Fantomon pets, extra encounters (daily dungeons, guild conquest, Hieromon).
// Usage: node tools/build_extra.mjs <wiki-dir> <extra-dir (pets.html, metahub_builder.html)> <out-file>
// Inputs are locally saved community pages (see CREDITS.md); they are only parsed as data.
import fs from 'node:fs';
import path from 'node:path';
import { PV } from './passives.mjs';
import { PFX } from './pets_fx.mjs';
import { moveAndSize } from './skilltext.mjs';

const [, , DL, DL2, OUT] = process.argv;
const J = (f) => JSON.parse(fs.readFileSync(path.join(DL, f), 'utf8'));
const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&times;/g, '×').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&[lr]saquo;/g, '');
const strip = (s) => dec(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const rep = []; const log = (...a) => rep.push(a.join(' '));
const TIER = [1, 3, 6, 10, 16, 24];
const EL = { Physical: 'phy', Wind: 'wind', Water: 'water', Fire: 'fire', Light: 'light', Dark: 'dark', Chaos: 'chaos' };
const elOf = (html) => { const m = /(Physical|Wind|Water|Fire|Light|Dark|Chaos)(?:<\/span>)? (?:Doom |True |Crit )?DMG/.exec(html) || /(Physical|Wind|Water|Fire|Light|Dark|Chaos)/.exec(html); return m ? EL[m[1]] : 'none'; };

/* ── text → targeting/effects (same rules as build_data.mjs) ── */
const STATUS = { 'Armor Break 2': ['abreak', 0.3], 'Armor Break 1': ['abreak', 0.15], 'Weakened 1': ['weak', 0.15], 'Weakened 2': ['weak', 0.3], 'Slow 1': ['slow', 0.15], 'Slow 2': ['slow', 0.3], Slow: ['slow', 0.15], Stun: ['stun'], Frozen: ['freeze'], Immobilize: ['immob'], Rimebound: ['immob'], Taunt: ['taunt'], Frenzy: ['frenzy'], Blind: ['blind'], Cold: ['cold'], Wet: ['wet'], Erosion: ['dot'], Poison: ['dot'], Bleed: ['dot'], Burn: ['dot'], Vulnerability: ['vuln', 0.25], Fragility: ['vuln', 0.25] };
function parseText(d) {
  // strip() turns tags into spaces, which splits "3<b>×</b>2" / "1<b>-grid</b>" / "a<b>100%</b>" — glue them back
  d = d.replace(/(\d)\s*[×x]\s*(\d)/g, '$1×$2').replace(/(\d) -(grid|row)/g, '$1-$2').replace(/\ba(\d)/g, 'a $1').replace(/\+ (\d)/g, '+$1');
  const o = { hits: 1, eff: [] }; let m;
  if ((m = /DMG (once|twice|(\d+) times)/.exec(d))) o.hits = m[1] === 'once' ? 1 : m[1] === 'twice' ? 2 : +m[2];
  if ((m = /(?:star rays|in an area) within (\d+) grids? of the caster/.exec(d))) o.tg = { t: 'A', r: +m[1] + (/rays/.test(m[0]) ? 1 : 0) };
  else if ((m = /all (?:enemies|units) (?:within|in) (?:a |an )?(\d+)-(?:grid|row) (?:cone|trapezoid) area in front/.exec(d))) o.tg = { t: 'F', w: +m[1] % 2 ? +m[1] : +m[1] + 1, h: +m[1] };
  else if (/DMG (?:once|twice|\d+ times) to all enemies\./.test(d)) o.tg = { t: 'A', r: 99 };
  else if ((m = /to random enemies within (\d+) grids?/.exec(d))) o.tg = { t: 'A', r: +m[1] };
  else if ((m = /[Ss]elects a (?:grid|target) within (\d+) grids?(?: of the caster)?/.exec(d))) { const r = +m[1]; let a; if ((a = /within a (\d+)-grid square area (?:of|around) th(?:e|at) target/.exec(d))) o.tg = { t: 'TQ', r, ar: +a[1] }; else if ((a = /within (\d+) grids? of (?:the target|each target)/.exec(d))) o.tg = { t: 'T', r, ar: +a[1] }; else o.tg = { t: 'T', r, ar: 1 }; }
  else if ((m = /1 enemy within (\d+) to (\d+) grids?/.exec(d))) o.tg = { t: 'S', min: +m[1], r: +m[2] };
  else if ((m = /1 enemy within (\d+) grids?/.exec(d))) o.tg = { t: 'S', r: +m[1] };
  else if ((m = /lowest HP within (\d+) grids?[\s\S]*?(\d+)-grid square/.exec(d))) o.tg = { t: 'TQ', r: +m[1], ar: +m[2] };
  else if ((m = /random grids within (\d+) grids?/.exec(d))) o.tg = { t: 'T', r: +m[1], ar: 1 };
  else if (/^(?:Sequentially )?[Dd]eals .*grid area (?:respectively )?in front/.test(d) && (m = [...d.matchAll(/(\d+)×(\d+)/g)]).length > 1) { const l = m[m.length - 1]; o.tg = { t: 'F', w: +l[1], h: +l[2] }; o.hits = Math.max(o.hits, m.length); } // expanding waves → largest area
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grids?(?: area)? (?:in front|in the front|to the caster|along|in t)/.exec(d)) || (m = /(?:missiles|bolts) within a (\d+)[×x](\d+) grid area in front/.exec(d))) o.tg = { t: 'F', w: +m[1], h: +m[2] };
  else if (/all enemies (?:within|in) (?:a |an )?\d+[×x]\d+ grid(?: area)? (?:around|on both sides)/.test(d)) o.tg = { t: 'Q', r: 1 };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grid(?: area)? of the caster/.exec(d))) o.tg = { t: 'F', w: Math.min(+m[1], +m[2]), h: Math.max(+m[1], +m[2]) };
  else if ((m = /all enemies within (?:a )?(\d+)-grid (square|circular)? ?area/.exec(d))) o.tg = { t: m[2] === 'square' ? 'Q' : 'A', r: +m[1] };
  else if ((m = /all enemies (?:within|in) (\d+) grids?/.exec(d))) o.tg = { t: 'A', r: +m[1] };
  else if ((m = /(?:bolts|times) within (\d+) grids? of the caster/.exec(d))) o.tg = /all enemies/.test(d) ? { t: 'A', r: +m[1] } : { t: 'S', r: +m[1] };
  else if (/1 enemy within a certain range/.test(d)) o.tg = { t: 'S', r: 2 };
  else if ((m = /1 enemy within a (\d+)[×x](\d+) grid area/.exec(d))) o.tg = { t: 'S', r: Math.max(+m[1], +m[2]) };
  if ((m = /(?:Leaps|Teleports|Moves) to (?:any|an) empty (?:space|grid) within (\d+) grids?/.exec(d))) o.leap = +m[1];
  if (/pulls? them to the caster's location/.test(d)) o.pull = 'c'; else if (/pull(?:s|ing) them to (?:the target grid|its center)/.test(d)) o.pull = 'a';
  if (/Doom DMG/.test(d)) o.doom = 1;
  if ((m = /(\d+)% Lifesteal/.exec(d))) o.ls = +m[1] / 100; else if (/Lifesteal effect/.test(d)) o.ls = 0.1;
  const re = /(\d+)% (?:base )?chance to inflict (?:(\d+) stacks? of )?([A-Z][a-z]+(?: [A-Z][a-z]+)?(?: \d)?)(?: for (\d+) turns?)?/g;
  while ((m = re.exec(d))) { const s = STATUS[m[3]]; if (!s) continue; const e = { k: s[0], p: +m[1] / 100, t: m[4] ? +m[4] : s[0] === 'dot' ? 3 : s[0] === 'blind' ? 2 : 1 }; if (s[1]) e.v = s[1]; if (s[0] === 'dot') e.el = 'dark'; o.eff.push(e); }
  if ((m = /(\d+)% (?:base )?chance to reduce their (DEF|ATK|SPD|DMG)(?: by (\d+)%)? for (\d+) turns?/.exec(d))) o.eff.push({ k: { DEF: 'abreak', ATK: 'weak', SPD: 'slow', DMG: 'weak' }[m[2]], v: (+m[3] || 15) / 100, p: +m[1] / 100, t: +m[4] });
  moveAndSize(d, o);
  if (!o.eff.length) delete o.eff;
  return o;
}

/* ── Korean client names (optional) ── */
const KO_SKILL = {}, KO_CLASS = {}, KO_DESC = {};
// skill database page: official KR client names + descriptions for every technique and charm (by skill ID)
const dbPath = path.join(DL2, 'metahub_database.html');
if (fs.existsSync(dbPath)) {
  const h = fs.readFileSync(dbPath, 'utf8');
  const ls = /<script[^>]*id="sxs-locale-js-before"[^>]*>([\s\S]*?)<\/script>/.exec(h)[1];
  const loc = JSON.parse(ls.slice(ls.indexOf('{'), ls.lastIndexOf('}') + 1)).game;
  for (const [id, v] of Object.entries(loc.skills || {})) { if (v.name) KO_SKILL[id] = v.name; if (v.description) KO_DESC[id] = v.description; }
  for (const [k, v] of Object.entries(loc.classes || {})) if (v && v.name && /[가-힣]/.test(v.name)) KO_CLASS[k] = v.name;
}
const mhPath = path.join(DL2, 'metahub_builder.html');
if (fs.existsSync(mhPath)) {
  const mh = fs.readFileSync(mhPath, 'utf8');
  const bd = JSON.parse(/<script[^>]*id="sxs-builder-data"[^>]*>([\s\S]*?)<\/script>/.exec(mh)[1]);
  for (const s of Array.isArray(bd.skills) ? bd.skills : Object.values(bd.skills)) if (s.text_language === 'ko' && s.name && !KO_SKILL[s.id]) KO_SKILL[s.id] = s.name;
  for (const c of Object.values(bd.classes)) if (c.name && /[가-힣]/.test(c.name) && !KO_CLASS[c.key]) KO_CLASS[c.key] = c.name;
}
log('ko skill names', Object.keys(KO_SKILL).length, 'descriptions', Object.keys(KO_DESC).length, 'classes', Object.keys(KO_CLASS).length);

/* ── flat-value curves ── */
const skillsHtml = fs.readFileSync(path.join(DL, 'skills.html'), 'utf8');
const sd = JSON.parse(/<script[^>]*id="skilldata"[^>]*>([\s\S]*?)<\/script>/.exec(skillsHtml)[1]);
const curves = J('curves.json');
const subrankOf = (lv) => { if (lv <= 10) return 'Norank'; const t = ['Blackiron', 'Bronze', 'Silver', 'Gold', 'Saint', 'Legend', 'Angel']; const i = Math.min(20, Math.floor((lv - 11) / 10)); return t[Math.floor(i / 3)] + ((i % 3) + 1); };
const rowAt = (g, lv) => { const lp = sd.lpidOf[g] && sd.lpidOf[g][subrankOf(lv)]; return (lp && curves[lp] && curves[lp][lv]) || null; };
const FLAT2 = {};
for (const g of ['7', '11']) { const a = [0]; for (let l = 1; l <= 250; l++) { const r = rowAt(g, l); a[l] = r && r.SkillFixedAttack1 ? r.SkillFixedAttack1 : a[l - 1] || 0; } FLAT2[g] = a; }
// ratio of charm flat-stat curves to the engine's level tables
const RATIO = {};
const gd1 = fs.readFileSync(path.join(path.dirname(OUT), 'gamedata.js'), 'utf8');
const LVT = JSON.parse(/export const LV = (\{.*?\});/.exec(gd1)[1]);
const BASEKEY = (k) => (k === 'Attack' ? 'atk' : k === 'Defence' ? 'def' : k === 'MaxHp' ? 'hp' : k === 'Speed' ? 'spd' : /DamageAdd/.test(k) ? 'aff' : k === 'EffectRate' ? 'eres' : 'mas');
function ratioOf(key, g) {
  const id = key + '|' + g; if (RATIO[id] != null) return RATIO[id];
  // relative to the engine's per-level base tables (LV.atk/def/hp/spd/mas/aff/eres)
  const bk = BASEKEY(key), rs = [];
  for (const lv of [25, 45, 65, 85, 100, 115, 128]) { const r = rowAt(g, lv); if (r && r[key] && LVT[bk][lv]) rs.push(r[key] / LVT[bk][lv]); }
  const v = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  if (rs.length && Math.max(...rs) / Math.min(...rs) > 1.35) log('ratio not constant', key, g, bk, rs.map((x) => x.toFixed(3)).join('/'));
  if (!rs.length) log('no ratio for', key, g);
  return (RATIO[id] = [+v.toFixed(4), bk]);
}

/* ── charms ── */
const CH = {
  10500: [['stat', 'critRate', 'CritRatePercent']], 10501: [['flat', 'def', 'Defence']], 10505: [['flat', 'hp', 'MaxHp']], 10507: [['stat', 'blockRate', 'BlockPercent']],
  10510: [['flat', 'spd', 'Speed']], 10524: [['flat', 'atk', 'Attack']], 10535: [['flat', 'phyMastery', 'KongFuMaster']], 10537: [['react', 'hurt', 0.5, 'phy', 'atk', 2]],
  10539: [['shield', 'below50', 'def', 'ST:ShieldByDefence', 2]], 10544: [['ls', 'ST:SuckHpByDamage']], 10546: [['spdKill', 'ST:SpeedScale']], 10562: [['proc', 'hit', 0.4, 'wind', 0]],
  10571: [['ironFort', 'ST:StatusAdd1']],
  10512: [['proc', 'hit', 0.25, 'wind', 0]], 10513: [['shield', 'pre', 'hp', 'ST:ShieldByTargetHp', 99]], 10520: [['aff', 'fire', 'FireDamageAdd']], 10521: [['aff', 'water', 'WaterDamageAdd']],
  10522: [['aff', 'wind', 'WindDamageAdd']], 10550: [['flat', 'hp', 'MaxHp']], 10554: [['stat', 'critRate', 'CritRatePercent']], 10555: [['flat', 'mastery', 'ElementMaster']],
  10559: [['flat', 'effHit', 'EffectRate']], 10560: [['proc', 'hit', 0.5, 'water', 0, { cond: 'water', eff: [{ k: 'freeze', p: 0.3, t: 1 }] }]], 10578: [['dmgUp', 'perDebuff3', 'ST:StatusDmgAddPer']],
  10583: [['flat', 'res', 'ElementResistance']],
  10509: [['dmgUp', 'eye', 'ST:StatusDmgAddPer']], 10516: [['dmgUp', 'vsDebuffed', 'ST:StatusDmgAddPer']], 10540: [['atkUpShielded', 'ST:AttackScale']], 10541: [['react', 'block', 1, 'phy', 'def', 99]],
  10518: [['undying', 1]], 10564: [['dmgUp', 'perCast4', 'ST:StatusDmgAddPer']], 10582: [['dmgRed', 'perLost15', 'ST:StatusDmgReducePer']], 10588: [['stat', 'critDmg', 'CritPowerPercent']],
  10502: [['proc', 'hit', 0.3, 'light', 0]], 10556: [['shield', 'below50once', 'hp', 'ST:ShieldByTargetHp', 2, { dodge: 2 }]], 10602: [['harmony', 'ST:ElementMaster']],
  10514: [['stat', 'healUp', 'CureAddPercent']], 10565: [['inflict', 0.4, { k: 'dot', el: 'dark', t: 3 }, 'dark']],
  10542: [['dmgRed', 'stone', 'ST:StatusDmgReducePer']], 10567: [['reflect', 'ST:DamageByDamage']], 10572: [['regen']], 10581: [['undying', 0]], 10587: [['stat', 'blockEff', 'BlockValuePercent']],
  10519: [['critHeal']], 10545: [['dmgUp', 'singleHit', 'ST:StatusDmgAddPer']], 10547: [['dmgUp', 'perLost15', 'ST:StatusDmgAddPer']], 10574: [['mark10']], 10590: [['soulfire', 'ST:StatusDmgReducePer']],
  10525: [['aff', 'light', 'LightDamageAdd']], 10577: [['proc', 'hit', 0.5, 'light', 0, { eff: [{ k: 'blind', p: 0.3, t: 2 }] }]], 10604: [['flat', 'mastery', 'ElementMaster'], ['rapidCast']],
  10528: [['aff', 'dark', 'DarkDamageAdd']],
  10575: [['soulProt']], 10592: [['dmgRed', 'vsTaunted', 'ST:StatusDmgReducePer']], 10593: [['flat', 'def', 'Defence']], 10606: [['aff', 'water', 'WaterDamageAdd'], ['inflict', 1, { k: 'cold', t: 2 }, 'water']], 10607: [['aura']],
  10543: [['proc', 'crit', 1, 'fire', 1]], 10568: [['defIgnore', 'ST:StatusIgnoreDefence']], 10594: [['dmgUp', 'tgtLost15', 'ST:StatusDmgAddPer']], 10609: [['dmgUp', 'fewFoes', 'ST:StatusDmgAddPer'], ['dmgRed', 'manyFoes', 'ST:StatusDmgReducePer']],
  10503: [['proc', 'crit', 1, 'fire', 2, { cond: 'fire' }]], 10598: [['aff', 'wind', 'WindDamageAdd']], 10599: [['critStack', 'fire', 'ST:CritRatePercent']],
  10579: [['dmgRed', 'attackerDebuffed', 'ST:StatusDmgReducePer']], 10601: [['stat', 'healUp', 'CureAddPercent']],
  10614: [['reactInflict', 'block', { k: 'sigil', t: 2 }, 'ST:StatusDmgVulnerablePer']], 10617: [['dmgUp', 'turn3', 'ST:StatusDmgAddPer']],
  10619: [['proc', 'crit', 1, 'wind', 0]], 10620: [['dmgUp', 'tgtAbove70', 'ST:StatusDmgAddPer']],
  10596: [['aff', 'water', 'WaterDamageAdd']], 10624: [['thunder', 0.5]], 10626: [['dmgRed', 'always', 'ST:StatusDmgReducePer']], 10627: [['aff', 'fire', 'FireDamageAdd']],
  10630: [['aff', 'dark', 'DarkDamageAdd'], ['killSplash', 'dark', 1]], 10631: [['omen']], 10633: [['reactInflict', 'hurt', { k: 'dot', el: 'dark', t: 3, p: 0.5 }]],
};
const CLS18 = ['Zhanshi', 'Fashi', 'Huwei', 'Doushi', 'Shushi', 'Xianzhe', 'Dunjiashi', 'Kuangzhanshi', 'Modaoshi', 'Mishushi', 'Shouhuzhe', 'Zhengfuzhe', 'Huimiezhe', 'Zhangkongzhe', 'LegendShouhuzhe', 'LegendZhengfuzhe', 'LegendHuimiezhe', 'LegendZhangkongzhe'];
const CHARMS = [];
const secRe = /<section class="panel" id="cls-([^"]+)"[\s\S]*?(?=<section class="panel" id="cls-|<\/body>)/g; let sm;
while ((sm = secRe.exec(skillsHtml))) {
  if (!CLS18.includes(sm[1])) continue;
  const artRe = /<article class="skill" id="skill-(\d+)"([^>]*)>([\s\S]*?)<\/article>/g; let a;
  while ((a = artRe.exec(sm[0]))) {
    if (!/sk-kind charm/.test(a[3])) continue;
    const id = +a[1], en = strip(/<h4>([\s\S]*?)<\/h4>/.exec(a[3])[1]);
    const ds = /data-skill="([^"]*)"/.exec(a[2]); let data = null; try { data = ds ? JSON.parse(dec(ds[1])) : null; } catch { data = null; }
    const c = { id, cls: sm[1], en, ko: KO_SKILL[id] || en };
    const fx = CH[id];
    if (!fx || !data) { c.note = 1; CHARMS.push(c); continue; }
    const g = String(Object.values(data.lgroup || {})[0] || 1); c.g = +g;
    const v1 = (data.vals && data.vals['1']) || {};
    const tiers = (k) => TIER.map((r) => data.vals[r][k]);
    const lm = (k) => (data.lmult && data.lmult['1'] && data.lmult['1'][k]) || 0;
    c.fx = fx.map((f) => {
      const o = f.slice();
      if (f[0] === 'flat' || f[0] === 'aff' || f[0] === 'harmony') { const key = f[f.length - 1]; o[o.length - 1] = [+lm(key).toFixed(5), ...ratioOf(key.replace('ST:', ''), String((data.lgroup || {})[key] || g))]; }
      else for (let i = 1; i < o.length; i++) if (typeof o[i] === 'string' && v1[o[i]] != null) o[i] = tiers(o[i]);
      return o;
    });
    if (v1.SkillAttack1 != null) { c.c = tiers('SkillAttack1'); c.fm = +lm('SkillFixedAttack1').toFixed(5); }
    if (v1.SkillCureByHp != null) { c.hv = tiers('SkillCureByHp'); c.hfm = +lm('SkillFixedCure').toFixed(5); }
    CHARMS.push(c);
  }
}
log('charms', CHARMS.length, 'modelled', CHARMS.filter((c) => c.fx).length);
// IDs of techniques + charms of the 18 supported classes (limits what we ship)
const CLS18_IDS = new Set(CHARMS.map((c) => c.id));
for (const m of skillsHtml.matchAll(/<section class="panel" id="cls-([^"]+)"[\s\S]*?(?=<section class="panel" id="cls-|<\/body>)/g)) if (CLS18.includes(m[1])) for (const a of m[0].matchAll(/<article class="skill" id="skill-(\d+)"/g)) CLS18_IDS.add(+a[1]);
for (const id of Object.keys(KO_SKILL)) if (!CLS18_IDS.has(+id)) delete KO_SKILL[id];
log('shipped ko names', Object.keys(KO_SKILL).length, 'of', CLS18_IDS.size, 'ids; missing:', [...CLS18_IDS].filter((id) => !KO_SKILL[id]).join(','));

/* ── Fantomon ── */
// KR client names where the KR community wiki confirms them (나이트군·핌핌·보라몬·철하피·캘시·너굴너굴·멧돼지); the rest are transliterations
const KO_PET_OK = new Set(['Nyxarchon', 'Aegiswing', 'Zeioletus', 'Armopi', 'Kels', 'Mandragora', 'Boaro']);
const KO_PET = { Falko: '팔코', Boaro: '멧돼지', Mandragora: '너굴너굴', Zeioletus: '보라몬', Terragon: '테라곤', Sylvaerie: '실바에리', Kels: '캘시', Armopi: '철하피', Herbote: '허보트', Nyxarchon: '나이트군', Aegiswing: '핌핌', Pandarial: '판다리얼', Chomusuke: '쵸무스케', 'Cabbage Dog': '양배추 강아지', Prismora: '프리즈모라', 'Luminarch Steed': '루미나크 준마', Yoldra: '욜드라', Hexitty: '헥시티', Mumpkin: '멈프킨' };
const ROLE = { DPS: '딜러', Tank: '탱커', Support: '서포터' };
const PETS = [];
const petsPath = path.join(DL2, 'pets.html');
if (fs.existsSync(petsPath)) {
  const html = fs.readFileSync(petsPath, 'utf8');
  for (const a of html.matchAll(/<article class="pet" id="pet-(\d+)"[^>]*>([\s\S]*?)<\/article>/g)) {
    const h = a[2], en = strip(/<h3>([\s\S]*?)<\/h3>/.exec(h)[1]);
    const role = strip((/<dt>Role<\/dt><dd>([\s\S]*?)<\/dd>/.exec(h) || [])[1] || '');
    const bm = /HP (\d+)%[^A]*ATK (\d+)%[^D]*DEF (\d+)%[^S]*SPD (\d+)%/.exec(strip((/<dt>Battle base<\/dt><dd>([\s\S]*?)<\/dd>/.exec(h) || [])[1] || ''));
    const pet = { id: +a[1], en, ko: KO_PET[en] || en, ok: KO_PET_OK.has(en) ? 1 : 0, role: ROLE[role] || role, base: bm ? [+bm[1], +bm[2], +bm[3], +bm[4]] : [90, 100, 90, 100], skills: [] };
    const fx = PFX[en] || {};
    if (!PFX[en]) log(`PET ${en}: no entry in tools/pets_fx.mjs`);
    for (const p of h.matchAll(/<div class="phase">([\s\S]*?)(?=<div class="phase">|$)/g)) {
      const title = strip((/<h4>([\s\S]*?)<\/h4>/.exec(p[1]) || [])[1] || '');
      for (const s of p[1].matchAll(/<div class="petskill"([^>]*)>([\s\S]*?)(?=<div class="petskill"|$)/g)) {
        const name = strip((/<(?:h5|b|strong)[^>]*>([\s\S]*?)<\/(?:h5|b|strong)>/.exec(s[2]) || [])[1] || '');
        const descHtml = (/<p[^>]*>([\s\S]*?)<\/p>/.exec(s[2]) || [])[1] || s[2];
        const desc = strip(descHtml), txt = strip(s[2]);
        const ds = /data-skill="([^"]*)"/.exec(s[1]); let data = null; try { data = ds ? JSON.parse(dec(ds[1])) : null; } catch { data = null; }
        const v1 = (data && data.vals && data.vals['1']) || {};
        const tiers = (k) => (v1[k] != null ? TIER.map((r) => data.vals[r][k]) : null);
        const lm = (k) => (data && data.lmult && data.lmult['1'] && data.lmult['1'][k]) || 0;
        const g = data ? +Object.values(data.lgroup || {})[0] || 11 : 11;
        if (/^Support skill/.test(title)) {
          const sup = { en: name || txt.split(' ').slice(0, 2).join(' '), el: elOf(descHtml), g };
          if (/Large targets may take multiple hits/.test(desc)) sup.multi = 1;
          if (tiers('SkillAttack1')) { sup.c = tiers('SkillAttack1'); sup.fm = +lm('SkillFixedAttack1').toFixed(5); }
          if (tiers('SkillCureByHp')) { sup.hv = tiers('SkillCureByHp'); sup.hfm = +lm('SkillFixedCure').toFixed(5); }
          for (const k of Object.keys(v1)) if (k.startsWith('ST:')) (sup.v = sup.v || {})[k.replace('ST:', '')] = tiers(k);
          let m;
          if (/damaging Technique[\s\S]*?(?:on|at) enem/.test(desc) || /assists .* attacks/.test(desc)) { sup.k = 'proc'; sup.ar = (m = /all enemies (?:within )?(\d+) grids? (?:around|of)/.exec(desc)) ? +m[1] : 0; sup.lim = /once per turn/.test(desc) ? 1 : /twice every 2 turns|2 times every 2 turns/.test(desc) ? 1 : 0; if (/dispels 1 buff/.test(desc)) sup.dispelBuff = 1; if ((m = /reduce their (ATK|DEF) by (\d+)%/.exec(desc))) sup.eff = [{ k: m[1] === 'ATK' ? 'weak' : 'abreak', v: +m[2] / 100, p: 0.5, t: 1 }]; if (/DEF Reduction/.test(desc)) sup.eff = [{ k: 'abreak', v: 0.1, p: 1, t: 2 }]; if (sup.hv) sup.healOwner = 1; }
          else if (/cumulatively loses 15%/.test(desc)) sup.k = 'shieldLoss';
          else if (/3 stacks, removes all stacks to grant a shield/.test(desc)) sup.k = 'shield3';
          else if (/starts a turn with HP below 80%/.test(desc)) sup.k = 'healLow';
          else if (/At the end of the Character's turn, deals/.test(desc)) sup.k = 'endTurn';
          else if (/Increases the caster's ATK and SPD/.test(desc)) sup.k = 'atkSpd';
          else if (/reduces the CD of all Techniques by 1 turn/.test(desc)) sup.k = 'inkBurst';
          else if (/reduces DMG taken for 3 turns/.test(desc)) sup.k = 'cloud';
          else sup.k = 'none';
          if (fx.sup) Object.assign(sup, fx.sup); // hand-checked model + Korean text (tools/pets_fx.mjs)
          if (!pet.sup) pet.sup = sup;
        } else if (/Materialization|Manifestation/.test(txt.slice(0, 40))) {
          const cap = /Energy Cap: (\d+)/.exec(txt), ini = /Initial Energy: (\d+)/.exec(txt);
          pet.mat = { cap: cap ? +cap[1] : 1000, init: ini ? +ini[1] : 600, front: /in front of the caster/.test(txt) ? 1 : 0 };
        } else if (/adult form's own copy/.test(txt.slice(0, 160))) {
          // the adult's support skill can carry different numbers than the baby text shown in game
          const m = /reduce their (ATK|DEF) by (\d+)%/.exec(desc);
          if (m && pet.sup && pet.sup.eff) pet.sup.effAdult = pet.sup.eff.map((e) => ({ ...e, v: +m[2] / 100 }));
        } else if (/passive/.test(txt.slice(0, 160))) {
          const pv = { en: name, el: elOf(descHtml), ...((fx.pv || {})[name] || { k: 'none' }) };
          if (tiers('SkillAttack1')) pv.c = tiers('SkillAttack1');
          if (tiers('SkillCureByHp')) pv.hv = tiers('SkillCureByHp');
          for (const k of Object.keys(v1)) if (k.startsWith('ST:')) (pv.v = pv.v || {})[k] = tiers(k);
          (pet.pv = pet.pv || []).push(pv);
        } else {
          const o = (fx.sk || {})[name] || {}, { bvKey, kind, ...rest } = o;
          const pt = parseText(desc), sk = { en: name || txt.split(' ').slice(0, 2).join(' '), el: elOf(descHtml), ...pt };
          if (v1.CD > 0) sk.cd = v1.CD;
          if (kind === 'shield' || kind === 'buff') { sk.kind = kind; sk.bv = tiers(bvKey); delete sk.tg; sk.el = 'none'; }
          else if (tiers('SkillAttack1') && pt.tg) { sk.kind = 'dmg'; sk.c = tiers('SkillAttack1'); }
          else if (tiers('SkillCureByHp')) { sk.kind = 'heal'; sk.hv = tiers('SkillCureByHp'); sk.tg = { t: 'allyLow', r: 4 }; }
          else { log(`PET ${en}: skill not modelled: ${name}`); continue; }
          Object.assign(sk, rest);
          pet.skills.push(sk);
        }
      }
    }
    if (!pet.sup) pet.sup = { en: '-', k: 'none', el: 'none' };
    PETS.push(pet);
    log(`PET ${pet.id} ${en} base=${pet.base} sup=${pet.sup.en}/${pet.sup.k}/ar${pet.sup.ar || 0} mat=${JSON.stringify(pet.mat || null)} skills=${pet.skills.map((s) => s.en + ':' + s.kind + ':' + JSON.stringify(s.tg) + (s.cd ? ':cd' + s.cd : '') + (s.eff ? ':' + JSON.stringify(s.eff) : '') + (s.sp ? ':' + JSON.stringify(s.sp) : '')).join(' ; ')} pv=${(pet.pv || []).map((p) => p.en + ':' + p.k).join(',')} supEff=${JSON.stringify(pet.sup.eff || null)} adult=${JSON.stringify(pet.sup.effAdult || null)}`);
  }
}

/* ── extra encounters ── */
const eidx = J('enemies_index.json'), esk = J('enemy_skills.json');
const have = new Set(fs.readdirSync(DL));
const curveFile = {}; for (const f of ['0', '1', '2', '3', '4', '5', '6', 'st']) if (have.has(`curve_${f}.json`)) curveFile[f] = J(`curve_${f}.json`);
const KEEP = ['MaxHp', 'Attack', 'Defence', 'Speed', 'CritRatePercent', 'CritPowerPercent', 'CritAvoidPercent', 'BlockPercent', 'BlockValuePercent', 'BlockAvoidPercent', 'DmgAddPercent', 'DmgReducePercent', 'EffectRate', 'EffectDodge'];
const CURVES2 = {}, RPG = {}, MOBS2 = [], seenMob = new Set();
const baseData = fs.existsSync(path.join(path.dirname(OUT), 'gamedata.js')) ? fs.readFileSync(path.join(path.dirname(OUT), 'gamedata.js'), 'utf8') : '';
const baseCurves = new Set([...baseData.matchAll(/"(\d{3,5})":\{"lo":/g)].map((m) => m[1]));
const KO_MOB2 = {
  // Hieromon: names seen in the KR client (신수 시련 notices / KR community wiki)
  'Storm Griffin': '폭풍 그리핀', Flamoenix: '불사조', 'Yamata no Orochi': '야마타노 오로치', 'Primordial Loong': '태고의 용', 'Galactic Mecha': '은하 메카', Yoldra: '욜드라',
  // guild conquest bosses past the Fantasia maps (unofficial translations)
  'Walrus First Mate': '바다코끼리 일등항해사', 'Deepsea Champion': '심해 챔피언', 'Invincible Breaker Bear': '무적의 파괴곰', 'Master Fixer': '수리 명인', 'Mysterious Armament': '수수께끼 병기',
  'Clockwork King': '태엽 왕', 'Missile Shark': '미사일 상어', 'Ghost Pirate Ship': '유령 해적선', 'Saucer-α': '비행접시-α', 'Molten Demon': '용암 악마', Rimereaver: '서리 약탈자',
  'King Dova': '도바 왕', 'King Aiur': '아이우르 왕', Tormentor: '고문자', Shatterwyrm: '파쇄룡', 'Magma Fiend': '마그마 마귀', 'Frostbite Giant': '동상 거인', Aeralith: '에어랄리스',
  Thalanima: '탈라니마', '灼热': '작열의 화신', '岩层之主': '암층의 군주', '爆雷兽': '폭뢰수', Draconox: '드라코녹스', '狂噬灵': '광식령', 'Dimensional Golem': '차원 골렘', 'Bovine Titan': '황소 거인', 'Polyhedral Sun': '다면체 태양',
  'Mech Puppet': '기계 인형', 'Small Geocrusher': '작은 대지파쇄자', Aobozu: '아오보즈', 'Stag Beetle': '사슴벌레', 'Vine Phantom': '덩굴 환영', 'Tidewolf Shaman': '물결늑대 주술사', 'Six-Tailed Fox': '육미호',
  'Giant Raccoon': '거대 너구리', Myraface: '천면귀', 'Plague God': '역병신', 'Sickle Puppet': '낫 인형', Lotusfish: '연꽃 물고기', 'Xi Fish': '습습어',
  Qiongqi: '궁기', 'Bronze Blademon': '청동 검마', 'White Tiger': '백호', 'Cloudmist Phoenix': '운무 봉황', 'Withered Queen': '시든 여왕', 'Chaos Hound': '혼돈의 사냥개', 'Fallen Hero': '타락한 영웅', 'Chaos Herald': '혼돈의 전령',
};
const baseKo = Object.fromEntries([...baseData.matchAll(/"en":"([^"]+)","ko":"([^"]+)","ty"/g)].map((m) => [m[1], m[2]]));
const ARCHE = [[/wolf/i, 'wolf'], [/boar|bull|ox|goat|deer|bovine/i, 'boar'], [/spider|mantis|scorpion|beetle|crab|lobster/i, 'bug'], [/owl|eagle|tengu|griffin|phoenix|flamoenix/i, 'bird'], [/golem|mech|bronze|general|guard|blademon/i, 'golem'], [/loong|orochi|dragon|serpent|viper/i, 'reptile']];
function clsFor(pg, sr) { const c = eidx.rpg[pg] && eidx.rpg[pg][sr]; if (c == null) return null; (RPG[pg] = RPG[pg] || {})[sr] = c; return c; }
function ensureCurve(cls) {
  if (CURVES2[cls] || baseCurves.has(String(cls))) return true;
  const cf = curveFile[eidx.classFile[cls]], cv = cf && cf[cls]; if (!cv) return false;
  const hi = Math.min(cv.hi, 380), rows = cv.r.slice(0, hi - cv.lo + 1), out = { lo: cv.lo, hi, c: {}, v: {} };
  cv.k.forEach((k, i) => { if (!KEEP.includes(k)) return; const col = rows.map((r) => (r ? r[i] : 0)); if (col.every((x) => x === col[0])) { if (col[0]) out.c[k] = col[0]; } else out.v[k] = col; });
  CURVES2[cls] = out; return true;
}
/* exact enemy stats the client's way (BattleFormulaHandler.CalcMonsterBattleProps), used where we ship no curve */
const f32 = Math.fround;
function levelRow(cv, level) {
  const exact = (lv) => (lv < cv.lo || lv > cv.hi ? null : cv.r[lv - cv.lo] || null);
  const L = f32(level), num = Math.floor(L), frac = f32(L - num), out = {};
  if (frac < f32(1e-5)) { const r = exact(num) || (num >= cv.hi ? exact(cv.hi) : null); if (!r) return null; cv.k.forEach((k, i) => { if (r[i] !== 0) out[k] = r[i]; }); return out; }
  let lp = exact(num), rp = exact(Math.ceil(L));
  if (!lp && !rp) { lp = exact(cv.hi); rp = null; if (!lp) return null; }
  if (!lp || !rp) { const one = lp || rp; cv.k.forEach((k, i) => { if (one[i] !== 0) out[k] = one[i]; }); return out; }
  cv.k.forEach((k, i) => { if (lp[i] === 0 && rp[i] === 0) return; const a = f32(lp[i]), b = f32(rp[i]); out[k] = Math.trunc(f32(a + f32(f32(b - a) * frac))); });
  return out;
}
function exactStats(def, level, sr) {
  const cls = eidx.rpg[def.pg] && eidx.rpg[def.pg][sr]; if (cls == null) return null;
  const cf = curveFile[eidx.classFile[cls]], cv = cf && cf[cls]; if (!cv) return null;
  const row = levelRow(cv, level); if (!row) return null;
  const v = {};
  eidx.stats.forEach((k, i) => { const m = def.f[i]; if (m == null || !(k in row)) return; let x = Math.trunc(row[k] * (m / 10000)); if (['MaxHp', 'Attack', 'Defence', 'Speed'].includes(k)) x = Math.max(1, x); v[k] = x; });
  for (const [k, x] of Object.entries(def.x || {})) v[k] = (v[k] || 0) + x;
  const g = (k) => v[k] || 0;
  // same layout as engine mobStats(): hp, atk, def, spd, then percents ×100
  // EffectRate / EffectDodge are flat values (converted with the level's Base Effect RES in the engine), the rest are percent ×100
  return [g('MaxHp'), g('Attack'), g('Defence'), g('Speed'), g('CritRatePercent') / 100, g('CritPowerPercent') / 100, g('CritAvoidPercent') / 100, g('BlockPercent') / 100,
    g('BlockValuePercent') / 100, g('BlockAvoidPercent') / 100, g('DmgAddPercent') / 100, g('DmgReducePercent') / 100, g('EffectRate'), g('EffectDodge')].map((x) => +x.toFixed(2));
}
function addMob(key, def, sr, lv) {
  if (seenMob.has(key)) return; seenMob.add(key);
  const mob = { k: key, en: def.n, ko: KO_MOB2[def.n] || baseKo[def.n] || def.n, ty: /Boss|Hieromon/.test(def.t) ? 2 : def.t === 'Elite' ? 1 : 0, pg: def.pg, sr, lv, f: def.f.slice(0, 4), sk: [] };
  if (mob.ko === def.n) log('NO KO', def.n);
  mob.ar = (ARCHE.find(([re]) => re.test(def.n)) || [0, 'brute'])[1];
  if (def.x && Object.keys(def.x).length) mob.x = def.x;
  for (const sid of def.sk) {
    const e = esk[Math.abs(sid)]; if (!e) continue; const desc = strip(e.d);
    if (sid < 0) { (mob.pv = mob.pv || []).push(-sid); const m = /takes (\d+)% less (\w+) DMG and (\d+)% higher (\w+) DMG/.exec(desc); if (m && EL[m[2]] && EL[m[4]]) mob.er = { [EL[m[2]]]: -m[1] / 100, [EL[m[4]]]: +m[3] / 100 }; continue; }
    const p = parseText(desc), el = elOf(e.d);
    if (!p.tg || el === 'none') continue;
    mob.sk.push({ en: e.n, el, ic: e.i, ...p });
  }
  if (!mob.sk.length) mob.sk.push({ en: 'Attack', el: 'phy', hits: 1, tg: { t: 'S', r: 1 } });
  MOBS2.push(mob);
}
const DUN_KO = { Auroradrasil: '이그드라실', 'Mecha Summit': '기신산', 'Ocean Palace Ruins': '해저 궁전 유적', 'Aquorigin Shrine': '물의 근원 신전', Hellhold: '지옥 요새', 'Demonseal Gorge': '봉마 협곡', "Warlord's Rest": '장군의 안식처', 'Cloudcrest Temple': '구름마루 사원', Bladeshire: '검의 고을', Celestship: '천상선' };
const DIFF_KO = { Normal: '일반', Hard: '어려움', Nightmare: '악몽', Purgatory: '연옥', Abyss: '심연' };
const roomKo = (t) => t.replace(/^(Apprentice|Elite|Expert|Champion|Master|Paragon|Saint|Godtouched11?) (\d+): (.+)$/, (_, r, n, name) => `${{ Apprentice: '견습', Elite: '정예', Expert: '숙련', Champion: '챔피언', Master: '마스터', Paragon: '패러곤', Saint: '세인트', Godtouched1: '에테리얼', Godtouched11: '에테리얼' }[r]} ${n} · ${KO_MOB2[name] || name}`).replace(/^F(\d+) - /, '$1층 · ').replace('Big Boss Room', '대형 보스 방').replace('Elite Monster Room', '정예 방').replace('Monster Room', '몬스터 방').replace('Boss Room', '보스 방').replace('Final Boss', '최종 보스').replace('Boss', '보스').replace(/^Floor (\d+)/, '$1층').replace(/^(Apprentice|Elite|Expert|Champion|Master) (\d+): (.+)$/, (_, r, n, name) => `${{ Apprentice: '견습', Elite: '정예', Expert: '숙련', Champion: '챔피언', Master: '마스터' }[r]} ${n} · ${KO_MOB2[name] || name}`);
const SR_OK = /^(Norank|Blackiron|Bronze|Silver|Gold)/;
const ENC = [];
// exact = ship precomputed per-unit stats (every floor/tier, no curve needed); otherwise only fights our shipped curves cover
function addGroup(modeId, gid, file, ko, en, exact) {
  if (!have.has(file)) return;
  const d = J(file), fights = [], st = [];
  let uws = false;
  for (const f of d.fights) {
    const units = [], ust = []; let ok = true;
    if ((f.fx || []).some((x) => x[0] === 'United We Stand')) uws = true;
    for (const w of f.w) for (const e of w) {
      const def = d.defs[e[0]], sr = e[3] || f.sr; if (!def) { ok = false; break; }
      if (exact) {
        const s = exactStats(def, e[2], sr); if (!s) { ok = false; break; }
        const curveOk = SR_OK.test(sr) && clsFor(def.pg, sr) != null && ensureCurve(eidx.rpg[def.pg][sr]);
        addMob(e[0], def, sr, e[2]);
        const mob = MOBS2.find((m) => m.k === e[0]);
        if (!curveOk && !mob.st) { mob.st = s; mob.lv = e[2]; mob.sr = sr; mob.fixed = 1; }
        units.push([e[0], e[1], Math.round(e[2] * 10) / 10, sr]); ust.push(s);
        continue;
      }
      if (!SR_OK.test(sr)) { ok = false; break; }
      const cls = clsFor(def.pg, sr); if (cls == null || !ensureCurve(cls)) { ok = false; break; }
      const lim = (CURVES2[cls] || { hi: 320 }).hi; if (e[2] > lim) { ok = false; break; }
      addMob(e[0], def, sr, e[2]);
      const ex = units.find((u) => u[0] === e[0] && u[2] === e[2] && u[3] === sr); if (ex) ex[1] += e[1]; else units.push([e[0], e[1], Math.round(e[2] * 10) / 10, sr]);
    }
    if (!ok || !units.length) continue;
    let title = roomKo(f.t);
    if (modeId === 'conquest') { const m = MOBS2.find((x) => x.k === units[0][0]); title = `${f.n}층 · ${m ? m.ko : units[0][0]}`; }
    fights.push([title, ...units.flat()]);
    if (exact) st.push(ust);
  }
  if (!fights.length) return;
  let mode = ENC.find((m) => m.id === modeId); if (!mode) { mode = { id: modeId, groups: [] }; ENC.push(mode); }
  const g = { id: gid, ko, en, fights };
  if (exact) g.st = st;
  if (uws) g.uws = 1;
  mode.groups.push(g);
  log('enc', modeId, gid, ko, 'fights', fights.length, '/', d.fights.length, exact ? '(exact stats)' : '', uws ? 'UWS' : '');
}
for (const m of eidx.modes) {
  if (m.id === 'dungeons') for (const g of m.groups) { const [nm, df] = g.name.split(' · '); if (DUN_KO[nm]) addGroup('dungeon', g.id, g.file, `${DUN_KO[nm]} · ${DIFF_KO[df] || df}`, g.name); }
  if (m.id === 'conquest') for (const g of m.groups) addGroup('conquest', g.id, g.file, '길드 토벌', g.name, true);
  if (m.id === 'crucible') for (const g of m.groups) addGroup('crucible', g.id, g.file, { Apprentice: '견습', Elite: '정예', Expert: '숙련', Champion: '챔피언', Master: '마스터', Paragon: '패러곤', Saint: '세인트', Godtouched11: '에테리얼' }[g.name] || g.name, g.name, true);
}
log('extra mobs', MOBS2.length, 'curves', Object.keys(CURVES2).join(','), 'rpg', JSON.stringify(RPG).length);
// passives (비전) used by any shipped mob → Korean text + model + icon
const usedPv = new Set();
for (const m of MOBS2) for (const id of m.pv || []) usedPv.add(id);
for (const m of baseData.matchAll(/"pv":\[([\d,]+)\]/g)) for (const id of m[1].split(',')) usedPv.add(+id);
const MOB_PV = {};
for (const id of [...usedPv].sort((a, b) => a - b)) {
  const e = esk[id], t = PV[id];
  if (!t) { log('PASSIVE WITHOUT TABLE ENTRY', id, e && e.n); continue; }
  MOB_PV[id] = { en: e ? e.n : String(id), ko: t[0], d: t[1], i: e && e.i ? e.i : null, ...t[2] };
}
log('mob passives', Object.keys(MOB_PV).length, 'modelled', Object.values(MOB_PV).filter((p) => p.k !== 'none').length, 'estimated', Object.values(MOB_PV).filter((p) => p.est).length);

const out = `// GENERATED by tools/build_extra.mjs — do not edit by hand. Unofficial fan data (see CREDITS.md).
export const KO_SKILL = ${JSON.stringify(KO_SKILL)};
export const KO_CLASS = ${JSON.stringify(KO_CLASS)};
export const KO_DESC = ${JSON.stringify(Object.fromEntries(Object.entries(KO_DESC).filter(([id]) => CLS18_IDS.has(+id))))};
export const FLAT2 = ${JSON.stringify(FLAT2)};
export const CHARMS = ${JSON.stringify(CHARMS)};
export const PETS = ${JSON.stringify(PETS)};
export const MOBS2 = ${JSON.stringify(MOBS2)};
export const CURVES2 = ${JSON.stringify(CURVES2)};
export const RPG = ${JSON.stringify(RPG)};
export const ENC = ${JSON.stringify(ENC)};
export const MOB_PV = ${JSON.stringify(MOB_PV)};
`;
fs.writeFileSync(OUT, out);
console.log('wrote', OUT, (out.length / 1024).toFixed(0) + ' KB');
console.log(rep.join('\n'));
