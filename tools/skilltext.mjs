// Skill-text rules shared by tools/build_data.mjs (techniques, base monsters) and tools/build_extra.mjs (encounter monsters, Fantomon).
// Unit size and skill movement, read from the game's own wording.

/** adds { multi, bigFirst, rep, dash, leap, retreat } and knockback effects to a parsed skill `o` */
/** monster skills only: random strikes, pull wording, "Selects 1 grid", rage-only skills. Overrides the shape the
 *  general parser picked when the text describes scattered strikes (they used to read as one hit on adjacent enemies). */
export function mobExtras(d, o) {
  let m;
  const aoe = () => { const a = /within (?:a )?(\d+)[- ]grids? (?:square area )?of (?:each target|the target|its impact|it\b)/.exec(d); return a ? +a[1] : 0; };
  const min = () => { const a = /hitting at least (\d+) times|(\d+) guaranteed hits|hits at least once/.exec(d); return a ? +(a[1] || a[2] || 1) : 0; };
  let sc = null;
  if ((m = /Randomly (?:selects|strikes|launches) (\d+) (?:grids|[a-z]+(?: [a-z]+)?) within (\d+) grids? of the caster/.exec(d)) || (m = /Selects (\d+) random grids within (\d+) grids? of the caster/.exec(d))) sc = { n: +m[1], R: +m[2], a: aoe(), from: 'self' };
  else if ((m = /Randomly (?:selects|launches) (\d+) (?:grids|[a-z]+) within a (\d+)×(\d+) grid area in front of the caster/.exec(d))) sc = { n: +m[1], fw: +m[2], fh: +m[3], a: aoe(), from: 'self' };
  else if ((m = /[Ss]elects a grid within (\d+) grids?[^.]*?[.,] (?:then )?[Rr]andomly deals [A-Za-z ]*DMG (\d+) times (?:with)?in (\d+) grids? of the target grid/.exec(d))) { sc = { n: +m[2], R: +m[3], a: 0, from: 'aim' }; o.tg = { t: 'T', r: +m[1], ar: +m[3] }; }
  else if ((m = /Randomly deals [A-Za-z ]*DMG (\d+) times in an area within (\d+) grids? of the caster/.exec(d))) sc = { n: +m[1], R: +m[2], a: 0, from: 'self' };
  if (sc) {
    sc.min = /each selected enemy/.test(d) ? sc.n : min(); // "dealing ... once to each selected enemy": every pick is an enemy
    o.sp = { k: 'scatter', ...sc };
    o.hits = sc.n; // the mob coefficient is split over the strikes like any multi-hit mob skill
    if (sc.from === 'self') o.tg = sc.fw ? { t: 'F', w: sc.fw, h: sc.fh + sc.a } : { t: 'A', r: sc.R + sc.a };
  }
  if ((m = /[Ss]elects (?:1|one) (?:grid|target) within (\d+) grids?/.exec(d)) && !sc) { const a = /within (\d+) grids? of the target/.exec(d); o.tg = { t: 'T', r: +m[1], ar: a ? +a[1] : 1 }; }
  if (/pulls? them to (?:the front of )?the caster(?:'s location)?/.test(d)) o.pull = 'c';
  else if (/pull(?:s|ing)? them to (?:the target grid|its center|the target's location)/.test(d)) o.pull = 'a';
  if (/Activate \[Rage\]|in Rage(?:d)? state|Raged state/.test(d)) o.rage = 1;
}
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

// Korean names for monster self-buff skills (translations: no official Korean text was found for monster skills)
const MOB_SK_KO = { 'Momentum Backlash': '기세 반격', 'Reflection Mask': '반사 가면' };
/** a monster's self counter state, kept as a buff skill (2026-11-23): Momentum Backlash lasts until the start of the
 *  caster's next turn, Reflection Mask 1 turn; a Technique hit on the caster is answered with one hit on the attacker.
 *  e: the enemy skill ({ n, i }), d: its plain description, EL: English element → key. Returns the skill or null. */
export function counterSkill(e, d, EL) {
  const a = /enters a counterattack state until the start of the caster's next turn[\s\S]*?deals (\w+) DMG once to the attacker/.exec(d);
  const b = /Grants the caster a buff for (\d+) turns?\. When the caster takes Technique DMG, deals (\w+) DMG once to the attacker/.exec(d);
  const el = a ? EL[a[1]] : b ? EL[b[2]] : null;
  if (!el) return null;
  return { en: e.n, ko: MOB_SK_KO[e.n] || e.n, el, ic: e.i, kind: 'counterSt', ...(a ? { next: 1 } : { t: +b[1] }), ...(/cannot be dispelled/i.test(d) ? { nd: 1 } : {}) };
}
