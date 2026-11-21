// Per sub-rank bases of the game (rank table the client uses in Damage(); as purrwikimania.com ships it on its
// simulator pages):
//   [0] BaseElementMaster (= Resistance / KongFu bases)   — mastery / resistance are divided by it
//   [1] BaseElementAdd (= BaseElementReduce)              — affinity / aegis are divided by it
//   [2] BaseCritRatePercentValue (= CritAvoid / Block / BlockAvoid) — the flat number after the "+" of Crit Rate,
//       Crit RES, Block Rate and Accuracy on the Character Stats screen is worth value ÷ base in %
//   [3] BaseEffectRate (= BaseEffectDodge)                — Effect Hit Rate / Effect RES are flat numbers over it
//   [4] level cap of the sub-rank
//   [5] PlayerSkillDmgReduceScale, [6] ProSkillDmgReduceScale (÷10000) — the defender's rank divides the damage it takes:
//       Damage() = ((ATK × coefficient) ÷ (1 + [5]) + flat) × ATK/(ATK+DEF) … ÷ (1 + [6]); [6] from Bronze2 on, [5]
//       from Silver3 on (Saint1 ÷1.15 · ÷1.46, Legend ÷1.39 · ÷2.01, Angel ÷1.39 · ÷2.36, Godtouched and above ÷1.39 · ÷2.76).
//       Monsters carry their own pair in their stat curves.
export const RANK_BASE = {
  Norank: [141, 1952, 115, 102, 10, 0, 0], Blackiron1: [449, 2231, 365, 324, 20, 0, 0], Blackiron2: [776, 2509, 631, 560, 30, 0, 0], Blackiron3: [1126, 2787, 915, 813, 40, 0, 0],
  Bronze1: [2028, 3065, 1648, 1465, 50, 0, 0], Bronze2: [3343, 3344, 2716, 2415, 60, 0, 500], Bronze3: [4007, 3622, 3255, 2894, 70, 0, 1000],
  Silver1: [7813, 4417, 6348, 5643, 80, 0, 1000], Silver2: [9419, 5204, 7653, 6803, 90, 0, 1000], Silver3: [10987, 5992, 8927, 7935, 100, 1400, 1400],
  Gold1: [82698, 6693, 69975, 48894, 110, 1400, 2245], Gold2: [105649, 7677, 89395, 59554, 120, 1400, 2695], Gold3: [117047, 8661, 99040, 70228, 130, 1400, 3145],
  Saint1: [195002, 9819, 195002, 112896, 140, 1540, 4550], Saint2: [228076, 10961, 228076, 132044, 150, 1696, 5049], Saint3: [285400, 12103, 285400, 165231, 160, 1870, 5549],
  Legend1: [387374, 13816, 130779, 266320, 170, 3850, 10100], Legend2: [519025, 14872, 179734, 356829, 180, 3850, 10100], Legend3: [608229, 15927, 204482, 418157, 190, 3850, 10100],
  Angel1: [731069, 13048, 346148, 696218, 200, 3850, 13600], Angel2: [907871, 14252, 430063, 864809, 210, 3850, 13600], Angel3: [1045932, 15456, 482092, 997554, 220, 3850, 13600],
  Godtouched1_1: [1995407, 20708, 744163, 1906689, 230, 3850, 17600], Godtouched1_2: [2554113, 21868, 981041, 2439227, 240, 3850, 17600], Godtouched1_3: [2949930, 23029, 1086812, 2820245, 250, 3850, 17600],
  Godtouched2_1: [4061542, 24189, 1597219, 3874175, 260, 3850, 17600], Godtouched2_2: [5247335, 25349, 2167752, 5000120, 270, 3850, 17600], Godtouched2_3: [7467400, 26509, 3445686, 7102055, 280, 3850, 17600],
  Godtouched3_1: [10941374, 27669, 5756530, 10378395, 290, 3850, 17600], Godtouched3_2: [16697379, 28829, 10032104, 15794831, 300, 3850, 17600], Godtouched3_3: [19817064, 29990, 12026869, 18743089, 310, 3850, 17600],
  Demigod1_1: [23176740, 31150, 14082563, 21921440, 320, 3850, 17600], Demigod1_2: [28228803, 32310, 17716246, 26677484, 330, 3850, 17600], Demigod1_3: [35456013, 33470, 23096969, 33474834, 340, 3850, 17600],
  Demigod2_1: [43819551, 34630, 29378201, 41337195, 350, 3850, 17600], Demigod2_2: [53407842, 35791, 36607830, 50349739, 360, 3850, 17600], Demigod2_3: [64287479, 36951, 44833752, 60575077, 370, 3850, 17600],
  Demigod3_1: [76577587, 38111, 54100259, 72125087, 380, 3850, 17600], Demigod3_2: [89765217, 39271, 64011255, 84519098, 390, 3850, 17600], Demigod3_3: [92897626, 40431, 65428478, 87489146, 400, 3850, 17600],
};

/* Beauty of Balance II, the per-match PvP governor (PVPSkillPropsScaleOnBattleProcessor; the C.pvp table purrwikimania.com
   ships with its team simulator): skill DMG, healing and shields × survival × rankScale × balance
   - survival: the lowest output-to-survivability ratio of the fighters (ATK²/(ATK+DEF)/HP × crit × block × elements × DMG
     bonus); above minSurvival the factor is minSurvival ÷ ratio
   - rankScale: decay[server average skill rank] ÷ decay[fight skill rank], at most 1; the server's average skill rank by
     server age in days (avgSkillRank, index = days, the last entry from then on)
   - balance: the fighters' mean of balance[rank enum][level] ÷ 10000 (1 where the table has no entry) */
export const PVP_GOV = {
  minSurvival: 0.1,
  avgSkillRank: [7,7,7,8,8,9,9,9,9,9,9,10,10,10,10,10,10,10,11,11,11,11,11,11,11,11,11,11,11,12,12,12,12,12,12,12,12,12,12,12,13,13,13,13,13,13,13,13,14,14,14,14,14,14,14,14,14,14,14,14,14,15,15,15,15,15,15,15,15,15,15,15,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,17],
  decay: [0,0.67,0.73,0.845,0.89,0.935,1.15,1.24,1.33,1.42,1.715,1.835,1.955,2.075,2.195,2.315,2.735,2.945,3.155,3.365,3.575,3.785,3.995,4.205,4.82,5.12,5.42,5.72,6.02,6.32,6.62,6.92,7.22,7.52,7.82],
  // rank enum (Legend 7, Angel 8): levels lo..flatTo are v0, then v from flatTo + 1 on
  balance: {
    7: { lo: 1, flatTo: 160, v0: 4662, v: [4724,4735,4756,4777,4798,4820,4842,4853,4875,4931,4965,4931,4942,4965,4977,4988,5012,5023,5047,5095,5132,5144,5157,5169,5182,5194,5207,5220,5232,5271,5530,5632,5707,5831,5895,5961,6011,6062,6097,6149,6185,6221,6257,6294,6331,6407,6485,6564,6646,6730,6794,6881,6926,6971,7016,7039,7086,7110,7133,7181,7205,7279,7379,7456,7535,7589,7670,7726,7782,7810,7839,7868,7897,7897,7926,7955,7955,8015,8045,8106,8168,8199,8263,8295,8327,8359,8392,8392,8392,8425,8425,8458,8458,8492,8526,8560,8594,8629,8664,8699,8699,8735,8735,8735,8770,8770,8770,8807,8807,8807,8843,8880,8880,8917,8917,8954,8954,8992,8992,8992,8992,8992,8992,8992,9511,9554,9596,9596,9640,9683,9727,9772,9817,9817,9862,9907,9953] },
    8: { lo: 190, flatTo: 190, v0: 8300, v: [8400,8500,8600,8700,8800,8900,9000,9100,9200,9300,9400,9500,9600,9700,9800,9900] },
  },
};
