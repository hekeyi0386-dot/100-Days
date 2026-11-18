/* GardenScene: assembles the world (terrain, atmosphere, flowers), the camera, and the UI on top of it.
 *   GardenScene
 *   ├─ Intro               the prelude: you are a butterfly, entering the garden
 *   ├─ CameraController    bird's eye (default, zoom + pan) / overview / walk; click to land on a flower
 *   ├─ Butterfly / Pollen  the visitor, and what it stirs up on the flowers it visits
 *   ├─ Visits              which flowers have been awakened into colour (kept in localStorage)
 *   ├─ Terrain / Sky / Hills
 *   ├─ Atmosphere          light, fog, grass, motes
 *   ├─ FlowerField         100 × Flower
 *   ├─ DayOverlay          the day's photograph, date and note (HTML)
 *   └─ ProgressIndicator   Day 01 ——— Day 100 */
import * as THREE from "three";
import { CameraController } from "./CameraController.js";
import { createTerrain, createHills, createSky, FOG_COLOR } from "./Terrain.js";
import { createAtmosphere } from "./Atmosphere.js";
import { FlowerField } from "./FlowerField.js";
import { DayOverlay } from "./DayOverlay.js";
import { ProgressIndicator } from "./ProgressIndicator.js";
import { ViewSwitcher } from "./ViewSwitcher.js";
import { Pollen } from "./Pollen.js";
import { Visits } from "./Visits.js";
import { Butterfly } from "./Butterfly.js";
import { Intro } from "./Intro.js";
import { tOfZ, zOfT } from "./layout.js";
import { clamp, lerp, pad3, smoothstep } from "./utils.js";

export class GardenScene {
  constructor({ canvas, data, config }) {
    this.canvas = canvas; this.total = data.total || 100; this.config = config;
    this.mobile = matchMedia("(pointer:coarse)").matches || innerWidth < 760;
    this.entries = data.entries.slice().sort((a, b) => a.day - b.day);
    this.filled = this.entries.map((e) => e.day);

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    r.setPixelRatio(this.pixelRatio);
    r.setClearColor(FOG_COLOR, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 900);
    this.sky = createSky(); this.scene.add(this.sky);
    this.scene.add(createHills());
    this.scene.add(createTerrain({ mobile: this.mobile }));
    this.atmosphere = createAtmosphere(this.scene, { mobile: this.mobile });
    this.visits = new Visits();
    this.field = new FlowerField(this.entries, this.total, { mobile: this.mobile, anisotropy: Math.min(4, r.capabilities.getMaxAnisotropy()), visits: this.visits });
    this.scene.add(this.field.group);
    this.pollen = new Pollen(); this.field.pollen = this.pollen; this.scene.add(this.pollen.points);

    const deepLink = /^#day-\d+$/.test(location.hash);                        // a link to one day skips the prelude
    this.controller = new CameraController(this.camera, canvas, { mobile: this.mobile, bounds: this.field.bounds, startZoom: deepLink ? 1 : 1.55 });
    this.controller.locked = !deepLink;
    this.views = new ViewSwitcher((name) => this.setView(name));
    this.controller.onViewChange = (name) => this.viewChanged(name);
    this.overlay = new DayOverlay();
    this.timeline = new ProgressIndicator(this.total, this.filled, (d) => this.walkToDay(d));
    this.tag = document.querySelector("#tag");
    if (matchMedia("(pointer:coarse)").matches) document.querySelector("#hint").textContent = "Swipe to walk deeper \u00b7 tap a flower to enter a day";
    this.hint = document.querySelector("#hint");
    this.raycaster = new THREE.Raycaster();
    this.current = null; this.last = performance.now(); this.frames = 0; this.slow = 0; this.t = 0;
    this.hintMoved = 0; this.idleTimer = 0;
    this.fog = this.scene.fog; this.viewChanged("top", true);
    this.butterfly = new Butterfly();
    this.intro = new Intro({ onEnter: () => this.enterGarden() }); if (deepLink) this.intro.skip();
    this.visits.onChange = () => this.updateAwake();
    document.querySelector("#awake-reset").addEventListener("click", () => this.forget());
    this.updateAwake();

    this.bind(); this.resize(); this.armIdle();
  }

  /* ---------- dates ---------- */
  dateOf(day) {
    const e = this.entries.find((x) => x.day === day);
    let d = null;
    if (e && e.date) { const [y, m, dd] = e.date.split("-").map(Number); d = new Date(y, m - 1, dd); }
    else if (this.config.startDate) { const [y, m, dd] = this.config.startDate.split("-").map(Number); d = new Date(y, m - 1, dd + day - 1); }
    return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  }

  /* ---------- input ---------- */
  bind() {
    addEventListener("resize", () => this.resize());
    this.controller.onTap = (x, y) => {
      if (this.current) return;
      const f = this.pick(x, y);
      if (f && f.hasImage) this.openDay(f.day);
    };
    this.controller.onActivity = () => { this.hintMoved++; if (this.hintMoved > 12) this.hint.classList.add("gone"); this.armIdle(); };
    this.overlay.onClose = () => this.closeDay();
    this.overlay.onPrev = () => this.step(-1);
    this.overlay.onNext = () => this.step(1);
    addEventListener("keydown", (e) => {
      if (!this.current) { if (e.key === "Escape" && this.controller.view !== "top") this.setView("top"); return; }
      if (e.key === "Escape") this.closeDay(); else if (e.key === "ArrowLeft") this.step(-1); else if (e.key === "ArrowRight") this.step(1);
    });
    addEventListener("popstate", () => {
      const m = /^#day-(\d+)$/.exec(location.hash);
      if (m && this.field.byDay.get(+m[1])?.hasImage) this.openDay(+m[1], { fromHistory: true }); else if (this.current) this.closeDay({ fromHistory: true });
    });
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { if (this.current) return this.armIdle(); this.hintMoved = 0; this.hint.classList.remove("gone"); }, 10000);
  }

  pick(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    return this.pickNDC(ndc);
  }
  pickNDC(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.field.targets, false);
    for (const h of hits) {
      const f = h.object.userData.flower;
      if (f.hasImage && h.uv) { const u = (h.uv.x - 0.5) * 2, v = (h.uv.y - 0.5) * 2; if (u * u + v * v > 1.04) continue; }  // round heads only
      return f;
    }
    return null;
  }

  /* ---------- camera views ---------- */
  setView(name) { if (!this.current) this.controller.setView(name); }

  viewChanged(name, initial = false) {
    this.views.setActive(name);
    for (const n of ["walk", "overview", "top"]) document.body.classList.toggle("view-" + n, n === name);
    const coarse = matchMedia("(pointer:coarse)").matches;
    this.hint.textContent = {
      walk: coarse ? "Swipe to flutter deeper \u00b7 tap a flower to land" : "Scroll to flutter deeper \u00b7 hover to visit a flower \u00b7 click to land",
      overview: coarse ? "Swipe to glide along the garden \u00b7 tap a flower to land" : "Scroll to glide along the garden \u00b7 click a flower to land",
      top: coarse ? "Drag to drift \u00b7 pinch to draw near \u00b7 tap a flower to land" : "Drag to drift \u00b7 scroll to draw near \u00b7 rest on a flower to wake it",
    }[name];
    this.hintMoved = 0; this.hint.classList.remove("gone"); this.armIdle();
    clearTimeout(this.hintFade);
    if (!initial) this.hintFade = setTimeout(() => this.hint.classList.add("gone"), 6500);
  }

  // up high the haze steps back, so the whole field stays crisp
  updateFog() {
    const v = this.controller.v, a = smoothstep(0, 1, Math.min(v, 1)), b = smoothstep(1, 2, v);
    this.fog.near = lerp(lerp(30, 55, a), 170, b); this.fog.far = lerp(lerp(285, 340, a), 760, b);
  }

  /* ---------- one day ---------- */
  openDay(day, { fromHistory = false } = {}) {
    const f = this.field.byDay.get(day); if (!f || !f.hasImage) return;
    const first = !this.current;
    this.current = f; document.body.classList.add("focusing");
    f.loadColor(this.field.loader, this.field.anisotropy);                    // so its colour is ready by the time we arrive
    this.field.setHover(null); this.field.setFocus(f); this.hideTag();
    this.controller.focusOn(f, first ? 0 : 1.3);
    const idx = this.filled.indexOf(day);
    setTimeout(() => { if (this.current === f) this.overlay.show({ entry: f.entry, date: this.dateOf(day), hasPrev: idx > 0, hasNext: idx < this.filled.length - 1 }); }, first ? 650 : 250);
    if (!fromHistory) { if (first) history.pushState({ day }, "", "#day-" + day); else history.replaceState({ day }, "", "#day-" + day); }
    this.hint.classList.add("gone");
  }

  closeDay({ fromHistory = false } = {}) {
    if (!this.current) return;
    if (!fromHistory && history.state && history.state.day) { history.back(); return; }   // popstate will call us again
    this.current = null; document.body.classList.remove("focusing"); this.field.setFocus(null); this.overlay.hide(); this.controller.release();
    if (!fromHistory) history.replaceState(null, "", location.pathname + location.search);
    this.armIdle();
  }

  step(d) {
    if (!this.current) return;
    const i = this.filled.indexOf(this.current.day) + d;
    if (this.filled[i]) this.openDay(this.filled[i]);
  }

  walkToDay(day) {
    if (this.current) return;
    const f = this.field.byDay.get(day);
    if (this.controller.view === "top") { if (f.hasImage) this.openDay(day); return; }
    this.controller.goToDay(f.base.z);
  }

  /* ---------- per frame ---------- */
  hover() {
    const c = this.controller;
    if (this.current || c.mode !== "free" || c.trans || !c.hasPointer || this.intro.open) { if (this.field.hovered) { this.field.setHover(null); this.hideTag(); } return; }
    const f = this.pickNDC(c.pointer);
    if (f && f.hasImage && f !== this.field.hovered) { const up = this.field.faceUp; this.pollen.burst(f.headPos, f.R * (1 + 0.45 * up), 9, 1 + 1.6 * up); }   // the butterfly arrives: a puff of pollen
    this.field.setHover(f);
    if (f) this.showTag(f); else this.hideTag();
    if (!this.butterfly.enabled) this.canvas.style.cursor = f && f.hasImage ? "pointer" : "";
  }

  showTag(f) {
    const tag = this.tag, v = f.headPos.clone().project(this.camera);
    if (v.z > 1) return this.hideTag();
    const dist = f.headPos.distanceTo(this.camera.position), rpx = (f.R / dist) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (innerHeight / 2) * 1.17;
    if (tag.dataset.day !== String(f.day)) {
      tag.dataset.day = String(f.day);
      tag.querySelector(".t-day").textContent = "DAY " + pad3(f.day);
      tag.querySelector(".t-date").textContent = this.dateOf(f.day);
      const title = f.entry && f.entry.title;
      tag.querySelector(".t-title").textContent = f.hasImage ? (title ? `“${title}”` : "") : "Still to come";
    }
    let x = (v.x * 0.5 + 0.5) * innerWidth + rpx + 14, y = (-v.y * 0.5 + 0.5) * innerHeight;
    tag.classList.add("show");
    const w = tag.offsetWidth, h = tag.offsetHeight;
    if (x + w > innerWidth - 12) x = (v.x * 0.5 + 0.5) * innerWidth - rpx - 14 - w;
    tag.style.transform = `translate3d(${x.toFixed(0)}px,${clamp(y - h / 2, 10, innerHeight - h - 10).toFixed(0)}px,0)`;
  }
  hideTag() { this.tag.classList.remove("show"); this.tag.dataset.day = ""; if (!this.butterfly.enabled) this.canvas.style.cursor = ""; }

  /* ---------- the butterfly, and the garden's memory ---------- */
  headScreen(f) {                                   // where a flower's head is on screen, and how big
    const v = f.headPos.clone().project(this.camera), dist = f.headPos.distanceTo(this.camera.position);
    const scale = 1 + 0.17 + this.field.faceUp * 0.45, r = (f.R * scale / dist) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (innerHeight / 2);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, r, behind: v.z > 1 };
  }

  updateButterfly(dt) {
    const c = this.controller, active = !this.current && !this.intro.open && c.mode === "free" && c.hasPointer;
    const pointer = c.hasPointer ? { x: (c.pointer.x * 0.5 + 0.5) * innerWidth, y: (-c.pointer.y * 0.5 + 0.5) * innerHeight } : null;
    let perch = null; const h = this.field.hovered;
    if (active && h && h.hasImage) { const s = this.headScreen(h); if (!s.behind) perch = { x: s.x, y: s.y - s.r * 0.7 }; }   // it lands on the rim of the flower it visits
    this.butterfly.update(dt, pointer, perch, active);
  }

  enterGarden() { this.controller.enter(); this.hintMoved = 0; this.hint.classList.remove("gone"); this.armIdle(); }

  // the butterfly has landed and the visitor is looking: the flower wakes into colour, and stays that way
  awakenNow(f) {
    if (!this.field.awaken(f)) return;
    this.pollen.burst(f.headPos, f.R * 1.15, 42, 1.3); this.updateAwake();
  }

  updateAwake() {
    const n = [...this.visits.set].filter((d) => this.field.byDay.get(d) && this.field.byDay.get(d).hasImage).length;
    const el = document.querySelector("#awake"); el.hidden = n === 0;
    document.querySelector("#awake-n").textContent = n === 1 ? `1 of ${this.filled.length} flowers awake` : `${n} of ${this.filled.length} flowers awake`;
    this.timeline.setVisited(this.visits.set);
  }

  forget() { this.visits.clear(); this.field.sleepAll(); this.updateAwake(); }

  currentDay() {
    if (this.current) return this.current.day;
    return clamp(Math.round(1 + this.controller.ps * (this.total - 1)), 1, this.total);   // Day 1 at the entrance, Day 100 at the far end
  }

  resize() {
    const w = innerWidth, h = innerHeight, a = w / h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = a;
    this.controller.setAspect(a, a < 0.85 ? 66 : a < 1.2 ? 58 : 52);
    this.camera.fov = this.controller.fov; this.camera.updateProjectionMatrix();
  }

  /* quietly lower the resolution on slow machines */
  watchPerformance(dt) {
    this.frames++; this.slow += dt > 0.032 ? 1 : 0;
    if (this.frames === 120) {
      if (this.slow > 60 && this.pixelRatio > 0.8) { this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.35); this.renderer.setPixelRatio(this.pixelRatio); this.resize(); }
      this.frames = 0; this.slow = 0;
    }
  }

  frame = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (this.intro.open) this.controller.pan.set(Math.sin(this.t * 0.09) * 9, Math.cos(this.t * 0.07) * 3);   // the prelude's backdrop drifts very slowly
    this.controller.update(dt);
    if (this.current && this.controller.mode === "focus" && !this.current.visited) this.awakenNow(this.current);
    this.field.faceUp = this.controller.faceUp; this.field.topYaw = this.controller.portrait ? 0 : Math.PI / 2; this.field.topPitch = this.controller.pitch; this.field.loadAll = this.controller.v > 0.5;
    this.field.update(this.t, dt, this.camera);
    this.updateFog();
    this.atmosphere.update(this.t);
    this.sky.position.copy(this.camera.position);
    this.hover();
    this.pollen.update(dt, this.camera, innerHeight);
    this.updateButterfly(dt);
    const c = this.controller, day = this.currentDay(), z0 = lerp(c.zStart, c.zEnd, c.ps), a = smoothstep(0, 1, Math.min(c.v, 1)), top = smoothstep(1, 2, c.v);
    let lo = clamp(Math.floor(1 + tOfZ(z0 - 4 + 14 * a) * (this.total - 1)), 1, this.total), hi = clamp(Math.ceil(1 + tOfZ(z0 - 105 - 30 * a) * (this.total - 1)), 1, this.total);
    if (top > 0.5) { lo = 1; hi = this.total; }                       // from above, every day is in view
    this.timeline.update(day, lo, hi, this.field.hovered ? this.field.hovered.day : 0, top > 0.5 && !this.current);
    this.renderer.render(this.scene, this.camera);
    this.watchPerformance(dt);
    requestAnimationFrame(this.frame);
  };

  start() {
    this.resize(); this.frame();
    const m = /^#day-(\d+)$/.exec(location.hash);
    if (m && this.field.byDay.get(+m[1])?.hasImage) {
      const f = this.field.byDay.get(+m[1]);
      this.controller.goToDay(f.base.z, true);
      setTimeout(() => this.openDay(+m[1], { fromHistory: true }), 400);
    }
  }
}
