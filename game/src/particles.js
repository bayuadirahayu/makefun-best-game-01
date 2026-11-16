// EMBERFALL — particles, floating score popups and screen shake: the juice that
// makes every pickup, dash and hit feel like something happened. One pool, no
// allocation during play, capped so a busy frame never runs away.
export class Particles {
  constructor() {
    this.list = [];
    this.popups = [];
    this.shake = 0;
    this.flash = 0;
  }

  burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i++) {
      if (this.list.length > 420) return;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.list.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.25,
        life: life * (0.6 + Math.random() * 0.4),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: 0.92,
        glow: true,
      });
    }
  }

  // A slow ember that drifts up behind the lantern: its trail.
  ember(x, y, color) {
    if (this.list.length > 420) return;
    this.list.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 24,
      vy: 40 + Math.random() * 50,
      life: 0.7 + Math.random() * 0.5,
      maxLife: 1.2,
      size: 2.5 + Math.random() * 3.5,
      color,
      drag: 0.98,
      glow: true,
    });
  }

  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color, life: 1.0 });
    if (this.popups.length > 24) this.popups.shift();
  }

  addShake(amount) {
    this.shake = Math.min(22, this.shake + amount);
  }

  addFlash(amount) {
    this.flash = Math.min(0.6, this.flash + amount);
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
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 42 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 34);
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }

  offset() {
    if (this.shake <= 0.2) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake,
      y: (Math.random() - 0.5) * this.shake,
    };
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
