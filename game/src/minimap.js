// DUSTFALL II — the minimap. A small canvas in the top-left corner,
// redrawn every frame from the same map data the sim uses: walls,
// crates, the deck, the two sites, the bomb, and every living agent
// (allies blue, enemies red only while visible to the player — the map
// never shows what the player cannot know). The player's view cone
// rotates with their yaw, and the main callout zones are labelled.

import { WALLS, CRATES, SITES, MAP_BOUNDS, DECK, ZONES } from './yard.js';
import { PALETTE } from './palette.js';

const SIZE = 190;
const PAD = 8;

let canvas = null;
let g = null;

export function buildMinimap() {
  canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.id = 'minimap';
  document.getElementById('hud').appendChild(canvas);
  g = canvas.getContext('2d');
}

function toMap(x, z) {
  const b = MAP_BOUNDS;
  const sx = (SIZE - PAD * 2) / (b.x1 - b.x0);
  const sz = (SIZE - PAD * 2) / (b.z1 - b.z0);
  return {
    x: PAD + (x - b.x0) * sx,
    y: PAD + (z - b.z0) * sz,
    sx,
    sz,
  };
}

function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function drawMinimap(state) {
  if (!g) return;
  const b = MAP_BOUNDS;
  g.clearRect(0, 0, SIZE, SIZE);
  g.fillStyle = 'rgba(18, 16, 15, 0.72)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(239, 233, 221, 0.25)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);

  const tl = toMap(b.x0, b.z0);
  const br = toMap(b.x1, b.z1);
  g.fillStyle = '#4a3826';
  g.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const a = toMap(s.x0, s.z0);
    const c = toMap(s.x1, s.z1);
    g.fillStyle = hex(s.color);
    g.globalAlpha = 0.45;
    g.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
    g.globalAlpha = 1;
    g.fillStyle = '#efe9dd';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(key, (a.x + c.x) / 2, (a.y + c.y) / 2 + 4);
  }

  g.fillStyle = '#c9bfae';
  for (const w of WALLS) {
    const a = toMap(w.x0, w.z0);
    const c = toMap(w.x1, w.z1);
    g.fillRect(a.x, a.y, Math.max(1, c.x - a.x), Math.max(1, c.y - a.y));
  }
  g.fillStyle = '#8a6b40';
  for (const c of CRATES) {
    const a = toMap(c.x0, c.z0);
    const d = toMap(c.x1, c.z1);
    g.fillRect(a.x, a.y, Math.max(1, d.x - a.x), Math.max(1, d.y - a.y));
  }
  const da = toMap(DECK.x0, DECK.z0);
  const db = toMap(DECK.x1, DECK.z1);
  g.fillStyle = 'rgba(120, 140, 180, 0.85)';
  g.fillRect(da.x, da.y, db.x - da.x, db.y - da.y);
  g.fillStyle = '#dfe6f2';
  g.font = '7px system-ui, sans-serif';
  g.fillText('OVERLOOK', (da.x + db.x) / 2, (da.y + db.y) / 2 + 3);

  g.fillStyle = 'rgba(239, 233, 221, 0.55)';
  g.font = '7px system-ui, sans-serif';
  const labels = [
    ['A LONG', -18, -16], ['MID', 0, 0], ['SERVICE', 0, 8],
    ['B LONG', 18, 16], ['CONNECTOR', 0, -11],
  ];
  for (const [text, x, z] of labels) {
    const p = toMap(x, z);
    g.fillText(text, p.x, p.y);
  }

  if (state.bomb.state === 'planted') {
    const p = toMap(state.bomb.x, state.bomb.z);
    const blink = Math.floor(state.time * 3) % 2 === 0;
    g.fillStyle = blink ? '#ff5a3c' : '#ffd23c';
    g.beginPath();
    g.arc(p.x, p.y, 4, 0, 7);
    g.fill();
  }

  const p = state.player;
  const all = [p, ...state.agents];
  for (const a of all) {
    if (!a.alive) continue;
    const isPlayer = a.id === 'you';
    const isAlly = a.team === 'vanguard';
    if (!isPlayer && !isAlly) {
      const spotted = state.agents.some(
        (bot) => bot.team === 'vanguard' && bot.bot && bot.bot.targetId === a.id && state.time - bot.bot.seenAt < 2,
      );
      if (!spotted) continue;
    }
    const pos = toMap(a.x, a.z);
    const color = isPlayer ? '#ffffff' : isAlly ? '#3d8fd1' : '#d95f33';
    g.fillStyle = color;
    g.beginPath();
    g.arc(pos.x, pos.y, isPlayer ? 4 : 3, 0, 7);
    g.fill();
    if (isPlayer) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pos.x, pos.y);
      const cone = 0.6;
      for (const off of [-cone, cone]) {
        const yaw = a.yaw + off;
        g.lineTo(pos.x + Math.sin(yaw) * 14, pos.y - Math.cos(yaw) * 14);
      }
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(pos.x, pos.y);
      g.lineTo(pos.x + Math.sin(a.yaw) * 8, pos.y - Math.cos(a.yaw) * 8);
      g.stroke();
    }
  }
}
