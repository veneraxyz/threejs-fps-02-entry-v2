// DUSTFALL II — the tuning table. Every number the sim reads lives in
// this one file, grouped by system. Times are seconds, distances metres,
// money dollars, angles radians. The rifle stays the workhorse, the SMG
// wins up close, and the two new guns — the Dune-12 shotgun and the
// Longbow-7 sniper — are priced and tuned as situational picks, not
// upgrades.

// ---- simulation ----------------------------------------------------------

export const TICK = 1 / 60; // fixed simulation step (60 Hz)
export const MATCH_WIN_ROUNDS = 8; // first to 8 takes the match
export const FREEZE_TIME = 10; // buy phase at the start of every round
export const ROUND_TIME = 105; // live round length
export const BOMB_FUSE = 40; // seconds from plant to detonation
export const PLANT_TIME = 3; // channel to plant the bomb
export const DEFUSE_TIME = 5; // channel to defuse it
export const ROUND_END_TIME = 5; // banner + MVP before the next round

// ---- economy -------------------------------------------------------------

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  loss: 1400,
  lossStreakBonus: 500,
  maxLossBonus: 2900,
  plant: 300,
  defuse: 300,
  assist: 100,
  pistolAmmo: 200,
};

// ---- the player body -----------------------------------------------------

export const PLAYER = {
  radius: 0.35,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  height: 1.8,
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  scopedSpeed: 2.2,
  accel: 42,
  friction: 9,
  airAccel: 8,
  jumpSpeed: 5.4,
  gravity: 14.5,
  health: 100,
};

// ---- bots ----------------------------------------------------------------

export const BOT = {
  radius: 0.35,
  walkSpeed: 4.1,
  runSpeed: 5.0,
  eyeHeight: 1.55,
  health: 100,
  viewDistance: 46,
  viewHalfAngle: 1.05, // ~60 degree half cone
  hearRadius: 28,
  footstepRadius: 9,
  burstMin: 2,
  burstMax: 4,
  burstGap: 0.55,
  shotGap: 0.13,
  baseSpread: 0.028,
  strafePeriod: 0.9,
  retreatHealth: 35, // fall back below this health when outnumbered
  flankChance: 0.45,
  rotateDelay: 2.5,
};

// ---- weapons -------------------------------------------------------------
// damage is per body hit (shotgun: per pellet); head multiplies it.
// spread is the base cone half-angle; movement and bloom grow it.
// kick is the viewmodel + camera kick per shot; recoil is the pitch added.

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 1, price: 0,
    damage: 34, headMult: 2.0, mag: 12, reserve: 48, auto: false,
    fireInterval: 0.18, reloadTime: 1.6, spread: 0.011, moveSpread: 0.05,
    bloom: 0.006, bloomMax: 0.03, recoil: 0.011, kick: 0.35, range: 60, pellets: 1,
    blurb: 'Reliable sidearm. Free, accurate, twelve rounds.',
  },
  rifle: {
    id: 'rifle', name: 'VK-47', slot: 2, price: 2700,
    damage: 36, headMult: 2.5, mag: 30, reserve: 90, auto: true,
    fireInterval: 0.1, reloadTime: 2.4, spread: 0.014, moveSpread: 0.075,
    bloom: 0.004, bloomMax: 0.045, recoil: 0.016, kick: 0.55, range: 80, pellets: 1,
    blurb: 'The workhorse. Full-auto, hard-hitting at any range.',
  },
  smg: {
    id: 'smg', name: 'Kestrel-9', slot: 3, price: 1500,
    damage: 26, headMult: 2.0, mag: 32, reserve: 96, auto: true,
    fireInterval: 0.07, reloadTime: 2.0, spread: 0.019, moveSpread: 0.055,
    bloom: 0.003, bloomMax: 0.05, recoil: 0.01, kick: 0.4, range: 50, pellets: 1,
    blurb: 'Fast fire, light recoil. Owns close quarters.',
  },
  shotgun: {
    id: 'shotgun', name: 'Dune-12', slot: 4, price: 1900,
    damage: 11, headMult: 1.5, mag: 6, reserve: 24, auto: false,
    fireInterval: 0.95, reloadTime: 2.8, spread: 0.075, moveSpread: 0.09,
    bloom: 0.01, bloomMax: 0.06, recoil: 0.045, kick: 1.4, range: 28, pellets: 8,
    blurb: 'Eight pellets a shell. Devastating close, useless far.',
  },
  sniper: {
    id: 'sniper', name: 'Longbow-7', slot: 5, price: 4200,
    damage: 110, headMult: 3.0, mag: 5, reserve: 15, auto: false,
    fireInterval: 1.6, reloadTime: 3.2, spread: 0.08, moveSpread: 0.16,
    bloom: 0.02, bloomMax: 0.08, recoil: 0.06, kick: 1.8, range: 120, pellets: 1,
    scopedSpread: 0.002, // near-perfect when scoped and still
    blurb: 'One shot, one kill — but only scoped and standing still.',
  },
};

// Buy order in the menu, grouped by role.
export const BUY_ORDER = ['rifle', 'smg', 'shotgun', 'sniper'];

// ---- grenades ------------------------------------------------------------

export const GRENADES = {
  he: {
    id: 'he', name: 'HE Grenade', price: 300,
    fuse: 1.5, radius: 6.5, maxDamage: 120,
    blurb: 'Blast radius 6.5 m. Clears corners.',
  },
  smoke: {
    id: 'smoke', name: 'Smoke Grenade', price: 350,
    fuse: 1.5, radius: 3.4, duration: 12,
    blurb: 'Blocks sight for 12 s. Cross lanes safely.',
  },
  flash: {
    id: 'flash', name: 'Flashbang', price: 250,
    fuse: 1.4, radius: 12, maxBlind: 2.6,
    blurb: 'Blinds anyone looking at it. Pop and push.',
  },
};

export const GRENADE_PHYSICS = {
  throwSpeed: 13,
  upSpeed: 4.5,
  bounce: 0.45,
  gravity: 14.5,
  maxCarried: 3, // total grenades across all types
};

export const SMOKE = {
  radius: 3.4,
  duration: 12,
  // A smoke cloud is a sphere: sight through it is blocked when the eye
  // line passes within this fraction of its radius.
  blockFraction: 0.85,
};

export const FLASH = {
  radius: 12,
  maxBlind: 2.6, // seconds of full blindness at point blank
  facingFactor: 0.35, // blindness when facing away from the pop
};

// ---- teams ---------------------------------------------------------------

export const TEAMS = {
  vanguard: { name: 'Vanguard', color: 0x3d8fd1, label: 'ATK', short: 'VAN' },
  sentinel: { name: 'Sentinels', color: 0xd95f33, label: 'DEF', short: 'SEN' },
};

// ---- scoring (round MVP) -------------------------------------------------

export const MVP = {
  perKill: 100,
  perDamage: 1, // one point per damage dealt
  perPlant: 150,
  perDefuse: 150,
  perAssist: 40,
};
