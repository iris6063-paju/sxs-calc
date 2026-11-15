// Sanity checks for the engine: node tools/test_engine.mjs
import { mobStats, heroBase, skillNumbers, prepare, simulate, monteCarlo, SK } from '../js/engine.js';
import { MAPS, SKILLS, CLASSES } from '../js/gamedata.js';

const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const b = mobStats('3206|0', 13);
ok('Boar lv13 = 713/133/379/153', b.hp === 713 && b.atk === 133 && b.def === 379 && b.spd === 153, JSON.stringify(b));
const es = skillNumbers(10008, 1, 100);
ok('Edge Strike Rare+0 @100 = 43.6% + ~3439', Math.abs(es.coef - 0.436) < 1e-9 && Math.abs(es.flat - 3439) < 3, JSON.stringify(es));
const wb = skillNumbers(10000, 24, 100);
console.log('Water Shot Immortal+0 @100', JSON.stringify(wb));

const hero = (cls, level, skills, over = {}) => ({ kind: 'hero', cls, level, ...heroBase(level), skills: skills.map((id) => ({ id, rank: 3 })), ...over });
const pct = (r, t) => ((r.wins[t] / r.n) * 100).toFixed(1) + '%';

// mirror duel → ~50%
let t0 = Date.now();
let r = monteCarlo({ mode: 'pvp', teams: [[hero('Zhanshi', 60, [10008, 10011, 10013, 10015])], [hero('Zhanshi', 60, [10008, 10011, 10013, 10015])]] }, 2000);
ok('mirror duel ≈ 50%', Math.abs(r.wins[0] / r.n - 0.5) < 0.06, `A ${pct(r, 0)} B ${pct(r, 1)} draws ${r.draws} avgRounds ${(r.rounds / r.n).toFixed(1)} timeouts ${r.timeouts} ${Date.now() - t0}ms`);

// stronger attacker should win more
r = monteCarlo({ mode: 'pvp', teams: [[hero('Zhanshi', 60, [10008, 10011, 10013, 10015], { atk: heroBase(60).atk * 1.3 })], [hero('Zhanshi', 60, [10008, 10011, 10013, 10015])]] }, 1000);
ok('+30% ATK wins more', r.wins[0] > r.wins[1], `A ${pct(r, 0)}`);

// PvE: floor 1 of each map with a lone hero at floor level (base stats ×3)
for (const m of MAPS) {
  for (const fi of [0, Math.floor(m.floors.length / 2)]) {
    const f = m.floors[fi];
    const foes = [];
    for (let i = 1; i < f.length; i += 2) foes.push({ kind: 'mob', key: f[i], level: f[0], count: f[i + 1] });
    const lv = Math.round(f[0]);
    const base = heroBase(lv);
    const me = hero('Fashi', lv, [10000, 10003, 10028, 10031], { atk: base.atk * 4, def: base.def * 4, hp: base.hp * 4, spd: base.spd * 1.5 });
    t0 = Date.now();
    r = monteCarlo({ mode: 'pve', teams: [[me], foes], roundCap: 15 }, 300);
    console.log(`PvE ${m.id} floor ${fi + 1} lv${f[0]} foes ${foes.map((x) => x.key + 'x' + x.count).join(',')} → win ${pct(r, 0)} timeouts ${r.timeouts} rounds ${(r.rounds / r.n).toFixed(1)} units ${r.meta.length} ${Date.now() - t0}ms`);
  }
}

// 4v4 speed + every skill smoke test
const squads = [['Shouhuzhe', 'Zhengfuzhe', 'Huimiezhe', 'Zhangkongzhe'], ['LegendShouhuzhe', 'LegendZhengfuzhe', 'LegendHuimiezhe', 'LegendZhangkongzhe']];
const team = (keys) => keys.map((k) => hero(k, 120, SKILLS.filter((s) => s.cls === k && s.kind !== 'none').slice(0, 4).map((s) => s.id)));
t0 = Date.now();
r = monteCarlo({ mode: 'pvp', teams: [team(squads[0]), team(squads[1])] }, 500);
console.log(`4v4 tier4 vs tier5: A ${pct(r, 0)} B ${pct(r, 1)} draws ${r.draws} rounds ${(r.rounds / r.n).toFixed(1)} timeouts ${r.timeouts} ${Date.now() - t0}ms`);
// every class vs every class once with logs (crash test)
let fights = 0, evs = 0;
for (const a of CLASSES) for (const c of CLASSES) {
  const sa = SKILLS.filter((s) => s.cls === a.key).map((s) => s.id), sc = SKILLS.filter((s) => s.cls === c.key).map((s) => s.id);
  const P = prepare({ mode: 'pvp', teams: [[hero(a.key, 90, sa.slice(0, 4)), hero(a.key, 90, sa.slice(2, 6))], [hero(c.key, 90, sc.slice(0, 4)), hero(c.key, 90, sc.slice(2, 6))]] });
  const res = simulate(P, 1000 + fights, true); fights++; evs += res.events.length;
  if (!(res.winner >= -1 && res.winner <= 1) || res.units.some((u) => Number.isNaN(u.dmg) || Number.isNaN(u.hp))) console.log('BAD RESULT', a.key, c.key, res.winner);
}
console.log('class matrix fights', fights, 'avg events', (evs / fights).toFixed(0));
const P1 = prepare({ mode: 'pvp', teams: [[hero('Zhanshi', 60, [10008, 10011, 10013, 10015])], [hero('Fashi', 60, [10000, 10003, 10028, 10035])]] });
const one = simulate(P1, 42, true);
console.log('sample log:', one.events.slice(0, 14).map((e) => JSON.stringify(e)).join('\n  '));
console.log('winner', one.winner, 'rounds', one.rounds, 'events', one.events.length);
