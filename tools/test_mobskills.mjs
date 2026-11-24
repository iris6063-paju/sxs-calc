// Monster skills without direct damage of their own (tools/mobskills.mjs): buffs, heals, shields, stances, ground
// effects, summons. Run: node tools/test_mobskills.mjs
import { prepare, simulate, heroBase, ALL_MOBS, mobHitCoef } from '../js/engine.js';
import { MOB_SKILL } from './mobskills.mjs';

let bad = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) bad++; };
const mobOf = (en) => ALL_MOBS.find((m) => m.en === en && (m.map || m.sr) && !m.fixed) || ALL_MOBS.find((m) => m.en === en);
/** a sturdy party (they rarely kill, so the monster gets many turns) against one monster; cells keep them in reach */
function fight(en, { level, n = 1, seed = 1, rounds = 12, est = true, heroes = 2, atk = 0.2, cells, mc = 1 } = {}) {
  const m = mobOf(en), L = level || m.lv || (m.map === 'fa4' ? 100 : m.map === 'fa3' ? 80 : 60), b = heroBase(L);
  const party = Array.from({ length: heroes }, (_, i) => ({ kind: 'hero', uid: 'h' + i, name: '캐릭터' + i, cls: 'Zhanshi', level: L, atk: b.atk * atk, def: b.def * 50, hp: b.hp * 5e4, spd: b.spd * 0.8, blockRate: 0, skills: [{ id: 10008, rank: 6 }], cell: cells ? cells[i] : undefined }));
  const P = prepare({ mode: 'pve', roundCap: rounds, pvEst: est, mobCoef: mc, teams: [party, [{ kind: 'mob', uid: 'm', key: m.k, level: L, sr: m.sr, count: n, cell: [10, 11] }]] });
  const r = simulate(P, seed, true);
  return { P, r, m, ev: r.events, mob: P.units.find((u) => u.kind === 'mob' && !u.sum), U: P.units };
}
const casts = (f, name) => f.ev.filter((e) => e.e === 'cast' && f.U[e.u].team === 1 && e.n === name).length;
const stOn = (f, k, pred = () => true) => f.ev.filter((e) => e.e === 'st' && e.on && e.k === k && pred(f.U[e.t])).length;

// 1) the table reaches the data: every modelled skill sits on its monsters, and every monster still has a damaging skill
{
  const rows = Object.entries(MOB_SKILL);
  const onMobs = rows.filter(([id]) => ALL_MOBS.some((m) => m.sk.some((s) => s.id === +id)));
  ok(onMobs.length === rows.length, `all ${rows.length} table skills are on monsters (${onMobs.length})`);
  const noDmg = ALL_MOBS.filter((m) => !m.sk.some((s) => s.tg || s.h || s.kind === 'kit' || m.kit));
  ok(!noDmg.length, `every monster keeps a damaging skill${noDmg.length ? ': ' + noDmg.map((m) => m.k).join(', ') : ''}`);
  const fs = mobOf('Karasu Tengu').sk.find((s) => s.en === 'Flash Slash');
  ok(fs && fs.tg && fs.tg.t === 'Q' && fs.leap === 5 && fs.el === 'phy', 'Flash Slash (Karasu Tengu) is kept: leap 5, Physical around the landing cell');
}
// 2) self and ally buffs
{
  const f = fight('Beetle Samurai');
  const s = f.ev.find((e) => e.e === 'st' && e.on && e.k === 'defUp' && f.U[e.t].kind === 'mob');
  ok(casts(f, '방어 태세') > 0 && s && s.d === 2, 'Defensive Stance: DEF up on the caster for 2 turns');
  const g = fight('Rockwolf Sentinel', { n: 3 });
  const holders = new Set(g.ev.filter((e) => e.e === 'st' && e.on && e.k === 'atkUp' && g.U[e.t].kind === 'mob').map((e) => e.t));
  ok(casts(g, '고무') > 0 && holders.size >= 2, `Inspiration: ATK up on the allies within 2 (${holders.size} sentinels)`);
  const z = fight('Kamaitachi');
  ok(stOn(z, 'atkUp') && stOn(z, 'spdUp') && stOn(z, 'abreak'), 'Zephyr Blessing: ATK and SPD up, DEF down');
  const boon = fight('Dusty Treasure Hoarder', { rounds: 40 });
  const mx = Math.max(0, ...boon.ev.filter((e) => e.e === 'st' && e.k === 'boon').map((e) => e.n));
  ok(mx >= 2 && mx <= 10, `Underground Boon stacks (max ${mx}, cap 10)`);
}
// 3) heals, Hydration before the battle, shields that open the fight
{
  const f = fight('Gangi', { atk: 0.6 });
  ok(casts(f, '빠른 회복') > 0 && f.ev.some((e) => e.e === 'heal' && f.U[e.t].kind === 'mob' && e.v > 0), 'Quick Recovery heals the hurt caster');
  const h = fight('Horned Toad');
  const firstTurn = h.ev.findIndex((e) => e.e === 'turn'), pre = h.ev.findIndex((e) => e.e === 'cast' && e.n === '수분 보충');
  ok(pre >= 0 && pre < firstTurn, 'Hydration is cast once before the first turn');
  const n = fight('Nue');
  const sh = n.ev.find((e) => e.e === 'cast' && e.n === '고요한 혼'), firstMobTurn = n.ev.find((e) => e.e === 'turn' && n.U[e.u].kind === 'mob');
  ok(sh && n.ev.indexOf(sh) > n.ev.indexOf(firstMobTurn) && n.ev.indexOf(sh) < n.ev.findIndex((e, i) => i > n.ev.indexOf(firstMobTurn) && e.e === 'turn'), 'Calm Soul: ready on the first turn (cooldown reset at battle start)');
}
// 4) a defensive stance: immobile, Block Rate up, a counter on each blocked technique hit
{
  let blocks = 0, counters = 0, immob = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const f = fight('Shielded Sylvanwolf Warrior', { seed, cells: [[10, 9], [9, 9]] });
    const mi = f.mob.id; let castBy = null;
    immob += stOn(f, 'immob', (u) => u.id === mi);
    for (const e of f.ev) { if (e.e === 'cast') castBy = e.u; if (e.e === 'hit' && e.t === mi && e.k === 2) blocks++; if (e.e === 'hit' && e.a === mi && castBy != null && f.U[castBy].team === 0) counters++; }
  }
  ok(immob > 0 && blocks > 0 && counters > 0, `Shield Fortification: immobile, ${blocks} blocks, ${counters} counters`);
}
// 5) Taowu's Rage opens Earth's Shake; Swordlion's stances
{
  const f = fight('Taowu', { rounds: 20 });
  const mob = f.mob, esI = mob.skills.findIndex((k) => k.s.en === "Earth's Shake");
  const rageAt = f.ev.findIndex((e) => e.e === 'cast' && e.n === '격노');
  // Earth's Shake is Taowu's only square-area (Q) skill
  const quake = (from, to) => f.ev.slice(from, to).filter((e) => e.e === 'cast' && e.u === mob.id && e.sh === 'Q').length;
  ok(esI >= 0 && rageAt >= 0 && quake(0, rageAt) === 0 && quake(rageAt) > 0, `Taowu: Rage is cast, Earth's Shake waits for it (${quake(rageAt)} after)`);
  const g = fight('Swordlion', { rounds: 24 });
  const sw = g.ev.filter((e) => e.e === 'cast' && /^자세 전환/.test(e.n)).map((e) => e.n);
  ok(sw.length >= 2 && sw[0].endsWith('대검') && sw[1].endsWith('쌍검'), `Swordlion: Stance Switch alternates (${sw.slice(0, 3).join(', ')})`);
}
// 6) summons: they spawn beside the caster, act, fade, and do not decide the battle
{
  const f = fight('Umibozu', { rounds: 20 });
  const sp = f.ev.filter((e) => e.e === 'spawn' && e.sum && f.U[e.u].team === 1);
  const acted = f.ev.some((e) => e.e === 'hit' && f.U[e.a].sum && f.U[e.a].team === 1 && e.d > 0);
  const faded = f.ev.some((e) => e.e === 'die' && f.U[e.u].sum && e.fade);
  ok(sp.length >= 2 && sp.every((e) => f.U[e.u].name === '물고기 병사') && acted && faded, `Fishling Summon: ${sp.length} Fishlings, they attack and fade`);
  const b = heroBase(80), P = prepare({ mode: 'pve', roundCap: 30, teams: [[{ kind: 'hero', uid: 'k', cls: 'Zhanshi', level: 80, atk: b.atk * 400, def: b.def * 50, hp: b.hp * 1e4, spd: b.spd * 0.5, skills: [{ id: 10008, rank: 6 }], cell: [10, 9] }], [{ kind: 'mob', uid: 'u', key: mobOf('Umibozu').k, level: 80, count: 1, cell: [10, 11] }]] });
  let won = 0; for (let s = 1; s <= 10; s++) if (simulate(P, s, false).winner === 0) won++;
  ok(won === 10, 'killing the summoner wins with its Fishlings still standing');
  const g = fight('Nine-Tailed Fox', { rounds: 30, cells: [[10, 9], [11, 9]] });
  ok(casts(g, '여우 분신') === 2, `Kitsune Double: at most 2 casts a battle (${casts(g, '여우 분신')})`);
  let boom = 0; for (let seed = 1; seed <= 8; seed++) { const h = fight('Nine-Tailed Fox', { seed, rounds: 30, cells: [[10, 9], [11, 9]] }); boom += h.ev.filter((e) => e.e === 'cast' && e.n === '여우 분신 폭발' && e.tg.length).length; }
  ok(boom > 0, `Kitsune Double: clones burst on the enemies around them when they go (${boom})`);
}
// 7) a delayed bomb, a web, burning ground, Ghostly Seas
{
  const f = fight('Hot Spring Crab', { cells: [[10, 9], [11, 9]] });
  const put = f.ev.findIndex((e) => e.e === 'cast' && e.n === '심해 폭탄'), boom = f.ev.findIndex((e) => e.e === 'cast' && e.n === '심해 폭탄 폭발');
  const crabTurns = f.ev.slice(put, boom).filter((e) => e.e === 'turn' && f.U[e.u] === f.mob).length;
  ok(put >= 0 && boom > put && crabTurns === 1 && f.ev.some((e) => e.e === 'move' && e.u === f.mob.id && e.retreat), 'Deep Water Bomb: the crab backs off, the bomb bursts at the end of its next turn');
  let webHits = 0, imm = 0;
  for (let seed = 1; seed <= 6; seed++) { const w = fight('Waterflow Spider', { seed, cells: [[10, 9], [9, 9]] }); webHits += w.ev.filter((e) => e.e === 'cast' && e.n === '사냥꾼의 덫' && e.tg.length && e.pet).length; imm += stOn(w, 'immob', (u) => u.team === 0); }
  ok(webHits > 0, `Hunter's Trap: a web strikes the enemy on it (${webHits} times, ${imm} immobilized)`);
  const r = fight('Fire Rat', { cells: [[10, 9], [11, 9]] });
  ok(r.ev.some((e) => e.e === 'trap' && e.on && e.burn && e.team === 1) && r.ev.some((e) => e.e === 'cast' && e.n === '작열' && r.U[e.u].team === 1), 'Wildfire: burning cells around the rat, they burn the enemy');
  const s = fight('Walrus First Mate', { cells: [[10, 9], [11, 9]], atk: 0.05 });
  const seas = s.ev.filter((e) => e.e === 'cast' && e.n === '유령 바다');
  const anchored = s.ev.filter((e) => e.e === 'st' && e.on && e.k === 'immob' && s.U[e.t].team === 0 && e.d === 0).length;
  ok(seas.length > 0 && anchored > 0, `Perpetual Stillwater: ${seas.length} strikes at turn start, ${anchored} Ghost Anchors for that turn`);
}
// 8) estimates off: estimated skills leave the monster, the counter states stay
{
  const on = fight('Beetle Samurai').mob.skills.map((k) => k.s.en), off = fight('Beetle Samurai', { est: false }).mob.skills.map((k) => k.s.en);
  const geo = fight('Cyclopean Geocrusher', { est: false }).mob.skills.map((k) => k.s.en);
  ok(on.includes('Defensive Stance') && !off.includes('Defensive Stance') && geo.includes('Momentum Backlash'), 'estimates off: Defensive Stance is dropped, Momentum Backlash stays');
}
// 9) assumed coefficients (mobHitCoef, from the boss kits): one hit 100%, each hit of a multi-hit skill 60%, a fixed combo
//    at most 200% in all, random strikes 60% each; the 「몹 스킬 계수」 setting scales them all
{
  const co = (en, sk, mc) => { const f = fight(en, mc ? { mc } : {}); const k = f.mob.skills.find((x) => x.s.en === sk); return k ? +k.n.coef.toFixed(4) : null; };
  ok(co('Quadhorn Goat', 'Stone Hammer') === 1 && co('Quadhorn Goat', 'Bash') === 0.6, 'Quadhorn Goat: Stone Hammer (1 hit) 100%, Bash (2 hits) 60% a hit');
  ok(co('Swordlion', 'Sword Formation (Twin Blades Starter)') === +(2 / 7).toFixed(4), 'Swordlion Sword Formation (7 hits): 200% / 7 a hit');
  ok(co('Cyclopean Geocrusher', 'Total Purge') === 0.6, 'Cyclopean Geocrusher Total Purge (14 random strikes): 60% a strike');
  ok(co('Quadhorn Goat', 'Bash', 1.5) === 0.9 && mobHitCoef({ hits: 1 }, 1.5) === 1.5 && mobHitCoef({ hits: 5 }) === 0.4, 'the 「몹 스킬 계수」 setting scales the assumed coefficients');
  // the coefficient reaches the damage: Bash's normal hits are 60% of Stone Hammer's on the same hero (both Physical, single target)
  const f = fight('Quadhorn Goat', { rounds: 30, heroes: 1, cells: [[10, 9]] });
  // both show as 「물리 공격」 in the log: a cast with one hit event is Stone Hammer, with two Bash
  const per = { 'Stone Hammer': [], Bash: [] }, groups = []; let g = null;
  for (const e of f.ev) { if (e.e === 'cast') { g = f.U[e.u] === f.mob ? [] : null; if (g) groups.push(g); } else if (e.e === 'hit' && g && f.U[e.a] === f.mob) g.push(e); else if (e.e === 'turn') g = null; }
  for (const h of groups) if (h.length === 1 || h.length === 2) for (const e of h) if (e.k === 0 && e.d > 0) per[h.length === 1 ? 'Stone Hammer' : 'Bash'].push(e.d);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, r = avg(per.Bash) / avg(per['Stone Hammer']);
  ok(per.Bash.length && per['Stone Hammer'].length && Math.abs(r - 0.6) < 0.02, `Bash hits for ${(r * 100).toFixed(1)}% of Stone Hammer (${per.Bash.length} / ${per['Stone Hammer'].length} hits)`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all monster skill tests passed');
process.exit(bad ? 1 : 0);
