// DUSTFALL II — movement. One mover drives the player and the bots:
// acceleration toward a wish direction, friction on the ground, a jump,
// and gravity — plus the v2 height layer (the ramp, the overlook deck,
// stepping onto low ledges). Collision is circle-vs-AABB, height-aware:
// a wall only blocks when the mover's vertical span overlaps the wall's
// [base, top], so agents pass under the deck while its parapet still
// blocks agents standing on it. The footstep clock here fires while the
// player moves on the ground; the caller plays the sound, and bots hear
// sprinting players nearby.

import { PLAYER } from './tuning.js';
import { WALLS, CRATES, MAP_BOUNDS, groundHeightAt } from './yard.js';
import { circleBoxResolve } from './mathx.js';

// Resolve a mover's position against every collider, then clamp to the
// map bounds. `mover` is {x, z, y} (y = feet height).
export function resolveCollisions(mover, radius, height) {
  for (const w of WALLS) circleBoxResolve(mover, radius, w, mover.y, height);
  for (const c of CRATES) circleBoxResolve(mover, radius, c, mover.y, height);
  const b = MAP_BOUNDS;
  if (mover.x < b.x0 + radius) mover.x = b.x0 + radius;
  if (mover.x > b.x1 - radius) mover.x = b.x1 - radius;
  if (mover.z < b.z0 + radius) mover.z = b.z0 + radius;
  if (mover.z > b.z1 - radius) mover.z = b.z1 - radius;
}

// Shared ground-follow: snap a mover to the floor height under its feet,
// or let it fall. Returns true when the mover is standing on the ground.
export function followGround(mover, dt, gravity) {
  const floor = groundHeightAt(mover.x, mover.z, mover.y);
  if (mover.y <= floor + 0.001 && mover.vy <= 0) {
    mover.y = floor;
    mover.vy = 0;
    return true;
  }
  mover.vy -= gravity * dt;
  mover.y += mover.vy * dt;
  if (mover.y <= floor) {
    mover.y = floor;
    mover.vy = 0;
    return true;
  }
  return false;
}

// Step an agent along a wish direction (world-space unit vector wx, wz)
// at `speed`, with acceleration and friction. `grounded` comes from
// followGround. Updates the agent's velocity and position.
export function stepAgent(agent, wx, wz, speed, dt, grounded) {
  const accel = grounded ? PLAYER.accel : PLAYER.airAccel;
  const targetVx = wx * speed;
  const targetVz = wz * speed;
  const rate = grounded ? accel * dt : accel * dt;
  agent.vx += (targetVx - agent.vx) * Math.min(1, rate);
  agent.vz += (targetVz - agent.vz) * Math.min(1, rate);
  // Friction when there is no input: bleed velocity toward zero.
  if (wx === 0 && wz === 0 && grounded) {
    const f = Math.max(0, 1 - PLAYER.friction * dt);
    agent.vx *= f;
    agent.vz *= f;
  }
  agent.x += agent.vx * dt;
  agent.z += agent.vz * dt;
  resolveCollisions(agent, PLAYER.radius, PLAYER.height);
  agent.moving = Math.hypot(agent.vx, agent.vz) > 0.6;
}

// A bot's walk: slower than the player, no jumping, and it turns toward
// its travel direction while moving. Returns true on arrival.
export function stepBot(bot, tx, tz, dt, speed) {
  const dx = tx - bot.x;
  const dz = tz - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) return true;
  const ux = dx / dist;
  const uz = dz / dist;
  const grounded = followGround(bot, dt, PLAYER.gravity);
  stepAgent(bot, ux, uz, speed, dt, grounded);
  // Face the travel direction, turning at most ~4.5 rad/s.
  const want = Math.atan2(dx, -dz);
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 4.5 * dt;
  bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  return false;
}

// Player footstep clock: call every frame with the player's state; it
// returns true on a step. Faster movement steps more often.
export function footstepTimer(player, dt, timer) {
  if (!player.moving || player.y > 0.01) return { fire: false, timer: 0 };
  const speed = Math.hypot(player.vx, player.vz);
  const interval = player.crouch ? 0.55 : 0.38 - Math.min(0.08, speed * 0.004);
  const next = timer + dt;
  if (next >= interval) return { fire: true, timer: 0 };
  return { fire: false, timer: next };
}
