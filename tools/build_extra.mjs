// Builds js/gamedata2.js: Korean client names, Charms (비법), Fantomon pets, extra encounters (daily dungeons, guild conquest, Hieromon).
// Usage: node tools/build_extra.mjs <wiki-dir> <extra-dir (pets.html, metahub_builder.html)> <out-file>
// Inputs are locally saved community pages (see CREDITS.md); they are only parsed as data.
import fs from 'node:fs';
import path from 'node:path';

const [, , DL, DL2, OUT] = process.argv;
const J = (f) => JSON.parse(fs.readFileSync(path.join(DL, f), 'utf8'));
const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&times;/g, '×').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&[lr]saquo;/g, '');
const strip = (s) => dec(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const rep = []; const log = (...a) => rep.push(a.join(' '));
const TIER = [1, 3, 6, 10, 16, 24];
const EL = { Physical: 'phy', Wind: 'wind', Water: 'water', Fire: 'fire', Light: 'light', Dark: 'dark' };
const elOf = (html) => { const m = /(Physical|Wind|Water|Fire|Light|Dark)(?:<\/span>)? (?:Doom |True |Crit )?DMG/.exec(html) || /(Physical|Wind|Water|Fire|Light|Dark)/.exec(html); return m ? EL[m[1]] : 'none'; };

/* ── text → targeting/effects (same rules as build_data.mjs) ── */
const STATUS = { 'Armor Break 2': ['abreak', 0.3], 'Armor Break 1': ['abreak', 0.15], 'Weakened 1': ['weak', 0.15], 'Weakened 2': ['weak', 0.3], 'Slow 1': ['slow', 0.15], 'Slow 2': ['slow', 0.3], Slow: ['slow', 0.15], Stun: ['stun'], Frozen: ['freeze'], Immobilize: ['immob'], Rimebound: ['immob'], Taunt: ['taunt'], Frenzy: ['frenzy'], Blind: ['blind'], Cold: ['cold'], Wet: ['wet'], Erosion: ['dot'], Poison: ['dot'], Bleed: ['dot'], Burn: ['dot'], Vulnerability: ['vuln', 0.25], Fragility: ['vuln', 0.25] };
function parseText(d) {
  const o = { hits: 1, eff: [] }; let m;
  if ((m = /DMG (once|twice|(\d+) times)/.exec(d))) o.hits = m[1] === 'once' ? 1 : m[1] === 'twice' ? 2 : +m[2];
  if ((m = /[Ss]elects a (?:grid|target) within (\d+) grids? of the caster/.exec(d))) { const r = +m[1]; let a; if ((a = /within a (\d+)-grid square area (?:of|around) th(?:e|at) target/.exec(d))) o.tg = { t: 'TQ', r, ar: +a[1] }; else if ((a = /within (\d+) grids? of (?:the target|each target)/.exec(d))) o.tg = { t: 'T', r, ar: +a[1] }; else o.tg = { t: 'T', r, ar: 1 }; }
  else if ((m = /1 enemy within (\d+) to (\d+) grids?/.exec(d))) o.tg = { t: 'S', min: +m[1], r: +m[2] };
  else if ((m = /1 enemy within (\d+) grids?/.exec(d))) o.tg = { t: 'S', r: +m[1] };
  else if ((m = /lowest HP within (\d+) grids?[\s\S]*?(\d+)-grid square/.exec(d))) o.tg = { t: 'TQ', r: +m[1], ar: +m[2] };
  else if ((m = /random grids within (\d+) grids?/.exec(d))) o.tg = { t: 'T', r: +m[1], ar: 1 };
  else if ((m = /all enemies (?:within|in) (?:a |an )?(\d+)[×x](\d+) grid(?: area)? (?:in front|in the front|to the caster|along|in t)/.exec(d)) || (m = /(?:missiles|bolts) within a (\d+)[×x](\d+) grid area in front/.exec(d))) o.tg = { t: 'F', w: +m[1], h: +m[2] };
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
  if (!o.eff.length) delete o.eff;
  return o;
}

/* ── Korean client names (optional) ── */
const KO_SKILL = {}, KO_CLASS = {};
const mhPath = path.join(DL2, 'metahub_builder.html');
if (fs.existsSync(mhPath)) {
  const mh = fs.readFileSync(mhPath, 'utf8');
  const bd = JSON.parse(/<script[^>]*id="sxs-builder-data"[^>]*>([\s\S]*?)<\/script>/.exec(mh)[1]);
  for (const s of Array.isArray(bd.skills) ? bd.skills : Object.values(bd.skills)) if (s.text_language === 'ko' && s.name) KO_SKILL[s.id] = s.name;
  for (const c of Object.values(bd.classes)) if (c.name && /[가-힣]/.test(c.name)) KO_CLASS[c.key] = c.name;
}
log('ko skill names', Object.keys(KO_SKILL).length, 'classes', Object.keys(KO_CLASS).length);

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

/* ── Fantomon ── */
const KO_PET = { Falko: '팔코', Boaro: '보아로', Mandragora: '만드라고라', Zeioletus: '제이올레투스', Terragon: '테라곤', Sylvaerie: '실바에리', Kels: '켈스', Armopi: '아르모피', Herbote: '허보트', Nyxarchon: '닉사르콘', Aegiswing: '이지스윙', Pandarial: '판다리얼', Chomusuke: '쵸무스케', 'Cabbage Dog': '양배추 강아지', Prismora: '프리즈모라', 'Luminarch Steed': '루미나크 준마', Yoldra: '욜드라', Hexitty: '헥시티', Mumpkin: '멈프킨' };
const ROLE = { DPS: '딜러', Tank: '탱커', Support: '서포터' };
const PETS = [];
const petsPath = path.join(DL2, 'pets.html');
if (fs.existsSync(petsPath)) {
  const html = fs.readFileSync(petsPath, 'utf8');
  for (const a of html.matchAll(/<article class="pet" id="pet-(\d+)"[^>]*>([\s\S]*?)<\/article>/g)) {
    const h = a[2], en = strip(/<h3>([\s\S]*?)<\/h3>/.exec(h)[1]);
    const role = strip((/<dt>Role<\/dt><dd>([\s\S]*?)<\/dd>/.exec(h) || [])[1] || '');
    const bm = /HP (\d+)%[^A]*ATK (\d+)%[^D]*DEF (\d+)%[^S]*SPD (\d+)%/.exec(strip((/<dt>Battle base<\/dt><dd>([\s\S]*?)<\/dd>/.exec(h) || [])[1] || ''));
    const pet = { id: +a[1], en, ko: KO_PET[en] || en, role: ROLE[role] || role, base: bm ? [+bm[1], +bm[2], +bm[3], +bm[4]] : [90, 100, 90, 100], skills: [] };
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
          if (tiers('SkillAttack1')) { sup.c = tiers('SkillAttack1'); sup.fm = +lm('SkillFixedAttack1').toFixed(5); }
          if (tiers('SkillCureByHp')) { sup.hv = tiers('SkillCureByHp'); sup.hfm = +lm('SkillFixedCure').toFixed(5); }
          for (const k of ['ST:ShieldByDefence', 'ST:StatusDmgAddPer', 'ST:StatusDmgReducePer', 'ST:BlockPercent', 'ST:AttackScale', 'ST:SpeedScale', 'ST:DefenceScale', 'ST:CritRatePercent']) if (tiers(k)) (sup.v = sup.v || {})[k.replace('ST:', '')] = tiers(k);
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
          if (!pet.sup) pet.sup = sup;
        } else if (/Materialization|Manifestation/.test(txt.slice(0, 40))) {
          const cap = /Energy Cap: (\d+)/.exec(txt), ini = /Initial Energy: (\d+)/.exec(txt);
          pet.mat = { cap: cap ? +cap[1] : 1000, init: ini ? +ini[1] : 600, front: /in front of the caster/.test(txt) ? 1 : 0 };
        } else if (!/passive|adult form's own copy/.test(txt.slice(0, 160))) {
          const pt = parseText(desc), sk = { en: name || txt.split(' ').slice(0, 2).join(' '), el: elOf(descHtml), ...pt };
          if (v1.CD > 0) sk.cd = v1.CD;
          if (tiers('SkillAttack1') && pt.tg) { sk.kind = 'dmg'; sk.c = tiers('SkillAttack1'); }
          else if (tiers('SkillCureByHp')) { sk.kind = 'heal'; sk.hv = tiers('SkillCureByHp'); sk.tg = { t: 'allyLow', r: 4 }; }
          else continue;
          pet.skills.push(sk);
        }
      }
    }
    if (!pet.sup) pet.sup = { en: '-', k: 'none', el: 'none' };
    PETS.push(pet);
    log(`PET ${pet.id} ${en} base=${pet.base} sup=${pet.sup.en}/${pet.sup.k}/ar${pet.sup.ar || 0} mat=${JSON.stringify(pet.mat || null)} skills=${pet.skills.map((s) => s.en + ':' + s.kind + ':' + JSON.stringify(s.tg) + (s.cd ? ':cd' + s.cd : '')).join(' ; ')}`);
  }
}

/* ── extra encounters ── */
const eidx = J('enemies_index.json'), esk = J('enemy_skills.json');
const have = new Set(fs.readdirSync(DL));
const curveFile = {}; for (const f of ['0', '1', '2', '3', 'st']) if (have.has(`curve_${f}.json`)) curveFile[f] = J(`curve_${f}.json`);
const KEEP = ['MaxHp', 'Attack', 'Defence', 'Speed', 'CritRatePercent', 'CritPowerPercent', 'CritAvoidPercent', 'BlockPercent', 'BlockValuePercent', 'BlockAvoidPercent', 'DmgAddPercent', 'DmgReducePercent', 'EffectRate', 'EffectDodge'];
const CURVES2 = {}, RPG = {}, MOBS2 = [], seenMob = new Set();
const baseData = fs.existsSync(path.join(path.dirname(OUT), 'gamedata.js')) ? fs.readFileSync(path.join(path.dirname(OUT), 'gamedata.js'), 'utf8') : '';
const baseCurves = new Set([...baseData.matchAll(/"(\d{3,5})":\{"lo":/g)].map((m) => m[1]));
const KO_MOB2 = {
  'Storm Griffin': '폭풍 그리핀', Flamoenix: '화염 불사조', 'Yamata no Orochi': '야마타노오로치', 'Primordial Loong': '태초의 용', 'Dimensional Golem': '차원 골렘', 'Bovine Titan': '황소 거인', 'Polyhedral Sun': '다면체 태양',
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
function addMob(key, def, sr, lv) {
  if (seenMob.has(key)) return; seenMob.add(key);
  const mob = { k: key, en: def.n, ko: KO_MOB2[def.n] || baseKo[def.n] || def.n, ty: /Boss|Hieromon/.test(def.t) ? 2 : def.t === 'Elite' ? 1 : 0, pg: def.pg, sr, lv, f: def.f.slice(0, 4), sk: [] };
  if (mob.ko === def.n) log('NO KO', def.n);
  mob.ar = (ARCHE.find(([re]) => re.test(def.n)) || [0, 'brute'])[1];
  if (def.x && Object.keys(def.x).length) mob.x = def.x;
  for (const sid of def.sk) {
    const e = esk[Math.abs(sid)]; if (!e) continue; const desc = strip(e.d);
    if (sid < 0) { const m = /takes (\d+)% less (\w+) DMG and (\d+)% higher (\w+) DMG/.exec(desc); if (m && EL[m[2]] && EL[m[4]]) mob.er = { [EL[m[2]]]: -m[1] / 100, [EL[m[4]]]: +m[3] / 100 }; continue; }
    const p = parseText(desc), el = elOf(e.d);
    if (!p.tg || el === 'none') continue;
    mob.sk.push({ en: e.n, el, ...p });
  }
  if (!mob.sk.length) mob.sk.push({ en: 'Attack', el: 'phy', hits: 1, tg: { t: 'S', r: 1 } });
  MOBS2.push(mob);
}
const DUN_KO = { Auroradrasil: '오로라 세계수', 'Mecha Summit': '기계 정상', 'Ocean Palace Ruins': '해저 궁전 유적', 'Aquorigin Shrine': '물의 근원 신전', Hellhold: '지옥 요새', 'Demonseal Gorge': '봉마 협곡', "Warlord's Rest": '장군의 안식처', 'Cloudcrest Temple': '구름마루 사원', Bladeshire: '검의 고을', Celestship: '천상선' };
const DIFF_KO = { Normal: '일반', Hard: '어려움', Nightmare: '악몽', Purgatory: '연옥', Abyss: '심연' };
const roomKo = (t) => t.replace(/^F(\d+) - /, '$1층 · ').replace('Big Boss Room', '대형 보스 방').replace('Elite Monster Room', '정예 방').replace('Monster Room', '몬스터 방').replace('Boss Room', '보스 방').replace('Final Boss', '최종 보스').replace('Boss', '보스').replace(/^Floor (\d+)/, '$1층').replace(/^(Apprentice|Elite|Expert|Champion|Master) (\d+): (.+)$/, (_, r, n, name) => `${{ Apprentice: '견습', Elite: '정예', Expert: '숙련', Champion: '챔피언', Master: '마스터' }[r]} ${n} · ${KO_MOB2[name] || name}`);
const SR_OK = /^(Norank|Blackiron|Bronze|Silver|Gold)/;
const ENC = [];
function addGroup(modeId, gid, file, ko, en) {
  if (!have.has(file)) return;
  const d = J(file), fights = [];
  for (const f of d.fights) {
    const units = []; let ok = true;
    for (const w of f.w) for (const e of w) {
      const def = d.defs[e[0]], sr = e[3] || f.sr; if (!def || !SR_OK.test(sr)) { ok = false; break; }
      const cls = clsFor(def.pg, sr); if (cls == null || !ensureCurve(cls)) { ok = false; break; }
      const lim = (CURVES2[cls] || { hi: 320 }).hi; if (e[2] > lim) { ok = false; break; }
      addMob(e[0], def, sr, e[2]);
      const ex = units.find((u) => u[0] === e[0] && u[2] === e[2] && u[3] === sr); if (ex) ex[1] += e[1]; else units.push([e[0], e[1], Math.round(e[2] * 10) / 10, sr]);
    }
    if (ok && units.length) fights.push([roomKo(f.t), ...units.flat()]);
  }
  if (!fights.length) return;
  let mode = ENC.find((m) => m.id === modeId); if (!mode) { mode = { id: modeId, groups: [] }; ENC.push(mode); }
  mode.groups.push({ id: gid, ko, en, fights });
  log('enc', modeId, gid, ko, 'fights', fights.length, '/', d.fights.length);
}
for (const m of eidx.modes) {
  if (m.id === 'dungeons') for (const g of m.groups) { const [nm, df] = g.name.split(' · '); if (DUN_KO[nm]) addGroup('dungeon', g.id, g.file, `${DUN_KO[nm]} · ${DIFF_KO[df] || df}`, g.name); }
  if (m.id === 'conquest') for (const g of m.groups) addGroup('conquest', g.id, g.file, '길드 정복', g.name);
  if (m.id === 'crucible') for (const g of m.groups) addGroup('crucible', g.id, g.file, { Apprentice: '견습', Elite: '정예', Expert: '숙련', Champion: '챔피언', Master: '마스터' }[g.name] || g.name, g.name);
}
log('extra mobs', MOBS2.length, 'curves', Object.keys(CURVES2).join(','), 'rpg', JSON.stringify(RPG).length);

const out = `// GENERATED by tools/build_extra.mjs — do not edit by hand. Unofficial fan data (see CREDITS.md).
export const KO_SKILL = ${JSON.stringify(KO_SKILL)};
export const KO_CLASS = ${JSON.stringify(KO_CLASS)};
export const FLAT2 = ${JSON.stringify(FLAT2)};
export const CHARMS = ${JSON.stringify(CHARMS)};
export const PETS = ${JSON.stringify(PETS)};
export const MOBS2 = ${JSON.stringify(MOBS2)};
export const CURVES2 = ${JSON.stringify(CURVES2)};
export const RPG = ${JSON.stringify(RPG)};
export const ENC = ${JSON.stringify(ENC)};
`;
fs.writeFileSync(OUT, out);
console.log('wrote', OUT, (out.length / 1024).toFixed(0) + ' KB');
console.log(rep.join('\n'));
