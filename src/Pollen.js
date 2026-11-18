/* A pool of tiny pollen grains. A butterfly visiting a flower makes a few drift up and away.
 * Each grain is a small, flat-coloured, crisp-edged dot (two warm tones): individual particles, not glowing blobs. One draw call, no allocation per frame. */
import * as THREE from "three";

const MAX = 140;

export class Pollen {
  constructor() {
    this.pos = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.age = new Float32Array(MAX).fill(9); this.base = new Float32Array(MAX); this.tone = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute("aTone", new THREE.BufferAttribute(this.tone, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 900 }, uDpr: { value: 1 }, uWarm: { value: new THREE.Color(0xe2b650) }, uPale: { value: new THREE.Color(0xf1dd9f) } },
      // a grain is 2-4.5 CSS pixels wide however far away, a flat colour with a clean edge (no halo, no gradient)
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aTone; varying float vA; varying float vT; uniform float uScale; uniform float uDpr;
        void main(){ vA = aAlpha; vT = aTone; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, 4.5) * uDpr; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying float vT; uniform vec3 uWarm; uniform vec3 uPale;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.40, 0.5, d)) * vA; if (a < 0.02) discard;
          gl_FragColor = vec4(mix(uWarm, uPale, vT), a); }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    this.geo = geo;
  }

  /* spawn `count` motes around `center`; `radius` is the flower head's radius, `lift` makes them rise faster (seen from above) */
  burst(center, radius, count, lift = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * 0.8, i3 = i * 3;
      this.pos[i3] = center.x + Math.cos(a) * r; this.pos[i3 + 1] = center.y + (Math.random() - 0.3) * radius * 0.6; this.pos[i3 + 2] = center.z + Math.sin(a) * r * 0.5 + 0.2;
      this.vel[i3] = (Math.random() - 0.5) * radius * 0.5 + Math.cos(a) * radius * 0.12;
      this.vel[i3 + 1] = (0.25 + Math.random() * 0.55) * radius * 0.45 * lift;
      this.vel[i3 + 2] = (Math.random() - 0.35) * radius * 0.4;
      this.life[i] = 1.3 + Math.random() * 1.3; this.age[i] = 0;
      this.base[i] = radius * (0.05 + Math.random() * 0.06); this.tone[i] = Math.random() < 0.45 ? 1 : 0;
    }
  }

  /* everything in the air is gone at once (opening a day should feel clean and calm) */
  clear() { this.age.fill(99); this.alpha.fill(0); this.geo.attributes.aAlpha.needsUpdate = true; }

  update(dt, camera, viewportH, dpr = 1) {
    this.material.uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360)); this.material.uniforms.uDpr.value = dpr;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt; const i3 = i * 3, k = this.age[i] / this.life[i], drift = Math.sin(this.age[i] * 2.2 + i) * 0.35;
      this.pos[i3] += (this.vel[i3] + drift * 0.3) * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3] *= 1 - 0.6 * dt; this.vel[i3 + 1] *= 1 - 0.35 * dt; this.vel[i3 + 2] *= 1 - 0.6 * dt;
      this.alpha[i] = Math.sin(Math.PI * Math.min(1, k * 1.05)) * 0.78; this.size[i] = this.base[i] * (1 - 0.25 * k);
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.aAlpha.needsUpdate = this.geo.attributes.aSize.needsUpdate = this.geo.attributes.aTone.needsUpdate = true;
  }
}
