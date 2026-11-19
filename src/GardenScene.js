/* GardenScene: assembles the world (terrain, atmosphere, flowers), the camera, and the UI on top of it.
 *   GardenScene
 *   ├─ Intro               the prelude: you are a butterfly, entering the garden
 *   ├─ CameraController    bird's eye (default, zoom + pan) / overview / walk; click to land on a flower
 *   ├─ Butterfly | Dust    the visitor (a butterfly by default, or a speck of dust), and what it stirs up on the flowers it visits
 *   ├─ Pollen
 *   ├─ Visits              which flowers have been awakened into colour (this visit only: a refresh starts them all as sketches again)
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
import { Dust } from "./Dust.js";
import { readVisitorMode, writeVisitorMode } from "./Visitor.js";
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
    if (matchMedia("(pointer:coarse)").matches) document.querySelector("#hint-text").textContent = "Swipe to walk deeper \u00b7 tap a flower to enter a day";
    this.hint = document.querySelector("#hint");
    this.raycaster = new THREE.Raycaster();
    this.current = null; this.last = performance.now(); this.frames = 0; this.slow = 0; this.t = 0;
    this.hintMoved = 0; this.idleTimer = 0;
    this.fog = this.scene.fog; this.viewChanged("top", true);
    this.butterfly = new Butterfly(); this.speck = new Dust();
    this.visitorMode = readVisitorMode(); this.visitor = this.butterfly;
    this.setVisitorMode(this.visitorMode);                                    // the choice made earlier this session, else the butterfly
    this.intro = new Intro({ onEnter: (mode) => this.enterGarden(mode), startOpen: this.visitorMode === "dust" }); if (deepLink) this.intro.skip();
    this.visits.onChange = () => this.updateAwake();
    this.bindExits(); this.guardLeaving();
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
    this.controller.onSwipeHint = () => this.showCoach();
    this.controller.onActivity = () => { this.hintMoved++; if (this.hintMoved > (this.hintKind === "idle" ? 3 : 12)) this.hint.classList.add("gone"); this.armIdle(); };
    document.querySelector("#hint-x").addEventListener("click", () => this.hint.classList.add("gone"));
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
    this.idleTimer = setTimeout(() => { if (this.current || this.intro.open) return this.armIdle(); this.hintMoved = 0; this.showHint("idle"); }, 10000);
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

  /* a small, passing hint (not a tutorial): shown for a few seconds in the hint's place */
  showCoach() {
    if (this.current || this.intro.open || this.controller.view === "top") return;
    const el = document.querySelector("#coach");
    document.body.classList.add("coaching"); el.classList.add("show");
    clearTimeout(this.coachTimer); this.coachTimer = setTimeout(() => { el.classList.remove("show"); document.body.classList.remove("coaching"); }, 5200);
  }

  /* ---------- camera views ---------- */
  setView(name) { if (!this.current) this.controller.setView(name); }

  viewChanged(name, initial = false) {
    this.views.setActive(name);
    for (const n of ["walk", "overview", "top"]) document.body.classList.toggle("view-" + n, n === name);
    this.hintView = name; this.writeHint();
    this.hintMoved = 0; this.armIdle();
    if (!initial && !this.intro.open) { this.showHint("guide"); clearTimeout(this.hintFade); this.hintFade = setTimeout(() => this.hint.classList.add("gone"), 7000); }   // a new view: its own short instruction
  }

  // the hint speaks in the visitor's own terms (a butterfly flutters and lands; a speck of dust drifts and settles)
  writeHint() {
    const coarse = matchMedia("(pointer:coarse)").matches, dust = this.visitorMode === "dust";
    const t = dust ? {
      walk: coarse ? "Swipe to drift deeper \u00b7 tap a flower to settle" : "Scroll to drift deeper \u00b7 hover a flower \u00b7 click to settle",
      overview: coarse ? "Swipe to drift along the garden \u00b7 tap a flower to settle" : "Scroll to drift along the garden \u00b7 click a flower to settle",
      top: coarse ? "Drag to move left/right \u00b7 pinch to move front/back \u00b7 tap a flower to wake it" : "Drag to move left/right, scroll to move front/back, click to wake it.",
    } : {
      walk: coarse ? "Swipe to flutter deeper \u00b7 tap a flower to land" : "Scroll to flutter deeper \u00b7 hover to visit a flower \u00b7 click to land",
      overview: coarse ? "Swipe to glide along the garden \u00b7 tap a flower to land" : "Scroll to glide along the garden \u00b7 click a flower to land",
      top: coarse ? "Drag to move left/right \u00b7 pinch to move front/back \u00b7 tap a flower to wake it" : "Drag to move left/right, scroll to move front/back, click to wake it.",
    };
    document.querySelector("#hint-text").textContent = t[this.hintView || "top"];
  }

  // up high the haze steps back, so the whole field stays crisp
  updateFog() {
    const v = this.controller.v, a = smoothstep(0, 1, Math.min(v, 1)), b = smoothstep(1, 2, v);
    this.fog.near = lerp(lerp(45, 130, a), 420, b); this.fog.far = lerp(lerp(390, 720, a), 1800, b);   // a light haze only on the far ground while walking; none to speak of from above
  }

  /* ---------- one day ---------- */
  openDay(day, { fromHistory = false } = {}) {
    const f = this.field.byDay.get(day); if (!f || !f.hasImage) return;
    const first = !this.current;
    this.current = f; document.body.classList.add("focusing");
    this.pollen.clear();                                                     // no pollen once a day is opened
    this.field.awaken(f); this.updateAwake();                                // it turns to colour as we descend, and stays that way
    const at = this.filled.indexOf(day);
    for (const d of [this.filled[at - 1], this.filled[at + 1]]) { const n = d && this.field.byDay.get(d); if (n) n.loadColor(this.field.loader, this.field.anisotropy); }   // so going to the next / previous day is clean
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
    if (this.visitorMode === "butterfly" && f && f.hasImage && f !== this.field.hovered) { const up = this.field.faceUp; this.pollen.burst(f.headPos, f.R * (1 + 0.45 * up), 6, 1 + 1.6 * up); }   // the butterfly arrives: a puff of pollen
    this.field.setHover(f, ...this.brushDirection());
    if (f) this.showTag(f); else this.hideTag();
    if (!this.visitor.enabled) this.canvas.style.cursor = f && f.hasImage ? "pointer" : "";
  }

  showTag(f) {
    const tag = this.tag, v = f.headPos.clone().project(this.camera);
    if (v.z > 1) return this.hideTag();
    const dist = f.headPos.distanceTo(this.camera.position), rpx = (f.R / dist) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (innerHeight / 2) * 1.17;
    if (tag.dataset.day !== String(f.day)) {
      tag.dataset.day = String(f.day);
      tag.querySelector(".t-day").textContent = "Day " + pad3(f.day);
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
  hideTag() { this.tag.classList.remove("show"); this.tag.dataset.day = ""; if (!this.visitor.enabled) this.canvas.style.cursor = ""; }

  /* ---------- the butterfly, and the garden's memory ---------- */
  // which way the butterfly has been moving, as a direction on the ground (used to push a flower the way it was brushed)
  brushDirection() {
    const c = this.controller, p = this._prevPtr || (this._prevPtr = c.pointer.clone());
    const vx = c.pointer.x - p.x, vy = c.pointer.y - p.y; p.copy(c.pointer);
    const m = this.camera.matrixWorld.elements;
    const rx = m[0], rz = m[2], fl = Math.hypot(m[8], m[10]), fx = fl > 0.3 ? -m[8] / fl : m[4], fz = fl > 0.3 ? -m[10] / fl : m[6];   // camera right / "forward" along the ground
    return [rx * vx + fx * vy, rz * vx + fz * vy];
  }

  headScreen(f) {                                   // where a flower's head is on screen, and how big
    const v = f.headPos.clone().project(this.camera), dist = f.headPos.distanceTo(this.camera.position);
    const scale = 1 + 0.17 + this.field.faceUp * 0.45, r = (f.R * scale / dist) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (innerHeight / 2);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, r, behind: v.z > 1 };
  }

  updateVisitor(dt) {
    const c = this.controller, active = !this.current && !this.intro.open && c.mode === "free" && c.hasPointer;
    const pointer = c.hasPointer ? { x: (c.pointer.x * 0.5 + 0.5) * innerWidth, y: (-c.pointer.y * 0.5 + 0.5) * innerHeight } : null;
    let perch = null; const h = this.field.hovered;
    if (active && h && h.hasImage) { const s = this.headScreen(h); if (!s.behind) perch = { x: s.x, y: s.y - s.r * 0.7 }; }   // it lands on the rim of the flower it visits
    this.visitor.update(dt, pointer, this.visitorMode === "butterfly" ? perch : (perch ? {} : null), active);   // a butterfly lands on the rim; dust just brightens a little
  }

  /* who is visiting: the same garden and camera either way; the mode only picks the companion, and what it stirs */
  setVisitorMode(mode) {
    this.visitorMode = mode === "dust" ? "dust" : "butterfly";
    writeVisitorMode(this.visitorMode);
    document.body.dataset.visitor = this.visitorMode;
    this.visitor = this.visitorMode === "dust" ? this.speck : this.butterfly;
    this.butterfly.mount(this.visitorMode === "butterfly"); this.speck.mount(this.visitorMode === "dust");
    this.field.touch = this.visitorMode === "butterfly" ? 1 : 0;
    this.pollen.clear();
    if (this.hintView) this.writeHint();
  }

  enterGarden(mode = "butterfly") { this.entered = true; this.setVisitorMode(mode); this.controller.enter(); this.hintMoved = 0; setTimeout(() => { if (!this.current && !this.intro.open) this.showHint("guide"); }, 1400); this.armIdle(); }

  /* the instruction as a small pop-up: "guide" when we arrive, "idle" as a gentle reminder after a quiet while */
  showHint(kind) {
    this.hintKind = kind; clearTimeout(this.hintFade);
    document.querySelector("#hint-title").textContent = kind === "idle" ? "Still here? A gentle reminder" : "How to explore";
    this.hint.classList.add("gone"); void this.hint.offsetWidth; this.hint.classList.remove("gone");
    this.hintFade = setTimeout(() => this.hint.classList.add("gone"), kind === "idle" ? 14000 : 16000);
  }

  updateAwake() {
    const n = [...this.visits.set].filter((d) => this.field.byDay.get(d) && this.field.byDay.get(d).hasImage).length;
    const el = document.querySelector("#awake"); el.hidden = n === 0;
    document.querySelector("#awake-n").textContent = n === 1 ? `1 of ${this.filled.length} flowers awake` : `${n} of ${this.filled.length} flowers awake`;
    this.timeline.setVisited(this.visits.set);
  }

  /* Home: back to the prelude. Nothing is cleared, so the flowers already woken stay in colour when we come back in. */
  goHome() {
    if (this.intro.open) return;
    if (this.current) { this.closeDay({ fromHistory: true }); history.replaceState(null, "", location.pathname + location.search); }
    this.field.setHover(null); this.hideTag(); this.pollen.clear();
    this.controller.locked = true;
    this.intro.show();
  }

  /* Reset Garden: every flower asleep again, as if nobody had ever been here, then the prelude */
  resetGarden() {
    if (this.current) { this.closeDay({ fromHistory: true }); history.replaceState(null, "", location.pathname + location.search); }
    this.visits.clear(); this.field.sleepAll(); this.updateAwake(); this.entered = false;
    this.field.setHover(null); this.hideTag(); this.pollen.clear();
    if (this.controller.view !== "top") this.setView("top");
    this.controller.resetTop();
    this.goHome();
  }

  /* A refresh, a closed tab or a link away would throw the awakened flowers back to sleep (they live in memory only),
   * so once someone has woken a flower, or is out in the garden, the browser is asked to confirm before it leaves.
   * Only the browser's own prompt can do this. It never changes any state: cancelling it leaves everything as it was.
   * (Home and Reset Garden are in-page actions and do not go through here.) */
  guardLeaving() {
    this.entered = !this.intro.open;                                     // arriving by a link to one day already skips the prelude
    addEventListener("beforeunload", (e) => {
      const inGarden = this.entered && !this.intro.open;
      if (this.visits.size === 0 && !inGarden) return;                  // the prelude, nothing explored yet: leave freely
      e.preventDefault(); e.returnValue = "";                          // the browser shows its own wording
    });
  }

  bindExits() {
    const box = document.querySelector("#confirm"), ask = (on) => { box.hidden = !on; if (on) document.querySelector("#confirm-ok").focus(); };
    document.querySelector("#go-home").addEventListener("click", () => this.goHome());
    document.querySelector("#go-reset").addEventListener("click", () => ask(true));
    document.querySelector("#confirm-cancel").addEventListener("click", () => ask(false));
    document.querySelector("#confirm-ok").addEventListener("click", () => { ask(false); this.resetGarden(); });
    box.addEventListener("click", (e) => { if (e.target === box) ask(false); });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) { e.stopImmediatePropagation(); ask(false); } }, true);
  }

  currentDay() {
    if (this.current) return this.current.day;
    return clamp(Math.round(1 + this.controller.ps * (this.total - 1)), 1, this.total);   // Day 1 at the entrance, Day 100 at the far end
  }

  /* The open day's layout, defined once. The panel is wider and a little further left than before, and its sketch is a square of side `sk`;
   * the flower on the left is made exactly that big (CameraController.poseFor), so the photograph and the sketch are twins. */
  layoutDetail() {
    const W = innerWidth, H = innerHeight, desktop = W > 760, root = document.documentElement.style;
    // One composed section: the colour square and the sketch tile are the same size, level with each other, a small gap apart,
    // and the pair (square + panel) is centred on the screen as a whole.
    const GAP = 40, ABOVE = 126, BELOW = 215;                              // panel content above the sketch tile / below it (title, note, nav)
    const sk = Math.round(Math.max(240, Math.min(0.6 * H, H - ABOVE - BELOW - 30, (0.94 * W - 52 - GAP) / 2, 580)));
    const panelW = sk + 52, total = sk + GAP + panelW, m = (W - total) / 2, panelLeft = m + sk + GAP;
    const ys = (H + ABOVE - BELOW) / 2, panelTop = ys - ABOVE - sk / 2;      // the sketch tile's centre line, which the photograph shares
    root.setProperty("--panel-w", panelW + "px"); root.setProperty("--panel-right", m.toFixed(0) + "px"); root.setProperty("--sk", sk + "px"); root.setProperty("--panel-top", Math.max(10, panelTop).toFixed(0) + "px");
    document.body.classList.toggle("detail-fixed", desktop);
    this.controller.detail = desktop ? { desktop: true, W, H, panelLeft, sk, cx: m + sk / 2, cy: ys } : null;
  }

  resize() {
    this.layoutDetail();
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
    this.field.settled = this.controller.mode === "focus"; this.camera.getWorldDirection(this.field.viewDir);
    this.field.faceUp = this.controller.faceUp; this.field.topYaw = this.controller.portrait ? 0 : Math.PI / 2; this.field.topPitch = this.controller.pitch; this.field.loadAll = this.controller.v > 0.5;
    this.field.update(this.t, dt, this.camera);
    this.updateFog();
    this.atmosphere.update(this.t);
    this.sky.position.copy(this.camera.position);
    this.hover();
    this.pollen.update(dt, this.camera, innerHeight, this.pixelRatio);
    this.updateVisitor(dt);
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
