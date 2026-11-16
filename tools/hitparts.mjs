// How "Large targets may take multiple hits" skills are split in the game data: each skill is a few hit configs
// (HitCfg), each covering a handful of cells. A large target takes one hit from every config whose cells touch its
// body, not one per covered cell. Cells are [sideways, forward] from the caster (or the aim, see below), as listed
// in the skill data that purrwikimania.com ships for its simulators (assets/duel.json, ec.hits[].cells).
// The engine turns them with the skill's aim; shapes centred on the caster (Dawnburst) are symmetric.
// fwd0: forward offset of the first cell in our frame when the game anchors the hit on the aim cell instead of the caster.
const row = (f, w) => Array.from({ length: w }, (_, i) => [i - (w - 1) / 2, f]);
const col = (x, from, to) => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i]);
export const PARTS = {
  // Water Assault: 3×4 in front, one config per row (4 hits at most)
  10003: [row(1, 3), row(2, 3), row(3, 3), row(4, 3)],
  // Phantom Blade: 3×4 in front, one config per column (3 hits at most)
  10085: [col(0, 1, 4), col(-1, 1, 4), col(1, 1, 4)],
  // Dawnburst: within 3 grids of the caster, split into the inner 2 grids and the outer ring (2 hits at most)
  10106: [
    [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 0], [-2, 0], [-1, -1], [-1, 1], [1, 1], [0, -2], [1, -1], [0, 2]],
    [[0, 3], [-1, 2], [-2, 1], [-3, 0], [-2, -1], [-1, -2], [0, -3], [1, -2], [2, -1], [3, 0], [2, 1], [1, 2]],
  ],
  // Hellfire Fist: 1×3 line, one config per cell
  10157: [[[0, 1]], [[0, 2]], [[0, 3]]],
  // Void Lightwave: 1×7 line, one config per cell
  10182: [1, 2, 3, 4, 5, 6, 7].map((f) => [[0, f]]),
  // Lucent Edge: 3×2 in front, one config per column
  10197: [col(-1, 1, 2), col(0, 1, 2), col(1, 1, 2)],
  // Starfall Sever: the centre column first, then both side columns (anchored on the aim cell, 0..2 → our 1..3)
  10200: [col(0, 0, 2), [...col(-1, 0, 2), ...col(1, 0, 2)]],
};
export const FWD0 = { 10200: 1 };
