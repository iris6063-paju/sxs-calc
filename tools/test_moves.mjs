// Skill movement + unit size checks: node tools/test_moves.mjs
import { heroBase, prepare, simulate, monteCarlo, roster, ALL_MOBS, fpOf } from '../js/engine.js';
import { SKILLS } from '../js/gamedata.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const lv = 60, b = heroBase(lv);
const sk = (id) => SKILLS.find((s) => s.id === id);
const hero = (cls, ids, o = {}) => ({ kind: 'hero', uid: 'h' + Math.random(), cls, level: lv, atk: b.atk * 5, def: b.def * 5, hp: b.hp * 40, spd: b.spd * 3, skills: ids.map((id) => ({ id, rank: 6 })), ...o });
const boss = ALL_MOBS.find((m) => m.ty === 2 && !m.st && /\|0$/.test(m.k));
const hiero = ALL_MOBS.find((m) => m.ty === 2 && /\|3$/.test(m.k));
const small = ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k));
const mob = (m, extra = {}) => ({ kind: 'mob', uid: 'm' + Math.random(), key: m.k, level: m.lv || lv, sr: m.sr, count: 1, fix: m.st, ...extra });

// 1) footprints and placement
{
  const meta = roster({ mode: 'pve', teams: [[hero('Zhanshi', [10000])], [mob(boss), mob(hiero), mob(small, { count: 6 })]] });
  const bossM = meta.find((u) => u.key === boss.k), hieroM = meta.find((u) => u.key === hiero.k);
  ok(bossM.sz === 2 && hieroM.sz === 3, `boss 2×2 (${boss.en}), Hieromon 3×3 (${hiero.en})`);
  const cells = new Map(); let overlap = 0, wrongSide = 0;
  for (const u of meta) if (!u.out) for (const [dx, dy] of fpOf(u)) { const k = (u.y + dy) * 21 + u.x + dx; if (cells.has(k)) overlap++; cells.set(k, u.id); if (u.team === 1 && u.y + dy < 11) wrongSide++; }
  ok(!overlap && !wrongSide, `no overlapping cells, all on their side (${cells.size} cells)`);
}
// 2) "Large targets may take multiple hits": Water Assault (3×4, −25% per repeat) lands several hits on a 2×2 boss
{
  const s = sk(10003);
  ok(s && s.multi && s.rep && s.rep.d === 0.25, 'Water Assault parsed: multi + 25% repeat decay');
  const P = prepare({ mode: 'pve', roundCap: 3, teams: [[hero('Fashi', [10003], { cell: [10, 9] })], [mob(boss, { cell: [10, 11] })]] });
  const r = simulate(P, 7, true), heroId = P.units.findIndex((u) => u.kind === 'hero'), bossId = P.units.findIndex((u) => u.key === boss.k);
  const i = r.events.findIndex((e) => e.e === 'cast' && e.u === heroId);
  const hits = []; for (let j = i + 1; j < r.events.length && r.events[j].e !== 'cast' && r.events[j].e !== 'turn'; j++) if (r.events[j].e === 'hit' && r.events[j].t === bossId && r.events[j].k !== 3) hits.push(r.events[j].d);
  ok(hits.length >= 2, `one cast hit the boss ${hits.length}× (cells covered), damages ${hits.join(' / ')}`);
  const pS = prepare({ mode: 'pve', roundCap: 3, teams: [[hero('Fashi', [10003], { cell: [10, 9] })], [mob(small, { cell: [10, 11] })]] });
  const rs = simulate(pS, 7, true), sid = pS.units.findIndex((u) => u.key === small.k), hid = pS.units.findIndex((u) => u.kind === 'hero');
  const i2 = rs.events.findIndex((e) => e.e === 'cast' && e.u === hid); let n2 = 0; for (let j = i2 + 1; j < rs.events.length && rs.events[j].e !== 'cast' && rs.events[j].e !== 'turn'; j++) if (rs.events[j].e === 'hit' && rs.events[j].t === sid) n2++;
  ok(n2 === 1, `the same cast hits a 1-cell mob once (${n2})`);
}
// 3) dash: Flash Dash moves the caster along the line after the strike
{
  const P = prepare({ mode: 'pve', roundCap: 3, teams: [[hero('Doushi', [10016], { cell: [10, 7] })], [mob(small, { cell: [10, 11] })]] });
  const r = simulate(P, 3, true), hid = P.units.findIndex((u) => u.kind === 'hero');
  ok(r.events.some((e) => e.e === 'move' && e.u === hid && e.dash), 'Flash Dash produces a dash move');
}
// 4) knockback: Forceful Charge pushes 1-cell enemies to the side; a large boss stands firm
{
  const P = prepare({ mode: 'pve', roundCap: 4, teams: [[hero('Doushi', [10073], { cell: [10, 8] })], [mob(small, { count: 3, cell: [10, 11] })]] });
  const r = simulate(P, 5, true);
  ok(r.events.some((e) => e.e === 'move' && e.kb && P.units[e.u].team === 1), 'Forceful Charge knocks enemies back');
  const P2 = prepare({ mode: 'pve', roundCap: 4, teams: [[hero('Doushi', [10073], { cell: [10, 8] })], [mob(boss, { cell: [10, 11] })]] });
  const r2 = simulate(P2, 5, true), bid = P2.units.findIndex((u) => u.key === boss.k);
  ok(!r2.events.some((e) => e.e === 'move' && e.kb && e.u === bid), 'a 2×2 boss is not knocked back');
}
// 5) "Prioritizes large targets": Heavy Impact picks the boss over a closer small mob
{
  const P = prepare({ mode: 'pve', roundCap: 8, teams: [[hero('Zhanshi', [10009], { cell: [10, 9] })], [mob(small, { cell: [10, 11] }), mob(boss, { cell: [12, 11] })]] });
  const r = simulate(P, 9, true), hid = P.units.findIndex((u) => u.kind === 'hero'), bid = P.units.findIndex((u) => u.key === boss.k);
  const c = r.events.find((e) => e.e === 'cast' && e.u === hid);
  ok(c && c.tg[0] === bid, `Heavy Impact targets the large unit first (target ${c && c.tg[0]}, boss ${bid})`);
}
// 6) Monte Carlo still runs with large units and movement
{
  const res = monteCarlo({ mode: 'pve', roundCap: 8, teams: [[hero('Doushi', [10016, 10073]), hero('Fashi', [10003, 10000])], [mob(boss), mob(small, { count: 4 })]] }, 120);
  ok(res.n === 120 && !res.invalid, `Monte Carlo with a 2×2 boss: win ${(res.wins[0] / res.n * 100).toFixed(1)}%`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all movement / size tests passed');
process.exit(bad ? 1 : 0);
