// Per sub-rank bases of the game (rank table the client uses in Damage(); as purrwikimania.com ships it on its
// simulator pages):
//   [0] BaseElementMaster (= Resistance / KongFu bases)   — mastery / resistance are divided by it
//   [1] BaseElementAdd (= BaseElementReduce)              — affinity / aegis are divided by it
//   [2] BaseCritRatePercentValue (= CritAvoid / Block / BlockAvoid) — the flat number after the "+" of Crit Rate,
//       Crit RES, Block Rate and Accuracy on the Character Stats screen is worth value ÷ base in %
//   [3] BaseEffectRate (= BaseEffectDodge)                — Effect Hit Rate / Effect RES are flat numbers over it
//   [4] level cap of the sub-rank
export const RANK_BASE = {
  Norank: [141, 1952, 115, 102, 10], Blackiron1: [449, 2231, 365, 324, 20], Blackiron2: [776, 2509, 631, 560, 30], Blackiron3: [1126, 2787, 915, 813, 40],
  Bronze1: [2028, 3065, 1648, 1465, 50], Bronze2: [3343, 3344, 2716, 2415, 60], Bronze3: [4007, 3622, 3255, 2894, 70],
  Silver1: [7813, 4417, 6348, 5643, 80], Silver2: [9419, 5204, 7653, 6803, 90], Silver3: [10987, 5992, 8927, 7935, 100],
  Gold1: [82698, 6693, 69975, 48894, 110], Gold2: [105649, 7677, 89395, 59554, 120], Gold3: [117047, 8661, 99040, 70228, 130],
  Saint1: [195002, 9819, 195002, 112896, 140], Saint2: [228076, 10961, 228076, 132044, 150], Saint3: [285400, 12103, 285400, 165231, 160],
  Legend1: [387374, 13816, 130779, 266320, 170], Legend2: [519025, 14872, 179734, 356829, 180], Legend3: [608229, 15927, 204482, 418157, 190],
  Angel1: [731069, 13048, 346148, 696218, 200], Angel2: [907871, 14252, 430063, 864809, 210], Angel3: [1045932, 15456, 482092, 997554, 220],
  Godtouched1_1: [1995407, 20708, 744163, 1906689, 230], Godtouched1_2: [2554113, 21868, 981041, 2439227, 240], Godtouched1_3: [2949930, 23029, 1086812, 2820245, 250],
  Godtouched2_1: [4061542, 24189, 1597219, 3874175, 260], Godtouched2_2: [5247335, 25349, 2167752, 5000120, 270], Godtouched2_3: [7467400, 26509, 3445686, 7102055, 280],
  Godtouched3_1: [10941374, 27669, 5756530, 10378395, 290], Godtouched3_2: [16697379, 28829, 10032104, 15794831, 300], Godtouched3_3: [19817064, 29990, 12026869, 18743089, 310],
  Demigod1_1: [23176740, 31150, 14082563, 21921440, 320], Demigod1_2: [28228803, 32310, 17716246, 26677484, 330], Demigod1_3: [35456013, 33470, 23096969, 33474834, 340],
  Demigod2_1: [43819551, 34630, 29378201, 41337195, 350], Demigod2_2: [53407842, 35791, 36607830, 50349739, 360], Demigod2_3: [64287479, 36951, 44833752, 60575077, 370],
  Demigod3_1: [76577587, 38111, 54100259, 72125087, 380], Demigod3_2: [89765217, 39271, 64011255, 84519098, 390], Demigod3_3: [92897626, 40431, 65428478, 87489146, 400],
};
