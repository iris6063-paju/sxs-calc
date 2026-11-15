// Prints the monster-skill icon keys the calculator uses (one per line), for downloading into assets/mobskills/.
import { MOBS } from '../js/gamedata.js';
import { MOBS2 } from '../js/gamedata2.js';
const set = new Set();
for (const m of [...MOBS, ...MOBS2]) for (const s of m.sk) if (s.ic && /^monsterskill_\d+$/.test(s.ic)) set.add(s.ic);
console.log([...set].sort().join('\n'));
