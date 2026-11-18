/* Where every day lives in the garden.
 *
 * The hundred flowers form one even, leaf-shaped field that follows a winding path. "Even" is the point:
 * seeds are scattered with a low-discrepancy sequence and then pushed apart until every flower keeps
 * (about) the same breathing room from its neighbours, measured in flower sizes. That gives a steady density with no
 * clumps and no holes, and, seen from above, heads that almost never overlap. The path is only a slightly
 * wider lane in the same rhythm. Days are numbered by depth, so day 1 stands at the entrance and day 100 in the
 * far end, and neighbouring days are neighbours in space. Deterministic: a day never moves.  */
import { clamp, hash, smoothstep } from "./utils.js";

export const GARDEN = {
  entranceZ: -3,        // z of day 1's end of the field
  length: 82,           // distance from the entrance to the far end of the field
  depthCurve: 0.8,      // maps the walk (0..1) onto depth
  corridor: 1.7,        // half-width of the walking lane (plus the flowers' own size)
  size: 1.25,           // overall flower size
  spacing: 1.42,        // centre distance between two flowers = spacing x (sum of their sizes): just enough that top-view heads never touch
};

// the winding path the camera follows (x as a function of z). Straight at the entrance, then it meanders.
export const pathX = (z) => Math.sin(-z * 0.075 + 0.5) * 9 * smoothstep(8, 46, -z);

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

export const CLEARINGS = [];          // (none any more: no empty rooms in the field)

export function layoutFlowers(total, { narrow = false } = {}) {
  const { entranceZ: z0, length: L, corridor, spacing: K } = GARDEN, size = GARDEN.size * (narrow ? 1.18 : 1);

  // 1. the flowers (sizes vary only a little: an even field has an even rhythm)
  const pts = [];
  for (let i = 0; i < total; i++) {
    const r = (k) => hash(i + 1, k);
    pts.push({
      i, x: 0, z: 0, day: 0, group: 0, step: 0,
      scale: size * (1 + 0.26 * r(3)),
      stem: 3.1 + 2.4 * r(4),
      lean: (r(5) - 0.5) * 0.16, leanDir: r(6) * Math.PI * 2,
      yaw: (r(7) - 0.5) * 0.7, phase: r(8) * Math.PI * 2,
    });
  }

  // 2. the field: a leaf-shaped band around the path. Its width is set so the flowers just fit at their own spacing.
  const shape = (u) => Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.55) * (1 + 0.07 * Math.sin(u * 17 + 1.3));
  const need = pts.reduce((s, f) => s + 3.46 * K * K * f.scale * f.scale, 0) + L * 2 * (corridor + size);        // hex-packed area + the lane
  let mean = 0; for (let k = 0; k < 400; k++) mean += shape((k + 0.5) / 400) / 400;
  const wMax = (need * 1.04) / (2 * L * mean);
  const halfWidth = (z) => Math.max(3, wMax * shape((z0 - z) / L));

  // 3. seeds: an even spread (R2 sequence), mapped into the band so the density is the same everywhere
  const cdf = new Float32Array(401); for (let k = 0; k < 400; k++) cdf[k + 1] = cdf[k] + shape((k + 0.5) / 400);
  const inv = (u) => { const t = u * cdf[400]; let k = 0; while (k < 399 && cdf[k + 1] < t) k++; return (k + (t - cdf[k]) / (cdf[k + 1] - cdf[k])) / 400; };
  pts.forEach((f, i) => {
    const u = (0.5 + i * 0.7548776662) % 1, v = (0.5 + i * 0.5698402910) % 1;
    f.z = z0 - L * inv(u); f.x = pathX(f.z) + (v * 2 - 1) * halfWidth(f.z) * 0.92;
  });

  // 4. relax: every pair keeps its distance (K x the sum of their sizes), nobody leaves the band, the lane stays open
  const inside = (f) => {
    const px = pathX(f.z), w = halfWidth(f.z) - 0.4 * f.scale, lane = corridor + 0.95 * f.scale;
    let dx = f.x - px;
    if (Math.abs(dx) < lane) dx = (dx >= 0 ? 1 : -1) * lane;
    if (Math.abs(dx) > w) dx = Math.sign(dx) * Math.max(w, lane);
    f.x = px + dx; f.z = clamp(f.z, z0 - L + 0.5 * f.scale, z0 - 0.5 * f.scale);
  };
  const ITER = 600;
  for (let it = 0; it < ITER; it++) {
    const step = 0.55 * (1 - 0.5 * (it / ITER));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dx = b.x - a.x, dz = b.z - a.z, D = K * (a.scale + b.scale);
      if (Math.abs(dx) > D || Math.abs(dz) > D) continue;
      const d2 = dx * dx + dz * dz; if (d2 >= D * D) continue;
      const d = Math.sqrt(d2) || 0.01, push = (D - d) * 0.5 * step;
      a.x -= (dx / d) * push; b.x += (dx / d) * push; a.z -= (dz / d) * push; b.z += (dz / d) * push;
    }
    for (const f of pts) inside(f);
  }

  // 5. number the days by depth (with a little noise so neighbouring rows mingle): day 1 at the entrance
  const order = pts.slice().sort((a, b) => (b.z + (hash(b.i, 9) - 0.5) * 5) - (a.z + (hash(a.i, 9) - 0.5) * 5));
  order.forEach((f, k) => { f.day = k + 1; f.t = k / Math.max(1, total - 1); f.y = terrainHeight(f.x, f.z); });
  const out = pts.slice().sort((a, b) => a.day - b.day);
  out.groups = [];
  out.field = { halfWidth, wMax };
  return out;
}

// bounding box of the whole field (used to frame the bird's-eye view)
export function fieldBounds(layout) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of layout) { x0 = Math.min(x0, f.x - f.scale); x1 = Math.max(x1, f.x + f.scale); z0 = Math.min(z0, f.z - f.scale); z1 = Math.max(z1, f.z + f.scale); }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
