// AETHERHOLD — the game itself: its state machine (title, play, pause, win,
// over), the wave engine, the economy, and the clicks and keys that drive
// it. The loop is a plain requestAnimationFrame with a clamped delta; the
// shot scenes drive step() directly at fixed 1/60 s steps, so the same code
// plays both ways. All randomness comes from one seeded generator per run.
import { CONFIG, TOWERS, TOWER_ORDER, ENEMIES, BOSSES } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { Renderer3D } from './render3d.js';
import { Hud } from './hud.js';
import { Tower, upgradeCost } from './towers.js';
import { Enemy, buildWave } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { World } from './world.js';
import { mulberry32 } from './random.js';
import { loadBest, saveBest } from './storage.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.renderer3d = null;
    this.hud = new Hud(canvas);
    this.best = loadBest();
    this.statusEl = document.getElementById('status');
    this.seed = 1;
    this.time = 0;
    this.phase = 'title';
    this.difficulty = 'normal';
    this.speed = 1;
    this.showHelp = false;
    this.overAt = 0;
    this.endReason = null;
    this.banner = null;
    // One valley for every run: the map is built once from the seed and
    // never rebuilt, so the meshes and the logic can never drift apart.
    this.world = new World(1);
    this.renderer3d = null;
    this.reset(1);
  }

  get hard() {
    return this.difficulty === 'hard';
  }

  reset(seed) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.fx = new Particles(this.rand);
    this.projectiles = new Projectiles();
    this.towers = [];
    this.enemies = [];
    this.pendingSpawns = [];
    this.gold = this.hard ? CONFIG.startGoldHard : CONFIG.startGold;
    this.lives = CONFIG.startLives;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.wavesCleared = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.waveInfo = null;
    this.selectedPlot = null;
    this.selectedTower = null;
    this.hoverPlot = null;
    this.pendingType = 'arrow';
    this.banner = null;
    this.time = 0;
    this.overAt = 0;
    this.endReason = null;
    this.wispTimer = 0;
    this._previewCache = {};
    if (!this.renderer3d) {
      this.renderer3d = new Renderer3D(document.getElementById('gl'), this.world);
    }
    this.phase = 'title';
    this._setStatus('Aetherhold: build towers, hold the bastion.');
  }

  startRun() {
    this.audio.unlock();
    this.reset((Math.random() * 0x7fffffff) | 0);
    this.phase = 'play';
    this.setBanner('WAVE 1 INCOMING', 'Build your first towers, then press Space', '#ffd76a', 3.2);
    this._setStatus('Build phase. Click a plot, then a tower card.');
  }

  restart() {
    this.startRun();
  }

  togglePause() {
    if (this.phase === 'play') {
      this.phase = 'pause';
      this._setStatus('Paused. Press P to resume.');
    } else if (this.phase === 'pause') {
      this.phase = 'play';
      this._setStatus('Defending.');
    }
  }

  toggleMute() {
    const muted = this.audio.toggleMute();
    this._setStatus(muted ? 'Sound muted.' : 'Sound on.');
  }

  setBanner(text, sub, color, dur = 2.6) {
    this.banner = { text, sub: sub || '', color: color || '#ffd76a', until: this.time + dur };
  }

  towerRange(type) {
    return TOWERS[type].range;
  }

  enemiesAlive() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && !e.leaked) n++;
    return n;
  }

  nextWavePreview() {
    if (this.wave >= CONFIG.totalWaves) return null;
    const n = Math.min(this.wave + 1, CONFIG.totalWaves);
    if (!this._previewCache[n]) {
      const info = buildWave(n, this.seed);
      const counts = {};
      for (const s of info.spawns) counts[s.type] = (counts[s.type] || 0) + 1;
      const dots = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([type, count]) => {
          const def = type === 'boss' ? BOSSES[n] : ENEMIES[type];
          return { color: `#${def.color.toString(16).padStart(6, '0')}`, count };
        });
      const total = info.spawns.length;
      this._previewCache[n] = {
        label: `Wave ${n} — ${total} enemies${info.boss ? ' · BOSS ' + BOSSES[n].name : ''}`,
        dots,
      };
    }
    return this._previewCache[n];
  }

  startWave() {
    if (this.waveActive || this.phase !== 'play' || this.wave >= CONFIG.totalWaves) return;
    this.wave++;
    this.waveInfo = buildWave(this.wave, this.seed);
    this.spawnQueue = [...this.waveInfo.spawns];
    this.waveTime = 0;
    this.waveActive = true;
    this.selectedPlot = null;
    this.selectedTower = null;
    if (this.waveInfo.boss) {
      this.setBanner(`WAVE ${this.wave} — ${BOSSES[this.wave].name}`, 'A boss marches on the bastion!', '#ff5d5d', 3.4);
      this.audio.bossHorn();
    } else {
      this.setBanner(`WAVE ${this.wave}`, `${this.waveInfo.spawns.length} enemies incoming`, '#7fe7ff', 2.2);
      this.audio.horn();
    }
    this._setStatus(`Wave ${this.wave} of ${CONFIG.totalWaves}.`);
  }

  endWave() {
    this.waveActive = false;
    this.wavesCleared++;
    const bonus = CONFIG.waveBonusBase + CONFIG.waveBonusPerWave * this.wave;
    const interest = Math.min(Math.floor(this.gold * CONFIG.interestRate), CONFIG.interestCap);
    this.gold += bonus + interest;
    this.score += CONFIG.scorePerWaveClear * this.wave;
    this.setBanner(`WAVE ${this.wave} CLEARED`, `+◆ ${bonus} bonus${interest > 0 ? `, +◆ ${interest} interest` : ''}`, '#7ddc7d', 2.8);
    this._setStatus(`Wave cleared. +${bonus} gold${interest > 0 ? `, +${interest} interest` : ''}.`);
    if (this.wave >= CONFIG.totalWaves) this.winGame();
  }

  onKill(e) {
    const gold = this.hard ? Math.round(e.gold * 1.15) : e.gold;
    this.gold += gold;
    this.score += CONFIG.scorePerKill + this.wave;
    this.kills++;
  }

  onLeak(e) {
    this.lives -= e.lives;
    this.audio.leak();
    this.fx.addShake(0.5);
    this.fx.burst(29, 2, 10, '#ff5d5d', 18, 3, 0.7, 0.3);
    this._setStatus(`${e.def.name} slipped past! ${this.lives} lives left.`);
    if (this.lives <= 0) {
      this.lives = 0;
      this.endGame('overrun');
    }
  }

  spawnExtra(e) {
    this.pendingSpawns.push(e);
  }

  winGame() {
    if (this.phase !== 'play') return;
    this.phase = 'win';
    this.overAt = this.time;
    this.best = saveBest(this.score, this.wave);
    this.audio.win();
    this._setStatus(`Victory! Score ${Math.floor(this.score)}. Press R to play again.`);
  }

  endGame(reason) {
    if (this.phase !== 'play') return;
    this.phase = 'over';
    this.endReason = reason;
    this.overAt = this.time;
    this.best = saveBest(this.score, this.wave);
    this.audio.gameOver();
    this._setStatus(`The bastion falls on wave ${this.wave}. Press R to try again.`);
  }

  // --- building -------------------------------------------------------------

  tryPlace(type, plot) {
    const def = TOWERS[type];
    if (!plot || plot.tower) return false;
    if (this.gold < def.cost) {
      this.audio.error();
      this.setBanner('NOT ENOUGH GOLD', `A ${def.name} costs ◆ ${def.cost}`, '#ff5d5d', 1.6);
      return false;
    }
    this.gold -= def.cost;
    const y = this.world.heightAt(plot.x, plot.z);
    const tower = new Tower(type, plot, y);
    plot.tower = tower;
    this.towers.push(tower);
    this.selectedTower = tower;
    this.selectedPlot = null;
    this.audio.place();
    this.fx.burst(plot.x, 1.2, plot.z, '#ffd76a', 12, 2.4, 0.6, 0.28);
    return true;
  }

  tryUpgrade() {
    const t = this.selectedTower;
    if (!t || !t.canUpgrade()) return;
    const cost = upgradeCost(t.type, t.level);
    if (this.gold < cost) {
      this.audio.error();
      return;
    }
    this.gold -= cost;
    t.upgrade();
    this.audio.upgrade();
    this.fx.burst(t.x, 2.2, t.z, '#7ddc7d', 14, 2.6, 0.7, 0.3);
  }

  trySell() {
    const t = this.selectedTower;
    if (!t) return;
    this.gold += t.sellValue;
    t.plot.tower = null;
    this.towers.splice(this.towers.indexOf(t), 1);
    this.selectedTower = null;
    this.audio.coin();
  }

  // --- input ----------------------------------------------------------------

  _nearestPlot(gp, maxD) {
    let best = null;
    let bestD = maxD;
    for (const p of this.world.plots) {
      const d = Math.hypot(gp.x - p.x, gp.z - p.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _nearestTower(gp, maxD) {
    let best = null;
    let bestD = maxD;
    for (const t of this.towers) {
      const d = Math.hypot(gp.x - t.x, gp.z - t.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  _handleClick(x, y) {
    const region = this.hud.regionAt(x, y);
    if (this.phase === 'title') {
      if (region && region.kind === 'difficulty') {
        this.difficulty = region.value;
        return;
      }
      if (region && region.kind === 'title-start') {
        this.startRun();
        return;
      }
      return; // anywhere else on the title does nothing
    }
    if (this.phase === 'win' || this.phase === 'over') {
      if (region && region.kind === 'restart') this.restart();
      else if (this.time - this.overAt > 0.8) this.restart();
      return;
    }
    if (this.phase === 'pause') {
      if (region && region.kind === 'resume') this.togglePause();
      else if (region && region.kind === 'restart') this.restart();
      return;
    }
    if (this.showHelp) {
      if (region && region.kind === 'close-help') this.showHelp = false;
      return;
    }
    if (region) {
      if (region.kind === 'tower-card') {
        this.pendingType = region.type;
        if (this.selectedPlot) this.tryPlace(region.type, this.selectedPlot);
        return;
      }
      if (region.kind === 'start-wave') {
        this.startWave();
        return;
      }
      if (region.kind === 'speed') {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        return;
      }
      if (region.kind === 'pause') {
        this.togglePause();
        return;
      }
      if (region.kind === 'mute') {
        this.toggleMute();
        return;
      }
      if (region.kind === 'upgrade') {
        this.tryUpgrade();
        return;
      }
      if (region.kind === 'sell') {
        this.trySell();
        return;
      }
    }
    // Ground click: a tower first, else a plot, else deselect.
    const gp = this.renderer3d.groundPoint(x, y);
    if (!gp) return;
    const tower = this._nearestTower(gp, 2.0);
    if (tower) {
      this.selectedTower = tower;
      this.selectedPlot = null;
      return;
    }
    const plot = this._nearestPlot(gp, 2.2);
    if (plot) {
      this.selectedPlot = plot;
      this.selectedTower = null;
      return;
    }
    this.selectedPlot = null;
    this.selectedTower = null;
  }

  _handleKeys() {
    for (const key of this.input.consumePresses()) {
      if (key === 'm') {
        this.toggleMute();
        continue;
      }
      if (this.phase === 'title') {
        if (key === 'enter' || key === ' ') this.startRun();
        continue;
      }
      if (this.phase === 'win' || this.phase === 'over') {
        if ((key === 'r' || key === 'enter') && this.time - this.overAt > 0.8) this.restart();
        continue;
      }
      if (key === 'p' || key === 'escape') {
        if (this.showHelp) this.showHelp = false;
        else if (key === 'p') this.togglePause();
        else {
          this.selectedPlot = null;
          this.selectedTower = null;
        }
        continue;
      }
      if (this.phase === 'pause') {
        if (key === 'r') this.restart();
        continue;
      }
      if (key === ' ') {
        if (!this.waveActive) this.startWave();
        continue;
      }
      if (key === 'f') {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        continue;
      }
      if (key === 'h') {
        this.showHelp = !this.showHelp;
        continue;
      }
      if (key === 'r') {
        this.restart();
        continue;
      }
      if (key === 'u') {
        this.tryUpgrade();
        continue;
      }
      if (key === 'x') {
        this.trySell();
        continue;
      }
      const n = Number(key);
      if (n >= 1 && n <= 6) {
        const type = TOWER_ORDER[n - 1];
        this.pendingType = type;
        if (this.selectedPlot) this.tryPlace(type, this.selectedPlot);
      }
    }
  }

  // --- update ---------------------------------------------------------------

  step(dt) {
    this.time += dt;
    this._handleKeys();
    for (const c of this.input.consumeClicks()) this._handleClick(c.x, c.y);
    // Camera pan and zoom from drag and wheel.
    const drag = this.input.consumeDrag();
    if (drag.x !== 0 || drag.y !== 0) {
      this.renderer3d.panX = Math.max(-7, Math.min(7, this.renderer3d.panX - drag.x * 0.03));
      this.renderer3d.panZ = Math.max(-5, Math.min(5, this.renderer3d.panZ - drag.y * 0.03));
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) {
      this.renderer3d.zoom = Math.max(0.75, Math.min(1.35, this.renderer3d.zoom * (1 + wheel * 0.0004)));
    }
    // Hovered plot, for the disc glow and the range ring.
    if (this.phase === 'play') {
      const gp = this.renderer3d.groundPoint(this.input.mouseX, this.input.mouseY);
      this.hoverPlot = gp ? this._nearestPlot(gp, 2.2) : null;
    } else {
      this.hoverPlot = null;
    }
    if (this.phase === 'title') {
      // Ambient wisps drift over the valley behind the title.
      this.wispTimer -= dt;
      if (this.wispTimer <= 0) {
        this.wispTimer = 0.5;
        const c = this.world.crystals[(Math.random() * this.world.crystals.length) | 0];
        if (c) this.fx.wisp(c.x, c.y + 1, c.z, '#7fe7ff');
      }
      this.fx.update(dt);
      return;
    }
    if (this.phase !== 'play') {
      this.fx.update(dt);
      return;
    }
    // Spawning.
    if (this.waveActive) {
      this.waveTime += dt;
      while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.waveTime) {
        const s = this.spawnQueue.shift();
        const isBoss = s.type === 'boss';
        this.enemies.push(new Enemy(isBoss ? 'boss' : s.type, s.wave, this.hard, this.world, isBoss));
      }
    }
    const ctx = {
      enemies: this.enemies,
      projectiles: this.projectiles,
      particles: this.fx,
      audio: this.audio,
      rand: this.rand,
      wave: this.wave,
      hard: this.hard,
      onKill: (e) => this.onKill(e),
      onLeak: (e) => this.onLeak(e),
      spawnExtra: (e) => this.spawnExtra(e),
    };
    for (const t of this.towers) t.update(dt, ctx);
    for (const e of this.enemies) e.update(dt, ctx);
    // Splitter children join the horde after the update sweep.
    if (this.pendingSpawns.length > 0) {
      this.enemies.push(...this.pendingSpawns);
      this.pendingSpawns = [];
    }
    this.projectiles.update(dt, ctx);
    // Laser beams follow their towers' targets.
    for (const t of this.towers) {
      if (t.type !== 'laser') continue;
      if (t.beamTarget && !t.beamTarget.dead && !t.beamTarget.leaked) {
        this.projectiles.setBeam(t.id, t.x, t.y + 2.2, t.z, t.beamTarget.x, t.beamTarget.y + 0.8, t.beamTarget.z);
      } else {
        this.projectiles.clearBeam(t.id);
      }
    }
    // Sweep the dead and the leaked.
    this.enemies = this.enemies.filter((e) => !e.dead && !e.leaked);
    // Wave end: queue empty and nothing left alive.
    if (this.waveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.endWave();
    }
    this.fx.update(dt);
  }

  render() {
    this.renderer3d.draw(this, this.time);
    this.hud.draw(this, this.time);
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
