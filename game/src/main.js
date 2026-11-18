// AETHERHOLD — the boot: one Game wired to the page, a requestAnimationFrame
// loop with a clamped delta (run at the chosen speed by stepping more than
// once a frame), and the deterministic screenshot scenes. The loop never
// touches the wall clock for logic: shots drive step() at fixed 1/60 s steps.
import { Game } from './game.js';
import { applyShot, shotFromUrl } from './shots.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__aetherhold = game;

const shot = shotFromUrl();
if (shot) {
  // A screenshot scene: drive it deterministically, render once, stop.
  applyShot(game, shot.shot, shot.seed);
} else {
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    // Speed 2x/3x steps the simulation two or three times per frame.
    for (let i = 0; i < game.speed; i++) game.step(dt);
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__shotReady = true;
}
