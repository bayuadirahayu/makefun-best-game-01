// AETHERHOLD — the 2D overlay: top bar (gold, lives, wave, score), the
// build bar with six tower cards, the selected-tower panel, wave preview,
// banners, enemy health bars and damage numbers, and the title, pause,
// victory and defeat screens. It also owns the click regions: regionAt()
// tells the game what a click hit, so the game never hard-codes pixels.
import { CONFIG, TOWERS, TOWER_ORDER } from './config.js';
import { upgradeCost } from './towers.js';

const FONT = '"Segoe UI", system-ui, sans-serif';
const PANEL = 'rgba(8, 12, 20, 0.78)';
const PANEL_BORDER = 'rgba(255, 233, 94, 0.35)';
const TEXT = '#eef2ff';
const MUTED = '#9aa7c7';
const GOLD = '#ffd76a';
const DANGER = '#ff5d5d';
const GOOD = '#7ddc7d';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = []; // rebuilt every draw: {x, y, w, h, kind, ...}
  }

  _region(x, y, w, h, kind, data = {}) {
    this.regions.push({ x, y, w, h, kind, ...data });
    return { x, y, w, h };
  }

  regionAt(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  draw(game, time) {
    const ctx = this.ctx;
    this.regions = [];
    ctx.clearRect(0, 0, 1280, 720);
    this._drawWorldFx(game);
    if (game.phase === 'title') {
      this._drawTitle(game);
      return;
    }
    this._drawTopBar(game);
    this._drawBuildBar(game);
    if (game.selectedTower) this._drawTowerPanel(game);
    this._drawBanner(game);
    if (game.phase === 'pause') this._drawPause(game);
    else if (game.phase === 'win') this._drawEnd(game, true);
    else if (game.phase === 'over') this._drawEnd(game, false);
    if (game.showHelp) this._drawHelp(game);
  }

  _drawWorldFx(game) {
    const ctx = this.ctx;
    // Enemy health bars and floating damage numbers, projected from 3D.
    for (const e of game.enemies) {
      if (e.dead || e.leaked) continue;
      const top = game.renderer3d.project(e.x, e.y + 2.4 * (e.def.scale || 1), e.z);
      if (!top || top.x < -40 || top.x > 1320 || top.y < 40 || top.y > 720) continue;
      const w = e.boss ? 56 : 26;
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(top.x - w / 2, top.y, w, 4);
      ctx.fillStyle = frac > 0.5 ? '#7ddc7d' : frac > 0.25 ? '#ffd76a' : '#ff5d5d';
      ctx.fillRect(top.x - w / 2, top.y, w * frac, 4);
      if (e.boss) {
        ctx.font = '700 12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd76a';
        ctx.fillText(e.def.name.toUpperCase(), top.x, top.y - 6);
      }
    }
    ctx.font = '700 15px ' + FONT;
    ctx.textAlign = 'center';
    for (const n of game.fx.numbers) {
      const p = game.renderer3d.project(n.x, n.y, n.z);
      if (!p) continue;
      ctx.globalAlpha = Math.min(1, n.life * 1.8);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  _drawTopBar(game) {
    const ctx = this.ctx;
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, 1280, 46);
    ctx.fillStyle = PANEL_BORDER;
    ctx.fillRect(0, 46, 1280, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '700 19px ' + FONT;
    ctx.fillStyle = GOLD;
    ctx.fillText(`◆ ${game.gold}`, 16, 24);
    ctx.fillStyle = game.lives <= 5 ? DANGER : TEXT;
    ctx.fillText(`♥ ${game.lives}`, 150, 24);
    ctx.fillStyle = TEXT;
    ctx.fillText(`Wave ${Math.min(Math.max(game.wave, 1), CONFIG.totalWaves)}/${CONFIG.totalWaves}`, 280, 24);
    ctx.fillText(`Score ${Math.floor(game.score)}`, 430, 24);
    ctx.fillStyle = MUTED;
    ctx.font = '600 15px ' + FONT;
    ctx.fillText(`Kills ${game.kills}`, 580, 24);
    if (game.waveActive) {
      ctx.fillStyle = '#7fe7ff';
      ctx.fillText(`Enemies left ${game.enemiesAlive()}`, 690, 24);
    } else {
      ctx.fillStyle = GOOD;
      ctx.fillText('Build phase — press Space', 690, 24);
    }
    // Speed, pause and mute buttons, right side.
    const btns = [
      { label: `${game.speed}x`, kind: 'speed', x: 1040 },
      { label: 'II', kind: 'pause', x: 1112 },
      { label: game.audio.muted ? '✕' : '♪', kind: 'mute', x: 1184 },
    ];
    for (const b of btns) {
      this._region(b.x, 8, 64, 30, b.kind);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, b.x, 8, 64, 30, 6);
      ctx.fill();
      ctx.strokeStyle = PANEL_BORDER;
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.font = '700 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + 32, 24);
    }
    ctx.textAlign = 'left';
  }

  _drawBuildBar(game) {
    const ctx = this.ctx;
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 628, 1280, 92);
    ctx.fillStyle = PANEL_BORDER;
    ctx.fillRect(0, 628, 1280, 1);
    let x = 16;
    for (const type of TOWER_ORDER) {
      const def = TOWERS[type];
      const afford = game.gold >= def.cost;
      const selected = game.pendingType === type;
      this._region(x, 640, 96, 68, 'tower-card', { type });
      ctx.fillStyle = selected ? 'rgba(255, 233, 94, 0.22)' : 'rgba(255,255,255,0.06)';
      roundRect(ctx, x, 640, 96, 68, 8);
      ctx.fill();
      ctx.strokeStyle = selected ? GOLD : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
      // A tiny tower glyph: base + coloured top.
      ctx.fillStyle = '#8a7f74';
      ctx.fillRect(x + 40, 676, 16, 12);
      ctx.fillStyle = `#${def.accent.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(x + 48, 668, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = afford ? TEXT : DANGER;
      ctx.font = '700 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(def.short, x + 48, 660);
      ctx.fillText(`◆ ${def.cost}`, x + 48, 700);
      ctx.fillStyle = MUTED;
      ctx.font = '600 10px ' + FONT;
      ctx.fillText(`[${def.key}]`, x + 48, 652);
      x += 104;
    }
    // Wave preview: what the next wave brings, as coloured dots.
    const next = game.nextWavePreview();
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = '600 13px ' + FONT;
    ctx.fillText(next ? `Next: ${next.label}` : 'All waves cleared!', 648, 652);
    if (next) {
      let dx = 648;
      for (const dot of next.dots) {
        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(dx + 6, 676, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.font = '700 12px ' + FONT;
        ctx.fillText(`x${dot.count}`, dx + 16, 680);
        dx += 44;
      }
    }
    // Start Wave button.
    const canStart = !game.waveActive && game.phase === 'play';
    this._region(1000, 644, 264, 60, 'start-wave');
    ctx.fillStyle = canStart ? 'rgba(255, 215, 106, 0.9)' : 'rgba(255,255,255,0.1)';
    roundRect(ctx, 1000, 644, 264, 60, 10);
    ctx.fill();
    ctx.fillStyle = canStart ? '#1a1408' : MUTED;
    ctx.font = '800 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(canStart ? `▶  START WAVE ${game.wave + 1}` : 'WAVE RUNNING…', 1132, 676);
    ctx.textAlign = 'left';
    // Hover tooltip for the tower card under the mouse.
    const hover = this.regionAt(game.input.mouseX, game.input.mouseY);
    if (hover && hover.kind === 'tower-card') {
      const def = TOWERS[hover.type];
      ctx.fillStyle = 'rgba(8,12,20,0.92)';
      const tw = 300;
      const tx = Math.min(hover.x, 1280 - tw - 8);
      roundRect(ctx, tx, 560, tw, 60, 8);
      ctx.fill();
      ctx.strokeStyle = PANEL_BORDER;
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.font = '700 13px ' + FONT;
      ctx.fillText(`${def.name} — ◆ ${def.cost}`, tx + 12, 578);
      ctx.fillStyle = MUTED;
      ctx.font = '600 12px ' + FONT;
      ctx.fillText(def.desc, tx + 12, 598);
      ctx.fillText(`DMG ${def.damage}  ·  RNG ${def.range}  ·  ${def.rate}/s`, tx + 12, 614);
    }
  }

  _drawTowerPanel(game) {
    const ctx = this.ctx;
    const t = game.selectedTower;
    const x = 16;
    const y = 496;
    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, 320, 120, 10);
    ctx.fill();
    ctx.strokeStyle = PANEL_BORDER;
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.font = '800 17px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(t.def.name, x + 14, y + 24);
    // Level pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < t.level ? GOLD : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(x + 250 + i * 22, y + 20, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = '600 13px ' + FONT;
    ctx.fillText(`DMG ${Math.round(t.stats.damage)}   RNG ${t.stats.range.toFixed(1)}   ${t.stats.rate.toFixed(2)}/s   Kills ${t.kills}`, x + 14, y + 48);
    ctx.fillText(t.def.desc, x + 14, y + 68);
    // Upgrade and sell buttons.
    if (t.canUpgrade()) {
      const cost = upgradeCost(t.type, t.level);
      const afford = game.gold >= cost;
      this._region(x + 14, y + 80, 150, 30, 'upgrade');
      ctx.fillStyle = afford ? 'rgba(125, 220, 125, 0.85)' : 'rgba(255,255,255,0.1)';
      roundRect(ctx, x + 14, y + 80, 150, 30, 6);
      ctx.fill();
      ctx.fillStyle = afford ? '#0c1a0c' : MUTED;
      ctx.font = '700 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(`▲ Upgrade ◆ ${cost}`, x + 89, y + 99);
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = '700 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('MAX LEVEL', x + 89, y + 99);
    }
    this._region(x + 172, y + 80, 134, 30, 'sell');
    ctx.fillStyle = 'rgba(255, 93, 93, 0.8)';
    roundRect(ctx, x + 172, y + 80, 134, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px ' + FONT;
    ctx.fillText(`Sell ◆ ${t.sellValue}`, x + 239, y + 99);
    ctx.textAlign = 'left';
  }

  _drawBanner(game) {
    const ctx = this.ctx;
    if (!game.banner || game.banner.until <= game.time) return;
    const a = Math.min(1, (game.banner.until - game.time) / 0.5);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = game.banner.color || GOLD;
    ctx.font = '800 44px ' + FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillText(game.banner.text, 640, 150);
    if (game.banner.sub) {
      ctx.font = '600 19px ' + FONT;
      ctx.fillStyle = TEXT;
      ctx.fillText(game.banner.sub, 640, 182);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  _panel(title, lines, buttons) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4, 7, 14, 0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = PANEL;
    roundRect(ctx, 340, 130, 600, 460, 14);
    ctx.fill();
    ctx.strokeStyle = PANEL_BORDER;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = '800 40px ' + FONT;
    ctx.fillText(title, 640, 190);
    ctx.fillStyle = TEXT;
    ctx.font = '600 17px ' + FONT;
    let y = 232;
    for (const line of lines) {
      ctx.fillText(line, 640, y);
      y += 30;
    }
    let bx = 640 - (buttons.length * 190 + (buttons.length - 1) * 16) / 2;
    for (const b of buttons) {
      this._region(bx, 500, 190, 52, b.kind, b.data || {});
      ctx.fillStyle = b.primary ? 'rgba(255, 215, 106, 0.92)' : 'rgba(255,255,255,0.1)';
      roundRect(ctx, bx, 500, 190, 52, 10);
      ctx.fill();
      ctx.fillStyle = b.primary ? '#1a1408' : TEXT;
      ctx.font = '800 18px ' + FONT;
      ctx.fillText(b.label, bx + 95, 533);
      bx += 206;
    }
    ctx.textAlign = 'left';
  }

  _drawTitle(game) {
    const ctx = this.ctx;
    // The valley keeps living behind the title.
    ctx.fillStyle = 'rgba(4, 7, 14, 0.45)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = '800 84px ' + FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 18;
    ctx.fillText('AETHERHOLD', 640, 170);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#bfe6ff';
    ctx.font = '600 22px ' + FONT;
    ctx.fillText('A crystal bastion. Twenty waves. Hold the line.', 640, 208);
    ctx.fillStyle = TEXT;
    ctx.font = '600 16px ' + FONT;
    const how = [
      'Click a plot, pick a tower, and stop the horde before it reaches the bastion.',
      '6 towers · 3 levels each · 7 enemy types · a boss every 5 waves.',
      'Gold per kill, a wave-clear bonus, and 5% interest on gold you bank.',
      'Keys: 1–6 pick a tower · Space starts a wave · F speed · P pause · M mute',
    ];
    let y = 262;
    for (const line of how) {
      ctx.fillText(line, 640, y);
      y += 28;
    }
    // Difficulty buttons.
    for (const d of [{ v: 'normal', label: 'NORMAL', x: 430 }, { v: 'hard', label: 'HARD', x: 660 }]) {
      this._region(d.x, 400, 190, 52, 'difficulty', { value: d.v });
      const sel = game.difficulty === d.v;
      ctx.fillStyle = sel ? 'rgba(255, 215, 106, 0.92)' : 'rgba(255,255,255,0.1)';
      roundRect(ctx, d.x, 400, 190, 52, 10);
      ctx.fill();
      ctx.fillStyle = sel ? '#1a1408' : TEXT;
      ctx.font = '800 18px ' + FONT;
      ctx.fillText(d.label, d.x + 95, 433);
    }
    ctx.fillStyle = MUTED;
    ctx.font = '600 14px ' + FONT;
    ctx.fillText(game.difficulty === 'hard' ? 'Hard: enemies +35% HP, +10% speed, +15% gold' : 'Normal: the intended fight', 640, 480);
    // Start button.
    this._region(490, 510, 300, 60, 'title-start');
    ctx.fillStyle = 'rgba(255, 215, 106, 0.95)';
    roundRect(ctx, 490, 510, 300, 60, 12);
    ctx.fill();
    ctx.fillStyle = '#1a1408';
    ctx.font = '800 24px ' + FONT;
    ctx.fillText('▶  DEFEND THE BASTION', 640, 548);
    if (game.best.score > 0) {
      ctx.fillStyle = GOLD;
      ctx.font = '700 16px ' + FONT;
      ctx.fillText(`Best score ${game.best.score} — reached wave ${game.best.wave}`, 640, 606);
    }
    ctx.textAlign = 'left';
  }

  _drawPause(game) {
    this._panel('PAUSED', [
      'The horde waits. Take a breath.',
      `Wave ${game.wave}/${CONFIG.totalWaves} · Score ${Math.floor(game.score)} · Gold ◆ ${game.gold}`,
      'P or the pause button resumes. R restarts the run.',
    ], [
      { label: 'RESUME', kind: 'resume', primary: true },
      { label: 'RESTART', kind: 'restart' },
    ]);
  }

  _drawEnd(game, won) {
    this._panel(won ? 'VICTORY!' : 'THE BASTION FALLS', [
      won
        ? 'The Aether Tyrant is dust. Twenty waves held — the valley is yours.'
        : `The horde broke through on wave ${game.wave}. The crystal goes dark.`,
      `Score ${Math.floor(game.score)} · Kills ${game.kills} · Waves cleared ${game.wavesCleared}/20`,
      `Best score ${game.best.score} (wave ${game.best.wave})`,
      'R restarts a fresh run.',
    ], [
      { label: 'PLAY AGAIN', kind: 'restart', primary: true },
    ]);
  }

  _drawHelp(game) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4, 7, 14, 0.8)';
    ctx.fillRect(0, 0, 1280, 720);
    this._panel('HOW TO PLAY', [
      'Click a glowing plot, then a tower card (or press 1–6) to build.',
      'Click a tower to upgrade it (3 levels) or sell it back.',
      'Enemies follow the glowing road. Leaks cost lives; 20 lives total.',
      'Tanks shrug off weak hits. Flyers dodge half of cannon splash.',
      'Splitters pop into swarm. Healers mend their friends. Bosses every 5 waves.',
      'Bank gold between waves: it earns 5% interest on the clear bonus.',
    ], [
      { label: 'GOT IT', kind: 'close-help', primary: true },
    ]);
  }
}
