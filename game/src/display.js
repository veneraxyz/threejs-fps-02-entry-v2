// DUSTFALL II — the HUD. Plain DOM over the canvas: health, ammo,
// money, the round timer, the kill feed, the crosshair and the scope
// overlay. New in v2: the hit-direction indicator, the round MVP
// banner, the zone callout, the execute status line, and the
// plant/defuse progress bar. updateHUD rebuilds from state every frame,
// writing only values that changed.

import { UI } from './palette.js';
import { WEAPONS, GRENADES } from './tuning.js';
import { zoneAt } from './yard.js';
import { executeStatus } from './tactics.js';
import { grenadeCount } from './state.js';

let els = null;
let last = {};

export function buildHUD() {
  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <div id="crosshair"><div class="ch-dot"></div><div class="ch-line ch-t"></div><div class="ch-line ch-b"></div><div class="ch-line ch-l"></div><div class="ch-line ch-r"></div></div>
    <div id="hitmarker"></div>
    <div id="hitdir"><div class="hd-arc"></div></div>
    <div id="scope-overlay"><div class="scope-ring"></div><div class="scope-h"></div><div class="scope-v"></div></div>
    <div id="damage-vignette"></div>
    <div id="whiteout"></div>
    <div id="topbar">
      <div class="team-score van"><span class="ts-label">VANGUARD</span><span id="score-van">0</span></div>
      <div id="timer-wrap"><div id="timer">1:45</div><div id="round-label">ROUND 1</div></div>
      <div class="team-score sen"><span id="score-sen">0</span><span class="ts-label">SENTINELS</span></div>
    </div>
    <div id="zone-line"><span id="zone-name">Kestrel Yard</span><span id="execute-line"></span></div>
    <div id="bomb-line"></div>
    <div id="feed"></div>
    <div id="bottom-left">
      <div id="health-wrap"><span id="health">100</span><span class="hl-label">HP</span><div id="health-bar"><div id="health-fill"></div></div></div>
      <div id="money">$800</div>
    </div>
    <div id="bottom-right">
      <div id="weapon-name">P9 Sidearm</div>
      <div id="ammo"><span id="ammo-mag">12</span><span class="ammo-sep">/</span><span id="ammo-reserve">48</span></div>
      <div id="grenade-line"></div>
      <div id="channel-bar"><div id="channel-fill"></div><span id="channel-label"></span></div>
    </div>
    <div id="banner"></div>
    <div id="mvp-banner"></div>
    <div id="hint-line"></div>
    <div id="buy-menu"></div>
    <div id="menu-screen"></div>
  `;
  els = {};
  for (const id of [
    'crosshair', 'hitmarker', 'hitdir', 'scope-overlay', 'damage-vignette',
    'whiteout', 'score-van', 'score-sen', 'timer', 'round-label', 'zone-name',
    'execute-line', 'bomb-line', 'feed', 'health', 'health-fill', 'money',
    'weapon-name', 'ammo-mag', 'ammo-reserve', 'grenade-line', 'channel-bar',
    'channel-fill', 'channel-label', 'banner', 'mvp-banner', 'hint-line',
    'buy-menu', 'menu-screen',
  ]) {
    els[id] = document.getElementById(id);
  }
  return els;
}

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function setWidth(el, pct) {
  const v = `${pct}%`;
  if (el.style.width !== v) el.style.width = v;
}

function setOpacity(el, value) {
  const v = String(value);
  if (el.style.opacity !== v) el.style.opacity = v;
}

function setDisplay(el, show) {
  const v = show ? '' : 'none';
  if (el.style.display !== v) el.style.display = v;
}

// The per-frame HUD update. `ui` carries render-only values the sim does
// not own: channel progress, the buy menu state, banner text.
export function updateHUD(state, ui) {
  const p = state.player;
  const w = WEAPONS[p.loadout.current];
  const held = p.loadout.weapons[p.loadout.current];

  setText(els['score-van'], String(state.score.vanguard));
  setText(els['score-sen'], String(state.score.sentinel));
  setText(els['round-label'], `ROUND ${state.round}`);
  const clock = state.bomb.state === 'planted' ? state.bomb.fuseLeft : state.roundLeft;
  const mins = Math.floor(Math.max(0, clock) / 60);
  const secs = Math.floor(Math.max(0, clock) % 60);
  setText(els.timer, `${mins}:${String(secs).padStart(2, '0')}`);
  els.timer.style.color = state.bomb.state === 'planted' ? UI.danger : UI.ink;

  setText(els['zone-name'], zoneAt(p.x, p.z).toUpperCase());
  const exec = executeStatus(state);
  setText(els['execute-line'], exec === 'staging' ? '· TEAM STAGING' : exec === 'execute' ? `· EXECUTE ${state.tactics.attackSite}` : '');

  let bombText = '';
  if (state.bomb.state === 'planted') bombText = `💣 BOMB PLANTED — SITE ${state.bomb.site}`;
  else if (state.bomb.state === 'carried') bombText = '💣 BOMB CARRIED — PLANT AT A OR B';
  setText(els['bomb-line'], bombText);
  setDisplay(els['bomb-line'], bombText !== '');

  setText(els.health, String(Math.max(0, Math.ceil(p.health))));
  setWidth(els['health-fill'], Math.max(0, p.health));
  els['health-fill'].style.background = p.health < 30 ? UI.danger : p.health < 60 ? UI.amber : UI.good;
  setText(els.money, `$${state.money}`);
  setText(els['weapon-name'], w ? w.name : '—');
  setText(els['ammo-mag'], held ? String(held.mag) : '—');
  setText(els['ammo-reserve'], held ? String(held.reserve) : '—');
  els['ammo-mag'].style.color = held && held.mag <= Math.ceil(w.mag * 0.25) ? UI.danger : UI.ink;

  const g = p.loadout.grenades;
  const parts = [];
  for (const id of ['he', 'smoke', 'flash']) {
    if (g[id] > 0) {
      const sel = p.loadout.grenadeSelected === id;
      parts.push(`<span class="${sel ? 'gren-sel' : ''}">${GRENADES[id].name} ×${g[id]}</span>`);
    }
  }
  const grenadeHtml = parts.length ? parts.join(' ') : '<span class="dim">No grenades — press B to buy</span>';
  if (last.grenades !== grenadeHtml) {
    els['grenade-line'].innerHTML = grenadeHtml;
    last.grenades = grenadeHtml;
  }

  const channel = ui.channel || 0;
  setDisplay(els['channel-bar'], channel > 0);
  if (channel > 0) {
    setWidth(els['channel-fill'], channel * 100);
    setText(els['channel-label'], ui.channelLabel || '');
  }

  const feedHtml = state.feed
    .filter((f) => state.time - f.at < 6)
    .map((f) => `<div class="feed-item ${f.good ? 'feed-good' : 'feed-bad'}">${f.text}</div>`)
    .join('');
  if (last.feed !== feedHtml) {
    els.feed.innerHTML = feedHtml;
    last.feed = feedHtml;
  }

  const hitAge = state.time - state.hitmarkAt;
  setDisplay(els.hitmarker, hitAge < 0.15);
  els.hitmarker.classList.toggle('hit-kill', state.hitmarkKill && hitAge < 0.15);

  if (state.hitDir && state.time - state.hitDir.at < 1.2) {
    const age = state.time - state.hitDir.at;
    setDisplay(els.hitdir, true);
    setOpacity(els.hitdir, 1 - age / 1.2);
    const arc = els.hitdir.querySelector('.hd-arc');
    arc.style.transform = `rotate(${state.hitDir.angle}rad)`;
  } else {
    setDisplay(els.hitdir, false);
  }

  setDisplay(els.crosshair, !p.loadout.scoped && state.phase !== 'menu');
  setDisplay(els['scope-overlay'], !!p.loadout.scoped);

  setOpacity(els['damage-vignette'], Math.min(0.7, state.flash));
  setOpacity(els.whiteout, Math.min(1, state.whiteout));

  let hint = '';
  if (state.phase === 'freeze') hint = 'Buy phase — press B to open the shop, or wait for the round to start';
  else if (ui.channel > 0) hint = ui.channelLabel || '';
  else if (state.bomb.state === 'carried' && p.alive) hint = 'Hold E on a site to plant the bomb · G throws a grenade · B buys';
  setText(els['hint-line'], hint);
}

export function showRoundBanner(state) {
  const winner = state.roundWinner === 'vanguard' ? 'VANGUARD WINS' : 'SENTINELS WIN';
  els.banner.innerHTML = `<div class="banner-title ${state.roundWinner}">${winner}</div><div class="banner-reason">${state.roundReason}</div>`;
  els.banner.style.display = 'block';
  const mvp = state.roundMvp;
  if (mvp) {
    els['mvp-banner'].innerHTML = `<div class="mvp-title">★ ROUND MVP — ${mvp.name.toUpperCase()}</div><div class="mvp-line">${mvp.line} · ${mvp.score} pts</div>`;
    els['mvp-banner'].style.display = 'block';
  }
}

export function hideBanner() {
  els.banner.style.display = 'none';
  els['mvp-banner'].style.display = 'none';
}

// ---------------------------------------------------------------- buy menu

export function renderBuyMenu(state, options, onBuy) {
  const rows = options.map((o) => {
    const disabled = o.owned || !o.affordable;
    const tag = o.owned ? 'OWNED' : o.affordable ? '' : 'NO FUNDS';
    return `
      <button class="buy-item ${disabled ? 'buy-disabled' : ''}" data-kind="${o.kind}" data-id="${o.id}" ${disabled ? 'disabled' : ''}>
        <span class="buy-name">${o.name}</span>
        <span class="buy-blurb">${o.blurb}</span>
        <span class="buy-price">$${o.price}</span>
        <span class="buy-tag">${tag}</span>
      </button>`;
  }).join('');
  els['buy-menu'].innerHTML = `
    <div class="buy-panel">
      <div class="buy-header"><span>BUY MENU</span><span class="buy-money">$${state.money}</span></div>
      <div class="buy-grid">${rows}</div>
      <div class="buy-footer">B or ESC to close · weapons persist between rounds · one grenade per type</div>
    </div>`;
  els['buy-menu'].style.display = 'block';
  els['buy-menu'].querySelectorAll('.buy-item').forEach((btn) => {
    btn.addEventListener('click', () => onBuy(btn.dataset.kind, btn.dataset.id));
  });
}

export function hideBuyMenu() {
  els['buy-menu'].style.display = 'none';
}

// ---------------------------------------------------------------- screens

export function showMenuScreen(onStart) {
  els['menu-screen'].innerHTML = `
    <div class="menu-panel">
      <div class="menu-kicker">MAKE.FUN · THREE.JS FPS</div>
      <h1 class="menu-title">DUSTFALL <span>II</span></h1>
      <div class="menu-sub">Kestrel Yard at last light. First to 8 rounds.</div>
      <div class="menu-cols">
        <div>
          <h3>YOUR JOB</h3>
          <p>You're Vanguard — the attackers. Plant the bomb at site A or B, or eliminate all four Sentinels. Rook and Sable fight beside you; the team stages, then executes together.</p>
          <h3>THE YARD</h3>
          <p>Five lanes, a second mid through Service, and the Overlook deck above mid — a sniper's perch with a ramp up from the west.</p>
        </div>
        <div>
          <h3>CONTROLS</h3>
          <p><b>WASD</b> move · <b>Mouse</b> aim · <b>Click</b> fire · <b>Right-click</b> scope · <b>R</b> reload · <b>1–5</b> weapons · <b>Q</b> last weapon · <b>G</b> grenade · <b>Wheel</b> pick grenade · <b>E</b> plant · <b>Space</b> jump · <b>Shift</b> crouch · <b>B</b> buy</p>
          <h3>THE ARSENAL</h3>
          <p><b>P9</b> free · <b>VK-47</b> $2,700 · <b>Kestrel-9</b> $1,500 · <b>Dune-12</b> $1,900 · <b>Longbow-7</b> $4,200 · <b>HE</b> $300 · <b>Smoke</b> $350 · <b>Flash</b> $250</p>
        </div>
      </div>
      <button id="start-btn">CLICK TO DEPLOY</button>
      <div class="menu-foot">Best in Chrome · pointer lock required · sound on for footsteps and callouts</div>
    </div>`;
  els['menu-screen'].style.display = 'flex';
  document.getElementById('start-btn').addEventListener('click', onStart);
}

export function hideMenuScreen() {
  els['menu-screen'].style.display = 'none';
}

export function showMatchEnd(state, onRestart) {
  const winner = state.score.vanguard >= 8 ? 'VANGUARD' : 'SENTINELS';
  const won = winner === 'VANGUARD';
  const ms = state.matchStats;
  els['menu-screen'].innerHTML = `
    <div class="menu-panel">
      <div class="menu-kicker">MATCH OVER</div>
      <h1 class="menu-title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h1>
      <div class="menu-sub">${winner} takes Kestrel Yard — ${state.score.vanguard} : ${state.score.sentinel}</div>
      <div class="menu-stats">
        <div><span class="stat-num">${ms.kills}</span><span class="stat-label">KILLS</span></div>
        <div><span class="stat-num">${ms.deaths}</span><span class="stat-label">DEATHS</span></div>
        <div><span class="stat-num">${ms.damage}</span><span class="stat-label">DAMAGE</span></div>
        <div><span class="stat-num">${ms.plants}</span><span class="stat-label">PLANTS</span></div>
        <div><span class="stat-num">${ms.defuses}</span><span class="stat-label">DEFUSES</span></div>
      </div>
      <button id="start-btn">PLAY AGAIN</button>
    </div>`;
  els['menu-screen'].style.display = 'flex';
  document.getElementById('start-btn').addEventListener('click', onRestart);
}
