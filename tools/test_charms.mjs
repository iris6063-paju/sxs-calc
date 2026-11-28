// Charms modelled from their game hooks (2026-11-21): node tools/test_charms.mjs
import { heroBase, prepare, simulate, ALL_MOBS, skillNumbers, flatBase } from '../js/engine.js';

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
// Rating stats from charms (mastery, affinity, Effect Hit) at a level past the rank's cap: 숙련 III (Silver3, cap Lv100)
// at Lv103 takes them at Lv100, so 쾌속 영창 / 원소의 하모니 / 통찰 stay the same share of the rank's bases; 챔피언 I (Gold1)
// at Lv103 and 숙련 III at Lv95 use their own level as before
{
  const unit = (level, rank, charms) => prepare({ mode: 'pvp', roundCap: 5, teams: [[hero({ level, rank, skills: [{ id: 10034, rank: 6 }, { id: 10038, rank: 6 }], charms, cell: [10, 6] })], [hero({ level, rank, cell: [10, 14] })]] }).units[0];
  const ch = [{ id: 10604, rank: 10 }, { id: 10602, rank: 11 }, { id: 10559, rank: 10 }, { id: 10520, rank: 10 }];
  const at100 = unit(100, 'Silver3', ch), at103 = unit(103, 'Silver3', ch), g103 = unit(103, 'Gold1', ch), at95 = unit(95, 'Silver3', ch), none = unit(103, 'Silver3', []);
  ok(at103.mastery === at100.mastery && at103.mastery > none.mastery, `숙련 III Lv103: charm mastery as at Lv100 (${at103.mastery} = ${at100.mastery})`);
  ok(Math.abs(at103.effHit - at100.effHit) < 1e-9 && at103.affEl.fire === at100.affEl.fire, '숙련 III Lv103: 통찰 Effect Hit and fire affinity as at Lv100');
  ok(g103.mastery > at103.mastery * 4 && at95.mastery < at100.mastery, `챔피언 I Lv103 and 숙련 III Lv95 keep their own level (${g103.mastery}, ${at95.mastery})`);
  ok(at103.mastery / at103.bMas < 1.5 && g103.mastery / g103.bMas < 1.5, `charm mastery stays a sane share of the rank base (${(at103.mastery / at103.bMas).toFixed(2)}, ${(g103.mastery / g103.bMas).toFixed(2)})`);
}
// Erosion from game data (2026-11-28): each source ticks with its own trigger skill (duel.json statuses → trig), one
// status per caster and source whose duration grows on a re-application, no ticks once the caster is down
{
  const near = (a, b, m) => Math.abs(a - b) <= m;
  const db = skillNumbers(10081, 12, 104), mb = skillNumbers(10064, 16, 104);
  ok(near(db.dc, 0.1137, 1e-6) && near(db.df, 0.468 * flatBase(2, 104), 1), `Dark Bullet r12 Erosion: 11.37% + 0.468 × fixed (${(db.dc * 100).toFixed(2)}%, ${Math.round(db.df)})`);
  ok(near(mb.dc, 0.1638, 1e-6) && near(mb.df, 0.8305 * flatBase(3, 104), 1), `Mana Blast r16 Erosion: 16.38% + 0.8305 × fixed (${(mb.dc * 100).toFixed(2)}%, ${Math.round(mb.df)})`);
  const sage = (o = {}) => ({ kind: 'hero', uid: 'e' + Math.random(), name: '비술', cls: 'Mishushi', level: 104, atk: 124000, def: 137000, hp: 728000, spd: 116000, skills: [{ id: 10081, rank: 12 }, { id: 10064, rank: 16 }], charms: [{ id: 10565, rank: 16 }, { id: 10585, rank: 17 }], cell: [10, 8], ...o });
  const tank = (o = {}) => ({ kind: 'hero', uid: 't' + Math.random(), name: '표적', cls: 'Dunjiashi', level: 104, atk: 1000, def: 137000, hp: 40000000, spd: 90000, skills: [], cell: [10, 11], ...o });
  const u0 = prepare({ mode: 'pvp', roundCap: 5, teams: [[sage()], [tank()]] }).units[0];
  ok(near(u0.ch.inflicts[0].e.coef, 0.5061, 1e-6) && near(u0.ch.inflicts[0].e.flat, 2.56575 * flatBase(2, 104), 1), `Shadow Erosion r16: 50.61% + 2.56575 × fixed (game skill 11360)`);
  ok(near(u0.ch.erodeTwice.coef, 0.6327, 1e-6) && near(u0.ch.erodeTwice.flat, 3.61584 * flatBase(3, 104), 1), `Linked Misfortune r17: 63.27% + 3.61584 × fixed (game skill 12540)`);
  const runs = many([[sage()], [tank()]], 6, 12, 'pvp');
  let ticks = 0, dup = 0, longer = 0;
  const srcs = new Set();
  for (const { P, r } of runs) {
    let seen = new Set();
    for (const e of r.events) {
      if (e.e === 'turn') seen = new Set();
      if (e.e === 'cast' && e.n.startsWith('침식(')) { ticks++; srcs.add(e.n); const k = e.u + e.n + e.tg[0]; if (seen.has(k)) dup++; seen.add(k); }
      if (e.e === 'st' && e.k === 'dot' && e.u && e.d > 3) longer++;
    }
  }
  ok(ticks > 0 && srcs.size >= 3, `Erosion ticks under their sources' names (${[...srcs].join(', ')}; ${ticks} ticks)`);
  ok(dup === 0, `one Erosion per caster and source: never two ticks of one source in a turn (${dup})`);
  ok(longer > 0, `re-inflicting adds to the duration (${longer} refreshes past 3 turns)`);
  // the caster down: its Erosion stops (forbidOnApplicatorDie)
  const frail = many([[sage({ hp: 200000, def: 20000 })], [tank({ atk: 900000, spd: 60000, skills: [{ id: 10049, rank: 10 }] })]], 8, 12, 'pvp');
  let after = 0, died = 0;
  for (const { r } of frail) { let dead = false; for (const e of r.events) { if (e.e === 'die' && e.u === 0) { dead = true; died++; } if (dead && e.e === 'cast' && e.u === 0 && e.n.startsWith('침식(')) after++; } }
  ok(died > 0 && after === 0, `no Erosion ticks after the caster falls (${died} falls, ${after} ticks after)`);
}
// Shadow Form: "combat skill cooldowns reduced by 2 turns" — Terminate Shadow (CD 2) is ready on the next turn
{
  const sage = { kind: 'hero', uid: 'sv', name: '그림자', cls: 'Mishushi', level: 104, atk: 124000, def: 30000, hp: 300000, spd: 116000, skills: [{ id: 10078, rank: 10 }], charms: [{ id: 10586, rank: 14 }], cell: [10, 9] };
  const brute = { kind: 'hero', uid: 'br', name: '강타', cls: 'Kuangzhanshi', level: 104, atk: 400000, def: 137000, hp: 40000000, spd: 60000, skills: [{ id: 10011, rank: 10 }], cell: [10, 11] };
  let shadowN = 0, readyN = 0;
  for (const { r } of many([[sage], [brute]], 12, 12, 'pvp')) {
    const i = r.events.findIndex((e) => e.e === 'cast' && e.u === 0 && e.n === '섀도우 형태'); if (i < 0) continue;
    shadowN++;
    const t = r.events.findIndex((e, j) => j > i && e.e === 'turn' && e.u === 0); if (t < 0) continue;
    const end = r.events.findIndex((e, j) => j > t && e.e === 'turn');
    if (r.events.slice(t, end < 0 ? undefined : end).some((e) => e.e === 'cast' && e.u === 0 && e.n === '터미네이트 섀도')) readyN++;
  }
  ok(shadowN > 0 && readyN === shadowN, `Shadow Form: Terminate Shadow cast on the next turn every time (${readyN}/${shadowN})`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all charm tests passed');
process.exit(bad ? 1 : 0);
