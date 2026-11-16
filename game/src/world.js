// EMBERFALL — the cave itself: its walls, spikes, wisps, shards and pickups.
// The cave scrolls past the lantern as it dives; rows are dug ahead of the
// screen and forgotten behind it. Depth is metres; the world is pixels.
import { CONFIG } from './config.js';
import { clamp, lerp, makeNoise1D, mulberry32, randRange } from './random.js';

const PX_PER_METRE = 30;

export class World {
  constructor(seed) {
    this.seed = seed;
    this.reset();
  }

  reset() {
    const rand = mulberry32(this.seed);
    this.rand = rand;
    this.noise = makeNoise1D(this.seed + 7, 340);
    this.scrollY = 0;
    this.depth = 0;
    this.speed = CONFIG.baseScroll;
    this.surgeTimer = 0;
    this.surgeActive = false;
    this.nextSurgeDepth = CONFIG.surgeEvery;
    this.nextRowY = 240;
    this.slowTimer = 0;
    this.spikes = [];
    this.wisps = [];
    this.shards = [];
    this.pickups = [];
    this.chamber = false; // the Heart Chamber opens near the win depth
  }

  depthFrac() {
    return clamp(this.depth / CONFIG.winDepth, 0, 1);
  }

  // The cave centre at a world y, and half the open gap there.
  wallsAt(y) {
    const f = clamp(y / (CONFIG.winDepth * PX_PER_METRE), 0, 1);
    const centre = CONFIG.width / 2 + this.noise(y) * CONFIG.wallWobble * (0.5 + f * 0.5);
    let halfGap = lerp(CONFIG.wallGapStart, CONFIG.wallGapEnd, f) / 2;
    if (this.chamber) halfGap = lerp(halfGap, 560, 0.8);
    return { centre, halfGap };
  }

  scrollSpeed() {
    const f = this.depthFrac();
    let v = lerp(CONFIG.baseScroll, CONFIG.maxScroll, f);
    if (this.surgeActive) v *= CONFIG.surgeBoost;
    if (this.slowTimer > 0) v *= 0.55;
    return v;
  }

  update(dt, player) {
    this.speed = this.scrollSpeed();
    this.scrollY += this.speed * dt;
    this.depth = this.scrollY / PX_PER_METRE;
    this.slowTimer = Math.max(0, this.slowTimer - dt);

    // Surges: every 250 m the deep quickens for a few seconds.
    if (!this.surgeActive && this.depth >= this.nextSurgeDepth) {
      this.surgeActive = true;
      this.surgeTimer = CONFIG.surgeLength;
      this.nextSurgeDepth += CONFIG.surgeEvery;
    }
    if (this.surgeActive) {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) this.surgeActive = false;
    }
    if (!this.chamber && this.depth >= CONFIG.winDepth - 40) this.chamber = true;

    // Dig rows ahead of the visible bottom.
    const bottom = this.scrollY + CONFIG.height + 160;
    while (this.nextRowY < bottom) {
      this._spawnRow(this.nextRowY);
      this.nextRowY += 92;
    }

    // Forget what scrolled past the top.
    const top = this.scrollY - 220;
    const keep = (list) => {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].y < top) list.splice(i, 1);
    };
    keep(this.spikes);
    keep(this.wisps);
    keep(this.shards);
    keep(this.pickups);

    // Wisps drift side to side as they fall.
    for (const w of this.wisps) {
      w.t += dt;
      w.x = w.baseX + Math.sin(w.t * w.swaySpeed) * w.sway;
      w.y += w.fall * dt;
    }
    // Pickups bob gently.
    for (const p of this.pickups) p.t += dt;
  }

  _spawnRow(y) {
    const rand = this.rand;
    const f = this.depthFrac();
    const { centre, halfGap } = this.wallsAt(y);
    const left = centre - halfGap;
    const right = centre + halfGap;

    // A line of shards, arcing through the gap: the safe path pays.
    if (rand() < CONFIG.shardRowChance) {
      const n = 3 + Math.floor(rand() * 3);
      const arc = (rand() - 0.5) * halfGap * 0.9;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        this.shards.push({
          x: centre + arc * Math.sin(t * Math.PI) + (rand() - 0.5) * 24,
          y: y + t * 64,
          r: 11,
          phase: rand() * Math.PI * 2,
          taken: false,
        });
      }
    }

    // Spikes jut from the walls into the gap; deeper means longer, meaner ones.
    if (rand() < CONFIG.spikeChance + f * 0.22) {
      const side = rand() < 0.5 ? -1 : 1;
      const count = 1 + (rand() < 0.35 + f * 0.2 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const len = randRange(rand, 34, CONFIG.spikeMaxLen * (0.7 + f * 0.5));
        this.spikes.push({
          x: side < 0 ? left : right,
          y: y + i * 46 + rand() * 20,
          side,
          len,
          w: 26,
        });
      }
    }

    // A wisp: a drifting void that hunts the open water.
    if (rand() < CONFIG.wispChance + f * 0.12) {
      const bx = randRange(rand, left + 70, right - 70);
      this.wisps.push({
        baseX: bx,
        x: bx,
        y,
        r: 17 + rand() * 7,
        t: rand() * 6,
        sway: randRange(rand, 40, 110),
        swaySpeed: randRange(rand, 0.7, 1.5),
        fall: randRange(rand, 6, 22),
      });
    }

    // Rare pickups: a shield, a magnet or a slow.
    if (rand() < CONFIG.pickupChance) {
      const kind = rand() < 0.4 ? 'shield' : rand() < 0.75 ? 'magnet' : 'slow';
      this.pickups.push({
        kind,
        x: randRange(rand, left + 60, right - 60),
        y,
        r: 15,
        t: rand() * 6,
      });
    }
  }

  // --- collisions, called from the main loop -------------------------------

  // True when the lantern's circle is inside rock (a wall or a spike tip).
  hitsRock(px, py, r) {
    const { centre, halfGap } = this.wallsAt(py);
    if (Math.abs(px - centre) + r > halfGap) return true;
    // A spike is a triangle jutting from the wall: its tip reaches len px into
    // the gap, its base is w px tall. The lantern hits it when the circle
    // overlaps that triangle's bounding box.
    for (const s of this.spikes) {
      if (Math.abs(py - s.y) > s.w / 2 + r) continue;
      if (s.side < 0) {
        if (px + r > s.x && px - r < s.x + s.len) return true;
      } else if (px - r < s.x && px + r > s.x - s.len) {
        return true;
      }
    }
    return false;
  }

  wispHit(px, py, r) {
    for (const w of this.wisps) {
      const dx = px - w.x;
      const dy = py - w.y;
      if (dx * dx + dy * dy < (w.r + r * 0.75) * (w.r + r * 0.75)) return w;
    }
    return null;
  }

  collectShards(px, py, magnet) {
    const got = [];
    const reach = magnet ? 150 : 34;
    for (const s of this.shards) {
      if (s.taken) continue;
      const dx = px - s.x;
      const dy = py - s.y;
      const d2 = dx * dx + dy * dy;
      if (magnet && d2 < reach * reach) {
        // The magnet pulls the shard toward the lantern.
        const d = Math.sqrt(d2) || 1;
        s.x += (dx / d) * 420 * 0.016;
        s.y += (dy / d) * 420 * 0.016;
      }
      if (d2 < (s.r + 16) * (s.r + 16)) {
        s.taken = true;
        got.push(s);
      }
    }
    if (got.length) this.shards = this.shards.filter((s) => !s.taken);
    return got;
  }

  collectPickup(px, py) {
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      const dx = px - p.x;
      const dy = py - p.y;
      if (dx * dx + dy * dy < (p.r + 18) * (p.r + 18)) {
        this.pickups.splice(i, 1);
        return p;
      }
    }
    return null;
  }
}
