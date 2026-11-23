// Hieromon boss kits from the game data: node tools/test_bosses.mjs
import { heroBase, prepare, simulate, ALL_MOBS } from '../js/engine.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const byName = (en) => ALL_MOBS.find((m) => m.en === en && /\|3$/.test(m.k));
const hero = (L, cls, ids, cell, o = {}) => { const b = heroBase(L); return { kind: 'hero', uid: 'h' + Math.random(), cls, level: L, atk: b.atk * 3, def: b.def * 40, hp: b.hp * 4000, spd: b.spd * 2, skills: ids.map((id) => ({ id, rank: 6 })), cell, ...o }; };
// hpDiv cuts the boss's HP so a test fight reaches its second half
const boss = (m, cell, hpDiv = 1) => ({ kind: 'mob', uid: 'b', key: m.k, level: m.lv, sr: m.sr, count: 1, fix: m.st.map((v, i) => (i === 0 ? Math.round(v / hpDiv) : v)), cell });
// per boss cast: name, hits on each unit, knockback / pull moves, the boss's HP share when it cast
function casts(P, r, bid) {
  const out = []; let cur = null, bossHp = P.units[bid].hpMax;
  for (const e of r.events) {
    if (e.e === 'cast') { cur = e.u === bid ? { n: e.n, hits: new Map(), kb: 0, pull: 0, hp: bossHp / P.units[bid].hpMax } : null; if (cur) out.push(cur); }
    else if (e.e === 'turn') cur = null;
    else if (e.e === 'hit') { if (e.t === bid) bossHp = e.hp; if (cur && e.a === bid && e.k !== 3) cur.hits.set(e.t, (cur.hits.get(e.t) || 0) + 1); }
    else if (e.e === 'move' && cur && e.u !== bid) { if (e.kb) cur.kb++; if (e.pull) cur.pull++; }
  }
  return out;
}

// 1) Storm Griffin · Cyclone Wheel: 6 hit configs, each knocks back 1 grid and the next one reaches a row further,
//    so a target in front is pushed and struck again (the user's report: "넉백되면서 계속 맞는 판정")
{
  const G = byName('Storm Griffin');
  ok(G.kit && G.sk.find((s) => s.en === 'Cyclone Wheel').h.length === 6, `Griffin kit from game data: ${G.sk.map((s) => s.ko).join(', ')}`);
  const P = prepare({ mode: 'pve', roundCap: 6, teams: [[hero(G.lv, 'Zhanshi', [10000], [10, 9])], [boss(G, [10, 13])]] });
  const r = simulate(P, 5, true), bid = P.units.findIndex((u) => u.key === G.k), hid = P.units.findIndex((u) => u.kind === 'hero');
  const cw = casts(P, r, bid).filter((c) => c.n === '사이클론 휠');
  const most = Math.max(0, ...cw.map((c) => c.hits.get(hid) || 0)), kbs = Math.max(0, ...cw.map((c) => c.kb));
  ok(cw.length > 0 && most >= 4 && kbs >= 3, `Cyclone Wheel struck the hero up to ${most}× in one cast with ${kbs} knockbacks (${cw.length} casts)`);
  // Stellar Descent is a rage skill: only at 50% HP or less
  const P2 = prepare({ mode: 'pve', roundCap: 40, teams: [[hero(G.lv, 'Zhanshi', [10000], [10, 9])], [boss(G, [10, 13], 3e5)]] });
  const r2 = simulate(P2, 7, true), b2 = P2.units.findIndex((u) => u.key === G.k);
  const all2 = casts(P2, r2, b2), sd = all2.filter((c) => c.n === '별의 강림');
  ok(sd.length > 0 && sd.every((c) => c.hp <= 0.5) && all2.some((c) => c.hp > 0.5), `Stellar Descent only at ≤50% HP (${sd.length} casts at HP ${sd.slice(0, 6).map((c) => Math.round(c.hp * 100) + '%').join(' ')}…)`);
}
// 2) Primordial Loong: the Fire set until HP first reaches 50% (Primal Awakening), the Light set after
{
  const L = byName('Primordial Loong');
  const P = prepare({ mode: 'pve', roundCap: 40, teams: [[hero(L.lv, 'Zhanshi', [10000], [10, 8])], [boss(L, [10, 14], 3e5)]] });
  const r = simulate(P, 3, true), bid = P.units.findIndex((u) => u.key === L.k);
  const cs = casts(P, r, bid), fire = ['화염탄', '화염 강타', '블레이즈 탱고'], light = ['천둥 플라스마', '낙뢰', '썬더 삼바', '용의 분노'];
  const firstLight = cs.findIndex((c) => light.includes(c.n)), lastFire = cs.map((c) => fire.includes(c.n)).lastIndexOf(true);
  ok(cs.some((c) => fire.includes(c.n)) && firstLight > 0 && lastFire < firstLight && cs[firstLight].hp <= 0.5, `Loong: Fire set first, Light set after awakening (${cs.slice(Math.max(0, firstLight - 2), firstLight + 3).map((c) => `${c.n}@${Math.round(c.hp * 100)}%`).join(' → ')})`);
}
// 3) Galactic Mecha · Void Singularity pulls (no damage coefficient in the data)
{
  const M = byName('Galactic Mecha');
  const P = prepare({ mode: 'pve', roundCap: 6, teams: [[hero(M.lv, 'Fashi', [10000], [10, 5]), hero(M.lv, 'Zhanshi', [10000], [13, 8])], [boss(M, [10, 14])]] });
  const r = simulate(P, 9, true), bid = P.units.findIndex((u) => u.key === M.k);
  const vs = casts(P, r, bid).filter((c) => c.n === '동적 연산 - 공허 특이점');
  ok(vs.length > 0 && vs.some((c) => c.pull > 0) && vs.every((c) => ![...c.hits.values()].some(Boolean)), `Void Singularity pulls (${vs.reduce((a, c) => a + c.pull, 0)} pulls, no damage) in ${vs.length} casts`);
}
// 4) text-parsed bosses: random strikes, pull wording, "Selects 1 grid", rage-only skills
{
  const sk = (mob, name) => { const m = ALL_MOBS.find((x) => x.en === mob); return m && m.sk.find((s) => s.en === name); };
  const mv = sk('Magma Fiend', 'Meteor Volley');
  ok(mv && mv.sp && mv.sp.k === 'scatter' && mv.sp.n === 12 && mv.sp.R === 5 && mv.sp.a === 1 && mv.sp.min === 4 && mv.rep, 'Meteor Volley: 12 random strikes within 5 grids, 1-grid blasts, at least 4 land, −40% repeats');
  const pe = sk('Clockwork King', "Pretender's Edict");
  ok(pe && pe.sp && pe.sp.from === 'aim' && pe.sp.n === 12 && pe.sp.min === 4 && pe.tg.t === 'T', "Pretender's Edict: 12 random strikes within 3 grids of a chosen grid, at least 4");
  ok((sk('Master Fixer', 'Precision Repair') || {}).pull === 'c' && (sk('Saucer-α', 'Lucky Catch') || {}).pull === 'c', 'pull to the caster (Precision Repair, Lucky Catch)');
  const av = sk('Thalanima', 'Abyssal Vortex');
  ok(av && av.tg.t === 'T' && av.tg.r === 4 && av.pull === 'a', 'Abyssal Vortex: a grid within 4, pulls to the target grid');
  ok((sk('Taowu', "Earth's Shake") || {}).rage === 1, "Earth's Shake only in Rage");
  // a scatter skill lands several strikes in one cast
  const MF = ALL_MOBS.find((x) => x.en === 'Magma Fiend');
  const b = heroBase(MF.lv || 100);
  const P = prepare({ mode: 'pve', roundCap: 6, mobCoef: 1, teams: [[0, 1, 2].map((i) => ({ kind: 'hero', uid: 'q' + i, cls: 'Zhanshi', level: MF.lv || 100, atk: b.atk, def: b.def * 40, hp: b.hp * 4000, spd: b.spd * 0.5, skills: [{ id: 10000, rank: 1 }], cell: [9 + i, 9] })), [{ kind: 'mob', uid: 'mf', key: MF.k, level: MF.lv || 100, sr: MF.sr, count: 1, fix: MF.st, cell: [10, 12] }]] });
  const r = simulate(P, 4, true), mid = P.units.findIndex((u) => u.key === MF.k);
  let best = 0, cur = null; for (const e of r.events) { if (e.e === 'cast') cur = e.u === mid ? { n: 0 } : null; else if (e.e === 'turn') { if (cur) best = Math.max(best, cur.n); cur = null; } else if (e.e === 'hit' && cur && e.a === mid && e.k !== 3) cur.n++; }
  ok(best >= 4, `Magma Fiend's casts land up to ${best} strikes`);
}
// 5) monster elemental stats (game curves) and the PvE rank gap
{
  const O = byName('Yamata no Orochi'), b = heroBase(O.lv);
  const party = [0, 1, 2].map((i) => ({ kind: 'hero', uid: 'e' + i, cls: 'Zhanshi', level: O.lv, atk: b.atk * 3, def: b.def * 3, hp: b.hp * 1e4, spd: b.spd, skills: [{ id: 10000, rank: 6 }] }));
  const mobDmg = (fix, rank) => { const P = prepare({ mode: 'pve', roundCap: 5, rank, teams: [party, [{ kind: 'mob', uid: 'o', key: O.k, level: O.lv, sr: O.sr, count: 1, fix }]] }); let s = 0; for (const e of simulate(P, 3, true).events) if (e.e === 'hit' && P.units[e.a].kind === 'mob') s += e.d; return s; };
  const old = mobDmg(O.st.slice(0, 14)), now = mobDmg(O.st), low = mobDmg(O.st, 'Gold');
  ok(O.st.length >= 20 && now / old > 1.5, `Master Orochi's water attacks carry its affinity / mastery: ×${(now / old).toFixed(2)} against 14-number stats`);
  ok(Math.abs(low / now - 81) < 0.5, `party rank Champion against a Master monster: monster DMG ×${(low / now).toFixed(1)} (1 + |95 − 15|)`);
}
// 6) Momentum Backlash (Cyclopean Geocrusher): a counter state until its next turn starts, one Light hit back per
//    technique cast; Reflection Mask (Bronze Face) keeps a basic attack beside it
{
  const G = ALL_MOBS.find((x) => x.k === '3613|2'), BF = ALL_MOBS.find((x) => x.en === 'Bronze Face');
  const mb = G.sk.find((s) => s.en === 'Momentum Backlash');
  ok(mb && mb.kind === 'counterSt' && mb.el === 'light' && mb.next && mb.nd, 'Geocrusher keeps Momentum Backlash: Light counter state, until its next turn, cannot be dispelled');
  ok(BF && BF.sk.some((s) => s.kind === 'counterSt' && s.el === 'phy' && s.t === 1) && BF.sk.some((s) => s.tg), 'Bronze Face: Reflection Mask (1 turn, Physical) and a basic attack');
  const b = heroBase(130);
  const hero = { kind: 'hero', uid: 'c', cls: 'Fashi', level: 130, atk: b.atk * 2, def: b.def * 30, hp: b.hp * 3000, spd: b.spd * 2, skills: [{ id: 10000, rank: 6 }, { id: 10028, rank: 6 }], cell: [10, 7] };
  const P = prepare({ mode: 'pve', roundCap: 10, mobCoef: 1, teams: [[hero], [{ kind: 'mob', uid: 'g', key: G.k, level: 130, sr: 'Silver1', count: 1, cell: [10, 10] }]] });
  const gi = P.units.findIndex((u) => u.kind === 'mob');
  let on = 0, counters = 0, late = 0, offAtTurn = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = simulate(P, seed, true); let active = false, by = null, cnt = 0, turnU = null, castSince = false;
    for (const e of r.events) {
      if (e.e === 'turn') { turnU = e.u; castSince = false; continue; }
      if (e.e === 'st' && e.t === gi && e.k === 'counterSt') { if (!e.on && turnU === gi && !castSince) offAtTurn++; active = !!e.on; if (e.on) on++; }
      if (e.e === 'cast') { by = e.u; cnt = 0; castSince = true; if (e.u === gi && active && e.n !== '기세 반격') late++; }
      if (e.e === 'hit' && e.a === gi && by != null && by !== gi && !P.units[by].pet) { cnt++; counters++; if (!active || cnt > 1) late++; }
    }
  }
  ok(on > 0 && counters > 0 && late === 0 && offAtTurn > 0, `Momentum Backlash: ${on} stances, ${counters} counters (one per hero cast, only while on), removed at its turn start`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all boss kit tests passed');
process.exit(bad ? 1 : 0);
