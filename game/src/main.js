// EMBERFALL — the game itself: its state machine (title, play, pause, over,
// win), the fixed update step, and the boot that wires it to the page.
// The loop is a plain requestAnimationFrame with a clamped delta; the shot
// scenes drive step() directly instead, so the same code plays both ways.
import { CONFIG } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Renderer } from './render.js';
import { Renderer3D } from './render3d.js';
import { applyShot, shotFromUrl } from './shots.js';
import { loadBest, saveBest } from './storage.js';
import { World } from './world.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.fx = new Particles();
    this.renderer = new Renderer(canvas);
    // The 3D diorama paints the world on the canvas below; this canvas is
    // its overlay (HUD, screens, particles), transparent where it is empty.
    this.renderer.overlay = true;
    this.renderer3d = new Renderer3D(document.getElementById('gl'));
    this.best = loadBest();
    this.statusEl = document.getElementById('status');
    this.seed = 1;
    this.time = 0;
    this.elapsed = 0;
    this.phase = 'title';
    this.endReason = null;
    this.surgeBanner = 0;
    this.overAt = 0;
    this._wasSurge = false;
    this.world = new World(this.seed);
    this.player = new Player();
    this._setStatus('Emberfall: press Enter or click to dive.');
  }

  reset(seed) {
    this.seed = seed;
    this.world = new World(seed);
    this.player = new Player();
    this.fx = new Particles();
    this.time = 0;
    this.elapsed = 0;
    this.phase = 'title';
    this.endReason = null;
    this.surgeBanner = 0;
    this.overAt = 0;
    this._wasSurge = false;
  }

  // A fresh run from the title or the end screens.
  startRun() {
    this.audio.unlock();
    this.phase = 'play';
    this.elapsed = 0;
    this._setStatus('Diving. Steer with the mouse or arrow keys. Space dashes.');
  }

  restart() {
    this.reset((Math.random() * 0x7fffffff) | 0);
    this.startRun();
  }

  togglePause() {
    if (this.phase === 'play') {
      this.phase = 'pause';
      this._setStatus('Paused. Press P to keep diving.');
    } else if (this.phase === 'pause') {
      this.phase = 'play';
      this._setStatus('Diving.');
    }
  }

  toggleMute() {
    const muted = this.audio.toggleMute();
    this._setStatus(muted ? 'Sound muted.' : 'Sound on.');
  }

  winGame() {
    if (this.phase !== 'play') return;
    this.phase = 'win';
    this.overAt = this.time;
    this.best = saveBest(this.player.score, this.world.depth);
    this.audio.win();
    this.fx.burst(this.player.x, this.player.y, '#ffd76a', 60, 380, 1.2, 5);
    this.fx.burst(this.player.x, this.player.y, '#fff6cf', 30, 220, 1.0, 4);
    this._setStatus(`You won! Score ${Math.floor(this.player.score)}. Press R to dive again.`);
  }

  endGame(reason) {
    if (this.phase !== 'play') return;
    this.phase = 'over';
    this.endReason = reason;
    this.overAt = this.time;
    this.best = saveBest(this.player.score, this.world.depth);
    this.audio.gameOver();
    this.fx.burst(this.player.x, this.player.y, '#ff5d5d', 40, 360, 1.0, 5);
    this._setStatus(
      reason === 'starved'
        ? 'Game over: your light died. Press R to dive again.'
        : 'Game over: your lantern shattered. Press R to dive again.',
    );
  }

  step(dt) {
    this.time += dt;
    if (this.phase === 'title') {
      // The cave drifts behind the title so it never looks dead.
      this.world.update(dt, this.player);
      this.fx.update(dt);
      return;
    }
    if (this.phase !== 'play') {
      this.fx.update(dt);
      return;
    }
    this.elapsed += dt;
    const prevDepth = this.world.depth;
    this.player.update(dt, this.input, this.world, this.fx);
    this.world.update(dt, this.player);

    // Depth itself scores: every metre down is worth something.
    this.player.score += (this.world.depth - prevDepth) * CONFIG.depthScore;

    // The surge banner and its sound, once per surge.
    if (this.world.surgeActive && !this._wasSurge) {
      this.surgeBanner = 2.6;
      this.audio.surge();
    }
    this._wasSurge = this.world.surgeActive;
    this.surgeBanner = Math.max(0, this.surgeBanner - dt);

    if (this.player.alive) {
      // Rock: the walls and their spikes.
      if (this.world.hitsRock(this.player.x, this.player.y, this.player.radius)) {
        if (this.player.takeHit(this.fx)) this.audio.hit();
      }
      // Wisps: one touch, one hit, and the wisp pops.
      const wisp = this.world.wispHit(this.player.x, this.player.y, this.player.radius);
      if (wisp) {
        this.world.wisps.splice(this.world.wisps.indexOf(wisp), 1);
        this.fx.burst(wisp.x, wisp.y - this.world.scrollY, '#c792ff', 24, 300, 0.6, 4);
        if (this.player.takeHit(this.fx)) this.audio.hit();
      }
      // Shards: score, energy and the combo.
      const shards = this.world.collectShards(this.player.x, this.player.y, this.player.magnet);
      for (const s of shards) {
        this.player.collectShard(s, this.fx);
        this.audio.pickup(this.player.combo);
      }
      // Pickups: shield, magnet or slow time.
      const pickup = this.world.collectPickup(this.player.x, this.player.y);
      if (pickup) {
        this.player.applyPickup(pickup.kind, this.fx);
        if (pickup.kind === 'slow') this.world.slowTimer = 6;
        this.audio.powerup();
      }
    }

    // The deep claims the lantern, or the lantern reaches the Heart.
    if (!this.player.alive) {
      this.endGame(this.player.energy <= 0 ? 'starved' : 'shattered');
    } else if (this.world.depth >= CONFIG.winDepth) {
      this.winGame();
    }
    this.fx.update(dt);
  }

  render() {
    this.renderer3d.draw(this, this.time);
    this.renderer.draw(this, this.time);
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}

// --- boot ------------------------------------------------------------------

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__emberfall = game;

const shot = shotFromUrl();
if (shot) {
  // A screenshot scene: drive it deterministically, render once, stop.
  applyShot(game, shot.shot, shot.seed);
} else {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (game.phase === 'title') game.restart();
      else if ((game.phase === 'over' || game.phase === 'win') && game.time - game.overAt > 0.8) game.restart();
    } else if (e.key === 'r' || e.key === 'R') {
      if (game.phase !== 'title') game.restart();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      game.togglePause();
    } else if (e.key === 'm' || e.key === 'M') {
      game.toggleMute();
    }
  });
  canvas.addEventListener('mousedown', () => {
    game.audio.unlock();
    if (game.phase === 'title') game.restart();
    else if ((game.phase === 'over' || game.phase === 'win') && game.time - game.overAt > 0.8) game.restart();
  });
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    game.step(dt);
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__shotReady = true;
}
