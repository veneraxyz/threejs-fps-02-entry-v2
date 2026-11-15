// DUSTFALL II — bot brains. One state machine per bot, driven by what
// it can see and hear. Modes: move (walking a route), hold (watching a
// lane), stage (waiting at the execute staging point), execute (the team
// push), engage (enemy visible: strafe and burst-fire), investigate (a
// noise was heard), flank (circling the far route), retreat (outnumbered
// and hurt), rotate (a defender moving to the threatened site), defuse
// (channelling at the bomb), plant (channelling the plant). Bots see
// through the same line-of-sight test as the player (walls, deck, smoke)
// and are blinded by flashbangs the same way; they hear gunshots within
// BOT.hearRadius and sprinting footsteps closer in.

import { BOT } from './tuning.js';
import { ROUTES, HOLDS, STAGING, FALLBACK, pathFrom, nearestWaypoint, WAYPOINTS } from './nav.js';
import { siteAt } from './yard.js';
import { stepBot, resolveCollisions } from './motion.js';
import { canSee, fireWeapon, agentDistance } from './combat.js';
import { spendShot, startReload, tickLoadout } from './arsenal.js';
import { throwGrenade, isBlinded } from './ordnance.js';
import { recordContact } from './tactics.js';
import { aliveCount } from './state.js';
import { clamp } from './mathx.js';

// The bomb carrier: the player while alive, otherwise the first living
// Vanguard bot. The carrier is the only one who can plant.
export function bombCarrier(state) {
  if (state.player.alive) return state.player;
  return state.agents.find((a) => a.team === 'vanguard' && a.alive) || null;
}

export function updateBots(state, dt, rng, hooks) {
  for (const bot of state.agents) {
    if (!bot.alive) continue;
    tickLoadout(bot, dt);
    updateBot(state, bot, dt, rng, hooks);
  }
}

function updateBot(state, bot, dt, rng, hooks) {
  const b = bot.bot;
  const t = state.time;

  if (isBlinded(bot, t)) {
    b.targetId = null;
    return;
  }

  // Demo hold-fire: the bot stands still and never engages.
  if (b.holdFire) return;

  // ---- perception -------------------------------------------------------
  const enemy = nearestVisibleEnemy(state, bot);
  if (enemy) {
    if (b.targetId !== enemy.id) b.firstSeenAt = t;
    b.targetId = enemy.id;
    b.seenAt = t;
    b.lastKnown = { x: enemy.x, z: enemy.z };
    recordContact(state, enemy.x, enemy.z);
    const sightTime = t - b.firstSeenAt;
    b.aimError = clamp(0.05 - sightTime * 0.02, BOT.baseSpread, 0.05);
  } else if (b.targetId && t - b.seenAt > 1.5) {
    b.targetId = null;
  }

  if (!enemy && b.mode !== 'engage' && b.mode !== 'defuse' && b.mode !== 'retreat') {
    const noise = state.noises.find(
      (n) => n.team !== bot.team && t - n.at < 1.2 && Math.hypot(n.x - bot.x, n.z - bot.z) < BOT.hearRadius * n.loud,
    );
    if (noise && b.mode !== 'investigate') {
      b.mode = 'investigate';
      b.lastKnown = { x: noise.x, z: noise.z };
      b.path = pathFrom(bot.x, bot.z, nearestWaypoint(noise.x, noise.z));
      b.pathIndex = 0;
    }
  }

  // ---- the bomb decides the defence's job --------------------------------
  if (state.bomb.state === 'planted' && bot.team === 'sentinel') {
    if (b.mode !== 'defuse' && b.mode !== 'engage') {
      b.mode = 'defuse';
      b.channelAt = -1;
      b.path = pathFrom(bot.x, bot.z, nearestWaypoint(state.bomb.x, state.bomb.z));
      b.pathIndex = 0;
    }
  }
  if (state.bomb.state === 'planted' && bot.team === 'vanguard') {
    if (b.mode !== 'engage' && b.mode !== 'hold') {
      b.mode = 'hold';
      b.path = pathFrom(bot.x, bot.z, nearestWaypoint(state.bomb.x, state.bomb.z));
      b.pathIndex = 0;
    }
  }

  // ---- engage: an enemy is visible ---------------------------------------
  if (enemy && b.mode !== 'defuse') {
    engage(state, bot, enemy, dt, rng, hooks);
    return;
  }

  // ---- mode behaviour -----------------------------------------------------
  switch (b.mode) {
    case 'engage':
      b.mode = 'hold';
      break;
    case 'stage':
      stage(state, bot, dt);
      break;
    case 'execute':
      execute(state, bot, dt);
      break;
    case 'flank':
      followPath(state, bot, dt, () => { b.mode = 'move'; b.flankSite = null; });
      break;
    case 'retreat':
      retreat(state, bot, dt);
      break;
    case 'rotate':
      rotate(state, bot, dt);
      break;
    case 'investigate':
      followPath(state, bot, dt, () => { b.mode = 'hold'; b.holdUntil = t + 2; });
      break;
    case 'defuse':
      defuse(state, bot, dt);
      break;
    case 'plant':
      plant(state, bot, dt);
      break;
    case 'hold':
      hold(state, bot, dt);
      break;
    case 'move':
    default:
      moveAlongRoute(state, bot, dt);
      break;
  }
}

// The nearest enemy this bot can currently see.
function nearestVisibleEnemy(state, bot) {
  let best = null;
  let bestD = Infinity;
  const foes = bot.team === 'vanguard'
    ? state.agents.filter((a) => a.team === 'sentinel')
    : [state.player, ...state.agents.filter((a) => a.team === 'vanguard')];
  for (const foe of foes) {
    if (!foe.alive) continue;
    if (!canSee(state, bot, foe)) continue;
    const d = agentDistance(bot, foe);
    if (d < bestD) {
      bestD = d;
      best = foe;
    }
  }
  return best;
}

// Engage: face the enemy, strafe sideways, fire in bursts.
function engage(state, bot, enemy, dt, rng, hooks) {
  const b = bot.bot;
  const t = state.time;
  b.mode = 'engage';
  const want = Math.atan2(enemy.x - bot.x, -(enemy.z - bot.z));
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 6 * dt;
  bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  if (t > b.strafeAt) {
    b.strafeDir = -b.strafeDir;
    b.strafeAt = t + BOT.strafePeriod * (0.7 + rng() * 0.6);
  }
  const sx = Math.cos(bot.yaw) * b.strafeDir;
  const sz = Math.sin(bot.yaw) * b.strafeDir;
  bot.x += sx * BOT.walkSpeed * 0.5 * dt;
  bot.z += sz * BOT.walkSpeed * 0.5 * dt;
  resolveCollisions(bot, BOT.radius, 1.8);
  if (t >= b.nextShotAt) {
    if (b.burstLeft <= 0) {
      b.burstLeft = BOT.burstMin + Math.floor(rng() * (BOT.burstMax - BOT.burstMin + 1));
      b.nextShotAt = t + BOT.burstGap;
      return;
    }
    const held = bot.loadout.weapons[bot.loadout.current];
    if (!held || held.mag <= 0) {
      if (startReload(bot)) hooks.reload?.(bot);
      b.nextShotAt = t + 0.5;
      return;
    }
    if (spendShot(bot)) {
      b.burstLeft -= 1;
      b.nextShotAt = t + BOT.shotGap;
      fireWeapon(state, bot, rng, hooks);
      hooks.shot?.(bot);
    }
  }
}

// Walk to a waypoint via the BFS path (never a straight line — the yard
// has walls between most points). Returns true on arrival.
function seekNode(state, bot, dt, node, speed) {
  const b = bot.bot;
  if (b.path.length === 0 || b.path[b.path.length - 1] !== node) {
    b.path = pathFrom(bot.x, bot.z, node);
    b.pathIndex = 0;
  }
  let arrived = false;
  followPath(state, bot, dt, () => { arrived = true; });
  return arrived;
}

// Stage: walk to the attack staging point and wait for the execute.
function stage(state, bot, dt) {
  const b = bot.bot;
  const site = state.tactics.attackSite;
  const arrived = seekNode(state, bot, dt, STAGING[site], BOT.runSpeed);
  if (arrived && b.stagedAt < 0) b.stagedAt = state.time;
  if (state.tactics.executeAt > 0 && state.time >= state.tactics.executeAt) {
    b.mode = 'execute';
    b.path = [];
  }
}

// Execute: push the site along the BFS path. The carrier plants when it
// arrives; the smoker throws its smoke at the site entrance first.
function execute(state, bot, dt) {
  const b = bot.bot;
  const site = state.tactics.attackSite;
  const siteNode = site === 'A' ? 3 : 13;
  if (!b.threwGrenade && bot.loadout.grenades.smoke > 0) {
    const dest = WAYPOINTS[siteNode];
    if (Math.hypot(dest.x - bot.x, dest.z - bot.z) < 14) {
      bot.yaw = Math.atan2(dest.x - bot.x, -(dest.z - bot.z));
      throwGrenade(state, bot, 'smoke');
      b.threwGrenade = true;
    }
  }
  const arrived = seekNode(state, bot, dt, siteNode, BOT.runSpeed);
  if (arrived) {
    b.mode = 'hold';
    b.holdUntil = state.time + 4;
    if (bombCarrier(state) === bot && state.bomb.state === 'carried' && siteAt(bot.x, bot.z) === site) {
      b.mode = 'plant';
      b.channelAt = state.time;
    }
  }
}

// Retreat: run to the team fallback point, then hold until the timer ends.
function retreat(state, bot, dt) {
  const b = bot.bot;
  seekNode(state, bot, dt, FALLBACK[bot.team], BOT.runSpeed);
  if (state.time > b.retreatUntil) {
    b.mode = 'move';
    b.path = [];
  }
}

// Rotate: a defender running to the threatened site's hold point.
function rotate(state, bot, dt) {
  const b = bot.bot;
  const site = b.rotateSite;
  if (!site) {
    b.mode = 'move';
    return;
  }
  const holdNode = site === 'A' ? 4 : 13;
  const arrived = seekNode(state, bot, dt, holdNode, BOT.runSpeed);
  if (arrived) {
    b.mode = 'hold';
    b.role = `site${site}`;
    b.rotateSite = null;
  }
}

// Defuse: run to the bomb via the BFS path, then channel the defuse.
function defuse(state, bot, dt) {
  const b = bot.bot;
  const bomb = state.bomb;
  if (bomb.state !== 'planted') {
    b.mode = 'move';
    return;
  }
  const d = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
  if (d > 1.2) {
    const node = nearestWaypoint(bomb.x, bomb.z);
    if (Math.hypot(WAYPOINTS[node].x - bot.x, WAYPOINTS[node].z - bot.z) > 1.5) {
      seekNode(state, bot, dt, node, BOT.runSpeed);
    } else {
      stepBot(bot, bomb.x, bomb.z, dt, BOT.runSpeed);
    }
    return;
  }
  if (b.channelAt < 0) b.channelAt = state.time;
  if (state.time - b.channelAt >= 5) {
    bomb.state = 'defused';
    bot.stats.defuses += 1;
  }
}

// Plant: the carrier stands on the site and channels the plant.
function plant(state, bot, dt) {
  const b = bot.bot;
  const bomb = state.bomb;
  if (bomb.state !== 'carried' || bombCarrier(state) !== bot) {
    b.mode = 'hold';
    return;
  }
  const site = siteAt(bot.x, bot.z);
  if (!site) {
    b.mode = 'execute';
    return;
  }
  if (state.time - b.channelAt >= 3) {
    bomb.state = 'planted';
    bomb.site = site;
    bomb.x = bot.x;
    bomb.z = bot.z;
    bomb.fuseLeft = 40;
    bot.stats.plants += 1;
    b.mode = 'hold';
    b.holdUntil = state.time + 5;
  }
}

// Hold: stay put and watch the hold direction.
function hold(state, bot, dt) {
  const b = bot.bot;
  const holdDef = HOLDS[b.role];
  if (holdDef) {
    const face = WAYPOINTS[holdDef.face];
    const want = Math.atan2(face.x - bot.x, -(face.z - bot.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 3 * dt;
    bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }
  if (state.time > b.holdUntil && b.mode === 'hold') {
    b.mode = 'move';
    b.path = [];
  }
}

// Move along the bot's route: defenders to their hold, attackers to the
// staging point (or the site, after the execute starts).
function moveAlongRoute(state, bot, dt) {
  const b = bot.bot;
  if (bot.team === 'vanguard' && state.bomb.state === 'carried') {
    if (state.tactics.executeAt > 0 && state.time >= state.tactics.executeAt) {
      b.mode = 'execute';
      return;
    }
    b.mode = 'stage';
    return;
  }
  const route = ROUTES[b.role] || ROUTES.roam;
  if (b.path.length === 0) {
    b.path = route.slice();
    b.pathIndex = 0;
  }
  const target = WAYPOINTS[b.path[b.pathIndex]];
  const arrived = stepBot(bot, target.x, target.z, dt, BOT.walkSpeed);
  if (arrived) {
    b.pathIndex += 1;
    if (b.pathIndex >= b.path.length) {
      b.mode = 'hold';
      b.holdUntil = state.time + 3 + Math.random() * 3;
      b.path = [];
    }
  }
}

// Follow a computed path (list of waypoint indices); call `done` at the end.
function followPath(state, bot, dt, done) {
  const b = bot.bot;
  if (b.path.length === 0 || b.pathIndex >= b.path.length) {
    done();
    return;
  }
  const target = WAYPOINTS[b.path[b.pathIndex]];
  const arrived = stepBot(bot, target.x, target.z, dt, BOT.runSpeed);
  if (arrived) {
    b.pathIndex += 1;
    if (b.pathIndex >= b.path.length) done();
  }
}
