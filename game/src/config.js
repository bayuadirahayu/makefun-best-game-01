// EMBERFALL — tuning constants. One place for every number the game is balanced on,
// so a tweak here retunes the whole dive without touching the systems.
export const CONFIG = {
  // Canvas (logical pixels; the renderer scales to the window).
  width: 1280,
  height: 720,

  // The dive.
  winDepth: 1000, // metres to the Heart Chamber: reaching it wins the game.
  baseScroll: 95, // px/s the cave scrolls at the surface.
  maxScroll: 265, // px/s at the deepest dark.
  surgeEvery: 250, // metres between surges.
  surgeLength: 8, // seconds a surge lasts.
  surgeBoost: 1.45, // scroll multiplier during a surge.

  // The lantern.
  playerRadius: 15,
  playerAccel: 2600, // px/s^2 toward the steering target.
  playerMaxSpeed: 430,
  playerDamping: 3.2, // velocity decay per second.
  startHearts: 3,
  startEnergy: 100,
  energyDrain: 1.15, // per second, plus depth tax.
  energyDepthTax: 0.9, // extra drain at full depth.
  shardEnergy: 7, // energy a shard restores.
  dashCost: 8, // energy a flare dash spends.
  dashSpeed: 760, // burst speed while dashing.
  dashTime: 0.32, // seconds of dash.
  dashCooldown: 1.15, // seconds between dashes.
  invulnerableTime: 1.4, // seconds of grace after a hit.

  // Scoring.
  shardScore: 25,
  depthScore: 10, // points per metre dived.
  comboWindow: 2.5, // seconds to keep a shard streak alive.
  comboStep: 0.1, // +10% per streak step, capped below.

  // The cave.
  wallGapStart: 760, // px of open water at the surface.
  wallGapEnd: 470, // px at the deepest dark.
  wallWobble: 150, // px the cave centre sways.
  spikeChance: 0.34, // per row of cave.
  spikeMaxLen: 92,
  wispChance: 0.16,
  shardRowChance: 0.72,
  pickupChance: 0.05, // shield / magnet / slow per row.

  // Feel.
  shakeOnHit: 14,
  shakeOnDash: 3,
  trailRate: 0.016, // seconds between ember trail puffs.
};
