// AETHERHOLD — every number the game is balanced on, in one place.
// Towers, enemies, bosses, waves and the economy all read from here, so a
// tweak here retunes the whole defense without touching the systems.
export const CONFIG = {
  // Canvas (logical pixels; the renderer letterboxes to the window).
  width: 1280,
  height: 720,

  // The map, in world units. The ground is 64 wide, 42 deep; the path is a
  // serpentine from the west gate to the bastion in the east.
  mapWidth: 64,
  mapDepth: 42,
  pathWidth: 2.6,
  plotClearance: 3.6, // plots stay this far from the path centre line

  // The run.
  startGold: 220,
  startGoldHard: 200,
  startLives: 20,
  totalWaves: 20,
  waveBonusBase: 20, // gold for clearing a wave: base + 5 * wave
  waveBonusPerWave: 5,
  interestRate: 0.05, // gold earned on banked gold at wave clear
  interestCap: 25,
  sellRefund: 0.7, // share of invested gold a sold tower returns
  scorePerKill: 10, // + wave number
  scorePerWaveClear: 100, // x wave number

  // Enemy health growth: base hp * growth ^ (wave - 1).
  hpGrowth: 1.17,
  hpGrowthHard: 1.2,
  speedGrowth: 1.012, // per wave, capped below

  // Tower upgrade: each level multiplies damage, adds range, speeds fire.
  upgradeDamage: 1.6,
  upgradeRange: 0.8,
  upgradeRate: 1.12,
  upgradeCostFactor: 0.8, // of base cost, times the level being bought
};

// Six tower types. damage is per hit (laser is per second), rate is shots
// per second, range is world units, splash is the blast radius (0 = none),
// slow is the fraction of speed removed and slowTime how long it lasts,
// chain is how many extra targets a tesla arc jumps to.
export const TOWERS = {
  arrow: {
    name: 'Arrow Spire', short: 'Arrow', key: '1', cost: 50,
    damage: 7, rate: 1.4, range: 7, splash: 0, slow: 0, slowTime: 0, chain: 0,
    color: 0x8a5a2b, accent: 0xffd27a,
    desc: 'Fast wooden spire. Cheap, quick shots, no tricks.',
  },
  cannon: {
    name: 'Cannon Mortar', short: 'Cannon', key: '2', cost: 110,
    damage: 26, rate: 0.6, range: 6.5, splash: 1.9, slow: 0, slowTime: 0, chain: 0,
    color: 0x3d4450, accent: 0xff9a3d,
    desc: 'Lobs shells that burst and hurt everything nearby.',
  },
  frost: {
    name: 'Frost Obelisk', short: 'Frost', key: '3', cost: 80,
    damage: 2, rate: 1.0, range: 6, splash: 0, slow: 0.45, slowTime: 1.6, chain: 0,
    color: 0x9fd8ff, accent: 0x7fe7ff,
    desc: 'Chills enemies to 55% speed. Barely hurts, always helps.',
  },
  sniper: {
    name: 'Sniper Lens', short: 'Sniper', key: '4', cost: 150,
    damage: 70, rate: 0.35, range: 13, splash: 0, slow: 0, slowTime: 0, chain: 0,
    color: 0x5a6b7d, accent: 0xbfe6ff,
    desc: 'One huge shot from far away. Slow, but it deletes tanks.',
  },
  tesla: {
    name: 'Tesla Coil', short: 'Tesla', key: '5', cost: 170,
    damage: 16, rate: 0.8, range: 7, splash: 0, slow: 0, slowTime: 0, chain: 3,
    color: 0x6b5a8a, accent: 0xd9a7ff,
    desc: 'Lightning that chains to nearby enemies. Swarm killer.',
  },
  laser: {
    name: 'Solar Lance', short: 'Laser', key: '6', cost: 190,
    damage: 22, rate: 1, range: 8, splash: 0, slow: 0, slowTime: 0, chain: 0,
    color: 0xc9a227, accent: 0xffe95e,
    desc: 'A burning beam that never misses while it holds a target.',
  },
};

export const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'sniper', 'tesla', 'laser'];

// Enemy types. hp is the wave-1 base, speed is world units per second,
// gold is the bounty, lives is what leaks through the bastion cost, armor
// is flat damage shaved off every hit (minimum 1), fly means it hovers
// above the path and takes half splash damage.
export const ENEMIES = {
  runner: {
    name: 'Runner', hp: 26, speed: 3.4, gold: 4, lives: 1, armor: 0, fly: false,
    color: 0xe07b39, scale: 0.8, desc: 'Quick and fragile.',
  },
  grunt: {
    name: 'Grunt', hp: 55, speed: 2.2, gold: 6, lives: 1, armor: 0, fly: false,
    color: 0x7d9b6a, scale: 1.0, desc: 'The common horde.',
  },
  tank: {
    name: 'Tank', hp: 170, speed: 1.3, gold: 12, lives: 2, armor: 3, fly: false,
    color: 0x5c6672, scale: 1.35, desc: 'Armored shell. Shrugs off weak hits.',
  },
  swarm: {
    name: 'Swarm', hp: 14, speed: 3.0, gold: 2, lives: 1, armor: 0, fly: false,
    color: 0xd94f4f, scale: 0.55, desc: 'Tiny, many, and everywhere at once.',
  },
  flyer: {
    name: 'Flyer', hp: 40, speed: 3.8, gold: 7, lives: 1, armor: 0, fly: true,
    color: 0x9a6bd9, scale: 0.85, desc: 'Wings over the path. Half splash damage.',
  },
  splitter: {
    name: 'Splitter', hp: 60, speed: 2.4, gold: 8, lives: 1, armor: 0, fly: false,
    color: 0x3fa8a0, scale: 1.05, desc: 'Pops into two swarm on death.',
  },
  healer: {
    name: 'Healer', hp: 70, speed: 2.0, gold: 10, lives: 1, armor: 0, fly: false,
    color: 0x7ddc7d, scale: 1.0, desc: 'Mends nearby allies 6 hp a second.',
  },
};

// One boss every five waves. hp is the base before wave scaling, regen is
// hp per second, aura slows nearby towers' fire by auraSlow (0 = none).
export const BOSSES = {
  5: {
    name: 'Stone Golem', hp: 950, speed: 1.1, gold: 150, lives: 5,
    color: 0x8a7f74, scale: 2.6, regen: 0, auraSlow: 0,
    desc: 'A walking boulder. Nothing fancy, just very hard to stop.',
  },
  10: {
    name: 'Storm Drake', hp: 2600, speed: 1.6, gold: 250, lives: 5,
    color: 0x5a7bd9, scale: 2.8, regen: 8, auraSlow: 0, fly: true,
    desc: 'Wings over the valley, knitting its wounds shut.',
  },
  15: {
    name: 'Void Colossus', hp: 5600, speed: 1.0, gold: 400, lives: 8,
    color: 0x3d2b5c, scale: 3.2, regen: 15, auraSlow: 0.25,
    desc: 'Its presence drags nearby towers to three-quarter fire rate.',
  },
  20: {
    name: 'Aether Tyrant', hp: 10000, speed: 1.35, gold: 600, lives: 10,
    color: 0xc23b3b, scale: 3.6, regen: 25, auraSlow: 0.2, fly: false,
    desc: 'The last tyrant. Kill it and the bastion stands.',
  },
};

// Which enemies a wave may draw from, by wave number.
export function unlockedTypes(wave) {
  const types = ['grunt', 'runner'];
  if (wave >= 2) types.push('swarm');
  if (wave >= 3) types.push('tank');
  if (wave >= 4) types.push('flyer');
  if (wave >= 6) types.push('splitter');
  if (wave >= 7) types.push('healer');
  return types;
}
