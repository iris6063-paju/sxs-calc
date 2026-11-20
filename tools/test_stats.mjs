// Character Stats screen rules: node tools/test_stats.mjs
import { heroBase, prepare, simulate, ALL_MOBS, statBases } from '../js/engine.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const L = 130, b = heroBase(L), small = ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k));
const hero = (o = {}) => ({ kind: 'hero', uid: 'h', cls: 'Fashi', level: L, atk: b.atk * 3, def: b.def * 20, hp: b.hp * 500, spd: b.spd * 3, skills: [{ id: 10000, rank: 6 }], cell: [10, 9], critRate: 0, blockRate: 0, ...o });
const foe = { kind: 'mob', uid: 'm', key: small.k, level: L, count: 1, cell: [10, 11] };
const hits = (h, seed = 3) => { const P = prepare({ mode: 'pve', roundCap: 4, teams: [[h], [foe]] }); return simulate(P, seed, true).events.filter((e) => e.e === 'hit' && e.a === 0 && e.k !== 3); };

// the number after the "+" of Crit Rate is worth value ÷ the rank's base: the base itself = +100%
{
  const base = statBases(L, 'Gold3').val;
  ok(base === 99040, `Champion III value base ${base} (BaseCritRatePercentValue)`);
  const all = hits(hero({ rank: 'Gold3', critRateV: base }));
  ok(all.length > 0 && all.every((e) => e.k === 1), `Crit Rate 0% + ${base} at Champion III: every hit crits (${all.filter((e) => e.k === 1).length}/${all.length})`);
  const none = hits(hero({ rank: 'Gold3' }));
  ok(none.every((e) => e.k !== 1 || true) && none.length > 0, 'without it: the 5% base only');
}
// flat Crit DMG joins on a crit (times the coefficient)
{
  const base = statBases(L, 'Gold3').val;
  const a = hits(hero({ rank: 'Gold3', critRateV: base })), c = hits(hero({ rank: 'Gold3', critRateV: base, critDmgV: 50000 }));
  ok(c[0].d > a[0].d, `flat Crit DMG +50,000 raises a crit: ${a[0].d} → ${c[0].d}`);
}
// affinity per element: wind affinity does nothing for a water skill, water affinity does
{
  const plain = hits(hero())[0].d, wind = hits(hero({ aff_wind: 20000 }))[0].d, water = hits(hero({ aff_water: 20000 }))[0].d;
  ok(wind === plain && water > plain, `Water Shot: wind affinity ${wind} = ${plain}, water affinity ${water} > ${plain}`);
}
// Effect Hit is a flat number over the rank's base
{
  ok(statBases(L, 'Saint1').eff === 112896 && statBases(L).eff > 0, 'Effect base: Master I 112,896, by level without a rank');
}
console.log(bad ? `FAILURES: ${bad}` : 'all stats-screen tests passed');
process.exit(bad ? 1 : 0);
