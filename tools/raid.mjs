// Chaos Invasion raid boss: Chaos Tyrant (혼돈의 폭군), monster 3803, stage 4800.
// Numbers from the skill data purrwikimania.com ships for its raid simulator (assets/duel.json bosses["4800"]):
// SkillAttack1 per hit, CD (the opening cooldown is CD + 1, so a CD 4 skill first fires on the boss's 5th turn),
// hit configs and areas. Body 5×5, walks up to 8 cells, 25 global rounds.
// Korean names are translations (no official Korean source was found).
export const RAID = {
  monster: 3803, key: '3803|5', ko: '혼돈의 폭군', sz: 5, move: 8, rounds: 25,
  skills: [
    // "Selects a target within 3 grids of the caster. Deals Chaos DMG once to all enemies within 2 grids of the target." CD 0
    { en: 'Grip of Oblivion', ko: '망각의 손아귀', sid: 14228, el: 'chaos', c: 0.721, hits: 1, cd: 0, tg: { t: 'T', r: 3, ar: 2 } },
    // "Deals Chaos DMG 3 times to all enemies within 3 grids of the caster. Activate [Chaos Power] to enable this skill." CD 2
    { en: "Terra's Cry", ko: '대지의 포효', sid: 14231, el: 'chaos', c: 0.731, hits: 3, cd: 2, gate: 10, tg: { t: 'A', r: 3 } },
    // "Deals Chaos DMG 3 times to all enemies on the field." CD 4 (a 4th config only carries no damage)
    { en: "Heaven's Doom", ko: '천상의 파멸', sid: 14230, el: 'chaos', c: 1.4444, hits: 3, cd: 4, tg: { t: 'A', r: 99 } },
  ],
  // Annihilation Claws (9×3 in front, CD 1) has no damage coefficient in the data, so it deals no damage and is left out.
  pv: [15036, 15037, 15038, 15056],
  // rank groups the boss can come in (sub-ranks of one rank share its stats) and the levels offered
  ranks: [['Gold1', '챔피언', [100, 110, 120, 130, 140]], ['Saint1', '마스터', [110, 120, 130, 140, 150, 160]], ['Legend1', '패러곤', [130, 140, 150, 160, 170]]],
};
