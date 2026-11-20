// Skill movement + unit size checks: node tools/test_moves.mjs
import { heroBase, prepare, simulate, monteCarlo, roster, ALL_MOBS, fpOf } from '../js/engine.js';
import { SKILLS } from '../js/gamedata.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const lv = 60, b = heroBase(lv);
const sk = (id) => SKILLS.find((s) => s.id === id);
const hero = (cls, ids, o = {}) => ({ kind: 'hero', uid: 'h' + Math.random(), cls, level: lv, atk: b.atk * 5, def: b.def * 5, hp: b.hp * 40, spd: b.spd * 3, skills: ids.map((id) => ({ id, rank: 6 })), ...o });
// a hero at a monster's own level (a hero far below it never gets a turn)
const heroAt = (L, cls, ids, o = {}) => { const bb = heroBase(L); return hero(cls, ids, { level: L, atk: bb.atk * 5, def: bb.def * 5, hp: bb.hp * 40, spd: bb.spd * 3, ...o }); };
const boss = ALL_MOBS.find((m) => m.ty === 2 && !m.st && /\|0$/.test(m.k));
const small = ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k));
const byName = (en) => ALL_MOBS.find((m) => m.en === en && /\|3$/.test(m.k));
const griffin = byName('Storm Griffin'), orochi = byName('Yamata no Orochi');
const mob = (m, extra = {}) => ({ kind: 'mob', uid: 'm' + Math.random(), key: m.k, level: m.lv || lv, sr: m.sr, count: 1, fix: m.st, ...extra });
// the hits one cast of a hero lands on one unit
const castHits = (r, heroId, tid, name) => { const i = r.events.findIndex((e) => e.e === 'cast' && e.u === heroId && (!name || e.n === name)); const o = []; for (let j = i + 1; j < r.events.length && r.events[j].e !== 'cast' && r.events[j].e !== 'turn'; j++) if (r.events[j].e === 'hit' && r.events[j].t === tid && r.events[j].k !== 3) o.push(r.events[j].d); return o; };

// 1) footprints (game data: Hieromon 4×4 / 5×5) and placement
{
  const H6 = ['Storm Griffin', 'Flamoenix', 'Yoldra', 'Yamata no Orochi', 'Primordial Loong', 'Galactic Mecha'].map(byName);
  const want = [4, 4, 4, 5, 5, 5];
  ok(H6.every((m, i) => m && m.sz === want[i]), `Hieromon bodies ${H6.map((m) => m && `${m.en} ${m.sz}×${m.sz}`).join(', ')}`);
  const meta = roster({ mode: 'pve', teams: [[hero('Zhanshi', [10000])], [mob(boss), mob(orochi), mob(griffin), mob(small, { count: 6 })]] });
  const bossM = meta.find((u) => u.key === boss.k), oM = meta.find((u) => u.key === orochi.k), gM = meta.find((u) => u.key === griffin.k);
  ok(bossM.sz === 2 && oM.sz === 5 && gM.sz === 4 && fpOf(oM).length === 25 && fpOf(gM).length === 16, `boss 2×2 (${boss.en}, assumed), Orochi 5×5, Griffin 4×4`);
  const cells = new Map(); let overlap = 0, wrongSide = 0, off = 0;
  for (const u of meta) if (!u.out) for (const [dx, dy] of fpOf(u)) { const x = u.x + dx, y = u.y + dy, k = y * 21 + x; if (cells.has(k)) overlap++; cells.set(k, u.id); if (u.team === 1 && y < 11) wrongSide++; if (x < 0 || x > 20 || y < 0 || y > 19) off++; }
  ok(!overlap && !wrongSide && !off, `no overlapping cells, all on their side and the board (${cells.size} cells)`);
}
// 2) "Large targets may take multiple hits": one hit per game hit config that touches the body.
//    Water Assault is 4 rows of 3 cells (−25% per repeat): a 2×2 boss in front takes 2 hits, a 5×5 Hieromon 4.
{
  const s = sk(10003);
  ok(s && s.multi && s.rep && s.rep.d === 0.25 && s.parts && s.parts.length === 4, 'Water Assault: multi, 25% repeat decay, 4 row configs');
  // (another ready skill after it: Water Assault is not the turn's last cast, so the caster walks the least instead of keeping away)
  const P = prepare({ mode: 'pve', roundCap: 3, teams: [[hero('Fashi', [10003, 10000], { cell: [10, 9] })], [mob(boss, { cell: [10, 11] })]] });
  const WA = s.ko;
  const r = simulate(P, 7, true), hits = castHits(r, P.units.findIndex((u) => u.kind === 'hero'), P.units.findIndex((u) => u.key === boss.k), WA);
  ok(hits.length === 2, `Water Assault hits a 2×2 boss ${hits.length}× (rows it touches), damages ${hits.join(' / ')}`);
  const P5 = prepare({ mode: 'pve', roundCap: 3, teams: [[heroAt(orochi.lv, 'Fashi', [10003, 10000], { cell: [10, 9] })], [mob(orochi, { cell: [10, 13] })]] });
  const r5 = simulate(P5, 7, true), h5 = castHits(r5, P5.units.findIndex((u) => u.kind === 'hero'), P5.units.findIndex((u) => u.key === orochi.k), WA);
  ok(h5.length >= 1 && h5.length <= 4, `Water Assault hits a 5×5 Hieromon ${h5.length}× (one per row it touches, never 12 cells), ${h5.join(' / ')}`);
  const sd = sk(10106);
  if (sd && sd.parts) {
    const PD = prepare({ mode: 'pve', roundCap: 3, teams: [[heroAt(orochi.lv, sd.cls, [10106], { cell: [10, 9] })], [mob(orochi, { cell: [10, 13] })]] });
    const rd = simulate(PD, 7, true), hd = castHits(rd, PD.units.findIndex((u) => u.kind === 'hero'), PD.units.findIndex((u) => u.key === orochi.k));
    ok(hd.length >= 1 && hd.length <= 2, `Dawnburst (inner 2 grids + outer ring) hits a 5×5 Hieromon ${hd.length}× (at most 2)`);
  }
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
// 7) the game's keep-away AI: a ranged skill's last cast of the turn is made from the edge of its range
{
  const s = sk(10000);
  ok(s && s.kd === 1 && !sk(10009).kd, 'Water Shot keeps its distance (game data RangeType Far), Heavy Impact does not');
  const P = prepare({ mode: 'pve', roundCap: 3, teams: [[hero('Fashi', [10000], { cell: [10, 5], spd: b.spd * 3 })], [mob(small, { cell: [10, 12] })]] });
  const r = simulate(P, 2, true), pos = { 0: [10, 5], 1: [10, 12] }, dists = [];
  for (const e of r.events) { if (e.e === 'move') pos[e.u] = [e.x, e.y]; if (e.e === 'cast' && e.u === 0) dists.push(Math.abs(pos[0][0] - pos[1][0]) + Math.abs(pos[0][1] - pos[1][1])); }
  ok(dists.length >= 2 && dists.every((d) => d === s.tg.r), `a mage casts Water Shot from the edge of its range (distances ${dists.join(', ')}, range ${s.tg.r})`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all movement / size tests passed');
process.exit(bad ? 1 : 0);
