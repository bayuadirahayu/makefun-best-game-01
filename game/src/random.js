// AETHERHOLD — a tiny seeded random generator, so the map, the waves and
// the screenshot scenes are all reproducible from one number. Mulberry32 is
// small, fast and good enough for a game; its whole state fits in one integer.
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

// Smooth 1D value noise from a seed: a wobbling line (the river bank, the
// hill ridge) that is the same every time the same seed is used.
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

// Distance from a point to a line segment, for plot clearance and path math.
export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
