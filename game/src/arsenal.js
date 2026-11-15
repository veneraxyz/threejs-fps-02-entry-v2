// DUSTFALL II — the arsenal. Five guns and the rules around them:
// firing with spread, bloom and recoil; reloading; the sniper scope;
// buying and the economy. The sim owns the numbers (mag, reserve,
// cooldowns); the renderer reads them to draw the viewmodel and HUD.
// Shooting itself lives in combat.js — this file answers "can I fire
// now?" and "what did firing cost?".

import { WEAPONS, ECONOMY, GRENADES, GRENADE_PHYSICS } from './tuning.js';
import { grenadeCount } from './state.js';
import { clamp } from './mathx.js';

export function weaponDef(id) {
  return WEAPONS[id];
}

export function currentWeapon(agent) {
  return WEAPONS[agent.loadout.current];
}

// The spread cone for the next shot: base spread, plus movement, plus
// accumulated bloom, minus the crouch and scope bonuses. A scoped,
// still sniper is nearly perfect; a running shotgun is a cloud.
export function currentSpread(agent) {
  const w = WEAPONS[agent.loadout.current];
  let spread = w.spread;
  const speed = Math.hypot(agent.vx, agent.vz);
  spread += w.moveSpread * clamp(speed / 5.2, 0, 1);
  spread += agent.loadout.bloom;
  if (agent.crouch) spread *= 0.7;
  if (agent.loadout.scoped && w.id === 'sniper') {
    spread = w.scopedSpread + agent.loadout.bloom * 0.3;
    if (speed > 0.5) spread += w.moveSpread * clamp(speed / 5.2, 0, 1);
  }
  return spread;
}

export function canFire(agent) {
  const loadout = agent.loadout;
  const w = WEAPONS[loadout.current];
  if (!w) return false;
  if (loadout.reloading > 0) return false;
  if (loadout.fireCooldown > 0) return false;
  const held = loadout.weapons[loadout.current];
  if (!held || held.mag <= 0) return false;
  return true;
}

export function spendShot(agent) {
  if (!canFire(agent)) return false;
  const loadout = agent.loadout;
  const w = WEAPONS[loadout.current];
  const held = loadout.weapons[loadout.current];
  held.mag -= 1;
  loadout.fireCooldown = w.fireInterval;
  loadout.bloom = Math.min(w.bloomMax, loadout.bloom + w.bloom);
  loadout.recoilPitch = Math.min(0.12, loadout.recoilPitch + w.recoil);
  loadout.lastShotAt = performance.now() / 1000;
  if (w.id === 'sniper') loadout.scoped = false;
  return true;
}

export function tickLoadout(agent, dt) {
  const loadout = agent.loadout;
  if (loadout.fireCooldown > 0) loadout.fireCooldown -= dt;
  const w = WEAPONS[loadout.current];
  if (w) {
    loadout.bloom = Math.max(0, loadout.bloom - w.bloomMax * dt * 1.4);
    loadout.recoilPitch = Math.max(0, loadout.recoilPitch - dt * 0.25);
  }
  if (loadout.reloading > 0) {
    loadout.reloading -= dt;
    if (loadout.reloading <= 0) {
      const held = loadout.weapons[loadout.current];
      const def = WEAPONS[loadout.current];
      if (held && def) {
        const need = def.mag - held.mag;
        const take = Math.min(need, held.reserve);
        held.mag += take;
        held.reserve -= take;
      }
      loadout.reloading = 0;
    }
  }
}

export function startReload(agent) {
  const loadout = agent.loadout;
  const w = WEAPONS[loadout.current];
  const held = loadout.weapons[loadout.current];
  if (!w || !held) return false;
  if (loadout.reloading > 0) return false;
  if (held.mag >= w.mag) return false;
  if (held.reserve <= 0) return false;
  loadout.reloading = w.reloadTime;
  loadout.scoped = false;
  return true;
}

export function switchWeapon(agent, id) {
  const loadout = agent.loadout;
  if (!loadout.weapons[id]) return false;
  if (loadout.current === id) return false;
  if (loadout.reloading > 0) loadout.reloading = 0;
  loadout.lastWeapon = loadout.current;
  loadout.current = id;
  loadout.scoped = false;
  loadout.fireCooldown = Math.max(loadout.fireCooldown, 0.25);
  return true;
}

export function swapLast(agent) {
  return switchWeapon(agent, agent.loadout.lastWeapon);
}

export function toggleScope(agent) {
  const loadout = agent.loadout;
  if (loadout.current !== 'sniper') return false;
  if (loadout.reloading > 0) return false;
  loadout.scoped = !loadout.scoped;
  return loadout.scoped;
}

// ---- the buy shop --------------------------------------------------------

export function buyOptions(state) {
  const loadout = state.player.loadout;
  const options = [];
  for (const id of ['rifle', 'smg', 'shotgun', 'sniper']) {
    const w = WEAPONS[id];
    options.push({
      kind: 'weapon',
      id,
      name: w.name,
      price: w.price,
      owned: !!loadout.weapons[id],
      blurb: w.blurb,
      affordable: state.money >= w.price,
    });
  }
  for (const id of ['he', 'smoke', 'flash']) {
    const g = GRENADES[id];
    options.push({
      kind: 'grenade',
      id,
      name: g.name,
      price: g.price,
      owned: loadout.grenades[id] > 0,
      blurb: g.blurb,
      affordable: state.money >= g.price && grenadeCount(loadout) < GRENADE_PHYSICS.maxCarried,
    });
  }
  return options;
}

export function buy(state, kind, id) {
  if (kind === 'weapon') {
    const w = WEAPONS[id];
    if (!w) return { ok: false, reason: 'Unknown weapon' };
    const loadout = state.player.loadout;
    if (loadout.weapons[id]) return { ok: false, reason: 'Already owned' };
    if (state.money < w.price) return { ok: false, reason: 'Not enough money' };
    state.money -= w.price;
    loadout.weapons[id] = { mag: w.mag, reserve: w.reserve };
    switchWeapon(state.player, id);
    return { ok: true };
  }
  if (kind === 'grenade') {
    const g = GRENADES[id];
    if (!g) return { ok: false, reason: 'Unknown grenade' };
    const loadout = state.player.loadout;
    if (loadout.grenades[id] > 0) return { ok: false, reason: 'One per type per round' };
    if (grenadeCount(loadout) >= GRENADE_PHYSICS.maxCarried) return { ok: false, reason: 'Carrying the max' };
    if (state.money < g.price) return { ok: false, reason: 'Not enough money' };
    state.money -= g.price;
    loadout.grenades[id] += 1;
    loadout.grenadeSelected = id;
    return { ok: true };
  }
  return { ok: false, reason: 'Unknown item' };
}

export function buyAmmo(state) {
  const loadout = state.player.loadout;
  const held = loadout.weapons[loadout.current];
  const w = WEAPONS[loadout.current];
  if (!held || !w) return { ok: false, reason: 'No weapon' };
  if (state.money < ECONOMY.pistolAmmo) return { ok: false, reason: 'Not enough money' };
  if (held.reserve >= w.reserve) return { ok: false, reason: 'Reserve full' };
  state.money -= ECONOMY.pistolAmmo;
  held.reserve = w.reserve;
  return { ok: true };
}

export function cycleGrenade(agent, dir) {
  const loadout = agent.loadout;
  const carried = ['he', 'smoke', 'flash'].filter((t) => loadout.grenades[t] > 0);
  if (carried.length === 0) return null;
  const idx = carried.indexOf(loadout.grenadeSelected);
  const next = carried[(idx + dir + carried.length) % carried.length];
  loadout.grenadeSelected = next;
  return next;
}
