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
  g.fillStyle = "rgba(250,248,242,.5)"; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
  g.strokeStyle = "rgba(143,152,132,.75)"; g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.stroke();
  g.strokeStyle = "rgba(143,152,132,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 84, 0, 7); g.stroke();
  g.fillStyle = "rgba(226,185,79,.85)"; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
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
      discGeo: new THREE.CircleGeometry(1, 48), inkGeo: new THREE.PlaneGeometry(2, 2), glowGeo: new THREE.PlaneGeometry(1, 1),
      discMat: new THREE.MeshBasicMaterial({ color: 0xe6e2d5, transparent: true, opacity: 0.93, depthWrite: false }),
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
    shadows.frustumCulled = false;

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
    this.group.add(shadows, this.stems, this.leaves, this.seedlings, this.makeGroupLines(layout.groups));
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

  /* Faint threads joining the days of each constellation, seen only from above, like a star map drawn on the ground */
  makeGroupLines(groups) {
    const pts = [], at = (f) => [f.base.x, f.base.y + 0.18, f.base.z];
    for (const g of groups) {
      const fl = g.days.map((d) => this.byDay.get(d)).filter(Boolean);
      if (fl.length < 2) continue;
      if (g.type === "cluster") {                                  // each flower to its nearest older neighbour (a little tree)
        for (let i = 1; i < fl.length; i++) {
          let best = 0, bd = 1e9;
          for (let j = 0; j < i; j++) { const d = fl[i].base.distanceToSquared(fl[j].base); if (d < bd) { bd = d; best = j; } }
          pts.push(...at(fl[i]), ...at(fl[best]));
        }
      } else {
        for (let i = 1; i < fl.length; i++) pts.push(...at(fl[i - 1]), ...at(fl[i]));
        if (g.type === "ring") pts.push(...at(fl[fl.length - 1]), ...at(fl[0]));
      }
    }
    // a short thread between the two nearest flowers of neighbouring constellations: the field reads as one long star chain
    for (let i = 1; i < groups.length; i++) {
      const A = groups[i - 1].days.map((d) => this.byDay.get(d)).filter(Boolean), B = groups[i].days.map((d) => this.byDay.get(d)).filter(Boolean);
      let best = null, bd = 1e9;
      for (const fa of A) for (const fb of B) { const d = fa.base.distanceToSquared(fb.base); if (d < bd) { bd = d; best = [fa, fb]; } }
      if (best) pts.push(...at(best[0]), ...at(best[1]));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8e9884, transparent: true, opacity: 0, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false;
    return this.lines;
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
  setHover(flower) {
    if (flower === this.hovered) return;
    this.hovered = flower; this.refreshStates();
  }
  setFocus(flower) { this.focused = flower; this.refreshStates(); }
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
    for (const f of this.flowers) f.update(t, dt, cam.position, this.wind, this);
    this.stems.instanceMatrix.needsUpdate = true; this.leaves.instanceMatrix.needsUpdate = true;
    if (this.tintDirty) { this.stems.instanceColor.needsUpdate = true; this.leaves.instanceColor.needsUpdate = true; this.tintDirty = false; }
    const up = this.faceUp;
    this.lines.visible = up > 0.03; this.lines.material.opacity = 0.5 * up * up;
    this.seedlings.visible = up < 0.98; this.seedHeads.material.opacity = 0.8 * (1 - up);
    if (this.hovered && this.hovered.hasImage && this.pollen) {             // a gentle trickle of pollen while the butterfly visits
      this.emitAcc += dt * 14; const h = this.hovered;
      while (this.emitAcc >= 1) { this.emitAcc -= 1; this.pollen.burst(h.headPos, h.R * (1 + 0.45 * up), 1, 1 + 1.6 * up); }
    }
    for (const f of this.flowers) if (f.visited && !f.colorState && f.textureState === 2) f.loadColor(this.loader, this.anisotropy);
    this.loadTimer -= dt;
    if (this.loadTimer <= 0) { this.loadTimer = 0.15; this.loadNearby(cam.position); }
    this.shared.ghostMat.opacity = 1 - 0.5 * this.faceUp;                 // days still to come step back when seen from above
  }
}
