// EMBERFALL — deterministic shot scenes for the entry's screenshots:
//   ?shot=start&seed=n  the title screen over a living cave
//   ?shot=play&seed=n   mid-dive, HUD, shards and a dash, after 6 s of scripted play
//   ?shot=surge&seed=n  a surge at 260 m: faster, denser, banner up
//   ?shot=win&seed=n    the victory screen after reaching the Heart Chamber
//   ?shot=end&seed=n    the game-over screen after a shattering hit
// Every scene is driven by fixed 1/60 s steps from one seed, never the wall
// clock, so the same URL always renders the same frame. When the scene is
// drawn, window.__shotReady is set for the screenshot tool.
import { CONFIG } from './config.js';

const STEP = 1 / 60;

function scriptedDive(game, seconds, seed, dashAtStep) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    // Follow the cave's own centre line, weaving a little: the scripted
    // lantern dives the safe path instead of wandering into the rock.
    const wy = game.world.scrollY + game.player.y;
    const { centre } = game.world.wallsAt(wy);
    game.input.mouseX = centre + Math.sin(t * 0.9 + seed) * 120;
    game.input.mouseY = CONFIG.height * 0.55 + Math.sin(t * 0.55) * 70;
    if (dashAtStep !== undefined && i === dashAtStep) game.input.dashQueued = true;
    game.step(STEP);
    if (game.phase !== 'play') break;
  }
}

export function applyShot(game, name, seed) {
  if (name === 'start') {
    game.reset(seed);
    // Pre-scroll so the title sits over a cave already alive with shards.
    game.world.scrollY = 900;
    game.world.depth = 30;
    game.world.nextRowY = 1140;
    for (let i = 0; i < 120; i++) game.world.update(STEP, game.player);
    game.phase = 'title';
  } else if (name === 'play') {
    game.reset(seed);
    game.startRun();
    scriptedDive(game, 6, seed, 210); // one flare dash for drama
    game.phase = 'play';
  } else if (name === 'surge') {
    game.reset(seed);
    // Drop the lantern straight into a surge at 260 m.
    game.world.scrollY = 252 * 30;
    game.world.depth = 252;
    game.world.nextSurgeDepth = 250;
    game.world.nextRowY = game.world.scrollY + 200;
    game.startRun();
    scriptedDive(game, 5, seed); // no dash here: the surge gap is narrow
    game.phase = 'play';
  } else if (name === 'win') {
    game.reset(seed);
    game.startRun();
    // A finished dive: the numbers of a real winning run, then the win screen.
    game.player.score = 14820;
    game.player.shards = 214;
    game.player.maxCombo = 14;
    game.world.depth = CONFIG.winDepth;
    game.world.scrollY = CONFIG.winDepth * 30;
    game.elapsed = 212;
    game.winGame();
  } else if (name === 'end') {
    game.reset(seed);
    game.startRun();
    // A dive cut short: the numbers of a real run, then the game-over screen.
    game.player.score = 5230;
    game.player.shards = 96;
    game.player.maxCombo = 9;
    game.world.depth = 487;
    game.world.scrollY = 487 * 30;
    game.elapsed = 96;
    game.endGame('shattered');
  } else {
    game.reset(seed);
    game.phase = 'title';
  }
  game.render();
  window.__shotReady = true;
}

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = Number(q.get('seed') || '1') || 1;
  return { shot, seed };
}
