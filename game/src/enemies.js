// AETHERHOLD — enemies and the waves they come in. An enemy walks the
// path from the west gate to the bastion; when it arrives, the bastion loses
// lives. Waves are generated from the wave number and the seed, so the same
// run always faces the same horde, and a boss leads every fifth wave.
import { BOSSES, CONFIG, ENEMIES, unlockedTypes } from './config.js';
import { mulberry32 } from './random.js';

let nextEnemyId = 1;

export class Enemy {
  constructor(type, wave, hard, world, isBoss = false) {
    this.id = nextEnemyId++;
    this.type = type;
    this.boss = isBoss;
    this.def = isBoss ? BOSSES[wave] : ENEMIES[type];
    const growth = Math.pow(hard ? CONFIG.hpGrowthHard : CONFIG.hpGrowth, wave - 1);
    this.maxHp = Math.round(this.def.hp * growth);
    this.hp = this.maxHp;
    const speedGrowth = Math.min(Math.pow(CONFIG.speedGrowth, wave - 1), 1.25);
    this.baseSpeed = this.def.speed * speedGrowth * (hard ? 1.1 : 1);
    this.speed = this.baseSpeed;
    this.distance = 0;
    this.x = world.waypoints[0].x;
    this.z = world.waypoints[0].z;
    this.y = 0;
    this.dead = false;
    this.leaked = false;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.healTimer = 0;
    this.beamAcc = 0;
    this.wobble = Math.random() * Math.PI * 2; // visual only
    this.world = world;
  }

  get gold() {
    return this.def.gold;
  }

  get lives() {
    return this.def.lives;
  }

  applySlow(frac, time) {
    this.slowFactor = 1 - frac;
    this.slowUntil = Math.max(this.slowUntil, time);
  }

  takeDamage(amount, source, ctx, isBeam = false) {
    if (this.dead || this.leaked) return;
    // Armor shaves flat damage off every hit, but a hit always hurts at least 1.
    const dealt = Math.max(1, amount - (this.def.armor || 0));
    this.hp -= dealt;
    if (isBeam) {
      // Beams hit every frame: bank the damage and show one number per chunk.
      this.beamAcc += dealt;
      if (this.beamAcc >= 15) {
        ctx.particles.damageNumber(this.x, this.y + 1.4, this.z, String(Math.round(this.beamAcc)), '#ffe95e');
        this.beamAcc = 0;
      }
    } else if (amount >= 10) {
      ctx.particles.damageNumber(this.x, this.y + 1.4, this.z, String(Math.round(dealt)), '#ffffff');
    }
    if (this.hp <= 0) this.die(source, ctx);
  }

  die(source, ctx) {
    if (this.dead) return;
    this.dead = true;
    if (source) source.kills++;
    ctx.onKill(this);
    const color = `#${this.def.color.toString(16).padStart(6, '0')}`;
    ctx.particles.burst(this.x, 0.8, this.z, color, this.boss ? 46 : 14, 3.2, 0.8, 0.32);
    if (this.boss) {
      ctx.particles.addShake(0.9);
      ctx.audio.cannon();
    } else {
      ctx.audio.coin();
    }
    // A splitter pops into two swarm on death.
    if (this.type === 'splitter' && !this.boss) {
      for (let i = 0; i < 2; i++) {
        const s = new Enemy('swarm', ctx.wave, ctx.hard, this.world);
        s.distance = Math.max(0, this.distance - 0.8 - i * 0.6);
        ctx.spawnExtra(s);
      }
    }
  }

  update(dt, ctx) {
    if (this.dead || this.leaked) return;
    // Bosses knit their wounds shut.
    if (this.def.regen) this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt);
    // Slow wears off.
    if (this.slowUntil > 0) {
      this.slowUntil -= dt;
      if (this.slowUntil <= 0) this.slowFactor = 1;
    }
    this.speed = this.baseSpeed * this.slowFactor;
    this.distance += this.speed * dt;
    const pos = this.world.positionAt(this.distance);
    this.x = pos.x;
    this.z = pos.z;
    const ground = this.world.heightAt(this.x, this.z);
    this.y = ground + (this.def.fly ? 2.3 : 0);
    this.wobble += dt * 6;
    // Healers mend whoever walks beside them.
    if (this.type === 'healer') {
      this.healTimer -= dt;
      if (this.healTimer <= 0) {
        this.healTimer = 0.5;
        for (const e of ctx.enemies) {
          if (e === this || e.dead || e.leaked) continue;
          const dx = e.x - this.x;
          const dz = e.z - this.z;
          if (dx * dx + dz * dz < 9 && e.hp < e.maxHp) {
            e.hp = Math.min(e.maxHp, e.hp + 3);
            if (ctx.rand() < 0.5) {
              ctx.particles.burst(e.x, 1.0, e.z, '#7ddc7d', 1, 0.8, 0.5, 0.2);
            }
          }
        }
      }
    }
    // Reached the bastion: leak, and the bastion loses lives.
    if (this.distance >= this.world.pathLength) {
      this.leaked = true;
      ctx.onLeak(this);
    }
  }
}

// A wave's spawn list: [{type, at}] with `at` seconds after the wave starts,
// plus a flag when the wave has a boss. Deterministic from wave + seed.
export function buildWave(wave, seed) {
  const rand = mulberry32(seed * 31 + wave * 7919);
  const spawns = [];
  const boss = BOSSES[wave];
  let t = 1.0;
  if (boss) {
    spawns.push({ type: 'boss', at: t, wave });
    t += 3.0;
  }
  const budget = 8 + wave * 5;
  const types = unlockedTypes(wave);
  const weights = { grunt: 3, runner: 2.5, swarm: 2, tank: 1.5, flyer: 1.5, splitter: 1.2, healer: 0.8 };
  let spent = 0;
  while (spent < budget) {
    // Weighted pick among the unlocked types.
    let total = 0;
    for (const ty of types) total += weights[ty];
    let roll = rand() * total;
    let type = types[0];
    for (const ty of types) {
      roll -= weights[ty];
      if (roll <= 0) { type = ty; break; }
    }
    const count = type === 'swarm' ? 6 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 4);
    const gap = type === 'swarm' ? 0.32 : 0.55 + rand() * 0.35;
    for (let i = 0; i < count; i++) {
      spawns.push({ type, at: t + i * gap, wave });
    }
    spent += count * (type === 'tank' ? 2.2 : type === 'healer' ? 1.8 : 1);
    t += count * gap + 1.4 + rand() * 1.2;
  }
  return { spawns, boss: !!boss, duration: t };
}
