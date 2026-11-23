// Support skills walk first (the game's AI plans heals / shields / buffs like attacks): node tools/test_support.mjs
import { prepare, simulate, heroBase, ALL_MOBS } from '../js/engine.js';

let bad = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) bad++; };
const L = 60, b = heroBase(L);
const hero = (uid, cls, ids, cell, o = {}) => ({ kind: 'hero', uid, name: uid, cls, level: L, atk: b.atk * 0.05, def: b.def, hp: b.hp * 400, spd: b.spd, blockRate: 0, skills: ids.map((id) => ({ id, rank: 6 })), cell, ...o });
const boar = (cell, o = {}) => ({ kind: 'mob', uid: 'm' + cell.join('_'), key: ALL_MOBS.find((m) => m.en === 'Beetle Samurai' && m.sr).k, level: L, count: 1, cell, ...o });
/** replay a fight's positions / HP; f(e, state) for every event */
function walk(P, r, f) {
  const pos = P.units.map((u) => [u.x, u.y]), hp = P.units.map((u) => u.hpMax), st = { pos, hp, turn: null };
  for (const e of r.events) {
    if (e.e === 'turn') st.turn = e.u;
    f(e, st);
    if (e.e === 'move') pos[e.u] = [e.x, e.y];
    else if (e.e === 'spawn') { pos[e.u] = [e.x, e.y]; hp[e.u] = e.hp || P.units[e.u].hpMax; }
    else if (e.e === 'hit' || e.e === 'heal') hp[e.t] = e.hp;
  }
}
const d1 = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]);

// 1) a single-target heal (Healing Touch, 7 grids): when the hurt ally is 8–11 grids away (and lower than the healer),
//    the healer walks up to 4 first and heals it instead of itself; turns with the heal on cooldown are not counted
{
  let casts = 0, healed = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const P = prepare({ mode: 'pve', roundCap: 6, teams: [[hero('healer', 'Fashi', [10020], [9, 3]), hero('tank', 'Zhanshi', [10008], [14, 9], { def: b.def * 0.2 })], [boar([14, 12])]] });
    const r = simulate(P, seed, true), hi = 0, ti = 1, ratio = (s, i) => s.hp[i] / P.units[i].hpMax;
    let want = false;
    walk(P, r, (e, s) => {
      if (e.e === 'turn') { const d = d1(s.pos[hi], s.pos[ti]); want = e.u === hi && ratio(s, ti) < 1 && ratio(s, ti) < ratio(s, hi) && d > 7 && d <= 11; }
      if (e.e === 'cast' && want && e.u === hi) casts++;
      if (e.e === 'heal' && want && e.a === hi && e.t === ti) { healed++; want = false; }
    });
  }
  ok(casts > 0 && healed === casts, `Healing Touch: the healer walks into range of a hurt ally 8–11 grids away (${healed}/${casts} casts)`);
}
// 2) an area heal (Radiant Restoration, 4 grids around the caster): the Sage steps between two hurt allies to reach both
{
  let both = 0, casts = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const P = prepare({ mode: 'pve', roundCap: 6, teams: [[hero('sage', 'Xianzhe', [10021], [10, 4]), hero('a', 'Zhanshi', [10008], [8, 9], { def: b.def * 0.2 }), hero('b', 'Zhanshi', [10008], [12, 9], { def: b.def * 0.2 })], [boar([8, 11]), boar([12, 11])]] });
    const r = simulate(P, seed, true);
    let cur = null;
    walk(P, r, (e) => {
      if (e.e === 'cast') cur = e.u === 0 && e.sup ? new Set() : null;
      if (e.e === 'cast' && e.u === 0) casts++;
      if (e.e === 'heal' && cur && e.a === 0) { cur.add(e.t); if (cur.has(1) && cur.has(2) && !cur.done) { cur.done = 1; both++; } }
    });
  }
  ok(casts > 0 && both > 0, `Radiant Restoration: the Sage moves to heal both hurt allies in one cast (${both} of ${casts} casts)`);
}
// 3) the Water Spirit (move 6) follows to heal; the Frenzy Totem (move 0 in the game data) stays where it is summoned
{
  let wMoves = 0, wHealsFar = 0, totemMoves = 0, totems = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const P = prepare({ mode: 'pve', roundCap: 8, teams: [[hero('mi', 'Mishushi', [10071, 10080], [6, 3]), hero('tank', 'Zhanshi', [10008], [15, 9], { def: b.def * 0.2 })], [boar([15, 12])]] });
    const r = simulate(P, seed, true);
    const isW = (i) => P.units[i].sum && P.units[i].name === '늪 도룡뇽', isT = (i) => P.units[i].sum && P.units[i].name === '열광의 토템';
    walk(P, r, (e, s) => {
      if (e.e === 'move' && isW(e.u)) wMoves++;
      if (e.e === 'move' && isT(e.u)) totemMoves++;
      if (e.e === 'spawn' && isT(e.u)) totems++;
      if (e.e === 'heal' && isW(e.a) && e.t === 1) wHealsFar++;
    });
  }
  ok(wMoves > 0 && wHealsFar > 0, `Water Spirit walks (${wMoves} moves) and heals the far tank (${wHealsFar} heals)`);
  ok(totems > 0 && totemMoves === 0, `Frenzy Totem: ${totems} summoned, never moves (moveDist 0)`);
}
// 4) a monster's heal on allies (Bronze Face · Vital Recovery, 1 grid): it steps next to a hurt ally before casting
{
  const BF = ALL_MOBS.find((m) => m.en === 'Bronze Face' && m.sr);
  let moved = 0, other = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const party = [0, 1, 2].map((i) => hero('h' + i, 'Fashi', [10000], [8 + 2 * i, 4], { atk: b.atk * 2, def: b.def * 50 }));
    const P = prepare({ mode: 'pve', roundCap: 8, teams: [party, [{ kind: 'mob', uid: 'bf1', key: BF.k, level: L, count: 1, sr: BF.sr, cell: [7, 12] }, { kind: 'mob', uid: 'bf2', key: BF.k, level: L, count: 1, sr: BF.sr, cell: [13, 12] }]] });
    const r = simulate(P, seed, true);
    let movedNow = false, castNow = false;
    walk(P, r, (e, s) => {
      if (e.e === 'turn') { movedNow = false; castNow = false; }
      if (e.e === 'move' && e.u === s.turn && P.units[e.u].kind === 'mob') movedNow = true;
      if (e.e === 'cast' && e.n === '활력 회복') castNow = true;
      if (e.e === 'heal' && castNow && P.units[e.a].kind === 'mob' && e.t !== e.a) { other++; if (movedNow) moved++; }
    });
  }
  ok(other > 0 && moved > 0, `Bronze Face's Vital Recovery reaches another hurt Bronze Face (${other} heals, ${moved} after stepping over)`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all support movement tests passed');
process.exit(bad ? 1 : 0);
