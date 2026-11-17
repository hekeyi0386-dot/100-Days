/* Gallery-like movement, not a game: scroll walks you slowly into the garden, the mouse only tilts the
 * view a little, dragging turns your head (touch: swipe walks). Clicking a flower flies the camera to it. */
import * as THREE from "three";
import { clamp, damp, easeInOutCubic, lerp } from "./utils.js";
import { terrainHeight, zOfT } from "./layout.js";

const _v = new THREE.Vector3();

export class CameraController {
  constructor(camera, dom, { mobile }) {
    this.camera = camera; this.dom = dom; this.mobile = mobile;
    this.zStart = mobile ? 6 : 9; this.zEnd = zOfT(1) + 36;
    this.p = 0; this.ps = 0;                       // wanted / eased progress through the garden (0..1)
    this.yaw = 0; this.yawS = 0;
    this.mx = 0; this.my = 0; this.mxS = 0; this.myS = 0; this.hasPointer = false; this.pointer = new THREE.Vector2();
    this.mode = "walk";                            // walk | in | focus | out
    this.flight = null; this.saved = null; this.focusPose = null;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.onTap = null; this.onActivity = null; this.locked = false;
    this.walkPose(0, 0, 0, 0, this.pos, this.look);
    this.bind();
  }

  walkPose(p, mx, my, yaw, pos, look) {
    const z = lerp(this.zStart, this.zEnd, p), camH = lerp(this.mobile ? 6.4 : 7.8, 4.4, Math.pow(p, 0.7));
    const lookZ = z - 42;
    pos.set(mx * 1.1, terrainHeight(0, z) + camH, z);
    look.set(mx * 8, terrainHeight(0, lookZ) + 1.7 + my * 2.4, lookZ);
    const dx = look.x - pos.x, dz = look.z - pos.z, c = Math.cos(yaw), s = Math.sin(yaw);
    look.x = pos.x + dx * c + dz * s; look.z = pos.z - dx * s + dz * c;
  }

  zForDay(z) { return clamp((this.zStart - z) / (this.zStart - this.zEnd), 0, 1); }
  goToDay(z, immediate) { this.p = clamp(this.zForDay(z + 24), 0, 1); if (immediate) this.ps = this.p; }

  bind() {
    const d = this.dom;
    addEventListener("wheel", (e) => {
      e.preventDefault();                          // also stops the trackpad swipe from triggering browser back/forward
      if (this.mode !== "walk" || this.locked) return;
      const k = e.deltaMode === 1 ? 16 : 1;
      this.p = clamp(this.p + (e.deltaY + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0)) * k * 0.00019, 0, 1);
      this.onActivity && this.onActivity();
    }, { passive: false });
    addEventListener("keydown", (e) => {
      if (this.mode !== "walk" || this.locked) return;
      const step = { ArrowDown: 0.035, ArrowUp: -0.035, PageDown: 0.1, PageUp: -0.1, " ": 0.1 }[e.key];
      if (step !== undefined) { e.preventDefault(); this.p = clamp(this.p + step, 0, 1); this.onActivity && this.onActivity(); }
      if (e.key === "Home") this.p = 0; if (e.key === "End") this.p = 1;
    });
    let down = null;
    d.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0, touch: e.pointerType === "touch" }; d.setPointerCapture(e.pointerId); });
    d.addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.hasPointer = e.pointerType !== "touch";
      if (this.hasPointer) { this.mx = this.pointer.x; this.my = this.pointer.y; }
      this.onActivity && this.onActivity();
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved > 6 && this.mode === "walk" && !this.locked) {
        this.yaw = clamp(this.yaw - dx * (down.touch ? 0.0042 : 0.0034), -0.55, 0.55);
        if (down.touch) this.p = clamp(this.p - dy * 0.0007, 0, 1);
      }
    });
    d.addEventListener("pointerup", (e) => {
      if (down && down.moved < 7 && performance.now() - down.t < 600 && this.onTap) this.onTap(e.clientX, e.clientY, down.touch);
      down = null;
    });
    d.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") { this.hasPointer = false; this.mx = 0; this.my = 0; } });
  }

  // fly to a flower: the head ends up on the left (desktop) or the upper part (phone), leaving room for the day panel
  focusOn(flower, dur = 1.7) {
    if (this.mode === "walk") this.saved = { p: this.p };
    const yaw0 = clamp(flower.layout.yaw * 0.5, -0.3, 0.3), R = flower.R, d = R * (this.mobile ? 6.4 : 3.8);
    const fwd = _v.set(Math.sin(yaw0), 0, Math.cos(yaw0)).clone(), right = new THREE.Vector3(Math.cos(yaw0), 0, -Math.sin(yaw0));
    const hp = flower.headPos.clone();
    const pos = hp.clone().addScaledVector(fwd, d); pos.y += R * 0.1;
    const look = this.mobile ? hp.clone().add(new THREE.Vector3(0, -R * 2.5, 0)) : hp.clone().addScaledVector(right, R * 1.2);
    this.focusPose = { pos, look };
    this.startFlight(() => this.focusPose, dur, 1.4, () => { this.mode = "focus"; });
    this.mode = "in";
  }

  release(dur = 1.5) {
    if (this.mode === "walk") return;
    this.ps = this.saved ? this.saved.p : this.ps; this.p = this.ps; this.yawS = this.yaw;
    this.startFlight(() => { const o = { pos: new THREE.Vector3(), look: new THREE.Vector3() }; this.walkPose(this.p, this.mxS, this.myS, this.yawS, o.pos, o.look); return o; }, dur, 1.0, () => { this.mode = "walk"; });
    this.mode = "out";
  }

  startFlight(target, dur, arc, done) {
    this.flight = { t: 0, dur, arc, target, done, fromPos: this.pos.clone(), fromLook: this.look.clone() };
  }

  update(dt) {
    this.mxS = damp(this.mxS, this.mx, 2.6, dt); this.myS = damp(this.myS, this.my, 2.6, dt);
    if (this.mode === "walk") {
      this.ps = damp(this.ps, this.p, 2.4, dt); this.yawS = damp(this.yawS, this.yaw, 5, dt);
      this.walkPose(this.ps, this.mxS, this.myS, this.yawS, this.pos, this.look);
    } else if (this.flight) {
      const f = this.flight; f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = easeInOutCubic(k), to = f.target();
      this.pos.lerpVectors(f.fromPos, to.pos, e); this.pos.y += Math.sin(Math.PI * e) * f.arc;
      this.look.lerpVectors(f.fromLook, to.look, e);
      if (k >= 1) { this.flight = null; this.pos.copy(to.pos); this.look.copy(to.look); f.done && f.done(); }
    } else if (this.mode === "focus" && this.focusPose) {
      // a hair of parallax while reading
      this.pos.copy(this.focusPose.pos); this.pos.x += this.mxS * 0.22; this.pos.y += this.myS * 0.12;
      this.look.copy(this.focusPose.look);
    }
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
