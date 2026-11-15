// DUSTFALL II — ordnance: thrown grenades. A grenade is a small physics
// body (gravity, ground bounce, wall bounce) with a fuse. On detonation:
// HE damages everyone in radius (falling off with distance, halved
// through a wall), smoke leaves a cloud that blocks line of sight for
// 12 s, and a flashbang blinds anyone with a line of sight to the pop —
// scaled by distance and by whether they were facing it. Bots and the
// player share all three effects through the same hasLineOfSight.

import { GRENADES, GRENADE_PHYSICS, SMOKE, FLASH } from './tuning.js';
import { WALLS, CRATES, MAP_BOUNDS, groundHeightAt, hasLineOfSight } from './yard.js';
import { circleBoxResolve, dist2XZ } from './mathx.js';

// Throw a grenade from `agent` toward their aim. Returns the grenade,
// or null when the agent has none of that type left.
export function throwGrenade(state, agent, type) {
  const loadout = agent.loadout;
  if (!loadout.grenades[type] || loadout.grenades[type] <= 0) return null;
  loadout.grenades[type] -= 1;
  const def = GRENADES[type];
  const eyeY = agent.y + 1.55;
  const dirX = Math.sin(agent.yaw) * Math.cos(agent.pitch);
  const dirY = Math.sin(agent.pitch);
  const dirZ = -Math.cos(agent.yaw) * Math.cos(agent.pitch);
  const g = {
    type,
    x: agent.x + dirX * 0.6,
    y: eyeY,
    z: agent.z + dirZ * 0.6,
    vx: dirX * GRENADE_PHYSICS.throwSpeed + agent.vx * 0.5,
    vy: dirY * GRENADE_PHYSICS.throwSpeed + GRENADE_PHYSICS.upSpeed,
    vz: dirZ * GRENADE_PHYSICS.throwSpeed + agent.vz * 0.5,
    fuse: def.fuse,
    ownerId: agent.id,
    team: agent.team,
  };
  state.grenades.push(g);
  return g;
}

// Step every live grenade: gravity, bounce, fuse. Detonations call back
// into the hooks (combat.js owns damage).
export function stepGrenades(state, dt, hooks) {
  const still = [];
  for (const g of state.grenades) {
    g.fuse -= dt;
    g.vy -= GRENADE_PHYSICS.gravity * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    // Ground bounce.
    const floor = groundHeightAt(g.x, g.z, g.y);
    if (g.y < floor + 0.12) {
      g.y = floor + 0.12;
      if (Math.abs(g.vy) > 1) {
        g.vy = -g.vy * GRENADE_PHYSICS.bounce;
        g.vx *= 0.7;
        g.vz *= 0.7;
      } else {
        g.vy = 0;
        g.vx *= 0.8;
        g.vz *= 0.8;
      }
    }
    // Wall bounce: circle-vs-box, then reflect the velocity component.
    const before = { x: g.x - g.vx * dt, z: g.z - g.vz * dt };
    const pos = { x: g.x, z: g.z };
    for (const w of [...WALLS, ...CRATES]) {
      if (circleBoxResolve(pos, 0.12, w, g.y - 0.12, 0.24)) {
        if (Math.abs(pos.x - before.x) > Math.abs(pos.z - before.z)) {
          g.vx = -g.vx * GRENADE_PHYSICS.bounce;
        } else {
          g.vz = -g.vz * GRENADE_PHYSICS.bounce;
        }
      }
    }
    g.x = pos.x;
    g.z = pos.z;
    // Map bounds.
    const b = MAP_BOUNDS;
    if (g.x < b.x0) { g.x = b.x0; g.vx = -g.vx * GRENADE_PHYSICS.bounce; }
    if (g.x > b.x1) { g.x = b.x1; g.vx = -g.vx * GRENADE_PHYSICS.bounce; }
    if (g.z < b.z0) { g.z = b.z0; g.vz = -g.vz * GRENADE_PHYSICS.bounce; }
    if (g.z > b.z1) { g.z = b.z1; g.vz = -g.vz * GRENADE_PHYSICS.bounce; }

    if (g.fuse <= 0) {
      detonate(state, g, hooks);
    } else {
      still.push(g);
    }
  }
  state.grenades = still;
  // Expire old smoke clouds.
  state.smokes = state.smokes.filter((s) => s.until > state.time);
}

function detonate(state, g, hooks) {
  if (g.type === 'he') {
    hooks.explosion?.(g.x, g.y, g.z);
    const def = GRENADES.he;
    const victims = [state.player, ...state.agents];
    for (const v of victims) {
      if (!v.alive) continue;
      const d2 = dist2XZ(v.x, v.z, g.x, g.z) + (v.y - g.y) * (v.y - g.y);
      if (d2 > def.radius * def.radius) continue;
      const d = Math.sqrt(d2);
      let damage = def.maxDamage * (1 - d / def.radius);
      const eyeY = v.y + 1.4;
      if (!hasLineOfSight(g.x, g.y, g.z, v.x, eyeY, v.z, null)) damage *= 0.5;
      if (damage < 5) continue;
      hooks.damage?.(v, Math.round(damage), g.ownerId, 'he');
    }
  } else if (g.type === 'smoke') {
    hooks.smoke?.(g.x, g.y, g.z);
    state.smokes.push({
      x: g.x,
      y: Math.max(g.y, 1.2),
      z: g.z,
      r: SMOKE.radius,
      until: state.time + SMOKE.duration,
    });
  } else if (g.type === 'flash') {
    hooks.flashPop?.(g.x, g.y, g.z);
    const victims = [state.player, ...state.agents];
    for (const v of victims) {
      if (!v.alive) continue;
      const d2 = dist2XZ(v.x, v.z, g.x, g.z) + (v.y - g.y) * (v.y - g.y);
      if (d2 > FLASH.radius * FLASH.radius) continue;
      const d = Math.sqrt(d2);
      const eyeY = v.y + 1.55;
      if (!hasLineOfSight(v.x, eyeY, v.z, g.x, g.y, g.z, null)) continue;
      const toFlash = Math.atan2(g.x - v.x, -(g.z - v.z));
      let diff = Math.abs(toFlash - v.yaw);
      while (diff > Math.PI) diff -= Math.PI * 2;
      const facing = Math.cos(diff); // 1 = staring at it, -1 = back turned
      const facingScale = facing > 0 ? 1 : FLASH.facingFactor;
      const blind = FLASH.maxBlind * (1 - d / FLASH.radius) * facingScale;
      if (blind < 0.15) continue;
      v.blindUntil = Math.max(v.blindUntil, state.time + blind);
      if (v.id === 'you') hooks.playerFlashed?.(blind);
    }
  }
}

export function isBlinded(agent, time) {
  return agent.blindUntil > time;
}
