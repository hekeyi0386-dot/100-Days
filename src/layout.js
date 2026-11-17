/* Where every day lives in the garden.
 *
 * Time becomes space: day 1 stands at the entrance, day 100 in the deepest part (z follows t^0.8, so
 * later days sit closer together). The garden is a meadow, not rows: a winding path, a few dense
 * clusters, a few open clearings and sparse stretches in between. Positions are deterministic, so a
 * day never moves when other days are added. */
import { clamp, hash, smoothstep } from "./utils.js";

export const GARDEN = {
  entranceZ: -3,        // z of day 1
  length: 128,          // distance from day 1 to day 100
  depthCurve: 0.8,      // <1 => denser towards the back
  corridor: 2.5,        // half-width of the walking path kept clear
};

// the winding path the camera follows (x as a function of z). Straight at the entrance, then it meanders.
export const pathX = (z) => Math.sin(-z * 0.062 + 0.5) * 15 * smoothstep(8, 55, -z);

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

// Dense clumps of days (t along the garden, side of the path, distance from it) ...
const CLUSTERS = [
  { t: 0.07, side: 1, off: 11 },  { t: 0.19, side: -1, off: 13 }, { t: 0.33, side: 1, off: 14 },
  { t: 0.47, side: -1, off: 12 }, { t: 0.60, side: 1, off: 13 },  { t: 0.73, side: -1, off: 14 },
  { t: 0.86, side: 1, off: 12 },  { t: 0.96, side: -1, off: 11 },
];
// ... and open clearings where nothing grows (the negative space)
export const CLEARINGS = [
  { t: 0.26, side: -1, off: 19, r: 7.5 }, { t: 0.55, side: -1, off: 20, r: 8.5 }, { t: 0.80, side: 1, off: 19, r: 7 },
].map((c) => { const z = zOfT(c.t); return { x: pathX(z) + c.side * c.off, z, r: c.r }; });

export function layoutFlowers(total, { narrow = false } = {}) {
  const out = [], W = narrow ? 0.55 : 1;
  const clusters = CLUSTERS.map((c) => { const z = zOfT(c.t); return { ...c, z, x: pathX(z) + c.side * c.off * W }; });
  for (let day = 1; day <= total; day++) {
    const r = (k) => hash(day, k);
    const t = (day - 1) / (total - 1);
    let z = zOfT(t) + (r(1) - 0.5) * 2 * (1 + 3 * t), x;
    const cl = clusters.find((c) => Math.abs(c.t - t) < 0.055);
    if (cl && r(10) < 0.78) {
      // join the nearby clump (gaussian-ish scatter around its centre)
      const g = () => (r(11) + r(12) + r(13) - 1.5) * 2;
      x = cl.x + g() * 5.2 * W; z = cl.z + (r(14) + r(15) - 1) * 6;
    } else {
      // free scatter along the path: alternate sides so both halves of the view stay balanced
      const side = (day + (r(9) > 0.8 ? 1 : 0)) % 2 ? 1 : -1, reach = (6 + 15 * Math.pow(r(2), 0.8)) * W;
      x = pathX(z) + side * (GARDEN.corridor + 1 + reach);
    }
    out.push({
      day, t, x, z,
      scale: (1.12 + 0.62 * r(3)) * (1 + 0.45 * t) * (narrow ? 1.28 : 1),
      stem: 3.1 + 2.4 * r(4),
      lean: (r(5) - 0.5) * 0.16,
      leanDir: r(6) * Math.PI * 2,
      yaw: (r(7) - 0.5) * 0.7,
      phase: r(8) * Math.PI * 2,
    });
  }
  // relax: keep the path clear, stay out of the clearings, and let heads touch only a little
  const keepPath = (f) => { const dx = f.x - pathX(f.z), m = GARDEN.corridor + f.scale; if (Math.abs(dx) < m) f.x = pathX(f.z) + (dx >= 0 ? 1 : -1) * m; };
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j], dx = b.x - a.x, dz = b.z - a.z;
      const min = (a.scale + b.scale) * 0.98 + 0.7, d2 = dx * dx + dz * dz;
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
  return out;
}

// bounding box of the whole field (used to frame the bird's-eye view)
export function fieldBounds(layout) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of layout) { x0 = Math.min(x0, f.x - f.scale); x1 = Math.max(x1, f.x + f.scale); z0 = Math.min(z0, f.z - f.scale); z1 = Math.max(z1, f.z + f.scale); }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
