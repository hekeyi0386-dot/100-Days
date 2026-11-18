/* All 100 flowers. A reusable <Flower> is mapped over the existing day data; nothing is hand-placed. */
import * as THREE from "three";
import { Flower } from "./Flower.js";
import { layoutFlowers, fieldBounds, zOfT, terrainHeight, pathX, GARDEN } from "./layout.js";
import { hash } from "./utils.js";

function radialTexture(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// the pale, hollow flower that stands for a day still to come
function ghostTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(250,248,242,.2)"; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
  g.strokeStyle = "rgba(140,150,128,.62)"; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.stroke();
  g.fillStyle = "rgba(232,191,85,.8)"; g.beginPath(); g.arc(128, 128, 6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(0.3, 0.32, 0, 1); s.quadraticCurveTo(-0.3, 0.32, 0, 0);
  return new THREE.ShapeGeometry(s);
}

export class FlowerField {
  constructor(entries, total, { mobile, anisotropy = 4, visits }) {
    this.group = new THREE.Group(); this.anisotropy = anisotropy; this.mobile = mobile; this.visits = visits; this.pollen = null; this.emitAcc = 0;
    const byDay = new Map(entries.map((e) => [e.day, e]));
    const layout = layoutFlowers(total, { narrow: mobile && matchMedia("(max-aspect-ratio: 1/1)").matches });

    // shared geometry & materials (reused by every flower)
    const glowTex = radialTexture([[0, "rgba(255,244,205,1)"], [0.35, "rgba(255,236,176,.55)"], [1, "rgba(255,236,176,0)"]]);
    const ringTex = radialTexture([[0, "rgba(255,236,176,0)"], [0.55, "rgba(255,232,160,.0)"], [0.7, "rgba(255,226,140,.95)"], [0.76, "rgba(255,226,140,.5)"], [1, "rgba(255,236,176,0)"]]);
    const shared = this.shared = {
      inkGeo: new THREE.PlaneGeometry(2, 2), glowGeo: new THREE.PlaneGeometry(1, 1),
      glowTex, ringTex,
      glowMat: new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      ghostGeo: new THREE.PlaneGeometry(2, 2),
      ghostMat: new THREE.MeshBasicMaterial({ map: ghostTexture(), transparent: true, depthWrite: false }),
    };

    this.bounds = fieldBounds(layout);
    const N = layout.length;
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.05, 1, 6, 1); stemGeo.translate(0, 0.5, 0);
    this.stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    this.stemBase = new THREE.Color(0x80877a); this.stemAwake = new THREE.Color(0x73a068); this.leafAwake = new THREE.Color(0x8fc27a); this.leafBase = [];
    for (let i = 0; i < N; i++) this.stems.setColorAt(i, this.stemBase);
    this.leaves = new THREE.InstancedMesh(leafShape(), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), N * 2);
    const sage = new THREE.Color(0xb6c2a6), pale = new THREE.Color(0xd6dcc6);
    for (let i = 0; i < N * 2; i++) { const c = sage.clone().lerp(pale, (i % 5) / 5); this.leafBase.push(c); this.leaves.setColorAt(i, c); }
    this.tintDirty = false; this._c = new THREE.Color();
    this.stems.frustumCulled = this.leaves.frustumCulled = false;

    // soft contact shadows on the ground (one instanced draw)
    const shadowGeo = new THREE.CircleGeometry(1, 24); shadowGeo.rotateX(-Math.PI / 2);
    const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({
      map: radialTexture([[0, "rgba(70,78,62,.30)"], [1, "rgba(70,78,62,0)"]]), transparent: true, depthWrite: false, color: 0xffffff,
    }), N);
    shadows.frustumCulled = false; this.shadows = shadows;

    this.flowers = layout.map((l, i) => {
      const f = new Flower(l, byDay.get(l.day) || null, i, shared);
      if (f.hasImage && visits && visits.has(l.day)) f.awaken(true);          // a returning visitor finds their trail still in colour
      this.group.add(f.object);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(l.x, l.y + 0.04, l.z), new THREE.Quaternion(), new THREE.Vector3(1.15 * l.scale, 1, 1.15 * l.scale));
      shadows.setMatrixAt(i, m);
      return f;
    });
    this.byDay = new Map(this.flowers.map((f) => [f.day, f]));
    this.seedlings = this.makeSeedlings(mobile ? 110 : 260);
    this.group.add(shadows, this.stems, this.leaves, this.seedlings);
    this.targets = this.flowers.map((f) => f.hit);
    this.loader = new THREE.TextureLoader();
    this.loadTimer = 0; this.focused = null; this.hovered = null; this.wind = 0.6; this.faceUp = 0; this.topYaw = Math.PI / 2; this.topPitch = 1.31; this.loadAll = false;
  }

  /* Tiny unnamed seedlings between the days. They thicken towards the back (and trail off past day 100),
   * so the garden reads as denser the deeper you go. Two instanced draws, no per-frame work. */
  makeSeedlings(count) {
    const stemGeo = new THREE.CylinderGeometry(0.012, 0.03, 1, 4, 1); stemGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.CircleGeometry(1, 20);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0x9aa392 }), count);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xf6f4ee, transparent: true, opacity: 0.8, depthWrite: false }), count);
    this.seedHeads = heads;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const t = Math.min(1.12, 0.1 + 1.02 * Math.sqrt(hash(i, 31)));           // more of them the deeper you go
      const z = zOfT(t) + (hash(i, 32) - 0.5) * 5, side = hash(i, 33) > 0.5 ? 1 : -1;
      const x = pathX(z) + side * (GARDEN.corridor + 0.8 + hash(i, 34) * (9 + 18 * Math.sqrt(Math.min(t, 1))));
      const y = terrainHeight(x, z), h = 0.7 + hash(i, 35) * 1.3, r = 0.2 + hash(i, 36) * 0.22;
      p.set(x, y, z); e.set((hash(i, 37) - 0.5) * 0.18, 0, (hash(i, 38) - 0.5) * 0.18); q.setFromEuler(e);
      stems.setMatrixAt(i, m.compose(p, q, s.set(1, h, 1)));
      p.set(x + Math.sin(e.z) * -h, y + h * Math.cos(e.x) + r * 0.6, z);
      e.set(0, (hash(i, 39) - 0.5) * 0.8, 0); q.setFromEuler(e);
      heads.setMatrixAt(i, m.compose(p, q, s.set(r, r, r)));
    }
    stems.frustumCulled = heads.frustumCulled = false;
    const g = new THREE.Group(); g.add(stems, heads); return g;
  }

  /* an awakened flower: its stem and leaves take on a fresh green */
  tintFlower(f, vf) {
    const c = this._c;
    this.stems.setColorAt(f.index, c.copy(this.stemBase).lerp(this.stemAwake, vf));
    for (let k = 0; k < 2; k++) this.leaves.setColorAt(f.index * 2 + k, c.copy(this.leafBase[f.index * 2 + k]).lerp(this.leafAwake, vf * 0.9));
    this.tintDirty = true;
  }

  sleepAll() { for (const f of this.flowers) if (f.visited) f.sleep(); }

  /* the visitor lands on a flower: it will bloom into colour (and stay that way) */
  awaken(f) {
    if (!f.hasImage || f.visited) return false;
    f.awaken(false); f.loadColor(this.loader, this.anisotropy);
    this.visits && this.visits.add(f.day);
    return true;
  }

  /* hover: this flower wakes, its neighbours step back a little */
  setHover(flower, dirX = 0, dirZ = 0) {
    if (flower === this.hovered) return;
    this.hovered = flower; this.refreshStates();
    if (!flower) return;
    flower.nudge(0.7, dirX, dirZ);                                    // the butterfly brushes it ...
    const reach = flower.R * 3.4;                                       // ... and the air it moves stirs its neighbours, just a little
    for (const f of this.flowers) {
      if (f === flower) continue;
      const d = f.headPos.distanceTo(flower.headPos);
      if (d < reach) f.nudge(0.2 * (1 - d / reach), dirX, dirZ);
    }
  }
  setFocus(flower) { this.focused = flower; if (flower) flower.dim = 1; this.refreshStates(); }   // never inherit the dimming it had as somebody's neighbour
  refreshStates() {
    const lead = this.focused || this.hovered;
    for (const f of this.flowers) {
      f.hoverTarget = f === this.hovered || f === this.focused ? 1 : 0;
      f.dimTarget = lead && f !== lead && f.headPos.distanceTo(lead.headPos) < (this.focused ? 14 : 11 + 8 * this.faceUp) ? (this.focused ? 0.25 : 0.5) : 1;
    }
  }

  // lazy texture loading: nearest first, a couple at a time
  loadNearby(cam, budget = 4) {
    // every picture loads (they are small), the ones nearest the camera first, a few at a time
    const pending = this.flowers.filter((f) => f.hasImage && f.textureState === 0);
    pending.sort((a, b) => a.headPos.distanceToSquared(cam) - b.headPos.distanceToSquared(cam));
    const inflight = this.flowers.reduce((n, f) => n + (f.textureState === 1 ? 1 : 0), 0);
    for (let i = 0; i < Math.min(pending.length, Math.max(0, budget + 2 - inflight)); i++) pending[i].loadTexture(this.loader, this.anisotropy);
  }

  update(t, dt, cam) {
    this.wind = 0.6 + 0.4 * Math.sin(t * 0.23);
    // while one day is open, the flowers standing between the camera and it step out of the way (a faint head that close would hang
    // over the picture like a veil); the ones behind it simply stay quiet
    const lead = this.focused;
    if (lead) {
      const dl = lead.headPos.distanceTo(cam.position);
      for (const f of this.flowers) {
        if (f === lead || !f.hasImage) continue;
        const inFront = dl < 30 && f.headPos.distanceTo(cam.position) < dl + 0.5 && f.headPos.distanceTo(lead.headPos) < 14;
        f.dimTarget = inFront ? 0 : (f.headPos.distanceTo(lead.headPos) < 14 ? 0.25 : 1);
      }
    }
    for (const f of this.flowers) f.update(t, dt, cam.position, this.wind, this);
    this.stems.instanceMatrix.needsUpdate = true; this.leaves.instanceMatrix.needsUpdate = true;
    if (this.tintDirty) { this.stems.instanceColor.needsUpdate = true; this.leaves.instanceColor.needsUpdate = true; this.tintDirty = false; }
    const up = this.faceUp;
    this.shadows.material.opacity = 1 - 0.8 * up;                       // from above a shadow only reads as a smudge
    this.stems.material.opacity = 1 - 0.9 * up; this.stems.material.transparent = up > 0.02; this.stems.material.depthWrite = up < 0.5;
    this.leaves.material.opacity = 1 - 0.85 * up; this.leaves.material.transparent = up > 0.02; this.leaves.material.depthWrite = up < 0.5;
    this.seedlings.visible = up < 0.98; this.seedHeads.material.opacity = 0.8 * (1 - up);
    if (this.hovered && this.hovered.hasImage && this.pollen) {             // a gentle trickle of pollen while the butterfly visits
      this.emitAcc += dt * 14; const h = this.hovered;
      while (this.emitAcc >= 1) { this.emitAcc -= 1; this.pollen.burst(h.headPos, h.R * (1 + 0.45 * up), 1, 1 + 1.6 * up); }
    }
    for (const f of this.flowers) if (f.visited && !f.colorState && f.textureState === 2) f.loadColor(this.loader, this.anisotropy);
    this.loadTimer -= dt;
    if (this.loadTimer <= 0) { this.loadTimer = 0.15; this.loadNearby(cam.position); }
    this.shared.ghostMat.opacity = 1 - 0.3 * this.faceUp;                 // days still to come step back when seen from above
  }
}
