// EMBERFALL — everything the eye sees: the dark cave and its glow, the lantern,
// the shards and wisps, the HUD and every screen. Canvas 2D only, no images:
// the art direction is light against dark, warm amber against deep teal.
import { CONFIG } from './config.js';
import { clamp, lerp } from './random.js';

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._bg = null;
    // Overlay mode: the three.js diorama paints the world on the canvas
    // below, and this canvas only adds the HUD, screens, particles and
    // vignette on top of it (its background stays transparent).
    this.overlay = false;
  }

  draw(state, t) {
    const ctx = this.ctx;
    const { world, player, fx } = state;
    if (!this.overlay) {
      ctx.save();
      const off = fx.offset();
      ctx.translate(off.x, off.y);

      this._drawBackground(ctx, world, t);
      this._drawCave(ctx, world);
      this._drawShards(ctx, world, t);
      this._drawPickups(ctx, world, t);
      this._drawWisps(ctx, world, t);
      this._drawSpikes(ctx, world);
      if (player.alive || state.phase === 'play') this._drawPlayer(ctx, player, t);
      fx.draw(ctx);
      this._drawLanternLight(ctx, player, world);
      ctx.restore();
    } else {
      // Screen shake still moves the overlay a touch, so hits feel physical.
      ctx.save();
      const off = fx.offset();
      ctx.translate(off.x, off.y);
      fx.draw(ctx);
      ctx.restore();
      this._drawLanternLight(ctx, player, world);
    }

    if (state.phase === 'play' || state.phase === 'pause') this._drawHUD(ctx, state);
    if (state.surgeBanner > 0) this._drawSurgeBanner(ctx, state);
    if (state.phase === 'title') this._drawTitle(ctx, state);
    if (state.phase === 'pause') this._drawPause(ctx);
    if (state.phase === 'over') this._drawGameOver(ctx, state);
    if (state.phase === 'win') this._drawVictory(ctx, state);

    // Damage flash and the dark of a dying light.
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255, 70, 70, ${fx.flash * 0.55})`;
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    }
    if (!player.alive && state.phase === 'play') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    }
  }

  _drawBackground(ctx, world, t) {
    if (!this._bg) {
      const g = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
      g.addColorStop(0, '#071e26');
      g.addColorStop(0.55, '#04141c');
      g.addColorStop(1, '#02080d');
      this._bg = g;
    }
    ctx.fillStyle = this._bg;
    ctx.fillRect(-24, -24, CONFIG.width + 48, CONFIG.height + 48);

    // Distant rock: two parallax silhouettes that drift slower than the cave.
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer === 0 ? 0.25 : 0.5;
      const base = layer === 0 ? 950 : 760;
      ctx.fillStyle = layer === 0 ? 'rgba(16, 34, 44, 0.55)' : 'rgba(12, 26, 34, 0.8)';
      ctx.beginPath();
      ctx.moveTo(0, CONFIG.height + 24);
      for (let x = 0; x <= CONFIG.width; x += 32) {
        const y = base + Math.sin((x * 0.006 + world.scrollY * 0.0004 * speed) * 2.1 + layer * 3) * 46
          - Math.sin(x * 0.013 + layer * 7) * 22;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(CONFIG.width, CONFIG.height + 24);
      ctx.closePath();
      ctx.fill();
    }

    // Drifting dust motes, fixed by the world seed so shots are stable.
    ctx.fillStyle = 'rgba(140, 200, 220, 0.16)';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 173.3 + world.scrollY * 0.11 * (1 + (i % 3) * 0.2)) % (CONFIG.width + 40)) - 20;
      const y = ((i * 97.7 + world.scrollY * 0.05) % (CONFIG.height + 40)) - 20;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // The Heart Chamber glows gold when the dive nears its end.
    if (world.chamber) {
      const g = ctx.createRadialGradient(
        CONFIG.width / 2, CONFIG.height * 0.72, 20,
        CONFIG.width / 2, CONFIG.height * 0.72, 460,
      );
      g.addColorStop(0, 'rgba(255, 190, 80, 0.28)');
      g.addColorStop(1, 'rgba(255, 190, 80, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    }
    void t;
  }

  _drawCave(ctx, world) {
    const step = 14;
    const leftPts = [];
    const rightPts = [];
    for (let y = -step; y <= CONFIG.height + step; y += step) {
      const wy = world.scrollY + y;
      const { centre, halfGap } = world.wallsAt(wy);
      leftPts.push([centre - halfGap, y]);
      rightPts.push([centre + halfGap, y]);
    }
    // Left wall.
    ctx.beginPath();
    ctx.moveTo(-24, -24);
    ctx.lineTo(-24, CONFIG.height + 24);
    for (const [x, y] of leftPts) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = '#16222d';
    ctx.fill();
    // Right wall.
    ctx.beginPath();
    ctx.moveTo(CONFIG.width + 24, -24);
    ctx.lineTo(CONFIG.width + 24, CONFIG.height + 24);
    for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i][0], rightPts[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#141e28';
    ctx.fill();
    // Rim light along the inner edges, so the gap reads at a glance.
    ctx.strokeStyle = 'rgba(255, 176, 92, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    leftPts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110, 200, 230, 0.22)';
    ctx.beginPath();
    rightPts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  _drawShards(ctx, world, t) {
    for (const s of world.shards) {
      const y = s.y - world.scrollY;
      if (y < -30 || y > CONFIG.height + 30) continue;
      const bob = Math.sin(t * 2.4 + s.phase) * 3;
      const tw = 0.75 + 0.25 * Math.sin(t * 5 + s.phase);
      ctx.save();
      ctx.translate(s.x, y + bob);
      ctx.rotate(Math.sin(t * 1.6 + s.phase) * 0.25);
      ctx.globalAlpha = tw;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      g.addColorStop(0, 'rgba(255, 224, 130, 0.85)');
      g.addColorStop(1, 'rgba(255, 224, 130, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawPickups(ctx, world, t) {
    for (const p of world.pickups) {
      const y = p.y - world.scrollY;
      if (y < -30 || y > CONFIG.height + 30) continue;
      const bob = Math.sin(t * 2 + p.t) * 4;
      const colors = { shield: '#7be0ff', magnet: '#c792ff', slow: '#8dff9e' };
      const label = { shield: 'S', magnet: 'M', slow: '◷' };
      const c = colors[p.kind];
      ctx.save();
      ctx.translate(p.x, y + bob);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.font = '700 17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label[p.kind], 0, 1);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
  }

  _drawWisps(ctx, world, t) {
    for (const w of world.wisps) {
      const y = w.y - world.scrollY;
      if (y < -50 || y > CONFIG.height + 50) continue;
      const pulse = 1 + Math.sin(t * 3 + w.t) * 0.12;
      ctx.save();
      ctx.translate(w.x, y);
      ctx.scale(pulse, pulse);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w.r * 1.9);
      g.addColorStop(0, 'rgba(196, 120, 255, 0.75)');
      g.addColorStop(0.55, 'rgba(120, 60, 200, 0.35)');
      g.addColorStop(1, 'rgba(120, 60, 200, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, w.r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1245';
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, Math.PI * 2);
      ctx.fill();
      // Two hollow eyes: the void is watching.
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(-w.r * 0.34, -w.r * 0.15, w.r * 0.16, 0, Math.PI * 2);
      ctx.arc(w.r * 0.34, -w.r * 0.15, w.r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawSpikes(ctx, world) {
    for (const s of world.spikes) {
      const y = s.y - world.scrollY;
      if (y < -80 || y > CONFIG.height + 80) continue;
      ctx.fillStyle = '#2b3a48';
      ctx.strokeStyle = 'rgba(255, 120, 90, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (s.side < 0) {
        ctx.moveTo(s.x, y - s.w / 2);
        ctx.lineTo(s.x + s.len, y);
        ctx.lineTo(s.x, y + s.w / 2);
      } else {
        ctx.moveTo(s.x, y - s.w / 2);
        ctx.lineTo(s.x - s.len, y);
        ctx.lineTo(s.x, y + s.w / 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawPlayer(ctx, player, t) {
    const flick = 1 + Math.sin(t * 13 + player.flicker * 4) * 0.06 + Math.sin(t * 29) * 0.04;
    const blink = player.invulnerable > 0 && Math.floor(t * 14) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    ctx.translate(player.x, player.y);
    // The light the lantern throws.
    const glowR = (player.dashing ? 190 : 150) * flick;
    const g = ctx.createRadialGradient(0, 0, 8, 0, 0, glowR);
    g.addColorStop(0, 'rgba(255, 196, 92, 0.5)');
    g.addColorStop(0.5, 'rgba(255, 150, 60, 0.16)');
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    // The flame body.
    const tilt = clamp(player.vx * 0.00045, -0.35, 0.35);
    ctx.rotate(tilt);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(13, -2, 9, 10);
    ctx.quadraticCurveTo(4, 18, 0, 18);
    ctx.quadraticCurveTo(-4, 18, -9, 10);
    ctx.quadraticCurveTo(-13, -2, 0, -20);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(7, 0, 5, 8);
    ctx.quadraticCurveTo(2, 13, 0, 13);
    ctx.quadraticCurveTo(-2, 13, -5, 8);
    ctx.quadraticCurveTo(-7, 0, 0, -11);
    ctx.fill();
    // The lantern ring.
    ctx.strokeStyle = '#7a5a2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 2, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Shield ring.
    if (player.shield) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.strokeStyle = 'rgba(123, 224, 255, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawLanternLight(ctx, player) {
    // A soft vignette that follows the lantern: bright near it, dark at the
    // edges, so the cave feels lit by the player alone.
    const g = ctx.createRadialGradient(
      player.x, player.y, 120,
      player.x, player.y, 620,
    );
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  }

  _drawHUD(ctx, state) {
    const { player, world } = state;
    ctx.textBaseline = 'alphabetic';
    // Score, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '800 34px ' + FONT;
    ctx.fillText(String(Math.floor(player.score)).padStart(6, '0'), 24, 46);
    ctx.fillStyle = '#8fb8c8';
    ctx.font = '600 15px ' + FONT;
    ctx.fillText(`DEPTH ${Math.floor(world.depth)} m  ·  SHARDS ${player.shards}`, 24, 72);
    if (player.combo > 1) {
      ctx.fillStyle = '#7be0ff';
      ctx.font = '800 20px ' + FONT;
      ctx.fillText(`COMBO x${(1 + Math.min(player.combo - 1, 10) * 0.1).toFixed(1)}`, 24, 100);
    }
    // Hearts, top right.
    ctx.textAlign = 'right';
    for (let i = 0; i < CONFIG.startHearts; i++) {
      const x = CONFIG.width - 28 - i * 38;
      const y = 36;
      ctx.fillStyle = i < player.hearts ? '#ff6b6b' : 'rgba(255,107,107,0.22)';
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.bezierCurveTo(x - 13, y - 4, x - 6, y - 14, x, y - 5);
      ctx.bezierCurveTo(x + 6, y - 14, x + 13, y - 4, x, y + 8);
      ctx.fill();
    }
    // Energy bar, top centre.
    const bw = 300;
    const bx = (CONFIG.width - bw) / 2;
    const by = 22;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    roundRect(ctx, bx - 3, by - 3, bw + 6, 20, 10);
    ctx.fill();
    const eg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    eg.addColorStop(0, '#ffb347');
    eg.addColorStop(1, '#ffd76a');
    ctx.fillStyle = eg;
    if (player.energy > 0) {
      roundRect(ctx, bx, by, (bw * player.energy) / 100, 14, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('LIGHT', bx + bw / 2, by + 11);
    // Depth meter, right edge: surface at the top, the Heart at the bottom.
    const mx = CONFIG.width - 14;
    const my0 = 110;
    const my1 = 640;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(mx - 3, my0, 6, my1 - my0);
    const frac = clamp(world.depth / CONFIG.winDepth, 0, 1);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(mx - 3, my0, 6, (my1 - my0) * frac);
    ctx.fillStyle = '#8fb8c8';
    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'right';
    for (const m of [250, 500, 750]) {
      const y = my0 + ((my1 - my0) * m) / CONFIG.winDepth;
      ctx.fillText(`${m}m`, mx - 12, y + 4);
    }
    ctx.fillStyle = '#ffd76a';
    ctx.font = '800 13px ' + FONT;
    ctx.fillText('♥ 1000m', mx - 12, my1 + 20);
    // Active effects.
    ctx.textAlign = 'left';
    ctx.font = '700 15px ' + FONT;
    let ey = 128;
    if (player.shield) {
      ctx.fillStyle = '#7be0ff';
      ctx.fillText('◈ SHIELD', 24, ey);
      ey += 22;
    }
    if (player.magnet) {
      ctx.fillStyle = '#c792ff';
      ctx.fillText(`◈ MAGNET ${Math.ceil(player.magnetTimer)}s`, 24, ey);
      ey += 22;
    }
    if (world.slowTimer > 0) {
      ctx.fillStyle = '#8dff9e';
      ctx.fillText(`◈ SLOW ${Math.ceil(world.slowTimer)}s`, 24, ey);
    }
  }

  _drawSurgeBanner(ctx, state) {
    const a = clamp(state.surgeBanner, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9a5c';
    ctx.font = '800 30px ' + FONT;
    ctx.fillText('⚠ SURGE — THE DEEP QUICKENS ⚠', CONFIG.width / 2, 150);
    ctx.restore();
  }

  _panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(2, 10, 14, 0.82)';
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.45)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();
  }

  _drawTitle(ctx, state) {
    ctx.fillStyle = 'rgba(2, 8, 12, 0.45)';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    this._panel(ctx, 300, 108, 680, 500);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = '800 64px ' + FONT;
    ctx.fillText('EMBERFALL', CONFIG.width / 2, 196);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '600 22px ' + FONT;
    ctx.fillText('Dive of the Last Lantern', CONFIG.width / 2, 232);
    ctx.fillStyle = '#bfe3ef';
    ctx.font = '400 18px ' + FONT;
    ctx.fillText('Carry your light 1000 metres down to the Heart Chamber.', CONFIG.width / 2, 282);
    ctx.fillText('Shards feed your flame. Rock and wisps break it.', CONFIG.width / 2, 310);
    ctx.fillStyle = '#8fb8c8';
    ctx.font = '400 17px ' + FONT;
    ctx.fillText('MOUSE or WASD / ARROWS — steer      SPACE or CLICK — flare dash', CONFIG.width / 2, 362);
    ctx.fillText('P — pause      M — mute      R — restart', CONFIG.width / 2, 390);
    if (state.best.score > 0 || state.best.depth > 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.font = '700 19px ' + FONT;
      ctx.fillText(`BEST  ${state.best.score.toLocaleString()} pts  ·  ${state.best.depth} m`, CONFIG.width / 2, 438);
    }
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffb347';
    ctx.font = '800 26px ' + FONT;
    ctx.fillText('— CLICK OR PRESS ENTER TO DIVE —', CONFIG.width / 2, 508);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#7d9aa8';
    ctx.font = '400 14px ' + FONT;
    ctx.fillText('A complete game: dive, collect, survive, reach the Heart.', CONFIG.width / 2, 570);
  }

  _drawPause(ctx) {
    ctx.fillStyle = 'rgba(2, 8, 12, 0.6)';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    this._panel(ctx, 440, 260, 400, 200);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '800 40px ' + FONT;
    ctx.fillText('PAUSED', CONFIG.width / 2, 330);
    ctx.fillStyle = '#bfe3ef';
    ctx.font = '400 18px ' + FONT;
    ctx.fillText('P or Esc to keep diving · R to restart', CONFIG.width / 2, 380);
    ctx.fillText('M to mute', CONFIG.width / 2, 410);
  }

  _statsLines(state) {
    const p = state.player;
    return [
      `SCORE  ${Math.floor(p.score).toLocaleString()}`,
      `DEPTH  ${Math.floor(state.world.depth)} m of 1000 m`,
      `SHARDS  ${p.shards}   ·   BEST COMBO  x${(1 + Math.min(p.maxCombo - 1, 10) * 0.1).toFixed(1)}`,
      `TIME  ${Math.floor(state.elapsed)} s`,
    ];
  }

  _drawGameOver(ctx, state) {
    ctx.fillStyle = 'rgba(8, 2, 2, 0.55)';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    this._panel(ctx, 340, 140, 600, 440);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '800 52px ' + FONT;
    ctx.fillText(state.endReason === 'starved' ? 'THE LIGHT DIED' : 'SHATTERED', CONFIG.width / 2, 216);
    ctx.fillStyle = '#bfe3ef';
    ctx.font = '400 19px ' + FONT;
    ctx.fillText(
      state.endReason === 'starved'
        ? 'Your flame ran out of light in the dark.'
        : 'The cave broke your lantern.',
      CONFIG.width / 2, 256,
    );
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 21px ' + FONT;
    this._statsLines(state).forEach((line, i) => {
      ctx.fillText(line, CONFIG.width / 2, 312 + i * 34);
    });
    ctx.fillStyle = '#7d9aa8';
    ctx.font = '400 16px ' + FONT;
    ctx.fillText(`Best dive: ${state.best.score.toLocaleString()} pts · ${state.best.depth} m`, CONFIG.width / 2, 470);
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffb347';
    ctx.font = '800 24px ' + FONT;
    ctx.fillText('— PRESS R OR CLICK TO DIVE AGAIN —', CONFIG.width / 2, 528);
    ctx.globalAlpha = 1;
  }

  _drawVictory(ctx, state) {
    ctx.fillStyle = 'rgba(20, 12, 0, 0.45)';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    this._panel(ctx, 340, 120, 600, 470);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = '800 52px ' + FONT;
    ctx.fillText('THE HEART LIT!', CONFIG.width / 2, 196);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '400 20px ' + FONT;
    ctx.fillText('You carried the last lantern 1000 metres down', CONFIG.width / 2, 238);
    ctx.fillText('and woke the Heart Chamber. The deep is lit again.', CONFIG.width / 2, 266);
    ctx.fillStyle = '#fff6cf';
    ctx.font = '700 21px ' + FONT;
    this._statsLines(state).forEach((line, i) => {
      ctx.fillText(line, CONFIG.width / 2, 322 + i * 34);
    });
    ctx.fillStyle = '#7d9aa8';
    ctx.font = '400 16px ' + FONT;
    ctx.fillText(`Best dive: ${state.best.score.toLocaleString()} pts · ${state.best.depth} m`, CONFIG.width / 2, 480);
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffb347';
    ctx.font = '800 24px ' + FONT;
    ctx.fillText('— PRESS R OR CLICK TO DIVE AGAIN —', CONFIG.width / 2, 540);
    ctx.globalAlpha = 1;
  }
}
