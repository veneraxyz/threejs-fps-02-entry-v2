// DUSTFALL II — the entry point. Wires the sim, the renderer, the HUD
// and the input together, runs the fixed 60 Hz simulation loop, and
// exposes the demo hooks the screenshots and playtests use
// (window.__DUSTFALL2__). The sim owns all state; this file only moves
// data between systems and plays sounds for events the sim reports.

import * as THREE from 'three';
import { TICK, PLAYER, WEAPONS } from './tuning.js';
import { createState, PHASE } from './state.js';
import { mulberry32, clamp } from './mathx.js';
import { siteAt } from './yard.js';
import { stepAgent, followGround, footstepTimer } from './motion.js';
import {
  canFire, spendShot, tickLoadout, startReload, switchWeapon,
  swapLast, toggleScope, buyOptions, buy, cycleGrenade,
} from './arsenal.js';
import { throwGrenade, stepGrenades, isBlinded } from './ordnance.js';
import { fireWeapon, damageAgent, aimRay } from './combat.js';
import { updateBots, bombCarrier } from './brains.js';
import { planTactics } from './tactics.js';
import { startMatch, tickMatch, tickPlayerPlant } from './match.js';
import { createStage, createViewmodel, createEffects, createBombModel, updateCamera } from './stage.js';
import { buildHUD, updateHUD, showRoundBanner, hideBanner, renderBuyMenu, hideBuyMenu, showMenuScreen, hideMenuScreen, showMatchEnd } from './display.js';
import { buildMinimap, drawMinimap } from './minimap.js';
import { createInput } from './controls.js';
import * as sfx from './sfx.js';

const container = document.getElementById('game');
const state = createState();
const rng = mulberry32(state.rngSeed);

// ---- systems ---------------------------------------------------------------
const stage = createStage(container);
const viewmodel = createViewmodel(stage.camera);
const effects = createEffects(stage.scene);
const bombModel = createBombModel(stage.scene);
buildHUD();
buildMinimap();
const input = createInput(stage.renderer.domElement);

// UI-only values the sim does not own.
const ui = {
  channel: 0,
  channelLabel: '',
  buyOpen: false,
  stepTimer: 0,
  bobPhase: 0,
  plantBeepAt: 0,
  bombBeepAt: 0,
  lastHealth: 100,
};

// ---- effect hooks ----------------------------------------------------------
// The sim reports events through these; the renderer and the speakers
// answer. Nothing here mutates sim state except the HUD-facing fields
// (hit direction, flash, shake) that the sim itself owns.
const hooks = {
  tracer(x0, y0, z0, x1, y1, z1, team) {
    effects.addTracer(x0, y0, z0, x1, y1, z1, team);
  },
  spark(x, y, z) {
    effects.addSparks(x, y, z);
  },
  blood(x, y, z) {
    effects.addSparks(x, y, z);
  },
  shot(agent) {
    if (agent.id === 'you') return; // the player's shot is played in firePlayer
    const d = Math.hypot(agent.x - state.player.x, agent.z - state.player.z);
    sfx.playShot(agent.loadout.current, sfx.distanceGain(d, 45));
    const ray = aimRay(agent);
    effects.addMuzzleFlash(
      new THREE.Vector3(ray.ox + ray.dx * 0.8, ray.oy + ray.dy * 0.8, ray.oz + ray.dz * 0.8),
      null,
    );
  },
  reload(agent) {
    if (agent.id === 'you') return;
    const d = Math.hypot(agent.x - state.player.x, agent.z - state.player.z);
    if (d < 15) sfx.playReload(agent.loadout.current);
  },
  explosion(x, y, z) {
    effects.addExplosion(x, y, z);
    const d = Math.hypot(x - state.player.x, z - state.player.z);
    sfx.playExplosion(d);
    state.shake = Math.max(state.shake, clamp(1 - d / 20, 0.2, 1));
  },
  smoke(x, y, z) {
    effects.addSmoke(x, y, z);
    const d = Math.hypot(x - state.player.x, z - state.player.z);
    sfx.playSmokePop(d);
  },
  flashPop(x, y, z) {
    const d = Math.hypot(x - state.player.x, z - state.player.z);
    sfx.playFlashPop(d);
  },
  playerFlashed(blind) {
    state.whiteout = 1;
  },
  damage(victim, amount, attackerId, cause) {
    const died = damageAgent(state, victim, amount, attackerId, cause);
    if (victim.id === 'you') {
      state.flash = Math.min(1, state.flash + 0.4);
      sfx.playHurt();
      // Hit direction: where did the damage come from? For a grenade
      // the attacker is the thrower; fall back to the grenade itself.
      const attacker = attackerId === 'you' ? state.player : state.agents.find((a) => a.id === attackerId);
      if (attacker) {
        const worldYaw = Math.atan2(attacker.x - victim.x, -(attacker.z - victim.z));
        state.hitDir = { angle: worldYaw - victim.yaw, at: state.time };
      }
    }
    return died;
  },
  roundStart() {
    hideBanner();
    sfx.playClick();
  },
  roundEnd(winner, reason, mvp) {
    showRoundBanner(state);
    if (winner === 'vanguard') sfx.playRoundWin();
    else sfx.playRoundLose();
  },
  shake(amount) {
    state.shake = Math.max(state.shake, amount);
  },
};

// ---- the fixed simulation step ----------------------------------------------
function step(dt) {
  state.time += dt;
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) return;

  tickMatch(state, dt, hooks);
  if (state.phase !== PHASE.LIVE && state.phase !== PHASE.FREEZE) return;

  const p = state.player;

  // ---- player look ---------------------------------------------------------
  const look = input.lookDelta();
  if (input.locked && p.alive) {
    p.yaw = (p.yaw - look.dx) % (Math.PI * 2);
    p.pitch = clamp(p.pitch - look.dy, -1.45, 1.45);
  }

  // ---- player movement ------------------------------------------------------
  const grounded = followGround(p, dt, PLAYER.gravity);
  if (p.alive && state.phase === PHASE.LIVE) {
    const wish = input.wishDir(p.yaw);
    p.crouch = input.isDown('crouch');
    let speed = p.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
    if (p.loadout.scoped) speed = PLAYER.scopedSpeed;
    stepAgent(p, wish.x, wish.z, speed, dt, grounded);
    if (input.isDown('jump') && grounded) {
      p.vy = PLAYER.jumpSpeed;
      sfx.playJump();
    }
    const step = footstepTimer(p, dt, ui.stepTimer);
    ui.stepTimer = step.timer;
    if (step.fire) {
      sfx.playStep(p.crouch);
      if (!p.crouch) {
        state.noises.push({ x: p.x, z: p.z, at: state.time, team: 'vanguard', loud: 0.35 });
      }
    }
    ui.bobPhase += dt * Math.hypot(p.vx, p.vz) * 1.4;
  }

  // ---- player weapons --------------------------------------------------------
  tickLoadout(p, dt);
  if (p.alive && state.phase === PHASE.LIVE && input.locked) {
    const w = WEAPONS[p.loadout.current];
    const auto = w && w.auto;
    const pressed = input.firePressed; // consumed once per tick
    const wantFire = auto ? input.firing : pressed;
    if (wantFire) {
      if (canFire(p)) {
        spendShot(p);
        fireWeapon(state, p, rng, hooks);
        sfx.playShot(p.loadout.current, 1);
        viewmodel.addKick(w.kick * 0.06);
        const ray = aimRay(p);
        effects.addMuzzleFlash(
          new THREE.Vector3(ray.ox + ray.dx * 0.8, ray.oy + ray.dy * 0.8, ray.oz + ray.dz * 0.8),
          null,
        );
      } else if (pressed) {
        const held = p.loadout.weapons[p.loadout.current];
        if (held && held.mag <= 0) sfx.playDryFire();
      }
    }
    if (input.wasPressed('reload')) {
      if (startReload(p)) sfx.playReload(p.loadout.current);
    }
    if (input.scopePressed) {
      if (toggleScope(p)) sfx.playScope();
    }
    const slots = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'];
    for (let i = 0; i < slots.length; i++) {
      if (input.wasPressed(`slot${i + 1}`)) switchWeapon(p, slots[i]);
    }
    if (input.wasPressed('swap')) swapLast(p);
    const wheel = input.wheelSteps();
    if (wheel !== 0) cycleGrenade(p, wheel);
    if (input.wasPressed('throw')) {
      const type = p.loadout.grenadeSelected;
      if (p.loadout.grenades[type] > 0) {
        throwGrenade(state, p, type);
        sfx.playThrow();
      }
    }
    const planting = input.isDown('plant');
    const before = state.plantChannel;
    ui.channel = tickPlayerPlant(state, dt, planting);
    ui.channelLabel = ui.channel > 0 ? 'PLANTING…' : '';
    if (ui.channel > 0 && state.time - ui.plantBeepAt > 0.5) {
      ui.plantBeepAt = state.time;
      sfx.playPlantBeep(ui.channel);
    }
    if (before > 0 && ui.channel === 0 && state.bomb.state === 'planted') {
      sfx.playBombPlanted();
    }
  }

  // ---- buy menu ---------------------------------------------------------------
  if (input.wasPressed('buy') && state.phase === PHASE.FREEZE) {
    if (ui.buyOpen) {
      hideBuyMenu();
      ui.buyOpen = false;
      input.requestLock();
    } else {
      openBuyMenu();
    }
  }

  // ---- bots and tactics --------------------------------------------------------
  if (state.phase === PHASE.LIVE) {
    planTactics(state);
    updateBots(state, dt, rng, hooks);
  }

  // ---- grenades ------------------------------------------------------------------
  stepGrenades(state, dt, hooks);

  // ---- the planted bomb beeps, faster as the fuse runs down -------------------------
  if (state.bomb.state === 'planted') {
    const interval = state.bomb.fuseLeft < 10 ? 0.5 : 1;
    if (state.time - ui.bombBeepAt > interval) {
      ui.bombBeepAt = state.time;
      sfx.playBombBeep();
    }
  }

  // ---- decay the player's flash / whiteout --------------------------------------------
  state.flash = Math.max(0, state.flash - dt * 1.5);
  if (p.blindUntil > state.time) {
    state.whiteout = Math.min(1, state.whiteout + dt * 4);
  } else {
    state.whiteout = Math.max(0, state.whiteout - dt * 1.2);
  }

  // ---- player death: drop out of scope and release the buy menu --------------------------
  if (!p.alive && p.loadout.scoped) p.loadout.scoped = false;
}

// ---- buy menu ---------------------------------------------------------------

function openBuyMenu() {
  ui.buyOpen = true;
  input.releaseLock();
  renderBuyMenu(state, buyOptions(state), (kind, id) => {
    const result = buy(state, kind, id);
    if (result.ok) {
      sfx.playBuy();
      renderBuyMenu(state, buyOptions(state), openBuyMenuHandler);
    }
  });
}

function openBuyMenuHandler(kind, id) {
  const result = buy(state, kind, id);
  if (result.ok) {
    sfx.playBuy();
    renderBuyMenu(state, buyOptions(state), openBuyMenuHandler);
  }
}

// ---- screens ----------------------------------------------------------------

function deploy() {
  sfx.initAudio();
  hideMenuScreen();
  hideBanner();
  startMatch(state);
  input.requestLock();
}

showMenuScreen(deploy);

stage.renderer.domElement.addEventListener('click', () => {
  if (!input.locked && state.phase !== PHASE.MENU && state.phase !== PHASE.MATCH_END && !ui.buyOpen) {
    input.requestLock();
  }
});

let matchEndShown = false;

// ---- the render loop -----------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= TICK && steps < 5) {
    step(TICK);
    accumulator -= TICK;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;

  if (state.phase === PHASE.MATCH_END && !matchEndShown) {
    matchEndShown = true;
    input.releaseLock();
    showMatchEnd(state, () => {
      matchEndShown = false;
      deploy();
    });
  }

  if (state.phase !== PHASE.MENU) {
    updateCamera(stage.camera, state, frameDt, ui.bobPhase);
    stage.updateFigures(state, frameDt);
    viewmodel.setWeapon(state.player.loadout.current);
    viewmodel.update(frameDt, state.player.loadout.reloading > 0);
    bombModel.update(state);
    effects.update();
    updateHUD(state, ui);
    drawMinimap(state);
  } else {
    const t = now / 1000;
    stage.camera.position.set(Math.sin(t * 0.05) * 30, 14, Math.cos(t * 0.05) * 30);
    stage.camera.lookAt(0, 0, 0);
    stage.camera.fov = 60;
    stage.camera.updateProjectionMatrix();
  }
  stage.renderer.render(stage.scene, stage.camera);
}

window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  stage.camera.aspect = w / h;
  stage.camera.updateProjectionMatrix();
  stage.renderer.setSize(w, h);
});

requestAnimationFrame(frame);

// ---- demo hooks ---------------------------------------------------------------
// window.__DUSTFALL2__ drives scripted playtests and screenshots. Every
// hook is a small, safe operation on the live game.
window.__DUSTFALL2__ = {
  state,
  start() {
    deploy();
  },
  goLive() {
    if (state.phase === PHASE.FREEZE) {
      state.freezeLeft = 0;
      tickMatch(state, 0.01, hooks);
    }
  },
  teleport(x, z, yaw, y) {
    const p = state.player;
    p.x = x;
    p.z = z;
    p.y = y ?? 0;
    if (yaw !== undefined) p.yaw = yaw;
  },
  giveMoney(amount) {
    state.money += amount;
  },
  openBuy() {
    openBuyMenu();
  },
  closeBuy() {
    hideBuyMenu();
    ui.buyOpen = false;
  },
  // Plant the bomb at the player's feet (only on a site).
  plantAt() {
    const site = siteAt(state.player.x, state.player.z);
    if (!site) return false;
    state.bomb.state = 'planted';
    state.bomb.site = site;
    state.bomb.x = state.player.x;
    state.bomb.z = state.player.z;
    state.bomb.fuseLeft = 40;
    state.player.stats.plants += 1;
    return true;
  },
  // Place an enemy bot in front of the player for combat screenshots.
  placeFoe(x, z, holdFire = true) {
    const foe = state.agents.find((a) => a.team === 'sentinel' && a.alive);
    if (!foe) return null;
    foe.x = x;
    foe.z = z;
    foe.y = 0;
    foe.yaw = Math.atan2(state.player.x - x, -(state.player.z - z));
    if (holdFire) {
      foe.bot.mode = 'hold';
      foe.bot.holdUntil = state.time + 60;
      foe.bot.targetId = null;
      foe.bot.holdFire = true;
    }
    return foe;
  },
  shootOnce() {
    const p = state.player;
    if (!canFire(p)) return false;
    spendShot(p);
    fireWeapon(state, p, rng, hooks);
    return true;
  },
  setLoadout(weaponId) {
    const p = state.player;
    const w = WEAPONS[weaponId];
    if (!w) return false;
    p.loadout.weapons[weaponId] = { mag: w.mag, reserve: w.reserve };
    switchWeapon(p, weaponId);
    return true;
  },
  giveGrenades() {
    state.player.loadout.grenades = { he: 1, smoke: 1, flash: 1 };
    state.player.loadout.grenadeSelected = 'smoke';
  },
  throwSmokeAt(x, z) {
    state.smokes.push({ x, y: 1.2, z, r: 3.4, until: state.time + 12 });
    effects.addSmoke(x, 1.2, z);
  },
  lock() {
    input.requestLock();
  },
};
