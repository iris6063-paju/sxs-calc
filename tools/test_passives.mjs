// Smoke + sanity tests for monster passives (비전): node tools/test_passives.mjs
import { heroBase, prepare, simulate, monteCarlo, ALL_MOBS, MOB_PV, mobStats } from '../js/engine.js';
import { SKILLS } from '../js/gamedata.js';

const hero = (cls, level, mult, skills) => { const b = heroBase(level); return { kind: 'hero', uid: 'h' + Math.random(), cls, level, atk: b.atk * mult, def: b.def * mult, hp: b.hp * mult, spd: b.spd * 1.3, skills: (skills || SKILLS.filter((s) => s.cls === cls && s.kind === 'dmg').slice(0, 4).map((s) => s.id)).map((id) => ({ id, rank: 6 })) }; };
let bad = 0;
const ids = Object.keys(MOB_PV).map(Number);
const evKinds = {};
for (const id of ids) {
  const p = MOB_PV[id];
  const mob = ALL_MOBS.find((m) => (m.pv || []).includes(id) && (m.st || mobStats(m.k, m.lv || 40, m.sr)));
  if (!mob) { console.log('no mob for', id, p.en); continue; }
  const lv = Math.min(250, Math.round(mob.lv || (mob.map ? 40 : 60)));
  const ms = mob.st ? { hp: mob.st[0], atk: mob.st[1], def: mob.st[2], spd: mob.st[3] } : mobStats(mob.k, mob.lv || lv, mob.sr);
  // stand-in heroes scaled to the monster so the fight lasts long enough for passives to fire
  const tough = (cls) => ({ ...hero(cls, lv, 1), atk: Math.max(ms.def, ms.hp / 40), def: ms.atk, hp: ms.atk * 60, spd: ms.spd });
  for (const est of [true, false]) {
    const setup = { mode: 'pve', roundCap: 15, pvEst: est, teams: [[tough('Zhanshi'), tough('Fashi')], [{ kind: 'mob', key: mob.k, level: mob.lv || lv, sr: mob.sr, count: 1, fix: mob.st }]] };
    try {
      const P = prepare(setup);
      for (let s = 0; s < 3; s++) {
        const r = simulate(P, 100 + s, true);
        if (!(r.winner >= -1) || r.units.some((u) => Number.isNaN(u.dmg) || Number.isNaN(u.hp))) { bad++; console.log('BAD', id, p.en); }
        for (const e of r.events) if (e.e === 'cast' && e.sup && e.u === P.units.findIndex((u) => u.kind === 'mob')) evKinds[e.n] = (evKinds[e.n] || 0) + 1;
      }
    } catch (e) { bad++; console.log('ERROR', id, p.en, e.message); }
  }
}
console.log('passive labels fired in replays:', JSON.stringify(evKinds));
// immunity check: Great Water Slime takes no Water DMG
const slime = ALL_MOBS.find((m) => m.en === 'Great Water Slime');
if (slime) {
  const lv = 60, b = heroBase(lv);
  const water = monteCarlo({ mode: 'pve', roundCap: 6, teams: [[{ kind: 'hero', cls: 'Fashi', level: lv, atk: b.atk * 4, def: b.def * 4, hp: b.hp * 6, spd: b.spd, skills: [{ id: 10000, rank: 6 }] }], [{ kind: 'mob', key: slime.k, level: lv, sr: slime.sr, count: 1 }]] }, 100);
  console.log('Water Embodiment: water dmg to slime avg', Math.round(water.units[1].taken / water.n), water.units[1].taken === 0 ? 'PASS (immune)' : 'FAIL');
}
// stacked DR boss: with estimates the boss should take less
const walrus = ALL_MOBS.find((m) => m.en === 'Walrus First Mate');
if (walrus) {
  const s = walrus.st, h = { ...hero('Zhanshi', 200, 1), atk: s[2] * 2, def: s[1], hp: s[1] * 80, spd: s[3] };
  const run = (est) => { const r = monteCarlo({ mode: 'pve', roundCap: 10, pvEst: est, teams: [[h], [{ kind: 'mob', key: walrus.k, level: walrus.lv, sr: walrus.sr, count: 1, fix: walrus.st }]] }, 100); return Math.round(r.units[0].dmg / r.n); };
  const on = run(true), off = run(false);
  console.log(`The Evermast (30-stack DR): hero dmg est-on ${on} vs est-off ${off}`, on <= off ? 'PASS' : 'FAIL');
}
console.log(bad ? `FAILURES: ${bad}` : 'all passive tests passed', '·', ids.length, 'passives');
