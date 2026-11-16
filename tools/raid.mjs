// Chaos Invasion raid boss: Chaos Tyrant (혼돈의 폭군), monster 3803, stage 4800.
// Its skills come from the game data like the Hieromon kits (tools/bosskits.mjs, built in build_extra.mjs):
// Grip of Oblivion, Terra's Cry (from the 10th action), Heaven's Doom; Annihilation Claws has no damage coefficient
// in the data and is left out; Chaos Power / End to Beginning are passives (tools/passives.mjs).
// Body 5×5, walks up to 8 cells, 25 global rounds. Korean names are translations.
export const RAID = {
  monster: 3803, key: '3803|5', ko: '혼돈의 폭군', sz: 5, move: 8, rounds: 25,
  pv: [15036, 15037, 15038, 15056],
  // rank groups the boss can come in (sub-ranks of one rank share its stats) and the levels offered
  ranks: [['Gold1', '챔피언', [100, 110, 120, 130, 140]], ['Saint1', '마스터', [110, 120, 130, 140, 150, 160]], ['Legend1', '패러곤', [130, 140, 150, 160, 170]]],
};
