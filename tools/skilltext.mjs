// Skill-text rules shared by tools/build_data.mjs (techniques, base monsters) and tools/build_extra.mjs (encounter monsters, Fantomon).
// Unit size and skill movement, read from the game's own wording.

/** adds { multi, bigFirst, rep, dash, leap, retreat } and knockback effects to a parsed skill `o` */
export function moveAndSize(d, o) {
  let m;
  // large units: area hits land once per covered cell, ricochets may re-hit; some skills aim at large units first
  if (/Large targets may take multiple hits/.test(d)) o.multi = 1;
  if (/Prioritizes (?:large targets|the skill range that contains large targets)/.test(d)) o.bigFirst = 1;
  if ((m = /DMG decreases by (\d+)% for each subsequent hit on the same target/.exec(d))) o.rep = { d: +m[1] / 100, from: 1 };
  else if ((m = /Starting with the (\d+)(?:st|nd|rd|th) hit, each subsequent hit against the same target deals (\d+)% less DMG/.exec(d))) o.rep = { d: +m[2] / 100, from: +m[1] - 1 };
  // the caster's own movement: dash along the aim, teleport next to the target, retreat after the cast
  if ((m = /(?:Dashes|Charges) (?:(\d+) grids? in a straight line|in a straight line for (\d+) grids?)/.exec(d))) o.dash = +(m[1] || m[2]);
  if ((m = /[Tt]eleports to an empty (?:grid|space) (?:adjacent to|next to|beside) [^.]*?within (\d+) grids?/.exec(d))) {
    o.leap = Math.max(o.leap || 0, +m[1]);
    if (o.tg && o.tg.t === 'S') o.tg.r = 1; // it lands next to the target and strikes from there
  }
  if ((m = /caster retreats (\d+) grids?/.exec(d)) || (m = /then retreats (\d+) grids?/.exec(d))) { o.retreat = { n: +m[1] }; const w = /If the target is within (\d+) grids? of the caster, the caster retreats/.exec(d); if (w) o.retreat.within = +w[1]; }
  // knockback on the targets (a chance rolls Effect Hit vs Effect RES like a status)
  const kb = /(?:(\d+)% (?:base )?chance to )?knocks? (?:them|it|the target|enemies) back(?: by)? (\d+) grids?( to either side)?/g;
  while ((m = kb.exec(d))) (o.eff = o.eff || []).push({ k: 'kb', n: +m[2], p: m[1] ? +m[1] / 100 : 1, side: m[3] ? 1 : 0 });
}
