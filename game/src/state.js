// DUSTFALL II — the single state object. Every module reads and writes
// this one object; nothing keeps a second copy of a value the sim owns.
// The renderer reads it too, but only the sim (fixed step) mutates it.
// New in v2: grenades by type, smoke clouds, flash blindness, round MVP
// stats, hit-direction events, the sniper scope, and the team tactics
// block that brains.js and tactics.js share.

import { ECONOMY, PLAYER, WEAPONS } from './tuning.js';
import { SPAWNS } from './yard.js';

export const PHASE = {
  MENU: 'menu', // start screen, pointer unlocked
  FREEZE: 'freeze', // buy phase, players locked in spawn
  LIVE: 'live', // round in progress
  ROUND_END: 'roundEnd', // banner + MVP, then next round
  MATCH_END: 'matchEnd', // final screen
};

export const BOT_NAMES = {
  vanguard: ['Rook', 'Sable'],
  sentinel: ['Kestrel', 'Havoc', 'Nomad', 'Vex'],
};

export function freshLoadout() {
  return {
    weapons: {
      pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    },
    current: 'pistol',
    lastWeapon: 'pistol', // Q swaps back to this
    // Grenades by type: each bought grenade adds one of its kind.
    grenades: { he: 0, smoke: 0, flash: 0 },
    grenadeSelected: 'he', // the type G throws next
    reloading: 0,
    fireCooldown: 0,
    bloom: 0,
    recoilPitch: 0,
    lastShotAt: -10,
    scoped: false, // sniper scope engaged
  };
}

export function grenadeCount(loadout) {
  return loadout.grenades.he + loadout.grenades.smoke + loadout.grenades.flash;
}

export function freshAgent(id, name, team, spawn) {
  return {
    id,
    name,
    team,
    alive: true,
    health: PLAYER.health,
    x: spawn.x,
    z: spawn.z,
    y: 0, // feet height above the ground underfoot (jump + deck)
    vy: 0,
    vx: 0,
    vz: 0,
    yaw: spawn.yaw,
    pitch: 0,
    crouch: false,
    moving: false,
    scoped: false,
    blindUntil: 0, // flashbang blindness ends at this sim time
    loadout: freshLoadout(),
    stats: { kills: 0, deaths: 0, damage: 0, assists: 0, plants: 0, defuses: 0 },
    lastDamagedBy: null,
    bot: null,
  };
}

export function freshBotState(role) {
  return {
    role, // 'siteA' | 'siteB' | 'overlook' | 'mid' | 'attackA' | 'attackB' | 'attackService' | 'roam'
    mode: 'move', // move | hold | engage | investigate | defuse | flank | retreat | stage | execute | rotate
    path: [],
    pathIndex: 0,
    holdUntil: 0,
    targetId: null,
    seenAt: -10, // last time the bot saw its target
    firstSeenAt: -10, // when the bot first saw its current target
    aimError: 0.05,
    burstLeft: 0,
    nextShotAt: 0,
    lastKnown: null, // {x, z} last known enemy position
    strafeDir: 1,
    strafeAt: 0,
    channelAt: -1, // defuse channel start time
    flankSite: null, // the site this bot is flanking toward
    retreatUntil: 0, // falling back until this sim time
    stagedAt: -1, // when the bot reached the execute staging point
    threwGrenade: false, // one tactical grenade per round
    rotateSite: null, // the site this defender is rotating to
    holdFire: false, // demo hook: freeze in place, never engage
  };
}

export function createState() {
  return {
    phase: PHASE.MENU,
    time: 0, // sim clock, seconds since match start
    round: 1,
    score: { vanguard: 0, sentinel: 0 },
    lossStreak: 0,
    money: ECONOMY.start,
    freezeLeft: 0,
    roundLeft: 0,
    roundEndLeft: 0,
    roundWinner: null,
    roundReason: '',
    roundMvp: null, // {name, team, kills, damage, line} for the banner
    player: freshAgent('you', 'You', 'vanguard', SPAWNS.vanguard[0]),
    agents: [], // bots (allies + enemies); the player is separate
    grenades: [], // live thrown grenades in flight
    smokes: [], // active smoke clouds {x, y, z, r, until}
    bomb: {
      state: 'carried', // carried | planted | exploded | defused
      site: null,
      x: 0,
      z: 0,
      fuseLeft: 0,
      plantProgress: 0,
      defuseProgress: 0,
      defuserId: null,
    },
    plantChannel: 0, // player plant progress 0..1
    feed: [], // kill feed entries {text, at, good}
    noises: [], // gunshot sounds bots can hear {x, z, at, team, loud}
    shake: 0, // camera shake magnitude
    flash: 0, // damage flash 0..1
    whiteout: 0, // flashbang whiteout 0..1 (player)
    hitmarkAt: -10,
    hitmarkKill: false,
    hitDir: null, // {angle, at} direction the last damage came from
    kills: 0,
    deaths: 0,
    matchStats: { kills: 0, deaths: 0, damage: 0, plants: 0, defuses: 0 },
    tactics: {
      attackSite: 'A', // the site this round's execute targets
      executeAt: 0, // sim time the execute starts (0 = not planned)
      staged: 0, // attackers arrived at the staging point
      rotateSite: null, // defenders rotating toward this site
      lastContactSite: null, // where the enemy was last seen
      lastContactAt: -10,
    },
    rngSeed: 20261115,
  };
}

export function spawnBots(state) {
  state.agents = [];
  const attackRoles = state.round % 2 === 1
    ? ['attackA', 'attackService']
    : ['attackB', 'attackA'];
  for (let i = 0; i < 2; i++) {
    const a = freshAgent(`ally${i}`, BOT_NAMES.vanguard[i], 'vanguard', SPAWNS.vanguard[i + 1]);
    a.bot = freshBotState(attackRoles[i]);
    state.agents.push(a);
  }
  const defRoles = state.round % 2 === 1
    ? ['siteA', 'siteB', 'overlook', 'mid']
    : ['siteB', 'siteA', 'mid', 'overlook'];
  for (let i = 0; i < 4; i++) {
    const a = freshAgent(`foe${i}`, BOT_NAMES.sentinel[i], 'sentinel', SPAWNS.sentinel[i]);
    a.bot = freshBotState(defRoles[i]);
    if (defRoles[i] === 'overlook') {
      a.loadout.weapons.sniper = { mag: WEAPONS.sniper.mag, reserve: WEAPONS.sniper.reserve };
      a.loadout.current = 'sniper';
    } else {
      a.loadout.weapons.rifle = { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
      a.loadout.current = 'rifle';
    }
    if (i === 3) a.loadout.grenades.flash = 1;
    state.agents.push(a);
  }
  const smoker = state.agents.find((a) => a.team === 'vanguard' && a.bot.role === 'attackA');
  if (smoker) smoker.loadout.grenades.smoke = 1;
}

export function resetRound(state) {
  state.player = freshAgent('you', 'You', 'vanguard', SPAWNS.vanguard[0]);
  const keptLoadout = state.keepLoadout;
  state.player.loadout = keptLoadout || freshLoadout();
  state.keepLoadout = null;
  spawnBots(state);
  state.grenades = [];
  state.smokes = [];
  state.bomb = {
    state: 'carried', site: null, x: 0, z: 0, fuseLeft: 0,
    plantProgress: 0, defuseProgress: 0, defuserId: null,
  };
  state.plantChannel = 0;
  state.shake = 0;
  state.flash = 0;
  state.whiteout = 0;
  state.hitDir = null;
  state.roundMvp = null;
  state.tactics = {
    attackSite: state.round % 2 === 1 ? 'A' : 'B',
    executeAt: 0,
    staged: 0,
    rotateSite: null,
    lastContactSite: null,
    lastContactAt: -10,
  };
}

export function aliveCount(state, team) {
  let n = state.player.team === team && state.player.alive ? 1 : 0;
  for (const a of state.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function pushFeed(state, text, good) {
  state.feed.push({ text, at: state.time, good: !!good });
  if (state.feed.length > 6) state.feed.shift();
}
