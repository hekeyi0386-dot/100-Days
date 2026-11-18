/* A pool of soft pollen motes. A butterfly visiting a flower makes a few drift up and away;
 * landing on it (click) lets go of a small cloud. One draw call, no allocation per frame. */
import * as THREE from "three";

const MAX = 140;

export class Pollen {
  constructor() {
    this.pos = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.age = new Float32Array(MAX).fill(9); this.base = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 900 }, uColor: { value: new THREE.Color(0xeec35a) } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; uniform vec3 uColor;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.98, 0.9), smoothstep(0.3, 0.0, d)), a); }`,
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
      this.life[i] = 1.6 + Math.random() * 1.6; this.age[i] = 0;
      this.base[i] = radius * (0.07 + Math.random() * 0.1);
    }
  }

  update(dt, camera, viewportH) {
    this.material.uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt; const i3 = i * 3, k = this.age[i] / this.life[i], drift = Math.sin(this.age[i] * 2.2 + i) * 0.35;
      this.pos[i3] += (this.vel[i3] + drift * 0.3) * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3] *= 1 - 0.6 * dt; this.vel[i3 + 1] *= 1 - 0.35 * dt; this.vel[i3 + 2] *= 1 - 0.6 * dt;
      this.alpha[i] = Math.sin(Math.PI * Math.min(1, k * 1.05)) * 0.9; this.size[i] = this.base[i] * (1 - 0.35 * k);
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.aAlpha.needsUpdate = this.geo.attributes.aSize.needsUpdate = true;
  }
}
