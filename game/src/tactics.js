// DUSTFALL II — team tactics. The per-bot brain (brains.js) decides how
// one bot moves and shoots; this file decides what the TEAM does, once
// per tick, through the shared tactics block on the state: the attack
// site and the execute clock (attackers stage, then push together);
// defender rotation (the far defenders rotate to a threatened site after
// a delay, one always staying behind); flank calls (a free attacker is
// sent around the far route); and retreat calls (outnumbered 2:1 and
// hurt, a bot falls back to regroup). The player is never ordered
// around — the execute clock shows in the HUD so they can join it.

import { BOT } from './tuning.js';
import { STAGING, FLANK_ROUTES, FALLBACK } from './nav.js';
import { aliveCount } from './state.js';
import { siteAt } from './yard.js';

export function planTactics(state) {
  const t = state.time;
  const tactics = state.tactics;
  const attackers = state.agents.filter((a) => a.team === 'vanguard' && a.alive);
  const defenders = state.agents.filter((a) => a.team === 'sentinel' && a.alive);
  const playerAlive = state.player.alive;

  // ---- attack site and the execute clock -------------------------------
  // The execute starts when the attackers have staged (or after 20 s of
  // live play, whichever comes first). Before the execute, attackers
  // walk to the staging point; on the execute they push the site.
  if (state.phase === 'live' && state.bomb.state === 'carried') {
    if (tactics.executeAt === 0) {
      const staged = attackers.filter((a) => a.bot.mode === 'stage' && a.bot.stagedAt >= 0).length;
      tactics.staged = staged;
      const allStaged = staged >= attackers.length && attackers.length > 0;
      const roundElapsed = state.roundLeft > 0 ? 105 - state.roundLeft : 0;
      if (allStaged || roundElapsed > 20) {
        tactics.executeAt = t + 1.5;
      }
    }
  }

  // ---- defender rotation ------------------------------------------------
  // When the enemy is last seen at a site, defenders not already there
  // rotate toward it — but only after the delay, and never all at once:
  // one defender always stays on the other site.
  if (tactics.lastContactSite && t - tactics.lastContactAt < 25) {
    const site = tactics.lastContactSite;
    if (t - tactics.lastContactAt > BOT.rotateDelay && tactics.rotateSite !== site) {
      tactics.rotateSite = site;
      let rotated = 0;
      for (const d of defenders) {
        if (rotated >= 2) break;
        // Skip defenders already holding the threatened site.
        if (d.bot.role === `site${site}`) continue;
        if (d.bot.mode === 'engage' || d.bot.mode === 'defuse') continue;
        d.bot.mode = 'rotate';
        d.bot.rotateSite = site;
        d.bot.path = [];
        rotated += 1;
      }
    }
  }

  // ---- flank calls -------------------------------------------------------
  // If a fight is going at the attack site and a free attacker is far
  // from it, send them around the flank route.
  if (tactics.lastContactSite && state.bomb.state === 'carried') {
    const fighting = attackers.some((a) => a.bot.mode === 'engage');
    if (fighting) {
      for (const a of attackers) {
        if (a.bot.mode !== 'move' && a.bot.mode !== 'hold') continue;
        if (a.bot.flankSite) continue;
        if (Math.random() > BOT.flankChance) continue;
        const site = tactics.lastContactSite;
        const route = FLANK_ROUTES[site];
        if (!route) continue;
        a.bot.mode = 'flank';
        a.bot.flankSite = site;
        a.bot.path = route.slice();
        a.bot.pathIndex = 0;
        break; // one flanker at a time
      }
    }
  }

  // ---- retreat calls -----------------------------------------------------
  // Outnumbered 2:1 and hurt: fall back to the regroup point. The bot
  // re-joins the fight when its health is above the threshold again
  // (it never heals, so in practice it rejoins when the odds even out).
  const vanguardAlive = aliveCount(state, 'vanguard');
  const sentinelAlive = aliveCount(state, 'sentinel');
  for (const a of [...attackers, ...defenders]) {
    if (a.bot.mode === 'retreat') continue;
    if (a.health > BOT.retreatHealth) continue;
    const allies = a.team === 'vanguard' ? vanguardAlive : sentinelAlive;
    const foes = a.team === 'vanguard' ? sentinelAlive : vanguardAlive;
    if (foes >= allies * 2 && foes > 0) {
      a.bot.mode = 'retreat';
      a.bot.retreatUntil = t + 6;
      a.bot.path = [];
    }
  }
}

// Record that the enemy was last seen at a site (called by brains.js
// when a bot spots an enemy). Drives defender rotation and flank calls.
export function recordContact(state, x, z) {
  const site = siteAt(x, z);
  if (!site) return;
  state.tactics.lastContactSite = site;
  state.tactics.lastContactAt = state.time;
}

// The current execute state for the HUD: 'staging', 'execute', or null.
export function executeStatus(state) {
  if (state.phase !== 'live' || state.bomb.state !== 'carried') return null;
  if (state.tactics.executeAt === 0) return 'staging';
  if (state.time < state.tactics.executeAt) return 'staging';
  return 'execute';
}
