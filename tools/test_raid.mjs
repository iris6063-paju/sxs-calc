// Chaos Tyrant raid checks: node tools/test_raid.mjs
import { heroBase, prepare, simulate, monteCarlo, ALL_MOBS, fpOf } from '../js/engine.js';
import { ENC } from '../js/gamedata2.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const T = ALL_MOBS.find((m) => m.en === 'Chaos Tyrant');
ok(T && T.sz === 5 && T.raid && T.raid.move === 8, `Chaos Tyrant: 5×5 body, moves 8 (${T && T.ko})`);
const raid = ENC.find((m) => m.id === 'raid'), master = raid && raid.groups.find((g) => g.en === 'Saint1');
const i130 = master ? master.fights.findIndex((f) => f[3] === 130) : -1, st = i130 >= 0 ? master.st[i130][0] : null;
// the stat screen purrwikimania matched against the game at level 130 Master I
ok(st && st[0] === 74586320000000 && st[1] === 161579 && st[2] === 338547 && st[3] === 220056, `Master Lv.130 stats ${st && st.slice(0, 4).join(' / ')}`);

const L = 130, b = heroBase(L);
const hero = (cls, cell, o = {}) => ({ kind: 'hero', uid: 'h' + Math.random(), cls, level: L, atk: b.atk * 30, def: b.def * 30, hp: b.hp * 2e5, spd: b.spd * 0.4, skills: [{ id: 10000, rank: 6 }], cell, ...o });
const boss = { kind: 'mob', uid: 'boss', key: T.k, level: 130, sr: 'Saint1', count: 1, fix: st };
// heroes slow and tough enough that the boss reaches its 20th action
const P = prepare({ mode: 'pve', roundCap: 60, teams: [[hero('Zhanshi', [9, 8]), hero('Fashi', [11, 7]), hero('Shushi', [13, 6])], [boss]] });
const r = simulate(P, 11, true), bid = P.units.findIndex((u) => u.key === T.k);
const turns = []; let n = 0;
for (const e of r.events) { if (e.e === 'turn') { if (e.u === bid) { n++; turns.push({ n, casts: [] }); } } else if (e.e === 'cast' && e.u === bid && turns.length) turns[turns.length - 1].casts.push(e.n); }
const castOn = (name) => turns.filter((t) => t.casts.includes(name)).map((t) => t.n);
const doom = castOn('천상의 파멸'), cry = castOn('대지의 포효'), grip = castOn('망각의 손아귀');
ok(doom[0] === 5 && (doom[1] || 10) === 10, `Heaven's Doom on boss turns ${doom.join(',')} (first on the 5th)`);
ok(cry.length && cry[0] >= 10 && cry.every((x) => x >= 10), `Terra's Cry only from the 10th turn: ${cry.join(',')}`);
ok(castOn('혼돈의 힘')[0] === 10, `Chaos Power on turn ${castOn('혼돈의 힘').join(',')}`);
ok(grip.length >= 15, `Grip of Oblivion most turns (${grip.length} of ${turns.length})`);
ok(castOn('종말과 시작')[0] === 20 && r.winner === 1, `End to Beginning on turn ${castOn('종말과 시작').join(',')} wipes the party (winner ${r.winner})`);
// Terra's Cry / Grip measure from the 5×5 body: every Terra's Cry target stood within 3 grids of the body's edge
{
  let far = 0, hits = 0, pos = new Map(P.units.map((u) => [u.id, [u.x, u.y]]));
  let cur = null;
  for (const e of r.events) {
    if (e.e === 'move') pos.set(e.u, [e.x, e.y]);
    else if (e.e === 'cast') cur = e.u === bid && e.n === '대지의 포효' ? e : null;
    else if (e.e === 'hit' && cur && e.a === bid) { const [bx, by] = pos.get(bid), [hx, hy] = pos.get(e.t); const d = Math.min(...fpOf({ sz: 5 }).map(([dx, dy]) => Math.abs(bx + dx - hx) + Math.abs(by + dy - hy))); hits++; if (d > 3) far++; }
  }
  ok(hits > 0 && !far, `Terra's Cry hits stay within 3 grids of the body (${hits} hits, ${far} too far)`);
}
const mc = monteCarlo({ mode: 'pve', roundCap: 25, teams: [[hero('Zhanshi', null), hero('Fashi', null)], [boss]] }, 60);
ok(mc.n === 60 && !mc.invalid, `25-round raid Monte Carlo runs (${mc.n} fights)`);
console.log(bad ? `FAILURES: ${bad}` : 'all raid tests passed');
process.exit(bad ? 1 : 0);
