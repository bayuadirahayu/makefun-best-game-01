// AETHERHOLD — particles in world space (muzzle flashes, explosions, frost
// shards, heal sparkles) and floating damage numbers anchored to the world.
// One pool, no allocation during play, capped so a busy frame never runs
// away. The game hands it its seeded random so screenshot scenes are
// reproducible; the damage numbers are drawn by the HUD from their 3D anchor.
export class Particles {
  constructor(rand) {
    this.rand = rand || Math.random;
    this.list = [];
    this.numbers = []; // {x, y, z, text, color, life}
    this.shake = 0;
  }

  burst(x, y, z, color, count, speed, life, size, up = 1.6) {
    for (let i = 0; i < count; i++) {
      if (this.list.length > 500) return;
      const a = this.rand() * Math.PI * 2;
      const v = speed * (0.35 + this.rand() * 0.65);
      this.list.push({
        x, y, z,
        vx: Math.cos(a) * v,
        vy: (0.4 + this.rand() * 0.8) * up,
        vz: Math.sin(a) * v,
        life: life * (0.6 + this.rand() * 0.4),
        maxLife: life,
        size: size * (0.6 + this.rand() * 0.8),
        color,
      });
    }
  }

  // A rising wisp over a tower or crystal: ambient life, not combat.
  wisp(x, y, z, color) {
    if (this.list.length > 500) return;
    this.list.push({
      x: x + (this.rand() - 0.5) * 1.2,
      y,
      z: z + (this.rand() - 0.5) * 1.2,
      vx: (this.rand() - 0.5) * 0.3,
      vy: 0.8 + this.rand() * 0.7,
      vz: (this.rand() - 0.5) * 0.3,
      life: 1.1 + this.rand() * 0.8,
      maxLife: 1.9,
      size: 0.22 + this.rand() * 0.25,
      color,
    });
  }

  damageNumber(x, y, z, text, color) {
    this.numbers.push({ x, y, z, text, color, life: 0.9 });
    if (this.numbers.length > 30) this.numbers.shift();
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 2.2 * dt; // gravity pulls sparks back down
      p.vx *= 0.985;
      p.vz *= 0.985;
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      n.y += 1.6 * dt;
      if (n.life <= 0) this.numbers.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  // Camera shake offset in world units, from the seeded random.
  shakeOffset() {
    if (this.shake <= 0.02) return { x: 0, z: 0 };
    return {
      x: (this.rand() - 0.5) * this.shake,
      z: (this.rand() - 0.5) * this.shake,
    };
  }
}
