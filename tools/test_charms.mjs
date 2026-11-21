// Charms modelled from their game hooks (2026-11-21): node tools/test_charms.mjs
import { heroBase, prepare, simulate, ALL_MOBS } from '../js/engine.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const L = 130, b = heroBase(L), small = ALL_MOBS.find((m) => m.ty === 0 && /\|0$/.test(m.k));
const hero = (o = {}) => ({ kind: 'hero', uid: 'h' + Math.random(), name: '영웅', cls: 'Modaoshi', level: L, atk: b.atk * 3, def: b.def * 20, hp: b.hp * 300, spd: b.spd * 3, skills: [{ id: 10000, rank: 6 }], charms: [], cell: [10, 9], ...o });
const foe = (o = {}) => ({ kind: 'mob', uid: 'm', key: small.k, level: L, count: 3, cell: [10, 14], ...o });
const many = (teams, n = 12, cap = 10, mode = 'pve') => { const out = []; for (let s = 1; s <= n; s++) { const P = prepare({ mode, roundCap: cap, teams }); out.push({ P, r: simulate(P, s, true) }); } return out; };
const label = (runs, name) => runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'cast' && e.n === name).length, 0);

// Repelling Wind (Archmage): an enemy stepping within 2 grids is struck and knocked back
{
  const runs = many([[hero({ skills: [], charms: [{ id: 10566, rank: 6 }] })], [foe()]]);
  const n = label(runs, '저항의 바람');
  const kb = runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'move' && e.kb).length, 0);
  ok(n > 0 && kb > 0, `Repelling Wind fires (${n}×) and knocks back (${kb}×)`);
}
// Frost Guard (Archmage): a turn with no technique → Icebound DMG RES, a heal when the next turn starts
{
  const runs = many([[hero({ skills: [], charms: [{ id: 10605, rank: 6 }] })], [foe({ level: L + 5 })]]);
  const red = runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'st' && e.k === 'dmgRed' && e.on && e.t === 0).length, 0);
  const heals = runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'heal' && e.a === 0 && e.t === 0).length, 0);
  ok(red > 0 && heals > 0, `Frost Guard: Icebound ${red}×, heals ${heals}×`);
}
// Soul Impact + Soulbond Restoration: a fading summon hits around it and heals its caster
{
  const runs = many([[hero({ skills: [{ id: 10019, rank: 6 }], charms: [{ id: 10530, rank: 6 }, { id: 10600, rank: 6 }], hp: b.hp * 40 })], [foe({ count: 4, level: L + 8 })]], 8, 14);
  ok(label(runs, '소울 임팩트') > 0, `Soul Impact when a summon goes (${label(runs, '소울 임팩트')}×)`);
}
// Resurrection: an allied adventurer is revived once
{
  const weak = hero({ uid: 'w', name: '약함', hp: b.hp * 2, def: b.def, skills: [], cell: [10, 9] });
  const runs = many([[weak, hero({ uid: 'r', name: '부활', skills: [], hp: b.hp * 400, charms: [{ id: 10531, rank: 6 }], cell: [12, 8] })], [foe({ count: 5, level: L + 10 })]], 10, 12);
  ok(label(runs, '리바이벌') > 0, `Resurrection revives (${label(runs, '리바이벌')}×, at most once a fight)`);
  ok(runs.every(({ r }) => r.events.filter((e) => e.e === 'cast' && e.n === '리바이벌').length <= 1), 'once per battle');
}
// Shadow Vengeance: the first lethal hit leaves 1 HP and Shadow Form
{
  const runs = many([[hero({ skills: [], hp: b.hp * 1.5, def: b.def, charms: [{ id: 10586, rank: 6 }] })], [foe({ count: 5, level: L + 10 })]], 10, 12);
  ok(label(runs, '섀도우 형태') > 0, `Shadow Vengeance saves once (${label(runs, '섀도우 형태')}×)`);
}
// Rejuvenating Elixir: an ally dropping under 50% drinks a potion
{
  const weak = hero({ uid: 'w', name: '약함', hp: b.hp * 3, def: b.def, skills: [], cell: [10, 9] });
  const runs = many([[weak, hero({ uid: 'e', name: '약사', skills: [], hp: b.hp * 400, charms: [{ id: 10632, rank: 6 }], cell: [12, 8] })], [foe({ count: 5, level: L + 8 })]], 10, 12);
  ok(label(runs, '재생의 영약') > 0, `Rejuvenating Elixir heals (${label(runs, '재생의 영약')}×)`);
}
// Flaming Heel: moving deals Fire DMG next to the mover
{
  const runs = many([[hero({ cls: 'Zhanshi', skills: [{ id: 10008, rank: 6 }], charms: [{ id: 10622, rank: 6 }] })], [foe()]]);
  ok(label(runs, '불꽃 발걸음') > 0, `Flaming Heel after a move (${label(runs, '불꽃 발걸음')}×)`);
}
// Overload Protection: a shield per 15% max HP lost within a turn
{
  const runs = many([[hero({ skills: [], hp: b.hp, def: b.def, charms: [{ id: 10573, rank: 6 }] })], [foe({ count: 6, level: L + 8 })]], 8, 10);
  const sh = runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'shield' && e.t === 0).length, 0);
  ok(sh > 0, `Overload Protection shields (${sh}×)`);
}
// Flaming Path: burning ground around the caster at turn start
{
  const runs = many([[hero({ skills: [], charms: [{ id: 10561, rank: 6 }] })], [foe()]]);
  const tiles = runs.reduce((a, { r }) => a + r.events.filter((e) => e.e === 'trap' && e.on && e.burn).length, 0);
  ok(tiles > 0, `Flaming Path lays burning ground (${tiles} tiles)`);
}
// Oath of Vigil: the guardian takes part of the guarded ally's DMG
{
  const guarded = hero({ uid: 'g', name: '보호받음', hp: b.hp * 50, def: b.def, skills: [], cell: [10, 9] });
  const runs = many([[guarded, hero({ uid: 'v', name: '수호', skills: [], hp: b.hp * 400, charms: [{ id: 10580, rank: 6 }], cell: [12, 8] })], [foe({ count: 5, level: L + 5 })]], 6, 8);
  const shared = runs.reduce((a, { P, r }) => a + r.events.filter((e) => e.e === 'hit' && e.t === 1 && P.units[e.a].kind === 'mob').length, 0);
  ok(shared > 0, `Vigil: the guardian takes hits meant for the guarded (${shared} hits)`);
}
// a hero without charms is unaffected
{
  const P = prepare({ mode: 'pve', teams: [[hero()], [foe()]] }); const r = simulate(P, 1, true);
  ok(r.winner >= 0, 'plain fight still runs');
}
// unique effects ("해당 효과는 유일합니다"): the same status from two casters stays one; different skills' statuses of one kind stand side by side
{
  const H = (uid, name, cls, skills, charms, cell, o = {}) => ({ kind: 'hero', uid, name, cls, level: L, atk: b.atk * 3, def: b.def * 5, hp: b.hp * 50, spd: b.spd * 3, skills: skills.map((id) => ({ id, rank: 6 })), charms: charms.map((id) => ({ id, rank: 6 })), cell, ...o });
  const foeH = [H('f1', '상대', 'Huwei', [10000], [], [10, 15])];
  // Iron Fortress on two Paladins: each ally gets one DEF buff at battle start (the second replaces the first)
  const P1 = prepare({ mode: 'pvp', roundCap: 2, teams: [[H('p1', '성기A', 'Dunjiashi', [10000], [10571], [9, 9]), H('p2', '성기B', 'Dunjiashi', [10000], [10571], [11, 9]), H('t', '대상', 'Huwei', [10000], [], [10, 9])], foeH] });
  const e1 = simulate(P1, 1, true).events, t1 = e1.findIndex((e) => e.e === 'turn');
  const fresh = [0, 1, 2].map((id) => e1.slice(0, t1).filter((e) => e.e === 'st' && e.t === id && e.k === 'defUp' && e.on && !e.u).length);
  ok(fresh.every((n) => n === 1), `Iron Fortress ×2: one DEF buff on each ally (${fresh.join(', ')})`);
  // Sanctified Soul (unique, allies) after an ally's own Magic Armor: both DMG reductions stay
  const P2 = prepare({ mode: 'pvp', roundCap: 2, teams: [[H('s', '장막', 'Xianzhe', [10108], [], [9, 9], { spd: b.spd * 2 }), H('m', '갑옷', 'Fashi', [10102], [], [10, 9])], foeH] });
  const e2 = simulate(P2, 3, true).events, sTurn = e2.findIndex((e) => e.e === 'turn' && e.u === 0), next = e2.findIndex((e, i) => i > sTurn && e.e === 'turn');
  const onArmor = e2.slice(sTurn, next < 0 ? undefined : next).filter((e) => e.e === 'st' && e.t === 1 && e.k === 'dmgRed' && e.on);
  ok(onArmor.length > 0 && onArmor.every((e) => !e.u), `Sanctified Soul next to Magic Armor: added beside it, not replacing it (${onArmor.map((e) => (e.u ? 'replaced' : 'added')).join(', ')})`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all charm tests passed');
process.exit(bad ? 1 : 0);
