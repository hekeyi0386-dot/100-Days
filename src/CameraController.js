/* A curated, editorial camera: one PerspectiveCamera, three designed viewpoints, soft transitions.
 *
 *   top       (the way in) high above, slightly tilted, the whole field laid out left (day 1) -> right (day 100).
 *             You can draw nearer (zoom, anchored to the pointer), drift across it (pan), both bounded.
 *   overview  standing on a hill: up, pulled back, looking diagonally across the garden
 *   walk      at the height of the flowers; scroll walks the winding path, the mouse only tilts the view
 *
 * A single number `v` (0 walk, 1 overview, 2 top) is eased between the presets, so position, target and
 * field of view always travel together. Clicking a flower flies to it from wherever you are, and
 * "Back to the garden" flies you back to the view you left. No free flight, no WASD. */
import * as THREE from "three";
import { clamp, damp, easeInOutCubic, lerp, smoothstep } from "./utils.js";
import { terrainHeight, zOfT, pathX } from "./layout.js";

export const VIEWS = ["walk", "overview", "top"];
const FOV_OFFSET = [0, 7, 4];
const ZOOM_MAX = 1.45;                            // how far the bird's eye may draw back (1 = the whole field fits)
const NEAREST = 20;                               // ...and how near: never closer than this to the field, so the composition holds
const rad = THREE.MathUtils.degToRad;

const makePose = () => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
const _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _ndc = new THREE.Vector2();

export class CameraController {
  constructor(camera, dom, { mobile, bounds, startZoom = 1 }) {
    this.camera = camera; this.dom = dom; this.mobile = mobile; this.bounds = bounds;
    this.zStart = mobile ? 6 : 9; this.zEnd = zOfT(1) + 36;
    this.fovBase = 52; this.fov = 52; this.aspect = 1.6; this.portrait = false;

    // walking state
    this.p = 0; this.ps = 0; this.yaw = 0; this.yawS = 0; this.lift = 0; this.liftS = 0;
    // bird's-eye state: zoom (1 = whole field) and pan (world units, screen-aligned), each with a smoothed twin
    this.zoom = startZoom; this.zoomS = startZoom; this.pan = new THREE.Vector2(); this.panS = new THREE.Vector2(); this.glideUntil = 0;
    // pointer
    this.mx = 0; this.my = 0; this.mxS = 0; this.myS = 0; this.hasPointer = false; this.pointer = new THREE.Vector2();

    // views: the garden opens as a bird's eye
    this.view = "top"; this.v = 2; this.trans = null; this.faceUp = 1; this.pitch = rad(75);
    // free | in | focus | out
    this.mode = "free"; this.flight = null; this.focusPose = null; this.focusFlower = null; this.detail = null;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.A = makePose(); this.B = makePose(); this.C = makePose(); this.poseFov = 52;
    this._tp = makePose(); this._tc = new THREE.PerspectiveCamera(); this._ray = new THREE.Raycaster(); this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.5);

    // held keys (state, not events): the loop reads these every frame
    this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
    this.kv = { fwd: 0, turn: 0, px: 0, py: 0 }; this.keyPing = 0;
    this.onTap = null; this.onActivity = null; this.onViewChange = null; this.locked = false;
    // sideways swipes on the trackpad do not turn the view (that takes click-and-drag): notice when someone keeps trying
    this.swipe = { sum: 0, last: 0, ends: [] }; this.hintReadyAt = 0; this.hintCount = 0; this.learnedDrag = false; this.onSwipeHint = null;
    this.computePose(this.v, this.pos, this.look);
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

  /* distance at which the whole field just fits the screen */
  fitDistance() {
    const b = this.bounds, fov = this.fovBase + FOV_OFFSET[2], vt = Math.tan(rad(fov / 2)), ht = vt * this.aspect, m = 1.2;
    return this.portrait ? Math.max((b.d * m) / (2 * vt), (b.w * m + 8) / (2 * ht)) : Math.max((b.d * m) / (2 * ht), (b.w * m + 10) / (2 * vt));
  }

  /* High above the field. Landscape: the camera hangs over one side and looks across, so the long garden runs
   * left -> right. Portrait: it hangs behind the entrance and the garden runs bottom -> top.
   * Tilted ~15° off vertical to keep depth; drawing nearer tips it further, so a close look is more of a glide over the garden. */
  topPoseFor(o, zoom, pan, parallax) {
    const b = this.bounds, dist = this.fitDistance() * zoom, tilt = lerp(rad(34), rad(15), smoothstep(0.3, 1.0, zoom));
    const sx = pan.x + (parallax ? this.mxS * 3 * zoom : 0), sy = pan.y + (parallax ? this.myS * 2.5 * zoom : 0);   // pan in screen directions
    const tx = b.cx - (this.portrait ? -sx : sy), tz = b.cz - (this.portrait ? sy : sx);
    o.look.set(tx, 2.5, tz);
    if (this.portrait) o.pos.set(tx, 2.5 + Math.cos(tilt) * dist, tz + Math.sin(tilt) * dist);
    else o.pos.set(tx + Math.sin(tilt) * dist, 2.5 + Math.cos(tilt) * dist, tz);
  }
  topPose(o) { this.topPoseFor(o, this.zoomS, this.panS, true); }

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

  /* ---------- the bird's-eye: zoom and pan, always bounded ---------- */
  zoomMin() { return clamp(NEAREST / this.fitDistance(), 0.28, 0.6); }

  unitsPerPixel() { return (2 * this.fitDistance() * this.zoomS * Math.tan(rad((this.fovBase + FOV_OFFSET[2]) / 2))) / innerHeight; }

  clampPan() {
    // the centre of the view may reach the edge of the real flower field (b comes from the flower positions) and a little beyond,
    // at any zoom; only when drawn far back does the range tighten, so the field never drifts away altogether
    const b = this.bounds, f = this.zoom <= 1 ? 1 : lerp(1, 0.4, clamp((this.zoom - 1) / (ZOOM_MAX - 1), 0, 1)), m = 5;
    const lx = (this.portrait ? b.w : b.d) / 2 * f + m, ly = (this.portrait ? b.d : b.w) / 2 * f + m;
    this.pan.set(clamp(this.pan.x, -lx, lx), clamp(this.pan.y, -ly, ly));
  }

  groundPoint(ndcx, ndcy, zoom, pan, out) {
    this.topPoseFor(this._tp, zoom, pan, false);
    const c = this._tc; c.fov = this.fovBase + FOV_OFFSET[2]; c.aspect = this.aspect; c.updateProjectionMatrix();
    c.position.copy(this._tp.pos); c.lookAt(this._tp.look); c.updateMatrixWorld(true);
    this._ray.setFromCamera(_ndc.set(ndcx, ndcy), c);
    return this._ray.ray.intersectPlane(this._plane, out);
  }

  // draw nearer / further while the spot under the pointer stays (roughly) where it is
  zoomAt(factor, ndcx = 0, ndcy = 0) {
    const g0 = this.groundPoint(ndcx, ndcy, this.zoom, this.pan, _g0) && _g0;
    this.zoom = clamp(this.zoom * factor, this.zoomMin(), ZOOM_MAX);
    const g1 = this.groundPoint(ndcx, ndcy, this.zoom, this.pan, _g1) && _g1;
    if (g0 && g1) {
      const dx = g0.x - g1.x, dz = g0.z - g1.z;
      if (this.portrait) { this.pan.x += dx; this.pan.y -= dz; } else { this.pan.y -= dx; this.pan.x -= dz; }
    }
    this.clampPan();
  }

  panBy(sx, sy) { this.pan.x += sx; this.pan.y += sy; this.clampPan(); }
  resetTop() { this.zoom = 1; this.pan.set(0, 0); }

  /* ---------- views ---------- */
  setView(name) {
    const to = VIEWS.indexOf(name);
    if (to < 0 || this.mode !== "free") return false;
    if (name === this.view) { if (name === "top" && !this.trans && (this.zoom !== 1 || this.pan.lengthSq() > 0)) { this.resetTop(); return true; } return false; }   // "Bird's eye" again = see the whole field again
    this.clearKeys();
    const dist = Math.abs(to - this.v);
    this.trans = { from: this.v, to, t: 0, dur: dist > 1.1 ? 2.4 : 1.7 };
    this.view = name; this.onViewChange && this.onViewChange(name);
    if (name === "top") this.resetTop();
    return true;
  }

  /* the visitor flies in: from a little further out, gliding down to the full view */
  enter() { this.locked = false; this.zoom = 1; this.pan.set(0, 0); this.glideUntil = performance.now() + 3200; }

  /* ---------- input ---------- */
  goToDay(z, immediate) { if (this.view === "top") return; this.p = clamp((this.zStart - (z + 24)) / (this.zStart - this.zEnd), 0, 1); if (immediate) this.ps = this.p; }

  bind() {
    const d = this.dom;
    const ndcOf = (x, y) => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];

    addEventListener("wheel", (e) => {
      e.preventDefault();                          // also stops the trackpad swipe from triggering browser back/forward
      if (this.busy) return;
      const k = e.deltaMode === 1 ? 16 : 1, [nx, ny] = ndcOf(e.clientX, e.clientY);
      const dy = e.shiftKey && !e.deltaY ? e.deltaX : e.deltaY, dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (this.view === "top") {
        const upp = this.unitsPerPixel();
        if (e.ctrlKey) this.zoomAt(Math.exp(e.deltaY * 0.012), nx, ny);                       // trackpad pinch
        else if (e.shiftKey) this.panBy((e.deltaX || e.deltaY) * k * upp, 0);                 // Shift + wheel: drift sideways
        else if (e.altKey) this.panBy(0, -dy * k * upp);                                      // Alt + wheel: drift up / down
        else { if (dx) this.panBy(dx * k * upp * 0.8, 0); if (!dx || Math.abs(e.deltaY) > 0) this.zoomAt(Math.exp(e.deltaY * k * 0.0012), nx, ny); }
      } else if (e.shiftKey || e.altKey) this.lift = clamp(this.lift + dy * k * 0.0011, 0, 1);   // limited vertical control
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.3 && Math.abs(e.deltaX) > 2) this.noteSwipe(e.deltaX * k, e.timeStamp);   // a sideways swipe moves nothing, so it must not move us forward or back
      else this.p = clamp(this.p + dy * k * 0.00019, 0, 1);
      this.onActivity && this.onActivity();
    }, { passive: false });

    // Arrow keys are HELD STATE (keydown sets, keyup clears); the movement itself happens in update(), once per frame, with dt.
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.key in this.keys) {
        const live = this.mode === "free" && !this.locked;            // (while a view change is under way a held key is remembered, and takes effect once it lands)
        if (live) e.preventDefault();                                  // keep the page from scrolling
        this.keys[e.key] = live; return;                               // (key auto-repeat just sets it true again: harmless)
      }
      if (this.busy) return;
      if (this.view === "top") {
        if (e.key === "+" || e.key === "=") this.zoomAt(0.82); else if (e.key === "-" || e.key === "_") this.zoomAt(1.22); else return;
        e.preventDefault(); this.onActivity && this.onActivity(); return;
      }
      const step = { PageDown: 0.1, PageUp: -0.1, " ": 0.1 }[e.key];
      if (step !== undefined) { e.preventDefault(); this.p = clamp(this.p + step, 0, 1); this.onActivity && this.onActivity(); }
      if (e.key === "Home") this.p = 0; if (e.key === "End") this.p = 1;
    });
    addEventListener("keyup", (e) => { if (e.key in this.keys) this.keys[e.key] = false; });
    addEventListener("blur", () => this.clearKeys());                   // a held key whose keyup we never see must not keep us moving
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.clearKeys(); });

    const pts = new Map(); let down = null, pinch = null;
    d.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); d.setPointerCapture(e.pointerId);
      if (pts.size === 1) down = { lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0, touch: e.pointerType === "touch" };
      else { down = null; const [a, b] = [...pts.values()]; pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
    });
    d.addEventListener("pointermove", (e) => {
      this.pointer.set(...ndcOf(e.clientX, e.clientY));
      this.hasPointer = e.pointerType !== "touch";
      if (this.hasPointer) { this.mx = this.pointer.x; this.my = this.pointer.y; }
      this.onActivity && this.onActivity();
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {                                   // two fingers: draw nearer / further, and drift
        if (this.busy || this.view !== "top") return;
        const [a, b] = [...pts.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const upp = this.unitsPerPixel(); this.pan.x -= (cx - pinch.cx) * upp; this.pan.y += (cy - pinch.cy) * upp;
        if (dist > 8) this.zoomAt(pinch.dist / dist, ...ndcOf(cx, cy)); else this.clampPan();
        pinch = { dist, cx, cy }; return;
      }
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved <= 6 || this.busy) return;
      if (this.view === "top") {                                       // drag the garden under you
        const upp = this.unitsPerPixel(); this.pan.x -= dx * upp; this.pan.y += dy * upp; this.clampPan();
      } else {
        this.learnedDrag = true;
        this.yaw = clamp(this.yaw - dx * (down.touch ? 0.0042 : 0.0034), -0.55, 0.55);
        if (down.touch) this.p = clamp(this.p - dy * 0.0007, 0, 1);
        else this.lift = clamp(this.lift - dy * 0.004, 0, 1);          // vertical drag lifts the camera a little
      }
    });
    const lift = (e) => {
      const wasSingle = pts.size === 1 && down;
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (wasSingle && down.moved < 7 && performance.now() - down.t < 600 && this.onTap && this.mode === "free") this.onTap(e.clientX, e.clientY, down.touch);
      if (!pts.size) down = null;
    };
    d.addEventListener("pointerup", lift);
    d.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinch = null; down = null; });
    d.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") { this.hasPointer = false; this.mx = 0; this.my = 0; } });
  }

  /* Count sideways swipes (a swipe = a burst of wheel events). Two real attempts within a few seconds, from someone who has
   * not yet dragged to turn the view, earn one quiet hint; then it rests for a while and appears at most three times. */
  noteSwipe(dx, at) {
    const s = this.swipe, now = at || performance.now();                  // the moment of the gesture itself, not of the (possibly late) handler
    if (now - s.last > 160) { if (s.sum >= 60) s.ends.push(s.last); s.sum = 0; }          // a new swipe begins
    s.sum += Math.abs(dx); s.last = now; s.ends = s.ends.filter((t) => now - t < 7000);
    if (!this.learnedDrag && s.sum >= 60 && s.ends.length >= 1 && now >= this.hintReadyAt && this.hintCount < 3) {
      this.hintReadyAt = now + 25000; this.hintCount++; s.ends = []; s.sum = 0;
      this.onSwipeHint && this.onSwipeHint();
    }
  }

  /* ---------- fly to a flower ---------- */
  /* where the camera stands to look at an opened flower.
   * Desktop: the flower sits in the middle of the space left of the panel and the head (a square once opened) is exactly as big as the
   * sketch square on the right; the camera looks straight at it, so that square is not foreshortened. Phones: the head sits above the sheet. */
  poseFor(flower) {
    const yaw0 = clamp(flower.layout.yaw * 0.5, -0.3, 0.3), R = flower.R, hp = flower.headPos;
    const fwd = new THREE.Vector3(Math.sin(yaw0), 0, Math.cos(yaw0)), right = new THREE.Vector3(Math.cos(yaw0), 0, -Math.sin(yaw0));
    const D = this.detail;
    if (D && D.desktop) {
      const tanHalf = Math.tan(rad(this.fovBase / 2)), nx = (2 * D.cx) / D.W - 1, ny = 1 - (2 * D.cy) / D.H;      // where the square sits on screen (nx < 0: left of centre, ny: up is +)
      const tanPhi = -nx * tanHalf * this.aspect, cosPhi = 1 / Math.sqrt(1 + tanPhi * tanPhi);
      const d = (1.17 * R * (D.H / 2)) / ((D.sk / 2) * cosPhi * tanHalf);                                        // 1.17 R = the awake head's half size
      const look = hp.clone().addScaledVector(right, tanPhi * d); look.y -= ny * d * tanHalf / cosPhi;              // aim a little off the head so it lands level with the sketch
      return { pos: hp.clone().addScaledVector(fwd, d), look, fov: this.fovBase };
    }
    const d = R * 6.4, pos = hp.clone().addScaledVector(fwd, d); pos.y += R * 0.1;
    return { pos, look: hp.clone().add(new THREE.Vector3(0, -R * 2.5, 0)), fov: this.fovBase };
  }

  focusOn(flower, dur) {
    if (this.trans) { this.v = this.trans.to; this.trans = null; }
    this.focusFlower = flower; this.focusPose = this.poseFor(flower);
    const fromHigh = this.v > 0.6;
    this.startFlight(() => (this.focusPose = this.poseFor(flower)), dur || (fromHigh ? 2.3 : 1.7), fromHigh ? 0 : 1.4, () => { this.mode = "focus"; });
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

  clearKeys() { for (const k in this.keys) this.keys[k] = false; }

  /* Continuous keyboard movement, called once per frame with the frame's dt. Each axis has a velocity that eases toward the wanted
   * value (so it speeds up and settles smoothly), and the keys combine freely: forward + turning, or pan up + left, at once. */
  applyKeys(dt) {
    const K = this.keys, kv = this.kv, can = this.mode === "free" && !this.trans && !this.locked;
    const ax = can ? (K.ArrowRight ? 1 : 0) - (K.ArrowLeft ? 1 : 0) : 0, ay = can ? (K.ArrowUp ? 1 : 0) - (K.ArrowDown ? 1 : 0) : 0;
    if (this.view === "top") {
      kv.px = damp(kv.px, ax, 7, dt); kv.py = damp(kv.py, ay, 7, dt); kv.fwd = damp(kv.fwd, 0, 7, dt); kv.turn = damp(kv.turn, 0, 7, dt);
      if (Math.abs(kv.px) > 0.002 || Math.abs(kv.py) > 0.002) {
        const speed = 650 * this.unitsPerPixel();                     // ~650 px of screen per second at full tilt, at any zoom
        this.pan.x += kv.px * speed * dt; this.pan.y += kv.py * speed * dt; this.clampPan();
      }
    } else {
      kv.fwd = damp(kv.fwd, ay, 5, dt); kv.turn = damp(kv.turn, -ax, 5, dt); kv.px = damp(kv.px, 0, 7, dt); kv.py = damp(kv.py, 0, 7, dt);
      if (Math.abs(kv.fwd) > 0.002) this.p = clamp(this.p + kv.fwd * 0.05 * dt, 0, 1);          // Up = forward (deeper into the garden), Down = back
      if (Math.abs(kv.turn) > 0.002) this.yaw = clamp(this.yaw + kv.turn * 0.95 * dt, -1.25, 1.25);   // Left turns the view left, Right turns it right
    }
    const moving = Math.abs(kv.px) + Math.abs(kv.py) + Math.abs(kv.fwd) + Math.abs(kv.turn) > 0.05;
    if (moving && this.onActivity && (this.keyPing -= dt) <= 0) { this.keyPing = 0.3; this.onActivity(); }
  }

  /* ---------- per frame ---------- */
  update(dt) {
    this.applyKeys(dt);
    this.mxS = damp(this.mxS, this.mx, 2.6, dt); this.myS = damp(this.myS, this.my, 2.6, dt);
    if (this.mode === "free") {
      this.ps = damp(this.ps, this.p, 2.4, dt); this.yawS = damp(this.yawS, this.yaw, 5, dt); this.liftS = damp(this.liftS, this.lift, 3, dt);
      const slow = performance.now() < this.glideUntil;                // the entrance is a long, soft glide
      this.zoomS = damp(this.zoomS, this.zoom, slow ? 1.5 : 6, dt);
      this.panS.x = damp(this.panS.x, this.pan.x, slow ? 1.5 : 7, dt); this.panS.y = damp(this.panS.y, this.pan.y, slow ? 1.5 : 7, dt);
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
    } else if (this.mode === "focus" && this.focusFlower) {
      this.focusPose = this.poseFor(this.focusFlower);                       // an opened flower is still, so this is a fixed place (and follows a resize)
      this.pos.copy(this.focusPose.pos); this.pos.x += this.mxS * 0.22; this.pos.y += this.myS * 0.12;   // a hair of parallax while reading
      this.look.copy(this.focusPose.look); this.fov = damp(this.fov, this.fovBase, 3, dt);
    }
    // the flowers lift their faces to the sky as the camera really rises, and stand upright again as it comes down
    const dh = Math.hypot(this.pos.x - this.look.x, this.pos.z - this.look.z), pitch = Math.atan2(this.pos.y - this.look.y, dh);   // how steeply we look down
    this.faceUp = damp(this.faceUp, smoothstep(rad(30), rad(58), pitch), 5, dt);
    this.pitch = damp(this.pitch, clamp(pitch, rad(40), rad(82)), 6, dt);

    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
