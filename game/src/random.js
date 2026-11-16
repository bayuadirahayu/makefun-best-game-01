// EMBERFALL — a tiny seeded random generator, so the cave, the shots and the
// play-tests are all reproducible from one number. Mulberry32: small, fast, good
// enough for a game, and its whole state fits in one integer.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D value noise: a wobbling centre line for the cave walls, built from a
// seeded random so the same seed always digs the same cavern.
export function makeNoise1D(seed, spacing) {
  const rand = mulberry32(seed);
  const knots = [];
  for (let i = 0; i < 64; i++) knots.push(rand() * 2 - 1);
  return function noise(x) {
    const p = x / spacing;
    const i = Math.floor(p);
    const f = p - i;
    const a = knots[((i % 64) + 64) % 64];
    const b = knots[(((i + 1) % 64) + 64) % 64];
    const u = f * f * (3 - 2 * f); // smoothstep between knots
    return a + (b - a) * u;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function randRange(rand, lo, hi) {
  return lo + rand() * (hi - lo);
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}
