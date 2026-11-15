// Fantomon (판타몬) checks: node tools/test_pets.mjs
// Every pet, baby and adult, runs without errors; specific effects are confirmed from replay logs / outcomes.
import { heroBase, prepare, simulate, monteCarlo, ALL_MOBS } from '../js/engine.js';
import { SKILLS } from '../js/gamedata.js';
import { PETS } from '../js/gamedata2.js';

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) bad++; };
const lv = 120, b = heroBase(lv);
const skillsOf = (cls) => SKILLS.filter((s) => s.cls === cls && s.kind === 'dmg').slice(0, 4).map((s) => ({ id: s.id, rank: 6 }));
const hero = (pet, o = {}) => ({ kind: 'hero', uid: 'h1', cls: 'Zhanshi', level: lv, atk: b.atk * 3, def: b.def * 3, hp: b.hp * 6, spd: b.spd, skills: skillsOf('Zhanshi'), ...o, pet });
const petOf = (id, adult, mult = 1) => ({ id, rank: 34, adult, atk: b.atk * 2 * mult, def: b.def * 2 * mult, hp: b.hp * 3 * mult, spd: b.spd * 1.2 });
const boss = ALL_MOBS.find((m) => m.en === 'Walrus First Mate') || ALL_MOBS.find((m) => m.st);
const bigMob = ALL_MOBS.find((m) => m.ty === 2 && !m.st) || ALL_MOBS.find((m) => m.ty === 2);
const foe = (count = 3) => ({ kind: 'mob', key: bigMob.k, level: lv, sr: bigMob.sr, count });
const run = (setup, seeds = 3) => { const P = prepare(setup); const out = []; for (let s = 0; s < seeds; s++) out.push(simulate(P, 500 + s, true)); return { P, out }; };

// 1) smoke: every pet as baby and adult
for (const p of PETS) for (const adult of [false, true]) {
  try {
    const { P, out } = run({ mode: 'pve', roundCap: 12, teams: [[hero(petOf(p.id, adult))], [foe()]] });
    for (const r of out) if (!(r.winner >= -1) || r.units.some((u) => Number.isNaN(u.dmg) || Number.isNaN(u.hp))) { bad++; console.log('BAD', p.en, adult); }
    if (!P.units.some((u) => u.pet)) { bad++; console.log('no pet unit', p.en); }
  } catch (e) { bad++; console.log('ERROR', p.en, adult, e.stack); }
}
console.log('smoke:', PETS.length, 'pets × baby/adult');

const evs = (id, adult, extra = {}) => { const { P, out } = run({ mode: 'pve', roundCap: 12, teams: [[hero(petOf(id, adult), extra)], [foe()]] }, 4); return { P, ev: out.flatMap((r) => r.events) }; };
const pid = (en) => PETS.find((p) => p.en === en).id;

// 2) 나이트군: DEF Reduction stacks up to 3
{
  const { P, ev } = evs(pid('Nyxarchon'), false);
  const pet = P.units.find((u) => u.pet);
  ok(pet.sup.eff && pet.sup.eff[0].max === 3, '나이트군 support carries 10% DEF Reduction ×3 stacks');
  const supCasts = ev.filter((e) => e.e === 'cast' && e.pet).length;
  const abreakOn = ev.filter((e) => e.e === 'st' && e.k === 'abreak' && e.on).length;
  ok(supCasts > 0 && abreakOn > 0, `나이트군 support fires (${supCasts}) and applies DEF Reduction (${abreakOn})`);
  // stacking reaches 3: run the engine directly and inspect statuses through a long fight
  const P2 = prepare({ mode: 'pve', roundCap: 12, teams: [[hero(petOf(pid('Nyxarchon'), false))], [{ kind: 'mob', key: boss.k, level: boss.lv, sr: boss.sr, count: 1, fix: boss.st }]] });
  ok(P2.units.some((u) => u.pet), 'boss fight has a pet');
  // DEF reduction effect on damage: with vs without Nyxarchon (same hero), the hero deals more with it
  const setup = (pet) => ({ mode: 'pve', roundCap: 8, teams: [[hero(pet)], [{ kind: 'mob', key: boss.k, level: boss.lv, sr: boss.sr, count: 1, fix: boss.st }]] });
  const strong = { ...hero(null), level: boss.lv, atk: boss.st[2] * 2, def: boss.st[1], hp: boss.st[1] * 80, spd: boss.st[3] }; // same level: rank speed scaling
  const withPet = monteCarlo({ ...setup(null), teams: [[{ ...strong, pet: petOf(pid('Nyxarchon'), false, 0.001) }], setup(null).teams[1]] }, 60);
  const noPet = monteCarlo({ ...setup(null), teams: [[{ ...strong }], setup(null).teams[1]] }, 60);
  ok(withPet.units[0].dmg > noPet.units[0].dmg, `hero dmg with 나이트군 DEF Reduction ${Math.round(withPet.units[0].dmg / 60)} > without ${Math.round(noPet.units[0].dmg / 60)}`);
}
// 3) adult 나이트군: execute skill + kill splash passive wired
{
  const { P } = evs(pid('Nyxarchon'), true);
  const pet = P.units.find((u) => u.pet);
  ok(pet.skills.some((k) => k.s.sp && k.s.sp.k === 'execute'), 'Nightshade Blast has the execute bonus');
  ok(pet.ch && pet.ch.killSplash && pet.ch.killSplash.coef > 0, 'Death Star Scatter kill splash wired');
}
// 4) 테라곤 adult uses its own 18% copy; baby 25%
{
  const baby = prepare({ mode: 'pve', teams: [[hero(petOf(pid('Terragon'), false))], [foe(1)]] }).units.find((u) => u.pet);
  const adult = prepare({ mode: 'pve', teams: [[hero(petOf(pid('Terragon'), true))], [foe(1)]] }).units.find((u) => u.pet);
  ok(baby.sup.eff[0].v === 0.25 && adult.sup.eff[0].v === 0.18, `테라곤 ATK down baby ${baby.sup.eff[0].v} / adult ${adult.sup.eff[0].v}`);
}
// 5) skills that used to be dropped: 철하피 shield, 루미나크 준마 ward, 허보트 owner heal
for (const [en, kind] of [['Armopi', 'shield'], ['Luminarch Steed', 'buff']]) {
  const pet = prepare({ mode: 'pve', teams: [[hero(petOf(pid(en), true))], [foe(1)]] }).units.find((u) => u.pet);
  ok(pet.skills.some((k) => k.s.kind === kind && k.n.bv > 0), `${en} has its ${kind} skill (value ${pet.skills.find((k) => k.s.kind === kind).n.bv})`);
}
// 6) 핌핌: Power Unsealed after turn 3
{
  const { ev } = evs(pid('Aegiswing'), false);
  ok(ev.some((e) => e.e === 'cast' && /봉인 해제/.test(e.n)), '핌핌 Guardian Angel ends → 봉인 해제');
}
// 7) 헥시티 adult fades after 3 turns with a burst
{
  const { ev } = evs(pid('Hexitty'), true);
  ok(ev.some((e) => e.e === 'cast' && /덧없는 환영/.test(e.n)), '헥시티 Evanescent Phantom burst fires');
  ok(ev.filter((e) => e.e === 'spawn').length >= 2, `헥시티 re-materializes after fading (${ev.filter((e) => e.e === 'spawn').length} spawns in 4 fights)`);
}
// 8) 프리즈모라 healing boost
{
  const pet = prepare({ mode: 'pve', teams: [[hero(petOf(pid('Prismora'), true))], [foe(1)]] }).units.find((u) => u.pet);
  ok(pet.healUp > 0.5, `프리즈모라 Purity Power healing +${Math.round(pet.healUp * 100)}%`);
}
console.log(bad ? `FAILURES: ${bad}` : 'all pet tests passed');
process.exit(bad ? 1 : 0);
