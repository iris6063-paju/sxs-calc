// Prints the monster-skill icon keys the calculator uses (one per line), for downloading into assets/mobskills/.
import { MOBS } from '../js/gamedata.js';
import { MOBS2, MOB_PV } from '../js/gamedata2.js';
const set = new Set();
for (const m of [...MOBS, ...MOBS2]) for (const s of m.sk) if (s.ic && /^monsterskill_\d+$/.test(s.ic)) set.add(s.ic);
for (const p of Object.values(MOB_PV || {})) if (p.i && /^monsterskill_\d+$/.test(p.i)) set.add(p.i);
console.log([...set].sort().join('\n'));
