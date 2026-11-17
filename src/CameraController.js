/* A curated, editorial camera: one PerspectiveCamera, three designed viewpoints, soft transitions.
 *
 *   walk      at the height of the flowers; scroll walks the winding path, the mouse only tilts the view
 *   overview  standing on a hill: up, pulled back, looking diagonally across the garden
 *   top       bird's eye: high above, slightly tilted, the whole field laid out left (day 1) -> right (day 100)
 *
 * A single number `v` (0 walk, 1 overview, 2 top) is eased between the presets, so position, target and
 * field of view always travel together. Clicking a flower flies to it from wherever you are, and
 * "Back to the garden" flies you back to the view you left. No free flight, no WASD. */
import * as THREE from "three";
import { clamp, damp, easeInOutCubic, lerp, smoothstep } from "./utils.js";
import { terrainHeight, zOfT, pathX } from "./layout.js";

export const VIEWS = ["walk", "overview", "top"];
const FOV_OFFSET = [0, 7, 4];
const rad = THREE.MathUtils.degToRad;
const _v = new THREE.Vector3();

const makePose = () => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

export class CameraController {
  constructor(camera, dom, { mobile, bounds }) {
    this.camera = camera; this.dom = dom; this.mobile = mobile; this.bounds = bounds;
    this.zStart = mobile ? 6 : 9; this.zEnd = zOfT(1) + 36;
    this.fovBase = 52; this.fov = 52; this.aspect = 1.6; this.portrait = false;

    // walking state
    this.p = 0; this.ps = 0; this.yaw = 0; this.yawS = 0; this.lift = 0; this.liftS = 0;
    // bird's-eye state
    this.zoom = 1; this.zoomS = 1; this.pan = new THREE.Vector2(); this.panS = new THREE.Vector2();
    // pointer
    this.mx = 0; this.my = 0; this.mxS = 0; this.myS = 0; this.hasPointer = false; this.pointer = new THREE.Vector2();

    // views
    this.view = "walk"; this.v = 0; this.trans = null; this.faceUp = 0;
    // free | in | focus | out
    this.mode = "free"; this.flight = null; this.focusPose = null;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.A = makePose(); this.B = makePose(); this.C = makePose(); this.poseFov = 52;

    this.onTap = null; this.onActivity = null; this.onViewChange = null; this.locked = false;
    this.computePose(0, this.pos, this.look);
    this.bind();
  }

  get busy() { return this.mode !== "free" || !!this.trans || this.locked; }
  get viewIndex() { return VIEWS.indexOf(this.view); }

  setAspect(aspect, fovBase) { this.aspect = aspect; this.fovBase = fovBase; this.portrait = aspect < 0.95; if (!this.flight) this.fov = fovBase + this.fovOffsetAt(this.v); }
  fovOffsetAt(v) { return v <= 1 ? lerp(FOV_OFFSET[0], FOV_OFFSET[1], smoothstep(0, 1, v)) : lerp(FOV_OFFSET[1], FOV_OFFSET[2], smoothstep(0, 1, v - 1)); }

  /* ---------- presets ---------- */
  walkPose(o) {
    const z = lerp(this.zStart, this.zEnd, this.ps), x = pathX(z), camH = lerp(this.mobile ? 6.4 : 7.8, 4.4, Math.pow(this.ps, 0.7)) + this.liftS * 9;
    const lz = z - 42, lx = pathX(lz);
    o.pos.set(x + this.mxS * 1.1, terrainHeight(x, z) + camH, z);
    o.look.set(lx + this.mxS * 8, terrainHeight(lx, lz) + 1.7 - this.liftS * 1.4 + this.myS * 2.4, lz);
    this.applyYaw(o, this.yawS);
  }

  // standing on a hill: up, pulled back towards the entrance, looking diagonally down the field
  overviewPose(o) {
    const z = lerp(this.zStart, this.zEnd, this.ps), zc = z + 22, x = pathX(zc), lz = z - 54, lx = pathX(lz);
    o.pos.set(x + this.mxS * 2, terrainHeight(x, zc) + 30 + this.liftS * 10, zc);
    o.look.set(lx + this.mxS * 10, terrainHeight(lx, lz) + 1 + this.myS * 3, lz);
    this.applyYaw(o, this.yawS * 0.7);
  }

  /* high above the whole field, tilted ~15° off vertical so it keeps depth.
   * Landscape: the camera hangs over one side and looks across, so the long garden runs left -> right.
   * Portrait: it hangs behind the entrance and the garden runs bottom -> top. */
  topPose(o) {
    const b = this.bounds, fov = this.fovBase + FOV_OFFSET[2], vt = Math.tan(rad(fov / 2)), ht = vt * this.aspect, m = 1.14;
    const dist = (this.portrait ? Math.max((b.d * m) / (2 * vt), (b.w * m + 8) / (2 * ht)) : Math.max((b.d * m) / (2 * ht), (b.w * m + 10) / (2 * vt))) * this.zoomS;
    const tilt = rad(15), sx = this.panS.x + this.mxS * 3, sy = this.panS.y + this.myS * 2.5;   // pan in screen units
    const tx = b.cx - (this.portrait ? -sx : sy), tz = b.cz - (this.portrait ? sy : sx);
    o.look.set(tx, 2.5, tz);
    if (this.portrait) o.pos.set(tx, 2.5 + Math.cos(tilt) * dist, tz + Math.sin(tilt) * dist);
    else o.pos.set(tx + Math.sin(tilt) * dist, 2.5 + Math.cos(tilt) * dist, tz);
  }

  applyYaw(o, yaw) {
    const dx = o.look.x - o.pos.x, dz = o.look.z - o.pos.z, c = Math.cos(yaw), s = Math.sin(yaw);
    o.look.x = o.pos.x + dx * c + dz * s; o.look.z = o.pos.z - dx * s + dz * c;
  }

  computePose(v, pos, look) {
    const { A, B, C } = this;
    this.walkPose(A); this.overviewPose(B); this.topPose(C);
    if (v <= 1) { const a = smoothstep(0, 1, v); pos.lerpVectors(A.pos, B.pos, a); look.lerpVectors(A.look, B.look, a); }
    else { const a = smoothstep(0, 1, v - 1); pos.lerpVectors(B.pos, C.pos, a); look.lerpVectors(B.look, C.look, a); }
    this.poseFov = this.fovBase + this.fovOffsetAt(v);
  }

  /* ---------- views ---------- */
  setView(name) {
    const to = VIEWS.indexOf(name);
    if (to < 0 || this.mode !== "free" || name === this.view) return false;
    const dist = Math.abs(to - this.v);
    this.trans = { from: this.v, to, t: 0, dur: dist > 1.1 ? 2.4 : 1.7 };
    this.view = name; this.onViewChange && this.onViewChange(name);
    return true;
  }

  /* ---------- input ---------- */
  goToDay(z, immediate) { if (this.view === "top") return; this.p = clamp((this.zStart - (z + 24)) / (this.zStart - this.zEnd), 0, 1); if (immediate) this.ps = this.p; }

  bind() {
    const d = this.dom;
    addEventListener("wheel", (e) => {
      e.preventDefault();                          // also stops the trackpad swipe from triggering browser back/forward
      if (this.busy) return;
      const k = e.deltaMode === 1 ? 16 : 1;
      const dy = e.shiftKey && !e.deltaY ? e.deltaX : e.deltaY, dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (this.view === "top") this.zoom = clamp(this.zoom * (1 + dy * k * 0.0009), 0.62, 1.3);              // gentle zoom, bounded
      else if (e.shiftKey || e.altKey) this.lift = clamp(this.lift + dy * k * 0.0011, 0, 1);                  // limited vertical control
      else this.p = clamp(this.p + (dy + dx) * k * 0.00019, 0, 1);
      this.onActivity && this.onActivity();
    }, { passive: false });
    addEventListener("keydown", (e) => {
      if (this.busy || this.view === "top") return;
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
      if (down.moved <= 6 || this.busy) return;
      if (this.view === "top") {                                       // drag slides the field a little (bounded)
        const upp = (2 * this.topDist() * Math.tan(rad((this.fovBase + FOV_OFFSET[2]) / 2))) / innerHeight;
        this.pan.set(clamp(this.pan.x - dx * upp, -16, 16), clamp(this.pan.y + dy * upp, -12, 12));
      } else {
        this.yaw = clamp(this.yaw - dx * (down.touch ? 0.0042 : 0.0034), -0.55, 0.55);
        if (down.touch) this.p = clamp(this.p - dy * 0.0007, 0, 1);
        else this.lift = clamp(this.lift - dy * 0.004, 0, 1);          // vertical drag lifts the camera a little
      }
    });
    d.addEventListener("pointerup", (e) => {
      if (down && down.moved < 7 && performance.now() - down.t < 600 && this.onTap && this.mode === "free") this.onTap(e.clientX, e.clientY, down.touch);
      down = null;
    });
    d.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") { this.hasPointer = false; this.mx = 0; this.my = 0; } });
  }

  topDist() { return this.C.pos.distanceTo(this.C.look); }

  /* ---------- fly to a flower ---------- */
  focusOn(flower, dur) {
    if (this.trans) { this.v = this.trans.to; this.trans = null; }
    const yaw0 = clamp(flower.layout.yaw * 0.5, -0.3, 0.3), R = flower.R, d = R * (this.mobile ? 6.4 : 3.8);
    const fwd = new THREE.Vector3(Math.sin(yaw0), 0, Math.cos(yaw0)), right = new THREE.Vector3(Math.cos(yaw0), 0, -Math.sin(yaw0));
    const hp = flower.headPos.clone();
    const pos = hp.clone().addScaledVector(fwd, d); pos.y += R * 0.1;
    const look = this.mobile ? hp.clone().add(new THREE.Vector3(0, -R * 2.5, 0)) : hp.clone().addScaledVector(right, R * 1.2);
    this.focusPose = { pos, look, fov: this.fovBase };
    const fromHigh = this.v > 0.6;
    this.startFlight(() => this.focusPose, dur || (fromHigh ? 2.3 : 1.7), fromHigh ? 0 : 1.4, () => { this.mode = "focus"; });
    this.mode = "in";
  }

  // back to the view you left (walk, overview or top), exactly as it was
  release(dur = 1.7) {
    if (this.mode === "free") return;
    this.yawS = this.yaw;
    this.startFlight(() => { const o = makePose(); this.computePose(this.v, o.pos, o.look); o.fov = this.poseFov; return o; }, this.v > 0.6 ? 2.2 : dur, 0.8, () => { this.mode = "free"; });
    this.mode = "out";
  }

  startFlight(target, dur, arc, done) { this.flight = { t: 0, dur, arc, target, done, fromPos: this.pos.clone(), fromLook: this.look.clone() }; }

  /* ---------- per frame ---------- */
  update(dt) {
    this.mxS = damp(this.mxS, this.mx, 2.6, dt); this.myS = damp(this.myS, this.my, 2.6, dt);
    if (this.mode === "free") {
      this.ps = damp(this.ps, this.p, 2.4, dt); this.yawS = damp(this.yawS, this.yaw, 5, dt); this.liftS = damp(this.liftS, this.lift, 3, dt);
      this.zoomS = damp(this.zoomS, this.zoom, 3, dt); this.panS.x = damp(this.panS.x, this.pan.x, 3, dt); this.panS.y = damp(this.panS.y, this.pan.y, 3, dt);
      if (this.trans) {                                                // eased move between the presets
        const t = this.trans; t.t += dt;
        const k = Math.min(1, t.t / t.dur); this.v = lerp(t.from, t.to, easeInOutCubic(k));
        if (k >= 1) { this.v = t.to; this.trans = null; }
      }
      this.computePose(this.v, this.pos, this.look); this.fov = this.poseFov;
    } else if (this.flight) {
      const f = this.flight; f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = easeInOutCubic(k), to = f.target();
      this.pos.lerpVectors(f.fromPos, to.pos, e); this.pos.y += Math.sin(Math.PI * e) * f.arc;
      this.look.lerpVectors(f.fromLook, to.look, e);
      this.fov = damp(this.fov, to.fov, 3, dt);
      if (k >= 1) { this.flight = null; this.pos.copy(to.pos); this.look.copy(to.look); f.done && f.done(); }
    } else if (this.mode === "focus" && this.focusPose) {
      this.pos.copy(this.focusPose.pos); this.pos.x += this.mxS * 0.22; this.pos.y += this.myS * 0.12;   // a hair of parallax while reading
      this.look.copy(this.focusPose.look); this.fov = damp(this.fov, this.fovBase, 3, dt);
    }
    // the flowers lift their faces to the sky as the camera really rises, and stand upright again as it comes down
    this.faceUp = damp(this.faceUp, smoothstep(36, 70, this.pos.y), 5, dt);

    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
