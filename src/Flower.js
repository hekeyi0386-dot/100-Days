/* One day = one flower: a thin stem, two leaves and a round head carrying that day's picture.
 * Stems and leaves are drawn by FlowerField as instanced meshes (one draw call each for all days);
 * the head is a tiny group (a soft glow + one face mesh that blends paper, sketch and photograph) so it can be hovered and textured on its own. */
import * as THREE from "three";
import { clamp, damp, lerp } from "./utils.js";

const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const PAPER = new THREE.Color(0xe6e2d5), PAPER_HOT = new THREE.Color(0xfffcf2), PAPER_WARM = new THREE.Color(0xf8efd8);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/* A flower head is ONE draw: paper, the ink sketch and the colour photograph are blended inside a single fragment shader.
 * The sketch "dissolves" into the photograph as a change of colour, while the head's own opacity stays put: no stack of
 * half-transparent layers, so nothing can look washed out or ghosted halfway through (or be left that way afterwards). */
const HEAD_VERT = `varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const HEAD_FRAG = `uniform sampler2D uInk; uniform sampler2D uColor;
uniform float uInkIn, uVisit, uHot, uOpacity, uOpen;
uniform vec3 uPaper, uPaperWarm, uPaperHot;
varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec2 q = abs(vUv * 2.0 - 1.0);
  float r = length(q);
  // the head is a circle; opened, it is a square the size of the sketch. In between, the corners grow out of the circle (and, closing, fall back into it)
  vec2 cw = max(q - (1.0 - 0.06), 0.0);
  float sd = mix(r - 1.0, length(cw) - 0.06, uOpen);
  float disc = 1.0 - smoothstep(-0.012, 0.0, sd);                       // a clean edge
  if (disc < 0.01) discard;
  vec3 paper = mix(uPaper, uPaperWarm, uVisit * 0.8);
  paper = mix(paper, uPaperHot, uHot);
  vec4 ink = texture2D(uInk, vUv, -0.6);
  vec3 sketch = mix(paper, ink.rgb, ink.a * uInkIn * (0.9 + 0.1 * uHot));
  vec4 pic = texture2D(uColor, vUv, -0.4);
  float fe = clamp((1.0 - r) / 0.10, 0.0, 1.0); fe = fe * fe * (3.0 - 2.0 * fe);
  float rim = mix(smoothstep(0.0, 0.5, fe), 1.0, uOpen) * pic.a;        // the photograph is solid right out to a narrow, soft rim (and to the corners once it is a square)
  vec3 photo = mix(paper, pic.rgb * (1.0 + 0.04 * uHot), rim);
  gl_FragColor = vec4(mix(sketch, photo, uVisit), disc * uOpacity * mix(0.94, 1.0, uVisit));
#include <colorspace_fragment>
#include <fog_fragment>
}`;
let BLANK = null;
const blankTexture = () => BLANK || (BLANK = Object.assign(new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1), { needsUpdate: true }));
function makeHeadMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uInk: { value: blankTexture() }, uColor: { value: blankTexture() },
      uInkIn: { value: 0 }, uVisit: { value: 0 }, uHot: { value: 0 }, uOpacity: { value: 1 }, uOpen: { value: 0 },
      uPaper: { value: PAPER }, uPaperWarm: { value: PAPER_WARM }, uPaperHot: { value: PAPER_HOT },
    }]),
    vertexShader: HEAD_VERT, fragmentShader: HEAD_FRAG, transparent: true, depthWrite: false, fog: true,
  });
}

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
    this.openT = 0; this.calm = 0;                                       // how far it has opened into a square (0..1); how still it is (an opened flower does not sway or tremble)
    this.visited = false; this.visitFade = 0; this.visitInstant = false; this.colorState = 0; this.visitApplied = -1;

    if (this.hasImage) {
      const g = this.head = new THREE.Group(); g.rotation.order = "YXZ";
      this.glow = new THREE.Mesh(shared.glowGeo, shared.glowMat.clone()); this.glow.position.z = -0.03; this.glow.scale.setScalar(4.4);
      this.face = new THREE.Mesh(shared.inkGeo, makeHeadMaterial());
      this.uni = this.face.material.uniforms; this.lead = false;
      g.add(this.glow, this.face);
      this.hit = this.face;
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
      this.uni.uInk.value = tex; this.textureState = 2;
    }, undefined, () => { this.textureState = 3; });
  }

  /* the colour picture (a plain square) is only fetched once a flower has been visited */
  loadColor(loader, anisotropy) {
    if (!this.hasImage || this.colorState || !this.entry.square) return;
    this.colorState = 1;
    loader.load(this.entry.square, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy;
      this.uni.uColor.value = tex; this.colorState = 2;
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
    const lead = field.focused === this;                                  // the flower being looked at is never dimmed or ghosted
    this.dim = lead ? 1 : damp(this.dim, this.dimTarget, 5, dt);
    const hv = this.h;

    // sway + lean, and the stem leaning gently towards the camera once the flower is "awake"
    this.calm = damp(this.calm, lead ? 1 : 0, 5, dt);
    const sway = (Math.sin(t * 0.62 + L.phase) * 0.028 + Math.sin(t * 1.37 + L.phase * 1.7) * 0.012) * wind * (1 - this.calm);
    let tx = L.lean * Math.cos(L.leanDir) + sway * Math.cos(L.phase);
    let tz = L.lean * Math.sin(L.leanDir) + sway * Math.sin(L.phase);
    const dx = cam.x - this.base.x, dz = cam.z - this.base.z, dl = Math.hypot(dx, dz) || 1;
    tx += hv * 0.07 * (dz / dl); tz -= hv * 0.07 * (dx / dl);
    // the tremble: two slightly different frequencies so it never sounds like a metronome,
    // a little elliptical, and given more reach when seen from above (where the same angle would hardly show)
    let wob = 0;
    if (lead) this.shake = 0;                                             // no trembling once a day is open
    if (this.shake > 0.004) {
      this.shake *= Math.exp(-dt * 1.35);
      const amp = this.shake * (0.05 + 0.085 * field.faceUp), ph = L.phase;
      const w1 = Math.sin(t * 19.5 + ph) + 0.4 * Math.sin(t * 31 + ph * 2), w2 = Math.cos(t * 19.5 + ph) * 0.35;
      tx += amp * (w1 * this.shakeZ + w2 * this.shakeX); tz -= amp * (w1 * this.shakeX - w2 * this.shakeZ);
      wob = this.shake * Math.sin(t * 17 + ph * 1.3);
    } else this.shake = 0;
    if (field.touch > 0 && !field.focused && hv > 0.5 && (this.tremble -= dt) <= 0) { this.tremble = 1.6 + Math.random() * 1.8; this.nudge(0.16); }   // the butterfly shifts its feet
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
    let fy = clamp(face, -1.0, 1.0), fx = -clamp(rise, -0.3, 0.5);
    if (lead && field.settled) { const vd = field.viewDir; fy = Math.atan2(-vd.x, -vd.z); fx = Math.asin(clamp(vd.y, -1, 1)); }   // an opened head squares up to the lens, so the square is a true square
    if (this.fyv === undefined) { this.fyv = fy; this.fxv = fx; }
    this.fyv = damp(this.fyv, fy, 9, dt); this.fxv = damp(this.fxv, fx, 9, dt);                  // ... and turns there smoothly
    g.rotation.y = lerp(lerp(L.yaw, this.fyv, hh), field.topYaw, tb);
    g.rotation.x = lerp(lerp(-0.1, this.fxv, hh), -field.topPitch, tb);                          // face the sky as steeply as the camera looks down
    g.rotation.z = wob * 0.1 * (1 + field.faceUp);                              // the picture itself trembles a little in its plane
    g.scale.setScalar(this.R * (1 + 0.17 * hv + 0.012 * Math.sin(t * 1.2 + L.phase) * (1 - this.calm) + tb * (0.45 + 0.2 * hv)));
    if (this.hasImage) {
      if (this.textureState === 2) this.inkFade = Math.min(1, this.inkFade + dt * 1.4);
      // awakening: the sketch turns into the photograph. Quick when it is the flower you have just opened (done before the camera arrives).
      if (this.visited && this.colorState === 2) this.visitFade = this.visitInstant ? 1 : Math.min(1, this.visitFade + dt * (lead ? 3.2 : 0.9));
      const vf = easeOut(this.visitFade), U = this.uni;
      const want0 = lead && field.settled ? 1 : 0;                        // opens once the camera has arrived; closes the moment the day is left
      this.openT += clamp(want0 - this.openT, -dt / 0.5, dt / 0.5);
      const eo = this.openT * this.openT * (3 - 2 * this.openT);
      U.uInkIn.value = this.inkFade; U.uVisit.value = vf; U.uHot.value = hv; U.uOpacity.value = this.dim; U.uOpen.value = eo;
      this.open = eo;
      if (vf !== this.visitApplied) { this.visitApplied = vf; field.tintFlower(this, vf); }
      if (lead !== this.lead) {                                           // the flower in focus is drawn last and on top of everything translucent
        this.lead = lead;
        this.face.renderOrder = lead ? 1000 : 0; this.glow.renderOrder = lead ? 999 : 0;
        this.face.material.depthTest = !lead; this.glow.material.depthTest = !lead;
      }
      const want = tb > 0.5 ? this.shared.ringTex : this.shared.glowTex;      // a soft ring from above, a soft glow on the ground
      if (this.glow.material.map !== want) this.glow.material.map = want;
      this.glow.scale.setScalar(4.4 + 1.5 * tb);
      this.glow.material.opacity = (0.75 + 0.2 * tb) * hv * (lead ? 0.3 : 1) * (1 - this.open);   // a halo would only pale the picture while you look at it
    }
  }
}
