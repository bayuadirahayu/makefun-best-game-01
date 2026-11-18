// AETHERHOLD — best score kept in localStorage, guarded so a browser that
// refuses storage (or a headless run with none) never breaks the game.
const KEY = 'aetherhold-best';

export function loadBest() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { score: 0, wave: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      wave: Number(parsed.wave) || 0,
    };
  } catch {
    return { score: 0, wave: 0 };
  }
}

export function saveBest(score, wave) {
  const best = loadBest();
  const next = {
    score: Math.max(best.score, Math.floor(score)),
    wave: Math.max(best.wave, wave),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the run still counts, it just is not kept.
  }
  return next;
}
