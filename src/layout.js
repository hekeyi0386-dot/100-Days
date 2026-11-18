/* Where every day lives in the garden.
 *
 * Time becomes space: day 1 stands at the entrance, day 100 in the deepest part. The hundred days are
 * arranged as twelve small "constellations" (a ring, a crescent, a spiral, a sunflower-like cluster ...)
 * that sit on alternating sides of one winding path, so from above the garden reads as a composed star
 * map and from the ground as a walk between little flower rooms. Inside a group the days follow the shape
 * in order. Everything is deterministic: a day never moves when other days are added. */
import { clamp, hash, smoothstep } from "./utils.js";

export const GARDEN = {
  entranceZ: -3,        // z of day 1
  length: 82,           // distance from day 1 to day 100
  depthCurve: 0.8,      // <1 => later days are packed a little closer
  corridor: 2.1,        // half-width of the walking path kept clear
};

// the winding path the camera follows (x as a function of z). Straight at the entrance, then it meanders.
export const pathX = (z) => Math.sin(-z * 0.075 + 0.5) * 11 * smoothstep(8, 46, -z);

// Rolling ground. Flat near the entrance, gently rising and more sculpted further in.
export function terrainHeight(x, z) {
  const depth = smoothstep(0, 110, -z);
  const hills = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.031 + 0.4) * 1.5
              + Math.sin(x * 0.105 - z * 0.066) * 0.55
              + Math.sin(z * 0.022 + x * 0.019) * 1.25;
  const dx = x - pathX(z);
  return hills * (0.3 + 0.7 * depth) + Math.max(0, -z) * 0.014 - Math.exp(-(dx * dx) / 40) * 0.35 * smoothstep(0, 30, -z);
}

export const zOfT = (t) => GARDEN.entranceZ - GARDEN.length * Math.pow(t, GARDEN.depthCurve);
export const tOfZ = (z) => Math.pow(clamp((GARDEN.entranceZ - z) / GARDEN.length, 0, 1), 1 / GARDEN.depthCurve);

// twelve constellations, in order of time (sizes add up to 100 days)
export const GROUPS = [
  { n: 8, type: "ring" },    { n: 7, type: "arc" },     { n: 9, type: "cluster" }, { n: 8, type: "spiral" },
  { n: 10, type: "cluster" }, { n: 8, type: "ring" },   { n: 7, type: "arc" },     { n: 9, type: "cluster" },
  { n: 8, type: "spiral" },  { n: 8, type: "ring" },    { n: 9, type: "cluster" }, { n: 9, type: "ring" },
];

// two open clearings on the path itself
export const CLEARINGS = [0.3, 0.68].map((t) => { const z = zOfT(t); return { x: pathX(z), z, r: 6.5 }; });

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* points of one constellation in a local frame: x = away from the path, z = towards the entrance.
 * Later days always sit deeper (smaller z) where the shape allows it. */
function shapePoints(type, n, d0, seed) {
  const pts = [], rot = hash(seed, 5) * Math.PI * 2;
  if (type === "ring") {
    const R = Math.max(d0 * 1.15, (n * d0) / (2 * Math.PI));
    for (let i = 0; i < n; i++) { const a = rot - (i / n) * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  } else if (type === "arc") {                       // a crescent hugging the path: both ends curve towards it
    const ang = 3.1 + 0.5 * hash(seed, 6), R = (n * d0) / ang;
    for (let i = 0; i < n; i++) { const a = (0.5 - i / (n - 1)) * ang; pts.push([Math.cos(a) * R - R * 0.35, Math.sin(a) * R]); }
  } else if (type === "spiral") {
    const k = d0 * 0.4; let a = 0;
    for (let i = 0; i < n; i++) {
      const r = d0 * 0.8 + k * a; pts.push([Math.cos(a + rot) * r, Math.sin(a + rot) * r]);
      a += d0 / Math.sqrt(r * r + k * k);
    }
  } else {                                           // sunflower-like cluster, oldest day at the heart
    const c = d0 * 0.53;
    for (let i = 0; i < n; i++) { const r = c * Math.sqrt(i + 0.6), a = i * GOLDEN + rot; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  }
  return pts;
}

export function layoutFlowers(total, { narrow = false } = {}) {
  const W = narrow ? 0.6 : 1;
  // 1. what each day looks like
  const out = [];
  for (let day = 1; day <= total; day++) {
    const r = (k) => hash(day, k), t = (day - 1) / (total - 1);
    out.push({
      day, t, x: 0, z: 0, group: 0, step: 0,
      scale: (1 + 0.55 * r(3)) * (1 + 0.25 * t) * (narrow ? 1.28 : 1),
      stem: 3.1 + 2.4 * r(4),
      lean: (r(5) - 0.5) * 0.16, leanDir: r(6) * Math.PI * 2,
      yaw: (r(7) - 0.5) * 0.7, phase: r(8) * Math.PI * 2,
    });
  }

  // 2. place each constellation beside the path, alternating sides
  let at = 0;
  const groups = GROUPS.map((g, gi) => {
    const isLast = gi === GROUPS.length - 1;
    const n = isLast ? total - at : Math.min(g.n, total - at);
    const members = out.slice(at, at + n); at += n;
    if (!members.length) return { ...g, index: gi, days: [], cx: 0, cz: 0 };
    const tMid = (members[0].day - 1 + (n - 1) / 2) / (total - 1);
    const zc = zOfT(clamp(tMid, 0, 1)), side = gi % 2 ? -1 : 1;
    const avg = members.reduce((s, m) => s + m.scale, 0) / n;
    const d0 = 2.45 * avg * (0.94 + 0.18 * hash(gi, 2));                       // looser or tighter, group by group
    const psi = Math.atan((pathX(zc + 1) - pathX(zc - 1)) / 2);                // follow the path's direction
    const cs = Math.cos(psi), sn = Math.sin(psi);
    const shape = shapePoints(g.type, n, d0, gi);
    // sit right beside the path: the side of the shape that faces it just clears the walking corridor
    const reach = -Math.min(...shape.map((p) => p[0])) + GARDEN.corridor + avg * 1.0 + 0.3 + 1.4 * hash(gi, 3);
    const cx = pathX(zc) + side * reach * (narrow ? 0.85 : 1);
    shape.forEach(([lx, lz], i) => {
      const m = members[i], jx = (hash(m.day, 21) - 0.5) * d0 * 0.16, jz = (hash(m.day, 22) - 0.5) * d0 * 0.16;
      const x = side * (lx + jx), z = lz + jz;
      m.x = cx + x * cs + z * sn; m.z = zc - x * sn + z * cs; m.group = gi; m.step = i; m.ax = m.x; m.az = m.z;
    });
    return { ...g, index: gi, side, days: members.map((m) => m.day), cx, cz: zc };
  });

  // 3. relax: keep the shapes, but never let two heads collide, keep the path and the clearings open
  const keepPath = (f) => { const dx = f.x - pathX(f.z), m = GARDEN.corridor + f.scale * 0.9; if (Math.abs(dx) < m) f.x = pathX(f.z) + (dx >= 0 ? 1 : -1) * m; };
  for (let it = 0; it < 140; it++) {
    for (const f of out) { f.x += (f.ax - f.x) * 0.04; f.z += (f.az - f.z) * 0.04; }        // gentle pull back to the intended shape
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j], dx = b.x - a.x, dz = b.z - a.z;
      const min = (a.scale + b.scale) * 1.1, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01, push = (min - d) * 0.5;
      a.x -= (dx / d) * push; b.x += (dx / d) * push; a.z -= (dz / d) * push; b.z += (dz / d) * push;
    }
    for (const f of out) {
      for (const c of CLEARINGS) {
        const dx = f.x - c.x, dz = f.z - c.z, d = Math.hypot(dx, dz), m = c.r + f.scale * 0.6;
        if (d < m) { const k = (m - d) / (d || 1); f.x += dx * k; f.z += dz * k; }
      }
      keepPath(f);
    }
  }
  for (const f of out) f.y = terrainHeight(f.x, f.z);
  out.groups = groups;
  return out;
}

// bounding box of the whole field (used to frame the bird's-eye view)
export function fieldBounds(layout) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of layout) { x0 = Math.min(x0, f.x - f.scale); x1 = Math.max(x1, f.x + f.scale); z0 = Math.min(z0, f.z - f.scale); z1 = Math.max(z1, f.z + f.scale); }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
