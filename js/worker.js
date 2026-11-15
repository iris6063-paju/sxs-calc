// Monte Carlo worker: keeps the page responsive while thousands of fights are simulated.
import { monteCarlo } from './engine.js';

self.onmessage = (e) => {
  const { id, setup, n, seed } = e.data;
  try {
    const res = monteCarlo(setup, n, seed, (agg) => self.postMessage({ id, progress: agg.n, wins: agg.wins, draws: agg.draws }));
    self.postMessage({ id, done: true, res });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
