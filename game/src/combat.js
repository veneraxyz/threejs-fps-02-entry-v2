// DUSTFALL II — combat: hitscan shooting, damage, kills and assists.
// A shot is a ray from the shooter's eye along their aim plus spread.
// The ray tests walls, the deck slab, the ground plane and every living
// agent (head sphere, then body box); the nearest hit wins. Damage falls
// off with range past each weapon's range, and a head hit multiplies it.
// Kills feed the kill feed, the economy and the MVP stats; damage
// remembers the last attacker so assists credit correctly.

import { WEAPONS, ECONOMY, MVP, BOT } from './tuning.js';
import { raycastWalls, hasLineOfSight } from './yard.js';
import { raySphere, rayBox, dist2XZ } from './mathx.js';
import { pushFeed } from './state.js';
import { isBlinded } from './ordnance.js';
import { currentSpread } from './arsenal.js';

export function aimRay(agent) {
  const eyeY = agent.y + (agent.id === 'you' ? (agent.crouch ? 1.12 : 1.62) : 1.55);
  const cp = Math.cos(agent.pitch);
  return {
    ox: agent.x,
    oy: eyeY,
    oz: agent.z,
    dx: Math.sin(agent.yaw) * cp,
    dy: Math.sin(agent.pitch),
    dz: -Math.cos(agent.yaw) * cp,
  };
}

export function applySpread(dir, spread, rng) {
  const a = (rng() - 0.5) * 2 * spread;
  const b = (rng() - 0.5) * 2 * spread;
  // Two perpendicular offsets: yaw and pitch jitter.
  const yaw = Math.atan2(dir.dx, -dir.dz) + a;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.dy))) + b;
  const cp = Math.cos(pitch);
  return { dx: Math.sin(yaw) * cp, dy: Math.sin(pitch), dz: -Math.cos(yaw) * cp };
}

export function traceShot(state, shooter, dir, maxDist) {
  const ray = aimRay(shooter);
  let best = maxDist;
  let bestVictim = null;
  let bestHead = false;

  const wallT = raycastWalls(ray.ox, ray.oy, ray.oz, dir.dx, dir.dy, dir.dz, maxDist);
  if (wallT < best) best = wallT;

  if (dir.dy < -1e-6) {
    const t = -ray.oy / dir.dy;
    if (t > 0 && t < best) best = t;
  }

  const candidates = shooter.id === 'you' ? state.agents : [state.player, ...state.agents];
  for (const v of candidates) {
    if (v === shooter || !v.alive) continue;
    if (v.team === shooter.team) continue;
    const headY = v.y + 1.54;
    const headT = raySphere(ray.ox, ray.oy, ray.oz, dir.dx, dir.dy, dir.dz, v.x, headY, v.z, 0.24, best);
    if (headT < best) {
      best = headT;
      bestVictim = v;
      bestHead = true;
      continue;
    }
    const bodyT = rayBox(
      ray.ox, ray.oy, ray.oz, dir.dx, dir.dy, dir.dz,
      { x0: v.x - 0.32, z0: v.z - 0.32, x1: v.x + 0.32, z1: v.z + 0.32, base: v.y, top: v.y + 1.5 },
      best,
    );
    if (bodyT < best) {
      best = bodyT;
      bestVictim = v;
      bestHead = false;
    }
  }

  const hx = ray.ox + dir.dx * best;
  const hy = ray.oy + dir.dy * best;
  const hz = ray.oz + dir.dz * best;
  return {
    hit: best < maxDist,
    x: hx,
    y: hy,
    z: hz,
    victim: bestVictim,
    headshot: bestHead,
    distance: best,
    wall: !bestVictim && best < maxDist,
  };
}

export function damageAgent(state, victim, amount, attackerId, cause) {
  if (!victim.alive) return false;
  victim.health -= amount;
  const attacker = attackerId === 'you'
    ? state.player
    : state.agents.find((a) => a.id === attackerId);
  if (attacker && attacker !== victim) {
    attacker.stats.damage += amount;
    if (attacker.id === 'you') state.matchStats.damage += amount;
    // Remember the last damager for assists (only within 8 s of death).
    victim.lastDamagedBy = { id: attackerId, at: state.time };
  }
  if (victim.health > 0) return false;

  victim.alive = false;
  victim.health = 0;
  victim.stats.deaths += 1;
  victim.loadout.scoped = false;
  if (victim.id === 'you') {
    state.deaths += 1;
    state.matchStats.deaths += 1;
  }
  if (attacker && attacker !== victim) {
    attacker.stats.kills += 1;
    if (attacker.id === 'you') {
      state.kills += 1;
      state.matchStats.kills += 1;
      state.money += ECONOMY.kill;
    }
    const causeText = cause === 'he' ? '💥' : cause === 'explosion' ? '💣' : '';
    pushFeed(state, `${attacker.name} ▸ ${victim.name}${causeText}`, attacker.team === 'vanguard');
  } else {
    pushFeed(state, `${victim.name} died`, victim.team !== 'vanguard');
  }
  if (victim.lastDamagedBy && attacker && victim.lastDamagedBy.id !== attacker.id) {
    if (state.time - victim.lastDamagedBy.at < 8) {
      const assister = victim.lastDamagedBy.id === 'you'
        ? state.player
        : state.agents.find((a) => a.id === victim.lastDamagedBy.id);
      if (assister) {
        assister.stats.assists += 1;
        if (assister.id === 'you') state.money += ECONOMY.assist;
      }
    }
  }
  return true;
}

export function falloffDamage(base, distance, range) {
  if (distance <= range) return base;
  const t = Math.min(1, (distance - range) / range);
  return base * (1 - 0.55 * t);
}

export function fireWeapon(state, shooter, rng, hooks) {
  const w = WEAPONS[shooter.loadout.current];
  if (!w) return [];
  const ray = aimRay(shooter);
  const hits = [];
  for (let p = 0; p < w.pellets; p++) {
    const spread = shooter.bot ? shooter.bot.aimError : currentSpread(shooter);
    const dir = applySpread(ray, spread, rng);
    const hit = traceShot(state, shooter, dir, w.range * 2);
    hits.push(hit);
    hooks.tracer?.(ray.ox, ray.oy, ray.oz, hit.x, hit.y, hit.z, shooter.team);
    if (hit.victim) {
      let dmg = falloffDamage(w.damage, hit.distance, w.range);
      if (hit.headshot) dmg *= w.headMult;
      dmg = Math.round(dmg);
      const died = damageAgent(state, hit.victim, dmg, shooter.id, 'bullet');
      if (shooter.id === 'you') {
        state.hitmarkAt = state.time;
        state.hitmarkKill = died;
      }
      hooks.blood?.(hit.x, hit.y, hit.z);
    } else if (hit.wall) {
      hooks.spark?.(hit.x, hit.y, hit.z);
    }
  }
  const loud = w.id === 'sniper' || w.id === 'shotgun' ? 1.4 : 1;
  state.noises.push({ x: shooter.x, z: shooter.z, at: state.time, team: shooter.team, loud });
  if (state.noises.length > 24) state.noises.shift();
  return hits;
}

// Can `seer` see `target` right now? Vision cone + range + line of sight
// (walls, deck, smoke). Blinded agents see nothing.
export function canSee(state, seer, target) {
  if (!target.alive) return false;
  if (isBlinded(seer, state.time)) return false;
  const dx = target.x - seer.x;
  const dz = target.z - seer.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > BOT.viewDistance * BOT.viewDistance) return false;
  const want = Math.atan2(dx, -dz);
  let diff = want - seer.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > BOT.viewHalfAngle) return false;
  const eyeY = seer.y + 1.55;
  const targetY = target.y + 1.4;
  return hasLineOfSight(seer.x, eyeY, seer.z, target.x, targetY, target.z, state.smokes);
}

export function agentDistance(a, b) {
  return Math.sqrt(dist2XZ(a.x, a.z, b.x, b.z));
}
