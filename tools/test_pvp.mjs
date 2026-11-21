// PvP damage: the defender's rank divisors, Beauty of Balance I / II, PvP rates on heals: node tools/test_pvp.mjs
import { heroBase, prepare, simulate, pvpGovernor, subOfLevel } from '../js/engine.js';
import { PVPR, RANK_BASE } from '../js/gamedata2.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const near = (a, b, tol = 0.01) => Math.abs(a / b - 1) < tol;
// one plain physical hit per cast: no crit (Crit Rate −5% cancels the base 5%), no block (Accuracy 100%), no elements
const strike = { custom: { name: '시험 타격', el: 'phy', coef: 100, flat: 0, hits: 1, range: 9 } };
const hero = (L, o = {}) => { const b = heroBase(L); return { kind: 'hero', uid: 'h' + Math.random(), name: '영웅', cls: 'Modaoshi', level: L, atk: b.atk * 50, def: b.def, hp: b.hp * 1000, spd: b.spd, critRate: -5, acc: 100, skills: [strike], charms: [], ...o }; };
const firstHit = (setup, seed = 1) => { const P = prepare(setup); const r = simulate(P, seed, true); const e = r.events.find((x) => x.e === 'hit' && x.a === 0 && x.t === 1 && x.d > 0); return { P, d: e ? e.d : 0 }; };
const duel = (a, b, o = {}) => ({ mode: 'pvp', roundCap: 3, pvpBalance: false, teams: [[{ ...a, cell: [10, 9] }], [{ ...b, cell: [10, 13] }]], ...o });

// 1. the defender's rank: (ATK × coef ÷ (1 + PlayerSkill) + flat) × ATK/(ATK+DEF) ÷ (1 + ProSkill)
{
  const L = 140;
  const lo = firstHit(duel(hero(L), hero(L, { rank: 'Blackiron3' }))).d, hi = firstHit(duel(hero(L), hero(L, { rank: 'Saint1' }))).d;
  const want = (1 + RANK_BASE.Saint1[5] / 10000) * (1 + RANK_BASE.Saint1[6] / 10000);
  ok(lo > 0 && near(lo / hi, want), `Saint1 defender takes ÷${(lo / hi).toFixed(3)} of an unranked one (game: ÷${want.toFixed(3)})`);
  const L2 = 200, g = firstHit(duel(hero(L2), hero(L2, { rank: 'Godtouched1_1' }))).d, n0 = firstHit(duel(hero(L2), hero(L2, { rank: 'Norank' }))).d;
  ok(near(n0 / g, 1.385 * 2.76), `Godtouched defender ÷${(n0 / g).toFixed(2)} (÷1.385 · ÷2.76)`);
  // no rank set: the lowest sub-rank of the level
  ok(subOfLevel(40) === 'Blackiron3' && subOfLevel(101) === 'Gold1' && subOfLevel(400) === 'Demigod3_3', `no rank: level 40 → ${subOfLevel(40)}, 101 → ${subOfLevel(101)}`);
}
// 2. Beauty of Balance II: balance (Legend at level 170: 49.31%), with Beauty of Balance I's ×0.2
{
  const L = 170, a = hero(L, { rank: 'Legend1' }), b = hero(L, { rank: 'Legend1' });
  const off = firstHit(duel(a, b)), on = firstHit(duel(a, b, { pvpBalance: true }));
  const g = pvpGovernor(on.P.units, 150);
  ok(near(g.balance, 0.4931) && g.survival === 1 && g.rankScale === 1, `Legend level 170: governor ×${g.scale.toFixed(4)} (balance ${g.balance.toFixed(4)}, survival ${g.survival}, skill rank ${g.rankScale})`);
  ok(near(on.d / off.d, 0.2 * 0.4931, 0.02), `PvP stage on: ×${(on.d / off.d).toFixed(4)} (0.2 × 0.4931 = ${(0.2 * 0.4931).toFixed(4)})`);
  const ang = pvpGovernor(prepare(duel(hero(195, { rank: 'Angel1' }), hero(195, { rank: 'Angel1' }), { pvpBalance: true })).units, 150);
  ok(near(ang.balance, 0.88), `Angel level 195: balance ${ang.balance.toFixed(3)} (0.88)`);
  const gold = pvpGovernor(prepare(duel(hero(120), hero(120), { pvpBalance: true })).units, 150);
  ok(gold.balance === 1, `Gold: no balance entry → ${gold.balance}`);
}
// 3. survival: two glass cannons (output far above their HP) → 0.1 ÷ ratio
{
  const b = heroBase(60), glass = { atk: b.atk * 20, def: 0, hp: b.hp };
  const g = pvpGovernor(prepare(duel(hero(60, glass), hero(60, glass), { pvpBalance: true })).units, 150);
  ok(g.ratio > 0.1 && near(g.survival, 0.1 / g.ratio) && g.survival < 1, `glass cannons: ratio ${g.ratio.toFixed(2)} → survival ×${g.survival.toFixed(4)}`);
  // one sturdy fighter keeps the lowest ratio under 0.1: no cut
  const g2 = pvpGovernor(prepare(duel(hero(60, glass), hero(60), { pvpBalance: true })).units, 150);
  ok(g2.survival === 1, `a sturdy fighter on the field: survival ×${g2.survival}`);
}
// 4. skill rank: Techniques at rank 30 on a 150-day server (expected rank 17) → decay 2.945 ÷ 6.62
{
  const sk = { skills: [{ id: 10000, rank: 30 }, { id: 10001, rank: 30 }], charms: [{ id: 10500, rank: 30 }] };
  const g = pvpGovernor(prepare(duel(hero(60, sk), hero(60, sk), { pvpBalance: true })).units, 150);
  ok(g.fightRank === 30 && g.serverRank === 17 && near(g.rankScale, 2.945 / 6.62), `skill rank 30 vs server 17: ×${g.rankScale.toFixed(4)}`);
  const young = pvpGovernor(prepare(duel(hero(60, sk), hero(60, sk), { pvpBalance: true })).units, 0);
  ok(young.serverRank === 7 && near(young.rankScale, 1.24 / 6.62), `day 0 (server rank 7): ×${young.rankScale.toFixed(4)}`);
  const low = pvpGovernor(prepare(duel(hero(60, { skills: [{ id: 10000, rank: 6 }] }), hero(60), { pvpBalance: true })).units, 150);
  ok(low.rankScale === 1, `skill rank below the server's: ×${low.rankScale}`);
}
// 5. PvP rates: the five heal Techniques and the shield Techniques at 45%, Charm heals via their statuses / trigger skills
{
  ok([10020, 10021, 10096, 10123, 10143].every((id) => PVPR[id] && PVPR[id][0] === 0.45), 'heal Techniques ×0.45 in PvP');
  ok([10046, 10032, 10165, 10140].every((id) => PVPR[id] && PVPR[id][0] === 0.45), 'shield Techniques (Guardian Ring, Desperate Protection, Frost Protection, Twin Radiance Shield) ×0.45');
  ok(PVPR[10570] && PVPR[10570][0] === 0.45 && PVPR[10570][1] === 1 && PVPR[10539] && PVPR[10539][1] === 0, 'Overhealing ×0.45 (governed trigger skill), Pure Protection ×0.45 (its own status, not governed)');
}
// 6. monsters carry their own pair (curve columns) in PvE
{
  const b = heroBase(130), P = prepare({ mode: 'pve', roundCap: 3, teams: [[hero(130)], [{ kind: 'mob', uid: 'm', key: (await import('../js/engine.js')).ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k)).k, level: 130, count: 1, cell: [10, 13] }]] });
  const m = P.units.find((u) => u.kind === 'mob'), h = P.units.find((u) => u.kind === 'hero');
  ok(m.prosdr > 1 && h.prosdr > 1, `level 130: monster ÷${m.psdr.toFixed(3)} · ÷${m.prosdr.toFixed(3)}, hero (Gold3) ÷${h.psdr.toFixed(3)} · ÷${h.prosdr.toFixed(3)}`);
  void b;
}
// 7. no level gap in PvP (the game's Damage() takes it outside PvP only)
{
  const lo = firstHit(duel(hero(100, { rank: 'Silver3' }), hero(100, { rank: 'Silver3' }))).d, hi = firstHit(duel(hero(130, { rank: 'Silver3', atk: heroBase(100).atk * 50, def: heroBase(100).def, hp: heroBase(100).hp * 1000 }), hero(100, { rank: 'Silver3' }))).d;
  ok(lo > 0 && near(hi, lo, 0.002), `30 levels above the target: ×${(hi / lo).toFixed(3)} in PvP (no level gap)`);
}
// 8. a mirror match is a coin toss: the same 4 characters on both sides (a battle-start taunt between equal-SPD
// Paladins, summons, area aims) — both sides take every tie the same way in their own frame
{
  const L = 87, b = heroBase(L), st = (m, sp) => ({ atk: Math.round(b.atk * m), def: Math.round(b.def * m), hp: Math.round(b.hp * m * 4), spd: Math.round(b.spd * sp) });
  const team = (tag) => [
    { kind: 'hero', uid: 'arc' + tag, name: '비술사', cls: 'Mishushi', level: L, ...st(5, 5), skills: [10080, 10060, 10071, 10021].map((id) => ({ id, rank: 3 })), charms: [10514, 10531, 10570, 10550].map((id) => ({ id, rank: 7 })) },
    { kind: 'hero', uid: 'pal' + tag, name: '성기사', cls: 'Dunjiashi', level: L, ...st(6, 6), skills: [10066, 10024, 10049, 10032].map((id) => ({ id, rank: 10 })), charms: [10507, 10571, 10587, 10541].map((id) => ({ id, rank: 8 })) },
    { kind: 'hero', uid: 'ber' + tag, name: '광전사', cls: 'Kuangzhanshi', level: L, ...st(5, 5.5), skills: [10074, 10011, 10065, 10053].map((id) => ({ id, rank: 10 })), charms: [10562, 10564, 10574, 10547].map((id) => ({ id, rank: 7 })) },
    { kind: 'hero', uid: 'mag' + tag, name: '마도사', cls: 'Modaoshi', level: L, ...st(7, 6.3), skills: [10004, 10001, 10072, 10036].map((id) => ({ id, rank: 10 })), charms: [10577, 10554, 10556, 10604].map((id) => ({ id, rank: 8 })) },
  ];
  const m = (await import('../js/engine.js')).monteCarlo({ mode: 'pvp', roundCap: 50, pvpBalance: true, serverDays: 150, teams: [team('a'), team('b')] }, 3000, 21);
  const p = m.wins[0] / (m.wins[0] + m.wins[1]);
  ok(Math.abs(p - 0.5) < 0.04, `4v4 mirror match: side 0 wins ${(p * 100).toFixed(1)}% (50% ± 4)`);
}
// how much lower a Legend-level duel now is than before the fix (Beauty of Balance I only, no divisors, no governor)
{
  const L = 170, a = hero(L, { rank: 'Legend1' }), b = hero(L, { rank: 'Legend1' });
  const on = firstHit(duel(a, b, { pvpBalance: true })).d, raw = firstHit(duel(a, hero(L, { rank: 'Norank' }))).d;
  console.log(`info: Legend1 level 170, one hit with the PvP stage on: ${on} (was ${Math.round(raw * 0.2)} before: ×${(on / (raw * 0.2)).toFixed(3)})`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all PvP tests passed');
process.exit(bad ? 1 : 0);
