// EMBERFALL — the best dive, kept in localStorage so the title screen can show
// it and a new run can chase it. Guarded: private browsing may throw.
const KEY = 'emberfall.best.v1';

export function loadBest() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { score: 0, depth: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      depth: Number(parsed.depth) || 0,
    };
  } catch {
    return { score: 0, depth: 0 };
  }
}

export function saveBest(score, depth) {
  const best = loadBest();
  const next = {
    score: Math.max(best.score, Math.floor(score)),
    depth: Math.max(best.depth, Math.floor(depth)),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the run still counts, it just is not remembered.
  }
  return next;
}
