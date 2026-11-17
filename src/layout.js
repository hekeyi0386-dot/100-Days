/* Where every day lives in the garden.
 *
 * Time becomes space: day 1 stands at the entrance, day 100 in the deepest part.
 * Depth (z) follows t^0.8, so the later days are packed closer together and the garden
 * grows denser the further you walk. Laterally the garden widens as it deepens, with a
 * gentle meander, and a narrow corridor down the middle is kept clear for the camera. */
import { clamp, hash, smoothstep } from "./utils.js";

export const GARDEN = {
  entranceZ: -3,        // z of day 1
  length: 176,          // distance from day 1 to day 100
  depthCurve: 0.8,      // <1 => denser towards the back
  corridor: 2.7,        // half-width kept clear for the camera
};

// Rolling ground. Flat near the entrance, gently rising and more sculpted further in.
export function terrainHeight(x, z) {
  const depth = smoothstep(0, 110, -z);
  const hills = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.031 + 0.4) * 1.5
              + Math.sin(x * 0.105 - z * 0.066) * 0.55
              + Math.sin(z * 0.022 + x * 0.019) * 1.25;
  return hills * (0.3 + 0.7 * depth) + Math.max(0, -z) * 0.014 - Math.exp(-(x * x) / 40) * 0.35 * smoothstep(0, 30, -z);
}

export const zOfT = (t) => GARDEN.entranceZ - GARDEN.length * Math.pow(t, GARDEN.depthCurve);
export const tOfZ = (z) => Math.pow(clamp((GARDEN.entranceZ - z) / GARDEN.length, 0, 1), 1 / GARDEN.depthCurve);

export function layoutFlowers(total, { narrow = false } = {}) {
  const out = [];
  for (let day = 1; day <= total; day++) {
    const r = (k) => hash(day, k);
    const t = (day - 1) / (total - 1);
    const z = zOfT(t) + (r(1) - 0.5) * 2 * (1.2 + 3.6 * t);
    const meander = 3.4 * Math.sin(t * 6.1 + 0.6);
    const width = (13 + 30 * Math.pow(t, 0.5)) * (narrow ? 0.5 : 1);   // the garden widens as it deepens
    // alternate sides (with a little disorder) so the two halves of the view stay balanced
    const side = ((day + (r(9) > 0.8 ? 1 : 0)) % 2 ? 1 : -1);
    let x = meander * (narrow ? 0.5 : 1) + side * (GARDEN.corridor + 1.2 + r(2) * Math.max(1, width - GARDEN.corridor));
    out.push({
      day, t, x, z,
      scale: (1.12 + 0.62 * r(3)) * (1 + 0.45 * t) * (narrow ? 1.28 : 1),            // far days a little larger so they still read
      stem: 3.1 + 2.4 * r(4),
      lean: (r(5) - 0.5) * 0.16,
      leanDir: r(6) * Math.PI * 2,
      yaw: (r(7) - 0.5) * 0.7,
      phase: r(8) * Math.PI * 2,
    });
  }
  // keep the walking corridor clear, then relax overlaps so heads never touch
  for (const f of out) {
    const side = f.x >= 0 ? 1 : -1;
    if (Math.abs(f.x) < GARDEN.corridor + f.scale) f.x = side * (GARDEN.corridor + f.scale + hash(f.day, 20) * 1.6);
  }
  for (let it = 0; it < 90; it++) {
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j], dx = b.x - a.x, dz = (b.z - a.z) * 1.35;
      const min = (a.scale + b.scale) * 1.15 + 0.9, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01, push = (min - d) * 0.5;
      a.x -= (dx / d) * push; b.x += (dx / d) * push;
      a.z -= (dz / d) * push / 1.35; b.z += (dz / d) * push / 1.35;
    }
    for (const f of out) {
      const side = f.x >= 0 ? 1 : -1;
      if (Math.abs(f.x) < GARDEN.corridor + f.scale) f.x = side * (GARDEN.corridor + f.scale);
    }
  }
  for (const f of out) f.y = terrainHeight(f.x, f.z);
  return out;
}
