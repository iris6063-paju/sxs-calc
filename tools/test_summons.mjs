// Summons and the other formerly unmodelled hero skills: node tools/test_summons.mjs
import { heroBase, prepare, simulate, replay, ALL_MOBS } from '../js/engine.js';
import { SUMMONS, SUMCURVE } from '../js/gamedata2.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const L = 130, b = heroBase(L), small = ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k));
const hero = (skills, o = {}) => ({ kind: 'hero', uid: 'h', name: '소환사', cls: 'Fashi', level: L, atk: b.atk * 3, def: b.def * 20, hp: b.hp * 300, spd: b.spd * 3, skills: skills.map((id) => ({ id, rank: 6 })), cell: [10, 9], ...o });
const foe = (o = {}) => ({ kind: 'mob', uid: 'm', key: small.k, level: L, count: 1, cell: [10, 13], ...o });
const run = (teams, seed = 7, mode = 'pve', cap = 8) => { const P = prepare({ mode, roundCap: cap, teams }); return { P, r: simulate(P, seed, true) }; };
const casts = (r, P, name) => r.events.filter((e) => e.e === 'cast' && (!name || e.n === name));

// Stonechief: stats from the caster's sheet (HP 18% × rank factor + the fixed curve part), it acts at once and fades
{
  const { P, r } = run([[hero([10019])], [foe({ count: 3 })]]);
  const st = P.units.find((u) => u.sum && u.name === '바위 정령'), sm = SUMMONS[10019], H = P.units[0].hpMax;
  const want = Math.round(H * 0.18 * sm.cr.rf.hp[5] + SUMCURVE['1:MaxHp'][L] * sm.cr.fx[0].m[5]);
  ok(st && st.hpMax === want, `Stonechief HP ${st && st.hpMax} = caster HP × 18% × ${sm.cr.rf.hp[5]} + curve × ${sm.cr.fx[0].m[5]} (${want})`);
  ok(Math.abs(st.atk - Math.round(P.units[0].atk * 0.7)) <= 1, `Stonechief ATK ${st.atk} = 70% of the caster's ${P.units[0].atk}`);
  const sp = r.events.findIndex((e) => e.e === 'spawn' && e.u === st.id), next = r.events.slice(sp + 1).find((e) => e.e === 'turn');
  ok(sp > 0 && next && next.u === st.id, 'it is summoned and takes the very next turn (SummonImmediateRound)');
  const own = r.events.filter((e) => e.e === 'cast' && e.u === st.id).map((e) => e.n);
  ok(own.includes('바위 깨기') || own.includes('지진'), `it casts its own skills: ${[...new Set(own)].join(', ')}`);
  const turns = []; let n = 0;
  for (const e of r.events) { if (e.e === 'spawn' && e.u === st.id) n = 0; if (e.e === 'turn' && e.u === st.id) n++; if (e.e === 'die' && e.u === st.id && e.fade) turns.push(n); }
  ok(turns.length > 0 && turns.every((t) => t === 5), `it fades after its 5th own turn (${turns.join(', ')})`);
}
// Flame Wolf: two of them, in Stealth — the monsters keep aiming at the caster while it stands
{
  const { P, r } = run([[hero([10058])], [foe({ count: 2 })]], 11);
  const wolves = P.units.filter((u) => u.sum && u.name === '화염 늑대').map((u) => u.id);
  const spawns = r.events.filter((e) => e.e === 'spawn' && wolves.includes(e.u));
  ok(spawns.length >= 2 && r.events.filter((e) => e.e === 'spawn').length % 2 === 0, `Flame Wolf Summon brings 2 wolves (${spawns.length} spawns)`);
  const mobCasts = r.events.filter((e) => e.e === 'cast' && P.units[e.u].kind === 'mob');
  const aimedAtWolf = mobCasts.filter((e) => e.tg.length === 1 && wolves.includes(e.tg[0])).length;
  ok(aimedAtWolf === 0, `Stealth: no single-target monster attack picks a wolf (${mobCasts.length} monster casts)`);
}
// Waterling heals its side
{
  const { P, r } = run([[hero([10071], { hp: b.hp * 40 })], [foe({ count: 3, level: L + 10 })]], 5, 'pve', 10);
  const w = P.units.find((u) => u.sum && u.name === '늪 도룡뇽');
  const heals = r.events.filter((e) => e.e === 'heal' && e.a === w.id);
  ok(heals.length > 0, `Waterling heals (${heals.length} heals, Dewdrop ${(SUMMONS[10071].cr.sk[0].hv * 100).toFixed(1)}% of its max HP)`);
}
// Frenzy Totem: +12% ATK for allies around it, and Inspiration pulls an ally's turn forward
{
  const ally = { ...hero([10000]), uid: 'h2', name: '아군', cell: [11, 9] };
  const { P, r } = run([[hero([10080]), ally], [foe({ count: 3 })]], 3);
  const t = P.units.find((u) => u.sum && u.name === '열광의 토템');
  ok(r.events.some((e) => e.e === 'spawn' && e.u === t.id), 'Frenzy Totem is placed');
  ok(r.events.some((e) => e.e === 'st' && e.k === 'atkUp' && e.on && P.units[e.t].kind === 'hero'), 'an ally near the totem gains ATK Up (Fighting Spirit)');
  ok(casts(r, P, '고무').length > 0, `the totem casts Inspiration (${casts(r, P, '고무').length}×)`);
}
// Decoy Clone: the HP the clone loses, the linked monster loses as True DMG
{
  const ally = { ...hero([10000]), uid: 'h2', name: '딜러', cell: [11, 9] };
  const { P, r } = run([[hero([10097]), ally], [foe({ count: 1, cell: [10, 12] })]], 9);
  const c = P.units.find((u) => u.clone), mob = P.units.find((u) => u.kind === 'mob');
  ok(c && c.team === mob.team, 'the clone stands on the side of the enemy it links to');
  const onClone = r.events.findIndex((e) => e.e === 'hit' && e.t === c.id && e.d > 0);
  const linked = onClone >= 0 && r.events.slice(onClone + 1, onClone + 3).some((e) => e.e === 'hit' && e.t === mob.id && e.k === 4);
  ok(linked, 'a hit on the clone is passed to the linked monster (True DMG)');
}
// Blast Spirit: explodes at the end of the caster's turn on an enemy within 2 grids
{
  const { P, r } = run([[hero([10094])], [foe({ count: 2, cell: [10, 11] })]], 4);
  const boom = casts(r, P, '불꽃요정 폭발');
  ok(r.events.some((e) => e.e === 'trap' && e.on) && boom.length > 0, `Blast Spirits are placed and explode (${boom.length}×)`);
  const i = r.events.indexOf(boom[0]);
  ok(i > 0 && r.events.slice(i + 1, i + 4).some((e) => e.e === 'hit' && e.el === 'fire' && e.a === 0), 'the explosion is the caster\'s Fire hit');
}
// Void Chant: an enemy within 5 grids that casts takes Dark DMG once per cast
{
  const { P, r } = run([[hero([10124, 10000])], [foe({ count: 2, cell: [10, 12] })]], 6);
  const rune = casts(r, P, '보이드 커스 · 룬');
  ok(rune.length > 0 && rune.every((e) => P.units[e.tg[0]].team === 1), `the rune strikes casting enemies (${rune.length}×)`);
}
// Meteoric Flames: burning ground (60% per struck cell, 3 caster turns) burns an enemy that stands on it or steps in
{
  let burns = 0, tiles = 0, fights = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { P, r } = run([[hero([10070])], [foe({ count: 4, cell: [10, 14] })]], seed);
    fights++; tiles += r.events.filter((e) => e.e === 'trap' && e.on && e.burn).length; burns += casts(r, P, '작열').length;
  }
  ok(tiles > 0 && burns > 0, `burning ground: ${tiles} tiles and ${burns} burns in ${fights} fights`);
}
// Wind Blade Spiral: Laceration (40%, 1 turn) — the holder takes the caster's Wind DMG each time it moves
{
  let lac = 0, onMove = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { P, r } = run([[hero([10091])], [foe({ count: 3, cell: [10, 13] })]], seed);
    lac += r.events.filter((e) => e.e === 'st' && e.k === 'lacer' && e.on).length;
    r.events.forEach((e, i) => { if (e.e === 'cast' && e.n === '열상') { const prev = r.events.slice(Math.max(0, i - 2), i); if (prev.some((x) => x.e === 'move' && x.u === e.tg[0])) onMove++; } });
  }
  ok(lac > 0 && onMove > 0, `Laceration lands (${lac}×) and strikes on a move (${onMove}×)`);
}
// a fight without summon skills has no summon units at all
{
  const P = prepare({ mode: 'pve', teams: [[hero([10000])], [foe()]] });
  ok(!P.units.some((u) => u.sum), 'no summon slots for a caster without summon skills');
}
// replays carry the summon meta for the arena
{
  const rp = replay({ mode: 'pve', roundCap: 4, teams: [[hero([10019])], [foe()]] }, 1);
  const m = rp.meta.find((x) => x.sum);
  ok(m && m.art === 'golem' && m.out, `replay meta: summon slot ${m && m.name} (art ${m && m.art}, waits off the board)`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all summon tests passed');
process.exit(bad ? 1 : 0);
