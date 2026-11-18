// AETHERHOLD — the valley itself: the serpentine path the horde marches,
// the build plots flanking it, the terrain height, the pond, the trees and
// rocks, and the bastion at the path's end. Everything is pure data from one
// seed, so the map is identical every time; render3d turns it into meshes.
import { CONFIG } from './config.js';
import { clamp, distToSegment, makeNoise1D, mulberry32, randRange } from './random.js';

// The path, west gate to bastion, in world units (x east, z south).
export const WAYPOINTS = [
  [-32, -12], [-12, -12], [-12, 8], [4, 8], [4, -10], [20, -10], [20, 10], [29, 10],
];

export const BASTION = { x: 29, z: 10 };
export const POND = { x: -22, z: 15, rx: 5.5, rz: 3.5 };

export class World {
  constructor(seed) {
    this.seed = seed;
    const rand = mulberry32(seed);
    this.rand = rand;
    this.noiseX = makeNoise1D(seed + 11, 9);
    this.noiseZ = makeNoise1D(seed + 23, 7);
    this.waypoints = WAYPOINTS.map(([x, z]) => ({ x, z }));
    this.segments = [];
    this.pathLength = 0;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i];
      const b = this.waypoints[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.segments.push({ a, b, len, start: this.pathLength });
      this.pathLength += len;
    }
    this.plots = this._makePlots();
    this.trees = this._scatter('tree', 46, 2.2);
    this.rocks = this._scatter('rock', 26, 1.6);
    this.crystals = this._scatter('crystal', 12, 2.6);
  }

  // The path's centre at a distance along it, and the direction there.
  positionAt(d) {
    const dist = clamp(d, 0, this.pathLength);
    let seg = this.segments[this.segments.length - 1];
    for (const s of this.segments) {
      if (dist <= s.start + s.len) { seg = s; break; }
    }
    const t = seg.len === 0 ? 0 : (dist - seg.start) / seg.len;
    return {
      x: seg.a.x + (seg.b.x - seg.a.x) * t,
      z: seg.a.z + (seg.b.z - seg.a.z) * t,
      dx: (seg.b.x - seg.a.x) / (seg.len || 1),
      dz: (seg.b.z - seg.a.z) / (seg.len || 1),
    };
  }

  distToPath(x, z) {
    let best = Infinity;
    for (const s of this.segments) {
      best = Math.min(best, distToSegment(x, z, s.a.x, s.a.z, s.b.x, s.b.z));
    }
    return best;
  }

  // Gentle hills, flattened near the path and the plots so towers and the
  // road sit level. The pond area dips slightly.
  heightAt(x, z) {
    let h = 0.5 * this.noiseX(x) + 0.35 * this.noiseZ(z) + 0.22 * Math.sin(x * 0.3) * Math.cos(z * 0.25);
    const pathD = this.distToPath(x, z);
    const pathFlat = clamp((pathD - 1.6) / 2.6, 0, 1);
    let plotFlat = 1;
    for (const p of this.plots) {
      const d = Math.hypot(x - p.x, z - p.z);
      plotFlat = Math.min(plotFlat, clamp((d - 1.4) / 1.6, 0, 1));
    }
    h *= Math.min(pathFlat, plotFlat);
    const pondD = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
    if (pondD < 1) h -= 0.5 * (1 - pondD);
    return h;
  }

  inPond(x, z) {
    return Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1;
  }

  // Build plots: a lattice filtered to clear ground, spread across the map.
  _makePlots() {
    const candidates = [];
    for (let x = -28; x <= 28; x += 4) {
      for (let z = -18; z <= 18; z += 4) {
        if (this.distToPath(x, z) < CONFIG.plotClearance) continue;
        if (Math.hypot(x - BASTION.x, z - BASTION.z) < 4.5) continue;
        if (this.inPond(x, z)) continue;
        if (Math.hypot(x - POND.x, z - POND.z) < 6) continue;
        candidates.push({ x, z, tower: null, id: candidates.length });
      }
    }
    // Spread the picks across the whole map instead of clustering in one corner.
    const picks = [];
    const step = Math.max(1, Math.floor(candidates.length / 16));
    for (let i = 0; i < candidates.length && picks.length < 16; i += step) {
      picks.push(candidates[i]);
    }
    // Fill any shortfall from the start of the list.
    for (let i = 0; picks.length < 16 && i < candidates.length; i++) {
      if (!picks.includes(candidates[i])) picks.push(candidates[i]);
    }
    return picks.map((p, i) => ({ ...p, id: i }));
  }

  // Scatter decor, keeping it off the path, the plots, the pond and the bastion.
  _scatter(kind, count, minPath) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 800) {
      const x = randRange(this.rand, -30, 30);
      const z = randRange(this.rand, -19, 19);
      if (this.distToPath(x, z) < minPath) continue;
      if (this.inPond(x, z)) continue;
      if (Math.hypot(x - BASTION.x, z - BASTION.z) < 4) continue;
      if (this.plots.some((p) => Math.hypot(x - p.x, z - p.z) < 2.2)) continue;
      out.push({
        x, z,
        s: randRange(this.rand, 0.7, 1.4),
        rot: this.rand() * Math.PI * 2,
        y: this.heightAt(x, z),
      });
    }
    return out;
  }
}
