// DUSTFALL II — small math helpers shared by the sim and the renderer.
// The hot paths reuse scratch values instead of allocating: no new
// vectors are made per frame in movement, shooting or bot updates. All
// boxes here are {x0, z0, x1, z1, base, top}: base defaults to 0 and lets
// walls sit on the raised overlook deck.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Shortest signed turn from `from` toward `to`, in [-PI, PI].
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

// Deterministic PRNG (mulberry32): bot behaviour and spread patterns are
// reproducible from a seed. The sim seeds it once per match.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D distance squared on the ground plane (avoids a sqrt in hot checks).
export function dist2XZ(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

// Ray vs axis-aligned box (slab method), spanning [base, top] in Y.
// Returns the distance along the ray to the first hit, or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxDist) {
  const base = box.base ?? 0;
  let tmin = 0;
  let tmax = maxDist;
  // X slab
  if (dx === 0) {
    if (ox < box.x0 || ox > box.x1) return Infinity;
  } else {
    const inv = 1 / dx;
    let t0 = (box.x0 - ox) * inv;
    let t1 = (box.x1 - ox) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return Infinity;
  }
  // Y slab (base .. top)
  if (dy === 0) {
    if (oy < base || oy > box.top) return Infinity;
  } else {
    const inv = 1 / dy;
    let t0 = (base - oy) * inv;
    let t1 = (box.top - oy) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return Infinity;
  }
  // Z slab
  if (dz === 0) {
    if (oz < box.z0 || oz > box.z1) return Infinity;
  } else {
    const inv = 1 / dz;
    let t0 = (box.z0 - oz) * inv;
    let t1 = (box.z1 - oz) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Ray vs sphere. Returns the distance to the near hit, or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tca - Math.sqrt(r2 - d2);
  return t >= 0 && t <= maxDist ? t : Infinity;
}

// Circle (x,z,r) vs AABB push-out, height-aware: the box only collides
// when the agent's vertical span [feetY, feetY + height] overlaps the
// box's [base, top] — so agents pass under the deck while its parapet
// still blocks agents standing on it. Mutates pos; returns true on push.
export function circleBoxResolve(pos, r, box, feetY, height) {
  const base = box.base ?? 0;
  if (feetY + height < base || feetY > box.top) return false;
  const cx = clamp(pos.x, box.x0, box.x1);
  const cz = clamp(pos.z, box.z0, box.z1);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
    return true;
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = pos.x - box.x0 + r;
  const pr = box.x1 - pos.x + r;
  const pt = pos.z - box.z0 + r;
  const pb = box.z1 - pos.z + r;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) pos.x = box.x0 - r;
  else if (m === pr) pos.x = box.x1 + r;
  else if (m === pt) pos.z = box.z0 - r;
  else pos.z = box.z1 + r;
  return true;
}

// Point inside an AABB (XZ test only).
export function pointInBox(x, z, box) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

// Yaw (sim convention: 0 faces -Z, PI/2 faces +X) pointing from (x0,z0)
// toward (x1,z1).
export function yawToward(x0, z0, x1, z1) {
  return Math.atan2(x1 - x0, -(z1 - z0));
}
