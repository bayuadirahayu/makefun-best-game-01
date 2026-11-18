// AETHERHOLD — projectiles and beams. Arrows, shells and sniper rounds fly
// toward a moving target and apply their damage on arrival (shells burst in
// a splash); tesla arcs and laser beams are instant visuals that fade over a
// fraction of a second. The renderer draws all of them from this state.
export class Projectiles {
  constructor() {
    this.list = []; // flying shots
    this.arcs = []; // tesla lightning: {x1,y1,z1,x2,y2,z2,life,color}
    this.beams = new Map(); // tower id -> {x1,y1,z1,x2,y2,z2}
  }

  add(p) {
    this.list.push({
      kind: p.kind,
      x: p.x, y: p.y, z: p.z,
      target: p.target,
      damage: p.damage,
      splash: p.splash || 0,
      speed: p.speed,
      from: p.from,
      life: 3,
    });
  }

  addArc(x1, y1, z1, x2, y2, z2, color) {
    this.arcs.push({ x1, y1, z1, x2, y2, z2, life: 0.18, maxLife: 0.18, color });
  }

  setBeam(towerId, x1, y1, z1, x2, y2, z2) {
    this.beams.set(towerId, { x1, y1, z1, x2, y2, z2 });
  }

  clearBeam(towerId) {
    this.beams.delete(towerId);
  }

  update(dt, ctx) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      const t = p.target;
      // The target died or leaked mid-flight: the shot fizzles.
      if (!t || t.dead || t.leaked || p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      const tx = t.x;
      const ty = t.y + 0.7 * (t.def.scale || 1);
      const tz = t.z;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dz = tz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;
      if (dist <= Math.max(step, 0.6)) {
        // Arrival: direct hit, or a splash that hurts the whole cluster.
        if (p.splash > 0) {
          for (const e of ctx.enemies) {
            if (e.dead || e.leaked) continue;
            const ex = e.x - tx;
            const ez = e.z - tz;
            const d2 = ex * ex + ez * ez;
            if (d2 <= p.splash * p.splash) {
              const mult = e.def.fly ? 0.5 : 1;
              e.takeDamage(p.damage * mult, p.from, ctx);
            }
          }
          ctx.particles.burst(tx, 0.9, tz, '#ff9a3d', 16, 3.4, 0.6, 0.3);
          ctx.particles.addShake(0.25);
        } else {
          t.takeDamage(p.damage, p.from, ctx);
          ctx.particles.burst(tx, ty, tz, p.kind === 'sniper' ? '#bfe6ff' : '#ffd27a', 4, 1.6, 0.35, 0.18);
        }
        this.list.splice(i, 1);
        continue;
      }
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.z += (dz / dist) * step;
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
  }
}
