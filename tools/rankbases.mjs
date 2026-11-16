// Per sub-rank bases of the game (rank table the client uses in Damage(); as purrwikimania.com ships it on its
// simulator pages): [BaseElementMaster (= Resistance / KongFu bases), BaseElementAdd (= BaseElementReduce)].
// The elemental multiplier divides affinity / aegis by BaseElementAdd and mastery / resistance by BaseElementMaster.
export const RANK_BASE = {
  Norank: [141, 1952], Blackiron1: [449, 2231], Blackiron2: [776, 2509], Blackiron3: [1126, 2787],
  Bronze1: [2028, 3065], Bronze2: [3343, 3344], Bronze3: [4007, 3622],
  Silver1: [7813, 4417], Silver2: [9419, 5204], Silver3: [10987, 5992],
  Gold1: [82698, 6693], Gold2: [105649, 7677], Gold3: [117047, 8661],
  Saint1: [195002, 9819], Saint2: [228076, 10961], Saint3: [285400, 12103],
  Legend1: [387374, 13816], Legend2: [519025, 14872], Legend3: [608229, 15927],
  Angel1: [731069, 13048], Angel2: [907871, 14252], Angel3: [1045932, 15456],
  Godtouched1_1: [1995407, 20708], Godtouched1_2: [2554113, 21868], Godtouched1_3: [2949930, 23029],
  Godtouched2_1: [4061542, 24189], Godtouched2_2: [5247335, 25349], Godtouched2_3: [7467400, 26509],
  Godtouched3_1: [10941374, 27669], Godtouched3_2: [16697379, 28829], Godtouched3_3: [19817064, 29990],
  Demigod1_1: [23176740, 31150], Demigod1_2: [28228803, 32310], Demigod1_3: [35456013, 33470],
  Demigod2_1: [43819551, 34630], Demigod2_2: [53407842, 35791], Demigod2_3: [64287479, 36951],
  Demigod3_1: [76577587, 38111], Demigod3_2: [89765217, 39271], Demigod3_3: [92897626, 40431],
};
