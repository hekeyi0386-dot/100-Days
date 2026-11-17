/* Gently rolling ground, hand-tinted per vertex (ivory -> pale sage) with a faint pale trail
 * down the middle, plus layered far hills and a soft sky dome. No textures, no realism. */
import * as THREE from "three";
import { terrainHeight, pathX, CLEARINGS } from "./layout.js";
import { hash } from "./utils.js";

export const FOG_COLOR = 0xebe9e2;

export function createTerrain({ mobile }) {
  const W = 440, D = 380, cz = -118, sx = mobile ? 90 : 150, sz = mobile ? 80 : 130;
  const geo = new THREE.PlaneGeometry(W, D, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, cz);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const ivory = new THREE.Color(0xf1efe8), sage = new THREE.Color(0xdbe2d4), warm = new THREE.Color(0xf9f7f1), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.031 + z * 0.017) * Math.cos(z * 0.027 - x * 0.012);
    c.copy(ivory).lerp(sage, 0.15 + 0.6 * n);
    const dp = x - pathX(z);
    c.lerp(warm, Math.exp(-(dp * dp) / 14) * 0.7);                    // the pale trail you walk along
    for (const cl of CLEARINGS) c.lerp(warm, Math.exp(-((x - cl.x) ** 2 + (z - cl.z) ** 2) / (cl.r * cl.r * 0.9)) * 0.55);   // open clearings glow a little
    c.multiplyScalar(0.96 + 0.06 * hash(i, 3));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = "terrain";
  return mesh;
}

// three faded silhouettes of far hills (fog-free, tinted towards the haze by hand)
export function createHills() {
  const group = new THREE.Group();
  const layers = [
    { z: -300, h: 34, color: 0xdcded0, seed: 1.7, amp: 1 },
    { z: -350, h: 52, color: 0xe4e4d8, seed: 4.1, amp: 1.2 },
    { z: -410, h: 70, color: 0xebe8dd, seed: 7.3, amp: 1.4 },
  ];
  for (const L of layers) {
    const shape = new THREE.Shape();
    shape.moveTo(-620, -30);
    for (let x = -620; x <= 620; x += 20) {
      const y = L.h * (0.5 + 0.28 * Math.sin(x * 0.006 + L.seed) + 0.17 * Math.sin(x * 0.0145 + L.seed * 2) + 0.08 * Math.sin(x * 0.033 + L.seed * 3)) * L.amp;
      shape.lineTo(x, y);
    }
    shape.lineTo(620, -30); shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: L.color, fog: false, depthWrite: false }));
    m.position.set(0, -4, L.z); m.renderOrder = -5;
    group.add(m);
  }
  return group;
}

// Soft gradient sky: pale blue-grey overhead melting into the same haze colour as the fog
export function createSky() {
  const geo = new THREE.SphereGeometry(700, 24, 16);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(FOG_COLOR), mid = new THREE.Color(0xe7ebee), top = new THREE.Color(0xd9e2ea), warm = new THREE.Color(0xf3f0e8), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const e = pos.getY(i) / 700;                                      // -1..1
    if (e < 0) c.copy(horizon).lerp(warm, Math.min(1, -e * 3));
    else { c.copy(horizon).lerp(mid, Math.min(1, e / 0.22)); c.lerp(top, Math.max(0, (e - 0.22) / 0.7)); }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
