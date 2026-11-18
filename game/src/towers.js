// AETHERHOLD — towers. A tower sits on a plot, picks the enemy furthest
// along the path inside its range, and fires: arrows and shells fly as
// projectiles, frost pulses a slowing chill, tesla arcs chain instantly, and
// the laser holds a burning beam. Three levels, each visibly bigger and
// stronger; selling returns most of the gold invested.
import { CONFIG, TOWERS } from './config.js';

let nextTowerId = 1;

export function towerStats(type, level) {
  const base = TOWERS[type];
  return {
    damage: base.damage * Math.pow(CONFIG.upgradeDamage, level - 1),
    rate: base.rate * Math.pow(CONFIG.upgradeRate, level - 1),
    range: base.range + CONFIG.upgradeRange * (level - 1),
    splash: base.splash,
    slow: base.slow,
    slowTime: base.slowTime,
    chain: base.chain,
  };
}

export function upgradeCost(type, level) {
  // The price of going from `level` to `level + 1`.
  return Math.round(TOWERS[type].cost * CONFIG.upgradeCostFactor * level);
}

export class Tower {
  constructor(type, plot, y) {
    this.id = nextTowerId++;
    this.type = type;
    this.level = 1;
    this.plot = plot;
    this.x = plot.x;
    this.z = plot.z;
    this.y = y;
    this.cooldown = 0;
    this.angle = 0; // head yaw, for the 3D turret to track its target
    this.target = null;
    this.invested = TOWERS[type].cost;
    this.kills = 0;
    this.beamTarget = null; // laser only: the enemy the beam holds
    this.stats = towerStats(type, 1);
  }

  get def() {
    return TOWERS[this.type];
  }

  get sellValue() {
    return Math.round(this.invested * CONFIG.sellRefund);
  }

  canUpgrade() {
    return this.level < 3;
  }

  upgrade() {
    if (!this.canUpgrade()) return false;
    const cost = upgradeCost(this.type, this.level);
    this.invested += cost;
    this.level++;
    this.stats = towerStats(this.type, this.level);
    return true;
  }

  // The enemy furthest along the path inside range, or null.
  acquire(enemies) {
    let best = null;
    let bestD = -1;
    for (const e of enemies) {
      if (e.dead || e.leaked) continue;
      const dx = e.x - this.x;
      const dz = e.z - this.z;
      if (dx * dx + dz * dz > this.stats.range * this.stats.range) continue;
      if (e.distance > bestD) {
        bestD = e.distance;
        best = e;
      }
    }
    return best;
  }

  // A boss aura nearby drags the fire rate down.
  auraFactor(enemies) {
    let f = 1;
    for (const e of enemies) {
      if (!e.boss || !e.def.auraSlow) continue;
      const dx = e.x - this.x;
      const dz = e.z - this.z;
      if (dx * dx + dz * dz < 36) f = Math.min(f, 1 - e.def.auraSlow);
    }
    return f;
  }

  update(dt, ctx) {
    const { enemies } = ctx;
    this.cooldown -= dt * this.auraFactor(enemies);
    this.target = this.acquire(enemies);
    if (this.target) {
      this.angle = Math.atan2(this.target.x - this.x, this.target.z - this.z);
    }
    // The laser holds its beam and burns every frame instead of firing.
    if (this.type === 'laser') {
      this.beamTarget = this.target;
      if (this.target) {
        this.target.takeDamage(this.stats.damage * dt, this, ctx, true);
        if (ctx.rand() < dt * 6) {
          ctx.particles.burst(this.target.x, 0.9, this.target.z, '#ffe95e', 1, 1.2, 0.35, 0.2);
        }
      }
      return;
    }
    this.beamTarget = null;
    if (!this.target || this.cooldown > 0) return;
    const period = 1 / this.stats.rate;
    this.cooldown = period;
    if (this.type === 'frost') {
      // A chill pulse: every enemy in range slows and takes a scratch.
      for (const e of enemies) {
        if (e.dead || e.leaked) continue;
        const dx = e.x - this.x;
        const dz = e.z - this.z;
        if (dx * dx + dz * dz > this.stats.range * this.stats.range) continue;
        e.applySlow(this.stats.slow, this.stats.slowTime);
        e.takeDamage(this.stats.damage, this, ctx, false);
        ctx.particles.burst(e.x, 0.7, e.z, '#7fe7ff', 2, 1.4, 0.5, 0.22);
      }
      ctx.audio.frost();
      return;
    }
    if (this.type === 'tesla') {
      // Lightning jumps instantly: the target, then the nearest others.
      let from = this.target;
      let dealt = 0;
      const hit = new Set();
      let dmg = this.stats.damage;
      for (let jump = 0; jump <= this.stats.chain; jump++) {
        if (!from || hit.has(from)) break;
        hit.add(from);
        from.takeDamage(dmg, this, ctx, false);
        ctx.projectiles.addArc(this.x, 2.4, this.z, from.x, from.y + 0.8, from.z, jump === 0 ? '#d9a7ff' : '#9a6bd9');
        dealt++;
        dmg *= 0.75;
        let next = null;
        let nextD = 4.5 * 4.5;
        for (const e of enemies) {
          if (e.dead || e.leaked || hit.has(e)) continue;
          const dx = e.x - from.x;
          const dz = e.z - from.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < nextD) { nextD = d2; next = e; }
        }
        from = next;
      }
      if (dealt > 0) ctx.audio.zap();
      return;
    }
    // Arrow, cannon and sniper fire a travelling projectile.
    ctx.projectiles.add({
      kind: this.type,
      x: this.x,
      y: this.y + 2.0,
      z: this.z,
      target: this.target,
      damage: this.stats.damage,
      splash: this.stats.splash,
      speed: this.type === 'sniper' ? 46 : this.type === 'cannon' ? 16 : 26,
      from: this,
    });
    if (this.type === 'cannon') ctx.audio.cannon();
    else if (this.type === 'sniper') ctx.audio.sniper();
    else ctx.audio.shoot();
  }
}
