// EMBERFALL — the lantern itself: a little ember with a flame, steering with
// inertia, a flare dash, three hearts of hull and an energy gauge that is always
// draining. Shards feed it; the deep starves it.
import { CONFIG } from './config.js';
import { clamp } from './random.js';

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = CONFIG.width / 2;
    this.y = CONFIG.height * 0.55;
    this.vx = 0;
    this.vy = 0;
    this.hearts = CONFIG.startHearts;
    this.energy = CONFIG.startEnergy;
    this.shield = false;
    this.magnetTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invulnerable = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.shards = 0;
    this.score = 0;
    this.alive = true;
    this.trailTimer = 0;
    this.flicker = 0;
  }

  get radius() {
    return CONFIG.playerRadius;
  }

  get magnet() {
    return this.magnetTimer > 0;
  }

  get dashing() {
    return this.dashTimer > 0;
  }

  update(dt, input, world, fx) {
    if (!this.alive) return;
    this.flicker += dt;

    // Steering: keys push directly; otherwise the lantern chases the mouse.
    const steer = input.steerVector();
    let tx;
    let ty;
    if (steer.keySteer) {
      const len = Math.hypot(steer.x, steer.y) || 1;
      tx = this.x + (steer.x / len) * 120;
      ty = this.y + (steer.y / len) * 120;
    } else {
      tx = input.mouseX;
      ty = input.mouseY;
    }
    const ax = (tx - this.x) * 9;
    const ay = (ty - this.y) * 9;
    this.vx += clamp(ax, -CONFIG.playerAccel, CONFIG.playerAccel) * dt;
    this.vy += clamp(ay, -CONFIG.playerAccel, CONFIG.playerAccel) * dt;

    // Flare dash: a burst of speed and a blink of invulnerability, at a cost.
    if (input.consumeDash() && this.dashCooldown <= 0 && this.energy > CONFIG.dashCost) {
      this.energy -= CONFIG.dashCost;
      this.dashTimer = CONFIG.dashTime;
      this.dashCooldown = CONFIG.dashCooldown;
      this.invulnerable = Math.max(this.invulnerable, CONFIG.dashTime + 0.15);
      const sp = Math.hypot(this.vx, this.vy) || 1;
      this.vx = (this.vx / sp) * CONFIG.dashSpeed;
      this.vy = (this.vy / sp) * CONFIG.dashSpeed;
      fx.addShake(CONFIG.shakeOnDash);
      fx.burst(this.x, this.y, '#ffb347', 14, 260, 0.5, 4);
    }
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);

    // Inertia with a speed cap, then stay inside the screen.
    const damp = Math.exp(-CONFIG.playerDamping * dt);
    this.vx *= damp;
    this.vy *= damp;
    const sp = Math.hypot(this.vx, this.vy);
    const cap = this.dashing ? CONFIG.dashSpeed * 1.15 : CONFIG.playerMaxSpeed;
    if (sp > cap) {
      this.vx = (this.vx / sp) * cap;
      this.vy = (this.vy / sp) * cap;
    }
    this.x = clamp(this.x + this.vx * dt, 24, CONFIG.width - 24);
    this.y = clamp(this.y + this.vy * dt, 60, CONFIG.height - 40);

    // Energy always drains; deeper means hungrier.
    const drain = CONFIG.energyDrain + CONFIG.energyDepthTax * world.depthFrac();
    this.energy -= drain * dt;

    // The combo fades if the streak goes cold.
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Ember trail.
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = CONFIG.trailRate;
      fx.ember(this.x, this.y + 12, this.dashing ? '#ffd27a' : '#ff9a3c');
    }

    // Starved of light: the lantern gutters out.
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
    }
  }

  // A shard: score with the combo multiplier, energy back, streak alive.
  collectShard(shard, fx) {
    this.shards += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = CONFIG.comboWindow;
    const mult = 1 + Math.min(this.combo - 1, 10) * CONFIG.comboStep;
    const pts = Math.round(CONFIG.shardScore * mult);
    this.score += pts;
    this.energy = Math.min(CONFIG.startEnergy, this.energy + CONFIG.shardEnergy);
    fx.popup(shard.x, shard.y - 14, `+${pts}`, '#ffe9a8');
    if (this.combo > 1) {
      fx.popup(shard.x, shard.y - 38, `x${mult.toFixed(1)}`, '#7be0ff');
    }
    fx.burst(shard.x, shard.y, '#ffd76a', 10, 180, 0.45, 3.5);
    return pts;
  }

  // A hit: the shield eats it, or a heart breaks.
  takeHit(fx) {
    if (this.invulnerable > 0 || !this.alive) return false;
    if (this.shield) {
      this.shield = false;
      this.invulnerable = CONFIG.invulnerableTime;
      fx.burst(this.x, this.y, '#7be0ff', 22, 320, 0.6, 4);
      fx.addShake(10);
      fx.popup(this.x, this.y - 30, 'SHIELD!', '#7be0ff');
      return true;
    }
    this.hearts -= 1;
    this.invulnerable = CONFIG.invulnerableTime;
    this.combo = 0;
    this.comboTimer = 0;
    fx.addShake(CONFIG.shakeOnHit);
    fx.addFlash(0.35);
    fx.burst(this.x, this.y, '#ff5d5d', 26, 340, 0.7, 5);
    if (this.hearts <= 0) this.alive = false;
    return true;
  }

  applyPickup(kind, fx) {
    if (kind === 'shield') {
      this.shield = true;
      fx.popup(this.x, this.y - 30, 'SHIELD', '#7be0ff');
    } else if (kind === 'magnet') {
      this.magnetTimer = 8;
      fx.popup(this.x, this.y - 30, 'MAGNET', '#c792ff');
    } else if (kind === 'slow') {
      fx.popup(this.x, this.y - 30, 'SLOW TIME', '#8dff9e');
    }
  }
}
