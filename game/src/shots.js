// AETHERHOLD — deterministic shot scenes for the entry's screenshots:
//   ?shot=title&seed=n  the title screen over a living valley
//   ?shot=play&seed=n   mid-wave 8: towers firing, HUD, range ring, panel
//   ?shot=boss&seed=n   wave 10 boss, the Storm Drake, warning banner up
//   ?shot=win&seed=n    the victory screen after all twenty waves
// Every scene is driven by fixed 1/60 s steps from one seed, never the wall
// clock, so the same URL always renders the same frame. When the scene is
// drawn, window.__shotReady is set for the screenshot tool.
import { Enemy } from './enemies.js';

const STEP = 1 / 60;

// A row of towers on spread-out plots, as a real player would build them.
function buildBase(game, plan) {
  game.gold = 99999;
  for (const [plotIndex, type, upgrades] of plan) {
    const plot = game.world.plots[plotIndex];
    if (!plot) continue;
    game.selectedPlot = plot;
    if (!game.tryPlace(type, plot)) continue;
    for (let i = 0; i < upgrades; i++) game.tryUpgrade();
  }
  game.selectedTower = null;
  game.selectedPlot = null;
}

function stepFor(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) game.step(STEP);
}

export function applyShot(game, name, seed) {
  if (name === 'title') {
    game.reset(seed);
    buildBase(game, [[2, 'arrow', 0], [5, 'cannon', 0], [8, 'frost', 0], [11, 'tesla', 0]]);
    // A few enemies already marching, for a valley that feels alive.
    const ctx = {
      enemies: game.enemies, rand: game.rand,
      onKill: () => {}, onLeak: () => {}, spawnExtra: () => {},
    };
    const march = [['grunt', 8], ['runner', 15], ['grunt', 22], ['tank', 30], ['flyer', 38]];
    for (const [type, dist] of march) {
      const e = new Enemy(type, 3, false, game.world);
      e.distance = dist;
      e.update(0, ctx);
      game.enemies.push(e);
    }
    game.time = 6;
    game.render();
  } else if (name === 'play') {
    game.reset(seed);
    game.phase = 'play';
    buildBase(game, [
      [1, 'arrow', 1], [3, 'cannon', 1], [5, 'frost', 0], [7, 'sniper', 0],
      [9, 'tesla', 1], [11, 'laser', 0], [13, 'arrow', 2],
    ]);
    game.wave = 7;
    game.startWave(); // wave 8: tanks, flyers, splitters in the mix
    stepFor(game, 14);
    // Show the range ring and the tower panel on a tesla mid-fight.
    game.selectedTower = game.towers.find((t) => t.type === 'tesla') || game.towers[0];
    game.render();
  } else if (name === 'boss') {
    game.reset(seed);
    game.phase = 'play';
    buildBase(game, [
      [1, 'arrow', 2], [3, 'cannon', 2], [5, 'frost', 1], [7, 'sniper', 1],
      [9, 'tesla', 2], [11, 'laser', 1], [13, 'cannon', 1], [14, 'arrow', 1],
    ]);
    game.wave = 9;
    game.startWave(); // wave 10: the Storm Drake
    stepFor(game, 22);
    game.setBanner('WAVE 10 — STORM DRAKE', 'A boss marches on the bastion!', '#ff5d5d', 3.4);
    game.render();
  } else if (name === 'win') {
    game.reset(seed);
    game.phase = 'play';
    buildBase(game, [[2, 'arrow', 2], [5, 'cannon', 2], [8, 'tesla', 2], [11, 'laser', 2]]);
    // A finished campaign: the numbers of a real winning run, then the screen.
    game.score = 24860;
    game.kills = 342;
    game.wavesCleared = 20;
    game.wave = 20;
    game.gold = 1234;
    game.lives = 14;
    game.winGame();
    game.render();
  } else {
    game.reset(seed);
    game.render();
  }
  window.__shotReady = true;
}

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = Number(q.get('seed') || '1') || 1;
  return { shot, seed };
}
