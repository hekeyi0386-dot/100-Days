/* Light, fog, grass and drifting motes. Everything is deliberately quiet: soft daylight,
 * a haze that makes the far garden fade, a little instanced grass, a few floating lights. */
import * as THREE from "three";
import { terrainHeight, pathX } from "./layout.js";
import { FOG_COLOR } from "./Terrain.js";
import { hash } from "./utils.js";

// a flat little disc with a clean edge (the old one was a radial gradient, i.e. a glowing blob)
function grain() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createAtmosphere(scene, { mobile }) {
  scene.fog = new THREE.Fog(FOG_COLOR, 30, 285);

  scene.add(new THREE.HemisphereLight(0xfbfbf8, 0xe2e6da, 1.9));
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const sun = new THREE.DirectionalLight(0xfff8ee, 1.05);
  sun.position.set(-40, 70, 30); scene.add(sun);

  /* ---- grass: one instanced mesh of thin blades ---- */
  const blade = new THREE.ConeGeometry(0.024, 1, 3, 1); blade.translate(0, 0.5, 0);
  const N = mobile ? 1100 : 2400;
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const sageA = new THREE.Color(0xc2ccb6), sageB = new THREE.Color(0xe0e5d6);
  for (let i = 0; i < N; i++) {
    const t = Math.pow(hash(i, 1), 1.25);
    const z = 8 - 250 * t, x = pathX(z) + (hash(i, 2) - 0.5) * (46 + 70 * t);
    if (Math.abs(x - pathX(z)) < 1.6) { grass.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
    const h = 0.22 + 0.34 * hash(i, 3);
    e.set((hash(i, 4) - 0.5) * 0.5, hash(i, 5) * 6.28, (hash(i, 6) - 0.5) * 0.5);
    q.setFromEuler(e); p.set(x, terrainHeight(x, z) - 0.02, z); s.set(1, h, 1);
    grass.setMatrixAt(i, m.compose(p, q, s));
    grass.setColorAt(i, col.copy(sageA).lerp(sageB, hash(i, 7)));
  }
  grass.instanceMatrix.needsUpdate = true; grass.instanceColor.needsUpdate = true; grass.frustumCulled = false;
  scene.add(grass);

  /* ---- a few slow, pale motes of light ---- */
  const COUNT = mobile ? 90 : 210, pts = new Float32Array(COUNT * 3), base = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const z = 14 - 215 * hash(i, 11), x = pathX(z) + (hash(i, 12) - 0.5) * 70;
    base[i * 3] = x; base[i * 3 + 1] = terrainHeight(x, z) + 0.8 + hash(i, 13) * 8; base[i * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.26, map: grain(), color: 0xe9c565, transparent: true, opacity: 0.72, depthWrite: false, sizeAttenuation: true, alphaTest: 0.3,
  }));
  motes.frustumCulled = false; scene.add(motes);

  return {
    update(t) {
      for (let i = 0; i < COUNT; i++) {
        pts[i * 3] = base[i * 3] + Math.sin(t * 0.13 + i) * 1.6 + Math.sin(t * 0.05 + i * 2) * 1.2;
        pts[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.21 + i * 1.7) * 0.7;
        pts[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.09 + i) * 1.4;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
