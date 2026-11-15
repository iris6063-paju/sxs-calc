// Smoke tests for charms, Fantomon and the extra encounters: node tools/test_extra.mjs
import { heroBase, prepare, simulate, monteCarlo, CHARMS, PETS, ENC, SK, mobStats, stFrom } from '../js/engine.js';
import { SKILLS, CLASSES } from '../js/gamedata.js';

const hero = (cls, level, over = {}) => ({ kind: 'hero', uid: 'h' + Math.random(), cls, level, ...heroBase(level), skills: SKILLS.filter((s) => s.cls === cls && s.kind !== 'none').slice(0, 4).map((s) => ({ id: s.id, rank: 6 })), ...over });
const pct = (r) => ((r.wins[0] / r.n) * 100).toFixed(1) + '%';
let bad = 0;
const check = (res, what) => { if (!(res.winner >= -1) || res.units.some((u) => Number.isNaN(u.dmg) || Number.isNaN(u.hp))) { bad++; console.log('BAD', what); } };

// every charm, one at a time, on both a warrior and a mage
for (const c of CHARMS) for (const cls of ['Huwei', 'Shushi']) {
  const P = prepare({ mode: 'pvp', pvpBalance: false, teams: [[hero(cls, 90, { charms: [{ id: c.id, rank: 10 }] }), hero('Xianzhe', 90)], [hero('Doushi', 90, { charms: [{ id: c.id, rank: 3 }] }), hero('Fashi', 90)]] });
  for (let s = 0; s < 3; s++) check(simulate(P, 77 + s, s === 0), 'charm ' + c.id + ' ' + c.en);
}
console.log('charms tested', CHARMS.length, 'modelled', CHARMS.filter((c) => c.fx).length);
// charm effect direction: +crit / +def / lifesteal should help in a mirror
for (const [id, name] of [[10500, 'Insightful Eye'], [10501, 'Crystal Armor'], [10544, 'Blade of Lament'], [10562, 'Blade Tempest'], [10588, 'Crit Mastery'], [10537, 'Counter Blade']]) {
  const r = monteCarlo({ mode: 'pvp', pvpBalance: false, teams: [[hero('Zhanshi', 80, { charms: [{ id, rank: 10 }] })], [hero('Zhanshi', 80)]] }, 600);
  console.log(`mirror + ${name}: ${pct(r)}`);
}
// every Fantomon (baby support + adult materialization)
for (const p of PETS) for (const adult of [false, true]) {
  const b = heroBase(90), pet = { id: p.id, rank: 6, adult, atk: b.atk * p.base[1] / 100, def: b.def * p.base[2] / 100, hp: b.hp * p.base[0] / 100, spd: b.spd * p.base[3] / 100 };
  const P = prepare({ mode: 'pvp', pvpBalance: false, teams: [[hero('Zhanshi', 90, { pet })], [hero('Zhanshi', 90)]] });
  let spawned = 0;
  for (let s = 0; s < 4; s++) { const r = simulate(P, 500 + s, true); check(r, 'pet ' + p.en); if (r.events.some((e) => e.e === 'spawn')) spawned++; }
  const r = monteCarlo({ mode: 'pvp', pvpBalance: false, teams: [[hero('Zhanshi', 90, { pet })], [hero('Zhanshi', 90)]] }, 300);
  console.log(`pet ${p.ko} (${p.sup.k})${adult ? ' adult' : ''}: mirror ${pct(r)} spawned ${spawned}/4 petDmg ${Math.round(r.units[2].dmg / r.n)}`);
}
// extra encounters: first and last fight of every group
for (const m of ENC) for (const g of m.groups) for (const fi of [0, g.fights.length - 1]) {
  const f = g.fights[fi];
  const foes = []; for (let i = 1, ui = 0; i < f.length; i += 4, ui++) foes.push({ kind: 'mob', key: f[i], count: f[i + 1], level: f[i + 2], sr: f[i + 3], fix: g.st ? g.st[fi][ui] : undefined, uws: g.uws });
  const lv = Math.min(250, Math.round(foes[0].level)), b = heroBase(lv);
  const st = foes[0].fix ? stFrom(foes[0].fix, foes[0].level) : mobStats(foes[0].key, foes[0].level, foes[0].sr);
  const P = prepare({ mode: 'pve', teams: [[hero('Shushi', lv, { atk: b.atk * 3, hp: b.hp * 3, def: b.def * 3 })], foes], roundCap: 15 });
  check(simulate(P, 9, true), `enc ${m.id}/${g.id}`);
  if (g === m.groups[0] || m.id !== 'dungeon') console.log(`enc ${m.id}/${g.id} "${f[0]}" lv${foes[0].level} ${foes[0].sr} first mob hp ${st.hp} atk ${st.atk} units ${P.units.length}`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all smoke tests passed');
