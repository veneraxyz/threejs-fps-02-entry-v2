// DUSTFALL II — "Kestrel Yard", expanded: two bomb sites (A north-west,
// B south-east), five lanes, a second mid through Service, and the
// overlook deck above mid. The map is data first: every wall is an AABB
// the sim tests movement, bullets and sight against, and the renderer
// builds meshes from the same data — what you see is what you collide
// with. Playable area x [-28, 28], z [-20, 20]; Vanguard spawn west,
// Sentinels east. Verticality: the deck is 2.2 m up, reached by a ramp
// from the west; groundHeightAt() returns the floor under any point.
// Walls carry a `base` so the deck parapet blocks only agents on it.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { rayBox, pointInBox, clamp } from './mathx.js';

export const MAP_BOUNDS = { x0: -28, z0: -20, x1: 28, z1: 20 };
export const WALL_H = 3.4;
export const DECK_H = 2.2;

// The overlook deck (raised platform) and its ramp. The ramp runs west to
// east along z [-8,-4], rising from 0 at x=-2 to DECK_H at x=2; the deck
// spans x [2,10] at DECK_H.
export const DECK = { x0: 2, z0: -8, x1: 10, z1: -4, height: DECK_H };
export const RAMP = { x0: -2, z0: -8, x1: 2, z1: -4, height: DECK_H };

// Floor height at (x, z) for an agent whose feet are at `feetY`. The deck
// returns its height only to agents already up there; everyone else walks
// on the ground beneath it.
export function groundHeightAt(x, z, feetY) {
  if (x >= RAMP.x0 && x <= RAMP.x1 && z >= RAMP.z0 && z <= RAMP.z1) {
    const t = (x - RAMP.x0) / (RAMP.x1 - RAMP.x0);
    return t * RAMP.height;
  }
  if (x >= DECK.x0 && x <= DECK.x1 && z >= DECK.z0 && z <= DECK.z1) {
    return feetY >= DECK.height - 0.6 ? DECK.height : 0;
  }
  return 0;
}

// Full-height walls: block movement, bullets and line of sight. `base`
// defaults to 0; the deck parapet sits at base DECK_H.
export const WALLS = [
  { x0: -29, z0: -21, x1: 29, z1: -20, top: WALL_H, mat: 'concrete' },
  { x0: -29, z0: 20, x1: 29, z1: 21, top: WALL_H, mat: 'concrete' },
  { x0: -29, z0: -21, x1: -28, z1: 21, top: WALL_H, mat: 'concrete' },
  { x0: 28, z0: -21, x1: 29, z1: 21, top: WALL_H, mat: 'concrete' },
  { x0: -12, z0: -20, x1: -2, z1: -14, top: WALL_H, mat: 'concreteDark' },
  { x0: 2, z0: -20, x1: 20, z1: -12, top: WALL_H, mat: 'rust' },
  { x0: -20, z0: -8, x1: -8, z1: -2, top: WALL_H, mat: 'concrete' },
  { x0: 8, z0: -8, x1: 20, z1: -2, top: WALL_H, mat: 'concreteDark' },
  { x0: -20, z0: 12, x1: -2, z1: 20, top: WALL_H, mat: 'rust' },
  { x0: -2, z0: 14, x1: 6, z1: 20, top: WALL_H, mat: 'concrete' },
  // Mid-doors pillars flanking z=0: a 1.8 m gap straight through mid.
  { x0: -1.5, z0: -2, x1: 1.5, z1: -0.9, top: WALL_H, mat: 'steel' },
  { x0: -1.5, z0: 0.9, x1: 1.5, z1: 2, top: WALL_H, mat: 'steel' },
  // Service-lane gate at x=4, flanking z=8 (x=0 connector stays clear).
  { x0: 4.4, z0: 6, x1: 5.6, z1: 7.1, top: WALL_H, mat: 'steelDark' },
  { x0: 4.4, z0: 8.9, x1: 5.6, z1: 10, top: WALL_H, mat: 'steelDark' },
  { x0: -8, z0: 4, x1: -2, z1: 5, top: WALL_H, mat: 'concreteDark' },
  { x0: 3, z0: 4, x1: 8, z1: 5, top: WALL_H, mat: 'concreteDark' },
  { x0: -16, z0: -16, x1: -15.4, z1: -12, top: WALL_H, mat: 'teal' },
  { x0: 15.4, z0: 12, x1: 16, z1: 16, top: WALL_H, mat: 'amber' },
  // Deck parapet: low cover on the deck's south and east edges. base =
  // DECK_H, so it only collides with agents standing on the deck.
  { x0: 2, z0: -4.5, x1: 10, z1: -4, base: DECK_H, top: DECK_H + 1.1, mat: 'steel' },
  { x0: 9.5, z0: -8, x1: 10, z1: -4, base: DECK_H, top: DECK_H + 1.1, mat: 'steel' },
  { x0: 2.2, z0: -7.8, x1: 2.8, z1: -7.2, top: DECK_H, mat: 'steelDark' },
  { x0: 9.2, z0: -7.8, x1: 9.8, z1: -7.2, top: DECK_H, mat: 'steelDark' },
  // Lane dividers sit off the waypoint lines (z=-17 and z=17 stay clear).
  { x0: -18, z0: -13, x1: -17.4, z1: -11.5, top: WALL_H, mat: 'rustLight' },
  { x0: 17.4, z0: 14, x1: 18, z1: 16, top: WALL_H, mat: 'rustLight' },
];

// The deck slab itself: thin, blocks bullets only (never movement —
// agents walk on top of it and under it). Bullets test it via rayBox.
export const DECK_SLAB = { x0: DECK.x0, z0: DECK.z0, x1: DECK.x1, z1: DECK.z1, base: DECK_H - 0.25, top: DECK_H };

// Low crates: block movement only (eye-level bullets and sight pass over).
export const CRATES = [
  { x0: -13, z0: -10, x1: -11.6, z1: -8.6, top: 1.2, mat: 'crate' },
  { x0: -10, z0: -10.5, x1: -8.6, z1: -9.1, top: 1.2, mat: 'crateDark' },
  { x0: -24, z0: -17.5, x1: -22.6, z1: -16.1, top: 1.2, mat: 'crate' },
  { x0: -6, z0: -18.5, x1: -4.6, z1: -17.1, top: 1.2, mat: 'crateDark' },
  { x0: -18, z0: -3, x1: -16.6, z1: -1.6, top: 1.2, mat: 'crate' },
  { x0: 12, z0: -3, x1: 13.4, z1: -1.6, top: 1.2, mat: 'crateDark' },
  { x0: -3, z0: 6.5, x1: -1.6, z1: 7.9, top: 1.2, mat: 'crate' },
  { x0: 8, z0: 10, x1: 9.4, z1: 11.4, top: 1.2, mat: 'crate' },
  { x0: 12.6, z0: 13, x1: 14, z1: 14.4, top: 1.2, mat: 'crateDark' },
  { x0: 20, z0: 15, x1: 21.4, z1: 16.4, top: 1.2, mat: 'crate' },
  { x0: 24, z0: -4, x1: 25.4, z1: -2.6, top: 1.2, mat: 'crate' },
  { x0: -8, z0: -3.5, x1: -6.6, z1: -2.1, top: 1.2, mat: 'crateLight' },
  { x0: 5, z0: -3.5, x1: 6.4, z1: -2.1, top: 1.2, mat: 'crate' },
  { x0: -6, z0: 9.8, x1: -4.6, z1: 11.2, top: 1.2, mat: 'crateDark' },
  { x0: 3, z0: 6.5, x1: 4.4, z1: 7.9, top: 1.2, mat: 'crate' },
  { x0: -12, z0: 2, x1: -10.6, z1: 3.4, top: 1.2, mat: 'crate' },
  { x0: -7, z0: -9.5, x1: -5.6, z1: -8.1, top: 1.2, mat: 'crateDark' },
  { x0: 7, z0: 12, x1: 8.4, z1: 13.4, top: 1.2, mat: 'crateLight' },
  { x0: 16, z0: -11, x1: 17.4, z1: -9.6, top: 1.2, mat: 'crate' },
  { x0: -22, z0: 6, x1: -20.6, z1: 7.4, top: 1.2, mat: 'crateDark' },
  { x0: 18, z0: 2, x1: 19.4, z1: 3.4, top: 1.2, mat: 'crate' },
  { x0: -13.5, z0: -9.5, x1: -12.1, z1: -8.1, top: 2.2, mat: 'crateDark' },
];

// Bomb sites (plant zones, drawn on the ground).
export const SITES = {
  A: { x0: -16, z0: -16, x1: -6, z1: -8, color: PALETTE.teal, label: 'A' },
  B: { x0: 6, z0: 8, x1: 16, z1: 16, color: PALETTE.amber, label: 'B' },
};

export const SPAWNS = {
  vanguard: [
    { x: -25, z: 0, yaw: Math.PI / 2 },
    { x: -25, z: -3, yaw: Math.PI / 2 },
    { x: -25, z: 3, yaw: Math.PI / 2 },
  ],
  sentinel: [
    { x: 24, z: -4, yaw: -Math.PI / 2 },
    { x: 24, z: 0, yaw: -Math.PI / 2 },
    { x: 24, z: 4, yaw: -Math.PI / 2 },
    { x: 20, z: 8, yaw: -Math.PI / 2 },
  ],
};

// Named callout zones, checked in order (first match wins). The HUD shows
// the player's current zone and the minimap labels the main ones.
export const ZONES = [
  { name: 'A Site', x0: -17, z0: -17, x1: -5, z1: -7 },
  { name: 'B Site', x0: 5, z0: 7, x1: 17, z1: 17 },
  { name: 'Overlook', x0: 2, z0: -8, x1: 10, z1: -4 },
  { name: 'A Long', x0: -28, z0: -20, x1: -8, z1: -12 },
  { name: 'B Long', x0: 8, z0: 12, x1: 28, z1: 20 },
  { name: 'Mid Doors', x0: -4, z0: -4, x1: 4, z1: 4 },
  { name: 'Service', x0: -10, z0: 4, x1: 10, z1: 12 },
  { name: 'Connector', x0: -4, z0: -14, x1: 4, z1: -4 },
  { name: 'Mid', x0: -10, z0: -4, x1: 10, z1: 4 },
  { name: 'Vanguard Spawn', x0: -28, z0: -8, x1: -20, z1: 8 },
  { name: 'Sentinel Spawn', x0: 20, z0: -8, x1: 28, z1: 12 },
];

export function zoneAt(x, z) {
  for (const zn of ZONES) {
    if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn.name;
  }
  return 'Kestrel Yard';
}

// True when the segment from (x0,y0,z0) to (x1,y1,z1) is not blocked by a
// full-height wall or the deck slab. Crates never block sight. Smoke
// clouds (a list of {x,y,z,r}) block sight when the segment passes
// through one — pass them in, or null for a clean test.
export function hasLineOfSight(x0, y0, z0, x1, y1, z1, smokes) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const inv = 1 / len;
  for (const w of WALLS) {
    if (rayBox(x0, y0, z0, dx * inv, dy * inv, dz * inv, w, len) < len) return false;
  }
  if (rayBox(x0, y0, z0, dx * inv, dy * inv, dz * inv, DECK_SLAB, len) < len) return false;
  if (smokes) {
    for (const s of smokes) {
      if (segmentThroughSphere(x0, y0, z0, x1, y1, z1, s.x, s.y, s.z, s.r * 0.85)) return false;
    }
  }
  return true;
}

// Segment-sphere test (true when the segment passes within r of the centre).
function segmentThroughSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (len2 > 1e-9) {
    t = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / len2;
    t = clamp(t, 0, 1);
  }
  const px = ax + abx * t - cx;
  const py = ay + aby * t - cy;
  const pz = az + abz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}

// Distance from a ray origin to the nearest wall or the deck slab, or
// Infinity. The ground plane is tested by the caller.
export function raycastWalls(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const w of WALLS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, w, maxDist);
    if (t < best) best = t;
  }
  const slab = rayBox(ox, oy, oz, dx, dy, dz, DECK_SLAB, maxDist);
  if (slab < best) best = slab;
  return best;
}

export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    if (pointInBox(x, z, SITES[key])) return key;
  }
  return null;
}

// ---------------------------------------------------------------- meshes

const MATS = {};
function mat(name) {
  if (!MATS[name]) {
    const color = PALETTE[name] ?? 0xffffff;
    MATS[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04 });
  }
  return MATS[name];
}

// A canvas texture painter: speckle + stains over a base colour, with
// optional panel lines (concrete) or tyre ruts (sand). No asset files,
// no network.
function paintedTexture({ size, base, dark, light, lines, ruts, repeat }) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const specks = size === 512 ? 12000 : 4000;
  for (let i = 0; i < specks; i++) {
    g.fillStyle = Math.random() < 0.5 ? dark : light;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  for (let i = 0; i < (lines ? 8 : 30); i++) {
    g.fillStyle = 'rgba(60,44,28,0.12)';
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size, 12 + Math.random() * (lines ? 30 : 60), 14 + Math.random() * (lines ? 50 : 40), Math.random() * 3, 0, 7);
    g.fill();
  }
  if (lines) {
    g.strokeStyle = 'rgba(60,55,50,0.35)';
    g.lineWidth = 2;
    for (let y = 0; y <= size; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(size, y);
      g.stroke();
    }
  }
  if (ruts) {
    g.strokeStyle = 'rgba(50,36,22,0.25)';
    g.lineWidth = 7;
    for (const off of [-14, 14]) {
      g.beginPath();
      g.moveTo(0, 256 + off + Math.random() * 20 - 10);
      g.bezierCurveTo(170, 220 + off, 340, 290 + off, 512, 250 + off);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Dusk sand for the ground, panelled concrete for the taller walls.
function groundTexture() {
  return paintedTexture({ size: 512, base: '#8a6a4a', dark: 'rgba(70,50,32,0.28)', light: 'rgba(200,165,120,0.20)', ruts: true, repeat: [6, 4] });
}
function concreteTexture() {
  return paintedTexture({ size: 256, base: '#8f8880', dark: 'rgba(60,55,50,0.15)', light: 'rgba(200,195,185,0.12)', lines: true, repeat: [2, 1] });
}

// Build the static yard meshes into `scene`. Returns the ground plane.
export function buildYardMeshes(scene) {
  const group = new THREE.Group();
  group.name = 'yard';
  const concreteTex = concreteTexture();
  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95, metalness: 0.02 });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 42),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const base = w.base ?? 0;
    const height = w.top - base;
    const m = new THREE.Mesh(wallGeo, w.mat === 'concrete' ? concreteMat : mat(w.mat));
    m.scale.set(w.x1 - w.x0, height, w.z1 - w.z0);
    m.position.set((w.x0 + w.x1) / 2, base + height / 2, (w.z0 + w.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
      const cap = new THREE.Mesh(wallGeo, mat('concreteDark'));
    cap.scale.set(w.x1 - w.x0 + 0.06, 0.12, w.z1 - w.z0 + 0.06);
    cap.position.set((w.x0 + w.x1) / 2, w.top + 0.06, (w.z0 + w.z1) / 2);
    group.add(cap);
  }

  for (const cr of CRATES) {
    const m = new THREE.Mesh(wallGeo, mat(cr.mat));
    m.scale.set(cr.x1 - cr.x0, cr.top, cr.z1 - cr.z0);
    m.position.set((cr.x0 + cr.x1) / 2, cr.top / 2, (cr.z0 + cr.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const rim = new THREE.Mesh(wallGeo, mat('crateDark'));
    rim.scale.set(cr.x1 - cr.x0 + 0.04, 0.08, cr.z1 - cr.z0 + 0.04);
    rim.position.set((cr.x0 + cr.x1) / 2, cr.top - 0.04, (cr.z0 + cr.z1) / 2);
    group.add(rim);
  }

  const deckMat = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.6, metalness: 0.45 });
  const deckSlab = new THREE.Mesh(wallGeo, deckMat);
  deckSlab.scale.set(DECK.x1 - DECK.x0, 0.25, DECK.z1 - DECK.z0);
  deckSlab.position.set((DECK.x0 + DECK.x1) / 2, DECK_H - 0.125, (DECK.z0 + DECK.z1) / 2);
  deckSlab.castShadow = true;
  deckSlab.receiveShadow = true;
  group.add(deckSlab);
  const rampLen = Math.hypot(RAMP.x1 - RAMP.x0, RAMP.height);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.2, RAMP.z1 - RAMP.z0), deckMat);
  const rampAngle = Math.atan2(RAMP.height, RAMP.x1 - RAMP.x0);
  ramp.rotation.z = rampAngle;
  ramp.position.set((RAMP.x0 + RAMP.x1) / 2, RAMP.height / 2, (RAMP.z0 + RAMP.z1) / 2);
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  group.add(ramp);
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(DECK.x1 - DECK.x0, 0.35),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.75 }),
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set((DECK.x0 + DECK.x1) / 2, DECK_H + 0.01, DECK.z1 - 0.25);
  group.add(stripe);

  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.22 }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2);
    group.add(mark);
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0 + 0.3, s.z1 - s.z0 + 0.3),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.5 }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set((s.x0 + s.x1) / 2, 0.015, (s.z0 + s.z1) / 2);
    group.add(border);
  }

  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12);
  const barrelSpots = [
    [-23, -14, 'rust'], [-21, 14, 'tealDark'], [21, -10, 'rust'],
    [23, 12, 'amberDark'], [-4, 16, 'rust'], [4, -16, 'steelDark'],
    [-26, 10, 'rust'], [26, -14, 'tealDark'],
  ];
  for (const [bx, bz, bm] of barrelSpots) {
    const b = new THREE.Mesh(barrelGeo, mat(bm));
    b.position.set(bx, 0.52, bz);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
  }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8);
  const headGeo = new THREE.BoxGeometry(0.55, 0.18, 0.3);
  const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.lampWarm });
  for (const [lx, lz] of [[-14, -10], [14, 10], [-2, -14], [2, 14], [-24, 0], [24, 0]]) {
    const pole = new THREE.Mesh(poleGeo, mat('steelDark'));
    pole.position.set(lx, 2.3, lz);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(headGeo, lampMat);
    head.position.set(lx, 4.65, lz);
    group.add(head);
  }
  const tower = new THREE.Group();
  const legs = new THREE.CylinderGeometry(0.3, 0.5, 9, 6);
  for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    const leg = new THREE.Mesh(legs, mat('steelDark'));
    leg.position.set(ox, 4.5, oz);
    tower.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 3, 14), mat('rust'));
  tank.position.y = 10.5;
  tower.add(tank);
  tower.position.set(-36, 0, -28);
  group.add(tower);
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x6e5238, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(14 + i * 3, 12, 8), duneMat);
    const a = (i / 7) * Math.PI * 2 + 0.4;
    dune.position.set(Math.cos(a) * 62, -4, Math.sin(a) * 62);
    dune.scale.y = 0.28;
    group.add(dune);
  }

  scene.add(group);
  return ground;
}
