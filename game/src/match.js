// DUSTFALL II — the match director. Rounds, the economy, the bomb fuse,
// win conditions and the round MVP. The flow: MENU → startMatch →
// FREEZE (buy) → LIVE → ROUND_END (banner + MVP) → FREEZE … → MATCH_END
// (first to 8). A round ends when one team is eliminated, the bomb
// explodes (Vanguard win), the bomb is defused (Sentinel win), or the
// clock runs out (Sentinels win — unless the bomb is planted, in which
// case the round runs on the fuse alone). The MVP is the top scorer of
// the winning team, by kills, damage, plants and defuses.

import {
  FREEZE_TIME, ROUND_TIME, BOMB_FUSE, PLANT_TIME,
  ROUND_END_TIME, MATCH_WIN_ROUNDS, ECONOMY, MVP,
} from './tuning.js';
import { PHASE, resetRound, aliveCount, pushFeed } from './state.js';
import { siteAt } from './yard.js';
import { bombCarrier } from './brains.js';

export function startMatch(state) {
  state.score = { vanguard: 0, sentinel: 0 };
  state.lossStreak = 0;
  state.money = ECONOMY.start;
  state.round = 1;
  state.kills = 0;
  state.deaths = 0;
  state.matchStats = { kills: 0, deaths: 0, damage: 0, plants: 0, defuses: 0 };
  state.feed = [];
  state.keepLoadout = null;
  startRound(state);
}

export function startRound(state) {
  resetRound(state);
  state.phase = PHASE.FREEZE;
  state.freezeLeft = FREEZE_TIME;
  state.roundLeft = ROUND_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.roundMvp = null;
}

export function tickMatch(state, dt, hooks) {
  if (state.phase === PHASE.FREEZE) {
    state.freezeLeft -= dt;
    if (state.freezeLeft <= 0) {
      state.phase = PHASE.LIVE;
      hooks.roundStart?.();
    }
    return;
  }
  if (state.phase === PHASE.ROUND_END) {
    state.roundEndLeft -= dt;
    if (state.roundEndLeft <= 0) {
      if (state.score.vanguard >= MATCH_WIN_ROUNDS || state.score.sentinel >= MATCH_WIN_ROUNDS) {
        state.phase = PHASE.MATCH_END;
      } else {
        state.round += 1;
        startRound(state);
      }
    }
    return;
  }
  if (state.phase !== PHASE.LIVE) return;

  if (state.bomb.state !== 'planted') {
    state.roundLeft -= dt;
    if (state.roundLeft <= 0) {
      endRound(state, 'sentinel', 'Time expired — bomb never planted', hooks);
      return;
    }
  } else {
    state.bomb.fuseLeft -= dt;
    if (state.bomb.fuseLeft <= 0) {
      state.bomb.state = 'exploded';
      hooks.explosion?.(state.bomb.x, 0.5, state.bomb.z);
      explodeBomb(state, hooks);
      endRound(state, 'vanguard', 'Bomb detonated', hooks);
      return;
    }
  }

  if (state.bomb.state === 'defused') {
    endRound(state, 'sentinel', 'Bomb defused', hooks);
    return;
  }

  const vanguard = aliveCount(state, 'vanguard');
  const sentinel = aliveCount(state, 'sentinel');
  const planted = state.bomb.state === 'planted';
  // With the bomb planted, an eliminated team does not end the round:
  // the fuse decides it (defenders must defuse in time).
  if (vanguard === 0 && !planted) {
    endRound(state, 'sentinel', 'Vanguard eliminated', hooks);
    return;
  }
  if (sentinel === 0 && !planted) {
    endRound(state, 'vanguard', 'Sentinels eliminated', hooks);
    return;
  }
}

function explodeBomb(state, hooks) {
  const victims = [state.player, ...state.agents];
  for (const v of victims) {
    if (!v.alive) continue;
    const d = Math.hypot(v.x - state.bomb.x, v.z - state.bomb.z);
    if (d < 9) {
      v.alive = false;
      v.health = 0;
      v.stats.deaths += 1;
      if (v.id === 'you') {
        state.deaths += 1;
        state.matchStats.deaths += 1;
      }
    }
  }
  hooks.shake?.(1);
}

export function tickPlayerPlant(state, dt, holding) {
  const bomb = state.bomb;
  if (state.phase !== PHASE.LIVE) return state.plantChannel;
  if (bomb.state !== 'carried') return state.plantChannel;
  if (bombCarrier(state) !== state.player) return state.plantChannel;
  if (!state.player.alive) return state.plantChannel;
  const site = siteAt(state.player.x, state.player.z);
  if (!holding || !site) {
    state.plantChannel = 0;
    return 0;
  }
  state.plantChannel += dt / PLANT_TIME;
  if (state.plantChannel >= 1) {
    bomb.state = 'planted';
    bomb.site = site;
    bomb.x = state.player.x;
    bomb.z = state.player.z;
    bomb.fuseLeft = BOMB_FUSE;
    state.player.stats.plants += 1;
    state.matchStats.plants += 1;
    state.money += ECONOMY.plant;
    state.plantChannel = 0;
    pushFeed(state, 'Bomb planted at site ' + site, true);
    return 0;
  }
  return state.plantChannel;
}

// Score one agent for the MVP table.
export function mvpScore(agent) {
  const s = agent.stats;
  return s.kills * MVP.perKill + s.damage * MVP.perDamage
    + s.plants * MVP.perPlant + s.defuses * MVP.perDefuse
    + s.assists * MVP.perAssist;
}

// The MVP of the round: the top scorer on the winning team.
export function roundMvp(state, winner) {
  const candidates = [state.player, ...state.agents].filter((a) => a.team === winner);
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = mvpScore(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  return {
    name: best.name,
    team: best.team,
    kills: best.stats.kills,
    damage: best.stats.damage,
    score: bestScore,
    line: mvpLine(best),
  };
}

function mvpLine(agent) {
  const s = agent.stats;
  const parts = [];
  if (s.kills > 0) parts.push(`${s.kills} kill${s.kills > 1 ? 's' : ''}`);
  if (s.plants > 0) parts.push('planted the bomb');
  if (s.defuses > 0) parts.push('defused the bomb');
  if (s.damage > 0) parts.push(`${s.damage} damage`);
  if (parts.length === 0) return 'held the line';
  return parts.join(' · ');
}

export function endRound(state, winner, reason, hooks) {
  if (state.phase !== PHASE.LIVE) return;
  state.phase = PHASE.ROUND_END;
  state.roundEndLeft = ROUND_END_TIME;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  state.roundMvp = roundMvp(state, winner);

  if (winner === 'vanguard') {
    state.money += ECONOMY.win;
    state.lossStreak = 0;
  } else {
    const bonus = Math.min(ECONOMY.maxLossBonus, ECONOMY.loss + state.lossStreak * ECONOMY.lossStreakBonus);
    state.money += bonus;
    state.lossStreak += 1;
  }

  state.keepLoadout = state.player.loadout;
  hooks.roundEnd?.(winner, reason, state.roundMvp);
}
