/* One day = one flower: a thin stem, two leaves and a round head carrying that day's picture.
 * Stems and leaves are drawn by FlowerField as instanced meshes (one draw call each for all days);
 * the head is a tiny group (glow + paper disc + ink picture) so it can be hovered and textured on its own. */
import * as THREE from "three";
import { clamp, damp, lerp } from "./utils.js";

const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const PAPER = new THREE.Color(0xe6e2d5), PAPER_HOT = new THREE.Color(0xfffcf2), PAPER_WARM = new THREE.Color(0xf8efd8);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export class Flower {
  constructor(layout, entry, index, shared) {
    Object.assign(this, { layout, entry, index, shared });
    this.day = layout.day;
    this.hasImage = !!(entry && entry.head);
    this.base = new THREE.Vector3(layout.x, layout.y, layout.z);
    this.R = (this.hasImage ? 0.95 : 0.8) * layout.scale;                    // head radius
    this.stemLen = layout.stem * (this.hasImage ? 1 : 0.82) * (0.92 + 0.08 * layout.scale);
    this.top = new THREE.Vector3(); this.headPos = new THREE.Vector3();
    this.h = 0; this.hoverTarget = 0; this.dim = 1; this.dimTarget = 1; this.inkFade = 0; this.textureState = 0;
    this.yaw = layout.yaw; this.pitch = -0.1;
    // awakening: once visited the sketch gives way to the colour photograph
    // a butterfly's touch: a small tremble that dies away quickly (energy, and the direction it was brushed from)
    this.shake = 0; this.shakeX = 0; this.shakeZ = 1; this.tremble = 1.2 + Math.random();
    this.visited = false; this.visitFade = 0; this.visitInstant = false; this.colorState = 0; this.colorMesh = null; this.visitApplied = -1;

    if (this.hasImage) {
      const g = this.head = new THREE.Group(); g.rotation.order = "YXZ";
      this.glow = new THREE.Mesh(shared.glowGeo, shared.glowMat.clone()); this.glow.position.z = -0.03; this.glow.scale.setScalar(4.4);
      this.disc = new THREE.Mesh(shared.discGeo, shared.discMat.clone());
      this.ink = new THREE.Mesh(shared.inkGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      this.ink.position.z = 0.012;
      g.add(this.glow, this.disc, this.ink);
      this.hit = this.ink;
    } else {
      // a day that has not happened yet: a pale silhouette waiting to be filled in
      const g = this.head = new THREE.Group(); g.rotation.order = "YXZ";
      this.disc = new THREE.Mesh(shared.ghostGeo, shared.ghostMat); g.add(this.disc);
      this.hit = this.disc;
    }
    this.hit.userData.flower = this;
    this.object = this.head;
  }

  loadTexture(loader, anisotropy) {
    if (!this.hasImage || this.textureState) return;
    this.textureState = 1;
    loader.load(this.entry.head, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy;
      this.ink.material.map = tex; this.ink.material.needsUpdate = true; this.textureState = 2;
    }, undefined, () => { this.textureState = 3; });
  }

  /* the colour head is only fetched once a flower has been visited */
  loadColor(loader, anisotropy) {
    if (!this.hasImage || this.colorState || !this.entry.headColor) return;
    this.colorState = 1;
    loader.load(this.entry.headColor, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy;
      this.colorMesh = new THREE.Mesh(this.shared.inkGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      this.colorMesh.position.z = 0.016; this.head.add(this.colorMesh); this.colorState = 2;
    }, undefined, () => { this.colorState = 3; });
  }

  /* brushed by the passing butterfly (power ~0.1 faint .. 1 firm), pushed along (dx, dz) */
  nudge(power, dx = 0, dz = 0) {
    const l = Math.hypot(dx, dz);
    if (l > 1e-4) { this.shakeX = dx / l; this.shakeZ = dz / l; }
    else { const a = Math.random() * 6.283; this.shakeX = Math.cos(a); this.shakeZ = Math.sin(a); }
    this.shake = Math.min(1, this.shake * 0.55 + power);
  }

  awaken(instant = false) { this.visited = true; this.visitInstant = instant; }
  sleep() { this.visited = false; this.visitFade = 0; this.visitInstant = false; this.visitApplied = -1; }

  update(t, dt, cam, wind, field) {
    const L = this.layout, { stems, leaves } = field;
    this.h = damp(this.h, this.hoverTarget, 7, dt);
    this.dim = damp(this.dim, this.dimTarget, 5, dt);
    const hv = this.h;

    // sway + lean, and the stem leaning gently towards the camera once the flower is "awake"
    const sway = (Math.sin(t * 0.62 + L.phase) * 0.028 + Math.sin(t * 1.37 + L.phase * 1.7) * 0.012) * wind;
    let tx = L.lean * Math.cos(L.leanDir) + sway * Math.cos(L.phase);
    let tz = L.lean * Math.sin(L.leanDir) + sway * Math.sin(L.phase);
    const dx = cam.x - this.base.x, dz = cam.z - this.base.z, dl = Math.hypot(dx, dz) || 1;
    tx += hv * 0.07 * (dz / dl); tz -= hv * 0.07 * (dx / dl);
    // the tremble: two slightly different frequencies so it never sounds like a metronome,
    // a little elliptical, and given more reach when seen from above (where the same angle would hardly show)
    let wob = 0;
    if (this.shake > 0.004) {
      this.shake *= Math.exp(-dt * 1.35);
      const amp = this.shake * (0.05 + 0.085 * field.faceUp), ph = L.phase;
      const w1 = Math.sin(t * 19.5 + ph) + 0.4 * Math.sin(t * 31 + ph * 2), w2 = Math.cos(t * 19.5 + ph) * 0.35;
      tx += amp * (w1 * this.shakeZ + w2 * this.shakeX); tz -= amp * (w1 * this.shakeX - w2 * this.shakeZ);
      wob = this.shake * Math.sin(t * 17 + ph * 1.3);
    } else this.shake = 0;
    if (hv > 0.5 && (this.tremble -= dt) <= 0) { this.tremble = 1.6 + Math.random() * 1.8; this.nudge(0.16); }   // the butterfly shifts its feet
    _q.setFromEuler(_e.set(tx, 0, tz));

    const len = this.stemLen, th = 0.8 + 0.35 * L.scale;
    _s.set(th, len, th);
    stems.setMatrixAt(this.index, _m.compose(this.base, _q, _s));
    this.top.set(0, len, 0).applyQuaternion(_q).add(this.base);

    // two leaves
    for (let k = 0; k < 2; k++) {
      const frac = k ? 0.52 : 0.28, az = L.phase + k * Math.PI + 0.7, tilt = 0.85 + 0.25 * k - hv * 0.15 + this.shake * 0.2 * Math.sin(t * 24 + k * 1.7);
      _v.set(0, len * frac, 0).applyQuaternion(_q).add(this.base);
      _qa.setFromAxisAngle(UP, az); _qb.setFromAxisAngle(RIGHT, tilt);
      _qs.copy(_q).multiply(_qa).multiply(_qb);
      const ls = (0.62 + 0.42 * L.scale) * (k ? 0.82 : 1) * (this.hasImage ? 1 : 0.6);
      _s.set(ls, ls, ls);
      leaves.setMatrixAt(this.index * 2 + k, _m.compose(_v, _qs, _s));
    }

    // head sits on top of the stem, turning to face the visitor when discovered
    this.headPos.set(this.top.x, this.top.y + this.R * 0.86, this.top.z);
    const g = this.head, face = Math.atan2(cam.x - this.headPos.x, cam.z - this.headPos.z);
    const rise = Math.atan2(cam.y - this.headPos.y, Math.hypot(cam.x - this.headPos.x, cam.z - this.headPos.z));
    g.position.copy(this.headPos);
    // upright (and turning to you when awake) down on the ground; lifting their faces to the sky from above
    const tb = field.faceUp, hh = hv * (1 - tb);
    g.rotation.y = lerp(lerp(L.yaw, clamp(face, -1.0, 1.0), hh), field.topYaw, tb);
    g.rotation.x = lerp(lerp(-0.1, -clamp(rise, -0.3, 0.5), hh), -field.topPitch, tb);       // face the sky as steeply as the camera looks down
    g.rotation.z = wob * 0.1 * (1 + field.faceUp);                              // the picture itself trembles a little in its plane
    g.scale.setScalar(this.R * (1 + 0.17 * hv + 0.012 * Math.sin(t * 1.2 + L.phase) + tb * (0.45 + 0.2 * hv)));
    if (this.hasImage) {
      if (this.textureState === 2) this.inkFade = Math.min(1, this.inkFade + dt * 1.4);
      if (this.visited && this.colorState === 2) this.visitFade = this.visitInstant ? 1 : Math.min(1, this.visitFade + dt * 0.5);
      const vf = easeOut(this.visitFade);
      this.disc.material.opacity = 0.93 * this.dim;
      this.disc.material.color.copy(PAPER).lerp(PAPER_WARM, vf * 0.8).lerp(PAPER_HOT, hv);
      this.ink.material.opacity = this.inkFade * this.dim * (0.9 + 0.1 * hv) * (1 - vf);
      if (this.colorMesh) this.colorMesh.material.opacity = vf * this.dim * (0.94 + 0.06 * hv);
      if (vf !== this.visitApplied) { this.visitApplied = vf; field.tintFlower(this, vf); }
      const want = tb > 0.5 ? this.shared.ringTex : this.shared.glowTex;      // a soft ring from above, a soft glow on the ground
      if (this.glow.material.map !== want) this.glow.material.map = want;
      this.glow.scale.setScalar(4.4 + 1.5 * tb);
      this.glow.material.opacity = (0.75 + 0.2 * tb) * hv;
    }
  }
}
