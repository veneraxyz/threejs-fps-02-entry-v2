// DUSTFALL II — navigation: the waypoint graph bots walk, plus the
// route tables tactics.js plans with. The graph covers every lane,
// including the second mid (Service) and the overlook deck, so bots can
// flank, rotate and execute through the whole yard. Edges are symmetric
// and every edge is a walkable straight line (no wall crosses one).

// Node indices are stable: tactics.js and brains.js name them by role.
export const WAYPOINTS = [
  { x: -25, z: 0 }, // 0 VAN spawn
  { x: -22, z: -17 }, // 1 A-long W
  { x: -15, z: -17 }, // 2 A-long E
  { x: -12, z: -12 }, // 3 A site
  { x: -14, z: -14 }, // 4 A site N
  { x: -14, z: 0 }, // 5 mid W
  { x: 4, z: 0 }, // 6 mid doors (east of the pillars)
  { x: 14, z: 0 }, // 7 mid E
  { x: 24, z: 0 }, // 8 SEN spawn
  { x: 0, z: -10 }, // 9 connector N
  { x: 0, z: 10 }, // 10 connector S
  { x: 13, z: 17 }, // 11 B-long W
  { x: 22, z: 17 }, // 12 B-long E
  { x: 11, z: 12 }, // 13 B site
  { x: -5, z: -11 }, // 14 A connector
  { x: 6, z: 12 }, // 15 B connector
  { x: 22, z: -1 }, // 16 CT N
  { x: 22, z: 8 }, // 17 CT S
  { x: 0, z: -6 }, // 18 ramp foot
  { x: 6, z: -6 }, // 19 overlook deck
  { x: -8, z: 8 }, // 20 service W
  { x: 4, z: 8 }, // 21 service gate
  { x: 8, z: 8 }, // 22 service E
  { x: -20, z: 8 }, // 23 service approach
  { x: 18, z: 10 }, // 24 B-long corner
  { x: -22, z: -1 }, // 25 A-long fork
  { x: 22, z: -10 }, // 26 CT far N (between the NE and E-mid buildings)
];

export const WAY_EDGES = [
  [0, 1], [0, 5], [0, 23], [1, 2], [2, 3], [2, 4], [3, 4], [3, 14], [4, 14],
  [5, 6], [6, 7], [7, 8], [6, 9], [6, 10], [9, 14], [10, 15],
  [10, 11], [11, 13], [11, 12], [12, 17], [13, 15], [13, 17],
  [8, 16], [8, 17], [7, 16], [16, 26], [26, 9], [1, 25], [25, 5],
  // Overlook: up the ramp from mid, deck node overlooks mid + connector
  [18, 19], [18, 9], [18, 6],
  // Service lane: the second mid route
  [23, 20], [20, 21], [21, 22], [22, 15], [22, 24], [20, 10], [21, 10],
  [24, 13], [24, 17], [23, 5],
];

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of WAY_EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

// Breadth-first path between waypoint indices. Returns an array of node
// indices including start and goal, or null when unreachable.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Int16Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const next of ADJ[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let n = to;
        while (n !== from) {
          n = prev[n];
          path.push(n);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// A path from a position to a waypoint, going through the nearest node
// first. Returns node indices (the first is the nearest node, not the
// caller's position — the caller walks to it directly).
export function pathFrom(x, z, goal) {
  const from = nearestWaypoint(x, z);
  return findPath(from, goal) || [goal];
}

// Routes each role walks at round start (waypoint indices).
export const ROUTES = {
  siteA: [16, 26, 9, 14, 4], // defender to A, watching A-long
  siteB: [17, 13], // defender to B
  overlook: [16, 26, 9, 18, 19], // defender up the ramp to the deck
  mid: [16, 6, 9, 6], // mid defender, patrolling the doors
  attackA: [1, 2, 3], // attacker straight down A-long
  attackB: [5, 6, 10, 11, 13], // attacker through mid to B
  attackService: [23, 20, 21, 22, 13], // attacker through the service lane
  roam: [6, 9, 18, 6],
};

// Where a role holds, and which waypoint it faces while holding.
export const HOLDS = {
  siteA: { at: 4, face: 2 },
  siteB: { at: 13, face: 11 },
  overlook: { at: 19, face: 6 }, // watches mid doors from the deck
  mid: { at: 6, face: 5 },
  attackA: { at: 3, face: 14 },
  attackB: { at: 13, face: 15 },
  attackService: { at: 13, face: 22 },
  roam: { at: 6, face: 0 },
};

// Flank routes: when a teammate is fighting at `from`, a flanker takes
// one of these to come at the same fight from another angle. Each entry
// lists waypoint indices from the flanker to the fight's far side.
export const FLANK_ROUTES = {
  A: [14, 4, 3], // through the connector onto A site
  B: [15, 22, 13], // through service onto B site
  mid: [9, 6, 7], // over the connector into mid
};

// Staging points where attackers gather before a coordinated execute.
export const STAGING = {
  A: 1, // A-long west, out of sight of the site
  B: 20, // service west, covered from B-long
};

// Retreat points: where a pressed bot falls back to regroup.
export const FALLBACK = {
  vanguard: 5, // mid west, near spawn
  sentinel: 8, // CT spawn
};
